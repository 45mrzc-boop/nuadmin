import type { TenantPlan, ModuleDef, FieldDef } from './types'
import { allModules, resolveDicts, undefinedDictKeys } from './types'
import type { DictItem } from './types'
import { moduleFields, tableSql, capTableSql, componentOf, isPk, columnSql } from './sql'
import { capSpec } from './app'
import { dictFiles, logFiles, fileFiles, dashboardFiles, jobFiles, messageFiles, guardFiles, landingPosterFiles, landingFormFiles, landingPortalFiles, landingCmsFiles } from './caps'

/** Runtime table registry the generated CRUD engine validates against. */
function tablesDef(p: TenantPlan) {
  const injected = Object.keys(p.caps).flatMap(k => capSpec(k)?.columns ?? [])
  const out: Record<string, any> = {}
  for (const m of allModules(p)) {
    const extra = moduleInjectedColumns(m, p)
    out[m.key] = {
      table: m.tableName,
      name: m.name,
      group: m.group,
      pk: 'id',
      softDelete: !!p.caps.recycle,
      tree: !!p.caps.tree && wantsTree(m),
      flow: !!p.caps.flow,
      fields: [...moduleFields(m), ...extra].map(f => ({
        key: f.key, name: f.name, type: f.type, required: !!f.required,
        unique: !!f.unique, length: f.length ?? 64, dict: f.dict ?? '', rule: f.rule ?? '',
        ruleMsg: f.ruleMsg ?? '', clearable: f.clearable !== false, sortable: !!f.sortable,
        component: componentOf(f), listShow: f.listShow !== false, formShow: f.formShow !== false,
        detailShow: f.detailShow !== false, exportShow: f.exportShow !== false,
        query: f.query ?? (f.type === 'varchar' ? 'like' : 'eq'), default: f.default ?? null
      }))
    }
  }
  void injected
  return out
}

function wantsTree(m: ModuleDef) {
  return m.fields.some(f => f.key === 'parent_id') || /分类|目录|部门|菜单|区域|类目/.test(m.name)
}

function moduleInjectedColumns(m: ModuleDef, p: TenantPlan): FieldDef[] {
  const out: FieldDef[] = []
  if (p.caps.recycle) {
    out.push({ name: '删除时间', key: 'deleted_at', type: 'datetime', listShow: false, formShow: false })
    out.push({ name: '删除人', key: 'deleted_by', type: 'varchar', length: 64, listShow: false, formShow: false, default: '' })
  }
  if (p.caps.flow) {
    out.push({ name: '流程状态', key: 'flow_status', type: 'enum', length: 16, dict: 'flow_status', default: 'draft' })
    out.push({ name: '当前节点', key: 'flow_node', type: 'varchar', length: 64, default: '', listShow: false })
  }
  if (p.caps.tree && wantsTree(m)) {
    out.push({ name: '父级', key: 'parent_id', type: 'int', default: 0, indexed: true, listShow: false, formShow: false })
    out.push({ name: '路径', key: 'path', type: 'varchar', length: 255, default: '/', listShow: false, formShow: false })
    out.push({ name: '层级', key: 'level', type: 'int', default: 1, listShow: false, formShow: false })
  }
  return out.filter(c => !m.fields.some(f => f.key === c.key))
}


/** Full DDL for the sub-admin database. */
export function tenantDdl(p: TenantPlan): string {
  const sys = [
    `CREATE TABLE IF NOT EXISTS \`sys_user\` (
  \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`username\` VARCHAR(64) NOT NULL UNIQUE,
  \`password\` VARCHAR(255) NOT NULL,
  \`nickname\` VARCHAR(64) NOT NULL DEFAULT '',
  \`avatar\` VARCHAR(255) NOT NULL DEFAULT '',
  \`role\` VARCHAR(32) NOT NULL DEFAULT 'admin',
  \`phone\` VARCHAR(32) NOT NULL DEFAULT '',
  \`email\` VARCHAR(128) NOT NULL DEFAULT '',
  \`status\` TINYINT NOT NULL DEFAULT 1,
  \`last_login_at\` DATETIME NULL,
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台用户'`,
    `CREATE TABLE IF NOT EXISTS \`sys_role\` (
  \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`role_id\` VARCHAR(32) NOT NULL UNIQUE,
  \`role_name\` VARCHAR(64) NOT NULL,
  \`parent_id\` VARCHAR(32) NOT NULL DEFAULT '0',
  \`default_router\` VARCHAR(128) NOT NULL DEFAULT '/admin',
  \`remark\` VARCHAR(255) NOT NULL DEFAULT '',
  \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统角色(GVA Authority)'`,
    `CREATE TABLE IF NOT EXISTS \`sys_role_menu\` (
  \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`role_id\` VARCHAR(32) NOT NULL,
  \`menu_path\` VARCHAR(128) NOT NULL,
  \`btn_perms\` TEXT NULL COMMENT '按钮权限如 create,edit,delete,export,detail',
  KEY \`idx_role\` (\`role_id\`),
  UNIQUE KEY \`uk_role_path\` (\`role_id\`, \`menu_path\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色菜单与按钮权限'`,
    `CREATE TABLE IF NOT EXISTS \`casbin_rule\` (
  \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`ptype\` VARCHAR(8) NOT NULL DEFAULT '',
  \`v0\` VARCHAR(128) NOT NULL DEFAULT '',
  \`v1\` VARCHAR(128) NOT NULL DEFAULT '',
  \`v2\` VARCHAR(128) NOT NULL DEFAULT '',
  \`v3\` VARCHAR(128) NOT NULL DEFAULT '',
  \`v4\` VARCHAR(64) NOT NULL DEFAULT '',
  \`v5\` VARCHAR(64) NOT NULL DEFAULT '',
  KEY \`idx_ptype\` (\`ptype\`),
  KEY \`idx_v0\` (\`v0\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='RBAC 策略'`,
    `CREATE TABLE IF NOT EXISTS \`sys_menu\` (
  \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`res_key\` VARCHAR(64) NOT NULL DEFAULT '',
  \`name\` VARCHAR(64) NOT NULL,
  \`icon\` VARCHAR(32) NOT NULL DEFAULT '📄',
  \`path\` VARCHAR(191) NOT NULL DEFAULT '',
  \`grp\` VARCHAR(64) NOT NULL DEFAULT '',
  \`perm\` VARCHAR(128) NOT NULL DEFAULT '',
  \`sort\` INT NOT NULL DEFAULT 0,
  \`hidden\` TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY \`uk_path\` (\`path\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='菜单'`,
    `CREATE TABLE IF NOT EXISTS \`sys_login_attempt\` (
  \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  \`username\` VARCHAR(64) NOT NULL UNIQUE,
  \`fails\` INT NOT NULL DEFAULT 0,
  \`locked_until\` DATETIME NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录失败计数'`
  ]

  // 三套门禁的表全部建出来。模式不再是生成期的决定，而是子后台运行时可切换的配置：
  // 建全表才能让「从成员登录升到完整权限」不需要重新发布版本。
  // 门禁模式的存储位置是子后台自己的 sys_config，不是主后台的 tenant 表。
  const tables = [...sys, `CREATE TABLE IF NOT EXISTS \`sys_gate\` (
  \`id\` TINYINT UNSIGNED PRIMARY KEY,
  \`password\` VARCHAR(255) NOT NULL,
  \`must_change\` TINYINT NOT NULL DEFAULT 0,
  \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='门禁密码（单行）'`,
  `CREATE TABLE IF NOT EXISTS \`sys_config\` (
  \`cfg_key\`   VARCHAR(64)  NOT NULL PRIMARY KEY,
  \`cfg_value\` VARCHAR(255) NOT NULL DEFAULT '',
  \`updated_at\` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运行时配置（含 auth_mode）'`]

  for (const k of Object.keys(p.caps)) {
    for (const t of capSpec(k)?.tables ?? []) {
      // A capability may re-declare a table the base schema already owns.
      if (tables.some(s => s.includes(' `' + t.name + '`'))) continue
      tables.push(capTableSql(t))
    }
  }
  const biz = allModules(p).map(m => tableSql({ ...m, fields: [...m.fields, ...moduleInjectedColumns(m, p)] } as ModuleDef))
  return [...tables, ...biz].join(';\n') + ';\n'
}

/** Menu rows + casbin policies written by the generated init plugin. */
export function tenantBootstrap(p: TenantPlan) {
  const menus: any[] = []
  let sort = 0
  for (const m of allModules(p)) {
    if (m.design.menu.show === false) continue
    menus.push({
      res_key: m.key, name: m.name, icon: m.design.menu.icon || m.icon,
      path: `/admin/${m.key}`, grp: m.group, perm: m.key,
      sort: sort++, hidden: !!m.design.menu.hidden
    })
  }
  for (const k of Object.keys(p.caps)) {
    for (const pg of capSpec(k)?.pages ?? []) {
      const isPublic = (pg as any).surface === 'public' || pg.route.startsWith('/p/') || pg.route.startsWith('/portal') || (pg.route.startsWith('/cms') && !pg.route.startsWith('/admin'))
      // C 端公开页不混入「系统管理」，归入独立「前台运营」分组，避免后台功能与公开入口混淆
      menus.push({
        res_key: pg.key,
        name: pg.name,
        icon: pg.icon,
        path: pg.route,
        grp: isPublic ? '前台运营' : '系统管理',
        perm: pg.key,
        sort: sort++,
        hidden: false
      })
    }
  }
  // GVA 角色管理、用户管理、门禁模式无条件挂载进系统管理菜单
  menus.push({ res_key: 'system_role', name: '角色管理', icon: '🛡️', path: '/admin/system/role', grp: '系统管理', perm: 'system:role', sort: sort++, hidden: false })
  menus.push({ res_key: 'system_user', name: '用户管理', icon: '👥', path: '/admin/system/user', grp: '系统管理', perm: 'system:user', sort: sort++, hidden: false })
  menus.push({ res_key: 'auth_mode', name: '门禁模式', icon: '🚪', path: '/admin/system/auth', grp: '系统管理', perm: 'auth_mode', sort: sort++, hidden: false })
  const perms = [...allModules(p).map(m => m.key), ...menus.map(m => m.perm)]
  const unique = [...new Set(perms)]
  return { menus, perms: unique }
}

/** Columns that a re-generated schema adds on top of tables that already exist. */
function migrationSql(p: TenantPlan) {
  const out: Array<{ table: string, column: string, ddl: string }> = []
  for (const m of allModules(p)) {
    for (const c of moduleInjectedColumns(m, p)) {
      out.push({ table: m.tableName, column: c.key, ddl: columnSql(c).replace(`\`${c.key}\``, '') })
    }
  }
  // Capability tables need the same reconciliation. Without it, adding a field
  // to a capability spec (or upgrading a capability) never reaches an existing
  // database: CREATE TABLE IF NOT EXISTS silently keeps the old narrow shape.
  for (const k of Object.keys(p.caps)) {
    for (const t of capSpec(k)?.tables ?? []) {
      for (const c of t.fields) {
        if (isPk(c)) continue
        out.push({ table: t.name, column: c.key, ddl: columnSql(c).replace(`\`${c.key}\``, '') })
      }
    }
  }
  // 确保系统表（如 sys_user）在版本迭代时新加的列能够被已有租户库自动通过 applyMigrations 补齐
  out.push(
    { table: 'sys_user', column: 'phone', ddl: ' VARCHAR(32) DEFAULT ""' },
    { table: 'sys_user', column: 'email', ddl: ' VARCHAR(128) DEFAULT ""' },
    { table: 'sys_user', column: 'updated_at', ddl: ' DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
  )
  return out
}

/** GVA 风格 API 权限树注册清单 */
export function buildApiTree(p: TenantPlan) {
  const tree: Array<{
    group: string,
    apis: Array<{ name: string, method: string, path: string, desc: string }>
  }> = []

  const bizApis: Array<{ name: string, method: string, path: string, desc: string }> = []
  for (const m of allModules(p)) {
    bizApis.push(
      { name: m.name + ' - 列表查询', method: 'GET', path: `/api/${m.key}/list`, desc: `分页获取${m.name}列表数据` },
      { name: m.name + ' - 详情查询', method: 'GET', path: `/api/${m.key}/get`, desc: `根据主键查询${m.name}详情` },
      { name: m.name + ' - 创建记录', method: 'POST', path: `/api/${m.key}/create`, desc: `新增一条${m.name}数据` },
      { name: m.name + ' - 更新记录', method: 'PATCH', path: `/api/${m.key}/update`, desc: `修改${m.name}数据` },
      { name: m.name + ' - 删除记录', method: 'DELETE', path: `/api/${m.key}/remove`, desc: `删除${m.name}数据` },
      { name: m.name + ' - 数据导出', method: 'GET', path: `/api/${m.key}/export`, desc: `导出${m.name}为 Excel/CSV` },
      { name: m.name + ' - 批量操作', method: 'POST', path: `/api/${m.key}/batch`, desc: `批量删除或批量更新状态` }
    )
  }
  tree.push({ group: '业务模块', apis: bizApis })

  const sysApis: Array<{ name: string, method: string, path: string, desc: string }> = [
    { name: '用户管理 - 用户列表', method: 'GET', path: '/api/system/user/list', desc: '分页查询后台用户列表' },
    { name: '用户管理 - 创建用户', method: 'POST', path: '/api/system/user/create', desc: '新增后台用户账号并分配角色' },
    { name: '用户管理 - 更新用户', method: 'PATCH', path: '/api/system/user/update', desc: '更新用户基本信息与角色分配' },
    { name: '用户管理 - 删除用户', method: 'POST', path: '/api/system/user/delete', desc: '移除后台成员账号' },
    { name: '用户管理 - 重置密码', method: 'POST', path: '/api/system/user/reset-pwd', desc: '重置指定用户的登录密码' },
    { name: '角色管理 - 角色列表', method: 'GET', path: '/api/system/role/list', desc: '获取系统所有权限角色' },
    { name: '角色管理 - 创建角色', method: 'POST', path: '/api/system/role/create', desc: '创建新角色与权限组' },
    { name: '角色管理 - 更新角色', method: 'PATCH', path: '/api/system/role/update', desc: '修改角色名称与备注' },
    { name: '角色管理 - 删除角色', method: 'POST', path: '/api/system/role/delete', desc: '删除角色及其权限策略' },
    { name: '角色管理 - 获取菜单权限', method: 'GET', path: '/api/system/role/menus', desc: '读取角色绑定的菜单与按钮权限' },
    { name: '角色管理 - 分配菜单权限', method: 'POST', path: '/api/system/role/menus', desc: '更新角色绑定的菜单与按钮权限' },
    { name: '角色管理 - 获取API策略', method: 'GET', path: '/api/system/role/casbin', desc: '读取角色绑定的 Casbin 策略' },
    { name: '角色管理 - 分配API策略', method: 'POST', path: '/api/system/role/casbin', desc: '保存角色绑定的 Casbin 策略' },
    { name: '系统接口 - 获取API权限树', method: 'GET', path: '/api/system/api/tree', desc: '获取全系统注册的 API 权限清单' },
    { name: '门禁模式 - 获取门禁配置', method: 'GET', path: '/api/system/auth-mode', desc: '获取当前门禁安全模式' },
    { name: '门禁模式 - 切换门禁模式', method: 'POST', path: '/api/system/auth-mode', desc: '切换门禁强度 (simple/users/rbac)' }
  ]
  tree.push({ group: '系统管理', apis: sysApis })

  return tree
}

/** Generated server-side source files. */
export function serverFiles(p: TenantPlan): Record<string, string> {
  const bs = tenantBootstrap(p)
  const dictSeed = buildDictSeed(p)

  const files: Record<string, string> = {
    'server/utils/db.ts': `import mysql, { type Pool } from 'mysql2/promise'

let _pool: Pool | null = null
export function useDb(): Pool {
  if (_pool) return _pool
  const { host, port, user, password, name } = useRuntimeConfig().db
  _pool = mysql.createPool({ host, port, user, password, database: name, connectionLimit: 10, dateStrings: true, charset: 'utf8mb4_unicode_ci' })
  return _pool
}
export async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await useDb().execute(sql, params as any)
  return rows as T[]
}
export async function one<T = any>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(sql, params))[0] ?? null
}
export async function exec(sql: string, params: unknown[] = []): Promise<{ insertId: number, affectedRows: number }> {
  const [r] = await useDb().execute(sql, params as any)
  const h = r as any
  return { insertId: Number(h.insertId ?? 0), affectedRows: Number(h.affectedRows ?? 0) }
}
export async function execScript(sql: string) {
  for (const s of sql.split(/;\\s*\\n/).map(x => x.trim()).filter(x => x.length > 8)) await useDb().query(s)
}
export function ident(name: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw createError({ statusCode: 400, message: '非法标识符 ' + name })
  return '\`' + name + '\`'
}
export const ok = <T,>(data: T) => ({ code: 0, message: 'ok', data })

/**
 * Nitro does not guarantee plugin execution order, so any plugin that touches
 * tables must await this rather than racing the init plugin that creates them.
 */
let _isReady = false
let _resolveReady: () => void
export const dbReady = new Promise<void>((r) => { _resolveReady = () => { _isReady = true; r() } })
export function markDbReady() { _resolveReady() }
export function isDbReady(): boolean { return _isReady }
`,

    'server/utils/schema.ts': `// GENERATED — 表结构与初始化数据。修改业务模型请回到主后台建模站重新生成。
export const DDL = ${JSON.stringify(tenantDdl(p))}

export const MENUS = ${JSON.stringify(bs.menus, null, 2)}

export const PERMS = ${JSON.stringify(bs.perms, null, 2)}

export const DICTS = ${JSON.stringify(dictSeed, null, 2)}
export const DICT_NAMES: Record<string, string> = ${JSON.stringify(p.dictNames ?? {}, null, 2)}

/** Capability-injected columns that a pre-existing table may still be missing. */
export const MIGRATIONS = ${JSON.stringify(migrationSql(p), null, 2)}

/** 设计站配置的成员与角色矩阵，仅 rbac/users 模式有意义。 */
export const MEMBERS = ${JSON.stringify((p.authConfig.members ?? []).filter(x => x.username))}
export const ROLES = ${JSON.stringify(p.authConfig.roles ?? [])}
`,

    'server/utils/tables.ts': `import type { TableDef } from './types'
export const TABLES: Record<string, TableDef> = ${JSON.stringify(tablesDef(p), null, 2)}

export function tableOf(resKey: string): TableDef {
  const t = TABLES[resKey] || Object.values(TABLES).find(t => t.table === resKey)
  if (!t) throw createError({ statusCode: 404, message: '未知资源: ' + resKey })
  return t
}
`,

    'server/utils/types.ts': `export interface FieldDef {
  key: string; name: string; type: string; required: boolean; unique: boolean
  length: number; dict: string; rule: string; ruleMsg: string; component: string
  listShow: boolean; formShow: boolean; query: string; default: unknown
  /** 更新时允许把值清成 NULL。关掉后前端清空也不会写回。 */
  clearable: boolean
  /** 列表可按此列排序；没勾的列 safeSort 会拒绝，避免拿任意列名拖慢查询。 */
  sortable: boolean
  detailShow: boolean; exportShow: boolean
}
export interface TableDef {
  table: string; name: string; group: string; pk: string
  softDelete: boolean; tree: boolean; flow: boolean
  fields: FieldDef[]
}
`,

    'server/utils/auth.ts': `import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { newEnforcer, newModelFromString, StringAdapter, type Enforcer } from 'casbin'

export interface AuthUser { uid: number, username: string, nickname: string, role: string }

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex')
  return 'scrypt$' + salt + '$' + scryptSync(plain, salt, 64).toString('hex')
}
export function verifyPassword(plain: string, stored: string): boolean {
  const [algo, salt, hash] = String(stored || '').split('$')
  if (algo !== 'scrypt' || !salt || !hash) return false
  const got = scryptSync(plain, salt, 64).toString('hex')
  return got.length === hash.length && timingSafeEqual(Buffer.from(got), Buffer.from(hash))
}

export function signToken(u: AuthUser): string {
  const cfg = useRuntimeConfig()
  return jwt.sign({ ...u }, cfg.jwt.secret, { expiresIn: cfg.jwt.expiresIn as any })
}
export function readToken(token?: string): AuthUser | null {
  if (!token) return null
  try {
    const p = jwt.verify(token, useRuntimeConfig().jwt.secret) as any
    return { uid: Number(p.uid), username: String(p.username), nickname: String(p.nickname ?? ''), role: String(p.role ?? 'admin') }
  } catch { return null }
}
function bearer(event: any): string | undefined {
  const h = getRequestHeader(event, 'authorization')
  if (h?.startsWith('Bearer ')) return h.slice(7)
  return getQuery(event).token as string | undefined
}

export function defineAuthed<T extends (event: any) => any>(handler: T) {
  return defineEventHandler(async (event) => {
    const user = readToken(bearer(event))
    if (!user) throw createError({ statusCode: 401, message: '未登录或登录已过期' })
    event.context.user = user
    return handler(event)
  })
}
export const currentUser = (event: any): AuthUser => event.context.user

export type AuthMode = 'simple' | 'users' | 'rbac'

/** 模式中文名。切换界面和登录页文案共用，避免两边各写一份。 */
export const AUTH_MODE_LABELS: Record<AuthMode, string> = {
  simple: '简单密码（单一门禁口令）',
  users: '成员登录（有账号，不做权限区分）',
  rbac: '完整权限控制（角色 + Casbin 策略）'
}

/**
 * 门禁模式存在子后台自己的 sys_config 里，运行期可切换 —— 主后台只负责发布版本，
 * 不代替租户决定鉴权强度。DEFAULT_AUTH_MODE 是发布时给的初值，库里没记录时用它。
 */
export const DEFAULT_AUTH_MODE = ${JSON.stringify(p.authMode || 'users')} as AuthMode

let _mode: AuthMode | null = null
export function invalidateAuthMode() { _mode = null }

export async function authMode(): Promise<AuthMode> {
  if (_mode) return _mode
  const row = await one<any>(\`SELECT cfg_value FROM sys_config WHERE cfg_key='auth_mode'\`)
  const v = String(row?.cfg_value ?? '')
  _mode = v === 'simple' || v === 'users' || v === 'rbac' ? v : DEFAULT_AUTH_MODE
  return _mode
}

/** 切换模式。改完必须让模式缓存和 Casbin 都重建，否则会出现"已切换但仍在按旧模式放行"。 */
export async function setAuthMode(m: AuthMode) {
  if (m !== 'simple' && m !== 'users' && m !== 'rbac') {
    throw createError({ statusCode: 400, message: \`门禁模式只能是 simple / users / rbac，当前 \${m}\` })
  }
  await exec(
    \`INSERT INTO sys_config (cfg_key, cfg_value) VALUES ('auth_mode', ?)
     ON DUPLICATE KEY UPDATE cfg_value = VALUES(cfg_value)\`, [m])
  invalidateAuthMode()
  invalidateCasbin()
}

// ---- Casbin RBAC（只在模式为 rbac 时参与判定）----
const MODEL = \`
[request_definition]
r = sub, dom, obj, act
[policy_definition]
p = sub, dom, obj, act
[role_definition]
g = _, _, _
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && keyMatch2(r.obj, p.obj) && (p.act == "*" || r.act == p.act)
\`

let _enf: Enforcer | null = null
export function invalidateCasbin() { _enf = null }

export async function enforcer(): Promise<Enforcer> {
  if (_enf) return _enf
  const rows = await q<any>('SELECT ptype,v0,v1,v2,v3,v4,v5 FROM casbin_rule ORDER BY id')
  const text = rows.map((r: any) => [r.ptype, r.v0, r.v1, r.v2, r.v3, r.v4, r.v5].filter((v: string) => v !== '').join(', ')).join('\\n')
  _enf = await newEnforcer(newModelFromString(MODEL), new StringAdapter(text))
  return _enf
}

/** 角色继承：同步 Casbin g 规则 (g, role:<child>, role:<parent>, <dom>) */
export async function syncRoleHierarchy(roleId: string, parentId: string, dom: string) {
  await exec('DELETE FROM casbin_rule WHERE ptype="g" AND v0=? AND v2=?', ['role:' + roleId, dom])
  if (parentId && parentId !== '0') {
    await exec('INSERT INTO casbin_rule (ptype, v0, v1, v2) VALUES ("g", ?, ?, ?)', ['role:' + roleId, 'role:' + parentId, dom])
  }
  invalidateCasbin()
}

/** 获取角色的全部祖先角色链（GVA 角色继承多级回溯） */
export async function getRoleAncestors(roleId: string): Promise<string[]> {
  const list: string[] = []
  let cur = roleId
  const seen = new Set<string>()
  while (cur && cur !== '0' && !seen.has(cur)) {
    seen.add(cur)
    const row = await one<any>('SELECT parent_id FROM sys_role WHERE role_id=?', [cur])
    if (row && row.parent_id && row.parent_id !== '0') {
      list.push(row.parent_id)
      cur = row.parent_id
    } else {
      break
    }
  }
  return list
}

/**
 * simple / users 不做权限判定：能进门即全权。
 * rbac 下 admin 角色直通，其余按 casbin_rule 逐条判定。
 * 剥离 /preview/<slug> 代理前缀，保证按精确路径 /api/res/act 或通配符统一命中。
 */
export async function authorize(event: any, resKey: string, act: string) {
  const u = currentUser(event)
  if (await authMode() !== 'rbac') return u
  if (u.role === 'admin') return u
  const e = await enforcer()
  const dom = ${JSON.stringify(p.slug)}
  const rawPath = event.node?.req?.url ? event.node.req.url.split('?')[0] : (event.path?.split('?')[0] || '')
  const prefix = '/preview/' + dom
  const reqPath = rawPath.startsWith(prefix) ? (rawPath.slice(prefix.length) || '/') : rawPath
  const httpMethod = String(event.method || event.node?.req?.method || '').toUpperCase()
  const allowed = (await e.enforce('role:' + u.role, dom, reqPath, act)) ||
                  (Boolean(httpMethod) && await e.enforce('role:' + u.role, dom, reqPath, httpMethod)) ||
                  (await e.enforce('role:' + u.role, dom, reqPath, '*')) ||
                  (await e.enforce('role:' + u.role, dom, '/api/' + resKey + '/*', act)) ||
                  (Boolean(httpMethod) && await e.enforce('role:' + u.role, dom, '/api/' + resKey + '/*', httpMethod)) ||
                  (await e.enforce('role:' + u.role, dom, '/api/' + resKey + '/*', '*'))
  if (!allowed) {
    throw createError({ statusCode: 403, message: '无权限访问: ' + resKey + ' ' + act })
  }
  return u
}

export async function canAccessSystem(role: string): Promise<boolean> {
  if (role === 'admin') return true
  const row = await one<any>('SELECT id FROM sys_role_menu WHERE role_id=? AND menu_path LIKE ?', [role, '/admin/system%'])
  return !!row
}
`,

    'server/utils/validate.ts': `import type { TableDef, FieldDef } from './types'

const RULES: Record<string, RegExp> = {
  email: /^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$/,
  phone: /^1[3-9]\\d{9}$/,
  url: /^https?:\\/\\/.+/,
  number: /^-?\\d+(\\.\\d+)?$/
}

/** Coerce + validate an incoming payload against the table registry.
 *  Returns only columns that really exist, so a crafted body can never reach SQL. */
export function pickFields(t: TableDef, body: Record<string, any>, partial = false): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of t.fields) {
    if (f.key === 'id' || !f.formShow) continue
    if (!(f.key in body)) {
      if (f.default != null && f.default !== '') { out[f.key] = f.default; continue }
      // A missing required field must fail here, not later as a MySQL error.
      if (f.required && !partial) throw createError({ statusCode: 400, message: f.name + ' 不能为空' })
      continue
    }
    const v = body[f.key]
    const picked = normalize(f, v)
    // 「是否可清空」=关 时，更新传空当作"这列不动"，而不是把已有值写成 NULL。
    if (partial && picked === null && f.clearable === false) continue
    out[f.key] = picked
    const err = check(f, out[f.key], partial)
    if (err) throw createError({ statusCode: 400, message: f.name + ' ' + err })
  }
  return out
}

function normalize(f: FieldDef, v: unknown): unknown {
  if (v === '' || v === undefined) return null
  switch (f.type) {
    case 'bool': return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0
    case 'int': return v === null ? null : Number(v)
    case 'fk': return (f.refValue && f.refValue !== 'id') ? String(v) : (v === null ? null : Number(v))
    case 'decimal':
    case 'money': return v === null ? null : Number(v).toFixed(f.length && false ? 2 : 2)
    case 'json': return typeof v === 'string' ? v : JSON.stringify(v)
    case 'datetime': return v === null ? null : String(v).replace('T', ' ').slice(0, 19)
    case 'date': return v === null ? null : String(v).slice(0, 10)
    default: {
      const s = String(v)
      return s.length > f.length ? s.slice(0, f.length) : s
    }
  }
}

function check(f: FieldDef, v: unknown, partial: boolean): string | null {
  const empty = v === null || v === undefined || v === ''
  if (empty) {
    if (f.required && !partial && f.default == null) return '不能为空'
    return null
  }
  // 建模站填了「校验失败文案」就用它，否则退回通用说法。
  if (f.rule && RULES[f.rule] && !RULES[f.rule].test(String(v))) return f.ruleMsg || '格式不正确'
  if (['varchar'].includes(f.type) && String(v).length > f.length) return '超出长度限制'
  if (['int', 'decimal', 'money'].includes(f.type) && Number.isNaN(Number(v))) return '必须是数字'
  return null
}

/** Whitelisted ORDER BY — never interpolate user input directly. */
export function safeSort(t: TableDef, sort?: string, order?: string): string {
  // 只认建模站勾了「是否排序」的列。之前任何可见列都能排，
  // 等于把未加索引的列暴露成 ORDER BY 入口，大表上能被拖成慢查询。
  const f = t.fields.find(x => x.key === sort && x.sortable)
  if (!f) return 'ORDER BY \`id\` DESC'
  return 'ORDER BY \`' + f.key + '\` ' + (String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC')
}
`,

    'server/utils/crud.ts': `import type { TableDef } from './types'
import { ident } from './db'
import { safeSort } from './validate'

export interface ListQuery { page?: number, size?: number, sort?: string, order?: string, [k: string]: any }

/** Shared list engine: query operators (eq/like/range/in) + paging + soft-delete scope. */
export async function list(t: TableDef, query: ListQuery, where: Record<string, unknown> = {}) {
  const page = Math.max(Number(query.page ?? 1), 1)
  const size = Math.min(Math.max(Number(query.size ?? 10), 1), 200)
  const sql: string[] = []
  const params: unknown[] = []
  for (const f of t.fields) {
    const v = query[f.key]
    if (v === undefined || v === '' || v === null) continue
    const col = ident(f.key)
    switch (f.query) {
      case 'like': sql.push(col + ' LIKE ?'); params.push('%' + String(v) + '%'); break
      case 'ne': sql.push(col + ' <> ?'); params.push(v); break
      case 'gt': sql.push(col + ' > ?'); params.push(v); break
      case 'ge': sql.push(col + ' >= ?'); params.push(v); break
      case 'lt': sql.push(col + ' < ?'); params.push(v); break
      case 'le': sql.push(col + ' <= ?'); params.push(v); break
      // 不为空是纯条件，不吃参数
      case 'notnull': sql.push(col + ' IS NOT NULL'); break
      case 'range': {
        const [a, b] = String(v).split(',')
        if (a) { sql.push(col + ' >= ?'); params.push(a) }
        if (b) { sql.push(col + ' <= ?'); params.push(b) }
        break
      }
      case 'in': {
        const arr = String(v).split(',').filter(Boolean)
        if (arr.length) { sql.push(col + ' IN (' + arr.map(() => '?').join(',') + ')'); params.push(...arr) }
        break
      }
      case 'none': break
      default: sql.push(col + ' = ?'); params.push(v)
    }
  }
  for (const [k, v] of Object.entries(where)) { sql.push(ident(k) + ' = ?'); params.push(v) }
  if (t.softDelete) sql.push('deleted_at IS NULL')
  const whereSql = sql.length ? 'WHERE ' + sql.join(' AND ') : ''
  const total = Number((await q<any>('SELECT COUNT(*) AS c FROM ' + ident(t.table) + ' ' + whereSql, params))[0]?.c ?? 0)
  const rows = await q(
    'SELECT * FROM ' + ident(t.table) + ' ' + whereSql + ' ' + safeSort(t, query.sort, query.order) + ' LIMIT ? OFFSET ?',
    [...params, size, (page - 1) * size])
  return { list: rows, total, page, size }
}

export async function detail(t: TableDef, id: number) {
  const soft = t.softDelete ? ' AND deleted_at IS NULL' : ''
  return (await q('SELECT * FROM ' + ident(t.table) + ' WHERE ' + ident(t.pk) + ' = ?' + soft, [id]))[0] ?? null
}

export async function create(t: TableDef, data: Record<string, unknown>, operator = '') {
  const keys = Object.keys(data)
  if (!keys.length) throw createError({ statusCode: 400, message: '没有可写入的字段' })
  const cols = keys.map(ident).join(',')
  const sql = 'INSERT INTO ' + ident(t.table) + ' (' + cols + (operator && hasCol(t, 'created_by') ? ',created_by' : '') + ') VALUES (' +
    keys.map(() => '?').join(',') + (operator && hasCol(t, 'created_by') ? ',?' : '') + ')'
  const params = keys.map(k => data[k])
  if (operator && hasCol(t, 'created_by')) params.push(operator)
  let insertId: number
  try {
    insertId = (await exec(sql, params)).insertId
  } catch (e: any) {
    throw friendlyDbError(t, e)
  }
  return await detail(t, insertId)
}

/** Turns raw MySQL driver errors into a 4xx the UI can show verbatim. */
export function friendlyDbError(t: TableDef, e: any) {
  const msg = String(e?.message ?? e)
  if (e?.code === 'ER_DUP_ENTRY' || /Duplicate entry/i.test(msg)) {
    const uniq = msg.match(/for key '(?:[^.]*\.)?([^']+)'/)?.[1] ?? ''
    const f = t.fields.find(x => x.key === uniq || uniq.endsWith('_unique'))
    throw createError({ statusCode: 409, message: (f?.name ?? uniq) + ' 已存在，不能重复' })
  }
  if (/doesn't have a default value/i.test(msg)) {
    const col = msg.match(/Field '([^']+)'/)?.[1] ?? ''
    const f = t.fields.find(x => x.key === col)
    throw createError({ statusCode: 400, message: (f?.name ?? col) + ' 为必填项' })
  }
  throw createError({ statusCode: 400, message: '数据写入失败：' + msg.slice(0, 160) })
}

export async function update(t: TableDef, id: number, data: Record<string, unknown>) {
  const keys = Object.keys(data)
  if (!keys.length) return await detail(t, id)
  const set = keys.map(k => ident(k) + ' = ?').join(',')
  const stamp = hasCol(t, 'updated_at') ? ',updated_at = NOW()' : ''
  try {
    await exec('UPDATE ' + ident(t.table) + ' SET ' + set + stamp + ' WHERE ' + ident(t.pk) + ' = ?', [...keys.map(k => data[k]), id])
  } catch (e: any) {
    throw friendlyDbError(t, e)
  }
  return await detail(t, id)
}

export async function remove(t: TableDef, ids: number[], operator = '') {
  if (!ids.length) return 0
  const ph = ids.map(() => '?').join(',')
  if (t.softDelete) {
    await exec('UPDATE ' + ident(t.table) + ' SET deleted_at = NOW()' + (hasCol(t, 'deleted_by') ? ',deleted_by = ?' : '') +
      ' WHERE ' + ident(t.pk) + ' IN (' + ph + ')', hasCol(t, 'deleted_by') ? [operator, ...ids] : ids)
    return ids.length
  }
  return (await exec('DELETE FROM ' + ident(t.table) + ' WHERE ' + ident(t.pk) + ' IN (' + ph + ')', ids)).affectedRows
}

/** Materialised path/level refresh for tree-enabled tables. */
export async function rebuildTree(t: TableDef, id: number) {
  if (!t.tree) return
  const row = await one<any>('SELECT id,parent_id FROM ' + ident(t.table) + ' WHERE id=?', [id])
  if (!row) return
  let path = '/' + id + '/'
  let level = 1
  if (row.parent_id) {
    const parent = await one<any>('SELECT path,level FROM ' + ident(t.table) + ' WHERE id=?', [row.parent_id])
    if (parent) { path = (parent.path || '/') + id + '/'; level = Number(parent.level) + 1 }
  }
  await exec('UPDATE ' + ident(t.table) + ' SET path=?,level=? WHERE id=?', [path, level, id])
  const kids = await q<any>('SELECT id FROM ' + ident(t.table) + ' WHERE parent_id=?', [id])
  for (const k of kids) await rebuildTree(t, Number(k.id))
}

export function toCsv(t: TableDef, rows: any[]): string {
  // 导出列认建模站的「导入/导出」开关；一个都没勾时退回列表列，
  // 否则老模型升级后导出会直接变成空文件，用户看不出原因。
  const picked = t.fields.filter(f => f.exportShow)
  const cols = picked.length ? picked : t.fields.filter(f => f.listShow)
  const head = cols.map(c => c.name).join(',')
  const body = rows.map(r => cols.map(c => {
    const v = r[c.key] ?? ''
    const s = String(v).replace(/"/g, '""')
    return /[",\\n]/.test(s) ? '"' + s + '"' : s
  }).join(',')).join('\\n')
  return '\\ufeff' + head + '\\n' + body
}

const hasCol = (t: TableDef, key: string) => t.fields.some(f => f.key === key)
`,

    'server/plugins/init.ts': `import mysql from 'mysql2/promise'
import { DDL, MENUS, PERMS, DICTS, DICT_NAMES, MIGRATIONS, MEMBERS, ROLES } from '../utils/schema'
import { hashPassword } from '../utils/auth'
import { invalidateCasbin } from '../utils/auth'

export default defineNitroPlugin(async () => {
  const cfg = useRuntimeConfig().db
  const boot = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password })
  await boot.query('CREATE DATABASE IF NOT EXISTS \`' + cfg.name + '\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await boot.end()

  await execScript(DDL)
  await applyMigrations()

  // 门禁模式存在库里、可运行时切换，所以三套数据都灌：切到哪个模式立刻有对应支撑，
  // 不需要重新发布版本。未用到的表留空即可。仅当库中不存在时初始化，不覆盖运行时配置。
  if (!(await one("SELECT cfg_key FROM sys_config WHERE cfg_key='auth_mode'"))) {
    await exec("INSERT INTO sys_config (cfg_key,cfg_value) VALUES ('auth_mode',?)", [DEFAULT_AUTH_MODE])
  }
  // 简单密码：单行门禁。发布时没给密码就用默认值并标记需修改。
  if (!(await one('SELECT id FROM sys_gate WHERE id=1'))) {
    const configured = ${JSON.stringify(p.authConfig.password ?? '')}
    await exec('INSERT INTO sys_gate (id,password,must_change) VALUES (1,?,?)',
      [hashPassword(configured || 'admin123'), configured ? 0 : 1])
  }
  // 固定超级管理员：主后台发布完就能直接登录，不需要额外建号流程。
  if (!(await one('SELECT id FROM sys_user WHERE username=?', ['admin']))) {
    await exec('INSERT INTO sys_user (username,password,nickname,role) VALUES (?,?,?,?)',
      ['admin', hashPassword('admin123'), '管理员', 'admin'])
  }
  // 成员放在 admin 守卫之外，重新生成时才能把后加的成员带进已有库。
  for (const mm of MEMBERS) {
    if (!mm.username || await one('SELECT id FROM sys_user WHERE username=?', [mm.username])) continue
    await exec('INSERT INTO sys_user (username,password,nickname,role) VALUES (?,?,?,?)',
      [mm.username, hashPassword('admin123'), mm.name || mm.username, mm.role || 'editor'])
  }
  // dom 必须与 authorize() 里的 slug 一致，不一致会让非 admin 角色全部静默拒绝。
  const DOM = ${JSON.stringify(p.slug)}

  // 1. 初始化标准角色（admin/editor/viewer）
  const defaultRoles = [
    { id: 'admin', name: '超级管理员', parent: '0', remark: '最高权限，管理全站' },
    { id: 'editor', name: '业务运营', parent: '0', remark: '拥有业务模块读写权限，无系统配置权限' },
    { id: 'viewer', name: '只读访客', parent: '0', remark: '仅拥有查询与查看详情权限' }
  ]
  for (const r of defaultRoles) {
    await exec(\`INSERT INTO sys_role (role_id, role_name, parent_id, remark)
      VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE role_name=VALUES(role_name), remark=VALUES(remark)\`,
      [r.id, r.name, r.parent, r.remark])
  }

  // 2. 初始化菜单表（确保唯一索引，全量 upsert 同步落库）
  try {
    await exec('DELETE m1 FROM sys_menu m1 INNER JOIN sys_menu m2 WHERE m1.id > m2.id AND m1.path = m2.path')
    await exec('ALTER TABLE sys_menu ADD UNIQUE KEY uk_path (path)')
  } catch {}
  for (const m of MENUS) {
    await exec(\`INSERT INTO sys_menu (res_key,name,icon,path,grp,perm,sort,hidden) VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE name=VALUES(name), icon=VALUES(icon), grp=VALUES(grp), sort=VALUES(sort)\`,
      [m.res_key, m.name, m.icon, m.path, m.grp, m.perm, m.sort, m.hidden ? 1 : 0])
  }

  // 3. 初始化角色菜单与按钮权限 (sys_role_menu) - 仅当未初始化时注入预置权限，保护用户后续调整
  if (!(await one('SELECT id FROM sys_role_menu LIMIT 1'))) {
    for (const m of MENUS) {
      // admin 拥有全量菜单与按钮
      await exec(\`INSERT INTO sys_role_menu (role_id, menu_path, btn_perms)
        VALUES ('admin', ?, 'create,edit,delete,export,detail')
        ON DUPLICATE KEY UPDATE btn_perms='create,edit,delete,export,detail'\`, [m.path])
      // editor 拥有业务模块完整按钮权限
      if (m.grp !== '系统管理' && m.grp !== '前台运营') {
        await exec(\`INSERT INTO sys_role_menu (role_id, menu_path, btn_perms)
          VALUES ('editor', ?, 'create,edit,delete,export,detail')
          ON DUPLICATE KEY UPDATE btn_perms='create,edit,delete,export,detail'\`, [m.path])
        // viewer 拥有只读与导出权限
        await exec(\`INSERT INTO sys_role_menu (role_id, menu_path, btn_perms)
          VALUES ('viewer', ?, 'export,detail')
          ON DUPLICATE KEY UPDATE btn_perms='export,detail'\`, [m.path])
      }
    }
  }

  // 3b. 补授「新增菜单」给 admin。
  // sys_role_menu 只在首次初始化时注入，后续版本新加的菜单（如 C 端「前台运营」入口）
  // 对既有租户永远不可见：sys_menu 里有这条，侧边栏却渲染不出来。
  // 这里只补缺失项（INSERT IGNORE），不触碰用户已调整过的既有授权。
  for (const m of MENUS) {
    await exec(\`INSERT IGNORE INTO sys_role_menu (role_id, menu_path, btn_perms)
      VALUES ('admin', ?, 'create,edit,delete,export,detail')\`, [m.path])
  }

  // 4. 初始化 Casbin RBAC 策略
  if (!(await one('SELECT id FROM casbin_rule LIMIT 1'))) {
    await exec('INSERT INTO casbin_rule (ptype,v0,v1,v2,v3) VALUES (?,?,?,?,?)', ['p', 'role:admin', DOM, '/api/*', '*'])
  }
  // editor 拥有业务模块全部 API
  for (const m of MENUS) {
    if (m.grp !== '系统管理' && m.grp !== '前台运营') {
      await exec(\`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3) SELECT 'p','role:editor',?, ?, '*'
        WHERE NOT EXISTS (SELECT 1 FROM casbin_rule WHERE ptype='p' AND v0='role:editor' AND v1=? AND v2=? AND v3='*')\`,
        [DOM, m.path.replace('/admin/', '/api/') + '/*', DOM, m.path.replace('/admin/', '/api/') + '/*'])
      await exec(\`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3) SELECT 'p','role:viewer',?, ?, 'GET'
        WHERE NOT EXISTS (SELECT 1 FROM casbin_rule WHERE ptype='p' AND v0='role:viewer' AND v1=? AND v2=? AND v3='GET')\`,
        [DOM, m.path.replace('/admin/', '/api/') + '/*', DOM, m.path.replace('/admin/', '/api/') + '/*'])
    }
  }

  // 逐条 upsert 设计站设置的额外角色
  for (const r of ROLES) {
    for (const k of Object.keys(r.perms ?? {}).filter(x => r.perms[x])) {
      await exec(\`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3) SELECT 'p',?,?,?,? WHERE NOT EXISTS (
        SELECT 1 FROM casbin_rule WHERE ptype='p' AND v0=? AND v1=? AND v2=? AND v3='*')\`,
        ['role:' + r.name, DOM, '/api/' + k + '/*', '*', 'role:' + r.name, DOM, '/api/' + k + '/*'])
    }
  }
  invalidateCasbin()
  ${has(p, 'dict') ? `await seedDicts(DICTS, DICT_NAMES)` : `void DICTS; void DICT_NAMES`}
  await seedBusiness()
  markDbReady()
  console.log('[${p.slug}] sub-admin ready · db=' + cfg.name)
})

/**
 * CREATE TABLE IF NOT EXISTS never alters a table that already exists, so
 * columns added later by a capability (flow_status, deleted_at, parent_id…)
 * must be reconciled explicitly or writes fail with Unknown column.
 */
async function applyMigrations() {
  const { name: database } = useRuntimeConfig().db
  let added = 0
  for (const m of MIGRATIONS as Array<{ table: string, column: string, ddl: string }>) {
    const has = await one<any>(
      'SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
      [database, m.table, m.column])
    if (has) continue
    await exec('ALTER TABLE \`' + m.table + '\` ADD COLUMN \`' + m.column + '\`' + m.ddl)
    added++
  }
  if (added) console.log('[' + database + '] 补齐能力注入列 ' + added + ' 个')
}

async function seedDicts(
  dicts: Record<string, Array<{ label: string, value: string, color?: string }>>,
  names: Record<string, string> = {}
) {
  for (const [key, items] of Object.entries(dicts)) {
    const existing = await one<any>('SELECT id, dict_name FROM sys_dict_type WHERE dict_key=?', [key])
    const dictName = names[key] || key
    if (existing) {
      if (dictName !== key && existing.dict_name === key) {
        await exec('UPDATE sys_dict_type SET dict_name=? WHERE id=?', [dictName, existing.id])
      }
      continue
    }
    await exec('INSERT INTO sys_dict_type (dict_key,dict_name) VALUES (?,?)', [key, dictName])
    let i = 0
    for (const it of items) {
      await exec('INSERT INTO sys_dict_data (dict_key,label,value,color,sort) VALUES (?,?,?,?,?)',
        [key, it.label, it.value, it.color ?? '', i++])
    }
  }
}

/** Idempotent business seed: only fills tables that are still empty. */
async function seedBusiness() {
  const { TABLES } = await import('../utils/tables')
  const { randomValue, datetime } = await import('../utils/faker')
  for (const t of Object.values(TABLES) as any[]) {
    const n = Number((await q<any>('SELECT COUNT(*) AS c FROM \`' + t.table + '\`'))[0]?.c ?? 0)
    if (n > 0) continue
    const want = SEED_PLAN[t.table] ?? 0
    const hasCreatedAt = t.fields.some((f: any) => f.key === 'created_at')
    for (let i = 0; i < want; i++) {
      const cols: string[] = []
      const vals: unknown[] = []
      for (const f of t.fields) {
        if (f.key === 'id' || !f.formShow) continue
        if (f.key === 'created_by') { cols.push('created_by'); vals.push('admin'); continue }
        const v = randomValue(f, i)
        if (v === undefined) continue
        cols.push('\`' + f.key + '\`'); vals.push(v)
      }
      if (hasCreatedAt && !cols.includes('\`created_at\`')) {
        // Distribute created_at across the past 28 days so dashboard trend charts display a realistic curve
        const offsetDays = Math.floor((i / Math.max(1, want)) * 25) + (i % 3)
        cols.push('\`created_at\`')
        vals.push(datetime(offsetDays))
      }
      await exec('INSERT INTO \`' + t.table + '\` (' + cols.map(c => c).join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')', vals)
    }
  }
}
const SEED_PLAN: Record<string, number> = ${JSON.stringify(seedPlan(p))}
`,

    'server/utils/faker.ts': `import type { FieldDef } from './types'
import { DICTS } from './schema'

const rand = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a
const pick = <T,>(arr: T[]): T => arr[rand(0, arr.length - 1)]
const pad = (n: number) => String(n).padStart(2, '0')

export function datetime(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86400000)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(rand(8, 19)) + ':' + pad(rand(0, 59)) + ':00'
}
export function date(offsetDays = 0): string { return datetime(offsetDays).slice(0, 10) }

const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨'.split('')
const GIVEN = ['伟', '芳', '娜', '敏', '静', '磊', '洋', '勇', '艳', '杰', '涛', '明', '超', '秀英']
export function cnName(): string { return pick(SURNAMES) + pick(GIVEN) }
export function phone(): string { return '1' + pick(['3', '5', '7', '8', '9']) + String(rand(100000000, 999999999)) }
export function email(i: number): string { return 'user' + i + '@example.com' }
export function sentence(): string {
  const parts = ['系统自动生成的演示内容', '本条为种子数据可安全删除', '用于验证列表与详情页渲染', '支持中文与 Emoji 🎉 混排']
  return pick(parts)
}
export function image(i: number): string { return 'https://picsum.photos/seed/' + i + '/200/140' }

/** One seed value per field type; returns undefined to skip the column. */
export function randomValue(f: FieldDef, i: number): unknown {
  switch (f.type) {
    case 'bool': return rand(0, 1)
    case 'int': return rand(1, 9999)
    case 'decimal':
    case 'money': return (rand(100, 100000) + rand(0, 99) / 100).toFixed(2)
    case 'date': return date(rand(0, 365))
    case 'datetime': return datetime(rand(0, 365))
    // 枚举要给出真实存在的字典值：以前返回 undefined 让整列在列表里显示"—"，
    // 看起来像功能坏了，其实只是种子没给值。
    case 'enum': {
      const items = (DICTS as Record<string, any[]>)[f.dict ?? ''] ?? []
      return items.length ? pick(items).value : undefined
    }
    case 'json': return '{}'
    case 'text':
    case 'richtext': return sentence()
    case 'image': return image(i)
    case 'file': return ''
    case 'fk': return rand(1, 8)
    default:
      // 校验规则是字段自己声明的权威信号，优先于按 key 猜：
      // hotline 配了 rule=phone 却不含 "phone" 子串，之前会掉到最后的区域串。
      if (f.rule === 'phone') return phone()
      if (f.rule === 'email') return email(i)
      if (f.rule === 'url') return 'https://example.com/p/' + (i + 1)
      if (f.rule === 'number') return String(rand(1, 9999))
      if (f.key.includes('phone') || f.key.includes('mobile') || f.key.includes('tel')) return phone()
      if (f.key.includes('email')) return email(i)
      if (f.key.includes('url') || f.key.includes('link')) return 'https://example.com/p/' + (i + 1)
      if (f.key.includes('name') || f.key.includes('title')) return (f.name || '记录') + '-' + (i + 1)
      if (f.unique) return f.key + '_' + i + '_' + rand(1000, 9999)
      return pick(['华北', '华东', '华南', '西南']) + '-' + (i + 1)
  }
}
`,

    'server/api/health.get.ts': `import { isDbReady, q, ok } from '../utils/db'

export default defineEventHandler(async () => {
  let dbUp = false
  let latencyMs = 0
  const t0 = performance.now()
  try {
    await q('SELECT 1')
    dbUp = true
    latencyMs = Math.round(performance.now() - t0)
  } catch {
    latencyMs = Math.round(performance.now() - t0)
  }

  return ok({
    ok: true,
    db: {
      up: dbUp,
      latencyMs
    },
    initReady: isDbReady(),
    uptime: Math.round(process.uptime() * 10) / 10
  })
})
`,

    'server/api/login.post.ts': `import { readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const password = String(body?.password ?? '')

  if (await authMode() === 'simple') {
    // No user table: one shared gate password. The login form still posts a
    // username, so it is accepted and ignored rather than rejected.
    await assertNotLocked('__gate__')
    const g = await one<any>('SELECT * FROM sys_gate WHERE id=1')
    if (!g || !verifyPassword(password, g.password)) {
      await noteLoginResult('__gate__', false)
      throw createError({ statusCode: 401, message: '门禁密码错误' })
    }
    await noteLoginResult('__gate__', true)
    const user = { uid: 0, username: '持门者', nickname: '持门者', role: 'admin' }
    return ok({ token: signToken(user), user, mustChange: !!Number(g.must_change) })
  }

  const name = String(body?.username ?? '')
  await assertNotLocked(name)
  const u = await one<any>('SELECT * FROM sys_user WHERE username=?', [name])
  const pass = verifyPassword(password, u?.password ?? '')
  if (!u || !pass || Number(u.status) !== 1) {
    await noteLoginResult(name, false)
    throw createError({ statusCode: 401, message: '账号或密码错误' })
  }
  await noteLoginResult(name, true)
  await exec('UPDATE sys_user SET last_login_at=NOW() WHERE id=?', [u.id])
  const user = { uid: Number(u.id), username: u.username, nickname: u.nickname, role: u.role }
  return ok({ token: signToken(user), user })
})
`,

    'server/api/profile.get.ts': `export default defineAuthed(async (event) => {
  const u = currentUser(event)
  const mode = await authMode()
  // simple 模式没有用户表，身份就是"持门者"；其余模式回查 sys_user。
  if (mode === 'simple') return ok({ username: u.username, nickname: u.nickname, role: u.role, authMode: mode })
  const row = await one<any>('SELECT id,username,nickname,avatar,role,last_login_at FROM sys_user WHERE id=?', [u.uid])
  return ok({ ...(row ?? { id: u.uid, username: u.username, nickname: u.nickname, role: u.role }), authMode: mode })
})
`,

    'server/api/system/auth-mode.get.ts': `export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能查看门禁模式' })
  const [uCnt] = await q<any>('SELECT COUNT(*) AS c FROM sys_user')
  const [rCnt] = await q<any>('SELECT COUNT(*) AS c FROM sys_role')
  const [cCnt] = await q<any>('SELECT COUNT(*) AS c FROM casbin_rule')
  return ok({
    mode: await authMode(),
    default: DEFAULT_AUTH_MODE,
    stats: {
      users: Number(uCnt?.c || 0),
      roles: Number(rCnt?.c || 0),
      casbinRules: Number(cCnt?.c || 0)
    }
  })
})
`,

    'server/api/system/auth-mode.post.ts': `import { readBody } from 'h3'
import { AUTH_MODE_LABELS } from '../../utils/auth'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能切换门禁模式' })
  const body = await readBody(event)
  const next = String((body as any)?.mode ?? '')
  const before = await authMode()
  await setAuthMode(next as any)
  return ok({ before, after: await authMode(), labels: AUTH_MODE_LABELS })
})
`,

    'server/api/public/auth-mode.get.ts': `import { AUTH_MODE_LABELS } from '../../utils/auth'

export default defineEventHandler(async () => {
  const mode = await authMode()
  return ok({
    mode,
    label: AUTH_MODE_LABELS[mode] || mode,
    isSimple: mode === 'simple'
  })
})
`,

    'server/api/system/user/list.get.ts': `import { getQuery } from 'h3'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin' && !(await canAccessSystem(u.role))) throw createError({ statusCode: 403, message: '无权限访问用户管理' })
  const qObj = getQuery(event)
  const page = Math.max(1, Number(qObj.page || 1))
  const size = Math.max(1, Math.min(100, Number(qObj.size || 20)))
  const offset = (page - 1) * size
  const kw = String(qObj.keyword || '').trim()

  let where = '1=1'
  const params: any[] = []
  if (kw) {
    where += ' AND (u.username LIKE ? OR u.nickname LIKE ? OR u.phone LIKE ?)'
    params.push('%' + kw + '%', '%' + kw + '%', '%' + kw + '%')
  }

  const [cRow] = await q<any>('SELECT COUNT(*) AS c FROM sys_user u WHERE ' + where, params)
  const total = Number(cRow?.c || 0)
  const list = await q<any>(\`SELECT u.id, u.username, u.nickname, u.avatar, u.role, r.role_name, u.phone, u.email, u.status, u.last_login_at, u.created_at
    FROM sys_user u LEFT JOIN sys_role r ON u.role = r.role_id
    WHERE \${where} ORDER BY u.id DESC LIMIT ? OFFSET ?\`, [...params, size, offset])
  return ok({ list, total, page, size })
})

async function canAccessSystem(role: string): Promise<boolean> {
  const row = await one<any>('SELECT id FROM sys_role_menu WHERE role_id=? AND menu_path LIKE ?', [role, '/admin/system%'])
  return !!row
}
`,

    'server/api/system/user/create.post.ts': `import { readBody } from 'h3'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能新增用户' })
  const b = await readBody(event)
  const username = String(b?.username || '').trim()
  const password = String(b?.password || '').trim()
  const nickname = String(b?.nickname || username).trim()
  const role = String(b?.role || 'editor').trim()
  const phone = String(b?.phone || '').trim()
  const email = String(b?.email || '').trim()
  if (!username || username.length < 2) throw createError({ statusCode: 400, message: '用户名至少2个字符' })
  if (!password || password.length < 6) throw createError({ statusCode: 400, message: '密码至少6个字符' })
  if (await one('SELECT id FROM sys_user WHERE username=?', [username])) throw createError({ statusCode: 409, message: '用户名已存在' })
  const r = await exec('INSERT INTO sys_user (username, password, nickname, role, phone, email, status) VALUES (?,?,?,?,?,?,1)',
    [username, hashPassword(password), nickname, role, phone, email])
  return ok({ id: r.insertId, username, nickname, role })
})
`,

    'server/api/system/user/update.patch.ts': `import { readBody } from 'h3'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能修改用户' })
  const b = await readBody(event)
  const id = Number(b?.id)
  if (!id) throw createError({ statusCode: 400, message: '缺少用户ID' })
  const existing = await one<any>('SELECT * FROM sys_user WHERE id=?', [id])
  if (!existing) throw createError({ statusCode: 404, message: '用户不存在' })
  if (existing.username === 'admin' && b?.role && b.role !== 'admin') {
    throw createError({ statusCode: 400, message: '不能更改超级管理员 admin 的角色' })
  }
  const nickname = b?.nickname !== undefined ? String(b.nickname) : existing.nickname
  const role = b?.role !== undefined ? String(b.role) : existing.role
  const status = b?.status !== undefined ? (Number(b.status) ? 1 : 0) : existing.status
  const phone = b?.phone !== undefined ? String(b.phone) : existing.phone
  const email = b?.email !== undefined ? String(b.email) : existing.email
  await exec('UPDATE sys_user SET nickname=?, role=?, status=?, phone=?, email=? WHERE id=?',
    [nickname, role, status, phone, email, id])
  return ok(true)
})
`,

    'server/api/system/user/delete.post.ts': `import { readBody } from 'h3'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能删除用户' })
  const b = await readBody(event)
  const id = Number(b?.id)
  if (!id) throw createError({ statusCode: 400, message: '缺少用户ID' })
  const target = await one<any>('SELECT * FROM sys_user WHERE id=?', [id])
  if (!target) throw createError({ statusCode: 404, message: '用户不存在' })
  if (target.username === 'admin') throw createError({ statusCode: 400, message: '不可删除初始超管账号 admin' })
  if (target.id === u.uid) throw createError({ statusCode: 400, message: '不能删除当前登录账号' })
  await exec('DELETE FROM sys_user WHERE id=?', [id])
  return ok(true)
})
`,

    'server/api/system/user/reset-pwd.post.ts': `import { readBody } from 'h3'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能重置密码' })
  const b = await readBody(event)
  const id = Number(b?.id)
  const pwd = String(b?.password || '').trim()
  if (!id) throw createError({ statusCode: 400, message: '缺少用户ID' })
  if (!pwd || pwd.length < 6) throw createError({ statusCode: 400, message: '密码至少6个字符' })
  await exec('UPDATE sys_user SET password=? WHERE id=?', [hashPassword(pwd), id])
  return ok(true)
})
`,

    'server/api/system/role/list.get.ts': `import { canAccessSystem } from '../../../utils/auth'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin' && !(await canAccessSystem(u.role))) throw createError({ statusCode: 403, message: '无权限查看系统角色列表' })
  const rows = await q<any>(\`SELECT r.id, r.role_id, r.role_name, r.parent_id, r.default_router, r.remark, r.created_at,
    (SELECT COUNT(*) FROM sys_user u WHERE u.role = r.role_id) AS user_count
    FROM sys_role r ORDER BY r.id ASC\`)
  return ok(rows)
})
`,

    'server/api/system/role/create.post.ts': `import { readBody } from 'h3'
import { syncRoleHierarchy } from '../../../utils/auth'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能新增角色' })
  const b = await readBody(event)
  const roleId = String(b?.role_id || '').trim()
  const roleName = String(b?.role_name || '').trim()
  const parentId = String(b?.parent_id || '0').trim()
  const remark = String(b?.remark || '').trim()
  if (!roleId || !/^[a-zA-Z0-9_-]{2,32}$/.test(roleId)) throw createError({ statusCode: 400, message: '角色标识需为2-32位英文/数字/下划线' })
  if (!roleName) throw createError({ statusCode: 400, message: '角色名称不能为空' })
  if (await one('SELECT id FROM sys_role WHERE role_id=?', [roleId])) throw createError({ statusCode: 409, message: '角色标识已存在' })
  await exec('INSERT INTO sys_role (role_id, role_name, parent_id, remark) VALUES (?,?,?,?)', [roleId, roleName, parentId, remark])
  await syncRoleHierarchy(roleId, parentId, ${JSON.stringify(p.slug)})
  return ok(true)
})
`,

    'server/api/system/role/update.patch.ts': `import { readBody } from 'h3'
import { syncRoleHierarchy } from '../../../utils/auth'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能修改角色' })
  const b = await readBody(event)
  const roleId = String(b?.role_id || '').trim()
  const roleName = String(b?.role_name || '').trim()
  const parentId = String(b?.parent_id || '0').trim()
  const remark = String(b?.remark || '').trim()
  if (!roleId) throw createError({ statusCode: 400, message: '缺少角色标识' })
  if (!roleName) throw createError({ statusCode: 400, message: '角色名称不能为空' })
  await exec('UPDATE sys_role SET role_name=?, parent_id=?, remark=? WHERE role_id=?', [roleName, parentId, remark, roleId])
  await syncRoleHierarchy(roleId, parentId, ${JSON.stringify(p.slug)})
  return ok(true)
})
`,

    'server/api/system/role/delete.post.ts': `import { readBody } from 'h3'
import { invalidateCasbin } from '../../../utils/auth'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能删除角色' })
  const b = await readBody(event)
  const roleId = String(b?.role_id || '').trim()
  if (!roleId) throw createError({ statusCode: 400, message: '缺少角色标识' })
  if (roleId === 'admin') throw createError({ statusCode: 400, message: '不可删除内置超级管理员角色 admin' })
  const userCount = await one<any>('SELECT COUNT(*) as c FROM sys_user WHERE role=?', [roleId])
  if (Number(userCount?.c || 0) > 0) throw createError({ statusCode: 400, message: '该角色下仍有绑定的用户，无法直接删除' })
  await exec('DELETE FROM sys_role WHERE role_id=?', [roleId])
  await exec('DELETE FROM sys_role_menu WHERE role_id=?', [roleId])
  await exec('DELETE FROM casbin_rule WHERE v0=? OR (ptype="g" AND (v0=? OR v1=?))', ['role:' + roleId, 'role:' + roleId, 'role:' + roleId])
  invalidateCasbin()
  return ok(true)
})
`,

    'server/api/system/role/menus.get.ts': `import { getQuery } from 'h3'

export default defineAuthed(async (event) => {
  const qObj = getQuery(event)
  const roleId = String(qObj.role_id || '').trim()
  if (!roleId) throw createError({ statusCode: 400, message: '缺少 role_id' })
  const rows = await q<any>('SELECT menu_path, btn_perms FROM sys_role_menu WHERE role_id=?', [roleId])
  const menuPaths = rows.map((r: any) => r.menu_path)
  const btnPerms: Record<string, string[]> = {}
  for (const r of rows) {
    btnPerms[r.menu_path] = r.btn_perms ? r.btn_perms.split(',').filter(Boolean) : []
  }
  return ok({ menuPaths, btnPerms })
})
`,

    'server/api/system/role/menus.post.ts': `import { readBody } from 'h3'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能分配菜单权限' })
  const b = await readBody(event)
  const roleId = String(b?.role_id || '').trim()
  if (!roleId) throw createError({ statusCode: 400, message: '缺少 role_id' })
  const menus = Array.isArray(b?.menus) ? b.menus : []
  await exec('DELETE FROM sys_role_menu WHERE role_id=?', [roleId])
  for (const m of menus) {
    const p = String(m.path || '').trim()
    if (!p) continue
    const btns = Array.isArray(m.btnPerms) ? m.btnPerms.join(',') : String(m.btnPerms || 'detail')
    await exec('INSERT INTO sys_role_menu (role_id, menu_path, btn_perms) VALUES (?,?,?)', [roleId, p, btns])
  }
  return ok(true)
})
`,

    'server/api/system/role/casbin.get.ts': `import { getQuery } from 'h3'

export default defineAuthed(async (event) => {
  const qObj = getQuery(event)
  const roleId = String(qObj.role_id || '').trim()
  if (!roleId) throw createError({ statusCode: 400, message: '缺少 role_id' })
  const rows = await q<any>('SELECT v2 AS path, v3 AS method FROM casbin_rule WHERE ptype=\\'p\\' AND v0=?', ['role:' + roleId])
  return ok(rows)
})
`,

    'server/api/system/role/casbin.post.ts': `import { readBody } from 'h3'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin') throw createError({ statusCode: 403, message: '只有超级管理员能分配API策略' })
  const b = await readBody(event)
  const roleId = String(b?.role_id || '').trim()
  if (!roleId) throw createError({ statusCode: 400, message: '缺少 role_id' })
  const rules = Array.isArray(b?.rules) ? b.rules : []
  const DOM = ${JSON.stringify(p.slug)}
  await exec('DELETE FROM casbin_rule WHERE ptype=\\'p\\' AND v0=?', ['role:' + roleId])
  for (const r of rules) {
    const pth = String(r.path || '').trim()
    const method = String(r.method || '*').trim().toUpperCase()
    if (!pth) continue
    await exec('INSERT INTO casbin_rule (ptype, v0, v1, v2, v3) VALUES (?,?,?,?,?)', ['p', 'role:' + roleId, DOM, pth, method])
  }
  invalidateCasbin()
  return ok(true)
})
`,

    'server/api/system/api/tree.get.ts': `import { canAccessSystem } from '../../../utils/auth'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  if (u.role !== 'admin' && !(await canAccessSystem(u.role))) throw createError({ statusCode: 403, message: '无权限查看系统 API 权限树' })
  return ok(${JSON.stringify(buildApiTree(p), null, 2)})
})
`,

    'server/api/menu.get.ts': `import { getRoleAncestors } from '../utils/auth'

export default defineAuthed(async (event) => {
  const u = currentUser(event)
  const mode = await authMode()
  const qObj = getQuery(event)
  const showAll = qObj.all === '1' || qObj.all === 'true'
  const rows = await q<any>('SELECT res_key,name,icon,path,grp,perm,hidden FROM sys_menu ORDER BY sort,id')
  
  // 菜单授权过滤与多级角色继承：
  // 1. 若传了 all=1（权限配置抽屉调用），返回全量注册菜单，不进行角色裁剪
  // 2. 否则，通过 getRoleAncestors 查询当前角色及所有父角色权限，递归继承菜单与按钮动作
  let grantedMap: Map<string, string[]> | null = null
  if (!showAll) {
    const roles = [u.role, ...(await getRoleAncestors(u.role))]
    const ph = roles.map(() => '?').join(',')
    const rRows = await q<any>(\`SELECT menu_path, btn_perms FROM sys_role_menu WHERE role_id IN (\${ph})\`, roles)
    if (rRows.length > 0 || (mode === 'rbac' && u.role !== 'admin')) {
      grantedMap = new Map()
      for (const rr of rRows) {
        const btns = rr.btn_perms ? rr.btn_perms.split(',').filter(Boolean) : ['detail']
        if (!grantedMap.has(rr.menu_path)) {
          grantedMap.set(rr.menu_path, btns)
        } else {
          const cur = new Set(grantedMap.get(rr.menu_path))
          for (const b of btns) cur.add(b)
          grantedMap.set(rr.menu_path, [...cur])
        }
      }
    }
  }

  const groups = new Map<string, any[]>()
  for (const r of rows) {
    if (!showAll && Number(r.hidden)) continue
    // 门禁模式差异化菜单过滤：
    // 1. simple 模式：全站单一口令，无成员与角色概念，隐藏用户管理与角色管理
    if (!showAll && mode === 'simple' && (r.res_key === 'system_user' || r.res_key === 'system_role')) continue
    // 2. users 模式：平权协作无 Casbin 策略，隐藏角色管理
    if (!showAll && mode === 'users' && r.res_key === 'system_role') continue
    // 如果已授权集合不包含此路由，则跳过
    if (grantedMap && !grantedMap.has(r.path)) continue
    const btnPerms = grantedMap ? (grantedMap.get(r.path) || []) : ['create', 'edit', 'delete', 'export', 'detail']
    if (!groups.has(r.grp)) groups.set(r.grp, [])
    groups.get(r.grp)!.push({ key: r.res_key, name: r.name, icon: r.icon, path: r.path, perm: r.perm, btnPerms })
  }
  return ok([...groups.entries()].map(([name, items]) => ({ name, items })))
})
`,

    'server/api/logout.post.ts': `export default defineEventHandler(() => ok(true))
`
  }

  // ---- per-module CRUD routes + editable hooks ----
  for (const m of allModules(p)) Object.assign(files, moduleFiles(m, p))

  // ---- capability extras ----
  if (has(p, 'dict')) Object.assign(files, dictFiles())
  if (has(p, 'log')) Object.assign(files, logFiles(p))
  if (has(p, 'file')) Object.assign(files, fileFiles(p))
  if (has(p, 'dashboard')) Object.assign(files, dashboardFiles(p))
  if (has(p, 'job')) Object.assign(files, jobFiles())
  if (has(p, 'message')) Object.assign(files, messageFiles())
  if (has(p, 'landing_poster')) Object.assign(files, landingPosterFiles(p))
  if (has(p, 'landing_form')) Object.assign(files, landingFormFiles(p))
  if (has(p, 'landing_portal')) Object.assign(files, landingPortalFiles(p))
  if (has(p, 'landing_cms')) Object.assign(files, landingCmsFiles(p))
  Object.assign(files, guardFiles(p))

  return files
}

function has(p: TenantPlan, k: string) { return !!p.caps[k] }

function seedPlan(p: TenantPlan): Record<string, number> {
  const out: Record<string, number> = {}
  for (const m of allModules(p)) out[m.tableName] = m.seed.enabled ? Math.min(Number(m.seed.rows ?? 0), 200) : 0
  return out
}

/** list / detail / create / update / delete (+ batch, export, tree, flow per capability) */
function moduleFiles(m: ModuleDef, p: TenantPlan): Record<string, string> {
  const res = m.key
  const k = `tableOf('${res}')`
  const f: Record<string, string> = {
    [`server/api/${res}/list.get.ts`]: `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'list')
  const logic = (await import('../../logic/${res}')).logic
  const query = getQuery(event) as any
  const ctx = { event, query, user: currentUser(event) }
  await logic.beforeList?.(ctx)
  const data = await list(${k}, query)
  await logic.afterList?.({ ...ctx, data })
  return ok(data)
})
`,
    [`server/api/${res}/[id].get.ts`]: `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'read')
  const row = await detail(${k}, Number(getRouterParam(event, 'id')))
  if (!row) throw createError({ statusCode: 404, message: '记录不存在' })
  return ok(row)
})
`,
    [`server/api/${res}/create.post.ts`]: `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'create')
  const t = ${k}
  const logic = (await import('../../logic/${res}')).logic
  const body = await readBody(event)
  const data = pickFields(t, body)
  const ctx = { event, data, user: currentUser(event) }
  await logic.beforeCreate?.(ctx)
  const row = await create(t, ctx.data, ctx.user.username)
  ${p.caps.tree && wantsTree(m) ? `await rebuildTree(t, Number((row as any).id))` : ''}
  await logic.afterCreate?.({ ...ctx, row })
  return ok(row)
})
`,
    [`server/api/${res}/update.post.ts`]: `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'update')
  const t = ${k}
  const logic = (await import('../../logic/${res}')).logic
  const body = await readBody(event)
  const id = Number(body.id)
  const before = await detail(t, id)
  if (!before) throw createError({ statusCode: 404, message: '记录不存在' })
  const data = pickFields(t, body, true)
  const ctx = { event, id, data, before, user: currentUser(event) }
  await logic.beforeUpdate?.(ctx)
  const row = await update(t, id, ctx.data)
  ${p.caps.tree && wantsTree(m) ? `await rebuildTree(t, id)` : ''}
  await logic.afterUpdate?.({ ...ctx, row })
  return ok(row)
})
`,
    [`server/api/${res}/remove.post.ts`]: `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'delete')
  const t = ${k}
  const logic = (await import('../../logic/${res}')).logic
  const body = await readBody(event)
  const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).map(Number).filter(Boolean)
  if (!ids.length) throw createError({ statusCode: 400, message: '未选择记录' })
  const ctx = { event, ids, user: currentUser(event) }
  await logic.beforeDelete?.(ctx)
  const n = await remove(t, ctx.ids, ctx.user.username)
  await logic.afterDelete?.({ ...ctx, removed: n })
  return ok({ removed: n })
})
`,
    [`server/logic/${res}.ts`]: logicFile(m, p)
  }

  if (p.caps.batch) {
    f[`server/api/${res}/batch.post.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'update')
  const t = ${k}
  const { ids, action, value } = await readBody(event)
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean)
  if (!list.length) throw createError({ statusCode: 400, message: '未选择记录' })
  const ph = list.map(() => '?').join(',')
  if (action === 'delete') return ok({ affected: await remove(t, list, currentUser(event).username) })
  if (action === 'status') {
    return ok({ affected: (await exec('UPDATE \`' + t.table + '\` SET status=? WHERE id IN (' + ph + ')', [Number(value), ...list])).affectedRows })
  }
  const field = String(action)
  const allowed = t.fields.filter(x => x.formShow).map(x => x.key)
  if (!allowed.includes(field)) throw createError({ statusCode: 400, message: '不支持的批量字段 ' + field })
  return ok({ affected: (await exec('UPDATE \`' + t.table + '\` SET \`' + field + '\`=? WHERE id IN (' + ph + ')', [value, ...list])).affectedRows })
})
`
  }
  if (p.caps.io) {
    f[`server/api/${res}/export.get.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'export')
  const t = ${k}
  const { list: rows } = await list(t, { ...getQuery(event), page: 1, size: 10000 } as any)
  setHeader(event, 'content-type', 'text/csv; charset=utf-8')
  setHeader(event, 'content-disposition', 'attachment; filename=${res}.csv')
  return toCsv(t, rows as any[])
})
`
    f[`server/api/${res}/import.post.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'create')
  const t = ${k}
  const body = await readBody(event)
  const rows: string[][] = String(body.csv ?? '').split('\\n').map(l => l.trim()).filter(Boolean).map(parseCsvLine)
  const head = rows.shift() ?? []
  const cols = head.map(h => t.fields.find(f => f.name === h || f.key === h)?.key).filter(Boolean) as string[]
  const errors: Array<{ row: number, message: string }> = []
  let created = 0
  for (let i = 0; i < rows.length; i++) {
    const raw: Record<string, unknown> = {}
    cols.forEach((c, j) => { raw[c] = rows[i][j] })
    try { await create(t, pickFields(t, raw), currentUser(event).username); created++ }
    catch (e: any) { errors.push({ row: i + 2, message: e?.statusMessage || e?.message || '失败' }) }
  }
  return ok({ created, failed: errors.length, errors: errors.slice(0, 50) })
})

/** Minimal RFC4180 line parser — quoted commas and escaped quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (c === ',' && !quoted) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}
`
  }
  if (p.caps.tree && wantsTree(m)) {
    f[`server/api/${res}/tree.get.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'list')
  const t = ${k}
  const rows = await q<any>('SELECT * FROM \`' + t.table + '\`' + (t.softDelete ? ' WHERE deleted_at IS NULL' : '') + ' ORDER BY level,id')
  const byId = new Map<number, any>()
  rows.forEach((r: any) => byId.set(Number(r.id), { ...r, children: [] }))
  const roots: any[] = []
  for (const r of byId.values()) {
    const parent = r.parent_id ? byId.get(Number(r.parent_id)) : null
    if (parent) parent.children.push(r); else roots.push(r)
  }
  return ok(roots)
})
`
  }
  if (p.caps.flow) {
    f[`server/api/${res}/flow.post.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'update')
  const t = ${k}
  const { id, action, comment } = await readBody(event)
  const NODES = ${JSON.stringify(((p.caps.flow?.config?.nodes as string) ?? '提交,部门审核,终审').split(','))}
  const row = await detail(t, Number(id))
  if (!row) throw createError({ statusCode: 404, message: '记录不存在' })
  const cur = String((row as any).flow_status ?? 'draft')
  let next = cur, node = String((row as any).flow_node ?? '')
  if (action === 'submit') { next = 'pending'; node = NODES[1] ?? NODES[0] }
  else if (action === 'approve') {
    const idx = NODES.indexOf(node)
    if (idx >= NODES.length - 2) { next = 'approved'; node = '归档' } else node = NODES[idx + 1] ?? node
  } else if (action === 'reject') { next = 'rejected'; node = '' }
  else throw createError({ statusCode: 400, message: '未知动作 ' + action })
  await exec('UPDATE \`' + t.table + '\` SET flow_status=?, flow_node=? WHERE id=?', [next, node, Number(id)])
  await exec('INSERT INTO sys_flow_history (table_name,row_id,node,action,comment,operator,created_at) VALUES (?,?,?,?,?,?,NOW())',
    [t.table, Number(id), node, action, String(comment ?? ''), currentUser(event).username])
  return ok({ flow_status: next, flow_node: node })
})
`
  }
  if (p.caps.recycle) {
    f[`server/api/${res}/recycle.get.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'list')
  const t = ${k}
  const page = Math.max(Number((getQuery(event) as any).page ?? 1), 1)
  const size = 20
  const total = Number((await q<any>('SELECT COUNT(*) AS c FROM \`' + t.table + '\` WHERE deleted_at IS NOT NULL'))[0]?.c ?? 0)
  const rows = await q('SELECT * FROM \`' + t.table + '\` WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ? OFFSET ?', [size, (page - 1) * size])
  return ok({ list: rows, total, page, size })
})
`
    f[`server/api/${res}/restore.post.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'update')
  const t = ${k}
  const { ids } = await readBody(event)
  const picked = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean)
  const ph = picked.map(() => '?').join(',')
  const n = (await exec('UPDATE \`' + t.table + '\` SET deleted_at=NULL, deleted_by=\\'\\' WHERE id IN (' + ph + ')', picked)).affectedRows
  return ok({ restored: n })
})
`
    f[`server/api/${res}/purge.post.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'delete')
  const t = ${k}
  const { ids } = await readBody(event)
  const picked = (Array.isArray(ids) ? ids : [ids]).map(Number).filter(Boolean)
  const ph = picked.map(() => '?').join(',')
  const n = (await exec('DELETE FROM \`' + t.table + '\` WHERE deleted_at IS NOT NULL AND id IN (' + ph + ')', picked)).affectedRows
  return ok({ purged: n })
})
`
  }
  // 逻辑站声明的自定义端点：真实展开为路由文件，而不是只留一句注释。
  for (const e of m.logic.endpoints ?? []) {
    const method = String(e.method || 'GET').toUpperCase()
    const h3 = method === 'GET' ? 'get' : method === 'DELETE' ? 'delete' : method === 'PATCH' ? 'patch' : 'post'
    const safe = String(e.path || '').replace(/[^a-zA-Z0-9_/-]/g, '').replace(/^\/+/, '')
    if (!safe) continue
    const file = `server/api/${res}/${safe}.${h3}.ts`
    if (f[file]) continue
    f[file] = `/** ${e.comment || `${method} /api/${res}/${safe}`} — 逻辑站自定义端点 */
export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, ${JSON.stringify(e.perm || 'list')})
  const t = ${k}
  const user = currentUser(event)
  ${e.code?.trim() ? e.code.trim().split('\n').map((l, i) => (i === 0 ? l : '  ' + l)).join('\n') : `throw createError({ statusCode: 501, message: '端点未实现，请在逻辑站补代码' })`}
})
`
  }
  // 单据打印：打印视图取这份字段快照，清单由设计站的表单字段推导。
  // 能力库声明了这条接口，就必须真的生成出来，否则能力卡片上的影响数是骗人的。
  if (p.caps.print) {
    f[`server/api/${res}/print/[id].get.ts`] = `export default defineAuthed(async (event) => {
  await authorize(event, ${JSON.stringify(res)}, 'read')
  const t = ${k}
  const id = Number(getRouterParam(event, 'id'))
  const row = await detail(t, id)
  if (!row) throw createError({ statusCode: 404, message: '记录不存在' })
  const cols = t.fields.filter(x => x.formShow && x.key !== 'id')
  return ok({
    title: ${JSON.stringify(m.name)},
    resKey: ${JSON.stringify(res)},
    id,
    printedAt: new Date().toLocaleString('zh-CN'),
    qr: ${JSON.stringify(String(p.caps.print.config?.qr ?? 'true'))} === 'true' ? ${JSON.stringify(res)} + '-' + id : '',
    items: cols.map(c => ({ label: c.name, value: String((row as any)[c.key] ?? '') }))
  })
})
`
  }
  return f
}

/** 逻辑站 authored hooks — user code is emitted verbatim into the sub-admin. */
function logicFile(m: ModuleDef, p: TenantPlan): string {
  const enabled = m.logic.hooks.filter(h => h.enabled && h.code.trim())
  const body = enabled.length
    ? enabled.map(h => `  ${h.name}(ctx: any) {\n${h.code.trim().split('\n').map(l => '    ' + l).join('\n')}\n  }`).join(',\n')
    : `  // 在逻辑站开启钩子后重新生成，代码会原样落到这里。`
  const eps = (m.logic.endpoints ?? [])
    .map(e => `server/api/${m.key}/${String(e.path || '').replace(/^\/+/, '')}.${String(e.method || 'GET').toLowerCase() === 'get' ? 'get' : 'post'}.ts`)
  return `/**
 * ${m.name} 业务钩子（${m.tableName}）
 * 可用：beforeCreate/afterCreate/beforeUpdate/afterUpdate/beforeDelete/afterDelete/beforeList/afterList
 * ctx = { event, data?, id?, ids?, row?, before?, user }
${eps.length ? ` * 自定义端点：\n${eps.map(x => ` *   - ${x}`).join('\n')}\n */` : ' */'}
export const logic = {
${body}
}
${eps.length ? '\n' : ''}`
}

/**
 * 子后台 sys_dict_* 的种子。只下发真有数据的字典：
 * 以前这里对未知 dict_key 造 甲/乙/丙，配合 dictKnown 的「装了能力就可用」，
 * 结果是下拉看着正常、内容是编的，假值会被真的选进业务表。
 * 现在未定义的键由 ui.ts 降级成输入框，并在生成报告里列清单。
 */
function buildDictSeed(p: TenantPlan): Record<string, DictItem[]> {
  const dict = resolveDicts(p)
  const out: Record<string, DictItem[]> = {}

  // status 几乎所有业务表都有；其余内置枚举只在装了对应能力时下发。
  const capOwn: Array<[string, string]> = [
    ['status', ''], ['file_kind', 'file'], ['job_status', 'job'],
    ['msg_kind', 'message'], ['flow_status', 'flow']
  ]
  for (const [key, cap] of capOwn) {
    if (!cap || p.caps[cap]) out[key] = dict[key]
  }

  for (const m of allModules(p)) {
    for (const f of m.fields ?? []) {
      if (f.type !== 'enum' || !f.dict) continue
      const items = dict[f.dict]
      if (items?.length && !out[f.dict]) out[f.dict] = items
    }
  }
  return out
}
