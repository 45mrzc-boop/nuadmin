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
 * 2. 视觉规范（圆角、调色板、阴影、层级、字体韵律）全面接通 B 侧设计系统，使用语义 Token (bg-default, bg-card, text-highlighted, text-muted, bg-primary-500 等)
 * 3. 跨页跳转由物料组件内部 (navigateTo) 直接闭环，不依赖引擎通用动作
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
      class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center"
      :class="node.variant === 'centered' ? 'justify-center relative' : 'justify-between'"
    >
      <div
        class="flex items-center gap-3 cursor-pointer"
        :class="{ 'absolute left-4 sm:left-6': node.variant === 'centered' }"
        @click="handleAction({ kind: 'navigate', page: '/' })"
      >
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary-600 to-primary-400 flex items-center justify-center text-inverted font-bold text-lg shadow-sm">
          {{ (node.brand?.name || 'G').charAt(0) }}
        </div>
        <div>
          <div class="font-bold text-highlighted tracking-tight text-base leading-tight">{{ node.brand?.name || '品牌门户' }}</div>
          <div v-if="node.brand?.title" class="text-xs text-muted font-medium">{{ node.brand.title }}</div>
        </div>
      </div>

      <nav v-if="node.links?.length" class="hidden md:flex items-center gap-6">
        <button
          v-for="(link, i) in node.links"
          :key="i"
          @click="handleAction(link.action)"
          class="text-sm font-medium text-muted hover:text-primary-500 transition-colors"
        >
          {{ link.label }}
        </button>
      </nav>

      <div class="flex items-center gap-3" :class="{ 'absolute right-4 sm:right-6': node.variant === 'centered' }">
        <button
          v-if="node.action"
          @click="handleAction(node.action.action)"
          class="px-4 py-2 text-sm font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 rounded-lg shadow-sm shadow-primary-500/20 transition-all"
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
    <div v-if="node.variant === 'split'" class="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
      <div class="lg:col-span-7 text-left">
        <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
          {{ node.eyebrow }}
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
          {{ node.title }}
        </h1>
        <p v-if="node.text" class="text-base sm:text-lg text-muted leading-relaxed mb-8">
          {{ node.text }}
        </p>
        <div v-if="node.action" class="flex gap-4">
          <button
            @click="handleAction(node.action.action)"
            class="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 rounded-xl shadow-md shadow-primary-500/20 transition-all"
          >
            {{ node.action.label }}
          </button>
        </div>
      </div>
      <div class="lg:col-span-5">
        <div v-if="node.stats?.length" class="grid grid-cols-2 gap-4 bg-card border border-default rounded-3xl p-6 shadow-xl">
          <div v-for="(st, i) in node.stats" :key="i" class="p-4 bg-default/60 rounded-2xl border border-default/50">
            <div class="text-2xl sm:text-3xl font-extrabold text-highlighted tracking-tight">
              {{ st.value }}<span v-if="st.unit" class="text-sm font-medium text-muted ml-1">{{ st.unit }}</span>
            </div>
            <div class="text-xs text-muted font-medium mt-1">{{ st.label }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 变体 2: statBand (突出指标横幅带) -->
    <div v-else-if="node.variant === 'statBand'" class="max-w-6xl mx-auto px-4 sm:px-6">
      <div class="max-w-3xl mb-10">
        <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
          {{ node.eyebrow }}
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
          {{ node.title }}
        </h1>
        <p v-if="node.text" class="text-base sm:text-lg text-muted leading-relaxed mb-8">
          {{ node.text }}
        </p>
        <div v-if="node.action">
          <button
            @click="handleAction(node.action.action)"
            class="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 rounded-xl shadow-md shadow-primary-500/20 transition-all"
          >
            {{ node.action.label }}
          </button>
        </div>
      </div>
      <div v-if="node.stats?.length" class="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 rounded-2xl bg-card border-2 border-primary-500/20 shadow-lg">
        <div v-for="(st, i) in node.stats" :key="i" class="p-4 border-l-2 border-primary-500/40 pl-4">
          <div class="text-2xl sm:text-3xl font-extrabold text-highlighted tracking-tight">
            {{ st.value }}<span v-if="st.unit" class="text-sm font-medium text-muted ml-1">{{ st.unit }}</span>
          </div>
          <div class="text-xs text-muted font-medium mt-1">{{ st.label }}</div>
        </div>
      </div>
    </div>

    <!-- 变体 3: mediaBg (质感卡片居中高光) -->
    <div v-else-if="node.variant === 'mediaBg'" class="max-w-5xl mx-auto px-4 sm:px-6">
      <div class="p-8 sm:p-14 rounded-3xl bg-card/80 backdrop-blur border border-primary-500/20 shadow-2xl text-center">
        <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
          {{ node.eyebrow }}
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
          {{ node.title }}
        </h1>
        <p v-if="node.text" class="max-w-2xl mx-auto text-base sm:text-lg text-muted leading-relaxed mb-10">
          {{ node.text }}
        </p>
        <div v-if="node.action" class="mb-12">
          <button
            @click="handleAction(node.action.action)"
            class="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 rounded-xl shadow-md shadow-primary-500/20 transition-all"
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
    <div v-else class="max-w-5xl mx-auto px-4 sm:px-6 text-center">
      <div v-if="node.eyebrow" class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary-500/10 text-primary-600 mb-6 ring-1 ring-primary-500/20">
        <span class="w-1.5 h-1.5 rounded-full bg-primary-500 animate-pulse"></span>
        {{ node.eyebrow }}
      </div>

      <h1 class="text-3xl sm:text-5xl font-extrabold text-highlighted tracking-tight leading-tight sm:leading-tight mb-6">
        {{ node.title }}
      </h1>

      <p v-if="node.text" class="max-w-2xl mx-auto text-base sm:text-lg text-muted leading-relaxed mb-10">
        {{ node.text }}
      </p>

      <div v-if="node.action" class="mb-12">
        <button
          @click="handleAction(node.action.action)"
          class="inline-flex items-center justify-center px-6 py-3 text-base font-semibold text-inverted bg-primary-500 hover:bg-primary-600 active:scale-95 rounded-xl shadow-md shadow-primary-500/20 transition-all"
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
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
      <div v-if="node.title" class="text-center max-w-2xl mx-auto mb-12">
        <h2 class="text-2xl sm:text-3xl font-bold text-highlighted tracking-tight mb-3">
          {{ node.title }}
        </h2>
        <p v-if="node.subtitle" class="text-sm sm:text-base text-muted">
          {{ node.subtitle }}
        </p>
      </div>

      <!-- 1. cardGrid 模式 -->
      <div v-if="node.body?.kind === 'cardGrid'" class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div
          v-for="(card, i) in node.body.cards"
          :key="i"
          @click="card.action && handleAction(card.action)"
          class="bg-card rounded-2xl p-6 border border-default hover:border-primary-500 hover:shadow-lg transition-all"
          :class="{ 'cursor-pointer': !!card.action }"
        >
          <div class="text-lg font-bold text-highlighted mb-2">{{ card.title }}</div>
          <div class="text-sm text-muted leading-relaxed mb-4">{{ card.text }}</div>
          <div v-if="card.footnote" class="text-xs text-dimmed font-medium pt-3 border-t border-default">
            {{ card.footnote }}
          </div>
        </div>
      </div>

      <!-- 2. mediaList 模式 (文章资讯 / 列表) -->
      <div v-else-if="node.body?.kind === 'mediaList'" class="space-y-4 max-w-4xl mx-auto">
        <div
          v-for="(row, i) in node.body.rows"
          :key="i"
          @click="row.action && handleAction(row.action)"
          class="bg-card rounded-2xl p-5 border border-default hover:border-primary-500 hover:shadow-md transition-all flex flex-col sm:flex-row gap-4 items-start"
          :class="{ 'cursor-pointer': !!row.action }"
        >
          <img
            v-if="row.avatar"
            :src="row.avatar"
            class="w-full sm:w-28 h-28 object-cover rounded-xl bg-default border border-default flex-shrink-0"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1.5">
              <span v-if="row.meta" class="text-xs px-2 py-0.5 rounded bg-primary-500/10 text-primary-600 font-medium">
                {{ row.meta }}
              </span>
              <span v-for="(tg, tgi) in row.tags || []" :key="tgi" class="text-xs px-2 py-0.5 rounded bg-default text-muted border border-default font-medium">
                {{ tg }}
              </span>
            </div>
            <h3 class="text-base sm:text-lg font-bold text-highlighted mb-1.5 hover:text-primary-500 transition-colors line-clamp-1">
              {{ row.title }}
            </h3>
            <p class="text-sm text-muted line-clamp-2 leading-relaxed">
              {{ row.text }}
            </p>
          </div>
        </div>
      </div>

      <!-- 3. featureGrid 模式 (支持 cards, bordered, numbered, iconLeft 四大变体) -->
      <div v-else-if="node.body?.kind === 'featureGrid' && node.body.variant === 'bordered'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-2xl border-2 border-default hover:border-primary-500 transition-all text-left"
        >
          <div class="text-2xl text-primary-500 font-bold mb-3">{{ feat.icon || '✓' }}</div>
          <div class="font-bold text-highlighted text-base mb-2">{{ feat.title }}</div>
          <div class="text-sm text-muted leading-relaxed">{{ feat.text }}</div>
        </div>
      </div>
      <div v-else-if="node.body?.kind === 'featureGrid' && node.body.variant === 'numbered'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-2xl border border-default hover:border-primary-500 transition-all text-left relative overflow-hidden"
        >
          <div class="text-3xl font-black text-primary-500/20 mb-3 tracking-wider">0{{ i + 1 }}</div>
          <div class="font-bold text-highlighted text-base mb-2">{{ feat.title }}</div>
          <div class="text-sm text-muted leading-relaxed">{{ feat.text }}</div>
        </div>
      </div>
      <div v-else-if="node.body?.kind === 'featureGrid' && node.body.variant === 'iconLeft'" class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-2xl border border-default hover:border-primary-500 transition-all flex gap-4 items-start text-left"
        >
          <div class="w-12 h-12 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center text-xl font-bold flex-shrink-0">
            {{ feat.icon || '✓' }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-highlighted text-base mb-1.5">{{ feat.title }}</div>
            <div class="text-sm text-muted leading-relaxed">{{ feat.text }}</div>
          </div>
        </div>
      </div>
      <div v-else-if="node.body?.kind === 'featureGrid'" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div
          v-for="(feat, i) in node.body.features"
          :key="i"
          class="bg-card p-6 rounded-2xl border border-default text-center hover:border-primary-400 hover:shadow-md transition-all"
        >
          <div class="w-12 h-12 mx-auto mb-4 rounded-xl bg-primary-500/10 text-primary-500 flex items-center justify-center text-xl font-bold">
            {{ feat.icon || '✓' }}
          </div>
          <div class="font-bold text-highlighted text-base mb-2">{{ feat.title }}</div>
          <div class="text-sm text-muted leading-relaxed">{{ feat.text }}</div>
        </div>
      </div>

      <!-- 4. stepList 模式 -->
      <div v-else-if="node.body?.kind === 'stepList'" class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div
          v-for="(st, i) in node.body.steps"
          :key="i"
          class="bg-card p-5 rounded-xl border border-default relative"
        >
          <div class="text-2xl font-black text-primary-500/30 mb-2">0{{ st.stepNumber || i + 1 }}</div>
          <div class="font-bold text-highlighted text-sm mb-1">{{ st.title }}</div>
          <div class="text-xs text-muted">{{ st.text }}</div>
        </div>
      </div>

      <!-- 5. faqList 模式 -->
      <div v-else-if="node.body?.kind === 'faqList'" class="max-w-3xl mx-auto space-y-4">
        <div
          v-for="(faq, i) in node.body.faqs"
          :key="i"
          class="bg-card p-5 rounded-xl border border-default"
        >
          <div class="font-bold text-highlighted text-base mb-2 flex items-center gap-2">
            <span class="text-primary-500 font-extrabold">Q:</span> {{ faq.q }}
          </div>
          <div class="text-sm text-muted pl-6 leading-relaxed">
            {{ faq.a }}
          </div>
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

    'app/components/tmagic/TmagicCta.vue': `<template>
  <section
    v-if="node.variant === 'card'"
    class="py-14 bg-default text-center px-4 sm:px-6"
  >
    <div class="max-w-4xl mx-auto p-8 sm:p-12 rounded-3xl bg-primary-500 text-inverted shadow-xl shadow-primary-500/20">
      <h2 class="text-2xl sm:text-3xl font-bold mb-3 tracking-tight">{{ node.title }}</h2>
      <p v-if="node.text" class="text-inverted/85 max-w-xl mx-auto text-sm sm:text-base mb-6 leading-relaxed">{{ node.text }}</p>
      <button
        v-if="node.action"
        @click="handleAction(node.action.action)"
        class="px-6 py-3 bg-default text-primary-600 hover:bg-card active:scale-95 font-semibold rounded-xl shadow-md transition-all"
      >
        {{ node.action.label }}
      </button>
    </div>
  </section>
  <section
    v-else-if="node.variant === 'split'"
    class="py-14 bg-default px-4 sm:px-6"
  >
    <div class="max-w-5xl mx-auto p-8 sm:p-12 rounded-3xl bg-card border-2 border-primary-500/30 flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
      <div class="max-w-xl text-left">
        <h2 class="text-2xl sm:text-3xl font-bold text-highlighted mb-3 tracking-tight">{{ node.title }}</h2>
        <p v-if="node.text" class="text-muted text-sm sm:text-base leading-relaxed">{{ node.text }}</p>
      </div>
      <div class="flex-shrink-0">
        <button
          v-if="node.action"
          @click="handleAction(node.action.action)"
          class="px-8 py-3.5 bg-primary-500 hover:bg-primary-600 active:scale-95 text-inverted font-semibold rounded-xl shadow-lg shadow-primary-500/25 transition-all"
        >
          {{ node.action.label }}
        </button>
      </div>
    </div>
  </section>
  <section v-else class="py-14 bg-primary-500 text-inverted text-center">
    <div class="max-w-4xl mx-auto px-4">
      <h2 class="text-2xl sm:text-3xl font-bold mb-3 tracking-tight">{{ node.title }}</h2>
      <p v-if="node.text" class="text-inverted/85 max-w-xl mx-auto text-sm sm:text-base mb-6 leading-relaxed">{{ node.text }}</p>
      <button
        v-if="node.action"
        @click="handleAction(node.action.action)"
        class="px-6 py-2.5 bg-default text-primary-600 hover:bg-card active:scale-95 font-semibold rounded-xl shadow-md transition-all"
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
  <footer class="bg-inverted text-inverted/70 py-12 text-sm border-t border-inverted/10">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
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
  <nav class="fixed bottom-0 inset-x-0 bg-default/95 backdrop-blur border-t border-default z-40 py-1.5 px-4 flex justify-around md:hidden">
    <button
      v-for="tab in node.tabs"
      :key="tab.id"
      @click="handleTab(tab)"
      class="flex flex-col items-center gap-0.5 text-xs font-medium py-1 transition-colors"
      :class="node.current === tab.id ? 'text-primary-500 font-bold' : 'text-muted hover:text-highlighted'"
    >
      <span class="text-lg leading-none">{{ tab.icon || '●' }}</span>
      <span>{{ tab.label }}</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ node: any }>()

function handleTab(tab: any) {
  if (tab.action?.kind === 'navigate') {
    navigateTo(tab.action.page || '/')
  }
}
</script>
`,

    'app/components/tmagic/TmagicOverlayForm.vue': `<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-sm">
    <div class="bg-card rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-default relative animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-bold text-highlighted">{{ node.title }}</h3>
        <button @click="visible = false" class="text-muted hover:text-highlighted text-xl font-bold">×</button>
      </div>
      <p v-if="node.subtitle" class="text-xs text-muted mb-6">{{ node.subtitle }}</p>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div v-for="f in node.fields" :key="f.name || f.key">
          <label class="block text-xs font-semibold text-highlighted mb-1.5">{{ f.label }}</label>
          <input
            v-if="f.type !== 'textarea'"
            :type="f.type === 'phone' ? 'tel' : (f.type || 'text')"
            v-model="formData[f.name || f.key]"
            :placeholder="f.placeholder || f.label"
            :required="f.required"
            class="w-full px-3 py-2 bg-default border border-default rounded-lg text-sm text-highlighted focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <textarea
            v-else
            v-model="formData[f.name || f.key]"
            :placeholder="f.placeholder || f.label"
            :required="f.required"
            rows="3"
            class="w-full px-3 py-2 bg-default border border-default rounded-lg text-sm text-highlighted focus:outline-none focus:ring-2 focus:ring-primary-500"
          ></textarea>
        </div>

        <div class="flex items-center justify-end gap-3 pt-4 border-t border-default">
          <button type="button" @click="visible = false" class="px-4 py-2 text-sm font-medium text-muted hover:bg-default rounded-lg">
            {{ node.cancelText || '取消' }}
          </button>
          <button type="submit" class="px-4 py-2 text-sm font-semibold text-inverted bg-primary-500 hover:bg-primary-600 rounded-lg shadow-sm shadow-primary-500/20">
            {{ node.submitText || '提交' }}
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
const formData = ref<Record<string, any>>({})

function onOpen(e: any) {
  if (!e.detail || e.detail === props.node.formId) {
    visible.value = true
  }
}

onMounted(() => {
  window.addEventListener('tmagic-open-form', onOpen)
})

onUnmounted(() => {
  window.removeEventListener('tmagic-open-form', onOpen)
})

function handleSubmit() {
  alert('表单已提交：' + JSON.stringify(formData.value))
  visible.value = false
}
</script>
`
  }
}
