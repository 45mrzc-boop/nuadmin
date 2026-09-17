---
name: genplus-maintain
description: >-
  用于对已有 GenPlus 租户项目进行增量维护、需求迭代、字段扩展、Casbin 权限排查与热重启（维护模式）。
  当用户提出修改已有系统、增加字段/模块、调整样式或排查权限报错时激活。
---

# GenPlus 项目维护工作流 (维护模式)

本 Skill 专门指导 Agent 在 GenPlus 工作台中对已经存在的系统进行安全的增量运维、二次开发与故障修复。

---

## 阶段 0：动态确认与探活 MySQL 数据库连接（强制前置门禁）

> [!CRITICAL]
> **严禁在维护脚本与排查命令中硬编码 MySQL 凭证！**
> 在执行任何维护、数据库排查（`genplus_db_query`）、迁移变更或种子数据修正前，大模型**必须首先动态确认当前的 MySQL 数据库真实连接信息**：
> 1. **执行连接握手探活**：
>    - 运行探活脚本：`node /config/nuadmin/scripts/check-db-connection.mjs`；
>    - 或调用 MCP 工具 `genplus_get_db_connection`（不传参探活主库，或传入 `tenantId`/`slug` 探活目标租户库）；
> 2. **确认环境连接配置**：
>    - 自动从 `/config/nuadmin/main-admin/.env` 中读取并确认 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASS`、`DB_NAME`；
>    - 确保返回 `ok: true`，确认 MySQL 服务可用；
> 3. **配置动态继承**：
>    - 所有的 SQL 执行、结构比对和临时排查脚本，必须动态引用上述环境变量，严禁硬编码！

---

## 阶段一：定位目标系统上下文

1. **获取当前项目信息**：
   * 调用 `genplus_list_tenants`，查看已存在的项目列表；
   * 结合用户指示（如“帮我改下智慧仓储云”或指定租户 slug/ID），锁定目标租户；
2. **拉取元数据全景**：
   * 调用 `genplus_get_tenant_detail`，全面读取现存模块、字段列表、字典及能力状态；
   * 检查租户运行状态（`genplus_manage_service` 查询 status）。

---

## 阶段二：变更范围评估与方案拟定

根据用户的维护诉求进行分类评估：

1. **增量业务建模变更**：
   * 需新增字段：确认列名 `colKey`、类型、是否必填、是否搜索项；
   * 需新增模块：确认分组归属、表名与字段定义；
   * 需新增字典：录入新的枚举键值；
2. **权限与安全配置变更**：
   * 门禁模式切换：在子后台运行时通过 `/api/system/auth-mode` 管理（持久化在租户独立 `sys_config` 中，重启不丢失）；
   * 调整角色 Casbin 规则（如为某角色开放/收紧某模块的 `list` / `create` / `delete` 权限）；
   * 调整模块动作矩阵（通过 `genplus_configure_design` 显式指定 `actions` 矩阵，注意只读表需显式排除 `create/edit/delete`，避免默认全开）；
3. **视觉风格与体验调优**：
   * 更换布局（`side` 侧边栏 / `top` 顶部导航）；
   * 调整主题色与圆角尺寸。

与用户简要对齐本次变更的差异（Diff），并在变更前记录当前基线（状态、截图与核心元数据），确认无冲突后执行。

---

## 阶段三：执行增量更新与工程全量重编译

1. **调用 MCP 执行针对性更新**：
   * 若需新字段：调用 `genplus_add_fields`；
   * 若需新模块：调用 `genplus_create_module`；
   * 若需调整动作矩阵：调用 `genplus_configure_design`；
2. **触发编译生成**：
   * 调用 `genplus_generate_project(tenantId, note)`；
   * 工作台工业级生成引擎将基于最新元数据全量覆写导出标准工程源码（无黑盒漂移，严禁依赖手改代码，一切定制需沉淀于工作台元数据）；
3. **重启子后台服务**：
   * 调用 `genplus_manage_service(tenantId, 'start')` 确保服务加载最新代码与 SQL 迁移。

---

## 阶段四：验证与交付

1. **健康检查与真机冒烟验证**：
   * 调用 `verify` 接口（`boot: true`）执行全面冒烟检测，确保 0 失败方可交付；
   * 探测端口与 HTTP 服务是否就绪；
   * 调用 `genplus_db_query` 确认数据表结构、新字段或变更行是否正常落库；
   * 验证更新后的页面或接口是否正常返回数据；
   * 若涉及权限变更，使用对应角色的 Token 进行权限放行与拦截断言；
2. **视觉回归截图与交付**：
   * 调用 `genplus_take_screenshot` 截取变更后的模块页面，断言页面未被重定向至登录页且数据渲染完整；
   * 交付变更清单（新增字段/变更模块/修改策略）与最新截图。
