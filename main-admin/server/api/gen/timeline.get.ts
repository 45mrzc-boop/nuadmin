import { loadTenant, numArg, numOf } from '../_lib'

export default defineAuthed(async (event) => {
  const tenantId = numArg(event, 'tenantId', 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少查询参数 tenantId' })
  await loadTenant(tenantId)
  const limit = Math.min(200, Math.max(1, numOf(getQuery(event).size, 100)))

  const jobs = await q<Record<string, any>>(
    `SELECT id,version,kind,status,message,created_at,files_json FROM gen_job WHERE tenant_id=? ORDER BY id DESC LIMIT ?`,
    [tenantId, limit])
  // verify() 自己就会记一条 kind='verify' 的 gen_job，所以这里只用 verify_run
  // 把通过数补进该条的 message，绝不再合成第二行（曾经会重复出现两条）。
  const runs = await q<{ job_id: number | null, total: number, passed: number, failed: number, skipped: number }>(
    `SELECT job_id, COUNT(*) total, SUM(status='pass') passed,
            SUM(status='fail') failed, SUM(status='skip') skipped
     FROM verify_run WHERE tenant_id=? AND job_id IS NOT NULL GROUP BY job_id`, [tenantId])
  const byJob = new Map(runs.map(r => [Number(r.job_id), r]))

  const timeline = jobs.map(r => {
    const id = Number(r.id)
    const run = byJob.get(id)
    const isVerify = r.kind === 'verify'
    return {
      id,
      version: Number(r.version),
      kind: r.kind,
      status: r.status,
      // 只报「n/m 通过」会把失败和未验证一起藏掉（5/7 看起来像没事，其实 1 失败 1 没验），
      // 时间线上必须把两类问题都写出来。
      message: isVerify && run
        ? `验证 ${Number(run.passed)}/${Number(run.total)} 通过`
          + (Number(run.failed) ? ` · ${Number(run.failed)} 失败` : '')
          + (Number(run.skipped) ? ` · ${Number(run.skipped)} 未验证` : '')
        : String(r.message ?? ''),
      created_at: r.created_at,
      files: isVerify ? 0 : j<unknown[]>(r.files_json, []).length
    }
  })

  return ok(timeline)
})
