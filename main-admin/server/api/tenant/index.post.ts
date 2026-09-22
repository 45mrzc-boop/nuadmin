import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { asText, AUTH_MODES, bodyOf, DEFAULT_LOGIN_TPL, LOGIN_TPLS, nextSlug, probePort, str, tenantView } from '../_lib'

async function resolveTenantPort(requestedPort?: any): Promise<number> {
  const mainPort = Number(process.env.PORT || 10000)
  if (requestedPort !== undefined && requestedPort !== null && requestedPort !== '') {
    const p = Number(requestedPort)
    if (!Number.isInteger(p) || p < 1024 || p > 65535) {
      throw createError({ statusCode: 400, message: `自定义端口 ${requestedPort} 无效，必须在 1024 ~ 65535 之间` })
    }
    if (p === mainPort) {
      throw createError({ statusCode: 400, message: `端口 ${p} 已被主控制台 (Main Admin) 占用，不可作为子后台端口` })
    }
    const existing = await one<any>(`SELECT id, name FROM tenant WHERE port=?`, [p])
    if (existing) {
      throw createError({ statusCode: 400, message: `端口 ${p} 已被租户「${existing.name}」占用` })
    }
    const isListening = await probePort(p, 300)
    if (isListening) {
      throw createError({ statusCode: 400, message: `端口 ${p} 当前已被宿主机其他运行中程序占用，请更换` })
    }
    return p
  }
  return await allocatePort()
}

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/tenant/:id', 'write')
  const body = await bodyOf(event)
  const name = asText(body.name, 128)
  if (!name) throw createError({ statusCode: 400, message: '子后台名称 name 不能为空' })

  const cfg = useRuntimeConfig().gen
  const slug = await nextSlug(toSlug(name))
  const dbName = `${cfg.dbPrefix}${slug}`
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(dbName)) {
    throw createError({ statusCode: 400, message: `数据库名「${dbName}」过长或含非法字符，请缩短子后台名称` })
  }
  const port = await resolveTenantPort(body.port)
  const loginTpl = LOGIN_TPLS.includes(str(body.login_tpl)) ? str(body.login_tpl) : DEFAULT_LOGIN_TPL
  const layout = ['side', 'top', 'mix'].includes(str(body.layout)) ? str(body.layout) : 'side'
  const appTitle = asText(body.app_title, 128) || name
  const rawAuthMode = str(body.auth_mode)
  const authMode = rawAuthMode && AUTH_MODES.includes(rawAuthMode as any) ? rawAuthMode : 'rbac'
  const rawAuthConfig = body.auth_config ?? body.authConfig
  const authConfig = (rawAuthConfig && typeof rawAuthConfig === 'object' && !Array.isArray(rawAuthConfig))
    ? JSON.stringify(rawAuthConfig)
    : null

  const r = await run(
    `INSERT INTO tenant (slug,name,description,db_name,port,jwt_secret,status,app_title,login_tpl,layout,auth_mode,auth_config,version,project_path)
     VALUES (?,?,?,?,?,?,'draft',?,?,?,?,?,0,?)`,
    [
      slug, name, asText(body.description, 512), dbName, port, randomBytes(32).toString('hex'),
      appTitle, loginTpl, layout, authMode, authConfig, join(cfg.tenantsRoot, slug)
    ])

  // one default branch so the 建模站 always has a group to drop models into
  await run(`INSERT INTO model_group (tenant_id,name,icon,sort) VALUES (?,?,'📁',1)`, [r.insertId, '默认分组'])

  const row = await one<Record<string, any>>(`SELECT * FROM tenant WHERE id=?`, [r.insertId])
  return ok(tenantView(row!))
})
