import { assertIdent, asText, bodyOf, dictTypeView, wantId } from '../_lib'

/** 新建字典类型，可带初始条目。dict_key 在租户内唯一。 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台')
  const dictKey = assertIdent(asText(body.dictKey ?? body.dict_key, 64), '字典编码 dictKey', true)
  const name = asText(body.name, 64)
  if (!name) throw createError({ statusCode: 400, message: '字典名称 name 不能为空' })

  const t = await one(`SELECT id FROM tenant WHERE id=?`, [tenantId])
  if (!t) throw createError({ statusCode: 404, message: `子后台 #${tenantId} 不存在` })
  const dup = await one(`SELECT id FROM dict_type WHERE tenant_id=? AND dict_key=?`, [tenantId, dictKey])
  if (dup) throw createError({ statusCode: 409, message: `字典编码「${dictKey}」已存在，直接给它补条目即可` })

  const items = Array.isArray(body.items) ? body.items : []
  const seen = new Set<string>()
  const rows = items.map((raw: Record<string, unknown>, i: number) => {
    const label = asText(raw.label ?? raw.name, 64)
    const value = asText(raw.value, 64)
    if (!label || !value) throw createError({ statusCode: 400, message: `第 ${i + 1} 个条目需要同时有 label 和 value` })
    if (seen.has(value)) throw createError({ statusCode: 400, message: `条目值「${value}」重复` })
    seen.add(value)
    return { label, value, color: asText(raw.color, 16), sort: Number(raw.sort) || i }
  })

  const id = await tx(async conn => {
    const [res] = await conn.execute(
      `INSERT INTO dict_type (tenant_id, dict_key, name, remark) VALUES (?,?,?,?)`,
      [tenantId, dictKey, name, asText(body.remark, 255)])
    const typeId = Number((res as { insertId: number }).insertId)
    for (const r of rows) {
      await conn.execute(
        `INSERT INTO dict_item (type_id, label, value, color, sort) VALUES (?,?,?,?,?)`,
        [typeId, r.label, r.value, r.color, r.sort])
    }
    return typeId
  })

  const row = await one<Record<string, any>>(`SELECT * FROM dict_type WHERE id=?`, [id])
  const created = await q<Record<string, any>>(`SELECT * FROM dict_item WHERE type_id=? ORDER BY sort, id`, [id])
  return ok(dictTypeView(row!, created))
})
