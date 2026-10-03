import type { CrawlRunStatus, CrawlRunSummary } from '@pantry-finder/shared'
import { ACTIVE_CRAWL_RUN_STATUSES, DEFAULT_CRAWL_LIMIT, LLM_PROVIDER_LABELS, llmSettingsLabel } from '@pantry-finder/shared'

export const CRAWL_RUN_POLL_MS = 5000

export const CRAWL_RUN_STATUS_COLORS: Record<CrawlRunStatus, 'info' | 'success' | 'error' | 'neutral' | 'warning'> = {
  queued: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'error',
  aborted: 'neutral',
}

/** Queued or running, and its worker still sending heartbeats. */
export const isActiveRun = (run: CrawlRunSummary): boolean =>
  ACTIVE_CRAWL_RUN_STATUSES.includes(run.status) && !run.stale

/** Whether a Stop button applies: active and not already asked to stop. */
export const canStopRun = (run: CrawlRunSummary): boolean =>
  ACTIVE_CRAWL_RUN_STATUSES.includes(run.status) && !run.abortRequested

/** "pantry abc123" or "100 pantries". */
export const crawlRunScope = (run: CrawlRunSummary): string =>
  run.options.pantryId ? `pantry ${run.options.pantryId}` : `${run.options.limit ?? DEFAULT_CRAWL_LIMIT} pantries`

/** "Gemini · gemini-3.5-flash-lite · effort low"; the model is known once the worker picked the run up. */
export const crawlRunLlmLine = (run: CrawlRunSummary): string => {
  const llm = run.options.llm
  return [llm && LLM_PROVIDER_LABELS[llm], run.model, llm && llmSettingsLabel(llm, run.options.settings)]
    .filter(Boolean)
    .join(' · ')
}
