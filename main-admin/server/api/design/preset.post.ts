import { inferStylePreset, STYLE_PRESETS, type StylePreset } from '#shared/style-presets'
import { findPalette, isSkin, palettesOf } from '#shared/skins'
import { bodyOf, loadTenant, numId, tenantView } from '../_lib'

function parseJson<T>(val: unknown, fallback: T): T {
  if (typeof val !== 'string') return (val as T) || fallback
  try { return JSON.parse(val) as T } catch { return fallback }
}

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/design/:id', 'write')
  const body = await bodyOf(event)

  const tenantId = Number(body.tenantId || body.id)
  if (!tenantId) throw createError({ statusCode: 400, message: '缺少租户 tenantId' })
  const tenant = await loadTenant(tenantId)

  // 1. 确定基准预设（通过 key 命中或行业关键词推断）
  let preset: StylePreset
  if (body.preset) {
    const found = STYLE_PRESETS.find(p => p.key === String(body.preset))
    preset = found || inferStylePreset(body.preset)
  } else if (body.industry) {
    preset = inferStylePreset(body.industry)
  } else {
    preset = inferStylePreset(tenant.name + ' ' + tenant.app_title)
  }

  // 2. 混合用户自定义覆盖项
  const custom = body.custom || {}
  const skin = isSkin(custom.skin) ? custom.skin : preset.skin
  const pList = palettesOf(skin)
  const paletteId = custom.palette || (pList.some(p => p.id === preset.palette) ? preset.palette : (pList[0]?.id || ''))
  const paletteObj = findPalette(skin, paletteId)
  const primary = custom.primary || paletteObj?.accent || preset.primary
  const radius = custom.radius !== undefined ? Math.min(999, Math.max(0, Number(custom.radius))) : preset.radius
  const collapseMode = (custom.collapseMode === 'hidden' || custom.collapseMode === 'icon') ? custom.collapseMode : preset.collapseMode
  const loginTpl = ['split', 'card', 'simple'].includes(custom.loginTpl) ? custom.loginTpl : preset.loginTpl
  const layout = ['side', 'top'].includes(custom.layout) ? custom.layout : preset.layout
  const density = ['normal', 'compact'].includes(custom.density) ? custom.density : preset.density

  const themeJson = {
    ...parseJson<Record<string, unknown>>(tenant.theme_json, {}),
    skin,
    palette: paletteId,
    primary,
    radius,
    collapseMode,
    density,
    presetKey: preset.key
  }

  // 3. 写入租户全局设计
  await run(
    `UPDATE tenant SET theme_json=?, login_tpl=?, layout=? WHERE id=?`,
    [JSON.stringify(themeJson), loginTpl, layout, tenantId]
  )

  // 4. 若需要，联动更新模块的设计矩阵（如斑马纹与表单布局）
  if (body.applyModules !== false) {
    const modules = await q<Record<string, any>>(`SELECT id, design_json FROM module WHERE tenant_id=?`, [tenantId])
    for (const m of modules) {
      const d = parseJson<Record<string, any>>(m.design_json, {})
      d.list = d.list || {}
      d.form = d.form || {}
      if (custom.striped !== undefined || preset.striped !== undefined) {
        d.list.striped = custom.striped !== undefined ? Boolean(custom.striped) : preset.striped
      }
      if (custom.formLayout !== undefined || preset.formLayout !== undefined) {
        d.form.layout = custom.formLayout || preset.formLayout
      }
      await run(`UPDATE module SET design_json=? WHERE id=?`, [JSON.stringify(d), m.id])
    }
  }

  const updatedTenant = await loadTenant(tenantId)
  return ok({
    tenant: tenantView(updatedTenant),
    appliedPreset: {
      ...preset,
      skin,
      palette: paletteId,
      primary,
      radius,
      collapseMode,
      loginTpl,
      layout,
      density
    }
  })
})
