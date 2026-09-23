import type { CapSpec } from './gen/types'
import { buildCmsSiteIntent } from './gen/cms-intent'

export interface CapabilitySeed {
  cap_key: string
  name: string
  icon: string
  category: string
  version: string
  summary: string
  spec: CapSpec
}

/**
 * The capability catalogue. Every entry is *executable*: the generator reads
 * `spec` and really emits the tables / columns / apis / pages it declares,
 * so installing a capability changes the generated sub-admin.
 */
export const CAPABILITY_CATALOG: CapabilitySeed[] = [
  {
    cap_key: 'dict', name: '数据字典', icon: '📚', category: 'system', version: '1.2.0',
    summary: '枚举值集中维护，业务表下拉/标签自动联动，支持树形字典与颜色标记。',
    spec: {
      desc: '提供 sys_dict_type / sys_dict_data 两张表与 /api/dict 只读接口；建模站中 type=enum 且填写 dict 的字段自动改为读取字典。',
      tables: [
        {
          name: 'sys_dict_type', comment: '字典类型', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '字典编码', key: 'dict_key', type: 'varchar', length: 64, unique: true, required: true },
            { name: '字典名称', key: 'dict_name', type: 'varchar', length: 64, required: true },
            { name: '备注', key: 'remark', type: 'varchar', length: 255 }
          ]
        },
        {
          name: 'sys_dict_data', comment: '字典项', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '字典编码', key: 'dict_key', type: 'varchar', length: 64, required: true, indexed: true },
            { name: '标签', key: 'label', type: 'varchar', length: 64, required: true },
            { name: '值', key: 'value', type: 'varchar', length: 64, required: true },
            { name: '颜色', key: 'color', type: 'varchar', length: 16 },
            { name: '排序', key: 'sort', type: 'int', default: 0 },
            { name: '启用', key: 'status', type: 'bool', default: true }
          ]
        }
      ],
      apis: [
        { method: 'GET', path: '/api/dict/list', comment: '全部字典（登录后一次拉取，前端缓存）' },
        { method: 'GET', path: '/api/dict/data/:key', comment: '按编码取字典项' }
      ],
      pages: [{ key: 'dict', name: '数据字典', icon: '📚', route: '/admin/system/dict' }],
      config: [{ key: 'cacheSeconds', label: '字典缓存秒数', type: 'number', default: 300 }],
      verify: ['登录后 /api/dict/list 返回 200', 'enum 字段渲染为下拉且值可回显']
    }
  },
  {
    cap_key: 'log', name: '操作日志', icon: '📝', category: 'system', version: '1.1.0',
    summary: '自动记录写操作：谁、何时、改了哪条、改前改后差异。',
    spec: {
      desc: '注册 nitro 中间件拦截 POST/PUT/DELETE，落库 sys_operation_log，并提供查询页。',
      tables: [
        {
          name: 'sys_operation_log', comment: '操作日志', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '操作人', key: 'username', type: 'varchar', length: 64, indexed: true },
            { name: '模块', key: 'module', type: 'varchar', length: 64 },
            { name: '动作', key: 'action', type: 'varchar', length: 32 },
            { name: '路径', key: 'path', type: 'varchar', length: 255 },
            { name: '入参', key: 'payload', type: 'json' },
            { name: '结果', key: 'result', type: 'varchar', length: 32 },
            { name: '耗时ms', key: 'duration', type: 'int', default: 0 },
            { name: 'IP', key: 'ip', type: 'varchar', length: 64 },
            { name: '时间', key: 'created_at', type: 'datetime' }
          ]
        }
      ],
      middleware: true,
      apis: [{ method: 'GET', path: '/api/log/page', comment: '分页查询操作日志' }],
      pages: [{ key: 'log', name: '操作日志', icon: '📝', route: '/admin/system/log' }],
      config: [{ key: 'keepDays', label: '保留天数', type: 'number', default: 90 }],
      verify: ['新增一条业务数据后日志页出现记录']
    }
  },
  {
    cap_key: 'file', name: '文件上传', icon: '📎', category: 'media', version: '1.3.0',
    summary: '本地磁盘/对象存储双驱动，图片自动压缩缩略图，业务字段直接引用文件 id。',
    spec: {
      desc: '生成 sys_file 表、/api/file/upload（multipart）与静态回源；type=image/file 的字段自动切换为上传组件。',
      tables: [
        {
          name: 'sys_file', comment: '文件', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '原名', key: 'name', type: 'varchar', length: 255, required: true },
            { name: '存储键', key: 'store_key', type: 'varchar', length: 255, unique: true },
            { name: '大小', key: 'size', type: 'int' },
            { name: 'MIME', key: 'mime', type: 'varchar', length: 64 },
            { name: '类型', key: 'kind', type: 'enum', dict: 'file_kind', length: 16 },
            { name: '上传人', key: 'uploader', type: 'varchar', length: 64 },
            // Written by the upload handler and used by the static route to pick
            // the month bucket, so the column must exist.
            { name: '上传时间', key: 'created_at', type: 'datetime' }
          ]
        }
      ],
      apis: [
        { method: 'POST', path: '/api/file/upload', comment: 'multipart 上传，返回 {id,url}' },
        { method: 'DELETE', path: '/api/file/:id', comment: '删除文件与磁盘对象' }
      ],
      pages: [{ key: 'file', name: '附件管理', icon: '📎', route: '/admin/system/file' }],
      config: [
        { key: 'driver', label: '存储驱动', type: 'select', default: 'local', options: ['local', 'oss', 's3'] },
        { key: 'maxMb', label: '单文件大小上限(MB)', type: 'number', default: 20 },
        { key: 'exts', label: '允许扩展名', type: 'text', default: 'jpg,jpeg,png,gif,webp,pdf,doc,docx,xls,xlsx,zip' }
      ],
      verify: ['上传图片返回可访问 url']
    }
  },
  {
    cap_key: 'io', name: '导入导出', icon: '🔁', category: 'data', version: '1.0.2',
    summary: '列表页一键导出 CSV/Excel，按模板导入并回显校验错误行。',
    spec: {
      desc: '为每个业务模块生成 /api/{res}/export 与 /api/{res}/import，复用列表查询条件。',
      apis: [
        { method: 'GET', path: '/api/{res}/export', comment: '按当前筛选导出 CSV' },
        { method: 'POST', path: '/api/{res}/import', comment: 'CSV 导入，逐行校验并汇总错误' }
      ],
      config: [
        { key: 'format', label: '导出格式', type: 'select', default: 'csv', options: ['csv', 'xlsx'] },
        { key: 'maxRows', label: '导入最大行', type: 'number', default: 5000 }
      ],
      verify: ['导出文件行数与列表筛选结果一致']
    }
  },
  {
    cap_key: 'batch', name: '批量操作', icon: '☑️', category: 'data', version: '1.0.1',
    summary: '多选批量删除/改状态/改负责人，带二次确认与影响条数预览。',
    spec: {
      desc: '为每个业务模块生成 /api/{res}/batch，支持 delete / status / assign 三种动作。',
      apis: [{ method: 'POST', path: '/api/{res}/batch', comment: '批量动作，body={ids,action,value}' }],
      config: [{ key: 'confirm', label: '需要二次确认', type: 'switch', default: true }],
      verify: ['勾选 3 条批量删除后列表总数 -3']
    }
  },
  {
    cap_key: 'tree', name: '树形结构', icon: '🌲', category: 'data', version: '1.1.0',
    summary: '任意模块升级为父子层级：物化 path + 拖拽改父级 + 递归下拉。',
    spec: {
      desc: '给声明 tree=true 的模块注入 parent_id/path/level 列，生成 /api/{res}/tree 与树表格页面。',
      columns: [
        { name: '父级', key: 'parent_id', type: 'int', default: 0, indexed: true, formShow: false, listShow: false },
        { name: '路径', key: 'path', type: 'varchar', length: 255, default: '/', listShow: false },
        { name: '层级', key: 'level', type: 'int', default: 1, listShow: false }
      ],
      apis: [{ method: 'GET', path: '/api/{res}/tree', comment: '返回嵌套树' }],
      config: [{ key: 'maxLevel', label: '最大层级', type: 'number', default: 5 }],
      verify: ['树接口返回结构无环且根节点唯一']
    }
  },
  {
    cap_key: 'recycle', name: '回收站', icon: '🗑️', category: 'data', version: '1.0.0',
    summary: '软删除 + 还原 + 彻底清除，删除前展示关联影响。',
    spec: {
      desc: '业务表注入 deleted_at/deleted_by，列表查询默认过滤已删；生成回收站页与 /api/{res}/restore。',
      columns: [
        { name: '删除时间', key: 'deleted_at', type: 'datetime', listShow: false, formShow: false },
        { name: '删除人', key: 'deleted_by', type: 'varchar', length: 64, listShow: false, formShow: false }
      ],
      apis: [
        { method: 'POST', path: '/api/{res}/restore', comment: '还原软删记录' },
        { method: 'DELETE', path: '/api/{res}/purge/:id', comment: '彻底删除' }
      ],
      config: [{ key: 'purgeDays', label: '超期自动清除(天)', type: 'number', default: 30 }],
      verify: ['删除后记录进入回收站且可还原']
    }
  },
  {
    cap_key: 'dashboard', name: '数据看板', icon: '📊', category: 'insight', version: '1.4.0',
    summary: '首页指标卡 + 趋势图 + 占比图，聚合口径由建模站字段自动推导。',
    spec: {
      desc: '生成 /api/dashboard/summary，按模块的 int/decimal/datetime/enum 字段产出 count/sum/trend/group 指标。',
      apis: [{ method: 'GET', path: '/api/dashboard/summary', comment: '首页聚合指标' }],
      pages: [{ key: 'dashboard', name: '数据看板', icon: '📊', route: '/admin/dashboard' }],
      config: [
        { key: 'trendDays', label: '趋势天数', type: 'number', default: 30 },
        { key: 'cards', label: '指标卡数量', type: 'number', default: 4 }
      ],
      verify: ['看板指标与业务表 count(*) 一致']
    }
  },
  {
    cap_key: 'job', name: '定时任务', icon: '⏰', category: 'system', version: '1.0.0',
    summary: 'cron 表达式调度内置任务，带执行日志与手动触发。',
    spec: {
      desc: '生成 sys_job / sys_job_log 表、调度器与任务管理页；任务实现写在 server/tasks/<key>.ts。',
      tables: [
        {
          name: 'sys_job', comment: '定时任务', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '任务编码', key: 'job_key', type: 'varchar', length: 64, unique: true, required: true },
            { name: '任务名称', key: 'name', type: 'varchar', length: 64, required: true },
            { name: 'cron', key: 'cron', type: 'varchar', length: 64, required: true },
            { name: '启用', key: 'status', type: 'bool', default: true },
            { name: '上次执行', key: 'last_run_at', type: 'datetime' },
            { name: '上次结果', key: 'last_result', type: 'varchar', length: 255 }
          ]
        },
        {
          name: 'sys_job_log', comment: '任务日志', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '任务编码', key: 'job_key', type: 'varchar', length: 64, indexed: true },
            { name: '状态', key: 'status', type: 'enum', dict: 'job_status', length: 16 },
            { name: '耗时ms', key: 'duration', type: 'int' },
            { name: '输出', key: 'message', type: 'text' },
            { name: '时间', key: 'created_at', type: 'datetime' }
          ]
        }
      ],
      apis: [{ method: 'POST', path: '/api/job/run/:key', comment: '手动触发' }],
      pages: [{ key: 'job', name: '定时任务', icon: '⏰', route: '/admin/system/job' }],
      config: [{ key: 'timezone', label: '调度时区', type: 'text', default: 'Asia/Shanghai' }],
      verify: ['手动触发后 sys_job_log 新增记录']
    }
  },
  {
    cap_key: 'message', name: '站内消息', icon: '✉️', category: 'system', version: '1.0.0',
    summary: '系统通知/待办中心，支持已读回执与角标。',
    spec: {
      desc: '生成 sys_message 表、顶栏铃铛角标与消息中心页；业务 hooks 可调用 pushMessage()。',
      tables: [
        {
          name: 'sys_message', comment: '站内消息', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '接收人', key: 'to_user', type: 'varchar', length: 64, indexed: true },
            { name: '标题', key: 'title', type: 'varchar', length: 128, required: true },
            { name: '正文', key: 'content', type: 'text' },
            { name: '类别', key: 'kind', type: 'enum', dict: 'msg_kind', length: 16 },
            { name: '已读', key: 'is_read', type: 'bool', default: false },
            { name: '链接', key: 'link', type: 'varchar', length: 255 }
          ]
        }
      ],
      apis: [
        { method: 'GET', path: '/api/message/mine', comment: '我的消息' },
        { method: 'POST', path: '/api/message/read/:id', comment: '标记已读' }
      ],
      pages: [{ key: 'message', name: '消息中心', icon: '✉️', route: '/admin/system/message' }],
      config: [{ key: 'pollSeconds', label: '角标轮询秒数', type: 'number', default: 60 }],
      verify: ['pushMessage 后角标 +1']
    }
  },
  {
    cap_key: 'flow', name: '审批流', icon: '🧾', category: 'biz', version: '0.9.0',
    summary: '线性多级审批：提交→逐级通过/驳回→归档，状态机可配置。',
    spec: {
      desc: '业务表注入 flow_status/flow_node 列，生成 sys_flow_instance / sys_flow_history 与审批页。',
      columns: [
        { name: '流程状态', key: 'flow_status', type: 'enum', dict: 'flow_status', length: 16, default: 'draft' },
        { name: '当前节点', key: 'flow_node', type: 'varchar', length: 64, listShow: false }
      ],
      tables: [
        {
          name: 'sys_flow_history', comment: '审批轨迹', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '业务表', key: 'table_name', type: 'varchar', length: 64, indexed: true },
            { name: '业务主键', key: 'row_id', type: 'int' },
            { name: '节点', key: 'node', type: 'varchar', length: 64 },
            { name: '动作', key: 'action', type: 'enum', dict: 'flow_action', length: 16 },
            { name: '意见', key: 'comment', type: 'varchar', length: 512 },
            { name: '操作人', key: 'operator', type: 'varchar', length: 64 },
            { name: '时间', key: 'created_at', type: 'datetime' }
          ]
        }
      ],
      apis: [{ method: 'POST', path: '/api/{res}/flow', comment: '提交/通过/驳回，body={id,action,comment}' }],
      config: [{ key: 'nodes', label: '节点定义(逗号分隔)', type: 'text', default: '提交,部门审核,终审' }],
      verify: ['提交后状态由 draft 变为 pending']
    }
  },
  {
    cap_key: 'i18n', name: '多语言', icon: '🌐', category: 'ui', version: '1.0.0',
    summary: '中/英/日三语，菜单与字段标签走语言包，可在线补译。',
    spec: {
      desc: '生成 i18n/locales/{zh,en,ja}.ts，语言包 key 由模块与字段名自动产出，顶栏提供切换器。',
      pages: [],
      deps: ['vue-i18n'],
      config: [
        { key: 'default', label: '默认语言', type: 'select', default: 'zh', options: ['zh', 'en', 'ja'] },
        { key: 'switcher', label: '显示切换器', type: 'switch', default: true }
      ],
      verify: ['切换英文后菜单文案变化']
    }
  },
  {
    cap_key: 'security', name: '安全加固', icon: '🛡️', category: 'ui', version: '1.1.0',
    summary: '页面水印 + 登录失败锁定 + 密码强度策略 + 敏感字段脱敏。',
    spec: {
      desc: '注入 v-watermark 指令、sys_login_attempt 表与登录限流；字段 rule=sensitive 时列表脱敏显示。',
      tables: [
        {
          name: 'sys_login_attempt', comment: '登录失败计数', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '账号', key: 'username', type: 'varchar', length: 64, unique: true },
            { name: '失败次数', key: 'fails', type: 'int', default: 0 },
            { name: '锁定至', key: 'locked_until', type: 'datetime' }
          ]
        }
      ],
      config: [
        { key: 'watermark', label: '显示水印', type: 'switch', default: true },
        { key: 'maxFails', label: '最大失败次数', type: 'number', default: 5 },
        { key: 'lockMinutes', label: '锁定时长(分钟)', type: 'number', default: 15 }
      ],
      verify: ['连续错误登录后账号被临时锁定']
    }
  },
  {
    cap_key: 'print', name: '单据打印', icon: '🖨️', category: 'biz', version: '1.0.0',
    summary: '详情页一键生成打印视图，支持自定义表头与二维码。',
    spec: {
      desc: '为模块生成 /admin/{res}/print/:id 路由与打印样式，字段清单取设计站 detail 配置。',
      pages: [],
      apis: [{ method: 'GET', path: '/api/{res}/print/:id', comment: '打印数据快照' }],
      config: [{ key: 'qr', label: '显示二维码', type: 'switch', default: true }],
      verify: ['打印页在无 CSS 框架下排版正确']
    }
  },
  {
    cap_key: 'landing_poster', name: '推广海报与二码', icon: '📱', category: 'biz', version: '1.0.0',
    summary: '极简 C 端落地页，支持渠道二码、参数接收、浏览量自动统计与营销海报展示。',
    spec: {
      desc: '生成 /p/:scene 落地页与免鉴权 /api/public/landing 接口；后台列表自动增加“推广码”弹窗与复制链接。',
      tables: [
        {
          name: 'channel_scan_log', comment: '渠道扫码与浏览日志', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '渠道标识', key: 'channel_id', type: 'varchar', length: 64, indexed: true },
            { name: '访问IP', key: 'ip', type: 'varchar', length: 64 },
            { name: '浏览器UA', key: 'user_agent', type: 'varchar', length: 255 },
            { name: '扫码时间', key: 'created_at', type: 'datetime' }
          ]
        }
      ],
      columns: [
        { name: '浏览量PV', key: 'pv', type: 'int', default: 0 },
        { name: '独立访客UV', key: 'uv', type: 'int', default: 0 },
        { name: '渠道代码', key: 'channel_code', type: 'varchar', length: 64, indexed: true }
      ],
      apis: [
        { method: 'GET', path: '/api/public/landing/:scene', comment: '免鉴权获取推广落地页与渠道信息' },
        { method: 'POST', path: '/api/public/landing/scan', comment: '记录推广页浏览与扫码事件' }
      ],
      pages: [{ key: 'landing_poster', name: '推广落地页', icon: '📱', route: '/p/default' }],
      config: [
        { key: 'heroTitle', label: '落地页大标题', type: 'text', default: '全渠道推广中心' },
        { key: 'heroSubtitle', label: '副标题/宣传语', type: 'text', default: '扫码立即体验专属服务' },
        { key: 'targetModel', label: '绑定的渠道表编码', type: 'text', default: 'channel_qrcode' }
      ],
      verify: ['访问 /p/1 页面正常加载且返回渠道数据', '扫码接口正常回写统计数据']
    }
  },
  {
    cap_key: 'landing_form', name: '动态线索收集表单', icon: '📋', category: 'biz', version: '1.0.0',
    summary: '移动端自适应表单页，直接复用建模站实体字段与校验规则，免鉴权安全收集客户线索。',
    spec: {
      desc: '生成 /p/form 路由与 /api/public/submit/:model 接口；读取目标模型的字段定义自动渲染为 C 端高颜值表单。',
      apis: [
        { method: 'POST', path: '/api/public/submit/:model', comment: '免鉴权提交表单数据（带校验与频率保护）' }
      ],
      pages: [{ key: 'landing_form', name: '在线登记表单', icon: '📋', route: '/p/form' }],
      config: [
        { key: 'targetModel', label: '收集目标数据表编码', type: 'text', default: '' },
        { key: 'formTitle', label: '表单主标题', type: 'text', default: '在线业务申请登记' },
        { key: 'submitText', label: '提交按钮文案', type: 'text', default: '立即提交' },
        { key: 'successMsg', label: '提交成功提示语', type: 'text', default: '登记成功！我们将尽快与您联系。' }
      ],
      verify: ['提交 /api/public/submit 后目标数据表新增一条记录']
    }
  },
  {
    cap_key: 'landing_portal', name: '前台复合门户', icon: '🏛️', category: 'ui', version: '1.0.0',
    summary: '列表展示 + 详情卡片 + 底部留资表单的多功能前台门户，适配招聘、展品、活动等场景。',
    spec: {
      desc: '生成 /portal 路由与 /api/public/portal 接口；上部卡片列表分页浏览，下部或悬浮窗支持即时表单提交。',
      apis: [
        { method: 'GET', path: '/api/public/portal/list', comment: '免鉴权分页拉取公开业务数据列表' },
        { method: 'GET', path: '/api/public/portal/:id', comment: '免鉴权拉取单条业务详情' }
      ],
      pages: [{ key: 'landing_portal', name: '前台服务门户', icon: '🏛️', route: '/portal' }],
      config: [
        { key: 'listModel', label: '展示列表的数据表编码', type: 'text', default: '' },
        { key: 'submitModel', label: '提报表单的数据表编码', type: 'text', default: '' },
        { key: 'portalTitle', label: '门户标题', type: 'text', default: '服务咨询门户' },
        { key: 'titleField', label: '展示卡片主标题字段（可选，默认智能推导）', type: 'text', default: '' },
        { key: 'descField', label: '展示卡片描述字段（可选，默认智能推导）', type: 'text', default: '' }
      ],
      verify: ['访问 /portal 正常拉取业务列表数据并展示详情']
    }
  },
  {
    cap_key: 'landing_cms', name: '纯静态企业官网与内容CMS', icon: '📰', category: 'ui', version: '2.0.0',
    summary: '纯静态预渲染多页面品牌官网布局与CMS，零水合延迟/秒开无闪烁，内置Hero焦点屏、服务成效指标、核心优势矩阵、垂直专区、资讯发布与内联/独立双模阅读。',
    spec: {
      desc: '生成 cms_article 表、后台文章管理页、纯静态 /cms 官网路由、纯静态 /cms/:id 详情路由与只读文章接口，预置高质感行业静态数据集，秒开零白屏。',
      tables: [
        {
          name: 'cms_article', comment: '官网文章资讯', fields: [
            { name: '主键', key: 'id', type: 'id' },
            { name: '文章标题', key: 'title', type: 'varchar', length: 128, required: true, indexed: true },
            { name: '栏目分类', key: 'category', type: 'varchar', length: 64, default: '新闻公告' },
            { name: '摘要简介', key: 'summary', type: 'varchar', length: 255 },
            { name: '封面图', key: 'cover', type: 'image' },
            { name: '正文内容', key: 'content', type: 'text' },
            { name: '浏览量', key: 'views', type: 'int', default: 0 },
            { name: '发布状态', key: 'status', type: 'bool', default: true },
            { name: '发布时间', key: 'created_at', type: 'datetime' }
          ]
        }
      ],
      apis: [
        { method: 'GET', path: '/api/public/cms/articles', comment: '免鉴权获取官网公开文章列表' },
        { method: 'GET', path: '/api/public/cms/article/:id', comment: '免鉴权获取单篇官网文章正文' }
      ],
      pages: [
        { key: 'landing_cms', name: '纯静态官网首页', icon: '📰', route: '/cms' },
        { key: 'cms_article', name: '文章资讯管理', icon: '📝', route: '/admin/cms/article' }
      ],
      config: [
        { key: 'siteName', label: '官网品牌名称', type: 'text' },
        { key: 'siteSlogan', label: '品牌口号/标语', type: 'text' },
        { key: 'contactPhone', label: '客服咨询热线', type: 'text', default: '400-888-9999' },
        { key: 'contactEmail', label: '商务联系邮箱', type: 'text', default: 'service@example.com' },
        { key: 'address', label: '办公或院区地址', type: 'text', default: '高新科技产业园区数智创新大厦 18 层' },
        { key: 'icp', label: '网站备案号', type: 'text', default: '京ICP备20260915号-1' }
      ],
      verify: ['访问 /cms 纯静态秒开无骨架屏', '支持内联抽屉与独立详情页查看资讯', '后台文章管理发布后可增量同步'],
      intent: buildCmsSiteIntent
    }
  }
]
