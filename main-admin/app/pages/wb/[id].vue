<script setup lang="ts">
import { STATIONS } from '~/composables/useStations'
import type { Workbench } from '~/composables/useWorkbench'
// Nuxt resolves component tags at compile time, so a runtime string like
// `:is="'Station' + key"` silently renders an <stationmodel> custom element
// with no warning. The nine stations are therefore mapped explicitly.
import StationModel from '~/components/stations/StationModel.vue'
import StationCapability from '~/components/stations/StationCapability.vue'
import StationDesign from '~/components/stations/StationDesign.vue'
import StationGen from '~/components/stations/StationGen.vue'
import StationLogic from '~/components/stations/StationLogic.vue'
import StationSeed from '~/components/stations/StationSeed.vue'
import StationVerify from '~/components/stations/StationVerify.vue'
import StationPreview from '~/components/stations/StationPreview.vue'
import StationAi from '~/components/stations/StationAi.vue'

definePageMeta({ layout: 'dashboard' })

const STATION_COMPONENTS: Record<string, any> = {
  model: StationModel, capability: StationCapability, design: StationDesign,
  gen: StationGen, logic: StationLogic, seed: StationSeed,
  verify: StationVerify, preview: StationPreview, ai: StationAi
}

const route = useRoute()
const { get } = useApi()
const tenantId = Number(route.params.id)
const stationKey = computed(() => String(route.query.station ?? 'model'))

const detail = ref<any>(null)
const dictList = ref<any[]>([])
const loading = ref(true)
const err = ref('')

async function reload() {
  loading.value = true
  err.value = ''
  try {
    // 字典和模型一起刷新：字段表单里的「关联字典 / 枚举值」直接读这份，
    // 不再单独发请求，避免建模站各处看到不同步的字典。
    const [d, dicts] = await Promise.all([
      get(`/tenant/${tenantId}`),
      get('/dict', { tenantId }).catch(() => [])
    ])
    detail.value = d
    dictList.value = Array.isArray(dicts) ? dicts : []
  }
  catch (e: any) { err.value = e?.data?.statusMessage ?? '加载失败' }
  finally { loading.value = false }
}

const wb = reactive({
  tenantId,
  tenant: computed(() => detail.value ?? {}),
  groups: computed<any[]>(() => detail.value?.groups ?? []),
  modules: computed<any[]>(() => (detail.value?.groups ?? []).flatMap((g: any) => g.modules ?? [])),
  caps: computed<any[]>(() => detail.value?.caps ?? []),
  dicts: computed<any[]>(() => dictList.value),
  reload
}) as unknown as Workbench

provide('wb', wb)
onMounted(reload)

const current = computed(() => STATIONS.find(s => s.key === stationKey.value) ?? STATIONS[0])
const stationComponent = computed(() => STATION_COMPONENTS[current.value.key])
const go = (key: string) => navigateTo(`/wb/${tenantId}?station=${key}`)

/**
 * 工作台身份标识：多开子项目时必须一眼看出在哪个项目里。
 * 共享给 layout 渲染侧栏，同时写进浏览器标签页。
 */
const wbName = useState<string>('wb.tenantName', () => '')
const wbSlug = useState<string>('wb.tenantSlug', () => '')
watch(detail, (d: any) => {
  wbName.value = d?.name ?? ''
  wbSlug.value = d?.slug ?? ''
}, { immediate: true })
useHead({ title: computed(() => wbName.value ? `${current.value.name} · ${wbName.value} — GenPlus` : 'GenPlus · AI 工作台') })
</script>

<template>
  <UDashboardPanel id="workbench">
    <template #header>
      <UDashboardNavbar :title="`${current.icon} ${current.name}`">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #left>
          <USeparator orientation="vertical" class="h-6" />
          <NuxtLink to="/" class="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 hover:bg-elevated">
            <UIcon name="i-lucide-folder-git-2" class="size-4 shrink-0 text-primary" />
            <span class="max-w-[16rem] truncate text-sm font-semibold">{{ detail?.name || '加载中…' }}</span>
            <UBadge v-if="detail?.slug" color="neutral" variant="subtle" size="sm" class="hidden md:inline-flex font-mono">{{ detail.slug }}</UBadge>
          </NuxtLink>
        </template>
        <template #right>
          <UBadge :label="`:${detail?.port ?? '?'}`" color="primary" variant="subtle" size="sm" />
          <USelect
            :model-value="stationKey" size="sm" class="w-40"
            :items="STATIONS.map(s => ({ label: `${s.icon} ${s.name}`, value: s.key }))"
            @update:model-value="go($event as string)"
          />
          <UButton icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="ghost" :loading="loading" @click="reload" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left><span class="text-xs text-muted">💡 {{ current.tag }}</span></template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="err" class="p-6">
        <UAlert color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="err" />
      </div>
      <div v-else-if="loading" class="grid grid-cols-1 gap-3 p-6">
        <USkeleton class="h-16 w-full" />
        <USkeleton class="h-64 w-full" />
      </div>
      <div v-else-if="detail" class="p-4 sm:p-6">
        <component :is="stationComponent" />
      </div>
    </template>
  </UDashboardPanel>
</template>
