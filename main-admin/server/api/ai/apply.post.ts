import type { Row } from '../_lib'
import {
  asText, bodyOf, insertField, knownColumnKeys, loadCapability, loadModule,
  deriveKeys, loadTenant, mergeDesign, mergeLogic, mergeSeed, numOf,
  prepareFields, uniqueInTenant, wantId
} from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/ai/:id', 'write')
  const body = await bodyOf(event)
  const sessionId = wantId(body, 'sessionId', '会话 sessionId')
  const messageId = wantId(body, 'messageId', '消息 messageId')

  const s = await one<Row>(`SELECT * FROM ai_session WHERE id=?`, [sessionId])
  if (!s) throw createError({ statusCode: 404, message: `会话 #${sessionId} 不存在` })
  if (Number(s.user_id) !== currentUser(event).uid) throw createError({ statusCode: 403, message: '只能执行自己的会话' })

  const msg = await one<Row>(`SELECT * FROM ai_message WHERE id=? AND session_id=?`, [messageId, sessionId])
  if (!msg) throw createError({ statusCode: 404, message: `消息 #${messageId} 不在该会话中` })
  if (msg.role !== 'assistant') throw createError({ statusCode: 400, message: '只能执行助手给出的方案' })

  const payload = j<Row>(msg.payload, {})
  const intent = asText(payload.intent ?? msg.intent, 32)
  const tenantId = resolveTenant(payload, s)
  if (payload._applied) {
    return ok({ applied: 0, detail: ['该方案已执行过，如需重跑请重新发起对话'], intent, skipped: true })
  }
  if (intent === 'chat') throw createError({ statusCode: 400, message: '这条消息没有可执行的方案' })

  const run0 = { applied: 0, detail: [] as string[] }
  switch (intent) {
    case 'model': await applyModel(tenantId, payload, run0); break
    case 'capability': await applyCapability(tenantId, payload, run0); break
    case 'design': await applyStation(tenantId, payload, 'design_json', '设计', run0); break
    case 'logic': await applyStation(tenantId, payload, 'logic_json', '逻辑', run0); break
    case 'seed': await applyStation(tenantId, payload, 'seed_json', '数据', run0); break
    case 'gen': await applyGenerate(tenantId, payload, run0); break
    case 'verify': await applyVerify(tenantId, run0); break
    default: throw createError({ statusCode: 400, message: `未知的意图「${intent}」，可执行：model / capability / design / logic / seed / gen / verify` })
  }

  const result = { applied: run0.applied, detail: run0.detail, intent }
  await run(`UPDATE ai_message SET payload=? WHERE id=?`,
    [JSON.stringify({ ...payload, _applied: { at: new Date().toISOString(), ...result } }), messageId])
  return ok(result)
})

function resolveTenant(payload: Row, s: Row): number {
  const fromPayload = numOf(payload.tenantId, 0)
  const tenantId = fromPayload || numOf(s.tenant_id, 0)
  if (!tenantId) throw createError({ statusCode: 400, message: '该会话没有绑定子后台，请在创建会话时指定 tenantId，或在句子里点名子后台' })
  return tenantId
}

// ---------------------------------------------------------------- intents

async function applyModel(tenantId: number, payload: Row, out: { applied: number, detail: string[] }) {
  const t = await loadTenant(tenantId)
  const mod = (payload.module ?? {}) as Row
  const name = asText(mod.name, 64)
  if (!name) throw createError({ statusCode: 400, message: '方案里没有模型名' })

  const groupName = asText(payload.group ?? payload.groupName, 64) || '默认分组'
  let group = await one<Row>(`SELECT * FROM model_group WHERE tenant_id=? AND name=?`, [tenantId, groupName])
  if (!group) {
    const sort = numOf((await one<{ s: number | null }>(`SELECT MAX(sort) s FROM model_group WHERE tenant_id=?`, [tenantId]))?.s, 0) + 1
    const r = await run(`INSERT INTO model_group (tenant_id,name,icon,sort) VALUES (?,?,?,?)`,
      [tenantId, groupName, asText(payload.groupIcon ?? '📁', 16) || '📁', sort])
    group = await one<Row>(`SELECT * FROM model_group WHERE id=?`, [r.insertId])
    out.applied++
    out.detail.push(`新建分组「${groupName}」`)
  }

  const derived = deriveKeys(name, asText(mod.tableName ?? mod.table_name, 64), asText(mod.key ?? mod.res_key, 64))
  const resKey = await uniqueInTenant('res_key', tenantId, derived.resKey)
  const table = await uniqueInTenant('table_name', tenantId, derived.table)
  const r = await run(
    `INSERT INTO module (group_id,tenant_id,name,res_key,table_name,icon,comment,sort) VALUES (?,?,?,?,?,?,?,?)`,
    [Number(group!.id), tenantId, name, resKey, table, asText(mod.icon ?? '📄', 32) || '📄',
      asText(mod.comment, 255),
      numOf((await one<{ s: number | null }>(`SELECT MAX(sort) s FROM module WHERE tenant_id=?`, [tenantId]))?.s, 0) + 1])
  out.applied++
  out.detail.push(`新建模型「${name}」→ 表 ${table} / 资源 ${resKey}`)

  const inputs = (Array.isArray(payload.fields) ? payload.fields : []) as Row[]
  if (inputs.length) {
    const rows = await prepareFields(r.insertId, inputs)
    for (const row of rows) await insertField(row)
    out.applied += rows.length
    out.detail.push(`写入 ${rows.length} 个字段：${rows.map(x => `${x.name}(${x.col_key}:${x.type})`).join('、')}`)
  }

  if (Array.isArray(payload.capabilities) && payload.capabilities.length) {
    await applyCapability(tenantId, { op: 'install', capKeys: payload.capabilities }, out)
  }
  const seed = payload.seed as Row | undefined
  if (seed && numOf(seed.rows, 0) > 0) {
    const merged = mergeSeed(await loadModule(r.insertId), seed)
    await run(`UPDATE module SET seed_json=? WHERE id=?`, [JSON.stringify(merged), r.insertId])
    out.applied++
    out.detail.push(`数据站：造 ${merged.rows} 条种子数据`)
  }
  if (payload.generate === true) {
    await applyGenerate(tenantId, { note: `AI 建模后生成 ${t.slug}` }, out)
  }
}

async function applyCapability(tenantId: number, payload: Row, out: { applied: number, detail: string[] }) {
  await loadTenant(tenantId)
  const keys = (Array.isArray(payload.capKeys) ? payload.capKeys : [payload.capKey])
    .map(k => asText(k, 64)).filter(Boolean)
  if (!keys.length) throw createError({ statusCode: 400, message: '方案里没有能力编码' })
  const uninstall = asText(payload.op, 16) === 'uninstall'

  for (const capKey of keys) {
    const cap = await loadCapability(capKey)
    if (uninstall) {
      const r = await run(`DELETE FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey])
      if (!r.affectedRows) {
        out.detail.push(`能力「${cap.name}」本来就未安装`)
        continue
      }
      out.applied++
      out.detail.push(`卸载能力「${cap.name} ${capKey}」`)
      continue
    }
    const spec = j<{ config?: Array<{ key: string, default: unknown }> } | null>(cap.spec_json, null)
    const defaults: Record<string, unknown> = {}
    for (const item of spec?.config ?? []) defaults[item.key] = item.default
    const existing = await one<Row>(`SELECT id FROM tenant_capability WHERE tenant_id=? AND cap_key=?`, [tenantId, capKey])
    if (existing) {
      out.detail.push(`能力「${cap.name}」已在库中，跳过`)
      continue
    }
    await run(`INSERT INTO tenant_capability (tenant_id,cap_key,version,config_json,status) VALUES (?,?,?,?,'installed')`,
      [tenantId, capKey, cap.version, JSON.stringify(defaults)])
    out.applied++
    out.detail.push(`安装能力「${cap.name} ${capKey}」v${cap.version}`)
  }
}

async function applyStation(
  tenantId: number, payload: Row, column: 'design_json' | 'logic_json' | 'seed_json',
  label: string, out: { applied: number, detail: string[] }
) {
  const m = await targetModule(tenantId, payload)
  const patch = (payload[column.replace('_json', '') as 'design' | 'logic' | 'seed'] ?? payload) as Row

  if (column === 'design_json') {
    const merged = mergeDesign(m, patch)
    const known = await knownColumnKeys(tenantId, Number(m.id))
    // AI 说的中文列名可能不在模型里，丢弃而不是让整条链路失败
    const dropped = [...merged.list.columns, ...merged.form.fields].filter(k => !known.has(k))
    merged.list.columns = merged.list.columns.filter(k => known.has(k))
    merged.form.fields = merged.form.fields.filter(k => known.has(k))
    await run(`UPDATE module SET design_json=? WHERE id=?`, [JSON.stringify(merged), m.id])
    out.applied++
    out.detail.push(`更新「${m.name}」设计稿：${JSON.stringify({ list: merged.list.pageSize, columns: merged.list.columns.length })}`)
    if (dropped.length) out.detail.push(`忽略不存在的列引用：${[...new Set(dropped)].join('、')}`)
    return
  }
  if (column === 'logic_json') {
    const merged = mergeLogic(m, patch)
    const known = await knownColumnKeys(tenantId, Number(m.id))
    const kept = merged.validators.filter(v => known.has(v.field))
    const dropped = merged.validators.filter(v => !known.has(v.field)).map(v => v.field)
    await run(`UPDATE module SET logic_json=? WHERE id=?`, [JSON.stringify({ ...merged, validators: kept }), m.id])
    out.applied++
    out.detail.push(`更新「${m.name}」逻辑：${kept.length} 条校验、${merged.hooks.filter(h => h.enabled).length} 个钩子、${merged.endpoints.length} 个自定义接口`)
    if (dropped.length) out.detail.push(`忽略不存在的列引用：${dropped.join('、')}`)
    return
  }
  const merged = mergeSeed(m, patch)
  await run(`UPDATE module SET seed_json=? WHERE id=?`, [JSON.stringify(merged), m.id])
  out.applied++
  out.detail.push(`更新「${m.name}」数据站：${merged.enabled ? `造 ${merged.rows} 条` : '不造数据'}`)
}

async function applyGenerate(tenantId: number, payload: Row, out: { applied: number, detail: string[] }) {
  const { generate } = await import('../../utils/gen/index')
  const res = await generate(tenantId)
  const after = await loadTenant(tenantId)
  out.applied++
  out.detail.push(`生成 v${Number(after.version)}，共 ${res.files.length} 个文件（任务 #${res.jobId}）${asText(payload.note, 60) ? ` · ${asText(payload.note, 60)}` : ''}`)
}

async function applyVerify(tenantId: number, out: { applied: number, detail: string[] }) {
  const { verify } = await import('../../utils/gen/verify')
  const res = await verify(tenantId)
  const cases = Array.isArray(res.cases) ? res.cases : []
  out.applied++
  const passed = cases.filter(c => asText(c.status, 16) === 'pass').length
  out.detail.push(`验证 ${passed}/${cases.length} 通过（任务 #${res.jobId}）`)
}

async function targetModule(tenantId: number, payload: Row): Promise<Row> {
  const id = numOf(payload.moduleId, 0)
  if (id) {
    const m = await loadModule(id)
    if (Number(m.tenant_id) !== tenantId) throw createError({ statusCode: 400, message: `模型「${m.name}」不属于子后台 #${tenantId}` })
    return m
  }
  const token = asText(payload.moduleName ?? payload.module ?? payload.target ?? payload.resKey, 64)
  if (!token) {
    const only = await q<Row>(`SELECT * FROM module WHERE tenant_id=? ORDER BY sort,id LIMIT 2`, [tenantId])
    if (only.length !== 1) {
      const names = await q<Row>(`SELECT name FROM module WHERE tenant_id=? ORDER BY sort,id LIMIT 20`, [tenantId])
      throw createError({
        statusCode: 400,
        message: names.length
          ? `方案里没有指明模型，请在句子里带上模型名（现有：${names.map(n => n.name).join('、')}）`
          : `子后台 #${tenantId} 还没有模型，先建模再执行`
      })
    }
    const single = only[0]
    if (!single) throw createError({ statusCode: 400, message: `子后台 #${tenantId} 还没有模型，先建模再执行` })
    return single
  }
  const m = await one<Row>(
    `SELECT * FROM module WHERE tenant_id=? AND (name=? OR res_key=? OR table_name=?) LIMIT 1`,
    [tenantId, token, token, token])
  if (!m) throw createError({ statusCode: 404, message: `子后台 #${tenantId} 下找不到模型「${token}」` })
  return m
}
