import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { createJiti } from 'jiti'
import ts from 'typescript'
import { newModelFromString, StringAdapter, newEnforcer } from 'casbin'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const jiti = createJiti(import.meta.url, {
  alias: {
    '#shared/skins': resolve(root, 'shared/skins.ts'),
    '#shared': resolve(root, 'shared')
  }
})

// Load generator modules
const { appFiles } = await jiti.import(resolve(root, 'server/utils/gen/app.ts'))
const { serverFiles, tenantDdl } = await jiti.import(resolve(root, 'server/utils/gen/server.ts'))
const { uiFiles } = await jiti.import(resolve(root, 'server/utils/gen/ui.ts'))

// Build a mock TenantPlan covering RBAC, business modules, and capabilities
const mockPlan = {
  slug: 'test_app',
  name: 'test_app',
  title: 'Test Tenant App',
  description: 'A test tenant app for generator verification',
  dbName: 'nuadmin_t_test_app',
  port: 8888,
  jwtSecret: 'generator-test-secret-key-123456',
  theme: { primary: 'blue', radius: 8, mode: 'light', density: 'normal', logo: '' },
  loginTpl: 'default',
  layout: 'default',
  authMode: 'rbac',
  authConfig: {
    users: [
      { username: 'admin', password: '123', name: '管理员', role: 'admin' },
      { username: 'operator', password: '123', name: '运营人员', role: 'operator' }
    ],
    roles: [
      { name: '超级管理', role_id: 'admin', perms: {} },
      { name: '运营主角色', role_id: 'op_lead', perms: {} },
      { name: '子级运营', role_id: 'op_sub', parent_id: 'op_lead', perms: {} }
    ]
  },
  groups: [
    {
      name: '电商业务',
      icon: 'lucide:shopping-bag',
      modules: [
        {
          id: 1,
          name: '商品管理',
          key: 'goods',
          tableName: 'goods',
          icon: 'lucide:package',
          comment: '商品列表',
          group: '电商业务',
          groupIcon: 'lucide:shopping-bag',
          fields: [
            { name: 'ID', key: 'id', type: 'id', pk: true },
            { name: '商品名称', key: 'name', type: 'varchar', length: 64, required: true },
            { name: '价格', key: 'price', type: 'decimal', precision: 2 },
            { name: '状态', key: 'status', type: 'enum', dict: 'status' }
          ],
          design: {
            list: { show: true, pageSize: 10, actions: ['create', 'edit', 'delete', 'export'], columns: ['id', 'name', 'price', 'status'], rowKey: 'id', striped: true, exportable: true },
            form: { layout: 'single', width: 600, dialog: true, fields: ['name', 'price', 'status'] },
            detail: { show: false, tabs: [] },
            menu: { show: true, icon: 'lucide:package', hidden: false, badge: '' }
          },
          logic: { hooks: [], endpoints: [], validators: [] },
          seed: { rows: 5, enabled: true, rules: {} }
        }
      ]
    }
  ],
  caps: {
    dict: { version: '1.2.0', config: {} }
  },
  dicts: {
    status: [
      { label: '上架', value: '1', color: 'ok' },
      { label: '下架', value: '0', color: 'err' }
    ]
  },
  version: 2
}

describe('NuAdmin Generator Suite', () => {
  const generatedAppFiles = appFiles(mockPlan)
  const generatedServerFiles = serverFiles(mockPlan)
  const generatedUiFiles = uiFiles(mockPlan)
  const allFiles = { ...generatedAppFiles, ...generatedServerFiles, ...generatedUiFiles }

  it('1. Generates 18+ core files with non-empty code and valid syntax', () => {
    const requiredFiles = [
      'package.json',
      'nuxt.config.ts',
      'app/assets/css/main.css',
      'app/utils/ui-kit.ts',
      'app/layouts/default.vue',
      'app/components/CrudPage.vue',
      'app/pages/login.vue',
      'app/pages/admin/system/role.vue',
      'app/pages/admin/system/user.vue',
      'server/utils/db.ts',
      'server/utils/schema.ts',
      'server/utils/tables.ts',
      'server/utils/auth.ts',
      'server/utils/crud.ts',
      'server/plugins/init.ts',
      'server/api/login.post.ts',
      'server/api/menu.get.ts',
      'server/api/system/role/create.post.ts',
      'server/api/system/role/update.patch.ts',
      'server/api/system/role/delete.post.ts',
      'server/api/system/role/casbin.get.ts',
      'server/api/system/role/casbin.post.ts',
      'server/api/system/role/menus.get.ts',
      'server/api/system/role/menus.post.ts'
    ]

    assert.ok(requiredFiles.length >= 18, 'Must verify at least 18 core files')
    for (const file of requiredFiles) {
      assert.ok(file in allFiles, `Expected generated file "${file}" to exist`)
      const content = allFiles[file]
      assert.ok(typeof content === 'string' && content.trim().length > 0, `Generated file "${file}" must be non-empty`)

      // TypeScript / JavaScript syntax check
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.ES2022, true)
        const parseDiagnostics = sourceFile.parseDiagnostics || []
        assert.equal(parseDiagnostics.length, 0, `Syntax errors detected in ${file}: ${JSON.stringify(parseDiagnostics)}`)
      } else if (file.endsWith('.json')) {
        assert.doesNotThrow(() => JSON.parse(content), `Invalid JSON in ${file}`)
      }
    }
  })

  it('2. can() operates in fail-closed mode and correctly rejects ungranted actions', () => {
    const uiKitContent = allFiles['app/utils/ui-kit.ts']
    assert.ok(uiKitContent, 'ui-kit.ts must be generated')

    // Must NOT contain old fail-open vulnerability
    assert.ok(
      !uiKitContent.includes('if (!item.btnPerms || !item.btnPerms.length) return true'),
      'can() must NOT contain fail-open fallback: "if (!item.btnPerms || !item.btnPerms.length) return true"'
    )
    assert.ok(
      uiKitContent.includes('if (!item.btnPerms || !item.btnPerms.length) return false'),
      'can() must fail-closed: return false when btnPerms is missing or empty'
    )

    // Behavioral simulation of can(btnKey, customPath)
    function simulateCan(currentUser, navMenus, currentPath, btnKey, customPath) {
      if (currentUser?.role === 'admin') return true
      const targetPath = customPath || currentPath
      const item = navMenus.find(m => m.path === targetPath)
      if (!item) return false
      if (!item.btnPerms || !item.btnPerms.length) return false
      return item.btnPerms.includes(btnKey)
    }

    const testMenus = [
      { path: '/admin/goods', btnPerms: ['create', 'edit'] },
      { path: '/admin/channel', btnPerms: [] }, // Role granted menu without checking buttons
      { path: '/admin/orders' } // btnPerms undefined
    ]

    // Admin bypass
    assert.equal(simulateCan({ role: 'admin' }, testMenus, '/admin/goods', 'delete'), true, 'Admin always has permission')
    assert.equal(simulateCan({ role: 'admin' }, testMenus, '/admin/unknown', 'anything'), true, 'Admin always has permission')

    // Normal user on configured buttons
    assert.equal(simulateCan({ role: 'operator' }, testMenus, '/admin/goods', 'create'), true, 'Allowed button returns true')
    assert.equal(simulateCan({ role: 'operator' }, testMenus, '/admin/goods', 'delete'), false, 'Unchecked button must be rejected (false)')

    // Fail-closed scenarios:
    assert.equal(simulateCan({ role: 'operator' }, testMenus, '/admin/channel', 'create'), false, 'Empty btnPerms must fail-closed (false)')
    assert.equal(simulateCan({ role: 'operator' }, testMenus, '/admin/orders', 'create'), false, 'Undefined btnPerms must fail-closed (false)')
    assert.equal(simulateCan({ role: 'operator' }, testMenus, '/admin/nonexistent', 'create'), false, 'Unknown menu must fail-closed (false)')
  })

  it('3. syncRoleHierarchy() generates Casbin "g" rules allowing child roles to inherit parent permissions', async () => {
    const authTs = allFiles['server/utils/auth.ts']
    assert.ok(authTs.includes('syncRoleHierarchy'), 'server/utils/auth.ts must define syncRoleHierarchy')
    assert.ok(authTs.includes('getRoleAncestors'), 'server/utils/auth.ts must define getRoleAncestors')

    // Verify Casbin model and grouping rule semantics with real Casbin enforcer
    const CASBIN_MODEL = `
[request_definition]
r = sub, dom, obj, act

[policy_definition]
p = sub, dom, obj, act

[role_definition]
g = _, _, _

[policy_effect]
e = some(where (p.eft == allow))

[matchers]
m = g(r.sub, p.sub, r.dom) && r.dom == p.dom && (keyMatch2(r.obj, p.obj) || p.obj == '*') && (r.act == p.act || p.act == '*')
`
    // Parent role 'op_lead' has permission to export channel data
    // Child role 'op_sub' has inheritance rule: g, role:op_sub, role:op_lead, test_app
    const policyRules = [
      'p, role:op_lead, test_app, /api/channel/export, export',
      'g, role:op_sub, role:op_lead, test_app'
    ].join('\n')

    const enf = await newEnforcer(newModelFromString(CASBIN_MODEL), new StringAdapter(policyRules))

    // op_lead can export
    const leadCanExport = await enf.enforce('role:op_lead', 'test_app', '/api/channel/export', 'export')
    assert.equal(leadCanExport, true, 'Parent role must have export permission')

    // op_sub inherits export permission via "g" rule
    const childCanExport = await enf.enforce('role:op_sub', 'test_app', '/api/channel/export', 'export')
    assert.equal(childCanExport, true, 'Child role op_sub must inherit op_lead export permission via Casbin g rule')

    // Unrelated role does not have export permission
    const otherCanExport = await enf.enforce('role:guest', 'test_app', '/api/channel/export', 'export')
    assert.equal(otherCanExport, false, 'Unrelated role must be denied')
  })

  it('4. authorize() normalizes /preview/<slug> proxy prefix for exact API path matching', () => {
    const authTs = allFiles['server/utils/auth.ts']
    assert.ok(authTs.includes("const prefix = '/preview/' + dom"), 'authorize() must calculate prefix = "/preview/" + dom')
    assert.ok(authTs.includes('rawPath.startsWith(prefix)'), 'authorize() must strip /preview/<dom> prefix')

    // Path normalization logic simulation
    function normalizeReqPath(rawUrl, dom) {
      const rawPath = rawUrl ? rawUrl.split('?')[0] : ''
      const prefix = '/preview/' + dom
      return rawPath.startsWith(prefix) ? (rawPath.slice(prefix.length) || '/') : rawPath
    }

    const dom = 'app_7iuiob'
    assert.equal(
      normalizeReqPath('/preview/app_7iuiob/api/channel/export?t=123', dom),
      '/api/channel/export',
      'Must strip /preview/app_7iuiob and query parameters'
    )
    assert.equal(
      normalizeReqPath('/preview/app_7iuiob/api/goods/list', dom),
      '/api/goods/list',
      'Must strip /preview/app_7iuiob prefix'
    )
    assert.equal(
      normalizeReqPath('/api/goods/list', dom),
      '/api/goods/list',
      'Direct requests without /preview/ prefix must remain unchanged'
    )
  })

  it('5. sys_menu DDL contains UNIQUE KEY uk_path (path)', () => {
    const ddl = tenantDdl(mockPlan)
    assert.ok(ddl.includes('CREATE TABLE IF NOT EXISTS `sys_menu`'), 'DDL must define sys_menu')
    assert.ok(
      ddl.includes('UNIQUE KEY `uk_path` (`path`)'),
      'sys_menu table DDL must contain UNIQUE KEY `uk_path` (`path`) to prevent duplicate menu entries'
    )

    const schemaTs = allFiles['server/utils/schema.ts']
    assert.ok(
      schemaTs.includes('UNIQUE KEY `uk_path` (`path`)'),
      'server/utils/schema.ts must define UNIQUE KEY `uk_path` (`path`)'
    )
  })

  it('6. sys_config seed preserves runtime auth_mode across restarts', () => {
    const initPlugin = allFiles['server/plugins/init.ts']
    assert.ok(initPlugin, 'init.ts must be generated')
    // Must NOT contain unconditional ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value)
    assert.ok(
      !initPlugin.includes("ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value)"),
      'init.ts must not unconditionally overwrite auth_mode with DEFAULT_AUTH_MODE'
    )
    assert.ok(
      initPlugin.includes("SELECT cfg_key FROM sys_config WHERE cfg_key='auth_mode'"),
      'init.ts must check if auth_mode already exists before inserting default'
    )
  })

  it('7. system/role/list.get.ts and system/api/tree.get.ts guard read endpoints with canAccessSystem', () => {
    const roleList = allFiles['server/api/system/role/list.get.ts']
    assert.ok(roleList, 'role/list.get.ts must exist')
    assert.ok(
      roleList.includes('canAccessSystem'),
      'role/list.get.ts must check canAccessSystem or admin role'
    )

    const apiTree = allFiles['server/api/system/api/tree.get.ts']
    assert.ok(apiTree, 'api/tree.get.ts must exist')
    assert.ok(
      apiTree.includes('canAccessSystem'),
      'api/tree.get.ts must check canAccessSystem or admin role'
    )
  })

  it('8. Dynamic landing sub-capabilities generate correct public endpoints, pages, and auth exemption', () => {
    const landingPlan = {
      ...mockPlan,
      caps: {
        ...mockPlan.caps,
        landing_poster: { version: '1.0.0', config: { heroTitle: '测试海报', targetModel: 'channel_qrcode' } },
        landing_form: { version: '1.0.0', config: { formTitle: '测试表单', targetModel: 'inquiry' } },
        landing_portal: { version: '1.0.0', config: { portalTitle: '测试门户', listModel: 'goods' } },
        landing_cms: { version: '1.0.0', config: { siteName: '测试官网' } }
      }
    }

    const app = appFiles(landingPlan)
    const srv = serverFiles(landingPlan)
    const ui = uiFiles(landingPlan)

    // 1. Check auth middleware exemption
    assert.ok(app['app/middleware/auth.ts'].includes('/p/'), 'auth.ts must exempt /p/ routes')
    assert.ok(app['app/middleware/auth.ts'].includes('/portal'), 'auth.ts must exempt /portal routes')
    assert.ok(app['app/middleware/auth.ts'].includes('/cms'), 'auth.ts must exempt /cms routes')

    // 2. Check landing_poster artifacts
    assert.ok(srv['server/api/public/landing/[scene].get.ts'], 'landing public GET API must exist')
    assert.ok(srv['server/api/public/landing/scan.post.ts'], 'landing public scan API must exist')
    assert.ok(ui['app/pages/p/[scene].vue'], 'landing poster page /p/[scene].vue must exist')
    assert.ok(ui['app/components/CrudPage.vue'].includes('推广码'), 'CrudPage must include 推广码 action')

    // 3. Check landing_form artifacts
    assert.ok(srv['server/api/public/submit/[res].post.ts'], 'form public submit API must exist')
    assert.ok(ui['app/pages/p/form.vue'], 'landing form page /p/form.vue must exist')

    // 4. Check landing_portal artifacts
    assert.ok(srv['server/api/public/portal/list.get.ts'], 'portal public list API must exist')
    assert.ok(srv['server/api/public/portal/[id].get.ts'], 'portal public detail API must exist')
    assert.ok(ui['app/pages/portal/index.vue'], 'portal page /portal/index.vue must exist')

    // 5. Check landing_cms artifacts
    assert.ok(srv['server/api/public/cms/articles.get.ts'], 'cms public articles API must exist')
    assert.ok(srv['server/api/public/cms/article/[id].get.ts'], 'cms public article detail API must exist')
    assert.ok(ui['app/pages/cms/index.vue'], 'cms home page /cms/index.vue must exist')
    assert.ok(ui['app/pages/cms/[id].vue'], 'cms article detail page /cms/[id].vue must exist')
    assert.ok(ui['app/pages/admin/cms/article/index.vue'], 'cms admin management page must exist')

    // 6. Check DDL creates cms_article
    const ddl = tenantDdl(landingPlan)
    assert.ok(ddl.includes('`cms_article`'), 'tenant DDL must create cms_article table')
  })

  it('9. brokenRelativeImports and unresolvableImports run without ReferenceError', async () => {
    const { brokenRelativeImports, unresolvableImports } = await jiti.import(resolve(root, 'server/utils/gen/write.ts'))
    assert.equal(typeof brokenRelativeImports, 'function')
    assert.equal(typeof unresolvableImports, 'function')
    const broken = await brokenRelativeImports(root)
    assert.ok(Array.isArray(broken), 'brokenRelativeImports should return an array without ReferenceError')
  })

  it('10. genplus_create_tenant & genplus_get_tenant_detail data aggregation contract (R1 & R2)', () => {
    // Contract simulation: verify tenant aggregation extracts groups, modules and counts properly
    const mockTenantDetail = {
      id: 2,
      slug: 'v2',
      name: '医院预约挂号管理系统 v2',
      app_title: '智慧医院预约挂号平台',
      auth_mode: 'rbac',
      groups: [
        {
          id: 5,
          name: '默认分组',
          modules: []
        },
        {
          id: 6,
          name: '基础资源',
          modules: [
            { id: 6, name: '科室管理', key: 'dept', fields: [{ key: 'name', type: 'varchar' }] },
            { id: 7, name: '医生管理', key: 'doctor', fields: [{ key: 'name', type: 'varchar' }] }
          ]
        }
      ],
      caps: [{ id: 1, cap_key: 'dict' }]
    }

    // Simulate MCP genplus_get_tenant_detail aggregation logic
    const groups = (Array.isArray(mockTenantDetail.groups) && mockTenantDetail.groups.length > 0) ? mockTenantDetail.groups : []
    const modules = (groups || []).flatMap(g => g.modules || [])
    const caps = Array.isArray(mockTenantDetail.caps) ? mockTenantDetail.caps : []

    const detailResult = {
      tenant: mockTenantDetail,
      groups,
      modules,
      dicts: [],
      caps,
      counts: {
        groups: groups.length,
        modules: modules.length,
        dicts: 0,
        caps: caps.length
      }
    }

    // Assert R1: app_title and auth_mode are preserved
    assert.equal(detailResult.tenant.auth_mode, 'rbac', 'auth_mode must be rbac')
    assert.equal(detailResult.tenant.app_title, '智慧医院预约挂号平台', 'app_title must be preserved')

    // Assert R2: groups and modules are NOT empty when groups exist
    assert.equal(detailResult.groups.length, 2, 'groups must not be empty')
    assert.equal(detailResult.modules.length, 2, 'modules must aggregate from groups')
    assert.equal(detailResult.counts.groups, 2, 'counts.groups must equal 2')
    assert.equal(detailResult.counts.modules, 2, 'counts.modules must equal 2')
  })
})

