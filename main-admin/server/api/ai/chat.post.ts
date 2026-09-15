import type { NluModule } from './_nlu'
import { analyze } from './_nlu'
import { asText, bodyOf, messageView, wantId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/ai/:id', 'write')
  const body = await bodyOf(event)
  const sessionId = wantId(body, 'sessionId', '会话 sessionId')
  const content = asText(body.content, 4000)
  if (!content) throw createError({ statusCode: 400, message: '消息内容 content 不能为空' })

  const s = await one<Record<string, any>>(`SELECT * FROM ai_session WHERE id=?`, [sessionId])
  if (!s) throw createError({ statusCode: 404, message: `会话 #${sessionId} 不存在` })
  if (Number(s.user_id) !== currentUser(event).uid) {
    throw createError({ statusCode: 403, message: '只能在自己的会话里发言' })
  }

  const tenantId = s.tenant_id === null ? null : Number(s.tenant_id)
  const tenants = await q<Record<string, any>>(`SELECT id,slug,name FROM tenant ORDER BY id`)
  const caps = await q<{ cap_key: string, name: string, summary: string }>(
    `SELECT cap_key,name,summary FROM capability ORDER BY cap_key`)
  const moduleRows = await q<Record<string, any>>(
    `SELECT id,tenant_id,name,res_key,table_name FROM module ORDER BY id`)
  const fieldRows = moduleRows.length
    ? await q<Record<string, any>>(
      `SELECT module_id,col_key,name FROM module_field WHERE module_id IN (${moduleRows.map(() => '?').join(',')}) ORDER BY sort,id`,
      moduleRows.map(m => m.id))
    : []
  const fieldsByModule = new Map<number, Array<{ key: string, name: string }>>()
  for (const f of fieldRows) {
    const id = Number(f.module_id)
    if (!fieldsByModule.has(id)) fieldsByModule.set(id, [])
    fieldsByModule.get(id)!.push({ key: f.col_key, name: f.name })
  }
  const modules: NluModule[] = moduleRows.map(m => ({
    id: Number(m.id),
    tenant_id: Number(m.tenant_id),
    name: m.name,
    res_key: m.res_key,
    table_name: m.table_name,
    fields: fieldsByModule.get(Number(m.id)) ?? []
  }))

  const action = analyze(content, {
    tenantId,
    tenants: tenants.map(t => ({ id: Number(t.id), slug: t.slug, name: t.name })),
    caps: caps.map(c => ({ cap_key: c.cap_key, name: c.name, summary: c.summary })),
    modules
  })

  await run(
    `INSERT INTO ai_message (session_id,role,content,intent,payload) VALUES (?,?,?, ?,NULL)`,
    [sessionId, 'user', content, action.intent])
  const r = await run(
    `INSERT INTO ai_message (session_id,role,content,intent,payload) VALUES (?,?,?,?,?)`,
    [
      sessionId, 'assistant', action.reply, action.intent,
      JSON.stringify({ tenantId: action.tenantId, intent: action.intent, ...(action.payload ?? {}) })
    ])

  if (String(s.title) === '新对话') {
    await run(`UPDATE ai_session SET title=? WHERE id=?`, [content.slice(0, 30), sessionId])
  }
  if (tenantId === null && action.tenantId) {
    await run(`UPDATE ai_session SET tenant_id=? WHERE id=?`, [action.tenantId, sessionId])
  }

  const message = await one<Record<string, any>>(`SELECT * FROM ai_message WHERE id=?`, [r.insertId])
  return ok({
    message: messageView(message!),
    action: { intent: action.intent, tenantId: action.tenantId, payload: action.payload ?? null }
  })
})
