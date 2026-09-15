import { asText, bodyOf, loadTenant, sessionView, wantId } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/ai/:id', 'write')
  const body = await bodyOf(event)
  const me = currentUser(event)

  let tenantId: number | null = null
  const raw = body.tenantId ?? body.tenant_id
  if (raw !== undefined && raw !== null && raw !== '') {
    tenantId = wantId(body, 'tenantId', '子后台 tenantId')
    await loadTenant(tenantId)
  }

  const r = await run(
    `INSERT INTO ai_session (tenant_id,user_id,title) VALUES (?,?,?)`,
    [tenantId, me.uid, asText(body.title, 128) || '新对话'])
  const row = await one<Record<string, any>>(`SELECT * FROM ai_session WHERE id=?`, [r.insertId])
  return ok(sessionView(row!))
})
