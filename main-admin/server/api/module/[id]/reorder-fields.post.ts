import { asStrArray, loadModule, numId } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const moduleId = numId(event)
  await loadModule(moduleId)

  const body = await readBody<Record<string, unknown>>(event)
  const order = asStrArray(body?.order)
  if (!order.length) throw createError({ statusCode: 400, message: 'order 必须是非空的字段 ID 或列名数组' })

  const existing = await q<Record<string, any>>(`SELECT id,col_key FROM module_field WHERE module_id=?`, [moduleId])
  const byId = new Map(existing.map(r => [String(r.id), Number(r.id)]))
  const byKey = new Map(existing.map(r => [String(r.col_key), Number(r.id)]))

  const sequence: number[] = []
  for (const token of order) {
    const id = byId.get(token) ?? byKey.get(token)
    if (id === undefined) {
      throw createError({ statusCode: 400, message: `排序中的「${token}」不是该模型下的字段（可用字段 ID 或列名）` })
    }
    if (!sequence.includes(id)) sequence.push(id)
  }
  // 没提交到末尾的字段保持原有相对顺序排在后面，避免排序值出现空洞
  for (const r of existing) if (!sequence.includes(Number(r.id))) sequence.push(Number(r.id))

  await tx(async conn => {
    for (const [index, id] of sequence.entries()) {
      await conn.execute(`UPDATE module_field SET sort=? WHERE id=? AND module_id=?`, [index + 1, id, moduleId])
    }
  })

  return ok(true)
})
