import { asText, bodyOf, loadTenant, numId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/gen/:id', 'write')
  const tenantId = numId(event, 'tenantId')
  await loadTenant(tenantId)
  const note = asText((await bodyOf(event)).note, 512)

  let jobId = 0
  try {
    const { generate } = await import('../../utils/gen/index')
    const res = await generate(tenantId)
    const files = Array.isArray(res?.files) ? res.files : []
    jobId = Number(res?.jobId ?? 0)

    // generate() 自己写 gen_job，也已经把 tenant.version 自增过：
    // 它记进 job 的是自增前的版本号，这里对齐到产物真实版本，时间线与回滚才对得上。
    const after = await loadTenant(tenantId)
    const version = Number(after.version)
    if (jobId) {
      const sets = ['version=?']
      const args: unknown[] = [version]
      if (note) {
        sets.push('message=?')
        args.push(`${note} · ${files.length} 个文件`.slice(0, 512))
      }
      await run(`UPDATE gen_job SET ${sets.join(', ')} WHERE id=?`, [...args, jobId])
    }
    // dictGaps 结构化返回：缺字典的枚举字段要在生成站列成清单，
    // 让人去解析 log 字符串才能看到，等于没说。
    return ok({ jobId, version, files, log: res?.log ?? '', dictGaps: res?.dictGaps ?? [] })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!jobId) {
      const t = await loadTenant(tenantId)
      await run(
        `INSERT INTO gen_job (tenant_id,version,kind,status,message,log,finished_at)
         VALUES (?,?,'generate','failed',?,?,NOW())`,
        [tenantId, Number(t.version), `生成失败：${message}`.slice(0, 512), message])
    }
    const statusCode = (e as { statusCode?: number }).statusCode
    throw createError({ statusCode: statusCode && statusCode !== 200 ? statusCode : 500, message: `生成失败：${message}` })
  }
})
