import { mkdir, writeFile, readFile, rm, rename, stat, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run1 = promisify(execFile)

/** Materialise a generated file map on disk under `root`. Returns line counts per file. */
export async function writeProject(root: string, files: Record<string, string>): Promise<Array<{ path: string, lines: number }>> {
  const out: Array<{ path: string, lines: number }> = []
  for (const [rel, content] of Object.entries(files).sort((a, b) => a[0].localeCompare(b[0]))) {
    const abs = join(root, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, content, 'utf8')
    out.push({ path: rel, lines: content.split('\n').length })
  }
  return out
}

export async function removeDir(path: string) {
  if (!path || path === '/' || !existsSync(path)) return
  await rm(path, { recursive: true, force: true })
}

/** Rename instead of hard-deleting: a mistaken delete stays recoverable. */
export async function quarantineDir(path: string): Promise<string> {
  if (!path || !existsSync(path)) return ''
  const target = `${path}.removed-${Date.now()}`
  await rename(path, target)
  return target
}

export async function dirSize(path: string): Promise<number> {
  try { return (await stat(path)).isDirectory() ? 1 : 0 } catch { return 0 }
}

/**
 * Snapshot the generated project with a real git commit, so the 生成站 timeline
 * can diff and roll back. Falls back to a no-op when git is unavailable.
 */
export async function commitProject(root: string, message: string): Promise<string> {
  try {
    if (!existsSync(join(root, '.git'))) await run1('git', ['init', '-q'], { cwd: root })
    await run1('git', ['add', '-A'], { cwd: root })
    await run1('git', ['-c', 'user.email=genplus@local', '-c', 'user.name=GenPlus', 'commit', '-q',
      '--allow-empty', '--no-verify', '-m', message], { cwd: root })
    const { stdout } = await run1('git', ['rev-parse', '--short', 'HEAD'], { cwd: root })
    return stdout.trim()
  } catch {
    return ''
  }
}

export async function gitLog(root: string): Promise<Array<{ commit: string, message: string }>> {
  try {
    const { stdout } = await run1('git', ['log', '--pretty=format:%h\x1f%s', '-n', '50'], { cwd: root })
    return stdout.split('\n').filter(Boolean).map(l => {
      const [commit, message] = l.split('\x1f')
      return { commit, message }
    })
  } catch {
    return []
  }
}

/**
 * Restore the worktree to an exact commit without discarding history.
 *
 * `git checkout <commit> -- .` only overwrites paths present in <commit>: files
 * that newer commits added stay tracked-and-unmodified, so `status` is clean and
 * `git clean` cannot see them — the rollback silently leaves the newer
 * generation on disk while still reporting success.
 *
 * `read-tree -u --reset` replaces the index with the target tree AND updates the
 * worktree to match it, deleting the extras. Committing that index keeps the
 * history linear. The result is then asserted, never trusted.
 */
export async function gitRollback(root: string, commit: string): Promise<boolean> {
  try {
    await run1('git', ['read-tree', '-u', '--reset', commit], { cwd: root })
    // read-tree leaves emptied directories behind (git tracks files, not dirs).
    await run1('git', ['clean', '-fdq'], { cwd: root })
    await run1('git', ['-c', 'user.email=genplus@local', '-c', 'user.name=GenPlus',
      'commit', '-q', '--no-verify', '--allow-empty', '-m', `rollback to ${commit}`], { cwd: root })

    // Two independent proofs:
    // 1) HEAD tree is byte-identical to the target tree
    const { stdout: head } = await run1('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root })
    const { stdout: want } = await run1('git', ['rev-parse', `${commit}^{tree}`], { cwd: root })
    if (head.trim() !== want.trim()) return false
    // 2) the worktree holds nothing beyond that tree
    const { stdout: status } = await run1('git', ['status', '--porcelain'], { cwd: root })
    return status.trim() === ''
  } catch {
    return false
  }
}

/**
 * Dependencies declared in package.json but absent from node_modules.
 *
 * Existence of node_modules is NOT sufficient: installing a capability that
 * adds a dependency (e.g. vue-i18n) rewrites package.json, and the project then
 * boots the server fine while the client bundle 404s into an HTML fallback.
 */
export async function missingDeps(root: string): Promise<string[]> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const deps = Object.keys(pkg.dependencies ?? {})
    const out: string[] = []
    for (const d of deps) {
      try { await stat(join(root, 'node_modules', d, 'package.json')) } catch { out.push(d) }
    }
    return out
  } catch {
    return []
  }
}

/**
 * Bare module specifiers imported by the generated code but absent from
 * package.json. Diagnostic only: transitively-provided packages (h3 via nitro,
 * @internationalized/date via @nuxt/ui) are undeclared yet fully importable.
 */
export async function undeclaredImports(root: string): Promise<string[]> {
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
    const declared = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})])
    const found = new Set<string>()
    const skip = /^(?:\.|#|~|node:|virtual:)/
    const walk = async (d: string) => {
      for (const e of await readdir(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(p) }
        else if (/\.(ts|vue)$/.test(e.name)) {
          const src = await readFile(p, 'utf8')
          for (const m of src.matchAll(/(?:from|import)\s*\(\s*['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]/g)) {
            const spec = m[1] ?? m[2]
            if (!spec || skip.test(spec)) continue
            found.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0])
          }
        }
      }
    }
    for (const d of ['app', 'server']) if (existsSync(join(root, d))) await walk(join(root, d))
    return [...found].filter(p => !declared.has(p)).sort()
  } catch {
    return []
  }
}

const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', '.git', 'uploads'])

/**
 * 检查相对路径导入（如 ../utils/auth 或 ../../utils/auth）是否能够正确解析到物理文件。
 * 防止发生 RollupError 导致 nitro 服务起不来而 TCP 探测假绿。
 */
export async function brokenRelativeImports(root: string): Promise<string[]> {
  const broken: string[] = []
  const exts = ['', '.ts', '.js', '.vue', '.json', '/index.ts', '/index.js']
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(p)
      } else if (/\.(ts|vue)$/.test(e.name)) {
        const src = await readFile(p, 'utf8')
        for (const m of src.matchAll(/(?:from|import)\s*\(\s*['"]([^'"]+)['"]|from\s+['"]([^'"]+)['"]/g)) {
          const spec = m[1] ?? m[2]
          if (spec && spec.startsWith('.')) {
            const targetBase = join(dirname(p), spec)
            const exists = exts.some(ext => existsSync(targetBase + ext))
            if (!exists) {
              const rel = p.slice(root.length + 1)
              broken.push(`${rel} -> ${spec}`)
            }
          }
        }
      }
    }
  }
  for (const d of ['app', 'server']) if (existsSync(join(root, d))) await walk(join(root, d))
  return broken
}

/**
 * Imported, not declared, AND not resolvable in node_modules, or broken relative imports —
 * the cases that genuinely cannot run.
 */
export async function unresolvableImports(root: string): Promise<string[]> {
  const undeclared = await undeclaredImports(root)
  const missingPkgs = undeclared.filter(p => !existsSync(join(root, 'node_modules', p, 'package.json')))
  const brokenRelatives = await brokenRelativeImports(root)
  return [...missingPkgs, ...brokenRelatives]
}

export interface InstallState {
  state: 'running' | 'done' | 'failed'
  missing: string[]
  output: string
  startedAt: number
  error?: string
}

const installs = new Map<string, InstallState>()

export function installState(root: string): InstallState | null {
  return installs.get(root) ?? null
}

/**
 * Kick off `npm install` without blocking the request, then start the dev
 * server once it succeeds. Returns immediately so the caller can poll progress.
 */
export function beginInstall(root: string, missing: string[], onDone?: (ok: boolean) => void): InstallState {
  const existing = installs.get(root)
  if (existing?.state === 'running') return existing

  const st: InstallState = { state: 'running', missing: [...missing], output: '', startedAt: Date.now() }
  installs.set(root, st)

  // Full `npm install` rather than per-package: it also reconciles anything else
  // package.json declares, which is exactly the drift that breaks the client.
  run1('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'],
    { cwd: root, timeout: 15 * 60_000, maxBuffer: 32 * 1024 * 1024 })
    .then(r => {
      st.state = 'done'
      st.output = String(r.stdout ?? '').slice(-4000)
    })
    .catch(e => {
      st.state = 'failed'
      st.error = String(e?.stderr ?? e?.message ?? e).slice(-4000)
      st.output = st.error
    })
    .finally(() => onDone?.(st.state === 'done'))

  return st
}

/** `npm install` for a freshly generated sub-admin. Never blocks generation. */
export function installDeps(root: string): Promise<{ ok: boolean, output: string }> {
  return run1('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: root, timeout: 15 * 60_000, maxBuffer: 32 * 1024 * 1024 })
    .then(r => ({ ok: true, output: r.stdout.slice(-4000) }))
    .catch(e => ({ ok: false, output: String(e?.stderr ?? e?.message ?? e).slice(-4000) }))
}

/**
 * Env vars the control plane sets for itself that MUST NOT leak into a
 * generated sub-admin: Nuxt loads .env without overriding existing
 * process.env, so an inherited JWT_SECRET/DB_NAME would make the child run
 * with the parent's secret and database. Measured live: a main-admin JWT was
 * accepted by a tenant API until this isolation was added.
 */
const PARENT_ONLY_ENV = /^(NUXT_|JWT_|DB_|TENANT_|PORT$|HOST$)/

function childEnv(port: number, extra: Record<string, string> = {}) {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !PARENT_ONLY_ENV.test(k)) env[k] = v
  }
  return { ...env, PORT: String(port), HOST: '0.0.0.0', ...extra }
}

function npmSpawnTarget(): [string, boolean] {
  return process.platform === 'win32' ? ['npm.cmd', true] : ['npm', false]
}

export async function spawnDev(root: string, port: number, extra: Record<string, string> = {}) {
  const { spawn } = await import('node:child_process')
  const [cmd, shell] = npmSpawnTarget()
  const child = spawn(cmd, ['run', 'dev'], {
    cwd: root, detached: true, stdio: ['ignore', 'ignore', 'ignore'],
    env: childEnv(port, extra),
    shell
  })
  child.on('error', (e) => {
    console.error(`[spawnDev] 启动失败 (${cmd} in ${root}):`, e.message)
  })
  child.unref()
  return child.pid ?? 0
}

export async function killPort(port: number): Promise<number> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await run1('cmd', ['/c', `netstat -ano | findstr LISTENING | findstr :${port}`])
      const pids = [...new Set(
        stdout.split('\n')
          .map(l => l.trim().split(/\s+/).pop() ?? '')
          .filter(p => /^\d+$/.test(p))
          .map(Number)
      )]
      for (const pid of pids) {
        try { await run1('taskkill', ['/PID', String(pid), '/T', '/F']) } catch { /* gone */ }
      }
      return pids.length
    } else {
      const { stdout } = await run1('bash', ['-c', `ss -lptn 'sport = :${port}' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u`])
      const pids = stdout.split('\n').map(s => Number(s.trim())).filter(Boolean)
      for (const pid of pids) {
        try { process.kill(-pid, 'SIGTERM') } catch {
          try { process.kill(pid, 'SIGTERM') } catch { /* gone */ }
        }
      }
      return pids.length
    }
  } catch {
    return 0
  }
}

export async function portOpen(port: number, timeoutMs = 60_000): Promise<boolean> {
  const net = await import('node:net')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const alive = await new Promise<boolean>(res => {
      const s = net.connect(port, '127.0.0.1')
      s.once('connect', () => { s.destroy(); res(true) })
      s.once('error', () => res(false))
      s.setTimeout(800, () => { s.destroy(); res(false) })
    })
    if (alive) return true
    await new Promise(r => setTimeout(r, 1500))
  }
  return false
}
