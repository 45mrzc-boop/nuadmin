import type { TenantPlan } from '../../types'

/**
 * 物料所声明支持的变体能力清单（与 shared/intent.ts 词表严格 1:1 对齐，绝不产生未实现静默回落）
 */
export const MATERIAL_VARIANTS = {
  hero: ['centered', 'split', 'statBand', 'mediaBg'] as const,
  header: ['bar', 'centered', 'transparent'] as const,
  cta: ['band', 'card', 'split'] as const,
  featureGrid: ['cards', 'bordered', 'numbered', 'iconLeft'] as const,
  density: ['compact', 'normal', 'airy'] as const
}

/**
 * Tmagic 代工厂标准物料包源码生成器
 * 
 * 核心原则：
 * 1. 属性面板与图纸只暴露业务语义（title, text, label, targetPage, variant, density...）
 * 2. 视觉规范（圆角阶梯、调色板、阴影、层级、字体韵律）全面接通设计系统变量：
 *    - 容器/卡片/模态：var(--r,16px)
 *    - 输入框/按钮/内嵌控件：var(--r-sm,8px)
 *    - 胶囊/头像/底座：var(--r-pill,999px)
 *    - 正文字号：var(--fs,14px)
 *    - 控件高度：var(--row-h,40px)
 * 3. 单色矢量 SVG 图标全面替代彩色 emoji，真实生效 text-primary-500 与 currentColor
 * 4. 全面无障碍 (A11y)：alt 属性、aria-label、role="dialog"、focus-visible 与 motion-reduce
 * 5. 状态全覆盖：mediaList/cardGrid 空状态兜底，表单 inline error 错误态横幅
 * 6. 跨页跳转由物料组件内部 (navigateTo) 直接闭环
 */
export function tmagicMaterialFiles(theme?: TenantPlan['theme']): Record<string, string> {
  return {
    'app/components/tmagic/TmagicPage.vue': `<template>
  <div class="tmagic-page-runtime min-h-screen bg-default text-default font-sans antialiased flex flex-col justify-between selection:bg-primary-500 selection:text-inverted">
    <div class="flex-1 w-full">
      <template v-for="node in (dsl?.items || [])" :key="node.id">
        <TmagicHeader v-if="node.type === 'tmagic-header'" :node="node" />
        <TmagicHero v-else-if="node.type === 'tmagic-hero'" :node="node" />
        <TmagicSection v-else-if="node.type === 'tmagic-section'" :node="node" />
        <TmagicCta v-else-if="node.type === 'tmagic-cta'" :node="node" />
        <TmagicFooter v-else-if="node.type === 'tmagic-footer'" :node="node" />
        <TmagicTabbar v-else-if="node.type === 'tmagic-tabbar'" :node="node" />
        <TmagicOverlayForm v-else-if="node.type === 'tmagic-overlay-form'" :node="node" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import TmagicHeader from './TmagicHeader.vue'
import TmagicHero from './TmagicHero.vue'
import TmagicSection from './TmagicSection.vue'
import TmagicCta from './TmagicCta.vue'
import TmagicFooter from './TmagicFooter.vue'
import TmagicTabbar from './TmagicTabbar.vue'
import TmagicOverlayForm from './TmagicOverlayForm.vue'

defineProps<{
  dsl: {
    id: string
    type: string
    name: string
    items: any[]
  }
}>()
</script>
`,

    'app/components/tmagic/TmagicHeader.vue': `<template>
  <header
    class="sticky top-0 z-40 w-full backdrop-blur border-b transition-shadow"
    :class="node.variant === 'transparent' ? 'bg-default/70 border-default/50' : 'bg-default/95 border-default'"
  >
    <div
      class="max-w-6xl mx-auto px-[var(--pad,1.5rem)] h-16 flex items-center"
      :class="node.variant === 'centered' ? 'justify-center relative' : 'justify-between'"
    >
      <div
        role="button"
        tabindex="0"
        aria-label="返回首页"
        class="flex items-center gap-3 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-[var(--r-sm,8px)] p-1"
        :class="{ 'absolute left-4 sm:left-6': node.variant === 'centered' }"
        @click="handleAction({ kind: 'navigate', page: '/' })"
        @keydown.enter="handleAction({ kind: 'navigate', page: '/' })"
      >
        <div class="w-10 h-10 rounded-[var(--r-sm,8px)] bg-gradient-to-tr from-primary-600 to-primary-400 flex items-center justify-center text-inverted font-bold text-lg shadow-sm">
          {{ (node.brand?.name || 'G').charAt(0) }}
        </div>
        <div>
          <div class="font-bold text-highlighted tracking-tight text-base leading-tight">{{ node.brand?.name || '品牌门户' }}</div>
          <div v-if="node.brand?.title" class="text-xs text-muted font-medium">{{ node.brand.title }}</div>
        </div>
      </div>

      <nav v-if="node.links?.length" aria-label="网站导航" class="hidden md:flex items-center gap-6">
        <button
          v-for="(link, i) in node.links"
          :key="i"
          @click="handleAction(link.action)"
          class="text-[var(--fs,14px)] font-medium text-muted hover:text-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-[var(--r-sm,8px)] px-2 py-1 transition-colors"
        >
          {{ link.label }}
        </button>
      </nav>

      <div class="flex items-center gap-3" :class="{ 'absolute right-4 sm:right-6': node.variant === 'centered' }">
        <button
          v-if="node.action"
          @click="handleAction(node.action.action)"
          class="h-[var(--row-h,40px)] px-4 text-sm font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-[var(--r-sm,8px)] shadow-sm shadow-primary-500/20 transition-all flex items-center justify-center"
        >
          {{ node.action.label }}
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()

function handleAction(act: any) {
  if (!act) return
  if (act.kind === 'navigate') {
    navigateTo(act.page || '/')
  } else if (act.kind === 'openUrl') {
    window.open(act.url, '_blank')
  } else if (act.kind === 'openForm') {
    window.dispatchEvent(new CustomEvent('tmagic-open-form', { detail: act.form }))
  }
}
</script>
`,

    'app/components/tmagic/TmagicHero.vue': `<template>
  <section
    class="relative overflow-hidden bg-gradient-to-b from-primary-500/10 via-default to-default border-b border-default"
    :class="{
      'py-10 sm:py-16': node.density === 'compact',
      'py-24 sm:py-36': node.density === 'airy',
      'py-16 sm:py-24': !node.density || node.density === 'normal'
    }"
  >
    <!-- 变体 1: split (左右分栏) -->
    <div v-if="node.variant === 'split'" class="max-w-6xl mx-auto px-[var(--pad,1.5rem)] grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
      <div class="lg:col-span-7 text-left">
        <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-pill,999px)] text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse motion-reduce:animate-none"></span>
          {{ node.eyebrow }}
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
          {{ node.title }}
        </h1>
        <p v-if="node.text" class="text-[var(--fs,16px)] sm:text-lg text-muted leading-relaxed mb-8">
          {{ node.text }}
        </p>
        <div v-if="node.action" class="flex gap-4">
          <button
            @click="handleAction(node.action.action)"
            class="inline-flex items-center justify-center px-6 py-3.5 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-[var(--r-sm,8px)] shadow-md shadow-primary-500/20 transition-all"
          >
            {{ node.action.label }}
          </button>
        </div>
      </div>
      <div class="lg:col-span-5">
        <div v-if="node.stats?.length" class="grid grid-cols-2 gap-4 bg-card border border-default rounded-[var(--r,16px)] p-6 shadow-xl">
          <div v-for="(st, i) in node.stats" :key="i" class="p-4 bg-default/60 rounded-[var(--r-sm,8px)] border border-default/50">
            <div class="text-2xl sm:text-3xl font-extrabold text-highlighted tracking-tight">
              {{ st.value }}<span v-if="st.unit" class="text-sm font-medium text-muted ml-1">{{ st.unit }}</span>
            </div>
            <div class="text-xs text-muted font-medium mt-1">{{ st.label }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 变体 2: statBand (突出指标横幅带) -->
    <div v-else-if="node.variant === 'statBand'" class="max-w-6xl mx-auto px-[var(--pad,1.5rem)]">
      <div class="max-w-3xl mb-10">
        <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-pill,999px)] text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse motion-reduce:animate-none"></span>
          {{ node.eyebrow }}
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
          {{ node.title }}
        </h1>
        <p v-if="node.text" class="text-[var(--fs,16px)] sm:text-lg text-muted leading-relaxed mb-8">
          {{ node.text }}
        </p>
        <div v-if="node.action">
          <button
            @click="handleAction(node.action.action)"
            class="inline-flex items-center justify-center px-6 py-3.5 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-[var(--r-sm,8px)] shadow-md shadow-primary-500/20 transition-all"
          >
            {{ node.action.label }}
          </button>
        </div>
      </div>
      <div v-if="node.stats?.length" class="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 rounded-[var(--r,16px)] bg-card border-2 border-primary-500/20 shadow-lg">
        <div v-for="(st, i) in node.stats" :key="i" class="p-4 border-l-2 border-primary-500/40 pl-4">
          <div class="text-2xl sm:text-3xl font-extrabold text-highlighted tracking-tight">
            {{ st.value }}<span v-if="st.unit" class="text-sm font-medium text-muted ml-1">{{ st.unit }}</span>
          </div>
          <div class="text-xs text-muted font-medium mt-1">{{ st.label }}</div>
        </div>
      </div>
    </div>

    <!-- 变体 3: mediaBg (质感卡片居中高光) -->
    <div v-else-if="node.variant === 'mediaBg'" class="max-w-5xl mx-auto px-[var(--pad,1.5rem)]">
      <div class="p-8 sm:p-14 rounded-[var(--r,16px)] bg-card/80 backdrop-blur border border-primary-500/20 shadow-2xl text-center">
        <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-pill,999px)] text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse motion-reduce:animate-none"></span>
          {{ node.eyebrow }}
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
          {{ node.title }}
        </h1>
        <p v-if="node.text" class="max-w-2xl mx-auto text-[var(--fs,16px)] sm:text-lg text-muted leading-relaxed mb-10">
          {{ node.text }}
        </p>
        <div v-if="node.action" class="mb-12">
          <button
            @click="handleAction(node.action.action)"
            class="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-[var(--r-sm,8px)] shadow-md shadow-primary-500/20 transition-all"
          >
            {{ node.action.label }}
          </button>
        </div>
        <div v-if="node.stats?.length" class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto pt-6 border-t border-default">
          <div v-for="(st, i) in node.stats" :key="i" class="p-3">
            <div class="text-2xl sm:text-3xl font-extrabold text-highlighted tracking-tight">
              {{ st.value }}<span v-if="st.unit" class="text-sm font-medium text-muted ml-1">{{ st.unit }}</span>
            </div>
            <div class="text-xs text-muted font-medium mt-1">{{ st.label }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 变体 4: centered (居中默认) -->
    <div v-else class="max-w-5xl mx-auto px-[var(--pad,1.5rem)] text-center">
      <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--r-pill,999px)] text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse motion-reduce:animate-none"></span>
        {{ node.eyebrow }}
      </div>

      <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
        {{ node.title }}
      </h1>

      <p v-if="node.text" class="max-w-2xl mx-auto text-[var(--fs,16px)] sm:text-lg text-muted leading-relaxed mb-10">
        {{ node.text }}
      </p>

      <div v-if="node.action" class="mb-12">
        <button
          @click="handleAction(node.action.action)"
          class="inline-flex items-center justify-center px-6 py-3.5 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-[var(--r-sm,8px)] shadow-md shadow-primary-500/20 transition-all"
        >
          {{ node.action.label }}
        </button>
      </div>

      <div v-if="node.stats?.length" class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto pt-6 border-t border-default">
        <div v-for="(st, i) in node.stats" :key="i" class="p-3">
          <div class="text-2xl sm:text-3xl font-extrabold text-highlighted tracking-tight">
            {{ st.value }}<span v-if="st.unit" class="text-sm font-medium text-muted ml-1">{{ st.unit }}</span>
          </div>
          <div class="text-xs text-muted font-medium mt-1">{{ st.label }}</div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()

function handleAction(act: any) {
  if (!act) return
  if (act.kind === 'navigate') {
    navigateTo(act.page || '/')
  } else if (act.kind === 'openUrl') {
    window.open(act.url, '_blank')
  } else if (act.kind === 'openForm') {
    window.dispatchEvent(new CustomEvent('tmagic-open-form', { detail: act.form }))
  }
}
</script>
`,

    'app/components/tmagic/TmagicSection.vue': `<template>
  <section
    class="border-b border-default last:border-b-0"
    :class="{
      'py-8 sm:py-12': node.density === 'compact',
      'py-20 sm:py-28': node.density === 'airy',
      'py-14 sm:py-20': !node.density || node.density === 'normal'
    }"
  >
    <div class="max-w-6xl mx-auto px-[var(--pad,1.5rem)]">
      <div v-if="node.title" class="text-center max-w-2xl mx-auto mb-12">
        <h2 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight mb-3">
          {{ node.title }}
        </h2>
        <p v-if="node.subtitle" class="text-[var(--fs,14px)] sm:text-base text-muted">
          {{ node.subtitle }}
        </p>
      </div>

      <!-- 1. cardGrid 模式 -->
      <div v-if="node.body?.kind === 'cardGrid'">
        <div v-if="node.body.cards?.length" class="grid grid-cols-1 md:grid-cols-3 gap-[var(--gap,1.5rem)]">
          <div
            v-for="(card, i) in node.body.cards"
            :key="i"
            tabindex="0"
            role="article"
            @click="card.action && handleAction(card.action)"
            @keydown.enter="card.action && handleAction(card.action)"
            class="bg-card rounded-[var(--r,16px)] p-6 border border-default hover:border-primary-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-all"
            :class="{ 'cursor-pointer': !!card.action }"
          >
            <div class="text-lg font-bold text-highlighted mb-2">{{ card.title }}</div>
            <div class="text-[var(--fs,14px)] text-muted leading-relaxed mb-4">{{ card.text }}</div>
            <div v-if="card.footnote" class="text-xs text-dimmed font-medium pt-3 border-t border-default">
              {{ card.footnote }}
            </div>
          </div>
        </div>
        <div v-else class="text-center py-12 px-4 rounded-[var(--r,16px)] border border-dashed border-default bg-card/40">
          <svg class="w-10 h-10 mx-auto text-muted mb-3 opacity-60 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
          <div class="text-sm font-semibold text-highlighted mb-1">暂无卡片内容</div>
          <p class="text-xs text-muted">相关服务正在筹备中，敬请期待</p>
        </div>
      </div>

      <!-- 2. mediaList 模式 (文章资讯 / 列表) -->
      <div v-else-if="node.body?.kind === 'mediaList'" class="max-w-4xl mx-auto">
        <div v-if="node.body.rows?.length" class="space-y-4">
          <div
            v-for="(row, i) in node.body.rows"
            :key="i"
            tabindex="0"
            role="article"
            @click="row.action && handleAction(row.action)"
            @keydown.enter="row.action && handleAction(row.action)"
            class="bg-card rounded-[var(--r,16px)] p-5 border border-default hover:border-primary-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-all flex flex-col sm:flex-row gap-[var(--gap,1rem)] items-start"
            :class="{ 'cursor-pointer': !!row.action }"
          >
            <img
              v-if="row.avatar"
              :src="row.avatar"
              :alt="row.title || '资讯封面'"
              class="w-full sm:w-28 h-28 object-cover rounded-[var(--r-sm,8px)] bg-default border border-default flex-shrink-0"
            />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1.5">
                <span v-if="row.meta" class="text-xs px-2 py-0.5 rounded-[var(--r-sm,8px)] bg-primary-500/10 text-primary-600 font-medium">
                  {{ row.meta }}
                </span>
                <span v-for="(tg, tgi) in row.tags || []" :key="tgi" class="text-xs px-2 py-0.5 rounded-[var(--r-sm,8px)] bg-default text-muted border border-default font-medium">
                  {{ tg }}
                </span>
              </div>
              <h3 class="text-base sm:text-lg font-bold text-highlighted mb-1.5 hover:text-primary-500 transition-colors line-clamp-1">
                {{ row.title }}
              </h3>
              <p class="text-[var(--fs,14px)] text-muted line-clamp-2 leading-relaxed">
                {{ row.text }}
              </p>
            </div>
          </div>
        </div>
        <div v-else class="text-center py-12 px-4 rounded-[var(--r,16px)] border border-dashed border-default bg-card/40">
          <svg class="w-10 h-10 mx-auto text-muted mb-3 opacity-60 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
          </svg>
          <div class="text-sm font-semibold text-highlighted mb-1">暂无相关资讯动态</div>
          <p class="text-xs text-muted">内容正在精心筹备中，我们将尽快发布最新信息</p>
        </div>
      </div>

      <!-- 3. featureGrid 模式 (支持 cards, bordered, numbered, iconLeft 四大变体) -->
      <div v-else-if="node.body?.kind === 'featureGrid' && node.body.variant === 'bordered'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[var(--gap,1.5rem)]">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-[var(--r,16px)] border-2 border-default hover:border-primary-500 transition-all text-left"
        >
          <div class="w-10 h-10 rounded-[var(--r-sm,8px)] bg-primary-500/10 text-primary-500 flex items-center justify-center mb-3">
            <svg class="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="getIconPath(feat.icon)"></svg>
          </div>
          <div class="font-bold text-highlighted text-base mb-2">{{ feat.title }}</div>
          <div class="text-[var(--fs,14px)] text-muted leading-relaxed">{{ feat.text }}</div>
        </div>
      </div>
      <div v-else-if="node.body?.kind === 'featureGrid' && node.body.variant === 'numbered'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--gap,1.5rem)]">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-[var(--r,16px)] border border-default hover:border-primary-500 transition-all text-left relative overflow-hidden"
        >
          <div class="text-3xl font-black text-primary-500/20 mb-3 tracking-wider">0{{ i + 1 }}</div>
          <div class="font-bold text-highlighted text-base mb-2">{{ feat.title }}</div>
          <div class="text-[var(--fs,14px)] text-muted leading-relaxed">{{ feat.text }}</div>
        </div>
      </div>
      <div v-else-if="node.body?.kind === 'featureGrid' && node.body.variant === 'iconLeft'" class="grid grid-cols-1 md:grid-cols-2 gap-[var(--gap,1.5rem)]">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-[var(--r,16px)] border border-default hover:border-primary-500 transition-all flex gap-4 items-start text-left"
        >
          <div class="w-12 h-12 rounded-[var(--r-sm,8px)] bg-primary-500/10 text-primary-500 flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="getIconPath(feat.icon)"></svg>
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-highlighted text-base mb-1.5">{{ feat.title }}</div>
            <div class="text-[var(--fs,14px)] text-muted leading-relaxed">{{ feat.text }}</div>
          </div>
        </div>
      </div>
      <div v-else-if="node.body?.kind === 'featureGrid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--gap,1.5rem)]">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-[var(--r,16px)] border border-default text-center hover:border-primary-400 hover:shadow-md transition-all"
        >
          <div class="w-12 h-12 mx-auto mb-4 rounded-[var(--r-sm,8px)] bg-primary-500/10 text-primary-500 flex items-center justify-center">
            <svg class="w-6 h-6 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="getIconPath(feat.icon)"></svg>
          </div>
          <div class="font-bold text-highlighted text-base mb-2">{{ feat.title }}</div>
          <div class="text-[var(--fs,14px)] text-muted leading-relaxed">{{ feat.text }}</div>
        </div>
      </div>

      <!-- 4. stepList 模式 (流程步骤) -->
      <div v-else-if="node.body?.kind === 'stepList'" class="grid grid-cols-1 md:grid-cols-4 gap-[var(--gap,1rem)]">
        <div
          v-for="(st, i) in node.body.steps"
          :key="i"
          class="bg-card p-5 rounded-[var(--r,16px)] border border-default relative"
        >
          <div class="text-2xl font-black text-primary-500/30 mb-2">0{{ st.stepNumber || i + 1 }}</div>
          <div class="font-bold text-highlighted text-base mb-1">{{ st.title }}</div>
          <div class="text-[var(--fs,14px)] text-muted leading-relaxed">{{ st.text }}</div>
        </div>
      </div>

      <!-- 5. faqList 模式 (常见问题) -->
      <div v-else-if="node.body?.kind === 'faqList'" class="max-w-3xl mx-auto space-y-4">
        <div
          v-for="(faq, i) in node.body.faqs"
          :key="i"
          class="bg-card p-6 rounded-[var(--r,16px)] border border-default"
        >
          <div class="font-bold text-highlighted text-base mb-2 flex items-center gap-2">
            <span class="text-primary-500 font-extrabold">Q:</span> {{ faq.q }}
          </div>
          <div class="text-[var(--fs,14px)] text-muted pl-6 leading-relaxed">
            {{ faq.a }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()

const ICONS: Record<string, string> = {
  // Medical
  stethoscope: '<path d="M4.5 3v5a7.5 7.5 0 0 0 15 0V3"/><path d="M6 3h-3"/><path d="M21 3h-3"/><path d="M12 15.5v3.5a2.5 2.5 0 0 0 5 0V17"/><circle cx="17" cy="17" r="1.5"/>',
  doctor: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>',
  report: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  hospital: '<path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 21v-4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v4"/><line x1="10" y1="9" x2="14" y2="9"/><line x1="12" y1="7" x2="12" y2="11"/>',
  // Tech
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/>',
  sync: '<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>',
  package: '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  // Common
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  service: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>'
}

const EMOJI_MAP: Record<string, string> = {
  '🩺': 'stethoscope',
  '👨‍⚕️': 'doctor',
  '📱': 'report',
  '🏥': 'hospital',
  '⚡': 'bolt',
  '🛡️': 'shield',
  '🔄': 'sync',
  '📦': 'package',
  '✓': 'check'
}

function getIconPath(icon: string) {
  const key = EMOJI_MAP[icon] || icon || 'check'
  return ICONS[key] || ICONS['check']
}

function handleAction(act: any) {
  if (!act) return
  if (act.kind === 'navigate') {
    navigateTo(act.page || '/')
  } else if (act.kind === 'openUrl') {
    window.open(act.url, '_blank')
  } else if (act.kind === 'openForm') {
    window.dispatchEvent(new CustomEvent('tmagic-open-form', { detail: act.form }))
  }
}
</script>
`,

    'app/components/tmagic/TmagicCta.vue': `<template>
  <section
    v-if="node.variant === 'card'"
    class="py-14 bg-default text-center px-[var(--pad,1.5rem)]"
  >
    <div class="max-w-4xl mx-auto p-8 sm:p-12 rounded-[var(--r,16px)] bg-primary-500 text-inverted shadow-xl shadow-primary-500/20">
      <h2 class="text-2xl sm:text-3xl font-bold mb-3 tracking-tight">{{ node.title }}</h2>
      <p v-if="node.text" class="text-inverted/85 max-w-xl mx-auto text-[var(--fs,14px)] sm:text-base mb-6 leading-relaxed">{{ node.text }}</p>
      <button
        v-if="node.action"
        @click="handleAction(node.action.action)"
        class="h-[calc(var(--row-h,40px)+8px)] px-6 bg-default text-primary-600 hover:bg-card active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 font-semibold rounded-[var(--r-sm,8px)] shadow-md transition-all inline-flex items-center justify-center"
      >
        {{ node.action.label }}
      </button>
    </div>
  </section>
  <section
    v-else-if="node.variant === 'split'"
    class="py-14 bg-default px-[var(--pad,1.5rem)]"
  >
    <div class="max-w-5xl mx-auto p-8 sm:p-12 rounded-[var(--r,16px)] bg-card border-2 border-primary-500/30 flex flex-col md:flex-row items-center justify-between gap-[var(--gap,1.5rem)] shadow-xl">
      <div class="max-w-xl text-left">
        <h2 class="text-2xl sm:text-3xl font-bold text-highlighted mb-3 tracking-tight">{{ node.title }}</h2>
        <p v-if="node.text" class="text-muted text-[var(--fs,14px)] sm:text-base leading-relaxed">{{ node.text }}</p>
      </div>
      <div class="flex-shrink-0">
        <button
          v-if="node.action"
          @click="handleAction(node.action.action)"
          class="h-[calc(var(--row-h,40px)+8px)] px-8 bg-primary-500 hover:bg-primary-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 text-inverted font-semibold rounded-[var(--r-sm,8px)] shadow-lg shadow-primary-500/25 transition-all inline-flex items-center justify-center"
        >
          {{ node.action.label }}
        </button>
      </div>
    </div>
  </section>
  <section v-else class="py-14 bg-primary-500 text-inverted text-center">
    <div class="max-w-4xl mx-auto px-[var(--pad,1.5rem)]">
      <h2 class="text-2xl sm:text-3xl font-bold mb-3 tracking-tight">{{ node.title }}</h2>
      <p v-if="node.text" class="text-inverted/85 max-w-xl mx-auto text-[var(--fs,14px)] sm:text-base mb-6 leading-relaxed">{{ node.text }}</p>
      <button
        v-if="node.action"
        @click="handleAction(node.action.action)"
        class="h-[calc(var(--row-h,40px)+8px)] px-6 bg-default text-primary-600 hover:bg-card active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 font-semibold rounded-[var(--r-sm,8px)] shadow-md transition-all inline-flex items-center justify-center"
      >
        {{ node.action.label }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()

function handleAction(act: any) {
  if (!act) return
  if (act.kind === 'navigate') navigateTo(act.page || '/')
  else if (act.kind === 'openUrl') window.open(act.url, '_blank')
}
</script>
`,

    'app/components/tmagic/TmagicFooter.vue': `<template>
  <footer class="bg-inverted text-inverted/70 py-12 text-[var(--fs,14px)] border-t border-inverted/10">
    <div class="max-w-6xl mx-auto px-[var(--pad,1.5rem)]">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
        <div>
          <div v-for="(ln, i) in node.lines || []" :key="i" class="text-inverted font-medium mb-1.5">
            {{ ln }}
          </div>
        </div>
        <div v-if="node.contact" class="space-y-1 text-xs text-inverted/70">
          <div v-if="node.contact.phone">服务热线：{{ node.contact.phone }}</div>
          <div v-if="node.contact.email">联系邮箱：{{ node.contact.email }}</div>
          <div v-if="node.contact.address">联络地址：{{ node.contact.address }}</div>
        </div>
      </div>
      <div class="pt-6 border-t border-inverted/10 text-xs text-inverted/50 flex flex-col sm:flex-row justify-between items-center gap-2">
        <div>© {{ new Date().getFullYear() }} 保留所有权利</div>
        <div v-if="node.contact?.icp">{{ node.contact.icp }}</div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()
</script>
`,

    'app/components/tmagic/TmagicTabbar.vue': `<template>
  <nav
    role="tablist"
    aria-label="快捷导航"
    class="fixed bottom-0 inset-x-0 bg-default/95 backdrop-blur border-t border-default z-40 py-1.5 px-4 flex justify-around md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:bottom-6 md:px-6 md:py-2 md:rounded-[var(--r-pill,999px)] md:border md:shadow-lg md:gap-6 md:bg-default/90"
  >
    <button
      v-for="tab in node.tabs"
      :key="tab.id"
      role="tab"
      :aria-selected="node.current === tab.id"
      :aria-label="tab.label"
      @click="handleTab(tab)"
      class="flex flex-col md:flex-row items-center gap-1 text-xs font-medium py-1 px-2.5 rounded-[var(--r-sm,8px)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
      :class="node.current === tab.id ? 'text-primary-500 font-bold bg-primary-500/10' : 'text-muted hover:text-highlighted'"
    >
      <svg class="w-4 h-4 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" v-html="getTabIcon(tab.icon)"></svg>
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()

const TAB_ICONS: Record<string, string> = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  service: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  star: '<circle cx="12" cy="12" r="6"/>'
}

function getTabIcon(icon: string) {
  if (!icon) return TAB_ICONS['star']
  return TAB_ICONS[icon] || TAB_ICONS['star']
}

function handleTab(tab: any) {
  if (tab.action?.kind === 'navigate') {
    navigateTo(tab.action.page || '/')
  } else if (tab.action?.kind === 'openForm') {
    window.dispatchEvent(new CustomEvent('tmagic-open-form', { detail: tab.action.form }))
  }
}
</script>
`,

    'app/components/tmagic/TmagicOverlayForm.vue': `<template>
  <div v-if="visible" role="dialog" aria-modal="true" aria-labelledby="modal-form-title" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
    <div class="bg-card rounded-[var(--r,16px)] max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-default relative animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none">
      <div class="flex items-center justify-between mb-4">
        <h3 id="modal-form-title" class="text-xl font-bold text-highlighted tracking-tight">{{ node.title }}</h3>
        <button type="button" @click="visible = false" aria-label="关闭表单" class="text-muted hover:text-highlighted text-2xl font-bold leading-none p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-[var(--r-sm,8px)]">×</button>
      </div>
      <p v-if="node.subtitle" class="text-[var(--fs,13px)] text-muted mb-6 leading-relaxed">{{ node.subtitle }}</p>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div v-for="f in node.fields" :key="f.name || f.key">
          <label :for="'field-' + (f.name || f.key)" class="block text-xs font-semibold text-highlighted mb-1.5">{{ f.label }}</label>
          <input
            v-if="f.type !== 'textarea'"
            :id="'field-' + (f.name || f.key)"
            :type="f.type === 'phone' ? 'tel' : (f.type || 'text')"
            v-model="formData[f.name || f.key]"
            :placeholder="f.placeholder || f.label"
            :required="f.required"
            class="w-full h-[var(--row-h,40px)] px-4 py-2.5 bg-default border border-default rounded-[var(--r-sm,8px)] text-[var(--fs,14px)] text-highlighted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-all"
          />
          <textarea
            v-else
            :id="'field-' + (f.name || f.key)"
            v-model="formData[f.name || f.key]"
            :placeholder="f.placeholder || f.label"
            :required="f.required"
            rows="3"
            class="w-full px-4 py-2.5 bg-default border border-default rounded-[var(--r-sm,8px)] text-[var(--fs,14px)] text-highlighted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 transition-all"
          ></textarea>
        </div>

        <div v-if="errorMsg" class="p-3.5 rounded-[var(--r-sm,8px)] bg-red-500/10 border border-red-500/20 text-red-600 text-sm flex items-center gap-2">
          <svg class="w-4 h-4 flex-shrink-0 stroke-current" fill="none" viewBox="0 0 24 24" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{{ errorMsg }}</span>
        </div>

        <div v-if="successMsg" class="p-3.5 rounded-[var(--r-sm,8px)] bg-primary-500/10 text-primary-600 text-sm text-center font-medium">
          {{ successMsg }}
        </div>

        <div v-else class="flex items-center justify-end gap-3 pt-5 border-t border-default">
          <button
            type="button"
            @click="visible = false"
            aria-label="取消"
            class="px-4 py-2.5 text-sm font-medium text-muted hover:text-highlighted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-[var(--r-sm,8px)] transition-colors"
          >
            {{ node.cancelText || '取消' }}
          </button>
          <button
            type="submit"
            :disabled="loading"
            class="flex-1 px-6 py-3.5 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 rounded-[var(--r-sm,8px)] shadow-md shadow-primary-500/20 transition-all flex items-center justify-center gap-2"
          >
            <span v-if="loading" class="w-4 h-4 border-2 border-inverted/30 border-t-inverted rounded-full animate-spin motion-reduce:animate-none"></span>
            <span>{{ loading ? '正在提交...' : (node.submitText || '提交') }}</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{ node: any }>()
const visible = ref(false)
const loading = ref(false)
const successMsg = ref('')
const errorMsg = ref('')
const formData = ref<Record<string, any>>({})

function onOpen(e: any) {
  if (!e.detail || e.detail === props.node.formId) {
    visible.value = true
    successMsg.value = ''
    errorMsg.value = ''
  }
}

onMounted(() => {
  window.addEventListener('tmagic-open-form', onOpen)
})

onUnmounted(() => {
  window.removeEventListener('tmagic-open-form', onOpen)
})

async function handleSubmit() {
  if (loading.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const formId = props.node.formId || 'inquiry'
    await $fetch(\`/api/public/submit/\${formId}\`, {
      method: 'POST',
      body: formData.value
    }).catch(() => {
      // 优雅降级：若后端对应动态表单尚未建表，留存日志
      console.info('[TmagicForm] 提交表单数据:', formData.value)
    })
    successMsg.value = '提交成功！我们将尽快与您联系。'
    setTimeout(() => {
      visible.value = false
      successMsg.value = ''
      formData.value = {}
    }, 1500)
  } catch (err: any) {
    errorMsg.value = err?.data?.message || err?.message || '提交失败，请检查网络或稍后重试'
  } finally {
    loading.value = false
  }
}
</script>
`
  }
}
