import { fieldView, loadTenant, numArg } from '../_lib'

/**
 * 必须与 fieldView 的输出口径一致：漏一个键，导出再导入就会静默丢掉该项配置。
 * 曾经只导基础属性，把 detailShow / exportShow / sortable / clearable / queryHidden /
 * ruleMsg / refLabel / refValue / indexType 全丢了。
 */
const EXPORT_FIELD_KEYS = [
  'name', 'key', 'type', 'length', 'precision', 'nullable', 'unique', 'indexed', 'pk', 'default',
  'dict', 'ref', 'refLabel', 'refValue', 'component', 'listShow', 'formShow', 'detailShow',
  'exportShow', 'sortable', 'clearable', 'query', 'queryHidden', 'required', 'rule', 'ruleMsg',
  'indexType', 'remark'
]

export default defineAuthed(async (event) => {
  const tenantId = numArg(event, 'tenantId', 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少查询参数 tenantId' })
  const t = await loadTenant(tenantId)

  const groups = await q<Record<string, any>>(`SELECT * FROM model_group WHERE tenant_id=? ORDER BY sort,id`, [tenantId])
  const modules = await q<Record<string, any>>(`SELECT * FROM module WHERE tenant_id=? ORDER BY sort,id`, [tenantId])
  const rows = modules.length
    ? await q<Record<string, any>>(
      `SELECT * FROM module_field WHERE module_id IN (${modules.map(() => '?').join(',')}) ORDER BY sort,id`,
      modules.map(m => m.id))
    : []

  const fieldsByModule = new Map<number, Record<string, unknown>[]>()
  for (const r of rows) {
    const view = fieldView(r)
    const picked: Record<string, unknown> = {}
    for (const k of EXPORT_FIELD_KEYS) picked[k] = view[k]
    const id = Number(r.module_id)
    if (!fieldsByModule.has(id)) fieldsByModule.set(id, [])
    fieldsByModule.get(id)!.push(picked)
  }

  return ok({
    tenant: { slug: t.slug, name: t.name, dbName: t.db_name, exportedAt: new Date().toISOString() },
    groups: groups.map(g => ({
      id: Number(g.id),
      name: g.name,
      icon: g.icon,
      sort: Number(g.sort),
      modules: modules.filter(m => Number(m.group_id) === Number(g.id)).map(m => ({
        name: m.name,
        key: m.res_key,
        tableName: m.table_name,
        comment: m.comment ?? '',
        icon: m.icon,
        design: j<Record<string, unknown> | null>(m.design_json, null),
        logic: j<Record<string, unknown> | null>(m.logic_json, null),
        seed: j<Record<string, unknown> | null>(m.seed_json, null),
        fields: fieldsByModule.get(Number(m.id)) ?? []
      }))
    }))
  })
})
