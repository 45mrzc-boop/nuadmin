export type FieldType =
  | 'id' | 'varchar' | 'text' | 'richtext' | 'int' | 'decimal' | 'money'
  | 'date' | 'datetime' | 'bool' | 'enum' | 'json' | 'fk' | 'file' | 'image'

export interface FieldDef {
  name: string
  key: string
  type: FieldType
  length?: number
  precision?: number
  nullable?: boolean
  unique?: boolean
  indexed?: boolean
  pk?: boolean
  default?: string | number | boolean | null
  dict?: string
  ref?: string
  component?: string
  refLabel?: string
  refValue?: string
  listShow?: boolean
  formShow?: boolean
  query?: 'none' | 'eq' | 'like' | 'range' | 'in'
  required?: boolean
  rule?: string
  remark?: string
}

export interface ModuleDef {
  id: number
  name: string
  key: string
  tableName: string
  table?: string
  icon: string
  comment: string
  group: string
  groupIcon: string
  fields: FieldDef[]
  design: DesignDef
  logic: LogicDef
  seed: SeedDef
}

export interface DesignDef {
  list: { show: boolean; pageSize: number; actions: string[]; columns: string[]; rowKey: string; striped: boolean; exportable: boolean }
  form: { layout: 'single' | 'double' | 'group'; width: number; dialog: boolean; fields: string[] }
  detail: { show: boolean; tabs: string[] }
  menu: { show: boolean; icon: string; hidden: boolean; badge: string }
}

export interface LogicDef {
  hooks: Array<{ name: string; enabled: boolean; code: string }>
  endpoints: Array<{ method: string; path: string; comment: string; code: string; perm: string }>
  validators: Array<{ field: string; expr: string; message: string }>
}

export interface SeedDef {
  rows: number
  enabled: boolean
  rules: Record<string, string>
}

export interface CapSpec {
  desc: string
  tables?: Array<{ name: string; comment: string; fields: FieldDef[] }>
  columns?: FieldDef[]
  apis?: Array<{ method: string; path: string; comment: string }>
  pages?: Array<{ key: string; name: string; icon: string; route: string }>
  middleware?: boolean
  deps?: string[]
  config?: Array<{ key: string; label: string; type: 'text' | 'switch' | 'select' | 'number'; default: unknown; options?: string[] }>
  verify?: string[]
}

export interface AuthConfig {
  password?: string
  baseline?: Record<string, unknown>
  users?: Array<{ name?: string, username?: string, role?: string, password?: string }>
  members?: Array<{ name?: string, username?: string, role?: string }>
  roles?: Array<{ name?: string, perms?: Record<string, boolean> }>
}

export interface TenantPlan {
  slug: string
  name: string
  title: string
  description: string
  dbName: string
  port: number
  jwtSecret: string
  theme: {
    primary: string; radius: number; mode: 'light' | 'dark' | 'auto'; density: 'normal' | 'compact'; logo: string
    /** 皮肤 id 与配色 id，均来自 shared/skins.ts；配色按皮肤分组。 */
    skin?: string; palette?: string
    /** 侧栏折叠模式：icon=迷你图标条（默认） | hidden=完全隐藏 */
    collapseMode?: 'icon' | 'hidden'
  }
  loginTpl: string
  layout: string
  /** 门禁模式：simple=单密码 | users=有成员无权限 | rbac=JWT+Casbin。空=未选，阻断生成。 */
  authMode: '' | 'simple' | 'users' | 'rbac'
  /** 门禁明细：simple 存密码与安全基线，users/rbac 存成员与角色矩阵。 */
  authConfig: AuthConfig
  groups: Array<{ name: string; icon: string; modules: ModuleDef[] }>
  models?: ModuleDef[]
  caps: Record<string, { version: string; config: Record<string, unknown> }>
  /** 控制面字典定义。生成期的唯一来源，未定义的 enum 字段不再有假值。 */
  dicts: Record<string, Array<{ label: string; value: string; color?: string }>>
  /** 控制面字典中文显示名（dict_key -> dict_name），播种时使用。 */
  dictNames?: Record<string, string>
  version: number
}

export const HOOKS = [
  'beforeCreate', 'afterCreate', 'beforeUpdate', 'afterUpdate',
  'beforeDelete', 'afterDelete', 'beforeList', 'afterList', 'export'
] as const

export const allModules = (p: TenantPlan): ModuleDef[] => p.groups.flatMap(g => g.modules)

export type DictItem = { label: string; value: string; color?: string }

/**
 * 系统级内置枚举。控制面没有同名字典时用它，
 * 所以子后台的 `useUiDict().options()` 也内联了同一份（见 gen/ui.ts 的 BUILTIN）。
 */
export const BUILTIN_DICT: Record<string, DictItem[]> = {
  status: [{ label: '启用', value: '1', color: 'ok' }, { label: '停用', value: '0', color: 'err' }],
  file_kind: [{ label: '图片', value: 'image' }, { label: '文档', value: 'doc' }, { label: '其他', value: 'other' }],
  job_status: [{ label: '成功', value: 'success', color: 'ok' }, { label: '失败', value: 'failed', color: 'err' }],
  msg_kind: [{ label: '通知', value: 'notice' }, { label: '待办', value: 'todo' }],
  flow_status: [
    { label: '草稿', value: 'draft', color: '' },
    { label: '审批中', value: 'pending', color: 'warn' },
    { label: '通过', value: 'approved', color: 'ok' },
    { label: '驳回', value: 'rejected', color: 'err' }
  ]
}

/**
 * 生成期唯一的字典解析：内置常量打底，控制面字典覆盖。
 * 组件降级判断（ui.ts）和 seed 内容（server.ts）必须走这一个函数，
 * 否则会出现"渲染成下拉但库里没数据"或反之。
 */
export function resolveDicts(p: TenantPlan): Record<string, DictItem[]> {
  const out: Record<string, DictItem[]> = { ...BUILTIN_DICT }
  for (const [k, v] of Object.entries(p.dicts ?? {})) {
    if (Array.isArray(v) && v.length) out[k] = v
  }
  return out
}

/**
 * 字典是否真的可用（有至少一个条目）。绝不再用「装了能力就算可用」。
 *
 * 内置枚举前端有 BUILTIN 常量兜底，不装能力也能渲染；
 * 控制面字典依赖 /api/dict/list 与 sys_dict_* 表，没装字典能力时它们根本不存在，
 * 这时渲染成下拉只会得到一个空列表 —— 那比降级成输入框更坏，必须认出来。
 */
export function dictKnown(p: TenantPlan, key?: string): boolean {
  if (!key) return false
  if (BUILTIN_DICT[key]?.length) return true
  return !!p.caps?.dict && !!p.dicts?.[key]?.length
}

/**
 * 被字段引用但没有任何条目可用的字典 —— 这些 enum 字段会降级成输入框，
 * 必须出现在生成报告里，否则用户只会看到「下拉变成了文本框」而不知道为什么。
 * 判据与 dictKnown 共用，避免一处放宽一处收紧。
 */
export function undefinedDictKeys(p: TenantPlan): Array<{ module: string, field: string, key: string }> {
  const out: Array<{ module: string, field: string, key: string }> = []
  for (const m of allModules(p)) {
    for (const f of m.fields ?? []) {
      if (f.type !== 'enum') continue
      if (!f.dict) out.push({ module: m.name, field: f.name, key: '(未填字典编码)' })
      else if (!dictKnown(p, f.dict)) out.push({ module: m.name, field: f.name, key: f.dict })
    }
  }
  return out
}

export function emptyDesign(m: Partial<ModuleDef> = {}): DesignDef {
  return {
    list: { show: true, pageSize: 10, actions: ['create', 'edit', 'delete', 'detail'], columns: [], rowKey: 'id', striped: true, exportable: true },
    form: { layout: 'double', width: 720, dialog: true, fields: [] },
    detail: { show: true, tabs: [] },
    menu: { show: true, icon: m.icon ?? '📄', hidden: false, badge: '' }
  }
}

export function emptyLogic(): LogicDef {
  return {
    hooks: HOOKS.map(h => ({ name: h, enabled: false, code: '' })),
    endpoints: [],
    validators: []
  }
}

export function emptySeed(): SeedDef {
  return { rows: 20, enabled: true, rules: {} }
}
