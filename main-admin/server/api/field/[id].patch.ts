import { bodyOf, fieldPatch, fieldView, numId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const id = numId(event)
  const f = await one<Record<string, any>>(`SELECT * FROM module_field WHERE id=?`, [id])
  if (!f) throw createError({ statusCode: 404, message: `字段 #${id} 不存在` })

  const rec = fieldPatch(await bodyOf(event), `字段「${f.name}」`)

  if (rec.col_key !== undefined && rec.col_key !== f.col_key) {
    const dup = await one(`SELECT id FROM module_field WHERE module_id=? AND col_key=? AND id<>?`,
      [f.module_id, rec.col_key, id])
    if (dup) throw createError({ statusCode: 400, message: `列名「${rec.col_key}」在该模型中已被占用` })
  }
  if (rec.pk === 1) {
    const other = await one<Record<string, any>>(`SELECT id,name FROM module_field WHERE module_id=? AND pk=1 AND id<>?`, [f.module_id, id])
    if (other) throw createError({ statusCode: 400, message: `该模型已有主键「${other.name}」，不能同时存在两个主键` })
  }

  const cols = Object.keys(rec)
  await run(
    `UPDATE module_field SET ${cols.map(c => `${ident(c)}=?`).join(',')} WHERE id=?`,
    [...cols.map(c => rec[c]), id])

  const row = await one<Record<string, any>>(`SELECT * FROM module_field WHERE id=?`, [id])
  return ok(fieldView(row!))
})
