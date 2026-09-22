# 📢 GenPlus (NuAdmin) 更新说明记录 (Changelog)

本文档记录 GenPlus (NuAdmin) 开源企业级多租户 SaaS 系统与微应用生成中枢的重要版本演进与架构更新。

---

## 🚀 [v2.3.0] - 2026-09-22

本次更新是 GenPlus (NuAdmin) 的重要次版本升级！标志着系统正式构建了完整的 **“AI 自测通道 + 守护进程 (Daemon) + 25 项全矩阵 MCP 工具 + 企业级端口注册与安全防线”** 的智能体自治研发闭环，并在多平台（Linux / Windows / macOS）下全面实现零硬编码与无缝协同。

### 1. 🤖 AI 自测通道与自动化验证闭环 (AI Self-Test Channel & Daemon)
- **全新 MCP 诊断与自测工具矩阵（扩充至 25 个工具）**：
  - `genplus_health`：实现控制面与子后台双层探针探测，精准区分进程存活与初始化就绪状态；
  - `genplus_verify`：直接触发租户全量静态/动态校验门禁，结构化汇总 `pass/fail/skip` 并判定 `PASSED` / `FAILED` / `PARTIAL` 门禁状态；
  - `genplus_inspect_output`：在安全沙箱环境下实时读取子后台生成的源码与配置文件，具备严格防目录穿越防护；
  - `genplus_diff_tenant`：支持快速对比两个租户工程的文件树与代码差异。
- **AI 专属 Loopback HTTP 守护进程 & 统一调用器**：
  - 新增 [`scripts/genplus-mcp-call.mjs`](./scripts/genplus-mcp-call.mjs)；
  - 支持单次命令行调用 (`--tool <name> --args '<json>'`) 与批量文件调用 (`--file <path>`)；
  - 支持后台守护进程模式 (`--serve --port <port>`)，绑定 127.0.0.1 本地回环地址，配备 32 字节高强度 Token 认证、PID 文件追踪与 15 分钟空闲自动安全休眠；
  - 支持 `--stop` 优雅终止守护进程。
- **双层健康探针与就绪检测**：
  - 控制面 [`main-admin/server/api/health.get.ts`](./main-admin/server/api/health.get.ts) 升级为 K8s/AI 标准就绪探针，动态读取工程版本，集成 MySQL `SELECT 1` 数据库探活与错误脱敏；
  - 子后台生成的 `server/utils/db.ts` 补充 `isDbReady()` 状态探针，生成的 `/api/health.get.ts` 无需 Casbin 鉴权，支持直观判断 DB 及初始化状态。

### 2. 🛡️ 企业级端口注册中心与双重冲突防范机制 (Port Convention & Registry)
- **主从端口规范**：
  - 主控制台（Main Admin）默认固定于 `10000` 端口；
  - 子后台（Sub Admin）默认从 `10001` 起按创建顺序自动递增分配空闲端口（`10001`, `10002`, `10003`...）；
- **用户自主指定与双向端口协商**：
  - AI 在立项对齐时，在方案概要中明确展示默认端口，并提示用户可自主指定（如“端口用 10086”）；
  - 系统底层提供端口合法范围（1024~65535）、主控制台防冲突、租户库防重与宿主机端口动态探活双重门禁保障。

### 3. 🔐 C 端微页面权限隔离与安全治理
- **前台微页面独立菜单分组**：
  - 将生成的 C 端公开落地页归入专属 `前台运营` 菜单分组，排除在非 admin 角色（如 viewer / editor）的自动授权范围之外；
- **内置 Admin 角色菜单映射补齐**：
  - 生成器自动为 `admin` 角色补充全部菜单的 `sys_role_menu` 记录，彻底杜绝权限拦截或菜单白名单缺失；
- **能力库 Portal 守卫修复**：
  - 修复 `caps.ts` 中 D4 守卫表名比对逻辑，增强前台门户安全性与稳定性。

### 4. 🌐 跨平台与零硬编码全面落地
- **废除所有平台与路径硬编码**：
  - 全工程路径改用 `import.meta.url` 与相对路径动态解析，彻底清除 `/config/nuadmin` 容器绝对路径假设；
  - MCP 工具增强模块与字段名称容错解析（`resolveModule`, `resolveField`），并统一返回 `_errors: [...]` 结构化诊断数组；
  - 全部 25 个 MCP 工具标注标准 `annotations` 属性（`readOnlyHint`、`destructiveHint`、`idempotentHint`）。

### 5. 🧪 工业级验证与自动化测试
- **生成器单测 100% 通过**：[`main-admin/test/generator.test.mjs`](./main-admin/test/generator.test.mjs) 新增 Test 13，全量 13 项单元测试全部 PASS；
- **生产构建成功**：`main-admin` 顺利通过 `npm run build` 编译打包。

---

## 🚀 [v2.2.1] - 2026-09-22

本次更新基于 Windows 实测复测报告（`BUGREPORT-v2.2.0-residual.md`），重点修复了建档参数落库、租户架构档案聚合读取、文档相对路径以及跨平台 lockfile 保护等残余缺陷。

### 1. 🏗️ 建档参数原子落库修复 (R1)
- **控制面建档接口支持完整参数**：
  - 修改 [`main-admin/server/api/tenant/index.post.ts`](./main-admin/server/api/tenant/index.post.ts)，在 `INSERT INTO tenant` 中完整加入 `app_title`、`auth_mode`（默认 `rbac`）、`auth_config` 列，解决此前 `app_title` 被硬编码回退为 `name`、`auth_mode` 静默丢失的问题。
- **MCP 服务端原子建档与真实值回显**：
  - 优化 [`bin/genplus-mcp.mjs`](./bin/genplus-mcp.mjs) 中的 `genplus_create_tenant`，直接透传 `app_title`、`auth_mode`、`auth_config`，并在建档后自动回读落库真实值，杜绝假生效。

### 2. 🔍 租户架构档案聚合读取修复 (R2)
- **补齐控制面 GET 端点**：
  - 新增 [`main-admin/server/api/model/group/index.get.ts`](./main-admin/server/api/model/group/index.get.ts)：支持 `?tenantId=...` 查询租户所有分组；
  - 新增 [`main-admin/server/api/module/index.get.ts`](./main-admin/server/api/module/index.get.ts)：支持 `?tenantId=...` 查询租户所有模块（含字段列表与视图设计），同时解决 `genplus_configure_design` 中通过 `moduleKey` 查找模块失败的问题。
- **MCP 架构档案聚合优化**：
  - 重构 `genplus_get_tenant_detail`：优先从租户详情中提取 `groups` 与 `modules`，兼顾独立接口容错回退，并补充返回 `counts: { groups, modules, dicts, caps }` 计数，彻底杜绝维护模式因空数组导致的误判。

### 3. 📝 文档跨平台相对路径化 (R3)
- **清理容器绝对路径残留**：
  - 将 [`CHANGELOG.md`](./CHANGELOG.md) 中所有 `file:///config/nuadmin/...` 统一重构为相对路径 `./...`，GitHub 与本地编辑器（Windows / Linux / macOS）均可无缝点击跳转。

### 4. 📦 Windows `npm install` 锁文件裁剪防护 (R4)
- **跨平台可选依赖保护配置**：
  - 在仓库根目录与 `main-admin/` 分别新增 [`.npmrc`](./.npmrc) 与 [`main-admin/.npmrc`](./main-admin/.npmrc)，配置 `save-optional=true` 与 `package-lock=true`，防止 Windows 环境执行 `npm install` 时剪掉 Linux / macOS 原生绑定（如 `@oxc-parser/binding-*`）；
  - 在 [`main-admin/package.json`](./main-admin/package.json) 中增加 `"check:lockfile": "git diff --exit-code package-lock.json"` 指令。

### 5. ⚡ 服务启停状态回传与自动化测试
- **版本与状态回显增强**：
  - `genplus_manage_service` 在 `start` 动作执行成功后，自动拉取最新的服务运行状态与租户工程编译版本号（`version`、`ready`、`pid`、`status`），避免误判。
- **新增单元测试**：
  - [`main-admin/test/generator.test.mjs`](./main-admin/test/generator.test.mjs) 新增第 10 项单元测试（建档与详情聚合数据契约验证），10/10 测试全部通过。

---

## 🚀 [v2.2.0] - 2026-09-22

本次更新基于跨平台（Windows 11 / Linux / macOS）全链路构建实战，重点解决跨平台可移植性、AI Skill 动态环境感知门禁、MCP 服务端稳健性与 C 端微页面闭环等核心问题。

### 1. 🧭 AI Skill 跨平台灵活自适应与前置感知门禁 (OS & RepoRoot Awareness Pre-flight)

- **前置操作系统与目录动态感知**：
  - 在 `genplus-build` 与 `genplus-maintain` 技能包以及工作台规范中，将原【阶段 0】升级为 **【阶段 0：环境感知与前置探活（跨平台动态检测与数据库门禁）】**；
  - **强制两步感知**：
    1. **步骤一（OS 与根目录检测）**：AI 在执行任何命令前，必须明确当前运行环境（Windows `win32` / macOS `darwin` / Linux `linux`）与工作区根目录 `<repoRoot>`，彻底废除对 `/config/nuadmin` 容器绝对路径的假设；
    2. **步骤二（动态探活与凭证继承）**：执行 `node <repoRoot>/scripts/check-db-connection.mjs`，探活脚本已内置动态路径推导与平台检测，回传当前 `platform`、`root`、`database` 状态，后续所有操作动态继承该配置。
- **跨平台命令与进程适配**：
  - Windows 环境：适配 `npm.cmd`（开启 `shell: true`）、`taskkill /PID <pid> /T /F` 终结整棵进程树、`netstat -ano | findstr LISTENING` 端口查询；
  - Linux/macOS 环境：适配 `npm`、`process.kill(-pid)` 进程组信号、`ss`/`lsof`。
- **同步覆盖全量规则与文档**：
  - 同步更新 `.agents/skills/*`、`.claude/skills/*`、`.agents/rules/*`、`.claude/rules/*`、`AGENTS.md` 与 `CLAUDE.md`。

---

### 2. 🛠️ 跨平台可移植性全量修复 (Windows & Linux Universal Adaptation)

- **仓库根路径动态推导**：
  - [`scripts/check-db-connection.mjs`](./scripts/check-db-connection.mjs) 与 [`bin/genplus-mcp.mjs`](./bin/genplus-mcp.mjs) 统一使用 `resolve(dirname(fileURLToPath(import.meta.url)), '..')` 动态自解析根目录；
  - 清理 MCP 内部写死的主机路径与历史 Brain 会话 UUID 残留；
  - [`main-admin/server/utils/gen/index.ts`](./main-admin/server/utils/gen/index.ts) 动态推导 `adminRoot`，Windows 下使用 `junction` 挂载 `node_modules`。
- **Windows 子进程与端口管理修复**：
  - [`main-admin/server/utils/gen/write.ts`](./main-admin/server/utils/gen/write.ts) 与 [`verify.ts`](./main-admin/server/utils/gen/verify.ts)：`spawnDev` 与 `bootCheck` 采用 `npmSpawnTarget()`，Windows 环境调用 `npm.cmd` 并指定 `shell: true`，增加 `child.on('error')` 监听避免静默失败；
  - `killPort` 区分平台：Windows 下使用 `netstat` + `taskkill`，避免因无 `ss` 命令导致的端口未释放与撞端口；
  - `bootCheck` 的 `finally` 清理使用 `taskkill /PID <pid> /T /F`，消除 Windows 下负 PID 信号失效引起的进程泄漏。
- **语法校验临时目录标准化**：
  - [`main-admin/server/utils/gen/verify.ts`](./main-admin/server/utils/gen/verify.ts) 的 esbuild 校验改用 `mkdtempSync(join(tmpdir(), 'nuadmin-parse-'))`，并在 `finally` 中通过 `rmSync` 安全清理，消除对 `/tmp` POSIX 路径的依赖。

---

### 3. 🔌 MCP 服务端稳健性与协议契约对齐 (MCP Robustness & Schema Parity)

- **Chromium 自动发现与防崩溃**：
  - [`bin/genplus-mcp.mjs`](./bin/genplus-mcp.mjs) 实现 `resolveBrowser()`，自动探测 `CHROME_PATH`、`CHROMIUM_PATH`、系统 PATH 以及 Windows 下 Chrome / Edge 默认安装路径；
  - 挂载 `chrome.on('error')` 监听器，并在 CDP 等待循环中提前短路，杜绝因浏览器缺失导致未捕获异常而拖垮整个 MCP 服务端进程。
- **Profile 隔离与多次截图凭证保活**：
  - 每次截图调用自动分配专属临时 profile 目录（`--user-data-dir`），并在退出时清理，彻底解决多实例共享默认 profile 导致第二次起截图落回登录页的问题；
  - 捕获并断言 `Network.setCookie` 返回值，确保鉴权凭证可靠写入。
- **字段类型枚举完全对齐**：
  - 修复 `genplus_add_fields` 与 `genplus_update_field` 的 schema 枚举，对齐后端权威 `FIELD_TYPES`，完整开放 `id, bool, richtext, json, file, image`，移除废弃非法的 `switch` 类型。
- **新增租户级配置更新工具**：
  - 新增 `genplus_update_tenant` MCP 工具（对接 `PATCH /api/tenant/:id`），支持配置应用标题 `app_title`、门禁模式 `auth_mode`、布局风格 `layout`、主题 `theme` 等；
  - `genplus_create_tenant` 支持直接传入 `auth_mode` 与 `app_title`，杜绝静默降级为 `users`。
- **控制面健康检查与防挂起超时**：
  - 新增 [`main-admin/server/api/health.get.ts`](./main-admin/server/api/health.get.ts)（`GET /api/health`）端点；
  - MCP 的 `api()` 请求挂载 30s `AbortController` 超时机制，当控制面无响应时主动报错，杜绝 Agent 侧无限挂起。

---

### 4. 🌐 C 端微页面与公开表单全链路闭环 (Public Landing & Form Mismatch Fix)

- **资源键层级错位修复**：
  - 修复 `landing_form` / `landing_portal` 生成模板中资源键直接使用物理表名（如 `hos_appointment`）导致的 404 问题，统一解析并生成模型 key；
  - [`main-admin/server/utils/gen/server.ts`](./main-admin/server/utils/gen/server.ts) 的 `tableOf(resKey)` 增加物理表名别名映射，双向兼容。
- **C 端表单提交智能容错与单号自增**：
  - [`main-admin/server/utils/gen/caps.ts`](./main-admin/server/utils/gen/caps.ts) 免鉴权提交接口增加常见字段别名映射（如表单传 `name` 自动映射到模型的 `patient_name`，`phone` 映射到 `mobile` 等）；
  - 自动为 `appt_no`、`order_no`、`sn` 等业务单号生成唯一编号，默认填充 `status: 'pending'` 与 `source: 'h5'`，确保 C 端表单提交 100% 成功。

---

## 🚀 [v2.1.0] - 2026-09-17

本次更新包含两项关键的系统级重构：**MySQL 数据库动态探活与零硬编码机制**，以及**全面原生兼容 Claude Code 智能体工程规范**。

### 1. 🛡️ MySQL 数据库动态探活与零硬编码改造 (Zero-Hardcode & Dynamic Ping Gate)

- **废除硬编码凭证**：
  - 彻底清理项目中原先写死的主机名（如 `mysql-db`）、端口及数据库密码（如 `joejoe1980`）；
  - 确立 `<repoRoot>/main-admin/.env` 为全工程数据库凭证的**唯一真理来源**。
- **新增独立探活工具**：
  - 新增标准探活脚本 [`scripts/check-db-connection.mjs`](./scripts/check-db-connection.mjs)；
  - 自动解析 `main-admin/.env`，直连 MySQL 执行 `SELECT 1 AS ping, VERSION(), DATABASE(), NOW()`，输出包含连接状态、数据库清单与毫秒级延迟的标准化 JSON；
  - 支持作为 CLI 命令行工具独立执行，亦支持作为 Node 模块导出供其他脚本复用。
- **升级 MCP 服务端底层通道**：
  - 重构 [`bin/genplus-mcp.mjs`](./bin/genplus-mcp.mjs) 中的 `loadMainAdminDbConfig()` 与 `getTenantDbConfig()`，优先从 `main-admin/.env` 动态获取环境参数；
  - 升级 `genplus_get_db_connection` 工具：支持无参实时检测并握手探活控制面主库，同时支持指定 `tenantId`/`slug` 实时探活租户独立子库。
- **修复代码生成器模板漂移**：
  - 修改 [`main-admin/server/utils/gen/app.ts`](./main-admin/server/utils/gen/app.ts)，生成的子系统 `.env` 配置文件完全动态引用 `process.env.DB_HOST`、`process.env.DB_PASS` 等运行时环境变量，杜绝生成产物中的写死漂移。
- **在 Skills 与 Rules 中植入强制前置门禁**：
  - 在 `genplus-build` 与 `genplus-maintain` 技能包中均新增 **【阶段 0：动态确认与探活 MySQL 数据库连接（强制前置门禁）】**；
  - 在 `genplus-modes.md` 与 `AGENTS.md` 中确立核心铁律：AI 在调用任何建库、迁移、生成或查询动作前，必须先跑探活验证，确保数据库在线且凭证匹配。

---

### 2. 🤖 全面原生兼容 Claude Code 智能体规范 (Native Claude Code Dual-Stack Support)

为了让开发者在 **Claude Code**（Anthropic 官方终端智能体）中获得丝滑开箱即用的体验，本次更新全面对齐 Claude Code 工程规范：

- **新增根目录 `CLAUDE.md`**：
  - 建立 [`CLAUDE.md`](./CLAUDE.md)，Claude Code 启动时将自动加载本项目定位、构建与维护双模式 SOP、能力库唤醒反射弧与常见工程命令。
- **标准 `.claude/` 智能体目录结构**：
  - 新增 `.claude/skills/genplus-build/SKILL.md`：构建模式技能；
  - 新增 `.claude/skills/genplus-maintain/SKILL.md`：维护模式技能；
  - 新增 `.claude/rules/genplus-modes.md`：双模式与交互门禁规则；
  - 新增 `.claude/settings.json` 与 `.claude/mcp.json`：配置 Claude Code 原生连接 `genplus-mcp.mjs` MCP 服务端。
- **双轨智能体生态无缝并存**：
  - 现已形成 `.agents/`（通用智能体生态）与 `.claude/`（Claude Code 专属生态）的双轨镜像支持；
  - 无论使用 Claude Code、Antigravity、Cursor 还是终端 AI 工具，均能自动识别对应的技能规程与 MCP 工具链。

---

## 🌟 [v2.0.0] - 2026-09-16

- **SEO 与定位全面升级**：
  - 彻底去除“低代码平台”表述，全面定位为**开源企业级多租户 SaaS 系统开发中枢与微应用生成引擎**；
  - 显眼展示核心作者 **chuan** 与技术/商务交流邮箱 **45mrzc@gmail.com**；
  - 上线高质量 GitHub Pages 介绍站：`https://45mrzc-boop.github.io/nuadmin/`。
- **公众号渠道二维码统计系统案例交付**：
  - 基于 `genplus-build` 简略模式与 RBAC 鉴权架构完成全栈系统生成；
  - 装配 `dashboard`、`dict`、`landing_poster`、`io` 四大核心能力库；
  - 成功跑通真实数据播种、只读流水审计与无头浏览器真机截图渲染验证。
