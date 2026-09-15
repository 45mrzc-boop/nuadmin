import { numId } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'write')
  const id = numId(event)
  const r = await run(`DELETE FROM dict_item WHERE id=?`, [id])
  return ok({ deleted: Number(r.affectedRows) })
})
