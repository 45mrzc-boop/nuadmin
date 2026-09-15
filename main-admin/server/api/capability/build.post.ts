import type { CapSpec } from '../../utils/gen/types'
import { asText, bodyOf, capabilityView, loadTenant, tenantCapView } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/capability/:id', 'write')
  const body = await bodyOf(event)

  const capKey = asText(body.capKey ?? body.cap_key, 64)
  if (!capKey || !/^[a-zA-Z0-9_]+$/.test(capKey)) {
    throw createError({ statusCode: 400, message: '能力标识 capKey 必须是仅含字母、数字或下划线的非空字符串' })
  }

  const name = asText(body.name, 64)
  if (!name) throw createError({ statusCode: 400, message: '能力名称 name 不能为空' })

  const icon = asText(body.icon, 32) || '🧩'
  const category = asText(body.category, 32) || 'biz'
  const version = asText(body.version, 32) || '1.0.0'
  const summary = asText(body.summary, 512) || `${name}扩展能力包`

  let spec: CapSpec = { desc: summary }
  if (body.spec && typeof body.spec === 'object') {
    spec = {
      desc: asText(body.spec.desc, 1024) || summary,
      tables: Array.isArray(body.spec.tables) ? body.spec.tables : undefined,
      apis: Array.isArray(body.spec.apis) ? body.spec.apis : undefined,
      pages: Array.isArray(body.spec.pages) ? body.spec.pages : undefined,
      config: Array.isArray(body.spec.config) ? body.spec.config : undefined,
      verify: Array.isArray(body.spec.verify) ? body.spec.verify : undefined
    }
  }

  // 1. 注册或更新平台能力底座
  await run(
    `INSERT INTO capability (cap_key, name, icon, category, version, summary, spec_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       icon = VALUES(icon),
       category = VALUES(category),
       version = VALUES(version),
       summary = VALUES(summary),
       spec_json = VALUES(spec_json)`,
    [capKey, name, icon, category, version, summary, JSON.stringify(spec)]
  )

  // 2. 若指定了租户，自动一键安装到该租户并应用默认/定制配置
  let tenantInstalled = null
  const tenantId = body.tenantId ? Number(body.tenantId) : 0
  if (tenantId) {
    await loadTenant(tenantId)
    const defaults: Record<string, unknown> = {}
    for (const item of spec.config ?? []) {
      if (item && item.key !== undefined) defaults[item.key] = item.default
    }
    const merged = { ...defaults, ...(body.tenantConfig || body.config || {}) }
    const existing = await one<Record<string, any>>(
      `SELECT id FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey]
    )
    if (existing) {
      await run(
        `UPDATE tenant_capability SET version=?, config_json=?, status='installed', installed_at=NOW() WHERE id=?`,
        [version, JSON.stringify(merged), existing.id]
      )
    } else {
      await run(
        `INSERT INTO tenant_capability (tenant_id, cap_key, version, config_json, status) VALUES (?, ?, ?, ?, 'installed')`,
        [tenantId, capKey, version, JSON.stringify(merged)]
      )
    }
    const tRow = await one<Record<string, any>>(
      `SELECT * FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey]
    )
    if (tRow) tenantInstalled = tenantCapView(tRow)
  }

  const capRow = await one<Record<string, any>>(`SELECT * FROM capability WHERE cap_key=?`, [capKey])
  return ok({
    capability: capabilityView(capRow!, null),
    tenantInstalled
  })
})
