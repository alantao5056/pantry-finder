import type { ListReviewItemsResponse } from '@pantry-finder/shared'

// Opens the pending review item after `currentId` in queue order, or the queue when none is left.
export const useNextReview = () => {
  const api = useApi()
  return async (currentId: string) => {
    let nextId: string | undefined
    try {
      const res = await api<ListReviewItemsResponse>('/admin/review-items', {
        query: { status: 'pending', cursor: currentId },
      })
      nextId = res.items[0]?.id
    } catch {
      // fall through to the queue
    }
    await navigateTo(nextId ? `/reviews/${nextId}` : '/reviews')
  }
}
