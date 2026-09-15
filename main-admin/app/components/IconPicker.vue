<script setup lang="ts">
/**
 * 图标选择器。存 lucide 裸名（如 `folder`），渲染端加 `i-lucide-` 前缀，
 * 这样主后台预览和生成的子后台用的是同一份值，不需要二次映射。
 *
 * 列表是精选集而不是 lucide 全量 1700+：全量打进 bundle 代价太大。
 * 库里没有的可以在输入框直接写裸名（回车即采用），保持逃生通道。
 */
import { ALL_ICONS, ICON_GROUPS, isIconName, toIconName } from '~/composables/useIcons'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
}>(), { modelValue: '', placeholder: '选择图标' })

const emit = defineEmits<{ 'update:modelValue': [string] }>()

const open = ref(false)
const q = ref('')

const filtered = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k) return ICON_GROUPS
  return ICON_GROUPS
    .map(g => ({ label: g.label, icons: g.icons.filter(i => i.includes(k)) }))
    .filter(g => g.icons.length > 0)
})

/** 搜索无命中时，把输入本身当作候选（用户可能知道某个不在精选集里的图标名）。 */
const custom = computed(() => {
  const k = q.value.trim().toLowerCase()
  if (!k || filtered.value.length) return []
  return ALL_ICONS.some(i => i.includes(k)) ? [] : [k]
})

const preview = computed(() => (isIconName(props.modelValue) ? toIconName(props.modelValue) : ''))
const filled = computed(() => String(props.modelValue ?? '').trim() !== '')
/** emoji 值左侧字形已经显示了它，文字位再打一遍就是「📄📄」；只有图标名才需要文字。 */
const labelText = computed(() => (preview.value ? String(props.modelValue).trim() : (filled.value ? '' : props.placeholder)))

function pick(name: string) {
  emit('update:modelValue', name)
  open.value = false
  q.value = ''
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'start' }">
    <!-- UPopover 自己会绑触发元素，这里再写 @click 会翻转两次、永远打不开 -->
    <button type="button" class="flex w-full items-center gap-2 rounded-md border border-(--ui-border) bg-elevated px-2.5 py-1.5 text-sm hover:bg-(--ui-bg-elevated)/60">
      <IconGlyph :value="modelValue" class="text-(--ui-text-dimmed)" />
      <span class="flex-1 truncate text-left" :class="preview ? '' : 'text-(--ui-text-dimmed)'">
        {{ labelText }}
      </span>
      <UIcon name="i-lucide-chevron-down" class="size-4 shrink-0 opacity-60" />
    </button>

    <template #content>
      <div class="w-80">
        <div class="border-b border-(--ui-border) p-2">
          <UInput
            v-model="q"
            icon="i-lucide-search"
            placeholder="搜索图标名（英文）"
            autofocus
            size="sm"
            variant="none"
            class="w-full"
            @keydown.enter="custom[0] && pick(custom[0])"
          />
        </div>

        <div class="max-h-64 overflow-y-auto p-2">
          <p v-if="!filtered.length && !custom.length" class="py-6 text-center text-xs text-(--ui-text-dimmed)">
            没有匹配的图标
          </p>

          <div v-for="g in filtered" :key="g.label" class="mb-2 last:mb-0">
            <p class="mb-1 text-[10px] font-semibold tracking-wide text-(--ui-text-dimmed) uppercase">{{ g.label }}</p>
            <div class="grid grid-cols-8 gap-1">
              <button
                v-for="name in g.icons"
                :key="name"
                type="button"
                :title="name"
                class="flex aspect-square items-center justify-center rounded text-(--ui-text-muted) hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-highlighted)"
                :class="name === modelValue ? 'bg-primary/10 text-primary ring ring-primary/40' : ''"
                @click="pick(name)"
              >
                <UIcon :name="`i-lucide-${name}`" class="size-4" />
              </button>
            </div>
          </div>

          <div v-if="custom.length" class="mb-1">
            <p class="mb-1 text-[10px] font-semibold tracking-wide text-(--ui-text-dimmed) uppercase">自定义</p>
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-(--ui-bg-elevated)"
              @click="pick(custom[0])"
            >
              <UIcon :name="`i-lucide-${custom[0]}`" class="size-4" />
              <span class="truncate">{{ custom[0] }}</span>
              <span class="ml-auto shrink-0 text-[10px] text-warning">未收录</span>
            </button>
          </div>
        </div>

        <div class="flex items-center justify-between border-t border-(--ui-border) p-2">
          <span class="text-[10px] text-(--ui-text-dimmed)">也可直接输入 lucide 图标名</span>
          <UButton label="清空" size="xs" color="neutral" variant="ghost" @click="pick('')" />
        </div>
      </div>
    </template>
  </UPopover>
</template>
