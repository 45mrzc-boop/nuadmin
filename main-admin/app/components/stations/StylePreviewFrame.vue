<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { findPalette, palettesOf, SKINS } from '#shared/skins'

const props = withDefaults(defineProps<{
  skin: string
  palette?: string
  primary?: string
  radius?: number
  layout?: string
  appTitle?: string
  modules?: any[]
  activeModuleIndex?: number
}>(), {
  skin: 'macos-modern',
  palette: '',
  primary: '#0a84ff',
  radius: 10,
  layout: 'side',
  appTitle: '运营管理系统',
  modules: () => [],
  activeModuleIndex: 0
})

const emit = defineEmits<{
  'select-module': [index: number]
}>()

const currentSkin = computed(() => SKINS.find(s => s.id === props.skin) || SKINS[0])
const palettes = computed(() => palettesOf(props.skin))
const activePal = computed(() => findPalette(props.skin, props.palette) || palettes.value[0])

const palVars = computed(() => {
  const accent = props.primary || activePal.value?.accent || '#0a84ff'
  const fg = activePal.value?.fg || '#ffffff'
  return {
    '--accent': accent,
    '--accent-fg': fg,
    '--r': `${props.radius ?? 10}px`
  } as Record<string, string>
})

/* ── 模块与菜单数据 ── */
const menuList = computed(() => {
  if (props.modules && props.modules.length > 0) {
    return props.modules.map((m: any, idx: number) => ({
      id: String(m.id || idx),
      name: m.name || `模块${idx + 1}`,
      key: m.key || m.res_key || `mod_${idx}`,
      icon: m.icon || '📄',
      fields: m.fields || []
    }))
  }
  return [
    { id: '1', name: '工单管理', key: 'order', icon: '📋', fields: [] },
    { id: '2', name: '设备台账', key: 'device', icon: '📦', fields: [] },
    { id: '3', name: '巡检计划', key: 'plan', icon: '📅', fields: [] },
    { id: '4', name: '统计分析', key: 'stats', icon: '📊', fields: [] }
  ]
})

const activeTab = ref(menuList.value[0]?.name || '工单管理')

watch(() => props.activeModuleIndex, (idx) => {
  if (idx !== undefined && menuList.value[idx]) {
    activeTab.value = menuList.value[idx].name
  }
}, { immediate: true })

watch(menuList, (list) => {
  if (!list.some(m => m.name === activeTab.value)) {
    activeTab.value = list[0]?.name || '默认模块'
  }
})

/* ── 多页签与动效进度条 ── */
const tabs = ref<{ id: string, label: string }[]>([
  { id: activeTab.value, label: activeTab.value }
])
const barOn = ref(false)
const barPct = ref(0)
const contentLoading = ref(false)
const btnBusy = ref(false)
let barTimers: ReturnType<typeof setTimeout>[] = []

function clearBar() { barTimers.forEach(clearTimeout); barTimers = [] }
onBeforeUnmount(clearBar)

function withProgress(ms = 480, then?: () => void) {
  clearBar()
  barOn.value = true
  barPct.value = 10
  contentLoading.value = true
  barTimers.push(setTimeout(() => { barPct.value = 70 }, 30))
  barTimers.push(setTimeout(() => { barPct.value = 92 }, Math.max(80, ms * 0.4)))
  barTimers.push(setTimeout(() => {
    contentLoading.value = false
    barPct.value = 100
    then?.()
    barTimers.push(setTimeout(() => { barOn.value = false }, 200))
    barTimers.push(setTimeout(() => { barPct.value = 0 }, 400))
  }, ms))
}

function openTab(name: string) {
  const modIdx = menuList.value.findIndex(m => m.name === name)
  if (modIdx >= 0) emit('select-module', modIdx)
  if (name === activeTab.value) { withProgress(); return }
  if (!tabs.value.some(t => t.id === name)) tabs.value.push({ id: name, label: name })
  activeTab.value = name
  withProgress()
}

function closeTab(id: string) {
  const i = tabs.value.findIndex(t => t.id === id)
  if (i < 0) return
  tabs.value.splice(i, 1)
  if (!tabs.value.length) tabs.value = [{ id: menuList.value[0]?.name || '首页', label: menuList.value[0]?.name || '首页' }]
  if (activeTab.value === id) activeTab.value = tabs.value[Math.max(0, i - 1)].id
  withProgress(300)
}

/* ── 模拟数据与字段自适应 ── */
const currentModule = computed(() => menuList.value.find(m => m.name === activeTab.value))

const columns = computed(() => {
  const mod = currentModule.value
  if (mod && mod.fields && mod.fields.length > 0) {
    const listFields = mod.fields.filter((f: any) => f.list_show !== false)
    if (listFields.length > 0) {
      return listFields.slice(0, 6).map((f: any) => ({
        key: f.col_key || f.key || f.name,
        name: f.name || f.col_key,
        type: f.type || 'varchar'
      }))
    }
  }
  return [
    { key: 'id', name: '编号', type: 'int' },
    { key: 'title', name: '名称', type: 'varchar' },
    { key: 'owner', name: '负责人', type: 'varchar' },
    { key: 'status', name: '状态', type: 'enum' },
    { key: 'amount', name: '金额', type: 'money' },
    { key: 'updated_at', name: '更新日期', type: 'datetime' }
  ]
})

const DEFAULT_ROWS = [
  { id: 1024, title: '管网压力自适应巡检', owner: '张三', status: '进行中', amount: 12800, updated_at: '2026-09-18', note: '覆盖东区 12 个小区' },
  { id: 1025, title: '网关流量标定校验', owner: '李四', status: '待审批', amount: 4600, updated_at: '2026-09-21', note: '需回传标定曲线' },
  { id: 1026, title: '智能传感器固件升级', owner: '王五', status: '已完成', amount: 8900, updated_at: '2026-09-12', note: '灰度发布通过' },
  { id: 1027, title: '二次供水清洗维护', owner: '赵六', status: '已暂停', amount: 23500, updated_at: '2026-10-02', note: '等待审批' }
]

const rows = ref<any[]>(DEFAULT_ROWS)
const kw = ref('')
const statusVal = ref('全部')
const dateFrom = ref('')
const picked = ref<Set<number>>(new Set())
const selRow = ref<any>(null)
const detailRow = ref<any>(null)
const editingRow = ref<any>(null)
const isNew = ref(false)

const statusColor: Record<string, string> = {
  '进行中': 'info',
  '待审批': 'warn',
  '已完成': 'ok',
  '已暂停': 'warn',
  '正常': 'ok',
  '异常': 'err'
}

function runQuery() {
  btnBusy.value = true
  withProgress(360, () => { btnBusy.value = false })
}

function togglePick(id: number) {
  const s = new Set(picked.value)
  s.has(id) ? s.delete(id) : s.add(id)
  picked.value = s
}
function toggleAll() {
  if (picked.value.size === rows.value.length) picked.value = new Set()
  else picked.value = new Set(rows.value.map(r => r.id))
}

function openCreate() {
  isNew.value = true
  editingRow.value = { id: Math.floor(Math.random() * 9000 + 1000), title: '', owner: '管理员', status: '进行中', amount: 0, updated_at: '2026-09-14' }
}

function openEdit(r: any) {
  isNew.value = false
  editingRow.value = { ...r }
}

function saveEdit() {
  if (!editingRow.value) return
  if (isNew.value) {
    rows.value.unshift(editingRow.value)
  } else {
    const idx = rows.value.findIndex(x => x.id === editingRow.value.id)
    if (idx >= 0) rows.value[idx] = { ...editingRow.value }
  }
  editingRow.value = null
  withProgress(300)
}

function deleteRow(r: any) {
  rows.value = rows.value.filter(x => x.id !== r.id)
  picked.value.delete(r.id)
  if (detailRow.value?.id === r.id) detailRow.value = null
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between px-1">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-wider text-muted">风格实战 1:1 动态还原舞台</span>
        <UBadge color="primary" variant="subtle" size="sm">{{ currentSkin.group }} · {{ currentSkin.name }}</UBadge>
        <span class="text-[11px] text-dimmed">当前配色：{{ activePal?.name }}</span>
      </div>
      <div class="text-[11px] text-muted">
        支持点击切换模块、过滤查询、进度条、详情抽屉与编辑弹窗
      </div>
    </div>

    <!-- 1:1 模拟浏览器窗口 -->
    <div class="skin-frame shadow-2xl transition-all duration-200" :data-skin="skin" :style="palVars">
      <!-- 窗口标题栏 -->
      <div class="skin-titlebar select-none">
        <span class="tl-dot r" /><span class="tl-dot y" /><span class="tl-dot g" />
        <span class="tl-text font-medium">{{ appTitle }} — {{ currentSkin.name }} 风格实战</span>
      </div>

      <div class="skin-app">
        <!-- 侧边栏 -->
        <aside class="skin-side">
          <div class="side-brand">
            <span class="brand-mark">O</span>
            <span class="brand-text truncate">{{ appTitle }}</span>
          </div>

          <nav class="side-nav">
            <span class="side-group">业务模块</span>
            <button
              v-for="m in menuList" :key="m.id"
              class="side-item flex items-center gap-2 transition"
              :class="{ on: activeTab === m.name }"
              @click="openTab(m.name)"
            >
              <span class="text-xs">{{ m.icon }}</span>
              <span class="truncate">{{ m.name }}</span>
            </button>
          </nav>

          <div class="side-foot">
            <span class="side-avatar">管</span>
            <span class="side-user truncate">超级管理员</span>
          </div>
        </aside>

        <!-- 主内容区 -->
        <main class="skin-main">
          <!-- 顶栏 -->
          <header class="skin-top">
            <div class="crumb">
              <span>业务模块</span>
              <span>/</span>
              <span class="font-semibold text-default">{{ activeTab }}</span>
            </div>
            <div class="top-actions">
              <span class="top-chip">v1.0</span>
              <span class="top-avatar">A</span>
            </div>
          </header>

          <!-- 多页签栏 -->
          <div class="tabbar">
            <div
              v-for="t in tabs" :key="t.id"
              class="tab" :class="{ on: activeTab === t.id }"
              @click="openTab(t.id)"
            >
              <span v-if="contentLoading && activeTab === t.id" class="tab-spin" />
              <span class="tab-label">{{ t.label }}</span>
              <button
                v-if="tabs.length > 1" class="tab-x" aria-label="关闭页签"
                @click.stop="closeTab(t.id)"
              >×</button>
            </div>
          </div>

          <!-- 切页进度条 -->
          <div class="loadbar" :class="{ on: barOn }" role="progressbar" :aria-valuenow="barPct">
            <i :style="{ width: barPct + '%' }" />
          </div>

          <!-- 页面主体容器 -->
          <div class="skin-body">
            <section class="panel">
              <div class="panel-head">
                <div class="ph-text">
                  <h3 class="ph-title">{{ activeTab }}</h3>
                  <p class="ph-sub">{{ contentLoading ? '正在加载数据…' : `共 ${rows.length} 条记录 · 运行中` }}</p>
                </div>
                <div class="ph-actions">
                  <button class="btn ghost sm">导出</button>
                  <button class="btn primary sm" @click="openCreate">＋ 新建</button>
                </div>
              </div>

              <!-- 筛选过滤栏 -->
              <div class="filter">
                <input v-model="kw" class="field grow" placeholder="搜索名称或编号…" @keyup.enter="runQuery">
                <select v-model="statusVal" class="field" @change="runQuery">
                  <option value="全部">全部状态</option>
                  <option value="进行中">进行中</option>
                  <option value="待审批">待审批</option>
                  <option value="已完成">已完成</option>
                </select>
                <button class="btn primary sm" :class="{ busy: btnBusy }" @click="runQuery">
                  {{ btnBusy ? '查询中…' : '查询' }}
                </button>
                <button class="btn ghost sm" @click="kw = ''; statusVal = '全部'; runQuery()">重置</button>
                <span class="filter-hint">匹配 {{ rows.length }} 条</span>
              </div>

              <!-- 表格实体 -->
              <div class="table-wrap">
                <table class="tbl">
                  <thead>
                    <tr>
                      <th class="w-10">
                        <span
                          class="cbox" :class="{ on: picked.size === rows.length && rows.length > 0 }"
                          @click="toggleAll"
                        />
                      </th>
                      <th v-for="col in columns" :key="col.key">
                        {{ col.name }}
                      </th>
                      <th class="w-28 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody v-if="contentLoading">
                    <tr v-for="i in 3" :key="`sk_${i}`" class="skel-row">
                      <td v-for="j in columns.length + 2" :key="j">
                        <span class="sk" :style="{ width: j === 2 ? '75%' : '48%' }" />
                      </td>
                    </tr>
                  </tbody>
                  <tbody v-else>
                    <tr
                      v-for="r in rows" :key="r.id"
                      class="row" :class="{ picked: selRow?.id === r.id }"
                      @click="selRow = r"
                    >
                      <td>
                        <span class="cbox" :class="{ on: picked.has(r.id) }" @click.stop="togglePick(r.id)" />
                      </td>
                      <td v-for="col in columns" :key="col.key">
                        <template v-if="col.key === 'id'">
                          <span class="mono muted">#{{ r.id }}</span>
                        </template>
                        <template v-else-if="col.key === 'status'">
                          <span class="pill" :data-tone="statusColor[r.status] || 'info'">{{ r.status }}</span>
                        </template>
                        <template v-else-if="col.type === 'money' || col.key === 'amount'">
                          <span class="mono font-semibold">¥{{ (r.amount ?? 0).toLocaleString('zh-CN') }}</span>
                        </template>
                        <template v-else>
                          <span>{{ r[col.key] ?? r.title ?? '—' }}</span>
                        </template>
                      </td>
                      <td class="ops justify-end">
                        <button class="link" @click.stop="detailRow = r">详情</button>
                        <button class="link" @click.stop="openEdit(r)">编辑</button>
                        <button class="link danger" @click.stop="deleteRow(r)">删除</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- 分页条 -->
              <div class="pager">
                <span class="pg-info">第 1 / 1 页 · 共 {{ rows.length }} 条</span>
                <div class="pg-btns">
                  <button class="pbtn" disabled>‹</button>
                  <button class="pbtn on">1</button>
                  <button class="pbtn" disabled>›</button>
                </div>
              </div>

              <!-- 批量操作条 -->
              <Transition name="fx">
                <div v-if="picked.size" class="bulk">
                  <span class="bulk-n">已选择 {{ picked.size }} 项</span>
                  <button class="btn ghost sm" @click="picked.clear()">批量通过</button>
                  <button class="btn ghost sm danger" @click="rows = rows.filter(r => !picked.has(r.id)); picked.clear()">批量删除</button>
                  <button class="bulk-x" @click="picked.clear()">×</button>
                </div>
              </Transition>
            </section>

            <!-- 详情侧滑抽屉 -->
            <Transition name="slide">
              <div v-if="detailRow" class="ov-back" @click.self="detailRow = null">
                <aside class="ov-side" role="dialog" aria-label="详情抽屉">
                  <header class="ov-head">
                    <div class="ov-h-text">
                      <span class="ov-kicker">实体 #{{ detailRow.id }}</span>
                      <h4 class="ov-title">{{ detailRow.title || activeTab }}</h4>
                    </div>
                    <button class="ov-x" aria-label="关闭" @click="detailRow = null">×</button>
                  </header>
                  <div class="ov-body">
                    <dl class="dl">
                      <div class="dl-r"><dt>状态</dt><dd><span class="pill" :data-tone="statusColor[detailRow.status] || 'info'">{{ detailRow.status }}</span></dd></div>
                      <div class="dl-r"><dt>负责人</dt><dd>{{ detailRow.owner }}</dd></div>
                      <div class="dl-r"><dt>金额</dt><dd class="mono">¥{{ (detailRow.amount || 0).toLocaleString('zh-CN') }}</dd></div>
                      <div class="dl-r"><dt>更新时间</dt><dd class="mono">{{ detailRow.updated_at }}</dd></div>
                      <div class="dl-r col"><dt>备注说明</dt><dd>{{ detailRow.note || '暂无详细描述' }}</dd></div>
                    </dl>
                  </div>
                  <footer class="ov-foot">
                    <button class="btn ghost" @click="detailRow = null">关闭</button>
                    <button class="btn primary" @click="openEdit(detailRow); detailRow = null">编辑</button>
                  </footer>
                </aside>
              </div>
            </Transition>

            <!-- 编辑 / 新建居中弹窗 -->
            <Transition name="pop">
              <div v-if="editingRow" class="ov-back" @click.self="editingRow = null">
                <section class="ov-modal" role="dialog">
                  <header class="ov-head">
                    <div class="ov-h-text">
                      <span class="ov-kicker">{{ isNew ? '新建' : `编辑 #${editingRow.id}` }}</span>
                      <h4 class="ov-title">{{ isNew ? '创建记录' : '修改信息' }}</h4>
                    </div>
                    <button class="ov-x" aria-label="关闭" @click="editingRow = null">×</button>
                  </header>
                  <div class="ov-body form-grid">
                    <label class="fi span2">
                      <span class="fi-l">名称 <em>*</em></span>
                      <input v-model="editingRow.title" class="field" placeholder="请输入名称">
                    </label>
                    <label class="fi">
                      <span class="fi-l">负责人</span>
                      <input v-model="editingRow.owner" class="field" placeholder="负责人姓名">
                    </label>
                    <label class="fi">
                      <span class="fi-l">状态</span>
                      <select v-model="editingRow.status" class="field">
                        <option value="进行中">进行中</option>
                        <option value="待审批">待审批</option>
                        <option value="已完成">已完成</option>
                        <option value="已暂停">已暂停</option>
                      </select>
                    </label>
                    <label class="fi span2">
                      <span class="fi-l">金额</span>
                      <input v-model.number="editingRow.amount" type="number" class="field" placeholder="0.00">
                    </label>
                  </div>
                  <footer class="ov-foot">
                    <button class="btn ghost" @click="editingRow = null">取消</button>
                    <button class="btn primary" @click="saveEdit">{{ isNew ? '提交创建' : '保存变更' }}</button>
                  </footer>
                </section>
              </div>
            </Transition>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>
