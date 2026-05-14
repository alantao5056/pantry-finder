export default defineNuxtPlugin(async () => {
  const { fetchMe } = useAuth()
  const { fetchHearts } = useHearts()
  await fetchMe()
  await fetchHearts()
})
