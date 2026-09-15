import { asText, bodyOf, loadTenant, tenantCapView, wantId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/capability/:id', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台 tenantId')
  const capKey = asText(body.capKey ?? body.cap_key, 64)
  if (!capKey) throw createError({ statusCode: 400, message: '能力编码 capKey 不能为空' })
  await loadTenant(tenantId)

  const row = await one<Record<string, any>>(
    `SELECT * FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey])
  if (!row) throw createError({ statusCode: 404, message: `子后台 #${tenantId} 未安装能力「${capKey}」` })
  if (row.status === 'rolledback') {
    throw createError({ statusCode: 400, message: `能力「${capKey}」已是回滚状态，请重新安装或卸载后再操作` })
  }

  await run(`UPDATE tenant_capability SET status='rolledback' WHERE id=?`, [row.id])
  const updated = await one<Record<string, any>>(`SELECT * FROM tenant_capability WHERE id=?`, [row.id])
  return ok(tenantCapView(updated!))
})
