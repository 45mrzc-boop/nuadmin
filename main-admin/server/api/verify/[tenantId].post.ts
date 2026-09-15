import { asText, bodyOf, loadTenant, numId } from '../_lib'

interface VerifyCase {
  case_key?: unknown
  title?: unknown
  status?: unknown
  detail?: unknown
  duration?: unknown
}

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/verify/:id', 'write')
  const tenantId = numId(event, 'tenantId')
  await loadTenant(tenantId)
  // boot 用例会真的 npm run dev 并等端口，只有显式传 boot:true 才跑
  const { boot } = await bodyOf(event)
  const opts = { boot: boot === true }

  try {
    const { verify } = await import('../../utils/gen/verify')
    const res = await verify(tenantId, opts)
    const jobId = Number(res?.jobId ?? 0)
    const cases = Array.isArray(res?.cases) ? res.cases as VerifyCase[] : []

    // verify() 已经把 gen_job 和 verify_run 都写好了；万一没写，这里补记
    const recorded = Number((await one<{ c: number }>(
      `SELECT COUNT(*) c FROM verify_run WHERE tenant_id=? AND job_id=?`, [tenantId, jobId]))?.c ?? 0)
    if (jobId && !recorded) {
      for (const c of cases) {
        const status = ['pass', 'fail', 'skip'].includes(asText(c.status, 16)) ? asText(c.status, 16) : 'pass'
        await run(
          `INSERT INTO verify_run (tenant_id,job_id,case_key,title,status,detail,duration) VALUES (?,?,?,?,?,?,?)`,
          [tenantId, jobId, asText(c.case_key, 64) || 'case', asText(c.title, 128), status,
            typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail ?? ''),
            Math.max(0, Math.round(Number(c.duration) || 0))])
      }
    }

    const rows = jobId
      ? await q<Record<string, any>>(
        `SELECT case_key,title,status,detail,duration,created_at FROM verify_run
         WHERE tenant_id=? AND job_id=? ORDER BY id`, [tenantId, jobId])
      : cases.map(c => ({
          case_key: asText(c.case_key, 64),
          title: asText(c.title, 128),
          status: asText(c.status, 16),
          detail: typeof c.detail === 'string' ? c.detail : '',
          duration: Number(c.duration) || 0,
          created_at: null as string | null
        }))

    return ok({ jobId, cases: rows.map(r => ({ ...r, duration: Number(r.duration) })) })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const statusCode = (e as { statusCode?: number }).statusCode
    throw createError({
      statusCode: statusCode && statusCode !== 200 ? statusCode : 500,
      message: `验证失败：${message}`
    })
  }
})
