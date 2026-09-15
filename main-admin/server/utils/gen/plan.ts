import type { TenantPlan, ModuleDef, FieldDef, DesignDef, LogicDef, SeedDef, AuthConfig } from './types'
import { emptyDesign, emptyLogic, emptySeed } from './types'
import { DEFAULT_SKIN } from '#shared/skins'

/** MySQL JSON columns arrive as strings in some drivers, objects in others. */
export const j = <T,>(v: unknown, fallback: T): T => {
  if (v == null || v === '') return fallback
  if (typeof v === 'string') { try { return JSON.parse(v) as T } catch { return fallback } }
  return v as T
}

const bool = (v: unknown) => v === 1 || v === true || v === '1'

function rowToField(r: any): FieldDef {
  return {
    name: r.name, key: r.col_key, type: r.type,
    length: Number(r.length ?? 64), precision: Number(r.precision ?? 2),
    nullable: bool(r.nullable), unique: bool(r.uniq), indexed: bool(r.indexed), pk: bool(r.pk),
    default: r.default_v ?? null, dict: r.dict_key ?? '', ref: r.ref_table ?? '',
    refLabel: r.ref_label ?? '', refValue: r.ref_value ?? '',
    component: r.component ?? 'input',
    listShow: bool(r.list_show), formShow: bool(r.form_show),
    detailShow: bool(r.detail_show ?? 1), exportShow: bool(r.export_show ?? 1),
    sortable: bool(r.sortable), clearable: bool(r.clearable ?? 1),
    query: r.query_type ?? 'none', queryHidden: bool(r.query_hidden), required: bool(r.required),
    rule: r.rule ?? '', ruleMsg: r.rule_msg ?? '', remark: r.remark ?? ''
  }
}

export function rowToModule(r: any, fields: FieldDef[], groupName: string, groupIcon: string): ModuleDef {
  const design = j<Partial<DesignDef>>(r.design_json, {})
  const base = emptyDesign({ icon: r.icon })
  return {
    id: Number(r.id), name: r.name, key: r.res_key, tableName: r.table_name,
    icon: r.icon ?? '📄', comment: r.comment ?? '', group: groupName, groupIcon,
    fields: [...fields].sort((a, b) => (fields.indexOf(a) - fields.indexOf(b))),
    design: {
      list: { ...base.list, ...design.list },
      form: { ...base.form, ...design.form },
      detail: { ...base.detail, ...design.detail },
      menu: { ...base.menu, ...design.menu, icon: r.icon ?? design.menu?.icon ?? base.menu.icon }
    },
    logic: { ...emptyLogic(), ...j<Partial<LogicDef>>(r.logic_json, {}) },
    seed: { ...emptySeed(), ...j<Partial<SeedDef>>(r.seed_json, {}) }
  }
}

/** Everything the generator needs, resolved from the control-plane tables. */
export async function buildPlan(tenantId: number): Promise<TenantPlan> {
  const t = await one<any>(`SELECT * FROM tenant WHERE id=?`, [tenantId])
  if (!t) throw createError({ statusCode: 404, message: '子后台不存在' })

  const groups = await q<any>(`SELECT * FROM model_group WHERE tenant_id=? ORDER BY sort,id`, [tenantId])
  const modRows = await q<any>(
    `SELECT * FROM module WHERE tenant_id=? ORDER BY sort,id`, [tenantId])
  const fieldRows = modRows.length
    ? await q<any>(
      `SELECT * FROM module_field WHERE module_id IN (${modRows.map(() => '?').join(',')}) ORDER BY sort,id`,
      modRows.map(m => m.id))
    : []

  const fieldsByModule = new Map<number, FieldDef[]>()
  for (const f of fieldRows) {
    const id = Number(f.module_id)
    if (!fieldsByModule.has(id)) fieldsByModule.set(id, [])
    fieldsByModule.get(id)!.push(rowToField(f))
  }

  const groupMeta = new Map(groups.map(g => [Number(g.id), { name: g.name, icon: g.icon }]))
  const modules = modRows.map(r => {
    const g = groupMeta.get(Number(r.group_id)) ?? { name: '未分组', icon: '📁' }
    return rowToModule(r, fieldsByModule.get(Number(r.id)) ?? [], g.name, g.icon)
  })

  const caps = await q<any>(
    `SELECT cap_key, version, config_json FROM tenant_capability WHERE tenant_id=?`, [tenantId])

  // 字典定义只认控制面这一份；enabled=0 的条目不下发，子后台下拉里不该出现被停用的值。
  const dictRows = await q<any>(
    `SELECT t.dict_key, i.label, i.value, i.color
     FROM dict_type t JOIN dict_item i ON i.type_id=t.id
     WHERE t.tenant_id=? AND i.enabled=1 ORDER BY t.dict_key, i.sort, i.id`, [tenantId])
  const dicts: TenantPlan['dicts'] = {}
  for (const r of dictRows) {
    (dicts[r.dict_key] ||= []).push({ label: r.label, value: r.value, color: r.color || undefined })
  }

  const baseTheme: TenantPlan['theme'] = {
    primary: '#007aff', radius: 12, mode: 'light', density: 'normal', logo: '',
    skin: DEFAULT_SKIN, palette: '', collapseMode: 'icon'
  }

  return {
    slug: t.slug, name: t.name, title: t.app_title || t.name, description: t.description,
    dbName: t.db_name, port: Number(t.port), jwtSecret: t.jwt_secret,
    theme: { ...baseTheme, ...j<Partial<TenantPlan['theme']>>(t.theme_json, {}) },
    loginTpl: t.login_tpl, layout: t.layout, version: Number(t.version),
    authMode: (['simple', 'users', 'rbac'].includes(t.auth_mode) ? t.auth_mode : '') as TenantPlan['authMode'],
    authConfig: j<AuthConfig>(t.auth_config, {}),
    groups: groups.map(g => ({
      name: g.name, icon: g.icon,
      modules: modules.filter(m => m.group === g.name)
    })),
    caps: Object.fromEntries(caps.map(c => [c.cap_key, { version: c.version, config: j<Record<string, unknown>>(c.config_json, {}) }])),
    dicts
  }
}

/** Next free port inside the configured range. */
export async function allocatePort(): Promise<number> {
  const { portFrom, portTo } = useRuntimeConfig().gen
  const used = new Set((await q<{ port: number }>(`SELECT port FROM tenant`)).map(r => Number(r.port)))
  for (let p = portFrom; p <= portTo; p++) if (!used.has(p)) return p
  throw createError({ statusCode: 500, message: '端口池已用尽，请扩大 TENANT_PORT_FROM/TENANT_PORT_TO' })
}

export function toSlug(input: string): string {
  const slug = (input || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
  return slug || `app-${Math.random().toString(36).slice(2, 8)}`
}

export function toCamel(input: string): string {
  const s = (input || '').trim().replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]+/g, ' ')
  if (!/[a-zA-Z]/.test(s)) return ''
  return s.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, m => m.toLowerCase())
}

/**
 * Resource key for a module. Chinese names carry no latin letters, so falling
 * back to the table name is the only way to get a meaningful, stable key.
 */
export function resKeyOf(name: string, tableName = ''): string {
  const fromName = toCamel(name)
  if (fromName) return fromName
  const fromTable = toCamel((tableName || '').replace(/^(?:biz|sys|t|cms|ocr)_/, '').replace(/^_+/, ''))
  if (fromTable) return fromTable
  return `m${Math.random().toString(36).slice(2, 7)}`
}

export function toSnake(input: string): string {
  return toCamel(input).replace(/[A-Z]/g, m => '_' + m.toLowerCase()).replace(/^_/, '')
}
