// Builds a pantry's public page URL on the main site (pantryfinder.org).
export const usePantryUrl = () => {
  const siteUrl = useRuntimeConfig().public.siteUrl.replace(/\/$/, '')
  return (pantryId: string) => `${siteUrl}/pantries/${pantryId}`
}
