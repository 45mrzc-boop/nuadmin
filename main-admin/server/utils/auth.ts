import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  uid: number
  username: string
  nickname: string
  roles: string[]
}

// ---------- password ----------
export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(plain, salt, 64).toString('hex')}`
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [algo, salt, hash] = (stored || '').split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const got = scryptSync(plain, salt, 64).toString('hex')
  return got.length === hash.length && timingSafeEqual(Buffer.from(got), Buffer.from(hash))
}

// ---------- jwt ----------
export function signToken(u: AuthUser, secret?: string): string {
  const cfg = useRuntimeConfig()
  return jwt.sign({ uid: u.uid, username: u.username, nickname: u.nickname, roles: u.roles },
    secret ?? cfg.jwt.secret, { expiresIn: cfg.jwt.expiresIn as jwt.SignOptions['expiresIn'] })
}

export function readToken(token?: string): AuthUser | null {
  if (!token) return null
  try {
    const p = jwt.verify(token, useRuntimeConfig().jwt.secret) as jwt.JwtPayload
    return { uid: Number(p.uid), username: String(p.username), nickname: String(p.nickname ?? ''), roles: (p.roles as string[]) ?? [] }
  } catch {
    return null
  }
}

export function bearer(event: any): string | undefined {
  const h = getRequestHeader(event, 'authorization')
  if (h?.startsWith('Bearer ')) return h.slice(7)
  return getQuery(event).token as string | undefined
}

/** Authenticated handler wrapper — rejects with 401 when the token is missing/expired. */
export function defineAuthed<T extends (event: any) => any>(handler: T) {
  return defineEventHandler(async (event) => {
    const user = readToken(bearer(event))
    if (!user) throw createError({ statusCode: 401, message: '未登录或登录已过期' })
    event.context.user = user
    return handler(event)
  })
}

/** Current user; must be called inside a defineAuthed handler. */
export function currentUser(event: any): AuthUser {
  return event.context.user as AuthUser
}
