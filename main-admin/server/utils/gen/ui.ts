import type { FieldDef, ModuleDef, TenantPlan } from './types'
import { allModules, dictKnown, emptyDesign, BUILTIN_DICT } from './types'
import { componentOf, isPk, moduleFields } from './sql'

/* ------------------------------------------------------------------ *
 * 域 A：子后台前端模板生成器（Nuxt 4 + @nuxt/ui v4 + Tailwind CSS v4）
 *
 * uiFiles(plan) -> 相对路径 -> 生成的子后台源码。
 * 所有产物路径带 app/ 前缀（Nuxt 4 源码目录约定）；server/** 与根配置由域 C 负责。
 *
 * 约定（与 gen/server.ts 的产物严格对齐）：
 *   - 统一信封 {code,message,data}；列表 data = {list,total,page,size}
 *   - /api/menu -> [{name, items:[{key,name,icon,path,perm}]}]
 *   - /api/dict/list -> Record<dictKey, [{label,value,color}]>
 *
 * 生成代码的写法约束（本文件里最容易出事的地方）：
 *   1. 生成的 Vue/TS 源码里不出现反引号，也不出现 ${ }，插值一律用字符串相加；
 *   2. 生成源码里不出现反斜杠转义，需要特殊字符时用 String.fromCharCode()/
 *      String.fromCodePoint() 代替，避免在 TS 模板字面量里二次转义。
 * ------------------------------------------------------------------ */

const has = (p: TenantPlan, k: string) => !!p.caps[k]
const lit = (v: unknown) => JSON.stringify(v)
const num = (v: unknown, dflt: number) => (Number.isFinite(Number(v)) ? Number(v) : dflt)
const clamp = (v: unknown, lo: number, hi: number, dflt: number) => Math.min(Math.max(num(v, dflt), lo), hi)

function capCfg(p: TenantPlan, cap: string, key: string, dflt: unknown): unknown {
  const v = p.caps[cap]?.config?.[key]
  return v === undefined || v === null ? dflt : v
}

/** 表单里永远不该出现的引擎列（由服务端/审批流/回收站/树写入）。 */
const FORM_HIDDEN = new Set(['flow_status', 'flow_node', 'deleted_at', 'deleted_by', 'path', 'level', 'parent_id'])
/** 拿去筛选没有意义的时间/内部列。 */
const SEARCH_HIDDEN = new Set(['created_at', 'updated_at', 'deleted_at', 'deleted_by', 'flow_node', 'path', 'level', 'parent_id'])
/** 这些控件的值做精确筛选没有意义。 */
const NO_QUERY = new Set(['image', 'upload', 'code', 'richtext'])
/** 详情面板底部沉底的审计列。 */
const AUDIT_KEYS = ['created_at', 'updated_at', 'created_by', 'deleted_at', 'deleted_by']

/** 与 gen/server.ts 的 moduleInjectedColumns / wantsTree 保持一致。 */
function wantsTree(m: ModuleDef, p: TenantPlan): boolean {
  return has(p, 'tree') && (m.fields.some(f => f.key === 'parent_id') || /分类|目录|部门|菜单|区域|类目/.test(m.name))
}

function injectedColumns(m: ModuleDef, p: TenantPlan): FieldDef[] {
  const out: FieldDef[] = []
  if (has(p, 'recycle')) {
    out.push({ name: '删除时间', key: 'deleted_at', type: 'datetime', listShow: false, formShow: false })
    out.push({ name: '删除人', key: 'deleted_by', type: 'varchar', length: 64, listShow: false, formShow: false, default: '' })
  }
  if (has(p, 'flow')) {
    out.push({ name: '流程状态', key: 'flow_status', type: 'enum', length: 16, dict: 'flow_status', default: 'draft' })
    out.push({ name: '当前节点', key: 'flow_node', type: 'varchar', length: 64, default: '', listShow: false })
  }
  if (wantsTree(m, p)) {
    out.push({ name: '父级', key: 'parent_id', type: 'int', default: 0, indexed: true, listShow: false, formShow: false })
    out.push({ name: '路径', key: 'path', type: 'varchar', length: 255, default: '/', listShow: false, formShow: false })
    out.push({ name: '层级', key: 'level', type: 'int', default: 1, listShow: false, formShow: false })
  }
  return out.filter(c => !m.fields.some(f => f.key === c.key))
}

function tableFields(m: ModuleDef, p: TenantPlan): FieldDef[] {
  return [...moduleFields(m), ...injectedColumns(m, p)]
}

function refOf(f: FieldDef, p: TenantPlan): { res: string, labelKey: string, valueKey: string, name: string } | undefined {
  if (!f.ref) return undefined
  const target = allModules(p).find(mm => mm.tableName === f.ref || mm.key === f.ref)
  if (!target) return undefined
  const cols = moduleFields(target).filter(x => x.key !== 'id' && x.type !== 'id' && x.listShow !== false)
  const named = cols.find(x => /^(name|title|label)$/.test(x.key))
    ?? cols.find(x => /name|title|label/.test(x.key))
    ?? cols.find(x => x.type === 'varchar')
    ?? cols[0]
  // 建模站指定的列必须真的存在，否则生成的下拉会整列空白——宁可不认这个配置。
  const wantedLabel = f.refLabel ? cols.find(x => x.key === f.refLabel) : undefined
  const wantedValue = f.refValue ? cols.find(x => x.key === f.refValue) : undefined
  return {
    res: target.key,
    labelKey: wantedLabel?.key ?? named?.key ?? 'id',
    valueKey: wantedValue?.key ?? 'id',
    name: target.name
  }
}

/** BUILTIN_DICT / dictKnown 统一在 types.ts，seed 与组件降级必须共用同一份解析。 */

/** 单个字段的 UI 元信息；component 按已装能力降级，保证永不渲染死控件。 */
function uiField(f: FieldDef, m: ModuleDef, p: TenantPlan) {
  const pk = isPk(f)
  const ref = refOf(f, p)
  const raw = componentOf(f)
  let component = raw
  if (ref && (component === 'input' || f.type === 'fk')) component = 'remote-select'
  if (component === 'remote-select' && !ref) component = 'input'
  if (component === 'select' && !dictKnown(p, f.dict)) component = f.type === 'int' ? 'number' : 'input'
  if ((component === 'upload' || component === 'image') && !has(p, 'file')) component = 'input'
  if (f.key === 'parent_id' && wantsTree(m, p)) component = 'tree-select'
  const query = f.query ?? (f.type === 'varchar' ? 'like' : 'eq')
  // queryHidden 只是不进搜索栏；接口侧仍按 query 生效，所以这里只影响 UI。
  const searchable = query !== 'none' && !f.queryHidden && !pk && f.key !== 'id' && !SEARCH_HIDDEN.has(f.key) &&
    !NO_QUERY.has(raw) && !(f.type === 'text' && query !== 'like')
  return {
    key: f.key,
    name: f.name,
    type: f.type,
    component,
    required: !!f.required,
    length: f.length ?? 64,
    dict: f.dict ?? '',
    rule: f.rule ?? '',
    ruleMsg: f.ruleMsg ?? '',
    query,
    tip: f.remark ?? '',
    dflt: f.default ?? null,
    pk,
    listShow: f.listShow !== false,
    formShow: f.formShow !== false,
    detailShow: f.detailShow !== false,
    exportShow: f.exportShow !== false,
    // 排序改成认建模站的「是否排序」：之前是从 listShow 推导，
    // 等于每个可见列都暴露成 ORDER BY 入口，与接口侧 safeSort 白名单也不一致。
    sortable: !!f.sortable,
    searchable,
    masked: has(p, 'security') && f.rule === 'sensitive',
    ref: ref ? { res: ref.res, labelKey: ref.labelKey, valueKey: ref.valueKey, name: ref.name } : null
  }
}

type UiFieldGen = ReturnType<typeof uiField>

/**
 * schema 的紧凑序列化：叶子对象（一个字段）压成一行，数组按行展开。
 * 生成产物要进预览站做 diff，逐行 JSON 会让一个模块的 schema 涨到上千行。
 */
function prettySchema(v: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (Array.isArray(v)) {
    if (!v.length) return '[]'
    const items = v.map(x => prettySchema(x, indent + 1))
    // 数组一律一行一个元素：预览站的 diff 才读得动
    return '[\n' + items.map(s => pad + '  ' + s).join(',\n') + '\n' + pad + ']'
  }
  if (v && typeof v === 'object') {
    const body = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .map(([k, x]) => JSON.stringify(k) + ': ' + prettySchema(x, indent + 1))
    if (!body.length) return '{}'
    if (body.every(s => !s.includes('\n'))) return '{ ' + body.join(', ') + ' }'
    return '{\n' + body.map(s => pad + '  ' + s).join(',\n') + '\n' + pad + '}'
  }
  return JSON.stringify(v)
}

/** 设计站给出的顺序优先，缺失的补在后面。 */
function orderFields<T extends { key: string }>(picked: T[], wanted: string[] | undefined): T[] {
  if (!wanted?.length) return picked
  const hit = wanted.map(k => picked.find(f => f.key === k)).filter(Boolean) as T[]
  return [...hit, ...picked.filter(f => !hit.includes(f))]
}

/** 树形缩进 / 外键展示用的标题列。 */
function labelKeyOf(cols: UiFieldGen[]): string {
  const score = (k: string) => (k === 'name' || k === 'title' ? 3 : /name|title|label|subject|code/.test(k) ? 2 : 1)
  const textish = cols.filter(c => c.key !== 'id' && ['input', 'textarea', 'select', 'number'].includes(c.component))
  return [...textish].sort((a, b) => score(b.key) - score(a.key))[0]?.key ?? cols[0]?.key ?? 'id'
}

/** 抽屉/弹窗宽度：必须作为字面量 class 出现在生成产物里，Tailwind 才能静态扫描到。 */
function formWidthClass(width: number): string {
  if (width >= 960) return 'sm:w-[960px]'
  if (width >= 840) return 'sm:w-[840px]'
  if (width >= 720) return 'sm:w-[720px]'
  if (width >= 560) return 'sm:w-[560px]'
  return 'sm:w-[420px]'
}

function uiSchema(m: ModuleDef, p: TenantPlan) {

  const d = m.design ?? emptyDesign(m)
  const fields = tableFields(m, p).map(f => uiField(f, m, p))
  const byKey = new Map(fields.map(f => [f.key, f]))
  const business = fields.filter(f => !AUDIT_KEYS.includes(f.key))
  const audit = AUDIT_KEYS.map(k => byKey.get(k)).filter(Boolean) as UiFieldGen[]
  const columns = orderFields(fields.filter(f => f.listShow), d.list.columns)
  const parent = byKey.get('parent_id')
  return {
    res: m.key,
    name: m.name,
    icon: d.menu.icon || m.icon,
    comment: m.comment || '',
    group: m.group,
    rowKey: d.list.rowKey || 'id',
    labelKey: labelKeyOf(columns),
    pageSize: clamp(d.list.pageSize, 5, 200, 10),
    actions: (d.list.actions ?? ['create', 'edit', 'delete', 'export', 'detail']).filter(a => ['create', 'edit', 'delete', 'export', 'detail'].includes(a)),
    striped: d.list.striped !== false,
    detailShow: d.detail.show !== false,
    formLayout: d.form.layout || 'double',
    formWidth: clamp(d.form.width, 420, 1200, 720),
    formDialog: d.form.dialog !== false,
    slideWidthClass: formWidthClass(clamp(d.form.width, 420, 960, 720)),
    columns,
    formFields: orderFields(fields.filter(f => f.formShow && f.inForm !== true), d.form.fields),
    searchFields: fields.filter(f => f.searchable).slice(0, 6),
    detailFields: orderFields([...business.filter(f => f.detailShow), ...audit], d.detail.tabs),
    // 导出/导入模板的列由建模站的「导入/导出」开关决定，不再等于列表列
    exportFields: fields.filter(f => f.exportShow),
    recycleColumns: [...columns, ...fields.filter(f => f.key === 'deleted_at' || f.key === 'deleted_by')],
    dictKeys: [...new Set(fields.filter(f => f.component === 'select' && f.dict).map(f => f.dict as string))],
    feature: {
      batch: has(p, 'batch'),
      io: has(p, 'io'),
      tree: wantsTree(m, p),
      recycle: has(p, 'recycle'),
      flow: has(p, 'flow'),
      security: has(p, 'security'),
      dict: has(p, 'dict'),
      file: has(p, 'file'),
      print: has(p, 'print'),
      status: fields.some(f => f.key === 'status'),
      parent: has(p, 'tree') && parent?.formShow === true
    }
  }
}

/** formFields 需要 inForm 判定，单独算一次避免污染 uiField 的返回结构。 */
function formVisible(f: UiFieldGen): boolean {
  return f.formShow && !f.pk && f.key !== 'id' && f.type !== 'id' && !FORM_HIDDEN.has(f.key)
}

/* ------------------------------------------------------------------ *
 * 图标：模块/能力图标目前是 emoji，运行期菜单只能靠查表换 lucide
 * ------------------------------------------------------------------ */

const EMOJI_ICON: Record<string, string> = {
  '📚': 'book-open', '📖': 'book', '📝': 'file-pen', '📄': 'file', '📎': 'paperclip', '🔁': 'repeat',
  '☑': 'square-check', '🌲': 'tree-pine', '🌳': 'tree-deciduous', '🗑': 'trash', '🗂': 'folders',
  '📊': 'chart-column', '📈': 'trending-up', '📉': 'trending-down', '⏰': 'clock', '✉': 'mail',
  '🧾': 'receipt', '🌐': 'globe', '🛡': 'shield', '🖨': 'printer', '📦': 'package', '👤': 'user',
  '👥': 'users', '📁': 'folder', '🧩': 'puzzle', '💰': 'banknote', '🪙': 'coins', '💳': 'credit-card',
  '🛒': 'shopping-cart', '🏷': 'tag', '📅': 'calendar', '📋': 'clipboard-list', '✅': 'circle-check',
  '❌': 'circle-x', '⚠': 'triangle-alert', '❓': 'circle-question-mark', '⚙': 'settings', '🔧': 'wrench',
  '🔑': 'key', '🔒': 'lock', '🔓': 'lock-open', '🏢': 'building', '🏭': 'factory', '🚚': 'truck',
  '🏠': 'house', '📷': 'camera', '🎯': 'target', '⭐': 'star', '🔍': 'search', '📞': 'phone',
  '💬': 'message-square', '🎉': 'party-popper', '🚀': 'rocket', '❤': 'heart', '☁': 'cloud',
  '📹': 'video', '🎵': 'music', '🧠': 'brain', '💡': 'lightbulb', '🏆': 'trophy', '💼': 'briefcase',
  '🖥': 'monitor', '💻': 'laptop', '📱': 'smartphone', '🐞': 'bug', '🔔': 'bell', '👁': 'eye',
  '🎨': 'palette', '📌': 'pin', '🧮': 'calculator', '🗃': 'archive', '📤': 'upload', '📥': 'download',
  '🎟': 'ticket', '💧': 'droplet', '🔥': 'flame', '🌱': 'sprout', '☀': 'sun', '🌙': 'moon',
  '🚪': 'door-open', '🏦': 'landmark', '🧭': 'compass', '⚡': 'zap', '✏': 'pencil', '➕': 'plus',
  '🍽': 'utensils', '🧪': 'flask-conical', '🎮': 'gamepad-2', '📡': 'radio', '🗺': 'map',
  '🩺': 'stethoscope', '💊': 'pill', '🧱': 'brick-wall', '🪑': 'armchair', '👕': 'shirt',
  '🍎': 'apple', '🥤': 'cup-soda', '🚗': 'car', '✈': 'plane', '🏥': 'hospital', '⛁': 'drill'
}

const BARE_ICON = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * 图标值 -> lucide 裸名。建模库存三种值：
 * 图标选择器选的裸名（`folder`）、手写的完整名（`i-lucide-folder`）、
 * 以及列默认值遗留的 emoji（`📁`，走 EMOJI_ICON 表）。
 */
function iconName(v: unknown): string {
  const raw = String(v ?? '').split(String.fromCodePoint(0xFE0F)).join('').trim()
  if (!raw) return 'square'
  const bare = raw.startsWith('i-lucide-') ? raw.slice('i-lucide-'.length) : raw.replace(/^lucide[:-]/, '')
  if (BARE_ICON.test(bare)) return bare
  return EMOJI_ICON[bare] ?? 'square'
}

/** 生成期用：图标值 -> 完整 i-lucide-* 名。 */
function uiIconName(emoji: unknown): string {
  return 'i-lucide-' + iconName(emoji)
}

function iconEmitted(p: TenantPlan): string {
  const used = new Set<string>()
  for (const g of p.groups) {
    used.add(g.icon)
    for (const m of g.modules) {
      used.add(m.icon)
      used.add(m.design?.menu?.icon ?? '')
    }
  }
  // 解析不出来的值（emoji 不在表内）会兜底成 square，列出来供构建日志提示。
  const gaps = [...used].filter(e => String(e ?? '').trim() !== '' && iconName(e) === 'square')
  return `/**
 * 图标值解析。建模库 icon 列存三种值：图标选择器选的 lucide 裸名、
 * 手写的完整 i-lucide-* 名、以及列默认值遗留的 emoji（走下面的表）。
 */
const EMOJI_ICON: Record<string, string> = ${JSON.stringify(EMOJI_ICON, null, 2)}

const BARE_ICON = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

export function iconName(v: unknown): string {
  const raw = String(v ?? '').split(String.fromCodePoint(0xFE0F)).join('').trim()
  if (!raw) return 'square'
  const bare = raw.startsWith('i-lucide-') ? raw.slice('i-lucide-'.length) : raw.replace(/^lucide[:-]/, '')
  if (BARE_ICON.test(bare)) return bare
  return EMOJI_ICON[bare] ?? 'square'
}

export function uiIcon(v: unknown): string {
  return 'i-lucide-' + iconName(v)
}

/** 生成期发现解析不出来的图标值（空/拼错/不在 lucide 集合），构建日志会提示。 */
export const ICON_GAPS: string[] = ${JSON.stringify(gaps)}
`
}

/* ------------------------------------------------------------------ *
 * 主题：Tailwind v4 的 @theme + Nuxt UI 的语义色
 * ------------------------------------------------------------------ */

function appConfigTs(p: TenantPlan): string {
  return `/**
 * Nuxt UI 默认把语义色 primary 指向 Tailwind 的 green。
 * 这里指向 'primary'，也就是 app/assets/css/main.css 里由设计站生成的 --color-primary-* 色阶。
 * defineAppConfig 与模块默认值是深合并，其它配色与组件主题不受影响。
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'primary'
    }
  }
})
`
}


/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

/** 子后台前端源码：主题 / 工具 / 布局 / 组件 / 页面 / 每模块 schema。 */
export function uiFiles(p: TenantPlan): Record<string, string> {
  const files: Record<string, string> = {
    'app/app.config.ts': appConfigTs(p),
    'app/utils/ui-icons.ts': iconEmitted(p),
    'app/utils/ui-kit.ts': uiKit(),
    'app/layouts/default.vue': layoutDefault(p),
    'app/layouts/blank.vue': layoutBlank(p),
    'app/components/WatermarkOverlay.vue': watermarkOverlay(),
    'app/components/AppSidebar.vue': appSidebar(p),
    'app/components/AppTopbar.vue': appTopbar(p),
    'app/components/FieldInput.vue': fieldInput(p),
    'app/components/CrudForm.vue': crudForm(p),
    'app/components/CrudPage.vue': crudPage(p),
    'app/components/LoginForm.vue': loginForm(p),
    'app/pages/login.vue': loginPage(p),
    'app/pages/index.vue': indexPage(p),
    'app/pages/admin/index.vue': adminIndex(p)
  }
  if (has(p, 'dashboard')) {
    files['app/components/DashboardPanel.vue'] = dashboardPanel(p)
    files['app/pages/admin/dashboard.vue'] = simplePage('DashboardPanel', p.title + ' · 数据看板')
  }
  if (has(p, 'i18n')) files['app/components/AppLangSwitch.vue'] = langSwitch(p)
  // GVA 门禁与权限管理三大中枢页面
  files['app/pages/admin/system/auth.vue'] = authPage()
  files['app/pages/admin/system/role.vue'] = rolePage()
  files['app/pages/admin/system/user.vue'] = userPage()
  if (has(p, 'dict')) files['app/pages/admin/system/dict.vue'] = dictPage()
  if (has(p, 'log')) files['app/pages/admin/system/log.vue'] = logPage(p)
  if (has(p, 'file')) files['app/pages/admin/system/file.vue'] = filePage()
  if (has(p, 'job')) files['app/pages/admin/system/job.vue'] = jobPage()
  if (has(p, 'message')) files['app/pages/admin/system/message.vue'] = messagePage()
  if (has(p, 'landing_poster')) {
    files['app/pages/p/[scene].vue'] = landingPosterPage(p)
  }
  if (has(p, 'landing_form')) {
    files['app/pages/p/form.vue'] = landingFormPage(p)
  }
  if (has(p, 'landing_portal')) {
    files['app/pages/portal/index.vue'] = landingPortalPage(p)
  }
  if (has(p, 'landing_cms')) {
    files['app/pages/cms/index.vue'] = landingCmsPage(p)
    files['app/pages/cms/[id].vue'] = landingCmsDetailPage(p)
    files['app/pages/admin/cms/article/index.vue'] = cmsArticleAdminPage(p)
  }
  for (const m of allModules(p).filter(m => m.key)) {
    files['app/schemas/' + m.key + '.ts'] = schemaFile(m, p)
    files['app/pages/admin/' + m.key + '/index.vue'] = modulePage(m, p)
  }
  return files
}

/* ------------------------------------------------------------------ *
 * 常量：类型 / http / 格式化 / 字典 / 表单校验 / composable / 中间件
 * ------------------------------------------------------------------ */

const UI_HEADER = `/**
 * 子后台共享工具集：信封/分页/格式化/字典/表单校验/菜单/用户/顶栏状态。
 * 由生成器产出；组件按需从 ~/utils/ui-kit 具名导入。
 */
import { computed, ref } from 'vue'
import { CalendarDate, CalendarDateTime } from '@internationalized/date'
import { useApi } from '~/composables/useApi'
`

/** 共享能力全部装进一个 app/utils/ui-kit.ts，避免生成十几个小文件。 */
function uiKit(): string {
  return ['import { AUTH_COOKIE } from \'~/utils/auth-token\'\n', UI_HEADER, UI_TYPES, UI_API, UI_FMT, UI_DICT, UI_FORM, UI_NAV, UI_USER, UI_CHROME]
    .map(part => part.replace(/^\n+/, '').replace(/\n+$/, ''))
    .join('\n\n') + '\n'
}

const UI_TYPES = `export interface UiField {
  key: string
  name: string
  type: string
  component: string
  required: boolean
  length: number
  dict: string
  rule: string
  ruleMsg: string
  query: string
  tip: string
  dflt: unknown
  pk: boolean
  sortable: boolean
  searchable: boolean
  masked: boolean
  listShow: boolean
  formShow: boolean
  detailShow: boolean
  exportShow: boolean
  ref?: { res: string, labelKey: string, valueKey: string, name: string }
}

export interface UiFeature {
  batch: boolean
  io: boolean
  tree: boolean
  recycle: boolean
  flow: boolean
  security: boolean
  dict: boolean
  file: boolean
  print: boolean
  status: boolean
  parent: boolean
}

export interface UiSchema {
  res: string
  name: string
  icon: string
  comment: string
  group: string
  rowKey: string
  labelKey: string
  pageSize: number
  actions: string[]
  striped: boolean
  detailShow: boolean
  formLayout: string
  formWidth: number
  formDialog: boolean
  slideWidthClass: string
  columns: UiField[]
  formFields: UiField[]
  searchFields: UiField[]
  detailFields: UiField[]
  recycleColumns: UiField[]
  dictKeys: string[]
  feature: UiFeature
}

export interface MenuItem {
  key: string
  name: string
  icon: string
  path: string
  perm: string
  btnPerms?: string[]
}

export interface MenuGroup {
  name: string
  items: MenuItem[]
}

export interface DictItem {
  label: string
  value: string
  color?: string
}

`

const UI_API = `

export interface Paged<T> { list: T[], total: number, page: number, size: number }

/** 拆 {code,message,data} 信封；对已拆包的裸数据保持容错。 */
export function unwrap<T = any>(res: any): T {
  if (res && typeof res === 'object' && 'code' in res) return res.data as T
  return res as T
}

/** 列表接口统一形状：{list,total,page,size}。 */
export function pagedOf<T = any>(res: any, size = 20): Paged<T> {
  const d = unwrap<any>(res) ?? {}
  const list = Array.isArray(d) ? d : Array.isArray(d.list) ? d.list : []
  return {
    list: list as T[],
    total: Number(Array.isArray(d) ? d.length : d.total ?? list.length),
    page: Number(d.page ?? 1),
    size: Number(d.size ?? size)
  }
}

/** 去掉空条件，避免 ?keyword=&page=1 这类脏查询。 */
export function qs(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== null && v !== undefined))
}

/** 导出/上传需要裸 $fetch 通道（blob 与 multipart 不能被拆包逻辑处理）。 */
export function useUiRaw() {
  const token = useCookie(AUTH_COOKIE)
  const root = useRuntimeConfig().app.baseURL || '/'
  const base = (root.endsWith('/') ? root.slice(0, -1) : root) + '/api'
  const headers = () => ({ Authorization: 'Bearer ' + (token.value || '') })
  return { base, headers, root }
}

/** 页面统一 API 出口：JSON 走域 C 的 useApi()，文件走 useUiRaw()。 */
export function useUiApi() {
  const api = useApi()
  const raw = useUiRaw()

  async function download(path: string, query: Record<string, unknown>, filename: string) {
    const search = new URLSearchParams(qs(query) as Record<string, string>).toString()
    const blob = await $fetch<Blob>(raw.base + path + (search ? "?" + search : ""), {
      headers: raw.headers(),
      responseType: 'blob'
    })
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(href)
  }

  async function upload(file: File): Promise<{ id: number, name: string, url: string, kind: string }> {
    const fd = new FormData()
    fd.append('file', file)
    return await api.post('/file/upload', fd)
  }

  return { get: api.get, post: api.post, patch: api.patch, del: api.del, download, upload }
}
`
const UI_FMT = `
const NL = String.fromCharCode(10)
export const PAD = (n: number) => String(n).padStart(2, '0')

/** 空值占位，表格里避免出现空白格。 */
export const DASH = String.fromCharCode(8212)

/** 头像没有图时用名称首字母兜底。 */
export function initialsOf(name: unknown): string {
  const s = String(name ?? '').trim()
  if (!s) return "?"
  const latin = /^[a-zA-Z]/.test(s)
  return latin ? s.slice(0, 2).toUpperCase() : s.slice(0, 1)
}

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/** 后端 dateStrings:true，DATETIME 一律是 'YYYY-MM-DD HH:MM:SS'。 */
export function partsOf(value: unknown): number[] | null {
  const s = String(value ?? '').replace('T', ' ').trim()
  const m = s.match(/(\\d{4})-(\\d{2})-(\\d{2})(?:[ ](\\d{2}):(\\d{2})(?::(\\d{2}))?)?/)
  if (!m) return null
  return [+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)]
}

export function fmtDateTime(value: unknown): string {
  const p = partsOf(value)
  if (!p) return isBlank(value) ? DASH : String(value)
  return p[0] + '-' + PAD(p[1]) + '-' + PAD(p[2]) + ' ' + PAD(p[3]) + ':' + PAD(p[4])
}

export function fmtDate(value: unknown): string {
  const p = partsOf(value)
  if (!p) return isBlank(value) ? DASH : String(value)
  return p[0] + '-' + PAD(p[1]) + '-' + PAD(p[2])
}

export function money(v: unknown): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return isBlank(v) ? DASH : String(v)
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function sizeOf(bytes: unknown): string {
  const n = Number(bytes ?? 0)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return (i === 0 ? String(Math.round(v)) : v.toFixed(1)) + ' ' + units[i]
}

/** 敏感字段脱敏：保留首尾各若干位。 */
export function maskText(v: unknown): string {
  const s = String(v ?? '')
  if (!s) return DASH
  if (s.length <= 2) return '*'
  if (s.length <= 7) return s.slice(0, 1) + '*'.repeat(Math.max(2, s.length - 2)) + s.slice(-1)
  return s.slice(0, 3) + '*'.repeat(s.length - 7) + s.slice(-4)
}


export function prettyJson(v: unknown): string {
  if (isBlank(v)) return ''
  if (typeof v === 'string') { try { return JSON.stringify(JSON.parse(v), null, 2) } catch { return v } }
  try { return JSON.stringify(v, null, 2) } catch { return String(v) }
}

export function dateValueOf(value: unknown, withTime = false): CalendarDate | CalendarDateTime | undefined {
  const p = partsOf(value)
  if (!p) return undefined
  return withTime
    ? new CalendarDateTime(p[0], p[1], p[2], p[3], p[4], p[5])
    : new CalendarDate(p[0], p[1], p[2])
}

export function truthy(v: unknown): boolean {
  return v === true || v === 1 || v === '1' || v === 'true'
}

/** 附件字段可能存 url，也可能存 /uploads/<store_key>。 */
export function fileUrl(v: unknown): string {
  const s = String(v ?? '')
  if (!s) return ''
  if (s.startsWith('http') || s.startsWith('/uploads/')) return s
  return '/uploads/' + s
}
`

const UI_DICT = `
const cache = ref<Record<string, DictItem[]>>({})
const loading = ref(false)
let inFlight: Promise<void> | null = null

/** 未装字典能力时服务端不会 seed 字典表，这里内置系统级枚举兜底。 */
const BUILTIN: Record<string, DictItem[]> = ${JSON.stringify(BUILTIN_DICT, null, 2)}

/**
 * 字典：登录后一次性拉 /api/dict/list 并缓存。
 * 装了这个能力就用库里的字典，没装则退回内置枚举。
 */
export function useUiDict() {
  const { get } = useUiApi()

  /** 全站只拉一次；未安装字典能力时接口 404，静默退回 BUILTIN。 */
  function load(force = false): Promise<void> {
    if (inFlight && !force) return inFlight
    if (force) inFlight = null
    loading.value = true
    inFlight = get<Record<string, DictItem[]>>('/dict/list')
      .then((d) => { cache.value = d && typeof d === 'object' ? d : {} })
      .catch(() => { cache.value = {} })
      .then(() => { loading.value = false })
    return inFlight
  }

  function options(key?: string): DictItem[] {
    if (!key) return []
    return cache.value[key] ?? BUILTIN[key] ?? []
  }

  function label(key: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return DASH
    const hit = options(key).find(o => String(o.value) === String(value))
    return hit ? hit.label : String(value)
  }

  const COLOR_MAP: Record<string, string> = { ok: 'success', success: 'success', warn: 'warning', warning: 'warning', err: 'error', error: 'error', danger: 'error', info: 'info' }

  /** 字典里的 color 是 ok/warn/err，Nuxt UI 的 Badge 只认语义色。 */
  function badge(key: string, value: unknown): { label: string, color: string } {
    const hit = options(key).find(o => String(o.value) === String(value))
    const raw = String(hit?.color ?? '')
    return {
      label: hit?.label ?? (value === '' || value === undefined || value === null ? DASH : String(value)),
      color: COLOR_MAP[raw] ?? 'neutral'
    }
  }

  return { cache, load, options, label, badge, BUILTIN }
}
`

const UI_FORM = `/**
 * 手写 Standard Schema（v1），供 UForm 的 :schema 使用。
 * 建模站的规则只有 必填/长度/格式 三类，不值得为此引入 zod。
 */
export function uiFormSchema(fields: UiField[]) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'genplus',
      validate(value: Record<string, any>) {
        const issues: Array<{ message: string, path: unknown[] }> = []
        for (const f of fields) {
          const v = value?.[f.key]
          const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)
          if (empty) {
            if (f.required) issues.push({ message: f.name + ' 不能为空', path: [f.key] })
            continue
          }
          // 建模站填了「校验失败文案」就用它，与接口侧 check() 保持一致
          if (f.rule === 'email' && !/^[\\w.+-]+@[\\w-]+\\.[\\w.-]+$/.test(String(v))) issues.push({ message: f.name + ' ' + (f.ruleMsg || '邮箱格式不正确'), path: [f.key] })
          if (f.rule === 'phone' && !/^1[3-9]\\d{9}$/.test(String(v))) issues.push({ message: f.name + ' ' + (f.ruleMsg || '手机号格式不正确'), path: [f.key] })
          if (f.rule === 'url' && !/^https?:\\/\\/.+/.test(String(v))) issues.push({ message: f.name + ' ' + (f.ruleMsg || '链接格式不正确'), path: [f.key] })
          if ((f.type === 'int' || f.type === 'decimal' || f.type === 'money') && !Number.isFinite(Number(v))) issues.push({ message: f.name + ' 必须是数字', path: [f.key] })
          if (f.type === 'varchar' && f.length && String(v).length > f.length) issues.push({ message: f.name + ' 不能超过 ' + f.length + ' 个字符', path: [f.key] })
          if (f.type === 'json' && !empty && typeof v === 'string') {
            try { JSON.parse(v) } catch { issues.push({ message: f.name + ' 不是合法 JSON', path: [f.key] }) }
          }
        }
        return issues.length ? { issues } : { value }
      }
    }
  }
}

`

const UI_NAV = `
const groups = ref<MenuGroup[]>([])
const ready = ref(false)
const failed = ref('')

/** 菜单一次拉取全站共用；标题/面包屑也从这里推导。 */
export function useUiNav() {
  const { get } = useUiApi()

  async function load(force = false) {
    if (ready.value && !force) return groups.value
    failed.value = ''
    try {
      groups.value = (await get<MenuGroup[]>('/menu')) ?? []
    } catch (e: any) {
      failed.value = e?.message || '菜单加载失败'
    } finally {
      ready.value = true
    }
    return groups.value
  }

  const flat = computed(() => groups.value.flatMap(g => g.items))

  function titleOf(path: string): string {
    return flat.value.find(i => i.path === path)?.name ?? ''
  }

  function groupOf(path: string): string {
    return groups.value.find(g => g.items.some(i => i.path === path))?.name ?? ''
  }

  /** GVA 按钮权限：fail-closed 机制（默认拒绝，admin 拥有全量按钮放行） */
  function can(btnKey: string, customPath?: string): boolean {
    const user = useUiUser()
    if (user.me.value?.role === 'admin') return true
    const route = useRoute()
    const pth = customPath || route.path
    const item = flat.value.find(i => i.path === pth)
    if (!item) return false
    if (!item.btnPerms || !item.btnPerms.length) return false
    return item.btnPerms.includes(btnKey)
  }

  return { groups, ready, failed, load, flat, titleOf, groupOf, can }
}
`

const UI_USER = `
const me = ref<Record<string, any>>({})
const asked = ref(false)

export function useUiUser() {
  const { get, post } = useUiApi()
  const token = useCookie(AUTH_COOKIE)

  async function load(force = false) {
    if (asked.value && !force) return me.value
    try { me.value = (await get<Record<string, any>>('/profile')) ?? {} } catch { me.value = {} }
    asked.value = true
    return me.value
  }

  async function logout() {
    try { await post('/logout') } catch { /* 服务端只是回包，失败可忽略 */ }
    token.value = null
    me.value = {}
    asked.value = false
    await navigateTo('/login')
  }

  const display = computed(() => me.value.nickname || me.value.username || '未登录')
  const initials = computed(() => String(me.value.username || '?').slice(0, 2).toUpperCase())

  return { me, asked, load, logout, display, initials }
}
`

const UI_CHROME = `
const watermark = ref({ on: false, text: '' })
const unread = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

/** 顶栏与布局共享的两件全局状态：水印开关、未读消息角标。 */
export function useUiChrome() {
  const { get } = useUiApi()

  async function loadSecurity() {
    try {
      const d = await get<{ watermark?: boolean, text?: string }>('/security')
      watermark.value = { on: !!d?.watermark, text: String(d?.text ?? '') }
    } catch { watermark.value = { on: false, text: '' } }
  }

  function toggleWatermark() {
    watermark.value = { ...watermark.value, on: !watermark.value.on }
  }

  const marks = computed(() => Array.from({ length: 24 }, (_, i) => i))

  async function pollMessage() {
    try {
      const d = await get<{ unread?: number }>('/message/mine', { page: 1, size: 1 })
      unread.value = Number(d?.unread ?? 0)
    } catch { /* 未装消息能力时静默 */ }
  }

  function startPolling(seconds: number) {
    stopPolling()
    pollMessage()
    timer = setInterval(pollMessage, Math.max(10, seconds) * 1000)
  }

  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null }
  }

  return { watermark, unread, loadSecurity, toggleWatermark, marks, pollMessage, startPolling, stopPolling }
}
`

/* ------------------------------------------------------------------ *
 * 布局 / 侧栏 / 顶栏
 * ------------------------------------------------------------------ */

function layoutDefault(p: TenantPlan) {
  const top = p.layout === 'top'
  const side = top ? '' : '    <AppSidebar />\n'
  const lang = has(p, 'i18n') ? '    <AppLangSwitch />\n' : ''
  return `<script setup lang="ts">
const { load: loadNav, titleOf } = useUiNav()
const { load: loadUser } = useUiUser()
const { loadSecurity } = useUiChrome()

const route = useRoute()
const router = useRouter()
// Nuxt 包装后的 router 没有 vue-router 的 hooks()，要用 nuxtApp 自己的 page:* 钩子
const nuxtApp = useNuxtApp()

/**
 * 多页签 + 切页进度条。类名与结构照主后台「风格实战库」的画廊，
 * 皮肤 CSS 直接命中，不需要为每套皮肤再写一份。
 */
// 页签只存路径，标签在渲染时查导航表：syncTab 跑在 loadNav 之前，
// 把标签快照进 tab 会让它永远停在兜底值（菜单名到不了）。
const tabs = useState<string[]>('gen-tabs', () => [])
const HOME = '/admin'
function labelOf(path: string) {
  if (path === HOME || path === HOME + '/') return '首页'
  return titleOf(path) || path.split('/').filter(Boolean).pop() || path
}
const barOn = ref(false)
const barPct = ref(0)
const busyPath = ref('')
let timers: ReturnType<typeof setTimeout>[] = []
const clearBar = () => { timers.forEach(clearTimeout); timers = [] }

function syncTab() {
  const path = route.path
  if (!path.startsWith('/admin')) return
  if (!tabs.value.includes(path)) tabs.value.push(path)
  // 快速冲到 ~70%、缓爬到 92%，结束时必须补满 100% 再淡出：停在半路会让人以为卡住。
  clearBar()
  barOn.value = true
  barPct.value = 4
  busyPath.value = path
  timers.push(setTimeout(() => { barPct.value = 70 }, 40))
  timers.push(setTimeout(() => { if (barPct.value < 92) barPct.value = 92 }, 320))
}

function finishBar() {
  barPct.value = 100
  busyPath.value = ''
  timers.push(setTimeout(() => { barOn.value = false }, 280))
  timers.push(setTimeout(() => { barPct.value = 0 }, 620))
}

function closeTab(path: string) {
  const i = tabs.value.indexOf(path)
  if (i < 0 || tabs.value.length <= 1) return
  tabs.value.splice(i, 1)
  if (route.path === path) void router.push(tabs.value[Math.max(0, i - 1)])
}

function closeOthers(path: string) {
  tabs.value = tabs.value.filter(t => t === path)
  if (route.path !== path) void router.push(path)
}

function reload() { window.location.reload() }

const tabItems = (path: string) => [
  [{ label: '刷新当前页签', icon: 'i-lucide-rotate-cw', onSelect: () => reload() }],
  [{ label: '关闭其他页签', icon: 'i-lucide-x', onSelect: () => closeOthers(path) }],
  [{ label: '关闭全部页签', icon: 'i-lucide-list-x', onSelect: () => closeTab(path) }]
]

watch(() => route.path, syncTab)
onMounted(() => {
  loadNav()
  loadUser()
  loadSecurity()
  syncTab()
  // page:finish 才是"新页面挂上了"，比按秒猜准
  nuxtApp.hook('page:finish', finishBar)
  nuxtApp.hook('page:error', finishBar)
})
onBeforeUnmount(clearBar)
</script>

<template>
  <UDashboardGroup unit="rem" storage="local" storage-key="${p.slug}">
${side}    <UDashboardPanel>
      <template #header>
${top ? '        <AppTopbar horizontal />\n' : '        <AppTopbar />\n'}      </template>

      <template #body>
        <div class="flex min-h-0 flex-1 flex-col min-w-0">
          <div data-gen="tabbar" class="tabbar">
            <UContextMenu
              v-for="t in tabs" :key="t" :items="tabItems(t)"
            >
              <div
                class="tab" :class="{ on: route.path === t }" :title="labelOf(t)"
                @click="navigateTo(t)"
              >
                <span v-if="busyPath === t" class="tab-spin" />
                <span class="tab-label">{{ labelOf(t) }}</span>
                <button v-if="tabs.length > 1" class="tab-x" aria-label="关闭页签" @click.stop="closeTab(t)">×</button>
              </div>
            </UContextMenu>
          </div>

          <!-- 切页进度条，紧贴页签栏下方 -->
          <div
            data-gen="loadbar" class="loadbar" :class="{ on: barOn }"
            role="progressbar" :aria-valuenow="barPct" aria-valuemin="0" aria-valuemax="100"
          ><i :style="{ width: barPct + '%' }" /></div>

          <div data-gen="page" class="flex-1 min-w-0 overflow-y-auto">
            <slot />
          </div>
        </div>
      </template>
    </UDashboardPanel>

${lang}    <WatermarkOverlay />
  </UDashboardGroup>
</template>
`
}

function layoutBlank(p: TenantPlan) {
  return `<template>
  <div class="min-h-dvh bg-default text-default antialiased">
    <slot />
  </div>
</template>
`
}

/** 水印：文案来自 /api/security，顶栏按钮只做本次会话的显隐。 */
function watermarkOverlay() {
  return `<script setup lang="ts">
const { watermark, marks } = useUiChrome()
</script>

<template>
  <div v-if="watermark.on && watermark.text" class="fixed inset-0 z-50 pointer-events-none select-none overflow-hidden" aria-hidden="true">
    <div class="absolute inset-0 flex flex-wrap items-center justify-center gap-x-16 gap-y-24 -rotate-[18deg] opacity-[0.06] text-default">
      <p v-for="i in marks" :key="i" class="text-base font-medium whitespace-nowrap">{{ watermark.text }}</p>
    </div>
  </div>
</template>
`
}

function appSidebar(p: TenantPlan) {
  return `<script setup lang="ts">
import type { NavigationMenuItem, DropdownMenuItem } from '@nuxt/ui'
import { uiIcon } from '~/utils/ui-icons'

const { groups, ready, failed, load } = useUiNav()
const { me, display, initials, logout, load: loadUser } = useUiUser()

const TITLE = ${lit(p.title)}
const LOGO = ${lit(p.theme.logo || '')}
const BRAND_ICON = ${lit(uiIconName(p.groups[0]?.icon ?? '🧩'))}

/**
 * 侧栏折叠模式：
 * - 'icon': 迷你图标栏（默认 64px 宽）
 * - 'hidden': 完全隐藏侧栏（0 宽，全屏工作区，由顶栏按钮唤出）
 */
const defaultMode = ${lit(p.theme.collapseMode || 'icon')} as 'icon' | 'hidden'
const collapseMode = useCookie<'icon' | 'hidden'>('collapse_mode_${p.slug}', { default: () => defaultMode })
const isHiddenMode = computed(() => collapseMode.value === 'hidden')

function toggleCollapseMode() {
  collapseMode.value = collapseMode.value === 'hidden' ? 'icon' : 'hidden'
}

onMounted(() => {
  load()
  loadUser()
})

const items = computed<NavigationMenuItem[][]>(() =>
  groups.value
    .filter(g => g.items.length)
    .map(g => [
      { label: g.name, type: 'label' } as NavigationMenuItem,
      ...g.items.map(i => ({ label: i.name, icon: uiIcon(i.icon), to: i.path }))
    ]))

const userRoleLabel = computed(() => {
  if (me.value.username === '持门者' || (me.value as any).authMode === 'simple') {
    return '当前身份：门禁授权通行'
  }
  return '当前角色：' + (me.value.role || '-')
})

const userMenu = computed<DropdownMenuItem[][]>(() => [
  [{ label: userRoleLabel.value, disabled: true }],
  [
    {
      label: isHiddenMode.value ? '模式：折叠完全隐藏（点击切为图标）' : '模式：折叠保留图标（点击切为隐藏）',
      icon: isHiddenMode.value ? 'i-lucide-eye-off' : 'i-lucide-columns-2',
      onSelect: toggleCollapseMode
    }
  ],
  [{ label: '退出登录', icon: 'i-lucide-log-out', color: 'error', onSelect: logout }]
])
</script>

<template>
  <UDashboardSidebar
    data-gen="sidebar"
    id="main"
    collapsible
    resizable
    class="skin-side"
    :class="{ 'mode-hidden': isHiddenMode }"
    :data-collapse-mode="collapseMode"
    :default-size="16"
    :min-size="13"
    :max-size="26"
    :collapsed-size="isHiddenMode ? 0 : 4"
  >
    <template #header="{ collapsed, collapse }">
      <div
        class="flex min-w-0 items-center gap-2 px-1 py-1.5 overflow-hidden w-full cursor-pointer select-none"
        :class="collapsed ? 'justify-center' : ''"
        :title="collapsed ? '点击展开侧栏' : TITLE"
        @click="collapsed ? collapse(false) : navigateTo('/admin')"
      >
        <span class="size-8 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
          <img v-if="LOGO" :src="LOGO" :alt="TITLE" class="size-5 object-contain">
          <UIcon v-else :name="BRAND_ICON" class="size-4.5 text-primary" />
        </span>
        <span v-if="!collapsed" class="font-bold text-[15px] truncate">{{ TITLE }}</span>
      </div>
    </template>

    <template #default="{ collapsed }">
      <div v-if="!ready" class="space-y-2 px-1">
        <USkeleton v-for="i in 7" :key="i" class="h-8 w-full" />
      </div>
      <div v-else-if="failed" class="px-1">
        <UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="菜单加载失败" :description="failed">
          <template #trailing>
            <UButton label="重试" size="xs" color="neutral" variant="outline" @click="load(true)" />
          </template>
        </UAlert>
      </div>
      <UNavigationMenu
        v-else
        :collapsed="collapsed"
        :items="items"
        orientation="vertical"
        tooltip
        link
        class="flex-1"
      />
      <p v-if="failed && ready" class="text-xs text-dimmed px-2 pt-2">{{ failed }}</p>
    </template>

    <template #footer="{ collapsed, collapse }">
      <div class="flex flex-col gap-1.5 w-full shrink-0">
        <UDropdownMenu :items="userMenu">
          <UButton
            color="neutral"
            variant="ghost"
            :block="!collapsed"
            :square="collapsed"
            :leading="false"
            :icon="collapsed ? 'i-lucide-ellipsis' : undefined"
            :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
            :class="collapsed ? 'mx-auto' : ''"
            :aria-label="collapsed ? '账号与折叠模式设置' : undefined"
          >
            <span v-if="!collapsed" class="flex items-center gap-2 min-w-0">
              <UAvatar :src="me.avatar || undefined" :alt="initials" size="xs" />
              <span class="truncate text-xs">{{ display }}</span>
            </span>
          </UButton>
        </UDropdownMenu>
        <div class="flex items-center pt-0.5" :class="collapsed ? 'justify-center' : 'justify-between'">
          <span v-if="!collapsed" class="text-xs text-dimmed">v1.${p.version}</span>
          <UDashboardSidebarCollapse
            data-gen="sidebar-collapse"
            class="!inline-flex"
            size="xs"
            :square="collapsed"
          />
        </div>
      </div>
    </template>
  </UDashboardSidebar>
</template>
`
}

function appTopbar(p: TenantPlan) {
  return `<script setup lang="ts">
import type { BreadcrumbItem, DropdownMenuItem } from '@nuxt/ui'
import { uiIcon } from '~/utils/ui-icons'

defineProps<{ horizontal?: boolean }>()

const route = useRoute()
const { titleOf, groupOf, flat, load: loadNav } = useUiNav()
const { me, display, initials, logout, load: loadUser } = useUiUser()
const { watermark, unread, toggleWatermark, startPolling, stopPolling } = useUiChrome()

const TITLE = ${lit(p.title)}
const HAS_MESSAGE = ${has(p, 'message')}
const HAS_SECURITY = ${has(p, 'security')}
const POLL = ${clamp(capCfg(p, 'message', 'pollSeconds', 60), 10, 600, 60)}

onMounted(() => {
  loadNav()
  loadUser()
  if (HAS_MESSAGE) startPolling(POLL)
})
onUnmounted(stopPolling)

const pageTitle = computed(() => titleOf(route.path) || (route.path === '/admin' ? '首页' : ''))

const crumbs = computed<BreadcrumbItem[]>(() => {
  const out: BreadcrumbItem[] = [{ label: '首页', to: '/admin', icon: 'i-lucide-house' }]
  const g = groupOf(route.path)
  const t = titleOf(route.path)
  if (g && g !== '系统管理') out.push({ label: g })
  if (t && route.path !== '/admin') out.push({ label: t })
  return out
})

const navItems = computed(() => flat.value.map(i => ({ label: i.name, icon: uiIcon(i.icon), to: i.path })))

const userItems = computed<DropdownMenuItem[][]>(() => [[
  { label: me.value.username || '-', description: me.value.nickname || '', disabled: true }
], [
  { label: '退出登录', icon: 'i-lucide-log-out', color: 'error', onSelect: logout }
]])
</script>

<template>
  <UDashboardNavbar data-gen="navbar" class="skin-top" :title="pageTitle || TITLE">
    <template #left>
      <UDashboardSidebarCollapse
        data-gen="topbar-collapse"
        class="!inline-flex mr-1.5 shrink-0"
      />
      <UBreadcrumb :items="crumbs" class="hidden sm:flex" />
    </template>

    <template v-if="horizontal" #default>
      <UNavigationMenu :items="navItems" class="hidden lg:flex" />
    </template>

    <template #right>
${has(p, 'i18n') ? '      <AppLangSwitch />\n' : ''}
      <UTooltip v-if="HAS_SECURITY" :text="watermark.on ? '关闭水印' : '开启水印'">
        <UButton
          color="neutral"
          variant="ghost"
          square
          :icon="watermark.on ? 'i-lucide-stamp' : 'i-lucide-circle-slash'"
          :aria-label="watermark.on ? '关闭水印' : '开启水印'"
          @click="toggleWatermark"
        />
      </UTooltip>

      <ClientOnly v-if="HAS_MESSAGE">
        <UChip :show="unread > 0" :text="unread > 99 ? '99+' : unread" color="error" size="sm" position="top-right">
          <UTooltip text="我的消息">
            <UButton to="/admin/system/message" color="neutral" variant="ghost" square icon="i-lucide-inbox" aria-label="我的消息" />
          </UTooltip>
        </UChip>
      </ClientOnly>

      <UTooltip text="切换深浅色">
        <UColorModeButton />
      </UTooltip>

      <UDropdownMenu :items="userItems" :content="{ align: 'end' }">
        <UButton color="neutral" variant="ghost" class="gap-2" :trailing-icon="horizontal ? 'i-lucide-chevron-down' : undefined">
          <UAvatar :src="me.avatar || undefined" :alt="initials" size="xs" />
          <span class="hidden sm:inline text-sm">{{ display }}</span>
        </UButton>
      </UDropdownMenu>
    </template>
  </UDashboardNavbar>
</template>
`
}

/* ------------------------------------------------------------------ *
 * FieldInput：按 component 渲染 Nuxt UI 表单控件
 * ------------------------------------------------------------------ */

function fieldInput(p: TenantPlan) {
  const fileMax = clamp(capCfg(p, 'file', 'maxMb', 20), 1, 500, 20)
  const fileExts = String(capCfg(p, 'file', 'exts', 'jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,zip'))
  return `<script setup lang="ts">
import type { UiField } from '~/utils/ui-kit'
import { CalendarDate } from '@internationalized/date'

const props = withDefaults(defineProps<{
  field: UiField
  /** 当前模块 resKey：树形父级要用 /api/{res}/tree。 */
  res?: string
  /** 外键/父级下拉展示用的列名。 */
  labelKey?: string
  modelValue?: any
  size?: 'xs' | 'sm' | 'md' | 'lg'
}>(), { res: '', labelKey: 'name', modelValue: undefined, size: 'md' })

const emit = defineEmits<{ 'update:modelValue': [value: any] }>()

const FILE_ACCEPT = ${lit(fileExts.split(',').map(e => '.' + e).join(','))}
const IMG_ACCEPT = 'image/*'
const MAX_MB = ${fileMax}

const dict = useUiDict()
const { get, upload } = useUiApi()
const { push } = useNotify()

const busy = ref(false)
const options = ref<Array<{ label: string, value: any }>>([])
const optionsLoading = ref(false)

const set = (v: any) => emit('update:modelValue', v === '__all__' ? '' : v)

const dictItems = computed(() => dict.options(props.field.dict).map(i => ({ label: i.label, value: i.value })))
const BOOL_ITEMS = [{ label: '是', value: '1' }, { label: '否', value: '0' }]
const BOOL_SEARCH_ITEMS = [{ label: '全部 (不限)', value: '__all__' }, { label: '是', value: '1' }, { label: '否', value: '0' }]
/** status / bool / switch 在搜索或下拉时提供选项，杜绝 value 为空字符串避免 Reka UI 抛 500 */
const pickItems = computed(() => {
  if (props.field.dict) return dictItems.value.filter(i => i.value !== '' && i.value !== null && i.value !== undefined)
  if (props.field.type === 'bool' || props.field.key === 'status' || props.field.component === 'switch') {
    return BOOL_SEARCH_ITEMS
  }
  return []
})

const textValue = computed(() => props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue))
const numberValue = computed(() => {
  const v = props.modelValue
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
})
const switchOn = computed(() => truthy(props.modelValue))
const checkList = computed(() => {
  const v = props.modelValue
  if (Array.isArray(v)) return v.map(String)
  if (v === null || v === undefined || v === '') return []
  return String(v).split(',').filter(Boolean)
})
const preview = computed(() => fileUrl(props.modelValue))
const isImage = computed(() => preview.value.startsWith('data:') || /\\.(png|jpe?g|gif|webp|svg)(\\?.*)$/i.test(preview.value))
const inputType = computed(() => (props.field.rule === 'email' ? 'email' : props.field.rule === 'url' ? 'url' : props.field.rule === 'phone' ? 'tel' : 'text'))
const placeholder = computed(() => {
  if (props.field.tip) return props.field.tip
  if (props.field.type === 'bool' || props.field.component === 'switch') return '全部'
  if (props.field.component === 'date') return '请选择日期'
  if (props.field.component === 'datetime') return '请选择时间'
  if (props.field.component === 'select' || props.field.component === 'remote-select' || props.field.component === 'tree-select') return '请选择' + props.field.name
  return '请输入' + props.field.name
})

const isDateTime = computed(() => props.field.component === 'datetime')

const calendarDateValue = computed(() => {
  const p = partsOf(props.modelValue)
  if (!p) return undefined
  return new CalendarDate(p[0], p[1], p[2])
})

const timePart = ref('00:00:00')

watch(() => props.modelValue, (v) => {
  const p = partsOf(v)
  if (p && isDateTime.value) {
    timePart.value = \`\${PAD(p[3])}:\${PAD(p[4])}:\${PAD(p[5])}\`
  }
}, { immediate: true })

function onTimeChange(t: string) {
  timePart.value = t
  const p = partsOf(props.modelValue)
  if (p) {
    const dStr = \`\${p[0]}-\${PAD(p[1])}-\${PAD(p[2])}\`
    const fullTime = t.length === 5 ? t + ':00' : (t || '00:00:00')
    set(\`\${dStr} \${fullTime}\`)
  }
}

function onCalendarSelect(v: any, close?: () => void) {
  if (!v) return
  const dateStr = v.toString() // 'YYYY-MM-DD'
  if (isDateTime.value) {
    const t = timePart.value.length === 5 ? timePart.value + ':00' : (timePart.value || '00:00:00')
    set(\`\${dateStr} \${t}\`)
  } else {
    set(dateStr)
    if (close) close()
  }
}

function pickNow(close?: () => void) {
  const now = new Date()
  const Y = now.getFullYear()
  const M = PAD(now.getMonth() + 1)
  const D = PAD(now.getDate())
  const h = PAD(now.getHours())
  const m = PAD(now.getMinutes())
  const s = PAD(now.getSeconds())
  timePart.value = \`\${h}:\${m}:\${s}\`
  set(\`\${Y}-\${M}-\${D} \${h}:\${m}:\${s}\`)
  if (close) close()
}

function pickToday(close?: () => void) {
  const now = new Date()
  const Y = now.getFullYear()
  const M = PAD(now.getMonth() + 1)
  const D = PAD(now.getDate())
  set(\`\${Y}-\${M}-\${D}\`)
  if (close) close()
}

function clearDate(close?: () => void) {
  set('')
  if (close) close()
}

function confirmDateTime(close?: () => void) {
  if (!props.modelValue) {
    pickNow(close)
    return
  }
  if (close) close()
}

async function onUpload(files: any) {
  const file = Array.isArray(files) ? files[0]?.file : files?.file
  if (!file) return
  if (file.size > MAX_MB * 1024 * 1024) {
    push('文件超过 ' + MAX_MB + 'MB', 'error')
    return
  }
  busy.value = true
  try {
    const r = await upload(file)
    set(r.url)
    push('上传成功：' + r.name, 'success')
  } catch { /* useApi 已统一提示 */ } finally { busy.value = false }
}

/** 外键下拉：一次拉 200 条，够用，不必为模板再造搜索接口。 */
async function loadRemote() {
  const ref = props.field.ref
  if (!ref) return
  optionsLoading.value = true
  try {
    const d = pagedOf(await get('/' + ref.res + '/list', { page: 1, size: 200 }))
    // valueKey 让建模站能指定外键列实际存目标表的哪一列，默认仍是 id
    options.value = d.list.map((r: any) => ({ label: String(r[ref.labelKey] ?? r.id), value: r[ref.valueKey ?? 'id'] ?? r.id }))
  } catch { options.value = [] } finally { optionsLoading.value = false }
}

/** 父级下拉：把 /tree 的嵌套结果拍平成带缩进的选项。 */
async function loadTree() {
  if (!props.res) return
  optionsLoading.value = true
  try {
    const nodes = await get<any[]>('/' + props.res + '/tree')
    const out: Array<{ label: string, value: number }> = []
    const walk = (list: any[], depth: number) => {
      const pad = String.fromCharCode(183, 160).repeat(depth)
      for (const n of list ?? []) {
        out.push({ label: pad + String(n[props.labelKey] ?? n.name ?? n.id), value: Number(n.id) })
        if (depth < 8) walk(n.children ?? [], depth + 1)
      }
    }
    walk(nodes ?? [], 0)
    options.value = out
  } catch { options.value = [] } finally { optionsLoading.value = false }
}

onMounted(() => {
  if (props.field.dict) dict.load()
  if (props.field.component === 'remote-select') loadRemote()
  if (props.field.component === 'tree-select') loadTree()
})
</script>

<template>
  <div class="w-full">
    <UTextarea
      v-if="field.component === 'textarea'"
      :model-value="textValue"
      :placeholder="placeholder"
      :size="size"
      :rows="3"
      autoresize
      :maxrows="8"
      class="w-full"
      @update:model-value="set"
    />

    <div v-else-if="field.component === 'richtext'" class="w-full rounded-md border border-muted bg-elevated">
      <UEditor
        :model-value="textValue"
        content-type="html"
        :placeholder="placeholder"
        @update:model-value="set"
      />
    </div>

    <UInputNumber
      v-else-if="field.component === 'number'"
      :model-value="numberValue"
      :placeholder="placeholder"
      :size="size"
      :step="field.type === 'int' ? 1 : 0.01"
      :format-options="field.type === 'money' ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined"
      class="w-full"
      @update:model-value="set"
    />

    <UPopover
      v-else-if="field.component === 'date' || field.component === 'datetime'"
      :ui="{ content: 'p-2' }"
    >
      <UInput
        :model-value="textValue"
        :placeholder="placeholder"
        :size="size"
        readonly
        class="w-full cursor-pointer"
      >
        <template #trailing>
          <div class="flex items-center gap-1">
            <button
              v-if="textValue"
              type="button"
              class="text-muted hover:text-default cursor-pointer p-0.5 rounded transition-colors"
              title="清空"
              @click.stop="set('')"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />
            </button>
            <UIcon name="i-lucide-calendar" class="size-4 text-muted pointer-events-none" />
          </div>
        </template>
      </UInput>
      <template #content="{ close }">
        <div class="flex flex-col gap-2 p-1 select-none">
          <UCalendar
            :model-value="calendarDateValue"
            locale="zh-CN"
            @update:model-value="(v: any) => onCalendarSelect(v, close)"
          />
          <div v-if="field.component === 'datetime'" class="flex items-center justify-between gap-2 pt-2 border-t border-muted/60">
            <div class="flex items-center gap-1.5">
              <span class="text-xs text-muted">时间</span>
              <UInput
                type="time"
                step="1"
                v-model="timePart"
                size="xs"
                class="w-28 font-mono text-xs"
                @update:model-value="onTimeChange"
              />
            </div>
            <div class="flex items-center gap-1">
              <UButton size="xs" color="neutral" variant="ghost" label="此时" @click="pickNow(close)" />
              <UButton size="xs" color="primary" label="确定" @click="confirmDateTime(close)" />
            </div>
          </div>
          <div v-else class="flex items-center justify-between pt-1 border-t border-muted/60">
            <UButton size="xs" color="neutral" variant="ghost" label="清除" @click="clearDate(close)" />
            <UButton size="xs" color="primary" variant="ghost" label="今天" @click="pickToday(close)" />
          </div>
        </div>
      </template>
    </UPopover>

    <USwitch
      v-else-if="field.component === 'switch'"
      :model-value="switchOn"
      :size="size"
      @update:model-value="set"
    />

    <UCheckboxGroup
      v-else-if="field.component === 'checkbox'"
      :model-value="checkList"
      :items="pickItems"
      :size="size"
      orientation="horizontal"
      @update:model-value="(v: any) => set((v ?? []).join(','))"
    />

    <URadioGroup
      v-else-if="field.component === 'radio'"
      :model-value="textValue"
      :items="pickItems"
      :size="size"
      orientation="horizontal"
      @update:model-value="set"
    />

    <USelect
      v-else-if="field.component === 'select'"
      :model-value="textValue || undefined"
      :items="pickItems"
      value-key="value"
      label-key="label"
      :placeholder="placeholder"
      :size="size"
      class="w-full"
      @update:model-value="set"
    />

    <USelectMenu
      v-else-if="field.component === 'remote-select' || field.component === 'tree-select'"
      :model-value="field.component === 'tree-select' ? numberValue : (props.modelValue ?? undefined)"
      :items="options"
      value-key="value"
      label-key="label"
      :loading="optionsLoading"
      :placeholder="'请选择' + (field.component === 'tree-select' ? '上级' : field.name)"
      :search-placeholder="'搜索'"
      :size="size"
      class="w-full"
      @update:model-value="set"
    />

    <UFileUpload
      v-else-if="field.component === 'upload' || field.component === 'image'"
      :accept="field.component === 'image' ? IMG_ACCEPT : FILE_ACCEPT"
      :label="busy ? '上传中...' : '点击或拖拽上传'"
      :description="'单文件最大 ' + MAX_MB + 'MB'"
      :disabled="busy"
      variant="area"
      :size="size"
      @update:value="onUpload"
    />

    <div v-else-if="field.component === 'code'" class="w-full">
      <UTextarea
        :model-value="textValue"
        placeholder="{}"
        :rows="6"
        :ui="{ base: 'font-mono text-xs' }"
        class="w-full"
        @update:model-value="set"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        icon="i-lucide-braces"
        label="格式化 JSON"
        class="mt-1"
        @click="set(prettyJson(modelValue))"
      />
    </div>

    <UInput
      v-else
      :model-value="textValue"
      :type="inputType"
      :placeholder="placeholder"
      :size="size"
      :maxlength="field.length || undefined"
      class="w-full"
      @update:model-value="set"
    />

    <div v-if="field.component === 'upload' || field.component === 'image'" class="flex flex-wrap items-center gap-2 pt-2">
      <img v-if="preview && isImage" :src="preview" :alt="field.name" class="size-14 rounded-md border border-muted object-cover">
      <a v-else-if="preview" :href="preview" target="_blank" rel="noopener" class="text-xs text-primary break-all hover:underline">{{ preview }}</a>
      <span v-else class="text-xs text-dimmed">暂无附件</span>
      <UButton v-if="preview" size="xs" color="neutral" variant="ghost" icon="i-lucide-trash" label="清除" @click="set('')" />
    </div>
  </div>
</template>
`
}

/* ------------------------------------------------------------------ *
 * CrudForm：新增/编辑表单（UForm + Standard Schema 自研校验器）
 * ------------------------------------------------------------------ */

function crudForm(p: TenantPlan) {
  return `<script setup lang="ts">
import type { UiField } from '~/utils/ui-kit'

const props = withDefaults(defineProps<{
  fields: UiField[]
  res: string
  labelKey?: string
  layout?: string
  width?: number
  formId: string
  row?: Record<string, any> | null
}>(), { labelKey: 'name', layout: 'double', width: 720, row: null })

const emit = defineEmits<{ submit: [payload: Record<string, any>] }>()

const dict = useUiDict()
const schema = computed(() => uiFormSchema(props.fields))
const state = reactive<Record<string, any>>({})

/** 服务端回来的值要先归一化，否则 UInputNumber / USwitch 会拿到字符串。 */
function normalize(f: UiField, raw: unknown): any {
  if (f.component === 'switch') return truthy(raw)
  if (f.component === 'checkbox') {
    if (Array.isArray(raw)) return raw.map(String)
    return raw === null || raw === undefined || raw === '' ? [] : String(raw).split(',').filter(Boolean)
  }
  if (raw === null || raw === undefined || raw === '') return f.component === 'number' ? null : ''
  if (f.component === 'number' || f.component === 'remote-select') {
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  }
  if (f.component === 'code') return prettyJson(raw)
  return typeof raw === 'object' ? JSON.stringify(raw) : raw
}

function seed(source: Record<string, any> | null | undefined) {
  for (const key of Object.keys(state)) delete state[key]
  for (const f of props.fields) {
    const fromRow = source ? source[f.key] : undefined
    const base = fromRow === undefined || fromRow === null ? f.dflt : fromRow
    state[f.key] = normalize(f, base)
  }
}

watch(() => props.row, (r) => seed(r), { immediate: true })
watch(() => props.fields, () => seed(props.row))
onMounted(() => { if (props.fields.some(f => f.dict)) dict.load() })

const gridClass = computed(() => (props.layout === 'single' ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'))
const WIDE = ['textarea', 'richtext', 'code', 'upload', 'image', 'checkbox']
const isWide = (f: UiField) => WIDE.includes(f.component) || f.key === 'description'

function onSubmit(event: any) {
  emit('submit', { ...(event?.data ?? state) })
}
</script>

<template>
  <UForm :id="formId" :schema="schema" :state="state" :class="gridClass" @submit="onSubmit">
    <UFormField
      v-for="f in fields"
      :key="f.key"
      :name="f.key"
      :label="f.name"
      :required="f.required"
      :description="f.component === 'switch' ? undefined : (f.tip || undefined)"
      :hint="f.required ? undefined : '选填'"
      :orientation="f.component === 'switch' ? 'horizontal' : 'vertical'"
      :class="isWide(f) ? 'sm:col-span-2' : ''"
    >
      <FieldInput :field="f" :res="res" :label-key="labelKey" v-model="state[f.key]" />
    </UFormField>
  </UForm>
</template>
`
}

/* ------------------------------------------------------------------ *
 * CrudPage：搜索栏 / 表格 / 分页 / 新增编辑 / 详情 / 各能力开关
 * ------------------------------------------------------------------ */

function crudPage(p: TenantPlan) {
  void p
  return `<script setup lang="ts">
import type { UiField, UiSchema } from '~/utils/ui-kit'
import { uiIcon } from '~/utils/ui-icons'
import { computed, h, reactive, ref, resolveComponent, watch } from 'vue'

const props = defineProps<{ schema: UiSchema }>()

const s = props.schema
const formId = 'crud-form-' + s.res
/** 详情抽屉宽度与表单一致，用生成期字面量保证 Tailwind 能扫到类名。 */
const SLIDE_UI = 'w-full ' + s.slideWidthClass

const UIcon = resolveComponent('UIcon')
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')

const { get, post, download } = useUiApi()
const { push } = useNotify()
const dict = useUiDict()

type Row = Record<string, any>

const mode = ref<'list' | 'tree' | 'recycle'>('list')
const rows = ref<Row[]>([])
const tree = ref<Row[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(s.pageSize)
const sortKey = ref('')
const sortOrder = ref<'asc' | 'desc'>('desc')
const cond = reactive<Record<string, any>>({})
const loading = ref(false)
const failed = ref('')
const rowSelection = ref<Record<string, boolean>>({})
const closed = ref<number[]>([])
const revealed = ref<string[]>([])
const exporting = ref(false)
const remoteMaps = ref<Record<string, Record<string, string>>>({})

async function loadRemoteMaps() {
  const fkCols = (s.columns || []).filter((c: any) => c.component === 'remote-select' && c.ref?.res)
  for (const c of fkCols) {
    if (remoteMaps.value[c.key]) continue
    try {
      const res = pagedOf(await get('/' + c.ref.res + '/list', { page: 1, size: 200 }))
      const map: Record<string, string> = {}
      for (const item of (res.list || [])) {
        const val = String(item[c.ref.valueKey || 'id'] ?? item.id)
        const lbl = String(item[c.ref.labelKey || 'name'] ?? item.name ?? val)
        map[val] = lbl
      }
      remoteMaps.value[c.key] = map
    } catch {}
  }
}

const form = reactive({ open: false, isNew: true, row: null as Row | null, busy: false })
const detail = reactive({ open: false, row: null as Row | null, loading: false })
const askBox = reactive({ open: false, title: '', text: '', danger: false, needComment: false, comment: '', busy: false, run: null as null | ((c: string) => Promise<void>) })
const assign = reactive({ open: false, key: '', value: '' as any, busy: false })
const imp = reactive({ open: false, csv: '', busy: false, result: null as any })
const promotion = reactive({ open: false, url: '', row: null as Row | null })

const FLOW_NODES = ${JSON.stringify(String(capCfg(p, 'flow', 'nodes', '提交,部门审核,终审')).split(','))}

const { can: canBtn } = useUiNav()
const can = (a: string) => s.actions.includes(a) && canBtn(a)
const f = s.feature

const modes = computed(() => {
  const out = [{ key: 'list' as const, label: '列表', icon: 'i-lucide-list' }]
  if (f.tree) out.push({ key: 'tree' as const, label: '树形', icon: 'i-lucide-network' })
  if (f.recycle) out.push({ key: 'recycle' as const, label: '回收站', icon: 'i-lucide-trash' })
  return out
})

/** 搜索栏字段：range 条件拆成起止两个控件；布尔字段转下拉（全部/是/否），保持排版统一且支持“全部” */
const searchPairs = computed(() => s.searchFields.flatMap((x) => {
  let field = { ...x, required: false }
  if (field.component === 'switch' || field.type === 'bool') {
    field = { ...field, component: 'select', dict: '' }
  }
  if (x.query === 'range') {
    return [
      { field, key: x.key + '_from', label: x.name + ' 起' },
      { field: { ...field, dflt: null }, key: x.key + '_to', label: x.name + ' 止' }
    ]
  }
  return [{ field, key: x.key, label: x.name }]
}))

function params(): Record<string, any> {
  const out: Record<string, any> = {}
  for (const x of s.searchFields) {
    if (x.query === 'range') {
      const from = cond[x.key + '_from'] ?? ''
      const to = cond[x.key + '_to'] ?? ''
      if (from || to) out[x.key] = from + ',' + to
      continue
    }
    const v = cond[x.key]
    if (v === '' || v === null || v === undefined) continue
    out[x.key] = Array.isArray(v) ? v.join(',') : typeof v === 'boolean' ? (v ? 1 : 0) : v
  }
  return out
}

function search() { page.value = 1; load() }

function reset() {
  for (const k of Object.keys(cond)) delete cond[k]
  page.value = 1
  load()
}

function setMode(m: 'list' | 'tree' | 'recycle') {
  if (mode.value === m) return
  mode.value = m
  page.value = 1
  rowSelection.value = {}
  load()
}

function go(n: number) { page.value = n; load() }

function toggleSort(x: UiField) {
  if (sortKey.value === x.key) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  else { sortKey.value = x.key; sortOrder.value = 'desc' }
  page.value = 1
  load()
}

/** 树模式：把 /tree 的嵌套结果拍平成可见行（折叠的子孙不渲染）。 */
const flat = computed<Row[]>(() => {
  if (mode.value !== 'tree') return rows.value
  const out: Row[] = []
  const walk = (list: Row[], depth: number) => {
    for (const n of list) {
      out.push({ ...n, _depth: depth })
      if (!closed.value.includes(Number(n.id))) walk(n.children ?? [], depth + 1)
    }
  }
  walk(tree.value, 0)
  return out
})

const shownColumns = computed(() => (mode.value === 'recycle' ? s.recycleColumns : s.columns))
const selectable = computed(() => f.batch && mode.value === 'list')
const selectedIds = computed(() => Object.entries(rowSelection.value)
  .filter(([, v]) => v)
  .map(([i]) => Number(flat.value[Number(i)]?.[s.rowKey]))
  .filter(Boolean))

async function load() {
  loading.value = true
  failed.value = ''
  try {
    if (mode.value === 'tree') {
      tree.value = (await get<Row[]>('/' + s.res + '/tree')) ?? []
      rows.value = []
      total.value = flat.value.length
    } else if (mode.value === 'recycle') {
      const d = pagedOf(await get('/' + s.res + '/recycle', { page: page.value, size: size.value }), size.value)
      rows.value = d.list
      total.value = d.total
    } else {
      const d = pagedOf(await get('/' + s.res + '/list', {
        ...params(),
        page: page.value,
        size: size.value,
        sort: sortKey.value || undefined,
        order: sortKey.value ? sortOrder.value : undefined
      }), size.value)
      rows.value = d.list
      total.value = d.total
    }
    rowSelection.value = {}
  } catch (e: any) {
    failed.value = e?.statusMessage || e?.message || '列表加载失败'
    rows.value = []
    tree.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

/* ------------------------------ 单元格 ------------------------------ */

function headLabel(x: UiField) {
  if (!x.sortable || mode.value !== 'list') return h('span', { class: 'text-xs' }, x.name)
  const active = sortKey.value === x.key
  return h('button', {
    type: 'button',
    class: 'inline-flex items-center gap-1 text-xs hover:text-primary',
    onClick: () => toggleSort(x)
  }, [
    x.name,
    h(UIcon, {
      name: active ? (sortOrder.value === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down') : 'i-lucide-arrow-up-down',
      class: active ? 'size-3.5 shrink-0 text-primary' : 'size-3.5 shrink-0 text-dimmed'
    })
  ])
}

const TAG_RE = /<[^>]*>/g
const clip = (v: unknown, n: number) => String(v).replace(TAG_RE, ' ').replace(/\\s+/g, ' ').trim().slice(0, n)

/** 单元格纯文本形态：详情面板与打印复用。 */
function plainText(x: UiField, row: Row): string {
  const raw = row?.[x.key]
  if (isBlank(raw)) return DASH
  if (x.component === 'switch') return truthy(raw) ? '是' : '否'
  if (x.dict) return dict.label(x.dict, raw)
  if (x.component === 'remote-select' && x.ref) {
    const map = remoteMaps.value[x.key]
    const val = String(raw ?? '')
    if (map && map[val]) return map[val]
  }
  if (x.type === 'money' || x.type === 'decimal') return money(raw)
  if (x.component === 'datetime' || /_at$/.test(x.key)) return fmtDateTime(raw)
  if (x.component === 'date') return fmtDate(raw)
  if (x.type === 'json' || x.component === 'code') return clip(prettyJson(raw), 120)
  if (x.type === 'text' || x.component === 'richtext' || x.component === 'textarea') return clip(raw, 120)
  return clip(raw, 120)
}

function maskKey(x: UiField, row: Row) {
  return String(row?.[s.rowKey]) + ':' + x.key
}

function cellOf(x: UiField, row: Row): any {
  const raw = row?.[x.key]
  if (x.masked && !revealed.value.includes(maskKey(x, row))) {
    return h('div', { class: 'flex items-center gap-1' }, [
      h('span', { class: 'text-xs' }, maskText(raw)),
      h(UButton, {
        size: 'xs', color: 'neutral', variant: 'ghost', square: true, icon: 'i-lucide-eye',
        ariaLabel: '显示明文',
        onClick: () => revealed.value = [...revealed.value, maskKey(x, row)]
      })
    ])
  }
  if (x.masked) {
    return h('div', { class: 'flex items-center gap-1' }, [
      h('span', { class: 'text-xs' }, String(raw ?? DASH)),
      h(UButton, { size: 'xs', color: 'neutral', variant: 'ghost', square: true, icon: 'i-lucide-eye-off', ariaLabel: '重新隐藏', onClick: () => revealed.value = revealed.value.filter(k => k !== maskKey(x, row)) })
    ])
  }
  if (isBlank(raw)) return h('span', { class: 'text-dimmed' }, DASH)
  if (x.component === 'switch') {
    return h(UBadge, { label: truthy(raw) ? '是' : '否', color: truthy(raw) ? 'success' : 'neutral', variant: 'subtle', size: 'xs' })
  }
  if (x.dict) {
    const b = dict.badge(x.dict, raw)
    return h(UBadge, { label: b.label, color: b.color, variant: 'subtle', size: 'xs' })
  }
  if (x.component === 'image') {
    return h('img', { src: fileUrl(raw), alt: x.name, loading: 'lazy', class: 'size-9 rounded-xs border border-muted object-cover' })
  }
  if (x.component === 'upload') {
    return h('a', { href: fileUrl(raw), target: '_blank', rel: 'noopener', class: 'text-xs text-primary hover:underline break-all' }, clip(raw, 40))
  }
  if (x.type === 'money' || x.type === 'decimal') return h('span', { class: 'tabular-nums' }, money(raw))
  return h('span', {}, plainText(x, row))
}

function treeCell(x: UiField, row: Row) {
  const depth = Number(row._depth ?? 0)
  const kids = (row.children ?? []).length > 0
  const id = Number(row.id)
  return h('div', { class: 'flex items-center gap-1', style: { paddingLeft: depth * 18 + 'px' } }, [
    kids
      ? h(UButton, {
        size: 'xs', color: 'neutral', variant: 'ghost', square: true,
        icon: closed.value.includes(id) ? 'i-lucide-chevrons-right' : 'i-lucide-chevrons-down',
        ariaLabel: '展开或折叠',
        onClick: () => closed.value = closed.value.includes(id) ? closed.value.filter(v => v !== id) : [...closed.value, id]
      })
      : h('span', { class: 'size-6 shrink-0' }),
    cellOf(x, row)
  ])
}

const selectColumn = {
  id: '__select',
  header: ({ table }: any) => h(UCheckbox, {
    modelValue: table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
    'onUpdate:modelValue': (v: any) => table.toggleAllPageRowsSelected(!!v),
    ariaLabel: '全选本页'
  }),
  cell: ({ row }: any) => h(UCheckbox, {
    modelValue: row.getIsSelected(),
    'onUpdate:modelValue': (v: any) => row.toggleSelected(!!v),
    ariaLabel: '选择该行'
  })
}

const columns = computed<any[]>(() => {
  const cols: any[] = []
  if (selectable.value) cols.push(selectColumn)
  const list = shownColumns.value
  list.forEach((x, i) => {
    cols.push({
      accessorKey: x.key,
      header: () => headLabel(x),
      cell: ({ row }: any) => (mode.value === 'tree' && i === 0 ? treeCell(x, row.original) : cellOf(x, row.original))
    })
  })
  if (hasActions.value) {
    cols.push({
      id: '__actions',
      header: () => h('span', { class: 'text-xs' }, '操作'),
      cell: ({ row }: any) => h('div', { class: 'flex flex-wrap items-center gap-1' }, actionsOf(row.original))
    })
  }
  return cols
})

/* ------------------------------ 行操作 ------------------------------ */

function btn(label: string, icon: string, onClick: () => void, color = 'neutral') {
  return h(UButton, { size: 'xs', color, variant: 'ghost', icon, label, onClick })
}

function flowButtons(row: Row) {
  const st = String(row.flow_status ?? 'draft')
  const out: any[] = []
  if (st === 'draft' || st === 'rejected') {
    out.push(btn('提交', 'i-lucide-send', () => ask('提交审批', '提交后进入「' + (FLOW_NODES[1] ?? '审核') + '」节点。', false, false, c => runFlow(row, 'submit', c)), 'primary'))
  }
  if (st === 'pending') {
    out.push(btn('通过', 'i-lucide-circle-check', () => ask('通过审批', '当前节点：' + (row.flow_node || FLOW_NODES[1] || '审核') + '。', false, false, c => runFlow(row, 'approve', c)), 'success'))
    out.push(btn('驳回', 'i-lucide-circle-x', () => ask('驳回审批', '请填写驳回原因。', true, true, c => runFlow(row, 'reject', c)), 'error'))
  }
  return out
}

async function runFlow(row: Row, action: string, comment: string) {
  const r: any = await post('/' + s.res + '/flow', { id: row[s.rowKey], action, comment })
  push('流程已推进：' + dict.label('flow_status', r?.flow_status ?? action), 'success')
  await load()
}

function actionsOf(row: Row) {
  const out: any[] = []
  if (s.detailShow && can('detail')) out.push(btn('详情', 'i-lucide-eye', () => openDetail(row)))
  if (mode.value === 'recycle') {
    out.push(btn('还原', 'i-lucide-rotate-ccw', () => runDelete([row[s.rowKey]], 'restore'), 'success'))
    out.push(btn('彻底删除', 'i-lucide-trash', () => runDelete([row[s.rowKey]], 'purge'), 'error'))
    return out
  }
  if (can('edit')) out.push(btn('编辑', 'i-lucide-pencil', () => openEdit(row), 'primary'))
  if (f.flow) out.push(...flowButtons(row))
  if (s.res.includes('channel') || s.res.includes('qrcode') || ${has(p, 'landing_poster') ? 'true' : 'false'}) {
    out.push(btn('推广码', 'i-lucide-qr-code', () => openPromotion(row), 'warning'))
  }
  if (can('delete')) out.push(btn('删除', 'i-lucide-trash', () => runDelete([row[s.rowKey]], 'remove'), 'error'))
  return out
}

function openPromotion(row: Row) {
  promotion.row = row
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '')
  const scene = String(row.channel_code || row.id || '1')
  promotion.url = origin + base + '/p/' + scene
  promotion.open = true
}

const hasActions = computed(() => {
  if (mode.value === 'recycle') return f.recycle
  return can('detail') || can('edit') || can('delete') || f.flow
})

/* ------------------------------ 增删改查 ------------------------------ */

function openCreate() {
  form.isNew = true
  form.row = null
  form.open = true
}

async function openEdit(row: Row) {
  form.isNew = false
  form.row = row
  form.open = true
  form.row = await get<Row>('/' + s.res + '/' + row[s.rowKey]).catch(() => row)
}

async function submit(payload: Row) {
  form.busy = true
  try {
    if (form.isNew) await post('/' + s.res + '/create', payload)
    else await post('/' + s.res + '/update', { ...payload, id: form.row?.[s.rowKey] })
    push(form.isNew ? '新增成功' : '保存成功', 'success')
    form.open = false
    await load()
  } catch { /* 已统一提示 */ } finally { form.busy = false }
}

async function openDetail(row: Row) {
  detail.row = row
  detail.open = true
  detail.loading = true
  try { detail.row = await get<Row>('/' + s.res + '/' + row[s.rowKey]) } catch { /* 用列表行兜底 */ } finally { detail.loading = false }
}

function ask(title: string, body: string, danger: boolean, needComment: boolean, run: (c: string) => Promise<void>) {
  askBox.title = title
  askBox.text = body
  askBox.danger = danger
  askBox.needComment = needComment
  askBox.comment = ''
  askBox.run = run
  askBox.open = true
}

async function runAsk() {
  if (!askBox.run) return
  askBox.busy = true
  try {
    await askBox.run(askBox.comment)
    askBox.open = false
    askBox.run = null
  } catch { /* 已统一提示 */ } finally { askBox.busy = false }
}

type DeleteKind = 'remove' | 'restore' | 'purge'

const DELETE_TEXT: Record<DeleteKind, { title: string, text: string, danger: boolean }> = {
  remove: { title: '删除记录', text: '记录将不再出现在列表中。', danger: true },
  restore: { title: '还原记录', text: '还原后记录回到列表。', danger: false },
  purge: { title: '彻底删除', text: '物理删除，无法恢复，确认继续？', danger: true }
}

function runDelete(ids: number[], kind: DeleteKind) {
  if (!ids.length) return
  const t = DELETE_TEXT[kind]
  ask(t.title, '共 ' + ids.length + ' 条记录。' + t.text, t.danger, false, async () => {
    const r: any = await post('/' + s.res + '/' + kind, { ids })
    const n = Number(r?.removed ?? r?.restored ?? r?.purged ?? ids.length)
    push((kind === 'remove' ? '已删除 ' : kind === 'restore' ? '已还原 ' : '已清除 ') + n + ' 条', 'success')
    await load()
  })
}

async function batch(action: string, value: unknown, label: string) {
  const ids = selectedIds.value
  if (!ids.length) return
  ask('批量' + label, '将对选中的 ' + ids.length + ' 条记录执行「' + label + '」。', action === 'delete', false, async () => {
    const r: any = await post('/' + s.res + '/batch', { ids, action, value })
    push('影响 ' + (r?.affected ?? 0) + ' 条', 'success')
    rowSelection.value = {}
    await load()
  })
}

const assignField = computed(() => s.formFields.find(x => x.key === assign.key) ?? s.formFields[0])

async function runAssign() {
  if (!assign.key || !selectedIds.value.length) return
  assign.busy = true
  try {
    const r: any = await post('/' + s.res + '/batch', { ids: selectedIds.value, action: assign.key, value: assign.value })
    push('影响 ' + (r?.affected ?? 0) + ' 条', 'success')
    assign.open = false
    rowSelection.value = {}
    await load()
  } catch { /* 已统一提示 */ } finally { assign.busy = false }
}

/* ------------------------------ 导入导出 ------------------------------ */

async function doExport() {
  exporting.value = true
  try {
    await download('/' + s.res + '/export', { ...params(), sort: sortKey.value || undefined }, s.res + '.csv')
    push('导出已开始', 'success')
  } catch { push('导出失败', 'error') } finally { exporting.value = false }
}

async function onImportFile(files: any) {
  const file = Array.isArray(files) ? files[0]?.file : files?.file
  if (!file) return
  imp.csv = String(await file.text())
}

const importErrors = computed(() => (imp.result?.errors ?? [])
  .slice(0, 8)
  .map((e: any) => '第 ' + e.row + ' 行：' + e.message)
  .join(String.fromCharCode(10)))

async function doImport() {
  if (!imp.csv.trim()) { push('请先选择 CSV 文件或粘贴文本', 'error'); return }
  imp.busy = true
  try {
    imp.result = await post('/' + s.res + '/import', { csv: imp.csv })
    push('导入完成：成功 ' + (imp.result?.created ?? 0) + ' 条', 'success')
    await load()
  } catch { /* 已统一提示 */ } finally { imp.busy = false }
}

/** window 不在 Vue 模板的全局白名单里，打印入口必须放在 setup 作用域。 */
function printDetail() {
  if (typeof window !== "undefined") window.print()
}

watch(page, () => { /* 分页只由 go() 触发，这里防止手动改页码时漏加载 */ })

onMounted(async () => {
  if (s.dictKeys.length) await dict.load()
  load()
  loadRemoteMaps()
})
</script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <span class="size-8 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
          <UIcon :name="uiIcon(schema.icon)" class="size-4 text-primary" />
        </span>
        <div class="min-w-0">
          <h2 class="text-sm font-semibold text-default truncate">{{ schema.name }}</h2>
          <p v-if="schema.comment" class="text-xs text-muted truncate">{{ schema.comment }}</p>
        </div>
      </div>
      <div class="flex-1" />
      <UButton
        v-for="m in modes"
        :key="m.key"
        :label="m.label"
        :icon="m.icon"
        size="sm"
        :color="mode === m.key ? 'primary' : 'neutral'"
        :variant="mode === m.key ? 'subtle' : 'ghost'"
        @click="setMode(m.key)"
      />
      <USeparator v-if="modes.length > 1" orientation="vertical" class="mx-1" />
      <UButton v-if="can('export')" label="导出" icon="i-lucide-download" size="sm" color="neutral" variant="ghost" :loading="exporting" @click="doExport" />
      <UButton v-if="schema.feature.io" label="导入" icon="i-lucide-upload" size="sm" color="neutral" variant="ghost" @click="imp.open = true; imp.result = null" />
      <UButton label="刷新" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="ghost" :loading="loading" @click="load" />
      <UButton v-if="can('create') && mode !== 'recycle'" label="新增" icon="i-lucide-plus" size="sm" @click="openCreate" />
    </div>

    <div data-gen="search" v-if="searchPairs.length" class="rounded-xl border border-muted bg-elevated/60 p-3.5 shadow-xs">
      <div class="flex flex-wrap items-end gap-3">
        <div
          data-gen="field"
          v-for="pair in searchPairs"
          :key="pair.key"
          :class="[
            pair.field.component === 'datetime' ? 'w-56 sm:w-60' :
            pair.field.component === 'date' ? 'w-48 sm:w-52' :
            'w-44 sm:w-48',
            'shrink-0 flex flex-col gap-1.5'
          ]"
        >
          <label class="text-xs font-medium text-muted truncate select-none" :title="pair.label">
            {{ pair.label }}
          </label>
          <div class="h-8 flex items-center">
            <FieldInput
              :field="pair.field"
              :res="schema.res"
              :label-key="schema.labelKey"
              size="sm"
              :model-value="cond[pair.key]"
              @update:model-value="(v: any) => cond[pair.key] = v"
            />
          </div>
        </div>
        <div class="flex items-center gap-2 pb-0.5">
          <UButton label="查询" icon="i-lucide-search" size="sm" color="primary" :loading="loading" @click="search" />
          <UButton label="重置" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="outline" @click="reset" />
        </div>
      </div>
    </div>

    <div v-if="selectable && selectedIds.length" class="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <span class="text-xs text-muted">已选 <b class="tabular-nums text-default">{{ selectedIds.length }}</b> 条</span>
      <USeparator orientation="vertical" class="h-4" />
      <UButton v-if="schema.feature.status" label="批量启用" icon="i-lucide-circle-check" size="xs" color="success" variant="soft" @click="batch('status', 1, '启用')" />
      <UButton v-if="schema.feature.status" label="批量停用" icon="i-lucide-circle-x" size="xs" color="neutral" variant="soft" @click="batch('status', 0, '停用')" />
      <UButton v-if="schema.formFields.length" label="批量赋值" icon="i-lucide-square-pen" size="xs" color="neutral" variant="soft" @click="assign.open = true; assign.key = schema.formFields[0]?.key ?? ''; assign.value = ''" />
      <UButton label="批量删除" icon="i-lucide-trash" size="xs" color="error" variant="soft" @click="runDelete(selectedIds, 'remove')" />
      <div class="flex-1" />
      <UButton label="取消选择" size="xs" color="neutral" variant="ghost" @click="rowSelection = {}" />
    </div>

    <UAlert
      v-if="failed"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="数据加载失败"
      :description="failed"
    >
      <template #trailing>
        <UButton label="重试" size="xs" color="neutral" variant="outline" @click="load" />
      </template>
    </UAlert>

    <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
      <!-- 加载时用画廊的骨架行（.skel-row/.sk 微光），而不是转圈：与风格库一致 -->
      <table v-if="loading" class="tbl">
        <tbody>
          <tr v-for="i in 6" :key="'sk' + i" class="skel-row">
            <td v-for="(c, j) in columns" :key="String(c.id ?? j)">
              <span class="sk" :style="{ width: j === 1 ? '70%' : '46%' }" />
            </td>
          </tr>
        </tbody>
      </table>
      <UTable v-else class="tbl"
        v-model:row-selection="rowSelection"
        :data="flat"
        :columns="columns"
        :loading="loading"
        :sticky="true"
        :ui="{ base: schema.striped ? '[&>tbody>tr:nth-child(even)>td]:bg-muted/40' : undefined }"
      >
        <template #empty>
          <UEmpty
            :title="mode === 'recycle' ? '回收站是空的' : '暂无数据'"
            :description="mode === 'recycle' ? '被删除的记录可以在这里还原' : (can('create') ? '点击右上角新增第一条记录' : '换个筛选条件试试')"
            icon="i-lucide-inbox"
            :actions="can('create') && mode !== 'recycle' ? [{ label: '新增', icon: 'i-lucide-plus', onClick: openCreate }] : [{ label: '刷新', icon: 'i-lucide-rotate-ccw', color: 'neutral', variant: 'outline', onClick: load }]"
          />
        </template>
      </UTable>

      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-muted px-3 py-2">
        <span class="text-xs text-muted">
          共 <b class="tabular-nums text-default">{{ total }}</b> 条 · 第 {{ page }} / {{ Math.max(1, Math.ceil(total / size)) }} 页
        </span>
        <UPagination
          :page="page"
          :items-per-page="size"
          :total="total"
          :sibling-count="1"
          size="sm"
          @update:page="go"
        />
      </div>
    </div>

    <USlideover
      v-model:open="form.open"
      :title="(form.isNew ? '新增' : '编辑') + schema.name"
      :description="schema.comment || undefined"
      :ui="{ content: SLIDE_UI }"
    >
      <template #body>
        <CrudForm
          :fields="schema.formFields"
          :res="schema.res"
          :label-key="schema.labelKey"
          :layout="schema.formLayout"
          :form-id="formId"
          :row="form.row"
          @submit="submit"
        />
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="form.open = false" />
        <div class="flex-1" />
        <UButton type="submit" :form="formId" :label="form.isNew ? '创建' : '保存'" icon="i-lucide-check" :loading="form.busy" />
      </template>
    </USlideover>

    <USlideover v-model:open="detail.open" :title="schema.name + ' 详情'" :ui="{ content: SLIDE_UI }">
      <template #body>
        <div v-if="detail.loading" class="space-y-2">
          <USkeleton v-for="i in 6" :key="i" class="h-8 w-full" />
        </div>
        <dl v-else data-print-area class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div v-for="x in schema.detailFields" :key="x.key" class="min-w-0">
            <dt class="text-xs text-muted truncate">{{ x.name }}</dt>
            <dd class="text-sm text-default break-words">
              <img v-if="x.component === 'image' && !isBlank(detail.row?.[x.key])" :src="fileUrl(detail.row?.[x.key])" :alt="x.name" class="size-20 rounded-md border border-muted object-cover">
              <a v-else-if="x.component === 'upload' && !isBlank(detail.row?.[x.key])" :href="fileUrl(detail.row?.[x.key])" target="_blank" rel="noopener" class="text-primary hover:underline break-all">{{ String(detail.row?.[x.key]) }}</a>
              <span v-else-if="x.type === 'json' || x.component === 'code'" class="font-mono text-xs break-all">{{ prettyJson(detail.row?.[x.key]) }}</span>
              <span v-else>{{ x.masked && !revealed.includes(String(detail.row?.[schema.rowKey]) + ':' + x.key) ? maskText(detail.row?.[x.key]) : plainText(x, detail.row ?? {}) }}</span>
            </dd>
          </div>
        </dl>
      </template>
      <template #footer>
        <UButton label="关闭" color="neutral" variant="outline" @click="detail.open = false" />
        <UButton v-if="schema.feature.print" label="打印单据" icon="i-lucide-printer" @click="printDetail" />
        <div class="flex-1" />
        <UButton v-if="can('edit')" label="编辑" icon="i-lucide-pencil" @click="detail.open = false; openEdit(detail.row ?? {})" />
      </template>
    </USlideover>

    <UModal v-model:open="askBox.open" :title="askBox.title" :description="askBox.text" :ui="{ footer: 'justify-end' }">
      <template #body>
        <UFormField v-if="askBox.needComment" label="审批意见" required>
          <UTextarea v-model="askBox.comment" :rows="3" autoresize placeholder="请填写原因" class="w-full" />
        </UFormField>
        <p v-else class="text-sm text-muted">该操作立即生效。</p>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="askBox.open = false" />
        <UButton :label="askBox.danger ? '确认执行' : '确认'" :color="askBox.danger ? 'error' : 'primary'" :loading="askBox.busy" @click="runAsk" />
      </template>
    </UModal>

    <UModal v-model:open="assign.open" title="批量赋值" description="把选中记录的某个字段统一改成同一个值。">
      <template #body>
        <UForm :state="assign" class="grid grid-cols-1 gap-4">
          <UFormField label="字段">
            <USelect
              v-model="assign.key"
              :items="schema.formFields.map(x => ({ label: x.name, value: x.key }))"
              placeholder="选择要修改的字段"
              class="w-full"
            />
          </UFormField>
          <UFormField label="新值">
            <FieldInput
              v-if="assignField"
              v-model="assign.value"
              :field="assignField"
              :res="schema.res"
              :label-key="schema.labelKey"
            />
            <p v-else class="text-sm text-muted">该模块没有可赋值的字段。</p>
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="assign.open = false" />
        <UButton label="执行" icon="i-lucide-check" :loading="assign.busy" @click="runAssign" />
      </template>
    </UModal>

    <UModal v-model:open="imp.open" title="导入数据" description="首行必须是列名，与列表列名一致。" :ui="{ content: 'sm:max-w-xl' }">
      <template #body>
        <div class="flex flex-col gap-3">
          <UFileUpload
            accept=".csv,text/csv"
            label="选择 CSV 文件"
            description="也可以直接把 CSV 文本粘贴到下面"
            variant="area"
            size="sm"
            @update:value="onImportFile"
          />
          <UTextarea v-model="imp.csv" :rows="6" placeholder="名称,编码&#10;示例,A001" :ui="{ base: 'font-mono text-xs' }" />
          <UAlert
            v-if="imp.result"
            :color="imp.result.failed ? 'warning' : 'success'"
            variant="subtle"
            :title="'成功 ' + (imp.result.created ?? 0) + ' 条，失败 ' + (imp.result.failed ?? 0) + ' 条'"
            :description="importErrors || undefined"
          />
        </div>
      </template>
      <template #footer>
        <UButton label="关闭" color="neutral" variant="outline" @click="imp.open = false" />
        <UButton label="开始导入" icon="i-lucide-upload" :loading="imp.busy" @click="doImport" />
      </template>
    </UModal>

    <UModal v-model:open="promotion.open" title="推广渠道二维码与微页面" description="可直接复制微页面推广链接或下载渠道专属二维码。" :ui="{ content: 'sm:max-w-md' }">
      <template #body>
        <div class="flex flex-col items-center gap-4 py-2">
          <div class="p-3 bg-white rounded-2xl shadow-sm border border-neutral-200 dark:border-neutral-700">
            <img :src="'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(promotion.url)" alt="QR Code" class="size-48 object-contain" />
          </div>
          <div class="w-full text-center space-y-1">
            <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{{ promotion.row?.channel_name || promotion.row?.name || '推广渠道' }}</p>
            <p class="text-xs text-neutral-500 font-mono break-all select-all bg-neutral-100 dark:bg-neutral-800 p-2 rounded-lg">{{ promotion.url }}</p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex items-center justify-between w-full">
          <UButton label="在新标签页预览" icon="i-lucide-external-link" color="neutral" variant="ghost" :to="promotion.url" target="_blank" />
          <div class="flex gap-2">
            <UButton label="关闭" color="neutral" variant="outline" @click="promotion.open = false" />
            <UButton label="复制链接" icon="i-lucide-copy" color="primary" @click="navigator.clipboard.writeText(promotion.url); push('链接已复制到剪贴板', 'success')" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
`
}

/* ------------------------------------------------------------------ *
 * 登录：LoginForm（共享表单）+ login.vue（5 套布局差异）
 * 全部用 Tailwind 工具类与 ui prop 做差异，不新增 css 文件。
 * ------------------------------------------------------------------ */

const LOGIN_TPLS = ['split', 'glass', 'macOS', 'terminal', 'hero']

function loginForm(p: TenantPlan) {
  return `<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useUiApi } from '~/utils/ui-kit'
import { AUTH_COOKIE } from '~/utils/auth-token'

/** bare=terminal 模板：去标签、等宽、大字号。 */
const props = withDefaults(defineProps<{ bare?: boolean }>(), { bare: false })

const { post, get } = useUiApi()
const { push } = useNotify()
const route = useRoute()
const router = useRouter()
const token = useCookie(AUTH_COOKIE)

const state = reactive({ username: '', password: '' })
const busy = ref(false)
const error = ref('')
const authMode = ref<'simple' | 'users' | 'rbac'>('users')
const modeLoading = ref(true)

onMounted(async () => {
  try {
    const res = await get<{ mode: 'simple' | 'users' | 'rbac' }>('/public/auth-mode')
    if (res?.mode) {
      authMode.value = res.mode
      if (res.mode === 'simple') {
        state.username = '持门者'
      }
    }
  } catch {
    // 兜底保持默认 users
  } finally {
    modeLoading.value = false
  }
})

const schema = {
  '~standard': {
    version: 1 as const,
    vendor: 'genplus',
    validate: (v: Record<string, any>) => {
      const issues: Array<{ message: string, path: string[] }> = []
      if (authMode.value !== 'simple' && !String(v?.username ?? '').trim()) {
        issues.push({ message: '请输入账号', path: ['username'] })
      }
      if (!String(v?.password ?? '')) {
        issues.push({ message: authMode.value === 'simple' ? '请输入门禁口令' : '请输入密码', path: ['password'] })
      }
      return issues.length ? { issues } : { value: v }
    }
  }
}

async function onSubmit() {
  busy.value = true
  error.value = ''
  try {
    const payload = {
      username: authMode.value === 'simple' ? '持门者' : state.username,
      password: state.password
    }
    const d = await post<{ token: string, user?: Record<string, any> }>('/login', payload)
    if (!d?.token) throw new Error('登录响应缺少 token')
    token.value = d.token
    const to = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/admin'
    push('欢迎回来，' + (d.user?.nickname || d.user?.username || ''), 'success')
    await router.replace(to)
  } catch (e: any) {
    error.value = String(e?.data?.message || e?.data?.statusMessage || (authMode.value === 'simple' ? '门禁口令验证失败' : '账号或密码错误'))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UForm :schema="schema" :state="state" class="w-full space-y-4" @submit="onSubmit">
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="无法进入"
      :description="error"
    />

    <!-- 简单密码模式：单一门禁提示条 -->
    <div v-if="authMode === 'simple'" class="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2.5">
      <UIcon name="i-lucide-key-round" class="size-4.5 text-primary shrink-0" />
      <div class="text-xs text-muted">
        <p class="font-semibold text-default">单一门禁口令模式</p>
        <p>全站共用访问密码，输入验证后即可快速通行</p>
      </div>
    </div>

    <!-- 账号输入框：仅在 users / rbac 模式下展示 -->
    <UFormField v-if="authMode !== 'simple'" name="username" :label="bare ? undefined : '账号'">
      <UInput
        v-model="state.username"
        icon="i-lucide-user"
        placeholder="admin"
        autocomplete="username"
        :size="bare ? 'lg' : 'md'"
        :class="bare ? 'w-full font-mono' : 'w-full'"
        autofocus
      />
    </UFormField>

    <!-- 密码输入框 -->
    <UFormField name="password" :label="bare ? undefined : (authMode === 'simple' ? '门禁口令' : '密码')">
      <UInput
        v-model="state.password"
        icon="i-lucide-lock"
        type="password"
        :placeholder="authMode === 'simple' ? '请输入门禁访问口令（默认 admin123）' : '请输入密码'"
        :autocomplete="authMode === 'simple' ? 'off' : 'current-password'"
        :size="bare ? 'lg' : 'md'"
        :class="bare ? 'w-full font-mono' : 'w-full'"
        :autofocus="authMode === 'simple'"
      />
    </UFormField>

    <UButton
      type="submit"
      :label="busy ? '验证中...' : (authMode === 'simple' ? '验证开门' : '登 录')"
      :icon="authMode === 'simple' ? 'i-lucide-door-open' : 'i-lucide-log-in'"
      block
      :size="bare ? 'lg' : 'md'"
      :loading="busy"
      :class="bare ? 'font-mono' : ''"
    />
  </UForm>
</template>
`
}

function loginPage(p: TenantPlan) {
  const tpl = LOGIN_TPLS.includes(p.loginTpl) ? p.loginTpl : 'split'
  const title = p.title
  const desc = p.description || '由 GenPlus AI 工作台生成的独立子后台'
  const stats = [
    allModules(p).length + ' 个业务模块',
    Object.keys(p.caps).length ? '已装 ' + Object.keys(p.caps).length + ' 项能力' : '纯业务后台',
    'v1.' + p.version
  ]
  const head = `<script setup lang="ts">
import { uiIcon } from '~/utils/ui-icons'
import { initialsOf } from '~/utils/ui-kit'

definePageMeta({ layout: 'blank', middleware: ['auth'] })
useHead({ title: ${JSON.stringify(title + ' · 登录')} })

const TITLE = ${JSON.stringify(title)}
const DESC = ${JSON.stringify(desc)}
const STATS = ${JSON.stringify(stats)}
const BRAND_ICON = ${JSON.stringify(uiIconName(p.groups[0]?.icon ?? '🧩'))}
</script>

<template>`
  const foot = `</template>\n`

  const brandTile = (cls: string, icon: string) =>
    `        <span class="shrink-0 rounded-xl bg-primary/15 flex items-center justify-center ${cls}">
          <UIcon :name="BRAND_ICON" class="${icon}" />
        </span>`

  switch (tpl) {
    case 'glass':
      return head + `
  <div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-muted p-6">
    <div class="pointer-events-none absolute -top-24 -left-24 size-96 rounded-full bg-primary/20 blur-3xl" />
    <div class="pointer-events-none absolute -bottom-32 -right-16 size-96 rounded-full bg-secondary/20 blur-3xl" />

    <div class="relative w-full max-w-md rounded-3xl border border-default bg-elevated/70 p-8 shadow-lg backdrop-blur-xl backdrop-saturate-150">
      <div class="flex flex-col items-center gap-3 pb-6 text-center">
${brandTile('size-12', 'size-6 text-primary')}
        <div>
          <h1 class="text-lg font-semibold text-default">{{ TITLE }}</h1>
          <p class="mt-1 text-xs text-muted">{{ DESC }}</p>
        </div>
      </div>
      <LoginForm />
      <p class="pt-6 text-center text-xs text-dimmed">{{ STATS.join(' · ') }}</p>
    </div>
  </div>
` + foot

    case 'macOS':
      return head + `
  <div class="flex min-h-dvh items-center justify-center bg-default p-6">
    <div class="w-full max-w-sm overflow-hidden rounded-2xl border border-muted bg-elevated shadow-lg">
      <div class="flex items-center gap-1.5 border-b border-muted px-4 py-3">
        <span class="size-3 rounded-full bg-error/80" />
        <span class="size-3 rounded-full bg-warning/80" />
        <span class="size-3 rounded-full bg-success/80" />
        <span class="flex-1 text-center text-xs text-muted">{{ TITLE }}</span>
        <span class="size-9" />
      </div>

      <div class="flex flex-col items-center gap-4 px-6 py-8">
        <UAvatar :alt="initialsOf(TITLE)" size="lg" class="ring-2 ring-primary/20" />
        <div class="text-center">
          <p class="text-sm font-medium text-default">{{ TITLE }}</p>
          <p class="mt-0.5 text-xs text-muted">请使用子后台账号登录</p>
        </div>
        <div class="w-full">
          <LoginForm />
        </div>
      </div>

      <div class="border-t border-muted px-6 py-3 text-center text-xs text-dimmed">{{ STATS.join(' · ') }}</div>
    </div>
  </div>
` + foot

    case 'terminal':
      return head + `
  <div class="flex min-h-dvh items-center justify-center bg-elevated p-6 font-mono">
    <div class="w-full max-w-lg overflow-hidden rounded-lg border border-muted shadow-lg">
      <div class="flex items-center gap-2 border-b border-muted bg-muted px-4 py-2.5">
        <UIcon name="i-lucide-terminal" class="size-4 text-primary" />
        <span class="text-xs text-muted">{{ TITLE }} — auth shell</span>
      </div>
      <div class="space-y-4 p-6 text-sm">
        <p class="text-muted"><span class="text-primary">$</span> nuadmin auth --login</p>
        <LoginForm bare />
        <p class="text-xs text-dimmed">$ {{ STATS.join('  ') }}</p>
        <p class="text-xs text-primary animate-pulse">▍</p>
      </div>
    </div>
  </div>
` + foot

    case 'hero':
      return head + `
  <div class="relative isolate flex min-h-dvh flex-col items-center justify-center gap-10 overflow-hidden bg-default px-6 py-12">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-linear-to-b from-primary/15 to-transparent" />

    <div class="relative text-center">
      <div class="flex justify-center pb-4">
${brandTile('size-14', 'size-7 text-primary')}
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-default sm:text-4xl">{{ TITLE }}</h1>
      <p class="mx-auto mt-3 max-w-md text-sm text-muted">{{ DESC }}</p>
    </div>

    <div class="relative w-full max-w-sm">
      <UCard data-gen="card" class="shadow-lg">
        <LoginForm />
      </UCard>
    </div>

    <p class="relative text-xs text-dimmed">{{ STATS.join(' · ') }}</p>
  </div>
` + foot

    default:
      return head + `
  <div class="grid min-h-dvh lg:grid-cols-2">
    <div class="hidden flex-col justify-between border-r border-muted bg-elevated p-12 lg:flex">
      <div class="flex items-center gap-2">
${brandTile('size-9', 'size-5 text-primary')}
        <span class="text-lg font-bold text-default min-w-0 truncate">{{ TITLE }}</span>
      </div>

      <div class="max-w-md">
        <h2 class="text-2xl font-semibold leading-relaxed text-default">{{ DESC }}</h2>
        <ul class="mt-6 space-y-3">
          <li v-for="line in STATS" :key="line" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-circle-check" class="size-4 shrink-0 text-primary" />
            {{ line }}
          </li>
        </ul>
      </div>

      <p class="text-xs text-dimmed">GenPlus AI 工作台 · {{ TITLE }}</p>
    </div>

    <div class="flex items-center justify-center bg-default p-6">
      <div class="w-full max-w-sm">
        <div class="flex items-center gap-2 pb-6 lg:hidden">
${brandTile('size-8', 'size-4 text-primary')}
          <span class="font-bold text-default">{{ TITLE }}</span>
        </div>
        <h1 class="text-xl font-semibold text-default">欢迎回来</h1>
        <p class="pb-6 pt-1 text-sm text-muted">请使用子后台账号登录</p>
        <LoginForm />
      </div>
    </div>
  </div>
` + foot
  }
}

/* ------------------------------------------------------------------ *
 * 入口页 / 首页 / 每模块页面 / schema 文件 / 语言切换 / 数据看板
 * ------------------------------------------------------------------ */

function schemaFile(m: ModuleDef, p: TenantPlan) {
  const schema = uiSchema(m, p)
  // formFields 需要 formShow 且不在引擎列里，单独用 formVisible 再过一遍
  schema.formFields = orderFields(tableFields(m, p).map(f => uiField(f, m, p)).filter(formVisible), m.design?.form?.fields)
  return `import type { UiSchema } from '~/utils/ui-kit'

/** 由 GenPlus 生成：列顺序取设计站 list.columns，表单项取设计站 form.fields。 */
const schema: UiSchema = ${prettySchema(schema)}

export default schema
`
}

function modulePage(m: ModuleDef, p: TenantPlan) {
  return `<script setup lang="ts">
import CrudPage from '~/components/CrudPage.vue'
import schema from '~/schemas/${m.key}'

definePageMeta({ middleware: ['auth'] })
useHead({ title: ${JSON.stringify(m.name + ' · ' + p.title)} })
</script>

<template>
  <CrudPage :schema="schema" />
</template>
`
}

function indexPage(p: TenantPlan) {
  return `<script setup lang="ts">
definePageMeta({ redirect: '/admin' })
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center text-sm text-muted">正在进入 {{ ${JSON.stringify('管理台')} }}...</div>
</template>
`
}

function simplePage(component: string, title: string, middleware = 'auth') {
  return `<script setup lang="ts">
import ${component} from '~/components/${component}.vue'

definePageMeta({ middleware: ['${middleware}'] })
useHead({ title: ${JSON.stringify(title)} })
</script>

<template>
  <${component} />
</template>
`
}

function adminIndex(p: TenantPlan) {
  if (has(p, 'dashboard')) return simplePage('DashboardPanel', p.title)
  const modules = allModules(p).slice(0, 12)
  const cards = modules.map(m => ({ name: m.name, key: m.key, icon: iconName(m.design?.menu?.icon || m.icon), comment: m.comment || m.group }))
  return `<script setup lang="ts">
import { uiIcon } from '~/utils/ui-icons'

definePageMeta({ middleware: ['auth'] })
useHead({ title: ${JSON.stringify(p.title)} })

const { load } = useUiNav()
const { display, load: loadUser } = useUiUser()
onMounted(() => { load(); loadUser() })

const MODULES = ${JSON.stringify(cards, null, 2)}
</script>

<template>
  <div class="flex flex-col gap-6 p-4 lg:p-6">
    <div>
      <h1 class="text-xl font-semibold text-default">你好，{{ display }}</h1>
      <p class="pt-1 text-sm text-muted">${JSON.stringify(p.title).slice(1, -1)} · 共 {{ MODULES.length }} 个模块</p>
    </div>

    <div v-if="!MODULES.length" class="rounded-lg border border-dashed border-muted p-10 text-center">
      <p class="text-sm text-muted">还没有业务模块，请回主后台建模站添加后重新生成。</p>
    </div>

    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <NuxtLink
        v-for="m in MODULES"
        :key="m.key"
        :to="'/admin/' + m.key"
        class="group rounded-lg border border-muted bg-elevated p-4 transition-colors hover:border-primary/40"
      >
        <div class="flex items-center gap-2">
          <span class="size-8 rounded-md bg-primary/10 flex items-center justify-center">
            <UIcon :name="uiIcon(m.icon)" class="size-4 text-primary" />
          </span>
          <span class="text-sm font-medium text-default">{{ m.name }}</span>
        </div>
        <p class="pt-2 text-xs text-muted line-clamp-2">{{ m.comment || '点击进入列表页' }}</p>
      </NuxtLink>
    </div>
  </div>
</template>
`
}

/** 多语言切换器（仅在装了 i18n 时生成，走域 C 生成的 vue-i18n 插件）。 */
function langSwitch(p: TenantPlan) {
  const locales = [['zh', '中文'], ['en', 'English']]
  return `<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const ITEMS = ${JSON.stringify(locales.map(([value, label]) => ({ value, label })))}
</script>

<template>
  <USelect
    v-model="locale"
    :items="ITEMS"
    size="sm"
    class="w-28"
    aria-label="界面语言"
  />
</template>
`
}

/** 数据看板：/api/dashboard/summary 一次拉齐指标卡 + 趋势 + 占比。 */
function dashboardPanel(p: TenantPlan) {
  const days = clamp(capCfg(p, 'dashboard', 'trendDays', 30), 7, 365, 30)
  const groupDict = allModules(p).flatMap(m => m.fields).find(f => f.type === 'enum' && f.dict)?.dict ?? ''
  return `<script setup lang="ts">
import { uiIcon } from '~/utils/ui-icons'
import { useUiApi } from '~/utils/ui-kit'

interface Card { res: string, table: string, name: string, icon: string, total: number, week: number }
interface Summary { cards: Card[], trend: Array<{ d: string, c: number }>, slice: Array<{ k: string, c: number }> }

const DAYS = ${days}
const GROUP_DICT = ${JSON.stringify(groupDict)}

const { get } = useUiApi()
const { load } = useUiNav()
const dict = useUiDict()

const data = ref<Summary | null>(null)
const loading = ref(false)
const failed = ref('')
const days = ref(DAYS)

const maxTrend = computed(() => Math.max(1, ...(data.value?.trend ?? []).map(t => Number(t.c))))
const sliceTotal = computed(() => (data.value?.slice ?? []).reduce((n, s) => n + Number(s.c), 0))

async function load1() {
  loading.value = true
  failed.value = ''
  try {
    data.value = await get<Summary>('/dashboard/summary', { days: days.value })
  } catch (e: any) {
    failed.value = e?.data?.message || e?.statusMessage || '看板数据加载失败'
    data.value = null
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  load()
  if (GROUP_DICT) await dict.load()
  load1()
})

const barHeight = (c: unknown) => Math.max(4, Math.round((Number(c) / maxTrend.value) * 100))
</script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold text-default">数据看板</h1>
      <div class="flex-1" />
      <USelect
        v-model="days"
        :items="[{ label: '近 7 天', value: 7 }, { label: '近 30 天', value: 30 }, { label: '近 90 天', value: 90 }]"
        size="sm"
        class="w-32"
        @update:model-value="load1"
      />
      <UButton label="刷新" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="ghost" :loading="loading" @click="load1" />
    </div>

    <UAlert
      v-if="failed"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="看板不可用"
      :description="failed"
    >
      <template #trailing>
        <UButton label="重试" size="xs" color="neutral" variant="outline" @click="load1" />
      </template>
    </UAlert>

    <div v-if="loading && !data" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <USkeleton v-for="i in 4" :key="i" class="h-24 w-full" />
    </div>

    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <UCard data-gen="card" v-for="c in data?.cards ?? []" :key="c.res" :ui="{ body: 'p-4 sm:p-4' }">
        <div class="flex items-start gap-2">
          <span class="size-8 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
            <UIcon :name="uiIcon(c.icon)" class="size-4 text-primary" />
          </span>
          <div class="min-w-0">
            <p class="text-xs text-muted truncate">{{ c.name }}</p>
            <p class="text-2xl font-semibold tabular-nums text-default">{{ Number(c.total).toLocaleString('zh-CN') }}</p>
            <p class="text-xs text-muted">近 7 天新增 <b class="text-primary tabular-nums">{{ c.week }}</b></p>
          </div>
        </div>
        <template #footer>
          <UButton :to="'/admin/' + c.res" label="查看列表" icon="i-lucide-arrow-right" size="xs" color="neutral" variant="ghost" />
        </template>
      </UCard>
    </div>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <UCard data-gen="card" class="lg:col-span-2" :ui="{ body: 'p-4 sm:p-4' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h2 class="text-sm font-semibold text-default">新增趋势</h2>
            <span class="text-xs text-muted">近 {{ days }} 天</span>
          </div>
        </template>
        <div v-if="!(data?.trend ?? []).length" class="py-10 text-center text-xs text-muted">暂无可用于趋势统计的时间字段</div>
        <div v-else class="flex h-40 items-end gap-1">
          <UTooltip v-for="t in data?.trend ?? []" :key="t.d" :text="String(t.d) + ' · ' + t.c">
            <div class="flex-1 h-full flex items-end">
              <div class="w-full rounded-t-sm bg-primary/70 hover:bg-primary" :style="{ height: barHeight(t.c) + '%' }" />
            </div>
          </UTooltip>
        </div>
      </UCard>

      <UCard data-gen="card" :ui="{ body: 'p-4 sm:p-4' }">
        <template #header>
          <h2 class="text-sm font-semibold text-default">构成占比</h2>
        </template>
        <div v-if="!(data?.slice ?? []).length" class="py-10 text-center text-xs text-muted">没有枚举字段可统计</div>
        <div v-else class="space-y-3">
          <div v-for="s in data?.slice ?? []" :key="String(s.k)">
            <div class="flex items-center justify-between text-xs">
              <span class="text-muted truncate">{{ GROUP_DICT ? dict.label(GROUP_DICT, s.k) : s.k }}</span>
              <span class="tabular-nums text-default">{{ s.c }}</span>
            </div>
            <div class="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div class="h-full rounded-full bg-primary" :style="{ width: Math.round((Number(s.c) / Math.max(1, sliceTotal)) * 100) + '%' }" />
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
`
}

/* ------------------------------------------------------------------ *
 * 能力页面：字典 / 操作日志 / 附件 / 定时任务 / 站内消息
 * ------------------------------------------------------------------ */

/** 子后台的门禁模式设置页：读当前模式、三选一、切换、统计。只有超级管理员能进。 */
function authPage(): string {
  return `<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
useHead({ title: '门禁模式' })

const { get, post } = useUiApi()
const { push } = useNotify()

type Mode = 'simple' | 'users' | 'rbac'
const mode = ref<Mode>('users')
const stats = ref({ users: 0, roles: 0, casbinRules: 0 })
const saving = ref(false)
const opts: Array<{ v: Mode, name: string, icon: string, desc: string, warn: string }> = [
  { v: 'simple', name: '简单密码', icon: '🔑', desc: '全站共用一个门禁口令，不区分谁在操作', warn: '切换后无法按人追溯操作；已有成员账号不会被删除，只是不再参与登录。' },
  { v: 'users', name: '成员登录', icon: '👥', desc: '每人一个账号，能登录即有全部权限', warn: '此模式不做权限判定，任何成员都能增删改所有模块。' },
  { v: 'rbac', name: '完整权限控制 (GVA)', icon: '🛡️', desc: '账号 + 角色 + 菜单按钮 + Casbin 策略', warn: '启用后未配角色的账号会被全部拒绝，请确认角色与权限矩阵已配置完整。' }
]

async function load() {
  try {
    const res = await get<{ mode: Mode, stats?: { users: number, roles: number, casbinRules: number } }>('/system/auth-mode')
    if (res?.mode) mode.value = res.mode
    if (res?.stats) stats.value = res.stats
  } catch { /* 非超管进不来，保持默认展示 */ }
}
onMounted(load)

async function apply(next: Mode) {
  if (next === mode.value) return
  saving.value = true
  try {
    await post('/system/auth-mode', { mode: next })
    mode.value = next
    push('门禁模式已切换，立即生效（无需重新发布）', 'success')
    await load()
    // 动态刷新侧边栏菜单结构
    try {
      const { load: loadNav } = useUiNav()
      await loadNav()
    } catch {}
  } catch { /* 提示由 useUiApi 统一弹出 */ } finally { saving.value = false }
}

const cur = computed(() => opts.find(o => o.v === mode.value) || opts[1])
<\/script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <span class="text-sm font-semibold text-default truncate">🚪 门禁模式中枢</span>
      <UBadge color="primary" variant="subtle" size="sm">当前运行模式：{{ cur.name }}</UBadge>
      <span class="flex-1" />
      <UButton icon="i-lucide-rotate-cw" size="xs" color="neutral" variant="ghost" :loading="saving" @click="load" />
    </div>

    <!-- 运行态势数据卡（自适应门禁模式展示） -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <template v-if="mode === 'simple'">
        <div class="rounded-lg border border-primary/20 bg-primary/5 p-4 sm:col-span-3 flex items-center gap-3">
          <UIcon name="i-lucide-shield-check" class="size-6 text-primary shrink-0" />
          <div class="text-xs text-muted leading-relaxed">
            <p class="font-semibold text-default text-sm">简单密码模式生效中</p>
            <p>全站共用安全门禁口令（默认单一通行凭证），左侧菜单已自动隐藏「用户管理」与「角色管理」，输入口令即可通行业务。</p>
          </div>
        </div>
      </template>
      <template v-else-if="mode === 'users'">
        <NuxtLink to="/admin/system/user" class="rounded-lg border border-default p-3.5 bg-elevated/50 hover:border-primary transition group">
          <p class="text-xs text-muted flex items-center justify-between">
            <span>系统成员总数</span>
            <UIcon name="i-lucide-arrow-right" class="size-3.5 opacity-0 group-hover:opacity-100 text-primary transition" />
          </p>
          <p class="text-xl font-bold font-mono mt-1 text-default">{{ stats.users }} <span class="text-xs font-normal text-muted">人</span></p>
        </NuxtLink>
        <div class="rounded-lg border border-default p-3.5 bg-elevated/50 sm:col-span-2 flex items-center gap-3">
          <UIcon name="i-lucide-users" class="size-5 text-primary shrink-0" />
          <div class="text-xs text-muted leading-relaxed">
            <p class="font-semibold text-default">成员平权协同模式</p>
            <p>每位成员拥有独立账号密码，全员享有同等全量操作权限，无需繁琐分配 Casbin 策略，菜单已隐藏「角色管理」。</p>
          </div>
        </div>
      </template>
      <template v-else>
        <NuxtLink to="/admin/system/user" class="rounded-lg border border-default p-3.5 bg-elevated/50 hover:border-primary transition group">
          <p class="text-xs text-muted flex items-center justify-between">
            <span>系统成员总数</span>
            <UIcon name="i-lucide-arrow-right" class="size-3.5 opacity-0 group-hover:opacity-100 text-primary transition" />
          </p>
          <p class="text-xl font-bold font-mono mt-1 text-default">{{ stats.users }} <span class="text-xs font-normal text-muted">人</span></p>
        </NuxtLink>

        <NuxtLink to="/admin/system/role" class="rounded-lg border border-default p-3.5 bg-elevated/50 hover:border-primary transition group">
          <p class="text-xs text-muted flex items-center justify-between">
            <span>已注册角色与权限组</span>
            <UIcon name="i-lucide-arrow-right" class="size-3.5 opacity-0 group-hover:opacity-100 text-primary transition" />
          </p>
          <p class="text-xl font-bold font-mono mt-1 text-default">{{ stats.roles }} <span class="text-xs font-normal text-muted">个</span></p>
        </NuxtLink>

        <div class="rounded-lg border border-default p-3.5 bg-elevated/50">
          <p class="text-xs text-muted">已生效 Casbin 策略</p>
          <p class="text-xl font-bold font-mono mt-1 text-default">{{ stats.casbinRules }} <span class="text-xs font-normal text-muted">条</span></p>
        </div>
      </template>
    </div>

    <UCard data-gen="card">
      <p class="text-xs text-muted">
        三套门禁模式底层机制均已完备，切换只变更子库配置，<strong>立即热生效并自动自适应侧边菜单与登录界面</strong>。
      </p>
      <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button
          v-for="o in opts" :key="o.v" type="button" :disabled="saving"
          class="rounded-lg border-2 p-3.5 text-left transition"
          :class="mode === o.v ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-muted hover:border-accented'"
          @click="apply(o.v)"
        >
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold text-default">{{ o.icon }} {{ o.name }}</p>
            <UBadge v-if="mode === o.v" color="success" variant="subtle" size="xs">使用中</UBadge>
          </div>
          <p class="mt-1.5 text-xs text-muted leading-relaxed">{{ o.desc }}</p>
        </button>
      </div>
      <UAlert class="mt-4" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="cur.warn" />
    </UCard>
  </div>
</template>
`
}

/** GVA 角色管理：角色 CRUD + 菜单/按钮权限抽屉 + Casbin API 权限抽屉 */
function rolePage(): string {
  return `<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
useHead({ title: '角色管理' })

interface RoleItem {
  id: number
  role_id: string
  role_name: string
  parent_id: string
  default_router: string
  remark: string
  user_count?: number
  created_at: string
}

interface MenuGroup {
  name: string
  items: Array<{ key: string, name: string, icon: string, path: string, perm: string }>
}

interface ApiItem {
  name: string
  method: string
  path: string
  desc: string
}

interface ApiGroup {
  group: string
  apis: ApiItem[]
}

const { get, post, patch } = useUiApi()
const { push } = useNotify()

const roles = ref<RoleItem[]>([])
const loading = ref(false)
const authMode = ref<'simple' | 'users' | 'rbac'>('rbac')

const roleModal = reactive({
  open: false,
  isEdit: false,
  role_id: '',
  role_name: '',
  parent_id: '0',
  remark: '',
  busy: false
})

const delModal = reactive({
  open: false,
  role_id: '',
  role_name: '',
  busy: false
})

/* ── 抽屉 1: 菜单与按钮权限 ── */
const menuDrawer = reactive({
  open: false,
  role_id: '',
  role_name: '',
  busy: false,
  saving: false
})
const allMenuGroups = ref<MenuGroup[]>([])
const selectedMenuPaths = ref<Set<string>>(new Set())
const menuBtnPerms = ref<Record<string, string[]>>({})
const BTN_OPTS = [
  { key: 'create', label: '新增' },
  { key: 'edit', label: '编辑' },
  { key: 'delete', label: '删除' },
  { key: 'export', label: '导出' },
  { key: 'detail', label: '详情' }
]

/* ── 抽屉 2: Casbin API 策略 ── */
const casbinDrawer = reactive({
  open: false,
  role_id: '',
  role_name: '',
  busy: false,
  saving: false
})
const allApiGroups = ref<ApiGroup[]>([])
const selectedApiKeys = ref<Set<string>>(new Set())

async function loadRoles() {
  loading.value = true
  try {
    const [rList, mInfo] = await Promise.all([
      get<RoleItem[]>('/system/role/list').catch(() => []),
      get<{ mode: 'simple' | 'users' | 'rbac' }>('/public/auth-mode').catch(() => null)
    ])
    roles.value = rList ?? []
    if (mInfo?.mode) authMode.value = mInfo.mode
  } catch {
    roles.value = []
  } finally {
    loading.value = false
  }
}
onMounted(loadRoles)

function openCreate() {
  Object.assign(roleModal, {
    open: true, isEdit: false, role_id: '', role_name: '', parent_id: '0', remark: '', busy: false
  })
}

function openEdit(r: RoleItem) {
  Object.assign(roleModal, {
    open: true, isEdit: true, role_id: r.role_id, role_name: r.role_name, parent_id: r.parent_id, remark: r.remark, busy: false
  })
}

async function submitRole() {
  if (!roleModal.role_id.trim() || !roleModal.role_name.trim()) {
    push('角色标识和名称不能为空', 'error')
    return
  }
  roleModal.busy = true
  try {
    if (roleModal.isEdit) {
      await patch('/system/role/update', {
        role_id: roleModal.role_id.trim(),
        role_name: roleModal.role_name.trim(),
        parent_id: roleModal.parent_id,
        remark: roleModal.remark
      })
      push('角色更新成功', 'success')
    } else {
      await post('/system/role/create', {
        role_id: roleModal.role_id.trim(),
        role_name: roleModal.role_name.trim(),
        parent_id: roleModal.parent_id,
        remark: roleModal.remark
      })
      push('角色创建成功', 'success')
    }
    roleModal.open = false
    await loadRoles()
  } finally {
    roleModal.busy = false
  }
}

function askDelete(r: RoleItem) {
  Object.assign(delModal, { open: true, role_id: r.role_id, role_name: r.role_name, busy: false })
}

async function submitDelete() {
  delModal.busy = true
  try {
    await post('/system/role/delete', { role_id: delModal.role_id })
    push('角色已删除', 'success')
    delModal.open = false
    await loadRoles()
  } finally {
    delModal.busy = false
  }
}

/* ── 菜单权限配置 ── */
async function openMenuDrawer(r: RoleItem) {
  menuDrawer.role_id = r.role_id
  menuDrawer.role_name = r.role_name
  menuDrawer.open = true
  menuDrawer.busy = true
  try {
    const [menusRes, grantedRes] = await Promise.all([
      get<MenuGroup[]>('/menu?all=1'),
      get<{ menuPaths: string[], btnPerms: Record<string, string[]> }>('/system/role/menus', { role_id: r.role_id })
    ])
    allMenuGroups.value = menusRes ?? []
    selectedMenuPaths.value = new Set(grantedRes?.menuPaths ?? [])
    menuBtnPerms.value = grantedRes?.btnPerms ?? {}
  } finally {
    menuDrawer.busy = false
  }
}

function toggleMenu(path: string) {
  const s = new Set(selectedMenuPaths.value)
  if (s.has(path)) {
    s.delete(path)
  } else {
    s.add(path)
    if (!menuBtnPerms.value[path] || !menuBtnPerms.value[path].length) {
      menuBtnPerms.value[path] = ['create', 'edit', 'delete', 'export', 'detail']
    }
  }
  selectedMenuPaths.value = s
}

function toggleBtn(path: string, btnKey: string) {
  const cur = new Set(menuBtnPerms.value[path] ?? [])
  cur.has(btnKey) ? cur.delete(btnKey) : cur.add(btnKey)
  menuBtnPerms.value[path] = [...cur]
}

async function saveMenuDrawer() {
  menuDrawer.saving = true
  try {
    const menus = [...selectedMenuPaths.value].map(path => ({
      path,
      btnPerms: menuBtnPerms.value[path] ?? ['detail']
    }))
    await post('/system/role/menus', { role_id: menuDrawer.role_id, menus })
    push('角色「' + menuDrawer.role_name + '」菜单与按钮权限已保存', 'success')
    menuDrawer.open = false
    const nav = useUiNav()
    await nav.load(true)
  } finally {
    menuDrawer.saving = false
  }
}

/* ── Casbin API 权限配置 ── */
async function openCasbinDrawer(r: RoleItem) {
  casbinDrawer.role_id = r.role_id
  casbinDrawer.role_name = r.role_name
  casbinDrawer.open = true
  casbinDrawer.busy = true
  try {
    const [treeRes, rulesRes] = await Promise.all([
      get<ApiGroup[]>('/system/api/tree'),
      get<Array<{ path: string, method: string }>>('/system/role/casbin', { role_id: r.role_id })
    ])
    apiGroups.value = treeRes ?? []
    const s = new Set<string>()
    for (const rule of rulesRes ?? []) {
      s.add(rule.path + '|' + (rule.method || '*').toUpperCase())
    }
    selectedApiKeys.value = s
  } finally {
    casbinDrawer.busy = false
  }
}

function toggleApi(path: string, method: string) {
  const key = path + '|' + method.toUpperCase()
  const s = new Set(selectedApiKeys.value)
  s.has(key) ? s.delete(key) : s.add(key)
  selectedApiKeys.value = s
}

async function saveCasbinDrawer() {
  casbinDrawer.saving = true
  try {
    const rules = [...selectedApiKeys.value].map(k => {
      const [path, method] = k.split('|')
      return { path, method: method || '*' }
    })
    await post('/system/role/casbin', { role_id: casbinDrawer.role_id, rules })
    push('角色「' + casbinDrawer.role_name + '」Casbin API 策略已生效', 'success')
    casbinDrawer.open = false
  } finally {
    casbinDrawer.saving = false
  }
}
<\/script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-default">🛡️ 角色管理 (GVA SysAuthority)</span>
        <UBadge color="neutral" variant="subtle" size="sm">共 {{ roles.length }} 个角色</UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-plus" label="新建角色" size="sm" color="primary" @click="openCreate" />
      </div>
    </div>

    <UCard data-gen="card">
      <UAlert
        v-if="authMode !== 'rbac'"
        color="warning"
        variant="subtle"
        icon="i-lucide-shield-alert"
        title="当前未处于完整权限模式"
        description="当前系统运行在平权或简单门禁模式下，不对角色进行 Casbin 细分拦截。如需使所配置的角色继承与按钮策略生效，请前往「门禁模式」启用「完整权限控制 (RBAC)」。"
        class="mb-4"
      />

      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-default text-left text-muted">
              <th class="p-2.5 font-medium">角色标识</th>
              <th class="p-2.5 font-medium">角色名称</th>
              <th class="p-2.5 font-medium">父角色</th>
              <th class="p-2.5 font-medium">成员数</th>
              <th class="p-2.5 font-medium">备注说明</th>
              <th class="p-2.5 font-medium">创建时间</th>
              <th class="p-2.5 font-medium text-right">操作授权</th>
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr v-for="i in 3" :key="i" class="border-b border-muted">
              <td colspan="7" class="p-3 text-center text-muted">加载中...</td>
            </tr>
          </tbody>
          <tbody v-else-if="roles.length">
            <tr v-for="r in roles" :key="r.role_id" class="border-b border-muted hover:bg-elevated/40">
              <td class="p-2.5 font-mono font-semibold text-default">{{ r.role_id }}</td>
              <td class="p-2.5">
                <UBadge :color="r.role_id === 'admin' ? 'error' : r.role_id === 'editor' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                  {{ r.role_name }}
                </UBadge>
              </td>
              <td class="p-2.5 text-muted">{{ r.parent_id === '0' ? '根角色' : r.parent_id }}</td>
              <td class="p-2.5 font-mono text-muted">{{ r.user_count ?? 0 }} 人</td>
              <td class="p-2.5 text-muted">{{ r.remark || '—' }}</td>
              <td class="p-2.5 font-mono text-muted">{{ r.created_at?.slice(0, 10) }}</td>
              <td class="p-2.5 text-right space-x-2">
                <button class="text-primary hover:underline font-medium" @click="openMenuDrawer(r)">菜单与按钮权限</button>
                <button class="text-primary hover:underline font-medium" @click="openCasbinDrawer(r)">API策略</button>
                <button class="text-muted hover:underline" @click="openEdit(r)">编辑</button>
                <button v-if="r.role_id !== 'admin'" class="text-error hover:underline" @click="askDelete(r)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- 新建/编辑角色弹窗 -->
    <UModal v-model:open="roleModal.open" :title="roleModal.isEdit ? '编辑角色' : '新建角色'">
      <template #body>
        <div class="space-y-3 p-4">
          <UFormField label="角色标识" required :help="roleModal.isEdit ? '角色标识不可变更' : '建议小写英文字母'">
            <UInput v-model="roleModal.role_id" :disabled="roleModal.isEdit" placeholder="如 ops, reviewer" class="w-full font-mono" />
          </UFormField>
          <UFormField label="角色名称" required>
            <UInput v-model="roleModal.role_name" placeholder="如 业务审查员" class="w-full" />
          </UFormField>
          <UFormField label="父角色">
            <select v-model="roleModal.parent_id" class="w-full h-8 rounded border border-default bg-elevated px-2 text-xs">
              <option value="0">根角色 (无父角色)</option>
              <option v-for="ro in roles.filter(x => x.role_id !== roleModal.role_id)" :key="ro.role_id" :value="ro.role_id">
                {{ ro.role_name }} ({{ ro.role_id }})
              </option>
            </select>
          </UFormField>
          <UFormField label="备注说明">
            <UInput v-model="roleModal.remark" placeholder="职责范围描述" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="roleModal.open = false" />
          <UButton
            label="保存"
            color="primary"
            class="!bg-primary-500 hover:!bg-primary-600 !text-white font-medium px-4 cursor-pointer shadow-sm"
            :loading="roleModal.busy"
            @click="submitRole"
          />
        </div>
      </template>
    </UModal>

    <!-- 菜单与按钮权限配置弹窗/抽屉 -->
    <UModal v-model:open="menuDrawer.open" :title="'配置角色「' + menuDrawer.role_name + '」的菜单与按钮权限'">
      <template #body>
        <div class="max-h-[65vh] overflow-y-auto p-4 space-y-4">
          <p class="text-xs text-muted">勾选该角色可见的菜单；在菜单下勾选允许操作的按钮（未授权的按钮将在前端自动隐藏，接口侧同步拦截）。</p>
          <div v-for="g in allMenuGroups" :key="g.name" class="rounded border border-default p-3 bg-elevated/40 space-y-2">
            <p class="text-xs font-bold text-default">{{ g.name }}</p>
            <div class="space-y-2 pl-2">
              <div v-for="item in g.items" :key="item.path" class="rounded border border-muted p-2 bg-default text-xs space-y-1.5">
                <div class="flex items-center justify-between">
                  <label class="flex items-center gap-2 cursor-pointer font-medium">
                    <input type="checkbox" :checked="selectedMenuPaths.has(item.path)" class="rounded" @change="toggleMenu(item.path)">
                    <span>{{ item.icon }} {{ item.name }}</span>
                    <span class="font-mono text-[10px] text-muted">{{ item.path }}</span>
                  </label>
                </div>
                <div v-if="selectedMenuPaths.has(item.path)" class="flex flex-wrap items-center gap-3 pl-6 pt-1 border-t border-muted text-[11px] text-muted">
                  <span class="font-medium text-default">按钮动作：</span>
                  <label v-for="b in BTN_OPTS" :key="b.key" class="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      :checked="(menuBtnPerms[item.path] || []).includes(b.key)"
                      class="rounded"
                      @change="toggleBtn(item.path, b.key)"
                    >
                    <span>{{ b.label }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="menuDrawer.open = false" />
          <UButton
            label="保存授权"
            color="primary"
            class="!bg-primary-500 hover:!bg-primary-600 !text-white font-medium px-4 cursor-pointer shadow-sm"
            :loading="menuDrawer.saving"
            @click="saveMenuDrawer"
          />
        </div>
      </template>
    </UModal>

    <!-- Casbin API 策略权限弹窗/抽屉 -->
    <UModal v-model:open="casbinDrawer.open" :title="'配置角色「' + casbinDrawer.role_name + '」的 Casbin API 策略'">
      <template #body>
        <div class="max-h-[65vh] overflow-y-auto p-4 space-y-4">
          <p class="text-xs text-muted">
            勾选角色允许调用的后端 API。保存后将自动组装并落库 Casbin rules（<code class="font-mono">p, role:&lt;id&gt;, &lt;path&gt;, &lt;method&gt;</code>），未授权接口返回 403 Forbidden。
          </p>
          <div v-for="ag in apiGroups" :key="ag.group" class="rounded border border-default p-3 bg-elevated/40 space-y-2">
            <p class="text-xs font-bold text-default">{{ ag.group }}</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label
                v-for="api in ag.apis" :key="api.path + '|' + api.method"
                class="flex items-center gap-2 p-2 rounded border border-muted bg-default cursor-pointer text-xs hover:border-primary transition"
              >
                <input
                  type="checkbox"
                  :checked="selectedApiKeys.has(api.path + '|' + api.method)"
                  class="rounded"
                  @change="toggleApi(api.path, api.method)"
                >
                <UBadge
                  :color="api.method === 'GET' ? 'success' : api.method === 'POST' ? 'primary' : api.method === 'DELETE' ? 'error' : 'warning'"
                  variant="subtle" size="xs" class="font-mono"
                >
                  {{ api.method }}
                </UBadge>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-default">{{ api.name }}</p>
                  <p class="truncate font-mono text-[10px] text-muted">{{ api.path }}</p>
                </div>
              </label>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="casbinDrawer.open = false" />
          <UButton
            label="应用 Casbin 策略"
            color="primary"
            class="!bg-primary-500 hover:!bg-primary-600 !text-white font-medium px-4 cursor-pointer shadow-sm"
            :loading="casbinDrawer.saving"
            @click="saveCasbinDrawer"
          />
        </div>
      </template>
    </UModal>

    <!-- 删除确认弹窗 -->
    <UModal v-model:open="delModal.open" title="删除角色确认">
      <template #body>
        <div class="p-4 text-xs text-muted">
          确认删除角色 <strong class="text-default font-mono">{{ delModal.role_name }} ({{ delModal.role_id }})</strong> 吗？
          该操作将同时清理该角色的菜单权限与全部 Casbin 策略。
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="delModal.open = false" />
          <UButton label="确认删除" color="error" :loading="delModal.busy" @click="submitDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
`
}

/** GVA 用户管理：用户 CRUD + 分配角色 + 密码重置 */
function userPage(): string {
  return `<script setup lang="ts">
definePageMeta({ middleware: ['auth'] })
useHead({ title: '用户管理' })

interface UserItem {
  id: number
  username: string
  nickname: string
  avatar: string
  role: string
  role_name?: string
  phone: string
  email: string
  status: number
  last_login_at: string | null
  created_at: string
}

interface RoleItem {
  role_id: string
  role_name: string
}

const { get, post, patch } = useUiApi()
const { push } = useNotify()

const users = ref<UserItem[]>([])
const roles = ref<RoleItem[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(10)
const keyword = ref('')
const loading = ref(false)
const authMode = ref<'simple' | 'users' | 'rbac'>('users')

const createModal = reactive({
  open: false,
  username: '',
  password: '',
  nickname: '',
  role: 'editor',
  phone: '',
  email: '',
  busy: false
})

const editModal = reactive({
  open: false,
  id: 0,
  username: '',
  nickname: '',
  role: 'editor',
  phone: '',
  email: '',
  status: 1,
  busy: false
})

const pwdModal = reactive({
  open: false,
  id: 0,
  username: '',
  password: '',
  busy: false
})

const delModal = reactive({
  open: false,
  id: 0,
  username: '',
  busy: false
})

async function loadRoles() {
  try {
    roles.value = (await get<RoleItem[]>('/system/role/list')) ?? []
  } catch { roles.value = [] }
}

async function loadUsers() {
  loading.value = true
  try {
    const res = await get<{ list: UserItem[], total: number }>('/system/user/list', {
      page: page.value,
      size: size.value,
      keyword: keyword.value.trim()
    })
    users.value = res?.list ?? []
    total.value = res?.total ?? 0
  } catch {
    users.value = []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const m = await get<{ mode: 'simple' | 'users' | 'rbac' }>('/public/auth-mode')
    if (m?.mode) authMode.value = m.mode
  } catch {}
  await Promise.all([loadRoles(), loadUsers()])
})

function openCreate() {
  Object.assign(createModal, {
    open: true, username: '', password: '', nickname: '',
    role: roles.value[0]?.role_id || 'editor', phone: '', email: '', busy: false
  })
}

async function submitCreate() {
  if (!createModal.username.trim() || !createModal.password.trim()) {
    push('用户名和密码不能为空', 'error')
    return
  }
  createModal.busy = true
  try {
    await post('/system/user/create', {
      username: createModal.username.trim(),
      password: createModal.password.trim(),
      nickname: createModal.nickname.trim() || createModal.username.trim(),
      role: createModal.role,
      phone: createModal.phone.trim(),
      email: createModal.email.trim()
    })
    push('用户创建成功', 'success')
    createModal.open = false
    await loadUsers()
  } finally {
    createModal.busy = false
  }
}

function openEdit(u: UserItem) {
  Object.assign(editModal, {
    open: true, id: u.id, username: u.username, nickname: u.nickname,
    role: u.role, phone: u.phone, email: u.email, status: u.status, busy: false
  })
}

async function submitEdit() {
  editModal.busy = true
  try {
    await patch('/system/user/update', {
      id: editModal.id,
      nickname: editModal.nickname.trim(),
      role: editModal.role,
      phone: editModal.phone.trim(),
      email: editModal.email.trim(),
      status: editModal.status
    })
    push('用户信息已更新', 'success')
    editModal.open = false
    await loadUsers()
  } finally {
    editModal.busy = false
  }
}

function openResetPwd(u: UserItem) {
  Object.assign(pwdModal, { open: true, id: u.id, username: u.username, password: '', busy: false })
}

async function submitResetPwd() {
  if (!pwdModal.password.trim() || pwdModal.password.length < 6) {
    push('密码至少6个字符', 'error')
    return
  }
  pwdModal.busy = true
  try {
    await post('/system/user/reset-pwd', { id: pwdModal.id, password: pwdModal.password.trim() })
    push('密码已重置', 'success')
    pwdModal.open = false
  } finally {
    pwdModal.busy = false
  }
}

function askDelete(u: UserItem) {
  Object.assign(delModal, { open: true, id: u.id, username: u.username, busy: false })
}

async function submitDelete() {
  delModal.busy = true
  try {
    await post('/system/user/delete', { id: delModal.id })
    push('用户已删除', 'success')
    delModal.open = false
    await loadUsers()
  } finally {
    delModal.busy = false
  }
}
<\/script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-default">{{ authMode === 'rbac' ? '👥 用户与角色分配 (RBAC)' : (authMode === 'users' ? '👥 团队成员管理 (平权协作)' : '👥 系统用户列表 (当前为单一口令模式)') }}</span>
        <UBadge color="neutral" variant="subtle" size="sm">共 {{ total }} 人</UBadge>
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-plus" label="新建用户" size="sm" color="primary" @click="openCreate" />
      </div>
    </div>

    <UAlert
      v-if="authMode === 'simple'"
      color="warning"
      variant="subtle"
      icon="i-lucide-info"
      title="当前运行于简单密码模式"
      description="系统由全局单一门禁口令通行，此处用户账号暂不参与登录。如需启用独立账号协作，请前往「门禁模式」切换为「成员登录」或「完整权限控制」。"
      class="mb-2"
    />

    <UCard data-gen="card">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <UInput v-model="keyword" placeholder="搜索用户名、昵称或手机..." size="sm" class="w-64" @keyup.enter="loadUsers" />
        <UButton icon="i-lucide-search" label="查询" size="sm" color="neutral" variant="outline" @click="loadUsers" />
        <UButton label="重置" size="sm" color="neutral" variant="ghost" @click="keyword = ''; loadUsers()" />
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-default text-left text-muted">
              <th class="p-2.5 font-medium">ID</th>
              <th class="p-2.5 font-medium">用户名</th>
              <th class="p-2.5 font-medium">昵称</th>
              <th v-if="authMode === 'rbac'" class="p-2.5 font-medium">所属角色</th>
              <th v-else class="p-2.5 font-medium">权限机制</th>
              <th class="p-2.5 font-medium">联系方式</th>
              <th class="p-2.5 font-medium">状态</th>
              <th class="p-2.5 font-medium">最后登录</th>
              <th class="p-2.5 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody v-if="loading">
            <tr v-for="i in 3" :key="i" class="border-b border-muted">
              <td colspan="8" class="p-3 text-center text-muted">加载中...</td>
            </tr>
          </tbody>
          <tbody v-else-if="users.length">
            <tr v-for="u in users" :key="u.id" class="border-b border-muted hover:bg-elevated/40">
              <td class="p-2.5 font-mono text-muted">#{{ u.id }}</td>
              <td class="p-2.5 font-medium text-default">{{ u.username }}</td>
              <td class="p-2.5">{{ u.nickname }}</td>
              <td class="p-2.5">
                <UBadge v-if="authMode === 'rbac'" :color="u.role === 'admin' ? 'error' : u.role === 'editor' ? 'primary' : 'neutral'" variant="subtle" size="sm">
                  {{ u.role_name || u.role }}
                </UBadge>
                <UBadge v-else color="neutral" variant="subtle" size="sm">
                  平权成员
                </UBadge>
              </td>
              <td class="p-2.5 text-muted">{{ u.phone || u.email || '—' }}</td>
              <td class="p-2.5">
                <UBadge :color="u.status ? 'success' : 'neutral'" variant="subtle" size="sm">
                  {{ u.status ? '启用' : '禁用' }}
                </UBadge>
              </td>
              <td class="p-2.5 font-mono text-muted">{{ u.last_login_at || '未登录' }}</td>
              <td class="p-2.5 text-right space-x-2">
                <button class="text-primary hover:underline" @click="openEdit(u)">编辑</button>
                <button class="text-primary hover:underline" @click="openResetPwd(u)">改密</button>
                <button v-if="u.username !== 'admin'" class="text-error hover:underline" @click="askDelete(u)">删除</button>
              </td>
            </tr>
          </tbody>
          <tbody v-else>
            <tr><td colspan="8" class="p-6 text-center text-muted">暂无用户记录</td></tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- 新建用户弹窗 -->
    <UModal v-model:open="createModal.open" title="新建用户账号">
      <template #body>
        <div class="space-y-3 p-4">
          <UFormField label="用户名" required><UInput v-model="createModal.username" placeholder="登录账号" class="w-full" /></UFormField>
          <UFormField label="初始密码" required><UInput v-model="createModal.password" type="password" placeholder="至少6位" class="w-full" /></UFormField>
          <UFormField label="用户昵称"><UInput v-model="createModal.nickname" placeholder="显示名称" class="w-full" /></UFormField>
          <UFormField v-if="authMode === 'rbac'" label="分配角色" required>
            <select v-model="createModal.role" class="w-full h-8 rounded border border-default bg-elevated px-2 text-xs">
              <option v-for="r in roles" :key="r.role_id" :value="r.role_id">{{ r.role_name }} ({{ r.role_id }})</option>
            </select>
          </UFormField>
          <div v-else-if="authMode === 'users'" class="rounded border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted">
            <span class="font-medium text-default">平权协同模式：</span>新成员创建后自动拥有全量业务操作权限，无需额外配置 Casbin 策略。
          </div>
          <UFormField label="手机号码"><UInput v-model="createModal.phone" placeholder="选填" class="w-full" /></UFormField>
          <UFormField label="邮箱地址"><UInput v-model="createModal.email" placeholder="选填" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="createModal.open = false" />
          <UButton
            label="确认创建"
            color="primary"
            class="!bg-primary-500 hover:!bg-primary-600 !text-white font-medium px-4 cursor-pointer shadow-sm"
            :loading="createModal.busy"
            @click="submitCreate"
          />
        </div>
      </template>
    </UModal>

    <!-- 编辑用户弹窗 -->
    <UModal v-model:open="editModal.open" title="编辑用户信息">
      <template #body>
        <div class="space-y-3 p-4">
          <p class="text-xs text-muted">正在编辑用户：<strong class="text-default font-mono">{{ editModal.username }}</strong></p>
          <UFormField label="用户昵称"><UInput v-model="editModal.nickname" class="w-full" /></UFormField>
          <UFormField v-if="authMode === 'rbac'" label="所属角色" required>
            <select v-model="editModal.role" class="w-full h-8 rounded border border-default bg-elevated px-2 text-xs">
              <option v-for="r in roles" :key="r.role_id" :value="r.role_id">{{ r.role_name }} ({{ r.role_id }})</option>
            </select>
          </UFormField>
          <UFormField label="手机号码"><UInput v-model="editModal.phone" class="w-full" /></UFormField>
          <UFormField label="邮箱地址"><UInput v-model="editModal.email" class="w-full" /></UFormField>
          <UFormField label="账号状态">
            <select v-model="editModal.status" class="w-full h-8 rounded border border-default bg-elevated px-2 text-xs">
              <option :value="1">正常启用</option>
              <option :value="0">锁定禁用</option>
            </select>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="editModal.open = false" />
          <UButton
            label="保存变更"
            color="primary"
            class="!bg-primary-500 hover:!bg-primary-600 !text-white font-medium px-4 cursor-pointer shadow-sm"
            :loading="editModal.busy"
            @click="submitEdit"
          />
        </div>
      </template>
    </UModal>

    <!-- 重置密码弹窗 -->
    <UModal v-model:open="pwdModal.open" title="重置用户登录密码">
      <template #body>
        <div class="space-y-3 p-4">
          <p class="text-xs text-muted">为账号 <strong class="text-default font-mono">{{ pwdModal.username }}</strong> 设置新的密码：</p>
          <UFormField label="新密码" required><UInput v-model="pwdModal.password" type="password" placeholder="至少6位密码" class="w-full" /></UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="pwdModal.open = false" />
          <UButton
            label="确认重置"
            color="primary"
            class="!bg-primary-500 hover:!bg-primary-600 !text-white font-medium px-4 cursor-pointer shadow-sm"
            :loading="pwdModal.busy"
            @click="submitResetPwd"
          />
        </div>
      </template>
    </UModal>

    <!-- 删除确认弹窗 -->
    <UModal v-model:open="delModal.open" title="确认删除用户">
      <template #body>
        <div class="p-4 text-xs text-muted">
          确认彻底删除账号 <strong class="text-default font-mono">{{ delModal.username }}</strong> 吗？此操作不可逆。
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 p-4 pt-0">
          <UButton label="取消" color="neutral" variant="ghost" @click="delModal.open = false" />
          <UButton label="确认删除" color="error" :loading="delModal.busy" @click="submitDelete" />
        </div>
      </template>
    </UModal>
  </div>
</template>
`
}

function dictPage() {
  return `<script setup lang="ts">
import { useUiApi } from '~/utils/ui-kit'

interface DictItem { id: number, dict_key: string, label: string, value: string, color: string, sort: number, status: number }
interface DictType { id: number, dict_key: string, dict_name: string, remark: string, items: DictItem[] }

const { get, post } = useUiApi()
const { push } = useNotify()
const dict = useUiDict()

const types = ref<DictType[]>([])
const cur = ref<string>('')
const loading = ref(false)
const failed = ref('')

const nt = reactive({ open: false, dict_key: '', dict_name: '', remark: '' })
const nd = reactive({ open: false, label: '', value: '', color: 'neutral', sort: 0 })
const del = reactive({ open: false, text: '', run: null as null | (() => Promise<void>) })

const items = computed(() => types.value.find(t => t.dict_key === cur.value)?.items ?? [])

async function load() {
  loading.value = true
  failed.value = ''
  try {
    types.value = (await get<DictType[]>('/dict/page')) ?? []
    if (!cur.value && types.value.length) cur.value = types.value[0].dict_key
  } catch (e: any) {
    failed.value = e?.data?.message || '字典列表加载失败'
    types.value = []
  } finally {
    loading.value = false
  }
}

async function createType() {
  if (!nt.dict_key.trim()) { push('字典编码不能为空', 'error'); return }
  await post('/dict/create', { dict_key: nt.dict_key.trim(), dict_name: nt.dict_name.trim() || nt.dict_key.trim(), remark: nt.remark })
  push('字典类型已保存', 'success')
  nt.open = false
  nt.dict_key = ''
  nt.dict_name = ''
  nt.remark = ''
  await reload()
}

async function createItem() {
  if (!nd.label.trim() || !nd.value.trim()) { push('标签与值不能为空', 'error'); return }
  await post('/dict/create', { for_key: cur.value, label: nd.label.trim(), value: nd.value.trim(), color: nd.color === 'neutral' ? '' : nd.color, sort: Number(nd.sort) || 0, status: 1 })
  push('字典项已新增', 'success')
  nd.open = false
  nd.label = ''
  nd.value = ''
  await reload()
}

async function reload() {
  await load()
  await dict.load(true)
}

onMounted(load)
</script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold text-default">数据字典</h1>
      <div class="flex-1" />
      <UButton label="新增类型" icon="i-lucide-plus" size="sm" @click="nt.open = true" />
      <UButton label="新增字典项" icon="i-lucide-list-plus" size="sm" color="neutral" variant="outline" :disabled="!cur" @click="nd.open = true" />
    </div>

    <UAlert v-if="failed" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="加载失败" :description="failed">
      <template #trailing><UButton label="重试" size="xs" color="neutral" variant="outline" @click="load" /></template>
    </UAlert>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr]">
      <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
        <div v-if="loading" class="space-y-2 p-3">
          <USkeleton v-for="i in 6" :key="i" class="h-8 w-full" />
        </div>
        <div v-else-if="!types.length" class="p-8 text-center text-xs text-muted">还没有字典类型</div>
        <ul v-else class="max-h-[70vh] overflow-y-auto py-1">
          <li v-for="t in types" :key="t.dict_key">
            <button
              type="button"
              class="w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-muted"
              :class="cur === t.dict_key ? 'bg-primary/10 text-primary font-medium' : 'text-default'"
              @click="cur = t.dict_key"
            >
              <span class="truncate">{{ t.dict_name || t.dict_key }}</span>
              <UBadge :label="String(t.items?.length ?? 0)" color="neutral" variant="subtle" size="xs" class="ml-auto" />
            </button>
          </li>
        </ul>
      </div>

      <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
        <div class="flex items-center gap-2 border-b border-muted px-3 py-2">
          <span class="text-sm font-medium text-default">{{ cur || '字典项' }}</span>
          <span class="text-xs text-dimmed">{{ items.length }} 项</span>
        </div>
        <div v-if="!cur" class="p-10 text-center text-xs text-muted">从左侧选择一个字典类型</div>
        <table v-else class="w-full text-sm">
          <thead class="bg-muted text-left text-xs text-muted">
            <tr>
              <th class="px-3 py-2 font-medium">标签</th>
              <th class="px-3 py-2 font-medium">值</th>
              <th class="px-3 py-2 font-medium">颜色</th>
              <th class="px-3 py-2 font-medium">排序</th>
              <th class="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in items" :key="it.id" class="border-t border-muted">
              <td class="px-3 py-2 text-default">{{ it.label }}</td>
              <td class="px-3 py-2 font-mono text-xs">{{ it.value }}</td>
              <td class="px-3 py-2"><UBadge :label="it.color || '—'" :color="({ ok: 'success', warn: 'warning', err: 'error' } as any)[it.color] ?? 'neutral'" variant="subtle" size="xs" /></td>
              <td class="px-3 py-2 tabular-nums text-xs">{{ it.sort }}</td>
              <td class="px-3 py-2">
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  icon="i-lucide-trash"
                  label="删除"
                  @click="del.open = true; del.text = '删除字典项 ' + it.label + '？引用它的列表会退化成原始值。'; del.run = async () => { await post('/dict/remove', { id: it.id }); push('已删除', 'success'); await reload() }"
                />
              </td>
            </tr>
            <tr v-if="!items.length">
              <td colspan="5" class="px-3 py-10 text-center text-xs text-muted">该类型下还没有字典项</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <UModal v-model:open="nt.open" title="新增字典类型" description="编码将与建模站的 dict 配置对应。">
      <template #body>
        <UForm :state="nt" class="grid grid-cols-1 gap-4">
          <UFormField name="dict_key" label="字典编码" required>
            <UInput v-model="nt.dict_key" placeholder="goods_status" class="w-full" />
          </UFormField>
          <UFormField name="dict_name" label="字典名称">
            <UInput v-model="nt.dict_name" placeholder="商品状态" class="w-full" />
          </UFormField>
          <UFormField name="remark" label="备注">
            <UInput v-model="nt.remark" class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="nt.open = false" />
        <UButton label="保存" icon="i-lucide-check" @click="createType" />
      </template>
    </UModal>

    <UModal v-model:open="nd.open" title="新增字典项" :description="'归属：' + cur">
      <template #body>
        <UForm :state="nd" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <UFormField name="label" label="标签" required>
            <UInput v-model="nd.label" placeholder="上架" class="w-full" />
          </UFormField>
          <UFormField name="value" label="值" required>
            <UInput v-model="nd.value" placeholder="1" class="w-full" />
          </UFormField>
          <UFormField name="color" label="颜色">
            <USelect v-model="nd.color" :items="[{ label: '默认', value: 'neutral' }, { label: '成功', value: 'ok' }, { label: '警告', value: 'warn' }, { label: '危险', value: 'err' }]" class="w-full" />
          </UFormField>
          <UFormField name="sort" label="排序">
            <UInputNumber v-model="nd.sort" :step="1" class="w-full" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="nd.open = false" />
        <UButton label="保存" icon="i-lucide-check" @click="createItem" />
      </template>
    </UModal>

    <UModal v-model:open="del.open" title="删除字典项" :description="del.text" :ui="{ footer: 'justify-end' }">
      <template #footer>
        <UButton label="取消" color="neutral" variant="outline" @click="del.open = false" />
        <UButton
          label="确认删除"
          color="error"
          @click="async () => { if (del.run) { await del.run(); del.open = false; del.run = null } }"
        />
      </template>
    </UModal>
  </div>
</template>
`
}

function logPage(p: TenantPlan) {
  const keepDays = clamp(capCfg(p, 'log', 'keepDays', 90), 1, 3650, 90)
  return `<script setup lang="ts">
import { useUiApi } from '~/utils/ui-kit'

const { get } = useUiApi()
const KEEP_DAYS = ${keepDays}

interface LogRow { id: number, username: string, module: string, action: string, path: string, payload: string | null, result: string, duration: number, ip: string, created_at: string }

const rows = ref<LogRow[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const cond = reactive({ username: '', module: '', result: 'any' })
const loading = ref(false)
const failed = ref('')
const detail = reactive({ open: false, row: null as LogRow | null })

const COLUMNS = [
  { accessorKey: 'created_at', header: '时间' },
  { accessorKey: 'username', header: '操作人' },
  { accessorKey: 'module', header: '模块' },
  { accessorKey: 'action', header: '动作' },
  { accessorKey: 'result', header: '结果' },
  { accessorKey: 'duration', header: '耗时' },
  { accessorKey: 'path', header: '路径' }
]

/** 'any' 只是下拉框的占位值，不能发给服务端。 */
function params() {
  return { username: cond.username, module: cond.module, result: cond.result === 'any' ? '' : cond.result }
}

async function load() {
  loading.value = true
  failed.value = ''
  try {
    const d = pagedOf<LogRow>(await get('/log/page', { ...params(), page: page.value, size: size.value }), size.value)
    rows.value = d.list
    total.value = d.total
  } catch (e: any) {
    failed.value = e?.data?.message || '日志查询失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}

function search() { page.value = 1; load() }
function reset() { cond.username = ''; cond.module = ''; cond.result = 'any'; search() }
const time = (v: unknown) => fmtDateTime(v)

onMounted(load)
</script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold text-default">操作日志</h1>
      <span class="text-xs text-dimmed">仅保留最近 {{ KEEP_DAYS }} 天</span>
      <div class="flex-1" />
      <UButton label="刷新" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="ghost" :loading="loading" @click="load" />
    </div>

    <div class="flex flex-wrap items-end gap-3 rounded-lg border border-muted bg-elevated p-3">
      <div class="w-40">
        <p class="pb-1 text-xs text-muted">操作人</p>
        <UInput v-model="cond.username" icon="i-lucide-user" size="sm" placeholder="模糊匹配" class="w-full" @keyup.enter="search" />
      </div>
      <div class="w-40">
        <p class="pb-1 text-xs text-muted">模块</p>
        <UInput v-model="cond.module" icon="i-lucide-box" size="sm" placeholder="resKey" class="w-full" @keyup.enter="search" />
      </div>
      <div class="w-32">
        <p class="pb-1 text-xs text-muted">结果</p>
        <USelect v-model="cond.result" :items="[{ label: '全部', value: 'any' }, { label: '成功', value: 'ok' }, { label: '失败', value: 'fail' }]" size="sm" class="w-full" />
      </div>
      <div class="flex items-center gap-2">
        <UButton label="查询" icon="i-lucide-search" size="sm" :loading="loading" @click="search" />
        <UButton label="重置" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="outline" @click="reset" />
      </div>
    </div>

    <UAlert v-if="failed" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="加载失败" :description="failed">
      <template #trailing><UButton label="重试" size="xs" color="neutral" variant="outline" @click="load" /></template>
    </UAlert>

    <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
      <UTable class="tbl" :data="rows" :columns="COLUMNS" :loading="loading" :sticky="true" @click:row="(_e: any, row: any) => { detail.open = true; detail.row = row }">
        <template #created_at-cell="{ row }">
          <span class="text-xs whitespace-nowrap">{{ time(row.original.created_at) }}</span>
        </template>
        <template #result-cell="{ row }">
          <UBadge :label="row.original.result === 'ok' ? '成功' : '失败'" :color="row.original.result === 'ok' ? 'success' : 'error'" variant="subtle" size="xs" />
        </template>
        <template #duration-cell="{ row }">
          <span class="tabular-nums text-xs">{{ row.original.duration }} ms</span>
        </template>
        <template #path-cell="{ row }">
          <span class="text-xs text-muted break-all">{{ row.original.path }}</span>
        </template>
        <template #empty>
          <UEmpty title="暂无日志" description="产生一次写操作后这里就会有记录" icon="i-lucide-scroll-text" />
        </template>
      </UTable>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-muted px-3 py-2">
        <span class="text-xs text-muted">共 <b class="tabular-nums text-default">{{ total }}</b> 条</span>
        <UPagination :page="page" :items-per-page="size" :total="total" :sibling-count="1" size="sm" @update:page="(n: number) => { page = n; load() }" />
      </div>
    </div>

    <USlideover v-model:open="detail.open" title="日志明细">
      <template #body>
        <div class="space-y-3 text-sm">
          <div v-for="k in ['username', 'module', 'action', 'path', 'result', 'ip']" :key="k">
            <p class="text-xs text-muted">{{ k }}</p>
            <p class="text-default break-all">{{ detail.row?.[k as keyof LogRow] ?? DASH }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">入参</p>
            <pre class="mt-1 max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs font-mono text-default">{{ prettyJson(detail.row?.payload) }}</pre>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
`
}

function filePage() {
  return `<script setup lang="ts">
import { sizeOf, useUiApi } from '~/utils/ui-kit'

const { get, del, upload } = useUiApi()
const { push } = useNotify()
const dict = useUiDict()

interface FileRow { id: number, name: string, store_key: string, size: number, mime: string, kind: string, uploader: string, created_at: string }

const rows = ref<FileRow[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(24)
const kind = ref('any')
const loading = ref(false)
const busy = ref(false)

const url = (f: FileRow) => '/uploads/' + f.store_key
const isImage = (f: FileRow) => f.kind === 'image'

async function load() {
  loading.value = true
  try {
    const d = pagedOf<FileRow>(await get('/file/list', { kind: kind.value === 'any' ? '' : kind.value, page: page.value, size: size.value }), size.value)
    rows.value = d.list
    total.value = d.total
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

async function onPick(files: any) {
  const file = Array.isArray(files) ? files[0]?.file : files?.file
  if (!file) return
  busy.value = true
  try {
    await upload(file)
    push('上传成功：' + file.name, 'success')
    await load()
  } catch { /* 已统一提示 */ } finally { busy.value = false }
}

async function removeFile(f: FileRow) {
  await del('/file/' + f.id)
  push('已删除', 'success')
  await load()
}

onMounted(() => { dict.load(); load() })
</script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold text-default">附件管理</h1>
      <div class="flex-1" />
      <USelect
        v-model="kind"
        :items="[{ label: '全部类型', value: 'any' }, ...dict.options('file_kind')]"
        size="sm"
        placeholder="全部类型"
        class="w-36"
        @update:model-value="page = 1; load()"
      />
      <UFileUpload
        accept="*"
        :label="busy ? '上传中...' : '上传文件'"
        icon="i-lucide-upload"
        variant="button"
        size="sm"
        :disabled="busy"
        @update:value="onPick"
      />
    </div>

    <div v-if="loading" class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <USkeleton v-for="i in 10" :key="i" class="h-40 w-full" />
    </div>

    <UEmpty
      v-else-if="!rows.length"
      title="还没有附件"
      description="上传后这里会列出全部业务附件"
      icon="i-lucide-paperclip"
    />

    <div v-else class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <div v-for="f in rows" :key="f.id" class="rounded-lg border border-muted bg-elevated overflow-hidden">
        <a :href="url(f)" target="_blank" rel="noopener" class="block h-28 bg-muted">
          <img v-if="isImage(f)" :src="url(f)" :alt="f.name" loading="lazy" class="size-full object-cover">
          <span v-else class="flex size-full items-center justify-center">
            <UIcon name="i-lucide-file" class="size-8 text-dimmed" />
          </span>
        </a>
        <div class="p-2">
          <p class="text-xs text-default truncate" :title="f.name">{{ f.name }}</p>
          <p class="text-xs text-dimmed">{{ sizeOf(f.size) }} · {{ fmtDate(f.created_at) }}</p>
          <div class="flex items-center justify-between pt-1">
            <UButton :to="url(f)" label="打开" size="xs" color="neutral" variant="ghost" icon="i-lucide-external-link" target="_blank" />
            <UButton label="删除" size="xs" color="error" variant="ghost" icon="i-lucide-trash" @click="removeFile(f)" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="total > size" class="flex items-center justify-between">
      <span class="text-xs text-muted">共 <b class="tabular-nums text-default">{{ total }}</b> 个文件</span>
      <UPagination :page="page" :items-per-page="size" :total="total" :sibling-count="1" size="sm" @update:page="(n: number) => { page = n; load() }" />
    </div>
  </div>
</template>
`
}

function jobPage() {
  return `<script setup lang="ts">
import { useUiApi } from '~/utils/ui-kit'

interface Job { id: number, job_key: string, name: string, cron: string, status: number, last_run_at: string | null, last_result: string | null }
interface JobLog { id: number, job_key: string, status: string, duration: number, message: string, created_at: string }

const { get, post } = useUiApi()
const { push } = useNotify()
const dict = useUiDict()

const jobs = ref<Job[]>([])
const logs = ref<JobLog[]>([])
const cur = ref('')
const loading = ref(true)
const logsLoading = ref(false)
const running = ref('')
const failed = ref('')

async function load() {
  loading.value = true
  failed.value = ''
  try {
    jobs.value = (await get<Job[]>('/job/list')) ?? []
    if (!cur.value) await showLogs(jobs.value[0]?.job_key ?? '')
  } catch (e: any) {
    failed.value = e?.data?.message || '任务列表加载失败'
    jobs.value = []
  } finally {
    loading.value = false
  }
}

async function showLogs(key: string) {
  cur.value = key
  logsLoading.value = true
  try {
    logs.value = (await get<JobLog[]>('/job/log', key ? { job_key: key } : {})) ?? []
  } catch { logs.value = [] } finally { logsLoading.value = false }
}

async function run(j: Job) {
  running.value = j.job_key
  try {
    const r: any = await post('/job/run/' + j.job_key)
    push((r?.ok ? '执行成功：' : '执行失败：') + (r?.message ?? ''), r?.ok ? 'success' : 'error')
    await Promise.all([load(), showLogs(j.job_key)])
  } catch { /* 已统一提示 */ } finally { running.value = '' }
}

onMounted(() => { dict.load(); load() })
</script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold text-default">定时任务</h1>
      <div class="flex-1" />
      <UButton label="刷新" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="ghost" :loading="loading" @click="load" />
    </div>

    <UAlert v-if="failed" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="加载失败" :description="failed">
      <template #trailing><UButton label="重试" size="xs" color="neutral" variant="outline" @click="load" /></template>
    </UAlert>

    <div class="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
      <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
        <div class="border-b border-muted px-3 py-2 text-sm font-medium text-default">任务清单</div>
        <div v-if="loading" class="space-y-2 p-3"><USkeleton v-for="i in 4" :key="i" class="h-12 w-full" /></div>
        <UEmpty v-else-if="!jobs.length" title="没有注册的任务" description="在 server/tasks/index.ts 注册后重启即出现" icon="i-lucide-clock" />
        <ul v-else class="divide-y divide-muted">
          <li v-for="j in jobs" :key="j.id" class="flex flex-wrap items-center gap-3 px-3 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-default truncate">{{ j.name }}</span>
                <UBadge :label="j.status ? '已启用' : '已停用'" :color="j.status ? 'success' : 'neutral'" variant="subtle" size="xs" />
              </div>
              <p class="text-xs text-muted font-mono truncate">{{ j.job_key }} · {{ j.cron }}</p>
              <p class="text-xs text-dimmed truncate">上次 {{ fmtDateTime(j.last_run_at) }} · {{ j.last_result || '无结果' }}</p>
            </div>
            <UButton label="查看日志" size="xs" color="neutral" variant="ghost" icon="i-lucide-scroll-text" @click="showLogs(j.job_key)" />
            <UButton label="立即执行" size="xs" icon="i-lucide-play" :loading="running === j.job_key" @click="run(j)" />
          </li>
        </ul>
      </div>

      <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
        <div class="flex items-center gap-2 border-b border-muted px-3 py-2">
          <span class="text-sm font-medium text-default">执行日志</span>
          <span v-if="cur" class="text-xs text-dimmed">{{ cur }}</span>
        </div>
        <div v-if="logsLoading" class="space-y-2 p-3"><USkeleton v-for="i in 5" :key="i" class="h-10 w-full" /></div>
        <div v-else-if="!logs.length" class="p-10 text-center text-xs text-muted">暂无执行记录</div>
        <ul v-else class="max-h-[60vh] divide-y divide-muted overflow-y-auto">
          <li v-for="l in logs" :key="l.id" class="px-3 py-2">
            <div class="flex items-center gap-2">
              <UBadge :label="dict.label('job_status', l.status)" :color="dict.badge('job_status', l.status).color" variant="subtle" size="xs" />
              <span class="text-xs text-muted font-mono">{{ l.job_key }}</span>
              <span class="ml-auto text-xs text-dimmed tabular-nums">{{ l.duration }} ms</span>
            </div>
            <p class="pt-1 text-xs text-default break-all">{{ l.message }}</p>
            <p class="text-xs text-dimmed">{{ fmtDateTime(l.created_at) }}</p>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
`
}

function messagePage() {
  return `<script setup lang="ts">
import { useUiApi } from '~/utils/ui-kit'

interface Msg { id: number, to_user: string, title: string, content: string, kind: string, read: number, link: string, created_at: string }

const { get, post } = useUiApi()
const { push } = useNotify()
const { startPolling, stopPolling } = useUiChrome()
const dict = useUiDict()
const router = useRouter()

const rows = ref<Msg[]>([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const onlyUnread = ref(false)
const loading = ref(true)
const failed = ref('')

const shown = computed(() => (onlyUnread.value ? rows.value.filter(m => !Number(m.read)) : rows.value))

async function load() {
  loading.value = true
  failed.value = ''
  try {
    const d = pagedOf<Msg>(await get('/message/mine', { page: page.value, size: size.value }), size.value)
    rows.value = d.list
    total.value = d.total
    startPolling(60)
  } catch (e: any) {
    failed.value = e?.data?.message || '消息加载失败'
    rows.value = []
  } finally {
    loading.value = false
  }
}

async function readOne(m: Msg) {
  if (Number(m.read)) return
  await post('/message/read/' + m.id)
  m.read = 1
  await load()
  if (m.link) router.push(m.link)
}

async function readAll() {
  const r: any = await post('/message/read-all')
  push('已标记 ' + (r?.read ?? 0) + ' 条为已读', 'success')
  await load()
}

onMounted(() => { dict.load(); load() })
onUnmounted(stopPolling)
</script>

<template>
  <div data-gen="page-root" class="skin-main flex flex-col gap-4 p-4 lg:p-6">
    <div data-gen="toolbar" class="panel-head flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold text-default">消息中心</h1>
      <UBadge label="未读" :color="rows.filter(m => !Number(m.read)).length ? 'error' : 'neutral'" variant="subtle" size="xs" />
      <div class="flex-1" />
      <USwitch v-model="onlyUnread" label="只看未读" size="sm" />
      <UButton label="全部已读" icon="i-lucide-check-check" size="sm" color="neutral" variant="outline" @click="readAll" />
      <UButton label="刷新" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="ghost" :loading="loading" @click="load" />
    </div>

    <UAlert v-if="failed" color="error" variant="subtle" icon="i-lucide-triangle-alert" title="加载失败" :description="failed">
      <template #trailing><UButton label="重试" size="xs" color="neutral" variant="outline" @click="load" /></template>
    </UAlert>

    <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
      <div v-if="loading" class="space-y-2 p-3"><USkeleton v-for="i in 5" :key="i" class="h-14 w-full" /></div>
      <UEmpty v-else-if="!shown.length" title="没有消息" description="系统通知与待办会出现在这里" icon="i-lucide-inbox" />
      <ul v-else class="divide-y divide-muted">
        <li v-for="m in shown" :key="m.id">
          <button type="button" class="flex w-full items-start gap-3 px-3 py-3 text-left hover:bg-muted" @click="readOne(m)">
            <span class="mt-1 size-2 shrink-0 rounded-full" :class="Number(m.read) ? 'bg-transparent' : 'bg-error'" />
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="text-sm" :class="Number(m.read) ? 'text-muted' : 'text-default font-medium'">{{ m.title }}</span>
                <UBadge :label="dict.label('msg_kind', m.kind)" :color="dict.badge('msg_kind', m.kind).color" variant="subtle" size="xs" />
              </span>
              <span v-if="m.content" class="block pt-1 text-xs text-muted line-clamp-2">{{ m.content }}</span>
              <span class="block pt-1 text-xs text-dimmed">{{ fmtDateTime(m.created_at) }}</span>
            </span>
            <UIcon v-if="m.link" name="i-lucide-arrow-right" class="mt-1 size-4 shrink-0 text-dimmed" />
          </button>
        </li>
      </ul>
    </div>

    <div class="flex items-center justify-between">
      <span class="text-xs text-muted">共 <b class="tabular-nums text-default">{{ total }}</b> 条</span>
      <UPagination :page="page" :items-per-page="size" :total="total" :sibling-count="1" size="sm" @update:page="(n: number) => { page = n; load() }" />
    </div>
  </div>
</template>
`
}

/* ------------------------------------------------------------------ *
 * 前台微页面与官网能力：海报落地页 / 动态表单 / 复合门户 / 官网 CMS
 * ------------------------------------------------------------------ */

function landingPosterPage(p: TenantPlan): string {
  const heroTitle = JSON.stringify(String(capCfg(p, 'landing_poster', 'heroTitle', '全渠道推广中心')))
  const heroSubtitle = JSON.stringify(String(capCfg(p, 'landing_poster', 'heroSubtitle', '扫码立即体验专属服务')))

  return `<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'

definePageMeta({ layout: 'blank' })

const route = useRoute()
const scene = computed(() => (route.params.scene as string) || 'default')

const loading = ref(true)
const info = ref<any>({
  title: ${heroTitle},
  subtitle: ${heroSubtitle},
  channel: null
})

const currentUrl = computed(() => typeof window !== 'undefined' ? window.location.href : '')
const qrUrl = computed(() => {
  const target = info.value.channel?.target_url || currentUrl.value
  return 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent(target)
})

const copied = ref(false)
function copyLink() {
  if (typeof navigator !== 'undefined') {
    navigator.clipboard.writeText(currentUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

onMounted(async () => {
  try {
    const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '')
    const res = await $fetch(base + '/api/public/landing/' + scene.value) as any
    if (res && res.data) {
      info.value = res.data
    }
    $fetch(base + '/api/public/landing/scan', {
      method: 'POST',
      body: { scene: scene.value, channel_id: info.value.channel?.id }
    }).catch(() => null)
  } catch (e) {
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 font-sans antialiased">
    <div class="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center space-y-6">
      <div class="size-16 rounded-2xl bg-primary-600/20 border border-primary-500/30 flex items-center justify-center text-3xl shadow-inner">
        📱
      </div>

      <div class="space-y-2">
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {{ info.channel?.channel_name || info.title }}
        </h1>
        <p class="text-sm text-neutral-400">
          {{ info.channel?.remark || info.subtitle }}
        </p>
      </div>

      <div class="p-4 bg-white rounded-2xl shadow-lg border border-neutral-200">
        <img :src="qrUrl" alt="推广二维码" class="size-52 object-contain" />
      </div>

      <div class="flex items-center gap-2 text-xs text-neutral-400 bg-neutral-800/60 px-4 py-2 rounded-full border border-neutral-700/50">
        <span>已累计访问：</span>
        <span class="font-bold text-primary-400 tabular-nums">{{ (info.channel?.pv ?? 0) + 1 }}</span>
        <span>次</span>
      </div>

      <div class="w-full pt-2 flex flex-col sm:flex-row gap-3">
        <UButton
          block
          size="lg"
          :color="copied ? 'success' : 'primary'"
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          @click="copyLink"
        >
          {{ copied ? '已复制链接' : '复制推广链接' }}
        </UButton>
      </div>

      <p class="text-[11px] text-neutral-500">
        {{ info.channel?.channel_code ? '渠道标识: ' + info.channel.channel_code : '由 GenPlus 驱动 · 移动端微页面' }}
      </p>
    </div>
  </div>
</template>
`
}

function landingFormPage(p: TenantPlan): string {
  const formTitle = JSON.stringify(String(capCfg(p, 'landing_form', 'formTitle', '在线业务申请登记')))
  const submitText = JSON.stringify(String(capCfg(p, 'landing_form', 'submitText', '立即提交')))
  const successMsg = JSON.stringify(String(capCfg(p, 'landing_form', 'successMsg', '登记成功！我们将尽快与您联系。')))
  const targetModel = JSON.stringify(String(capCfg(p, 'landing_form', 'targetModel', '')))

  return `<script setup lang="ts">
import { ref, reactive } from 'vue'

definePageMeta({ layout: 'blank' })

const target = ${targetModel}
const formState = reactive<Record<string, any>>({ name: '', phone: '', remark: '' })
const loading = ref(false)
const submitted = ref(false)
const errorMsg = ref('')

async function onSubmit() {
  if (!formState.name || !formState.phone) {
    errorMsg.value = '请完整填写姓名与联系电话'
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '')
    const res = await $fetch(base + '/api/public/submit/' + (target || 'inquiry'), {
      method: 'POST',
      body: { ...formState }
    }) as any
    if (res && res.code === 0) {
      submitted.value = true
    } else {
      errorMsg.value = res?.message || '提交失败，请重试'
    }
  } catch (e: any) {
    errorMsg.value = e?.data?.message || '网络连接异常，请稍后重试'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  formState.name = ''
  formState.phone = ''
  formState.remark = ''
  submitted.value = false
}
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-4 sm:p-6 antialiased">
    <div class="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
      <div v-if="!submitted" class="space-y-6">
        <div class="text-center space-y-2">
          <div class="inline-flex size-14 rounded-2xl bg-primary-600/20 text-primary-400 items-center justify-center text-2xl mb-1">
            📋
          </div>
          <h1 class="text-2xl font-bold text-white">{{ ${formTitle} }}</h1>
          <p class="text-xs text-neutral-400">请留下您的真实联系方式，我们的顾问将为您提供专属服务</p>
        </div>

        <div v-if="errorMsg" class="p-3 bg-error-500/10 border border-error-500/20 text-error-400 text-xs rounded-xl flex items-center gap-2">
          <UIcon name="i-lucide-alert-circle" class="size-4 shrink-0" />
          <span>{{ errorMsg }}</span>
        </div>

        <form @submit.prevent="onSubmit" class="space-y-4">
          <div class="space-y-1.5 text-left">
            <label class="text-xs font-medium text-neutral-300">姓名称呼 <span class="text-error-400">*</span></label>
            <UInput v-model="formState.name" placeholder="请输入您的姓名" size="lg" class="w-full" />
          </div>

          <div class="space-y-1.5 text-left">
            <label class="text-xs font-medium text-neutral-300">联系电话 <span class="text-error-400">*</span></label>
            <UInput v-model="formState.phone" type="tel" placeholder="请输入手机号码" size="lg" class="w-full" />
          </div>

          <div class="space-y-1.5 text-left">
            <label class="text-xs font-medium text-neutral-300">意向留言 / 需求说明</label>
            <UTextarea v-model="formState.remark" placeholder="请简要描述您的业务诉求（选填）" :rows="3" size="lg" class="w-full" />
          </div>

          <UButton type="submit" block size="xl" color="primary" :loading="loading">
            {{ ${submitText} }}
          </UButton>
        </form>
      </div>

      <div v-else class="text-center py-8 space-y-5">
        <div class="size-16 mx-auto rounded-full bg-success-500/20 text-success-400 flex items-center justify-center text-3xl">
          <UIcon name="i-lucide-check-circle-2" class="size-10" />
        </div>
        <div class="space-y-2">
          <h2 class="text-xl font-bold text-white">提交成功</h2>
          <p class="text-sm text-neutral-400">{{ ${successMsg} }}</p>
        </div>
        <UButton color="neutral" variant="outline" size="md" @click="resetForm">
          返回再次填写
        </UButton>
      </div>
    </div>
  </div>
</template>
`
}

function landingPortalPage(p: TenantPlan): string {
  const portalTitle = JSON.stringify(String(capCfg(p, 'landing_portal', 'portalTitle', '服务咨询门户')))
  const listModel = JSON.stringify(String(capCfg(p, 'landing_portal', 'listModel', '')))
  const submitModel = JSON.stringify(String(capCfg(p, 'landing_portal', 'submitModel', '')))

  return `<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

definePageMeta({ layout: 'blank' })

const keyword = ref('')
const loading = ref(false)
const items = ref<any[]>([])
const selectedItem = ref<any>(null)
const detailDrawer = ref(false)
const formDrawer = ref(false)

const formState = reactive<Record<string, any>>({ name: '', phone: '', remark: '' })
const submitting = ref(false)
const formSuccess = ref(false)

async function loadData() {
  loading.value = true
  try {
    const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '')
    const res = await $fetch(base + '/api/public/portal/list', {
      params: { keyword: keyword.value, res: ${listModel} }
    }) as any
    if (res && res.data) {
      items.value = res.data.list || []
    }
  } catch (e) {
    items.value = []
  } finally {
    loading.value = false
  }
}

function openDetail(item: any) {
  selectedItem.value = item
  detailDrawer.value = true
}

async function submitInquiry() {
  if (!formState.name || !formState.phone) return
  submitting.value = true
  try {
    const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '')
    await $fetch(base + '/api/public/submit/' + (${submitModel} || 'inquiry'), {
      method: 'POST',
      body: { ...formState, ref_title: selectedItem.value?.name || selectedItem.value?.title || '' }
    })
    formSuccess.value = true
    setTimeout(() => {
      formDrawer.value = false
      formSuccess.value = false
      formState.name = ''
      formState.phone = ''
      formState.remark = ''
    }, 2000)
  } catch (e) {} finally {
    submitting.value = false
  }
}

onMounted(loadData)
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans antialiased">
    <header class="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur sticky top-0 z-30 px-4 py-3">
      <div class="max-w-5xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-xl">🏛️</span>
          <h1 class="font-bold text-lg text-white">{{ ${portalTitle} }}</h1>
        </div>
        <UButton label="在线咨询 / 申请" icon="i-lucide-send" color="primary" size="sm" @click="formDrawer = true" />
      </div>
    </header>

    <main class="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
      <div class="flex gap-2">
        <UInput v-model="keyword" placeholder="输入关键词搜索..." icon="i-lucide-search" size="lg" class="flex-1" @keydown.enter="loadData" />
        <UButton label="搜索" icon="i-lucide-search" color="primary" size="lg" @click="loadData" />
      </div>

      <div v-if="loading" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <USkeleton v-for="i in 4" :key="i" class="h-36 rounded-2xl" />
      </div>

      <div v-else-if="items.length > 0" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          v-for="item in items"
          :key="item.id"
          class="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 cursor-pointer transition flex flex-col justify-between space-y-3"
          @click="openDetail(item)"
        >
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <h3 class="font-semibold text-base text-white truncate">{{ item.name || item.title || '记录 #' + item.id }}</h3>
              <UBadge v-if="item.status !== undefined" color="primary" variant="subtle" size="xs">{{ item.status ? '正常' : '暂停' }}</UBadge>
            </div>
            <p class="text-xs text-neutral-400 line-clamp-2">{{ item.remark || item.description || item.summary || '点击查看完整详情...' }}</p>
          </div>
          <div class="flex items-center justify-between text-xs text-neutral-500 pt-2 border-t border-neutral-800/80">
            <span>ID: {{ item.id }}</span>
            <span class="text-primary-400 flex items-center gap-1 font-medium">查看详情 <UIcon name="i-lucide-chevron-right" class="size-3.5" /></span>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-16 bg-neutral-900/50 rounded-2xl border border-neutral-800 space-y-2">
        <UIcon name="i-lucide-inbox" class="size-10 text-neutral-600 mx-auto" />
        <p class="text-sm text-neutral-400">暂无可浏览的公开条目</p>
      </div>
    </main>

    <USlideover v-model:open="detailDrawer" :title="selectedItem?.name || selectedItem?.title || '详情信息'">
      <template #body>
        <div v-if="selectedItem" class="space-y-3 p-4 text-sm">
          <div v-for="(v, k) in selectedItem" :key="k" class="flex flex-col py-1.5 border-b border-neutral-800">
            <span class="text-xs text-neutral-400 uppercase font-mono">{{ k }}</span>
            <span class="text-sm text-white break-all mt-0.5">{{ v }}</span>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between w-full">
          <UButton label="关闭" color="neutral" variant="outline" @click="detailDrawer = false" />
          <UButton label="针对此项提交申请" icon="i-lucide-send" color="primary" @click="detailDrawer = false; formDrawer = true" />
        </div>
      </template>
    </USlideover>

    <USlideover v-model:open="formDrawer" title="在线申请登记" description="请填写业务信息">
      <template #body>
        <div class="space-y-4 p-4">
          <div v-if="formSuccess" class="p-4 bg-success-500/20 text-success-300 rounded-xl text-center">
            登记成功！感谢您的参与。
          </div>
          <form v-else @submit.prevent="submitInquiry" class="space-y-4">
            <div class="space-y-1">
              <label class="text-xs text-neutral-300">姓名 *</label>
              <UInput v-model="formState.name" placeholder="请输入姓名" class="w-full" />
            </div>
            <div class="space-y-1">
              <label class="text-xs text-neutral-300">电话 *</label>
              <UInput v-model="formState.phone" type="tel" placeholder="请输入电话" class="w-full" />
            </div>
            <div class="space-y-1">
              <label class="text-xs text-neutral-300">留言备注</label>
              <UTextarea v-model="formState.remark" placeholder="留言诉求" class="w-full" />
            </div>
            <UButton type="submit" block color="primary" :loading="submitting">立即提交</UButton>
          </form>
        </div>
      </template>
    </USlideover>
  </div>
</template>
`
}

function landingCmsPage(p: TenantPlan): string {
  const isMedical = /医|诊|药|挂号|就医|体检|护士|病|康复|卫生/.test(p.title + ' ' + (p.description || ''))
  const siteName = JSON.stringify(String(capCfg(p, 'landing_cms', 'siteName', p.title || '企业官方网站')))
  const defaultSlogan = isMedical ? '精医厚德 · 科技赋能 · 提供全天候高品质便民医疗服务' : '连接未来 · 科技驱动 · 赋能企业全链路数字化转型'
  const siteSlogan = JSON.stringify(String(capCfg(p, 'landing_cms', 'siteSlogan', defaultSlogan)))
  const contactPhone = JSON.stringify(String(capCfg(p, 'landing_cms', 'contactPhone', '400-888-9999')))
  const contactEmail = JSON.stringify(String(capCfg(p, 'landing_cms', 'contactEmail', 'service@example.com')))
  const address = JSON.stringify(String(capCfg(p, 'landing_cms', 'address', '高新科技产业园区数智创新大厦 18 层')))
  const icp = JSON.stringify(String(capCfg(p, 'landing_cms', 'icp', '京ICP备20260915号-1')))

  // 纯静态预设资讯列表（根据业务领域定制预设，零白屏、零加载骨架）
  const staticArticles = isMedical ? [
    {
      id: 1,
      title: '全面推行数字化分时段预约挂号：看病就医无需排队',
      category: '就医指南',
      summary: '为进一步缩短患者门诊就医等候时间，我院全科室全面开通精准至30分钟的分时段线上挂号与自助签到服务。',
      content: '【全面推行分时段预约挂号通知】\\n\\n尊敬的广大市民朋友：\\n\\n为深入贯彻落实改善医疗服务行动计划，解决群众看病排队长、就医繁的问题，我院即日起全面升级智能分时段预约挂号系统。\\n\\n一、预约时段精准划分：\\n所有出诊科室号源细分至30分钟就诊时段，患者可根据自身时间安排提前7天在线选定心仪医生及出诊时段。\\n\\n二、就诊流程优化：\\n1. 线上预约成功后凭预约二维码或电子医保码直接前往对应诊区报到；\\n2. 诊区候诊大屏实时叫号，真正实现“准时到院、即到即看”；\\n3. 诊后检查报告、电子处方及缴费清单可在手机端实时一键查阅。\\n\\n感谢广大市民朋友对医院工作的理解与支持！',
      views: 2480,
      created_at: '2026-09-15'
    },
    {
      id: 2,
      title: '特聘权威专家名医团队每周专科门诊排班公告',
      category: '名医专家',
      summary: '本月起特邀心血管内科、神经内科、骨科及妇产科领域顶尖学科带头人定期出诊，号源每周一早8点准时同步开放。',
      content: '【专家团队出诊排班公告】\\n\\n为满足广大患者对高水平医疗技术资源的需求，我院特邀多位国家级重点学科带头人及知名三甲医院主任医师定期莅临我院开展专家门诊与疑难病例会诊。\\n\\n【重点出诊专家团队】：\\n- 张建国 主任医师（心血管内科知名专家，周一、周三上午出诊）\\n- 李秀琴 副主任医师（呼吸与危重症专科专家，周二、周四出诊）\\n- 王明辉 主任医师（神经内科带头人，周五全天会诊）\\n- 陈志勇 主任医师（骨科微创外科专家，周二上午出诊）\\n\\n【预约方式】：可通过官网【资讯动态】直达预约挂号或直接在预约中心选择指定专家挂号，号源每日严格限额以保障问诊质量。',
      views: 1820,
      created_at: '2026-09-14'
    },
    {
      id: 3,
      title: '便民新举措：线上健康档案建立与检验报告即时查询',
      category: '便民服务',
      summary: '市民完成实名认证后即可建立终身电子健康档案，血液化验、医学影像、超声报告出具后秒级同步推送。',
      content: '【便民智慧医疗服务再升级】\\n\\n以往就医做完检查后需在医院长时间等待纸质报告，如今只需在手机端打开健康中心，化验检查结果生成后即可秒级同步。\\n\\n服务亮点：\\n1. 报告智能解读与指标趋势对比；\\n2. 支持原始医学影像（DICOM）高清调阅与云胶片下载；\\n3. 历次就医处方、诊断结论终身云端归档，为异地转诊与慢性病管理提供完整客观依据。\\n\\n我们致力于以数智科技提升医疗服务温度！',
      views: 3150,
      created_at: '2026-09-12'
    }
  ] : [
    {
      id: 1,
      title: '新一代企业级低代码数字中台解决方案正式发布',
      category: '产品更新',
      summary: '基于确定性工业级代码编译架构，实现数据建模、权限设计、业务流程与前台门户秒级闭环，大幅降本增效。',
      content: '【企业数字化中台发布会】\\n\\n新一代企业级业务管理与数据协作平台今日正式商用。\\n系统彻底打破传统低代码黑盒笨重与手写代码昂贵的双重痛点，采用Skills+MCP双核驱动，为各行各业带来毫秒级代码生成与确定性高可靠交付。',
      views: 3600,
      created_at: '2026-09-15'
    },
    {
      id: 2,
      title: '企业数据安全与Casbin细粒度权限管控白皮书',
      category: '技术白皮书',
      summary: '深度解析基于RBAC+Casbin多租户资源隔离与Fail-Closed安全门禁机制，护航企业级核心资产。',
      content: '【安全架构白皮书】\\n\\n在企业数字化纵深推进的今天，接口权限的越权访问与数据泄漏是最高安全风险。\\n本白皮书系统阐述了在无状态JWT鉴权与高性能内存ACL模型下，如何构建零信任企业安全防御闭环。',
      views: 2890,
      created_at: '2026-09-13'
    },
    {
      id: 3,
      title: 'B+C 双端业务协同闭环：从后台运营到前台转化的实践',
      category: '行业案例',
      summary: '如何通过带参渠道活码、动态表单与免鉴权微页面构建前台用户高转化、后台数据实时对账的业务闭环。',
      content: '【双端闭环实战分享】\\n\\n过去管理系统往往沦为信息孤岛，无法触达外部用户。\\n通过将B端集中运营与C端轻量级落地页结合，实现线索秒级入库、状态即时流转、全链路数据指标看板实时穿透。',
      views: 1940,
      created_at: '2026-09-10'
    }
  ]

  const staticArticlesJson = JSON.stringify(staticArticles)

  return `<script setup lang="ts">
import { ref, onMounted } from 'vue'

definePageMeta({ layout: 'blank' })

const SITE_NAME = ${siteName}
const SITE_SLOGAN = ${siteSlogan}
const PHONE = ${contactPhone}
const EMAIL = ${contactEmail}
const ADDRESS = ${address}
const ICP = ${icp}

useHead({
  title: SITE_NAME + ' · 官方门户与资讯中心',
  meta: [
    { name: 'description', content: SITE_SLOGAN },
    { name: 'keywords', content: SITE_NAME + ',官方网站,数字门户,服务中心,在线预约,资讯中心' }
  ]
})

// 纯静态首屏数据：同步就绪，零延迟、零骨架屏、秒级呈现
const PRESET_ARTICLES = ${staticArticlesJson}
const articles = ref<any[]>(PRESET_ARTICLES)
const activeTab = ref('all')
const activeArticle = ref<any>(null)
const drawerOpen = ref(false)

// 纯静态分类导航
const categories = ['全部', ...new Set(PRESET_ARTICLES.map(a => a.category))]

const filteredArticles = computed(() => {
  if (activeTab.value === 'all' || activeTab.value === '全部') return articles.value
  return articles.value.filter(a => a.category === activeTab.value)
})

function openArticle(item: any) {
  activeArticle.value = item
  drawerOpen.value = true
}

// 渐进式静默同步：后台静默拉取数据库最新资讯，不破坏静态纯净布局
onMounted(async () => {
  try {
    const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '')
    const res = await $fetch(base + '/api/public/cms/articles').catch(() => null) as any
    if (res && res.data?.list && res.data.list.length > 0) {
      // 数据库有新文章时无感追加合并到顶部
      const dbList = res.data.list
      const existIds = new Set(dbList.map((x: any) => x.id))
      const combined = [...dbList, ...PRESET_ARTICLES.filter(p => !existIds.has(p.id))]
      articles.value = combined
    }
  } catch (e) {}
})
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans antialiased selection:bg-primary-500 selection:text-white">
    <!-- 顶部常驻纯静态导航栏 -->
    <header class="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-3.5 transition-all">
      <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <a href="#hero" class="flex items-center gap-3 group">
          <div class="size-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center font-bold text-white shadow-lg shadow-primary-500/20 group-hover:scale-105 transition">
            <UIcon name="i-lucide-building-2" class="size-5" />
          </div>
          <div>
            <div class="font-bold text-base sm:text-lg text-white leading-tight">{{ SITE_NAME }}</div>
            <div class="text-[10px] text-neutral-400 font-mono hidden sm:block">OFFICIAL PORTAL</div>
          </div>
        </a>

        <nav class="hidden lg:flex items-center gap-7 text-sm font-medium text-neutral-300">
          <a href="#hero" class="hover:text-primary-400 transition">首页</a>
          <a href="#stats" class="hover:text-primary-400 transition">服务成效</a>
          <a href="#features" class="hover:text-primary-400 transition">核心优势</a>
          <a href="#solutions" class="hover:text-primary-400 transition">解决方案</a>
          <a href="#news" class="hover:text-primary-400 transition">资讯动态</a>
          <a href="#about" class="hover:text-primary-400 transition">关于我们</a>
          <a href="#contact" class="hover:text-primary-400 transition">联系咨询</a>
        </nav>

        <div class="flex items-center gap-3">
          <a
            :href="'tel:' + PHONE"
            class="hidden sm:inline-flex items-center gap-1.5 text-xs text-neutral-300 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 transition"
          >
            <UIcon name="i-lucide-phone" class="size-3.5 text-primary-400" />
            <span>{{ PHONE }}</span>
          </a>
          <UButton
            label="管理后台登录"
            icon="i-lucide-arrow-right"
            color="primary"
            variant="solid"
            size="sm"
            to="/login"
            class="font-medium shadow-md shadow-primary-500/20"
          />
        </div>
      </div>
    </header>

    <!-- 1. Hero 视觉主屏 -->
    <section id="hero" class="relative overflow-hidden pt-16 pb-20 sm:pt-24 sm:pb-32 px-4 sm:px-6 text-center border-b border-neutral-900">
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(14,165,233,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div class="max-w-4xl mx-auto space-y-6 relative z-10">
        <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/25 text-primary-400 text-xs font-semibold tracking-wide">
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
          <span>权威认证 · 高度可信 · 全天候便民数智枢纽</span>
        </div>

        <h1 class="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
          {{ SITE_SLOGAN }}
        </h1>

        <p class="text-sm sm:text-base text-neutral-300 max-w-2xl mx-auto leading-relaxed">
          以现代化数字化管理平台为底层依托，打通资源调配、专家号源、业务流转与便民服务闭环，构建透明、便捷、高可靠的综合服务门户。
        </p>

        <div class="flex flex-wrap justify-center gap-3.5 pt-4">
          <UButton label="浏览资讯与动态" size="lg" color="primary" to="#news" icon="i-lucide-newspaper" class="px-6" />
          <UButton label="进入系统后台" size="lg" color="neutral" variant="outline" to="/login" icon="i-lucide-shield-check" class="px-6" />
          <UButton label="在线咨询联系" size="lg" color="neutral" variant="ghost" to="#contact" icon="i-lucide-message-square" />
        </div>
      </div>
    </section>

    <!-- 2. 数据指标里程碑 Stats -->
    <section id="stats" class="py-12 px-4 sm:px-6 max-w-7xl mx-auto border-b border-neutral-900 w-full">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div class="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 text-center space-y-1">
          <div class="text-2xl sm:text-4xl font-extrabold text-white font-mono">500+</div>
          <div class="text-xs text-neutral-400">服务机构与科室网络</div>
        </div>
        <div class="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 text-center space-y-1">
          <div class="text-2xl sm:text-4xl font-extrabold text-primary-400 font-mono">99.99%</div>
          <div class="text-xs text-neutral-400">平台系统高可用保障</div>
        </div>
        <div class="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 text-center space-y-1">
          <div class="text-2xl sm:text-4xl font-extrabold text-white font-mono">120万+</div>
          <div class="text-xs text-neutral-400">累计便民服务预约人次</div>
        </div>
        <div class="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-5 text-center space-y-1">
          <div class="text-2xl sm:text-4xl font-extrabold text-primary-400 font-mono">24/7</div>
          <div class="text-xs text-neutral-400">全天候数字化实时响应</div>
        </div>
      </div>
    </section>

    <!-- 3. 核心优势特性矩阵 Features -->
    <section id="features" class="py-16 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-neutral-900 w-full space-y-12">
      <div class="text-center max-w-2xl mx-auto space-y-3">
        <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">全场景核心能力与服务保障</h2>
        <p class="text-xs sm:text-sm text-neutral-400 leading-relaxed">全方位打通前台门户展示与后台业务流转，以极高标准筑牢数字化服务基石。</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div class="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 rounded-2xl p-6 space-y-3 transition">
          <div class="size-10 rounded-xl bg-primary-500/15 text-primary-400 flex items-center justify-center text-lg">
            <UIcon name="i-lucide-calendar-clock" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">精准预约与分时调度</h3>
          <p class="text-xs text-neutral-400 leading-relaxed">支持分时段号源动态排班、候诊排队预测与多维度智能检索，彻底消除盲目跑腿与排队等待。</p>
        </div>

        <div class="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 rounded-2xl p-6 space-y-3 transition">
          <div class="size-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center text-lg">
            <UIcon name="i-lucide-shield-check" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">金融级数据安全与合规</h3>
          <p class="text-xs text-neutral-400 leading-relaxed">严格遵循国家网络安全等保规范，内置 RBAC + Casbin 接口防越权防篡改体系与数据脱敏机制。</p>
        </div>

        <div class="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 rounded-2xl p-6 space-y-3 transition">
          <div class="size-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center text-lg">
            <UIcon name="i-lucide-smartphone" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">多端自适应与零延迟渲染</h3>
          <p class="text-xs text-neutral-400 leading-relaxed">全站采用纯静态预编译与响应式栅格布局，PC 宽屏、平板、手机各尺寸极速秒开、零白屏。</p>
        </div>

        <div class="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 rounded-2xl p-6 space-y-3 transition">
          <div class="size-10 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center text-lg">
            <UIcon name="i-lucide-file-text" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">电子档案与报告一键互联</h3>
          <p class="text-xs text-neutral-400 leading-relaxed">打通全周期业务档案，检验结果、诊断结论与电子凭单云端存储，跨科室调阅安全高效。</p>
        </div>

        <div class="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 rounded-2xl p-6 space-y-3 transition">
          <div class="size-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center text-lg">
            <UIcon name="i-lucide-chart-pie" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">数智运营与指标穿透看板</h3>
          <p class="text-xs text-neutral-400 leading-relaxed">后台配备实时数据大屏，业务负荷、科室出诊利用率与满意度指数清晰可视，支撑科学决策。</p>
        </div>

        <div class="bg-neutral-900/70 border border-neutral-800/80 hover:border-neutral-700 rounded-2xl p-6 space-y-3 transition">
          <div class="size-10 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center text-lg">
            <UIcon name="i-lucide-headphones" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">全流程人文关怀与跟踪</h3>
          <p class="text-xs text-neutral-400 leading-relaxed">提供预约前就医指引、预约后短信通知、就诊前提醒与诊后满意度回访，打造有温度的服务生态。</p>
        </div>
      </div>
    </section>

    <!-- 4. 行业解决方案与专区 Solutions -->
    <section id="solutions" class="py-16 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-neutral-900 w-full space-y-10">
      <div class="text-center max-w-2xl mx-auto space-y-3">
        <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">多元化业务专区与服务矩阵</h2>
        <p class="text-xs sm:text-sm text-neutral-400 leading-relaxed">针对不同就医群体与业务场景，量身打造便捷直达通道。</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div class="space-y-3">
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 text-xs font-medium">普通与专科门诊</div>
            <h3 class="text-lg font-bold text-white">专家门诊 · 专科诊治通道</h3>
            <p class="text-xs text-neutral-400 leading-relaxed">覆盖内外妇儿及特色中医专科，提前公示权威专家资历、研究方向与擅长领域，对症挂号更省心。</p>
          </div>
          <UButton label="进入排班挂号" color="primary" variant="subtle" size="sm" to="/login" />
        </div>

        <div class="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div class="space-y-3">
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-medium">健康管理</div>
            <h3 class="text-lg font-bold text-white">健康体检 · 全周期监测评估</h3>
            <p class="text-xs text-neutral-400 leading-relaxed">面向个人、家庭与企事业单位提供个性化体检套餐定制、检前须知提示与检后专家报告精准解读。</p>
          </div>
          <UButton label="了解体检套餐" color="neutral" variant="outline" size="sm" to="#contact" />
        </div>

        <div class="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-neutral-800 rounded-2xl p-6 flex flex-col justify-between space-y-6">
          <div class="space-y-3">
            <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-400 text-xs font-medium">快捷通道</div>
            <h3 class="text-lg font-bold text-white">便民绿色通道与退改服务</h3>
            <p class="text-xs text-neutral-400 leading-relaxed">军人、老年人及急危重症患者绿色通道，支持在就诊前按规定时限线上快捷取消与换号调整。</p>
          </div>
          <UButton label="查看服务规则" color="neutral" variant="outline" size="sm" to="#news" />
        </div>
      </div>
    </section>

    <!-- 5. 纯静态资讯中心 News & CMS -->
    <section id="news" class="py-16 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-neutral-900 w-full space-y-10">
      <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div class="space-y-2">
          <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-primary-500/10 text-primary-400 text-xs font-medium">资讯中心</div>
          <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">官方动态 · 公告与就医指南</h2>
          <p class="text-xs sm:text-sm text-neutral-400">实时掌握最新院务公告、名医排班与健康科普知识</p>
        </div>

        <!-- 纯静态分类过滤 -->
        <div class="flex flex-wrap gap-1.5 p-1 rounded-xl bg-neutral-900 border border-neutral-800 self-start md:self-auto">
          <button
            v-for="cat in categories"
            :key="cat"
            class="px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
            :class="activeTab === cat ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'"
            @click="activeTab = cat"
          >
            {{ cat }}
          </button>
        </div>
      </div>

      <!-- 纯静态新闻卡片列表（零等待直接秒开展示） -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="item in filteredArticles"
          :key="item.id"
          class="bg-neutral-900/80 border border-neutral-800 hover:border-neutral-700 rounded-2xl overflow-hidden flex flex-col transition group cursor-pointer hover:shadow-xl hover:shadow-primary-500/5"
          @click="openArticle(item)"
        >
          <div class="h-44 bg-neutral-800/80 relative overflow-hidden flex items-center justify-center text-neutral-600 group-hover:scale-105 transition duration-500">
            <div class="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent z-10" />
            <UIcon name="i-lucide-newspaper" class="size-16 text-neutral-700" />
            <div class="absolute top-3.5 left-3.5 z-20">
              <UBadge color="primary" variant="solid" size="xs">{{ item.category || '通知公告' }}</UBadge>
            </div>
            <div class="absolute bottom-3.5 right-3.5 z-20 text-[11px] text-neutral-400 font-mono flex items-center gap-1">
              <UIcon name="i-lucide-eye" class="size-3" />
              <span>{{ item.views }}</span>
            </div>
          </div>

          <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
            <div class="space-y-2">
              <h3 class="font-bold text-base text-white group-hover:text-primary-400 transition line-clamp-2 leading-snug">
                {{ item.title }}
              </h3>
              <p class="text-xs text-neutral-400 line-clamp-3 leading-relaxed">
                {{ item.summary || item.content?.slice(0, 100) }}
              </p>
            </div>

            <div class="text-[11px] text-neutral-400 pt-3 border-t border-neutral-800/80 flex items-center justify-between">
              <span>{{ item.created_at ? item.created_at.slice(0, 10) : '近期发布' }}</span>
              <span class="inline-flex items-center gap-1 text-primary-400 font-medium group-hover:translate-x-1 transition">
                <span>阅读详情</span>
                <UIcon name="i-lucide-arrow-right" class="size-3" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. 关于我们 About Us -->
    <section id="about" class="py-16 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto border-b border-neutral-900 w-full">
      <div class="bg-gradient-to-br from-neutral-900 via-neutral-900 to-neutral-950 border border-neutral-800/90 rounded-3xl p-8 sm:p-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div class="lg:col-span-7 space-y-4">
          <div class="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-primary-500/10 text-primary-400 text-xs font-medium">关于我们</div>
          <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">恪守初心 · 科技与人文并重</h2>
          <p class="text-xs sm:text-sm text-neutral-300 leading-relaxed">
            我们始终秉承“以人为本、科技赋能、精益求精”的发展理念，以现代化管理体系与信息化技术为纽带，打通诊前、诊中、诊后全流程链条，致力于为每一位群众提供高效、安全、温馨的优质服务体验。
          </p>
          <div class="grid grid-cols-2 gap-4 pt-2 text-xs text-neutral-300">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-check-circle" class="size-4 text-emerald-400 shrink-0" />
              <span>资质完备 · 规范严谨</span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-check-circle" class="size-4 text-emerald-400 shrink-0" />
              <span>全天候技术保障运维</span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-check-circle" class="size-4 text-emerald-400 shrink-0" />
              <span>隐私数据高等级加密</span>
            </div>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-check-circle" class="size-4 text-emerald-400 shrink-0" />
              <span>多学科团队协同联动</span>
            </div>
          </div>
        </div>

        <div class="lg:col-span-5 bg-neutral-950/80 border border-neutral-800 rounded-2xl p-6 space-y-4">
          <div class="text-sm font-bold text-white flex items-center gap-2">
            <UIcon name="i-lucide-award" class="size-4 text-primary-400" />
            <span>荣誉与信任里程碑</span>
          </div>
          <div class="space-y-3 text-xs text-neutral-400">
            <div class="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800/60 flex justify-between items-center">
              <span>优质便民服务示范单位</span>
              <span class="text-neutral-300 font-mono">2025</span>
            </div>
            <div class="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800/60 flex justify-between items-center">
              <span>数字化全链路服务标杆工程</span>
              <span class="text-neutral-300 font-mono">2024</span>
            </div>
            <div class="p-3 rounded-xl bg-neutral-900/60 border border-neutral-800/60 flex justify-between items-center">
              <span>群众就医满意度十佳示范</span>
              <span class="text-neutral-300 font-mono">2023</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 7. 联系咨询与服务网点 Contact -->
    <section id="contact" class="py-16 sm:py-20 px-4 sm:px-6 max-w-7xl mx-auto w-full space-y-10">
      <div class="text-center max-w-2xl mx-auto space-y-3">
        <h2 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">联系与服务支持中心</h2>
        <p class="text-xs sm:text-sm text-neutral-400 leading-relaxed">欢迎随时致电咨询或亲临现场，我们竭诚为您提供周到指引与技术支持。</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 text-center space-y-3">
          <div class="size-11 rounded-2xl bg-primary-500/15 text-primary-400 flex items-center justify-center mx-auto">
            <UIcon name="i-lucide-phone-call" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">官方咨询热线</h3>
          <p class="text-sm font-mono text-primary-400 font-bold">{{ PHONE }}</p>
          <p class="text-xs text-neutral-400">周一至周日 08:00 - 18:00 专人接听</p>
        </div>

        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 text-center space-y-3">
          <div class="size-11 rounded-2xl bg-primary-500/15 text-primary-400 flex items-center justify-center mx-auto">
            <UIcon name="i-lucide-mail" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">服务与监督邮箱</h3>
          <p class="text-sm font-mono text-neutral-200">{{ EMAIL }}</p>
          <p class="text-xs text-neutral-400">意见建议与商务合作 24 小时内反馈</p>
        </div>

        <div class="bg-neutral-900/70 border border-neutral-800 rounded-2xl p-6 text-center space-y-3">
          <div class="size-11 rounded-2xl bg-primary-500/15 text-primary-400 flex items-center justify-center mx-auto">
            <UIcon name="i-lucide-map-pin" class="size-5" />
          </div>
          <h3 class="font-bold text-base text-white">现场服务地址</h3>
          <p class="text-xs text-neutral-300 leading-relaxed">{{ ADDRESS }}</p>
          <p class="text-xs text-neutral-400">地铁/公交直达 · 配套便民停车场</p>
        </div>
      </div>
    </section>

    <!-- 全局纯静态页脚 Footer -->
    <footer class="border-t border-neutral-900 bg-neutral-950 py-12 px-4 sm:px-8 mt-auto text-xs text-neutral-400 space-y-6">
      <div class="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
        <div class="space-y-1">
          <div class="font-bold text-white text-sm">{{ SITE_NAME }}</div>
          <p class="text-neutral-400">{{ SITE_SLOGAN }}</p>
        </div>

        <div class="flex flex-wrap justify-center gap-6 text-neutral-300">
          <a href="#hero" class="hover:text-white transition">首页</a>
          <a href="#features" class="hover:text-white transition">服务特色</a>
          <a href="#news" class="hover:text-white transition">动态资讯</a>
          <a href="#about" class="hover:text-white transition">机构简介</a>
          <a href="#contact" class="hover:text-white transition">联系我们</a>
          <NuxtLink to="/login" class="text-primary-400 hover:underline">管理登录</NuxtLink>
        </div>
      </div>

      <div class="max-w-7xl mx-auto pt-6 border-t border-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-neutral-400">
        <p>© 2026 {{ SITE_NAME }} · 版权所有 · {{ ICP }}</p>
        <p>基于 GenPlus 工业化高可信纯静态 CMS 引擎构建</p>
      </div>
    </footer>

    <!-- 纯静态内联文章详情阅读抽屉（极速秒发展开，无需切页等待） -->
    <USlideover
      v-model:open="drawerOpen"
      :title="activeArticle?.title || '资讯详情'"
      :description="activeArticle ? (activeArticle.category + ' · 发布时间：' + activeArticle.created_at) : ''"
      class="sm:max-w-2xl"
    >
      <template #body>
        <div v-if="activeArticle" class="space-y-6 text-neutral-200">
          <div class="flex items-center gap-3 border-b border-neutral-800 pb-4">
            <UBadge color="primary" variant="subtle">{{ activeArticle.category }}</UBadge>
            <span class="text-xs text-neutral-400 font-mono">阅读量：{{ activeArticle.views }}</span>
          </div>

          <div v-if="activeArticle.summary" class="p-4 rounded-xl bg-neutral-900 border-l-4 border-primary-500 text-sm text-neutral-300 italic leading-relaxed">
            {{ activeArticle.summary }}
          </div>

          <div class="text-sm leading-loose whitespace-pre-wrap text-neutral-200 space-y-4">
            {{ activeArticle.content }}
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between w-full">
          <UButton label="关闭阅读" color="neutral" variant="outline" @click="drawerOpen = false" />
          <UButton label="前往管理后台" color="primary" to="/login" />
        </div>
      </template>
    </USlideover>
  </div>
</template>
`
}

function landingCmsDetailPage(p: TenantPlan): string {
  const isMedical = /医|诊|药|挂号|就医|体检|护士|病|康复|卫生/.test(p.title + ' ' + (p.description || ''))
  const defaultArticles = isMedical ? [
    {
      id: 1,
      title: '全面推行数字化分时段预约挂号：看病就医无需排队',
      category: '就医指南',
      summary: '为进一步缩短患者门诊就医等候时间，我院全科室全面开通精准至30分钟的分时段线上挂号与自助签到服务。',
      content: '【全面推行分时段预约挂号通知】\\n\\n尊敬的广大市民朋友：\\n\\n为深入贯彻落实改善医疗服务行动计划，解决群众看病排队长、就医繁的问题，我院即日起全面升级智能分时段预约挂号系统。\\n\\n一、预约时段精准划分：所有出诊科室号源细分至30分钟就诊时段，患者可根据自身时间安排提前7天在线选定心仪医生及出诊时段。\\n\\n二、就诊流程优化：线上预约成功后凭预约二维码或电子医保码直接前往对应诊区报到；诊区候诊大屏实时叫号，真正实现准时到院、即到即看。',
      views: 2480,
      created_at: '2026-09-15'
    },
    {
      id: 2,
      title: '特聘权威专家名医团队每周专科门诊排班公告',
      category: '名医专家',
      summary: '本月起特邀心血管内科、神经内科、骨科及妇产科领域顶尖学科带头人定期出诊，号源每周一早8点准时同步开放。',
      content: '【专家团队出诊排班公告】\\n\\n为满足广大患者对高水平医疗技术资源的需求，我院特邀多位国家级重点学科带头人及知名三甲医院主任医师定期莅临我院开展专家门诊与疑难病例会诊。',
      views: 1820,
      created_at: '2026-09-14'
    },
    {
      id: 3,
      title: '便民新举措：线上健康档案建立与检验报告即时查询',
      category: '便民服务',
      summary: '市民完成实名认证后即可建立终身电子健康档案，血液化验、医学影像、超声报告出具后秒级同步推送。',
      content: '【便民智慧医疗服务再升级】\\n\\n以往就医做完检查后需在医院长时间等待纸质报告，如今只需在手机端打开健康中心，化验检查结果生成后即可秒级同步。',
      views: 3150,
      created_at: '2026-09-12'
    }
  ] : [
    {
      id: 1,
      title: '新一代企业级低代码数字中台解决方案正式发布',
      category: '产品更新',
      summary: '基于确定性工业级代码编译架构，实现数据建模、权限设计、业务流程与前台门户秒级闭环，大幅降本增效。',
      content: '【企业数字化中台发布会】\\n\\n新一代企业级业务管理与数据协作平台今日正式商用。',
      views: 3600,
      created_at: '2026-09-15'
    }
  ]

  const defaultArticlesJson = JSON.stringify(defaultArticles)

  return `<script setup lang="ts">
import { ref, onMounted } from 'vue'

definePageMeta({ layout: 'blank' })

const route = useRoute()
const id = String(route.params.id)

const PRESETS = ${defaultArticlesJson}
const initialMatch = PRESETS.find(p => String(p.id) === id) || PRESETS[0]

// 纯静态首屏：立即用内置静态数据秒显，杜绝骨架屏闪烁
const article = ref<any>(initialMatch)

useHead({
  title: computed(() => (article.value?.title ? article.value.title + ' - 详情' : '文章详情'))
})

onMounted(async () => {
  try {
    const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '')
    const res = await $fetch(base + '/api/public/cms/article/' + id) as any
    if (res && res.data) {
      article.value = res.data
    }
  } catch (e) {}
})
</script>

<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans antialiased">
    <header class="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur sticky top-0 z-30 px-6 py-4">
      <div class="max-w-4xl mx-auto flex items-center justify-between">
        <UButton label="返回官网首页" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" to="/cms" />
        <UButton label="管理登录" color="primary" variant="subtle" size="xs" to="/login" />
      </div>
    </header>

    <main class="flex-1 max-w-3xl w-full mx-auto p-6 sm:p-10 space-y-8">
      <article v-if="article" class="space-y-6">
        <div class="space-y-3 border-b border-neutral-800 pb-6">
          <UBadge color="primary" variant="subtle" size="sm">{{ article.category || '资讯' }}</UBadge>
          <h1 class="text-2xl sm:text-4xl font-extrabold text-white leading-tight">{{ article.title }}</h1>
          <div class="flex items-center gap-4 text-xs text-neutral-400 font-mono">
            <span>发布时间: {{ article.created_at ? article.created_at.slice(0, 10) : '2026-09-15' }}</span>
            <span>浏览量: {{ article.views }}</span>
          </div>
        </div>

        <div v-if="article.summary" class="p-4 bg-neutral-900 border-l-4 border-primary-500 rounded text-sm text-neutral-300 italic">
          {{ article.summary }}
        </div>

        <div class="text-neutral-200 leading-relaxed space-y-4 text-base whitespace-pre-wrap">
          {{ article.content || '（正文暂无内容）' }}
        </div>

        <div class="pt-8 border-t border-neutral-800 flex justify-between">
          <UButton label="返回官网" icon="i-lucide-arrow-left" to="/cms" color="neutral" variant="outline" size="sm" />
          <UButton label="预约就医/体验" icon="i-lucide-arrow-right" to="/login" color="primary" size="sm" />
        </div>
      </article>
    </main>
  </div>
</template>
`
}

function cmsArticleAdminPage(p: TenantPlan): string {
  void p
  return `<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'

const { get, post } = useUiApi()
const { push } = useNotify()

const rows = ref<any[]>([])
const drawer = reactive({ open: false, isNew: true, form: { id: 0, title: '', category: '新闻公告', summary: '', content: '', status: true } })

async function load() {
  try {
    const res = await get<any>('/cms_article/list', { page: 1, pageSize: 50 }).catch(() => null)
    if (res && res.list) rows.value = res.list
    else {
      const pRes = await get<any>('/public/cms/articles').catch(() => null)
      if (pRes && pRes.list) rows.value = pRes.list
    }
  } catch (e) {}
}

function openCreate() {
  drawer.isNew = true
  drawer.form = { id: 0, title: '', category: '新闻公告', summary: '', content: '', status: true }
  drawer.open = true
}

async function save() {
  if (!drawer.form.title) { push('请输入文章标题', 'error'); return }
  try {
    if (drawer.isNew) {
      await post('/cms_article/create', { ...drawer.form })
      push('文章发布成功', 'success')
    } else {
      await post('/cms_article/update', { ...drawer.form })
      push('文章更新成功', 'success')
    }
    drawer.open = false
    await load()
  } catch (e: any) {
    push(e?.message || '操作失败', 'error')
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold">官网文章管理</h2>
        <p class="text-xs text-muted">发布和管理在官网 ( /cms ) 上公开展示的资讯与内容动态</p>
      </div>
      <div class="flex gap-2">
        <UButton label="前往官网预览" icon="i-lucide-external-link" color="neutral" variant="outline" to="/cms" target="_blank" />
        <UButton label="发布新文章" icon="i-lucide-plus" color="primary" @click="openCreate" />
      </div>
    </div>

    <div class="rounded-lg border border-muted bg-elevated overflow-hidden">
      <UTable
        :data="rows"
        :columns="[
          { accessorKey: 'id', header: 'ID' },
          { accessorKey: 'title', header: '文章标题' },
          { accessorKey: 'category', header: '栏目分类' },
          { accessorKey: 'views', header: '浏览量' },
          { accessorKey: 'created_at', header: '发布时间' }
        ]"
      />
    </div>

    <USlideover v-model:open="drawer.open" :title="drawer.isNew ? '发布新文章' : '编辑文章'">
      <template #body>
        <div class="space-y-4 p-4">
          <UFormField label="文章标题 *">
            <UInput v-model="drawer.form.title" placeholder="输入文章标题" class="w-full" />
          </UFormField>
          <UFormField label="栏目分类">
            <UInput v-model="drawer.form.category" placeholder="新闻公告 / 行业动态 / 产品快讯" class="w-full" />
          </UFormField>
          <UFormField label="摘要简介">
            <UTextarea v-model="drawer.form.summary" placeholder="简短摘要..." :rows="2" class="w-full" />
          </UFormField>
          <UFormField label="正文内容">
            <UTextarea v-model="drawer.form.content" placeholder="输入正文内容..." :rows="8" class="w-full" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="取消" color="neutral" variant="outline" @click="drawer.open = false" />
          <UButton label="保存发布" color="primary" @click="save" />
        </div>
      </template>
    </USlideover>
  </div>
</template>
`
}


