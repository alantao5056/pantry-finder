// Crawler mapping targets: which part of a pantry record a crawled page region
// feeds (see docs/crawler-design.md). Shared by tools/crawler, the API and the
// admin app.

import type { ScheduleDraft } from './admin.js';
import { normalizePhone, normalizeSchedules, stableStringify } from './values.js';

/** Plain-text pantry fields the crawler maintains. */
export type TextTarget = 'phone' | 'aboutUs' | 'notes' | 'contactName' | 'website';

/** A pantry field, or one service's schedule list (`services.<index>.schedules`). */
export type MappingTarget = TextTarget | 'schedules' | `services.${number}.schedules`;

/** The value a target holds: text for text targets, a schedule list otherwise. */
export type TargetValue = string | ScheduleDraft[];

export const TEXT_TARGETS: readonly TextTarget[] = ['phone', 'aboutUs', 'notes', 'contactName', 'website'];

export type ParsedTarget =
  | { kind: 'text'; field: TextTarget }
  | { kind: 'schedules'; serviceIndex: number | null };

const SERVICE_TARGET = /^services\.(\d{1,3})\.schedules$/;

export function parseTarget(target: string): ParsedTarget | null {
  if ((TEXT_TARGETS as readonly string[]).includes(target)) return { kind: 'text', field: target as TextTarget };
  if (target === 'schedules') return { kind: 'schedules', serviceIndex: null };
  const m = SERVICE_TARGET.exec(target);
  return m ? { kind: 'schedules', serviceIndex: Number(m[1]) } : null;
}

export function isMappingTarget(target: string): target is MappingTarget {
  return parseTarget(target) !== null;
}

/** The top-level pantry field a target lives in (for `fieldSources` / the change log). */
export function targetField(target: MappingTarget): TextTarget | 'schedules' | 'services' {
  const parsed = parseTarget(target)!;
  if (parsed.kind === 'text') return parsed.field;
  return parsed.serviceIndex === null ? 'schedules' : 'services';
}

/** Normalizes a value into the stored format for its target. */
export function normalizeTargetValue(target: MappingTarget, value: TargetValue): TargetValue {
  if (Array.isArray(value)) return normalizeSchedules(value);
  return target === 'phone' ? normalizePhone(value) : value.trim();
}

/** Whether two values of a target are the same once normalized (so formatting noise isn't a change). */
export function sameTargetValue(target: MappingTarget, a: TargetValue | undefined, b: TargetValue | undefined): boolean {
  const empty = parseTarget(target)?.kind === 'schedules' ? [] : '';
  return (
    stableStringify(normalizeTargetValue(target, a ?? empty)) ===
    stableStringify(normalizeTargetValue(target, b ?? empty))
  );
}
