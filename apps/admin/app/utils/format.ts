import type { LlmCompareStatus, MappingTarget, ReviewItemStatus, ReviewItemType, SiteCheckStatus, SuspiciousReason, TextTarget } from '@pantry-finder/shared'
import { parseTarget } from '@pantry-finder/shared'

export const formatDateTime = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString() : '—'

/** "512 B", "3.4 KB", "101.2 MB". */
export const formatBytes = (bytes: number): string => {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}

/** Two largest units: "3d 4h", "2h 5m", "45s". */
export const formatDuration = (totalSeconds: number): string => {
  const s = Math.floor(totalSeconds)
  const parts = [
    [Math.floor(s / 86400), 'd'],
    [Math.floor((s % 86400) / 3600), 'h'],
    [Math.floor((s % 3600) / 60), 'm'],
    [s % 60, 's'],
  ] as const
  const first = parts.findIndex(([n]) => n > 0)
  if (first === -1) return '0s'
  return parts
    .slice(first, first + 2)
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n}${unit}`)
    .join(' ')
}

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

/** "Phone", "Hours (pantry)", "Hours — Food Bank" / "Notes — Food Bank" for `services.<i>.*`. */
export const targetLabel = (target: MappingTarget, serviceNames: string[] = []): string => {
  const parsed = parseTarget(target)
  if (!parsed) return target
  if (parsed.kind === 'text') return TEXT_TARGET_LABELS[parsed.field]
  if (parsed.serviceIndex === null) return 'Hours (pantry)'
  const service = serviceNames[parsed.serviceIndex] ?? `service #${parsed.serviceIndex + 1}`
  return `${parsed.kind === 'serviceNotes' ? 'Notes' : 'Hours'} — ${service}`
}

export const SUSPICIOUS_REASON_LABELS: Record<SuspiciousReason, string> = {
  emptied_schedules: 'Hours would be emptied',
  closure_words: 'Closure wording on the page',
  uncertain: 'LLM unsure of its parse',
  needs_recheck: 'Mapping was reverted before',
  redirect: 'Website redirects elsewhere',
}

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

// USD per 1M tokens, used only for the LLM eval cost estimates. DeepSeek:
// off-peak, cache-miss input (api-docs.deepseek.com, 2026-09). Gemini: paid
// tier, output includes thinking tokens (ai.google.dev/gemini-api/docs/pricing,
// 2026-10; the 3.6–3.8 Flash prices double on 2027-01-01).
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'deepseek-flash': { input: 0.15, output: 0.6 },
  'deepseek-v4-pro': { input: 0.66, output: 1.98 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.5-flash': { input: 1.5, output: 9 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.7-flash': { input: 0.75, output: 3.75 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.1-pro-preview': { input: 2, output: 12 },
}

export const LLM_COMPARE_STATUS_COLORS: Record<LlmCompareStatus, 'warning' | 'info' | 'success' | 'error'> = {
  queued: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'error',
}

/** Estimated USD cost, or null for a model without a known price. */
export const estimateCost = (model: string, inputTokens: number, outputTokens: number): number | null => {
  const price = MODEL_PRICES[model]
  return price ? (inputTokens * price.input + outputTokens * price.output) / 1_000_000 : null
}
