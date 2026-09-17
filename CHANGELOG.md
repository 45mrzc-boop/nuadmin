# 📢 GenPlus (NuAdmin) 更新说明记录 (Changelog)

本文档记录 GenPlus (NuAdmin) 开源企业级多租户 SaaS 系统与微应用生成中枢的重要版本演进与架构更新。

---

## 🚀 [v2.1.0] - 2026-09-17

本次更新包含两项关键的系统级重构：**MySQL 数据库动态探活与零硬编码机制**，以及**全面原生兼容 Claude Code 智能体工程规范**。

### 1. 🛡️ MySQL 数据库动态探活与零硬编码改造 (Zero-Hardcode & Dynamic Ping Gate)

- **废除硬编码凭证**：
  - 彻底清理项目中原先写死的主机名（如 `mysql-db`）、端口及数据库密码（如 `joejoe1980`）；
  - 确立 `/config/nuadmin/main-admin/.env` 为全工程数据库凭证的**唯一真理来源**。
- **新增独立探活工具**：
  - 新增标准探活脚本 [`scripts/check-db-connection.mjs`](file:///config/nuadmin/scripts/check-db-connection.mjs)；
  - 自动解析 `main-admin/.env`，直连 MySQL 执行 `SELECT 1 AS ping, VERSION(), DATABASE(), NOW()`，输出包含连接状态、数据库清单与毫秒级延迟的标准化 JSON；
  - 支持作为 CLI 命令行工具独立执行，亦支持作为 Node 模块导出供其他脚本复用。
- **升级 MCP 服务端底层通道**：
  - 重构 [`bin/genplus-mcp.mjs`](file:///config/nuadmin/bin/genplus-mcp.mjs) 中的 `loadMainAdminDbConfig()` 与 `getTenantDbConfig()`，优先从 `main-admin/.env` 动态获取环境参数；
  - 升级 `genplus_get_db_connection` 工具：支持无参实时检测并握手探活控制面主库，同时支持指定 `tenantId`/`slug` 实时探活租户独立子库。
- **修复代码生成器模板漂移**：
  - 修改 [`main-admin/server/utils/gen/app.ts`](file:///config/nuadmin/main-admin/server/utils/gen/app.ts)，生成的子系统 `.env` 配置文件完全动态引用 `process.env.DB_HOST`、`process.env.DB_PASS` 等运行时环境变量，杜绝生成产物中的写死漂移。
- **在 Skills 与 Rules 中植入强制前置门禁**：
  - 在 `genplus-build` 与 `genplus-maintain` 技能包中均新增 **【阶段 0：动态确认与探活 MySQL 数据库连接（强制前置门禁）】**；
  - 在 `genplus-modes.md` 与 `AGENTS.md` 中确立核心铁律：AI 在调用任何建库、迁移、生成或查询动作前，必须先跑探活验证，确保数据库在线且凭证匹配。

---

### 2. 🤖 全面原生兼容 Claude Code 智能体规范 (Native Claude Code Dual-Stack Support)

为了让开发者在 **Claude Code**（Anthropic 官方终端智能体）中获得丝滑开箱即用的体验，本次更新全面对齐 Claude Code 工程规范：

- **新增根目录 `CLAUDE.md`**：
  - 建立 [`CLAUDE.md`](file:///config/nuadmin/CLAUDE.md)，Claude Code 启动时将自动加载本项目定位、构建与维护双模式 SOP、能力库唤醒反射弧与常见工程命令。
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
