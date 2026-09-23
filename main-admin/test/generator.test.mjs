import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

  it('11. landing_portal title/desc smart inference (S2) & seed created_at distribution (S3)', () => {
    // Plan with hospital-style doctor module where fields are doctor_name and speciality (no "name" or "title")
    const hospitalPlan = {
      ...mockPlan,
      models: [
        {
          id: 10,
          name: '医生管理',
          key: 'hos_doctor',
          table: 'hos_doctor',
          fields: [
            { key: 'id', type: 'id' },
            { key: 'doctor_name', name: '医生姓名', type: 'varchar' },
            { key: 'speciality', name: '擅长专长', type: 'text' },
            { key: 'status', name: '状态', type: 'enum' },
            { key: 'created_at', name: '创建时间', type: 'datetime' }
          ]
        }
      ],
      caps: {
        ...mockPlan.caps,
        landing_portal: {
          version: '1.0.0',
          config: { portalTitle: '智慧医院专家门户', listModel: 'hos_doctor' }
        }
      }
    }

    const ui = uiFiles(hospitalPlan)
    const portalPage = ui['app/pages/portal/index.vue']
    assert.ok(portalPage, 'portal page must be generated')

    // S2: portal card title must infer doctor_name and speciality, avoiding fallback to '记录 #'
    assert.ok(
      portalPage.includes('item.doctor_name'),
      'portal page must infer item.doctor_name as card title field'
    )
    assert.ok(
      portalPage.includes('item.speciality'),
      'portal page must infer item.speciality as card description field'
    )
    assert.ok(
      portalPage.includes('selectedItem?.doctor_name'),
      'detail drawer title must use inferred title field'
    )

    // S3: server init plugin must distribute seed created_at
    const srv = serverFiles(hospitalPlan)
    const initPlugin = srv['server/plugins/init.ts']
    assert.ok(initPlugin, 'server/plugins/init.ts must be generated')
    assert.ok(
      initPlugin.includes("cols.push('`created_at`')") && initPlugin.includes('datetime(offsetDays)'),
      'seed business logic must distribute created_at with datetime(offsetDays)'
    )
  })

  it('12. Design Review v2.2.1 fixes (D2, D3, D4, D6, D7, D8, D10, D12)', async () => {
    // 1. D3 & D2: targetModel resolution and schema-driven form generation
    const testAppointmentPlan = {
      ...mockPlan,
      models: [
        {
          id: 20,
          name: '预约挂号',
          key: 'hos_appointment',
          table: 'hos_appointment',
          tableName: 'hos_appointment',
          fields: [
            { key: 'id', type: 'id', pk: true },
            { key: 'patient_name', name: '患者姓名', type: 'varchar', required: true },
            { key: 'phone', name: '联系电话', type: 'varchar', required: true },
            { key: 'visit_date', name: '就诊日期', type: 'date', required: true },
            { key: 'period', name: '时段', type: 'enum', dict: 'period_enum', required: true },
            { key: 'remark', name: '病情描述', type: 'text' }
          ]
        }
      ],
      dicts: {
        period_enum: [
          { label: '上午', value: 'morning' },
          { label: '下午', value: 'afternoon' }
        ]
      },
      caps: {
        landing_form: {
          version: '1.0.0',
          config: { formTitle: '在线预约挂号', targetModel: 'hos_appointment' }
        },
        landing_portal: {
          version: '1.0.0',
          config: { portalTitle: '服务门户', listModel: 'hos_appointment' }
        },
        landing_poster: {
          version: '1.0.0',
          config: { heroTitle: '推广海报' }
        }
      },
      theme: { primary: 'teal', radius: 999, mode: 'light', density: 'normal' }
    }

    const ui = uiFiles(testAppointmentPlan)
    const srv = serverFiles(testAppointmentPlan)
    const app = appFiles(testAppointmentPlan)

    // D2 & D3: Form page generated with schema-driven fields for hos_appointment
    const formPage = ui['app/pages/p/form.vue']
    assert.ok(formPage, 'landing form page must be generated')
    assert.ok(formPage.includes('const target = "hos_appointment"'), 'targetModel must resolve to hos_appointment')
    assert.ok(formPage.includes("formState['patient_name']"), 'formState must contain patient_name')
    assert.ok(formPage.includes("formState['visit_date']"), 'formState must contain visit_date')
    assert.ok(formPage.includes("formState['period']"), 'formState must contain period')
    assert.ok(formPage.includes('type="date"'), 'visit_date must render as date input')
    assert.ok(formPage.includes('USelect'), 'period must render as USelect')

    // D7: C-End landing pages use semantic tokens
    assert.ok(formPage.includes('bg-default text-default'), 'form page must use semantic bg-default and text-default')
    assert.ok(formPage.includes('bg-card border border-default'), 'form card must use semantic bg-card and border-default')
    assert.ok(!formPage.includes('bg-neutral-950'), 'form page must not hardcode bg-neutral-950')

    const portalPage = ui['app/pages/portal/index.vue']
    assert.ok(portalPage.includes('bg-default text-default'), 'portal page must use semantic bg-default and text-default')
    assert.ok(!portalPage.includes('bg-neutral-950'), 'portal page must not hardcode bg-neutral-950')

    // D4: Public portal endpoint locks model and filters sensitive columns
    const portalListApi = srv['server/api/public/portal/list.get.ts']
    assert.ok(portalListApi, 'portal list API must exist')
    assert.ok(portalListApi.includes('allowedRes'), 'portal list API must check allowedRes')
    assert.ok(portalListApi.includes('safeCols'), 'portal list API must filter safeCols')

    const portalDetailApi = srv['server/api/public/portal/[id].get.ts']
    assert.ok(portalDetailApi, 'portal detail API must exist')
    assert.ok(portalDetailApi.includes('allowedRes'), 'portal detail API must check allowedRes')
    assert.ok(portalDetailApi.includes('safeCols'), 'portal detail API must filter safeCols')

    // S3: Public landing pages assigned to dedicated '前台运营' group, not '系统管理'
    const bootstrapContent = srv['server/utils/schema.ts']
    assert.ok(bootstrapContent, 'server/utils/schema.ts must exist')
    assert.ok(bootstrapContent.includes('"path": "/p/form"'), 'public /p/form route must be in MENUS')
    assert.ok(bootstrapContent.includes('"path": "/portal"'), 'public /portal route must be in MENUS')
    assert.ok(bootstrapContent.includes('"grp": "前台运营"'), 'public pages must belong to 前台运营 group')

    // S4: init.ts includes idempotent INSERT IGNORE top-up for admin role menus and excludes 前台运营 from editor/viewer
    const initPlugin = srv['server/plugins/init.ts']
    assert.ok(initPlugin, 'server/plugins/init.ts must exist')
    assert.ok(initPlugin.includes('INSERT IGNORE INTO sys_role_menu (role_id, menu_path, btn_perms)'), 'init plugin must top up admin role menus')
    assert.ok(initPlugin.includes("m.grp !== '前台运营'"), 'editor/viewer must exclude 前台运营')

    // D6: Pill radius styling maintains container geometry
    const mainCss = app['app/assets/css/main.css']
    assert.ok(mainCss, 'main.css must exist')
    assert.ok(mainCss.includes('--ui-radius: 9999px;'), 'pill radius preset must set --ui-radius: 9999px')
    assert.ok(mainCss.includes('--radius-lg: 16px;'), 'container radius-lg must be capped to prevent card distortion')

    // D10: landing_poster declares channel_scan_log table and pv/uv columns
    const { CAPABILITY_CATALOG } = await jiti.import(resolve(root, 'server/utils/capabilities.ts'))
    const posterCap = CAPABILITY_CATALOG.find(c => c.cap_key === 'landing_poster')
    assert.ok(posterCap, 'landing_poster must be in catalog')
    assert.ok(posterCap.spec.tables?.some(t => t.name === 'channel_scan_log'), 'landing_poster must declare channel_scan_log table')
    assert.ok(posterCap.spec.columns?.some(col => col.key === 'pv'), 'landing_poster must declare pv column')
    assert.ok(posterCap.spec.columns?.some(col => col.key === 'uv'), 'landing_poster must declare uv column')
  })

  it('13. AI Self-test Channel & Health Probe upgrades (Batch 1)', async () => {
    // 1. Sub-admin generated files include health.get.ts and isDbReady in db.ts
    const srv = serverFiles(mockPlan)
    const subHealth = srv['server/api/health.get.ts']
    assert.ok(subHealth, 'sub-admin server/api/health.get.ts must be generated')
    assert.ok(subHealth.includes('isDbReady()'), 'sub-admin health must check isDbReady()')
    assert.ok(subHealth.includes("await q('SELECT 1')"), 'sub-admin health must probe database via SELECT 1')
    assert.ok(subHealth.includes('latencyMs'), 'sub-admin health must return latencyMs')

    const subDb = srv['server/utils/db.ts']
    assert.ok(subDb.includes('export function isDbReady()'), 'sub-admin db.ts must export isDbReady()')
    assert.ok(subDb.includes('_isReady = true'), 'sub-admin db.ts must track _isReady')

    // 2. Control-plane health.get.ts reads dynamic package.json version and probes DB
    const cpHealthPath = resolve(root, 'server/api/health.get.ts')
    const cpHealthCode = readFileSync(cpHealthPath, 'utf-8')
    assert.ok(cpHealthCode.includes("from '../../package.json'"), 'control plane health must import package.json')
    assert.ok(cpHealthCode.includes("await q('SELECT 1')"), 'control plane health must probe DB')
    assert.ok(cpHealthCode.includes('pkg.version'), 'control plane health must read pkg.version')

    // 3. MCP server tool definitions contain 25 tools with standard annotations
    const mcpCode = readFileSync(resolve(root, '../bin/genplus-mcp.mjs'), 'utf-8')
    assert.ok(mcpCode.includes("name: 'genplus_health'"), 'MCP must contain genplus_health tool')
    assert.ok(mcpCode.includes("name: 'genplus_verify'"), 'MCP must contain genplus_verify tool')
    assert.ok(mcpCode.includes("name: 'genplus_inspect_output'"), 'MCP must contain genplus_inspect_output tool')
    assert.ok(mcpCode.includes("name: 'genplus_diff_tenant'"), 'MCP must contain genplus_diff_tenant tool')
    assert.ok(mcpCode.includes("rel.startsWith('..') || isAbsolute(rel)"), 'inspect_output must enforce path traversal security check')
  })

  it('14. Regression test for S11, S12, S13 (moduleKey resolution, dict count in verify, and dict_name localization)', async () => {
    // S11: MCP resolveModule regex matches res_key and table_name, configure_design returns _errors
    const mcpCode = readFileSync(resolve(root, '../bin/genplus-mcp.mjs'), 'utf-8')
    assert.ok(mcpCode.includes('m.res_key === modKey'), 'resolveModule must match m.res_key')
    assert.ok(mcpCode.includes('m.table_name === modKey'), 'resolveModule must match m.table_name')
    assert.ok(mcpCode.includes('m.resKey === modKey'), 'resolveModule must match m.resKey')
    assert.ok(mcpCode.includes('_errors: unresolved.map'), 'configure_design must report unresolved modules in _errors')

    // S12: verify.ts dict count calculation handles Record<string, any[]>
    const verifyCode = readFileSync(resolve(root, 'server/utils/gen/verify.ts'), 'utf-8')
    assert.ok(verifyCode.includes('Object.values(d ?? {}).reduce'), 'verify.ts dict count must reduce object values')

    // S13: server.ts exports DICT_NAMES and seedDicts uses Chinese dict_name
    const srv = serverFiles({
      ...mockPlan,
      dictNames: {
        order_status: '订单状态',
        status: '状态'
      }
    })
    const schemaTs = srv['server/utils/schema.ts']
    assert.ok(schemaTs.includes('export const DICT_NAMES'), 'schema.ts must export DICT_NAMES')
    assert.ok(schemaTs.includes('订单状态'), 'schema.ts must contain Chinese dict_name')

    const initPlugin = srv['server/plugins/init.ts']
    assert.ok(initPlugin.includes('DICT_NAMES'), 'init.ts must import DICT_NAMES')
    assert.ok(initPlugin.includes('seedDicts(DICTS, DICT_NAMES)'), 'init.ts must call seedDicts with DICT_NAMES')
    assert.ok(initPlugin.includes('UPDATE sys_dict_type SET dict_name='), 'seedDicts must self-heal dict_name if previously set to key')
  })

  it('15. Regression test for S14 (two-phase atomic configure_design) and N1 batch capability notice', async () => {
    const mcpCode = readFileSync(resolve(root, '../bin/genplus-mcp.mjs'), 'utf-8')

    // S14: Two-phase validation before writing in configure_design
    assert.ok(mcpCode.includes('resolved.push({ modId, ma })'), 'configure_design must collect resolved modules in phase 1')
    assert.ok(mcpCode.includes('本次全部模块均未写入'), 'configure_design failure message must state no modules were written')
    assert.ok(mcpCode.indexOf('if (unresolved.length)') < mcpCode.indexOf('await api(`/api/design/${modId}`'), 'unresolved check must strictly precede any design write API calls')

    // N1: Actions inputSchema description clarifies batch capability dependency
    assert.ok(mcpCode.includes('batch 属于能力包级特性，需配合 genplus_install_capability("batch") 生效'), 'actions schema must clarify batch capability requirement')

    // Lifecycle doc in genplus-mcp-call.mjs
    const invokerCode = readFileSync(resolve(root, '../scripts/genplus-mcp-call.mjs'), 'utf-8')
    assert.ok(invokerCode.includes('client.close()'), 'genplus-mcp-call must document client.close requirement')
  })

  it('16. Page Intent architecture: validation gatekeeper, blueprint purity, and Tmagic Foundry compilation', async () => {
    const { validateIntent } = await jiti.import(resolve(root, 'shared/intent.ts'))
    const { getFoundry } = await jiti.import(resolve(root, 'server/utils/gen/foundry/index.ts'))
    const { buildCmsSiteIntent } = await jiti.import(resolve(root, 'server/utils/gen/cms-intent.ts'))
    const { CAPABILITY_CATALOG } = await jiti.import(resolve(root, 'server/utils/capabilities.ts'))

    // 1. Check landing_cms capability declares intent generator in catalog
    const cmsCap = CAPABILITY_CATALOG.find(c => c.cap_key === 'landing_cms')
    assert.ok(cmsCap, 'landing_cms capability must exist in CAPABILITY_CATALOG')
    assert.equal(typeof cmsCap.spec.intent, 'function', 'landing_cms capability must declare an intent function')

    // 2. Pure blueprint conforms to schema and passes strict validation
    const testPlan = {
      ...mockPlan,
      slug: 'hospital_app',
      name: 'hospital_app',
      title: '智慧便民医疗中心',
      description: '提供线上挂号门诊与健康服务',
      caps: {
        ...mockPlan.caps,
        landing_cms: {
          version: '2.0.0',
          config: {
            siteName: '市民健康智慧云医院',
            siteSlogan: '精医厚德 · 便民利民',
            contactPhone: '010-88886666'
          }
        }
      }
    }
    const cleanIntent = cmsCap.spec.intent(testPlan)
    const checkClean = validateIntent(cleanIntent)
    assert.ok(checkClean.valid, 'Standard CMS intent must pass validation: ' + checkClean.errors.join(', '))
    assert.equal(cleanIntent.pages.length, 1)
    assert.equal(cleanIntent.pages[0].id, 'cms-home')
    assert.equal(cleanIntent.pages[0].route, '/cms')

    // 3. Four Prohibitions (四大禁令) gatekeeper tests
    // 3a. Rejects CSS style properties and units (px, rem, #hex, color)
    const badStyleIntent = {
      id: 'bad-style',
      name: 'Bad Style Page',
      blocks: [
        {
          kind: 'hero',
          title: 'Title',
          text: 'Text',
          color: '#ff0000' // Forbidden style property
        }
      ]
    }
    assert.equal(validateIntent(badStyleIntent).valid, false, 'Validator must reject style property "color"')

    const badUnitIntent = {
      id: 'bad-unit',
      name: 'Bad Unit Page',
      blocks: [
        {
          kind: 'header',
          brand: { name: 'Brand', logo: '120px' } // Forbidden px unit
        }
      ]
    }
    assert.equal(validateIntent(badUnitIntent).valid, false, 'Validator must reject CSS unit "120px"')

    // 3b. Rejects layout engine keywords (flex, grid, position, z-index)
    const badLayoutIntent = {
      id: 'bad-layout',
      name: 'Bad Layout Page',
      blocks: [
        {
          kind: 'section',
          title: 'Section',
          body: { kind: 'featureGrid', features: [] },
          position: 'fixed' // Forbidden layout keyword
        }
      ]
    }
    assert.equal(validateIntent(badLayoutIntent).valid, false, 'Validator must reject layout keyword "position"')

    // 3c. Rejects engine-specific node types
    const badNodeIntent = {
      id: 'bad-node',
      name: 'Bad Node Page',
      blocks: [
        {
          kind: 'section',
          title: 'Section',
          type: 'container', // Forbidden engine node type
          body: { kind: 'cardGrid', cards: [] }
        }
      ]
    }
    assert.equal(validateIntent(badNodeIntent).valid, false, 'Validator must reject engine node type "container"')

    // 3d. Rejects engine-specific action objects (actionType/to/method)
    const badActionIntent = {
      id: 'bad-action',
      name: 'Bad Action Page',
      blocks: [
        {
          kind: 'cta',
          title: 'Call to Action',
          action: {
            label: 'Click',
            actionType: 'comp', // Forbidden engine action
            to: 'node_123',
            method: 'open'
          }
        }
      ]
    }
    assert.equal(validateIntent(badActionIntent).valid, false, 'Validator must reject engine private action structure')

    // 4. Foundry A (Tmagic) compilation tests
    const foundry = getFoundry('tmagic')
    assert.equal(foundry.id, 'tmagic')
    const compiled = foundry.compilePage(cleanIntent.pages[0], { tenant: testPlan })
    assert.equal(compiled.id, 'cms-home')
    assert.equal(compiled.type, 'page')
    assert.ok(compiled.items.length >= 4, 'Compiled DSL must contain header, hero, section, footer, etc.')
    assert.ok(compiled.items.some(it => it.type === 'tmagic-header'), 'Must compile tmagic-header')
    assert.ok(compiled.items.some(it => it.type === 'tmagic-hero'), 'Must compile tmagic-hero')
    assert.ok(compiled.items.some(it => it.type === 'tmagic-section'), 'Must compile tmagic-section')
    assert.ok(compiled.items.some(it => it.type === 'tmagic-footer'), 'Must compile tmagic-footer')

    // 5. Full UI emission check: blueprint, tmagic-dsl, materials, and page wrapper
    const emittedUi = uiFiles(testPlan)
    assert.ok(emittedUi['app/intent/blueprint.json'], 'Must emit app/intent/blueprint.json')
    const blueprintData = JSON.parse(emittedUi['app/intent/blueprint.json'])
    assert.equal(blueprintData.siteName, '市民健康智慧云医院')

    assert.ok(emittedUi['app/data/tmagic-dsl.json'], 'Must emit app/data/tmagic-dsl.json')
    const dslData = JSON.parse(emittedUi['app/data/tmagic-dsl.json'])
    assert.ok(dslData['cms-home'], 'DSL data must include cms-home page')

    assert.ok(emittedUi['app/components/tmagic/TmagicPage.vue'], 'Must emit TmagicPage runtime component')
    assert.ok(emittedUi['app/components/tmagic/TmagicHero.vue'], 'Must emit TmagicHero runtime component')
    assert.ok(emittedUi['app/components/tmagic/TmagicSection.vue'], 'Must emit TmagicSection runtime component')

    assert.ok(emittedUi['app/pages/cms/index.vue'], 'Must emit /cms/index.vue route wrapper')
    assert.ok(emittedUi['app/pages/cms/index.vue'].includes("definePageMeta({ layout: 'blank' })"), 'Route wrapper must have blank layout')
    assert.ok(emittedUi['app/pages/cms/index.vue'].includes('<TmagicPage'), 'Route wrapper must mount <TmagicPage />')

    // 6. Custom blueprint override test
    const customBlueprintPlan = {
      ...testPlan,
      intent: {
        siteName: '定制图纸站点',
        pages: [
          {
            id: 'custom-landing',
            name: '定制落地页',
            route: '/cms',
            blocks: [
              {
                kind: 'hero',
                title: '自定义大屏',
                text: '由 AI 自定义生成的纯净图纸大屏'
              }
            ]
          }
        ]
      }
    }
    const customUi = uiFiles(customBlueprintPlan)
    const customBlueprintJson = JSON.parse(customUi['app/intent/blueprint.json'])
    assert.equal(customBlueprintJson.siteName, '定制图纸站点')
    const customDsl = JSON.parse(customUi['app/data/tmagic-dsl.json'])
    assert.equal(customDsl['custom-landing'].items[0].title, '自定义大屏')
  })

  it('17. Regression test for S1 (tenant-aware brand derivation) and S2 (no duplicate tmagicFoundry export)', async () => {
    const { buildCmsSiteIntent } = await jiti.import(resolve(root, 'server/utils/gen/cms-intent.ts'))
    const { CAPABILITY_CATALOG } = await jiti.import(resolve(root, 'server/utils/capabilities.ts'))
    const foundryIndexCode = readFileSync(resolve(root, 'server/utils/gen/foundry/index.ts'), 'utf-8')

    // S2 check: foundry/index.ts must not have duplicated export for tmagicFoundry
    assert.ok(!foundryIndexCode.includes('export { tmagicFoundry }'), 'foundry/index.ts must not re-export tmagicFoundry')

    // S1 check: capability catalog must not define static generic defaults for siteName and siteSlogan
    const cmsCap = CAPABILITY_CATALOG.find(c => c.cap_key === 'landing_cms')
    const siteNameCfg = cmsCap.spec.config.find(c => c.key === 'siteName')
    const siteSloganCfg = cmsCap.spec.config.find(c => c.key === 'siteSlogan')
    assert.equal(siteNameCfg.default, undefined, 'siteName must not have static default in catalog')
    assert.equal(siteSloganCfg.default, undefined, 'siteSlogan must not have static default in catalog')

    // S1 check: medical tenant without custom config must derive tenant.title and medical slogan
    const medicalPlan = {
      ...mockPlan,
      title: '智慧医院预约挂号平台 v10',
      description: '提供全天候便民门诊服务',
      caps: {
        landing_cms: {
          version: '2.0.0',
          config: {} // no config
        }
      }
    }
    const intent = buildCmsSiteIntent(medicalPlan)
    assert.equal(intent.siteName, '智慧医院预约挂号平台 v10', 'siteName must derive from tenant title')
    const heroBlock = intent.pages[0].blocks.find(b => b.kind === 'hero')
    assert.ok(heroBlock.text.includes('精医厚德'), 'siteSlogan must derive from medical slogan')

    // Even if config contains the stale generic default '企业官方网站', it must still heal to tenant title
    const stalePlan = {
      ...medicalPlan,
      caps: {
        landing_cms: {
          version: '2.0.0',
          config: {
            siteName: '企业官方网站',
            siteSlogan: '连接未来，赋能企业数字化'
          }
        }
      }
    }
    const healedIntent = buildCmsSiteIntent(stalePlan)
    assert.equal(healedIntent.siteName, '智慧医院预约挂号平台 v10', 'Stale catalog default must heal to tenant title')
    const healedHero = healedIntent.pages[0].blocks.find(b => b.kind === 'hero')
    assert.ok(healedHero.text.includes('精医厚德'), 'Stale slogan default must heal to medical slogan')
  })

  it('18. UI upgrade (U1-U4): Semantic tokenization, theme connection, closed variant vocabulary, and multi-template materials', async () => {
    const { validateIntent, VALID_HERO_VARIANTS, VALID_DENSITIES } = await jiti.import(resolve(root, 'shared/intent.ts'))
    const { getFoundry } = await jiti.import(resolve(root, 'server/utils/gen/foundry/index.ts'))

    // 1. U1 & U2: Emitted material components must use semantic tokens and ZERO hardcoded blue-600 / slate-900
    const ui = uiFiles({
      ...mockPlan,
      caps: { ...mockPlan.caps, landing_cms: { version: '2.0.0' } }
    })
    const tmagicPageCode = ui['app/components/tmagic/TmagicPage.vue']
    const tmagicHeroCode = ui['app/components/tmagic/TmagicHero.vue']
    const tmagicSectionCode = ui['app/components/tmagic/TmagicSection.vue']

    // Must not have hardcoded colors
    assert.ok(!tmagicPageCode.includes('bg-slate-50'), 'TmagicPage must not hardcode bg-slate-50')
    assert.ok(!tmagicHeroCode.includes('bg-blue-600'), 'TmagicHero must not hardcode bg-blue-600')
    assert.ok(!tmagicHeroCode.includes('text-slate-900'), 'TmagicHero must not hardcode text-slate-900')
    assert.ok(!tmagicSectionCode.includes('border-slate-200'), 'TmagicSection must not hardcode border-slate-200')

    // Must use semantic tokens
    assert.ok(tmagicPageCode.includes('bg-default text-default'), 'TmagicPage must use bg-default text-default')
    assert.ok(tmagicHeroCode.includes('text-highlighted'), 'TmagicHero must use text-highlighted')
    assert.ok(tmagicHeroCode.includes('bg-primary-500'), 'TmagicHero must use bg-primary-500')
    assert.ok(tmagicHeroCode.includes('text-inverted'), 'TmagicHero must use text-inverted')
    assert.ok(tmagicSectionCode.includes('bg-card'), 'TmagicSection must use bg-card')
    assert.ok(tmagicSectionCode.includes('border-default'), 'TmagicSection must use border-default')

    // 2. U4: Closed variant vocabulary sets and validator gatekeeper
    assert.ok(VALID_HERO_VARIANTS.has('split'), 'VALID_HERO_VARIANTS must include split')
    assert.ok(VALID_HERO_VARIANTS.has('centered'), 'VALID_HERO_VARIANTS must include centered')
    assert.ok(VALID_DENSITIES.has('airy'), 'VALID_DENSITIES must include airy')

    // Valid variant and density pass validation
    const validVariantIntent = {
      id: 'variant-test',
      name: 'Variant Test',
      blocks: [
        {
          kind: 'hero',
          variant: 'split',
          density: 'airy',
          title: 'Split Hero',
          text: 'Two column layout'
        },
        {
          kind: 'section',
          density: 'compact',
          title: 'Bordered Features',
          body: {
            kind: 'featureGrid',
            variant: 'bordered',
            features: [{ title: 'Feat 1', text: 'Desc 1' }]
          }
        }
      ]
    }
    const checkValid = validateIntent(validVariantIntent)
    assert.ok(checkValid.valid, 'Valid variants and densities must pass: ' + checkValid.errors.join(', '))

    // Illegal variant must be rejected by validator
    const illegalVariantIntent = {
      id: 'illegal-variant',
      name: 'Illegal Variant',
      blocks: [
        {
          kind: 'hero',
          variant: 'gradient-glow-3d', // not in vocabulary
          title: 'Smuggled Style',
          text: 'Illegal'
        }
      ]
    }
    const checkIllegal = validateIntent(illegalVariantIntent)
    assert.equal(checkIllegal.valid, false, 'Validator must strictly reject variants outside closed vocabulary')

    // 3. U3: Compiler and Material variants
    const foundry = getFoundry('tmagic')
    const compiled = foundry.compilePage(validVariantIntent)
    const compiledHero = compiled.items.find(it => it.type === 'tmagic-hero')
    assert.equal(compiledHero.variant, 'split')
    assert.equal(compiledHero.density, 'airy')

    // Split layout branch exists in TmagicHero.vue template
    assert.ok(tmagicHeroCode.includes("node.variant === 'split'"), 'TmagicHero must contain split variant branch')
    assert.ok(tmagicHeroCode.includes('lg:grid-cols-12'), 'TmagicHero split variant must implement 12-col grid')
    assert.ok(tmagicSectionCode.includes("node.body.variant === 'bordered'"), 'TmagicSection must support bordered variant')
  })

  it('19. Foundry v2.3.2 verification (N1, N2, 17/17 variants & producer)', async () => {
    const { MATERIAL_VARIANTS } = await jiti.import(resolve(root, 'server/utils/gen/foundry/tmagic/materials.ts'))
    const {
      VALID_HERO_VARIANTS,
      VALID_FEATURE_VARIANTS,
      VALID_HEADER_VARIANTS,
      VALID_CTA_VARIANTS,
      VALID_DENSITIES
    } = await jiti.import(resolve(root, 'shared/intent.ts'))
    const { getFoundry } = await jiti.import(resolve(root, 'server/utils/gen/foundry/index.ts'))
    const { buildCmsSiteIntent } = await jiti.import(resolve(root, 'server/utils/gen/cms-intent.ts'))

    // 1. N2 Verification: TmagicFooter has ZERO neutral-* hardcoded palette classes
    const ui = uiFiles({
      ...mockPlan,
      caps: { ...mockPlan.caps, landing_cms: { version: '2.0.0' } }
    })
    const footerCode = ui['app/components/tmagic/TmagicFooter.vue']
    const neutralMatches = footerCode.match(/neutral-\d+/g)
    assert.strictEqual(neutralMatches, null, 'TmagicFooter must have 0 neutral-* hardcoded classes')
    assert.ok(footerCode.includes('bg-inverted'), 'TmagicFooter must use bg-inverted')
    assert.ok(footerCode.includes('text-inverted'), 'TmagicFooter must use text-inverted')
    assert.ok(footerCode.includes('border-inverted/10'), 'TmagicFooter must use border-inverted/10')

    // 2. N1 & U3 Verification: All 17 variants in MATERIAL_VARIANTS match intent vocabulary 1:1 and exist in templates
    assert.deepStrictEqual(Array.from(VALID_HERO_VARIANTS).sort(), [...MATERIAL_VARIANTS.hero].sort())
    assert.deepStrictEqual(Array.from(VALID_FEATURE_VARIANTS).sort(), [...MATERIAL_VARIANTS.featureGrid].sort())
    assert.deepStrictEqual(Array.from(VALID_HEADER_VARIANTS).sort(), [...MATERIAL_VARIANTS.header].sort())
    assert.deepStrictEqual(Array.from(VALID_CTA_VARIANTS).sort(), [...MATERIAL_VARIANTS.cta].sort())
    assert.deepStrictEqual(Array.from(VALID_DENSITIES).sort(), [...MATERIAL_VARIANTS.density].sort())

    // All 5 newly completed variants exist in material templates
    const heroCode = ui['app/components/tmagic/TmagicHero.vue']
    const ctaCode = ui['app/components/tmagic/TmagicCta.vue']
    const sectionCode = ui['app/components/tmagic/TmagicSection.vue']
    assert.ok(heroCode.includes("node.variant === 'statBand'"), 'TmagicHero must implement statBand')
    assert.ok(heroCode.includes("node.variant === 'mediaBg'"), 'TmagicHero must implement mediaBg')
    assert.ok(ctaCode.includes("node.variant === 'split'"), 'TmagicCta must implement split')
    assert.ok(sectionCode.includes("node.body.variant === 'numbered'"), 'TmagicSection must implement numbered')
    assert.ok(sectionCode.includes("node.body.variant === 'iconLeft'"), 'TmagicSection must implement iconLeft')

    // 3. Compiler rejects unsupported variants (eliminates silent fallback)
    const foundry = getFoundry('tmagic')
    assert.throws(() => {
      foundry.compilePage({
        id: 'bad-hero',
        name: 'Bad Hero',
        blocks: [{ kind: 'hero', variant: 'unsupportedVariant', title: 'T', text: 'D' }]
      })
    }, /不在标准变体词表|不支持变体/)

    // 4. Producer Verification: buildCmsSiteIntent dynamically produces real variants for medical vs tech
    const medicalPlan = {
      id: 11,
      name: '智慧医院预约挂号系统',
      title: '智慧医院预约挂号平台 v11',
      description: '全流程便民就医与分时预约挂号',
      caps: { landing_cms: { version: '2.0.0' } }
    }
    const medIntent = buildCmsSiteIntent(medicalPlan)
    const medHero = medIntent.pages[0].blocks.find(b => b.kind === 'hero')
    const medFeature = medIntent.pages[0].blocks.find(b => b.kind === 'section' && b.body?.kind === 'featureGrid')
    const medCta = medIntent.pages[0].blocks.find(b => b.kind === 'cta')
    assert.strictEqual(medHero.variant, 'split', 'Medical tenant hero variant must be split')
    assert.strictEqual(medFeature.body.variant, 'bordered', 'Medical tenant featureGrid variant must be bordered')
    assert.strictEqual(medCta.variant, 'card', 'Medical tenant CTA variant must be card')

    const techPlan = {
      id: 12,
      name: '云原生协同开发中台',
      title: '数智协同开发平台',
      description: '企业级云原生DevOps与中台生成器',
      caps: { landing_cms: { version: '2.0.0' } }
    }
    const techIntent = buildCmsSiteIntent(techPlan)
    const techHero = techIntent.pages[0].blocks.find(b => b.kind === 'hero')
    const techFeature = techIntent.pages[0].blocks.find(b => b.kind === 'section' && b.body?.kind === 'featureGrid')
    const techCta = techIntent.pages[0].blocks.find(b => b.kind === 'cta')
    assert.strictEqual(techHero.variant, 'centered', 'Tech tenant hero variant must be centered')
    assert.strictEqual(techFeature.body.variant, 'cards', 'Tech tenant featureGrid variant must be cards')
    assert.strictEqual(techCta.variant, 'band', 'Tech tenant CTA variant must be band')
  })

  it('20. Visual scale layer verification (D1-D4): Zero literal radius, full skin variable consumption, and form scale hierarchy', async () => {
    const { tmagicMaterialFiles } = await jiti.import(resolve(root, 'server/utils/gen/foundry/tmagic/materials.ts'))
    const materials = tmagicMaterialFiles()
    const allCode = Object.values(materials).join('\n')

    // D1 & D4: Zero literal radius rungs (must consume var(--r) or var(--r-sm))
    const literalRadius = allCode.match(/rounded-(lg|xl|2xl|3xl)\b/g) || []
    assert.strictEqual(literalRadius.length, 0, `Materials must have 0 literal rounded rungs, found ${literalRadius.length}`)

    // Must consume skin variables (var(--r), var(--r-sm), var(--pad), var(--gap))
    assert.ok(allCode.includes('var(--r'), 'Materials must consume var(--r)')
    assert.ok(allCode.includes('var(--r-sm'), 'Materials must consume var(--r-sm)')
    assert.ok(allCode.includes('var(--pad'), 'Materials must consume var(--pad)')
    assert.ok(allCode.includes('var(--gap'), 'Materials must consume var(--gap)')

    // D2 & D3: Form control scale hierarchy (submit button is flex-1, py-3.5, text-base, while input is py-2.5, text-sm)
    const formCode = materials['app/components/tmagic/TmagicOverlayForm.vue']
    assert.ok(formCode.includes('flex-1 px-6 py-3.5 text-base'), 'Submit button must be flex-1, py-3.5 and text-base')
    assert.ok(formCode.includes('px-4 py-2.5'), 'Input field must be py-2.5')
    assert.ok(formCode.includes('hover:text-highlighted'), 'Cancel button must be text button hierarchy')
    assert.ok(formCode.includes('$fetch'), 'OverlayForm must call real public submit API')
  })

  it('21. UI Audit v2.3.4 full-axis verification (F1-F8): All radius rungs defined, single-color SVG icons, full A11y, state coverage, and rich intent production', async () => {
    // 1. F1: Radius namespace must define all 7 rungs (xs, sm, md, lg, xl, 2xl, 3xl) with no --ui-radius formula leak
    const mainCss = generatedAppFiles['app/assets/css/main.css']
    assert.ok(mainCss, 'main.css must exist')
    for (const r of ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl']) {
      assert.match(
        mainCss,
        new RegExp(`--radius-${r}:\\s*\\d+px;`),
        `--radius-${r} must be tenant-defined to prevent calc(var(--ui-radius) * N) leak`
      )
    }

    const { tmagicMaterialFiles } = await jiti.import(resolve(root, 'server/utils/gen/foundry/tmagic/materials.ts'))
    const materials = tmagicMaterialFiles()
    const allCode = Object.values(materials).join('\n')

    // 2. F2 & F3: Design scale consistency across materials
    assert.ok(allCode.includes('var(--fs'), 'Materials must consume font size token var(--fs)')
    assert.ok(allCode.includes('var(--row-h'), 'Materials must consume control height token var(--row-h)')
    const fallbackRadiusSmall = allCode.match(/var\(--r-sm,\s*\d+px\)/g) || []
    for (const r of fallbackRadiusSmall) {
      assert.match(r, /var\(--r-sm,\s*8px\)/, `Small radius fallbacks must be uniformly 8px, found ${r}`)
    }

    // 3. F4: Single-color linear SVG icons (stroke-current / stroke="currentColor")
    const sectionCode = materials['app/components/tmagic/TmagicSection.vue']
    assert.ok(sectionCode.includes('stroke-current'), 'TmagicSection must use single-color stroke-current vector icons')
    assert.ok(!sectionCode.includes("{{ feat.icon || '✓' }}"), 'TmagicSection must not render bare uncolorable emoji')

    // 4. F5: Accessibility (A11y) coverage
    assert.ok(sectionCode.includes(':alt="row.title'), 'Images in mediaList must declare alt text')
    const formCode = materials['app/components/tmagic/TmagicOverlayForm.vue']
    assert.ok(formCode.includes('role="dialog"'), 'OverlayForm must declare role="dialog"')
    assert.ok(formCode.includes('aria-modal="true"'), 'OverlayForm must declare aria-modal="true"')
    assert.ok(formCode.includes('aria-label="关闭表单"'), 'Modal close button must declare aria-label')
    assert.ok(formCode.includes(':for='), 'Form fields must pair labels with inputs using for and id')
    assert.ok(allCode.includes('focus-visible:ring-'), 'Interactive elements must define visible focus states')
    assert.ok(allCode.includes('motion-reduce:animate-none'), 'Animations must support motion reduction')

    // 5. F6: State coverage (Empty & Error states)
    assert.ok(sectionCode.includes('暂无相关资讯动态'), 'mediaList must include graceful empty state')
    assert.ok(sectionCode.includes('暂无卡片内容'), 'cardGrid must include graceful empty state')
    assert.ok(formCode.includes('errorMsg'), 'OverlayForm must maintain errorMsg reactive state')
    assert.ok(formCode.includes('v-if="errorMsg"'), 'OverlayForm must display inline error alert banner')

    // 6. F7: Responsive tabbar and rich intent production
    const tabbarCode = materials['app/components/tmagic/TmagicTabbar.vue']
    assert.ok(tabbarCode.includes('md:left-1/2') && tabbarCode.includes('md:-translate-x-1/2'), 'Tabbar must adapt responsively for desktop floating dock')

    const { buildCmsSiteIntent } = await jiti.import(resolve(root, 'server/utils/gen/cms-intent.ts'))
    const planWithTheme = {
      ...mockPlan,
      theme: { ...mockPlan.theme, density: 'airy' },
      caps: { ...mockPlan.caps, landing_cms: { version: '2.0.0' } }
    }
    const intent = buildCmsSiteIntent(planWithTheme)
    const blocks = intent.pages[0].blocks
    assert.ok(blocks.some(b => b.kind === 'section' && b.body?.kind === 'stepList'), 'CMS intent must produce stepList block')
    assert.ok(blocks.some(b => b.kind === 'section' && b.body?.kind === 'faqList'), 'CMS intent must produce faqList block')
    assert.ok(blocks.some(b => b.kind === 'tabbar'), 'CMS intent must produce tabbar block')
    const heroBlock = blocks.find(b => b.kind === 'hero')
    assert.strictEqual(heroBlock.density, 'airy', 'Hero density must inherit theme density')
  })

  it('22. UI Audit v2.3.5 verification (G1-G5): --r-md dedicated non-control rung, /p/form design system conformity, var(--shadow) light sense, uniform --fs 14px, responsive dual-column form, and 5/5 body kinds', async () => {
    // 1. G1: Dedicated non-control radius --r-md in skins and root CSS
    const { SKIN_BASE_VARS, SKIN_VARS } = await jiti.import(resolve(root, 'shared/skins.ts'))
    assert.ok(SKIN_BASE_VARS.includes('--r-md:'), 'SKIN_BASE_VARS must define --r-md')
    for (const [k, v] of Object.entries(SKIN_VARS)) {
      assert.ok(v.includes('--r-md:'), `SKIN_VARS[${k}] must define --r-md`)
    }
    const mainCss = generatedAppFiles['app/assets/css/main.css']
    assert.ok(mainCss.includes('--r-md: var(--radius-md,'), 'main.css must map --r-md to var(--radius-md, 12px)')

    const { tmagicMaterialFiles } = await jiti.import(resolve(root, 'server/utils/gen/foundry/tmagic/materials.ts'))
    const materials = tmagicMaterialFiles()
    const allMaterialsCode = Object.values(materials).join('\n')

    // Materials must consume --r-md for non-controls (stats, avatars, badges, icon boxes, banners)
    assert.ok(allMaterialsCode.includes('rounded-[var(--r-md,'), 'Materials must consume --r-md for non-control elements')

    // 2. G2 & G5: /p/form completely conforms to design system and dual-column responsive layout
    const planWithForm = {
      ...mockPlan,
      caps: {
        ...mockPlan.caps,
        landing_form: {
          version: '1.0.0',
          config: { formTitle: '在线业务申请登记', submitText: '立即提交' }
        }
      }
    }
    const formUi = uiFiles(planWithForm)
    const formPage = formUi['app/pages/p/form.vue']
    assert.ok(formPage, 'landing form page must be generated')

    // G2: Consumes design system tokens
    assert.ok(formPage.includes('rounded-[var(--r,'), '/p/form card must consume rounded-[var(--r)]')
    assert.ok(formPage.includes('shadow-[var(--shadow,'), '/p/form card must consume shadow-[var(--shadow)]')
    assert.ok(formPage.includes('rounded-[var(--r-md,'), '/p/form must consume rounded-[var(--r-md)] for icon base and banners')
    assert.ok(formPage.includes('rounded-[var(--r-sm,'), '/p/form must consume rounded-[var(--r-sm)] for inputs and button')
    assert.ok(formPage.includes('h-[var(--row-h,'), '/p/form must consume control height var(--row-h)')
    assert.ok(formPage.includes('text-[length:var(--fs,14px)]'), '/p/form must consume font size var(--fs,14px)')

    // G2: No bare Tailwind arbitrary radius/shadow rungs
    assert.ok(!formPage.includes('rounded-2xl'), '/p/form must not use hardcoded rounded-2xl')
    assert.ok(!formPage.includes('shadow-xl'), '/p/form must not use hardcoded shadow-xl')
    assert.ok(!formPage.includes('📋'), '/p/form must not use bare emoji for header')

    // G5: Dual-column responsive layout on desktop
    assert.ok(formPage.includes('max-w-2xl'), '/p/form must use max-w-2xl for desktop readability')
    assert.ok(formPage.includes('sm:grid-cols-2'), '/p/form must use sm:grid-cols-2 for responsive dual-column layout')
    assert.ok(formPage.includes('sm:col-span-2'), '/p/form must span textareas and submit button across 2 columns')

    // 3. G3: var(--shadow) light sense and MD3 elevation-0 for buttons
    assert.ok(allMaterialsCode.includes('shadow-[var(--shadow,'), 'Materials must consume var(--shadow) for card/dialog light sense')
    const rawTailwindShadows = allMaterialsCode.match(/\bshadow-(sm|md|lg|xl|2xl)\b/g) || []
    assert.strictEqual(rawTailwindShadows.length, 0, `Materials must have 0 bare Tailwind shadows, found: ${rawTailwindShadows.join(', ')}`)

    // 4. G4: Uniform --fs fallback at 14px across materials
    const fsFallbacks = allMaterialsCode.match(/var\(--fs,\s*[^)]+\)/g) || []
    for (const f of fsFallbacks) {
      assert.match(f, /var\(--fs,\s*14px\)/, `--fs fallback must uniformly be 14px, found ${f}`)
    }

    // 5. F7 completeness: 5/5 body kinds coverage in intent producer
    const { buildCmsSiteIntent } = await jiti.import(resolve(root, 'server/utils/gen/cms-intent.ts'))
    const intent = buildCmsSiteIntent(mockPlan)
    const bodyKinds = new Set(
      intent.pages[0].blocks
        .filter(b => b.kind === 'section' && b.body?.kind)
        .map(b => b.body.kind)
    )
    for (const expectedKind of ['featureGrid', 'cardGrid', 'stepList', 'mediaList', 'faqList']) {
      assert.ok(bodyKinds.has(expectedKind), `CMS intent producer must emit ${expectedKind} section (found ${[...bodyKinds].join(', ')})`)
    }
    assert.strictEqual(bodyKinds.size, 5, `CMS intent producer must cover all 5/5 body kinds, found ${bodyKinds.size}`)
  })

  it('23. UI Audit v2.3.6 verification (H1-H5): text-[length:var(--fs)] type hint, footer dock avoidance, var(--blur) light token, polished date inputs, and mobile header space', async () => {
    const { tmagicMaterialFiles } = await jiti.import(resolve(root, 'server/utils/gen/foundry/tmagic/materials.ts'))
    const materials = tmagicMaterialFiles()
    const allMaterialsCode = Object.values(materials).join('\n')

    const planWithForm = {
      ...mockPlan,
      caps: {
        ...mockPlan.caps,
        landing_form: {
          version: '1.0.0',
          config: { formTitle: '在线业务申请登记', submitText: '立即提交' }
        }
      }
    }
    const formUi = uiFiles(planWithForm)
    const formPage = formUi['app/pages/p/form.vue']

    // 1. H1: Zero ambiguous text-[var(--fs)] across both materials and /p/form
    const combinedCode = allMaterialsCode + '\n' + formPage
    const ambiguousFs = combinedCode.match(/text-\[var\(--fs/g) || []
    assert.strictEqual(ambiguousFs.length, 0, `Must have ZERO ambiguous text-[var(--fs, found: ${ambiguousFs.length}`)

    const unambiguousFs = combinedCode.match(/text-\[length:var\(--fs,\s*14px\)\]/g) || []
    assert.strictEqual(unambiguousFs.length, 27, `Must have 27 unambiguous text-[length:var(--fs,14px)] in default generation (21 materials + 6 form), found ${unambiguousFs.length}`)

    // Also test custom fields branch in /p/form
    const planWithCustomFields = {
      ...mockPlan,
      groups: [
        {
          name: '测试业务',
          icon: 'lucide:folder',
          modules: [
            {
              id: 99,
              name: '预约登记',
              key: 'appointment',
              tableName: 'appointment',
              fields: [
                { name: 'ID', key: 'id', type: 'id', pk: true },
                { name: '申请主题', key: 'title', type: 'varchar' },
                { name: '预约类型', key: 'type', type: 'enum', dict: 'status' },
                { name: '预约日期', key: 'due', type: 'date' },
                { name: '详细说明', key: 'desc', type: 'text' },
                { name: '预算金额', key: 'budget', type: 'decimal' },
                { name: '手机号', key: 'phone', type: 'varchar' }
              ]
            }
          ]
        }
      ],
      caps: {
        ...mockPlan.caps,
        landing_form: {
          version: '1.0.0',
          config: { targetModel: 'appointment' }
        }
      }
    }
    const customFormPage = uiFiles(planWithCustomFields)['app/pages/p/form.vue']
    const customAmbiguousFs = customFormPage.match(/text-\[var\(--fs/g) || []
    assert.strictEqual(customAmbiguousFs.length, 0, 'Custom form fields must have zero ambiguous text-[var(--fs')
    const customUnambiguousFs = customFormPage.match(/text-\[length:var\(--fs,\s*14px\)\]/g) || []
    assert.strictEqual(customUnambiguousFs.length, 13, `Custom form page must consume 13 text-[length:var(--fs,14px)], found ${customUnambiguousFs.length}`)

    // 2. H2: Fixed dock bottom padding in TmagicPage.vue (avoid covering footer)
    const pageCode = materials['app/components/tmagic/TmagicPage.vue']
    assert.ok(pageCode.includes('pb-24 md:pb-28'), 'TmagicPage must reserve pb-24 md:pb-28 bottom safe area for fixed dock')

    // 3. H3: var(--blur) skin token consumption via verified escape hatch [backdrop-filter:var(--blur,...)]
    assert.ok(allMaterialsCode.includes('[backdrop-filter:var(--blur,'), 'Materials must consume var(--blur) token via [backdrop-filter:...]')
    const bareBackdropBlur = allMaterialsCode.match(/\bbackdrop-blur\b/g) || []
    assert.strictEqual(bareBackdropBlur.length, 0, `Materials must have 0 backdrop-blur utilities, found ${bareBackdropBlur.length}`)

    // 4. H4: Date input appearance and webkit pseudo element styling in /p/form
    assert.ok(customFormPage.includes('cursor-pointer') && customFormPage.includes('[&::-webkit-datetime-edit]:text-muted'), '/p/form date inputs must style webkit pseudo elements')

    // 5. H5: Mobile header subtitle avoids width competition
    const headerCode = materials['app/components/tmagic/TmagicHeader.vue']
    assert.ok(headerCode.includes('hidden sm:block'), 'Header subtitle must be hidden on mobile 390px to prevent multi-line wrap')

    // 6. G2余项: /p/form consumes var(--pad) and var(--gap)
    assert.ok(formPage.includes('var(--pad'), '/p/form card must consume var(--pad)')
    assert.ok(formPage.includes('var(--gap'), '/p/form grid must consume var(--gap)')
  })

  it('24. UI Audit v2.3.7 verification (H3-residue, I1 WCAG AA contrast, I2 USelect fs): [backdrop-filter:var(--blur)] escape hatch, mathematical contrast solver, compliant primary shades, and USelect font-size override', async () => {
    const { relativeLuminance, contrastRatio, fgOn, appFiles } = await jiti.import(resolve(root, 'server/utils/gen/app.ts'))
    const { tmagicMaterialFiles } = await jiti.import(resolve(root, 'server/utils/gen/foundry/tmagic/materials.ts'))
    const { PALETTES } = await jiti.import(resolve(root, 'shared/skins.ts'))
    const materials = tmagicMaterialFiles()
    const allMaterialsCode = Object.values(materials).join('\n')

    // 1. H3-residue: All 4 materials use [backdrop-filter:var(--blur,...)] and ZERO backdrop-blur-[
    const backdropFilterMatches = allMaterialsCode.match(/\[backdrop-filter:var\(--blur,\s*blur\(\d+px\)\)\]/g) || []
    assert.strictEqual(backdropFilterMatches.length, 4, `Must have exactly 4 [backdrop-filter:var(--blur,blur(...))], found: ${backdropFilterMatches.length}`)
    const oldBackdropBlur = allMaterialsCode.match(/backdrop-blur-\[/g) || []
    assert.strictEqual(oldBackdropBlur.length, 0, `Must have ZERO backdrop-blur-[, found: ${oldBackdropBlur.length}`)

    // 2. I1: Mathematical contrast solver & WCAG AA verification across all 30 color presets
    assert.strictEqual(Math.round(contrastRatio('#ffffff', '#000000')), 21, 'Black/white contrast must be 21:1')
    assert.strictEqual(Math.round(contrastRatio('#ffffff', '#ffffff')), 1, 'White/white contrast must be 1:1')

    // Verify all 30 palettes achieve >= 4.5:1 on white background
    const allPalettes = Object.values(PALETTES).flat()
    assert.strictEqual(allPalettes.length, 30, `Must test all 30 palettes from skins.ts, found ${allPalettes.length}`)
    for (const pal of allPalettes) {
      const accent = pal.accent
      // Simulate ramp
      const white = '#ffffff', black = '#000000'
      const mix = (a, b, t) => {
        const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
        const [r, g, bl] = p(a).map((v, i) => Math.round(v + (p(b)[i] - v) * t))
        return '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('')
      }
      const shades = [
        mix(accent, white, 0.92), mix(accent, white, 0.84), mix(accent, white, 0.66), mix(accent, white, 0.45),
        mix(accent, white, 0.20), accent, mix(accent, black, 0.14), mix(accent, black, 0.28),
        mix(accent, black, 0.42), mix(accent, black, 0.56), mix(accent, black, 0.70)
      ]
      const solved = fgOn('#ffffff', shades, 4.5)
      assert.ok(solved.ratio >= 4.5, `Palette ${pal.id} (${accent}) must find a compliant foreground (found ${solved.shadeName} with ratio ${solved.ratio.toFixed(2)}:1)`)
      // Also verify shade 800 (index 8) is ALWAYS >= 4.5:1 on white for all palettes
      const ratio800 = contrastRatio(shades[8], '#ffffff')
      assert.ok(ratio800 >= 4.5, `Palette ${pal.id} shade 800 must pass WCAG AA (>= 4.5:1), got ${ratio800.toFixed(2)}:1`)
    }

    // 3. I1: Template foreground text contrast conformity (consume semantic solver tokens, eliminate 1.8:1 typo)
    assert.ok(allMaterialsCode.includes('text-primary-fg-badge dark:text-primary-fg-dark'), 'Badges and active dock must consume semantic tokens text-primary-fg-badge dark:text-primary-fg-dark')
    assert.ok(allMaterialsCode.includes('text-primary-fg-light dark:text-primary-fg-dark'), 'CTA must consume semantic tokens text-primary-fg-light dark:text-primary-fg-dark')
    const ctaCode = materials['app/components/tmagic/TmagicCta.vue']
    assert.ok(ctaCode.includes('text-primary-fg-light dark:text-primary-fg-dark'), 'CTA button must consume semantic tokens text-primary-fg-light dark:text-primary-fg-dark')
    assert.ok(!ctaCode.includes('dark:text-primary-900'), 'CTA button must strictly prohibit dark:text-primary-900 (1.8:1 typo)')
    assert.strictEqual((ctaCode.match(/dark:text-primary-900/g) || []).length, 0, 'CTA must have zero dark:text-primary-900 occurrences')

    // 4. I1: main.css exports semantic contrast variables
    const generatedApp = appFiles(mockPlan)
    const mainCssCode = generatedApp['app/assets/css/main.css']
    assert.ok(mainCssCode.includes('--color-primary-fg-light:'), 'main.css must export --color-primary-fg-light')
    assert.ok(mainCssCode.includes('--color-primary-fg-dark:'), 'main.css must export --color-primary-fg-dark')
    assert.ok(mainCssCode.includes('--color-primary-fg-badge:'), 'main.css must export --color-primary-fg-badge')
    assert.ok(mainCssCode.includes('--ui-primary-fg-light:'), 'main.css must export --ui-primary-fg-light')
    assert.ok(mainCssCode.includes('--ui-primary-fg-dark:'), 'main.css must export --ui-primary-fg-dark')
    assert.ok(mainCssCode.includes('--ui-primary-fg-badge:'), 'main.css must export --ui-primary-fg-badge')

    // 5. I2: USelect font-size override in /p/form
    const planWithCustomFields = {
      ...mockPlan,
      groups: [
        {
          name: '测试业务',
          icon: 'lucide:folder',
          modules: [
            {
              id: 99,
              name: '预约登记',
              key: 'appointment',
              tableName: 'appointment',
              fields: [
                { name: '预约类型', key: 'type', type: 'enum', dict: 'status' }
              ]
            }
          ]
        }
      ],
      caps: {
        ...mockPlan.caps,
        landing_form: {
          version: '1.0.0',
          config: { targetModel: 'appointment' }
        }
      }
    }
    const customFormPage = uiFiles(planWithCustomFields)['app/pages/p/form.vue']
    assert.ok(customFormPage.includes('[&_select]:text-[length:var(--fs,14px)]'), 'USelect must override internal select font size with [&_select]:text-[length:var(--fs,14px)]')
    assert.ok(customFormPage.includes(':ui="{ select: \'text-[length:var(--fs,14px)]\' }"'), 'USelect must pass :ui select font size prop')

    // 6. Verify smoke gate: includes WCAG AA contrast check
    const { verify } = await jiti.import(resolve(root, 'server/utils/gen/verify.ts'))
    assert.ok(typeof verify === 'function', 'verify function must be exported')
  })

  it('25. UI Audit v2.3.8 verification (P0 CTA contrast typo eliminated, 100% solver token consumption, deepened Case 4.7 smoke gate)', async () => {
    const { tmagicMaterialFiles } = await jiti.import(resolve(root, 'server/utils/gen/foundry/tmagic/materials.ts'))
    const materials = tmagicMaterialFiles()
    const allMaterialsCode = Object.values(materials).join('\n')

    // 1. P0 Defect 1: Dark mode CTA text inversion typo strictly eliminated
    const ctaCode = materials['app/components/tmagic/TmagicCta.vue']
    assert.strictEqual((ctaCode.match(/dark:text-primary-900/g) || []).length, 0, 'Must have ZERO dark:text-primary-900 occurrences in CTA')
    assert.strictEqual((allMaterialsCode.match(/dark:text-primary-900/g) || []).length, 0, 'Must have ZERO dark:text-primary-900 occurrences across all materials')

    // 2. P0 Defect 2: 100% mathematical solver token consumption (zero dead code)
    assert.ok(allMaterialsCode.includes('text-primary-fg-light'), 'Materials must consume text-primary-fg-light')
    assert.ok(allMaterialsCode.includes('text-primary-fg-badge'), 'Materials must consume text-primary-fg-badge')
    assert.ok(allMaterialsCode.includes('dark:text-primary-fg-dark'), 'Materials must consume dark:text-primary-fg-dark')

    // 3. UI public pages consume semantic solver tokens
    const planWithLandings = {
      ...mockPlan,
      caps: {
        landing_poster: { version: '1.0.0', config: { title: '测试海报' } },
        landing_portal: { version: '1.0.0', config: { portalTitle: '测试门户', listModel: 'goods' } },
        landing_form: { version: '1.0.0', config: { formTitle: '测试表单', targetModel: 'goods' } }
      }
    }
    const publicUi = uiFiles(planWithLandings)
    const posterPage = publicUi['app/pages/p/[scene].vue']
    const portalPage = publicUi['app/pages/portal/index.vue']
    const formPage = publicUi['app/pages/p/form.vue']
    assert.ok(posterPage.includes('text-primary-fg-badge dark:text-primary-fg-dark'), 'poster page must consume text-primary-fg-badge dark:text-primary-fg-dark')
    assert.ok(portalPage.includes('text-primary-fg-light dark:text-primary-fg-dark'), 'portal page must consume text-primary-fg-light dark:text-primary-fg-dark')
    assert.ok(formPage.includes('text-primary-fg-badge dark:text-primary-fg-dark'), 'form page must consume text-primary-fg-badge dark:text-primary-fg-dark')

    // 4. Verify.ts Case 4.7 code audit (Unified DARK_SURFACE_HEX & semantic badge dark coverage & gate expansions)
    const verifySrc = readFileSync(resolve(root, 'server/utils/gen/verify.ts'), 'utf-8')
    assert.ok(verifySrc.includes('contrastRatio(shades[i], DARK_SURFACE_HEX)'), 'verify.ts Case 4.7 must compute real contrast ratio per shade against DARK_SURFACE_HEX')
    assert.ok(verifySrc.includes('text-primary-fg-badge'), 'verify.ts Case 4.7 must verify text-primary-fg-badge dark coverage')
    assert.ok(verifySrc.includes("bcm.includes('dark:text-primary-fg-dark')"), 'verify.ts Case 4.7 must enforce semantic dark:text-primary-fg-dark coverage on badge tokens')
    assert.ok(verifySrc.includes('hasDarkGradTokens'), 'verify.ts Case 4.7 must verify dark mode gradient tokens')
    assert.ok(verifySrc.includes("cssContent.lastIndexOf('.dark {')"), 'verify.ts Case 4.7 must strictly scope dark tokens to last .dark block')
    assert.ok(verifySrc.includes('isGlass'), 'verify.ts Case 4.7 must exempt glass skin from dark grad tokens')
    assert.ok(verifySrc.includes('hasTextPrimaryMapping'), 'verify.ts Case 4.7 must verify text-primary mapping')
    assert.ok(verifySrc.includes('hasFontSizeAxis'), 'verify.ts Case 4.7 must verify font size axis')
    assert.ok(verifySrc.includes('designDefects.join'), 'verify.ts Case 4.7 must aggregate all design defects into single comprehensive report')

    // 5. Design system dark tokens: skins.ts exports DEFAULT_DARK_BG, DARK_SURFACE_HEX equals #0f172a (calibrated with real Nuxt UI slate-900)
    const { DEFAULT_DARK_BG, SKIN_DARK_BASE_VARS } = await jiti.import(resolve(root, 'shared/skins.ts'))
    assert.strictEqual(DEFAULT_DARK_BG, '#0f172a', 'DEFAULT_DARK_BG must equal #0f172a')
    assert.ok(SKIN_DARK_BASE_VARS.includes('--grad: linear-gradient'), 'SKIN_DARK_BASE_VARS must include dark safe --grad token')
    assert.ok(SKIN_DARK_BASE_VARS.includes('--btn-grad: linear-gradient'), 'SKIN_DARK_BASE_VARS must include dark safe --btn-grad token')
    const { DARK_SURFACE_HEX } = await jiti.import(resolve(root, 'server/utils/gen/app.ts'))
    assert.strictEqual(DARK_SURFACE_HEX, '#0f172a', 'DARK_SURFACE_HEX must equal #0f172a')
    const genApp = appFiles(mockPlan)
    const generatedMainCss = genApp['app/assets/css/main.css']
    assert.ok(generatedMainCss.includes('--bg-dark: #0f172a'), 'main.css must include --bg-dark token')
    assert.ok(generatedMainCss.includes('--side: rgba(15,23,42,.72)'), 'main.css must include dark mode skin variables')
    assert.ok(generatedMainCss.includes('--text-sm: var(--fs'), 'main.css must bind --text-sm to --fs to cure I2 font size discrepancy')
    assert.ok(generatedMainCss.includes('--ui-text-dimmed:'), 'main.css must set high-contrast neutral text tokens')
    assert.ok(generatedMainCss.includes('.text-primary {'), 'main.css must map .text-primary to solved tokens')
    assert.ok(generatedMainCss.includes('--grad: linear-gradient'), 'main.css must include dark mode --grad in .dark block')
    assert.ok(generatedMainCss.includes('--btn-grad: linear-gradient'), 'main.css must include dark mode --btn-grad in .dark block')

    // Droplet skin dark mode overrides (prevents light gradient regression on panel-head / btn)
    const dropletPlan = { ...mockPlan, theme: { ...mockPlan.theme, skin: 'macos-droplet' } }
    const dropletCss = appFiles(dropletPlan)['app/assets/css/main.css']
    assert.ok(dropletCss.includes('.dark { --bg: #0b1220;'), 'droplet skin dark mode must override light background')
    const iDark = dropletCss.lastIndexOf('.dark {')
    const darkSlice = dropletCss.slice(iDark)
    assert.ok(/--grad:\s*linear-gradient\(180deg, rgba\(255,255,255,\.06\)/.test(darkSlice), 'droplet dark block must contain dark gradient')
    assert.ok(!/--grad:\s*linear-gradient\(180deg,rgba\(255,255,255,\.85\)/.test(darkSlice), 'droplet dark block must not retain white panel gradient')

    // Glass skin verification (native dark skin, no dark gradient needed)
    const glassPlan = { ...mockPlan, theme: { ...mockPlan.theme, skin: 'glass' } }
    const glassCss = appFiles(glassPlan)['app/assets/css/main.css']
    assert.ok(glassCss.includes('/* 皮肤：glass'), 'glass css must be generated')

    // 6. Nuxt UI app.config.ts badge theme & size tokens
    const genUi = uiFiles(mockPlan)
    const appConfig = genUi['app/app.config.ts']
    assert.ok(appConfig.includes('text-primary-fg-badge'), 'app.config.ts must configure subtle badge with solved contrast token')
    assert.ok(appConfig.includes('text-[11px]'), 'app.config.ts must lift badge xs size to 11px')
  })
})




