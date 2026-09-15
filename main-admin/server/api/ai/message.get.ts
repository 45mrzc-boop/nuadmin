import { messageView, numArg } from '../_lib'

export default defineAuthed(async (event) => {
  const sessionId = numArg(event, 'sessionId', 0)
  if (!sessionId) throw createError({ statusCode: 400, message: '缺少查询参数 sessionId' })
  const s = await one<Record<string, any>>(`SELECT * FROM ai_session WHERE id=?`, [sessionId])
  if (!s) throw createError({ statusCode: 404, message: `会话 #${sessionId} 不存在` })
  if (Number(s.user_id) !== currentUser(event).uid) {
    throw createError({ statusCode: 403, message: '只能查看自己的会话' })
  }

  const rows = await q<Record<string, any>>(
    `SELECT * FROM ai_message WHERE session_id=? ORDER BY id`, [sessionId])
  return ok(rows.map(messageView))
})
