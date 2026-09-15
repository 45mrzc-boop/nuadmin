import type { FieldDef, ModuleDef } from './types'

/** MySQL column type for a modelled field. */
export function sqlType(f: FieldDef): string {
  switch (f.type) {
    case 'id': return 'INT UNSIGNED AUTO_INCREMENT'
    case 'varchar': return `VARCHAR(${Math.min(Math.max(f.length ?? 64, 1), 1024)})`
    case 'text':
    case 'richtext': return 'TEXT'
    case 'int': return f.length && f.length > 10 ? 'BIGINT' : 'INT'
    case 'decimal':
    case 'money': return `DECIMAL(14,${Math.min(Math.max(f.precision ?? 2, 0), 6)})`
    case 'date': return 'DATE'
    case 'datetime': return 'DATETIME'
    case 'bool': return 'TINYINT(1)'
    case 'enum': return `VARCHAR(${Math.min(Math.max(f.length ?? 32, 8), 64)})`
    case 'json': return 'JSON'
    case 'fk': return (f.refValue && f.refValue !== 'id') ? `VARCHAR(${Math.min(Math.max(f.length ?? 64, 1), 1024)})` : 'INT UNSIGNED'
    case 'file':
    case 'image': return 'VARCHAR(512)'
    default: return 'VARCHAR(255)'
  }
}

export function isPk(f: FieldDef): boolean {
  return f.type === 'id' || f.pk === true
}

/** TypeScript type used in generated validators and pages. */
export function tsType(f: FieldDef): string {
  if (f.type === 'bool') return 'boolean'
  if (['int', 'decimal', 'money'].includes(f.type)) return 'number'
  if (f.type === 'fk') return (f.refValue && f.refValue !== 'id') ? 'string' : 'number'
  if (['json'].includes(f.type)) return 'Record<string, unknown>'
  return 'string'
}

/** Vue component the 设计站 picks for a field, resolved from its type when unset. */
export function componentOf(f: FieldDef): string {
  if (f.component && f.component !== 'input') return f.component
  if (f.ref) return 'remote-select'
  switch (f.type) {
    case 'text': return 'textarea'
    case 'richtext': return 'richtext'
    case 'decimal':
    case 'money':
    case 'int': return 'number'
    case 'date': return 'date'
    case 'datetime': return 'datetime'
    case 'bool': return 'switch'
    case 'enum': return 'select'
    case 'json': return 'code'
    case 'file': return 'upload'
    case 'image': return 'image'
    case 'fk': return 'remote-select'
    default: return 'input'
  }
}

function literal(v: string | number | boolean | null | undefined, f: FieldDef): string | null {
  // A null default means "no default was set". Emitting `DEFAULT NULL` next to
  // `NOT NULL` is invalid in MySQL 8, so both absences collapse to nothing.
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return String(Number(v))
  if (typeof v === 'number') return String(v)
  if (f.type === 'datetime' && v === 'CURRENT_TIMESTAMP') return 'CURRENT_TIMESTAMP'
  return `'${String(v).replace(/'/g, "''")}'`
}

/** One column definition, including inline UNIQUE/DEFAULT. */
export function columnSql(f: FieldDef): string {
  const parts = [`\`${f.key}\` ${sqlType(f)}`]
  if (isPk(f)) parts.push('PRIMARY KEY')
  else {
    // Capability specs declare `required` without `nullable`; an omitted
    // nullable must mean "nullable", not "NOT NULL with no default".
    if (f.nullable === false || f.required) parts.push('NOT NULL')
    const d = literal(f.default, f)
    if (d && !['TEXT', 'JSON'].includes(sqlType(f))) parts.push(`DEFAULT ${d}`)
  }
  if (f.unique && !isPk(f)) parts.push('UNIQUE')
  if (f.remark) parts.push(`COMMENT '${f.remark.replace(/'/g, "''")}'`)
  return parts.join(' ')
}

/** Business tables always carry created/updated stamps plus an operator. */
export const AUDIT_FIELDS: FieldDef[] = [
  { name: '创建时间', key: 'created_at', type: 'datetime', listShow: false, formShow: false, default: 'CURRENT_TIMESTAMP' },
  { name: '更新时间', key: 'updated_at', type: 'datetime', listShow: false, formShow: false },
  { name: '创建人', key: 'created_by', type: 'varchar', length: 64, listShow: false, formShow: false, default: '' }
]

export function moduleFields(m: ModuleDef): FieldDef[] {
  const own = m.fields.filter(f => !AUDIT_FIELDS.some(a => a.key === f.key))
  const hasId = own.some(isPk)
  const head: FieldDef[] = hasId ? [] : [{ name: '主键', key: 'id', type: 'id' }]
  return [...head, ...own, ...AUDIT_FIELDS]
}

export function tableSql(m: ModuleDef, extraColumns: FieldDef[] = []): string {
  const fields = [...moduleFields(m), ...extraColumns.filter(c => !moduleFields(m).some(f => f.key === c.key))]
  const cols = fields.map(f => '  ' + columnSql(f))
  const idx = fields.filter(f => f.indexed && !isPk(f))
    .map(f => `  INDEX \`idx_${m.tableName}_${f.key}\` (\`${f.key}\`)`)
  const comment = m.comment || m.name
  return `CREATE TABLE IF NOT EXISTS \`${m.tableName}\` (\n${[...cols, ...idx].join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='${comment.replace(/'/g, "''")}'`
}

/** Standalone capability table (no module wrapper). */
export function capTableSql(t: { name: string, comment: string, fields: FieldDef[] }): string {
  const cols = t.fields.map(f => '  ' + columnSql(f))
  const idx = t.fields.filter(f => f.indexed && !isPk(f))
    .map(f => `  INDEX \`idx_${t.name}_${f.key}\` (\`${f.key}\`)`)
  return `CREATE TABLE IF NOT EXISTS \`${t.name}\` (\n${[...cols, ...idx].join(',\n')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='${t.comment}'`
}

/** CSV/seed friendly sample generator, driven by the 数据站 rules. */
export function seedHint(f: FieldDef): string {
  switch (f.type) {
    case 'int': return 'rand(1,9999)'
    case 'decimal':
    case 'money': return 'money(100,100000)'
    case 'bool': return 'bool()'
    case 'date': return 'date()'
    case 'datetime': return 'datetime()'
    case 'enum': return `pick(${f.dict ?? 'dict'})`
    case 'json': return 'json()'
    case 'text':
    case 'richtext': return 'sentence()'
    case 'image':
    case 'file': return 'image()'
    default:
      if (f.key.includes('phone')) return 'phone()'
      if (f.key.includes('email')) return 'email()'
      if (f.key.includes('name')) return 'cnName()'
      return `word(${f.length || 32})`
  }
}
