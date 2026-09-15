<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'

const wb = useWb()
const { get, post } = useApi()
const { push } = useNotify()

const cases = ref<any[]>([])
const busy = ref(false)
const withBoot = ref(false)

const ICON: Record<string, string> = {
  pass: 'i-lucide-circle-check', fail: 'i-lucide-circle-x', skip: 'i-lucide-circle-slash'
}
const COLOR: Record<string, any> = { pass: 'success', fail: 'error', skip: 'neutral' }

const stats = computed(() => ({
  pass: cases.value.filter(c => c.status === 'pass').length,
  fail: cases.value.filter(c => c.status === 'fail').length,
  skip: cases.value.filter(c => c.status === 'skip').length
}))

const groups = computed(() => {
  const m = new Map<string, any[]>()
  for (const c of cases.value) {
    const key = String(c.case_key).startsWith('cap:') ? '能力用例' : '基础用例'
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(c)
  }
  return [...m.entries()]
})

async function load() { cases.value = await get<any[]>('/verify', { tenantId: wb.tenantId }) }
onMounted(load)

async function run() {
  busy.value = true
  try {
    const r = await post<any>(`/verify/${wb.tenantId}`, { boot: withBoot.value })
    cases.value = r.cases ?? []
    const f = cases.value.filter((c: any) => c.status === 'fail').length
    push(f ? `${f} 项未通过，见下方明细` : '全部通过', f ? 'error' : 'success')
  } finally { busy.value = false }
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      :color="stats.fail ? 'error' : stats.pass ? 'success' : 'neutral'"
      :variant="stats.fail ? 'subtle' : 'soft'"
      :icon="stats.fail ? 'i-lucide-triangle-alert' : 'i-lucide-badge-check'"
      :title="`真跑验证：文件完整性 · esbuild 解析 · DDL 实跑建表 · 可选真机登录`"
      description="未安装依赖时启动用例如实标记为 skip，不做假绿。"
    />

    <div class="flex flex-wrap items-center gap-3">
      <USwitch v-model="withBoot" label="含真机启动（需已 npm install，约 2 分钟）" />
      <span class="flex-1" />
      <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" @click="load" />
      <UButton label="执行冒烟" icon="i-lucide-play" size="sm" :loading="busy" @click="run" />
    </div>

    <div class="grid grid-cols-3 gap-3">
      <UCard v-for="s in [
        { k: '通过', v: stats.pass, c: 'text-success', i: 'i-lucide-circle-check' },
        { k: '失败', v: stats.fail, c: 'text-error', i: 'i-lucide-circle-x' },
        { k: '跳过', v: stats.skip, c: 'text-muted', i: 'i-lucide-circle-slash' }
      ]" :key="s.k">
        <div class="flex items-center gap-3">
          <UIcon :name="s.i" :class="['size-6', s.c]" />
          <div>
            <div class="text-2xl font-bold" :class="s.c">{{ s.v }}</div>
            <div class="text-xs text-muted">{{ s.k }}</div>
          </div>
        </div>
      </UCard>
    </div>

    <UCard>
      <template #header><span class="text-sm font-semibold">用例明细</span></template>

      <div v-if="!cases.length" class="py-10 text-center text-sm text-muted">
        还没有验证记录，点「执行冒烟」。
      </div>

      <div v-else class="divide-y divide-default">
        <div v-for="[grp, rows] in groups" :key="grp" class="py-2">
          <p class="px-1 pb-1 text-xs font-semibold text-muted">{{ grp }}</p>
          <div v-for="(c, i) in rows" :key="i" class="flex items-start gap-3 px-1 py-2">
            <UIcon :name="ICON[c.status] ?? 'i-lucide-help'" :class="[COLOR[c.status] === 'neutral' ? 'text-muted' : COLOR[c.status] === 'error' ? 'text-error' : 'text-success', 'size-4 mt-0.5 shrink-0']" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{{ c.title }}</span>
                <UBadge :color="COLOR[c.status] ?? 'neutral'" variant="subtle" size="sm">{{ c.status }}</UBadge>
                <span class="text-xs text-muted">{{ c.duration }}ms</span>
              </div>
              <p class="mt-0.5 text-xs whitespace-pre-wrap break-words" :class="c.status === 'fail' ? 'text-error' : 'text-muted'">
                {{ c.detail }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
