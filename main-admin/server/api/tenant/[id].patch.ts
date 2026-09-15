import { asText, AUTH_MODES, bodyOf, LAYOUTS, loadTenant, LOGIN_TPLS, numId, numOf, str, tenantView } from '../_lib'
import { findPalette, isSkin, palettesOf, SKINS } from '#shared/skins'

const TEXT_COLS: Record<string, [string, number]> = {
  name: ['name', 128],
  app_title: ['app_title', 128],
  description: ['description', 512]
}

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/tenant/:id', 'write')
  const id = numId(event)
  const t = await loadTenant(id)
  const body = await bodyOf(event)

  const sets: string[] = []
  const args: unknown[] = []

  for (const [key, [col, max]] of Object.entries(TEXT_COLS)) {
    if (body[key] === undefined) continue
    const v = asText(body[key], max)
    if (!v && col !== 'description') throw createError({ statusCode: 400, message: `${key} 不能为空字符串` })
    sets.push(`${ident(col)}=?`)
    args.push(v)
  }

  if (body.login_tpl !== undefined) {
    const v = str(body.login_tpl)
    if (!LOGIN_TPLS.includes(v)) throw createError({ statusCode: 400, message: `登录页模板 login_tpl 只能是 ${LOGIN_TPLS.join(' / ')}，当前 ${v || '(空)'}` })
    sets.push('login_tpl=?')
    args.push(v)
  }
  if (body.layout !== undefined) {
    const v = str(body.layout)
    if (!LAYOUTS.includes(v)) throw createError({ statusCode: 400, message: `布局 layout 只能是 ${LAYOUTS.join(' / ')}，当前 ${v || '(空)'}` })
    sets.push('layout=?')
    args.push(v)
  }
  if (body.auth_mode !== undefined) {
    const v = str(body.auth_mode)
    if (v && !AUTH_MODES.includes(v as any)) {
      throw createError({ statusCode: 400, message: `门禁模式 auth_mode 只能是 ${AUTH_MODES.join(' / ')}，当前 ${v || '(空)'}` })
    }
    sets.push('auth_mode=?')
    args.push(v)
  }
  if (body.auth_config !== undefined || body.authConfig !== undefined) {
    const v = body.auth_config ?? body.authConfig
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      throw createError({ statusCode: 400, message: '门禁明细 auth_config 必须是对象' })
    }
    sets.push('auth_config=?')
    args.push(JSON.stringify(v))
  }
  const theme = body.theme ?? body.theme_json
  if (theme !== undefined) {
    if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
      throw createError({ statusCode: 400, message: '主题 theme 必须是对象，例如 {primary:"#007aff",mode:"light"}' })
    }
    const merged = { ...j<Record<string, unknown>>(t.theme_json, {}), ...theme as Record<string, unknown> }
    if (merged.primary !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(str(merged.primary))) {
      throw createError({ statusCode: 400, message: `主题色 primary 必须是十六进制颜色，当前 ${str(merged.primary)}` })
    }
    if (merged.radius !== undefined) merged.radius = Math.min(32, Math.max(0, numOf(merged.radius, 12)))
    if (merged.mode !== undefined && !['light', 'dark', 'auto'].includes(str(merged.mode))) {
      throw createError({ statusCode: 400, message: `主题模式 mode 只能是 light / dark / auto，当前 ${str(merged.mode)}` })
    }
    if (merged.density !== undefined && !['normal', 'compact'].includes(str(merged.density))) {
      throw createError({ statusCode: 400, message: `密度 density 只能是 normal / compact，当前 ${str(merged.density)}` })
    }
    if (merged.collapseMode !== undefined && !['icon', 'hidden'].includes(str(merged.collapseMode))) {
      throw createError({ statusCode: 400, message: `折叠模式 collapseMode 只能是 icon / hidden，当前 ${str(merged.collapseMode)}` })
    }
    // 皮肤与配色必须成对合法：配色是按皮肤分组的，换个皮肤旧配色 id 可能就不存在了。
    if (merged.skin !== undefined && !isSkin(merged.skin)) {
      throw createError({ statusCode: 400, message: `皮肤 skin 不存在，可选：${SKINS.map(s => s.id).join(' / ')}` })
    }
    // 只改配色不改皮肤时，比对基准要用租户当前皮肤，不能退回默认皮肤。
    const skinNow = str(merged.skin ?? j<Record<string, unknown>>(t.theme_json, {}).skin ?? '')
    if (merged.palette !== undefined && !findPalette(skinNow, merged.palette)) {
      throw createError({
        statusCode: 400,
        message: `配色「${str(merged.palette)}」不属于皮肤「${skinNow || '(未选)'}」，可选：${palettesOf(skinNow).map(p => p.id).join(' / ')}`
      })
    }
    sets.push('theme_json=?')
    args.push(JSON.stringify(merged))
  }
  if (body.status !== undefined) {
    const v = str(body.status)
    if (!['draft', 'generated', 'running', 'stopped', 'failed'].includes(v)) {
      throw createError({ statusCode: 400, message: `状态 status 只能是 draft / generated / running / stopped / failed，当前 ${v}` })
    }
    sets.push('status=?')
    args.push(v)
  }
  if (!sets.length) throw createError({ statusCode: 400, message: '没有需要更新的内容，可更新 name / app_title / theme / login_tpl / layout / description / status' })

  await run(`UPDATE tenant SET ${sets.join(', ')} WHERE id=?`, [...args, id])
  const row = await one<Record<string, any>>(`SELECT * FROM tenant WHERE id=?`, [id])
  return ok(tenantView(row!))
})
