import { groupView, numArg } from '../../_lib'

/**
 * 获取指定租户的模型分组列表。
 * 支持 query 参数 tenantId。
 */
export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'read')
  const tenantId = numArg(event, 'tenantId', 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少查询参数 tenantId' })

  const groups = await q<Record<string, any>>(
    `SELECT * FROM model_group WHERE tenant_id=? ORDER BY sort, id`,
    [tenantId]
  )
  return ok(groups.map(g => groupView(g)))
})
