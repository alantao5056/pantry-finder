import type { ReviewItemStatus, ReviewItemType } from '@pantry-finder/shared'

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
