/** Authenticated client for the control-plane API. Unwraps {code,message,data}. */
export function useApi() {
  const token = useCookie('nuadmin_token')
  const { push } = useNotify()

  const raw = $fetch.create({
    baseURL: '/api',
    onRequest({ options }) {
      options.headers = { ...(options.headers as any), Authorization: 'Bearer ' + (token.value || '') }
    },
    onResponse({ response }) {
      const body = response._data as any
      if (body && typeof body === 'object' && 'code' in body) response._data = body.data
      return response
    },
    onResponseError({ response }) {
      if (response.status === 401) {
        token.value = null
        navigateTo('/login')
        return
      }
      push((response._data as any)?.statusMessage || (response._data as any)?.message || `请求失败 ${response.status}`, 'error')
    }
  })

  const get = <T = any,>(p: string, query?: any) => raw<T>(p, { method: 'GET', query: query ? qs(query) : undefined })
  const post = <T = any,>(p: string, body?: any) => raw<T>(p, { method: 'POST', body })
  const patch = <T = any,>(p: string, body?: any) => raw<T>(p, { method: 'PATCH', body })
  const del = <T = any,>(p: string) => raw<T>(p, { method: 'DELETE' })

  return { token, get, post, patch, del }
}

export const qs = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null))
