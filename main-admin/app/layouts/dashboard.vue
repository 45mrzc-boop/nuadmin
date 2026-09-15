<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import { STATIONS } from '~/composables/useStations'

const route = useRoute()
const router = useRouter()
const { token, get } = useApi()
const { push } = useNotify()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const toggleDark = () => { colorMode.preference = isDark.value ? 'light' : 'dark' }

const STATION_ICONS: Record<string, string> = {
  model: 'i-lucide-box', capability: 'i-lucide-puzzle', design: 'i-lucide-palette',
  gen: 'i-lucide-settings-2', logic: 'i-lucide-plug', seed: 'i-lucide-database',
  verify: 'i-lucide-badge-check', preview: 'i-lucide-eye', ai: 'i-lucide-bot'
}

const tenantId = computed(() => Number(route.params.id ?? 0))
const inWorkbench = computed(() => !!tenantId.value && route.path.startsWith('/wb/'))
const wbName = useState<string>('wb.tenantName', () => '')
const wbSlug = useState<string>('wb.tenantSlug', () => '')

const items = computed<NavigationMenuItem[][]>(() => {
  const top: NavigationMenuItem[] = [
    { label: '子后台总览', icon: 'i-lucide-layout-grid', to: '/' },
    { label: '组件库', icon: 'i-lucide-boxes', to: '/components' },
    { label: '组合范例', icon: 'i-lucide-git-compare-arrows', to: '/patterns' },
    { label: '风格实战库', icon: 'i-lucide-palette', to: '/styles' }
  ]
  const groups: NavigationMenuItem[][] = [top]
  if (inWorkbench.value) {
    // 工位靠 query 区分，而链接激活判定只看路径 —— 用 to 会让 9 个工位同时高亮。
    // 因此这里自己算激活态并手动跳转。
    const activeStation = String(route.query.station ?? 'model')
    groups.push(STATIONS.map(s => ({
      label: s.name,
      icon: STATION_ICONS[s.key],
      class: s.key === activeStation
        ? 'bg-primary text-white font-medium'
        : 'text-default hover:bg-elevated',
      onSelect: () => router.push(`/wb/${tenantId.value}?station=${s.key}`)
    })))
  }
  return groups
})

const user = ref<Record<string, any>>({})
onMounted(async () => {
  try { user.value = await get('/profile') } catch { /* 401 时由 useApi 拦截器跳登录 */ }
})

function logout() {
  token.value = null
  push('已退出登录', 'success')
  router.push('/login')
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar id="main" collapsible resizable>
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex min-w-0 items-center gap-2 px-1 py-1">
          <span class="size-8 shrink-0 rounded-lg bg-primary flex items-center justify-center text-white">
            <UIcon name="i-lucide-zap" class="size-5" />
          </span>
          <span v-if="!collapsed" class="truncate font-bold text-[15px]">GenPlus</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <!-- 项目标识放在导航区内，不能塞进 #header：该槽位高度固定，
             多一行会把 logo 顶出可视区（实测 logo top 由 12 变成 -12）。 -->
        <NuxtLink
          v-if="!collapsed && inWorkbench && wbName" :to="`/wb/${tenantId}?station=model`"
          class="mb-2 block min-w-0 rounded-lg bg-elevated px-2 py-1.5 ring ring-inset ring-accented/40 hover:ring-primary/50">
          <span class="block truncate text-xs font-semibold">{{ wbName }}</span>
          <span class="block truncate font-mono text-[10px] text-muted">{{ wbSlug }}</span>
        </NuxtLink>
        <UNavigationMenu :collapsed="collapsed" :items="items" orientation="vertical" tooltip link />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex flex-col gap-1">
          <p v-if="!collapsed" class="truncate px-1 text-xs text-muted" :title="user.nickname || user.username || '未登录'">
            {{ user.nickname || user.username || '未登录' }}
          </p>
          <div class="flex items-center gap-1" :class="collapsed ? 'justify-center' : ''">
            <UButton
              color="neutral" variant="ghost" square
              :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
              :aria-label="isDark ? '切到浅色' : '切到深色'"
              @click="toggleDark"
            />
            <UButton
              v-if="!collapsed"
              color="neutral" variant="ghost" class="flex-1 justify-start"
              icon="i-lucide-log-out" label="退出" @click="logout"
            />
            <UButton
              v-else
              color="neutral" variant="ghost" square icon="i-lucide-log-out"
              aria-label="退出登录" @click="logout"
            />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
