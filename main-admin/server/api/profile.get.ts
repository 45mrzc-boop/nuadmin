import { MENU_MODULES } from './_lib'

export default defineAuthed(async (event) => {
  const me = currentUser(event)
  const row = await one<Record<string, any>>(
    `SELECT id,username,nickname,avatar,status,last_login_at,created_at FROM user WHERE id=?`, [me.uid])
  if (!row) throw createError({ statusCode: 401, message: '账号不存在或已被删除' })
  if (Number(row.status) !== 1) throw createError({ statusCode: 403, message: '账号已被停用' })

  const user = {
    uid: Number(row.id),
    username: row.username,
    nickname: row.nickname ?? '',
    roles: me.roles,
    avatar: row.avatar ?? '',
    status: Number(row.status),
    last_login_at: row.last_login_at ?? null,
    created_at: row.created_at ?? null
  }

  if (me.roles.includes('super')) return ok({ ...user, menus: [...MENU_MODULES] })

  const subjects = [`user:${me.uid}`, ...me.roles.map(r => `role:${r}`)]
  const rules = await q<{ v2: string }>(
    `SELECT DISTINCT v2 FROM casbin_rule WHERE ptype='p' AND v1='main' AND v0 IN (${subjects.map(() => '?').join(',')})`,
    subjects)
  const granted = new Set(rules.map(r => {
    const m = /^\/api\/([a-z-]+)\//.exec(r.v2 ?? '')
    return m ? m[1] : ''
  }).filter(Boolean))

  return ok({ ...user, menus: MENU_MODULES.filter(m => granted.has(m)) })
})
