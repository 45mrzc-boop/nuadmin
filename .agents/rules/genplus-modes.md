---
trigger: always_on
---

# GenPlus 工作台 Agent 行为准则：双模式与交互式把控

当你在 GenPlus 工作台（NuAdmin）环境中处理用户请求时，必须严格遵守以下原则：

## 1. 明确双模式界限 (Build vs Maintain)

* **构建模式 (Build Mode)**：
  - **触发条件**：用户想要从零开始创建一个新的项目、新的后台管理系统，或者没有指定具体已有租户时。
  - **核心守则**：
    > [!CRITICAL]
    > **严禁“一句话直接一干到底”！**
    > 绝对不允许在用户只发了一句话后，未经任何交互确认就私自建库、建表、生成并启动！
    > 必须激活 `genplus-build` Skill，支持以下**两种设定**：
    >
    > 1. **简略模式 (Concise Mode / 极速敏捷)**：
    >    - **适用**：用户描述大概需求，希望快速构建原型或快速上线，不希望繁琐纠结每个字段细节。
    >    - **交互**：AI 提炼出核心概要（系统中文/英文名、2~3个核心模块、**智能唤醒装配的能力库清单**、预设门禁与风格），与用户做**单轮对齐确认**（使用 `ask_question` 或结构化卡片）。
    >    - **系统定策**：经用户点头确认后，**其他所有细节（字段规划、类型推断、UI组件、搜索维度、动作矩阵、字典预置）全部由系统智能拟定**，同时**必须调用 `genplus_install_capability` 将选定能力包安装并配置入库**，直接调度 MCP 工具极速生成、启动并交付真机截图！
    >
    > 2. **细节模式 (Detailed Mode / 深度定制)**：
    >    - **适用**：企业级复杂业务系统、数据精度敏感、需要精细定制字段校验、外键关系与动作审计权限的场景。
    >    - **交互**：按多阶段全流程深入对齐（基础信息与门禁 -> 实体划分与外键 -> 字段定义与正则 -> 动作矩阵天花板 -> **能力库装配矩阵确认** -> 终审蓝图签署 -> MCP 落地与截图）。
    >
    > 💡 **模式选择引导**：当用户提出新项目需求时，若未指定模式，AI 优先呈递简明概要并提示用户可选择【简略模式】或【细节模式】。
    >
    > [!IMPORTANT]
    > **能力库主动唤醒铁律 (Capability Awareness & Reflex Arc)**：
    > 绝不允许把系统做成单薄闭塞的孤岛 CRUD！
    > 任何时候收到建站需求，AI 大脑必须立即建立场景反射弧：
    > - 二码 / 推广 / 获客 ➔ 必装 `landing_poster` (海报落地页)
    > - 预约 / 报名 / 线索 ➔ 必装 `landing_form` (动态收集表单)
    > - 招聘 / 展品 / 活动 ➔ 必装 `landing_portal` (前台复合门户)
    > - 官网 / 资讯 / CMS ➔ 必装 `landing_cms` (企业官网与文章CMS)
    > - 统计 / 指标 / 分析 ➔ 必装 `dashboard` (数据看板)
    > - 状态 / 枚举 / 标签 ➔ 必装 `dict` (数据字典)
    > - 审批 / 工单 / 流转 ➔ 必装 `flow` (审批流)

* **维护模式 (Maintain Mode)**：
  - **触发条件**：用户想要在已有系统/租户中增加模块、增减字段、修改样式、排查权限问题或修复 bug。
  - **核心守则**：
    - 激活 `genplus-maintain` Skill。
    - 首先获取当前已有系统的上下文（查询现有模块、字段与 Casbin 规则），不破坏已有数据。
    - 仅对用户指定的范围进行增量变更，然后重新触发生成与服务重启。

## 2. 善用 MCP 工具集

工作台提供基于 MCP 协议的标准工具集（`genplus_*`）：
* `genplus_list_tenants` / `genplus_get_tenant_detail`
* `genplus_create_tenant` / `genplus_save_dict`
* `genplus_create_model_group` / `genplus_create_module` / `genplus_add_fields`
* `genplus_configure_design` / `genplus_install_capability`
* `genplus_generate_project` / `genplus_manage_service`
* `genplus_get_db_connection` / `genplus_db_query` / `genplus_db_execute` (项目独立数据库直连与排查)
* `genplus_take_screenshot` (子项目运行后无头浏览器截图预览与视觉测试)
* `genplus_create_public_landing` (对外公开前端微页面快速生成与全链路数据闭环)

严禁绕过工作台底层契约随意在租户目录下硬编码。所有的结构变更必须通过工作台标准协议与数据模型落库！

## 3. Skills 与 MCP 的搭配协同机制

* **Skills（流程大脑与人机交互）**：
  - 负责**研讨、引导、门禁审查与决策编排**。
  - 规定 AI 什么时候该停下来向用户提问、什么时候该组织实体草案、什么时候该生成蓝图供签署，确保需求不偏航、不失控。
* **MCP（执行通道与底层打通）**：
  - 负责**直通工作台 7 大站点底层接口、直连独立 MySQL 与无头浏览器**。
  - 是 Skills 方案落地的原子能力集合。AI 不再通过碎片化的终端命令黑盒拼装，而是通过高可信的标准 MCP 协议驱动底层建库、建表、配矩阵、查数据和拍截图。
* **二者搭配法则**：
  - **无 Skill 不准妄动 MCP**（必须有立项或维护流程的意图对齐与签署，才能调用写操作 MCP）；
  - **有 MCP 绝不手工旁路**（所有落库操作一律调用 MCP，保障元数据完整性与架构标准性）。
