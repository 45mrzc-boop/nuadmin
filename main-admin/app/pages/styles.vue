<script setup lang="ts">
import type { Palette } from '#shared/skins'
import { galleryCss, PALETTES, SKINS } from '#shared/skins'

/** 皮肤定义与生成器同源；用 useHead 注入，规则已被 .skin-frame 限定，不会泄漏到主后台其它页面。 */
useHead({ style: [{ innerHTML: galleryCss() }] })
definePageMeta({ layout: 'dashboard' })

/**
 * 风格实战库：同一套真实后台界面（侧栏/顶栏/筛选/表格/分页/表单）套不同皮肤，
 * 用于一次性定下模板目录的视觉基线。
 *
 * 注意：这里的颜色是「风格本身的事实」而非主题色，所以刻意使用具体色值，
 * 不适用「只用语义色」规则。
 */

// SKINS / PALETTES 全部来自 shared/skins.ts —— 与生成器同一份，不可能漂移
const skin = ref('macos-modern')
const current = computed(() => SKINS.find(s => s.id === skin.value)!)

/** 每套皮肤给多个配色，用户选皮肤后再选色。accent-fg 控制按钮文字色。 */
type Pal = Palette
const palettes = computed(() => PALETTES[skin.value] ?? [])
const pal = ref('blue')
watch(skin, () => { pal.value = palettes.value[0]?.id ?? '' })
/** 配色用内联变量覆盖，优先级高于 [data-skin] 规则。 */
const palVars = computed(() => {
  const p = palettes.value.find(x => x.id === pal.value)
  return p ? ({ '--accent': p.accent, '--accent-fg': p.fg } as Record<string, string>) : {}
})

/* ── 多 Tab 内容区 ── */
type PageKind = 'table' | 'stats' | 'form'
const MENUS: Record<string, PageKind> = {
  工单管理: 'table', 设备台账: 'table', 巡检计划: 'stats', 统计分析: 'stats', 系统设置: 'form'
}
const menu = Object.keys(MENUS)
const cols2 = ['资产编号', '设备名称', '型号', '状态', '投用日期']
const rows2 = [
  { id: 'EQ-2201', name: '电磁流量计', model: 'MFE-80', status: '运行中', due: '2024-03-11' },
  { id: 'EQ-2202', name: '压力变送器', model: 'PT-3051', status: '待检', due: '2023-07-02' },
  { id: 'EQ-2203', name: '远传终端', model: 'RTU-5', status: '运行中', due: '2025-01-19' }
]
const stats = [
  { label: '工单完成率', value: 72, tone: 'ok' },
  { label: '按期巡检率', value: 88, tone: 'info' },
  { label: '待审批占比', value: 14, tone: 'warn' }
]

const tabs = ref<{ id: string, label: string }[]>([{ id: '工单管理', label: '工单管理' }])
const activeTab = ref('工单管理')
const ctxTab = ref('工单管理')

/* ── 加载条与动效 ── */
const barOn = ref(false)
const barPct = ref(0)
const contentLoading = ref(false)
const btnBusy = ref(false)
let barTimers: ReturnType<typeof setTimeout>[] = []

function clearBar() { barTimers.forEach(clearTimeout); barTimers = [] }

/**
 * 页签栏下方的进度条：快速冲到 ~70%，缓爬到 92%，
 * 结束时必须补满 100% 再淡出 —— 停在半路会让人以为卡住。
 */
function withProgress(ms = 620, then?: () => void) {
  clearBar()
  barOn.value = true
  barPct.value = 4
  contentLoading.value = true
  barTimers.push(setTimeout(() => { barPct.value = 70 }, 40))
  barTimers.push(setTimeout(() => { barPct.value = 92 }, Math.max(120, ms * 0.45)))
  barTimers.push(setTimeout(() => {
    contentLoading.value = false
    barPct.value = 100
    then?.()
    barTimers.push(setTimeout(() => { barOn.value = false }, 280))
    barTimers.push(setTimeout(() => { barPct.value = 0 }, 600))
  }, ms))
}

onBeforeUnmount(clearBar)

function openTab(label: string) {
  if (label === activeTab.value) { withProgress(); return }
  if (!tabs.value.some(t => t.id === label)) tabs.value.push({ id: label, label })
  activeTab.value = label
  withProgress()
}
function closeTab(id: string) {
  const i = tabs.value.findIndex(t => t.id === id)
  if (i < 0) return
  tabs.value.splice(i, 1)
  if (!tabs.value.length) tabs.value = [{ id: '工单管理', label: '工单管理' }]
  if (activeTab.value === id) activeTab.value = tabs.value[Math.max(0, i - 1)].id
  withProgress(420)
}
function closeOthers(id: string) {
  tabs.value = tabs.value.filter(t => t.id === id)
  activeTab.value = id
  withProgress(420)
}
/** 右键菜单项，作用于当前被右键的页签。 */
function ctxFor(id: string) {
  return [[
    { label: '刷新页面', icon: 'i-lucide-rotate-cw', onSelect: () => withProgress() },
    { label: '关闭当前页签', icon: 'i-lucide-x', disabled: tabs.value.length < 2, onSelect: () => closeTab(id) },
    { label: '关闭其他页签', icon: 'i-lucide-list-x', disabled: tabs.value.length < 2, onSelect: () => closeOthers(id) },
    { label: '关闭全部页签', icon: 'i-lucide-x-circle', disabled: tabs.value.length < 2, onSelect: () => closeOthers('工单管理') }
  ]]
}

const ctxItems = computed(() => ctxFor(ctxTab.value))
const kind = computed<PageKind>(() => MENUS[activeTab.value] ?? 'table')

const kw = ref('')
const status = ref('全部')
const page = ref(1)
const sel = ref<number | null>(1024)
const formOpen = ref(false)
const title = ref('')
const owner = ref('')
const amount = ref<number>()
const due = ref('')
const dateFrom = ref('')
const saved = ref(0)
const auditOn = ref(true)

function runQuery() {
  if (btnBusy.value) return
  btnBusy.value = true
  withProgress(520, () => { btnBusy.value = false })
}
function saveForm() {
  btnBusy.value = true
  withProgress(700, () => { btnBusy.value = false; saved.value++ })
}

const SEED = [
  { id: 1024, name: '水表轮换巡检', owner: '张三', status: '进行中', amount: 12800, due: '2026-09-18', note: '覆盖东区 12 个小区，需两人一组。' },
  { id: 1025, name: '管网压力标定', owner: '李四', status: '待审批', amount: 4600, due: '2026-09-21', note: '标定后需回传压力曲线。' },
  { id: 1026, name: '抄表员排班调整', owner: '王五', status: '已完成', amount: 0, due: '2026-09-12', note: '' },
  { id: 1027, name: '二次供水清洗', owner: '赵六', status: '已暂停', amount: 23500, due: '2026-10-02', note: '等待停水审批。' },
  { id: 1028, name: '远传终端固件升级', owner: '孙七', status: '进行中', amount: 8600, due: '2026-10-11', note: '分批灰度，先升 20%。' }
]
type Row = typeof SEED[number]
const all = ref<Row[]>(SEED.map(r => ({ ...r })))
const statusColor: Record<string, string> = { 进行中: 'info', 待审批: 'warn', 已完成: 'ok', 已暂停: 'mute', 运行中: 'ok', 待检: 'warn' }
const STATUS_OPTS = ['全部', '进行中', '待审批', '已完成', '已暂停']

/** 搜索条件真的参与过滤，而不是摆着好看。 */
const filtered = computed(() => all.value.filter(r =>
  (!kw.value.trim() || r.name.includes(kw.value.trim()) || String(r.id).includes(kw.value.trim()))
  && (status.value === '全部' || r.status === status.value)
  && (!dateFrom.value || r.due >= dateFrom.value)
))
const rows = computed(() => filtered.value.slice(0, 5))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / 5)))

/* ── 多选与批量 ── */
const picked = ref<Set<number>>(new Set())
function togglePick(id: number) {
  const n = new Set(picked.value)
  n.has(id) ? n.delete(id) : n.add(id)
  picked.value = n
}
const allPicked = computed(() => rows.value.length > 0 && rows.value.every(r => picked.value.has(r.id)))
function toggleAll() {
  const n = new Set(picked.value)
  const on = allPicked.value
  for (const r of rows.value) on ? n.delete(r.id) : n.add(r.id)
  picked.value = n
}
function bulkStatus(v: string) {
  all.value = all.value.map(r => picked.value.has(r.id) ? { ...r, status: v } : r)
  const n = picked.value.size
  picked.value = new Set()
  withProgress(360)
  saved.value += 0
  return n
}
function bulkDelete() {
  const n = picked.value.size
  all.value = all.value.filter(r => !picked.value.has(r.id))
  picked.value = new Set()
  withProgress(360)
  return n
}

/* ── 详情 / 编辑 / 新建 ── */
const detailRow = ref<Row | null>(null)
const askDel = ref<Row | null>(null)
/** null=关闭；'new'=新建；否则为被编辑的行 id。 */
const editing = ref<number | 'new' | null>(null)
const form = reactive({ name: '', owner: '', status: '进行中', amount: 0, due: '', note: '' })
const err = reactive<Record<string, string>>({})

function openCreate() {
  Object.assign(form, { name: '', owner: '', status: '进行中', amount: 0, due: '', note: '' })
  err.name = ''; err.owner = ''
  editing.value = 'new'
}
function openEdit(r: Row) {
  Object.assign(form, r)
  err.name = ''; err.owner = ''
  editing.value = r.id
}
function validate() {
  err.name = form.name.trim() ? '' : '工单名称不能为空'
  err.owner = form.owner.trim() ? '' : '请选择负责人'
  err.due = form.due ? '' : '请选择截止日期'
  return !err.name && !err.owner && !err.due
}
function submitForm() {
  if (!validate()) return
  if (editing.value === 'new') {
    const nextId = Math.max(...all.value.map(r => r.id)) + 1
    all.value.unshift({ ...form, id: nextId } as Row)
  } else {
    const i = all.value.findIndex(r => r.id === editing.value)
    if (i >= 0) all.value[i] = { ...all.value[i], ...form }
  }
  editing.value = null
  saved.value++
  withProgress(320)
}
function removeRow(r: Row) {
  all.value = all.value.filter(x => x.id !== r.id)
  if (detailRow.value?.id === r.id) detailRow.value = null
  if (editing.value === r.id) editing.value = null
}
function closeRow(r: Row) {
  const i = all.value.findIndex(x => x.id === r.id)
  if (i >= 0) all.value[i] = { ...r, status: '已完成' }
}

/* ── 皮肤内的中文日历（原生 date input 的格式由浏览器决定，页面无法改） ── */
const calOpen = ref(false)
const editCal = ref(false)
const calCursor = ref(new Date(2026, 8, 1))
const WEEK = ['一', '二', '三', '四', '五', '六', '日']
const calCells = computed(() => {
  const y = calCursor.value.getFullYear(), m = calCursor.value.getMonth()
  const first = new Date(y, m, 1)
  // 以周一为首日排布
  const offset = (first.getDay() + 6) % 7
  const days = new Date(y, m + 1, 0).getDate()
  const cells: (string | null)[] = Array.from({ length: offset }, () => null)
  for (let d = 1; d <= days; d++) cells.push(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  while (cells.length % 7) cells.push(null)
  return cells
})
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function pickDate(v: string) { dateFrom.value = v; calOpen.value = false; runQuery() }
function shiftMonth(n: number) { calCursor.value = new Date(calCursor.value.getFullYear(), calCursor.value.getMonth() + n, 1) }

const curYear = new Date().getFullYear()
const yearOpts = Array.from({ length: 30 }, (_, i) => curYear - 15 + i)
function setYear(y: number) {
  calCursor.value = new Date(y, calCursor.value.getMonth(), 1)
}
function setMonth(m: number) {
  calCursor.value = new Date(calCursor.value.getFullYear(), m, 1)
}
</script>

<template>
  <UDashboardPanel id="styles">
    <template #header>
      <UDashboardNavbar title="风格实战库">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UBadge color="neutral" variant="subtle" size="sm">{{ SKINS.length }} 套</UBadge>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              v-for="s in SKINS" :key="s.id"
              class="rounded-md px-2.5 py-1 text-xs ring ring-inset transition"
              :class="skin === s.id ? 'bg-primary text-white ring-primary' : 'text-muted ring-accented hover:bg-elevated'"
              :title="s.hint"
              @click="skin = s.id"
            >{{ s.group }} · {{ s.name }}</button>
          </div>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-[1400px] space-y-3 p-4 lg:p-6">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div class="flex flex-wrap items-baseline gap-2">
            <h2 class="text-sm font-semibold">{{ current.group }} · {{ current.name }}</h2>
            <p class="text-xs text-muted">{{ current.hint }}</p>
          </div>
          <USeparator orientation="vertical" class="h-5" />
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-muted">配色</span>
            <button
              v-for="p in palettes" :key="p.id"
              class="pal-dot" :class="{ on: pal === p.id }"
              :style="{ background: p.accent }" :title="p.name" :aria-label="p.name"
              @click="pal = p.id"
            />
            <span class="text-xs font-medium">{{ palettes.find(p => p.id === pal)?.name }}</span>
          </div>
        </div>

        <!-- 模拟浏览器窗口 -->
        <div class="skin-frame" :data-skin="skin" :style="palVars">
          <div class="skin-titlebar">
            <span class="tl-dot r" /><span class="tl-dot y" /><span class="tl-dot g" />
            <span class="tl-text">运营管理系统 — {{ current.name }}</span>
          </div>

          <div class="skin-app">
            <aside class="skin-side">
              <div class="side-brand">
                <span class="brand-mark">O</span>
                <span class="brand-text">OpsConsole</span>
              </div>
              <nav class="side-nav">
                <span class="side-group">业务</span>
                <button
                  v-for="m in menu" :key="m" class="side-item"
                  :class="{ on: activeTab === m }" @click="openTab(m)"
                >{{ m }}</button>
              </nav>
              <div class="side-foot">
                <span class="side-avatar">管</span>
                <span class="side-user">超级管理员</span>
              </div>
            </aside>

            <main class="skin-main">
              <header class="skin-top">
                <div class="crumb">业务 <span>/</span> {{ activeTab }}</div>
                <div class="top-actions">
                  <span class="top-chip">v1.2</span>
                  <span class="top-avatar">A</span>
                </div>
              </header>

              <UContextMenu :items="ctxItems">
                <div class="tabbar">
                  <div
                    v-for="t in tabs" :key="t.id"
                    class="tab" :class="{ on: activeTab === t.id }"
                    @click="openTab(t.id)"
                    @contextmenu="ctxTab = t.id"
                  >
                    <span v-if="contentLoading && activeTab === t.id" class="tab-spin" />
                    <span class="tab-label">{{ t.label }}</span>
                    <button
                      v-if="tabs.length > 1" class="tab-x" aria-label="关闭页签"
                      @click.stop="closeTab(t.id)"
                    >×</button>
                  </div>
                </div>
              </UContextMenu>

              <!-- 切页/查询时的进度条，紧贴页签栏下方 -->
              <div class="loadbar" :class="{ on: barOn }" role="progressbar" :aria-valuenow="barPct" aria-valuemin="0" aria-valuemax="100">
                <i :style="{ width: barPct + '%' }" />
              </div>

              <div class="skin-body">
                <Transition name="fx" mode="out-in">
                  <div :key="activeTab" class="stack">
                    <!-- 表格页 -->
                    <section v-if="kind === 'table'" class="panel">
                      <div class="panel-head">
                        <div class="ph-text">
                          <h3 class="ph-title">{{ activeTab }}</h3>
                          <p class="ph-sub">{{ contentLoading ? '加载中…' : `共 ${rows.length} 条 · 进行中 2 条` }}</p>
                        </div>
                        <div class="ph-actions">
                          <button class="btn ghost">导出</button>
                          <button class="btn primary" @click="openCreate()">＋ 新建工单</button>
                        </div>
                      </div>

                      <div class="filter">
                        <input v-model="kw" class="field grow" placeholder="搜索工单名称或编号" @keyup.enter="runQuery">
                        <select v-model="status" class="field" @change="runQuery">
                          <option v-for="o in STATUS_OPTS" :key="o">{{ o }}</option>
                        </select>
                        <!-- 不用原生 date：其显示格式由浏览器 locale 决定，页面改不了 -->
                        <div class="datewrap">
                          <button class="field datebtn" :class="{ filled: dateFrom }" @click="calOpen = !calOpen">
                            <span>{{ dateFrom || '截止日期 起' }}</span>
                            <span class="cal-ico" aria-hidden="true">▦</span>
                          </button>
                          <div v-if="dateFrom" class="date-clear" title="清除日期" @click="dateFrom = ''; runQuery()">×</div>
                          <div v-if="calOpen" class="cal" @click.stop>
                            <div class="cal-head">
                              <button class="cal-nav" aria-label="上个月" @click="shiftMonth(-1)">‹</button>
                              <div class="cal-selects">
                                <select class="cal-sel" :value="calCursor.getFullYear()" @change="setYear(Number(($event.target as HTMLSelectElement).value))">
                                  <option v-for="y in yearOpts" :key="y" :value="y">{{ y }} 年</option>
                                </select>
                                <select class="cal-sel" :value="calCursor.getMonth()" @change="setMonth(Number(($event.target as HTMLSelectElement).value))">
                                  <option v-for="m in 12" :key="m" :value="m - 1">{{ m }} 月</option>
                                </select>
                              </div>
                              <button class="cal-nav" aria-label="下个月" @click="shiftMonth(1)">›</button>
                            </div>
                            <div class="cal-grid">
                              <span v-for="w in WEEK" :key="`w${w}`" class="cal-wd">{{ w }}</span>
                              <button
                                v-for="(c, i) in calCells" :key="`c${i}`"
                                class="cal-d" :class="{ blank: !c, on: c === dateFrom, today: c === iso(new Date()) }"
                                :disabled="!c" @click="c && pickDate(c)"
                              >{{ c ? Number(c.slice(-2)) : '' }}</button>
                            </div>
                            <div class="cal-foot">
                              <button class="link" @click="pickDate('')">不限</button>
                              <button class="link" @click="pickDate(iso(new Date()))">今天</button>
                            </div>
                          </div>
                        </div>
                        <button class="btn primary sm" :class="{ busy: btnBusy }" @click="runQuery">{{ btnBusy ? '查询中…' : '查询' }}</button>
                        <button class="btn ghost sm" @click="kw = ''; status = '全部'; dateFrom = ''; runQuery()">重置</button>
                        <span class="filter-hint">匹配 {{ filtered.length }} / {{ all.length }}</span>
                      </div>

                      <div class="table-wrap">
                        <table class="tbl">
                          <thead>
                            <tr>
                              <th class="w-10"><span class="cbox" :class="{ on: allPicked }" role="checkbox" :aria-checked="allPicked" tabindex="0" title="全选本页" @click.stop="toggleAll()" /></th>
                              <th class="w-20">编号</th><th>名称</th><th class="w-24">负责人</th>
                              <th class="w-24">状态</th><th class="w-28 ta-r">金额</th><th class="w-32">日期</th>
                              <th class="w-36">操作</th>
                            </tr>
                          </thead>
                          <tbody v-if="contentLoading">
                            <tr v-for="i in 4" :key="`s${i}`" class="skel-row">
                              <td v-for="j in 8" :key="j"><span class="sk" :style="{ width: j === 3 ? '70%' : '52%' }" /></td>
                            </tr>
                          </tbody>
                          <tbody v-else-if="rows.length">
                            <tr
                              v-for="r in rows" :key="r.id"
                              class="row" :class="{ picked: sel === r.id }" @click="sel = r.id"
                            >
                              <td><span class="cbox" :class="{ on: picked.has(r.id) }" role="checkbox" :aria-checked="picked.has(r.id)" tabindex="0" @click.stop="togglePick(r.id)" @keydown.enter.stop="togglePick(r.id)" /></td>
                              <td class="mono muted">{{ r.id }}</td>
                              <td class="strong">{{ r.name }}</td>
                              <td>{{ r.owner }}</td>
                              <td><span class="pill" :data-tone="statusColor[r.status]">{{ r.status }}</span></td>
                              <td class="ta-r mono">{{ r.amount.toLocaleString('zh-CN') }}</td>
                              <td class="mono muted">{{ r.due }}</td>
                              <td class="ops">
                                <button class="link" @click.stop="detailRow = r">详情</button>
                                <button class="link" @click.stop="openEdit(r)">编辑</button>
                                <button class="link danger" @click.stop="askDel = r">删除</button>
                              </td>
                            </tr>
                          </tbody>
                          <tbody v-else>
                            <tr class="empty-row"><td colspan="8">
                              <div class="empty">
                                <span class="empty-ico">◌</span>
                                <p class="empty-t">没有匹配的工单</p>
                                <p class="empty-s">换个关键字，或点「重置」清空筛选条件</p>
                                <button class="btn ghost sm" @click="kw = ''; status = '全部'; dateFrom = ''">清空筛选</button>
                              </div>
                            </td></tr>
                          </tbody>
                        </table>
                      </div>

                      <div class="pager">
                        <span class="pg-info">第 {{ page }} / {{ pageCount }} 页 · 共 {{ filtered.length }} 条</span>
                        <div class="pg-btns">
                          <button class="pbtn" :disabled="page <= 1" @click="page--">‹</button>
                          <button v-for="i in pageCount" :key="i" class="pbtn" :class="{ on: page === i }" @click="page = i">{{ i }}</button>
                          <button class="pbtn" :disabled="page >= pageCount" @click="page++">›</button>
                        </div>
                      </div>
                      <Transition name="fx">
                        <div v-if="picked.size" class="bulk">
                          <span class="bulk-n">已选 {{ picked.size }} 项</span>
                          <button class="btn ghost sm" @click="bulkStatus('已完成')">批量标记完成</button>
                          <button class="btn ghost sm" @click="bulkStatus('已暂停')">批量暂停</button>
                          <button class="btn ghost sm danger" @click="bulkDelete()">批量删除</button>
                          <button class="bulk-x" aria-label="取消选择" @click="picked.clear()">×</button>
                        </div>
                      </Transition>
                    </section>

                    <!-- 统计页 -->
                    <section v-else-if="kind === 'stats'" class="panel">
                      <div class="panel-head">
                        <div class="ph-text">
                          <h3 class="ph-title">{{ activeTab }}</h3>
                          <p class="ph-sub">近 30 天指标</p>
                        </div>
                        <div class="ph-actions"><button class="btn ghost sm" @click="runQuery">刷新</button></div>
                      </div>
                      <div class="stat-grid">
                        <div v-for="s in stats" :key="s.label" class="stat-card">
                          <span class="st-label">{{ s.label }}</span>
                          <span class="st-value">{{ contentLoading ? '—' : s.value + '%' }}</span>
                          <span class="st-bar"><i :data-tone="s.tone" :style="{ width: (contentLoading ? 0 : s.value) + '%' }" /></span>
                        </div>
                      </div>
                      <div class="stat-grid">
                        <div v-for="n in [['工单总量', 128], ['已完成', 92], ['进行中', 26], ['逾期', 10]]" :key="n[0]" class="kpi">
                          <span class="kpi-n">{{ contentLoading ? '—' : n[1] }}</span>
                          <span class="kpi-l">{{ n[0] }}</span>
                        </div>
                      </div>
                    </section>

                    <!-- 表单页 -->
                    <section v-else class="panel form">
                      <div class="panel-head">
                        <h3 class="ph-title">{{ activeTab }}</h3>
                        <div class="ph-actions">
                          <button class="btn ghost sm">重置</button>
                          <button class="btn primary sm" :class="{ busy: btnBusy }" @click="saveForm">
                            {{ btnBusy ? '保存中…' : '保存' }}
                          </button>
                        </div>
                      </div>
                      <div class="form-grid">
                        <label class="fi"><span class="fi-l">系统名称 <em>*</em></span><input class="field" value="运营管理系统"></label>
                        <label class="fi"><span class="fi-l">管理员邮箱</span><input class="field" value="ops@example.com"></label>
                        <label class="fi"><span class="fi-l">默认分页</span><select class="field"><option>10 条/页</option><option>20 条/页</option></select></label>
                        <label class="fi"><span class="fi-l">登录失败锁定</span><input type="number" class="field" value="5"></label>
                        <label class="fi span2 toggle-row">
                          <span class="switch" :class="{ on: auditOn }" role="switch" :aria-checked="auditOn" tabindex="0" @click="auditOn = !auditOn" @keydown.enter="auditOn = !auditOn" />
                          <span class="fi-l">启用操作日志审计</span>
                        </label>
                        <p v-if="saved" class="span2 saved-tip">已保存 {{ saved }} 次</p>
                      </div>
                    </section>

                    <!-- 表格页下方的可展开新建表单 -->
                    <section v-if="false" class="panel form">
                      <div class="panel-head"><h3 class="ph-title">新建工单（表单）</h3>
                        <div class="ph-actions">
                          <button class="btn ghost sm" @click="formOpen = false">取消</button>
                          <button class="btn primary sm" :class="{ busy: btnBusy }" @click="saveForm">{{ btnBusy ? '保存中…' : '保存' }}</button>
                        </div>
                      </div>
                      <div class="form-grid">
                        <label class="fi"><span class="fi-l">工单名称 <em>*</em></span><input v-model="title" class="field" placeholder="请输入工单名称"></label>
                        <label class="fi"><span class="fi-l">负责人</span><select v-model="owner" class="field"><option value="">请选择</option><option>张三</option><option>李四</option></select></label>
                        <label class="fi"><span class="fi-l">金额</span><input v-model="amount" type="number" class="field" placeholder="0.00"></label>
                        <label class="fi"><span class="fi-l">截止日期</span><input v-model="due" type="date" class="field"></label>
                        <label class="fi span2"><span class="fi-l">备注</span><textarea :rows="2" class="field" placeholder="补充说明" /></label>
                      </div>
                    </section>
                  </div>
                </Transition>

                <!-- 详情：右侧滑出，保留列表上下文 -->
                <Transition name="slide">
                  <div v-if="detailRow" class="ov-back" @click.self="detailRow = null">
                    <aside class="ov-side" role="dialog" aria-label="工单详情">
                      <header class="ov-head">
                        <div class="ov-h-text">
                          <span class="ov-kicker">工单 #{{ detailRow.id }}</span>
                          <h4 class="ov-title">{{ detailRow.name }}</h4>
                        </div>
                        <button class="ov-x" aria-label="关闭" @click="detailRow = null">×</button>
                      </header>
                      <div class="ov-body">
                        <dl class="dl">
                          <div class="dl-r"><dt>状态</dt><dd><span class="pill" :data-tone="statusColor[detailRow.status]">{{ detailRow.status }}</span></dd></div>
                          <div class="dl-r"><dt>负责人</dt><dd>{{ detailRow.owner }}</dd></div>
                          <div class="dl-r"><dt>金额</dt><dd class="mono">¥{{ detailRow.amount.toLocaleString('zh-CN') }}</dd></div>
                          <div class="dl-r"><dt>截止日期</dt><dd class="mono">{{ detailRow.due }}</dd></div>
                          <div class="dl-r col"><dt>备注</dt><dd>{{ detailRow.note || '—' }}</dd></div>
                        </dl>
                      </div>
                      <footer class="ov-foot">
                        <button class="btn ghost" @click="detailRow = null">关闭</button>
                        <button class="btn ghost" @click="closeRow(detailRow); detailRow = null">标记完成</button>
                        <button class="btn primary" @click="openEdit(detailRow); detailRow = null">编辑</button>
                      </footer>
                    </aside>
                  </div>
                </Transition>

                <!-- 新建 / 编辑：居中弹窗，带字段校验 -->
                <Transition name="pop">
                  <div v-if="editing !== null" class="ov-back" @click.self="editing = null">
                    <section class="ov-modal" role="dialog" :aria-label="editing === 'new' ? '新建工单' : '编辑工单'">
                      <header class="ov-head">
                        <div class="ov-h-text">
                          <span class="ov-kicker">{{ editing === 'new' ? '新建' : `编辑 #${editing}` }}</span>
                          <h4 class="ov-title">工单信息</h4>
                        </div>
                        <button class="ov-x" aria-label="关闭" @click="editing = null">×</button>
                      </header>
                      <div class="ov-body form-grid">
                        <label class="fi"><span class="fi-l">工单名称 <em>*</em></span>
                          <input v-model="form.name" class="field" :class="{ bad: err.name }" placeholder="请输入工单名称" @input="err.name = form.name.trim() ? '' : err.name">
                          <span v-if="err.name" class="fi-err">{{ err.name }}</span>
                        </label>
                        <label class="fi"><span class="fi-l">负责人 <em>*</em></span>
                          <select v-model="form.owner" class="field" :class="{ bad: err.owner }">
                            <option value="">请选择</option><option>张三</option><option>李四</option><option>王五</option><option>赵六</option>
                          </select>
                          <span v-if="err.owner" class="fi-err">{{ err.owner }}</span>
                        </label>
                        <label class="fi"><span class="fi-l">状态</span>
                          <select v-model="form.status" class="field"><option v-for="o in STATUS_OPTS.slice(1)" :key="o">{{ o }}</option></select>
                        </label>
                        <label class="fi"><span class="fi-l">金额</span>
                          <input v-model.number="form.amount" type="number" min="0" class="field" placeholder="0.00">
                        </label>
                        <label class="fi span2"><span class="fi-l">截止日期 <em>*</em></span>
                          <div class="datewrap inline">
                            <button class="field datebtn" :class="{ filled: form.due, bad: err.due }" @click="editCal = !editCal">
                              <span>{{ form.due || '选择日期' }}</span><span class="cal-ico" aria-hidden="true">▦</span>
                            </button>
                            <div v-if="editCal" class="cal">
                              <div class="cal-head">
                                <button class="cal-nav" aria-label="上个月" @click="shiftMonth(-1)">‹</button>
                                <div class="cal-selects">
                                  <select class="cal-sel" :value="calCursor.getFullYear()" @change="setYear(Number(($event.target as HTMLSelectElement).value))">
                                    <option v-for="y in yearOpts" :key="y" :value="y">{{ y }} 年</option>
                                  </select>
                                  <select class="cal-sel" :value="calCursor.getMonth()" @change="setMonth(Number(($event.target as HTMLSelectElement).value))">
                                    <option v-for="m in 12" :key="m" :value="m - 1">{{ m }} 月</option>
                                  </select>
                                </div>
                                <button class="cal-nav" aria-label="下个月" @click="shiftMonth(1)">›</button>
                              </div>
                              <div class="cal-grid">
                                <span v-for="w in WEEK" :key="`ew${w}`" class="cal-wd">{{ w }}</span>
                                <button v-for="(c, i) in calCells" :key="`ec${i}`" class="cal-d" :class="{ blank: !c, on: c === form.due }" :disabled="!c" @click="c && (form.due = c, editCal = false, err.due = '')">{{ c ? Number(c.slice(-2)) : '' }}</button>
                              </div>
                            </div>
                          </div>
                          <span v-if="err.due" class="fi-err">{{ err.due }}</span>
                        </label>
                        <label class="fi span2"><span class="fi-l">备注</span>
                          <textarea v-model="form.note" :rows="2" class="field" placeholder="补充说明" />
                        </label>
                      </div>
                      <footer class="ov-foot">
                        <button class="btn ghost" @click="editing = null">取消</button>
                        <button class="btn primary" @click="submitForm">{{ editing === 'new' ? '创建工单' : '保存修改' }}</button>
                      </footer>
                    </section>
                  </div>
                </Transition>

                <!-- 删除确认 -->
                <Transition name="pop">
                  <div v-if="askDel" class="ov-back" @click.self="askDel = null">
                    <section class="ov-modal narrow" role="alertdialog" aria-label="删除确认">
                      <header class="ov-head">
                        <div class="ov-h-text"><span class="ov-kicker danger">不可撤销</span><h4 class="ov-title">删除「{{ askDel.name }}」？</h4></div>
                        <button class="ov-x" aria-label="关闭" @click="askDel = null">×</button>
                      </header>
                      <div class="ov-body"><p class="confirm-t">工单 #{{ askDel.id }} 及其流转记录将一并移除。</p></div>
                      <footer class="ov-foot">
                        <button class="btn ghost" @click="askDel = null">取消</button>
                        <button class="btn primary danger" @click="removeRow(askDel); askDel = null">确认删除</button>
                      </footer>
                    </section>
                  </div>
                </Transition>
              </div>
            </main>
          </div>
        </div>

        <p class="text-xs text-muted">
          提示：这一屏就是将来子后台的默认形态。你圈定某套后，我把它作为模板目录的基线皮肤，其余风格作为设计站可选主题。
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>

<style scoped>
/* 皮肤变量与角色 CSS 来自 #shared/skins（useHead 注入），这里只留本页自有样式 */
.pal-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,.12) inset; transition: transform .15s, border-color .15s; }
.pal-dot:hover { transform: scale(1.14); }
.pal-dot.on { border-color: var(--text, #111827); transform: scale(1.14); }

/* ── 进度条：紧贴页签栏下方的整宽轨道 ── */
.loadbar { height: 2px; flex-shrink: 0; background: color-mix(in srgb, var(--accent) 14%, transparent); opacity: 0; transition: opacity .25s; }
.loadbar.on { opacity: 1; }
.loadbar > i { display: block; height: 100%; width: 0; background: var(--accent); box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 65%, transparent); transition: width .32s linear; }
.skin-main { position: relative; }

/* ── 页签栏 ── */
.tabbar { display: flex; align-items: stretch; gap: 2px; padding: 0 var(--pad); background: var(--panel); border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: thin; }
.tab { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; font-size: calc(var(--fs) - 1px); color: var(--muted); cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; border-radius: var(--r-sm) var(--r-sm) 0 0; transition: background .15s, color .15s; }
.tab:hover { background: color-mix(in srgb, var(--text) 6%, transparent); color: var(--text); }
.tab.on { color: var(--text); font-weight: 600; border-bottom-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
.tab-x { width: 15px; height: 15px; display: grid; place-items: center; border-radius: 50%; font-size: 13px; line-height: 1; color: var(--muted); }
.tab-x:hover { background: color-mix(in srgb, var(--text) 14%, transparent); color: var(--text); }
.tab-spin { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent); animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── 切页动效 ── */
.stack { display: flex; flex-direction: column; gap: var(--gap); }
.fx-enter-active, .fx-leave-active { transition: opacity .18s ease, transform .18s ease; }
.fx-enter-from { opacity: 0; transform: translateY(8px); }
.fx-leave-to { opacity: 0; transform: translateY(-6px); }

/* ── 骨架行 ── */
.skel-row td { height: var(--row-h); }
.sk { display: block; height: 10px; border-radius: 5px; background: linear-gradient(90deg, color-mix(in srgb, var(--text) 8%, transparent) 25%, color-mix(in srgb, var(--text) 15%, transparent) 37%, color-mix(in srgb, var(--text) 8%, transparent) 63%); background-size: 400% 100%; animation: shimmer 1.3s ease-in-out infinite; }
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }

/* ── 统计页 ── */
.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--gap); padding: var(--pad); }
.stat-grid + .stat-grid { padding-top: 0; }
.stat-card { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: color-mix(in srgb, var(--text) 3%, transparent); }
.st-label { font-size: 11px; color: var(--muted); }
.st-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.st-bar { display: block; height: 5px; border-radius: 999px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; }
.st-bar i { display: block; height: 100%; border-radius: 999px; transition: width .6s cubic-bezier(.2,.8,.2,1); }
.st-bar i[data-tone='ok'] { background: #34c759; }
.st-bar i[data-tone='info'] { background: var(--accent); }
.st-bar i[data-tone='warn'] { background: #ff9500; }
.kpi { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px; border: 1px solid var(--line); border-radius: var(--r-sm); }
.kpi-n { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }
.kpi-l { font-size: 11px; color: var(--muted); }

/* ── 开关与保存反馈 ── */
.toggle-row { flex-direction: row; align-items: center; gap: 8px; }
.switch { width: 34px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--text) 22%, transparent); position: relative; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .18s; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
.switch.on { background: var(--accent); }
.switch.on::after { transform: translateX(14px); }
.saved-tip { margin: 0; font-size: 11px; color: var(--accent); }


/* ── 皮肤内日期选择（替代原生 date input） ── */
.datewrap { position: relative; }
.datebtn { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; text-align: left; min-width: 132px; }
.datebtn span:first-child { flex: 1; color: var(--muted); }
.datebtn.filled span:first-child { color: var(--text); }
.cal-ico { font-size: 11px; opacity: .55; }
.date-clear { position: absolute; right: 26px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--text) 16%, transparent); color: var(--muted); font-size: 12px; line-height: 1; cursor: pointer; }
.date-clear:hover { background: color-mix(in srgb, var(--text) 26%, transparent); }
.cal { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; width: 246px; padding: 10px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--r-sm); box-shadow: 0 12px 32px rgba(0,0,0,.18); color: var(--text); }
.datewrap.inline .cal { left: 0; }
.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.cal-title { font-size: 12px; font-weight: 600; }
.cal-selects { display: flex; align-items: center; gap: 4px; }
.cal-sel {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: calc(var(--r-sm) - 2px);
  padding: 2px 4px;
  cursor: pointer;
  outline: none;
}
.cal-sel:hover, .cal-sel:focus { border-color: var(--accent); }
.cal-nav { width: 22px; height: 22px; border: 1px solid var(--line); border-radius: calc(var(--r-sm) - 2px); background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; line-height: 1; }
.cal-nav:hover { border-color: var(--accent); color: var(--accent); }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-wd { text-align: center; font-size: 10px; color: var(--muted); padding: 3px 0; }
.cal-d { aspect-ratio: 1; border: 0; border-radius: calc(var(--r-sm) - 2px); background: transparent; color: var(--text); font-size: 11px; cursor: pointer; font-family: inherit; font-variant-numeric: tabular-nums; }
.cal-d:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.cal-d.on { background: var(--accent); color: var(--accent-fg); font-weight: 700; }
.cal-d.today:not(.on) { box-shadow: inset 0 0 0 1px var(--accent); color: var(--accent); }
.cal-d.blank { visibility: hidden; cursor: default; }
.cal-foot { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--line); }

/* ── 搜索反馈与批量条 ── */
.filter-hint { margin-left: auto; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.bulk { position: sticky; bottom: 0; display: flex; align-items: center; gap: 8px; margin: 0 var(--pad) var(--pad); padding: 8px 12px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--r-sm); box-shadow: 0 -4px 18px rgba(0,0,0,.10); }
.bulk-n { font-size: 12px; font-weight: 600; margin-right: auto; }
.bulk-x { width: 20px; height: 20px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1; }
.bulk-x:hover { background: color-mix(in srgb, var(--text) 12%, transparent); }
.btn.ghost.danger, .btn.danger { color: #ff3b30; }
.btn.primary.danger { background: #ff3b30; color: #fff; border-color: #d62828; }
.pbtn:disabled { opacity: .4; pointer-events: none; }

/* ── 空态 ── */
.empty-row td { padding: 0; }
.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 34px 12px; }
.empty-ico { font-size: 26px; color: var(--muted); opacity: .5; line-height: 1; }
.empty-t { font-size: 13px; font-weight: 600; }
.empty-s { font-size: 11px; color: var(--muted); margin-bottom: 4px; }

/* ── 浮层：详情 / 编辑 / 确认 ── */
.ov-back { position: absolute; inset: 0; z-index: 40; display: flex; background: rgba(15,17,23,.42); backdrop-filter: blur(2px); }
.ov-side { margin-left: auto; width: min(420px, 86%); display: flex; flex-direction: column; background: var(--panel); border-left: 1px solid var(--line-strong); box-shadow: -12px 0 34px rgba(0,0,0,.20); }
.ov-modal { margin: auto; width: min(560px, 92%); max-height: 88%; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--r); box-shadow: 0 24px 60px rgba(0,0,0,.28); }
.ov-modal.narrow { width: min(420px, 92%); }
.ov-head { display: flex; align-items: flex-start; gap: 10px; padding: 14px var(--pad); border-bottom: 1px solid var(--line); }
.ov-h-text { min-width: 0; flex: 1; }
.ov-kicker { display: block; font-size: 11px; color: var(--muted); }
.ov-kicker.danger { color: #ff3b30; }
.ov-title { font-size: 15px; font-weight: 700; margin-top: 2px; }
.ov-x { width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 17px; line-height: 1; cursor: pointer; }
.ov-x:hover { background: color-mix(in srgb, var(--text) 12%, transparent); color: var(--text); }
.ov-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--pad); }
.ov-body.form-grid { padding: var(--pad); }
.ov-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px var(--pad); border-top: 1px solid var(--line); background: color-mix(in srgb, var(--text) 3%, transparent); }
.dl { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
.dl-r { display: flex; flex-direction: column; gap: 4px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--r-sm); background: color-mix(in srgb, var(--text) 3%, transparent); }
.dl-r.col { grid-column: span 2; }
.dl-r dt { font-size: 11px; color: var(--muted); }
.dl-r dd { font-size: 13px; word-break: break-word; }
.confirm-t { font-size: 13px; color: var(--muted); }

/* 校验反馈 */
.field.bad { border-color: #ff3b30; box-shadow: 0 0 0 3px rgba(255,59,48,.16); }
.fi-err { font-size: 11px; color: #ff3b30; }

/* 浮层动效 */
.slide-enter-active, .slide-leave-active { transition: opacity .2s ease; }
.slide-enter-active .ov-side, .slide-leave-active .ov-side { transition: transform .24s cubic-bezier(.2,.8,.2,1); }
.slide-enter-from, .slide-leave-to { opacity: 0; }
.slide-enter-from .ov-side, .slide-leave-to .ov-side { transform: translateX(24px); }
.pop-enter-active, .pop-leave-active { transition: opacity .16s ease; }
.pop-enter-active .ov-modal, .pop-leave-active .ov-modal { transition: transform .18s cubic-bezier(.2,.8,.2,1); }
.pop-enter-from, .pop-leave-to { opacity: 0; }
.pop-enter-from .ov-modal, .pop-leave-to .ov-modal { transform: scale(.97) translateY(6px); }

/* 按钮忙态：禁用指针 + 轻微脉冲 */
.btn.busy { pointer-events: none; opacity: .78; animation: pulse .9s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .55; } }
</style>
