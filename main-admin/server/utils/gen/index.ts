import { join } from 'node:path'
import mysql from 'mysql2/promise'
import type { TenantPlan } from './types'
import { undefinedDictKeys } from './types'
import { buildPlan } from './plan'
import { appFiles } from './app'
import { serverFiles, tenantDdl } from './server'
import { writeProject, commitProject, quarantineDir, gitRollback } from './write'

/**
 * Generation pipeline: plan -> files -> disk -> git snapshot -> job record.
 * The sub-admin is written as a standalone project; nothing it contains
 * imports from this repo, so deleting the main admin leaves it runnable.
 */
export async function generate(tenantId: number): Promise<{
  jobId: number, version: number, files: Array<{ path: string, lines: number }>, log: string
}> {
  const plan = await buildPlan(tenantId)
  const t = await one<any>(`SELECT * FROM tenant WHERE id=?`, [tenantId])
  // 门禁模式不再是生成的前置条件：它属于子后台自己的设置（sys_config，运行时可切换），
  // 主后台只负责发布版本。这里只取一个初值，没选过就用「成员登录」。
  const IMPLEMENTED = ['simple', 'users', 'rbac']
  if (!plan.authMode) plan.authMode = 'users'
  if (!IMPLEMENTED.includes(plan.authMode)) plan.authMode = 'users'
  // The build being produced is version plan.version + 1; bump up-front so the
  // package.json, git commit, job row and tenant row all report one number.
  plan.version += 1
  const root = join(useRuntimeConfig().gen.tenantsRoot, plan.slug)

  const job = await run(
    `INSERT INTO gen_job (tenant_id,version,kind,status,message) VALUES (?,?,?,?,?)`,
    [tenantId, plan.version, 'generate', 'running', `${plan.groups.reduce((n, g) => n + g.modules.length, 0)} 模块 / ${Object.keys(plan.caps).length} 能力`])

  const lines: string[] = []
  try {
    lines.push(`[${new Date().toISOString()}] plan ${plan.slug} v${plan.version}`)
    lines.push(`  groups=${plan.groups.length} modules=${plan.groups.reduce((n, g) => n + g.modules.length, 0)} caps=${Object.keys(plan.caps).join(',') || 'none'}`)

    // 没有可用字典的枚举字段会降级成输入框。不写进报告，用户只会看到「下拉莫名其妙变成文本框」。
    const dictGaps = undefinedDictKeys(plan)
    if (dictGaps.length) {
      lines.push(`  ⚠ ${dictGaps.length} 个枚举字段没有可用字典，已降级为输入框：`)
      for (const g of dictGaps.slice(0, 20)) lines.push(`      ${g.module}.${g.field} → dict_key=${g.key}`)
      if (dictGaps.length > 20) lines.push(`      …另有 ${dictGaps.length - 20} 个`)
    }

    await ensureTenantDb(plan.dbName)
    lines.push(`  database ${plan.dbName} ready`)

    const files: Record<string, string> = {
      ...appFiles(plan),
      ...serverFiles(plan),
      ...(await safeUiFiles(plan, lines))
    }

    const written = await writeProject(root, files)
    lines.push(`  wrote ${written.length} files -> ${root}`)

    // 自动挂载共享依赖库，避免每个子后台重新走漫长的 npm install
    try {
      const { existsSync, symlinkSync } = await import('node:fs')
      const targetNm = join(root, 'node_modules')
      const sharedNm = existsSync(join(process.cwd(), 'node_modules'))
        ? join(process.cwd(), 'node_modules')
        : '/config/nuadmin/main-admin/node_modules'
      if (!existsSync(targetNm) && existsSync(sharedNm)) {
        symlinkSync(sharedNm, targetNm)
        lines.push(`  symlinked shared node_modules -> ${targetNm}`)
      }
    } catch {}

    const commit = await commitProject(root, `gen v${plan.version}: ${plan.groups.reduce((n, g) => n + g.modules.length, 0)} modules, ${Object.keys(plan.caps).length} capabilities`)
    lines.push(`  git ${commit || 'skipped (no git)'}`)

    await run(`UPDATE tenant SET status='generated', version=?, generated_at=NOW(), project_path=? WHERE id=?`, [plan.version, root, tenantId])
    await run(
      `UPDATE gen_job SET status='success', finished_at=NOW(), log=?, files_json=?, git_commit=?, message=? WHERE id=?`,
      [lines.join('\n'), JSON.stringify(written), commit,
       `${written.length} 个文件${dictGaps.length ? ` · ⚠ ${dictGaps.length} 个枚举字段缺字典` : ''} · commit ${commit || '-'}`, job.insertId])

    return { jobId: job.insertId, version: plan.version, files: written, log: lines.join('\n'), dictGaps }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    lines.push(`  FAILED ${msg}`)
    await run(`UPDATE gen_job SET status='failed', finished_at=NOW(), log=?, message=? WHERE id=?`,
      [lines.join('\n'), msg.slice(0, 500), job.insertId])
    await run(`UPDATE tenant SET status='failed' WHERE id=?`, [tenantId])
    throw createError({ statusCode: 500, message: `生成失败: ${msg}` })
  }
}

/** ui.ts is authored in parallel; degrade instead of breaking the whole pipeline. */
async function safeUiFiles(plan: TenantPlan, lines: string[]): Promise<Record<string, string>> {
  try {
    const mod = await import('./ui')
    const files = mod.uiFiles(plan) ?? {}
    lines.push(`  frontend ${Object.keys(files).length} files`)
    return files
  } catch (e: any) {
    lines.push(`  frontend SKIPPED: ${String(e?.message ?? e).slice(0, 200)}`)
    return {}
  }
}

/** Create the sub-admin's own database (never touches the control plane). */
export async function ensureTenantDb(dbName: string) {
  if (!/^[a-z][a-z0-9_]{1,60}$/.test(dbName)) throw new Error(`非法库名 ${dbName}`)
  const cfg = useRuntimeConfig().db
  const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password })
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  await conn.end()
}

/** Drop the sub-admin schema entirely (used by 删除子后台 with dropDb=1). */
export async function dropTenantDb(dbName: string) {
  if (!/^[a-z][a-z0-9_]{1,60}$/.test(dbName)) throw new Error(`非法库名 ${dbName}`)
  const cfg = useRuntimeConfig().db
  const conn = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password })
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``)
  await conn.end()
}

export async function removeTenantArtifacts(tenantId: number): Promise<void> {
  const t = await one<any>(`SELECT * FROM tenant WHERE id=?`, [tenantId])
  if (!t) return
  if (t.project_path) await quarantineDir(t.project_path)
}

/**
 * Restore the on-disk project to the git snapshot a previous successful
 * generation produced, then re-point the tenant version. Moving the version
 * pointer alone would leave the files untouched and mislead the operator.
 */
export async function rollback(tenantId: number, version: number): Promise<{
  jobId: number, version: number, commit: string, restored: boolean
}> {
  const t = await one<any>(`SELECT * FROM tenant WHERE id=?`, [tenantId])
  if (!t) throw createError({ statusCode: 404, message: '子后台不存在' })

  const target = await one<any>(
    `SELECT id, git_commit FROM gen_job WHERE tenant_id=? AND version=? AND kind='generate' AND status='success' ORDER BY id DESC LIMIT 1`,
    [tenantId, version])
  if (!target) {
    throw createError({ statusCode: 400, message: `v${version} 没有可回滚的成功生成记录，无法恢复其文件快照` })
  }
  if (!target.git_commit) {
    throw createError({ statusCode: 400, message: `v${version} 的快照早于 git 记录启用，无法恢复文件；请重新生成该版本` })
  }

  const root = t.project_path || join(useRuntimeConfig().gen.tenantsRoot, t.slug)
  const job = await run(`INSERT INTO gen_job (tenant_id,version,kind,status,message,git_commit) VALUES (?,?,?,?,?,?)`,
    [tenantId, version, 'rollback', 'running', `恢复 v${version} 文件快照 ${target.git_commit}`, String(target.git_commit)])

  const restored = await gitRollback(root, String(target.git_commit))
  if (!restored) {
    await run(`UPDATE gen_job SET status='failed', finished_at=NOW(), message=? WHERE id=?`,
      [`git checkout ${target.git_commit} 失败：目录或快照不可用`, job.insertId])
    throw createError({ statusCode: 500, message: '文件回滚失败：git 快照不可用' })
  }

  await run(`UPDATE tenant SET version=?, status='generated' WHERE id=?`, [version, tenantId])
  await run(`UPDATE gen_job SET status='success', finished_at=NOW(), message=? WHERE id=?`,
    [`已恢复 v${version} 的文件快照（${target.git_commit}）`, job.insertId])

  return { jobId: job.insertId, version, commit: String(target.git_commit), restored: true }
}

/** DDL preview for 生成站 without writing anything. */
export function previewDdl(plan: TenantPlan): string {
  return tenantDdl(plan)
}

/** File tree preview for 生成站. */
export function previewTree(files: Record<string, string>): string {
  return Object.keys(files).sort().join('\n')
}
