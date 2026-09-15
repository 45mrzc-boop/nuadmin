import { asText, bodyOf, loadTenant, wantId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/capability/:id', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台 tenantId')
  const capKey = asText(body.capKey ?? body.cap_key, 64)
  if (!capKey) throw createError({ statusCode: 400, message: '能力编码 capKey 不能为空' })
  await loadTenant(tenantId)

  const r = await run(`DELETE FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey])
  if (!r.affectedRows) throw createError({ statusCode: 404, message: `子后台 #${tenantId} 未安装能力「${capKey}」` })
  return ok(true)
})
