import { asText, bodyOf, dictItemView, wantId } from '../../_lib'

/** 往字典里加一个条目。value 在同一字典内唯一（库里是 UNIQUE(type_id,value)）。 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'write')
  const body = await bodyOf(event)
  const typeId = wantId(body, 'typeId', '字典')
  const t = await one<Record<string, any>>(`SELECT * FROM dict_type WHERE id=?`, [typeId])
  if (!t) throw createError({ statusCode: 404, message: `字典 #${typeId} 不存在` })

  const label = asText(body.label, 64)
  const value = asText(body.value, 64)
  if (!label) throw createError({ statusCode: 400, message: '条目名称 label 不能为空' })
  if (!value) throw createError({ statusCode: 400, message: '条目值 value 不能为空' })
  const color = asText(body.color, 16)
  if (color && !['ok', 'warn', 'err'].includes(color)) {
    throw createError({ statusCode: 400, message: `颜色「${color}」不支持，可选：ok | warn | err` })
  }
  const dup = await one(`SELECT id FROM dict_item WHERE type_id=? AND value=?`, [typeId, value])
  if (dup) throw createError({ statusCode: 409, message: `值「${value}」在这个字典里已存在` })

  const sort = Number(body.sort)
  const next = Number.isFinite(sort) && sort >= 0
    ? Math.round(sort)
    : Number((await one<{ n: number }>(`SELECT COALESCE(MAX(sort),-1)+1 n FROM dict_item WHERE type_id=?`, [typeId]))?.n ?? 0)

  const r = await run(
    `INSERT INTO dict_item (type_id, label, value, color, sort, enabled) VALUES (?,?,?,?,?,?)`,
    [typeId, label, value, color, next, body.enabled === undefined || body.enabled ? 1 : 0])
  const row = await one<Record<string, any>>(`SELECT * FROM dict_item WHERE id=?`, [Number(r.insertId)])
  return ok(dictItemView(row!))
})
