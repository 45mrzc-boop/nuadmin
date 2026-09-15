import { dictTypeView, numArg } from '../_lib'

/**
 * 某子后台的全部字典定义。
 *
 * usedBy 是「有几个字段引用了这个 dict_key」——建模站靠它提示复用风险：
 * 两个模块各自的 status 字段如果都填成 status，就会静默共用同一份字典。
 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/dict', 'read')
  const tenantId = numArg(event, 'tenantId', 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少查询参数 tenantId' })

  const types = await q<Record<string, any>>(
    `SELECT * FROM dict_type WHERE tenant_id=? ORDER BY dict_key`, [tenantId])
  if (!types.length) return ok([])

  const items = await q<Record<string, any>>(
    `SELECT d.* FROM dict_item d JOIN dict_type t ON t.id=d.type_id
     WHERE t.tenant_id=? ORDER BY d.sort, d.id`, [tenantId])
  const used = await q<{ dict_key: string, n: number }>(
    `SELECT f.dict_key, COUNT(*) n FROM module_field f JOIN module m ON m.id=f.module_id
     WHERE m.tenant_id=? AND f.dict_key<>'' GROUP BY f.dict_key`, [tenantId])
  const usedMap = Object.fromEntries(used.map(u => [u.dict_key, Number(u.n)]))
  const byType = new Map<number, Record<string, any>[]>()
  for (const i of items) byType.set(Number(i.type_id), [...(byType.get(Number(i.type_id)) ?? []), i])

  return ok(types.map(t => ({
    ...dictTypeView(t, byType.get(Number(t.id)) ?? []),
    usedBy: usedMap[t.dict_key] ?? 0
  })))
})
