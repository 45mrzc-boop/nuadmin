import { loadTenant, numId, resetProbe } from '../../_lib'

const RELEASE_BUDGET_MS = 8_000

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/tenant/:id', 'write')
  const id = numId(event)
  const t = await loadTenant(id)
  const port = Number(t.port)
  const url = `/preview/${t.slug}/`

  const { killPort, portOpen } = await import('../../../utils/gen/write')
  const killed = await killPort(port)

  // SIGTERM 到端口真正不再接受连接之间有空档；不等的话调用方紧接着查 status 会看到 running
  let released = !(await portOpen(port, 400))
  const deadline = Date.now() + RELEASE_BUDGET_MS
  while (!released && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 400))
    released = !(await portOpen(port, 400))
  }

  resetProbe(port)
  if (t.status !== 'draft') await run(`UPDATE tenant SET status='stopped' WHERE id=?`, [id])

  return ok({
    stopped: true,
    released,
    killed,
    port,
    url,
    message: released ? undefined
      : `已向 ${killed} 个进程发送 SIGTERM，但端口 ${port} 在 ${RELEASE_BUDGET_MS / 1000} 秒内未释放`
  })
})
