import type { TenantPlan } from './types'
import { allModules } from './types'
import { findPalette, skinCss } from '#shared/skins'
import { CAPABILITY_CATALOG } from '../capabilities'

export const capSpec = (key: string) =>
  CAPABILITY_CATALOG.find(c => c.cap_key === key)?.spec

const has = (p: TenantPlan, k: string) => !!p.caps[k]

/**
 * Project shell of a generated sub-admin: build config, entry, theme, client
 * composables. Everything under `app/` follows the Nuxt 4 source-dir convention;
 * `server/**` and the config files stay at the project root.
 */
export function appFiles(p: TenantPlan): Record<string, string> {
  const deps: Record<string, string> = {
    '@iconify-json/lucide': '^1.2.131',
    '@nuxt/ui': '^4.11.1',
    'casbin': '^5.51.1',
    'jsonwebtoken': '^9.0.2',
    'mysql2': '^3.11.5',
    'nuxt': '^4.5.2',
    'tailwindcss': '^4.3.3',
    'vue': '^3.5.13',
    'vue-router': '^4.5.0',
    'zod': '^4.6.2'
  }
  if (has(p, 'i18n')) deps['vue-i18n'] = '^11.1.2'

  return {
    'package.json': JSON.stringify({
      name: `nuadmin-${p.slug}`,
      version: `1.${p.version}.0`,
      private: true,
      type: 'module',
      description: `${p.title} — 由 GenPlus AI 工作台生成`,
      scripts: {
        dev: `nuxt dev --port ${p.port}`,
        build: 'nuxt build',
        start: 'node .output/server/index.mjs'
      },
      dependencies: deps,
      devDependencies: {
        '@types/jsonwebtoken': '^9.0.7',
        '@types/node': '^22.10.1',
        typescript: '^5.7.2'
      }
    }, null, 2) + '\n',

    'nuxt.config.ts': `import { defineNuxtConfig } from 'nuxt/config'

const env = (k: string, d = '') => process.env[k] ?? d

export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  ssr: false,
  // 发布出去的后台不该带开发工具：右下角那个角标会被用户当成页面的一部分。
  devtools: { enabled: false },
  telemetry: false,
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // APP_BASE lets the main admin embed this app behind /preview/<slug>/;
  // standalone "npm run dev" leaves it unset and serves from root.
  app: {
    baseURL: process.env.APP_BASE || '/',
    head: { title: ${JSON.stringify(p.title)}, link: [{ rel: 'icon', href: 'data:,' }] }
  },
  runtimeConfig: {
    db: {
      host: env('DB_HOST', 'mysql-db'),
      port: Number(env('DB_PORT', '3306')),
      user: env('DB_USER', 'root'),
      password: env('DB_PASS', ''),
      name: env('DB_NAME', ${JSON.stringify(p.dbName)})
    },
    jwt: { secret: env('JWT_SECRET', 'change-me'), expiresIn: '12h' }
  },
  devServer: { port: ${p.port}, host: '0.0.0.0' },
  typescript: { strict: true }
})
`,

    'tsconfig.json': `{
  "extends": "./.nuxt/tsconfig.json"
}
`,

    '.env': `# ${p.title} — 独立数据库、独立密钥，与主后台无任何运行时耦合
DB_HOST=mysql-db
DB_PORT=3306
DB_USER=root
DB_PASS=${process.env.DB_PASS ?? 'joejoe1980'}
DB_NAME=${p.dbName}
JWT_SECRET=${p.jwtSecret}
PORT=${p.port}
HOST=0.0.0.0
`,

    '.gitignore': `node_modules
.nuxt
.output
dist
uploads
*.log
`,

    'app/app.vue': `<template>
  <UApp :toaster="{ position: 'top-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
`,

    'app/assets/css/main.css': mainCss(p),

    // 登录态 cookie 名必须按租户隔离：预览是同源的（都挂在主后台 6005 下），
    // 以前所有子后台和主后台共用 'nuadmin_token'，导致子后台把主后台的 cookie
    // 当成"本系统已登录"放行，再拿主后台 JWT 请求自己的接口吃 401。
    'app/utils/auth-token.ts': `/** 本子后台的登录态 cookie 名（按 slug 隔离，避免同源撞名）。 */\nexport const AUTH_COOKIE = 'auth_${p.slug}'\n`,

    'app/middleware/auth.ts': `import { AUTH_COOKIE } from '~/utils/auth-token'

export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/login' || to.path === '/' || to.path.startsWith('/p/') || to.path.startsWith('/portal') || to.path.startsWith('/cms')) return
  if (!useCookie(AUTH_COOKIE).value) return navigateTo('/login')
})
`,

    'app/composables/useApi.ts': `import { AUTH_COOKIE } from '~/utils/auth-token'

/** $fetch wrapper: injects the JWT, unwraps {code,message,data}, routes 401 to login. */
export function useApi() {
  const token = useCookie(AUTH_COOKIE)
  const base = (useRuntimeConfig().app.baseURL || '/').replace(/\\/$/, '') + '/api'

  const raw = $fetch.create({
    baseURL: base,
    onRequest({ options }) {
      options.headers = { ...(options.headers as any), Authorization: 'Bearer ' + (token.value || '') }
    },
    onResponse({ response }) {
      const body = response._data as any
      if (body && typeof body === 'object' && 'code' in body) response._data = body.data
    },
    onResponseError({ response }) {
      if (response.status === 401) {
        token.value = null
        navigateTo('login')
        return
      }
      useNotify().push((response._data as any)?.statusMessage || (response._data as any)?.message || '请求失败', 'error')
    }
  })

  const qs = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null))

  return {
    token,
    get: <T = any,>(p: string, query?: any) => raw<T>(p, { method: 'GET', query: query ? qs(query) : undefined }),
    post: <T = any,>(p: string, body?: any) => raw<T>(p, { method: 'POST', body }),
    patch: <T = any,>(p: string, body?: any) => raw<T>(p, { method: 'PATCH', body }),
    del: <T = any,>(p: string) => raw<T>(p, { method: 'DELETE' })
  }
}
`,

    // Nuxt UI owns useToast; this adapter keeps generated pages on a one-arg call.
    'app/composables/useNotify.ts': `import type { ToastColor } from '@nuxt/ui'

const STYLE: Record<string, { color: ToastColor, icon: string }> = {
  info: { color: 'primary', icon: 'i-lucide-info' },
  success: { color: 'success', icon: 'i-lucide-circle-check' },
  error: { color: 'error', icon: 'i-lucide-circle-alert' }
}

export function useNotify() {
  const toast = useToast()
  return {
    push(text: string, type: keyof typeof STYLE = 'info') {
      toast.add({ title: text, ...STYLE[type] })
    }
  }
}
`,

    'app/composables/useDict.ts': `type DictItem = { label: string, value: string, color?: string }

const cache = useState<Record<string, DictItem[]>>('dict', () => ({}))

export function useDict() {
  const { get } = useApi()

  async function load() {
    if (Object.keys(cache.value).length) return cache.value
    try { cache.value = await get<Record<string, DictItem[]>>('/dict/list') } catch { cache.value = {} }
    return cache.value
  }
  /** UNavigationMenu / USelectMenu expect { label, value } arrays. */
  function options(key: string): DictItem[] {
    return cache.value[key] ?? []
  }
  function label(key: string, value: unknown) {
    return options(key).find(o => String(o.value) === String(value))?.label ?? String(value ?? '')
  }
  /** Maps a dict colour token onto Nuxt UI semantic badges. */
  function badge(key: string, value: unknown) {
    const c = options(key).find(o => String(o.value) === String(value))?.color ?? ''
    return c === 'ok' ? 'success' : c === 'err' ? 'error' : c === 'warn' ? 'warning' : 'neutral'
  }
  return { load, options, label, badge, cache }
}
`,

    ...(has(p, 'i18n') ? i18nFiles(p) : {}),

    'README.md': readme(p)
  }
}

/** vue-i18n wired by hand: locales are generated from the module + field labels. */
function i18nFiles(p: TenantPlan) {
  const zh: Record<string, string> = { 'menu.search': '查询', 'menu.reset': '重置', 'menu.create': '新增', 'menu.action': '操作' }
  const en: Record<string, string> = { 'menu.search': 'Search', 'menu.reset': 'Reset', 'menu.create': 'Create', 'menu.action': 'Actions' }
  for (const m of allModules(p)) {
    zh[`menu.${m.key}`] = m.name
    en[`menu.${m.key}`] = m.key
    for (const f of m.fields) {
      zh[`field.${m.key}.${f.key}`] = f.name
      en[`field.${m.key}.${f.key}`] = f.key
    }
  }
  const locale = JSON.stringify(String(p.caps.i18n?.config?.default ?? 'zh'))
  return {
    'app/i18n/locales/zh.ts': `export default ${JSON.stringify(zh, null, 2)}\n`,
    'app/i18n/locales/en.ts': `export default ${JSON.stringify(en, null, 2)}\n`,
    'app/plugins/i18n.ts': `import { createI18n } from 'vue-i18n'
import zh from '../i18n/locales/zh'
import en from '../i18n/locales/en'

export default defineNuxtPlugin((nuxt) => {
  const i18n = createI18n({ legacy: false, globalInjection: true, locale: ${locale}, fallbackLocale: 'zh', messages: { zh, en } })
  nuxt.vueApp.use(i18n)
})
`
  }
}

/** Blend two hex colors; t=0 returns a, t=1 returns b. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const [r, g, bl] = p(a).map((v, i) => Math.round(v + (p(b)[i] - v) * t))
  return '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('')
}

/**
 * Real tint/shade ramp. Appending an alpha suffix to the brand hex is NOT a
 * tint — it yields translucent steps that read wrong on any background.
 */
function ramp(base: string): string[] {
  const white = '#ffffff', black = '#000000'
  return [
    mix(base, white, 0.92), mix(base, white, 0.84), mix(base, white, 0.66), mix(base, white, 0.45),
    mix(base, white, 0.20), base, mix(base, black, 0.14), mix(base, black, 0.28),
    mix(base, black, 0.42), mix(base, black, 0.56), mix(base, black, 0.70)
  ]
}

/** Brand tokens become real Tailwind v4 theme variables, not runtime CSS vars. */
function mainCss(p: TenantPlan) {
  const t = p.theme
  const radius = Math.max(0, Math.min(24, Number(t.radius ?? 12)))
  // 配色优先于手填主色：设计站选皮肤+配色后，accent 就是主色，
  // 保证「画廊里看到的」和「生成出来的」是同一个值。
  const pal = findPalette(t.skin, t.palette)
  const raw = pal?.accent ?? t.primary ?? ''
  const base = /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : '#0a84ff'
  const shades = ramp(base)
  const names = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
  return `@import "tailwindcss";
@import "@nuxt/ui";

/* Generated by GenPlus — 设计站主题。改主题请回主后台重新生成。 */
@theme {
${shades.map((s, i) => `  --color-primary-${names[i]}: ${s};`).join('\n')}

  --radius-xs: ${Math.max(2, radius - 6)}px;
  --radius-sm: ${Math.max(3, radius - 4)}px;
  --radius-md: ${Math.max(4, radius - 2)}px;
  --radius-lg: ${radius}px;
  --radius-xl: ${radius + 4}px;

  --font-sans: -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Helvetica Neue', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}

/* Nuxt UI resolves its own corner radii through --ui-radius, not --radius-*. */
:root {
  --ui-radius: ${radius}px;
  --ui-primary: var(--color-primary-500, #4f7dff);
  --ui-color-primary: var(--color-primary-500, #4f7dff);
}

${skinCss(t.skin, p)}
${pal?.fg ? `:root { --ui-text-inverted: ${pal.fg}; }` : ''}

${t.density === 'compact' ? '/* density=compact */\ntd,th{padding-block:0.35rem}' : ''}
${t.mode === 'dark' ? ':root{color-scheme:dark}' : ''}

/* 打印视图：只保留 [data-print-area] 内容（单据打印能力依赖） */
@media print {
  [data-print-hide]{display:none !important}
  [data-print-area]{position:static !important;overflow:visible !important;max-height:none !important}
}
`
}

function readme(p: TenantPlan) {
  const mods = allModules(p)
  return `# ${p.title}

由 **GenPlus AI 工作台**（主后台）生成的独立子后台。

- 端口 \`${p.port}\` · 数据库 \`${p.dbName}\` · 版本 \`1.${p.version}.0\` · ${mods.length} 个业务模块
- 技术栈：Nuxt 4 + @nuxt/ui 4 + Tailwind 4 + MySQL + Casbin(RBAC) + JWT
- 与主后台完全脱离：删掉主后台本工程依然可独立构建、独立运行

## 启动

\`\`\`bash
npm install
npm run dev      # http://localhost:${p.port}
\`\`\`

首次启动自动建库建表并写入种子数据，默认账号 \`admin / admin123\`。

## 目录

\`\`\`
app/
  assets/css/main.css     Tailwind + @nuxt/ui + 品牌主题变量
  components/             CrudPage · FieldInput · AppSidebar · AppTopbar
  composables/            useApi · useNotify · useDict
  layouts/                default（UDashboard 骨架）· blank（登录）
  pages/                  login · admin/**
server/
  api/                    login · profile · menu · ${mods.slice(0, 3).map(m => m.key).join(' · ') || '(业务模块)'}
  logic/                  ${mods.slice(0, 3).map(m => m.key + '.ts').join(' ') || '(业务钩子)'} ← 手写区，重新生成不覆盖
  utils/                  db · auth(JWT+Casbin) · crud · validate · tables · schema · faker
  plugins/init.ts         建库 → 建表 → 写菜单/策略/字典 → 幂等种子
\`\`\`

## 已安装能力

${Object.keys(p.caps).length ? Object.entries(p.caps).map(([k, v]) => `- \`${k}\` v${v.version}`).join('\n') : '- 无（仅业务 CRUD）'}

## 被主后台预览

设置环境变量 \`APP_BASE=/preview/${p.slug}/\` 后启动，主后台预览站会通过同源反代内嵌本应用。
直接 \`npm run dev\` 不设该变量时从根路径服务。
`
}
