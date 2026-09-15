import type { PoolConnection } from 'mysql2/promise'
import type { Row } from '../_lib'
import {
  asText, assertIdent, assertResKey, bodyOf, deriveKeys, FIELD_INSERT_COLUMNS, fieldRecord,
  loadTenant, wantId
} from '../_lib'

interface ImportedGroup { name?: unknown, icon?: unknown, modules?: unknown }

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/model/:id', 'write')
  const body = await bodyOf(event)
  const tenantId = wantId(body, 'tenantId', '子后台 tenantId')
  await loadTenant(tenantId)

  const groups = normalizeGroups(body.json)
  if (!groups.length) {
    throw createError({ statusCode: 400, message: '导入内容里没有分组，期望结构 {groups:[{name,modules:[{name,fields:[...]}]}]}（可直接用 GET /api/model/export 的产物）' })
  }

  const usedRes = new Set((await q<{ res_key: string }>(`SELECT res_key FROM module WHERE tenant_id=?`, [tenantId])).map(r => r.res_key))
  const usedTable = new Set((await q<{ table_name: string }>(`SELECT table_name FROM module WHERE tenant_id=?`, [tenantId])).map(r => r.table_name))
  let groupSort = await maxSort(`SELECT MAX(sort) s FROM model_group WHERE tenant_id=?`, tenantId)
  let moduleSort = await maxSort(`SELECT MAX(sort) s FROM module WHERE tenant_id=?`, tenantId)

  let modules = 0
  let createdGroups = 0

  await tx(async conn => {
    for (const g of groups) {
      const groupName = asText(g.name, 64)
      if (!groupName) throw createError({ statusCode: 400, message: '存在没有名称的分组，无法导入' })

      let groupId = await idOf(conn, `SELECT id FROM model_group WHERE tenant_id=? AND name=?`, [tenantId, groupName])
      if (groupId === null) {
        groupId = await insertOn(conn, `INSERT INTO model_group (tenant_id,name,icon,sort) VALUES (?,?,?,?)`,
          [tenantId, groupName, asText(g.icon ?? '📁', 32) || '📁', ++groupSort])
        createdGroups++
      }

      const list = Array.isArray(g.modules) ? g.modules as Row[] : []
      for (const raw of list) {
        const name = asText(raw.name ?? raw.title, 64)
        if (!name) throw createError({ statusCode: 400, message: `分组「${groupName}」下存在没有名称的模型，无法导入` })

        const derived = deriveKeys(name, asText(raw.tableName ?? raw.table_name, 64), asText(raw.key ?? raw.res_key, 64))
        const resKey = free(assertResKey(derived.resKey, `模型「${name}」的资源标识 res_key`), usedRes)
        const table = free(assertIdent(derived.table, `模型「${name}」的表名 tableName`), usedTable)

        const moduleId = await insertOn(conn,
          `INSERT INTO module (group_id,tenant_id,name,res_key,table_name,icon,comment,sort,design_json,logic_json,seed_json)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [groupId, tenantId, name, resKey, table, asText(raw.icon ?? '📄', 32) || '📄',
            asText(raw.comment, 255), ++moduleSort,
            jsonParam(raw.design), jsonParam(raw.logic), jsonParam(raw.seed)])
        usedRes.add(resKey)
        usedTable.add(table)
        modules++

        const inputs = Array.isArray(raw.fields) ? raw.fields as Row[] : []
        const seen = new Set<string>()
        let sort = 0
        for (const [i, input] of inputs.entries()) {
          const rec = fieldRecord(input, `模型「${name}」第 ${i + 1} 个字段`)
          if (seen.has(rec.col_key)) {
            throw createError({ statusCode: 400, message: `模型「${name}」的列名「${rec.col_key}」重复` })
          }
          seen.add(rec.col_key)
          const row: Row = { ...rec, module_id: moduleId, sort: ++sort }
          const cols = FIELD_INSERT_COLUMNS.filter(c => row[c] !== undefined)
          await insertOn(conn,
            `INSERT INTO module_field (${cols.map(c => ident(c)).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            cols.map(c => row[c]))
        }
      }
    }
  })

  return ok({ modules, groups: createdGroups })
})

function normalizeGroups(json: unknown): ImportedGroup[] {
  let value = json
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      throw createError({ statusCode: 400, message: 'json 不是合法的 JSON 文本' })
    }
  }
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value as ImportedGroup[]
  const v = value as Row
  if (Array.isArray(v.groups)) return v.groups as ImportedGroup[]
  if (Array.isArray(v.modules)) return [{ name: '导入分组', modules: v.modules }]
  if (v.name && (Array.isArray(v.fields) || Array.isArray(v.modules))) {
    return [{ name: asText(v.group, 64) || '导入分组', modules: [v] }]
  }
  return []
}

async function maxSort(sql: string, tenantId: number): Promise<number> {
  const r = await one<{ s: number | null }>(sql, [tenantId])
  return Number(r?.s ?? 0)
}

type SqlParams = NonNullable<Parameters<PoolConnection['execute']>[1]>

async function idOf(conn: PoolConnection, sql: string, params: SqlParams): Promise<number | null> {
  const [rows] = await conn.execute(sql, params) as [Row[], unknown]
  return rows.length ? Number(rows[0]?.id) : null
}

async function insertOn(conn: PoolConnection, sql: string, params: SqlParams): Promise<number> {
  const [r] = await conn.execute(sql, params) as [{ insertId: number }, unknown]
  return Number(r.insertId)
}

function free(base: string, used: Set<string>): string {
  let v = base
  for (let i = 2; used.has(v); i++) v = `${base}${i}`
  return v
}

function jsonParam(v: unknown): string | null {
  return v === undefined || v === null ? null : JSON.stringify(v)
}
