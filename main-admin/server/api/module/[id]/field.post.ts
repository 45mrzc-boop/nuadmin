import { bodyOf, fieldView, insertField, loadModule, numId, prepareFields } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const moduleId = numId(event)
  await loadModule(moduleId)

  const body = await bodyOf(event)
  const bulk = Array.isArray(body.fields)
  const inputs = (bulk ? body.fields : [body]) as Record<string, unknown>[]
  if (!inputs.length) throw createError({ statusCode: 400, message: 'fields 不能为空数组，至少提交一个字段' })

  const rows = await prepareFields(moduleId, inputs)
  const ids: number[] = []
  for (const row of rows) ids.push(await insertField(row))

  const created = await q<Record<string, any>>(
    `SELECT * FROM module_field WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY sort,id`, ids)
  const views = created.map(fieldView)

  return ok(bulk ? views : views[0])
})
