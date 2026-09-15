import {
  assertKnownColumns, bodyOf, fieldsOf, knownColumnKeys, loadModule, loadTenant,
  mergeLogic, moduleView, numId
} from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/logic/:id', 'write')
  const id = numId(event, 'moduleId')
  const m = await loadModule(id)
  const tenantId = Number(m.tenant_id)
  await loadTenant(tenantId)

  const body = await bodyOf(event)
  const logic = body.logic ?? body
  if (!logic || typeof logic !== 'object' || Array.isArray(logic)) {
    throw createError({ statusCode: 400, message: '缺少 logic 对象（{hooks,endpoints,validators}）' })
  }

  const merged = mergeLogic(m, logic as Record<string, unknown>)
  const known = await knownColumnKeys(tenantId, id)
  assertKnownColumns('校验规则引用的字段', merged.validators.map(v => v.field), known)
  for (const v of merged.validators) {
    if (!v.expr) throw createError({ statusCode: 400, message: `字段「${v.field}」的校验规则 expr 不能为空` })
  }

  await run(`UPDATE module SET logic_json=? WHERE id=?`, [JSON.stringify(merged), id])
  const fields = await fieldsOf([id])
  const row = await one<Record<string, any>>(`SELECT * FROM module WHERE id=?`, [id])
  return ok(moduleView(row!, fields.get(id) ?? []))
})
