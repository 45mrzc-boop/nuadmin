import { numId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const id = numId(event)
  const r = await run(`DELETE FROM module_field WHERE id=?`, [id])
  if (!r.affectedRows) throw createError({ statusCode: 404, message: `字段 #${id} 不存在` })
  return ok(true)
})
