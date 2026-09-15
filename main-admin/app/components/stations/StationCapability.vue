<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'

const wb = useWb()
const { get, post } = useApi()
const { push } = useNotify()

const all = ref<any[]>([])
const category = ref('全部')
const loading = ref(false)
const drawerOpen = ref(false)

const CATS = ['全部', 'system', 'data', 'media', 'insight', 'biz', 'ui']

async function load() {
  loading.value = true
  try { all.value = await get<any[]>('/capability', { tenantId: wb.tenantId }) }
  finally { loading.value = false }
}
onMounted(load)

const installed = computed(() => new Map<string, any>(wb.caps.map((c: any) => [c.cap_key ?? c.capKey, c])))
const shown = computed(() => all.value.filter(c => category.value === '全部' || c.category === category.value))
const spec = (c: any) => (typeof c.spec_json === 'string' ? JSON.parse(c.spec_json) : c.spec_json) ?? c.spec ?? {}

const drawer = ref<any>(null)
const cfg = reactive<Record<string, any>>({})

function openConfig(c: any) {
  drawer.value = c
  const cur = installed.value.get(c.cap_key)
  for (const f of spec(c).config ?? []) {
    cfg[f.key] = cur?.config_json?.[f.key] ?? f.default
  }
  drawerOpen.value = true
}

async function install(c: any) {
  await post('/capability/install', { tenantId: wb.tenantId, capKey: c.cap_key })
  push(`已安装「${c.name}」，生成时将写入对应表/接口/页面`, 'success')
  await wb.reload()
}

async function uninstall(c: any) {
  await post('/capability/uninstall', { tenantId: wb.tenantId, capKey: c.cap_key })
  push(`已卸载「${c.name}」`, 'success')
  await wb.reload()
}

async function saveConfig() {
  await post('/capability/config', { tenantId: wb.tenantId, capKey: drawer.value.cap_key, config: { ...cfg } })
  push('能力配置已保存', 'success')
  drawerOpen.value = false
  await wb.reload()
}

async function rollback(c: any) {
  await post('/capability/rollback', { tenantId: wb.tenantId, capKey: c.cap_key })
  push(`「${c.name}」已回退到安装前基线`, 'success')
  await wb.reload()
}

/** Impact summary: how much real code this capability contributes. */
const impact = (c: any) => {
  const s = spec(c)
  return [
    { icon: 'i-lucide-database', n: s.tables?.length ?? 0, tip: '新增表' },
    { icon: 'i-lucide-columns-3', n: s.columns?.length ?? 0, tip: '注入字段' },
    { icon: 'i-lucide-plug', n: s.apis?.length ?? 0, tip: '新增接口' },
    { icon: 'i-lucide-file-text', n: s.pages?.length ?? 0, tip: '新增页面' }
  ].filter(x => x.n > 0)
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral" variant="soft" icon="i-lucide-puzzle"
      title="勾选的能力会在生成时真实落码：建表、注入字段、生成接口与页面"
      :description="`已安装 ${installed.size} / ${all.length} 项。不勾选则一行代码都不产生。`"
    />

    <div class="flex flex-wrap items-center gap-2">
      <USelect
        v-model="category" :items="CATS" size="sm" class="w-40"
        icon="i-lucide-filter"
      />
      <USkeleton v-if="loading" class="h-7 w-24" />
      <span class="flex-1" />
      <UButton label="刷新" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" @click="load" />
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      <UCard
        v-for="c in shown" :key="c.cap_key"
        :class="installed.has(c.cap_key) ? 'ring-1 ring-success' : ''">
        <template #header>
          <div class="flex items-start gap-2.5">
            <UIcon :name="c.icon?.startsWith('i-') ? c.icon : 'i-lucide-puzzle'" class="size-6 shrink-0 text-primary" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold">{{ c.name }}</span>
                <UBadge v-if="installed.has(c.cap_key)" color="success" variant="subtle" size="sm">已安装</UBadge>
              </div>
              <div class="mt-1 flex flex-wrap items-center gap-1.5">
                <UBadge color="neutral" variant="subtle" size="sm">{{ c.category }}</UBadge>
                <span class="font-mono text-[11px] text-muted">v{{ c.version }}</span>
                <UBadge v-if="installed.get(c.cap_key)?.status === 'outdated'" color="warning" variant="subtle" size="sm">可更新</UBadge>
              </div>
            </div>
          </div>
        </template>

        <p class="min-h-[48px] text-xs leading-relaxed text-muted">{{ c.summary }}</p>

        <div class="mt-2 flex flex-wrap gap-3">
          <UTooltip v-for="i in impact(c)" :key="i.tip" :text="i.tip">
            <span class="flex items-center gap-1 text-xs text-muted">
              <UIcon :name="i.icon" class="size-3.5" />{{ i.n }}
            </span>
          </UTooltip>
        </div>

        <template #footer>
          <div class="flex gap-2">
            <template v-if="!installed.has(c.cap_key)">
              <UButton label="安装" icon="i-lucide-download" size="sm" block @click="install(c)" />
            </template>
            <template v-else>
              <UButton label="配置" icon="i-lucide-settings-2" size="sm" variant="outline" @click="openConfig(c)" />
              <UButton label="回退" icon="i-lucide-undo-2" size="sm" color="neutral" variant="ghost" @click="rollback(c)" />
              <UButton icon="i-lucide-trash-2" size="sm" color="error" variant="ghost" @click="uninstall(c)" />
            </template>
          </div>
        </template>
      </UCard>
    </div>

    <USlideover
      v-model:open="drawerOpen"
      :title="`${drawer?.name ?? ''} · v${drawer?.version ?? ''}`"
      description="该能力会写入生成工程的具体内容"
    >
      <template #body>
        <div class="space-y-4">
          <section>
            <h4 class="mb-1 text-xs font-semibold text-muted">📌 能力定位</h4>
            <p class="text-sm leading-relaxed">{{ spec(drawer).desc }}</p>
          </section>

          <section v-if="spec(drawer).tables?.length">
            <h4 class="mb-1 text-xs font-semibold text-muted">📊 数据结构</h4>
            <div v-for="t in spec(drawer).tables" :key="t.name" class="flex items-center gap-2 border-b border-muted py-1.5 text-sm">
              <code class="font-mono text-xs">{{ t.name }}</code>
              <span class="flex-1 text-muted">{{ t.comment }}</span>
              <UBadge color="neutral" variant="subtle" size="sm">{{ t.fields.length }} 字段</UBadge>
            </div>
          </section>

          <section v-if="spec(drawer).apis?.length">
            <h4 class="mb-1 text-xs font-semibold text-muted">🔌 接口与钩子</h4>
            <div v-for="a in spec(drawer).apis" :key="a.path" class="flex items-center gap-2 py-1 text-sm">
              <UBadge color="primary" variant="subtle" size="sm" class="w-14 justify-center">{{ a.method }}</UBadge>
              <code class="font-mono text-xs">{{ a.path }}</code>
              <span class="truncate text-xs text-muted">{{ a.comment }}</span>
            </div>
          </section>

          <section v-if="spec(drawer).verify?.length">
            <h4 class="mb-1 text-xs font-semibold text-muted">✅ 验收标准</h4>
            <ul class="space-y-1">
              <li v-for="v in spec(drawer).verify" :key="v" class="flex gap-2 text-sm text-muted">
                <UIcon name="i-lucide-check" class="size-4 shrink-0 text-success" />{{ v }}
              </li>
            </ul>
          </section>

          <USeparator />

          <section>
            <h4 class="mb-2 text-xs font-semibold text-muted">⚙️ 配置项</h4>
            <div v-if="!spec(drawer).config?.length" class="text-sm text-muted">该能力无可配置项。</div>
            <UForm :state="cfg" class="space-y-3">
              <UFormField v-for="f in spec(drawer).config ?? []" :key="f.key" :label="f.label">
                <UInput v-if="f.type === 'text'" v-model="cfg[f.key]" class="w-full" />
                <UInput v-else-if="f.type === 'number'" v-model="cfg[f.key]" type="number" class="w-full" />
                <USelect v-else-if="f.type === 'select'" v-model="cfg[f.key]" :items="f.options ?? []" class="w-full" />
                <USwitch v-else v-model="cfg[f.key]" />
              </UFormField>
            </UForm>
          </section>
        </div>
      </template>

      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="关闭" color="neutral" variant="ghost" @click="drawerOpen = false" />
          <UButton label="保存配置" icon="i-lucide-check" @click="saveConfig" />
        </div>
      </template>
    </USlideover>
  </div>
</template>
