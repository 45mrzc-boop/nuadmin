import { loadTenant, numArg } from '../_lib'

export default defineAuthed(async (event) => {
  const tenantId = numArg(event, 'tenantId', 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少查询参数 tenantId' })
  await loadTenant(tenantId)

  const { previewProject } = await import('../../utils/gen/verify')
  const res = await previewProject(tenantId)
  return ok({
    tree: String(res?.tree ?? ''),
    files: Array.isArray(res?.files) ? res.files : [],
    ddl: String(res?.ddl ?? '')
  })
})
