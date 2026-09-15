import { paging, str, tenantView } from '../_lib'

export default defineAuthed(async (event) => {
  const { page, size, offset } = paging(event)
  const query = getQuery(event)
  const keyword = str(query.keyword)
  const status = str(query.status)

  const clauses: string[] = []
  const args: unknown[] = []
  if (keyword) {
    clauses.push(`(name LIKE ? OR slug LIKE ? OR description LIKE ? OR db_name LIKE ?)`)
    const like = `%${keyword}%`
    args.push(like, like, like, like)
  }
  if (status) {
    clauses.push(`status=?`)
    args.push(status)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

  const total = Number((await one<{ c: number }>(`SELECT COUNT(*) c FROM tenant ${where}`, args))?.c ?? 0)
  const rows = await q<Record<string, any>>(
    `SELECT * FROM tenant ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...args, size, offset])

  return paged(rows.map(tenantView), total, page, size)
})
