# Claude Code Agent Guidelines — GenPlus (NuAdmin)

本工作空间是 **GenPlus (NuAdmin)** 开源企业级多租户 SaaS 系统与全栈微应用生成中枢的核心工程。
本工程原生支持 **Claude Code** 规范（包含根目录 `CLAUDE.md`、`.claude/skills/` 技能库、`.claude/rules/` 规则库以及 MCP 配置）。

---

## 1. 核心架构与研发模式 (Build vs Maintain)

在 Claude Code 中协同开发时，必须遵循以下双模式规程：

### 1. 构建模式 (Build Mode)
- **技能路径**：`.claude/skills/genplus-build/SKILL.md` (或 `.agents/skills/genplus-build/SKILL.md`)
- **最高铁律**：**严禁一句话直接一干到底！** 绝对不允许收到用户一句话未经验收对齐就直接全流程生成！
- **双轨设定**：
  * **简略模式 (Concise Mode)**：用户仅描述大概需求，AI 提炼核心概要（实体名称、2~3 个核心模块、**智能唤醒装配的能力库清单**、门禁模式），与用户单轮确认对齐后，其余所有底层细节（字段类型、UI组件、搜索维度、动作矩阵、标准字典）**全部由系统智能拟定**，直接自动化安装能力、生成并启动！
  * **细节模式 (Detailed Mode)**：企业级深度定制，多阶段全流程精细研讨（基础信息 -> 实体关系 -> 逐字段规则 -> 动作矩阵天花板 -> 能力库装配矩阵 -> 终审蓝图签署 -> 自动化落地）。
- **能力库主动唤醒铁律 (Capability Reflex Arc)**：
  * 推广 / 二码 / 获客 ➔ 必装 `landing_poster` (海报二码落地页)
  * 预约 / 报名 / 线索 ➔ 必装 `landing_form` (动态收集表单)
  * 招聘 / 展品 / 活动 ➔ 必装 `landing_portal` (前台复合门户)
  * 官网 / 资讯 / CMS ➔ 必装 `landing_cms` (纯静态企业官网与文章CMS)
  * 统计 / 指标 / 看板 ➔ 必装 `dashboard` (实时数据大屏)
  * 字典 / 枚举 / 标签 ➔ 必装 `dict` (数据字典)
  * 审批 / 工单 / 流转 ➔ 必装 `flow` (审批流)

### 2. 维护模式 (Maintain Mode)
- **技能路径**：`.claude/skills/genplus-maintain/SKILL.md`
- 用于对现有已上线的租户项目进行增量迭代、加字段、调样式、排查权限与热更新。

---

## 2. 强制前置门禁：跨平台自适应与 MySQL 数据库动态确认

> [!CRITICAL]
> **绝对禁止假定特定操作系统或路径，严禁硬编码 MySQL 凭证（包括主机名、端口、账号、密码）！**
> 1. **操作系统与根目录前置检测**：
>    * 大模型在调用任何 Skill 或执行脚本前，必须首先动态检测当前运行环境（Windows `win32` / macOS `darwin` / Linux `linux`）与工作区根目录 `<repoRoot>`；
>    * 严禁硬编码容器路径 `/config/nuadmin`，所有脚本与配置均以 `<repoRoot>` 动态定位；
> 2. **前置探活门禁**：在调用任何 Skill 执行租户建档、表结构迁移、数据播种或 SQL 查询排查前，大模型**必须首先确认真实的 MySQL 数据库连接信息**：
>    * 运行握手命令：`node <repoRoot>/scripts/check-db-connection.mjs`；
>    * 或无参调用 MCP 工具 `genplus_get_db_connection`（自动解析控制面库并实时探活）；
> 3. **唯一真理来源**：所有数据库凭证必须动态读取自 `<repoRoot>/main-admin/.env`（`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`）；
> 4. **上下文动态传递**：后续所有租户独立子库（`nuadmin_t_*`）建库、种子播种与数据查询，必须完全基于动态探活拿到的参数运行，彻底消除环境漂移。

---

## 3. Claude Code MCP 工具链支持

工作台提供标准 MCP Server：
- 配置文件：`.claude/settings.json`、`.claude/mcp.json`、`.agents/mcp_config.json`
- 可执行服务端：`bin/genplus-mcp.mjs`（可通过 `${workspaceFolder}/bin/genplus-mcp.mjs` 或 `<repoRoot>/bin/genplus-mcp.mjs` 加载）
- 核心能力：
  * 租户建档与管理：`genplus_create_tenant`, `genplus_update_tenant`, `genplus_list_tenants`, `genplus_get_tenant_detail`
  * 字典与建模：`genplus_save_dict`, `genplus_create_model_group`, `genplus_create_module`, `genplus_add_fields`, `genplus_update_field`
  * 设计与能力装配：`genplus_configure_design`, `genplus_install_capability`, `genplus_list_capabilities`
  * 生成与服务启停：`genplus_generate_project`, `genplus_manage_service`
  * 独立数据库直连与排查：`genplus_get_db_connection`, `genplus_db_query`, `genplus_db_execute`
  * 前台微页面生成：`genplus_create_public_landing`
  * 无头浏览器真机截图预览：`genplus_take_screenshot`

---

## 4. 常用工程命令

```bash
# 1. 数据库动态探活握手（内置跨平台与动态根目录自适应）
node <repoRoot>/scripts/check-db-connection.mjs

# 2. 启动控制面主后台 (Port 10000)
cd <repoRoot>/main-admin && npm run dev

# 3. 独立子系统构建与部署 (以 app_demo 为例)
cd <repoRoot>/tenants/app_demo
npm install
npm run build
node .output/server/index.mjs
```
