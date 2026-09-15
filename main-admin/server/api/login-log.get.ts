import { paging, str } from './_lib'

export default defineAuthed(async (event) => {
  const { page, size, offset } = paging(event)
  const keyword = str(getQuery(event).keyword)
  const where = keyword ? `WHERE username LIKE ?` : ''
  const args = keyword ? [`%${keyword}%`] : []

  const total = Number((await one<{ c: number }>(`SELECT COUNT(*) c FROM login_log ${where}`, args))?.c ?? 0)
  const list = await q<Record<string, any>>(
    `SELECT id,username,ok,ip,ua,created_at FROM login_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...args, size, offset])

  return paged(list.map(r => ({ ...r, id: Number(r.id), ok: Number(r.ok) })), total, page, size)
})
