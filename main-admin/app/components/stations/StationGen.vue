<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'

const wb = useWb()
const { get, post } = useApi()
const { push } = useNotify()

const timeline = ref<any[]>([])
const busy = ref(false)
const last = ref<any>(null)
const note = ref('')
const tab = ref<'files' | 'log' | 'ddl'>('files')
const preview = ref<{ tree: string, files: any[], ddl: string }>({ tree: '', files: [], ddl: '' })

const STEPS = ['解析模型', '合并能力', '生成服务端', '生成前端', '写入磁盘', 'Git 快照']
const step = ref(-1)

const moduleCount = computed(() => wb.modules.length)
const fieldCount = computed(() => wb.modules.reduce((n: number, m: any) => n + (m.fields?.length ?? 0), 0))

async function loadTimeline() { timeline.value = await get<any[]>('/gen/timeline', { tenantId: wb.tenantId }) }
async function loadPreview() { preview.value = await get<any>('/gen/preview', { tenantId: wb.tenantId }) }
onMounted(async () => { await Promise.all([loadTimeline(), loadPreview()]) })

async function generate() {
  if (busy.value) return
  busy.value = true
  step.value = 0
  const timer = setInterval(() => { if (step.value < STEPS.length - 1) step.value++ }, 900)
  try {
    const r = await post<any>(`/gen/${wb.tenantId}`, { note: note.value })
    last.value = r
    gaps.value = Array.isArray(r?.dictGaps) ? r.dictGaps : []
    push(`生成完成 v${r.version}，共 ${r.files?.length ?? 0} 个文件`, 'success')
    if (gaps.value.length) push(`${gaps.value.length} 个枚举字段没有可用字典，已降级为输入框`, 'warning')
    step.value = STEPS.length - 1
    note.value = ''
    await Promise.all([wb.reload(), loadTimeline(), loadPreview()])
  } catch (e: any) {
    push(e?.data?.statusMessage ?? '生成失败', 'error')
  } finally {
    clearInterval(timer)
    step.value = -1
    busy.value = false
  }
}

async function rollback(v: number) {
  await post('/gen/rollback', { tenantId: wb.tenantId, version: v })
  push(`已回滚到 v${v}`, 'success')
  await Promise.all([loadTimeline(), loadPreview()])
}

/** 缺字典的枚举字段：生成成功不等于没问题，必须摆在眼前而不是只写进 log。 */
const gaps = ref<Array<{ module: string, field: string, key: string }>>([])

const KIND: Record<string, { label: string, color: string }> = {
  generate: { label: '生成', color: 'primary' },
  verify: { label: '验证', color: 'info' },
  rollback: { label: '回滚', color: 'warning' }
}

const fileGroups = computed(() => {
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
      color="neutral" variant="soft" icon="i-lucide-settings-2"
      :title="`${moduleCount} 模块 · ${fieldCount} 字段 · ${wb.caps.length} 能力 → 独立 Nuxt 4 工程`"
      description="每次生成都是一个真实 git 提交，可逐版本回滚。"
    />

    <div class="flex flex-wrap items-center gap-2">
      <UInput v-model="note" placeholder="本次生成备注" size="sm" class="w-56" icon="i-lucide-tag" />
      <span class="flex-1" />
      <UButton
        :label="`生成 v${(wb.tenant.version ?? 0) + 1}`" icon="i-lucide-hammer"
        :loading="busy" :disabled="busy || !moduleCount" @click="generate"
      />
    </div>

    <UCard v-if="step >= 0">
      <div class="flex flex-wrap items-center gap-2">
        <template v-for="(s, i) in STEPS" :key="s">
          <div class="flex items-center gap-1.5">
            <UIcon
              :name="i < step ? 'i-lucide-circle-check' : i === step ? 'i-lucide-loader' : 'i-lucide-circle'"
              :class="[i < step ? 'text-success' : i === step ? 'text-primary animate-spin' : 'text-muted', 'size-4']"
            />
            <span class="text-xs" :class="i <= step ? 'text-default' : 'text-muted'">{{ s }}</span>
          </div>
          <UIcon v-if="i < STEPS.length - 1" name="i-lucide-chevron-right" class="size-3 text-muted" />
        </template>
      </div>
    </UCard>

    <UAlert v-if="!moduleCount" color="warning" variant="soft" icon="i-lucide-triangle-alert"
      title="建模站还没有模块" description="先去建模站建表，否则生成出来是空工程。" />

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <span class="text-sm font-semibold">版本时间线</span>
            <UBadge color="neutral" variant="subtle" size="sm">{{ timeline.length }} 次</UBadge>
          </div>
        </template>
        <div v-if="!timeline.length" class="py-8 text-center text-sm text-muted">还没有生成记录</div>
        <div v-else class="max-h-[420px] divide-y divide-default overflow-y-auto">
          <div v-for="t in timeline" :key="t.id" class="flex items-start gap-3 py-2.5">
            <UIcon
              :name="t.status === 'success' ? 'i-lucide-circle-check' : t.status === 'failed' ? 'i-lucide-circle-x' : 'i-lucide-loader'"
              :class="[t.status === 'success' ? 'text-success' : t.status === 'failed' ? 'text-error' : 'text-warning', 'size-4 mt-0.5 shrink-0']"
            />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-sm font-semibold">v{{ t.version }}</span>
                <UBadge :color="KIND[t.kind]?.color ?? 'neutral'" variant="subtle" size="sm">{{ KIND[t.kind]?.label ?? t.kind }}</UBadge>
                <span class="truncate text-xs text-muted">{{ t.message }}</span>
              </div>
              <p class="mt-0.5 text-xs text-muted">{{ t.files }} 文件 · {{ t.created_at }}</p>
            </div>
            <UButton
              v-if="t.kind === 'generate' && t.status === 'success'"
              label="回滚" icon="i-lucide-undo-2" size="xs" color="neutral" variant="outline"
              @click="rollback(t.version)"
            />
          </div>
        </div>
      </UCard>

      <UAlert
        v-if="gaps.length" color="warning" variant="subtle" icon="i-lucide-triangle-alert"
        :title="`${gaps.length} 个枚举字段没有可用字典，已降级为输入框`"
      >
        <template #description>
          <p class="mt-1 text-xs">
            这些字段引用了字典但字典没有条目，回到建模站「数据字典」补条目（或在字段表单里填枚举值）后重新生成：
          </p>
          <ul class="mt-1 list-disc space-y-0.5 pl-5 font-mono text-xs">
            <li v-for="g in gaps.slice(0, 12)" :key="`${g.module}-${g.field}`">{{ g.module }}.{{ g.field }} → {{ g.key }}</li>
            <li v-if="gaps.length > 12">…另有 {{ gaps.length - 12 }} 个</li>
          </ul>
        </template>
      </UAlert>

      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold">产物</span>
            <UTabs
              v-model="tab" size="xs" :items="[
                { label: '文件清单', value: 'files' },
                { label: '建表语句', value: 'ddl' },
                { label: '生成日志', value: 'log' }
              ]"
            />
          </div>
        </template>

        <div v-if="tab === 'files'" class="max-h-[420px] overflow-y-auto">
          <div v-for="[d, n] in fileGroups" :key="d" class="flex items-center gap-2 border-b border-muted py-1.5 text-xs">
            <code class="flex-1 truncate font-mono">{{ d }}</code>
            <UBadge color="primary" variant="subtle" size="sm">{{ n }}</UBadge>
          </div>
          <p v-if="!fileGroups.length" class="py-8 text-center text-sm text-muted">尚未生成产物</p>
        </div>

        <pre v-else-if="tab === 'ddl'" class="max-h-[420px] overflow-auto text-[11px] leading-relaxed text-muted">{{ preview.ddl || '尚未生成' }}</pre>
        <pre v-else class="max-h-[420px] overflow-auto text-[11px] leading-relaxed text-muted">{{ last?.log ?? '点击「生成」后这里显示本次日志' }}</pre>
      </UCard>
    </div>
  </div>
</template>
