import { asText, bodyOf, dictItemView, numId } from '../../_lib'

/**
 * 整表替换某个字典的条目。
 *
 * 建模站「枚举值」输入框一次改多个值，用逐条 create/patch/delete 会打十几个请求，
 * 中途失败就留下半套字典。这里一个事务里全量替换。
 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'write')
  const id = numId(event)
  const t = await one<Record<string, any>>(`SELECT * FROM dict_type WHERE id=?`, [id])
  if (!t) throw createError({ statusCode: 404, message: `字典 #${id} 不存在` })

  const body = await bodyOf(event)
  const raw = Array.isArray(body.items) ? body.items : []
  const seen = new Set<string>()
  const rows = raw.map((r: Record<string, unknown>, i: number) => {
    const label = asText(r.label, 64)
    const value = asText(r.value, 64)
    if (!label || !value) throw createError({ statusCode: 400, message: `第 ${i + 1} 个条目需要同时有 label 和 value` })
    if (seen.has(value)) throw createError({ statusCode: 400, message: `条目值「${value}」重复` })
    seen.add(value)
    const color = asText(r.color, 16)
    if (color && !['ok', 'warn', 'err'].includes(color)) {
      throw createError({ statusCode: 400, message: `第 ${i + 1} 个条目的颜色「${color}」不支持，可选：ok | warn | err` })
    }
    return { label, value, color, sort: Number(r.sort), enabled: r.enabled === undefined || r.enabled ? 1 : 0 }
  })

  await tx(async conn => {
    await conn.execute(`DELETE FROM dict_item WHERE type_id=?`, [id])
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      await conn.execute(
        `INSERT INTO dict_item (type_id, label, value, color, sort, enabled) VALUES (?,?,?,?,?,?)`,
        [id, r.label, r.value, r.color, Number.isFinite(r.sort) ? r.sort : i, r.enabled])
    }
  })

  const items = await q<Record<string, any>>(`SELECT * FROM dict_item WHERE type_id=? ORDER BY sort, id`, [id])
  return ok({ dictKey: t.dict_key, count: items.length, items: items.map(dictItemView) })
})
