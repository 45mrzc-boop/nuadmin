<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'

const wb = useWb()
const { patch } = useApi()
const { push } = useNotify()

const active = useState<number>('seed.activeModule', () => 0)
const mod = computed(() => wb.modules[active.value] ?? null)
const seed = reactive<any>({ enabled: true, rows: 20, rules: {} })

watch(mod, (m: any) => {
  if (!m) return
  const raw = typeof m.seed_json === 'string' ? JSON.parse(m.seed_json) : (m.seed_json ?? {})
  Object.assign(seed, { enabled: true, rows: 20, rules: {}, ...raw })
  seed.rules = { ...raw.rules ?? {} }
}, { immediate: true, deep: true })

/** Mirrors server/utils/gen/sql.ts seedHint so the preview matches the generator. */
function hint(f: any): string {
  if (seed.rules[f.col_key]) return seed.rules[f.col_key]
  switch (f.type) {
    case 'int': return 'rand(1,9999)'
    case 'decimal': case 'money': return 'money(100,100000)'
    case 'bool': return 'bool()'
    case 'date': return 'date()'
    case 'datetime': return 'datetime()'
    case 'enum': return `pick(${f.dict_key || f.col_key})`
    case 'json': return 'json()'
    case 'text': case 'richtext': return 'sentence()'
    case 'image': return 'image()'
    case 'file': return 'file()'
    default:
      if (f.col_key.includes('phone')) return 'phone()'
      if (f.col_key.includes('email')) return 'email()'
      if (f.col_key.includes('name') || f.col_key.includes('title')) return 'cnName()'
      return `word(${f.length || 32})`
  }
}

const FNS = [
  { n: 'rand(a,b)', d: '整数区间' }, { n: 'money(a,b)', d: '两位小数金额' },
  { n: 'bool()', d: '0/1' }, { n: 'date()', d: '近一年日期' }, { n: 'datetime()', d: '日期时间' },
  { n: 'pick(dict)', d: '取字典项' }, { n: 'cnName()', d: '中文姓名' }, { n: 'phone()', d: '手机号' },
  { n: 'email()', d: '邮箱' }, { n: 'word(n)', d: '短文本' }, { n: 'sentence()', d: '句子' },
  { n: 'image()', d: '占位图 URL' }, { n: 'json()', d: '空对象' }
]

const total = computed(() => wb.modules.reduce((n: number, m: any) => {
  const s = typeof m.seed_json === 'string' ? JSON.parse(m.seed_json) : (m.seed_json ?? {})
  return n + ((s.enabled ?? true) ? Number(s.rows ?? 20) : 0)
}, 0))

async function save() {
  if (!mod.value) return
  await patch(`/seed/${mod.value.id}`, { seed: JSON.parse(JSON.stringify(seed)) })
  push(`「${mod.value.name}」种子配置已保存`, 'success')
  await wb.reload()
}

async function setAll(enabled: boolean, rows = 20) {
  for (const m of wb.modules) {
    const s = typeof m.seed_json === 'string' ? JSON.parse(m.seed_json) : (m.seed_json ?? {})
    await patch(`/seed/${m.id}`, { seed: { ...s, enabled, rows } })
  }
  push(enabled ? `已为 ${wb.modules.length} 个模块开启种子` : '已全部关闭种子', 'success')
  await wb.reload()
}
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral" variant="soft" icon="i-lucide-database"
      title="列名启发式生成种子数据"
      :description="`只在表为空时写入，重复生成不会污染已有数据。预计写入 ${total} 行。`"
    >
      <template #actions>
        <UButton label="全部开启" size="xs" color="neutral" variant="outline" @click="setAll(true)" />
        <UButton label="全部关闭" size="xs" color="neutral" variant="outline" @click="setAll(false, 0)" />
      </template>
    </UAlert>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">选择模块</span>
          <USelect
            v-model="active" size="sm" class="w-64"
            :items="wb.modules.map((m: any, i: number) => ({ label: `${m.name} · ${m.table_name}`, value: i }))"
          />
          <span class="flex-1" />
          <UButton v-if="mod" label="保存" icon="i-lucide-check" size="sm" @click="save" />
        </div>
      </template>

      <div v-if="!mod" class="py-10 text-center text-sm text-muted">先到建模站创建模块</div>
      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center gap-4">
          <USwitch v-model="seed.enabled" label="生成种子数据" />
          <UFormField label="行数（上限 200）">
            <UInput v-model.number="seed.rows" type="number" min="0" max="200" size="sm" class="w-28" :disabled="!seed.enabled" />
          </UFormField>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th class="p-2 font-medium">字段</th><th class="p-2 font-medium">列名</th>
                <th class="p-2 font-medium">类型</th><th class="p-2 font-medium">生成规则</th>
                <th class="p-2 font-medium">自定义（留空用启发式）</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in mod.fields ?? []" :key="f.id" class="border-b border-muted">
                <td class="p-2">{{ f.name }}</td>
                <td class="p-2 font-mono">{{ f.col_key }}</td>
                <td class="p-2"><UBadge color="neutral" variant="subtle" size="sm">{{ f.type }}</UBadge></td>
                <td class="p-2 font-mono text-success">{{ hint(f) }}</td>
                <td class="p-2">
                  <UInput v-model="seed.rules[f.col_key]" size="xs" class="w-52" :placeholder="hint(f)" :disabled="!seed.enabled" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <p class="mb-1.5 text-xs font-semibold text-muted">可用规则函数</p>
          <div class="flex flex-wrap gap-x-5 gap-y-1.5">
            <span v-for="fn in FNS" :key="fn.n" class="flex items-center gap-1.5 text-xs text-muted">
              <code class="rounded bg-elevated px-1.5 py-0.5 font-mono">{{ fn.n }}</code>{{ fn.d }}
            </span>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
