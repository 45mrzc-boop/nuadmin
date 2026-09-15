import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { asText, bodyOf, DEFAULT_LOGIN_TPL, LOGIN_TPLS, nextSlug, str, tenantView } from '../_lib'

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
  const port = await allocatePort()
  const loginTpl = LOGIN_TPLS.includes(str(body.login_tpl)) ? str(body.login_tpl) : DEFAULT_LOGIN_TPL
  const layout = ['side', 'top', 'mix'].includes(str(body.layout)) ? str(body.layout) : 'side'

  const r = await run(
    `INSERT INTO tenant (slug,name,description,db_name,port,jwt_secret,status,app_title,login_tpl,layout,version,project_path)
     VALUES (?,?,?,?,?,?,'draft',?,?,?,0,?)`,
    [
      slug, name, asText(body.description, 512), dbName, port, randomBytes(32).toString('hex'),
      name, loginTpl, layout, join(cfg.tenantsRoot, slug)
    ])

  // one default branch so the 建模站 always has a group to drop models into
  await run(`INSERT INTO model_group (tenant_id,name,icon,sort) VALUES (?,?,'📁',1)`, [r.insertId, '默认分组'])

  const row = await one<Record<string, any>>(`SELECT * FROM tenant WHERE id=?`, [r.insertId])
  return ok(tenantView(row!))
})
