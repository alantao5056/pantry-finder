export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const { admin, check } = useAdminAuth()
  if (admin.value) return

  const result = await check()
  if (result === 'forbidden') return navigateTo('/login?denied=1')
  if (result === 'unauthenticated') return navigateTo('/login')
})
