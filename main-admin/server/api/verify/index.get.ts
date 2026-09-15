import { loadTenant, numArg } from '../_lib'

/**
 * 最近一次验证 = 最后一批 verify_run（按 job_id 归批，`<=>` 让没有关联生成
 * 任务的记录也能成批读出）。支持 ?jobId= 指定某一次。
 */
export default defineAuthed(async (event) => {
  const tenantId = numArg(event, 'tenantId', 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少查询参数 tenantId' })
  await loadTenant(tenantId)

  const wanted = Number(getQuery(event).jobId)
  let job: unknown = Number.isInteger(wanted) && wanted > 0 ? wanted : null
  if (job === null) {
    const last = await one<{ job_id: number | null }>(
      `SELECT job_id FROM verify_run WHERE tenant_id=? ORDER BY id DESC LIMIT 1`, [tenantId])
    if (!last) return ok([])
    job = last.job_id
  }

  const rows = await q<Record<string, any>>(
    `SELECT id,job_id,case_key,title,status,detail,duration,created_at
     FROM verify_run WHERE tenant_id=? AND job_id<=>? ORDER BY id`, [tenantId, job])

  return ok(rows.map(r => ({
    id: Number(r.id),
    job_id: r.job_id === null ? null : Number(r.job_id),
    case_key: r.case_key,
    title: r.title,
    status: r.status,
    detail: r.detail ?? '',
    duration: Number(r.duration),
    created_at: r.created_at
  })))
})
