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
  if (body.config === undefined) throw createError({ statusCode: 400, message: '缺少 config 对象' })
  await loadTenant(tenantId)

  const row = await one<Record<string, any>>(
    `SELECT * FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey])
  if (!row) throw createError({ statusCode: 404, message: `子后台 #${tenantId} 未安装能力「${capKey}」，请先安装` })

  const cap = await loadCapability(capKey)
  const spec = j<CapSpec | null>(cap.spec_json, null)
  const next = { ...j<Record<string, unknown>>(row.config_json, {}), ...sanitizeCapConfig(spec, body.config) }

  await run(`UPDATE tenant_capability SET config_json=? WHERE id=?`, [JSON.stringify(next), row.id])
  const updated = await one<Record<string, any>>(`SELECT * FROM tenant_capability WHERE id=?`, [row.id])
  return ok(tenantCapView(updated!))
})
