<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'
import { LOGIN_TPLS } from '~/composables/useStations'
import { DEFAULT_SKIN, galleryCss, isSkin, palettesOf, SKINS, skinRadius } from '#shared/skins'
import StylePreviewFrame from './StylePreviewFrame.vue'

useHead({ style: [{ innerHTML: galleryCss() }] })

const wb = useWb()
const { patch } = useApi()
const { push } = useNotify()

const theme = reactive({
  primary: '#007aff', radius: 12, mode: 'light', density: 'normal', logo: '',
  skin: DEFAULT_SKIN as string, palette: '', collapseMode: 'icon' as 'icon' | 'hidden'
})
const loginTpl = ref('split')
const layout = ref('side')
const saving = ref(false)

const skinPalettes = computed(() => palettesOf(theme.skin))

/** 换皮肤：圆角取该皮肤的默认值，配色重置为该皮肤的第一项，避免出现不属于该皮肤的配色。 */
function pickSkin(id: string) {
  theme.skin = id
  theme.radius = skinRadius(id)
  theme.palette = palettesOf(id)[0]?.id ?? ''
  const p = palettesOf(id)[0]
  if (p) theme.primary = p.accent
}
function pickPalette(id: string) {
  theme.palette = id
  const p = palettesOf(theme.skin).find(x => x.id === id)
  if (p) theme.primary = p.accent
}

const PRESETS = [
  { name: 'iOS 蓝', primary: '#0a84ff', radius: 12 },
  { name: '薄荷绿', primary: '#34c759', radius: 10 },
  { name: '暮紫', primary: '#5856d6', radius: 16 },
  { name: '琥珀', primary: '#ff9500', radius: 8 },
  { name: '方正红', primary: '#ff3b30', radius: 4 },
  { name: '青瓷', primary: '#5ac8fa', radius: 14 }
]

const MODE_OPTS = [{ label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }, { label: '跟随系统', value: 'auto' }]
const DENSITY_OPTS = [{ label: '标准', value: 'normal' }, { label: '紧凑', value: 'compact' }]
// 只列出生成器真正实现的值：ui.ts 目前仅区分 p.layout === 'top'，
// 曾提供的 'mix' 会静默退化成侧栏，故撤下，等实现后再加回。
const LAYOUT_OPTS = [{ label: '经典侧栏', value: 'side' }, { label: '顶部菜单', value: 'top' }]
const COLLAPSE_MODE_OPTS = [
  { label: '图标模式（迷你侧栏，折叠为 64px 宽）', value: 'icon' },
  { label: '隐藏模式（完全隐藏，折叠为 0 宽）', value: 'hidden' }
]
const FORM_LAYOUT_OPTS = [{ label: '单列', value: 'single' }, { label: '双列', value: 'double' }]

watch(() => wb.tenant, (t: any) => {
  if (!t?.id) return
  Object.assign(theme, { primary: '#0a84ff', radius: 12, mode: 'light', density: 'normal', logo: '', skin: DEFAULT_SKIN, palette: '', collapseMode: 'icon', ...(t.theme ?? t.theme_json ?? {}) })
  // 库里可能存着已改名/已删除的皮肤，认不出来就退回默认，别让选中态整个空掉。
  if (!isSkin(theme.skin)) theme.skin = DEFAULT_SKIN
  if (!palettesOf(theme.skin).some(p => p.id === theme.palette)) theme.palette = ''
  loginTpl.value = t.login_tpl ?? 'split'
  layout.value = t.layout ?? 'side'
}, { immediate: true, deep: true })

async function saveTheme() {
  saving.value = true
  try {
    await patch(`/tenant/${wb.tenantId}`, {
      theme: { ...theme }, login_tpl: loginTpl.value, layout: layout.value
    })
    push('全局设计已保存', 'success')
    await wb.reload()
  } finally { saving.value = false }
}

const active = useState<number>('design.activeModule', () => 0)
const mod = computed(() => wb.modules[active.value] ?? null)
const design = reactive<any>({ list: {}, form: {}, detail: {}, menu: {} })

const DEFAULT_ACTIONS = ['create', 'edit', 'delete', 'export', 'detail']

watch(mod, (m: any) => {
  if (!m) return
  const d = typeof m.design_json === 'string' ? JSON.parse(m.design_json) : (m.design_json ?? {})
  const actList = Array.isArray(d.list?.actions) && d.list.actions.length ? d.list.actions : [...DEFAULT_ACTIONS]
  Object.assign(design, {
    list: { show: true, pageSize: 10, striped: true, exportable: actList.includes('export'), actions: actList, columns: [], ...d.list, actions: actList },
    form: { layout: 'double', width: 720, dialog: true, fields: [], ...d.form },
    detail: { show: actList.includes('detail'), tabs: [], ...d.detail },
    menu: { show: true, hidden: false, icon: m.icon, badge: '', ...d.menu }
  })
}, { immediate: true, deep: true })

function hasAction(act: string): boolean {
  const acts = design.list?.actions
  if (!Array.isArray(acts)) return true
  return acts.includes(act)
}

function toggleAction(act: string, on: boolean) {
  const current = new Set<string>(
    Array.isArray(design.list.actions) && design.list.actions.length
      ? design.list.actions
      : DEFAULT_ACTIONS
  )
  if (on) current.add(act); else current.delete(act)
  design.list.actions = [...current]
  if (act === 'export') design.list.exportable = on
  if (act === 'detail') design.detail.show = on
}

const shownCols = computed(() => {
  const sel: string[] = design.list.columns ?? []
  return formFields.value.filter(f => !sel.length || sel.includes(f.col_key))
})
function setCol(key: string, on: boolean) {
  const set = new Set<string>(design.list.columns ?? [])
  on ? set.add(key) : set.delete(key)
  design.list.columns = [...set]
}

async function saveModule() {
  await patch(`/design/${mod.value.id}`, { design: JSON.parse(JSON.stringify(design)) })
  push(`「${mod.value.name}」设计已保存`, 'success')
  await wb.reload()
}

const formFields = computed(() => (mod.value?.fields ?? []).filter((f: any) => f.form_show))
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral" variant="soft" icon="i-lucide-palette"
      title="全局主题 + 登录页模板 + 每个模块的列表/表单/详情矩阵"
      description="这些配置最终落成子后台的 Tailwind @theme 变量与页面渲染参数。"
    >
      <template #actions>
        <UButton label="保存全局设计" icon="i-lucide-check" size="sm" :loading="saving" @click="saveTheme" />
      </template>
    </UAlert>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <UCard>
        <template #header><span class="text-sm font-semibold">🖌️ 全局主题</span></template>

        <!-- 皮肤与配色来自 shared/skins.ts，与主后台 /styles 画廊同一份定义 -->
        <p class="mb-2 text-xs font-semibold text-muted">皮肤（决定结构与材质）</p>
        <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
          <button
            v-for="s in SKINS" :key="s.id" type="button" :title="s.hint"
            class="rounded-lg border-2 px-2 py-1.5 text-left transition"
            :class="theme.skin === s.id ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-accented'"
            @click="pickSkin(s.id)"
          >
            <p class="truncate text-[11px] font-medium">{{ s.group }} · {{ s.name }}</p>
            <p class="truncate text-[10px] text-(--ui-text-dimmed)">{{ s.hint }}</p>
          </button>
        </div>

        <p class="mb-2 mt-4 text-xs font-semibold text-muted">配色（决定主色，随皮肤变）</p>
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="p in skinPalettes" :key="p.id" type="button" :title="p.name"
            class="flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] transition"
            :class="theme.palette === p.id ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-accented'"
            @click="pickPalette(p.id)"
          >
            <span class="size-4 rounded-full ring-1 ring-black/10" :style="{ background: p.accent }" />
            {{ p.name }}
          </button>
        </div>

        <p class="mb-2 mt-4 text-xs font-semibold text-muted">品牌预设</p>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="p in PRESETS" :key="p.name"
            class="rounded-lg border-2 p-2 text-center transition"
            :class="theme.primary === p.primary && theme.radius === p.radius ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-accented'"
            @click="Object.assign(theme, { primary: p.primary, radius: p.radius })">
            <span class="mb-1.5 block text-[11px]">{{ p.name }}</span>
            <span class="block h-5 w-full" :style="{ background: p.primary, borderRadius: `${p.radius / 2}px` }" />
          </button>
        </div>

        <div class="mt-4 space-y-4">
          <UFormField label="主色" :help="theme.palette ? `已由配色「${skinPalettes.find(p => p.id === theme.palette)?.name ?? theme.palette}」决定；手改这里会覆盖配色` : '选一个配色后由配色决定'">
            <div class="flex items-center gap-2">
              <!-- 内联展开的取色板会占掉半张卡，收进 Popover -->
              <UPopover :content="{ side: 'bottom' }">
                <UButton
                  variant="outline" square class="size-8 shrink-0 p-0"
                  :style="{ background: theme.primary }" :aria-label="`当前主色 ${theme.primary}`"
                />
                <template #content>
                  <div class="p-3"><UColorPicker v-model="theme.primary" /></div>
                </template>
              </UPopover>
              <UInput v-model="theme.primary" class="flex-1 font-mono" />
            </div>
          </UFormField>
          <UFormField :label="`圆角 ${theme.radius}px`">
            <USlider v-model="theme.radius" :min="0" :max="24" :step="2" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="外观"><USelect v-model="theme.mode" :items="MODE_OPTS" class="w-full" /></UFormField>
            <UFormField label="密度"><USelect v-model="theme.density" :items="DENSITY_OPTS" class="w-full" /></UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="侧栏布局"><USelect v-model="layout" :items="LAYOUT_OPTS" class="w-full" /></UFormField>
            <UFormField label="折叠效果" help="图标模式折叠为64px图标栏；隐藏模式折叠为0全屏工作区">
              <USelect v-model="theme.collapseMode" :items="COLLAPSE_MODE_OPTS" class="w-full" />
            </UFormField>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header><span class="text-sm font-semibold">🔐 登录页模板</span></template>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="t in LOGIN_TPLS" :key="t.v"
            class="rounded-lg border-2 p-2 text-left transition"
            :class="loginTpl === t.v ? 'border-primary ring-2 ring-primary/20' : 'border-muted hover:border-accented'"
            @click="loginTpl = t.v">
            <div class="h-[74px] w-full overflow-hidden rounded-md border border-default">
              <div v-if="t.v === 'split'" class="flex h-full w-full">
                <div class="flex-1 bg-linear-to-br from-primary-600 to-violet-600" />
                <div class="flex flex-1 items-center justify-center bg-default text-[8px] text-muted">登录</div>
              </div>
              <div v-else-if="t.v === 'glass'" class="flex h-full items-center justify-center bg-linear-to-br from-fuchsia-400 via-rose-400 to-sky-400">
                <div class="h-3/5 w-3/5 rounded bg-white/85 backdrop-blur" />
              </div>
              <div v-else-if="t.v === 'macOS'" class="flex h-full items-center justify-center bg-linear-to-br from-indigo-500 to-purple-600">
                <div class="size-5 rounded-full bg-white/30" />
              </div>
              <div v-else-if="t.v === 'terminal'" class="h-full w-full bg-gray-950 p-1.5 font-mono text-[8px] text-green-400">&gt; login_</div>
              <div v-else class="flex h-full items-center justify-center bg-linear-to-br from-gray-700 to-black">
                <div class="h-3/5 w-3/4 rounded bg-white/95" />
              </div>
            </div>
            <p class="mt-1.5 text-[11px]">{{ t.name }}</p>
          </button>
        </div>
        <p class="mt-3 text-xs leading-relaxed text-muted">
          生成后子后台的 <code class="font-mono">/login</code> 直接使用所选模板，主题变量写入其 <code class="font-mono">app/assets/css/main.css</code> 的 <code class="font-mono">@theme</code>。
        </p>
      </UCard>
    </div>

    <!-- 风格实战 1:1 动态还原看板 -->
    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold">🖥️ 风格实战 1:1 动态还原看板</span>
            <UBadge color="primary" variant="subtle" size="sm">{{ theme.skin }} · {{ theme.palette || '默认配色' }}</UBadge>
          </div>
          <span class="text-xs text-muted">所见即所得 · 与风格实战库（/styles）1:1 质感对齐并随主题实时变化</span>
        </div>
      </template>
      <StylePreviewFrame
        :skin="theme.skin"
        :palette="theme.palette"
        :primary="theme.primary"
        :radius="theme.radius"
        :layout="layout"
        :app-title="wb.tenant?.name || '运营管理系统'"
        :modules="wb.modules"
        :active-module-index="active"
        @select-module="active = $event"
      />
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">🚪 门禁模式</span>
          <UBadge color="neutral" variant="subtle" size="sm">已移至子后台</UBadge>
        </div>
      </template>
      <p class="text-sm text-muted">
        门禁强度属于<strong>子后台自己的设置</strong>，不在这里定：三种模式的表都会建出来，
        发布后由超级管理员在子后台「系统设置 → 门禁模式」里选，随时可切换、不需要重新发布。
      </p>
      <p class="mt-2 text-xs text-dimmed">
        子后台自带固定超级管理员账号（初始 admin / admin123），发布完可直接登录。
        这里保留只读展示，避免主后台和子后台两处都能改同一个配置。
      </p>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">📐 模块设计矩阵</span>
          <USelect
            v-model="active" size="sm" class="w-52"
            :items="wb.modules.map((m: any, i: number) => ({ label: m.name, value: i }))"
          />
          <span class="flex-1" />
          <UButton v-if="mod" label="保存该模块设计" icon="i-lucide-check" size="sm" @click="saveModule" />
        </div>
      </template>

      <div v-if="!mod" class="py-10 text-center text-sm text-muted">先到建模站创建模块</div>
      <div v-else class="space-y-4">
        <!-- 动作矩阵（物理能力上限） -->
        <div class="space-y-1.5 rounded-lg border border-default p-3 bg-muted/10">
          <div class="flex items-center justify-between">
            <span class="text-xs font-semibold text-accented flex items-center gap-1.5">
              <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
              <span>操作功能矩阵（代码能力上限 · 默认全开 · 只读/日志表可按需关闭）</span>
            </span>
            <span class="text-[11px] text-muted">定义该模块物理上是否具备对应前后端代码与 API</span>
          </div>
          <div class="flex flex-wrap gap-4 pt-1">
            <UCheckbox :model-value="hasAction('create')" @update:model-value="toggleAction('create', $event as boolean)" label="支持新增 (create)" />
            <UCheckbox :model-value="hasAction('edit')" @update:model-value="toggleAction('edit', $event as boolean)" label="支持编辑 (edit)" />
            <UCheckbox :model-value="hasAction('delete')" @update:model-value="toggleAction('delete', $event as boolean)" label="支持删除 (delete)" />
            <UCheckbox :model-value="hasAction('export')" @update:model-value="toggleAction('export', $event as boolean)" label="支持导出 (export)" />
            <UCheckbox :model-value="hasAction('detail')" @update:model-value="toggleAction('detail', $event as boolean)" label="详情抽屉 (detail)" />
          </div>
        </div>

        <!-- 页面视图属性 -->
        <div class="flex flex-wrap gap-4">
          <UCheckbox v-model="design.menu.show" label="显示菜单项" />
          <UCheckbox v-model="design.menu.hidden" label="隐藏（保留路由）" />
          <UCheckbox v-model="design.list.striped" label="斑马纹" />
          <UCheckbox v-model="design.form.dialog" label="表单用弹窗" />
        </div>

        <div class="flex flex-wrap gap-3">
          <UFormField label="每页条数"><UInput v-model.number="design.list.pageSize" type="number" size="sm" class="w-24" /></UFormField>
          <UFormField label="表单布局"><USelect v-model="design.form.layout" :items="FORM_LAYOUT_OPTS" size="sm" class="w-32" /></UFormField>
          <UFormField label="表单宽度"><UInput v-model.number="design.form.width" type="number" size="sm" class="w-28" /></UFormField>
          <!-- 菜单图标默认跟随建模站的模块图标，这里只做覆盖；生成器读 design.menu.icon -->
          <UFormField label="菜单图标（覆盖模块）"><div class="w-40"><IconPicker v-model="design.menu.icon" placeholder="跟随模块图标" /></div></UFormField>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th class="p-2 font-medium">字段</th><th class="p-2 font-medium">列名</th>
                <th class="p-2 font-medium">列表</th><th class="p-2 font-medium">表单</th>
                <th class="p-2 font-medium">组件</th><th class="p-2 font-medium">查询</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in formFields" :key="f.id" class="border-b border-muted">
                <td class="p-2">{{ f.name }}</td>
                <td class="p-2 font-mono">{{ f.col_key }}</td>
                <td class="p-2"><UCheckbox :model-value="shownCols.includes(f)" @update:model-value="setCol(f.col_key, $event as boolean)" /></td>
                <td class="p-2"><UBadge color="neutral" variant="subtle" size="sm">{{ f.form_show ? '是' : '否' }}</UBadge></td>
                <td class="p-2"><UBadge color="primary" variant="subtle" size="sm">{{ f.component }}</UBadge></td>
                <td class="p-2"><UBadge color="neutral" variant="outline" size="sm">{{ f.query_type }}</UBadge></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-lg border border-dashed border-default p-3 text-xs text-muted flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide-info" class="size-4 text-primary" />
            <span>模块「{{ mod.name }}」的列配置与表单选项已实时联动上方<strong>风格实战 1:1 动态还原看板</strong>。</span>
          </span>
          <UBadge color="neutral" variant="subtle" size="sm">已展示 {{ shownCols.length }} 列</UBadge>
        </div>
      </div>
    </UCard>
  </div>
</template>
