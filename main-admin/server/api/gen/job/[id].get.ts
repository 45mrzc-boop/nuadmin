import { numId } from '../../_lib'

export default defineAuthed(async (event) => {
  const id = numId(event)
  const job = await one<Record<string, any>>(`SELECT * FROM gen_job WHERE id=?`, [id])
  if (!job) throw createError({ statusCode: 404, message: `生成任务 #${id} 不存在` })
  return ok({
    ...job,
    id: Number(job.id),
    tenant_id: Number(job.tenant_id),
    version: Number(job.version),
    files: j<Array<{ path: string, lines: number }>>(job.files_json, []),
    files_json: undefined
  })
})
