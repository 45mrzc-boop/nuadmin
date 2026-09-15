import { sessionView } from '../../_lib'

export default defineAuthed(async (event) => {
  const me = currentUser(event)
  const raw = getQuery(event).tenantId
  const args: unknown[] = [me.uid]
  let filter = ''
  if (raw !== undefined && raw !== '') {
    filter = ' AND tenant_id=?'
    args.push(Number(raw))
  }

  const rows = await q<Record<string, any>>(
    `SELECT * FROM ai_session WHERE user_id=?${filter} ORDER BY id DESC LIMIT 100`, args)
  return ok(rows.map(sessionView))
})
