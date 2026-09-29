/**
 * Prompts and response schemas for the extractor. Responses are JSON (the
 * provider's JSON mode) and validated with zod; anything that doesn't fit is
 * dropped rather than trusted.
 */
import { z } from 'zod';
import { isMappingTarget, parseTarget, type MappingTarget, type TargetValue } from '@pantry-finder/shared';
import type { PageForExtraction, PantryContext, RawProposal } from './Extractor.js';

const MAX_CANDIDATES = 3;

const FIELD_GUIDE = `Targets:
- "phone": the pantry's main phone number, as written.
- "email": the pantry's (or its organization's) contact email address. Not a webmaster, web designer or site-builder address.
- "contactName": a named contact person for the pantry (not the organization name).
- "aboutUs": a short description of the organization/pantry and its mission, as written on the site (may be condensed from several sentences, max ~600 characters).
- "notes": practical information for people seeking food: eligibility, what to bring, registration, service area, drive-through, etc. Condense to max ~600 characters.
- "schedules": the pantry's general hours for food distribution / visiting the pantry.
- "services.<i>.schedules": hours of one specific service listed below, when the site gives hours for that service specifically.

A schedule value is an array of {"weekDay","startTime","endTime","everyOtherWeekIndicator","notes"}:
- weekDay: full English day name ("Monday").
- startTime / endTime: "9:00 AM" format.
- One entry per day per time range.
- everyOtherWeekIndicator: true only for "every other week".
- Anything that doesn't fit (e.g. "2nd and 4th Tuesday of the month", "except holidays", "by appointment") goes in that entry's notes, and set uncertain to true when the pattern can't be represented exactly.
Ignore office hours, worship services, thrift-store hours, volunteer shifts and events unless they are clearly when people can get food.`;

export function proposeSystemPrompt(): string {
  return `You extract facts about a food pantry from its website. The pages are given as numbered text blocks: "[p0b12] text".

${FIELD_GUIDE}

For each requested target that the pages actually state, return up to ${MAX_CANDIDATES} candidate regions, best first. A candidate is the smallest set of consecutive blocks (all on the same page) that contains the value, plus the value parsed from exactly that text. Do not guess values that aren't on the page; omit targets you can't find. Set "uncertain": true when you're unsure the region is right or the parse is exact.

Also list in "addresses" every street address the pages give for where this pantry (or its organization) is located, each as written on one line ("123 Main St, Springfield, IL 62701"). Leave it empty if the pages state none; never guess one.

Also list in "phones" every phone number the pages give for this pantry (or its organization), as written. Leave it empty if the pages state none.

Answer with JSON only:
{"fields":[{"target":"phone","candidates":[{"blocks":["p0b3"],"value":"555-123-4567","uncertain":false}]}],"addresses":["123 Main St, Springfield, IL 62701"],"phones":["(555) 123-4567"]}`;
}

export function proposeUserPrompt(pages: PageForExtraction[], ctx: PantryContext): string {
  const services = ctx.services.length
    ? ctx.services.map((s) => `  services.${s.index}: ${s.name} (${s.category})`).join('\n')
    : '  (none)';
  const body = pages
    .map((p) => {
      const lines = p.blocks.map((b) => `[${b.id}] ${b.text.replace(/\n/g, ' / ')}`).join('\n');
      return `=== Page ${p.url}\n${lines}`;
    })
    .join('\n\n');
  return `Pantry: ${ctx.name} (${ctx.city}, ${ctx.state})
Services:
${services}
Requested targets: ${ctx.targets.join(', ')}

${body}`;
}

export function parseSystemPrompt(): string {
  return `You parse one region of a food pantry's website into a value for a target field.

${FIELD_GUIDE}

Answer with JSON only: {"value": <string or schedule array>, "uncertain": <bool>}. If the text doesn't contain a value for the target, answer {"value": null, "uncertain": true}.`;
}

export function parseUserPrompt(target: MappingTarget, rawText: string, ctx: PantryContext): string {
  const parsed = parseTarget(target);
  const service =
    parsed?.kind === 'schedules' && parsed.serviceIndex !== null
      ? ctx.services.find((s) => s.index === parsed.serviceIndex)
      : undefined;
  return `Pantry: ${ctx.name} (${ctx.city}, ${ctx.state})
Target: ${target}${service ? ` (service: ${service.name})` : ''}

Text:
${rawText}`;
}

const scheduleSchema = z.object({
  weekDay: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  everyOtherWeekIndicator: z.boolean().optional(),
  notes: z.string().nullish().transform((v) => v ?? undefined),
});
const schedulesSchema = z.array(scheduleSchema);

const EMAIL = /^(mailto:)?[^\s@]+@[^\s@]+\.[^\s@]+$/i;

/** Checks a value against its target's type; null when it doesn't fit. */
export function validateValue(target: MappingTarget, value: unknown): TargetValue | null {
  if (parseTarget(target)?.kind === 'schedules') {
    const r = schedulesSchema.safeParse(value);
    return r.success ? r.data : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  if (target === 'email' && !EMAIL.test(value.trim())) return null;
  return value.trim();
}

const proposeSchema = z.object({
  fields: z.array(
    z.object({
      target: z.string(),
      candidates: z.array(
        z.object({
          blocks: z.array(z.string()).min(1),
          value: z.unknown(),
          uncertain: z.boolean().optional(),
        }),
      ),
    }),
  ),
  addresses: z.array(z.unknown()).optional(),
  phones: z.array(z.unknown()).optional(),
});

const MAX_LISTED = 10;

/** The non-empty strings of an LLM-listed array, trimmed and capped. */
function listed(values: unknown[] | undefined): string[] {
  return (values ?? [])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim().slice(0, 300))
    .slice(0, MAX_LISTED);
}

export function parseProposeResponse(
  json: unknown,
  ctx: PantryContext,
  blockIds: Set<string>,
): { proposals: RawProposal[]; addresses: string[]; phones: string[] } {
  const parsed = proposeSchema.parse(json);
  const addresses = listed(parsed.addresses);
  const phones = listed(parsed.phones);
  const proposals: RawProposal[] = [];
  for (const f of parsed.fields) {
    if (!isMappingTarget(f.target) || !ctx.targets.includes(f.target)) continue;
    const target = f.target;
    const candidates = f.candidates
      .map((c) => {
        const value = validateValue(target, c.value);
        // Keep only known blocks on the first block's page (ids are p<page>b<n>).
        const page = c.blocks[0]?.split('b')[0];
        const ids = c.blocks.filter((id) => blockIds.has(id) && id.split('b')[0] === page);
        return value !== null && ids.length ? { blockIds: ids, value, uncertain: c.uncertain === true } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .slice(0, MAX_CANDIDATES);
    if (candidates.length) proposals.push({ target, candidates });
  }
  return { proposals, addresses, phones };
}

const parseRegionSchema = z.object({ value: z.unknown(), uncertain: z.boolean().optional() });

export function parseParseResponse(
  json: unknown,
  target: MappingTarget,
): { value: TargetValue | null; uncertain: boolean } {
  const r = parseRegionSchema.parse(json);
  return { value: r.value === null ? null : validateValue(target, r.value), uncertain: r.uncertain === true };
}
