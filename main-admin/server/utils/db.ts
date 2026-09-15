import mysql, { type Pool, type PoolConnection } from 'mysql2/promise'

let _pool: Pool | null = null

/** Shared pool for the control-plane database. */
export function useDb(): Pool {
  if (_pool) return _pool
  const { host, port, user, password, name } = useRuntimeConfig().db
  _pool = mysql.createPool({
    host, port, user, password, database: name,
    waitForConnections: true, connectionLimit: 10, queueLimit: 0,
    namedPlaceholders: true, dateStrings: true, charset: 'utf8mb4_unicode_ci'
  })
  return _pool
}

/** A pool bound to another database (used to inspect generated sub-admins). */
export function useDbAt(database: string): Pool {
  const { host, port, user, password } = useRuntimeConfig().db
  return mysql.createPool({ host, port, user, password, database, connectionLimit: 2, dateStrings: true })
}

export async function q<T = any>(sql: string, params: Record<string, unknown> | unknown[] = []): Promise<T[]> {
  const [rows] = await useDb().query(sql, params as any)
  return rows as T[]
}

export async function one<T = any>(sql: string, params: Record<string, unknown> | unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params)
  return rows[0] ?? null
}

export async function run(sql: string, params: Record<string, unknown> | unknown[] = []): Promise<{ insertId: number, affectedRows: number }> {
  const [r] = await useDb().execute(sql, params as any)
  const h = r as { insertId?: number, affectedRows?: number }
  return { insertId: Number(h.insertId ?? 0), affectedRows: Number(h.affectedRows ?? 0) }
}

export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await useDb().getConnection()
  try {
    await conn.beginTransaction()
    const out = await fn(conn)
    await conn.commit()
    return out
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

/** Split on `;` and run each statement — used for DDL bootstrapping only. */
export async function execScript(sql: string, target?: Pool) {
  const pool = target ?? useDb()
  for (const stmt of sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 8)) {
    await pool.query(stmt)
  }
}

/** Guard against identifier injection: only snake_case names ever reach DDL. */
export function ident(name: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw createError({ statusCode: 400, message: `非法标识符: ${name}` })
  return `\`${name}\``
}

export function ok<T>(data: T) {
  return { code: 0, message: 'ok', data }
}

export function paged<T>(list: T[], total: number, page: number, size: number) {
  return { code: 0, message: 'ok', data: { list, total, page, size } }
}
