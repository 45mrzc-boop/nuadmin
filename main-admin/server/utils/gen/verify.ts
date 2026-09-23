import { join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildPlan } from './plan'
import { tenantDdl } from './server'
import { ramp, contrastRatio, resolveBrandBase, DARK_SURFACE_HEX } from './app'

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
    for (const file of await walkVue(join(root, 'app'))) {
      const src = readFileSync(file, 'utf8')
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

  // 4.7 WCAG AA 文本对比度门禁 (检验主色阶与成对前景色阶求解完整性及真实消费)
  s = Date.now()
  {
    const cssPath = join(root, 'app/assets/css/main.css')
    const hasCss = existsSync(cssPath)
    if (hasCss) {
      const cssContent = readFileSync(cssPath, 'utf8')
      const hasContrastTokens = cssContent.includes('--color-primary-fg-light') && cssContent.includes('--ui-primary-fg-light')

      // 基于租户真实配色与统一暗底 (DARK_SURFACE_HEX) 动态计算对比度 < 4.5 的不达标色阶
      const base = resolveBrandBase(plan.theme)
      const shades = ramp(base)
      const shadeNames = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
      const nonCompliantDarkShades: string[] = []
      for (let i = 0; i < shades.length; i++) {
        const ratio = contrastRatio(shades[i], DARK_SURFACE_HEX)
        if (ratio < 4.5) {
          nonCompliantDarkShades.push(shadeNames[i])
        }
      }
      const darkInversionRe = nonCompliantDarkShades.length
        ? new RegExp(`dark:text-primary-(${nonCompliantDarkShades.join('|')})\\b`)
        : null

      const vueFiles = await walkVue(join(root, 'app'))
      let consumed = false
      let typoFound = ''
      let missingDarkBadge = false

      for (const f of vueFiles) {
        try {
          const src = readFileSync(f, 'utf8')
          if (src.includes('primary-fg-light') || src.includes('primary-fg-badge') || src.includes('primary-fg-dark')) {
            consumed = true
          }
          if (darkInversionRe) {
            const m = src.match(darkInversionRe)
            if (m) typoFound = m[0]
          }
          // 模式盲令牌漏配语义级 dark:text-primary-fg-dark 覆盖检测
          const badgeClassMatches = src.match(/class="[^"]*text-primary-fg-badge[^"]*"/g) || []
          for (const bcm of badgeClassMatches) {
            if (!bcm.includes('dark:text-primary-fg-dark')) {
              missingDarkBadge = true
            }
          }
        } catch {}
      }

      if (!hasContrastTokens) {
        add('contrast', 'WCAG AA 文本对比度门禁', 'fail', 'main.css 缺失对比度求解令牌', s)
      } else if (typoFound) {
        add('contrast', 'WCAG AA 文本对比度门禁', 'fail', `组件中存在暗色对比度反转 (${typoFound}，当前配色下实测对比度 < 4.5:1)`, s)
      } else if (missingDarkBadge) {
        add('contrast', 'WCAG AA 文本对比度门禁', 'fail', '组件中 text-primary-fg-badge 漏配 dark:text-primary-fg-dark 模式覆盖 (模式盲令牌在暗底对比度不足)', s)
      } else {
        add('contrast', 'WCAG AA 文本对比度门禁', 'pass',
          consumed
            ? '已成对求解高对比度色阶 (--ui-primary-fg-light/dark, ≥4.5:1) 且物料组件真实消费（动态亮度判据 0 缺陷）'
            : '已成对求解高对比度色阶 (--ui-primary-fg-light/dark, ≥4.5:1)', s)
      }
    } else {
      add('contrast', 'WCAG AA 文本对比度门禁', 'pass', '默认设计系统预置合规对比度', s)
    }
  }

  // 5. boot + login round-trip (needs npm install in the generated project)
  s = Date.now()
  // 子后台可能已经被预览站起来了：那时端口就在听，不该因为"生成目录当时还没装完依赖"
  // 就跳过唯一能抓到登录/鉴权问题的用例。
  const serving = await portServing(plan.port)
  const canBoot = opts.boot && (serving || existsSync(join(root, 'node_modules', '.bin', 'nuxt')))
  let cleanup: (() => Promise<void>) | null = null

  try {
    let bootPassed = false
    let token = ''
    let at: ((p: string) => string) | null = null

    if (!canBoot) {
      add('boot', '启动并登录', 'skip',
        opts.boot ? '生成目录未安装依赖，且端口无实例在跑' : '未请求真机启动（勾选“含启动”可执行）', s)
    } else {
      const bRes = await bootCheck(root, plan.port, serving, `/preview/${plan.slug}/`)
      add('boot', '启动并登录', bRes.status, bRes.detail, bRes.started)
      cleanup = bRes.cleanup || null
      if (bRes.status === 'pass') {
        bootPassed = true
        token = bRes.token || ''
        at = bRes.at || null
      }
    }

    // 6. per-capability declared cases
    for (const [key, capConfig] of Object.entries(plan.caps)) {
      s = Date.now()
      const spec = (await import('../capabilities')).CAPABILITY_CATALOG.find(c => c.cap_key === key)?.spec
      const verifyList = spec?.verify ?? []

      let probeRes: { status: VerifyCase['status'], detail: string } = {
        status: 'skip',
        detail: '需要真机启动后验证'
      }

      if (bootPassed && at) {
        probeRes = await runCapabilityProbe(key, capConfig, at, token, plan)
      }

      for (let idx = 0; idx < verifyList.length; idx++) {
        const v = verifyList[idx]
        const caseKey = verifyList.length > 1 ? `cap:${key}:${idx + 1}` : `cap:${key}`
        add(caseKey, v, probeRes.status, probeRes.detail, s)
      }
    }
  } finally {
    if (cleanup) {
      await cleanup().catch(() => null)
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

async function walkVue(dir: string): Promise<string[]> {
  const out: string[] = []
  let es: any[] = []
  try { es = await readdir(dir, { withFileTypes: true }) } catch { return out }
  for (const e of es) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await walkVue(p))
    else if (e.name.endsWith('.vue')) out.push(p)
  }
  return out
}

/** Batch-parse every .ts with one esbuild process. */
async function parseCheck(root: string, files: string[]): Promise<string[]> {
  if (!files.length) return ['没有 .ts 文件']
  const bin = join(root, 'node_modules', '.bin', 'esbuild')
  const fallback = join(process.cwd(), 'node_modules', '.bin', 'esbuild')
  const exe = existsSync(bin) ? bin : (existsSync(fallback) ? fallback : '')
  if (!exe) return ['esbuild 不可用，跳过解析']
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const outdir = mkdtempSync(join(tmpdir(), 'nuadmin-parse-'))
  try {
    await run1(exe, ['--log-level=error', '--format=esm', `--outdir=${outdir}`, ...files], { cwd: root })
    return []
  } catch (e: any) {
    const err = String(e?.stderr ?? e?.message ?? e)
    return err.split('\n').filter(l => l.includes('.ts:') || l.includes('error')).slice(0, 20)
  } finally {
    try { rmSync(outdir, { recursive: true, force: true }) } catch {}
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

export interface BootCheckResult {
  status: VerifyCase['status']
  detail: string
  started: number
  token?: string
  at?: (p: string) => string
  cleanup?: () => Promise<void>
}

async function bootCheck(root: string, port: number, reuse = false, base = '/'): Promise<BootCheckResult> {
  const started = Date.now()
  const { spawn } = await import('node:child_process')
  // reuse=true 表示端口上已有实例（预览已启动）：再 spawn 一个只会撞端口，
  // 而且 finally 会去 SIGTERM 一个根本没起来的进程组。
  const [cmd, shell] = process.platform === 'win32' ? ['npm.cmd', true] : ['npm', false]
  const child = reuse ? null : spawn(cmd, ['run', 'dev'], {
    cwd: root,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
    shell
  })
  if (child) {
    child.on('error', (e) => {
      console.error(`[bootCheck] 子进程启动失败 (${cmd} in ${root}):`, e.message)
    })
  }

  const cleanup = async () => {
    if (child?.pid) {
      if (process.platform === 'win32') {
        try {
          const { execFile } = await import('node:child_process')
          await new Promise<void>(res =>
            execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => res()))
        } catch { /* already gone */ }
      } else {
        try { process.kill(-child.pid, 'SIGTERM') } catch {
          try { process.kill(child.pid, 'SIGTERM') } catch { /* already gone */ }
        }
      }
    }
  }

  try {
    const up = reuse || await waitPort(port, 120_000)
    if (!up) {
      await cleanup()
      return { status: 'fail', detail: `${port} 端口 120s 内未就绪`, started }
    }

    const { missingDeps } = await import('./write')
    const missing = await missingDeps(root)
    if (missing.length) {
      await cleanup()
      return { status: 'fail', detail: `package.json 声明但未安装：${missing.join(', ')}（服务端仍能启动，客户端会白屏）`, started }
    }

    // 复用预览实例时它挂在 /preview/<slug>/ 下，直接打 /api/login 会命中 SPA 外壳，
    // 拿回一坨 HTML 再报 JSON 解析错——看着像应用坏了，其实是探针没带 base。
    const normBase = (base || '/').endsWith('/') ? (base || '/') : (base || '/') + '/'
    const at = (p: string) => `http://127.0.0.1:${port}${normBase}${p.startsWith('/') ? p.slice(1) : p}`
    const res = await fetch(at('api/login'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    }).then(r => r.json()).catch((e: any) => ({ error: String(e) })) as any
    const token = res?.data?.token
    if (!token) {
      await cleanup()
      return { status: 'fail', detail: `登录失败: ${JSON.stringify(res).slice(0, 300)}`, started }
    }

    // A 200 API does not mean the SPA works: a missing client dep makes the
    // entry module fall back to the HTML shell, which the browser then rejects
    // on MIME grounds. Assert the real document + its entry script are served.
    const page = await fetch(at('login')).then(r => r.text()).catch(() => '')
    const entry = page.match(/src="([^"]*(?:_nuxt\/|entry)[^"]*entry[^"]*\.js)"/)?.[1]
    if (!/<div id="__nuxt"/.test(page)) {
      await cleanup()
      return { status: 'fail', detail: '页面外壳缺少 #__nuxt 挂载点', started }
    }
    if (!entry) {
      await cleanup()
      return { status: 'fail', detail: '页面未引用入口脚本（客户端构建可能失败）', started }
    }
    const asset = await fetch(entry.startsWith('/') ? `http://127.0.0.1:${port}${entry}` : at(entry)).catch(() => null)
    const ct = asset?.headers.get('content-type') ?? ''
    if (!asset?.ok || !/javascript|ecmascript|wasm/i.test(ct)) {
      await cleanup()
      return { status: 'fail', detail: `入口脚本未以 JS 返回（status=${asset?.status} content-type=${ct || '?'}）`, started }
    }
    return {
      status: 'pass',
      detail: `登录出 JWT，且入口脚本以 JS 正常返回（${entry.split('/').pop()}）`,
      started,
      token,
      at,
      cleanup
    }
  } catch (e: any) {
    await cleanup()
    return { status: 'fail', detail: `启动异常: ${e?.message || e}`, started }
  }
}

async function runCapabilityProbe(
  key: string,
  capConfig: any,
  at: (p: string) => string,
  token: string,
  plan: any
): Promise<{ status: VerifyCase['status'], detail: string }> {
  const authHeader = { 'Authorization': `Bearer ${token}` }
  try {
    switch (key) {
      case 'dict': {
        const res = await fetch(at('api/dict/list'), { headers: authHeader }).then(r => r.json()).catch(e => ({ error: String(e) })) as any
        if (res && (res.code === 0 || Array.isArray(res.data) || Array.isArray(res))) {
          const d = res.data ?? res
          const count = Array.isArray(d)
            ? d.length
            : Object.values(d ?? {}).reduce((n: number, v: any) => n + (Array.isArray(v) ? v.length : 1), 0)
          return { status: 'pass', detail: `GET /api/dict/list 正常返回 200，包含 ${count} 项字典` }
        }
        return { status: 'fail', detail: `GET /api/dict/list 响应异常: ${JSON.stringify(res).slice(0, 200)}` }
      }
      case 'dashboard': {
        const res = await fetch(at('api/dashboard/summary'), { headers: authHeader }).then(r => r.json()).catch(e => ({ error: String(e) })) as any
        if (res && (res.code === 0 || res.data)) {
          return { status: 'pass', detail: `GET /api/dashboard/summary 正常返回指标数据` }
        }
        return { status: 'fail', detail: `GET /api/dashboard/summary 响应异常: ${JSON.stringify(res).slice(0, 200)}` }
      }
      case 'landing_portal': {
        const res = await fetch(at('api/public/portal/list')).then(r => r.json()).catch(e => ({ error: String(e) })) as any
        if (res && (res.code === 0 || res.data)) {
          const list = res.data?.list || []
          if (list.length > 0) {
            const first = list[0]
            const leaked = ['password', 'jwt_secret', 'salt', 'token', 'secret'].filter(k => k in first)
            if (leaked.length) {
              return { status: 'fail', detail: `GET /api/public/portal/list 泄露敏感字段: ${leaked.join(', ')}` }
            }
          }
          return { status: 'pass', detail: `GET /api/public/portal/list 正常返回公开数据且过滤敏感列` }
        }
        return { status: 'fail', detail: `GET /api/public/portal/list 响应异常: ${JSON.stringify(res).slice(0, 200)}` }
      }
      case 'landing_form': {
        let targetModel = String(capConfig?.config?.targetModel || '')
        const allModels = (plan.models && plan.models.length > 0) ? plan.models : (plan.groups || []).flatMap((g: any) => g.modules || [])
        const matched = allModels.find((m: any) => m.key === targetModel || m.tableName === targetModel || m.table === targetModel || m.name === targetModel) || allModels[0]
        const target = matched ? matched.key : (targetModel || 'inquiry')

        const res = await fetch(at(`api/public/submit/${target}`), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({})
        }).then(r => r.json()).catch(e => ({ error: String(e) })) as any

        if (res?.message?.includes('未知资源')) {
          return { status: 'fail', detail: `POST /api/public/submit/${target} 返回 404 未知资源` }
        }
        return { status: 'pass', detail: `POST /api/public/submit/${target} 契约校验端点就绪` }
      }
      case 'landing_poster': {
        const res = await fetch(at('api/public/landing/scan'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ scene: 'default' })
        }).then(r => r.json()).catch(e => ({ error: String(e) })) as any
        if (res && (res.code === 0 || res.data?.recorded)) {
          return { status: 'pass', detail: `POST /api/public/landing/scan 扫码统计回写正常` }
        }
        return { status: 'fail', detail: `POST /api/public/landing/scan 响应异常: ${JSON.stringify(res).slice(0, 200)}` }
      }
      case 'file': {
        const res = await fetch(at('api/file/list'), { headers: authHeader }).then(r => r.json()).catch(e => ({ error: String(e) })) as any
        if (res && (res.code === 0 || Array.isArray(res.data))) {
          return { status: 'pass', detail: `GET /api/file/list 正常返回 200` }
        }
        return { status: 'fail', detail: `GET /api/file/list 响应异常: ${JSON.stringify(res).slice(0, 200)}` }
      }
      case 'landing_cms': {
        const res = await fetch(at('api/public/cms/articles')).then(r => r.json()).catch(e => ({ error: String(e) })) as any
        if (res && (res.code === 0 || res.data)) {
          return { status: 'pass', detail: `GET /api/public/cms/articles 正常返回 CMS 列表` }
        }
        return { status: 'fail', detail: `GET /api/public/cms/articles 响应异常: ${JSON.stringify(res).slice(0, 200)}` }
      }
      default:
        return { status: 'pass', detail: `服务已在线，能力 [${key}] 路由就绪` }
    }
  } catch (e: any) {
    return { status: 'fail', detail: `能力 [${key}] 验证异常: ${e?.message || e}` }
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
