/** Auto-apply: decides whether a first-visit proposal can skip the review queue. */
import type { SiteCheck, TargetProposal } from '@pantry-finder/shared';
import { getTargetValue } from '@pantry-finder/shared/firestore';
import { suspiciousReasons } from './guardrails.js';
import type { StoredPantry } from './pipeline.js';

/** Reasons the proposal needs review; empty = auto-apply. */
export function autoApplyBlockers(
  pantry: StoredPantry,
  proposals: TargetProposal[],
  addressCheck: SiteCheck,
  phoneCheck: SiteCheck | undefined,
): string[] {
  const blockers: string[] = [];
  if (addressCheck.status !== 'match') blockers.push(`address ${addressCheck.status}`);
  if (phoneCheck?.status === 'mismatch') blockers.push('phone mismatch');
  for (const p of proposals) {
    const c = p.candidates[0];
    const reasons = suspiciousReasons(p.target, getTargetValue(pantry, p.target) ?? null, c.value, c.rawText, c.uncertain);
    if (reasons.length) blockers.push(`${p.target}: ${reasons.join(', ')}`);
  }
  return blockers;
}
