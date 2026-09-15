import {
  assertKnownColumns, bodyOf, fieldsOf, knownColumnKeys, loadModule, loadTenant,
  mergeSeed, moduleView, numId
} from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/seed/:id', 'write')
  const id = numId(event, 'moduleId')
  const m = await loadModule(id)
  const tenantId = Number(m.tenant_id)
  await loadTenant(tenantId)

  const body = await bodyOf(event)
  const seed = body.seed ?? body
  if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
    throw createError({ statusCode: 400, message: '缺少 seed 对象（{rows,enabled,rules}）' })
  }

  const merged = mergeSeed(m, seed as Record<string, unknown>)
  assertKnownColumns('造数规则 rules', Object.keys(merged.rules), await knownColumnKeys(tenantId, id))

  await run(`UPDATE module SET seed_json=? WHERE id=?`, [JSON.stringify(merged), id])
  const fields = await fieldsOf([id])
  const row = await one<Record<string, any>>(`SELECT * FROM module WHERE id=?`, [id])
  return ok(moduleView(row!, fields.get(id) ?? []))
})
