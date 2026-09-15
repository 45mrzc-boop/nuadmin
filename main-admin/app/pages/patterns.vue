<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

/**
 * 组合范例：每类 5 套真实可交互方案，用于一次性确认「整页长什么样」。
 * 与组件库的分工：组件库=原子选型，这里=方案择一。
 */
const CATS = [
  { label: '页面布局', value: 'page', hint: '标题栏 / 工具栏 / 内容区怎么组织' },
  { label: '数据表格', value: 'table', hint: '表格本身的形态与密度' },
  { label: '表格·搜索·分页·编辑', value: 'crud', hint: '完整列表页：筛选 + 分页 + 行操作' },
  { label: '表单', value: 'form', hint: '页内表单的排布方式' },
  { label: '弹窗表单', value: 'dialog', hint: 'Modal / Slideover / Drawer / 全屏' }
]
const cat = ref('page')

/** 当前生成器采用的方案编号，便于你对照确认。 */
const CURRENT: Record<string, number> = { page: 1, table: 1, crud: 1, form: 1, dialog: 1 }

const cols = [
  { accessorKey: 'id', header: '编号' },
  { accessorKey: 'name', header: '名称' },
  { accessorKey: 'owner', header: '负责人' },
  { accessorKey: 'status', header: '状态' },
  { accessorKey: 'amount', header: '金额', meta: { align: 'right' as const } },
  { accessorKey: 'due', header: '截止日期' }
]

const rows = [
  { id: 1024, name: '水表轮换巡检', owner: '张三', status: '进行中', amount: 12800, due: '2026-09-18' },
  { id: 1025, name: '管网压力标定', owner: '李四', status: '待审批', amount: 4600, due: '2026-09-21' },
  { id: 1026, name: '抄表员排班调整', owner: '王五', status: '已完成', amount: 0, due: '2026-09-12' },
  { id: 1027, name: '二次供水清洗', owner: '赵六', status: '已暂停', amount: 23500, due: '2026-10-02' }
]
const STATUS: Record<string, any> = {
  进行中: 'info', 待审批: 'warning', 已完成: 'success', 已暂停: 'neutral'
}

const fields = [
  { name: 'code', label: '工单编号', placeholder: '自动生成' },
  { name: 'title', label: '标题', placeholder: '请输入标题' },
  { name: 'owner', label: '负责人', placeholder: '选择负责人' },
  { name: 'amount', label: '金额', placeholder: '0.00' },
  { name: 'due', label: '截止日期', placeholder: '选择日期' },
  { name: 'note', label: '备注', placeholder: '补充说明' }
]

const sel = ref('进行中')
const kw = ref('')
const page = ref(1)
const perPage = ref(4)
const checked = ref<any[]>([1024])
const treeSel = ref('管网')
const modalOpen = ref(false)
const slideoverOpen = ref(false)
const drawerOpen = ref(false)
const fullscreenOpen = ref(false)
const pickerOpen = ref(false)
const step = ref(0)
const editRow = ref<number | null>(null)
const editDraft = ref<Record<string, any>>({})
const total = computed(() => rows.length)

/* ══════════ 以下为 table / crud / form / dialog 四个分区所需状态与派生数据 ══════════ */

const OWNERS = ['张三', '李四', '王五', '赵六']
const STATUSES = ['进行中', '待审批', '已完成', '已暂停']
const STATUS_ITEMS = ['全部', ...STATUSES]
const STATUS_CHECKS = STATUSES.map(s => ({ label: s, value: s }))
/** 占比条配色：primary 与 success 在本主题里都是绿色，混用会看不出分段，故取色相差异大的四个 */
const SEG_COLORS = ['info', 'warning', 'success', 'neutral'] as const

/** UTable 只认 meta.class，不认 meta.align；金额列右对齐+等宽数字必须走 meta.class。 */
const colsEnd = cols.map(c => c.accessorKey === 'amount'
  ? { ...c, meta: { class: { th: 'text-end', td: 'text-end tabular-nums' } } }
  : c)
const colsActions = { id: 'actions', header: '操作', meta: { class: { th: 'text-end', td: 'text-end' } } }
const colsSelect = { id: 'select', header: '' }
const colsPick = { id: 'pick', header: '' }
/** 列表页列集合（窄一点，避免卡片内横向滚动） */
const colsCrud = [colsSelect, ...colsEnd, colsActions]
const colsCrudNoSel = [...colsEnd, colsActions]
/** 只读明细表：无操作列 */
const colsReadonly = colsEnd.filter(c => ['name', 'owner', 'status', 'amount'].includes(c.accessorKey))
const colsCompact = colsEnd.filter(c => ['id', 'name', 'owner', 'due'].includes(c.accessorKey))
const colsPickTable = [colsPick, ...colsEnd.filter(c => ['name', 'owner', 'status'].includes(c.accessorKey))]

/** 列表页用可交互副本：扩充到 12 条，分页 / 批量 / 行内编辑才有真实观感。 */
const live = ref(rows.flatMap((r, i) => [0, 1, 2].map(k => ({
  ...r,
  id: r.id + i * 100 + k,
  name: k === 0 ? r.name : `${r.name} · ${k + 1} 期`,
  owner: OWNERS[(i + k) % OWNERS.length],
  amount: r.amount + k * 1500
}))))

const advOwner = ref('全部')
const advStatus = ref<string[]>([])
const dateFrom = ref<any>()
const dateTo = ref<any>()
const amountRange = ref([0, 30000])
const editDue = ref<any>()
const rowEditOpen = ref(false)
const drawerDraft = ref<Record<string, any>>({})
const drawerDue = ref<any>()
const pickedId = ref<number | null>(1025)
const PICK_SIZE = 2
/** 批量改状态的目标值，刻意与筛选条件 sel 分开，避免改数据时顺带把列表过滤掉 */
const batchSel = ref(STATUSES[0])

const form = reactive<Record<string, any>>({
  code: 'GD-1024', title: '管网压力标定', owner: '李四', amount: 4600, due: undefined, note: ''
})

/** 表单方案里按名取字段子集 */
const F = (...names: string[]) => fields.filter(f => names.includes(f.name))
/** 备注这类长字段在网格里跨两列 */
const wide = (f: any) => (f.name === 'note' ? 'sm:col-span-2' : '')

/** CalendarDate / Date / 字符串统一转成 YYYY-MM-DD 便于比较 */
function isoOf(v: any): string | null {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  const s = typeof v.toString === 'function' ? v.toString() : ''
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const money = (n: number) => `¥${(n ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** 五个列表页方案共用同一套筛选条件，便于横向对比同数据下的不同排布 */
const filtered = computed(() => live.value.filter(r => {
  if (kw.value && !`${r.id} ${r.name} ${r.owner}`.toLowerCase().includes(kw.value.trim().toLowerCase())) return false
  if (sel.value !== '全部' && r.status !== sel.value) return false
  if (advStatus.value.length && !advStatus.value.includes(r.status)) return false
  if (advOwner.value !== '全部' && r.owner !== advOwner.value) return false
  const from = isoOf(dateFrom.value)
  const to = isoOf(dateTo.value)
  if (from && r.due < from) return false
  if (to && r.due > to) return false
  if (r.amount < amountRange.value[0] || r.amount > amountRange.value[1]) return false
  return true
}))
const paged = computed(() => filtered.value.slice((page.value - 1) * perPage.value, page.value * perPage.value))
const sumAmount = computed(() => filtered.value.reduce((s, r) => s + r.amount, 0))
const rowsAmount = computed(() => rows.reduce((s, r) => s + r.amount, 0))
const maxAmount = computed(() => Math.max(...rows.map(r => r.amount)))
const avgAmount = computed(() => Math.round(rowsAmount.value / rows.length))
const amountSegs = computed(() => rows.filter(r => r.amount > 0)
  .map((r, i) => ({ label: r.name, value: r.amount, color: SEG_COLORS[i % SEG_COLORS.length] })))
const pickPaged = computed(() => rows.slice((page.value - 1) * PICK_SIZE, page.value * PICK_SIZE))
const picked = computed(() => rows.find(r => r.id === pickedId.value) ?? null)
const allChecked = computed(() => paged.value.length > 0 && paged.value.every(r => checked.value.includes(r.id)))

watch([kw, sel, advStatus, advOwner, dateFrom, dateTo, amountRange], () => { page.value = 1 })

/** 进入列表页分区时把共享的状态筛选置为「全部」：5 套方案都是同一份数据，
 *  预置筛选会让每屏只剩 3 条，分页与吸顶都看不出效果。 */
watch(cat, v => { if (v === 'crud') sel.value = '全部' }, { immediate: true })

function resetFilters() {
  kw.value = ''
  sel.value = '全部'
  advOwner.value = '全部'
  advStatus.value = []
  dateFrom.value = undefined
  dateTo.value = undefined
  amountRange.value = [0, 30000]
  page.value = 1
}
function toggleAll(v: boolean | 'indeterminate') {
  const ids = paged.value.map(r => r.id)
  checked.value = v ? [...new Set([...checked.value, ...ids])] : checked.value.filter(id => !ids.includes(id as number))
}
function toggleRow(id: number, v: boolean | 'indeterminate') {
  checked.value = v ? [...checked.value, id] : checked.value.filter(x => x !== id)
}
function batchStatus(s: string) {
  live.value.forEach(r => { if (checked.value.includes(r.id)) r.status = s })
  toast.add({ title: '批量改状态完成', description: `${checked.value.length} 条已置为「${s}」`, color: 'success' })
  checked.value = []
}
function batchDelete() {
  const n = checked.value.length
  live.value = live.value.filter(r => !checked.value.includes(r.id))
  checked.value = []
  toast.add({ title: '批量删除完成', description: `已删除 ${n} 条，可在回收站恢复`, color: 'warning' })
}

function openRowEdit(r: any) {
  drawerDraft.value = { priority: '普通', inspect: false, ...r }
  drawerDue.value = undefined
  rowEditOpen.value = true
}
function saveRowEdit() {
  const i = live.value.findIndex(r => r.id === drawerDraft.value.id)
  if (i > -1) live.value[i] = { ...live.value[i], ...drawerDraft.value, due: isoOf(drawerDue.value) ?? live.value[i].due }
  rowEditOpen.value = false
  toast.add({ title: '已保存', description: `工单 #${drawerDraft.value.id} 已更新`, color: 'success' })
}

function cancelEdit() {
  editRow.value = null
  editDue.value = undefined
}

function pickRow(_e: any, row: any) { pickedId.value = row.original.id }

function submitForm(tag: string) {
  toast.add({ title: '校验通过', description: `${tag} · ${form.title || '（标题为空）'}`, color: 'success' })
}

const STEP_ITEMS = [
  { title: '基本信息', description: '编号 / 标题 / 负责人', slot: 'base' },
  { title: '明细', description: '金额 / 截止日期', slot: 'detail' },
  { title: '确认', description: '复核并提交', slot: 'confirm' }
]
function prevStep() { if (step.value > 0) step.value -= 1 }
function nextStep() { if (step.value < STEP_ITEMS.length - 1) step.value += 1 }

function startEdit(r: any) {
  editRow.value = r.id
  editDraft.value = { ...r }
  editDue.value = undefined
}
function saveEdit() {
  const i = live.value.findIndex(r => r.id === editRow.value)
  if (i > -1) live.value[i] = { ...live.value[i], ...editDraft.value, due: isoOf(editDue.value) ?? live.value[i].due }
  editRow.value = null
  editDue.value = undefined
  toast.add({ title: '已保存', description: `工单 #${editDraft.value.id} 的行内修改已写入`, color: 'success' })
}
</script>

<template>
  <UDashboardPanel id="patterns">
    <template #header>
      <UDashboardNavbar title="组合范例 · 方案确认">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UBadge color="neutral" variant="subtle">5 类 × 5 套</UBadge>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UTabs v-model="cat" size="xs" :items="CATS.map(c => ({ label: c.label, value: c.value }))" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
        <UAlert
          color="info" variant="subtle" icon="i-lucide-git-compare-arrows"
          :title="CATS.find(c => c.value === cat)?.hint ?? ''"
          description="每套都是可交互的真实组件。绿色标记 = 当前生成器已采用；你只需指出每类要保留第几套。"
        />

        <!-- ══════════ 页面布局 ══════════ -->
        <template v-if="cat === 'page'">
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UBadge v-if="CURRENT.page === 1" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 1 · 经典：面包屑 + 标题行 + 工具栏</span>
              </div>
            </template>
            <div class="rounded-lg border border-muted">
              <div class="flex items-center gap-2 border-b border-muted px-3 py-2 text-xs text-muted">
                <UIcon name="i-lucide-home" /> / 业务管理 / 工单
              </div>
              <div class="flex flex-wrap items-center gap-2 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold">工单管理</h3>
                  <p class="text-xs text-muted">共 {{ total }} 条，进行中 1 条</p>
                </div>
                <UButton label="新建" icon="i-lucide-plus" size="xs" />
                <UButton label="导出" icon="i-lucide-download" size="xs" color="neutral" variant="outline" />
              </div>
              <div class="border-t border-muted p-4 text-xs text-muted">内容区（表格 / 卡片）</div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UBadge v-if="CURRENT.page === 2" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 2 · 整页单卡，操作收在卡头</span>
              </div>
            </template>
            <div class="rounded-lg border border-muted bg-elevated/40 p-3">
              <div class="flex flex-wrap items-center gap-2">
                <UIcon name="i-lucide-clipboard-list" class="size-5 text-primary" />
                <div class="min-w-0 flex-1">
                  <h3 class="text-sm font-semibold">工单管理</h3>
                  <p class="text-xs text-muted">标题与说明同处一卡，无面包屑</p>
                </div>
                <UButton label="新建" size="xs" />
              </div>
              <div class="mt-3 rounded-md border border-muted bg-default p-4 text-xs text-muted">内容区</div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UBadge v-if="CURRENT.page === 3" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 3 · 页头 + 分区 Tab</span>
              </div>
            </template>
            <div class="rounded-lg border border-muted">
              <div class="flex items-center gap-2 px-4 py-3">
                <h3 class="min-w-0 flex-1 text-sm font-semibold">工单管理</h3>
                <UButton label="新建" size="xs" />
              </div>
              <div class="flex gap-1 border-y border-muted px-3">
                <div v-for="t in ['列表', '统计', '设置']" :key="t"
                  class="cursor-pointer border-b-2 px-3 py-2 text-xs"
                  :class="t === '列表' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted'">
                  {{ t }}
                </div>
              </div>
              <div class="p-4 text-xs text-muted">当前分区内容</div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UBadge v-if="CURRENT.page === 4" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 4 · 极紧凑：工具栏吸顶，无页头</span>
              </div>
            </template>
            <div class="rounded-lg border border-muted">
              <div class="flex flex-wrap items-center gap-2 bg-elevated/60 px-3 py-2">
                <UInput v-model="kw" icon="i-lucide-search" size="xs" placeholder="搜索" class="w-40" />
                <USelect v-model="sel" :items="['全部', '进行中', '待审批']" size="xs" class="w-28" />
                <span class="flex-1" />
                <UButton label="新建" icon="i-lucide-plus" size="xs" variant="solid" />
              </div>
              <div class="p-3 text-xs text-muted">直接进入表格，信息密度最高，适合高频操作场景</div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UBadge v-if="CURRENT.page === 5" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 5 · 左树右表双栏</span>
              </div>
            </template>
            <div class="grid grid-cols-[180px_1fr] gap-3 rounded-lg border border-muted p-3">
              <div class="rounded-md bg-elevated/50 p-2 text-xs">
                <p class="mb-1 font-semibold text-muted">组织树</p>
                <div v-for="t in ['全部', '管网', '抄表', '客服']" :key="t"
                  class="cursor-pointer rounded px-2 py-1" :class="treeSel === t ? 'bg-primary/10 text-primary font-medium' : 'text-default'"
                  @click="treeSel = t">{{ t }}</div>
              </div>
              <div class="rounded-md border border-muted p-3 text-xs text-muted">右侧内容随左侧选择联动</div>
            </div>
          </UCard>
        </template>

        <!-- ══════════ 数据表格 ══════════ -->
        <template v-if="cat === 'table'">
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.table === 1" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 1 · 标准：边框 + 斑马纹 + 悬停高亮</span>
                <span class="text-xs text-muted">合计放在表格下方（HTML caption 置于 bottom）</span>
              </div>
            </template>
            <div class="rounded-lg border border-default">
              <UTable
                :data="rows" :columns="colsEnd"
                :ui="{
                  caption: 'not-sr-only caption-bottom border-t border-default px-4 py-2.5 text-xs text-muted text-start',
                  tr: 'odd:bg-elevated/40 hover:bg-elevated/70!'
                }"
              >
                <template #caption>
                  共 {{ rows.length }} 条记录，金额合计
                  <span class="font-medium text-highlighted tabular-nums">{{ money(rowsAmount) }}</span>
                </template>
              </UTable>
            </div>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.table === 2" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 2 · 紧凑无边框</span>
                <span class="text-xs text-muted">仅行间分隔线，字号更小（UTable 无 density 属性，用 ui 覆盖内边距实现）</span>
              </div>
            </template>
            <UTable
              :data="rows" :columns="colsCompact"
              :ui="{
                root: 'overflow-visible',
                th: 'px-3 py-1.5 text-xs font-medium text-muted border-b border-default',
                td: 'px-3 py-1.5 text-xs',
                tbody: 'divide-y divide-muted'
              }"
            />
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.table === 3" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 3 · 富单元格</span>
                <span class="text-xs text-muted">状态用徽章、负责人用头像、金额右对齐等宽数字</span>
              </div>
            </template>
            <div class="rounded-lg border border-default">
              <UTable :data="rows" :columns="colsEnd">
                <template #owner-cell="{ row }">
                  <div class="flex items-center gap-2">
                    <UAvatar icon="i-lucide-user" :alt="row.original.owner" size="xs" />
                    <span class="text-sm text-default">{{ row.original.owner }}</span>
                  </div>
                </template>
                <template #status-cell="{ row }">
                  <UBadge :color="STATUS[row.original.status] ?? 'neutral'" variant="subtle" size="sm" :label="row.original.status" />
                </template>
                <template #amount-cell="{ row }">
                  <span :class="row.original.amount ? 'text-highlighted' : 'text-dimmed'">{{ money(row.original.amount) }}</span>
                </template>
                <template #due-cell="{ row }">
                  <span class="tabular-nums">{{ row.original.due }}</span>
                </template>
              </UTable>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.table === 4" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 4 · 卡片式行（移动端友好）</span>
                <span class="text-xs text-muted">不用表格，每条数据一张卡纵向堆叠</span>
              </div>
            </template>
            <div class="space-y-3">
              <div v-for="r in rows" :key="r.id" class="rounded-lg border border-muted bg-elevated/30 p-3">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-sm font-semibold text-default">{{ r.name }}</span>
                  <UBadge :color="STATUS[r.status] ?? 'neutral'" variant="subtle" size="sm" :label="r.status" />
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span class="flex items-center gap-1"><UAvatar icon="i-lucide-user" size="xs" />{{ r.owner }}</span>
                  <span class="flex items-center gap-1"><UIcon name="i-lucide-hash" class="size-3.5" />{{ r.id }}</span>
                  <span class="flex items-center gap-1"><UIcon name="i-lucide-calendar-days" class="size-3.5" />{{ r.due }}</span>
                  <span class="ms-auto text-sm font-semibold text-highlighted tabular-nums">{{ money(r.amount) }}</span>
                </div>
                <USeparator class="my-2.5" />
                <div class="flex items-center gap-2">
                  <UButton label="详情" size="xs" color="neutral" variant="outline" />
                  <UButton label="编辑" size="xs" icon="i-lucide-pencil" />
                  <UButton label="删除" size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" class="ms-auto" />
                </div>
              </div>
            </div>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.table === 5" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 5 · 只读明细表</span>
                <span class="text-xs text-muted">无操作列，底部用占比条展示金额构成 + 汇总行</span>
              </div>
            </template>
            <UTable
              :data="rows" :columns="colsReadonly"
              :ui="{ td: 'text-xs', th: 'text-xs' }"
            >
              <template #status-cell="{ row }">
                <UBadge :color="STATUS[row.original.status] ?? 'neutral'" variant="outline" size="sm" :label="row.original.status" />
              </template>
              <template #amount-cell="{ row }">
                <span class="tabular-nums text-default">{{ money(row.original.amount) }}</span>
              </template>
            </UTable>
            <USeparator />
            <div class="space-y-3 p-4">
              <p class="text-xs font-medium text-muted">金额构成占比</p>
              <UProgressGroup :max="rowsAmount" :items="amountSegs" size="sm" />
              <USeparator class="pt-3" />
              <div class="grid grid-cols-2 gap-y-1.5 text-sm sm:grid-cols-4">
                <span class="text-muted">记录数</span>
                <span class="text-default tabular-nums">{{ rows.length }} 条</span>
                <span class="text-muted">金额合计</span>
                <span class="font-semibold text-highlighted tabular-nums">{{ money(rowsAmount) }}</span>
                <span class="text-muted">单笔最大</span>
                <span class="text-default tabular-nums">{{ money(maxAmount) }}</span>
                <span class="text-muted">平均金额</span>
                <span class="text-default tabular-nums">{{ money(avgAmount) }}</span>
              </div>
            </div>
          </UCard>
        </template>

        <!-- ══════════ 表格 · 搜索 · 分页 · 编辑 ══════════ -->
        <template v-if="cat === 'crud'">
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.crud === 1" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 1 · 吸顶搜索条 + 右上分页</span>
                <span class="text-xs text-muted">在卡内滚动区里向下滚，搜索条不会跟着走</span>
              </div>
            </template>
            <div class="max-h-[260px] overflow-y-auto rounded-lg border border-default">
              <div class="sticky top-0 z-1 flex flex-wrap items-center gap-2 border-b border-default bg-elevated/95 px-3 py-2 backdrop-blur">
                <UInput v-model="kw" icon="i-lucide-search" size="sm" placeholder="编号 / 名称 / 负责人" class="w-52" />
                <USelect v-model="sel" :items="STATUS_ITEMS" size="sm" class="w-28" />
                <UButton label="重置" icon="i-lucide-rotate-ccw" size="sm" color="neutral" variant="outline" @click="resetFilters" />
                <span class="text-xs text-muted">筛出 {{ filtered.length }} / {{ live.length }} 条</span>
                <span class="flex-1" />
                <UPagination v-model:page="page" :total="filtered.length" :items-per-page="perPage" :sibling-count="1" size="xs" />
              </div>
              <UTable :data="paged" :columns="colsCrudNoSel">
                <template #owner-cell="{ row }">
                  <div class="flex items-center gap-2">
                    <UAvatar icon="i-lucide-user" :alt="row.original.owner" size="xs" />
                    <span class="text-sm text-default">{{ row.original.owner }}</span>
                  </div>
                </template>
                <template #status-cell="{ row }">
                  <UBadge :color="STATUS[row.original.status] ?? 'neutral'" variant="subtle" size="sm" :label="row.original.status" />
                </template>
                <template #amount-cell="{ row }">
                  <span class="tabular-nums text-default">{{ money(row.original.amount) }}</span>
                </template>
                <template #actions-cell="{ row }">
                  <div class="flex items-center justify-end gap-1">
                    <UButton label="详情" size="xs" color="neutral" variant="link" />
                    <USeparator orientation="vertical" class="h-4" />
                    <UButton label="编辑" size="xs" color="neutral" variant="link" />
                    <USeparator orientation="vertical" class="h-4" />
                    <UButton label="删除" size="xs" color="error" variant="link" />
                  </div>
                </template>
                <template #empty>
                  <div class="py-8">
                    没有符合条件的工单，试试
                    <UButton label="重置条件" size="xs" variant="link" @click="resetFilters" />
                  </div>
                </template>
              </UTable>
            </div>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.crud === 2" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 2 · 可折叠高级筛选 + 底部居中分页</span>
                <span class="text-xs text-muted">常用条件外露，次要条件收进折叠区</span>
              </div>
            </template>
            <div class="rounded-lg border border-default">
              <div class="flex flex-wrap items-center gap-2 px-3 py-2">
                <UInput v-model="kw" icon="i-lucide-search" size="sm" placeholder="关键字" class="w-56" />
                <UButton label="查询" icon="i-lucide-search" size="sm" @click="page = 1" />
                <UButton label="重置" size="sm" color="neutral" variant="outline" @click="resetFilters" />
                <span class="flex-1" />
                <span class="text-xs text-muted">筛出 {{ filtered.length }} 条</span>
              </div>
              <div class="border-y border-default px-3">
                <UAccordion :items="[{ label: '高级筛选', icon: 'i-lucide-sliders-horizontal', slot: 'adv' }]" type="single" collapsible>
                  <template #adv>
                    <div class="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-4">
                      <UFormField label="状态">
                        <USelect v-model="sel" :items="STATUS_ITEMS" class="w-full" />
                      </UFormField>
                      <UFormField label="截止日期起">
                        <UInputDate v-model="dateFrom" class="w-full" />
                      </UFormField>
                      <UFormField label="截止日期止">
                        <UInputDate v-model="dateTo" class="w-full" />
                      </UFormField>
                      <UFormField label="负责人">
                        <USelectMenu v-model="advOwner" :items="['全部', ...OWNERS]" class="w-full" />
                      </UFormField>
                    </div>
                  </template>
                </UAccordion>
              </div>
              <UTable
                :data="paged" :columns="colsCrudNoSel"
                :ui="{ th: 'px-4 py-2.5 text-xs', td: 'px-4 py-2.5 text-xs' }"
              >
                <template #status-cell="{ row }">
                  <UBadge :color="STATUS[row.original.status] ?? 'neutral'" variant="subtle" size="sm" :label="row.original.status" />
                </template>
                <template #amount-cell="{ row }">
                  <span class="tabular-nums text-default">{{ money(row.original.amount) }}</span>
                </template>
                <template #actions-cell>
                  <UButton label="查看" size="xs" color="neutral" variant="outline" />
                </template>
              </UTable>
              <div class="flex items-center justify-center border-t border-default px-3 py-2.5">
                <UPagination v-model:page="page" :total="filtered.length" :items-per-page="perPage" :sibling-count="1" size="sm" />
              </div>
            </div>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.crud === 3" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 3 · 侧边筛选面板（可拖动分隔条）</span>
                <span class="text-xs text-muted">条件多且不常用时收在左栏，主区留给表格</span>
              </div>
            </template>
            <USplitter id="side-filter" :items="[{ id: 'f', slot: 'filters', defaultSize: 24, minSize: 16 }, { id: 't', slot: 'table', defaultSize: 76, minSize: 50 }]" :ui="{ handle: 'w-2 bg-transparent transition-colors hover:bg-primary/10 data-[panel-resize-handle-state=drag]:bg-primary/20', root: 'min-h-[360px]' }">
              <template #resize-handle>
                <div class="mx-auto h-full w-px bg-default" />
              </template>
              <template #filters>
                <div class="min-w-0 flex-1 space-y-4 border border-default p-3">
                  <div>
                    <p class="mb-1.5 text-xs font-semibold text-muted">关键字</p>
                    <UInput v-model="kw" icon="i-lucide-search" size="sm" placeholder="名称 / 负责人" class="w-full" />
                  </div>
                  <UCheckboxGroup v-model="advStatus" :items="STATUS_CHECKS" legend="状态（多选）" orientation="vertical" class="w-full" />
                  <UFormField label="负责人">
                    <USelectMenu v-model="advOwner" :items="['全部', ...OWNERS]" size="sm" class="w-full" />
                  </UFormField>
                  <div>
                    <p class="mb-2 text-xs font-semibold text-muted">金额区间</p>
                    <USlider v-model="amountRange" :min="0" :max="30000" :step="500" class="w-full" />
                    <p class="mt-1.5 text-xs text-muted tabular-nums">{{ money(amountRange[0]) }} ~ {{ money(amountRange[1]) }}</p>
                  </div>
                  <UButton label="清空全部条件" icon="i-lucide-rotate-ccw" size="xs" color="neutral" variant="ghost" block @click="resetFilters" />
                </div>
              </template>
              <template #table>
                <div class="min-w-0 flex-1 space-y-2">
                  <div class="flex flex-wrap items-center gap-2">
                    <UPagination v-model:page="page" :total="filtered.length" :items-per-page="perPage" :sibling-count="1" size="xs" />
                    <span class="text-xs text-muted">筛出 {{ filtered.length }} 条，合计 {{ money(sumAmount) }}</span>
                  </div>
                  <UTable
                    :data="paged" :columns="colsCrudNoSel" class="border border-default"
                    :ui="{ th: 'px-3 py-2 text-xs', td: 'px-3 py-2 text-xs' }"
                  >
                    <template #status-cell="{ row }">
                      <UBadge :color="STATUS[row.original.status] ?? 'neutral'" variant="subtle" size="sm" :label="row.original.status" />
                    </template>
                    <template #amount-cell="{ row }">
                      <span class="tabular-nums text-default">{{ money(row.original.amount) }}</span>
                    </template>
                    <template #actions-cell>
                      <UButton label="编辑" size="xs" color="neutral" variant="outline" />
                    </template>
                  </UTable>
                </div>
              </template>
            </USplitter>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.crud === 4" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 4 · 行内编辑</span>
                <span class="text-xs text-muted">点「编辑」该行变成输入框，保存后写回并弹提示</span>
              </div>
            </template>
            <div class="rounded-lg border border-default">
              <UTable
                :data="paged" :columns="colsCrudNoSel"
                :ui="{ th: 'px-3 py-2.5 text-xs', td: 'px-3 py-2.5' }"
              >
                <template #name-cell="{ row }">
                  <UInput v-if="editRow === row.original.id" v-model="editDraft.name" size="sm" class="w-full" />
                  <span v-else class="text-sm text-default">{{ row.original.name }}</span>
                </template>
                <template #owner-cell="{ row }">
                  <USelect v-if="editRow === row.original.id" v-model="editDraft.owner" :items="OWNERS" size="sm" class="w-full" />
                  <span v-else class="text-sm text-default">{{ row.original.owner }}</span>
                </template>
                <template #status-cell="{ row }">
                  <USelect v-if="editRow === row.original.id" v-model="editDraft.status" :items="STATUSES" size="sm" class="w-full" />
                  <UBadge v-else :color="STATUS[row.original.status] ?? 'neutral'" variant="subtle" size="sm" :label="row.original.status" />
                </template>
                <template #amount-cell="{ row }">
                  <UInputNumber v-if="editRow === row.original.id" v-model="editDraft.amount" :step="100" size="sm" class="w-full" />
                  <span v-else class="text-sm text-default tabular-nums">{{ money(row.original.amount) }}</span>
                </template>
                <template #due-cell="{ row }">
                  <UInputDate v-if="editRow === row.original.id" v-model="editDue" size="sm" />
                  <span v-else class="text-sm text-default tabular-nums">{{ row.original.due }}</span>
                </template>
                <template #actions-cell="{ row }">
                  <div v-if="editRow === row.original.id" class="flex items-center justify-end gap-1.5">
                    <UButton label="取消" size="xs" color="neutral" variant="ghost" @click="cancelEdit" />
                    <UButton label="保存" size="xs" icon="i-lucide-check" @click="saveEdit" />
                  </div>
                  <div v-else class="flex items-center justify-end gap-1.5">
                    <UButton label="编辑" size="xs" color="neutral" variant="outline" icon="i-lucide-square-pen" :disabled="editRow !== null" @click="startEdit(row.original)" />
                  </div>
                </template>
              </UTable>
            </div>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.crud === 5" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 5 · 勾选批量 + 侧栏编辑</span>
                <span class="text-xs text-muted">表头全选、选中浮出批量条、编辑走 Slideover</span>
              </div>
            </template>
            <div class="rounded-lg border border-default">
              <div v-if="checked.length" class="flex flex-wrap items-center gap-2 border-b border-default bg-primary/10 px-3 py-2">
                <span class="text-xs font-medium text-primary">已选 {{ checked.length }} 项</span>
                <USeparator orientation="vertical" class="h-4" />
                <USelect v-model="batchSel" :items="STATUSES" size="xs" class="w-24" />
                <UButton label="批量改状态" size="xs" @click="batchStatus(batchSel)" />
                <UButton label="批量删除" size="xs" color="error" variant="soft" icon="i-lucide-trash-2" @click="batchDelete" />
                <UButton label="取消选择" size="xs" color="neutral" variant="ghost" @click="checked = []" />
              </div>
              <UTable
                :data="paged" :columns="colsCrud"
                :ui="{ th: 'px-3 py-2.5 text-xs', td: 'px-3 py-2.5' }"
              >
                <template #select-header>
                  <UCheckbox
                    :model-value="allChecked ? true : 'indeterminate'"
                    aria-label="全选本页"
                    @update:model-value="toggleAll"
                  />
                </template>
                <template #select-cell="{ row }">
                  <UCheckbox
                    :model-value="checked.includes(row.original.id)"
                    :aria-label="`选择 ${row.original.name}`"
                    @update:model-value="toggleRow(row.original.id, $event)"
                  />
                </template>
                <template #status-cell="{ row }">
                  <UBadge :color="STATUS[row.original.status] ?? 'neutral'" variant="subtle" size="sm" :label="row.original.status" />
                </template>
                <template #amount-cell="{ row }">
                  <span class="tabular-nums text-default">{{ money(row.original.amount) }}</span>
                </template>
                <template #actions-cell="{ row }">
                  <div class="flex items-center justify-end gap-1.5">
                    <UButton label="编辑" size="xs" color="neutral" variant="outline" icon="i-lucide-square-pen" @click="openRowEdit(row.original)" />
                  </div>
                </template>
              </UTable>
              <div class="flex flex-wrap items-center gap-2 border-t border-default px-3 py-2.5">
                <UPagination v-model:page="page" :total="filtered.length" :items-per-page="perPage" :sibling-count="1" size="xs" />
                <span class="text-xs text-muted">已选 {{ checked.length }} / 筛出 {{ filtered.length }} 条</span>
              </div>
            </div>

            <USlideover v-model:open="rowEditOpen" title="编辑工单" :description="`编号 #${drawerDraft.id ?? ''}`" :ui="{ content: 'sm:w-[520px] sm:max-w-[520px]' }">
              <template #body>
                <UForm id="crud-row-form" :state="drawerDraft" class="space-y-4" @submit="saveRowEdit">
                  <UFormField label="名称" name="name">
                    <UInput v-model="drawerDraft.name" class="w-full" />
                  </UFormField>
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <UFormField label="负责人" name="owner">
                      <USelect v-model="drawerDraft.owner" :items="OWNERS" class="w-full" />
                    </UFormField>
                    <UFormField label="状态" name="status">
                      <USelect v-model="drawerDraft.status" :items="STATUSES" class="w-full" />
                    </UFormField>
                    <UFormField label="金额" name="amount">
                      <UInputNumber v-model="drawerDraft.amount" :step="100" class="w-full" />
                    </UFormField>
                    <UFormField label="截止日期">
                      <UInputDate v-model="drawerDue" class="w-full" />
                    </UFormField>
                    <UFormField label="优先级" name="priority">
                      <USelectMenu v-model="drawerDraft.priority" :items="['普通', '紧急', '特急']" class="w-full" />
                    </UFormField>
                    <UFormField label="需要巡检">
                      <USwitch v-model="drawerDraft.inspect" />
                    </UFormField>
                  </div>
                </UForm>
              </template>
              <template #footer>
                <div class="flex w-full justify-end gap-2">
                  <UButton label="取消" color="neutral" variant="outline" @click="rowEditOpen = false" />
                  <UButton label="保存" type="submit" form="crud-row-form" />
                </div>
              </template>
            </USlideover>
          </UCard>
        </template>

        <!-- ══════════ 表单 ══════════ -->
        <template v-if="cat === 'form'">
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.form === 1" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 1 · 双列网格</span>
                <span class="text-xs text-muted">备注跨两列，短屏自动降为单列</span>
              </div>
            </template>
            <UForm :state="form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit="submitForm('双列网格')">
              <UFormField v-for="f in fields" :key="f.name" :label="f.label" :name="f.name" :class="wide(f)">
                <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                <UInputNumber v-else-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                <UInputDate v-else-if="f.name === 'due'" v-model="form.due" class="w-full" />
                <UTextarea v-else-if="f.name === 'note'" v-model="form.note" :rows="3" :placeholder="f.placeholder" class="w-full" />
                <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
              </UFormField>
              <div class="col-span-full flex justify-end gap-2">
                <UButton label="取消" color="neutral" variant="outline" />
                <UButton label="提交" type="submit" />
              </div>
            </UForm>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.form === 2" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 2 · 单列长表单 + 分组标题</span>
                <span class="text-xs text-muted">字段少但语义分段清晰</span>
              </div>
            </template>
            <UForm :state="form" class="space-y-4" @submit="submitForm('单列分组')">
              <USeparator label="基本信息" class="text-xs" />
              <UFormField v-for="f in F('code', 'title', 'owner')" :key="f.name" :label="f.label" :name="f.name">
                <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full sm:max-w-sm" />
                <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full sm:max-w-sm" />
              </UFormField>
              <USeparator label="财务信息" class="text-xs" />
              <UFormField v-for="f in F('amount', 'due')" :key="f.name" :label="f.label" :name="f.name">
                <UInputNumber v-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full sm:max-w-sm" />
                <UInputDate v-else v-model="form.due" class="w-full sm:max-w-sm" />
              </UFormField>
              <USeparator label="备注" class="text-xs" />
              <UFormField label="备注" name="note">
                <UTextarea v-model="form.note" :rows="3" placeholder="补充说明" class="w-full" />
              </UFormField>
              <div class="flex justify-end gap-2 pt-1">
                <UButton label="取消" color="neutral" variant="outline" />
                <UButton label="提交" type="submit" />
              </div>
            </UForm>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.form === 3" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 3 · 分步表单</span>
                <span class="text-xs text-muted">字段多、录入耗时长时按步拆分，可点步骤回退</span>
              </div>
            </template>
            <UForm :state="form" @submit="submitForm('分步表单')">
              <UStepper v-model="step" :items="STEP_ITEMS" size="sm">
                <template #base>
                  <div class="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                    <UFormField v-for="f in F('code', 'title', 'owner')" :key="f.name" :label="f.label" :name="f.name" :class="wide(f)">
                      <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                      <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
                    </UFormField>
                  </div>
                </template>
                <template #detail>
                  <div class="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                    <UFormField v-for="f in F('amount', 'due')" :key="f.name" :label="f.label" :name="f.name">
                      <UInputNumber v-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                      <UInputDate v-else v-model="form.due" class="w-full" />
                    </UFormField>
                    <UFormField label="备注" name="note" class="sm:col-span-2">
                      <UTextarea v-model="form.note" :rows="2" placeholder="补充说明" class="w-full" />
                    </UFormField>
                  </div>
                </template>
                <template #confirm>
                  <div class="space-y-3 pt-4">
                    <UAlert color="info" variant="subtle" icon="i-lucide-circle-check" title="请复核以下信息后提交" />
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-muted p-3 text-sm sm:grid-cols-3">
                      <template v-for="f in fields" :key="f.name">
                        <span class="text-muted">{{ f.label }}</span>
                        <span class="text-default tabular-nums">{{ f.name === 'amount' ? money(form.amount) : (form[f.name] ?? '—') }}</span>
                      </template>
                    </div>
                  </div>
                </template>
              </UStepper>
              <USeparator class="my-4" />
              <div class="flex items-center gap-2">
                <UButton label="上一步" icon="i-lucide-arrow-left" color="neutral" variant="outline" :disabled="step === 0" @click="prevStep" />
                <span class="text-xs text-muted">第 {{ step + 1 }} / {{ STEP_ITEMS.length }} 步 · {{ STEP_ITEMS[step]?.title }}</span>
                <span class="flex-1" />
                <UButton v-if="step < STEP_ITEMS.length - 1" label="下一步" trailing-icon="i-lucide-arrow-right" @click="nextStep" />
                <UButton v-else label="提交" type="submit" icon="i-lucide-send" />
              </div>
            </UForm>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.form === 4" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 4 · 左标签右控件</span>
                <span class="text-xs text-muted">标签右对齐、控件占余量，适合字段名长短不一</span>
              </div>
            </template>
            <UForm :state="form" class="grid grid-cols-[110px_1fr] items-start gap-x-3 gap-y-4" @submit="submitForm('左标签右控件')">
              <template v-for="f in fields" :key="f.name">
                <span class="pt-1.5 text-sm text-muted text-end">{{ f.label }}</span>
                <UFormField :name="f.name">
                  <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                  <UInputNumber v-else-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                  <UInputDate v-else-if="f.name === 'due'" v-model="form.due" class="w-full" />
                  <UTextarea v-else-if="f.name === 'note'" v-model="form.note" :rows="3" :placeholder="f.placeholder" class="w-full" />
                  <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
                </UFormField>
              </template>
              <span />
              <div class="flex gap-2">
                <UButton label="取消" color="neutral" variant="outline" />
                <UButton label="提交" type="submit" />
              </div>
            </UForm>
          </UCard>

          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.form === 5" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 5 · 卡片分区 + 吸底操作条</span>
                <span class="text-xs text-muted">在卡内滚动区里向下滚，底部操作条始终可见</span>
              </div>
            </template>
            <UForm id="form-sticky" :state="form" class="max-h-[400px] overflow-y-auto" @submit="submitForm('卡片分区 + 吸底')">
              <div class="space-y-4 p-4">
                <UCard>
                  <template #header><span class="text-sm font-semibold">基本信息</span></template>
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <UFormField v-for="f in F('code', 'title', 'owner')" :key="f.name" :label="f.label" :name="f.name" :class="wide(f)">
                      <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                      <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
                    </UFormField>
                  </div>
                </UCard>
                <UCard>
                  <template #header><span class="text-sm font-semibold">财务与备注</span></template>
                  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <UFormField v-for="f in F('amount', 'due')" :key="f.name" :label="f.label" :name="f.name">
                      <UInputNumber v-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                      <UInputDate v-else v-model="form.due" class="w-full" />
                    </UFormField>
                    <UFormField label="备注" name="note" class="sm:col-span-2">
                      <UTextarea v-model="form.note" :rows="4" placeholder="补充说明" class="w-full" />
                    </UFormField>
                  </div>
                </UCard>
                <div class="h-2" />
              </div>
              <div class="sticky bottom-0 flex items-center gap-2 border-t border-default bg-elevated/95 px-4 py-2.5 backdrop-blur">
                <span class="text-xs text-muted">改动未保存</span>
                <span class="flex-1" />
                <UButton label="取消" color="neutral" variant="ghost" />
                <UButton label="保存草稿" color="neutral" variant="outline" icon="i-lucide-save" @click="toast.add({ title: '草稿已保存', color: 'neutral' })" />
                <UButton label="提交" type="submit" icon="i-lucide-send" />
              </div>
            </UForm>
          </UCard>
        </template>

        <!-- ══════════ 弹窗表单 ══════════ -->
        <template v-if="cat === 'dialog'">
          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.dialog === 1" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 1 · UModal 双列表单</span>
                <span class="text-xs text-muted">字段 ≤ 8、任务聚焦，点背景即关</span>
              </div>
            </template>
            <UButton label="打开 Modal 双列表单" icon="i-lucide-square" @click="modalOpen = true" />
            <UModal v-model:open="modalOpen" title="新建工单" description="字段少、任务聚焦，填完即走；点遮罩或 Esc 可直接关闭。">
              <template #body>
                <UForm id="dlg-modal" :state="form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit="modalOpen = false">
                  <UFormField v-for="f in fields" :key="f.name" :label="f.label" :name="f.name" :class="wide(f)">
                    <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                    <UInputNumber v-else-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                    <UInputDate v-else-if="f.name === 'due'" v-model="form.due" class="w-full" />
                    <UTextarea v-else-if="f.name === 'note'" v-model="form.note" :rows="2" :placeholder="f.placeholder" class="w-full" />
                    <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
                  </UFormField>
                </UForm>
              </template>
              <template #footer>
                <div class="flex w-full justify-end gap-2">
                  <UButton label="取消" color="neutral" variant="outline" @click="modalOpen = false" />
                  <UButton label="保存" type="submit" form="dlg-modal" @click="submitForm('Modal 双列')" />
                </div>
              </template>
            </UModal>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.dialog === 2" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 2 · USlideover 右侧滑入</span>
                <span class="text-xs text-muted">字段多、要边看列表边改，宽 560px</span>
              </div>
            </template>
            <UButton label="打开 Slideover" icon="i-lucide-panel-right" color="neutral" variant="outline" @click="slideoverOpen = true" />
            <USlideover v-model:open="slideoverOpen" title="编辑工单" description="右侧滑入，列表上下文不被完全遮挡。" :ui="{ content: 'sm:w-[560px] sm:max-w-[560px]' }">
              <template #body>
                <UForm id="dlg-slide" :state="form" class="space-y-4" @submit="slideoverOpen = false">
                  <UFormField v-for="f in fields" :key="f.name" :label="f.label" :name="f.name">
                    <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                    <UInputNumber v-else-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                    <UInputDate v-else-if="f.name === 'due'" v-model="form.due" class="w-full" />
                    <UTextarea v-else-if="f.name === 'note'" v-model="form.note" :rows="4" :placeholder="f.placeholder" class="w-full" />
                    <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
                  </UFormField>
                  <UAlert color="warning" variant="subtle" icon="i-lucide-circle-alert" title="改状态会触发审批流" description="工单进入「待审批」后负责人会收到站内信。" />
                </UForm>
              </template>
              <template #footer>
                <div class="flex w-full justify-end gap-2">
                  <UButton label="取消" color="neutral" variant="outline" @click="slideoverOpen = false" />
                  <UButton label="保存" type="submit" form="dlg-slide" @click="submitForm('Slideover')" />
                </div>
              </template>
            </USlideover>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.dialog === 3" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 3 · UDrawer 底部抽屉</span>
                <span class="text-xs text-muted">移动优先，双列压缩为单列，可下拉手柄收起</span>
              </div>
            </template>
            <UButton label="打开 Drawer" icon="i-lucide-square-chevron-down" color="neutral" variant="outline" @click="drawerOpen = true" />
            <UDrawer v-model:open="drawerOpen" title="快速新建工单" description="拇指可及区域放主操作。">
              <template #body>
                <UForm id="dlg-drawer" :state="form" class="space-y-4" @submit="drawerOpen = false">
                  <UFormField v-for="f in fields" :key="f.name" :label="f.label" :name="f.name">
                    <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                    <UInputNumber v-else-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                    <UInputDate v-else-if="f.name === 'due'" v-model="form.due" class="w-full" />
                    <UTextarea v-else-if="f.name === 'note'" v-model="form.note" :rows="2" :placeholder="f.placeholder" class="w-full" />
                    <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
                  </UFormField>
                </UForm>
              </template>
              <template #footer>
                <div class="flex w-full gap-2">
                  <UButton label="取消" color="neutral" variant="outline" block @click="drawerOpen = false" />
                  <UButton label="提交" type="submit" form="dlg-drawer" block @click="submitForm('Drawer')" />
                </div>
              </template>
            </UDrawer>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.dialog === 4" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 4 · 全屏编辑（左表单右预览）</span>
                <span class="text-xs text-muted">大表单：录入区与结果区同屏对照</span>
              </div>
            </template>
            <UButton label="打开全屏编辑" icon="i-lucide-maximize" color="neutral" variant="outline" @click="fullscreenOpen = true" />
            <UModal v-model:open="fullscreenOpen" title="工单详情编辑" description="左栏录入、右栏实时预览，适合字段最多的大表单。" :ui="{ content: 'max-w-5xl' }">
              <template #body>
                <div class="grid grid-cols-1 gap-5 md:grid-cols-[1fr_260px]">
                  <UForm id="dlg-full" :state="form" class="grid grid-cols-1 gap-4 sm:grid-cols-2" @submit="fullscreenOpen = false">
                    <UFormField v-for="f in fields" :key="f.name" :label="f.label" :name="f.name" :class="wide(f)">
                      <USelect v-if="f.name === 'owner'" v-model="form.owner" :items="OWNERS" :placeholder="f.placeholder" class="w-full" />
                      <UInputNumber v-else-if="f.name === 'amount'" v-model="form.amount" :placeholder="f.placeholder" class="w-full" />
                      <UInputDate v-else-if="f.name === 'due'" v-model="form.due" class="w-full" />
                      <UTextarea v-else-if="f.name === 'note'" v-model="form.note" :rows="3" :placeholder="f.placeholder" class="w-full" />
                      <UInput v-else v-model="form[f.name]" :placeholder="f.placeholder" :disabled="f.name === 'code'" class="w-full" />
                    </UFormField>
                  </UForm>
                  <div class="space-y-3 md:border-l md:border-default md:pl-5">
                    <p class="text-xs font-semibold text-muted">单据预览</p>
                    <div class="rounded-lg border border-muted p-3">
                      <div class="flex items-center gap-2">
                        <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ form.title || '（未填标题）' }}</span>
                        <UBadge color="info" variant="subtle" size="sm" label="进行中" />
                      </div>
                      <div class="mt-2 space-y-1 text-xs text-muted">
                        <p class="flex justify-between"><span>编号</span><span class="text-default">{{ form.code }}</span></p>
                        <p class="flex justify-between"><span>负责人</span><span class="text-default">{{ form.owner }}</span></p>
                        <p class="flex justify-between"><span>金额</span><span class="text-default tabular-nums">{{ money(form.amount) }}</span></p>
                      </div>
                      <USeparator class="my-2.5" />
                      <p class="text-xs text-muted">{{ form.note || '（无备注）' }}</p>
                    </div>
                    <div>
                      <p class="mb-1.5 text-xs text-muted">流程进度 1 / 4</p>
                      <UProgress :max="4" :model-value="1" size="sm" />
                    </div>
                  </div>
                </div>
              </template>
              <template #footer>
                <div class="flex w-full items-center gap-2">
                  <span class="text-xs text-muted">Esc 或点遮罩可直接关闭</span>
                  <span class="flex-1" />
                  <UButton label="取消" color="neutral" variant="outline" @click="fullscreenOpen = false" />
                  <UButton label="保存" type="submit" form="dlg-full" @click="submitForm('全屏编辑')" />
                </div>
              </template>
            </UModal>
          </UCard>

          <UCard>
            <template #header>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="CURRENT.dialog === 5" color="success" variant="subtle">当前采用</UBadge>
                <span class="text-sm font-semibold">方案 5 · 弹窗内选关联数据</span>
                <span class="text-xs text-muted">搜索 + 表格单选 + 分页，底部回显已选</span>
              </div>
            </template>
            <div class="flex flex-wrap items-center gap-2">
              <UButton label="选择关联工单" icon="i-lucide-link" @click="pickerOpen = true" />
              <UBadge v-if="picked" color="primary" variant="subtle" size="sm" :label="`已关联：${picked.name}`" />
              <UBadge v-else color="neutral" variant="subtle" size="sm" label="未关联工单" />
            </div>
            <UModal v-model:open="pickerOpen" title="选择关联工单" description="单选，确认后写回当前单据。" :ui="{ content: 'max-w-3xl' }">
              <template #body>
                <div class="space-y-3">
                  <UInput v-model="kw" icon="i-lucide-search" placeholder="搜索编号 / 名称 / 负责人" class="w-full" />
                  <UTable
                    :data="pickPaged" :columns="colsPickTable" :on-select="pickRow"
                    :ui="{ td: 'px-3 py-2.5 text-xs', th: 'px-3 py-2 text-xs' }"
                  >
                    <template #pick-cell="{ row }">
                      <UButton
                        :icon="pickedId === row.original.id ? 'i-lucide-circle-dot' : 'i-lucide-circle'"
                        :color="pickedId === row.original.id ? 'primary' : 'neutral'"
                        variant="ghost" size="xs" square
                        :aria-label="`选择 ${row.original.name}`"
                        @click="pickedId = row.original.id"
                      />
                    </template>
                    <template #status-cell="{ row }">
                      <UBadge :color="STATUS[row.original.status] ?? 'neutral'" variant="subtle" size="sm" :label="row.original.status" />
                    </template>
                    <template #amount-cell="{ row }">
                      <span class="tabular-nums text-default">{{ money(row.original.amount) }}</span>
                    </template>
                  </UTable>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-muted">第 {{ page }} 页，共 {{ rows.length }} 条</span>
                    <UPagination v-model:page="page" :total="rows.length" :items-per-page="PICK_SIZE" :sibling-count="1" size="xs" />
                  </div>
                </div>
              </template>
              <template #footer>
                <div class="flex w-full items-center gap-2">
                  <span class="min-w-0 flex-1 truncate text-xs text-muted">
                    已选：<span class="text-default">{{ picked ? `${picked.name}（#${picked.id}）` : '未选择' }}</span>
                  </span>
                  <UButton label="取消" color="neutral" variant="outline" @click="pickerOpen = false" />
                  <UButton label="关联所选" :disabled="!picked" @click="pickerOpen = false; toast.add({ title: '已关联工单', description: picked?.name ?? '', color: 'success' })" />
                </div>
              </template>
            </UModal>
          </UCard>
        </template>

        <p v-if="!CATS.some(c => c.value === cat)" class="py-10 text-center text-sm text-muted">
          未知分类，暂无方案。
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
