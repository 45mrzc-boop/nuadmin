import { capabilityView, loadTenant, numArg } from '../_lib'

export default defineAuthed(async (event) => {
  const raw = getQuery(event).tenantId
  const tenantId = raw === undefined || raw === '' ? 0 : numArg(event, 'tenantId', 0)
  if (tenantId) await loadTenant(tenantId)

  const caps = await q<Record<string, any>>(`SELECT * FROM capability ORDER BY FIELD(category,'system','data','media','insight','biz','ui'), cap_key`)
  const installed = tenantId
    ? await q<Record<string, any>>(`SELECT * FROM tenant_capability WHERE tenant_id=?`, [tenantId])
    : []
  const byKey = new Map(installed.map(r => [String(r.cap_key), r]))

  return ok(caps.map(c => capabilityView(c, byKey.get(String(c.cap_key)) ?? null)))
})
