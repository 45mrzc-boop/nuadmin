<script setup lang="ts">
import { COMPONENTS, FIELD_TYPES, QUERY_TYPES } from '~/composables/useStations'
import { useWb } from '~/composables/useWorkbench'
import DictPanelModal from '~/components/stations/DictPanelModal.vue'
import FieldFormModal from '~/components/stations/FieldFormModal.vue'

const wb = useWb()
const { get, post, patch, del } = useApi()
const { push } = useNotify()

/**
 * 默认「表格视图」：它才是能编辑字段的地方。之前默认只读的画布视图，
 * 会让人以为加字段/改字段功能坏了。视图偏好跨刷新保留。
 */
const view = useState<'table' | 'canvas'>('model.view', () => 'table')
/** 用 id 记住选中模块：reload 后数组顺序会变，存下标会跳到别的模块。 */
const activeId = useState<number>('model.activeId', () => 0)
const mod = computed(() => wb.modules.find((m: any) => m.id === activeId.value) ?? wb.modules[0] ?? null)

const gOpen = ref(false)
const mOpen = ref(false)
const fOpen = ref(false)
const importOpen = ref(false)
const delGroup = ref<any>(null)

const gForm = reactive({ name: '', icon: 'folder' })
const mForm = reactive({ groupId: 0, name: '', tableName: '', comment: '', icon: 'file-text' })

/** 改分组（名称/图标）：之前图标只在新建那一刻能填，建完就再也改不了。 */
const gEdit = ref<any>(null)
const gEditForm = reactive({ name: '', icon: '' })
/** UModal 的 open 需要布尔，gEdit 存的是行对象——用 computed 做双向适配。 */
const gEditOpen = computed({
  get: () => !!gEdit.value,
  set: (v: boolean) => { if (!v) gEdit.value = null }
})
function openGroupEdit(g: any) {
  gEdit.value = g
  Object.assign(gEditForm, { name: g.name, icon: g.icon ?? '' })
}
async function saveGroupEdit() {
  const g = gEdit.value
  if (!g) return
  if (!gEditForm.name.trim()) return push('分组名称不能为空', 'error')
  // 失败提示由 useApi 的 onResponseError 统一弹出，这里只需中断后续动作。
  try { await patch(`/model/group/${g.id}`, { name: gEditForm.name.trim(), icon: gEditForm.icon }) }
  catch { return }
  gEdit.value = null
  await wb.reload()
  push('分组已更新', 'success')
}

/** 模块图标在详情头部直接改，省一次弹窗往返。 */
const iconSaving = ref(false)
async function setModuleIcon(name: string) {
  const m = mod.value
  if (!m || iconSaving.value) return
  iconSaving.value = true
  try { await patch(`/module/${m.id}`, { icon: name }) }
  catch { iconSaving.value = false; return }
  iconSaving.value = false
  await wb.reload()
}

/** 组件与查询条件一律取自 useStations，避免再出现第三份会漂移的副本。 */
const COMPONENT_OPTS = COMPONENTS
const QUERY_OPTS = QUERY_TYPES.map(q => ({ label: q.label, value: q.v }))

/**
 * 字典编码候选：以控制面真实字典为准（带条目才算"已定义"），
 * 再并上字段里已经在用但还没定义的 key，避免旧值在下拉里消失。
 */
const dictKeys = computed(() => [...new Set([
  ...(wb.dicts ?? []).map((d: any) => d.dictKey),
  ...wb.modules.flatMap((m: any) => (m.fields ?? []).map((f: any) => f.dict_key).filter(Boolean))
] as string[])])

/** 字典面板：控制面是字典定义的唯一来源。 */
const dictOpen = ref(false)

/** 完整字段表单：null=新建，非空=编辑该字段。 */
const ffOpen = ref(false)
const ffField = ref<Record<string, any> | null>(null)
function openFieldForm(f: Record<string, any> | null) {
  ffField.value = f
  ffOpen.value = true
}

type FRow = { name: string, colKey: string, type: string, length: number, required: boolean, uniq: boolean, indexed: boolean, listShow: boolean, formShow: boolean, query: string, component: string, dictKey: string, remark: string }
const blankRow = (): FRow => ({ name: '', colKey: '', type: 'varchar', length: 64, required: false, uniq: false, indexed: false, listShow: true, formShow: true, query: 'like', component: 'input', dictKey: '', remark: '' })
const rows = ref<FRow[]>([blankRow(), blankRow(), blankRow()])
const submitting = ref(false)
const validRows = computed(() => rows.value.filter(r => r.name.trim() && r.colKey.trim()))

function addRow() { rows.value.push(blankRow()) }
function delRow(i: number) {
  if (rows.value.length === 1) { rows.value[0] = blankRow(); return }
  rows.value.splice(i, 1)
}

/** 一次提交多行；失败的行留在原地供修正重交，不丢用户已填内容。 */
async function submitRows() {
  if (!mod.value) return
  if (!validRows.value.length) return push('至少填写一行字段名与列名', 'error')
  submitting.value = true
  let done = 0
  const failed: string[] = []
  for (const r of rows.value) {
    if (!r.name.trim() || !r.colKey.trim()) continue
    try { await post(`/module/${mod.value.id}/field`, { ...r }); done++ }
    catch (e: any) { failed.push(`${r.colKey}：${e?.data?.statusMessage ?? e?.message ?? '失败'}`) }
  }
  submitting.value = false
  const failedKeys = new Set(failed.map(f => f.split('：')[0]))
  const kept = rows.value.filter(r => (!r.name.trim() || !r.colKey.trim()) || failedKeys.has(r.colKey))
  rows.value = kept.length ? kept : [blankRow(), blankRow(), blankRow()]
  await wb.reload()
  if (failed.length) push(`${done} 个已添加，${failed.length} 个失败 —— ${failed[0]}`, 'error')
  else push(`已添加 ${done} 个字段`, 'success')
}

async function addGroup() {
  if (!gForm.name.trim()) return push('请填写分组名称', 'error')
  await post('/model/group', { tenantId: wb.tenantId, name: gForm.name, icon: gForm.icon })
  gOpen.value = false; gForm.name = ''
  push('分组已创建', 'success')
  await wb.reload()
}

async function addModule() {
  if (!mForm.name.trim() || !mForm.groupId) return push('请填写名称并选择分组', 'error')
  const r = await post<any>('/module', { ...mForm, tenantId: wb.tenantId })
  mOpen.value = false
  Object.assign(mForm, { name: '', tableName: '', comment: '', groupId: 0 })
  await wb.reload()
  activeId.value = Number(r.id)
  view.value = 'table'
  rows.value = [blankRow(), blankRow(), blankRow()]
  push(`模块「${r.name}」已建 · 表 ${r.table_name} · 资源键 ${r.res_key}，可直接加字段`, 'success')
}

const FIELD_MAP: Record<string, string> = {
  name: 'name', colKey: 'col_key', type: 'type', length: 'length', required: 'required',
  uniq: 'uniq', indexed: 'indexed', listShow: 'list_show', formShow: 'form_show',
  query: 'query_type', component: 'component', dictKey: 'dict_key', remark: 'remark'
}
const dirty = ref('')
async function saveField(f: any, key: string, value: unknown) {
  dirty.value = `${f.id}:${key}`
  try {
    await patch(`/field/${f.id}`, { [FIELD_MAP[key]]: value })
    await wb.reload()
  } finally { dirty.value = '' }
}

async function dropField(f: any) { await del(`/field/${f.id}`); await wb.reload() }
async function dropModule(m: any) {
  await del(`/module/${m.id}`)
  if (activeId.value === m.id) activeId.value = 0
  await wb.reload()
}
async function dropGroup(g: any) {
  try { await del(`/model/group/${g.id}`) }
  catch (e: any) {
    push(e?.data?.statusMessage ?? '删除失败：该分组下还有模块', 'error')
    return
  }
  delGroup.value = null
  await wb.reload()
  push('分组已删除', 'success')
}

async function exportJson() {
  const r = await get<any>('/model/export', { tenantId: wb.tenantId })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }))
  a.download = `${wb.tenant.slug}-model.json`
  a.click()
  push('已导出建模 JSON', 'success')
}

const importText = ref('')
async function importJson() {
  try {
    const r = await post<any>('/model/import', { tenantId: wb.tenantId, json: JSON.parse(importText.value) })
    push(`导入成功，共 ${r.modules} 个模块`, 'success')
    importText.value = ''; importOpen.value = false
    await wb.reload()
  } catch (e: any) {
    push(`导入失败：${e?.message ?? 'JSON 格式错误'}`, 'error')
  }
}

const fieldCount = computed(() => wb.modules.reduce((n: number, m: any) => n + (m.fields?.length ?? 0), 0))
const inlineToggles: Array<[string, string, string]> = [
  ['required', '必填', 'required'], ['list_show', '列表', 'listShow'], ['form_show', '表单', 'formShow']
]
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral" variant="soft" icon="i-lucide-box"
      :title="`${wb.groups.length} 分组 · ${wb.modules.length} 模块 · ${fieldCount} 字段`"
      description="分组=子后台菜单分组；模块=一张表 + 一套 CRUD；字段=表列 + 列表列 + 表单项 + 搜索条件。"
    />

    <div class="flex flex-wrap items-center gap-2">
      <UButton label="导出 JSON" icon="i-lucide-download" color="neutral" variant="ghost" size="sm" @click="exportJson" />
      <UButton label="导入 JSON" icon="i-lucide-upload" color="neutral" variant="ghost" size="sm" @click="importOpen = true" />
      <USeparator orientation="vertical" class="h-5" />
      <!-- Nuxt UI v4 没有 UButtonGroup，写上去只会静默渲染成未知的自定义元素 -->
      <div class="flex items-center gap-1">
        <UButton label="表格视图" icon="i-lucide-table" color="neutral" :variant="view === 'table' ? 'solid' : 'outline'" size="sm" @click="view = 'table'" />
        <UButton label="画布视图" icon="i-lucide-layout-grid" color="neutral" :variant="view === 'canvas' ? 'solid' : 'outline'" size="sm" @click="view = 'canvas'" />
      </div>
      <span class="flex-1" />
      <UButton label="分组" icon="i-lucide-plus" color="neutral" variant="outline" size="sm" @click="gOpen = true" />
      <UButton label="模块" icon="i-lucide-plus" color="neutral" variant="outline" size="sm" :disabled="!wb.groups.length" @click="mForm.groupId = wb.groups[0]?.id ?? 0; mOpen = true" />
      <!-- 加字段入口放在工具栏：两个视图都能直接加，不必先切视图 -->
      <UButton label="数据字典" icon="i-lucide-book-a" size="sm" color="neutral" variant="ghost" @click="dictOpen = true" />
      <UButton label="新建字段" icon="i-lucide-plus" size="sm" :disabled="!mod" @click="openFieldForm(null)" />
      <UButton label="批量添加字段" icon="i-lucide-list-plus" size="sm" :disabled="!mod" @click="fOpen = true" />
    </div>

    <UAlert v-if="!wb.groups.length" color="info" variant="soft" icon="i-lucide-info"
      title="还没有分组" description="先建一个分组（例如「业务管理」），再往里加模块。" />

    <div v-else class="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">模型树</span>
            <UBadge color="neutral" variant="subtle" size="sm">{{ wb.modules.length }}</UBadge>
          </div>
        </template>
        <div class="max-h-[540px] space-y-3 overflow-y-auto">
          <div v-for="g in wb.groups" :key="g.id">
            <div class="flex items-center gap-1.5 px-1 py-1 text-xs font-semibold text-muted">
              <IconGlyph :value="g.icon" /><span class="flex-1 truncate">{{ g.name }}</span>
              <UTooltip text="在此分组新增模块">
                <UButton icon="i-lucide-plus" size="xs" color="neutral" variant="ghost" @click="mForm.groupId = g.id; mOpen = true" />
              </UTooltip>
              <UTooltip text="重命名 / 改图标">
                <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click="openGroupEdit(g)" />
              </UTooltip>
              <UTooltip text="删除分组">
                <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" @click="delGroup = g" />
              </UTooltip>
            </div>
            <div
              v-for="m in wb.modules.filter((x: any) => x.group_id === g.id)" :key="m.id"
              class="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm"
              :class="mod?.id === m.id ? 'bg-primary/10 text-primary font-medium' : 'text-default hover:bg-elevated'"
              @click="activeId = m.id"
            >
              <IconGlyph :value="m.icon" />
              <span class="flex-1 truncate">{{ m.name }}</span>
              <UBadge :color="(m.fields ?? []).length ? 'neutral' : 'warning'" variant="subtle" size="sm">{{ (m.fields ?? []).length }}</UBadge>
              <UTooltip text="删除模块">
                <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click.stop="dropModule(m)" />
              </UTooltip>
            </div>
            <p v-if="!wb.modules.some((x: any) => x.group_id === g.id)" class="px-2 py-1 text-xs text-muted">空分组 · 点上方 ＋ 加模块</p>
          </div>
        </div>
      </UCard>

      <div>
        <UCard v-if="!mod">
          <div class="py-16 text-center text-sm text-muted">选择左侧模块，或点右上「模块」新建</div>
        </UCard>

        <!-- 画布视图：总览为主，常用开关可就地改 -->
        <div v-else-if="view === 'canvas'" class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <UCard
            v-for="m in wb.modules" :key="m.id"
            :class="mod.id === m.id ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-accented'"
            :ui="{ wrapper: 'cursor-pointer' }" @click="activeId = m.id"
          >
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <span class="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                  <IconGlyph :value="m.icon" /><span class="truncate">{{ m.name }}</span>
                </span>
                <UBadge color="primary" variant="solid" size="sm">{{ (m.fields ?? []).length }}</UBadge>
              </div>
            </template>
            <p class="mb-2 truncate font-mono text-[11px] text-muted">{{ m.table_name }}</p>
            <div v-for="f in (m.fields ?? []).slice(0, 10)" :key="f.id" class="flex items-center gap-1.5 py-0.5 text-xs">
              <span class="min-w-0 flex-1 truncate font-mono">{{ f.col_key }}</span>
              <UBadge color="neutral" variant="subtle" size="sm">{{ f.type }}</UBadge>
              <UBadge v-if="f.pk" color="warning" variant="subtle" size="sm">PK</UBadge>
              <template v-else>
                <UTooltip v-for="[col, lab, key] in inlineToggles" :key="col" :text="lab">
                  <UCheckbox
                    :model-value="!!f[col]" :disabled="dirty !== ''"
                    @update:model-value="saveField(f, key, !!$event)" @click.stop
                  />
                </UTooltip>
              </template>
            </div>
            <p v-if="(m.fields ?? []).length > 10" class="pt-1 text-[11px] text-muted">… 还有 {{ (m.fields ?? []).length - 10 }} 个字段</p>
            <div v-if="!(m.fields ?? []).length" class="py-3 text-center">
              <p class="text-xs text-warning">还没有字段</p>
              <UButton class="mt-2" label="新建字段" size="xs" @click.stop="activeId = m.id; openFieldForm(null)" />
              <UButton class="mt-2" label="批量添加字段" size="xs" @click.stop="activeId = m.id; fOpen = true" />
            </div>
          </UCard>
        </div>

        <!-- 表格视图：完整编辑 -->
        <UCard v-else>
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <div class="w-36">
                <IconPicker :model-value="mod.icon" @update:model-value="setModuleIcon" />
              </div>
              <span class="text-sm font-semibold">{{ mod.name }}</span>
              <UBadge color="neutral" variant="subtle" size="sm" class="font-mono">{{ mod.table_name }}</UBadge>
              <UBadge color="primary" variant="subtle" size="sm">{{ (mod.fields ?? []).length }} 字段</UBadge>
              <UIcon v-if="iconSaving" name="i-lucide-loader-circle" class="size-4 animate-spin text-muted" />
              <span class="flex-1" />
              <UButton label="新建字段" icon="i-lucide-plus" size="sm" @click="openFieldForm(null)" />
              <UButton label="批量添加字段" icon="i-lucide-list-plus" size="sm" @click="fOpen = true" />
            </div>
          </template>

          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="border-b border-default text-left text-muted">
                  <th v-for="h in ['字段名','列名','类型','长度','必填','唯一','索引','列表','表单','查询','组件','字典','备注','']" :key="h" class="whitespace-nowrap p-2 font-medium">{{ h }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in mod.fields ?? []" :key="f.id" class="border-b border-muted">
                  <td class="p-1"><UInput size="xs" class="w-28" :model-value="f.name" @change="saveField(f, 'name', ($event.target as any).value)" /></td>
                  <td class="p-1 font-mono">{{ f.col_key }}</td>
                  <td class="p-1"><USelect size="xs" class="w-28" :items="FIELD_TYPES" value-key="v" label-key="label" :model-value="f.type" @update:model-value="saveField(f, 'type', $event)" /></td>
                  <td class="p-1"><UInput size="xs" type="number" class="w-16" :model-value="f.length" @change="saveField(f, 'length', Number(($event.target as any).value))" /></td>
                  <td v-for="[col, key] in [['required','required'],['uniq','uniq'],['indexed','indexed'],['list_show','listShow'],['form_show','formShow']]" :key="col" class="p-1 text-center">
                    <UCheckbox :model-value="!!f[col]" :disabled="dirty !== ''" @update:model-value="saveField(f, key, $event)" />
                  </td>
                  <td class="p-1"><USelect size="xs" class="w-24" :items="QUERY_OPTS" :model-value="f.query_type" @update:model-value="saveField(f, 'query', $event)" /></td>
                  <td class="p-1"><USelect size="xs" class="w-28" :items="COMPONENT_OPTS" :model-value="f.component" @update:model-value="saveField(f, 'component', $event)" /></td>
                  <td class="p-1">
                    <UInputMenu
                      size="xs" class="w-28" :model-value="f.dict_key" :items="dictKeys" placeholder="dict"
                      @update:model-value="saveField(f, 'dictKey', String($event ?? ''))"
                    />
                  </td>
                  <td class="p-1"><UInput size="xs" class="w-28" :model-value="f.remark" @change="saveField(f, 'remark', ($event.target as any).value)" /></td>
                  <td class="flex gap-1 p-1">
                    <UTooltip text="完整配置（枚举值、索引、详情/导出等）">
                      <UButton icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" @click="openFieldForm(f)" />
                    </UTooltip>
                    <UTooltip text="删除字段">
                      <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" @click="dropField(f)" />
                    </UTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-if="!(mod.fields ?? []).length" class="py-10 text-center">
              <p class="text-sm text-muted">该模块还没有字段</p>
              <UButton class="mt-3" label="新建字段" icon="i-lucide-plus" size="sm" @click="openFieldForm(null)" />
              <UButton class="mt-3" label="批量添加字段" icon="i-lucide-list-plus" size="sm" @click="fOpen = true" />
            </div>
          </div>
        </UCard>
      </div>
    </div>

    <DictPanelModal v-model:open="dictOpen" />

    <FieldFormModal v-model:open="ffOpen" :module="mod" :field="ffField" />

    <!-- 批量添加字段 -->
    <UModal v-model:open="fOpen" :title="`批量添加字段 · ${mod?.name ?? ''}`" :ui="{ content: 'sm:max-w-5xl' }">
      <template #body>
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th v-for="h in ['字段名','列名','类型','长度','必填','唯一','索引','列表','表单','查询','组件','字典']" :key="h" class="whitespace-nowrap p-1.5 font-medium">{{ h }}</th>
                <th class="w-8" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(r, i) in rows" :key="i" class="border-b border-muted">
                <td class="p-1"><UInput v-model="r.name" size="xs" class="w-24" placeholder="商品名称" /></td>
                <td class="p-1"><UInput v-model="r.colKey" size="xs" class="w-24 font-mono" placeholder="title" /></td>
                <td class="p-1"><USelect v-model="r.type" size="xs" class="w-24" :items="FIELD_TYPES" value-key="v" label-key="label" /></td>
                <td class="p-1"><UInput v-model.number="r.length" size="xs" type="number" class="w-14" /></td>
                <td class="p-1 text-center"><UCheckbox v-model="r.required" /></td>
                <td class="p-1 text-center"><UCheckbox v-model="r.uniq" /></td>
                <td class="p-1 text-center"><UCheckbox v-model="r.indexed" /></td>
                <td class="p-1 text-center"><UCheckbox v-model="r.listShow" /></td>
                <td class="p-1 text-center"><UCheckbox v-model="r.formShow" /></td>
                <td class="p-1"><USelect v-model="r.query" size="xs" class="w-20" :items="QUERY_OPTS" /></td>
                <td class="p-1"><USelect v-model="r.component" size="xs" class="w-24" :items="COMPONENT_OPTS" /></td>
                <td class="p-1"><UInputMenu v-model="r.dictKey" size="xs" class="w-24" :items="dictKeys" placeholder="dict" /></td>
                <td class="p-1"><UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" @click="delRow(i)" /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <UButton label="再加一行" icon="i-lucide-plus" size="xs" color="neutral" variant="outline" @click="addRow" />
          <span class="text-xs text-muted">已填 {{ validRows.length }} / {{ rows.length }} 行，空行提交时自动跳过</span>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton label="关闭" color="neutral" variant="ghost" @click="fOpen = false" />
          <UButton label="提交本批" icon="i-lucide-check" :loading="submitting" :disabled="!validRows.length" @click="submitRows" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="gOpen" title="新建分组">
      <template #body>
        <UForm :state="gForm" class="space-y-4">
          <UFormField label="分组名称" required><UInput v-model="gForm.name" class="w-full" placeholder="业务管理" /></UFormField>
          <UFormField label="图标" help="子后台侧边栏与工作台会用同一个图标">
            <IconPicker v-model="gForm.icon" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="gOpen = false" />
          <UButton label="创建" @click="addGroup" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="gEditOpen" :title="`编辑分组「${gEdit?.name ?? ''}」`">
      <template #body>
        <UForm :state="gEditForm" class="space-y-4">
          <UFormField label="分组名称" required><UInput v-model="gEditForm.name" class="w-full" /></UFormField>
          <UFormField label="图标"><IconPicker v-model="gEditForm.icon" /></UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="gEdit = null" />
          <UButton label="保存" @click="saveGroupEdit" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="mOpen" title="新建模块">
      <template #body>
        <UForm :state="mForm" class="space-y-4">
          <UFormField label="所属分组" required>
            <USelect v-model="mForm.groupId" class="w-full" :items="wb.groups" value-key="id" label-key="name" />
          </UFormField>
          <UFormField label="模块名称" required><UInput v-model="mForm.name" class="w-full" placeholder="商品" /></UFormField>
          <UFormField label="图标" help="建完也能在模块头部随时改">
            <IconPicker v-model="mForm.icon" />
          </UFormField>
          <UFormField label="表名" help="留空自动生成。中文名会由表名推导资源键，建议填英文表名">
            <UInput v-model="mForm.tableName" class="w-full font-mono" placeholder="biz_goods" />
          </UFormField>
          <UFormField label="备注"><UInput v-model="mForm.comment" class="w-full" placeholder="商品主表" /></UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="mOpen = false" />
          <UButton label="创建并加字段" icon="i-lucide-arrow-right" @click="addModule" />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="importOpen" title="批量导入建模（JSON）" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body>
        <UTextarea v-model="importText" :rows="12" class="w-full font-mono text-xs"
          placeholder='{"groups":[{"name":"业务管理","icon":"📁","modules":[{"name":"商品","key":"goods","tableName":"biz_goods","fields":[{"name":"商品名称","colKey":"title","type":"varchar","length":128,"required":true}]}]}]}' />
        <p class="mt-2 text-xs text-muted">按结构新建分组/模块/字段，同名的跳过。</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="ghost" @click="importOpen = false" />
          <UButton label="导入" :disabled="!importText.trim()" @click="importJson" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="!!delGroup"
      :title="`删除分组「${delGroup?.name ?? ''}」？`"
      description="该分组下的模块与字段会一并删除，且不可恢复。"
    >
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton label="取消" color="neutral" variant="outline" @click="close" />
          <UButton label="删除" color="error" icon="i-lucide-trash-2" @click="dropGroup(delGroup); close()" />
        </div>
      </template>
    </UModal>
  </div>
</template>
