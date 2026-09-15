// Regenerates server/utils/ddl.ts from server/utils/schema.sql (single source of truth).
// Run: node server/scripts/sync-ddl.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const sql = readFileSync(`${here}../utils/schema.sql`, 'utf8')

writeFileSync(`${here}../utils/ddl.ts`,
  '// GENERATED from server/utils/schema.sql by server/scripts/sync-ddl.mjs — edit the .sql, not this file.\n' +
  'export const CONTROL_PLANE_DDL = `' + sql.replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`;\n')

console.log('ddl.ts synced from schema.sql')
