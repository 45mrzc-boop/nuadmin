export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login') return
  if (!useCookie('nuadmin_token').value) return navigateTo('/login')
})
