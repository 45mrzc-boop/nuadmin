<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent, AuthFormField } from '@nuxt/ui'

definePageMeta({ layout: false, middleware: false })

const { post, token } = useApi()
const { push } = useNotify()
const router = useRouter()

const fields = computed<AuthFormField[]>(() => [
  { name: 'username', label: '账号', type: 'text', placeholder: 'admin', required: true },
  { name: 'password', label: '密码', type: 'password', placeholder: '••••••••', required: true },
  { name: 'remember', label: '记住我', type: 'checkbox' }
])

const schema = z.object({
  username: z.string('请输入账号').min(1, '请输入账号'),
  password: z.string('请输入密码').min(1, '请输入密码'),
  remember: z.boolean().optional()
})
type Schema = z.output<typeof schema>

const busy = ref(false)
const shake = ref(false)

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  if (busy.value) return
  busy.value = true
  try {
    const r = await post<{ token: string, user: any }>('/login', {
      username: payload.data.username,
      password: payload.data.password
    })
    token.value = r.token
    push(`欢迎回来，${r.user.nickname || r.user.username}`, 'success')
    await router.push('/')
  } catch {
    shake.value = true
    setTimeout(() => { shake.value = false }, 500)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh">
    <!-- 品牌侧：原型稿的 split 模板 -->
    <div class="hidden lg:flex flex-1.2 items-center justify-center bg-linear-to-br from-primary-600 to-violet-600 text-white p-10">
      <div class="max-w-md">
        <div class="flex items-center gap-2.5 mb-4">
          <span class="size-9 rounded-lg bg-white/20 flex items-center justify-center">
            <UIcon name="i-lucide-zap" class="size-5" />
          </span>
          <span class="text-3xl font-extrabold tracking-tight">GenPlus</span>
        </div>
        <p class="text-white/90 leading-relaxed">
          用自然语言建模，勾选能力，一键生成可独立部署的中后台工程。
          主后台只负责工作台与登录，产物与它完全脱离。
        </p>
        <div class="flex gap-8 mt-9">
          <div><div class="text-3xl font-extrabold">9</div><div class="text-xs text-white/75">个工位</div></div>
          <div><div class="text-3xl font-extrabold">14</div><div class="text-xs text-white/75">项可安装能力</div></div>
          <div><div class="text-3xl font-extrabold">0</div><div class="text-xs text-white/75">行手写样板</div></div>
        </div>
      </div>
    </div>

    <!-- 表单侧 -->
    <div class="flex-1 flex items-center justify-center p-6 bg-default">
      <div :class="shake ? 'animate-shake' : ''" class="w-full max-w-sm">
        <UAuthForm
          :schema="schema"
          :fields="fields"
          title="AI 工作台登录"
          description="GenPlus 控制面"
          icon="i-lucide-zap"
          :loading="busy"
          @submit="onSubmit"
        >
          <template #description>
            <p class="text-xs text-muted">内置账号 <code>admin</code> / <code>admin123</code> · 权限由 Casbin RBAC 判定</p>
          </template>
        </UAuthForm>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes shk{10%,90%{transform:translateX(-3px)}20%,80%{transform:translateX(5px)}30%,50%,70%{transform:translateX(-8px)}40%,60%{transform:translateX(8px)}}
.animate-shake{animation:shk .45s}
</style>
