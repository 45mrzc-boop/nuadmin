import {
  asText, assertIdent, bodyOf, fieldsOf, loadModule, moduleView, numId, toInt, uniqueKeyInTenant
} from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const id = numId(event)
  const m = await loadModule(id)
  const body = await bodyOf(event)

  const sets: string[] = []
  const args: unknown[] = []

  if (body.name !== undefined) {
    const name = asText(body.name, 64)
    if (!name) throw createError({ statusCode: 400, message: '模型名称 name 不能为空' })
    sets.push('name=?')
    args.push(name)
  }
  if (body.icon !== undefined) {
    sets.push('icon=?')
    args.push(asText(body.icon, 32) || '📄')
  }
  if (body.comment !== undefined || body.description !== undefined) {
    sets.push('comment=?')
    args.push(asText(body.comment ?? body.description, 255))
  }
  if (body.groupId !== undefined || body.group_id !== undefined) {
    const groupId = toInt(body.groupId ?? body.group_id, 0)
    const g = await one<Record<string, any>>(`SELECT * FROM model_group WHERE id=?`, [groupId])
    if (!g) throw createError({ statusCode: 400, message: `分组 #${groupId} 不存在` })
    if (Number(g.tenant_id) !== Number(m.tenant_id)) {
      throw createError({ statusCode: 400, message: `分组「${g.name}」不属于该模型所在的子后台` })
    }
    sets.push('group_id=?')
    args.push(groupId)
  }
  if (body.tableName !== undefined || body.table_name !== undefined) {
    const wanted = assertIdent(asText(body.tableName ?? body.table_name, 64), '表名 tableName')
    if (wanted !== m.table_name) {
      const dup = await one(`SELECT id FROM module WHERE tenant_id=? AND table_name=? AND id<>?`,
        [m.tenant_id, wanted, id])
      if (dup) throw createError({ statusCode: 400, message: `表名「${wanted}」在该子后台下已被占用` })
      sets.push('table_name=?')
      args.push(wanted)
    }
  }
  if (body.resKey !== undefined || body.res_key !== undefined) {
    const wanted = await uniqueKeyInTenant('res_key', Number(m.tenant_id),
      asText(body.resKey ?? body.res_key, 64), true)
    sets.push('res_key=?')
    args.push(wanted)
  }
  if (body.sort !== undefined) {
    sets.push('sort=?')
    args.push(toInt(body.sort, Number(m.sort)))
  }
  if (!sets.length) throw createError({ statusCode: 400, message: '没有需要更新的内容，可更新 name / icon / comment / tableName / groupId / resKey / sort' })

  await run(`UPDATE module SET ${sets.join(', ')} WHERE id=?`, [...args, id])
  const fields = await fieldsOf([id])
  const row = await one<Record<string, any>>(`SELECT * FROM module WHERE id=?`, [id])
  return ok(moduleView(row!, fields.get(id) ?? []))
})
