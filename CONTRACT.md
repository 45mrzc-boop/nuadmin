# GenPlus 并行施工契约

三个互不重叠的写入域。任何跨域需求改本文件，不要伸手改别人的文件。

| 域 | 负责人 | 可写路径 |
|---|---|---|
| A 子后台前端模板 | agent-A | `main-admin/server/utils/gen/ui.ts` |
| B 主后台 API | agent-B | `main-admin/server/api/**` |
| C 主后台 UI + 生成编排 | 主 agent | `main-admin/app/**`, `assets/**`, `server/utils/gen/index.ts`, `server/utils/gen/write.ts` |

已存在、只读的基础设施（不要修改）：
`server/utils/db.ts` `auth.ts` `casbin.ts` `capabilities.ts` `ddl.ts`
`server/utils/gen/types.ts` `sql.ts` `plan.ts` `app.ts` `server.ts` `caps.ts`

---

## 域 A 契约：子后台前端模板

```ts
// main-admin/server/utils/gen/ui.ts
import type { TenantPlan } from './types'
export function uiFiles(p: TenantPlan): Record<string, string>
```

返回 `相对路径 -> 文件内容`，全部是**生成的子内部件**（Nuxt 4 + Vue 3 script setup，`ssr:false`）。
必须覆盖：

- `layouts/default.vue`（侧边菜单 + 顶栏 + 水印）、`layouts/blank.vue`（登录页用）
- `components/AppSidebar.vue`：读 `/api/menu`，返回 `[{name, items:[{key,name,icon,path,perm}]}]`
- `components/AppTopbar.vue`：面包屑、用户、退出、`/api/security` 水印开关、消息角标（装了 message 才显示）
- `components/CrudPage.vue`：**核心**。props `schema`，实现 搜索栏/表格/分页/新增编辑弹窗/详情抽屉/行操作，
  并按能力开关渲染：批量勾选(`p.caps.batch`)、导出导入(`p.caps.io`)、树表(`p.caps.tree`)、
  回收站(`p.caps.recycle`)、审批按钮(`p.caps.flow`)、字段脱敏(`p.caps.security`)
- `components/FieldInput.vue`：按 `component` 渲染 input/textarea/number/date/datetime/switch/select/
  upload/image/remote-select/code/richtext
- `pages/login.vue`：三种模板 `p.loginTpl` = `split|center|card`
- `pages/index.vue` 跳 `/admin`；`pages/admin/index.vue` 看板（装了 dashboard 用聚合接口，否则欢迎页）
- `pages/admin/<resKey>/index.vue`：每个模块一个薄页面，`import schema from '~/schemas/<resKey>'` + `<CrudPage :schema>`
- `schemas/<resKey>.ts`：每个模块一个 UI schema（从 `p` 推导，字段展示顺序取 `design.list.columns` / `design.form.fields`）
- 能力页面（仅在装了该能力时输出）：`pages/admin/system/{dict,log,file,job,message}.vue`
  对应接口见域 B 之外的子后台自身接口：`/api/dict/page|list|create|remove`、`/api/log/page`、
  `/api/file/list`、`/api/job/list|run/<key>|log`、`/api/message/mine|read/<id>|read-all`

可用样式类（`assets/css/admin.css` 已提供，勿新增全局 css）：
`.app .side .main .top .body .card .btn .btn.pri .btn.dan .btn.sm .badge .badge.ok .badge.warn .badge.err`
`.grid .g2 .g4 .field .bar .pager .modal .empty .stat .split .tabs .wm .toasts .login .box`

数据访问统一走 `useApi().api`，提示走 `useToast().push(text, type)`，字典走 `useDict()`。

生成代码里的 Vue 模板字符串在 TS 模板字面量中要转义反引号；插值 `{{ }}` 安全，`${` 必须写成 `\${`。

---

## 图标值约定（建模库 → 主后台渲染 → 生成器 → 子后台）

`model_group.icon` / `module.icon` / `module.design_json.menu.icon` 存**三种形态之一**，
四处解析必须一致，任何一处只认一种就会静默退化成方块：

1. lucide 裸名 `folder`（图标选择器写入的形态，首选）
2. 完整名 `i-lucide-folder`（手输逃生通道）
3. emoji `📁`（列默认值遗留，靠 `EMOJI_ICON` 表映射）

- 主后台渲染：`app/components/IconGlyph.vue`（是图标名 → `UIcon`，否则按文本显示 emoji）
- 主后台选择器：`app/components/IconPicker.vue` + `app/composables/useIcons.ts`（精选 129 个，非全量 1901，避免 bundle 膨胀）
- 生成器解析：`server/utils/gen/ui.ts` 的 `iconName()` / `uiIconName()`，同一套规则内联进子后台 `app/utils/ui-icons.ts`
- 列宽 `VARCHAR(32)`：`sliders-horizontal`、`git-commit-vertical` 都超过 16，`asText(v, n)` 是 `slice` **静默截断**，
  改列宽必须同步改各 API 调用点传给 `asText` 的 n（现有 7 处：module/group 的 post+patch、model/import、ai/apply）

---

## 域 B 契约：主后台 API

Nuxt 4 nitro，`server/api/**`。全部用已存在的工具函数（自动导入，无需 import）：
`q/one/run/execScript/ident/ok/paged/useDb/useDbAt`、`defineAuthed/currentUser/hashPassword/verifyPassword/signToken/readToken`、
`authorize(event, dom, obj, act)/grantRole/addRule/enforce/invalidateCasbin`、
`buildPlan/allocatePort/toSlug/toCamel/toSnake/rowToModule`、`CAPABILITY_CATALOG`。

统一响应：`ok(data)` → `{code:0,message:'ok',data}`；分页 `paged(list,total,page,size)`。
鉴权：除 `/api/login` 外一律 `defineAuthed`；写操作再 `await authorize(event,'main','/api/<mod>/:id','write')`。

路由与请求/响应体（**字段名不得更改**，域 C 的前端按此对接）：

```
POST /api/login                 {username,password} -> {token,user:{uid,username,nickname,roles}}
GET  /api/profile               -> user + {menus:string[]}
GET  /api/login-log?page&size   -> paged

# 子后台（租户）生命周期
GET  /api/tenant                ?keyword&page&size -> paged<Tenant>
POST /api/tenant                {name,description?} -> Tenant   // 自动分配 slug/db_name/port/jwt_secret
GET  /api/tenant/:id            -> Tenant + {groups:[{...,modules:[{...,fields:[]}]}], caps:[]}
PATCH/api/tenant/:id            {name?,app_title?,theme?,login_tpl?,layout?,description?} -> Tenant
DELETE /api/tenant/:id          // 同时删除生成目录与租户库（?dropDb=1 时）

# 建模站
POST /api/model/group           {tenantId,name,icon?,sort?} -> Group
PATCH /api/model/group/:id      {name?,icon?,sort?} -> Group
DELETE /api/model/group/:id
POST /api/module                {tenantId,groupId,name,tableName?,icon?,comment?} -> Module
PATCH /api/module/:id           {name?,icon?,comment?,tableName?,sort?} -> Module
DELETE /api/module/:id
POST /api/module/:id/field      {name,colKey,type,length?,...} -> Field        // 追加到末尾
PATCH /api/field/:id            任意字段子集 -> Field
DELETE /api/field/:id
POST /api/module/:id/reorder-fields {order: string[]} -> true
GET  /api/module/:id            -> Module + fields[]
POST /api/model/import          {tenantId, json: <建模站导出的 group+module 结构>} -> {modules:number}
GET  /api/model/export?tenantId -> {groups:[{name,icon,modules:[{name,key,tableName,comment,fields:[...]}]}]}

# 能力库
GET  /api/capability?tenantId   -> [{...capability, spec, installed:{version,config,status}|null}]
POST /api/capability/install    {tenantId,capKey,config?} -> TenantCapability
POST /api/capability/uninstall  {tenantId,capKey} -> true
POST /api/capability/config     {tenantId,capKey,config} -> TenantCapability
POST /api/capability/rollback   {tenantId,capKey} -> TenantCapability   // status=rolledback

# 设计站 / 逻辑站 / 数据站（都是 module 的一段 JSON）
PATCH /api/design/:moduleId     {design: DesignDef} -> Module
PATCH /api/logic/:moduleId      {logic: LogicDef} -> Module
PATCH /api/seed/:moduleId       {seed: SeedDef} -> Module

# 生成站
POST /api/gen/:tenantId         {note?} -> {jobId,version,files:[{path,lines}],log:string}
GET  /api/gen/job/:id           -> GenJob
GET  /api/gen/timeline?tenantId -> [{id,version,kind,status,message,created_at,files:number}]
POST /api/gen/rollback          {tenantId,version} -> {jobId}
GET  /api/gen/preview?tenantId  -> {tree:string, files:[{path,lines}], ddl:string}

# 验证站
POST /api/verify/:tenantId      -> {jobId, cases:[{case_key,title,status,detail,duration}]}
GET  /api/verify?tenantId       -> 最近一次 cases

# AI 创作（自然语言驱动其它工位）
POST /api/ai/session            {tenantId?,title?} -> Session
GET  /api/ai/session            -> Session[]
POST /api/ai/chat               {sessionId, content} -> {message, action:{intent,tenantId?,payload}}
GET  /api/ai/message?sessionId  -> Message[]
POST /api/ai/apply              {sessionId,messageId} -> {applied:number, detail:string[]}  // 落库
```

约定：
- **`login_tpl` 枚举以原型 `genplus-demo.html` 的 CSS 为准，只有这五个值**：
  `split`（左右分屏）/ `glass`（玻璃拟态）/ `macOS`（用户位）/ `terminal`（终端）/ `hero`（全屏大图）。
  历史版本这里写过 `center / card`，那是错的，已废弃 —— 校验白名单必须改成上面五个。
  主后台 `app/composables/useStations.ts` 的 `LOGIN_TPLS` 是唯一的前端来源。
- `Tenant` 对象字段 = `tenant` 表列（`theme_json` 解析为对象返回）。
- `Module` 对象字段 = `module` 表列，`res_key`/`design_json` 等原样返回，另附 `fields: []`。
- 表名/字段名生成时做保留字与重复校验，冲突返回 400 且中文 message。
- 所有 list 接口支持 `page`/`size`，默认 1/20，size 上限 200。
- 域 B **不要**调用 `gen/` 下的生成器（那是域 C 的职责），`POST /api/gen/:tenantId` 只需
  `await import('../utils/gen/index').then(m => m.generate(tenantId))`。

## 域 C 已提供的生成器入口（只读约定）

```ts
// server/utils/gen/index.ts  (域 C 正在写)
export async function generate(tenantId: number): Promise<{ jobId: number, version: number, files: Array<{path:string,lines:number}>, log: string }>
export async function removeTenantArtifacts(tenantId: number): Promise<void>
```
