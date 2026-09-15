import { existsSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { boolOf, loadTenant, numId } from '../_lib'

export default defineAuthed(async (event) => {
  await authorize(event, 'main', '/api/tenant/:id', 'write')
  const id = numId(event)
  const t = await loadTenant(id)
  // 彻底删库只认显式的 ?dropDb=1，默认只删控制面记录并把项目目录改名
  const dropDb = boolOf(getQuery(event).dropDb)
  const dir = String(t.project_path ?? '')
  const dbName = String(t.db_name ?? '')

  if (dropDb) assertDbName(dbName)
  if (dir && !isUnderTenantRoot(dir)) {
    throw createError({ statusCode: 400, message: `项目目录 ${dir} 不在 tenantsRoot 下，拒绝处理，请先手工确认` })
  }

  const moduleIds = (await q<{ id: number }>(`SELECT id FROM module WHERE tenant_id=?`, [id])).map(r => Number(r.id))
  await tx(async conn => {
    if (moduleIds.length) {
      await conn.execute(
        `DELETE FROM module_field WHERE module_id IN (${moduleIds.map(() => '?').join(',')})`, moduleIds)
    }
    for (const sql of [
      `DELETE FROM module WHERE tenant_id=?`,
      `DELETE FROM model_group WHERE tenant_id=?`,
      `DELETE FROM tenant_capability WHERE tenant_id=?`,
      `DELETE FROM gen_job WHERE tenant_id=?`,
      `DELETE FROM verify_run WHERE tenant_id=?`
    ]) await conn.execute(sql, [id])
    await conn.execute(`UPDATE ai_session SET tenant_id=NULL WHERE tenant_id=?`, [id])
    await conn.execute(`DELETE FROM tenant WHERE id=?`, [id])
  })
  invalidateCasbin()

  const detail = ['已删除控制面记录']
  if (dropDb) {
    try {
      const alive = await one(`SELECT SCHEMA_NAME n FROM information_schema.SCHEMATA WHERE SCHEMA_NAME=?`, [dbName])
      if (alive) {
        // `??` 让驱动自己加反引号，不手工拼标识符
        const pool = useDbAt(dbName)
        await pool.query('DROP DATABASE IF EXISTS ??', [dbName])
        await pool.end()
        detail.push(`已删除子后台库 ${dbName}`)
      } else {
        detail.push(`子后台库 ${dbName} 不存在，跳过`)
      }
    } catch (e) {
      detail.push(`删除子后台库失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (!dir) return ok({ deleted: true, id, dropDb, detail })
  if (!existsSync(dir)) {
    detail.push('项目目录不存在，跳过')
    return ok({ deleted: true, id, dropDb, detail })
  }
  try {
    if (dropDb) {
      await rm(dir, { recursive: true, force: true })
      detail.push(`已删除项目目录 ${dir}`)
    } else {
      const target = `${dir}.removed-${Date.now()}`
      await rename(dir, target)
      detail.push(`项目目录已改名为 ${target}`)
    }
  } catch (e) {
    detail.push(`处理项目目录失败：${e instanceof Error ? e.message : String(e)}`)
  }

  return ok({ deleted: true, id, dropDb, detail })
})

function assertDbName(dbName: string): void {
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(dbName)) {
    throw createError({ statusCode: 400, message: `子后台库名「${dbName}」不合法，拒绝执行 DROP` })
  }
}

function isUnderTenantRoot(dir: string): boolean {
  const root = String(useRuntimeConfig().gen.tenantsRoot).replace(/\/+$/, '')
  return dir === root || (dir.startsWith(`${root}/`) && dir.length > root.length + 1)
}
