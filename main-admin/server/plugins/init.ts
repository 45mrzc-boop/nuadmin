import mysql from 'mysql2/promise'
import { CONTROL_PLANE_DDL } from '../utils/ddl'
import { CAPABILITY_CATALOG } from '../utils/capabilities'

export default defineNitroPlugin(async () => {
  const cfg = useRuntimeConfig().db

  // The control-plane schema may not exist yet on a fresh box.
  const boot = await mysql.createConnection({ host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password })
  await boot.query(
    `CREATE DATABASE IF NOT EXISTS \`${cfg.name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  boot.end()

  await execScript(CONTROL_PLANE_DDL)

  // The DDL above is CREATE TABLE IF NOT EXISTS, so columns added after a table
  // first shipped need an explicit, idempotent ALTER. Extend this list instead
  // of writing a new probe per migration.
  const COLUMNS: Array<[string, string, string]> = [
    ['gen_job', 'git_commit', `VARCHAR(32) NOT NULL DEFAULT '' AFTER message`],
    ['tenant', 'auth_mode', `VARCHAR(16) NOT NULL DEFAULT '' AFTER app_title`],
    ['tenant', 'auth_config', `JSON NULL AFTER auth_mode`],
    // 字段属性补齐（对齐代码生成器的字段配置形态）
    ['module_field', 'ref_label', `VARCHAR(64) NOT NULL DEFAULT '' AFTER ref_table`],
    ['module_field', 'ref_value', `VARCHAR(64) NOT NULL DEFAULT '' AFTER ref_label`],
    ['module_field', 'detail_show', `TINYINT NOT NULL DEFAULT 1 AFTER form_show`],
    ['module_field', 'export_show', `TINYINT NOT NULL DEFAULT 0 AFTER detail_show`],
    ['module_field', 'sortable', `TINYINT NOT NULL DEFAULT 0 AFTER export_show`],
    ['module_field', 'clearable', `TINYINT NOT NULL DEFAULT 1 AFTER sortable`],
    ['module_field', 'query_hidden', `TINYINT NOT NULL DEFAULT 0 AFTER query_type`],
    ['module_field', 'rule_msg', `VARCHAR(255) NOT NULL DEFAULT '' AFTER rule`],
    ['module_field', 'index_type', `VARCHAR(16) NOT NULL DEFAULT 'none' AFTER rule_msg`]
  ]
  const added = new Set<string>()
  for (const [table, column, def] of COLUMNS) {
    const has = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`, [cfg.name, table, column])
    if (!Number(has?.n)) {
      await run(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`)
      added.add(`${table}.${column}`)
    }
  }

  // 导出列以前恒等于列表列，新列默认 0 会让现有模型的导出突然变空。
  // 只在"这一列刚加出来"时按 list_show 回填一次：否则用户关掉导出后重启会被偷偷打开。
  if (added.has('module_field.export_show')) {
    await run(`UPDATE module_field SET export_show = list_show WHERE list_show = 1`)
  }

  // index_type 取代 indexed/uniq/pk 三个可以互相冲突的布尔。老数据按优先级折算一次；
  // 之后由写入端保持两派同步，所以这条只在列刚建出来时有效。
  await run(`UPDATE module_field SET index_type =
               CASE WHEN pk=1 THEN 'primary' WHEN uniq=1 THEN 'unique'
                    WHEN indexed=1 THEN 'normal' ELSE 'none' END
             WHERE index_type='none' AND (pk=1 OR uniq=1 OR indexed=1)`)

  // icon 原本是 VARCHAR(16)，装不下 lucide 图标名（如 sliders-horizontal）。
  // 放宽到 32，否则图标选择器存进去会被静默截断成半个名字。
  const WIDEN: Array<[string, string, string]> = [
    ['model_group', 'icon', `VARCHAR(32) NOT NULL DEFAULT '📁'`],
    ['module', 'icon', `VARCHAR(32) NOT NULL DEFAULT '📄'`]
  ]
  for (const [table, column, def] of WIDEN) {
    const narrow = await one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? AND CHARACTER_MAXIMUM_LENGTH < 32`,
      [cfg.name, table, column])
    if (Number(narrow?.n)) await run(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${def}`)
  }

  // Tenants generated before auth modes existed were all JWT+Casbin, so keep
  // them working. Anything never generated must choose explicitly.
  await run(`UPDATE tenant SET auth_mode='rbac' WHERE auth_mode='' AND generated_at IS NOT NULL`)

  // Built-in super account + policy set + capability catalogue.
  if (!(await one(`SELECT id FROM user WHERE username='admin'`))) {
    const r = await run(
      `INSERT INTO user (username,password,nickname) VALUES (?,?,?)`,
      ['admin', hashPassword('admin123'), '超级管理员'])
    await grantRole(`user:${r.insertId}`, 'super', 'main')
  }
  await bootstrapPolicies()

  for (const c of CAPABILITY_CATALOG) {
    await run(
      `INSERT INTO capability (cap_key,name,icon,category,version,summary,spec_json)
       VALUES (?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), icon=VALUES(icon), category=VALUES(category),
                               version=VALUES(version), summary=VALUES(summary), spec_json=VALUES(spec_json)`,
      [c.cap_key, c.name, c.icon, c.category, c.version, c.summary, JSON.stringify(c.spec)])
  }

  console.log('[nuadmin] control plane ready')
})
