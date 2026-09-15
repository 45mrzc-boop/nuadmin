import { loadTenant, numId, probePort, stickyRunning } from '../../_lib'
import { join } from 'node:path'

export default defineAuthed(async (event) => {
  const id = numId(event)
  const t = await loadTenant(id)
  const port = Number(t.port)
  const root = String(t.project_path || join(useRuntimeConfig().gen.tenantsRoot, t.slug))

  let ready: boolean
  const w = await import('../../../utils/gen/write')
  try {
    ready = await w.portOpen(port, 800)
  } catch {
    ready = await probePort(port, 300)
  }

  // Non-blocking install started by POST /start
  const inst = w.installState(root)
  const installing = inst?.state === 'running'

  // 单次探测失败不足以判定停止：库里认为在跑时，连续失败到阈值才落 stopped
  const running = stickyRunning(port, ready, t.status === 'running')
  let status = running ? 'running' : (t.status === 'running' ? 'stopped' : t.status)
  if (installing && !running) status = 'installing'
  if (status !== t.status) await run(`UPDATE tenant SET status=? WHERE id=?`, [status, id])

  return ok({
    running,
    ready,
    // true = 进程还在启动窗口里，库里仍是 running 但端口还没通
    stabilizing: !ready && running,
    installing,
    install: inst ? { state: inst.state, missing: inst.missing, elapsedMs: Date.now() - inst.startedAt, error: inst.error?.slice(-400) } : null,
    port,
    url: `/preview/${t.slug}/`,
    db: t.db_name,
    status,
    version: Number(t.version),
    projectPath: root
  })
})
