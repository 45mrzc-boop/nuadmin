import { newEnforcer, newModelFromString, StringAdapter, type Enforcer } from 'casbin'

/**
 * RBAC with domains. `dom` scopes a policy set to one sub-admin
 * ('main' = control plane, otherwise the tenant slug), so the same
 * enforcer serves every generated project.
 */
const MODEL = `
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && keyMatch2(r.obj, p.obj) && (p.act == "*" || r.act == p.act)
`

let cached: Enforcer | null = null
let stamp = 0

function ruleToLine(r: { ptype: string, v0: string, v1: string, v2: string, v3: string, v4: string, v5: string }): string {
  return [r.ptype, r.v0, r.v1, r.v2, r.v3, r.v4, r.v5].filter(v => v !== '' && v != null).join(', ')
}

/** Force the next enforce() to re-read casbin_rule. */
export function invalidateCasbin() {
  cached = null
  stamp = Date.now()
}

export async function enforcer(): Promise<Enforcer> {
  if (cached) return cached
  const rows = await q<{ ptype: string, v0: string, v1: string, v2: string, v3: string, v4: string, v5: string }>(
    'SELECT ptype, v0, v1, v2, v3, v4, v5 FROM casbin_rule ORDER BY id')
  const text = rows.map(ruleToLine).join('\n')
  const e = await newEnforcer(newModelFromString(MODEL), new StringAdapter(text))
  cached = e
  stamp = Date.now()
  return e
}

/** Insert a p/g rule (idempotent) and refresh the enforcer. */
export async function addRule(ptype: 'p' | 'g', vars: string[], dom: string) {
  const exists = await one<{ id: number }>(
    `SELECT id FROM casbin_rule WHERE ptype=? AND v0=? AND v1=? AND v2=? AND v3=? AND v4=? AND v5=?`,
    [ptype, vars[0] ?? '', vars[1] ?? '', vars[2] ?? '', vars[3] ?? '', vars[4] ?? '', vars[5] ?? ''])
  if (!exists) {
    await run(`INSERT INTO casbin_rule (ptype,v0,v1,v2,v3,v4,v5) VALUES (?,?,?,?,?,?,?)`,
      [ptype, vars[0] ?? '', vars[1] ?? '', vars[2] ?? '', vars[3] ?? '', vars[4] ?? '', vars[5] ?? ''])
  }
  void dom
  invalidateCasbin()
}

export async function removeRule(ptype: 'p' | 'g', vars: string[]) {
  await run(`DELETE FROM casbin_rule WHERE ptype=? AND v0=? AND v1=? AND v2=? AND v3=?`,
    [ptype, vars[0] ?? '', vars[1] ?? '', vars[2] ?? '', vars[3] ?? ''])
  invalidateCasbin()
}

/** Grant a role every policy of another role (role inheritance within a domain). */
export async function grantRole(userKey: string, role: string, dom: string) {
  await addRule('g', [userKey, role, dom], dom)
}

export async function enforce(user: AuthUser, dom: string, obj: string, act: string): Promise<boolean> {
  const e = await enforcer()
  const subjects = [`user:${user.uid}`, ...user.roles.map(r => `role:${r}`)]
  for (const s of subjects) {
    if (await e.enforce(s, dom, obj, act)) return true
  }
  return false
}

/** Handler guard: throws 403 unless the caller's role covers `obj:act` in `dom`. */
export async function authorize(event: any, dom: string, obj: string, act: string) {
  const user = currentUser(event)
  if (user.roles.includes('super')) return user
  if (!(await enforce(user, dom, obj, act))) {
    throw createError({ statusCode: 403, message: `无权限: ${obj} ${act.toUpperCase()}` })
  }
  return user
}

/** Seed the control-plane policy set. Called from the boot plugin. */
export async function bootstrapPolicies() {
  const rules: Array<[string, string, string, string]> = [
    // super bypasses enforcement in code as well, this is the belt to the braces
    ['role:super', '*', '*', '*'],
    ...['tenant', 'model', 'capability', 'design', 'logic', 'seed', 'gen', 'verify', 'ai'].map(
      (m): [string, string, string, string] => [`role:admin`, 'main', `/api/${m}/:id`, '*']),
    ['role:editor', 'main', '/api/tenant/:id', 'get'],
    ['role:editor', 'main', '/api/model/:id', 'get'],
    ['role:editor', 'main', '/api/gen/:id', 'post'],
    ['role:viewer', 'main', '/api/tenant/:id', 'get'],
    ['role:viewer', 'main', '/api/model/:id', 'get'],
    ['role:viewer', 'main', '/api/capability/:id', 'get']
  ]
  for (const [sub, dom, obj, act] of rules) await addRule('p', [sub, dom, obj, act], dom)
}

export const casbinStamp = () => stamp
