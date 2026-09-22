import { fieldsOf, moduleView, numArg } from '../_lib'

/**
 * 获取指定租户的全部模块列表（包含字段与设计配置）。
 * 支持 query 参数 tenantId。
 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'read')
  const tenantId = numArg(event, 'tenantId', 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少查询参数 tenantId' })

  const modules = await q<Record<string, any>>(
    `SELECT * FROM module WHERE tenant_id=? ORDER BY sort, id`,
    [tenantId]
  )
  const fields = await fieldsOf(modules.map(m => Number(m.id)))
  return ok(modules.map(m => moduleView(m, fields.get(Number(m.id)) ?? [])))
})
