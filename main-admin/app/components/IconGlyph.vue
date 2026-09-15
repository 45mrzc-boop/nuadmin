<script setup lang="ts">
/**
 * 图标值渲染：建模库存的 icon 既可能是 lucide 裸名（图标选择器选的），
 * 也可能是历史遗留的 emoji（列默认值就是 📁/）。这里统一兼容，
 * 避免为了迁移数据而做一次没有收益的破坏性改写。
 */
import { isIconName, toIconName } from '~/composables/useIcons'

const props = defineProps<{ value?: unknown }>()

const filled = computed(() => String(props.value ?? '').trim() !== '')
const icon = computed(() => (filled.value && isIconName(props.value) ? toIconName(props.value) : ''))
const text = computed(() => (icon.value ? '' : String(props.value ?? '').trim()))
</script>

<template>
  <span class="inline-flex shrink-0 items-center justify-center">
    <UIcon v-if="icon" :name="icon" class="size-4" />
    <UIcon v-else-if="!text" name="i-lucide-square-dashed" class="size-4 opacity-40" />
    <template v-else>{{ text }}</template>
  </span>
</template>
