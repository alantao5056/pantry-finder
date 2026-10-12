// Edit targets: what an admin can change by hand. Kept apart from the mapping
// targets (./crawl.ts) so the crawler never proposes these.

import {
  normalizeTargetValue,
  parseTarget,
  type MappingTarget,
  type ParsedTarget,
  type TargetValue,
  type TextTarget,
} from './crawl.js';
import { stableStringify } from './values.js';

export type ServiceTextField = 'name' | 'categoryDescription' | 'foodProgramTypeDescription';

export type EditTarget =
  | MappingTarget
  | 'name'
  | `services.${number}.${ServiceTextField}`
  | `services.${number}.foodOfferings`;

export type EditValue = TargetValue | string[];

export type ParsedEditTarget =
  | ParsedTarget
  | { kind: 'name' }
  | { kind: 'serviceText'; serviceIndex: number; field: ServiceTextField }
  | { kind: 'serviceOfferings'; serviceIndex: number };

const SERVICE_EDIT_TARGET = /^services\.(\d{1,3})\.(name|categoryDescription|foodProgramTypeDescription|foodOfferings)$/;

export function parseEditTarget(target: string): ParsedEditTarget | null {
  const parsed = parseTarget(target);
  if (parsed) return parsed;
  if (target === 'name') return { kind: 'name' };
  const m = SERVICE_EDIT_TARGET.exec(target);
  if (!m) return null;
  const serviceIndex = Number(m[1]);
  return m[2] === 'foodOfferings'
    ? { kind: 'serviceOfferings', serviceIndex }
    : { kind: 'serviceText', serviceIndex, field: m[2] as ServiceTextField };
}

export function isEditTarget(target: string): target is EditTarget {
  return parseEditTarget(target) !== null;
}

export function editTargetField(target: EditTarget): TextTarget | 'name' | 'schedules' | 'services' {
  const parsed = parseEditTarget(target)!;
  if (parsed.kind === 'text') return parsed.field;
  if (parsed.kind === 'name') return 'name';
  return parsed.kind === 'schedules' && parsed.serviceIndex === null ? 'schedules' : 'services';
}

export function emptyEditValue(target: EditTarget): EditValue {
  const kind = parseEditTarget(target)?.kind;
  return kind === 'schedules' || kind === 'serviceOfferings' ? [] : '';
}

export function normalizeEditValue(target: EditTarget, value: EditValue): EditValue {
  const kind = parseEditTarget(target)?.kind;
  if (kind === 'serviceOfferings') return (value as string[]).map((v) => v.trim()).filter(Boolean);
  if (kind === 'name' || kind === 'serviceText') return (value as string).trim();
  return normalizeTargetValue(target as MappingTarget, value as TargetValue);
}

export function sameEditValue(target: EditTarget, a: EditValue | undefined, b: EditValue | undefined): boolean {
  const empty = emptyEditValue(target);
  return (
    stableStringify(normalizeEditValue(target, a ?? empty)) ===
    stableStringify(normalizeEditValue(target, b ?? empty))
  );
}
