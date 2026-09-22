#!/usr/bin/env node
import readline from 'node:readline'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import net from 'node:net'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(ROOT, 'main-admin/package.json'))
let mysql = null
try {
  mysql = require('mysql2/promise')
} catch (e) {
  // lazy loaded on db tool calls if needed
}

const MAIN_URL = process.env.MAIN_URL || 'http://127.0.0.1:10000'
let adminToken = ''

async function getAdminToken() {
  if (adminToken) return adminToken
  try {
    const res = await fetch(`${MAIN_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    })
    const json = await res.json()
    if (json.code === 0 && json.data?.token) {
      adminToken = json.data.token
      return adminToken
    }
  } catch (e) {
    // fallback or rethrow
  }
  return adminToken
}

async function api(path, opts = {}) {
  const token = await getAdminToken()
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  const timeoutMs = opts.timeout || 30_000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${MAIN_URL}${path}`, {
      ...opts,
      signal: controller.signal,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    })
    const text = await res.text()
    try {
      const json = JSON.parse(text)
      if (!res.ok || json.code !== 0) {
        throw new Error(`API ${path} failed (${res.status}): ${json.message || text}`)
      }
      return json.data
    } catch (e) {
      if (e.message.startsWith('API ')) throw e
      throw new Error(`API ${path} invalid JSON (${res.status}): ${text.slice(0, 300)}`)
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`控制面请求超时 (${timeoutMs}ms): ${MAIN_URL}${path}，请检查 main-admin 是否存活（GET /api/health）`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

async function resolveTenant(args = {}) {
  let tid = args.tenantId
  let slug = args.slug
  if (!tid && !slug) {
    throw new Error('必须提供 tenantId 或 slug')
  }
  const raw = await api('/api/tenant').catch(() => [])
  const tenants = Array.isArray(raw) ? raw : (raw?.list || [])
  let found = null
  if (tid) {
    found = tenants.find(t => String(t.id) === String(tid) || t.slug === String(tid))
  }
  if (!found && slug) {
    found = tenants.find(t => t.slug === slug || String(t.id) === String(slug))
  }
  if (found) {
    return found
  }
  if (slug) {
    return { id: tid || null, slug, name: slug, port: null }
  }
  throw new Error(`找不到 ID 为 ${tid} 的租户`)
}

async function resolveModule(args = {}) {
  let modId = args.moduleId
  if (modId) return { id: Number(modId) }
  const modKey = args.moduleKey || args.key || args.module || args.name
  if (!modKey) return null
  let tid = args.tenantId
  if (!tid && args.slug) {
    const t = await resolveTenant(args).catch(() => null)
    if (t?.id) tid = t.id
  }
  if (!tid) return null
  const mListRaw = await api(`/api/module?tenantId=${tid}`).catch(() => [])
  const mList = Array.isArray(mListRaw) ? mListRaw : (mListRaw?.list || [])
  const found = mList.find(m =>
    m.key === modKey ||
    m.tableName === modKey ||
    m.table === modKey ||
    m.name === modKey ||
    m.res_key === modKey ||
    m.table_name === modKey ||
    m.resKey === modKey
  )
  return found || null
}

async function resolveField(args = {}) {
  let fid = args.fieldId
  if (fid) return { id: Number(fid) }
  const colKey = args.colKey || args.key || args.col_key || args.name
  if (!colKey) return null
  const mod = await resolveModule(args)
  if (!mod?.id) return null
  const fListRaw = await api(`/api/module/${mod.id}`).catch(() => null)
  const fields = fListRaw?.fields || []
  const found = fields.find(f => f.colKey === colKey || f.key === colKey || f.col_key === colKey || f.name === colKey)
  return found || null
}

function loadMainAdminDbConfig() {
  const envPath = process.env.MAIN_ADMIN_ENV || join(ROOT, 'main-admin/.env')
  const config = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'nuadmin',
    envPath
  }

  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim()
        const v = trimmed.slice(idx + 1).trim()
        if (k === 'DB_HOST' && !process.env.DB_HOST) config.host = v
        if (k === 'DB_PORT' && !process.env.DB_PORT) config.port = Number(v)
        if (k === 'DB_USER' && !process.env.DB_USER) config.user = v
        if (k === 'DB_PASS' && !process.env.DB_PASS) config.password = v
        if (k === 'DB_NAME' && !process.env.DB_NAME) config.database = v
      }
    }
  }

  return config
}

function getTenantDbConfig(slug) {
  const base = loadMainAdminDbConfig()
  let host = base.host
  let port = base.port
  let user = base.user
  let password = base.password
  let database = slug ? `nuadmin_t_${slug}` : base.database

  if (slug) {
    const envPath = join(ROOT, 'tenants', slug, '.env')
    if (existsSync(envPath)) {
      const raw = readFileSync(envPath, 'utf-8')
      for (const line of raw.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const idx = trimmed.indexOf('=')
        if (idx > 0) {
          const k = trimmed.slice(0, idx).trim()
          const v = trimmed.slice(idx + 1).trim()
          if (k === 'DB_HOST') host = v
          if (k === 'DB_PORT') port = Number(v)
          if (k === 'DB_USER') user = v
          if (k === 'DB_PASS') password = v
          if (k === 'DB_NAME') database = v
        }
      }
    }
  }

  return {
    host,
    port,
    user,
    password,
    database,
    connectionUri: `mysql://${user}:${password}@${host}:${port}/${database}`
  }
}

async function queryTenantDb(slug, sql, params = []) {
  if (!mysql) mysql = require('mysql2/promise')
  const cfg = getTenantDbConfig(slug)
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database
  })
  try {
    const [rows, fields] = await conn.execute(sql, params)
    return {
      success: true,
      slug,
      database: cfg.database,
      count: Array.isArray(rows) ? rows.length : undefined,
      columns: fields ? fields.map(f => f.name) : [],
      rows
    }
  } finally {
    await conn.end().catch(() => {})
  }
}

async function executeTenantDb(slug, sql, params = []) {
  if (!mysql) mysql = require('mysql2/promise')
  const cfg = getTenantDbConfig(slug)
  const conn = await mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database
  })
  try {
    const [result] = await conn.execute(sql, params)
    return {
      success: true,
      slug,
      database: cfg.database,
      affectedRows: result.affectedRows,
      insertId: result.insertId,
      warningStatus: result.warningStatus,
      changedRows: result.changedRows
    }
  } finally {
    await conn.end().catch(() => {})
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => resolve(p))
    })
    s.on('error', reject)
  })
}

function resolveBrowser() {
  const fromEnv = process.env.CHROME_PATH || process.env.CHROMIUM_PATH
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const win = process.platform === 'win32'
  const names = win
    ? ['chrome.exe', 'msedge.exe', 'chromium.exe']
    : ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']

  const dirs = String(process.env.PATH || '').split(win ? ';' : ':').filter(Boolean)
  for (const name of names) {
    for (const dir of dirs) {
      const p = join(dir, name)
      if (existsSync(p)) return p
    }
  }
  if (win) {
    for (const p of [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
    ]) if (p && existsSync(p)) return p
  }
  return ''
}

async function takeTenantScreenshot(opts = {}) {
  const tenant = await resolveTenant(opts)
  const slug = tenant.slug
  const relPath = opts.path || '/'
  const autoLogin = opts.autoLogin !== false
  const width = Number(opts.width) || 1280
  const height = Number(opts.height) || 800
  const waitMs = Math.min(Number(opts.waitMs) || 12000, 30000)

  // Ensure tenant service is running
  if (tenant.id) {
    try {
      const st = await api(`/api/tenant/${tenant.id}/status`)
      if (!st.running) {
        await api(`/api/tenant/${tenant.id}/start`, { method: 'POST' })
        await new Promise(r => setTimeout(r, 2000))
      }
    } catch (e) {}
  }

  // Auto login if requested
  let token = ''
  if (autoLogin) {
    try {
      const loginRes = await fetch(`${MAIN_URL}/preview/${slug}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
      }).then(r => r.json())
      if (loginRes.code === 0 && loginRes.data?.token) {
        token = loginRes.data.token
      }
    } catch (e) {}
  }

  const browser = resolveBrowser()
  if (!browser) throw new Error('未找到 Chromium 内核浏览器，请安装或用 CHROME_PATH 指定')

  const udd = mkdtempSync(join(tmpdir(), 'genplus-shot-'))
  const cdpPort = await getFreePort()
  const chromeArgs = [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${cdpPort}`,
    `--window-size=${width},${height}`,
    '--hide-scrollbars',
    `--user-data-dir=${udd}`
  ]
  if (process.getuid && process.getuid() === 0) {
    chromeArgs.push('--no-zygote')
  }

  const chrome = spawn(browser, chromeArgs)
  let chromeErr = null
  chrome.on('error', (e) => {
    chromeErr = e
  })

  try {
    let wsUrl = null
    for (let i = 0; i < 30; i++) {
      if (chromeErr) break
      try {
        const v = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then(r => r.json())
        if (v.webSocketDebuggerUrl) {
          const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new`, { method: 'PUT' }).then(r => r.json())
          wsUrl = target.webSocketDebuggerUrl
          break
        }
      } catch (e) {}
      await new Promise(r => setTimeout(r, 100))
    }
    if (chromeErr) throw new Error(`浏览器启动失败（${browser}）：${chromeErr.message}`)
    if (!wsUrl) throw new Error(`无法连接到 Chromium CDP 调试端口（浏览器: ${browser}）`)

    const ws = new WebSocket(wsUrl)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })

    let id = 1
    const sendCDP = (method, params = {}) => new Promise((resolve) => {
      const reqId = id++
      const handler = (evt) => {
        const d = JSON.parse(evt.data)
        if (d.id === reqId) {
          ws.removeEventListener('message', handler)
          resolve(d.result)
        }
      }
      ws.addEventListener('message', handler)
      ws.send(JSON.stringify({ id: reqId, method, params }))
    })

    await sendCDP('Page.enable')
    await sendCDP('Runtime.enable')
    await sendCDP('Network.enable')

    if (token) {
      const ck = await sendCDP('Network.setCookie', {
        name: `auth_${slug}`,
        value: token,
        domain: '127.0.0.1',
        path: '/'
      })
      if (!ck?.success) {
        console.warn(`[genplus_take_screenshot] 凭证注入提示: Network.setCookie 返回 success: false`)
      }
      await sendCDP('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          document.cookie = "auth_${slug}=${token}; path=/";
          try {
            localStorage.setItem("auth_${slug}", "${token}");
          } catch(e) {}
        `
      })
    }

    await sendCDP('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    })

    const normPath = relPath.startsWith('/') ? relPath : '/' + relPath
    const targetUrl = `${MAIN_URL}/preview/${slug}${normPath}`
    await sendCDP('Page.navigate', { url: targetUrl })

    const startTime = Date.now()
    while (Date.now() - startTime < waitMs) {
      await new Promise(r => setTimeout(r, 300))
      const evalRes = await sendCDP('Runtime.evaluate', {
        expression: `(() => {
          const bodyText = document.body?.innerText || '';
          const hasSpinner = document.querySelector('.animate-spin') !== null || bodyText.includes('正在生成') || bodyText.includes('加载中...');
          const hasTable = document.querySelector('table') !== null || document.querySelector('.tbl') !== null;
          const hasForm = document.querySelector('form') !== null;
          const hasLayout = document.querySelector('.app-layout') !== null;
          const hasCard = document.querySelector('main') !== null && bodyText.length > 100;
          return {
            title: document.title,
            url: window.location.href,
            textLen: bodyText.length,
            ready: !hasSpinner && (hasTable || hasForm || hasLayout || hasCard)
          };
        })()`,
        returnByValue: true
      })
      if (evalRes?.result?.value?.ready) {
        break
      }
    }

    // Additional settling time for CSS/UI animation
    await new Promise(r => setTimeout(r, 800))

    const shot = await sendCDP('Page.captureScreenshot', { format: 'png' })
    const buf = Buffer.from(shot.data, 'base64')

    const cleanPath = normPath.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'root'
    const fileName = `${slug}_${cleanPath}_${Date.now()}.png`
    const shotDir = join(ROOT, 'screenshots')
    if (!existsSync(shotDir)) mkdirSync(shotDir, { recursive: true })
    const filePath = join(shotDir, fileName)
    writeFileSync(filePath, buf)

    // Also copy to assistant brain artifacts directory if present
    const brainDir = process.env.BRAIN_DIR || ''
    let artifactPath = null
    if (brainDir && existsSync(brainDir)) {
      artifactPath = join(brainDir, fileName)
      try {
        writeFileSync(artifactPath, buf)
      } catch (e) {}
    }

    const info = await sendCDP('Runtime.evaluate', {
      expression: `({ title: document.title, url: window.location.href })`,
      returnByValue: true
    })

    ws.close()

    const currentUrl = info?.result?.value?.url || targetUrl
    const isUnwantedLogin = autoLogin && !normPath.startsWith('/login') && currentUrl.includes('/login')

    return {
      success: !isUnwantedLogin,
      warning: isUnwantedLogin ? '页面重定向回登录页（可能凭证失效、模式变更或服务未就绪），未捕获到目标业务页' : undefined,
      slug,
      path: normPath,
      targetUrl,
      pageTitle: info?.result?.value?.title || '',
      currentUrl,
      filePath,
      artifactUrl: artifactPath ? `file://${artifactPath}` : `file://${filePath}`,
      fileSize: buf.length,
      width,
      height,
      waitedMs: Date.now() - startTime
    }
  } finally {
    try {
      chrome.kill()
      if (process.platform === 'win32') {
        const { execFile } = await import('node:child_process')
        await new Promise(r => execFile('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], () => r()))
      }
    } catch (e) {}
    try {
      rmSync(udd, { recursive: true, force: true })
    } catch (e) {}
  }
}

async function createPublicLanding(opts = {}) {
  const tenant = await resolveTenant(opts)
  const slug = tenant.slug
  const tenantDir = join(ROOT, 'tenants', slug)
  if (!existsSync(tenantDir)) {
    throw new Error(`租户目录不存在: ${tenantDir}`)
  }

  const landingType = opts.landingType || 'qrcode_channel'
  const routePath = opts.routePath || '/p/[scene]'
  const title = opts.title || (tenant.name ? `${tenant.name} - 推广通道` : '官方公众号推广通道')

  const createdFiles = []

  if (landingType === 'qrcode_channel') {
    // 1. Ensure node_modules/qrcode exists
    const nmTenantQrcode = join(tenantDir, 'node_modules', 'qrcode')
    if (!existsSync(nmTenantQrcode)) {
      const nmTenant = join(tenantDir, 'node_modules')
      const nmMain = join(ROOT, 'main-admin/node_modules')
      if (!existsSync(nmTenant)) {
        try {
          const fs = await import('node:fs')
          fs.symlinkSync(nmMain, nmTenant, 'junction')
        } catch (e) {}
      }
    }

    // 2. server/api/public/channel/[scene].get.ts
    const channelApiDir = join(tenantDir, 'server/api/public/channel')
    mkdirSync(channelApiDir, { recursive: true })
    const channelApiFile = join(channelApiDir, '[scene].get.ts')
    if (!existsSync(channelApiFile)) {
      const channelApiCode = `import QRCode from 'qrcode'

export default defineEventHandler(async (event) => {
  const scene = getRouterParam(event, 'scene')
  if (!scene) {
    throw createError({ statusCode: 400, message: '必须指定渠道标识' })
  }

  let row = await one<any>('SELECT * FROM mp_channel_qrcode WHERE scene_str = ? LIMIT 1', [scene])
  if (!row && /^\\d+$/.test(scene)) {
    row = await one<any>('SELECT * FROM mp_channel_qrcode WHERE id = ? LIMIT 1', [Number(scene)])
  }

  if (!row) {
    throw createError({ statusCode: 404, message: '未找到该渠道二维码' })
  }

  const targetUrl = \`https://weixin.qq.com/q/scan?scene=\${encodeURIComponent(row.scene_str)}\`
  let qrDataUrl = ''
  try {
    qrDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 280,
      color: { dark: '#07c160', light: '#ffffff' }
    })
  } catch (err: any) {
    qrDataUrl = ''
  }

  return {
    code: 0,
    message: 'ok',
    data: {
      id: row.id,
      channel_name: row.channel_name,
      scene_str: row.scene_str,
      qr_type: row.qr_type,
      status: row.status,
      welcome_msg: row.welcome_msg,
      scan_count: row.scan_count || 0,
      follow_count: row.follow_count || 0,
      auto_tag: row.auto_tag,
      created_at: row.created_at,
      qr_image: qrDataUrl,
      target_url: targetUrl
    }
  }
})
`
      writeFileSync(channelApiFile, channelApiCode, 'utf-8')
      createdFiles.push(channelApiFile)
    }

    // 3. server/api/public/scan.post.ts
    const scanApiDir = join(tenantDir, 'server/api/public')
    mkdirSync(scanApiDir, { recursive: true })
    const scanApiFile = join(scanApiDir, 'scan.post.ts')
    if (!existsSync(scanApiFile)) {
      const scanApiCode = `export default defineEventHandler(async (event) => {
  const body = await readBody<{
    scene_str: string
    openid?: string
    nickname?: string
    location?: string
  }>(event)

  if (!body?.scene_str) {
    throw createError({ statusCode: 400, message: 'scene_str 不能为空' })
  }

  const channel = await one<any>('SELECT * FROM mp_channel_qrcode WHERE scene_str = ? LIMIT 1', [body.scene_str])
  if (!channel) {
    throw createError({ statusCode: 404, message: '未找到渠道记录' })
  }

  const fakeOpenid = body.openid || 'oWxSim' + Math.random().toString(36).substring(2, 10)
  const fakeNickname = body.nickname || '微信用户_' + Math.floor(1000 + Math.random() * 9000)
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ')

  await run(
    \`INSERT INTO mp_scan_log (scene_str, openid, nickname, is_new_follow, scan_time, location, auto_tagged)
     VALUES (?, ?, ?, 1, ?, ?, ?)\`,
    [body.scene_str, fakeOpenid, fakeNickname, nowStr, body.location || '华东-杭州', channel.auto_tag || '默认标签']
  )

  await run(
    \`UPDATE mp_channel_qrcode
     SET scan_count = COALESCE(scan_count, 0) + 1,
         follow_count = COALESCE(follow_count, 0) + 1
     WHERE id = ?\`,
    [channel.id]
  )

  return {
    code: 0,
    message: '扫码关注成功',
    data: {
      scan_time: nowStr,
      nickname: fakeNickname,
      location: body.location || '华东-杭州',
      welcome_msg: channel.welcome_msg || '感谢您的关注！',
      new_scan_count: (channel.scan_count || 0) + 1,
      new_follow_count: (channel.follow_count || 0) + 1
    }
  }
})
`
      writeFileSync(scanApiFile, scanApiCode, 'utf-8')
      createdFiles.push(scanApiFile)
    }

    // 4. app/pages/p/[scene].vue
    const pageDir = join(tenantDir, 'app/pages/p')
    mkdirSync(pageDir, { recursive: true })
    const pageFile = join(pageDir, '[scene].vue')
    if (!existsSync(pageFile)) {
      const pageCode = `<script setup lang="ts">
definePageMeta({ layout: 'blank' })

const route = useRoute()
const sceneParam = computed(() => String(route.params.scene || '1'))

interface ChannelData {
  id: number
  channel_name: string
  scene_str: string
  qr_type: string
  status: string
  welcome_msg: string
  scan_count: number
  follow_count: number
  auto_tag?: string
  qr_image?: string
  target_url?: string
}

const config = useRuntimeConfig()
const baseApi = computed(() => (config.app.baseURL || '/').replace(/\\/$/, '') + '/api')

const simNickname = ref('微信粉丝_' + Math.floor(100 + Math.random() * 900))
const simLocation = ref('华东-杭州')
const simBusy = ref(false)
const scanSuccessResult = ref<any>(null)
const copied = ref(false)
const cities = ['华东-杭州', '华东-上海', '华南-深圳', '华南-广州', '华北-北京', '西南-成都']

const { data: channelResp, status: fetchStatus, error: fetchError, refresh: loadChannel } = await useAsyncData(
  \`channel-page-\${sceneParam.value}\`,
  () => $fetch<any>(\`\${baseApi.value}/public/channel/\${encodeURIComponent(sceneParam.value)}\`)
)

const channel = ref<ChannelData | null>(channelResp.value?.data || null)
watchEffect(() => {
  if (channelResp.value?.data) {
    channel.value = { ...channelResp.value.data }
  }
})

const loading = computed(() => fetchStatus.value === 'pending')
const errorMsg = computed(() => fetchError.value?.message || (channelResp.value && channelResp.value.code !== 0 ? channelResp.value.message : ''))

async function doSimulateScan() {
  if (!channel.value) return
  simBusy.value = true
  scanSuccessResult.value = null
  try {
    const res = await $fetch<{ code: number, data: any, message?: string }>(\`\${baseApi.value}/public/scan\`, {
      method: 'POST',
      body: {
        scene_str: channel.value.scene_str,
        nickname: simNickname.value,
        location: simLocation.value
      }
    })
    if (res.code === 0 && res.data) {
      scanSuccessResult.value = res.data
      channel.value.scan_count = res.data.new_scan_count
      channel.value.follow_count = res.data.new_follow_count
      simNickname.value = '微信粉丝_' + Math.floor(100 + Math.random() * 900)
    }
  } catch (err: any) {
    alert('模拟扫码失败: ' + (err.data?.message || err.message))
  } finally {
    simBusy.value = false
  }
}

function copyLink() {
  if (import.meta.client) {
    navigator.clipboard.writeText(window.location.href)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2500)
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-white text-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 dark:text-slate-100 flex flex-col justify-between p-4 sm:p-6">
    <header class="max-w-md mx-auto w-full flex items-center justify-between py-2">
      <div class="flex items-center gap-2">
        <div class="size-8 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-sm border border-emerald-500/20">
          <UIcon name="i-lucide-qr-code" class="size-4.5" />
        </div>
        <div>
          <h1 class="text-sm font-semibold tracking-tight leading-tight">${title}</h1>
          <p class="text-[11px] text-slate-400">带参渠道二维码 · 实时追踪</p>
        </div>
      </div>
      <UBadge color="success" variant="subtle" size="sm" class="rounded-full px-2.5">
        <span class="inline-block size-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />
        推广中
      </UBadge>
    </header>

    <main class="max-w-md mx-auto w-full my-auto py-4 space-y-4">
      <div v-if="loading" class="bg-white/80 dark:bg-slate-900/80 backdrop-blur rounded-2xl p-8 border border-slate-200/80 dark:border-slate-800 text-center space-y-3 shadow-sm">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin mx-auto text-emerald-600" />
        <p class="text-xs text-slate-400">正在生成渠道专属二维码...</p>
      </div>

      <div v-else-if="errorMsg" class="bg-white/80 dark:bg-slate-900/80 rounded-2xl p-8 border border-red-200 dark:border-red-900/40 text-center space-y-3 shadow-sm">
        <UIcon name="i-lucide-alert-circle" class="size-10 text-red-500 mx-auto" />
        <p class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ errorMsg }}</p>
        <UButton size="xs" color="neutral" variant="outline" label="重试" @click="loadChannel" />
      </div>

      <div v-else-if="channel" class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xl shadow-emerald-500/5 space-y-5 text-center relative overflow-hidden">
        <div class="absolute -top-12 -right-12 size-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div class="absolute -bottom-12 -left-12 size-36 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />

        <div class="space-y-1 relative z-10">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400 text-xs font-medium">
            <UIcon name="i-lucide-tag" class="size-3" />
            <span>场景标识: {{ channel.scene_str }}</span>
          </div>
          <h2 class="text-xl font-bold tracking-tight text-slate-900 dark:text-white pt-1">
            {{ channel.channel_name }}
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400">扫码即享专属服务 · 自动建立渠道归属</p>
        </div>

        <div class="relative mx-auto w-64 p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border-2 border-dashed border-emerald-500/30 group">
          <div class="absolute top-2 left-2 size-3 border-t-2 border-l-2 border-emerald-500 rounded-tl-sm" />
          <div class="absolute top-2 right-2 size-3 border-t-2 border-r-2 border-emerald-500 rounded-tr-sm" />
          <div class="absolute bottom-2 left-2 size-3 border-b-2 border-l-2 border-emerald-500 rounded-bl-sm" />
          <div class="absolute bottom-2 right-2 size-3 border-b-2 border-r-2 border-emerald-500 rounded-br-sm" />

          <div class="relative rounded-xl overflow-hidden bg-white p-2 shadow-inner">
            <img
              v-if="channel.qr_image"
              :src="channel.qr_image"
              :alt="channel.channel_name"
              class="w-full aspect-square object-contain transition-transform duration-300 group-hover:scale-105"
            >
            <div v-else class="w-full aspect-square flex items-center justify-center text-xs text-muted">
              暂无二维码
            </div>
          </div>

          <p class="text-[11px] text-slate-400 dark:text-slate-500 pt-2 flex items-center justify-center gap-1">
            <UIcon name="i-lucide-smartphone" class="size-3" />
            长按上方二维码，识别关注公众号
          </p>
        </div>

        <div v-if="channel.welcome_msg" class="rounded-xl bg-slate-50/80 dark:bg-slate-800/40 p-3.5 border border-slate-100 dark:border-slate-800 text-left space-y-1">
          <div class="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <UIcon name="i-lucide-message-square-heart" class="size-3.5" />
            <span>渠道关注欢迎语</span>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words">
            “{{ channel.welcome_msg }}”
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60">
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <p class="text-[11px] text-slate-400">累计扫码人次</p>
            <p class="text-lg font-bold text-slate-800 dark:text-slate-100 tabular-nums">
              {{ channel.scan_count || 0 }}
            </p>
          </div>
          <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            <p class="text-[11px] text-slate-400">净增关注人数</p>
            <p class="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {{ channel.follow_count || 0 }}
            </p>
          </div>
        </div>

        <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <UIcon name="i-lucide-sparkles" class="size-3.5 text-emerald-600" />
              体验完整端到端流程（模拟微信扫码）
            </span>
            <span class="text-[10px] text-slate-400">即时写入后台台账</span>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="text-[10px] text-slate-500 pb-0.5 block">模拟用户昵称</label>
              <UInput v-model="simNickname" size="xs" class="w-full" placeholder="输入昵称" />
            </div>
            <div>
              <label class="text-[10px] text-slate-500 pb-0.5 block">扫码所在地域</label>
              <USelect v-model="simLocation" :items="cities" size="xs" class="w-full" />
            </div>
          </div>

          <UButton
            block
            size="sm"
            color="primary"
            icon="i-lucide-scan-line"
            label="点击模拟扫码关注"
            :loading="simBusy"
            @click="doSimulateScan"
          />

          <div v-if="scanSuccessResult" class="p-3 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/70 border border-emerald-300/60 dark:border-emerald-700 text-xs space-y-1 animate-in fade-in slide-in-from-top-2">
            <p class="font-bold text-emerald-800 dark:text-emerald-200 flex items-center gap-1">
              <UIcon name="i-lucide-circle-check" class="size-4 text-emerald-600" />
              扫码关注成功！
            </p>
            <p class="text-[11px] text-slate-600 dark:text-slate-300">
              用户 <b>{{ scanSuccessResult.nickname }}</b>（{{ scanSuccessResult.location }}）于 {{ scanSuccessResult.scan_time }} 成功关注。
            </p>
            <p class="text-[11px] text-emerald-700 dark:text-emerald-300">
              欢迎语已下发：“{{ scanSuccessResult.welcome_msg }}”
            </p>
          </div>
        </div>

        <div class="flex items-center justify-center gap-2 pt-1">
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            :icon="copied ? 'i-lucide-check' : 'i-lucide-share-2'"
            :label="copied ? '链接已复制到剪贴板' : '复制推广链接'"
            @click="copyLink"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-external-link"
            label="进入管理后台"
            to="/admin"
          />
        </div>
      </div>
    </main>

    <footer class="max-w-md mx-auto w-full text-center py-2 text-[11px] text-slate-400">
      <span>GenPlus AI 运营中心 · 微信公众号全链路跟踪</span>
    </footer>
  </div>
</template>
`
      writeFileSync(pageFile, pageCode, 'utf-8')
      createdFiles.push(pageFile)
    }
  }

  return {
    success: true,
    slug,
    landingType,
    routePath,
    previewUrl: `${MAIN_URL}/preview/${slug}/p/1`,
    createdFiles
  }
}

const TOOLS = [
  {
    name: 'genplus_list_tenants',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '列出 GenPlus 工作台中现有的所有租户项目及其状态、端口和路径。',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'genplus_get_tenant_detail',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '获取指定租户的完整架构档案，包括分组、模块、字段列表、设计矩阵与系统能力。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        slug: { type: 'string', description: '租户 slug (二选一)' }
      }
    }
  },
  {
    name: 'genplus_create_tenant',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '在 GenPlus 工作台中创建新租户项目建档，分配独立工程目录、独立数据库与专属开发端口。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '项目/系统名称，例如：智能仓储管理系统' },
        app_title: { type: 'string', description: '浏览器标题/品牌标题（可选）' },
        description: { type: 'string', description: '系统简介与定位' },
        port: { type: 'number', description: '子后台专属运行端口号。可选，默认自动从 10001 起按顺序分配空闲端口（如 10001, 10002...）。用户可自主指定如 10086。' },
        auth_mode: { type: 'string', enum: ['open', 'users', 'rbac', 'custom'], default: 'rbac', description: '门禁模式：rbac(角色权限)/users(账号密码)/open(公开免密)' },
        auth_config: { type: 'object', description: '门禁明细配置（可选）' },
        login_tpl: { type: 'string', enum: ['split', 'center', 'simple'], default: 'split', description: '登录页模板' },
        layout: { type: 'string', enum: ['side', 'top', 'mix'], default: 'side', description: '主后台布局风格' }
      },
      required: ['name']
    }
  },
  {
    name: 'genplus_update_tenant',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '更新租户级设置（支持设置应用标题 app_title、系统名称 name、门禁模式 auth_mode (rbac/users/open)、门禁配置 auth_config、登录页模板 login_tpl、布局风格 layout、主题 theme 等）。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        name: { type: 'string', description: '系统名称' },
        app_title: { type: 'string', description: '浏览器标题/品牌标题' },
        description: { type: 'string', description: '系统描述' },
        port: { type: 'number', description: '子后台专属运行端口号' },
        auth_mode: { type: 'string', enum: ['open', 'users', 'rbac', 'custom'], description: '门禁模式' },
        auth_config: { type: 'object', description: '门禁明细配置' },
        login_tpl: { type: 'string', enum: ['split', 'center', 'simple'], description: '登录页模板' },
        layout: { type: 'string', enum: ['side', 'top', 'mix'], description: '主后台布局风格' },
        theme: { type: 'object', description: '主题配置，如 { palette: "emerald", skin: "macos-modern" }' },
        status: { type: 'string', enum: ['draft', 'generated', 'running', 'stopped', 'failed'], description: '状态' }
      },
      required: ['tenantId']
    }
  },
  {
    name: 'genplus_save_dict',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: '录入或更新业务枚举字典，为实体建模提供标准下拉枚举支撑。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        dictKey: { type: 'string', description: '字典标识符，如 warehouse_type, order_status' },
        name: { type: 'string', description: '字典中文名称，如 仓库类型' },
        items: {
          type: 'array',
          description: '枚举项列表',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: '枚举显示文本' },
              value: { type: 'string', description: '枚举存储值' },
              color: { type: 'string', description: '徽章色彩：primary / success / warning / error / info / neutral' },
              sort: { type: 'number', description: '排序序号' }
            },
            required: ['label', 'value']
          }
        }
      },
      required: ['tenantId', 'dictKey', 'name', 'items']
    }
  },
  {
    name: 'genplus_create_model_group',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '创建业务模块分组（如 仓储基础数据、运营中心），用于左侧导航菜单的一级归类。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        name: { type: 'string', description: '分组名称' },
        icon: { type: 'string', description: 'Lucide 图标名，例如 warehouse, box, settings' },
        sort: { type: 'number', default: 1, description: '排序序号' }
      },
      required: ['tenantId', 'name']
    }
  },
  {
    name: 'genplus_create_module',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '在指定租户与分组下创建业务数据模型（例如 货品SKU、出库单）。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        groupId: { type: 'number', description: '所属模块分组 ID' },
        name: { type: 'string', description: '模块名称，如 仓库管理' },
        key: { type: 'string', description: '模块标识符（小驼峰），如 warehouse' },
        table_name: { type: 'string', description: '数据表名，如 wms_warehouse' },
        icon: { type: 'string', default: 'table', description: '模块图标' },
        comment: { type: 'string', description: '业务实体注释' }
      },
      required: ['tenantId', 'groupId', 'name', 'key', 'table_name']
    }
  },
  {
    name: 'genplus_add_fields',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '批量为业务模块定义业务字段（支持按 moduleId 或 tenantId + moduleKey 寻址）。',
    inputSchema: {
      type: 'object',
      properties: {
        moduleId: { type: 'number', description: '模块 ID (与 tenantId + moduleKey 二选一)' },
        tenantId: { type: 'number', description: '租户 ID (当使用 moduleKey 时必填)' },
        moduleKey: { type: 'string', description: '模块标识符，如 warehouse, order (与 moduleId 二选一)' },
        fields: {
          type: 'array',
          description: '字段配置列表',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: '字段名称，如 仓库编号' },
              colKey: { type: 'string', description: '数据库列名，如 wh_code' },
              type: { type: 'string', enum: ['id', 'varchar', 'text', 'richtext', 'int', 'decimal', 'money', 'date', 'datetime', 'bool', 'enum', 'json', 'fk', 'file', 'image'], description: '字段类型: id, varchar, text, richtext, int, decimal, money, date, datetime, bool (布尔开关), enum (字典枚举), json, fk (外键), file (附件), image (图片)' },
              length: { type: 'number', description: '字符长度' },
              required: { type: 'boolean', description: '是否必填' },
              query: { type: 'string', enum: ['none', 'eq', 'like', 'range'], description: '查询检索模式' },
              dict: { type: 'string', description: '若为 enum 类型，所绑定的字典 dictKey' },
              refTable: { type: 'string', description: '若为 fk 外键类型，关联的目标表/模型名，如 med_department' },
              refLabel: { type: 'string', description: '若为 fk 外键类型，关联的目标显示字段，如 dept_name' },
              refValue: { type: 'string', description: '若为 fk 外键类型，关联的目标值字段，如 id 或 dept_name' },
              component: { type: 'string', description: 'UI输入控件类型，如 remote-select' },
              listShow: { type: 'boolean', default: true, description: '是否在表格列表中展示该列' },
              formShow: { type: 'boolean', default: true, description: '是否在新增/编辑表单中录入' },
              detailShow: { type: 'boolean', default: true, description: '是否在详情抽屉中展示' },
              exportShow: { type: 'boolean', default: true, description: '导出 Excel 时是否包含该列' },
              sortable: { type: 'boolean', default: false, description: '表格该列是否支持排序' }
            },
            required: ['name', 'colKey', 'type']
          }
        }
      },
      required: ['fields']
    }
  },
  {
    name: 'genplus_update_field',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '更新已有业务字段的定义（支持按 fieldId 或 tenantId + moduleKey + colKey 寻址）。',
    inputSchema: {
      type: 'object',
      properties: {
        fieldId: { type: 'number', description: '字段 ID (与 tenantId + moduleKey + colKey 二选一)' },
        tenantId: { type: 'number', description: '租户 ID (当按模块与列名寻址时使用)' },
        moduleKey: { type: 'string', description: '模块标识符 (当按模块与列名寻址时使用)' },
        colKey: { type: 'string', description: '数据库列名' },
        name: { type: 'string', description: '字段名称' },
        type: { type: 'string', enum: ['id', 'varchar', 'text', 'richtext', 'int', 'decimal', 'money', 'date', 'datetime', 'bool', 'enum', 'json', 'fk', 'file', 'image'], description: '字段类型: id, varchar, text, richtext, int, decimal, money, date, datetime, bool (布尔开关), enum (字典枚举), json, fk (外键), file (附件), image (图片)' },
        length: { type: 'number', description: '字符长度' },
        required: { type: 'boolean', description: '是否必填' },
        query: { type: 'string', enum: ['none', 'eq', 'like', 'range'], description: '查询检索模式' },
        dict: { type: 'string', description: '若为 enum 类型，绑定的字典 dictKey' },
        refTable: { type: 'string', description: '若为 fk 外键类型，关联的目标表/模型名，如 med_department' },
        refLabel: { type: 'string', description: '若为 fk 外键类型，关联的目标显示字段，如 dept_name' },
        refValue: { type: 'string', description: '若为 fk 外键类型，关联的目标值字段，如 id 或 dept_name' },
        component: { type: 'string', description: 'UI输入控件类型，如 remote-select' },
        listShow: { type: 'boolean', description: '是否在表格列表中展示该列' },
        formShow: { type: 'boolean', description: '是否在新增/编辑表单中录入' },
        detailShow: { type: 'boolean', description: '是否在详情抽屉中展示' },
        exportShow: { type: 'boolean', description: '导出 Excel 时是否包含该列' },
        sortable: { type: 'boolean', description: '表格该列是否支持排序' }
      }
    }
  },
  {
    name: 'genplus_configure_design',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: '配置设计矩阵：包括全局皮肤主题、圆角、调色板，以及关键的“模块动作能力天花板”（如关闭只读审计模块的 create/edit/delete）。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        theme: {
          type: 'object',
          properties: {
            skin: { type: 'string', default: 'macos-modern', description: '皮肤风格：macos-modern / classic / minimal' },
            palette: { type: 'string', default: 'blue', description: '色系：blue / emerald / violet / amber' },
            radius: { type: 'number', default: 10, description: '圆角 px' },
            primary: { type: 'string', default: '#0a84ff', description: '主色色值' },
            collapseMode: { type: 'string', enum: ['icon', 'hidden'], default: 'icon', description: '侧栏折叠模式：icon（默认，折叠为 64px 迷你图标条） / hidden（完全隐藏侧栏，全宽展示工作区，由顶栏按钮唤出）' }
          }
        },
        moduleActions: {
          type: 'array',
          description: '针对各模块定制动作天花板列表',
          items: {
            type: 'object',
            properties: {
              moduleId: { type: 'number', description: '模块 ID (与 moduleKey 二选一)' },
              moduleKey: { type: 'string', description: '模块标识符，如 warehouse, order (与 moduleId 二选一)' },
              actions: {
                type: 'array',
                items: { type: 'string', enum: ['create', 'edit', 'delete', 'export', 'detail', 'batch', 'print', 'recycle'] },
                description: '允许的动作按钮集合：create 新增 / edit 编辑 / delete 删除 / export 导出 / detail 详情。注：batch 属于能力包级特性，需配合 genplus_install_capability("batch") 生效'
              },
              pageSize: { type: 'number', default: 10, description: '表格默认每页条数 (1~200)' },
              striped: { type: 'boolean', default: true, description: '表格斑马纹' },
              exportable: { type: 'boolean', default: true, description: '是否开启全表导出按钮' },
              formLayout: { type: 'string', enum: ['single', 'double', 'group'], default: 'double', description: '表单布局：单列 / 双列 / 分组' },
              detailShow: { type: 'boolean', default: true, description: '是否启用详情抽屉' },
              menuHidden: { type: 'boolean', default: false, description: '是否在左侧导航栏隐藏该菜单' }
            }
          }
        }
      },
      required: ['tenantId']
    }
  },
  {
    name: 'genplus_list_capabilities',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '查询工作台能力库的所有可用扩展能力包（如 C端推广海报 landing_poster、动态表单 landing_form、前台门户 landing_portal、企业官网 landing_cms、数据字典 dict、看板 dashboard、导入导出 io 等），支持按租户查看已安装状态。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID（可选，传入可查询该租户下的安装与配置状态）' }
      }
    }
  },
  {
    name: 'genplus_install_capability',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: '在能力站一键安装并配置扩展能力包（支持 landing_poster 推广海报、landing_form 收集表单、landing_portal 复合门户、landing_cms 品牌官网、dict 数据字典、dashboard 数据看板、file 附件存储、flow 审批流、job 定时任务等）。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        capKey: {
          type: 'string',
          description: '能力标识，支持: landing_poster, landing_form, landing_portal, landing_cms, dict, log, file, dashboard, io, batch, tree, recycle, job, message, flow, security, print 等'
        },
        config: {
          type: 'object',
          description: '可选能力定制配置项（如 { heroTitle: "推广中心", targetModel: "channel_qrcode" } 或 { formTitle: "在线预约" } 等）'
        }
      },
      required: ['tenantId', 'capKey']
    }
  },
  {
    name: 'genplus_generate_project',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '触发生成站，编译并导出全套 Nuxt 4 + Vite + Tailwind CSS + Nitro + Casbin 的独立工程源码。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        note: { type: 'string', description: '发布版本备注说明' }
      },
      required: ['tenantId']
    }
  },
  {
    name: 'genplus_manage_service',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '管理指定租户的运行服务（启动 start、停止 stop、查询状态 status）。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        action: { type: 'string', enum: ['start', 'stop', 'status'], description: '服务管理动作' }
      },
      required: ['tenantId', 'action']
    }
  },
  {
    name: 'genplus_health',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '探活控制面与（可选）指定租户子站，返回进程存活、数据库可达性与自检完成状态。只读，不产生任何结构变更。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '可选：租户 ID。不传则只探活控制面。' },
        slug: { type: 'string', description: '可选：租户 slug (与 tenantId 二选一)。' }
      }
    }
  },
  {
    name: 'genplus_verify',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '对指定租户执行真机冒烟门禁（工程结构 / TS 语法 / 物理建表 / 租户隔离 / 具名槽 / 真实登录 / 能力探针）。只读检测，服务端直接返回汇总 summary (pass/fail/skip/gate)，不修改租户数据。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID (与 slug 二选一)' },
        slug: { type: 'string', description: '租户 slug (与 tenantId 二选一)' },
        boot: { type: 'boolean', default: true, description: 'true=全量（含 esbuild 语法与 DDL 检查）；false=轻量子集，跳过昂贵检查。' },
        failFast: { type: 'boolean', default: false, description: '遇到首个失败用例时是否立即中断返回' }
      }
    }
  },
  {
    name: 'genplus_inspect_output',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '读取指定租户生成工程内的文件内容或检索片段，用于核对生成结果是否符合预期（只读，且严格限制在 tenants/<slug>/ 目录内，防路径穿越）。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID (与 slug 二选一)' },
        slug: { type: 'string', description: '租户 slug (与 tenantId 二选一)' },
        path: { type: 'string', description: '工程内相对路径，如 server/utils/schema.ts 或 app/pages/p/form.vue' },
        grep: { type: 'string', description: '可选。传入则返回匹配行及行号，而非全文。' },
        maxBytes: { type: 'number', default: 32768, description: '最大读取字节数，默认 32KB' }
      },
      required: ['path']
    }
  },
  {
    name: 'genplus_diff_tenant',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '对比两个租户生成工程的文件与内容差异（用于上游版本 A/B 比对、回归核实）。只读。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantA: { type: 'number', description: '基准租户 A 的 ID (与 slugA 二选一)' },
        slugA: { type: 'string', description: '基准租户 A 的 slug (与 tenantA 二选一)' },
        tenantB: { type: 'number', description: '对比租户 B 的 ID (与 slugB 二选一)' },
        slugB: { type: 'string', description: '对比租户 B 的 slug (与 tenantB 二选一)' },
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: '可选。限定对比的文件相对路径列表（如 ["server/utils/schema.ts"]），不传则对比核心工程文件。'
        }
      }
    }
  },
  {
    name: 'genplus_get_db_connection',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '动态获取并探活验证 MySQL 数据库连接配置与连接串。若不传 tenantId/slug，则默认动态解析 <repoRoot>/main-admin/.env 并执行实时握手探活；若传入 tenantId/slug，则获取并探活该租户专属数据库。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '可选：租户 ID。留空则直接检测 main-admin 控制面数据库' },
        slug: { type: 'string', description: '可选：租户英文标识 slug。留空则直接检测 main-admin 控制面数据库' },
        testConnection: { type: 'boolean', description: '是否执行实时握手探活（默认为 true）' }
      }
    }
  },
  {
    name: 'genplus_db_query',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '在指定租户的独立数据库上执行只读 SQL 查询（如 SELECT、SHOW TABLES、EXPLAIN、DESCRIBE 等），检查物理表与数据。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        slug: { type: 'string', description: '租户英文标识 slug (与 tenantId 二选一)' },
        sql: { type: 'string', description: '待执行的 SQL 查询语句' },
        params: {
          type: 'array',
          description: '预编译参数列表',
          items: {}
        }
      },
      required: ['sql']
    }
  },
  {
    name: 'genplus_db_execute',
    annotations: { readOnlyHint: false, destructiveHint: true },
    description: '【底层运维与排障逃生舱】在指定租户的独立数据库上执行写入或结构维护 SQL（如 INSERT、UPDATE、DELETE、ALTER TABLE 等）。仅用于紧急排障或修复，严禁在常规业务流程中绕过工作台建模契约。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        slug: { type: 'string', description: '租户英文标识 slug (与 tenantId 二选一)' },
        sql: { type: 'string', description: '待执行的 DML/DDL 语句' },
        params: {
          type: 'array',
          description: '预编译参数列表',
          items: {}
        }
      },
      required: ['sql']
    }
  },
  {
    name: 'genplus_take_screenshot',
    annotations: { readOnlyHint: true, destructiveHint: false },
    description: '在无头浏览器中渲染指定租户的页面并拍摄高清 PNG 截图，支持自动登录认证与水合等待，供直观视觉预览和功能审查。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        slug: { type: 'string', description: '租户英文标识 slug (与 tenantId 二选一)' },
        path: { type: 'string', default: '/admin', description: '访问路由路径，例如 /admin, /admin/warehouse, /login 等' },
        autoLogin: { type: 'boolean', default: true, description: '是否自动注入管理员登录凭证' },
        width: { type: 'number', default: 1280, description: '视口宽度（像素）' },
        height: { type: 'number', default: 800, description: '视口高度（像素）' },
        waitMs: { type: 'number', default: 12000, description: '最大等待渲染毫秒数' }
      }
    }
  },
  {
    name: 'genplus_create_public_landing',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '为租户系统自动生成对外公开的前端微页面 (如 C端带参渠道二维码推广页 /p/[scene]、移动端展示卡片、免鉴权业务接口与数据台账闭环)。',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'number', description: '租户 ID' },
        slug: { type: 'string', description: '租户英文标识 slug (与 tenantId 二选一)' },
        landingType: {
          type: 'string',
          enum: ['qrcode_channel', 'general_form', 'showcase'],
          default: 'qrcode_channel',
          description: '落地页类型：qrcode_channel 带参二维码推广页 / general_form 外部登记表单 / showcase 品牌展示页'
        },
        routePath: { type: 'string', default: '/p/[scene]', description: 'C端页面路由，如 /p/[scene]' },
        title: { type: 'string', description: '落地页前台标题' }
      }
    }
  },
  {
    name: 'genplus_build_style_preset',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '构建与应用实战风格库：提供涵盖 7 套皮肤规范、26+ 调色板及 8 大行业实战预设（智慧医疗、科技SaaS、金融风控、党政国企、极客运维、新零售、潮流艺术、工业智造）的完整视觉基线。支持风格库全景查询、按行业语义智能推导、一键整套构建应用至租户（联动更新皮肤、配色、圆角、侧栏折叠模式、登录页与布局），以及注册自定义实战风格预设。',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'apply'],
          default: 'apply',
          description: '操作类型：list 查询实战风格库全貌 / apply 构建并应用到指定租户'
        },
        tenantId: { type: 'number', description: '租户 ID (当 action 为 apply 时必填，或提供 slug)' },
        slug: { type: 'string', description: '租户英文标识 slug (与 tenantId 二选一)' },
        preset: {
          type: 'string',
          description: '实战风格预设键名，如 medical-health, tech-saas, fin-bank, gov-affairs, ops-monitor, retail-brand, creative-studio, energy-industrial'
        },
        industry: {
          type: 'string',
          description: '业务行业或系统描述关键词（如"医院就医问诊系统"、"物流调度中台"、"银行风控"等），系统将自动智能推导出最契合的实战风格预设'
        },
        custom: {
          type: 'object',
          description: '可选个性化微调覆盖项',
          properties: {
            skin: { type: 'string', enum: ['macos-modern', 'macos-arranged', 'macos-droplet', 'macos-retro', 'material', 'flat', 'glass'], description: '皮肤风格' },
            palette: { type: 'string', description: '所属皮肤下的调色板 ID (如 blue, teal, navy, honey, lilac, slate, green 等)' },
            primary: { type: 'string', description: '主色十六进制色值' },
            radius: { type: 'number', description: '物理圆角 px (0 ~ 999)' },
            collapseMode: { type: 'string', enum: ['icon', 'hidden'], description: '侧栏折叠模式：icon（保留 64px 迷你图标） / hidden（完全隐藏侧栏，全宽展示工作区）' },
            loginTpl: { type: 'string', enum: ['split', 'card', 'simple'], description: '登录页模板：split 双栏商务 / card 居中卡片 / simple 极简' },
            layout: { type: 'string', enum: ['side', 'top'], description: '布局形态：side 侧栏导航 / top 顶部横向菜单' },
            density: { type: 'string', enum: ['normal', 'compact'], description: '界面密度：normal 标准 / compact 紧凑' },
            striped: { type: 'boolean', description: '表格斑马纹' },
            formLayout: { type: 'string', enum: ['single', 'double'], description: '表单排布布局：single 单列 / double 双列' }
          }
        },
        applyModules: { type: 'boolean', default: true, description: '是否联动更新各模块的设计矩阵（如斑马纹与表单布局）' }
      }
    }
  },
  {
    name: 'genplus_build_capability_component',
    annotations: { readOnlyHint: false, destructiveHint: false },
    description: '构建与注册全新的能力库组件（Capability Component）：允许 AI Agent 或开发者在平台能力站中动态定义全新的扩展能力包（包含能力标识、名称、分类、版本、说明、专属数据表结构、API端点、前端页面、可配置项与验证标准），并支持一键安装注入到租户系统中。',
    inputSchema: {
      type: 'object',
      properties: {
        capKey: { type: 'string', description: '能力唯一标识符，仅限字母/数字/下划线（如 notification, member_points, survey, contract, payment, ai_agent 等）' },
        name: { type: 'string', description: '能力中文名称（如 “站内消息与触达推送中心”）' },
        icon: { type: 'string', default: '🧩', description: '展示图标（emoji 如 🔔 或 lucide 图标名）' },
        category: {
          type: 'string',
          enum: ['system', 'data', 'media', 'insight', 'biz', 'ui'],
          default: 'biz',
          description: '能力分类：system 系统底座 / data 数据资产 / media 媒体推广 / insight 统计看板 / biz 业务垂直 / ui 界面交互'
        },
        version: { type: 'string', default: '1.0.0', description: '能力版本号' },
        summary: { type: 'string', description: '能力核心功能简述' },
        spec: {
          type: 'object',
          description: '完整的能力执行规范定义（数据表、接口、页面、配置项等）',
          properties: {
            desc: { type: 'string', description: '能力运行机制与作用详述' },
            tables: {
              type: 'array',
              description: '能力专属数据表定义列表',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: '物理表名，如 sys_notification' },
                  comment: { type: 'string', description: '表中文注释' },
                  fields: {
                    type: 'array',
                    description: '字段列表',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: '字段中文名' },
                        key: { type: 'string', description: '列名' },
                        type: { type: 'string', description: '类型：id, varchar, int, decimal, bool, json, datetime, text' },
                        length: { type: 'number', description: '字符长度' },
                        required: { type: 'boolean', description: '是否必填' },
                        indexed: { type: 'boolean', description: '是否建立普通索引' },
                        unique: { type: 'boolean', description: '是否唯一索引' },
                        default: {}
                      },
                      required: ['name', 'key', 'type']
                    }
                  }
                },
                required: ['name', 'comment', 'fields']
              }
            },
            apis: {
              type: 'array',
              description: '能力暴露的 API 接口列表',
              items: {
                type: 'object',
                properties: {
                  method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: '请求方法' },
                  path: { type: 'string', description: 'API 路径，如 /api/notification/unread' },
                  comment: { type: 'string', description: '接口用途说明' }
                },
                required: ['method', 'path']
              }
            },
            pages: {
              type: 'array',
              description: '能力包含的前端页面',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: '页面标识' },
                  name: { type: 'string', description: '页面标题' },
                  icon: { type: 'string', description: '页面图标' },
                  route: { type: 'string', description: '前端路由路径，如 /admin/system/notification' }
                },
                required: ['key', 'name', 'route']
              }
            },
            config: {
              type: 'array',
              description: '能力运行可配置项模式',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string', description: '配置字段键名' },
                  label: { type: 'string', description: '配置标签' },
                  type: { type: 'string', enum: ['string', 'number', 'boolean', 'select', 'json'], description: '配置类型' },
                  default: {},
                  options: { type: 'array', description: '若类型为 select 时的可选列表' }
                },
                required: ['key', 'label', 'type']
              }
            },
            verify: {
              type: 'array',
              description: '能力交付验证检查项',
              items: { type: 'string' }
            }
          }
        },
        tenantId: { type: 'number', description: '可选，构建完成同时将其一键安装至指定租户 ID (与 slug 二选一)' },
        slug: { type: 'string', description: '可选租户 slug (与 tenantId 二选一)' },
        tenantConfig: { type: 'object', description: '若同时安装至租户，传入的定制配置参数' }
      },
      required: ['capKey', 'name', 'summary']
    }
  }
]

async function handleToolCall(name, args) {
  switch (name) {
    case 'genplus_list_tenants': {
      const list = await api('/api/tenant')
      return { tenants: list }
    }
    case 'genplus_get_tenant_detail': {
      let tid = args.tenantId
      if (!tid && args.slug) {
        const raw = await api('/api/tenant')
        const list = Array.isArray(raw) ? raw : (raw?.list || [])
        const found = list.find(t => t.slug === args.slug)
        if (found) tid = found.id
      }
      if (!tid) throw new Error('必须指定 tenantId 或存在的 slug')
      const t = await api(`/api/tenant/${tid}`)
      if (!t) throw new Error(`获取租户 #${tid} 详情失败：未找到租户数据`)

      const errors = []
      // GET /api/tenant/:id 已经聚合了 groups (含各 group 的 modules 与 fields)
      let groups = (Array.isArray(t.groups) && t.groups.length > 0) ? t.groups : null
      if (!groups) {
        try {
          const gRes = await api(`/api/model/group?tenantId=${tid}`)
          groups = Array.isArray(gRes) ? gRes : (gRes?.list || [])
        } catch (e) {
          errors.push(`获取分组列表失败: ${e.message}`)
          groups = []
        }
      }
      let modules = (groups || []).flatMap(g => g.modules || [])
      if (!modules.length) {
        try {
          const mRes = await api(`/api/module?tenantId=${tid}`)
          modules = Array.isArray(mRes) ? mRes : (mRes?.list || [])
        } catch (e) {
          errors.push(`获取模块列表失败: ${e.message}`)
          modules = []
        }
      }
      let dicts = []
      try {
        const rawDicts = await api(`/api/dict?tenantId=${tid}`)
        dicts = Array.isArray(rawDicts) ? rawDicts : (rawDicts?.list || [])
      } catch (e) {
        errors.push(`获取字典列表失败: ${e.message}`)
      }
      let caps = Array.isArray(t.caps) ? t.caps : []
      if (!caps.length) {
        try {
          const rawCaps = await api(`/api/capability?tenantId=${tid}`)
          caps = Array.isArray(rawCaps) ? rawCaps : (rawCaps?.list || [])
        } catch (e) {
          errors.push(`获取能力包列表失败: ${e.message}`)
        }
      }

      return {
        tenant: t,
        groups: groups || [],
        modules: modules || [],
        dicts: dicts || [],
        caps: Array.isArray(caps) ? caps : [],
        counts: {
          groups: (groups || []).length,
          modules: (modules || []).length,
          dicts: (dicts || []).length,
          caps: (Array.isArray(caps) ? caps : []).length
        },
        ...(errors.length > 0 ? { _errors: errors } : {})
      }
    }
    case 'genplus_create_tenant': {
      const res = await api('/api/tenant', {
        method: 'POST',
        body: {
          name: args.name,
          app_title: args.app_title || args.name,
          description: args.description || '',
          port: args.port ? Number(args.port) : undefined,
          auth_mode: args.auth_mode || 'rbac',
          auth_config: args.auth_config || null,
          login_tpl: args.login_tpl || 'split',
          layout: args.layout || 'side'
        }
      })
      const finalTenant = res?.id ? await api(`/api/tenant/${res.id}`).catch(() => res) : res
      return { success: true, tenant: finalTenant }
    }
    case 'genplus_update_tenant': {
      const { tenantId, ...body } = args
      const res = await api(`/api/tenant/${tenantId}`, {
        method: 'PATCH',
        body
      })
      return { success: true, tenant: res }
    }
    case 'genplus_save_dict': {
      const res = await api('/api/dict', {
        method: 'POST',
        body: {
          tenantId: args.tenantId,
          dictKey: args.dictKey,
          name: args.name,
          items: args.items
        }
      })
      return { success: true, dict: res }
    }
    case 'genplus_create_model_group': {
      const res = await api('/api/model/group', {
        method: 'POST',
        body: {
          tenantId: args.tenantId,
          name: args.name,
          icon: args.icon || 'folder',
          sort: args.sort || 1
        }
      })
      return { success: true, group: res }
    }
    case 'genplus_create_module': {
      const res = await api('/api/module', {
        method: 'POST',
        body: {
          tenantId: args.tenantId,
          groupId: args.groupId,
          name: args.name,
          key: args.key,
          table_name: args.table_name,
          icon: args.icon || 'table',
          comment: args.comment || ''
        }
      })
      return { success: true, module: res }
    }
    case 'genplus_add_fields': {
      let modId = args.moduleId
      if (!modId) {
        const mod = await resolveModule(args)
        if (mod?.id) modId = mod.id
      }
      if (!modId) throw new Error('必须提供 moduleId 或 (tenantId + moduleKey)')
      const res = await api(`/api/module/${modId}/field`, {
        method: 'POST',
        body: { fields: args.fields }
      })
      return { success: true, fields: res }
    }
    case 'genplus_update_field': {
      let fid = args.fieldId
      if (!fid) {
        const field = await resolveField(args)
        if (field?.id) fid = field.id
      }
      if (!fid) throw new Error('必须提供 fieldId 或 (tenantId + moduleKey + colKey)')
      const { fieldId, moduleId, moduleKey, tenantId, ...body } = args
      const res = await api(`/api/field/${fid}`, {
        method: 'PATCH',
        body
      })
      return { success: true, field: res }
    }
    case 'genplus_configure_design': {
      // 1. 如果包含 moduleActions，先执行第一阶段解析预检，确保全部模块均可寻址，实现操作原子性
      let resolvedActions = null
      if (Array.isArray(args.moduleActions)) {
        const unresolved = []
        const resolved = []
        for (const ma of args.moduleActions) {
          let modId = ma.moduleId
          if (!modId && ma.moduleKey) {
            const mod = await resolveModule({ tenantId: args.tenantId, moduleKey: ma.moduleKey })
            if (mod?.id) modId = mod.id
          }
          if (!modId) {
            unresolved.push(ma.moduleKey ?? ma.moduleId ?? '(未提供)')
            continue
          }
          resolved.push({ modId, ma })
        }
        if (unresolved.length) {
          return {
            success: false,
            _errors: unresolved.map(k => `模块未解析：${k}`),
            message: `有 ${unresolved.length} 个模块未找到，动作矩阵未生效（本次全部模块均未写入）`
          }
        }
        resolvedActions = resolved
      }

      // 2. 预检完全通过后，才更新租户级主题与权限配置
      const patchTenant = {}
      if (args.theme) patchTenant.theme = args.theme
      if (args.auth_mode) patchTenant.auth_mode = args.auth_mode
      if (Object.keys(patchTenant).length > 0) {
        await api(`/api/tenant/${args.tenantId}`, {
          method: 'PATCH',
          body: patchTenant
        })
      }

      // 3. 执行已确认全部有效的动作矩阵更新
      if (resolvedActions) {
        for (const { modId, ma } of resolvedActions) {
          const designPatch = {
            list: {
              show: ma.show !== false,
              actions: Array.isArray(ma.actions) ? ma.actions : ['create', 'edit', 'delete', 'export', 'detail'],
              ...(ma.pageSize ? { pageSize: ma.pageSize } : {}),
              ...(ma.striped !== undefined ? { striped: ma.striped } : {}),
              ...(ma.exportable !== undefined ? { exportable: ma.exportable } : {})
            },
            form: {
              ...(ma.formLayout ? { layout: ma.formLayout } : {}),
              ...(ma.formWidth ? { width: ma.formWidth } : {})
            },
            detail: { show: ma.detailShow !== false },
            menu: { show: true, hidden: ma.menuHidden === true }
          }
          await api(`/api/design/${modId}`, {
            method: 'PATCH',
            body: { design: designPatch }
          })
        }
      }
      return { success: true, message: '设计矩阵与动作上限已持久化' }
    }
    case 'genplus_list_capabilities': {
      const qs = args.tenantId ? `?tenantId=${args.tenantId}` : ''
      const res = await api(`/api/capability${qs}`)
      return { success: true, capabilities: res }
    }
    case 'genplus_install_capability': {
      const res = await api('/api/capability/install', {
        method: 'POST',
        body: { tenantId: args.tenantId, capKey: args.capKey }
      })
      if (args.config && typeof args.config === 'object') {
        await api('/api/capability/config', {
          method: 'POST',
          body: { tenantId: args.tenantId, capKey: args.capKey, config: args.config }
        }).catch(() => null)
      }
      return { success: true, capability: res, config: args.config }
    }
    case 'genplus_generate_project': {
      const res = await api(`/api/gen/${args.tenantId}`, {
        method: 'POST',
        body: { note: args.note || 'AI Agent 自动生成发布' }
      })
      return { success: true, job: res }
    }
    case 'genplus_manage_service': {
      if (args.action === 'start') {
        const res = await api(`/api/tenant/${args.tenantId}/start`, { method: 'POST' })
        const statusRes = await api(`/api/tenant/${args.tenantId}/status`).catch(() => null)
        return { action: 'start', result: { ...res, ...(statusRes || {}) } }
      } else if (args.action === 'stop') {
        const res = await api(`/api/tenant/${args.tenantId}/stop`, { method: 'POST' })
        return { action: 'stop', result: res }
      } else {
        const res = await api(`/api/tenant/${args.tenantId}/status`)
        return { action: 'status', result: res }
      }
    }
    case 'genplus_health': {
      let cpHealth = null
      let cpError = null
      try {
        const res = await fetch(`${MAIN_URL}/api/health`, { signal: AbortSignal.timeout(3000) })
        const json = await res.json().catch(() => null)
        cpHealth = json?.data || json || { status: res.status }
      } catch (e) {
        cpError = e.message
        cpHealth = { status: 'down', error: e.message }
      }

      let tenantHealth = null
      const errors = []
      if (cpError) errors.push(`控制面探活异常: ${cpError}`)

      if (args.tenantId || args.slug) {
        try {
          const t = await resolveTenant(args)
          const port = t.port
          let portOpen = false
          let httpOk = false
          let subHealth = null

          if (port) {
            portOpen = await new Promise((res) => {
              const s = net.createConnection({ host: '127.0.0.1', port, timeout: 1500 }, () => {
                s.destroy()
                res(true)
              })
              s.on('error', () => res(false))
              s.on('timeout', () => { s.destroy(); res(false) })
            })

            if (portOpen) {
              try {
                const subRes = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) })
                const subJson = await subRes.json().catch(() => null)
                subHealth = subJson?.data || subJson
                httpOk = subRes.ok && (subHealth?.ok === true || subHealth?.status === 'up')
              } catch (e) {
                errors.push(`子后台 HTTP health 请求失败: ${e.message}`)
              }
            }
          }

          tenantHealth = {
            id: t.id,
            slug: t.slug,
            port,
            portOpen,
            httpOk,
            db: subHealth?.db || null,
            initReady: subHealth?.initReady ?? null,
            uptime: subHealth?.uptime ?? null,
            running: portOpen
          }
        } catch (e) {
          errors.push(`租户解析/探活异常: ${e.message}`)
        }
      }

      return {
        controlPlane: cpHealth,
        ...(tenantHealth ? { tenant: tenantHealth } : {}),
        errors
      }
    }
    case 'genplus_verify': {
      const t = await resolveTenant(args)
      const raw = await api(`/api/verify/${t.id}`, {
        method: 'POST',
        body: {
          boot: args.boot !== false,
          failFast: !!args.failFast
        }
      })

      const cases = Array.isArray(raw?.cases) ? raw.cases : []
      let pass = 0, fail = 0, skip = 0
      const failures = []
      for (const c of cases) {
        if (c.status === 'pass') pass++
        else if (c.status === 'fail') {
          fail++
          failures.push({ case_key: c.case_key, title: c.title, detail: c.detail || c.message || '' })
        } else if (c.status === 'skip') {
          skip++
          failures.push({ case_key: c.case_key, title: c.title, detail: c.detail || '跳过' })
        }
      }
      const isPartial = args.boot === false
      const gate = (!isPartial && fail === 0 && skip === 0) ? 'PASSED' : (isPartial ? 'PARTIAL' : 'FAILED')

      return {
        jobId: raw?.jobId,
        tenantId: t.id,
        slug: t.slug,
        summary: {
          pass,
          fail,
          skip,
          total: cases.length,
          gate
        },
        failures,
        durationMs: raw?.durationMs,
        cases
      }
    }
    case 'genplus_inspect_output': {
      const t = await resolveTenant(args)
      const tenantDir = resolve(t.project_path || join(ROOT, 'tenants', t.slug))
      if (!existsSync(tenantDir)) {
        throw new Error(`租户工程目录不存在: ${tenantDir}`)
      }

      const rawPath = String(args.path || '').trim()
      if (!rawPath) throw new Error('必须指定待检查的工程相对路径 path')

      const targetFile = resolve(tenantDir, rawPath)
      const rel = relative(tenantDir, targetFile)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        throw new Error(`安全违规：文件路径越界 (${rawPath})，仅允许访问 tenants/${t.slug}/ 内的文件`)
      }

      if (!existsSync(targetFile)) {
        throw new Error(`文件不存在: ${rawPath}`)
      }

      const st = statSync(targetFile)
      if (st.isDirectory()) {
        const entries = readdirSync(targetFile)
        return { isDirectory: true, path: rawPath, entries }
      }

      const maxBytes = Number(args.maxBytes) || 32768
      const content = readFileSync(targetFile, 'utf-8')
      const truncated = content.length > maxBytes
      const slice = truncated ? content.slice(0, maxBytes) : content

      if (args.grep) {
        const pattern = String(args.grep)
        const lines = content.split('\n')
        const matches = []
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(pattern)) {
            matches.push({ line: i + 1, text: lines[i] })
          }
        }
        return {
          path: rawPath,
          grep: pattern,
          totalMatches: matches.length,
          matches: matches.slice(0, 100)
        }
      }

      return {
        path: rawPath,
        size: st.size,
        truncated,
        content: slice
      }
    }
    case 'genplus_diff_tenant': {
      let tA = null
      let tB = null
      if (args.tenantA || args.slugA) {
        tA = await resolveTenant({ tenantId: args.tenantA, slug: args.slugA })
      }
      if (args.tenantB || args.slugB) {
        tB = await resolveTenant({ tenantId: args.tenantB, slug: args.slugB })
      }
      if (!tA || !tB) throw new Error('必须同时指定 tenantA (或 slugA) 与 tenantB (或 slugB)')

      const dirA = resolve(tA.project_path || join(ROOT, 'tenants', tA.slug))
      const dirB = resolve(tB.project_path || join(ROOT, 'tenants', tB.slug))

      if (!existsSync(dirA)) throw new Error(`租户 A 工程目录不存在: ${dirA}`)
      if (!existsSync(dirB)) throw new Error(`租户 B 工程目录不存在: ${dirB}`)

      function hashFile(file) {
        if (!existsSync(file)) return null
        return createHash('sha256').update(readFileSync(file)).digest('hex')
      }

      function scanDir(base, sub = '') {
        const dir = join(base, sub)
        let files = []
        if (!existsSync(dir)) return files
        for (const f of readdirSync(dir)) {
          if (f === 'node_modules' || f === '.git' || f === '.nuxt' || f === '.output') continue
          const rel = sub ? `${sub}/${f}` : f
          const full = join(base, rel)
          if (statSync(full).isDirectory()) {
            files = files.concat(scanDir(base, rel))
          } else {
            files.push(rel)
          }
        }
        return files
      }

      const paths = Array.isArray(args.paths) && args.paths.length > 0
        ? args.paths
        : [...new Set([...scanDir(dirA), ...scanDir(dirB)])]

      const added = []
      const removed = []
      const modified = []
      const identical = []

      for (const p of paths) {
        const fA = join(dirA, p)
        const fB = join(dirB, p)
        const hA = hashFile(fA)
        const hB = hashFile(fB)

        if (!hA && hB) added.push(p)
        else if (hA && !hB) removed.push(p)
        else if (hA !== hB) modified.push(p)
        else identical.push(p)
      }

      return {
        tenantA: tA.slug,
        tenantB: tB.slug,
        summary: {
          added: added.length,
          removed: removed.length,
          modified: modified.length,
          identical: identical.length,
          totalCompared: paths.length
        },
        added,
        removed,
        modified,
        identical: identical.slice(0, 50)
      }
    }
    case 'genplus_get_db_connection': {
      let tenant = null
      let isMain = false
      if (args.tenantId || args.slug) {
        tenant = await resolveTenant(args)
      } else {
        isMain = true
      }
      const slug = tenant ? tenant.slug : null
      const cfg = getTenantDbConfig(slug)

      let testResult = null
      if (args.testConnection !== false) {
        try {
          if (!mysql) mysql = require('mysql2/promise')
          const conn = await mysql.createConnection({
            host: cfg.host,
            port: cfg.port,
            user: cfg.user,
            password: cfg.password,
            database: cfg.database
          })
          const [rows] = await conn.query('SELECT 1 AS ping, VERSION() AS version, DATABASE() AS current_db, NOW() AS now')
          await conn.end()
          testResult = {
            ok: true,
            version: rows[0]?.version,
            currentDb: rows[0]?.current_db,
            serverTime: rows[0]?.now
          }
        } catch (e) {
          testResult = {
            ok: false,
            error: e.message,
            code: e.code
          }
        }
      }

      return {
        success: true,
        scope: isMain ? 'main_admin' : 'tenant',
        tenantId: tenant ? tenant.id : null,
        slug: tenant ? tenant.slug : null,
        platform: process.platform,
        root: ROOT,
        envPath: isMain ? (process.env.MAIN_ADMIN_ENV || join(ROOT, 'main-admin/.env')) : join(ROOT, 'tenants', slug, '.env'),
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
        connectionUri: cfg.connectionUri,
        test: testResult
      }
    }
    case 'genplus_db_query': {
      const tenant = await resolveTenant(args)
      return await queryTenantDb(tenant.slug, args.sql, args.params)
    }
    case 'genplus_db_execute': {
      const tenant = await resolveTenant(args)
      return await executeTenantDb(tenant.slug, args.sql, args.params)
    }
    case 'genplus_take_screenshot': {
      return await takeTenantScreenshot(args)
    }
    case 'genplus_create_public_landing': {
      return await createPublicLanding(args)
    }
    case 'genplus_build_style_preset': {
      const action = args.action || (args.tenantId || args.slug ? 'apply' : 'list')
      if (action === 'list') {
        const presets = await api('/api/design/preset')
        return {
          totalPresets: presets?.presets?.length || 0,
          presets: presets?.presets || [],
          skins: presets?.skins || [],
          palettes: presets?.palettes || {}
        }
      }
      const tenant = await resolveTenant(args)
      const res = await api('/api/design/preset', {
        method: 'POST',
        body: {
          tenantId: tenant.id,
          preset: args.preset,
          industry: args.industry,
          custom: args.custom,
          applyModules: args.applyModules !== false
        }
      })
      return {
        success: true,
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        appliedPreset: res?.appliedPreset,
        tenant: res?.tenant
      }
    }
    case 'genplus_build_capability_component': {
      let tenantId = args.tenantId
      if (!tenantId && args.slug) {
        const tenant = await resolveTenant(args)
        tenantId = tenant?.id
      }
      const res = await api('/api/capability/build', {
        method: 'POST',
        body: {
          capKey: args.capKey,
          name: args.name,
          icon: args.icon,
          category: args.category,
          version: args.version,
          summary: args.summary,
          spec: args.spec,
          tenantId,
          tenantConfig: args.tenantConfig
        }
      })
      return {
        success: true,
        capability: res?.capability,
        tenantInstalled: res?.tenantInstalled
      }
    }
    default:
      throw new Error(`未知的工具方法: ${name}`)
  }
}

// -------------------------------------------------------------
// Stdio JSON-RPC 2.0 Server Loop
// -------------------------------------------------------------
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
})

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

rl.on('line', async (line) => {
  const trimmed = line.trim()
  if (!trimmed) return
  let req
  try {
    req = JSON.parse(trimmed)
  } catch (e) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
    return
  }

  const { id, method, params } = req

  try {
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'genplus-mcp', version: '1.1.0' }
        }
      })
    } else if (method === 'notifications/initialized') {
      // no response required
    } else if (method === 'tools/list') {
      send({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS }
      })
    } else if (method === 'tools/call') {
      const toolName = params?.name
      const toolArgs = params?.arguments || {}
      const result = await handleToolCall(toolName, toolArgs)
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        }
      })
    } else {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      })
    }
  } catch (err) {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        content: [
          {
            type: 'text',
            text: `[Error] ${err.message || String(err)}`
          }
        ],
        isError: true
      }
    })
  }
})
