/**
 * GenPlus 页面意图图纸规范 (Page Intent Schema)
 * 
 * 核心哲学：引擎无关的声明式中间层 (Engine-Agnostic Blueprint)
 * 描述「有哪些页面、每页包含哪些区块、什么展示顺序、每个动作的业务语义是什么」。
 * 
 * 严格执行四大禁令：
 * 1. 严禁样式属性与单位（px, rem, %, 颜色色值, 圆角, 间距）
 * 2. 严禁布局引擎规则（flex, grid, position, z-index）
 * 3. 严禁引擎私有节点类型（container, text, MPage 等）
 * 4. 严禁引擎私有动作对象（{ actionType: 'comp', ... } 等）
 */

/** 动作意图：声明发生什么业务行为，绝不声明底层实现 */
export type PageAction =
  | { kind: 'openForm'; form: string }
  | { kind: 'navigate'; page: string }
  | { kind: 'openUrl'; url: string }

export interface PageCta {
  label: string
  action: PageAction
}

export interface PageStat {
  label: string
  value: string
  unit?: string
}

export interface PageFormField {
  key: string
  label: string
  type: 'text' | 'tel' | 'email' | 'date' | 'select' | 'textarea'
  placeholder?: string
  required?: boolean
  options?: Array<{ label: string; value: string }>
}

/** 呈现模式原语（必须使用展示模式名称，严禁使用领域名词如 deptGrid） */
export type SectionBody =
  | {
      kind: 'cardGrid'
      cards: Array<{
        title: string
        text: string
        footnote?: string
        action?: PageAction
      }>
    }
  | {
      kind: 'mediaList'
      rows: Array<{
        avatar?: string
        title: string
        meta?: string
        text: string
        tags?: string[]
        rating?: string
        action?: PageAction
      }>
    }
  | {
      kind: 'featureGrid'
      features: Array<{
        title: string
        text: string
        icon?: string
      }>
    }
  | {
      kind: 'stepList'
      steps: Array<{
        title: string
        text: string
        stepNumber?: number
      }>
    }
  | {
      kind: 'faqList'
      faqs: Array<{
        q: string
        a: string
      }>
    }

/** 顶级页面区块类型 */
export type PageBlock =
  | {
      kind: 'header'
      brand: { name: string; title?: string; logo?: string }
      links?: Array<{ label: string; action: PageAction }>
      action?: PageCta
    }
  | {
      kind: 'hero'
      eyebrow?: string
      title: string
      text: string
      stats?: PageStat[]
      action?: PageCta
    }
  | {
      kind: 'section'
      title: string
      subtitle?: string
      body: SectionBody
    }
  | {
      kind: 'cta'
      title: string
      text: string
      action: PageCta
    }
  | {
      kind: 'footer'
      lines: string[]
      contact?: {
        phone?: string
        email?: string
        address?: string
        icp?: string
      }
    }
  | {
      kind: 'tabbar'
      tabs: Array<{
        id: string
        label: string
        icon?: string
        action: PageAction
      }>
      current: string
    }
  | {
      kind: 'overlayForm'
      id: string
      title: string
      subtitle?: string
      fields: PageFormField[]
      submitText: string
      cancelText: string
    }

/** 单页面意图图纸 */
export interface PageIntent {
  id: string
  name: string
  route?: string
  blocks: PageBlock[]
}

/** 站点级多页面意图集合 */
export interface SiteIntent {
  siteName?: string
  pages: PageIntent[]
}

/** 违禁关键词黑名单检测正则 */
const STYLE_KEYWORDS_REGEX = /(?:\d+(?:\.\d+)?)?(px|rem|em|vh|vw)\b|#[0-9a-fA-F]{3,8}\b|\b(rgb\(|rgba\(|hsl\(|flex|grid|position|absolute|relative|fixed|sticky|z-index|margin|padding|border-radius|font-size)\b/i
const FORBIDDEN_NODE_TYPES = new Set(['container', 'text', 'mpage', 'mnode', 'mcomponent', 'mcontainer'])
const VALID_ACTION_KINDS = new Set(['openForm', 'navigate', 'openUrl'])
const VALID_BLOCK_KINDS = new Set(['header', 'hero', 'section', 'cta', 'footer', 'tabbar', 'overlayForm'])
const VALID_BODY_KINDS = new Set(['cardGrid', 'mediaList', 'featureGrid', 'stepList', 'faqList'])

/**
 * 校验页面意图是否遵守硬约束（四大禁令门禁）
 */
export function validateIntent(target: PageIntent | SiteIntent): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const pages: PageIntent[] = 'pages' in target ? target.pages : [target]

  for (const page of pages) {
    if (!page.id || !page.name || !Array.isArray(page.blocks)) {
      errors.push(`页面 [${page.id || 'unknown'}] 必须包含 id、name 以及 blocks 数组`)
      continue
    }

    for (let i = 0; i < page.blocks.length; i++) {
      const block = page.blocks[i]
      const loc = `页面 [${page.id}] 第 ${i + 1} 个区块`

      if (!block || !block.kind) {
        errors.push(`${loc} 缺少 kind 标识`)
        continue
      }

      if (!VALID_BLOCK_KINDS.has(block.kind)) {
        errors.push(`${loc} kind '${block.kind}' 不在标准词表中`)
      }

      // 深度检查对象是否包含样式、引擎私有属性
      checkDeepConstraint(block, loc, errors)

      // Section 区块单独检查 body
      if (block.kind === 'section') {
        if (!block.body || !VALID_BODY_KINDS.has(block.body.kind)) {
          errors.push(`${loc} 的 body.kind 必须为 ${Array.from(VALID_BODY_KINDS).join(', ')} 之一`)
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

function checkDeepConstraint(val: unknown, path: string, errors: string[]): void {
  if (!val || typeof val !== 'object') return

  if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      checkDeepConstraint(val[i], `${path}[${i}]`, errors)
    }
    return
  }

  const obj = val as Record<string, any>

  // 1. 严禁引擎私有动作与属性
  if ('actionType' in obj || 'method' in obj && 'to' in obj) {
    errors.push(`${path} 违禁包含了引擎私有动作结构 (actionType/to/method)，必须改为业务意图 { kind: 'navigate', ... }`)
  }

  // 2. 严禁引擎私有节点名（排除表单字段里的控件类型）
  if (typeof obj.type === 'string' && FORBIDDEN_NODE_TYPES.has(obj.type.toLowerCase())) {
    const isFormField = ('key' in obj || 'name' in obj) && 'label' in obj
    if (!isFormField) {
      errors.push(`${path} 违禁包含了引擎私有节点类型 '${obj.type}'`)
    }
  }

  // 3. 检查 Action 合法性
  if (obj.kind && typeof obj.kind === 'string' && (obj.form || obj.page || obj.url)) {
    if (!VALID_ACTION_KINDS.has(obj.kind)) {
      errors.push(`${path} 包含了无效的 action kind '${obj.kind}'`)
    }
  }

  // 4. 递归检查 key 与字符串 value 是否带有样式单位或布局关键词
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      // 如果 key 是 class, style, color, width, height, padding, margin 等
      if (/^(style|color|width|height|padding|margin|radius|font|flex|grid|position|zIndex)$/i.test(k)) {
        errors.push(`${path}.${k} 违禁包含了视觉样式字段`)
      }
      // 检查字符串值中是否显式带上了 px, rem 等单位或色值
      if (STYLE_KEYWORDS_REGEX.test(v) && !/^(text|name|title|summary|content|description|q|a)$/i.test(k)) {
        errors.push(`${path}.${k} 值 '${v}' 包含违禁样式关键字或单位`)
      }
    } else if (typeof v === 'object') {
      checkDeepConstraint(v, `${path}.${k}`, errors)
    }
  }
}
