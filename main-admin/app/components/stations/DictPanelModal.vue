<script setup lang="ts">
/**
 * 数据字典面板。控制面是字典定义的唯一来源：建模站字段的「枚举值」写回这里，
 * 生成期也从这里取真值 seed 进子后台，不再有第二份字典概念。
 */
import { useWb } from '~/composables/useWorkbench'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const wb = useWb()
const { post, patch, del } = useApi()
const { push } = useNotify()

/** Reka 的 SelectItem 不收空串 value，"无颜色"用哨兵，提交前换回空串。 */
const NONE = '@none'
const COLORS = [
  { label: '无', value: NONE }, { label: '绿(成功)', value: 'ok' },
  { label: '黄(警告)', value: 'warn' }, { label: '红(危险)', value: 'err' }
]
const colorOut = (v: unknown) => (v === NONE ? '' : String(v ?? ''))
const colorIn = (v: unknown) => (v ? String(v) : NONE)

const activeKey = ref('')
const creating = ref(false)
const newType = reactive({ dictKey: '', name: '', remark: '' })
const newItem = reactive({ label: '', value: '', color: NONE })
const busy = ref('')

const dicts = computed(() => wb.dicts ?? [])
const active = computed(() => dicts.value.find((d: any) => d.dictKey === activeKey.value) ?? null)

watch(() => [props.open, dicts.value.length] as const, () => {
  if (!props.open) return
  if (!active.value && dicts.value.length) activeKey.value = dicts.value[0].dictKey
}, { immediate: true })

async function createType() {
  if (!newType.dictKey.trim() || !newType.name.trim()) return push('字典编码和名称都要填', 'error')
  busy.value = 'type'
  try {
    const r: any = await post('/dict', { tenantId: wb.tenantId, ...newType, items: [] })
    Object.assign(newType, { dictKey: '', name: '', remark: '' })
    creating.value = false
    await wb.reload()
    if (r?.dictKey) activeKey.value = r.dictKey
    push('字典已创建', 'success')
  } catch { /* 提示由 useApi 统一弹出 */ }
  finally { busy.value = '' }
}

async function addItem() {
  if (!newItem.label.trim() || !newItem.value.trim()) return push('条目名称和值都要填', 'error')
  busy.value = 'item'
  try {
    await post('/dict/item', { typeId: active.value.id, ...newItem, color: colorOut(newItem.color) })
    Object.assign(newItem, { label: '', value: '', color: NONE })
    await wb.reload()
  } catch { /* 提示由 useApi 统一弹出 */ }
  finally { busy.value = '' }
}

async function patchItem(it: any, body: Record<string, unknown>) {
  busy.value = `i${it.id}`
  try { await patch(`/dict/item/${it.id}`, body); await wb.reload() }
  catch { /* 提示由 useApi 统一弹出 */ }
  finally { busy.value = '' }
}

async function removeItem(it: any) {
  busy.value = `i${it.id}`
  try { await del(`/dict/item/${it.id}`); await wb.reload() }
  catch { /* 提示由 useApi 统一弹出 */ }
  finally { busy.value = '' }
}

/** 删除保护在后端（被字段引用时 409），这里只负责把它的说明转成一次确认。 */
async function removeType(force = false) {
  const d = active.value
  if (!d) return
  busy.value = 'type'
  try {
    await del(`/dict/${d.id}${force ? '?force=1' : ''}`)
    activeKey.value = ''
    await wb.reload()
    push('字典已删除', 'success')
  } catch (e: any) {
    if (e?.statusCode === 409) {
      const msg = e?.data?.message ?? '该字典还被字段引用'
      if (confirm(`${msg}。确定仍要删除吗？引用它的字段下拉会变成空。`)) await removeType(true)
    }
  } finally { busy.value = '' }
}
</script>

<template>
  <UModal
    :open="open" :ui="{ content: 'max-w-5xl' }" title="数据字典"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-(--ui-text-dimmed)">共 {{ dicts.length }} 个</span>
            <UButton label="新建" icon="i-lucide-plus" size="xs" @click="creating = !creating" />
          </div>

          <div v-if="creating" class="space-y-2 rounded-md border border-(--ui-border) p-2">
            <UInput v-model="newType.dictKey" size="xs" class="w-full font-mono" placeholder="字典编码 channel_type" />
            <UInput v-model="newType.name" size="xs" class="w-full" placeholder="字典名称 渠道类型" />
            <UInput v-model="newType.remark" size="xs" class="w-full" placeholder="备注（可空）" />
            <div class="flex justify-end gap-2">
              <UButton label="取消" size="xs" color="neutral" variant="ghost" @click="creating = false" />
              <UButton label="创建" size="xs" :loading="busy === 'type'" @click="createType" />
            </div>
          </div>

          <div v-if="!dicts.length && !creating" class="rounded-md border border-dashed border-(--ui-border) p-4 text-center text-xs text-(--ui-text-dimmed)">
            还没有字典。在字段表单里填「枚举值」会自动建，也可以直接新建。
          </div>

          <button
            v-for="d in dicts" :key="d.dictKey" type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
            :class="d.dictKey === activeKey ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-elevated'"
            @click="activeKey = d.dictKey"
          >
            <span class="min-w-0 flex-1 truncate">{{ d.name }}</span>
            <span class="shrink-0 text-[10px] text-(--ui-text-dimmed)">{{ d.items.length }}项</span>
            <UTooltip v-if="d.usedBy" :text="`${d.usedBy} 个字段在用`">
              <span class="shrink-0 rounded bg-(--ui-bg-elevated) px-1 text-[10px]">{{ d.usedBy }}用</span>
            </UTooltip>
          </button>
        </div>

        <div class="min-w-0">
          <div v-if="!active" class="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-(--ui-border) text-sm text-(--ui-text-dimmed)">
            选一个字典看它的条目
          </div>

          <div v-else class="space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="font-mono text-sm">{{ active.dictKey }}</span>
              <UInput v-model="active.name" size="xs" class="w-36" @change="patch(`/dict/${active.id}`, { name: active.name })" />
              <span class="flex-1" />
              <UButton label="删除字典" icon="i-lucide-trash-2" size="xs" color="error" variant="ghost" :loading="busy === 'type'" @click="removeType(false)" />
            </div>

            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-default text-left text-muted">
                  <th class="p-2 font-medium">名称</th><th class="p-2 font-medium">值</th>
                  <th class="p-2 font-medium">颜色</th><th class="p-2 text-center font-medium">启用</th><th class="p-2" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in active.items" :key="it.id" class="border-b border-muted">
                  <td class="p-1"><UInput size="xs" class="w-28" :model-value="it.label" @change="patchItem(it, { label: ($event.target as any).value })" /></td>
                  <td class="p-1"><UInput size="xs" class="w-24 font-mono" :model-value="it.value" @change="patchItem(it, { value: ($event.target as any).value })" /></td>
                  <td class="p-1"><USelect size="xs" class="w-24" :items="COLORS" value-key="value" label-key="label" :model-value="colorIn(it.color)" @update:model-value="patchItem(it, { color: colorOut($event) })" /></td>
                  <td class="p-1 text-center">
                    <UCheckbox :model-value="!!it.enabled" @update:model-value="patchItem(it, { enabled: $event })" />
                  </td>
                  <td class="p-1 text-right">
                    <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" @click="removeItem(it)" />
                  </td>
                </tr>
                <tr v-if="!active.items.length">
                  <td colspan="5" class="p-6 text-center text-muted">还没有条目</td>
                </tr>
              </tbody>
            </table>

            <div class="flex flex-wrap items-end gap-2 rounded-md border border-(--ui-border) p-2">
              <UInput v-model="newItem.label" size="xs" class="w-28" placeholder="名称 启用" />
              <UInput v-model="newItem.value" size="xs" class="w-24 font-mono" placeholder="值 1" />
              <USelect v-model="newItem.color" size="xs" class="w-28" :items="COLORS" value-key="value" label-key="label" />
              <UButton label="添加条目" icon="i-lucide-plus" size="xs" :loading="busy === 'item'" @click="addItem" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
