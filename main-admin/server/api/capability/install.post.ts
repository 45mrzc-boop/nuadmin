import type { CapSpec } from '../../utils/gen/types'
import {
  asText, bodyOf, loadTenant, loadCapability, sanitizeCapConfig, tenantCapView, wantId
} from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/capability/:id', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台 tenantId')
  const capKey = asText(body.capKey ?? body.cap_key, 64)
  if (!capKey) throw createError({ statusCode: 400, message: '能力编码 capKey 不能为空' })
  const tenant = await loadTenant(tenantId)

  const cap = await loadCapability(capKey)
  const spec = j<CapSpec | null>(cap.spec_json, null)
  const config = sanitizeCapConfig(spec, body.config ?? {})
  const defaults: Record<string, unknown> = {}
  for (const item of spec?.config ?? []) {
    if (item && item.key !== undefined && item.default !== undefined) {
      defaults[item.key] = item.default
    }
  }

  // 针对 landing_cms 前台微页面能力进行租户感知初值注入
  if (capKey === 'landing_cms') {
    const isMedical = /医|诊|药|挂号|就医|体检|护士|病|康复|卫生/.test((tenant.app_title || tenant.name || '') + ' ' + (tenant.description || ''))
    if (!defaults.siteName) defaults.siteName = tenant.app_title || tenant.name || '企业官方网站'
    if (!defaults.siteSlogan) defaults.siteSlogan = isMedical ? '精医厚德 · 科技赋能 · 提供全天候高品质便民医疗服务' : '连接未来 · 科技驱动 · 赋能企业全链路数字化转型'
  }

  const merged = { ...defaults, ...config }

  const existing = await one<Record<string, any>>(
    `SELECT id FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey])
  if (existing) {
    await run(
      `UPDATE tenant_capability SET version=?,config_json=?,status='installed',installed_at=NOW() WHERE id=?`,
      [cap.version, JSON.stringify(merged), existing.id])
  } else {
    await run(
      `INSERT INTO tenant_capability (tenant_id,cap_key,version,config_json,status) VALUES (?,?,?,?,'installed')`,
      [tenantId, capKey, cap.version, JSON.stringify(merged)])
  }

  const row = await one<Record<string, any>>(
    `SELECT * FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey])
  return ok(tenantCapView(row!))
})
