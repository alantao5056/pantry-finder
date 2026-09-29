import type { MappingTarget, ReviewItemStatus, ReviewItemType, SiteCheckStatus, SuspiciousReason, TextTarget } from '@pantry-finder/shared'
import { parseTarget } from '@pantry-finder/shared'

export const formatDateTime = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString() : '—'

export const REVIEW_TYPE_LABELS: Record<ReviewItemType, string> = {
  user_submission: 'User submission',
  new_mapping: 'New mapping',
  broken_mapping: 'Broken mapping',
  new_pantry: 'New pantry',
  match_candidate: 'Match candidate',
  missing_pantry: 'Missing pantry',
  suspicious_value: 'Suspicious value',
}

export const REVIEW_STATUS_COLORS: Record<ReviewItemStatus, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
}

export const ADDRESS_CHECK_LABELS: Record<SiteCheckStatus, string> = {
  match: 'Address match',
  mismatch: 'Address mismatch',
  not_found: 'No address on site',
}

export const PHONE_CHECK_LABELS: Record<SiteCheckStatus, string> = {
  match: 'Phone match',
  mismatch: 'Phone mismatch',
  not_found: 'No phone on site',
}

export const SITE_CHECK_COLORS: Record<SiteCheckStatus, 'success' | 'warning'> = {
  match: 'success',
  mismatch: 'warning',
  not_found: 'warning',
}

const TEXT_TARGET_LABELS: Record<TextTarget, string> = {
  phone: 'Phone',
  email: 'Email',
  aboutUs: 'About',
  notes: 'Notes',
  contactName: 'Contact name',
  website: 'Website',
}

/** "Phone", "Hours (pantry)", "Hours — Food Bank" for `services.<i>.schedules`. */
export const targetLabel = (target: MappingTarget, serviceNames: string[] = []): string => {
  const parsed = parseTarget(target)
  if (!parsed) return target
  if (parsed.kind === 'text') return TEXT_TARGET_LABELS[parsed.field]
  if (parsed.serviceIndex === null) return 'Hours (pantry)'
  return `Hours — ${serviceNames[parsed.serviceIndex] ?? `service #${parsed.serviceIndex + 1}`}`
}

export const SUSPICIOUS_REASON_LABELS: Record<SuspiciousReason, string> = {
  emptied_schedules: 'Hours would be emptied',
  closure_words: 'Closure wording on the page',
  uncertain: 'LLM unsure of its parse',
  needs_recheck: 'Mapping was reverted before',
  redirect: 'Website redirects elsewhere',
}

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

// DeepSeek off-peak prices, USD per 1M tokens (api-docs.deepseek.com, 2026-09;
// cache-miss input). Used only for the LLM eval cost estimate.
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'deepseek-flash': { input: 0.15, output: 0.6 },
  'deepseek-v4-pro': { input: 0.66, output: 1.98 },
}

/** Estimated USD cost, or null for a model without a known price. */
export const estimateCost = (model: string, inputTokens: number, outputTokens: number): number | null => {
  const price = MODEL_PRICES[model]
  return price ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000 : null
}
