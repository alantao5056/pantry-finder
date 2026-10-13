/**
 * Checks that downgrade an automatic update to human review. M2 ships the
 * minimal set; the rest of docs/crawler-design.md's list comes in M3.
 */
import {
  parseTarget,
  sameTargetValue,
  type MappingTarget,
  type SuspiciousReason,
  type TargetValue,
  type TextTarget,
} from '@pantry-finder/shared';

// Deliberately narrow: plain "closed" is everywhere in hours text
// ("Closed on holidays", "Sat: closed") and would flood the queue.
const CLOSURE_WORDS =
  /\b(permanently|closed (?:until further notice|indefinitely|for good)|(?:has|have) closed|no longer (?:open|operating|operates|distributing)|temporarily closed|cancell?ed|suspended)\b/i;

const SOFT_TEXT_TARGETS: ReadonlySet<TextTarget> = new Set<TextTarget>(['contactName', 'notes', 'aboutUs']);

/** Free-text fields, and fields with no stored value. */
function uncertainIsHarmless(target: MappingTarget, oldValue: TargetValue | null): boolean {
  const parsed = parseTarget(target);
  if (parsed?.kind === 'serviceNotes') return true;
  if (parsed?.kind === 'text' && SOFT_TEXT_TARGETS.has(parsed.field)) return true;
  return sameTargetValue(target, oldValue ?? undefined, undefined);
}

export function suspiciousReasons(
  target: MappingTarget,
  oldValue: TargetValue | null,
  newValue: TargetValue,
  rawText: string,
  uncertain: boolean,
): SuspiciousReason[] {
  const reasons: SuspiciousReason[] = [];
  if (
    parseTarget(target)?.kind === 'schedules' &&
    Array.isArray(oldValue) &&
    oldValue.length > 0 &&
    Array.isArray(newValue) &&
    newValue.length === 0
  ) {
    reasons.push('emptied_schedules');
  }
  if (CLOSURE_WORDS.test(rawText)) reasons.push('closure_words');
  if (uncertain && !uncertainIsHarmless(target, oldValue)) reasons.push('uncertain');
  return reasons;
}
