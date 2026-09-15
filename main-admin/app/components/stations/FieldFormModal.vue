<script setup lang="ts">
/**
 * 字段完整配置表单。对齐代码生成器的字段配置形态，替代原先只能改一个属性的行内下拉。
 *
 * 「枚举值」不是独立存储：它是所关联字典的快捷录入，写回的是 dict_item，
 * 所以字段表里永远只有一个 dict_key，不会出现两处各存一份还互相打架。
 */
import { COMPONENTS, FIELD_RULES, FIELD_TYPES, INDEX_TYPES, QUERY_TYPES } from '~/composables/useStations'
import { useWb } from '~/composables/useWorkbench'

const props = defineProps<{
  open: boolean
  module: any
  /** null = 新建字段 */
  field: Record<string, any> | null
}>()

const emit = defineEmits<{ 'update:open': [boolean], saved: [] }>()

const wb = useWb()
const { post, patch } = useApi()
const { push } = useNotify()

/**
 * Reka 的 SelectItem 拒绝空字符串 value（会在选项建立时抛错、下拉直接坏掉），
 * 但库里「不校验 / 自动 / 无字典」就是空串。用哨兵值进出，落库前再换回空串。
 */
const NONE = '@none'
const toSentinel = (v: string) => (v ? v : NONE)
const fromSentinel = (v: unknown) => (v === NONE ? '' : String(v ?? ''))

const blank = () => ({
  name: '', colKey: '', type: 'varchar', length: 64, precision: 2,
  indexType: 'none', dictKey: '', enumText: '', defaultV: '',
  query: 'like', queryHidden: false, component: NONE, rule: NONE,
  formShow: true, listShow: true, detailShow: true, exportShow: true,
  sortable: false, required: false, clearable: true,
  ruleMsg: '', remark: '',
  refTable: '', refLabel: '', refValue: ''
})
const form = reactive(blank())
const saving = ref(false)
const deriving = ref(false)
const advanced = ref(false)
const err = ref('')

/** 主键由 type=id 决定，索引类型不给改。 */
const isId = computed(() => form.type === 'id')
const isEnum = computed(() => form.type === 'enum')
const isFk = computed(() => form.type === 'fk' || !!form.refTable)
const needsLength = computed(() => ['varchar', 'char'].includes(form.type) || (form.type === 'fk' && form.refValue && form.refValue !== 'id'))
const needsPrecision = computed(() => form.type === 'decimal' || form.type === 'money')
/** 模糊匹配只对字符串有意义，选了别的类型要当场说清楚，别等生成后才发现条件失效。 */
const likeMismatch = computed(() => form.query === 'like' && !['varchar', 'text', 'richtext'].includes(form.type))

const dictItems = computed(() =>
  (wb.dicts ?? []).map((d: any) => ({ label: `${d.dictKey}（${d.items?.length ?? 0} 项）`, value: d.dictKey })))

const moduleOptions = computed(() =>
  (wb.modules ?? []).map((m: any) => ({
    label: `${m.name} (${m.tableName || m.table_name || m.key || m.res_key})`,
    value: m.tableName || m.table_name || m.key || m.res_key
  })))

watch(() => form.type, (t) => {
  if (t === 'fk' && (form.component === NONE || !form.component)) {
    form.component = 'remote-select'
  }
})

const COMPONENT_OPTS = [{ label: '自动', value: NONE }, ...COMPONENTS.map(c => ({ label: c, value: c }))]
const RULE_OPTS = FIELD_RULES.map(r => ({ label: r.label, value: toSentinel(r.v) }))

/** 标签=值，一行一个；不写 =值 时按行号自动给值。 */
function parseEnum(text: string) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
    const eq = l.indexOf('=')
    if (eq < 0) return { label: l, value: String(i + 1) }
    return { label: l.slice(0, eq).trim(), value: l.slice(eq + 1).trim() || String(i + 1) }
  })
}

async function fillFromDict(key: string) {
  form.dictKey = key
  const d = (wb.dicts ?? []).find((x: any) => x.dictKey === key)
  if (d?.items?.length) form.enumText = d.items.map((i: any) => `${i.label}=${i.value}`).join('\n')
}

watch(() => [props.open, props.field] as const, ([o]) => {
  if (!o) return
  Object.assign(form, blank())
  err.value = ''
  advanced.value = false
  const f = props.field
  if (f) {
    Object.assign(form, {
      name: f.name ?? '', colKey: f.col_key ?? f.colKey ?? '', type: f.type ?? 'varchar',
      length: f.length ?? 64, precision: f.precision ?? 2,
      indexType: f.indexType ?? (f.pk ? 'primary' : f.uniq ? 'unique' : f.indexed ? 'normal' : 'none'),
      dictKey: f.dict ?? '', defaultV: f.default ?? '',
      query: f.query ?? 'like', queryHidden: !!f.queryHidden, component: toSentinel(f.component ?? ''),
      formShow: f.formShow !== false, listShow: f.listShow !== false, detailShow: f.detailShow !== false,
      exportShow: f.exportShow !== false, sortable: !!f.sortable, required: !!f.required,
      clearable: f.clearable !== false, rule: toSentinel(f.rule ?? ''), ruleMsg: f.ruleMsg ?? '', remark: f.remark ?? '',
      refTable: f.ref ?? '', refLabel: f.refLabel ?? '', refValue: f.refValue ?? ''
    })
    const d = (wb.dicts ?? []).find((x: any) => x.dictKey === form.dictKey)
    if (d?.items?.length) form.enumText = d.items.map((i: any) => `${i.label}=${i.value}`).join('\n')
  }
}, { immediate: true })

/** 自动填充：中文标签 -> 英文列名，与 AI 建表共用同一套词表。 */
async function autoFill() {
  if (!form.name.trim()) { err.value = '先填字段中文名，再自动填充英文名'; return }
  deriving.value = true
  try {
    const r: any = await post('/model/derive-key', { label: form.name, moduleId: props.module?.id })
    if (r?.key) {
      form.colKey = r.key
      if (!r.matched) push(r.hint || '词表没命中，建议手填英文名', 'warning')
      err.value = ''
    }
  } catch { /* 失败提示由 useApi 统一弹出 */ }
  finally { deriving.value = false }
}

function payload() {
  return {
    name: form.name.trim(), colKey: form.colKey.trim(), type: form.type,
    length: Number(form.length) || 64, precision: Number(form.precision) || 0,
    indexType: isId.value ? 'primary' : form.indexType,
    dictKey: isEnum.value ? form.dictKey : '',
    component: fromSentinel(form.component),
    default: form.defaultV === '' ? null : form.defaultV,
    query: form.query, queryHidden: form.queryHidden,
    formShow: form.formShow, listShow: form.listShow, detailShow: form.detailShow,
    exportShow: form.exportShow, sortable: form.sortable, required: form.required,
    clearable: form.clearable, rule: fromSentinel(form.rule), ruleMsg: form.ruleMsg, remark: form.remark,
    refTable: form.refTable, refLabel: form.refLabel, refValue: form.refValue
  }
}

/**
 * 枚举值 -> 字典。没有就建，有就整表替换。
 * key 缺省时用 资源_列名，避免不同模块的同名字段静默共用一份字典。
 */
async function syncDict() {
  if (!isEnum.value || !form.enumText.trim()) return
  const rows = parseEnum(form.enumText)
  if (!rows.length) return
  let key = form.dictKey
  if (!key) {
    key = `${props.module?.res_key ?? props.module?.resKey ?? 'biz'}_${form.colKey}`.toLowerCase()
    form.dictKey = key
  }
  let d = (wb.dicts ?? []).find((x: any) => x.dictKey === key)
  if (!d) {
    d = await post('/dict', { tenantId: wb.tenantId, dictKey: key, name: form.name || key, items: rows })
  } else {
    await post(`/dict/${d.id}/items`, { items: rows })
  }
  if (d) form.dictKey = d.dictKey ?? key
}

async function submit() {
  err.value = ''
  if (!form.name.trim()) return (err.value = '字段中文名不能为空')
  if (!form.colKey.trim()) return (err.value = '字段名称（英文列名）不能为空，可点「自动填充」')
  if (isEnum.value && !form.enumText.trim() && !form.dictKey) {
    return (err.value = '枚举类型要么填枚举值，要么选一个已有字典')
  }

  saving.value = true
  try {
    await syncDict()
    const body = payload()
    if (props.field) await patch(`/field/${props.field.id}`, body)
    else await post(`/module/${props.module.id}/field`, body)
    await wb.reload()
    emit('update:open', false)
    emit('saved')
    push(props.field ? '字段已更新' : '字段已创建', 'success')
  } catch { /* 失败提示由 useApi 统一弹出 */ }
  finally { saving.value = false }
}
</script>

<template>
  <UModal
    :open="open" :ui="{ content: 'max-w-4xl' }"
    :title="field ? `编辑字段 · ${field.name ?? field.col_key ?? ''}` : '新建字段'"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="warning" variant="subtle" icon="i-lucide-triangle-alert"
          title="id / created_at / updated_at 由生成器自动添加，不要重复创建；模糊匹配只对字符串类型有效。"
        />

        <div class="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2">
          <UFormField label="字段名称（英文列名）" required :error="err && !form.colKey ? err : undefined">
            <div class="flex gap-2">
              <UInput v-model="form.colKey" class="flex-1 font-mono" placeholder="channel_name" />
              <UButton label="自动填充" size="sm" color="neutral" variant="outline" :loading="deriving" @click="autoFill" />
            </div>
          </UFormField>

          <UFormField label="字段中文名" required :error="err && !form.name ? err : undefined">
            <UInput v-model="form.name" placeholder="渠道名称" />
          </UFormField>

          <UFormField label="数据库字段描述" help="写进表注释，会出现在子后台字段说明里">
            <UInput v-model="form.remark" placeholder="投放渠道，对应字典 channel" />
          </UFormField>

          <UFormField label="字段类型" required>
            <USelect v-model="form.type" :items="FIELD_TYPES" value-key="v" label-key="label" class="w-full" />
          </UFormField>

          <UFormField v-if="needsLength" label="长度">
            <UInput v-model.number="form.length" type="number" min="1" max="4096" />
          </UFormField>
          <UFormField v-if="needsPrecision" label="小数位">
            <UInput v-model.number="form.precision" type="number" min="0" max="6" />
          </UFormField>

          <!-- 枚举值与关联字典只在枚举类型下出现：其他类型摆一个灰框是纯噪音 -->
          <template v-if="isEnum">
            <UFormField label="枚举值" help="一行一个：标签=值；不写值则按行号自动给">
              <UTextarea v-model="form.enumText" :rows="5" class="w-full font-mono" placeholder="启用=1&#10;停用=0" />
            </UFormField>

            <UFormField label="关联字典" help="留空则按枚举值自动新建字典">
              <USelect
                v-model="form.dictKey" :items="dictItems" value-key="value" label-key="label"
                placeholder="请选择字典" class="w-full" @update:model-value="fillFromDict"
              />
            </UFormField>
          </template>

          <!-- 外键关联数据源配置：类型为 fk 或已配置关联表时突出展示 -->
          <template v-if="isFk">
            <UFormField label="关联目标模型/表" required help="选择本租户内的数据模型作为外键数据源">
              <USelect
                v-if="moduleOptions.length"
                v-model="form.refTable" :items="moduleOptions" value-key="value" label-key="label"
                placeholder="请选择关联数据模型" class="w-full"
              />
              <UInput v-else v-model="form.refTable" class="w-full font-mono" placeholder="med_department" />
            </UFormField>

            <UFormField label="关联显示字段" help="下拉展示字段（如 dept_name），留空自动推导">
              <UInput v-model="form.refLabel" class="w-full font-mono" placeholder="dept_name" />
            </UFormField>

            <UFormField label="关联存储字段" help="保存到本表的外键值字段（如 dept_name 或 id），留空默认用 id">
              <UInput v-model="form.refValue" class="w-full font-mono" placeholder="dept_name" />
            </UFormField>
          </template>

          <UFormField label="默认值">
            <UInput v-model="form.defaultV" placeholder="留空表示无默认值" />
          </UFormField>

          <UFormField label="索引类型" :help="isId ? '主键由 id 类型决定' : undefined">
            <USelect v-model="form.indexType" :items="INDEX_TYPES" value-key="v" label-key="label" class="w-full" :disabled="isId" />
          </UFormField>

          <UFormField label="字段查询条件" :error="likeMismatch ? '该类型不支持模糊匹配，生成后会静默失效' : undefined">
            <USelect v-model="form.query" :items="QUERY_TYPES" value-key="v" label-key="label" class="w-full" />
          </UFormField>

          <UFormField label="前端控件" help="留空则按类型自动选">
            <USelect v-model="form.component" :items="COMPONENT_OPTS" value-key="value" label-key="label" class="w-full" />
          </UFormField>

          <UFormField label="校验规则">
            <USelect v-model="form.rule" :items="RULE_OPTS" value-key="value" label-key="label" class="w-full" />
          </UFormField>

          <UFormField v-if="form.rule !== NONE" label="校验失败文案" help="留空用默认文案">
            <UInput v-model="form.ruleMsg" placeholder="请输入正确的手机号" />
          </UFormField>
        </div>

        <USeparator label="前端显示与行为" />

        <div class="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
          <div
            v-for="t in [
              { k: 'formShow', label: '前端新建/编辑', help: '出现在新增/编辑表单' },
              { k: 'listShow', label: '前端表格列', help: '出现在列表列' },
              { k: 'detailShow', label: '前端详情', help: '出现在详情抽屉' },
              { k: 'exportShow', label: '导入/导出', help: '出现在导出列与导入模板' },
              { k: 'sortable', label: '是否排序', help: '列表可按此列排序' },
              { k: 'required', label: '是否必填', help: '表单必填 + 库表 NOT NULL' },
              { k: 'clearable', label: '是否可清空', help: '编辑时允许把值清成空' },
              { k: 'queryHidden', label: '隐藏查询条件', help: '不进搜索栏，接口仍可筛选' }
            ]" :key="t.k"
            class="flex items-center justify-between gap-3 rounded-md border border-(--ui-border) px-3 py-2"
          >
            <div class="min-w-0">
              <p class="text-sm">{{ t.label }}</p>
              <p class="truncate text-xs text-(--ui-text-dimmed)">{{ t.help }}</p>
            </div>
            <USwitch
              :model-value="(form as any)[t.k]" size="sm"
              @update:model-value="(v: any) => (form as any)[t.k] = !!v"
            />
          </div>
        </div>

        <UCollapsible v-model:open="advanced" class="rounded-md border border-(--ui-border)">
          <button type="button" class="flex w-full items-center justify-between px-3 py-2 text-sm" @click="advanced = !advanced">
            <span>数据源配置 <span class="text-xs text-(--ui-text-dimmed)">（高级配置，填错会导致下拉框取不到数据）</span></span>
            <UIcon :name="advanced ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4" />
          </button>
          <template #content>
            <div class="grid grid-cols-1 gap-x-5 gap-y-3 border-t border-(--ui-border) p-3 md:grid-cols-3">
              <UFormField label="关联表" help="留空表示不来自其他表">
                <UInput v-model="form.refTable" class="w-full font-mono" placeholder="biz_channel" />
              </UFormField>
              <UFormField label="显示字段" help="留空自动挑 name/title">
                <UInput v-model="form.refLabel" class="w-full font-mono" placeholder="name" />
              </UFormField>
              <UFormField label="值字段" help="留空用主键">
                <UInput v-model="form.refValue" class="w-full font-mono" placeholder="id" />
              </UFormField>
            </div>
          </template>
        </UCollapsible>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <span v-if="err" class="truncate text-xs text-error">{{ err }}</span>
        <span v-else />
        <div class="flex gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="emit('update:open', false)" />
          <UButton label="确定" :loading="saving" @click="submit" />
        </div>
      </div>
    </template>
  </UModal>
</template>
