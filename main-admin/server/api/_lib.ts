import { createConnection } from 'node:net'
import type { CapSpec, DesignDef, FieldDef, FieldType, LogicDef, SeedDef } from '../utils/gen/types'

/**
 * Shared helpers for the control-plane handlers.
 * Nitro scans `server/api/**` for routes, so this module also answers
 * `GET|POST /api/_lib` — it has no default export, so that request 500s.
 * Nothing in the workbench ever calls it; it exists so the 40+ route files
 * below do not each re-implement the same validation.
 */

export type Row = Record<string, any>

/**
 * MySQL 8.0 reserved words that cannot be used as a bare table/column name.
 * Deliberately narrow: `name`/`type`/`status`/`time`/`date`/`user`/`text` are
 * keywords but legal identifiers, and the workbench would be unusable if they
 * were rejected.
 */
const RESERVED_WORDS = new Set([
  'add', 'all', 'alter', 'analyze', 'and', 'as', 'asc', 'before', 'between', 'bigint', 'binary', 'blob',
  'both', 'by', 'call', 'cascade', 'case', 'char', 'character', 'check', 'collate', 'column', 'condition',
  'constraint', 'continue', 'convert', 'create', 'cross', 'current_date', 'current_time',
  'current_timestamp', 'current_user', 'cursor', 'database', 'decimal', 'declare', 'default', 'delete',
  'desc', 'describe', 'deterministic', 'distinct', 'distinctrow', 'div', 'double', 'drop', 'dual', 'each',
  'else', 'enclosed', 'escaped', 'exists', 'exit', 'explain', 'false', 'fetch', 'float', 'for', 'force',
  'foreign', 'from', 'fulltext', 'grant', 'group', 'having', 'high_priority', 'if', 'ignore', 'in',
  'index', 'infile', 'inner', 'inout', 'insert', 'int', 'integer', 'interval', 'into', 'is', 'iterate',
  'join', 'key', 'keys', 'kill', 'leading', 'leave', 'left', 'like', 'limit', 'lines', 'load', 'localtime',
  'localtimestamp', 'lock', 'long', 'longblob', 'longtext', 'loop', 'low_priority', 'master', 'match',
  'mediumint', 'mediumtext', 'middleint', 'mod', 'modify', 'natural', 'not', 'null', 'numeric', 'on',
  'optimize', 'option', 'optionally', 'or', 'order', 'out', 'outer', 'outfile', 'partition', 'primary',
  'procedure', 'purge', 'range', 'read', 'reads', 'real', 'references', 'regexp', 'rename', 'repeat',
  'replace', 'require', 'restrict', 'return', 'revoke', 'right', 'rlike', 'schema', 'select', 'sensitive',
  'separator', 'set', 'show', 'signal', 'slave', 'smallint', 'some', 'soname', 'spatial', 'specific', 'sql',
  'sqlexception', 'sqlstate', 'sqlwarning', 'ssl', 'starting', 'straight_join', 'subpartition', 'table',
  'tables', 'terminated', 'then', 'tinyblob', 'tinyint', 'tinytext', 'to', 'trailing', 'true',
  'undo', 'union', 'unique', 'unlock', 'unsigned', 'update', 'usage', 'use', 'using', 'utc_date',
  'utc_time', 'utc_timestamp', 'validate', 'varbinary', 'varchar', 'varying', 'values', 'when', 'where', 'while',
  'with', 'write', 'xor', 'zerofill',
  // taken by the generator's audit columns / capability-injected columns
  'deleted_at', 'deleted_by'
])

export const isReservedWord = (word: string): boolean => RESERVED_WORDS.has(word)

export const FIELD_TYPES: FieldType[] = [
  'id', 'varchar', 'text', 'richtext', 'int', 'decimal', 'money',
  'date', 'datetime', 'bool', 'enum', 'json', 'fk', 'file', 'image'
]
/**
 * 字段控件白名单。必须与生成器 `ui.ts` 里真实渲染的分支一一对应：
 * 多一个就是选了没效果的哑选项，少一个就是 UI 能选、保存被 400 拒。
 */
export const COMPONENTS = [
  'input', 'textarea', 'number', 'date', 'datetime', 'switch', 'select',
  'upload', 'image', 'remote-select', 'code', 'richtext', 'radio', 'checkbox'
]
export const QUERY_TYPES = ['none', 'eq', 'ne', 'like', 'gt', 'ge', 'lt', 'le', 'in', 'range', 'notnull'] as const
/** 索引类型。取代 indexed/uniq/pk 三个能互相冲突的布尔，写入时折算回旧列供生成器使用。 */
export const INDEX_TYPES = ['none', 'normal', 'unique', 'primary'] as const
export const QUERY_TYPE_LABELS: Record<string, string> = {
  none: '不查询', eq: '等于', ne: '不等于', like: '模糊匹配', gt: '大于', ge: '大于等于',
  lt: '小于', le: '小于等于', in: '包含(IN)', range: '区间(BETWEEN)', notnull: '不为空'
}
export const INDEX_TYPE_LABELS: Record<string, string> = {
  none: '无索引', normal: '普通索引', unique: '唯一索引', primary: '主键'
}
/**
 * 登录页模板，必须与子后台 CSS 里真实存在的 `.login-page.<tpl>` 类一一对应。
 * `macOS` 大小写敏感（原型类名如此），不要规范化成 macos。
 */
export const LOGIN_TPLS = ['split', 'glass', 'macOS', 'terminal', 'hero']
export const DEFAULT_LOGIN_TPL = 'split'
// 'mix' dropped: the generator only branches on `top`, so offering it silently
// degraded to the side layout. Re-add once ui.ts actually implements it.
export const LAYOUTS = ['side', 'top']

/**
 * 门禁模式，三态互斥且必须显式选定（空值会阻断生成）：
 * simple = 单密码门禁，无用户表；users = 有账号但登录即全权；rbac = JWT + Casbin 角色矩阵。
 */
export const AUTH_MODES = ['simple', 'users', 'rbac'] as const
export const AUTH_MODE_LABELS: Record<string, string> = {
  simple: '简单密码', users: '成员登录（无权限控制）', rbac: '完整权限控制'
}

/** Control-plane modules that carry a Casbin policy set (see bootstrapPolicies). */
export const MENU_MODULES = [
  'tenant', 'model', 'capability', 'design', 'logic', 'seed', 'gen', 'verify', 'ai'
]

// ---------------------------------------------------------------- primitives

export const str = (v: unknown): string =>
  typeof v === 'string' ? v.trim() : v === null || v === undefined ? '' : String(v)

export const numOf = (v: unknown, d: number): number => {
  if (v === undefined || v === null || v === '') return d
  const n = typeof v === 'number' ? v : Number(str(v))
  return Number.isFinite(n) ? n : d
}

export const boolOf = (v: unknown, d = false): boolean => {
  if (v === undefined || v === null || v === '') return d
  return v === true || v === 1 || v === '1' || v === 'true'
}

export const asText = (v: unknown, max: number): string => str(v).slice(0, max)

export const asStrArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => str(x)).filter(x => x !== '') : []

export async function bodyOf(event: any): Promise<Row> {
  const body = await readBody(event)
  return body && typeof body === 'object' ? body as Row : {}
}

export function pick(input: Row, ...keys: string[]): unknown {
  for (const k of keys) if (input[k] !== undefined) return input[k]
  return undefined
}

export function numId(event: any, param = 'id'): number {
  const raw = getRouterParam(event, param) ?? getQuery(event)[param]
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, message: `路径参数 ${param} 不是合法的 ID：${str(raw) || '(空)'}` })
  }
  return id
}

export function numArg(event: any, name: string, fallback: number): number {
  const raw = getQuery(event)[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw createError({ statusCode: 400, message: `查询参数 ${name} 非法：${str(raw)}` })
  return n
}

/** A positive integer taken from a request body. */
export function wantId(input: Row, key: string, label = key): number {
  const v = input[key]
  if (v === undefined || v === null || v === '') {
    throw createError({ statusCode: 400, message: `${label} 不能为空` })
  }
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) {
    throw createError({ statusCode: 400, message: `${label} 必须是正整数，当前 ${str(v)}` })
  }
  return n
}

export function toInt(v: unknown, d: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) : d
}

export const groupView = (g: Row): Row => ({
  ...g,
  id: Number(g.id),
  tenant_id: Number(g.tenant_id),
  sort: Number(g.sort)
})

/** 字典项。color 只允许空或 ok|warn|err —— 子后台的标签映射只认这三个。 */
export const DICT_COLORS = ['', 'ok', 'warn', 'err']

export const dictItemView = (i: Row): Row => ({
  id: Number(i.id),
  typeId: Number(i.type_id),
  label: str(i.label),
  value: str(i.value),
  color: str(i.color),
  sort: Number(i.sort),
  enabled: !!Number(i.enabled)
})

export const dictTypeView = (t: Row, items: Row[] = []): Row => ({
  id: Number(t.id),
  tenantId: Number(t.tenant_id),
  dictKey: str(t.dict_key),
  name: str(t.name),
  remark: str(t.remark),
  items: items.map(dictItemView)
})

export function paging(event: any): { page: number, size: number, offset: number } {
  const page = Math.max(1, numOf(getQuery(event).page, 1) || 1)
  const size = Math.min(200, Math.max(1, numOf(getQuery(event).size, 20) || 20))
  return { page, size, offset: (page - 1) * size }
}

// ---------------------------------------------------------------- identifiers

/** Table / column identifiers that may reach DDL in a generated sub-admin. */
export function assertIdent(value: string, label: string, allowDash = false): string {
  const v = str(value)
  const pattern = allowDash ? /^[a-z][a-z0-9_-]{0,63}$/ : /^[a-z][a-z0-9_]{0,63}$/
  if (!pattern.test(v)) {
    throw createError({
      statusCode: 400,
      message: `${label}「${v || '(空)'}」不合法：只能用小写字母开头，由小写字母、数字${allowDash ? '、连字符' : ''}和下划线组成`
    })
  }
  if (RESERVED_WORDS.has(v)) {
    throw createError({ statusCode: 400, message: `${label}「${v}」是 MySQL 保留字或与生成器内置列冲突，请换一个名字` })
  }
  return v
}

/** `res_key` is a camelCase identifier used for routes, perm codes and Vue files. */
export function assertResKey(value: string, label: string): string {
  const v = str(value)
  if (!/^[a-z][a-zA-Z0-9]{1,63}$/.test(v)) {
    throw createError({ statusCode: 400, message: `${label}「${v || '(空)'}」不合法：需为小驼峰（字母开头，仅字母与数字，至少 2 位）` })
  }
  return v
}

/** Uniqueness inside one tenant, suffixing numbers until free. `col` is a literal, never user input. */
export async function uniqueInTenant(
  col: 'res_key' | 'table_name', tenantId: number, base: string): Promise<string> {
  const guard = col === 'table_name' ? assertIdent(base, '表名 tableName') : assertResKey(base, '资源标识 res_key')
  let v = guard
  for (let i = 2; await one<Row>(`SELECT id FROM module WHERE tenant_id=? AND ${ident(col)}=?`, [tenantId, v]); i++) {
    v = `${guard}${i}`
  }
  return v
}

/**
 * 自动生成时冲突就加序号；调用方显式指定的 key/表名冲突则 400，绝不静默改名
 * （静默改名会让前端与生成产物对不上）。
 */
export async function uniqueKeyInTenant(
  col: 'res_key' | 'table_name', tenantId: number, base: string, explicit: boolean): Promise<string> {
  const label = col === 'table_name' ? '表名 tableName' : '资源标识 res_key'
  const guard = col === 'table_name' ? assertIdent(base, label) : assertResKey(base, label)
  const clash = await one<Row>(`SELECT name FROM module WHERE tenant_id=? AND ${ident(col)}=?`, [tenantId, guard])
  if (clash) {
    if (explicit) {
      throw createError({ statusCode: 400, message: `${label}「${guard}」已被模型「${clash.name}」占用，请换一个，或留空由平台自动分配` })
    }
    return await uniqueInTenant(col, tenantId, guard)
  }
  return guard
}

/**
 * `resKeyOf` 兜底是随机的，中文表名同理：先名字、再表名、最后随机，
 * 但一定不再是无意义的 'item'。
 */
export function deriveKeys(name: string, wantedTable: string, wantedKey: string) {
  const table = wantedTable || (/^[A-Za-z]/.test(name) ? toSnake(name) : '')
  const resKey = wantedKey || resKeyOf(name, table)
  return { resKey, table: table || toSnake(resKey) || resKey }
}

// ---------------------------------------------------------------- tenant

export async function loadTenant(id: number): Promise<Row> {
  const t = await one<Row>(`SELECT * FROM tenant WHERE id=?`, [id])
  if (!t) throw createError({ statusCode: 404, message: `子后台 #${id} 不存在` })
  return t
}

export function tenantView(t: Row): Row {
  const theme = j<Record<string, unknown> | null>(t.theme_json, null)
  return {
    ...t,
    id: Number(t.id),
    port: Number(t.port),
    version: Number(t.version),
    status: t.status,
    theme_json: theme,
    theme
  }
}

/**
 * `toSlug()` emits hyphens, but the generator's `ensureTenantDb`/`dropTenantDb`
 * only accept `[a-z0-9_]` in the schema name, so a tenant slug is normalised to
 * underscores here. `[a-z0-9_]` ⊂ `[a-z0-9-]`, so the column contract holds.
 */
export async function nextSlug(base: string): Promise<string> {
  // toSlug() 会丢掉中文，可能留下以数字开头的残串（例如「自检商城898680」→ 898680）
  const root = (base || '').replace(/-/g, '_').replace(/[^a-z0-9_]/g, '').replace(/^_+/, '').slice(0, 40)
  const head = !root || /^[0-9]/.test(root) ? `app_${root || Date.now().toString(36)}` : root
  let slug = assertIdent(head, '子后台标识 slug')
  for (let i = 2; await one(`SELECT id FROM tenant WHERE slug=?`, [slug]); i++) {
    slug = `${head}_${i}`
  }
  return slug
}

// ---------------------------------------------------------------- module / field views

export async function nextSortOf(sql: string, params: unknown[]): Promise<number> {
  const r = await one<{ s: number | null }>(sql, params)
  return Number(r?.s ?? 0) + 1
}

/** Raw `module_field` row plus the camelCase aliases the FieldDef contract uses. */
export function fieldView(f: Row): Row {
  return {
    ...f,
    id: Number(f.id),
    module_id: Number(f.module_id),
    sort: Number(f.sort),
    key: f.col_key,
    colKey: f.col_key,
    length: Number(f.length),
    precision: Number(f.precision),
    nullable: boolOf(f.nullable),
    unique: boolOf(f.uniq),
    uniq: boolOf(f.uniq),
    indexed: boolOf(f.indexed),
    pk: boolOf(f.pk),
    default: f.default_v ?? null,
    dict: f.dict_key ?? '',
    ref: f.ref_table ?? '',
    refLabel: f.ref_label ?? '',
    refValue: f.ref_value ?? '',
    listShow: boolOf(f.list_show),
    formShow: boolOf(f.form_show),
    detailShow: boolOf(f.detail_show),
    exportShow: boolOf(f.export_show),
    sortable: boolOf(f.sortable),
    clearable: boolOf(f.clearable),
    queryHidden: boolOf(f.query_hidden),
    query: f.query_type,
    ruleMsg: f.rule_msg ?? '',
    indexType: f.index_type ?? 'none',
    required: boolOf(f.required)
  }
}

export function designOf(m: Row): DesignDef {
  const stored = j<Partial<DesignDef>>(m.design_json, {})
  const base = emptyDesign({ icon: m.icon })
  return {
    list: { ...base.list, ...stored.list },
    form: { ...base.form, ...stored.form },
    detail: { ...base.detail, ...stored.detail },
    menu: { ...base.menu, ...stored.menu, icon: m.icon || stored.menu?.icon || base.menu.icon }
  }
}

export function logicOf(m: Row): LogicDef {
  return { ...emptyLogic(), ...j<Partial<LogicDef>>(m.logic_json, {}) }
}

export function seedOf(m: Row): SeedDef {
  return { ...emptySeed(), ...j<Partial<SeedDef>>(m.seed_json, {}) }
}

/** Raw `module` row plus parsed JSON stations and its fields. */
export function moduleView(m: Row, fields: Row[] = []): Row {
  return {
    ...m,
    id: Number(m.id),
    group_id: Number(m.group_id),
    tenant_id: Number(m.tenant_id),
    sort: Number(m.sort),
    design_json: j<Record<string, unknown> | null>(m.design_json, null),
    logic_json: j<Record<string, unknown> | null>(m.logic_json, null),
    seed_json: j<Record<string, unknown> | null>(m.seed_json, null),
    design: designOf(m),
    logic: logicOf(m),
    seed: seedOf(m),
    fields
  }
}

export async function fieldsOf(moduleIds: number[]): Promise<Map<number, Row[]>> {
  const map = new Map<number, Row[]>()
  if (!moduleIds.length) return map
  const rows = await q<Row>(
    `SELECT * FROM module_field WHERE module_id IN (${moduleIds.map(() => '?').join(',')}) ORDER BY sort,id`,
    moduleIds)
  for (const r of rows) {
    const id = Number(r.module_id)
    if (!map.has(id)) map.set(id, [])
    map.get(id)!.push(fieldView(r))
  }
  return map
}

export async function loadModule(id: number): Promise<Row> {
  const m = await one<Row>(`SELECT * FROM module WHERE id=?`, [id])
  if (!m) throw createError({ statusCode: 404, message: `模型 #${id} 不存在` })
  return m
}

export async function moduleWithFields(id: number): Promise<Row> {
  const m = await loadModule(id)
  const fields = await fieldsOf([id])
  return moduleView(m, fields.get(id) ?? [])
}

/**
 * Column keys a 设计站 may legitimately reference: the modelled fields, the
 * audit columns the generator always emits, and whatever the installed
 * capabilities inject.
 */
export async function knownColumnKeys(tenantId: number, moduleId: number): Promise<Set<string>> {
  const fields = await q<{ col_key: string }>(`SELECT col_key FROM module_field WHERE module_id=?`, [moduleId])
  const caps = await q<{ spec_json: unknown }>(
    `SELECT c.spec_json FROM tenant_capability tc JOIN capability c ON c.cap_key = tc.cap_key
     WHERE tc.tenant_id=? AND tc.status='installed'`, [tenantId])
  const set = new Set<string>(['id', 'created_at', 'updated_at', 'created_by'])
  for (const f of fields) set.add(f.col_key)
  for (const c of caps) {
    const spec = j<CapSpec | null>(c.spec_json, null)
    for (const col of spec?.columns ?? []) set.add(col.key)
  }
  return set
}

/** Reject 设计站 references to columns that do not exist. */
export function assertKnownColumns(label: string, keys: string[], known: Set<string>): void {
  const unknown = keys.filter(k => !known.has(k))
  if (unknown.length) {
    throw createError({ statusCode: 400, message: `${label} 引用了不存在的列：${unknown.join(', ')}（可用列：${[...known].join(', ')}）` })
  }
}

// ---------------------------------------------------------------- field write path

const FIELD_PATCH_KEYS: Record<string, string> = {
  name: 'name', label: 'name',
  colKey: 'col_key', col_key: 'col_key', key: 'col_key',
  type: 'type', length: 'length', precision: 'precision',
  nullable: 'nullable', unique: 'uniq', uniq: 'uniq', indexed: 'indexed', pk: 'pk',
  indexType: 'index_type', index_type: 'index_type',
  default: 'default_v', defaultValue: 'default_v', default_v: 'default_v',
  dict: 'dict_key', dictKey: 'dict_key', dict_key: 'dict_key',
  ref: 'ref_table', refTable: 'ref_table', ref_table: 'ref_table',
  refLabel: 'ref_label', ref_label: 'ref_label',
  refValue: 'ref_value', ref_value: 'ref_value',
  component: 'component',
  listShow: 'list_show', list_show: 'list_show',
  formShow: 'form_show', form_show: 'form_show',
  detailShow: 'detail_show', detail_show: 'detail_show',
  exportShow: 'export_show', export_show: 'export_show',
  sortable: 'sortable', clearable: 'clearable',
  queryHidden: 'query_hidden', query_hidden: 'query_hidden',
  query: 'query_type', queryType: 'query_type', query_type: 'query_type',
  required: 'required', rule: 'rule', ruleMsg: 'rule_msg', rule_msg: 'rule_msg',
  remark: 'remark', comment: 'remark', sort: 'sort'
}

/**
 * index_type 与旧三布尔的双向同步。
 * 两条路径都可能进来（表单走 index_type，批量录入和 AI 走布尔），
 * 谁被显式设置就以谁为准，另一派折算，避免库里留下互相冲突的组合。
 */
export function syncIndexCols(rec: Row): void {
  const hasType = rec.index_type !== undefined
  const hasLegacy = rec.uniq !== undefined || rec.indexed !== undefined || rec.pk !== undefined
  // 这次 patch 压根没碰索引就别动，否则只改名字也会把主键/唯一一起清零。
  if (!hasType && !hasLegacy) return
  const t = hasType
    ? String(rec.index_type)
    : (boolOf(rec.pk) ? 'primary' : boolOf(rec.uniq) ? 'unique' : boolOf(rec.indexed) ? 'normal' : 'none')
  rec.index_type = t
  rec.pk = t === 'primary' ? 1 : 0
  rec.uniq = t === 'unique' ? 1 : 0
  rec.indexed = t === 'normal' ? 1 : 0
}

export const FIELD_INSERT_COLUMNS = [
  'module_id', 'name', 'col_key', 'type', 'length', 'precision', 'nullable', 'uniq', 'indexed', 'pk',
  'index_type', 'default_v', 'dict_key', 'ref_table', 'ref_label', 'ref_value', 'component',
  'list_show', 'form_show', 'detail_show', 'export_show', 'sortable', 'clearable',
  'query_type', 'query_hidden', 'required', 'rule', 'rule_msg', 'remark', 'sort'
] as const

function defaultQueryOf(type: FieldType): string {
  if (type === 'text' || type === 'richtext' || type === 'json') return 'none'
  if (type === 'datetime' || type === 'date') return 'range'
  if (type === 'varchar') return 'like'
  if (type === 'id') return 'eq'
  return 'eq'
}

/** Turn any accepted field shape into a `module_field` insert/update record. */
export function fieldRecord(input: Row, label: string): Row {
  const name = asText(pick(input, 'name', 'label') ?? '', 64)
  if (!name) throw createError({ statusCode: 400, message: `${label}：字段名称不能为空` })

  const rawKey = asText(pick(input, 'colKey', 'col_key', 'key') ?? '', 64)
  const derivedKey = rawKey || toSnake(name)
  if (!derivedKey) {
    throw createError({
      statusCode: 400,
      message: `字段「${name}」没有拉丁字母，无法自动派生列名，请显式提供 colKey（小写字母开头，下划线分隔）`
    })
  }
  const colKey = assertIdent(derivedKey, `字段「${name}」的列名 col_key`)

  const rawType = asText(pick(input, 'type') ?? 'varchar', 32).toLowerCase()
  if (!FIELD_TYPES.includes(rawType as FieldType)) {
    throw createError({
      statusCode: 400,
      message: `字段「${name}」的类型「${rawType}」不支持，可选：${FIELD_TYPES.join(' | ')}`
    })
  }
  const type = rawType as FieldType

  const required = boolOf(input.required)
  const pk = type === 'id' || boolOf(input.pk)
  const length = Math.min(4096, Math.max(1, numOf(pick(input, 'length', 'size'), type === 'enum' ? 32 : 64)))
  const precision = Math.min(6, Math.max(0, numOf(pick(input, 'precision', 'scale'), 2)))
  const rawComponent = asText(pick(input, 'component') ?? '', 32)
  if (rawComponent && !COMPONENTS.includes(rawComponent)) {
    throw createError({ statusCode: 400, message: `字段「${name}」的组件「${rawComponent}」不支持，可选：${COMPONENTS.join(' | ')}` })
  }
  const rawQuery = asText(pick(input, 'query', 'query_type', 'queryType') ?? '', 16)
  if (rawQuery && !QUERY_TYPES.includes(rawQuery as typeof QUERY_TYPES[number])) {
    throw createError({ statusCode: 400, message: `字段「${name}」的查询方式「${rawQuery}」不支持，可选：${QUERY_TYPES.join(' | ')}` })
  }
  const rawIndex = asText(pick(input, 'indexType', 'index_type') ?? '', 16)
  if (rawIndex && !INDEX_TYPES.includes(rawIndex as typeof INDEX_TYPES[number])) {
    throw createError({ statusCode: 400, message: `字段「${name}」的索引类型「${rawIndex}」不支持，可选：${INDEX_TYPES.join(' | ')}` })
  }
  // 索引以 index_type 为准；只给了旧三布尔的（批量录入、AI 建表）折算过去，
  // 保证库里不会出现「唯一 + 主键」同时成立这种自相矛盾的字段。
  const legacyIndex = input.uniq !== undefined || input.unique !== undefined || input.indexed !== undefined
  const indexType = pk ? 'primary'
    : rawIndex || (legacyIndex
      ? (boolOf(pick(input, 'unique', 'uniq')) ? 'unique' : boolOf(input.indexed) ? 'normal' : 'none')
      : (type === 'fk' ? 'normal' : 'none'))
  const refLabel = asText(pick(input, 'refLabel', 'ref_label') ?? '', 64)
  const refValue = asText(pick(input, 'refValue', 'ref_value') ?? '', 64)
  if (refLabel) assertIdent(refLabel, `字段「${name}」的数据源显示字段 refLabel`, true)
  if (refValue) assertIdent(refValue, `字段「${name}」的数据源值字段 refValue`, true)
  const def = pick(input, 'default', 'defaultValue', 'default_v')

  const rec: Row = {
    name,
    col_key: colKey,
    type,
    length,
    precision,
    nullable: pk ? 0 : (required ? 0 : (boolOf(pick(input, 'nullable'), true) ? 1 : 0)),
    uniq: indexType === 'unique' ? 1 : 0,
    // 唯一索引和主键本身就能走查询，不再叠一个普通索引。
    indexed: indexType === 'normal' ? 1 : 0,
    pk: pk ? 1 : 0,
    index_type: indexType,
    default_v: pk || def === undefined || def === null ? null : (typeof def === 'boolean' ? (def ? '1' : '0') : asText(def, 255)),
    dict_key: asText(pick(input, 'dict', 'dict_key', 'dictKey') ?? '', 64),
    ref_table: asText(pick(input, 'ref', 'ref_table', 'refTable') ?? '', 64),
    ref_label: refLabel,
    ref_value: refValue,
    component: rawComponent || componentOf({ name, key: colKey, type, length } as FieldDef),
    list_show: pk ? 1 : (boolOf(pick(input, 'listShow', 'list_show'), !['text', 'richtext', 'json'].includes(type)) ? 1 : 0),
    form_show: pk ? 0 : (boolOf(pick(input, 'formShow', 'form_show'), true) ? 1 : 0),
    detail_show: boolOf(pick(input, 'detailShow', 'detail_show'), true) ? 1 : 0,
    export_show: boolOf(pick(input, 'exportShow', 'export_show'), type !== 'id') ? 1 : 0,
    sortable: boolOf(pick(input, 'sortable')) ? 1 : 0,
    clearable: boolOf(pick(input, 'clearable'), true) ? 1 : 0,
    query_hidden: boolOf(pick(input, 'queryHidden', 'query_hidden')) ? 1 : 0,
    query_type: rawQuery || defaultQueryOf(type),
    required: required ? 1 : 0,
    rule: asText(pick(input, 'rule') ?? '', 64),
    rule_msg: asText(pick(input, 'ruleMsg', 'rule_msg') ?? '', 255),
    remark: asText(pick(input, 'remark', 'comment') ?? '', 255)
  }
  if (rec.dict_key) assertIdent(rec.dict_key, `字段「${name}」的字典编码 dict_key`, true)
  if (type === 'fk' && rec.ref_table) assertIdent(rec.ref_table, `字段「${name}」的关联表 ref_table`)
  if (type === 'enum' && !rec.dict_key) rec.dict_key = colKey
  return rec
}

/** Validate an arbitrary subset of field attributes against the `module_field` columns. */
export function fieldPatch(input: Row, label: string): Row {
  const rec: Row = {}
  for (const [k, v] of Object.entries(input)) {
    const col = FIELD_PATCH_KEYS[k]
    if (!col) continue
    rec[col] = v
  }
  if (!Object.keys(rec).length) {
    throw createError({
      statusCode: 400,
      message: `${label}：没有可更新的字段属性，可更新 name / colKey / type / length / precision / nullable / indexType / default / dict / ref / refLabel / refValue / component / listShow / formShow / detailShow / exportShow / sortable / clearable / query / queryHidden / required / rule / ruleMsg / remark / sort`
    })
  }
  if (rec.name !== undefined) {
    rec.name = asText(rec.name, 64)
    if (!rec.name) throw createError({ statusCode: 400, message: `${label}：字段名称不能为空` })
  }
  if (rec.col_key !== undefined) rec.col_key = assertIdent(asText(rec.col_key, 64), `${label}：列名 col_key`)
  if (rec.type !== undefined) {
    const type = asText(rec.type, 32).toLowerCase()
    if (!FIELD_TYPES.includes(type as FieldType)) {
      throw createError({ statusCode: 400, message: `${label}：类型「${type}」不支持，可选：${FIELD_TYPES.join(' | ')}` })
    }
    rec.type = type
  }
  for (const col of ['nullable', 'uniq', 'indexed', 'pk', 'list_show', 'form_show', 'detail_show',
    'export_show', 'sortable', 'clearable', 'query_hidden', 'required'] as const) {
    if (rec[col] !== undefined) rec[col] = boolOf(rec[col]) ? 1 : 0
  }
  if (rec.index_type !== undefined) {
    rec.index_type = asText(rec.index_type, 16)
    if (!INDEX_TYPES.includes(rec.index_type as typeof INDEX_TYPES[number])) {
      throw createError({ statusCode: 400, message: `${label}：索引类型「${rec.index_type}」不支持，可选：${INDEX_TYPES.join(' | ')}` })
    }
  }
  for (const col of ['length', 'precision', 'sort'] as const) {
    if (rec[col] !== undefined) rec[col] = Math.max(0, Math.round(numOf(rec[col], 0)))
  }
  if (rec.length !== undefined && (rec.length < 1 || rec.length > 4096)) {
    throw createError({ statusCode: 400, message: `${label}：长度 length 需在 1~4096 之间` })
  }
  if (rec.component !== undefined) {
    rec.component = asText(rec.component, 32)
    if (rec.component && !COMPONENTS.includes(rec.component)) {
      throw createError({ statusCode: 400, message: `${label}：组件「${rec.component}」不支持，可选：${COMPONENTS.join(' | ')}` })
    }
  }
  if (rec.query_type !== undefined) {
    rec.query_type = asText(rec.query_type, 16)
    if (!QUERY_TYPES.includes(rec.query_type as typeof QUERY_TYPES[number])) {
      throw createError({ statusCode: 400, message: `${label}：查询方式「${rec.query_type}」不支持，可选：${QUERY_TYPES.join(' | ')}` })
    }
  }
  if (rec.default_v !== undefined) {
    rec.default_v = rec.default_v === null || rec.default_v === ''
      ? null
      : (typeof rec.default_v === 'boolean' ? (rec.default_v ? '1' : '0') : asText(rec.default_v, 255))
  }
  if (rec.dict_key !== undefined) {
    rec.dict_key = asText(rec.dict_key, 64)
    if (rec.dict_key) assertIdent(rec.dict_key, `${label}：字典编码 dict_key`, true)
  }
  if (rec.ref_table !== undefined) {
    rec.ref_table = asText(rec.ref_table, 64)
    if (rec.ref_table) assertIdent(rec.ref_table, `${label}：关联表 ref_table`)
  }
  for (const col of ['ref_label', 'ref_value'] as const) {
    if (rec[col] !== undefined) {
      rec[col] = asText(rec[col], 64)
      if (rec[col]) assertIdent(rec[col], `${label}：数据源列 ${col}`)
    }
  }
  if (rec.rule !== undefined) rec.rule = asText(rec.rule, 64)
  if (rec.rule_msg !== undefined) rec.rule_msg = asText(rec.rule_msg, 255)
  if (rec.remark !== undefined) rec.remark = asText(rec.remark, 255)
  syncIndexCols(rec)
  return rec
}

export async function insertField(row: Row): Promise<number> {
  const cols = FIELD_INSERT_COLUMNS.filter(c => row[c] !== undefined)
  const r = await run(
    `INSERT INTO module_field (${cols.map(c => ident(c)).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map(c => row[c]))
  return r.insertId
}

/** Validate + normalise a whole field list for one module (unique col_key, single pk). */
export async function prepareFields(moduleId: number, inputs: Row[]): Promise<Row[]> {
  const seen = new Set<string>()
  const rows: Row[] = []
  let sort = await nextSortOf(`SELECT MAX(sort) s FROM module_field WHERE module_id=?`, [moduleId])
  let pkUsed = (await one<Row>(`SELECT id FROM module_field WHERE module_id=? AND pk=1`, [moduleId])) !== null
  for (const [i, input] of inputs.entries()) {
    const rec = fieldRecord(input, `第 ${i + 1} 个字段`)
    if (seen.has(rec.col_key)) {
      throw createError({ statusCode: 400, message: `字段列名「${rec.col_key}」在提交的数据里重复` })
    }
    const dup = await one<{ id: number }>(`SELECT id FROM module_field WHERE module_id=? AND col_key=?`, [moduleId, rec.col_key])
    if (dup) throw createError({ statusCode: 400, message: `字段列名「${rec.col_key}」在该模型中已存在` })
    seen.add(rec.col_key)
    if (rec.pk) {
      if (pkUsed) {
        throw createError({ statusCode: 400, message: `字段「${rec.col_key}」声明为主键，但该模型已有主键（生成器会自动补 id 主键，无需重复声明）` })
      }
      pkUsed = true
    }
    rows.push({ ...rec, module_id: moduleId, sort: sort++ })
  }
  return rows
}

// ---------------------------------------------------------------- stations JSON

export function mergeDesign(cur: Row, patch: Row): DesignDef {
  const d = designOf(cur)
  const next: DesignDef = {
    list: { ...d.list },
    form: { ...d.form },
    detail: { ...d.detail },
    menu: { ...d.menu }
  }
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (!v || typeof v !== 'object') continue
    const target = (next as Row)[k]
    if (!target) throw createError({ statusCode: 400, message: `设计稿不包含「${k}」这一段，可选：list / form / detail / menu` })
    for (const [prop, val] of Object.entries(v as Row)) {
      if (!(prop in target)) throw createError({ statusCode: 400, message: `设计稿 ${k}.${prop} 不是已知属性` })
      if (Array.isArray(val)) target[prop] = asStrArray(val)
      else if (typeof val === 'boolean') target[prop] = val
      else if (typeof val === 'number') target[prop] = val
      else if (val === null) target[prop] = null
      else if (typeof val === 'string') target[prop] = val
    }
  }
  next.list.pageSize = Math.round(numOf(next.list.pageSize, 10))
  if (next.list.pageSize < 1 || next.list.pageSize > 200) {
    throw createError({ statusCode: 400, message: `列表每页条数需在 1~200 之间，当前 ${next.list.pageSize}` })
  }
  if (!['single', 'double', 'group'].includes(next.form.layout)) {
    throw createError({ statusCode: 400, message: `表单布局 form.layout 只能是 single / double / group，当前 ${next.form.layout}` })
  }
  next.form.width = Math.min(1400, Math.max(320, Math.round(numOf(next.form.width, 720))))
  return next
}

export function mergeLogic(cur: Row, patch: Row): LogicDef {
  const stored = j<Partial<LogicDef>>(cur.logic_json, {})
  const next: LogicDef = {
    hooks: (stored.hooks ?? []).map(h => ({ ...h })),
    endpoints: (stored.endpoints ?? []).map(e => ({ ...e })),
    validators: (stored.validators ?? []).map(v => ({ ...v }))
  }
  if (!next.hooks.length) next.hooks = emptyLogic().hooks
  if (Array.isArray(patch.hooks)) {
    const known = new Set<string>(HOOKS)
    for (const h of patch.hooks as Row[]) {
      const name = asText(h?.name, 32)
      if (!known.has(name)) throw createError({ statusCode: 400, message: `未知的钩子「${name || '(空)'}」，可选：${HOOKS.join(' | ')}` })
      const target = next.hooks.find(x => x.name === name)
      if (target) {
        target.enabled = boolOf(h.enabled, target.enabled)
        target.code = typeof h.code === 'string' ? h.code : target.code
      }
    }
  }
  if (Array.isArray(patch.endpoints)) {
    next.endpoints = (patch.endpoints as Row[]).map((e, i) => {
      const method = asText(e?.method, 8).toUpperCase() || 'GET'
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        throw createError({ statusCode: 400, message: `第 ${i + 1} 个自定义接口的方法「${method}」不支持` })
      }
      const path = asText(e?.path, 128)
      if (!path.startsWith('/')) throw createError({ statusCode: 400, message: `第 ${i + 1} 个自定义接口的 path「${path}」必须以 / 开头` })
      return {
        method,
        path,
        comment: asText(e?.comment, 255),
        code: typeof e?.code === 'string' ? e.code : '',
        perm: asText(e?.perm, 64)
      }
    })
  }
  if (Array.isArray(patch.validators)) {
    next.validators = (patch.validators as Row[]).map((v, i) => {
      const field = asText(v?.field, 64)
      if (!field) throw createError({ statusCode: 400, message: `第 ${i + 1} 条校验规则缺少 field（列名）` })
      return { field, expr: asText(v?.expr, 512), message: asText(v?.message, 255) }
    })
  }
  return next
}

export function mergeSeed(cur: Row, patch: Row): SeedDef {
  const next = { ...seedOf(cur) }
  if (patch.rows !== undefined) {
    next.rows = Math.min(2000, Math.max(0, Math.round(numOf(patch.rows, next.rows))))
  }
  if (patch.enabled !== undefined) next.enabled = boolOf(patch.enabled)
  if (patch.rules !== undefined) {
    if (!patch.rules || typeof patch.rules !== 'object' || Array.isArray(patch.rules)) {
      throw createError({ statusCode: 400, message: '数据站的 rules 必须是 { 列名: 生成规则 } 形式的对象' })
    }
    const rules: Record<string, string> = {}
    for (const [k, v] of Object.entries(patch.rules as Row)) {
      rules[assertIdent(k, `造数规则的列名`)] = asText(v, 255)
    }
    next.rules = rules
  }
  return next
}

// ---------------------------------------------------------------- capability

export async function loadCapability(capKey: string): Promise<Row> {
  const c = await one<Row>(`SELECT * FROM capability WHERE cap_key=?`, [capKey])
  if (!c) throw createError({ statusCode: 404, message: `能力「${capKey}」不在能力库中，请先用 GET /api/capability 查看可装清单` })
  return c
}

export function capabilityView(c: Row, installed?: Row | null): Row {
  return {
    ...c,
    id: Number(c.id),
    spec: j<CapSpec | null>(c.spec_json, null),
    spec_json: undefined,
    installed: installed
      ? {
          id: Number(installed.id),
          version: installed.version,
          config: j<Record<string, unknown>>(installed.config_json, {}),
          status: installed.status,
          installed_at: installed.installed_at
        }
      : null
  }
}

export function tenantCapView(r: Row): Row {
  return {
    ...r,
    id: Number(r.id),
    tenant_id: Number(r.tenant_id),
    config: j<Record<string, unknown>>(r.config_json, {}),
    config_json: j<Record<string, unknown>>(r.config_json, {})
  }
}

/**
 * Keep only the options a capability actually declares, coerced to the type its
 * spec asks for — the generated code trusts these values.
 */
export function sanitizeCapConfig(spec: CapSpec | null, input: unknown): Record<string, unknown> {
  const declared = spec?.config ?? []
  if (!declared.length) {
    return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  }
  const given = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Row
  const out: Record<string, unknown> = {}
  for (const item of declared) {
    const raw = given[item.key]
    if (raw === undefined) continue
    if (item.type === 'number') {
      const n = numOf(raw, NaN)
      if (!Number.isFinite(n)) throw createError({ statusCode: 400, message: `能力配置「${item.label}」必须是数字，当前 ${str(raw)}` })
      out[item.key] = n
    } else if (item.type === 'switch') {
      out[item.key] = boolOf(raw)
    } else if (item.type === 'select') {
      const v = str(raw)
      if (item.options && !item.options.includes(v)) {
        throw createError({ statusCode: 400, message: `能力配置「${item.label}」只能是 ${item.options.join(' / ')}，当前 ${v || '(空)'}` })
      }
      out[item.key] = v
    } else {
      out[item.key] = str(raw)
    }
  }
  return out
}

// ---------------------------------------------------------------- AI 创作

export function sessionView(r: Row): Row {
  return {
    id: Number(r.id),
    tenant_id: r.tenant_id === null || r.tenant_id === undefined ? null : Number(r.tenant_id),
    user_id: Number(r.user_id),
    title: r.title ?? '新对话',
    created_at: r.created_at ?? null
  }
}

/**
 * 是否已执行：`ai_message` 没有状态列，所以 apply 把结果写回 payload 的
 * `_applied` 里，前端据此显示「已执行 / 待执行」。
 */
export function messageView(r: Row): Row {
  const payload = j<Record<string, unknown> | null>(r.payload, null)
  return {
    ...r,
    id: Number(r.id),
    session_id: Number(r.session_id),
    intent: r.intent,
    payload,
    applied: !!(payload && payload._applied),
    applyResult: payload && payload._applied ? payload._applied : null,
    created_at: r.created_at ?? null
  }
}

// ---------------------------------------------------------------- process probe

/** Short-lived TCP probe; used instead of write.ts's portOpen when it is unavailable. */
export function probePort(port: number, timeoutMs = 300): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = (open: boolean) => {
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

/**
 * 探活去抖：库里认为进程「应该在跑」时，单次探测失败不足以判定它已停止
 * （子后台冷启动有几秒窗口）。连续失败到阈值才允许把 status 落成 stopped。
 */
const probeFails = new Map<number, number>()

export function stickyRunning(port: number, probed: boolean, believedRunning: boolean, threshold = 3): boolean {
  if (probed) {
    probeFails.delete(port)
    return true
  }
  if (!believedRunning) {
    probeFails.delete(port)
    return false
  }
  const fails = (probeFails.get(port) ?? 0) + 1
  probeFails.set(port, fails)
  if (fails >= threshold) {
    probeFails.delete(port)
    return false
  }
  return true
}

/** 显式 start/stop 之后清掉计数，让下一次探测立刻生效。 */
export function resetProbe(port: number): void {
  probeFails.delete(port)
}

// ---------------------------------------------------------------- tree text

interface TreeNode { children: Map<string, TreeNode> }

export function asciiTree(paths: string[]): string {
  const root: TreeNode = { children: new Map() }
  for (const p of paths) {
    let cur = root
    for (const seg of p.split('/').filter(Boolean)) {
      if (!cur.children.has(seg)) cur.children.set(seg, { children: new Map() })
      cur = cur.children.get(seg)!
    }
  }
  const lines: string[] = []
  const walk = (node: TreeNode, prefix: string) => {
    const keys = [...node.children.keys()].sort()
    keys.forEach((k, i) => {
      const last = i === keys.length - 1
      lines.push(`${prefix}${last ? '└── ' : '├── '}${k}`)
      walk(node.children.get(k)!, prefix + (last ? '    ' : '│   '))
    })
  }
  walk(root, '')
  return lines.join('\n')
}

/**
 * 本文件是共享模块，不是路由。nitro 会把 server/api/** 下的每个 .ts 都登记成
 * 懒加载路由，所以这里显式拒绝，避免误访问时抛「Invalid lazy handler result」。
 */
export default defineEventHandler(() => {
  throw createError({ statusCode: 405, message: '内部共享模块，不提供 HTTP 访问' })
})
