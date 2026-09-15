import {
  assertKnownColumns, bodyOf, fieldsOf, knownColumnKeys, loadModule, loadTenant,
  mergeDesign, moduleView, numId
} from '../_lib'

const DESIGN_ACTIONS = [
  'create', 'edit', 'delete', 'detail', 'batch', 'export', 'import', 'tree',
  'recycle', 'restore', 'flow', 'print'
]

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/design/:id', 'write')
  const id = numId(event, 'moduleId')
  const m = await loadModule(id)
  const tenantId = Number(m.tenant_id)
  await loadTenant(tenantId)

  const body = await bodyOf(event)
  const design = body.design ?? body
  if (!design || typeof design !== 'object' || Array.isArray(design)) {
    throw createError({ statusCode: 400, message: '缺少 design 对象（{list,form,detail,menu}）' })
  }

  const merged = mergeDesign(m, design as Record<string, unknown>)
  const known = await knownColumnKeys(tenantId, id)
  assertKnownColumns('列表列 list.columns', merged.list.columns, known)
  assertKnownColumns('表单字段 form.fields', merged.form.fields, known)
  const badAction = merged.list.actions.filter(a => !DESIGN_ACTIONS.includes(a))
  if (badAction.length) {
    throw createError({ statusCode: 400, message: `行操作 actions 不支持：${badAction.join(', ')}（可用：${DESIGN_ACTIONS.join(' / ')}）` })
  }
  const badTab = merged.detail.tabs.filter(tab => !known.has(tab) && tab !== 'base')
  if (badTab.length) throw createError({ statusCode: 400, message: `详情页 tabs 引用了不存在的列：${badTab.join(', ')}` })

  await run(`UPDATE module SET design_json=? WHERE id=?`, [JSON.stringify(merged), id])
  const fields = await fieldsOf([id])
  const row = await one<Record<string, any>>(`SELECT * FROM module WHERE id=?`, [id])
  return ok(moduleView(row!, fields.get(id) ?? []))
})
