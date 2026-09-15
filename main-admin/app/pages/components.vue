<script setup lang="ts">

definePageMeta({ layout: 'dashboard' })

/**
 * 组件库 · 选型确认看板
 * 每个分区列出该类需求可选的真实组件，并标注生成器当前是否已使用，
 * 便于一次性确认后批量落到所有子后台。
 */
const USED = new Set(['Button', 'FormField', 'Input', 'Icon', 'Alert', 'Skeleton', 'Select', 'Badge',
  'Modal', 'Form', 'Empty', 'Tooltip', 'Textarea', 'Pagination', 'Card', 'Slideover', 'FileUpload',
  'Avatar', 'Table', 'Switch', 'Separator', 'NavigationMenu', 'InputNumber', 'DropdownMenu',
  'SelectMenu', 'RadioGroup', 'InputDate', 'DashboardSidebar', 'DashboardSidebarCollapse',
  'DashboardNavbar', 'DashboardPanel', 'DashboardGroup', 'DashboardToolbar', 'App', 'Link', 'Checkbox'])

const tag = (n: string) => USED.has(n)
  ? { color: 'success' as const, text: '生成器已用' }
  : { color: 'neutral' as const, text: '未使用' }

const toast = useToast()
const num = ref(12)
const date = ref<any>()
const time = ref<any>()
const tags = ref(['标签A', '标签B'])
const pin = ref('')
const radio = ref('draft')
const checks = ref(['a'])
const sw = ref(true)
const cb = ref(false)
const slide = ref(40)
const color = ref('#0a84ff')
const sel = ref('1')
const selMenu = ref<any>(null)
const inputMenu = ref<any>(null)
const modalOpen = ref(false)
const slideOpen = ref(false)
const drawerOpen = ref(false)
const tabs = ref('list')
const progress = ref(65)

const selItems = [{ label: '上架', value: '1' }, { label: '下架', value: '2' }, { label: '草稿', value: '3' }]
const menuItems = [
  { label: '张三', value: 'u1', avatar: { icon: 'i-lucide-circle-user' } },
  { label: '李四', value: 'u2', avatar: { icon: 'i-lucide-circle-user' } },
  { label: '王五', value: 'u3', avatar: { icon: 'i-lucide-circle-user' } }
]
const radioItems = [{ label: '草稿', value: 'draft' }, { label: '已提交', value: 'pending' }, { label: '已完成', value: 'done' }]
const checkItems = [{ label: '选项 A', value: 'a' }, { label: '选项 B', value: 'b' }, { label: '选项 C', value: 'c' }]
const tabsItems = [{ label: '列表', value: 'list', icon: 'i-lucide-list' }, { label: '详情', value: 'detail', icon: 'i-lucide-file-text' }]
const dropItems = [[{ label: '编辑', icon: 'i-lucide-pencil' }], [{ label: '删除', icon: 'i-lucide-trash-2', color: 'error' as const }]]
const accItems = [{ label: '分组一', icon: 'i-lucide-folder', content: '折叠内容示例。' }, { label: '分组二', icon: 'i-lucide-folder', content: '另一段内容。' }]
const max = 100
const segs = [
  { label: '已完成', value: 62, color: 'success' as const },
  { label: '进行中', value: 23, color: 'info' as const },
  { label: '未开始', value: 15, color: 'neutral' as const }
]

const sections = [
  { id: 'text', title: '文本与数值输入', icon: 'i-lucide-text-cursor' },
  { id: 'choice', title: '选择类控件', icon: 'i-lucide-list-checks' },
  { id: 'datetime', title: '日期与时间', icon: 'i-lucide-calendar-days' },
  { id: 'feedback', title: '反馈与状态', icon: 'i-lucide-bell' },
  { id: 'overlay', title: '浮层', icon: 'i-lucide-panel-top' },
  { id: 'nav', title: '导航', icon: 'i-lucide-navigation' },
  { id: 'container', title: '容器与折叠', icon: 'i-lucide-layout-grid' }
]
</script>

<template>
  <UDashboardPanel id="components">
    <template #header>
      <UDashboardNavbar title="组件库 · 选型确认">
        <template #leading><UDashboardSidebarCollapse /></template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-5 p-4 lg:p-6">
        <UAlert
          color="info" variant="subtle" icon="i-lucide-info"
          title="这些就是会生成到每个子后台里的同一套 Nuxt UI 组件"
          description="确认后我按你的选择统一改生成器，批量生效。绿色=生成器当前已在用，灰色=尚未使用（可选纳入）。"
        />

        <!-- ── 文本与数值 ── -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-text-cursor" class="size-4" /><span class="text-sm font-semibold">文本与数值输入</span>
            </div>
          </template>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="space-y-3">
              <UFormField label="UInput 单行文本">
                <UInput placeholder="请输入" class="w-full" />
              </UFormField>
              <UFormField label="UInputNumber 数字">
                <UInputNumber v-model="num" class="w-full" />
              </UFormField>
              <UFormField label="USlider 滑块">
                <USlider v-model="slide" class="w-full" />
              </UFormField>
            </div>
            <div class="space-y-3">
              <UFormField label="UTextarea 多行文本">
                <UTextarea :rows="2" placeholder="请输入" class="w-full" />
              </UFormField>
              <UFormField label="UInputTags 标签">
                <UInputTags v-model="tags" class="w-full" />
              </UFormField>
              <UFormField label="UColorPicker 颜色（收在 Popover 里，不内联展开）">
                <div class="flex items-center gap-2">
                  <UPopover :content="{ side: 'bottom' }">
                    <UButton :color="undefined" variant="outline" square class="size-8 p-0" :style="{ background: color }" :aria-label="`当前颜色 ${color}`" />
                    <template #content>
                      <div class="p-3">
                        <UColorPicker v-model="color" />
                      </div>
                    </template>
                  </UPopover>
                  <UInput v-model="color" class="w-28 font-mono" />
                </div>
              </UFormField>
            </div>
            <div class="space-y-3">
              <UFormField label="UPinInput 验证码">
                <UPinInput v-model="pin" :length="6" class="w-full" />
              </UFormField>
              <UFormField label="UInputMenu 可输入可选">
                <UInputMenu v-model="inputMenu" :items="menuItems" placeholder="搜索成员" class="w-full" />
              </UFormField>
              <UFormField label="UFieldGroup 组合输入">
                <UFieldGroup>
                  <USelect :items="selItems" model-value="1" class="w-28" />
                  <UInput placeholder="关键字" class="flex-1" />
                </UFieldGroup>
              </UFormField>
            </div>
          </div>
        </UCard>

        <!-- ── 选择类 ── -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-checks" class="size-4" /><span class="text-sm font-semibold">选择类控件</span>
            </div>
          </template>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="space-y-3">
              <UFormField label="USelect 短列表">
                <USelect v-model="sel" :items="selItems" class="w-full" />
              </UFormField>
              <UFormField label="USwitch 开关">
                <USwitch v-model="sw" />
              </UFormField>
              <UFormField label="UCheckbox 勾选">
                <UCheckbox v-model="cb" label="同意条款" />
              </UFormField>
            </div>
            <div class="space-y-3">
              <UFormField label="USelectMenu 可搜索/多选">
                <USelectMenu v-model="selMenu" :items="menuItems" value-key="value" placeholder="选择成员" class="w-full" />
              </UFormField>
              <UFormField label="UCheckboxGroup 多选组">
                <UCheckboxGroup v-model="checks" :items="checkItems" />
              </UFormField>
            </div>
            <div class="space-y-3">
              <UFormField label="URadioGroup 单选组">
                <URadioGroup v-model="radio" :items="radioItems" />
              </UFormField>
              <div class="flex flex-wrap gap-2 pt-1">
                <UBadge v-bind="tag('InputDate')">InputDate</UBadge>
                <UBadge v-bind="tag('InputTime')">InputTime</UBadge>
                <UBadge v-bind="tag('InputTags')">InputTags</UBadge>
                <UBadge v-bind="tag('FieldGroup')">FieldGroup</UBadge>
              </div>
            </div>
          </div>
        </UCard>

        <!-- ── 日期时间 ── -->
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center gap-2">
              <UIcon name="i-lucide-calendar-days" class="size-4" /><span class="text-sm font-semibold">日期与时间</span>
              <UBadge v-bind="tag('InputDate')">InputDate</UBadge>
              <UBadge v-bind="tag('InputTime')">InputTime</UBadge>
              <UBadge v-bind="tag('Calendar')">Calendar</UBadge>
            </div>
          </template>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <UFormField label="UInputDate 日期（带日历面板下拉框）">
                <UPopover :ui="{ content: 'p-1' }">
                  <UInputDate v-model="date" trailing-icon="i-lucide-calendar" class="w-full cursor-pointer" />
                  <template #content>
                    <div class="p-2">
                      <UCalendar v-model="date" class="p-1" />
                    </div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="UInputDate 日期+时间（带日历面板下拉框）">
                <UPopover :ui="{ content: 'p-1' }">
                  <UInputDate v-model="time" :granularity="'minute'" trailing-icon="i-lucide-calendar" class="w-full cursor-pointer" />
                  <template #content>
                    <div class="p-2">
                      <UCalendar v-model="date" class="p-1" />
                    </div>
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="UInputTime 时间">
                <UInputTime v-model="time" class="w-full" />
              </UFormField>
            </div>
          <UAlert
            class="mt-4" color="warning" variant="subtle" icon="i-lucide-triangle-alert"
            title="待你确认：日期格式取决于 UApp 的 locale"
            description="Nuxt UI 的 Calendar/InputDate/InputTime 的显示格式由 UApp :locale 决定。当前子后台未传中文 locale，所以会显示 mm/dd/yyyy。确认后我统一注入 zh。"
          />
          <div class="mt-4">
            <UCalendar v-model="date" />
          </div>
        </UCard>

        <!-- ── 反馈 ── -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-bell" class="size-4" /><span class="text-sm font-semibold">反馈与状态</span>
            </div>
          </template>
          <div class="space-y-4">
            <div class="flex flex-wrap items-center gap-3">
              <UButton label="弹 Toast" icon="i-lucide-bell" @click="toast.add({ title: '已保存', description: '这是一条 toast', color: 'success' })" />
              <UButton label="弹错误 Toast" color="error" variant="subtle" @click="toast.add({ title: '保存失败', color: 'error', description: '这里放可定位问题的中文原因' })" />
              <UButton label="打开 Modal" @click="modalOpen = true" />
              <UButton label="打开 Slideover" color="neutral" variant="outline" @click="slideOpen = true" />
              <UButton label="打开 Drawer" color="neutral" variant="ghost" @click="drawerOpen = true" />
            </div>
            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div class="space-y-3">
                <UAlert color="info" variant="subtle" icon="i-lucide-info" title="提示" description="行内持续信息用 Alert。" />
                <UAlert color="success" variant="subtle" icon="i-lucide-circle-check" title="成功" />
                <UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" title="错误" description="可定位的中文原因。" />
                <UBanner color="warning" icon="i-lucide-megaphone" title="全站公告用 Banner，右上角可关闭" :close="true" />
              </div>
              <div class="space-y-4">
                <div>
                  <p class="mb-1.5 text-xs text-muted">UProgress 进度条</p>
                  <UProgress v-model="progress" />
                </div>
                <div>
                  <p class="mb-1.5 text-xs text-muted">UProgressGroup 占比分解</p>
                  <UProgressGroup :max="max" :items="segs" shape="rounded" />
                </div>
                <div class="flex items-center gap-4">
                  <div>
                    <p class="mb-1.5 text-xs text-muted">USkeleton</p>
                    <USkeleton class="h-8 w-32" />
                  </div>
                  <div>
                    <p class="mb-1.5 text-xs text-muted">UKbd 快捷键</p>
                    <UKbd value="mod" /> <UKbd value="k" />
                  </div>
                  <UTooltip text="悬停提示">
                    <UButton label="UTooltip" icon="i-lucide-help-circle" color="neutral" variant="ghost" />
                  </UTooltip>
                </div>
                <UEmpty title="UEmpty 空态" description="列表无数据时的占位" icon="i-lucide-inbox" />
              </div>
            </div>
          </div>
        </UCard>

        <!-- ── 浮层 ── -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-panel-top" class="size-4" /><span class="text-sm font-semibold">浮层选型规则</span>
            </div>
          </template>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div v-for="o in [
              { n: 'UModal', w: '确认框、聚焦式表单', u: true },
              { n: 'USlideover', w: '详情面板、设置（从右侧滑入）', u: true },
              { n: 'UDrawer', w: '移动端底部抽屉', u: false },
              { n: 'UPopover', w: '贴着触发器的轻量内容', u: false }
            ]" :key="o.n" class="rounded-lg border border-muted p-3">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold">{{ o.n }}</span>
                <UBadge :color="o.u ? 'success' : 'neutral'" variant="subtle" size="sm">{{ o.u ? '已用' : '未用' }}</UBadge>
              </div>
              <p class="mt-1 text-xs text-muted">{{ o.w }}</p>
            </div>
          </div>
          <UPopover>
            <UButton label="打开 Popover" color="neutral" variant="outline" icon="i-lucide-anchor" />
            <template #content>
              <div class="p-4 text-sm">Popover 内容，无遮罩、贴着触发元素。</div>
            </template>
          </UPopover>
        </UCard>

        <!-- ── 导航 ── -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-navigation" class="size-4" /><span class="text-sm font-semibold">导航</span>
            </div>
          </template>
          <div class="space-y-4">
            <UTabs v-model="tabs" :items="tabsItems" />
            <UBreadcrumb :items="[{ label: '首页', icon: 'i-lucide-home' }, { label: '业务管理' }, { label: '商品' }]" />
            <div class="flex flex-wrap items-center gap-4">
              <UDropdownMenu :items="dropItems">
                <UButton label="UDropdownMenu" icon="i-lucide-ellipsis" color="neutral" variant="ghost" />
              </UDropdownMenu>
              <ULink label="ULink 行内链接" to="#" />
              <UAvatar icon="i-lucide-user" alt="头像" size="md" />
              <UChip color="error" text="3" size="2xs" placement="top-right">
                <UButton icon="i-lucide-inbox" color="neutral" variant="ghost" />
              </UChip>
            </div>
            <div>
              <p class="mb-2 text-xs text-muted">UStepper 分步流程</p>
              <UStepper :items="[{ title: '建模' }, { title: '能力' }, { title: '设计' }, { title: '生成' }]" />
            </div>
          </div>
        </UCard>

        <!-- ── 容器 ── -->
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-layout-grid" class="size-4" /><span class="text-sm font-semibold">容器与折叠</span>
            </div>
          </template>
          <div class="space-y-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <UPageCard title="UPageCard" description="带图标/徽章/链接的内容卡，适合卡片墙" icon="i-lucide-sparkles" :ui="{ container: 'min-h-0' }" />
              <UPageCard title="带操作" description="右下角放跳转" icon="i-lucide-arrow-up-right" :to="'#'" />
            </div>
            <UAccordion :items="accItems" type="single" collapsible />
            <USeparator label="分隔线" />
            <div class="flex items-center gap-3">
              <span class="text-xs text-muted">颜色模式切换：</span>
              <UColorModeButton />
              <UColorModeSwitch />
              <UColorModeSelect class="w-36" />
            </div>
          </div>
        </UCard>

        <UModal v-model:open="modalOpen" title="确认操作" description="破坏性确认用 Modal。">
          <template #body><p class="text-sm">Modal 内容区。</p></template>
          <template #footer>
            <div class="flex justify-end gap-2 w-full">
              <UButton label="取消" color="neutral" variant="ghost" @click="modalOpen = false" />
              <UButton label="确认" @click="modalOpen = false" />
            </div>
          </template>
        </UModal>
        <USlideover v-model:open="slideOpen" title="详情面板" description="详情类内容用 Slideover 更不打断。">
          <template #body><p class="text-sm">Slideover 内容区。</p></template>
        </USlideover>
        <UDrawer v-model:open="drawerOpen" title="移动端抽屉">
          <template #body><p class="text-sm p-4">Drawer 内容区。</p></template>
        </UDrawer>
      </div>
    </template>
  </UDashboardPanel>
</template>
