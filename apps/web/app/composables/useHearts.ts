export const useHearts = () => {
  const api = useApi()
  const { isLoggedIn } = useAuth()
  const heartedIds = useState<string[]>('hearted-ids', () => [])

  const fetchHearts = async () => {
    if (!isLoggedIn.value) {
      heartedIds.value = []
      return
    }
    try {
      const res = await api<{ pantryIds: string[] }>('/hearts')
      heartedIds.value = res.pantryIds
    } catch {
      heartedIds.value = []
    }
  }

  const isHearted = (pantryId: string) => heartedIds.value.includes(pantryId)

  const toggleHeart = async (pantryId: string) => {
    const wasHearted = isHearted(pantryId)
    // Optimistic update
    if (wasHearted) {
      heartedIds.value = heartedIds.value.filter((id) => id !== pantryId)
    } else {
      heartedIds.value = [...heartedIds.value, pantryId]
    }
    try {
      await api(`/hearts/${pantryId}`, { method: wasHearted ? 'DELETE' : 'POST' })
    } catch {
      // Revert on error
      if (wasHearted) {
        heartedIds.value = [...heartedIds.value, pantryId]
      } else {
        heartedIds.value = heartedIds.value.filter((id) => id !== pantryId)
      }
    }
  }

  return { heartedIds, isHearted, fetchHearts, toggleHeart }
}
