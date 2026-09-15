import { loadModule, numId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const id = numId(event)
  await loadModule(id)

  await tx(async conn => {
    await conn.execute(`DELETE FROM module_field WHERE module_id=?`, [id])
    await conn.execute(`DELETE FROM module WHERE id=?`, [id])
  })

  // 设计/逻辑/数据站都只是 module 行上的 JSON 列，行删了它们随之消失
  return ok(true)
})
