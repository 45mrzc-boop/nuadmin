import http, { type IncomingHttpHeaders } from 'node:http'

/**
 * Same-origin reverse proxy so a generated sub-admin can be embedded in the
 * 预览站 iframe:  /preview/<slug>/**  ->  http://127.0.0.1:<tenant.port>/preview/<slug>/**
 *
 * The path is forwarded UNCHANGED. The sub-admin is generated with
 * app.baseURL = APP_BASE, and nitro serves its routes (and its SPA shell)
 * *under* that prefix — stripping it here would make the upstream answer
 * 302 back to the prefixed URL and loop forever.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const prefix = `/preview/${slug}`
  const target = getRequestPath(event) ?? prefix

  const t = await one<any>(`SELECT * FROM tenant WHERE slug=?`, [slug])
  if (!t) throw createError({ statusCode: 404, message: `子后台 ${slug} 不存在` })

  const headers: IncomingHttpHeaders = { ...event.node.req.headers }
  delete headers.host
  delete headers['accept-encoding']
  headers['x-forwarded-prefix'] = prefix

  const rawBody = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.method)
    ? await readRawBody(event, false)
    : null
  if (rawBody !== null && rawBody !== undefined) {
    headers['content-length'] = String(Buffer.byteLength(rawBody))
  }

  const upstream = await new Promise<http.IncomingMessage>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: Number(t.port), method: event.method, path: target, headers },
      res => resolve(res)
    )
    req.on('error', () => reject(createError({
      statusCode: 502,
      message: `子后台「${t.name}」未在 :${t.port} 运行 — 到预览站点「启动」`
    })))
    if (rawBody) req.write(rawBody)
    req.end()
  })

  const loc = upstream.headers.location
  if (loc && upstream.statusCode && [301, 302, 303, 307, 308].includes(upstream.statusCode)) {
    // A redirect that points back at the same proxied URL would spin forever in
    // the browser and surface as a blank frame; fail loudly instead.
    const norm = loc.startsWith('/') ? loc : `/${loc}`.replace(/^\/{2,}/, '/')
    if (norm.replace(/\/+$/, '') === target.replace(/\/+$/, '')) {
      upstream.destroy()
      throw createError({
        statusCode: 502,
        message: `子后台 ${slug} 在 :${t.port} 上对 ${target} 自我重定向。若直接访问 http://127.0.0.1:${t.port}/ 正常，说明它没带 APP_BASE=${prefix}/ 启动，请先到预览站点「停止」再「启动」。`
      })
    }
  }

  for (const [k, v] of Object.entries(upstream.headers)) {
    if (v !== undefined && k !== 'transfer-encoding') setHeader(event, k, v)
  }

  // 子后台在响应中途被停掉时，socket 会在我们已经回滚到流式输出之后死掉。
  // 光挂 upstream 的 error 监听不够：sendStream 自己 await 这条流，reject 出来的是
  // Node 的原始错误（"socket hang up"），没人接就成了 unhandledRejection。
  upstream.on('error', () => { try { event.node.res.destroy() } catch { /* already closed */ } })

  setResponseStatus(event, upstream.statusCode ?? 502)
  await sendStream(event, upstream).catch(() => {
    try { event.node.res.end() } catch { /* already destroyed */ }
  })
})
