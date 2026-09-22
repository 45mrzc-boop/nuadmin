import type { TenantPlan } from './types'
import { allModules } from './types'

/** 数据字典：只读聚合接口 + 管理端 CRUD */
export function dictFiles(): Record<string, string> {
  return {
    'server/api/dict/list.get.ts': `export default defineAuthed(async () => {
  const types = await q<any>('SELECT dict_key FROM sys_dict_type')
  const data = await q<any>('SELECT dict_key,label,value,color FROM sys_dict_data WHERE status=1 ORDER BY sort,id')
  const out: Record<string, any[]> = {}
  for (const t of types) out[t.dict_key] = []
  for (const d of data) (out[d.dict_key] ||= []).push({ label: d.label, value: d.value, color: d.color })
  return ok(out)
})
`,
    'server/api/dict/data/[key].get.ts': `export default defineAuthed(async (event) => {
  const key = getRouterParam(event, 'key')!
  const rows = await q('SELECT label,value,color FROM sys_dict_data WHERE dict_key=? AND status=1 ORDER BY sort,id', [key])
  return ok(rows)
})
`,
    'server/api/dict/create.post.ts': `export default defineAuthed(async (event) => {
  const b = await readBody(event)
  if (b.dict_key) {
    await exec('INSERT INTO sys_dict_type (dict_key,dict_name,remark) VALUES (?,?,?) ON DUPLICATE KEY UPDATE dict_name=VALUES(dict_name)',
      [String(b.dict_key), String(b.dict_name ?? b.dict_key), String(b.remark ?? '')])
    return ok(true)
  }
  const r = await exec('INSERT INTO sys_dict_data (dict_key,label,value,color,sort,status) VALUES (?,?,?,?,?,?)',
    [String(b.for_key), String(b.label), String(b.value), String(b.color ?? ''), Number(b.sort ?? 0), Number(b.status ?? 1)])
  return ok({ id: r.insertId })
})
`,
    'server/api/dict/remove.post.ts': `export default defineAuthed(async (event) => {
  const b = await readBody(event)
  if (b.dict_key) {
    await exec('DELETE FROM sys_dict_type WHERE dict_key=?', [b.dict_key])
    await exec('DELETE FROM sys_dict_data WHERE dict_key=?', [b.dict_key])
  } else {
    await exec('DELETE FROM sys_dict_data WHERE id=?', [Number(b.id)])
  }
  return ok(true)
})
`,
    'server/api/dict/page.get.ts': `export default defineAuthed(async () => {
  const types = await q<any>('SELECT * FROM sys_dict_type ORDER BY id')
  const data = await q<any>('SELECT * FROM sys_dict_data ORDER BY sort,id')
  return ok(types.map(t => ({ ...t, items: data.filter((d: any) => d.dict_key === t.dict_key) })))
})
`
  }
}

/** 操作日志：写操作审计中间件 + 查询接口 */
export function logFiles(p: TenantPlan): Record<string, string> {
  return {
    'server/middleware/audit.ts': `const SKIP = new Set(['/api/login', '/api/logout', '/api/dict/list', '/api/menu'])

export default defineEventHandler(async (event) => {
  const path = event.path.split('?')[0]
  const method = event.method
  if (method === 'GET' || SKIP.has(path) || !path.startsWith('/api/')) return
  const started = Date.now()
  const body = await readBody(event).catch(() => null)
  const user = readToken(bearerOf(event))
  const resKey = path.replace('/api/', '').split('/')[0]
  event.context.audit = { path, method, body, user, resKey, started }
})

function bearerOf(event: any): string | undefined {
  const h = getRequestHeader(event, 'authorization')
  return h?.startsWith('Bearer ') ? h.slice(7) : undefined
}
`,
    'server/utils/audit-hook.ts': `/** Called from the nitro afterResponse hook to persist one audit row. */
export async function writeAudit(event: any, status: number) {
  const a = event.context?.audit
  if (!a) return
  await dbReady
  const duration = Date.now() - a.started
  await exec(
    'INSERT INTO sys_operation_log (username,module,action,path,payload,result,duration,ip,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())',
    [
      a.user?.username ?? '匿名', a.resKey, methodToAction(a.method), a.path,
      a.body ? JSON.stringify(a.body).slice(0, 4000) : null,
      status < 400 ? 'ok' : 'fail', duration,
      getRequestHeader(event, 'x-forwarded-for') ?? getRequestIP(event) ?? ''
    ]).catch(() => {})
}

function methodToAction(m: string): string {
  if (m === 'DELETE') return 'delete'
  if (m === 'PUT' || m === 'PATCH') return 'update'
  return 'create'
}
`,
    'server/plugins/audit.ts': `export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', async (event: any) => {
    await writeAudit(event, event.response?.status ?? 200)
  })
})
`,
    'server/api/log/page.get.ts': `export default defineAuthed(async (event) => {
  const { page = 1, size = 20, username, module, result } = getQuery(event) as any
  const sql: string[] = []; const params: unknown[] = []
  if (username) { sql.push('username LIKE ?'); params.push('%' + username + '%') }
  if (module) { sql.push('module = ?'); params.push(module) }
  if (result) { sql.push('result = ?'); params.push(result) }
  ${p.caps.log ? `const keep = Number(${JSON.stringify(p.caps.log.config?.keepDays ?? 90)})
  sql.push('created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'); params.push(keep)` : ''}
  const where = sql.length ? 'WHERE ' + sql.join(' AND ') : ''
  const total = Number((await q<any>('SELECT COUNT(*) AS c FROM sys_operation_log ' + where, params))[0]?.c ?? 0)
  const list = await q('SELECT * FROM sys_operation_log ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?',
    [...params, Number(size), (Number(page) - 1) * Number(size)])
  return ok({ list, total, page: Number(page), size: Number(size) })
})
`
  }
}

/** 文件上传：本地磁盘驱动，落 sys_file，静态回源 */
export function fileFiles(p: TenantPlan): Record<string, string> {
  const maxMb = Number(p.caps.file?.config?.maxMb ?? 20)
  const exts = String(p.caps.file?.config?.exts ?? 'jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,zip')
  return {
    'server/api/file/upload.post.ts': `import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const MAX = ${maxMb} * 1024 * 1024
const EXTS = new Set(${JSON.stringify(exts.split(','))})

export default defineAuthed(async (event) => {
  const files = await readMultipartFormData(event)
  const part = files?.find(f => f.name === 'file')
  if (!part?.filename) throw createError({ statusCode: 400, message: '未选择文件' })
  if (part.data.length > MAX) throw createError({ statusCode: 400, message: '文件超过 ' + ${maxMb} + 'MB' })
  const ext = (part.filename.split('.').pop() ?? '').toLowerCase()
  if (!EXTS.has(ext)) throw createError({ statusCode: 400, message: '不允许的扩展名 .' + ext })

  const dir = join(process.cwd(), 'uploads', new Date().toISOString().slice(0, 7))
  await mkdir(dir, { recursive: true })
  const storeKey = randomUUID() + '.' + ext
  await writeFile(join(dir, storeKey), part.data)

  const kind = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image' : 'doc'
  const r = await exec('INSERT INTO sys_file (name,store_key,size,mime,kind,uploader,created_at) VALUES (?,?,?,?,?,?,NOW())',
    [part.filename, storeKey, part.data.length, part.type ?? '', kind, currentUser(event).username])
  return ok({ id: r.insertId, name: part.filename, url: '/uploads/' + storeKey, kind })
})
`,
    'server/api/file/list.get.ts': `export default defineAuthed(async (event) => {
  const { page = 1, size = 20, kind } = getQuery(event) as any
  const where = kind ? 'WHERE kind=?' : ''
  const params = kind ? [kind] : []
  const total = Number((await q<any>('SELECT COUNT(*) AS c FROM sys_file ' + where, params))[0]?.c ?? 0)
  const list = await q('SELECT * FROM sys_file ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?',
    [...params, Number(size), (Number(page) - 1) * Number(size)])
  return ok({ list, total, page: Number(page), size: Number(size) })
})
`,
    'server/api/file/[id].delete.ts': `import { unlink } from 'node:fs/promises'
import { join } from 'node:path'

export default defineAuthed(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const row = await one<any>('SELECT * FROM sys_file WHERE id=?', [id])
  if (!row) throw createError({ statusCode: 404, message: '文件不存在' })
  await unlink(join(process.cwd(), 'uploads', row.store_key)).catch(() => {})
  await exec('DELETE FROM sys_file WHERE id=?', [id])
  return ok(true)
})
`,
    // month-bucketed storage, flat public URL
    'server/routes/uploads/[name].get.ts': `import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')!
  if (!/^[0-9a-f-]+\\.[a-z0-9]{2,5}$/.test(name)) throw createError({ statusCode: 400, message: '非法文件名' })
  const row = await one<any>('SELECT * FROM sys_file WHERE store_key=?', [name])
  if (!row) throw createError({ statusCode: 404, message: '文件不存在' })
  const file = join(process.cwd(), 'uploads', String(row.store_key).slice(0, 0) || '', monthOf(row.created_at), name)
  if (!existsSync(file)) throw createError({ statusCode: 404, message: '文件已丢失' })
  setHeader(event, 'content-type', row.mime || 'application/octet-stream')
  setHeader(event, 'cache-control', 'public, max-age=31536000')
  return sendStream(event, createReadStream(file))
})

function monthOf(created: string): string {
  const d = created ? new Date(String(created).replace(' ', 'T')) : new Date()
  return d.toISOString().slice(0, 7)
}
`
  }
}

/** 数据看板：按字段类型自动推导指标 */
export function dashboardFiles(p: TenantPlan): Record<string, string> {
  const modules = allModules(p)
  const cards = modules.slice(0, 4).map(m => ({ res: m.key, table: m.tableName, name: m.name, icon: m.icon }))
  const trendTable = modules.find(m => m.fields.some(f => f.key === 'created_at'))?.tableName ?? cards[0]?.table
  const groupField = modules.flatMap(m => m.fields).find(f => f.type === 'enum' && f.dict)
  return {
    'server/api/dashboard/summary.get.ts': `export default defineAuthed(async (event) => {
  const days = Math.min(Math.max(Number((getQuery(event) as any)?.days ?? ${JSON.stringify(String(p.caps.dashboard?.config?.trendDays ?? 30))}), 7), 365)
  const cards = await Promise.all(CARDS.map(async c => ({
    ...c,
    total: Number((await q<any>('SELECT COUNT(*) AS c FROM \`' + c.table + '\`'))[0]?.c ?? 0),
    week: Number((await q<any>('SELECT COUNT(*) AS c FROM \`' + c.table + '\` WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)'))[0]?.c ?? 0)
  })))
  const trend = TREND_TABLE
    ? await q<any>('SELECT DATE(created_at) d, COUNT(*) c FROM \`' + TREND_TABLE + '\` WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY d ORDER BY d', [days])
    : []
  const slice = GROUP_COL
    ? await q<any>('SELECT ' + GROUP_COL + ' k, COUNT(*) c FROM \`' + (GROUP_TABLE ?? '') + '\` GROUP BY k ORDER BY c DESC LIMIT 8')
    : []
  return ok({ cards, trend, slice })
})

const CARDS = ${JSON.stringify(cards, null, 2)}
const TREND_TABLE = ${JSON.stringify(trendTable ?? '')}
const GROUP_TABLE = ${JSON.stringify(modules.find(m => m.fields.some(f => f.type === 'enum'))?.tableName ?? '')}
const GROUP_COL = ${JSON.stringify(groupField ? groupField.key : '')}
`,
  }
}

/** 定时任务：cron 调度器 + 手动触发 */
export function jobFiles(): Record<string, string> {
  return {
    'server/utils/scheduler.ts': `import { setTimeout as sleep } from 'node:timers/promises'

/** Minimal 5-field cron matcher — minute granularity, checked every 20s. */
export function cronMatch(cron: string, d = new Date()): boolean {
  const parts = cron.trim().split(/\\s+/)
  if (parts.length !== 5) return false
  const at = [d.getMinutes(), d.getHours(), d.getDate(), d.getMonth() + 1, d.getDay()]
  return parts.every((p, i) => fieldMatch(p, at[i]))
}

function fieldMatch(expr: string, value: number): boolean {
  return expr.split(',').some(term => {
    if (term === '*') return true
    const [range, stepStr] = term.split('/')
    const step = Number(stepStr ?? 1)
    if (!step || Number.isNaN(step)) return false
    if (range === '*') return value % step === 0
    const [from, to] = range.split('-').map(Number)
    if (to === undefined) return value === from && value % step === 0
    return value >= from && value <= to && (value - from) % step === 0
  })
}

export async function runJob(key: string, fn: () => Promise<string>) {
  const started = Date.now()
  try {
    const message = await fn()
    await exec('INSERT INTO sys_job_log (job_key,status,duration,message,created_at) VALUES (?,?,?,?,NOW())', [key, 'success', Date.now() - started, message])
    await exec('UPDATE sys_job SET last_run_at=NOW(), last_result=? WHERE job_key=?', [String(message).slice(0, 255), key])
    return { ok: true, message }
  } catch (e: any) {
    await exec('INSERT INTO sys_job_log (job_key,status,duration,message,created_at) VALUES (?,?,?,?,NOW())', [key, 'failed', Date.now() - started, String(e?.message ?? e)])
    return { ok: false, message: String(e?.message ?? e) }
  }
}
`,
    'server/tasks/index.ts': `/** 任务实现表：job_key -> handler。新增任务在这里注册并在建模/能力配置里声明 cron。 */
export const TASKS: Record<string, { name: string, cron: string, run: () => Promise<string> }> = {
  'cleanup-logs': {
    name: '清理过期日志',
    cron: '15 3 * * *',
    run: async () => {
      const n = (await exec('DELETE FROM sys_operation_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)')).affectedRows
      return '清理 ' + n + ' 条'
    }
  },
  'heartbeat': {
    name: '心跳自检',
    cron: '* * * * *',
    run: async () => {
      const c = Number((await q<any>('SELECT COUNT(*) AS c FROM sys_user'))[0]?.c ?? 0)
      return '在线，用户数 ' + c
    }
  }
}
`,
    'server/plugins/scheduler.ts': `import { cronMatch, runJob } from '../utils/scheduler'

export default defineNitroPlugin(async () => {
  // Tables are created by the init plugin, which nitro may start after us.
  await dbReady
  const { TASKS } = await import('../tasks')
  for (const [key, t] of Object.entries(TASKS)) {
    await exec('INSERT INTO sys_job (job_key,name,cron,status) VALUES (?,?,?,1) ON DUPLICATE KEY UPDATE name=VALUES(name), cron=VALUES(cron)',
      [key, t.name, t.cron])
  }
  let lastMinute = -1
  setInterval(async () => {
    const now = new Date()
    if (now.getMinutes() === lastMinute) return
    lastMinute = now.getMinutes()
    const jobs = await q<any>('SELECT * FROM sys_job WHERE status=1')
    for (const j of jobs) {
      if (!cronMatch(j.cron, now)) continue
      const task = TASKS[j.job_key]
      if (task) await runJob(j.job_key, task.run)
    }
  }, 20_000).unref?.()
})
`,
    'server/api/job/list.get.ts': `export default defineAuthed(async () => {
  const jobs = await q<any>('SELECT * FROM sys_job ORDER BY id')
  return ok(jobs)
})
`,
    'server/api/job/run/[key].post.ts': `export default defineAuthed(async (event) => {
  const key = getRouterParam(event, 'key')!
  const { TASKS } = await import('../../../tasks')
  const task = TASKS[key]
  if (!task) throw createError({ statusCode: 404, message: '任务未注册: ' + key })
  return ok(await runJob(key, task.run))
})
`,
    'server/api/job/log.get.ts': `export default defineAuthed(async (event) => {
  const { job_key } = getQuery(event) as any
  const rows = await q(job_key ? 'SELECT * FROM sys_job_log WHERE job_key=? ORDER BY id DESC LIMIT 100' : 'SELECT * FROM sys_job_log ORDER BY id DESC LIMIT 100',
    job_key ? [job_key] : [])
  return ok(rows)
})
`
  }
}

/** 站内消息 */
export function messageFiles(): Record<string, string> {
  return {
    'server/utils/message.ts': `export async function pushMessage(toUser: string, title: string, content = '', kind = 'notice', link = '') {
  return (await exec('INSERT INTO sys_message (to_user,title,content,kind,is_read,link,created_at) VALUES (?,?,?,?,0,?,NOW())',
    [toUser, title, content, kind, link])).insertId
}
`,
    'server/api/message/mine.get.ts': `export default defineAuthed(async (event) => {
  const me = currentUser(event).username
  const { page = 1, size = 20 } = getQuery(event) as any
  const total = Number((await q<any>('SELECT COUNT(*) AS c FROM sys_message WHERE to_user=?', [me]))[0]?.c ?? 0)
  const unread = Number((await q<any>('SELECT COUNT(*) AS c FROM sys_message WHERE to_user=? AND is_read=0', [me]))[0]?.c ?? 0)
  const list = await q('SELECT * FROM sys_message WHERE to_user=? ORDER BY id DESC LIMIT ? OFFSET ?', [me, Number(size), (Number(page) - 1) * Number(size)])
  return ok({ list, total, unread, page: Number(page), size: Number(size) })
})
`,
    'server/api/message/read/[id].post.ts': `export default defineAuthed(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  await exec('UPDATE sys_message SET is_read=1 WHERE id=? AND to_user=?', [id, currentUser(event).username])
  return ok(true)
})
`,
    'server/api/message/read-all.post.ts': `export default defineAuthed(async (event) => {
  const n = (await exec('UPDATE sys_message SET is_read=1 WHERE to_user=? AND is_read=0', [currentUser(event).username])).affectedRows
  return ok({ read: n })
})
`
  }
}

/** 安全加固：登录失败锁定 + 水印配置。未安装时阈值取极大值，等于关闭。 */
export function guardFiles(p: TenantPlan): Record<string, string> {
  const on = !!p.caps.security
  const maxFails = on ? Number(p.caps.security?.config?.maxFails ?? 5) : 1_000_000
  const lockMinutes = on ? Number(p.caps.security?.config?.lockMinutes ?? 15) : 0
  const watermark = on && p.caps.security?.config?.watermark !== false
  return {
    'server/utils/guard.ts': `const MAX_FAILS = ${maxFails}
const LOCK_MINUTES = ${lockMinutes}

export async function assertNotLocked(username: string) {
  const row = await one<any>('SELECT * FROM sys_login_attempt WHERE username=?', [username]).catch(() => null)
  if (row?.locked_until && new Date(String(row.locked_until).replace(' ', 'T')) > new Date()) {
    throw createError({ statusCode: 429, message: '失败次数过多，请于 ' + row.locked_until + ' 后重试' })
  }
}

export async function noteLoginResult(username: string, passed: boolean) {
  if (passed) { await exec('DELETE FROM sys_login_attempt WHERE username=?', [username]); return }
  await exec(\`INSERT INTO sys_login_attempt (username,fails) VALUES (?,1)
    ON DUPLICATE KEY UPDATE fails=fails+1,
      locked_until=IF(fails+1 >= ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), NULL)\`,
    [username, MAX_FAILS, LOCK_MINUTES])
}
`,
    'server/api/security.get.ts': `export default defineAuthed(() => ok({
  watermark: ${watermark},
  text: ${JSON.stringify(p.title)}
}))
`
  }
}

/** 推广海报与二码：免鉴权落地页读取 + 扫码/浏览埋点接口 */
export function landingPosterFiles(p: TenantPlan): Record<string, string> {
  const heroTitle = JSON.stringify(String(p.caps.landing_poster?.config?.heroTitle ?? '全渠道推广中心'))
  const heroSubtitle = JSON.stringify(String(p.caps.landing_poster?.config?.heroSubtitle ?? '扫码立即体验专属服务'))
  const targetModel = String(p.caps.landing_poster?.config?.targetModel ?? 'channel_qrcode')

  return {
    'server/api/public/landing/[scene].get.ts': `export default defineEventHandler(async (event) => {
  const scene = getRouterParam(event, 'scene') || 'default'
  let channelData: any = null
  try {
    const table = ${JSON.stringify(targetModel)}
    const rows = await q('SELECT * FROM ' + ident(table) + ' WHERE id=? OR channel_code=? LIMIT 1', [scene, scene])
    if (rows && rows.length > 0) {
      channelData = rows[0]
      await exec('UPDATE ' + ident(table) + ' SET pv=pv+1 WHERE id=?', [channelData.id]).catch(() => null)
    }
  } catch (err) {
    // 忽略异常，返回兜底
  }

  return ok({
    scene,
    title: ${heroTitle},
    subtitle: ${heroSubtitle},
    channel: channelData
  })
})
`,
    'server/api/public/landing/scan.post.ts': `export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const scene = String(body.scene || '')
  const reqIp = getRequestHeader(event, 'x-forwarded-for') || event.node?.req?.socket?.remoteAddress || '127.0.0.1'
  const ua = getRequestHeader(event, 'user-agent') || ''

  try {
    await exec(
      'INSERT INTO channel_scan_log (channel_id, ip, user_agent, created_at) VALUES (?, ?, ?, NOW())',
      [Number(body.channel_id || 0) || scene, String(reqIp).slice(0, 64), String(ua).slice(0, 255)]
    ).catch(() => null)

    const targetTable = ${JSON.stringify(targetModel)}
    await exec(
      'UPDATE ' + ident(targetTable) + ' SET uv=uv+1 WHERE id=? OR channel_code=?',
      [scene, scene]
    ).catch(() => null)
  } catch (e) {}

  return ok({ recorded: true })
})
`
  }
}

/** 动态线索收集表单：免鉴权提交接口，基于 Schema 严格校验并写入数据库 */
export function landingFormFiles(p: TenantPlan): Record<string, string> {
  let targetModel = String(p.caps.landing_form?.config?.targetModel ?? '')
  const allModels = (p.models && p.models.length > 0) ? p.models : (p.groups || []).flatMap(g => g.modules || [])
  const matchedMod = allModels.find(m => m.key === targetModel || m.tableName === targetModel || m.table === targetModel || m.name === targetModel)
  if (matchedMod) targetModel = matchedMod.key
  else if (!targetModel && allModels.length > 0) targetModel = allModels[0].key

  return {
    'server/api/public/submit/[res].post.ts': `export default defineEventHandler(async (event) => {
  const res = getRouterParam(event, 'res') || ${JSON.stringify(targetModel)}
  if (!res) throw createError({ statusCode: 400, message: '未指定目标表单模型' })

  const t = tableOf(res)
  const body = await readBody(event).catch(() => ({}))

  const cols: string[] = []
  const vals: any[] = []
  const placeholders: string[] = []

  for (const f of t.fields) {
    if (f.pk || f.key === 'created_at' || f.key === 'updated_at' || f.key === 'deleted_at') continue
    let val = body[f.key]

    // 智能别名容错：若前端传 name/phone/remark 但模型中是 patient_name/mobile 等
    if ((val === undefined || val === null || val === '') && f.key.includes('name') && body.name) {
      val = body.name
    }
    if ((val === undefined || val === null || val === '') && (f.key.includes('phone') || f.key.includes('mobile') || f.key.includes('tel')) && (body.phone || body.mobile || body.tel)) {
      val = body.phone || body.mobile || body.tel
    }
    if ((val === undefined || val === null || val === '') && (f.key.includes('remark') || f.key.includes('desc') || f.key.includes('content') || f.key.includes('note')) && (body.remark || body.note || body.description)) {
      val = body.remark || body.note || body.description
    }

    // 自动为业务单号/流水号（如 appt_no, order_no, sn）生成唯一编号
    if ((val === undefined || val === null || val === '') && (f.key.endsWith('_no') || f.key.endsWith('_sn') || f.key.endsWith('_code') || f.key === 'sn' || f.key === 'no')) {
      const prefix = f.key.replace(/_?(no|sn|code)$/, '').toUpperCase() || 'NO'
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      const rand = Math.floor(1000 + Math.random() * 9000)
      val = \`\${prefix}\${dateStr}\${rand}\`
    }

    // 默认状态与来源兜底
    if ((val === undefined || val === null || val === '') && f.key === 'status') {
      val = 'pending'
    }
    if ((val === undefined || val === null || val === '') && f.key === 'source') {
      val = 'h5'
    }

    if (f.required && (val === undefined || val === null || val === '')) {
      throw createError({ statusCode: 400, message: '请填写【' + f.name + '】' })
    }
    if (val !== undefined && val !== null) {
      cols.push(ident(f.key))
      vals.push(val)
      placeholders.push('?')
    }
  }

  if (cols.length === 0) {
    throw createError({ statusCode: 400, message: '表单数据为空' })
  }

  const sql = 'INSERT INTO ' + ident(t.table) + ' (' + cols.join(',') + ') VALUES (' + placeholders.join(',') + ')'
  const r = await exec(sql, vals)

  return ok({ success: true, id: r.insertId })
})
`
  }
}

/** 前台复合门户：免鉴权列表查询与单条详情读取接口 */
export function landingPortalFiles(p: TenantPlan): Record<string, string> {
  let listModel = String(p.caps.landing_portal?.config?.listModel ?? '')
  const allModels = (p.models && p.models.length > 0) ? p.models : (p.groups || []).flatMap(g => g.modules || [])
  const matchedMod = allModels.find(m => m.key === listModel || m.tableName === listModel || m.table === listModel || m.name === listModel)
  if (matchedMod) listModel = matchedMod.key
  else if (!listModel && allModels.length > 0) listModel = allModels[0].key
  const allowedTable = matchedMod ? String(matchedMod.tableName || matchedMod.table || '') : ''

  return {
    'server/api/public/portal/list.get.ts': `export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const allowedRes = ${JSON.stringify(listModel)}
  const allowedTable = ${JSON.stringify(allowedTable)}
  const defaultRes = allowedRes || Object.keys(TABLES)[0] || ''
  const res = String(query.res || defaultRes)
  if (!res) return ok({ list: [], total: 0, page: 1, pageSize: 10 })

  const t = tableOf(res)
  if (allowedTable && t.table !== allowedTable) {
    throw createError({ statusCode: 403, message: '该业务模型未对外公开' })
  }

  const page = Math.max(1, Number(query.page || 1))
  const pageSize = Math.min(50, Math.max(1, Number(query.pageSize || 10)))
  const offset = (page - 1) * pageSize

  let where = '1=1'
  const params: any[] = []
  if (t.softDelete) where += ' AND deleted_at IS NULL'
  if (query.keyword) {
    const kwField = t.fields.find(f => f.type === 'varchar' && !f.pk)
    if (kwField) {
      where += ' AND ' + ident(kwField.key) + ' LIKE ?'
      params.push('%' + String(query.keyword) + '%')
    }
  }

  const countRow = await one<{ total: number }>('SELECT COUNT(*) AS total FROM ' + ident(t.table) + ' WHERE ' + where, params)
  const total = Number(countRow?.total ?? 0)

  const SENSITIVE_KEYS = new Set(['password', 'jwt_secret', 'salt', 'token', 'secret', 'id_card', 'deleted_at'])
  const safeCols = t.fields.filter(f => !SENSITIVE_KEYS.has(f.key)).map(f => ident(f.key)).join(',') || '*'
  const list = await q('SELECT ' + safeCols + ' FROM ' + ident(t.table) + ' WHERE ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?', [...params, pageSize, offset])

  return ok({ list, total, page, pageSize })
})
`,
    'server/api/public/portal/[id].get.ts': `export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const query = getQuery(event)
  const allowedRes = ${JSON.stringify(listModel)}
  const allowedTable = ${JSON.stringify(allowedTable)}
  const defaultRes = allowedRes || Object.keys(TABLES)[0] || ''
  const res = String(query.res || defaultRes)
  if (!res || !id) throw createError({ statusCode: 400, message: '参数无效' })

  const t = tableOf(res)
  if (allowedTable && t.table !== allowedTable) {
    throw createError({ statusCode: 403, message: '该业务模型未对外公开' })
  }

  const SENSITIVE_KEYS = new Set(['password', 'jwt_secret', 'salt', 'token', 'secret', 'id_card', 'deleted_at'])
  const safeCols = t.fields.filter(f => !SENSITIVE_KEYS.has(f.key)).map(f => ident(f.key)).join(',') || '*'
  const item = await one('SELECT ' + safeCols + ' FROM ' + ident(t.table) + ' WHERE id=?', [id])
  if (!item) throw createError({ statusCode: 404, message: '记录未找到' })

  return ok(item)
})
`
  }
}

/** 官网与内容 CMS：免鉴权公开文章列表与详情接口 */
export function landingCmsFiles(p: TenantPlan): Record<string, string> {
  return {
    'server/api/public/cms/articles.get.ts': `export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const category = query.category ? String(query.category) : ''
  let sql = 'SELECT id, title, category, summary, cover, views, created_at FROM cms_article WHERE status=1'
  const params: any[] = []
  if (category) {
    sql += ' AND category=?'
    params.push(category)
  }
  sql += ' ORDER BY id DESC LIMIT 20'

  const list = await q(sql, params).catch(() => [])
  return ok({ list })
})
`,
    'server/api/public/cms/article/[id].get.ts': `export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, message: '文章ID缺失' })

  const article = await one('SELECT * FROM cms_article WHERE id=? AND status=1', [id])
  if (!article) throw createError({ statusCode: 404, message: '文章未找到或已下线' })

  await exec('UPDATE cms_article SET views=views+1 WHERE id=?', [id]).catch(() => null)

  return ok(article)
})
`
  }
}

