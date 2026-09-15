import { asText, bodyOf, groupView, loadTenant, nextSortOf, toInt, wantId } from '../../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台 tenantId')
  const name = asText(body.name, 64)
  if (!name) throw createError({ statusCode: 400, message: '分组名称 name 不能为空' })
  await loadTenant(tenantId)

  const dup = await one(`SELECT id FROM model_group WHERE tenant_id=? AND name=?`, [tenantId, name])
  if (dup) throw createError({ statusCode: 400, message: `分组「${name}」在该子后台下已存在` })

  const sort = body.sort === undefined
    ? await nextSortOf(`SELECT MAX(sort) s FROM model_group WHERE tenant_id=?`, [tenantId])
    : toInt(body.sort, 0)

  const r = await run(
    `INSERT INTO model_group (tenant_id,name,icon,sort) VALUES (?,?,?,?)`,
    [tenantId, name, asText(body.icon ?? '📁', 32) || '📁', sort])
  const row = await one<Record<string, any>>(`SELECT * FROM model_group WHERE id=?`, [r.insertId])
  return ok(groupView(row!))
})
