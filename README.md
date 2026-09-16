# 🚀 GenPlus (NuAdmin) — 开源企业级多租户 SaaS 系统开发中枢与微应用生成引擎

<p align="center">
  <a href="https://github.com/45mrzc-boop"><img src="https://img.shields.io/badge/Author-chuan-10b981?style=flat-square&logo=github" alt="Author: chuan" /></a>
  <a href="mailto:45mrzc@gmail.com"><img src="https://img.shields.io/badge/Contact-45mrzc%40gmail.com-0ea5e9?style=flat-square&logo=gmail" alt="Email: 45mrzc@gmail.com" /></a>
  <a href="https://nuxt.com" target="_blank"><img src="https://img.shields.io/badge/Nuxt-v4.5-00DC82?style=flat-square&logo=nuxt&logoColor=white" alt="Nuxt 4" /></a>
  <a href="https://vuejs.org" target="_blank"><img src="https://img.shields.io/badge/Vue-v3.5-4FC08D?style=flat-square&logo=vue.js&logoColor=white" alt="Vue 3.5" /></a>
  <a href="https://ui.nuxt.com" target="_blank"><img src="https://img.shields.io/badge/Nuxt_UI-v4.11-00DC82?style=flat-square&logo=nuxt&logoColor=white" alt="Nuxt UI 4" /></a>
  <a href="https://tailwindcss.com" target="_blank"><img src="https://img.shields.io/badge/TailwindCSS-v4.3-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" alt="Tailwind 4" /></a>
  <a href="https://www.mysql.com" target="_blank"><img src="https://img.shields.io/badge/MySQL-v8.0+-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL 8" /></a>
  <a href="https://casbin.org" target="_blank"><img src="https://img.shields.io/badge/Casbin-RBAC-blue?style=flat-square" alt="Casbin" /></a>
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT" />
</p>

<p align="center">
  <b>基于 Nuxt 4 + Vue 3.5 + Tailwind CSS 4 + Nitro + MySQL + Casbin 的开源企业级多租户 SaaS 系统开发框架与独立微应用生成中枢</b>
</p>

<p align="center">
  🌐 <b><a href="https://45mrzc-boop.github.io/nuadmin/">【点击在线浏览 H5 产品特性全景演示】</a></b> &nbsp;|&nbsp;
  📦 <b><a href="https://github.com/45mrzc-boop/nuadmin">【GitHub 开源仓库】</a></b> &nbsp;|&nbsp;
  👨‍💻 <b>作者：chuan（45mrzc@gmail.com）</b>
</p>

---

## 🌟 项目定位与核心愿景

**GenPlus (NuAdmin)** 是一套面向企业级敏捷开发、多租户业务隔离与全场景微应用交付的**开源企业级 SaaS 系统开发中枢与生成引擎**。

传统的管理系统或闭源框架往往存在强行捆绑、大宽表混杂、一旦平台故障业务全崩的严重缺陷。GenPlus 采用**控制面（Control Plane）与多租户自治系统（Tenant Systems）完全解耦**的先进架构：
- **主后台只做两件事**：业务建模编排、能力库装配与 AI 智能体调度。
- **生成的子后台 100% 独立自治**：每个生成的子系统拥有**独立的项目目录、独立的专属 MySQL 数据库（`nuadmin_t_*`）、独立的 JWT 密钥体系以及专属的 Casbin 权限隔离域**。
- **0 运行时依赖**：子工程生成后即可脱离主后台单独打包、独立部署（`npm run build`），获得标准的纯净代码，彻底杜绝黑盒捆绑。

---

## 👨‍💻 核心作者与交流联系 (Author & Contact)

- **核心作者 / 架构师**：**chuan**
- **联系邮箱**：[45mrzc@gmail.com](mailto:45mrzc@gmail.com)
- **GitHub 主页**：[https://github.com/45mrzc-boop](https://github.com/45mrzc-boop)
- **项目开源仓库**：[https://github.com/45mrzc-boop/nuadmin](https://github.com/45mrzc-boop/nuadmin)
- **在线产品介绍站**：[https://45mrzc-boop.github.io/nuadmin/](https://45mrzc-boop.github.io/nuadmin/)

> 💡 **合作与咨询**：欢迎广大开发者、技术团队以及企业伙伴进行开源技术交流、多租户 SaaS 架构探讨、私有化部署及业务定制合作，欢迎邮件联系！

---

## 💎 核心架构与技术亮点

### 1. Skills + MCP 双模式驱动架构（Agentic SaaS Engine）
工作台深度拥抱智能体协作开发标准，提供完善的 **Skills 规程库** 与 **MCP 工具协议**：
- **`genplus-build` 技能**：支持【简略模式 (Concise)】与【细节模式 (Detailed)】，内置“能力库主动唤醒反射弧”，严禁粗暴一干到底，通过结构化交互实现高精度需求对齐。
- **`genplus-maintain` 技能**：针对已上线的租户项目提供增量加字段、改样式、权限排查与平滑热重启。
- **`genplus-mcp` (MCP Server)**：封装 7 大工作台核心 API、独立 MySQL 直连与排查、以及基于无头浏览器 CDP 的实时真机渲染截图与视觉校验工具。
- **极低 Token 消耗**：大模型仅需决策数十个 Token 的结构化元数据，本地毫秒级工业编译引擎（Deterministic AST Engine）自动转换为数万行标准全栈代码。

### 2. 三大门禁认证形态（Gatekeeper Authentication Modes）
设计站与控制面支持 3 种深度自适应的鉴权模式，从前端登录交互到侧边栏菜单、从数据表结构到权限中枢全方位动态适配：
1. **简单密码模式 (`simple`)**：
   - 适用于原型预览、内部临时管理、单一工具后台；
   - 登录页**自动隐藏账号输入框**，提供单一门禁口令输入与一键开门验证；
   - 侧边栏自动剥离用户与角色管理，当前身份标识为“持门者（门禁授权通行）”。
2. **成员平权模式 (`users`)**：
   - 适用于小型团队协作、轻量级运营系统；
   - 账号密码标准登录，侧边栏保留【用户管理】并剔除【角色管理】；
   - 列表明确标识“平权成员”，弹窗无需指定角色，能登录即可全权协作。
3. **完整权限模式 (`rbac`)**：
   - 适用于企业级多层级权责划分系统；
   - 提供基于 Casbin 的标准 RBAC 策略引擎，支持菜单授权、按钮级动作矩阵与 API 路径细粒度拦截。

### 3. 18 项全场景企业级能力库（Capabilities Matrix）
工作台内置开箱即用的模块化能力包，支持在建模期/维护期一键装配、依赖注入与自动化 DDL 迁移：

| 能力分类 | 能力标识 (`cap_key`) | 能力名称 | 核心功能特性 |
| :--- | :--- | :--- | :--- |
| **基础治理** | `dict` | 数据字典 | 树形字典、键值映射、状态与标签快速渲染 |
| | `log` | 操作审计日志 | 请求入参/出参拦截、操作人追踪、防篡改记录 |
| | `security` | 安全加固 | 登录频次限流、防暴力破解、CSRF 防护 |
| | `i18n` | 多语言国际化 | 动态语言包切换、多语种字段联动 |
| **数据与交互** | `file` | 文件与媒体上传 | 本地/对象存储直传、白名单过滤、图片缩略 |
| | `io` | 智能导入导出 | Excel/CSV 批量导入、唯一性校验、模板导出 |
| | `batch` | 批量动作矩阵 | 批量删除、批量更新状态、批量审批 |
| | `tree` | 树形/层级结构 | 部门树、品类树、拖拽层级与级联查找 |
| | `recycle` | 软删除与回收站 | 逻辑删除、数据快照留存、一键还原与彻底粉碎 |
| | `print` | 票据与单据打印 | 动态单据模板套打、脱敏快照渲染 |
| **流程与调度** | `dashboard` | 实时数据看板 | 核心指标统计卡片、趋势图表、分布饼图 |
| | `flow` | 审批工作流 | 状态机驱动、流转历史时间线、驳回与同意 |
| | `job` | 分布式定时任务 | Cron 表达式灵活配置、执行耗时与日志追踪、手动触发执行 |
| | `message` | 站内通知与消息 | 站内信广播、未读标记、通知角标实时推送 |
| **前台微门户** | `landing_cms` | 纯静态企业官网CMS | **纯静态 0-API 水合官网**、暗黑主题切换、文章抽屉微阅读 |
| | `landing_poster` | 渠道推广与海报 | 动态渠道参数二码、带参落地页、扫码流转追踪 |
| | `landing_form` | 动态线索收集表单 | 自定义字段问卷、移动端自适应提交、即时入库 |
| | `landing_portal` | 前台复合业务门户 | 聚合展示、搜索筛选、移动端沉浸式交互 |

---

## 🛠️ 技术栈总览

- **前端框架**：[Nuxt 4](https://nuxt.com/) / [Vue 3.5](https://vuejs.org/) (Composition API, `<script setup>`)
- **UI 体系**：[Nuxt UI](https://ui.nuxt.com/) + [Tailwind CSS 4](https://tailwindcss.com/)
- **服务端运行时**：[Nitro Engine](https://nitro.unjs.io/) (全栈多端无缝部署)
- **数据库**：MySQL 8.0+ (utf8mb4，连接池管理，多租户独立数据库架构)
- **权限与安全**：[Casbin](https://casbin.org/) (RBAC with domains) + [jose](https://github.com/panva/jose) (JWT 签名验证)
- **智能体协议**：Model Context Protocol (MCP) + Agent Skills

---

## 📂 项目目录结构

```bash
/config/nuadmin/
├── .agents/                    # GenPlus AI 智能体规范库
│   ├── skills/                 # 核心技能：genplus-build / genplus-maintain
│   ├── rules/                  # 智能体行为规则与门禁守则
│   └── mcp_config.json         # MCP 服务端连接配置
├── bin/
│   └── genplus-mcp.mjs         # 工作台标准 MCP 独立服务入口
├── main-admin/                 # 控制面工程（SaaS 开发控制中枢）
│   ├── app/                    # 控制面前端（Nuxt 4 页面与工位视图）
│   │   ├── components/stations # 9 大专业研发工位组件
│   │   └── pages/              # 控制面路由
│   ├── server/                 # Nitro 服务端与确定性代码编译引擎
│   │   ├── api/                # 控制面 RESTful 接口
│   │   └── utils/gen/          # ★ 毫秒级确定性工业代码生成器 (AST)
│   ├── nuxt.config.ts          # Nuxt 配置文件
│   └── package.json            # 控制面依赖声明
├── tenants/                    # 生成的独立多租户子系统目录（已配置 .gitkeep）
├── scripts/                    # 运维与自动化脚本目录
├── nuadmin.sql                 # 完整的 MySQL 基础结构与初始种子字典
├── index.html                  # 线上宣传与功能演示 H5 单页（GitHub Pages）
├── AGENTS.md                   # AI 智能体协作开发总章程
├── CONTRACT.md                 # 控制面与子系统前后端接口契约
└── README.md                   # 项目工程官方说明文档
```

---

## 🚦 快速开始

### 1. 环境准备
- **Node.js**：`>= 18.0.0`（推荐 Node 20 / 22）
- **包管理器**：`npm` / `pnpm`
- **数据库**：MySQL `>= 8.0`

### 2. 导入数据库
在你的 MySQL 实例中创建并导入初始化数据库：
```bash
mysql -h 127.0.0.1 -P 3306 -u root -p < nuadmin.sql
```
> **说明**：`nuadmin.sql` 会自动创建 `nuadmin` 控制面库，并预置默认超级管理员账号、系统菜单、18 项核心能力库元数据及 Casbin 安全规则。

### 3. 配置环境变量
进入主后台目录并配置环境参数：
```bash
cd main-admin
cp .env.example .env
```
编辑 `.env` 文件，根据实际环境调整数据库连接配置：
```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASS=your_password
DB_NAME=nuadmin

JWT_SECRET=your_custom_jwt_secret_key
PORT=6005
HOST=0.0.0.0
```

### 4. 安装依赖并启动主后台
```bash
cd main-admin
npm install
npm run dev
```

服务启动后，在浏览器访问：
- **控制面访问地址**：`http://localhost:6005`
- **默认管理员账号**：`admin`
- **默认管理员密码**：`admin123`

---

## 🖥️ 9 大专业 SaaS 研发工位使用指引

进入主后台后，每个项目拥有 9 大专有配置工位：
1. 🏗️ **建模站 (Model)**：可视化分组、模型定义、字段数据类型映射、关联外键与 JSON 模型一键导入导出。
2. 🧩 **能力库 (Capability)**：18 项能力自主装配开关、配置表单注入与依赖冲突自动检测。
3. 🎨 **设计站 (Design)**：5 套登录页视觉模板、主题色彩体系生成、侧边栏形态与三门禁鉴权模式选择。
4. ⚙️ **生成站 (Generator)**：点击一键触发工业级编译，自动产出全栈 Nuxt 4 独立工程与数据库迁移脚本。
5. 🔌 **逻辑站 (Logic)**：数据保存前后 8 个服务端生命周期钩子配置与自定义扩展端点注入。
6. 🗄️ **数据站 (Seed)**：启发式拟真商业数据生成规则，支持开发期一键播种初始数据。
7. ✅ **验证站 (Verify)**：代码语法检查、esbuild AST 完整性校验、真实的 DDL 实跑与启动握手检测。
8. 👁️ **预览站 (Preview)**：主后台同源智能无缝前缀反向代理，实时无缝预览运行中的子后台或前端微页面。
9. 🤖 **AI 创作中枢 (AI Studio)**：自然语言驱动多工位协同设计，支持模型 Diff 差异比对签署。

---

## 📦 独立子系统运行与生产部署

当在工作台生成一个多租户子系统（如 `app_demo`）后，该工程会完整输出到 `tenants/app_demo/`：
```bash
# 进入生成的子系统目录
cd tenants/app_demo

# 安装子系统依赖（完全脱离主后台，独立运行）
npm install

# 本地开发调试
npm run dev

# 生产环境打包（零运行时平台依赖）
npm run build
node .output/server/index.mjs
```

---

## 🤝 协作与开源协议

本项目由 **chuan** 独立主导开发，基于 **MIT 协议** 开源。
欢迎提交 Issue 与 Pull Request 共同完善新能力组件与生成模板！
- **联系作者**：[45mrzc@gmail.com](mailto:45mrzc@gmail.com)
- **源码仓库**：[https://github.com/45mrzc-boop/nuadmin](https://github.com/45mrzc-boop/nuadmin)
