import { asText, bodyOf, groupView, numId } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const id = numId(event)
  const g = await one<Record<string, any>>(`SELECT * FROM model_group WHERE id=?`, [id])
  if (!g) throw createError({ statusCode: 404, message: `分组 #${id} 不存在` })

  const body = await bodyOf(event)
  const sets: string[] = []
  const args: unknown[] = []

  if (body.name !== undefined) {
    const name = asText(body.name, 64)
    if (!name) throw createError({ statusCode: 400, message: '分组名称 name 不能为空' })
    const dup = await one(`SELECT id FROM model_group WHERE tenant_id=? AND name=? AND id<>?`, [g.tenant_id, name, id])
    if (dup) throw createError({ statusCode: 400, message: `分组「${name}」已存在` })
    sets.push('name=?')
    args.push(name)
  }
  if (body.icon !== undefined) {
    sets.push('icon=?')
    args.push(asText(body.icon, 32) || '📁')
  }
  if (body.sort !== undefined) {
    const sort = Number(body.sort)
    if (!Number.isFinite(sort)) throw createError({ statusCode: 400, message: `排序 sort 必须是数字，当前 ${asText(body.sort, 16)}` })
    sets.push('sort=?')
    args.push(Math.round(sort))
  }
  if (!sets.length) throw createError({ statusCode: 400, message: '没有需要更新的内容，可更新 name / icon / sort' })

  await run(`UPDATE model_group SET ${sets.join(', ')} WHERE id=?`, [...args, id])
  const row = await one<Record<string, any>>(`SELECT * FROM model_group WHERE id=?`, [id])
  return ok(groupView(row!))
})
