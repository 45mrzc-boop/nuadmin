import { fieldsOf, loadTenant, moduleView, numId, tenantView } from '../_lib'

export default defineAuthed(async (event) => {
  const id = numId(event)
  const t = await loadTenant(id)

  const groups = await q<Record<string, any>>(`SELECT * FROM model_group WHERE tenant_id=? ORDER BY sort,id`, [id])
  const modules = await q<Record<string, any>>(`SELECT * FROM module WHERE tenant_id=? ORDER BY sort,id`, [id])
  const fields = await fieldsOf(modules.map(m => Number(m.id)))
  const caps = await q<Record<string, any>>(`SELECT * FROM tenant_capability WHERE tenant_id=? ORDER BY cap_key`, [id])

  const byGroup = new Map<number, Record<string, any>[]>()
  for (const m of modules) {
    const gid = Number(m.group_id)
    if (!byGroup.has(gid)) byGroup.set(gid, [])
    byGroup.get(gid)!.push(moduleView(m, fields.get(Number(m.id)) ?? []))
  }

  return ok({
    ...tenantView(t),
    groups: groups.map(g => ({
      ...g,
      id: Number(g.id),
      sort: Number(g.sort),
      modules: byGroup.get(Number(g.id)) ?? []
    })),
    caps: caps.map(c => ({
      ...c,
      id: Number(c.id),
      tenant_id: Number(c.tenant_id),
      config: j<Record<string, unknown>>(c.config_json, {})
    }))
  })
})
