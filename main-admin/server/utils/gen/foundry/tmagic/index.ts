import type { Foundry } from '../types'
import type { PageIntent, SiteIntent } from '../../../../../shared/intent'
import type { TenantPlan } from '../../types'
import { compileTmagicPage, type TmagicPageDsl } from './compiler'
import { tmagicMaterialFiles } from './materials'

/**
 * Foundry A: Tmagic 标准代工厂
 * 遵循代工厂契约，输入纯净 Page Intent 图纸，产出 tmagic DSL 与标准物料组件。
 */
export const tmagicFoundry: Foundry = {
  id: 'tmagic',
  label: 'Tmagic 代工厂 (标准版)',

  compilePage(page: PageIntent, ctx?: { tenant?: TenantPlan }): TmagicPageDsl {
    return compileTmagicPage(page, ctx)
  },

  emitFiles(site: SiteIntent, tenant: TenantPlan): Record<string, string> {
    const files: Record<string, string> = {}

    // 1. 发射未经任何引擎污染的 Page Intent 图纸资产 (人机共用真理源)
    files['app/intent/blueprint.json'] = JSON.stringify(site, null, 2)

    // 2. 将站点内所有 PageIntent 编译为标准的 tmagic 节点树结构
    const compiledDsl: Record<string, TmagicPageDsl> = {}
    for (const page of site.pages) {
      compiledDsl[page.id] = compileTmagicPage(page, { tenant })
    }
    files['app/data/tmagic-dsl.json'] = JSON.stringify(compiledDsl, null, 2)

    // 3. 产出 tmagic 专属标准物料包与运行时组件 (接通租户设计系统与主题)
    Object.assign(files, tmagicMaterialFiles(tenant?.theme))

    // 4. 为每个图纸页面发射极简轻量级承载页
    for (const page of site.pages) {
      const routePath = page.route || (page.id === 'home' || page.id === 'cms-home' ? '/cms' : `/cms/${page.id}`)
      const normalized = routePath.replace(/^\//, '')
      const pageFile = normalized.endsWith('.vue') ? `app/pages/${normalized}` : `app/pages/${normalized}/index.vue`

      files[pageFile] = `<template>
  <TmagicPage v-if="pageDsl" :dsl="pageDsl" />
  <div v-else class="p-12 text-center text-slate-400">页面图纸编译中...</div>
</template>

<script setup lang="ts">
import TmagicPage from '~/components/tmagic/TmagicPage.vue'
import dslData from '~/data/tmagic-dsl.json'

definePageMeta({ layout: 'blank' })

const pageId = '${page.id}'
const pageDsl = (dslData as any)[pageId] || null

useHead({
  title: pageDsl?.name || '${page.name || tenant.title}'
})
</script>
`
    }

    return files
  }
}
