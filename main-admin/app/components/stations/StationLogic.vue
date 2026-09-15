<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'

const wb = useWb()
const { patch } = useApi()
const { push } = useNotify()

const HOOKS = [
  { name: 'beforeCreate', desc: '写入前改写 data，抛错即拒绝创建' },
  { name: 'afterCreate', desc: '拿到新行，常用于推消息/联动计数' },
  { name: 'beforeUpdate', desc: '可比对 before 与 data 做差分校验' },
  { name: 'afterUpdate', desc: '变更后通知' },
  { name: 'beforeDelete', desc: '做关联引用检查，阻止误删' },
  { name: 'afterDelete', desc: '清理附属数据' },
  { name: 'beforeList', desc: '注入额外过滤条件（数据权限）' },
  { name: 'afterList', desc: '脱敏、补字段、改写返回'
  }
]

const SAMPLE: Record<string, string> = {
  beforeCreate: `// ctx = { event, data, user }\nif (data.status === undefined) data.status = 1`,
  beforeList: `// 数据权限：非 admin 只看自己创建的\nif (ctx.user.role !== 'admin') ctx.query.created_by = ctx.user.username`,
  afterList: `// 敏感字段脱敏\nfor (const row of ctx.data.list) row.phone = row.phone?.replace(/(\\d{3})\\d{4}(\\d{4})/, '$1****$2')`
}

const active = useState<number>('logic.activeModule', () => 0)
const mod = computed(() => wb.modules[active.value] ?? null)
const logic = reactive<any>({ hooks: [], endpoints: [], validators: [] })

watch(mod, (m: any) => {
  if (!m) return
  const raw = typeof m.logic_json === 'string' ? JSON.parse(m.logic_json) : (m.logic_json ?? {})
  const saved = Object.fromEntries((raw.hooks ?? []).map((h: any) => [h.name, h]))
  logic.hooks = HOOKS.map(h => ({ ...h, enabled: saved[h.name]?.enabled ?? false, code: saved[h.name]?.code ?? '' }))
  logic.endpoints = raw.endpoints ?? []
  logic.validators = raw.validators ?? []
}, { immediate: true, deep: true })

const METHOD_OPTS = ['GET', 'POST', 'PATCH', 'DELETE']
const PERM_OPTS = ['list', 'read', 'create', 'update', 'delete', 'export']

const ep = reactive({ open: false, method: 'GET', path: '', comment: '', perm: 'list', code: '' })
function addEndpoint() {
  if (!ep.path.trim()) return push('请填写端点路径', 'error')
  logic.endpoints.push({ method: ep.method, path: ep.path, comment: ep.comment, perm: ep.perm, code: ep.code })
  Object.assign(ep, { open: false, path: '', comment: '', code: '' })
}

async function save() {
  if (!mod.value) return
  await patch(`/logic/${mod.value.id}`, { logic: JSON.parse(JSON.stringify(logic)) })
  push(`「${mod.value.name}」逻辑已保存，生成时写入 server/logic/${mod.value.key}.ts`, 'success')
  await wb.reload()
}

const onCount = computed(() => logic.hooks.filter((h: any) => h.enabled).length)
</script>

<template>
  <div class="space-y-4">
    <UAlert
      color="neutral" variant="soft" icon="i-lucide-plug"
      title="生成的 CRUD 与手写业务代码物理分离"
      :description="`钩子落在 server/logic/<res>.ts，重新生成只覆盖模板区。已启用 ${onCount} / ${HOOKS.length} 个钩子。`"
    >
      <template #actions>
        <UButton label="保存逻辑" icon="i-lucide-check" size="sm" :disabled="!mod" @click="save" />
      </template>
    </UAlert>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-sm font-semibold">选择模块</span>
          <USelect
            v-model="active" size="sm" class="w-64"
            :items="wb.modules.map((m: any) => ({ label: `${m.name} · ${m.table_name}`, value: m.id }))"
            @update:model-value="active = wb.modules.findIndex((m: any) => m.id === $event)"
          />
        </div>
      </template>

      <div v-if="!mod" class="py-10 text-center text-sm text-muted">先到建模站创建模块</div>
      <div v-else class="space-y-4">
        <div class="space-y-2">
          <div
            v-for="h in logic.hooks" :key="h.name"
            class="overflow-hidden rounded-lg border border-default"
            :class="h.enabled ? 'ring-1 ring-success/40' : ''">
            <div class="flex flex-wrap items-center gap-2.5 bg-elevated/60 px-3 py-2">
              <USwitch v-model="h.enabled" size="sm" />
              <code class="font-mono text-xs font-semibold text-primary">{{ h.name }}</code>
              <span class="text-xs text-muted">{{ h.desc }}</span>
              <UBadge v-if="SAMPLE[h.name]" color="neutral" variant="outline" size="sm">有示例</UBadge>
              <span class="flex-1" />
              <UButton
                v-if="h.enabled && SAMPLE[h.name]" label="填入示例" icon="i-lucide-sparkle"
                size="xs" color="neutral" variant="ghost" @click="h.code = SAMPLE[h.name]"
              />
            </div>
            <UTextarea
              v-if="h.enabled" v-model="h.code" :rows="5" auto-resize
              class="w-full rounded-none border-0 border-t border-muted font-mono text-xs"
              :placeholder="`// ${h.name} 留空则不生成`"
            />
          </div>
        </div>

        <div>
          <div class="mb-2 flex items-center gap-2">
            <span class="text-sm font-semibold">自定义端点</span>
            <UButton label="新增" icon="i-lucide-plus" size="xs" variant="outline" @click="ep.open = true" />
          </div>
          <table v-if="logic.endpoints.length" class="w-full text-xs">
            <thead>
              <tr class="border-b border-default text-left text-muted">
                <th class="p-2 font-medium">方法</th><th class="p-2 font-medium">路径</th>
                <th class="p-2 font-medium">权限</th><th class="p-2 font-medium">说明</th><th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="(e, i) in logic.endpoints" :key="i" class="border-b border-muted">
                <td class="p-2"><UBadge color="primary" variant="subtle" size="sm">{{ e.method }}</UBadge></td>
                <td class="p-2 font-mono">/api/{{ mod.key }}/{{ e.path }}</td>
                <td class="p-2 text-muted">{{ e.perm }}</td>
                <td class="p-2 text-muted">{{ e.comment }}</td>
                <td class="p-2"><UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="ghost" @click="logic.endpoints.splice(i, 1)" /></td>
              </tr>
            </tbody>
          </table>
          <p v-else class="text-xs text-muted">暂无自定义端点。</p>
        </div>

        <div>
          <div class="mb-2 flex items-center gap-2">
            <span class="text-sm font-semibold">字段校验</span>
            <UButton label="新增" icon="i-lucide-plus" size="xs" variant="outline" @click="logic.validators.push({ field: '', expr: '', message: '' })" />
          </div>
          <div v-for="(v, i) in logic.validators" :key="i" class="mb-2 flex flex-wrap items-center gap-2">
            <USelect v-model="v.field" size="sm" class="w-40" placeholder="选择字段"
              :items="(mod.fields ?? []).map((f: any) => ({ label: f.name, value: f.col_key }))" />
            <UInput v-model="v.expr" size="sm" class="min-w-[16rem] flex-1" placeholder="表达式，如 value > 0 && value < 100" />
            <UInput v-model="v.message" size="sm" class="w-44" placeholder="错误提示" />
            <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" @click="logic.validators.splice(i, 1)" />
          </div>
        </div>
      </div>
    </UCard>

    <UModal v-model:open="ep.open" title="新增端点">
      <template #body>
        <UForm :state="ep" class="space-y-4">
          <div class="flex gap-2">
            <USelect v-model="ep.method" :items="METHOD_OPTS" class="w-28" />
            <UInput v-model="ep.path" class="flex-1" placeholder="summary（不含模块前缀）" />
          </div>
          <UFormField label="权限动作"><USelect v-model="ep.perm" :items="PERM_OPTS" class="w-full" /></UFormField>
          <UFormField label="说明"><UInput v-model="ep.comment" class="w-full" /></UFormField>
          <UFormField label="实现代码">
            <UTextarea v-model="ep.code" :rows="6" class="w-full font-mono text-xs" placeholder="export default defineAuthed(async (event) => { ... })" />
          </UFormField>
        </UForm>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2 w-full">
          <UButton label="取消" color="neutral" variant="ghost" @click="ep.open = false" />
          <UButton label="添加" @click="addEndpoint" />
        </div>
      </template>
    </UModal>
  </div>
</template>
