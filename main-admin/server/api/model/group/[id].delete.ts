import { boolOf, numId } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const id = numId(event)
  const g = await one<Record<string, any>>(`SELECT * FROM model_group WHERE id=?`, [id])
  if (!g) throw createError({ statusCode: 404, message: `分组 #${id} 不存在` })

  const modules = await q<{ id: number }>(`SELECT id FROM module WHERE group_id=?`, [id])
  const cascade = boolOf(getQuery(event).cascade)
  if (modules.length && !cascade) {
    throw createError({
      statusCode: 400,
      message: `分组「${g.name}」下还有 ${modules.length} 个模型，请先删除模型，或用 ?cascade=1 连同模型与字段一起删除`
    })
  }

  await tx(async conn => {
    if (modules.length) {
      const ids = modules.map(m => m.id)
      await conn.execute(
        `DELETE FROM module_field WHERE module_id IN (${ids.map(() => '?').join(',')})`, ids)
      await conn.execute(`DELETE FROM module WHERE group_id=?`, [id])
    }
    await conn.execute(`DELETE FROM model_group WHERE id=?`, [id])
  })

  return ok(true)
})
