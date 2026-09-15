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
  await loadTenant(tenantId)

  const cap = await loadCapability(capKey)
  const spec = j<CapSpec | null>(cap.spec_json, null)
  const config = sanitizeCapConfig(spec, body.config ?? {})
  const defaults: Record<string, unknown> = {}
  for (const item of spec?.config ?? []) {
    if (item && item.key !== undefined) defaults[item.key] = item.default
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
