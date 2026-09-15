<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'

const wb = useWb()
const { get, post } = useApi()
const { push } = useNotify()

const status = ref<any>({ running: false, url: '' })
const preview = ref<{ tree: string, files: any[], ddl: string }>({ tree: '', files: [], ddl: '' })
const iframeKey = ref(0)
const busy = ref(false)
const device = ref<'pc' | 'pad'>('pc')
const tab = ref<'tree' | 'ddl'>('tree')
const installMsg = ref('')

const url = computed(() => `/preview/${wb.tenant.slug}/`)

async function loadStatus() { status.value = await get<any>(`/tenant/${wb.tenantId}/status`) }
async function loadPreview() { preview.value = await get<any>('/gen/preview', { tenantId: wb.tenantId }) }
onMounted(async () => { await Promise.all([loadStatus(), loadPreview()]) })

async function start() {
  busy.value = true
  try {
    const r = await post<any>(`/tenant/${wb.tenantId}/start`)
    if (r.installing) {
      installMsg.value = `正在自动安装 ${r.missing?.length ?? ''} 个依赖：${(r.missing ?? []).join(', ')}`
      await pollUntilUp()
    } else if (r.needsInstall) {
      push('子后台依赖异常，请重新生成后再启动', 'error')
    } else if (r.ready === false && !r.running) {
      push(r.message ?? '已启动但端口未就绪', 'error')
      await loadStatus()
    } else {
      push(r.already ? '子后台已在运行' : '子后台已启动', 'success')
    }
    iframeKey.value++
    await Promise.all([loadStatus(), wb.reload()])
  } catch (e: any) {
    push(e?.data?.statusMessage ?? '启动失败', 'error')
  } finally {
    installMsg.value = ''
    busy.value = false
  }
}

/** POST /start returns immediately while npm install runs; poll until it lands. */
async function pollUntilUp() {
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const s = await get<any>(`/tenant/${wb.tenantId}/status`)
    const secs = Math.round((s.install?.elapsedMs ?? 0) / 1000)
    installMsg.value = s.installing
      ? `npm install 进行中（已 ${secs}s）：${(s.install?.missing ?? []).join(', ')}`
      : installMsg.value
    if (s.running) { push('依赖安装完成，子后台已自动启动', 'success'); return }
    if (!s.installing && s.status === 'failed') { push(s.install?.error ? `安装失败：${s.install.error}` : '安装或启动失败', 'error'); return }
  }
  push('安装超时，请稍后刷新查看', 'error')
}

async function stop() {
  await post(`/tenant/${wb.tenantId}/stop`)
  push('已停止子后台', 'success')
  await Promise.all([loadStatus(), wb.reload()])
}

const dirs = computed(() => {
  const m = new Map<string, number>()
  for (const f of preview.value.files ?? []) {
    const d = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '(根目录)'
    m.set(d, (m.get(d) ?? 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
})
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral" variant="soft" icon="i-lucide-eye"
      title="经主后台同源代理内嵌真实运行的子后台"
      :description="`代理路径 ${url} → 子后台自身端口 :${wb.tenant.port}`"
    />

    <div class="flex flex-wrap items-center gap-2">
      <UBadge :color="status.running ? 'success' : 'neutral'" variant="subtle" size="sm" :icon="status.running ? 'i-lucide-play' : 'i-lucide-circle-slash'">
        {{ status.running ? `运行中 :${status.port ?? wb.tenant.port}` : '未运行' }}
      </UBadge>
      <USelect v-model="device" size="sm" class="w-28" :items="[{ label: '桌面', value: 'pc' }, { label: '平板', value: 'pad' }]" />
      <span class="flex-1" />
      <UButton label="刷新" icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="ghost" @click="iframeKey++; loadPreview()" />
      <a v-if="status.running" :href="url" target="_blank" rel="noopener">
        <UButton label="新窗口" icon="i-lucide-external-link" size="sm" color="neutral" variant="outline" />
      </a>
      <UButton v-if="!status.running" label="启动子后台" icon="i-lucide-play" size="sm" :loading="busy" @click="start" />
      <UButton v-else label="停止" icon="i-lucide-square" size="sm" color="error" variant="outline" @click="stop" />
    </div>

    <UAlert
      v-if="installMsg"
      color="info" variant="subtle" icon="i-lucide-loader-circle"
      title="自动安装依赖" :description="installMsg"
    />

    <div class="grid grid-cols-1 2xl:grid-cols-[1.4fr_1fr] gap-4 items-start">
      <UCard :ui="{ body: 'p-2 sm:p-2' }">
        <div class="flex items-center gap-2 rounded-t-lg bg-elevated px-3 py-2">
          <span class="flex gap-1.5">
            <span class="size-2.5 rounded-full bg-red-500" />
            <span class="size-2.5 rounded-full bg-amber-400" />
            <span class="size-2.5 rounded-full bg-green-500" />
          </span>
          <code class="flex-1 truncate rounded border border-default bg-default px-2.5 py-0.5 font-mono text-[11px] text-muted">{{ url }}</code>
          <UButton icon="i-lucide-rotate-cw" size="xs" color="neutral" variant="ghost" @click="iframeKey++" />
        </div>

        <div class="bg-muted p-2">
          <iframe
            v-if="status.running" :key="iframeKey" :src="url"
            class="h-[560px] w-full rounded-md border border-default bg-default"
            :class="device === 'pad' ? 'max-w-[768px] mx-auto' : ''"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          <div v-else class="flex h-[360px] flex-col items-center justify-center gap-2 rounded-md bg-default text-muted">
            <UIcon name="i-lucide-monitor-play" class="size-10" />
            <p class="text-sm">子后台未运行</p>
            <p class="text-xs">
              点「启动子后台」，或在容器内浏览器直接访问
              <code class="font-mono">http://127.0.0.1:{{ wb.tenant.port }}</code>
            </p>
          </div>
        </div>
      </UCard>

      <div class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold">产物结构</span>
              <UBadge color="neutral" variant="subtle" size="sm">{{ (preview.files ?? []).length }} 文件</UBadge>
              <span class="flex-1" />
              <UTabs v-model="tab" size="xs" :items="[{ label: '目录', value: 'tree' }, { label: '建表', value: 'ddl' }]" />
            </div>
          </template>

          <div v-if="tab === 'tree'" class="max-h-[260px] overflow-y-auto">
            <div v-for="[d, n] in dirs" :key="d" class="flex items-center gap-2 border-b border-muted py-1.5 last:border-0">
              <code class="flex-1 truncate font-mono text-xs">{{ d }}</code>
              <UBadge color="primary" variant="subtle" size="sm">{{ n }}</UBadge>
            </div>
            <p v-if="!dirs.length" class="py-8 text-center text-sm text-muted">尚未生成产物</p>
          </div>
          <pre v-else class="max-h-[260px] overflow-auto text-[11px] leading-relaxed text-muted">{{ preview.ddl || '尚未生成' }}</pre>
        </UCard>

        <UCard>
          <template #header><span class="text-sm font-semibold">子后台数据库</span></template>
          <dl class="space-y-1.5 text-xs">
            <div class="flex justify-between gap-3"><dt class="text-muted">库名</dt><dd class="font-mono">{{ wb.tenant.db_name }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">端口</dt><dd class="font-mono">{{ wb.tenant.port }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">版本</dt><dd class="font-mono">v{{ wb.tenant.version }}</dd></div>
            <div class="flex justify-between gap-3"><dt class="text-muted">项目目录</dt><dd class="max-w-[14rem] truncate font-mono">{{ wb.tenant.project_path }}</dd></div>
          </dl>
        </UCard>
      </div>
    </div>
  </div>
</template>
