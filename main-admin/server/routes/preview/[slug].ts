import http, { type IncomingHttpHeaders } from 'node:http'

/**
 * `/preview/<slug>` — nitro normalises the trailing slash, so this handler also
 * sees `/preview/<slug>/`. Redirecting to the slashed form would point at
 * itself and loop forever, so proxy straight to the sub-admin root instead.
 * The upstream serves under app.baseURL, hence the prefixed target.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const prefix = `/preview/${slug}`
  const t = await one<any>(`SELECT * FROM tenant WHERE slug=?`, [slug])
  if (!t) throw createError({ statusCode: 404, message: `子后台 ${slug} 不存在` })

  const qs = getRequestPath(event) ?? ''
  const target = prefix + '/' + (qs.includes('?') ? `?${qs.split('?')[1]}` : '')

  const headers: IncomingHttpHeaders = { ...event.node.req.headers }
  delete headers.host
  delete headers['accept-encoding']
  headers['x-forwarded-prefix'] = prefix

  const upstream = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: Number(t.port), method: event.method, path: target, headers },
      res => resolve(res)
    )
    req.on('error', () => reject(createError({
      statusCode: 502, message: `子后台「${t.name}」未在 :${t.port} 运行 — 到预览站点「启动」`
    })))
    req.end()
  })

  for (const [k, v] of Object.entries(upstream.headers)) {
    if (v !== undefined && k !== 'transfer-encoding') setHeader(event, k, v)
  }
  // 同上：sendStream 自己 await 流，中途断掉要接住它的 reject，否则 unhandledRejection。
  upstream.on('error', () => { try { event.node.res.destroy() } catch { /* already closed */ } })
  setResponseStatus(event, upstream.statusCode ?? 502)
  await sendStream(event, upstream).catch(() => {
    try { event.node.res.end() } catch { /* already destroyed */ }
  })
})
