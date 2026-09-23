import type { PageIntent, PageBlock } from '../../../../../shared/intent'
import { validateIntent } from '../../../../../shared/intent'
import type { TenantPlan } from '../../types'
import { MATERIAL_VARIANTS } from './materials'

export interface TmagicNode {
  id: string
  type: string
  name: string
  [key: string]: any
}

export interface TmagicPageDsl {
  id: string
  type: 'page'
  name: string
  route?: string
  items: TmagicNode[]
}

/**
 * Foundry A (Tmagic) 页面编译器：
 * 将引擎无关的 PageIntent 图纸单向编译为符合 tmagic 规范的标准节点树。
 * 
 * 严格门禁：编译前执行 validateIntent()，并对物料变体进行强校验（绝不静默回落）。
 */
export function compileTmagicPage(page: PageIntent, ctx?: { tenant?: TenantPlan }): TmagicPageDsl {
  const check = validateIntent(page)
  if (!check.valid) {
    throw new Error(`[Foundry:tmagic] 页面图纸 [${page.id}] 违反 Page Intent 硬约束，拒绝编译:\n  - ${check.errors.join('\n  - ')}`)
  }

  const items: TmagicNode[] = []

  for (let i = 0; i < page.blocks.length; i++) {
    const block = page.blocks[i]
    const nodeId = `${page.id}_${block.kind}_${i + 1}`

    switch (block.kind) {
      case 'header': {
        if (block.variant && !MATERIAL_VARIANTS.header.includes(block.variant as any)) {
          throw new Error(`[Foundry:tmagic] Header 物料不支持变体 "${block.variant}"，可用变体: ${MATERIAL_VARIANTS.header.join(', ')}`)
        }
        items.push({
          id: nodeId,
          type: 'tmagic-header',
          name: '顶栏导航',
          brand: block.brand,
          links: block.links || [],
          action: block.action,
          variant: block.variant || 'bar'
        })
        break
      }
      case 'hero': {
        if (block.variant && !MATERIAL_VARIANTS.hero.includes(block.variant as any)) {
          throw new Error(`[Foundry:tmagic] Hero 物料不支持变体 "${block.variant}"，可用变体: ${MATERIAL_VARIANTS.hero.join(', ')}`)
        }
        if (block.density && !MATERIAL_VARIANTS.density.includes(block.density as any)) {
          throw new Error(`[Foundry:tmagic] Hero 物料不支持密度 "${block.density}"，可用密度: ${MATERIAL_VARIANTS.density.join(', ')}`)
        }
        items.push({
          id: nodeId,
          type: 'tmagic-hero',
          name: '焦点大屏',
          eyebrow: block.eyebrow || '',
          title: block.title,
          text: block.text,
          stats: block.stats || [],
          action: block.action,
          variant: block.variant || 'centered',
          density: block.density || 'normal'
        })
        break
      }
      case 'section': {
        if (block.density && !MATERIAL_VARIANTS.density.includes(block.density as any)) {
          throw new Error(`[Foundry:tmagic] Section 物料不支持密度 "${block.density}"，可用密度: ${MATERIAL_VARIANTS.density.join(', ')}`)
        }
        if (block.body?.kind === 'featureGrid' && block.body.variant && !MATERIAL_VARIANTS.featureGrid.includes(block.body.variant as any)) {
          throw new Error(`[Foundry:tmagic] FeatureGrid 物料不支持变体 "${block.body.variant}"，可用变体: ${MATERIAL_VARIANTS.featureGrid.join(', ')}`)
        }
        items.push({
          id: nodeId,
          type: 'tmagic-section',
          name: block.title || '内容板块',
          title: block.title,
          subtitle: block.subtitle || '',
          body: block.body,
          density: block.density || 'normal'
        })
        break
      }
      case 'cta': {
        if (block.variant && !MATERIAL_VARIANTS.cta.includes(block.variant as any)) {
          throw new Error(`[Foundry:tmagic] CTA 物料不支持变体 "${block.variant}"，可用变体: ${MATERIAL_VARIANTS.cta.join(', ')}`)
        }
        items.push({
          id: nodeId,
          type: 'tmagic-cta',
          name: '行动呼吁',
          title: block.title,
          text: block.text,
          action: block.action,
          variant: block.variant || 'band'
        })
        break
      }
      case 'footer': {
        items.push({
          id: nodeId,
          type: 'tmagic-footer',
          name: '页脚信息',
          lines: block.lines || [],
          contact: block.contact
        })
        break
      }
      case 'tabbar': {
        items.push({
          id: nodeId,
          type: 'tmagic-tabbar',
          name: '底部导航栏',
          tabs: block.tabs,
          current: block.current
        })
        break
      }
      case 'overlayForm': {
        items.push({
          id: nodeId,
          type: 'tmagic-overlay-form',
          name: block.title || '动态收集表单',
          formId: block.id,
          title: block.title,
          subtitle: block.subtitle || '',
          fields: block.fields || [],
          submitText: block.submitText || '立即提交',
          cancelText: block.cancelText || '取消'
        })
        break
      }
    }
  }

  return {
    id: page.id,
    type: 'page',
    name: page.name,
    route: page.route,
    items
  }
}
