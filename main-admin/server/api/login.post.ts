import { bodyOf, str } from './_lib'

export default defineEventHandler(async (event) => {
  const body = await bodyOf(event)
  const username = str(body.username).slice(0, 64)
  const password = typeof body.password === 'string' ? body.password : str(body.password)

  const ip = (getRequestHeader(event, 'x-forwarded-for') ?? '').split(',')[0]?.trim()
    || getRequestHeader(event, 'x-real-ip') || ''
  const ua = getRequestHeader(event, 'user-agent') ?? ''
  const writeLog = (flag: number) => run(
    `INSERT INTO login_log (username,ok,ip,ua) VALUES (?,?,?,?)`,
    [username, flag, ip.slice(0, 64), ua.slice(0, 255)])

  if (!username || !password) {
    if (username) await writeLog(0)
    throw createError({ statusCode: 400, message: '请输入账号和密码' })
  }

  const u = await one<Record<string, any>>(`SELECT * FROM user WHERE username=?`, [username])
  if (!u || !verifyPassword(password, u.password)) {
    await writeLog(0)
    throw createError({ statusCode: 401, message: '账号或密码错误' })
  }
  if (Number(u.status) !== 1) {
    await writeLog(0)
    throw createError({ statusCode: 403, message: `账号「${username}」已被停用，请联系管理员` })
  }

  const roles = (await q<{ v1: string }>(
    `SELECT DISTINCT v1 FROM casbin_rule WHERE ptype='g' AND v0=? AND v2 IN ('main','')`,
    [`user:${u.id}`])).map(r => r.v1).filter(Boolean)

  const user = { uid: Number(u.id), username: u.username, nickname: u.nickname ?? '', roles }
  await run(`UPDATE user SET last_login_at=NOW() WHERE id=?`, [u.id])
  await writeLog(1)

  return ok({ token: signToken(user), user })
})
