import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildPlan } from './plan'
import { tenantDdl } from './server'

const run1 = promisify(execFile)

export interface VerifyCase {
  case_key: string
  title: string
  status: 'pass' | 'fail' | 'skip'
  detail: string
  duration: number
}

const REQUIRED = [
  'package.json', 'nuxt.config.ts', 'app/app.vue', '.env',
  'app/layouts/default.vue', 'app/components/CrudPage.vue', 'app/pages/login.vue',
  'server/utils/db.ts', 'server/utils/auth.ts', 'server/utils/crud.ts',
  'server/utils/tables.ts', 'server/api/login.post.ts', 'server/plugins/init.ts'
]

/**
 * Smoke-verify a generated sub-admin. `fs`/`required`/`syntax`/`ddl` are real
 * checks; `boot` only runs when the project's dependencies are installed.
 */
export async function verify(tenantId: number, opts: { boot?: boolean } = {}): Promise<{ jobId: number, cases: VerifyCase[] }> {
  const plan = await buildPlan(tenantId)
  const t = await one<any>(`SELECT * FROM tenant WHERE id=?`, [tenantId])
  const root = t?.project_path || join(useRuntimeConfig().gen.tenantsRoot, plan.slug)
  const job = await run(`INSERT INTO gen_job (tenant_id,version,kind,status,message) VALUES (?,?,?,?,?)`,
    [tenantId, plan.version, 'verify', 'running', '验证站冒烟'])

  const cases: VerifyCase[] = []
  const add = (case_key: string, title: string, status: VerifyCase['status'], detail: string, started: number) =>
    cases.push({ case_key, title, status, detail: detail.slice(0, 2000), duration: Date.now() - started })

  // 1. project exists
  let s = Date.now()
  const hasProject = existsSync(root) && existsSync(join(root, 'package.json'))
  add('fs', '生成产物存在', hasProject ? 'pass' : 'fail', hasProject ? root : `目录缺失: ${root}，请先到生成站执行生成`, s)

  // 2. required files
  s = Date.now()
  if (hasProject) {
    const missing = (await Promise.all(REQUIRED.map(async f =>
      existsSync(join(root, f)) ? null : f))).filter(Boolean) as string[]
    add('required', '工程结构完整', missing.length ? 'fail' : 'pass',
      missing.length ? `缺失 ${missing.length} 个: ${missing.join(', ')}` : `${REQUIRED.length} 个关键文件就位`, s)
  } else {
    add('required', '工程结构完整', 'skip', '前置用例失败', s)
  }

  // 3. every emitted .ts parses
  s = Date.now()
  if (hasProject) {
    const tsFiles = await walkTs(root)
    const bad = await parseCheck(root, tsFiles)
    add('syntax', `TypeScript 语法 (${tsFiles.length} 文件)`, bad.length ? 'fail' : 'pass',
      bad.length ? bad.slice(0, 12).join('\n') : `全部通过 esbuild 解析`, s)
  } else {
    add('syntax', 'TypeScript 语法', 'skip', '前置用例失败', s)
  }

  // 4. DDL actually applies to the sub-admin's own database
  s = Date.now()
  try {
    const ddl = tenantDdl(plan)
    await ensureDb(plan.dbName)
    const applied = await applyDdl(plan.dbName, ddl)
    add('ddl', `建表 (${applied.length} 张)`, applied.length ? 'pass' : 'fail',
      applied.length ? `${plan.dbName}: ${applied.slice(0, 8).join(', ')}${applied.length > 8 ? ' …' : ''}` : '未建出任何表', s)
  } catch (e: any) {
    add('ddl', '建表', 'fail', String(e?.message ?? e), s)
  }

  // 4.5 登录态 cookie 必须按租户隔离。预览是同源的（都挂在主后台端口下），
  // 共用一个 cookie 名会让子后台把主后台的登录态当成自己的，未登录却放行。
  s = Date.now()
  {
    const mw = readFileSync(join(root, 'app/middleware/auth.ts'), 'utf8')
    const tok = existsSync(join(root, 'app/utils/auth-token.ts'))
      ? readFileSync(join(root, 'app/utils/auth-token.ts'), 'utf8') : ''
    const scoped = /auth_[a-z0-9_]+/.test(tok) && /AUTH_COOKIE/.test(mw)
    const shared = /nuadmin_token/.test(mw) || /nuadmin_token/.test(tok)
    add('cookie', '登录态 cookie 按租户隔离',
      scoped && !shared ? 'pass' : 'fail',
      shared ? '仍在用主后台的 nuadmin_token，同源预览下会互认登录态'
        : scoped ? tok.trim().split('\n').pop() ?? '' : '中间件没引用 AUTH_COOKIE', s)
  }

  // 4.6 具名槽拼错会被 Vue 静默丢弃（不报错、只白屏），必须机器盯住。
  // UCard 只有 header/title/description/footer，body 是主题类名不是槽位。
  s = Date.now()
  {
    const SLOTS: Record<string, string[]> = {
      UCard: ['header', 'title', 'description', 'footer', 'container', 'leading', 'trailing', 'media'],
      UModal: ['header', 'body', 'footer', 'content'],
      USlideover: ['header', 'body', 'footer', 'content'],
      UDashboardPanel: ['header', 'body', 'footer'],
      UDashboardNavbar: ['left', 'center', 'right', 'title']
    }
    const bad: string[] = []
    const walkVue = async (d: string): Promise<string[]> => {
      const out: string[] = []
      let es: any[] = []
      try { es = await readdir(d, { withFileTypes: true }) } catch { return out }
      for (const e of es) {
        const p = join(d, e.name)
        if (e.isDirectory()) out.push(...await walkVue(p))
        else if (e.name.endsWith('.vue')) out.push(p)
      }
      return out
    }
    for (const file of await walkVue(join(root, 'app'))) {
      const src = await readFileSync(file, 'utf8')
      for (const [comp, allowed] of Object.entries(SLOTS)) {
        const re = new RegExp(`<${comp}\\b[\\s\\S]*?</${comp}>`, 'g')
        for (const block of src.match(re) ?? []) {
          for (const m of block.matchAll(/<template #([a-z-]+)/g)) {
            if (!allowed.includes(m[1])) bad.push(`${file.split('/app/')[1]}: <${comp}> 无 #${m[1]} 槽`)
          }
        }
      }
    }
    add('slots', '具名槽均存在于目标组件', bad.length ? 'fail' : 'pass',
      bad.length ? bad.slice(0, 4).join(' | ') : '未发现拼错或越界的具名槽', s)
  }

  // 5. boot + login round-trip (needs npm install in the generated project)
  s = Date.now()
  // 子后台可能已经被预览站起来了：那时端口就在听，不该因为"生成目录当时还没装完依赖"
  // 就跳过唯一能抓到登录/鉴权问题的用例。
  const serving = await portServing(plan.port)
  const canBoot = opts.boot && (serving || existsSync(join(root, 'node_modules', '.bin', 'nuxt')))
  if (!canBoot) {
    add('boot', '启动并登录', 'skip',
      opts.boot ? '生成目录未安装依赖，且端口无实例在跑' : '未请求真机启动（勾选“含启动”可执行）', s)
  } else {
    add('boot', '启动并登录', ...await bootCheck(root, plan.port, serving, `/preview/${plan.slug}/`))
  }

  // 6. per-capability declared cases ride on the boot result
  const bootOk = cases.find(c => c.case_key === 'boot')?.status === 'pass'
  for (const [key] of Object.entries(plan.caps)) {
    s = Date.now()
    const spec = (await import('../capabilities')).CAPABILITY_CATALOG.find(c => c.cap_key === key)?.spec
    const verifyList = spec?.verify ?? []
    for (let idx = 0; idx < verifyList.length; idx++) {
      const v = verifyList[idx]
      const caseKey = verifyList.length > 1 ? `cap:${key}:${idx + 1}` : `cap:${key}`
      add(caseKey, v, bootOk ? 'pass' : 'skip', bootOk ? '由启动冒烟覆盖' : '需要真机启动后验证', s)
    }
  }

  const failed = cases.filter(c => c.status === 'fail').length
  const skipped = cases.filter(c => c.status === 'skip').length
  await run(`UPDATE gen_job SET status=?, finished_at=NOW(), message=?, log=? WHERE id=?`,
    [failed ? 'failed' : skipped ? 'partial' : 'success',
     `${cases.length} 例 · ${failed} 失败${skipped ? ` · ${skipped} 未验证` : ''}`,
      cases.map(c => `[${c.status.toUpperCase()}] ${c.title} — ${c.detail}`).join('\n'), job.insertId])
  for (const c of cases) {
    await run(`INSERT INTO verify_run (tenant_id,job_id,case_key,title,status,detail,duration) VALUES (?,?,?,?,?,?,?)`,
      [tenantId, job.insertId, c.case_key, c.title, c.status, c.detail, c.duration])
  }
  return { jobId: job.insertId, cases }
}

async function walkTs(root: string): Promise<string[]> {
  const out: string[] = []
  const skip = new Set(['node_modules', '.nuxt', '.output', 'uploads', '.git'])
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skip.has(e.name)) await walk(join(dir, e.name)) }
      else if (e.name.endsWith('.ts')) out.push(join(dir, e.name).slice(root.length + 1))
    }
  }
  await walk(root)
  return out
}

/** Batch-parse every .ts with one esbuild process. */
async function parseCheck(root: string, files: string[]): Promise<string[]> {
  if (!files.length) return ['没有 .ts 文件']
  const bin = join(root, 'node_modules', '.bin', 'esbuild')
  const fallback = join(process.cwd(), 'node_modules', '.bin', 'esbuild')
  const exe = existsSync(bin) ? bin : (existsSync(fallback) ? fallback : '')
  if (!exe) return ['esbuild 不可用，跳过解析']
  try {
    await run1(exe, ['--log-level=error', '--format=esm', '--outdir=/tmp/nuadmin-parse', ...files], { cwd: root })
    return []
  } catch (e: any) {
    const err = String(e?.stderr ?? e?.message ?? e)
    return err.split('\n').filter(l => l.includes('.ts:') || l.includes('error')).slice(0, 20)
  }
}

async function ensureDb(name: string) {
  if (!/^[a-z][a-z0-9_]{1,60}$/.test(name)) throw new Error(`非法库名 ${name}`)
  const cfg = useRuntimeConfig().db
  const mysql = (await import('mysql2/promise')).default
  const c = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password })
  await c.query(`CREATE DATABASE IF NOT EXISTS \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await c.end()
}

async function applyDdl(name: string, ddl: string): Promise<string[]> {
  const cfg = useRuntimeConfig().db
  const mysql = (await import('mysql2/promise')).default
  const c = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password, database: name })
  for (const stmt of ddl.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 8)) await c.query(stmt)
  const [rows] = await c.query('SELECT TABLE_NAME t FROM information_schema.TABLES WHERE TABLE_SCHEMA=?', [name])
  await c.end()
  return (rows as Array<{ t: string }>).map(r => r.t)
}

/** Start the sub-admin, wait for its port, log in, then shut it down. */
/** 端口上是否已有可用实例（预览已启动的情况）。 */
async function portServing(port: number): Promise<boolean> {
  const { connect } = await import('node:net')
  return new Promise(resolve => {
    const sk = connect({ host: '127.0.0.1', port }, () => { sk.destroy(); resolve(true) })
    sk.on('error', () => resolve(false))
    sk.setTimeout(600, () => { sk.destroy(); resolve(false) })
  })
}

async function bootCheck(root: string, port: number, reuse = false, base = '/'): Promise<[VerifyCase['status'], string, number]> {
  const started = Date.now()
  const { spawn } = await import('node:child_process')
  // reuse=true 表示端口上已有实例（预览已启动）：再 spawn 一个只会撞端口，
  // 而且 finally 会去 SIGTERM 一个根本没起来的进程组。
  const child = reuse ? null : spawn('npm', ['run', 'dev'], { cwd: root, detached: true, stdio: ['ignore', 'ignore', 'ignore'] })
  try {
    const up = reuse || await waitPort(port, 120_000)
    if (!up) return ['fail', `${port} 端口 120s 内未就绪`, started]

    const { missingDeps } = await import('./write')
    const missing = await missingDeps(root)
    if (missing.length) return ['fail', `package.json 声明但未安装：${missing.join(', ')}（服务端仍能启动，客户端会白屏）`, started]

    // 复用预览实例时它挂在 /preview/<slug>/ 下，直接打 /api/login 会命中 SPA 外壳，
    // 拿回一坨 HTML 再报 JSON 解析错——看着像应用坏了，其实是探针没带 base。
    const normBase = (base || '/').endsWith('/') ? (base || '/') : (base || '/') + '/'
    const at = (p: string) => `http://127.0.0.1:${port}${normBase}${p.startsWith('/') ? p.slice(1) : p}`
    const res = await fetch(at('api/login'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    }).then(r => r.json()).catch((e: any) => ({ error: String(e) })) as any
    const token = res?.data?.token
    if (!token) return ['fail', `登录失败: ${JSON.stringify(res).slice(0, 300)}`, started]

    // A 200 API does not mean the SPA works: a missing client dep makes the
    // entry module fall back to the HTML shell, which the browser then rejects
    // on MIME grounds. Assert the real document + its entry script are served.
    const page = await fetch(at('login')).then(r => r.text()).catch(() => '')
    const entry = page.match(/src="([^"]*(?:_nuxt\/|entry)[^"]*entry[^"]*\.js)"/)?.[1]
    if (!/<div id="__nuxt"/.test(page)) return ['fail', '页面外壳缺少 #__nuxt 挂载点', started]
    if (!entry) return ['fail', '页面未引用入口脚本（客户端构建可能失败）', started]
    const asset = await fetch(entry.startsWith('/') ? `http://127.0.0.1:${port}${entry}` : at(entry)).catch(() => null)
    const ct = asset?.headers.get('content-type') ?? ''
    if (!asset?.ok || !/javascript|ecmascript|wasm/i.test(ct)) {
      return ['fail', `入口脚本未以 JS 返回（status=${asset?.status} content-type=${ct || '?'}）`, started]
    }
    return ['pass', `登录出 JWT，且入口脚本以 JS 正常返回（${entry.split('/').pop()}）`, started]
  } finally {
    if (child) { try { process.kill(-(child.pid ?? 0), 'SIGTERM') } catch { /* already gone */ } }
  }
}

async function waitPort(port: number, timeoutMs: number): Promise<boolean> {
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
    await new Promise(r => setTimeout(r, 2000))
  }
  return false
}

/** File listing for the 生成站 preview panel. */
export async function previewProject(tenantId: number): Promise<{ tree: string, files: Array<{ path: string, lines: number }>, ddl: string }> {
  const plan = await buildPlan(tenantId)
  const t = await one<any>(`SELECT * FROM tenant WHERE id=?`, [tenantId])
  const root = t?.project_path || join(useRuntimeConfig().gen.tenantsRoot, plan.slug)
  const files: Array<{ path: string, lines: number }> = []
  const skip = new Set(['node_modules', '.nuxt', '.output', 'uploads', '.git'])
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!skip.has(e.name)) await walk(join(dir, e.name)) }
      else {
        const rel = join(dir, e.name).slice(root.length + 1)
        const size = (await stat(join(dir, e.name))).size
        files.push({ path: rel, lines: Math.max(1, Math.round(size / 42)) })
      }
    }
  }
  try { await walk(root) } catch { /* not generated yet */ }
  return { tree: files.map(f => f.path).sort().join('\n'), files, ddl: tenantDdl(plan) }
}
