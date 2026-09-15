export interface Station { name: string, icon: string, color: string, tag: string, key: string }

/** The nine stations, copied from the prototype's STATIONS + BORROW_TAGS. */
export const STATIONS: Station[] = [
  { key: 'model', name: '建模站', icon: '🏗️', color: '#007aff', tag: '借鉴：v0 自然语言建模 + 实时 schema 画布' },
  { key: 'capability', name: '能力库', icon: '🧩', color: '#5856d6', tag: '借鉴：Amplication plugin catalog + 参考实现库' },
  { key: 'design', name: '设计站', icon: '🎨', color: '#ff9500', tag: '借鉴：RuoYi 字段配置矩阵 + 组件实况预览' },
  { key: 'gen', name: '生成站', icon: '⚙️', color: '#ff9500', tag: '借鉴：v0 diff-first 迭代 + 真 git 版本时间线' },
  { key: 'logic', name: '逻辑站', icon: '🔌', color: '#34c759', tag: '借鉴：Amplication 生成/自定义代码分离 + hooks' },
  { key: 'seed', name: '数据站', icon: '🗄️', color: '#ff3b30', tag: '借鉴：JHipster faker 种子 + 列名启发式' },
  { key: 'verify', name: '验证站', icon: '✅', color: '#007aff', tag: '借鉴：Playwright 冒烟用例 + 跨站联动修复' },
  { key: 'preview', name: '预览站', icon: '👁️', color: '#5856d6', tag: '借鉴：v0 实况预览 + 浏览器网络面板' },
  { key: 'ai', name: 'AI创作', icon: '🤖', color: '#af52de', tag: '借鉴：spec-driven development + MCP/Skill 上下文' }
]

export const FIELD_TYPES = [
  { v: 'varchar', label: '单行文本' }, { v: 'text', label: '多行文本' }, { v: 'richtext', label: '富文本' },
  { v: 'int', label: '整数' }, { v: 'decimal', label: '小数' }, { v: 'money', label: '金额' },
  { v: 'date', label: '日期' }, { v: 'datetime', label: '日期时间' }, { v: 'bool', label: '开关' },
  { v: 'enum', label: '枚举/字典' }, { v: 'json', label: 'JSON' }, { v: 'fk', label: '外键' },
  { v: 'file', label: '附件' }, { v: 'image', label: '图片' }
]

/** 与 server/api/_lib.ts 的 COMPONENTS 同步：生成器没有的控件不能出现在选项里。 */
export const COMPONENTS = [
  'input', 'textarea', 'richtext', 'number', 'date', 'datetime', 'switch',
  'select', 'radio', 'checkbox', 'upload', 'image', 'remote-select', 'code'
]

/** 与 server/api/_lib.ts 的 QUERY_TYPES 同步。 */
export const QUERY_TYPES = [
  { v: 'none', label: '不作为条件' }, { v: 'eq', label: '等于' }, { v: 'ne', label: '不等于' },
  { v: 'like', label: '模糊匹配' }, { v: 'gt', label: '大于' }, { v: 'ge', label: '大于等于' },
  { v: 'lt', label: '小于' }, { v: 'le', label: '小于等于' }, { v: 'in', label: '包含 IN' },
  { v: 'range', label: '区间 BETWEEN' }, { v: 'notnull', label: '不为空' }
]

/** 与 server/api/_lib.ts 的 INDEX_TYPES 同步。 */
export const INDEX_TYPES = [
  { v: 'none', label: '无索引' }, { v: 'normal', label: '普通索引' },
  { v: 'unique', label: '唯一索引' }, { v: 'primary', label: '主键' }
]

/** 生成器里真实有分支的规则：email/phone/url/number 走正则，sensitive 走脱敏。 */
export const FIELD_RULES = [
  { v: '', label: '不校验' }, { v: 'email', label: '邮箱' }, { v: 'phone', label: '手机号' },
  { v: 'url', label: '链接' }, { v: 'number', label: '纯数字' }, { v: 'sensitive', label: '敏感字段（列表脱敏）' }
]

export const LOGIN_TPLS = [
  { v: 'split', name: '左右分屏', css: 'split' },
  { v: 'glass', name: '玻璃拟态', css: 'glass' },
  { v: 'macOS', name: 'macOS 用户位', css: 'macOS' },
  { v: 'terminal', name: '终端极客', css: 'terminal' },
  { v: 'hero', name: '全屏大图', css: 'hero' }
]
