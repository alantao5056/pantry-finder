/**
 * Checks that downgrade an automatic update to human review. M2 ships the
 * minimal set; the rest of docs/crawler-design.md's list comes in M3.
 */
import { parseTarget, type MappingTarget, type SuspiciousReason, type TargetValue } from '@pantry-finder/shared';

// Deliberately narrow: plain "closed" is everywhere in hours text
// ("Closed on holidays", "Sat: closed") and would flood the queue.
const CLOSURE_WORDS =
  /\b(permanently|closed (?:until further notice|indefinitely|for good)|(?:has|have) closed|no longer (?:open|operating|operates|distributing)|temporarily closed|cancell?ed|suspended)\b/i;

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
  if (uncertain) reasons.push('uncertain');
  return reasons;
}
