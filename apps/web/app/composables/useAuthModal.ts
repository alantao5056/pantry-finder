export const useAuthModal = () => {
  const open = useState<boolean>('auth-modal-open', () => false)
  const tab = useState<'login' | 'register'>('auth-modal-tab', () => 'login')

  const show = (t: 'login' | 'register' = 'login') => {
    tab.value = t
    open.value = true
  }

  const hide = () => {
    open.value = false
  }

  return { open, tab, show, hide }
}
