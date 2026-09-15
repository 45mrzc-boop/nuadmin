import { asText, bodyOf, dictItemView, numId } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'write')
  const id = numId(event)
  const item = await one<Record<string, any>>(`SELECT * FROM dict_item WHERE id=?`, [id])
  if (!item) throw createError({ statusCode: 404, message: `字典条目 #${id} 不存在` })

  const body = await bodyOf(event)
  const sets: string[] = []
  const args: unknown[] = []

  if (body.label !== undefined) {
    const label = asText(body.label, 64)
    if (!label) throw createError({ statusCode: 400, message: '条目名称 label 不能为空' })
    sets.push('label=?')
    args.push(label)
  }
  if (body.value !== undefined) {
    const value = asText(body.value, 64)
    if (!value) throw createError({ statusCode: 400, message: '条目值 value 不能为空' })
    const dup = await one(`SELECT id FROM dict_item WHERE type_id=? AND value=? AND id<>?`, [item.type_id, value, id])
    if (dup) throw createError({ statusCode: 409, message: `值「${value}」在这个字典里已存在` })
    sets.push('value=?')
    args.push(value)
  }
  if (body.color !== undefined) {
    const color = asText(body.color, 16)
    if (color && !['ok', 'warn', 'err'].includes(color)) {
      throw createError({ statusCode: 400, message: `颜色「${color}」不支持，可选：ok | warn | err` })
    }
    sets.push('color=?')
    args.push(color)
  }
  if (body.sort !== undefined) {
    const sort = Number(body.sort)
    if (!Number.isFinite(sort)) throw createError({ statusCode: 400, message: `排序 sort 必须是数字，当前 ${asText(body.sort, 16)}` })
    sets.push('sort=?')
    args.push(Math.round(sort))
  }
  if (body.enabled !== undefined) {
    sets.push('enabled=?')
    args.push(body.enabled ? 1 : 0)
  }
  if (!sets.length) throw createError({ statusCode: 400, message: '没有需要更新的内容，可更新 label / value / color / sort / enabled' })

  await run(`UPDATE dict_item SET ${sets.join(', ')} WHERE id=?`, [...args, id])
  const row = await one<Record<string, any>>(`SELECT * FROM dict_item WHERE id=?`, [id])
  return ok(dictItemView(row!))
})
