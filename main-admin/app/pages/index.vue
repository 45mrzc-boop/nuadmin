<script setup lang="ts">
const { get, post, del } = useApi()
const { push } = useNotify()
const router = useRouter()

definePageMeta({ layout: 'dashboard' })

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const size = 12
const keyword = ref('')
const busy = ref(false)
const showNew = ref(false)
const confirmDel = ref<any>(null)
const form = reactive({ name: '', description: '' })

const STATUS: Record<string, { label: string, color: string, icon: string }> = {
  draft: { label: '草稿', color: 'neutral', icon: 'i-lucide-file' },
  generated: { label: '已生成', color: 'info', icon: 'i-lucide-package-check' },
  running: { label: '运行中', color: 'success', icon: 'i-lucide-play' },
  stopped: { label: '已停止', color: 'warning', icon: 'i-lucide-pause' },
  failed: { label: '生成失败', color: 'error', icon: 'i-lucide-triangle-alert' }
}

async function load() {
  busy.value = true
  try {
    const r = await get<{ list: any[], total: number }>('/tenant', { keyword: keyword.value, page: page.value, size })
    list.value = r.list
    total.value = r.total
  } finally { busy.value = false }
}

async function create() {
  if (!form.name.trim()) return push('请填写子后台名称', 'error')
  const t = await post<any>('/tenant', { name: form.name, description: form.description })
  push(`已创建「${t.name}」· 端口 ${t.port} · 库 ${t.db_name}`, 'success')
  showNew.value = false
  Object.assign(form, { name: '', description: '' })
  await router.push(`/wb/${t.id}?station=model`)
}

async function remove(t: any) {
  await del(`/tenant/${t.id}`)
  push(`已删除「${t.name}」`, 'success')
  await load()
}

onMounted(load)

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size)))
</script>

<template>
  <UDashboardPanel id="tenants">
    <template #header>
      <UDashboardNavbar title="子后台总览">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UInput
            v-model="keyword" icon="i-lucide-search" placeholder="搜索名称 / slug"
            size="sm" class="w-44" @keyup.enter="page = 1; load()"
          />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="busy" @click="page = 1; load()" />
          <UButton icon="i-lucide-plus" label="新建子后台" size="sm" @click="showNew = true" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UBadge color="neutral" variant="subtle" size="sm" icon="i-lucide-layers">SaaS 控制面</UBadge>
          <span class="text-xs text-muted">每个子后台都是独立 Nuxt 4 工程 + 独立数据库，生成后与主后台完全脱离</span>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="!list.length && !busy" class="flex flex-col items-center justify-center py-24 text-center">
        <UIcon name="i-lucide-package" class="size-12 text-muted" />
        <p class="mt-3 text-sm text-muted">还没有子后台，点右上角「新建子后台」开始建模</p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <UCard v-for="t in list" :key="t.id">
          <template #header>
            <div class="flex items-center gap-2">
              <UBadge v-bind="STATUS[t.status] ?? { label: t.status, color: 'neutral', icon: 'i-lucide-help' }" variant="subtle" size="sm" />
              <span class="text-xs text-muted">v{{ t.version }}</span>
              <span class="flex-1" />
              <span class="text-xs font-mono text-muted">:{{ t.port }}</span>
            </div>
          </template>

          <h3 class="font-semibold text-[15px] truncate">{{ t.name }}</h3>
          <p class="text-xs text-muted mt-0.5 h-4 truncate">{{ t.description || '—' }}</p>
          <dl class="mt-3 space-y-1 text-xs">
            <div class="flex justify-between gap-3"><dt class="text-muted">slug</dt><dd class="font-mono truncate">{{ t.slug }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">数据库</dt><dd class="font-mono truncate">{{ t.db_name }}</dd></div>
          </dl>

          <template #footer>
            <div class="flex gap-2">
              <UButton label="进入工作台" icon="i-lucide-wrench" size="sm" block @click="router.push(`/wb/${t.id}?station=model`)" />
              <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" size="sm" @click="confirmDel = t" />
            </div>
          </template>
        </UCard>
      </div>

      <div v-if="total > size" class="flex items-center justify-center gap-3 py-6">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="outline" :disabled="page === 1" @click="page--; load()" />
        <span class="text-sm text-muted">{{ page }} / {{ pageCount }}</span>
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="outline" :disabled="page >= pageCount" @click="page++; load()" />
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="showNew" title="新建子后台">
    <template #body>
      <UForm :state="form" class="space-y-4">
        <UFormField label="名称" required>
          <UInput v-model="form.name" placeholder="例如：智慧水务运营平台" class="w-full" @keyup.enter="create" />
        </UFormField>
        <UFormField label="描述">
          <UTextarea v-model="form.description" :rows="3" placeholder="一句话说明这个后台做什么" class="w-full" />
        </UFormField>
        <p class="text-xs text-muted">创建时自动分配 slug、独立数据库名、端口与 JWT 密钥；模型与能力在工作台里配置。</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="取消" color="neutral" variant="ghost" @click="showNew = false" />
        <UButton label="创建并进入建模" icon="i-lucide-arrow-right" @click="create" />
      </div>
    </template>
  </UModal>

  <UModal
    :open="!!confirmDel"
    :title="`删除「${confirmDel?.name ?? ''}」？`"
    @update:open="(v: boolean) => { if (!v) confirmDel = null }"
  >
    <template #body>
      <p class="text-sm text-muted leading-relaxed">
        将移除该子后台的生成目录与控制面记录（建模、能力、版本历史一并删除）。
        独立数据库 <code class="font-mono">{{ confirmDel?.db_name }}</code> 不会被自动删除。
      </p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton label="取消" color="neutral" variant="ghost" @click="confirmDel = null" />
        <UButton label="确认删除" color="error" icon="i-lucide-trash-2" @click="remove(confirmDel); confirmDel = null" />
      </div>
    </template>
  </UModal>
</template>
