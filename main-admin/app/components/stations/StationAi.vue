<script setup lang="ts">
import { useWb } from '~/composables/useWorkbench'

const wb = useWb()
const { get, post } = useApi()
const { push } = useNotify()

const sessions = ref<any[]>([])
const current = ref<any>(null)
const msgs = ref<any[]>([])
const text = ref('')
const busy = ref(false)
const pending = ref<any>(null)

const QUICK = [
  '建一个商品模块，字段有商品名称、价格、库存、状态、上架时间',
  '给订单表加一个收货地址字段，必填，列表显示',
  '安装数据字典和操作日志能力',
  '生成这个子后台'
]

const INTENT_LABEL: Record<string, string> = {
  model: '建模', capability: '能力', design: '设计',
  logic: '逻辑', seed: '种子', gen: '生成', verify: '验证'
}

const parse = (c: unknown) => { try { return typeof c === 'string' ? JSON.parse(c) : c } catch { return null } }

/** UChatMessage requires { id, role, parts[] } — map our rows onto that shape. */
const chatMsgs = computed(() => msgs.value.map((m, i) => ({
  id: String(m.id ?? i),
  role: m.role === 'user' ? 'user' : 'assistant',
  parts: [{ type: 'text', text: String(m.content ?? '') }]
})))

async function loadSessions() { sessions.value = await get<any[]>('/ai/session') }

async function openSession(s: any) {
  current.value = s
  msgs.value = await get<any[]>('/ai/message', { sessionId: s.id })
  pending.value = null
}

async function newSession() {
  current.value = await post<any>('/ai/session', { tenantId: wb.tenantId, title: '新对话' })
  sessions.value.unshift(current.value)
  msgs.value = []
  pending.value = null
}

onMounted(async () => {
  await loadSessions()
  if (sessions.value.length) await openSession(sessions.value[0])
  else await newSession()
})

async function send(prompt?: string) {
  const content = (prompt ?? text.value).trim()
  if (!content || busy.value) return
  if (!current.value) await newSession()
  text.value = ''
  msgs.value.push({ id: `local-${Date.now()}`, role: 'user', content, created_at: new Date().toLocaleTimeString('zh-CN', { hour12: false }) })
  busy.value = true
  try {
    const r = await post<any>('/ai/chat', { sessionId: current.value.id, content })
    msgs.value.push(r.message)
    if (r.action && r.action.intent !== 'chat') pending.value = r.action
  } catch (e: any) {
    msgs.value.push({ role: 'assistant', content: '⚠️ ' + (e?.data?.statusMessage ?? '请求失败'), created_at: '' })
  } finally { busy.value = false }
}

async function apply() {
  const last = [...msgs.value].reverse().find((m: any) => m.role === 'assistant' && m.payload)
  if (!last) return
  const r = await post<any>('/ai/apply', { sessionId: current.value.id, messageId: last.id })
  push(r.detail?.join('；') || `已落地 ${r.applied} 项`, 'success')
  pending.value = null
  await wb.reload()
}

const payloadBrief = (p: any): string[] => {
  if (!p) return []
  const out: string[] = []
  for (const g of p.groups ?? []) {
    for (const m of g.modules ?? []) {
      out.push(`${g.name} / ${m.name}（${m.tableName ?? m.table_name}）· ${(m.fields ?? []).length} 字段`)
      for (const f of m.fields ?? []) out.push(`　├ ${f.name} · ${f.colKey ?? f.col_key} · ${f.type}`)
    }
  }
  for (const c of p.capabilities ?? p.caps ?? []) out.push(`安装能力：${c.capKey ?? c.cap_key}`)
  if (p.action === 'generate') out.push('执行一次完整生成')
  if (p.action === 'verify') out.push('执行冒烟验证')
  return out
}
</script>

<template>
  <div class="grid grid-cols-1 xl:grid-cols-[230px_1fr] gap-4 items-start">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">会话</span>
          <UButton icon="i-lucide-plus" size="xs" color="neutral" variant="ghost" @click="newSession" />
        </div>
      </template>
      <div class="max-h-[560px] space-y-1 overflow-y-auto">
        <div
          v-for="s in sessions" :key="s.id"
          class="cursor-pointer rounded-md px-2.5 py-2 text-sm"
          :class="current?.id === s.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-elevated text-default'"
          @click="openSession(s)">
          <p class="truncate">{{ s.title }}</p>
          <p class="text-[11px] text-muted">{{ String(s.created_at ?? '').slice(5, 16) }}</p>
        </div>
      </div>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <UIcon name="i-lucide-bot" class="size-4 text-primary" />
          <span class="text-sm font-semibold">AI 创作</span>
          <UBadge color="neutral" variant="subtle" size="sm">本地确定性规则引擎</UBadge>
          <span class="text-xs text-muted">自然语言驱动其它 8 个工位，落地前可预览 diff</span>
        </div>
      </template>

      <div class="max-h-[520px] overflow-y-auto pr-1">
        <UChatMessages :messages="chatMsgs" :status="busy ? 'pending' : 'ready'" should-auto-scroll>
          <template #content="{ message }">
            <p class="whitespace-pre-wrap text-sm leading-relaxed">{{ message.parts[0]?.text }}</p>
          </template>

          <template #bottom>
            <div
              v-for="(m, i) in msgs.filter((x: any) => x.role === 'assistant' && x.payload)"
              :key="`d-${i}`"
              class="mx-auto w-full max-w-3xl rounded-lg border border-default bg-default">
              <div class="flex items-center gap-2 border-b border-muted px-3 py-1.5">
                <UBadge color="neutral" variant="subtle" size="sm">
                  {{ INTENT_LABEL[parse(m.payload)?.intent ?? m.intent] ?? '结构化产出' }}
                </UBadge>
                <span class="text-xs text-muted">可预览的落地清单</span>
              </div>
              <div class="px-3 py-1.5">
                <p v-for="(l, j) in payloadBrief(parse(m.payload))" :key="j" class="font-mono text-[11px] leading-relaxed text-success">
                  + {{ l }}
                </p>
              </div>
            </div>
          </template>

          <template #empty>
            <div class="py-14 text-center text-sm text-muted">
              用一句话描述你要的表，比如「客户管理下面加一个联系人表」。
            </div>
          </template>
        </UChatMessages>
      </div>

      <div v-if="pending && pending.intent !== 'chat'" class="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
        <UIcon name="i-lucide-sparkle" class="size-4 text-primary" />
        <span class="text-sm">助手建议执行：<b>{{ INTENT_LABEL[pending.intent] ?? pending.intent }}</b></span>
        <span class="flex-1" />
        <UButton label="忽略" size="xs" color="neutral" variant="ghost" @click="pending = null" />
        <UButton label="应用到工位" icon="i-lucide-check" size="xs" @click="apply" />
      </div>

      <div class="mt-3 space-y-2 border-t border-muted pt-3">
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="q in QUICK" :key="q" :label="q" size="xs"
            color="neutral" variant="outline" @click="send(q)"
          />
        </div>
        <div class="flex items-end gap-2">
          <UTextarea
            v-model="text" :rows="2" auto-resize class="flex-1"
            placeholder="描述你要构建的东西，Ctrl+Enter 发送"
            @keydown.ctrl.enter.prevent="send()"
          />
          <UButton label="发送" icon="i-lucide-send" :loading="busy" :disabled="!text.trim()" @click="send()" />
        </div>
      </div>
    </UCard>
  </div>
</template>
