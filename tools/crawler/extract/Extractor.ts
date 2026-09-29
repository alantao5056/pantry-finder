/**
 * LLM extraction behind one interface (same pattern as the API's geocoders),
 * so the provider can be swapped in one place.
 */
import type { MappingTarget, TargetValue } from '@pantry-finder/shared';

/** One page as shown to the LLM: numbered text blocks. */
export interface PageForExtraction {
  url: string;
  blocks: { id: string; text: string; anchor?: string }[];
}

export interface PantryContext {
  name: string;
  city: string;
  state: string;
  /** Services by index, so schedules can be attributed to `services.<i>.schedules`. */
  services: { index: number; name: string; category: string }[];
  /** Targets to look for. */
  targets: MappingTarget[];
}

export interface RawCandidate {
  /** Block ids from the pages, all on one page. */
  blockIds: string[];
  value: TargetValue;
  uncertain: boolean;
}

export interface RawProposal {
  target: MappingTarget;
  candidates: RawCandidate[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface Extractor {
  readonly model: string;
  /** First visit: where on the pages each target's value is, and what it is. */
  proposeMappings(pages: PageForExtraction[], ctx: PantryContext): Promise<{ proposals: RawProposal[]; usage: Usage }>;
  /** Re-parse a known region whose text changed. */
  parseRegion(
    target: MappingTarget,
    rawText: string,
    ctx: PantryContext,
  ): Promise<{ value: TargetValue; uncertain: boolean; usage: Usage }>;
}
