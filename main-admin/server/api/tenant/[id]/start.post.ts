import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadTenant, numId, resetProbe } from '../../_lib'

const READY_BUDGET_MS = 90_000

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/tenant/:id', 'write')
  const id = numId(event)
  const t = await loadTenant(id)
  const cfg = useRuntimeConfig().gen
  const root = String(t.project_path || join(cfg.tenantsRoot, t.slug))
  const port = Number(t.port)
  const url = `/preview/${t.slug}/`
  const { spawnDev, portOpen, missingDeps, unresolvableImports, undeclaredImports, beginInstall, installState } =
    await import('../../../utils/gen/write')
  resetProbe(port)

  if (!existsSync(root)) {
    throw createError({ statusCode: 400, message: `项目目录 ${root} 不存在，请先到生成站执行生成` })
  }
  if (await portOpen(port, 800)) {
    if (t.status !== 'running') await run(`UPDATE tenant SET status='running' WHERE id=?`, [id])
    return ok({ running: true, already: true, ready: true, pid: 0, port, url, needsInstall: false })
  }

  /** APP_BASE goes to the child only; the parent's own env stays untouched so
   *  a second tenant started afterwards can never read the first one's value. */
  async function launch() {
    const pid = await spawnDev(root, port, { APP_BASE: url })
    const ready = await portOpen(port, READY_BUDGET_MS)
    await run(`UPDATE tenant SET status=? WHERE id=?`, [ready ? 'running' : 'failed', id])
    return { pid, ready }
  }

  // An install is already in flight: report it rather than starting a second one.
  const inflight = installState(root)
  if (inflight?.state === 'running') {
    return ok({
      running: false, installing: true, port, url,
      missing: inflight.missing, elapsedMs: Date.now() - inflight.startedAt
    })
  }

  const missing = await missingDeps(root)
  const unresolvable = await unresolvableImports(root)
  const undeclared = await undeclaredImports(root)

  if (missing.length) {
    await run(`UPDATE tenant SET status='installing' WHERE id=?`, [id])
    // The callback must always leave a terminal status, or the tenant sits in
    // `installing` forever and the UI can never recover.
    beginInstall(root, missing, async installed => {
      if (!installed) { await run(`UPDATE tenant SET status='failed' WHERE id=?`, [id]); return }
      const stillBad = await unresolvableImports(root)
      if (stillBad.length) {
        await run(`UPDATE tenant SET status='failed' WHERE id=?`, [id])
        return
      }
      await launch()
    })
    return ok({
      running: false, ready: false, installing: true, port, url,
      missing, undeclared,
      message: `检测到 ${missing.length} 个未安装依赖（${missing.join(', ')}），已自动开始安装，完成后会自动启动`
    })
  }

  // Only a package that is neither declared nor resolvable can actually break
  // the app; undeclared-but-installed ones are transitive and harmless.
  if (unresolvable.length) {
    throw createError({
      statusCode: 409,
      message: `生成代码引用了无法解析的包：${unresolvable.join(', ')}。请回生成站重新生成。`
    })
  }

  const { pid, ready } = await launch()
  if (!ready) {
    return ok({
      running: false, ready: false, pid, port, url, needsInstall: false,
      message: `已启动进程（pid=${pid}），但端口 ${port} 在 ${READY_BUDGET_MS / 1000} 秒内未就绪`
    })
  }
  return ok({ running: true, ready: true, pid, port, url, needsInstall: false })
})
