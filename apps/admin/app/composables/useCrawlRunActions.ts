import type { CrawlRunSummary } from '@pantry-finder/shared'

/** Stopping a crawl run, shared by the crawler page and the run list. */
export const useCrawlRunActions = () => {
  const api = useApi()
  const toast = useToast()
  const stopping = ref<string | null>(null)

  /** Resolves to whether the stop request went through. */
  const stop = async (run: CrawlRunSummary): Promise<boolean> => {
    stopping.value = run.id
    try {
      await api(`/admin/crawl-runs/${run.id}/abort`, { method: 'POST' })
      toast.add({
        title: run.status === 'queued' ? 'Run cancelled' : 'Stopping',
        description: run.status === 'queued' ? undefined : 'The pantries in progress finish first.',
        color: 'success',
      })
      return true
    } catch (err) {
      toast.add({ title: 'Stop failed', description: apiErrorMessage(err), color: 'error' })
      return false
    } finally {
      stopping.value = null
    }
  }

  return { stopping, stop }
}
