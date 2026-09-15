import {
  asText, bodyOf, deriveKeys, loadTenant, moduleView, nextSortOf, toInt,
  uniqueKeyInTenant, wantId
} from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台 tenantId')
  const groupId = wantId(body, 'groupId', '分组 groupId')
  const name = asText(body.name, 64)
  if (!name) throw createError({ statusCode: 400, message: '模型名称 name 不能为空' })

  await loadTenant(tenantId)
  const group = await one<Record<string, any>>(`SELECT * FROM model_group WHERE id=?`, [groupId])
  if (!group) throw createError({ statusCode: 404, message: `分组 #${groupId} 不存在` })
  if (Number(group.tenant_id) !== tenantId) {
    throw createError({ statusCode: 400, message: `分组 #${groupId}「${group.name}」不属于子后台 #${tenantId}` })
  }

  const wantedKey = asText(body.key ?? body.res_key, 64)
  const wantedTable = asText(body.table_name ?? body.tableName, 64)
  const derived = deriveKeys(name, wantedTable, wantedKey)
  const resKey = await uniqueKeyInTenant('res_key', tenantId, derived.resKey, !!wantedKey)
  const tableName = await uniqueKeyInTenant('table_name', tenantId, derived.table, !!wantedTable)

  const sort = body.sort === undefined
    ? await nextSortOf(`SELECT MAX(sort) s FROM module WHERE tenant_id=?`, [tenantId])
    : toInt(body.sort, 0)

  const r = await run(
    `INSERT INTO module (group_id,tenant_id,name,res_key,table_name,icon,comment,sort) VALUES (?,?,?,?,?,?,?,?)`,
    [groupId, tenantId, name, resKey, tableName, asText(body.icon ?? '📄', 32) || '📄',
      asText(body.comment ?? body.description, 255), sort])

  const row = await one<Record<string, any>>(`SELECT * FROM module WHERE id=?`, [r.insertId])
  return ok(moduleView(row!))
})
