import { bodyOf, wantId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/gen/:id', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台 tenantId')
  const version = wantId(body, 'version', '目标版本 version')

  // rollback() 负责校验可回滚版本、git checkout 恢复文件、写 rollback job 与 tenant.version/status
  const { rollback } = await import('../../utils/gen/index')
  return ok(await rollback(tenantId, version))
})
