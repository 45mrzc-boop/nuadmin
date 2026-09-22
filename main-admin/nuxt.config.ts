import { fileURLToPath } from 'node:url'

const env = (k: string, d = '') => process.env[k] ?? d
const mainPort = Number(env('PORT', '10000'))

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  // Filename-only registration: 工位组件按 Station<Key> 动态解析，不带目录前缀。
  components: [{ path: '~/components', pathPrefix: false }],
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'GenPlus · AI 工作台',
      link: [{ rel: 'icon', href: 'data:,' }]
    }
  },
  nitro: {
    experimental: { websocket: false }
  },
  runtimeConfig: {
    db: {
      host: env('DB_HOST', 'mysql-db'),
      port: Number(env('DB_PORT', '3306')),
      user: env('DB_USER', 'root'),
      password: env('DB_PASS', ''),
      name: env('DB_NAME', 'nuadmin')
    },
    jwt: {
      secret: env('JWT_SECRET', 'dev-insecure-secret'),
      expiresIn: env('JWT_EXPIRES_IN', '12h')
    },
    gen: {
      tenantsRoot: env('TENANTS_ROOT', fileURLToPath(new URL('../tenants', import.meta.url))),
      dbPrefix: env('DB_TENANT_PREFIX', 'nuadmin_t_'),
      portFrom: Number(env('TENANT_PORT_FROM', String(mainPort + 1))),
      portTo: Number(env('TENANT_PORT_TO', String(mainPort + 999)))
    },
    public: {
      appName: 'GenPlus'
    }
  },
  typescript: { strict: true },
  devServer: { port: mainPort, host: env('HOST', '0.0.0.0') }
})
