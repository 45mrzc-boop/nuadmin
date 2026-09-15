import { isReservedWord } from '../_lib'

export interface NluTenant { id: number, slug: string, name: string }
export interface NluCap { cap_key: string, name: string, summary: string }
export interface NluModule {
  id: number
  tenant_id: number
  name: string
  res_key: string
  table_name: string
  fields?: Array<{ key: string, name: string }>
}

export interface NluContext {
  tenantId: number | null
  tenants: NluTenant[]
  caps: NluCap[]
  modules: NluModule[]
}

export interface NluField {
  name: string
  key: string
  type: string
  length?: number
  precision?: number
  required?: boolean
  unique?: boolean
  indexed?: boolean
  default?: string
  dict?: string
  ref?: string
  remark?: string
  listShow?: boolean
}

export interface NluAction {
  intent: 'model' | 'capability' | 'design' | 'logic' | 'seed' | 'gen' | 'verify' | 'chat'
  tenantId: number | null
  payload: Record<string, unknown> | null
  reply: string
}

const TYPE_WORDS = [
  'id', 'varchar', 'text', 'richtext', 'int', 'decimal', 'money', 'date', 'datetime',
  'bool', 'enum', 'json', 'fk', 'file', 'image'
]

function dict(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of source.split(/\s+/).filter(Boolean)) {
    const i = pair.indexOf(':')
    if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1)
  }
  return out
}

/** 中文业务词 -> 英文列名（解析器靠它把「上架状态」写成 on_sale_status）。 */
const FIELD_WORDS: Record<string, string> = dict(`
名称:name 姓名:real_name 标题:title 价格:price 单价:unit_price 总价:total_price 原价:original_price
市场价:market_price 金额:amount 数量:quantity 件数:count 库存:stock 重量:weight 体积:volume
尺寸:size 颜色:color 规格:spec 型号:model 品牌:brand 单位:unit 状态:status 类型:type 类别:kind
分类:category 等级:level 级别:level 来源:source 渠道:channel 方式:method 描述:description
简介:intro 内容:content 正文:body 详情:detail 摘要:summary 备注:remark 说明:note 评论:comment
评价:review 评分:score 积分:points 点赞:likes 收藏:favorites 浏览:views 阅读:read_count
图片:image 主图:main_image 封面:cover 轮播:carousel 相册:album 头像:avatar 图标:icon
二维码:qrcode 文件:file 附件:attachment 文档:document 素材:material 视频:video 音频:audio
富文本:richtext 配置:config 属性:attrs 扩展:extra 参数:params 标签:tags 关键词:keywords
链接:link 网址:url 地址:address 省份:province 城市:city 区县:district 邮编:zipcode
经度:longitude 纬度:latitude 国家:country 地区:region 手机号:phone 电话:tel 邮箱:email
传真:fax 账号:account 用户名:username 密码:password 昵称:nickname 性别:gender 年龄:age
生日:birthday 身份证:id_card 联系人:contact_name 联系电话:contact_phone 公司:company
部门:department 职位:position 岗位:post 角色:role 权限:permission 菜单:menu 字典:dict
排序:sort 序号:seq_no 编号:code 编码:code 流水号:serial_no 版本:version 语言:lang 时区:timezone
时间:time 日期:date 创建人:creator 修改人:editor 简称:short_name 全称:full_name 英文名:en_name
单价类型:price_type 起始:start_point 终点:end_point 上架:on_sale 下架:off_sale 启用:enabled
禁用:forbidden 默认:is_default 已支付:paid 未支付:unpaid 审核:audit_status 审批:approval_status
提交:submitted 发货:shipped 收货:received 退款:refund_amount 实付:paid_amount 结算:settlement
余额:balance 剩余:remaining 总计:total_amount 父级:parent 上级:parent 子级:children
文本:text 字符串:string 数字:number 开关:switch_value IP:ip 设备:device 终端:terminal
浏览器:browser 操作系统:os 备注说明:remark_info
`)

/** 中文业务词 -> 表名（已避开 MySQL 保留字）。 */
const TABLE_WORDS: Record<string, string> = dict(`
商品:goods 产品:product 订单:order_info 用户:user 客户:customer 会员:member 员工:staff
部门:department 角色:role 菜单:menu 权限:permission 字典:dict 分类:category 品牌:brand
店铺:shop 门店:store 仓库:warehouse 库存:inventory 供应商:supplier 采购:purchase
销售:sale 合同:contract 项目:project 任务:task 工单:ticket 日程:schedule 会议:meeting
文章:article 资讯:news 公告:notice 评论:comment 评价:review 反馈:feedback 标签:tag
活动:campaign 优惠券:coupon 积分:point 账单:bill 发票:invoice 支付:payment 退款:refund
物流:shipment 地址:address 地区:region 城市:city 国家:country 图片:picture 文件:file
附件:attachment 视频:video 音频:audio 直播:live 课程:course 学生:student 教师:teacher
班级:clazz 考试:exam 成绩:score 题目:question 题库:question_bank 试卷:exam_paper
科室:clinic 患者:patient 医生:doctor 挂号:registration 处方:prescription 药品:medicine
设备:device 巡检:inspection 报警:alarm 车辆:vehicle 线路:route 座位:seat 车票:travel_ticket
酒店:hotel 房间:room 预订:booking 餐厅:restaurant 菜品:dish 桌台:dining_table
渠道:channel 媒体:media 内容:content 页面:page 表单:form 模板:template 主题:theme
站点:site 域名:domain 密钥:secret_key 日志:operation_log 配置:setting 版本:release
消息:message 待办:todo 审批:approval 流程:flow 组织架构:org 岗位:position 薪资:salary
考勤:attendance 报销:expense 资产:asset 耗材:consumable 报价:quotation 询价:inquiry
`)

const CAP_ALIASES: Record<string, string> = dict(`
字典:dict 数据字典:dict 日志:log 操作日志:log 审计:log 文件:file 上传:file 附件:file
导入:io 导出:io 导入导出:io excel:io csv:io 批量:batch 多选:batch 树:tree 树形:tree
树表:tree 分类树:tree 回收站:recycle 还原:recycle 软删除:recycle 看板:dashboard 报表:dashboard
图表:dashboard 统计:dashboard 定时:job 定时任务:job 跑批:job 消息:message 站内信:message
通知:message 审批:flow 流程:flow 工作流:flow 多语言:i18n 语言:i18n 国际化:i18n 安全:security
水印:security 脱敏:security 登录锁定:security 打印:print 单据:print
`)

const WORD_KEYS = [...new Set([...Object.keys(FIELD_WORDS), ...Object.keys(TABLE_WORDS)])]
  .sort((a, b) => b.length - a.length)

// ------------------------------------------------------------------ normalise

const norm = (s: string): string => (s || '')
  .replace(/[，、]/g, ',')
  .replace(/[；]/g, ';')
  .replace(/[：]/g, ':')
  .replace(/[（]/g, '(')
  .replace(/[）]/g, ')')
  .replace(/[。！?？]/g, ' ')
  .replace(/[“”‘’]/g, '"')
  .replace(/\s+/g, ' ')
  .trim()

const CUT = /(?:然后|接着|再帮我|再给|并且|同时|最后|顺带|之后)/

const has = (text: string, ...words: string[]): boolean => words.some(w => text.includes(w))

/** 正则捕获组在 noUncheckedIndexedAccess 下是 string|undefined，统一兜底。 */
const grp = (m: RegExpExecArray | RegExpMatchArray, i: number): string => m[i] ?? ''
const isReserved = isReservedWord
const asciiSnake = (s: string): string =>
  s.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()
const camelOf = (word: string): string => asciiSnake(word).split('_').filter(Boolean)
  .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1))).join('')

function dedupe(base: string, taken: Set<string>, sep = ''): string {
  let v = base
  for (let i = 2; taken.has(v); i++) v = `${base}${sep}${i}`
  return v
}

/**
 * 中文短语 -> 英文 snake：整词命中直接用，否则逐字贪心拼装。
 *
 * complete=false 表示拼装过程中**丢过字**（比如「创建时间」里「创建」不在词表，
 * 只剩 time）。这种结果不能当作可信翻译——它既丢了语义又会和别的标签撞名，
 * 调用方必须提示用户手填，所以这里把 complete 一起返回。
 */
function enWordsInfo(phrase: string): { word: string, complete: boolean } {
  const cleaned = phrase.replace(/[的了吗呢啊吧]/g, '').replace(/\s+/g, '')
  const direct = FIELD_WORDS[cleaned] ?? TABLE_WORDS[cleaned]
  if (direct) return { word: direct, complete: true }
  // 只有整串都是 ASCII 才能走快路径。之前只看首字符，「E2E渠道类型」会被
  // asciiSnake 砍成 e2e（非 ASCII 全被当分隔符吃掉），既丢了语义又谎报命中。
  if (/^[\x00-\x7F]+$/.test(cleaned)) {
    const s = asciiSnake(cleaned)
    return { word: s || 'item', complete: !!s }
  }

  const parts: string[] = []
  let rest = cleaned
  let complete = true
  while (rest.length) {
    // 中英混排里的 ASCII 段整体当一个词，别逐字丢。
    const ascii = /^[A-Za-z][A-Za-z0-9]*/.exec(rest)
    if (ascii) {
      parts.push(asciiSnake(ascii[0]))
      rest = rest.slice(ascii[0].length)
      continue
    }
    const key = WORD_KEYS.find(k => rest.startsWith(k))
    if (key) {
      const word = FIELD_WORDS[key] ?? TABLE_WORDS[key]
      if (word) parts.push(word)
      else complete = false
      rest = rest.slice(key.length)
    } else {
      complete = false
      rest = rest.slice(1)
    }
  }
  return { word: parts.filter(Boolean).join('_') || 'item', complete }
}

function enWords(phrase: string): string {
  return enWordsInfo(phrase).word
}

function safeIdent(word: string): string {
  const v = (word || 'item').replace(/[^a-z0-9_]/g, '').replace(/^(\d)/, 'c$1')
  if (!v) return 'item'
  return isReserved(v) ? `biz_${v}` : v
}

/** 词表命中不了时用稳定的短哈希，绝不退化成 item。 */
function zhHash(s: string): string {
  let h = 2166136261
  for (const ch of s) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(36).slice(0, 6)
}

/**
 * 中文标签 -> 英文列名。建模站字段表单的「自动填充」用的就是这条，
 * 与 AI 建表走同一套词表和同一个去重规则，避免两个入口给出不同的名字。
 *
 * matched=false 表示词表没命中、退化成短哈希（`c1z9k3`），
 * 调用方要提示用户手填，别把哈希名直接塞进业务表。
 */
export function deriveIdent(label: string, taken: string[] = []): { key: string, matched: boolean } {
  const name = String(label ?? '').trim()
  if (!name) return { key: '', matched: false }
  const { word, complete } = enWordsInfo(name)
  const guess = safeIdent(word)
  // 丢过字的结果不可信：宁可让用户手填，也不要给出一个语义残缺还会撞名的列名。
  const matched = complete && word !== 'item'
  return { key: dedupe(matched ? guess : `c${zhHash(name)}`, new Set(taken), '_'), matched }
}

function tableNameOf(name: string): string {
  const bare = name.replace(/(表|信息|档案|管理|中心|列表|单|数据)$/g, '')
  const word = enWords(bare) === 'item' ? enWords(name) : enWords(bare)
  return safeIdent(word === 'item' ? `c${zhHash(name)}` : word)
}

/** 与平台 `resKeyOf(name, tableName)` 同义，只是这里已经拿到了 snake 表名。 */
function resKeyFrom(table: string, name: string): string {
  const camel = camelOf(table !== 'item' ? table : (asciiSnake(name) || 'item'))
  return /^[a-z]/.test(camel) ? camel : `res${camel.charAt(0).toUpperCase()}${camel.slice(1)}`
}

// ------------------------------------------------------------------ type + field

function explicitType(token: string): { type: string, length?: number, precision?: number } | null {
  const lower = token.toLowerCase()
  for (const t of TYPE_WORDS) {
    const re = new RegExp(`\\b${t}\\b\\s*(?:\\(\\s*(\\d+)\\s*(?:,\\s*(\\d+)\\s*)?\\))?`)
    const m = re.exec(lower)
    if (!m) continue
    const out: { type: string, length?: number, precision?: number } = { type: t }
    if (m[1]) out.length = Number(m[1])
    if (m[2]) out.precision = Number(m[2])
    return out
  }
  return null
}

function stripType(token: string): string {
  return token.toLowerCase()
    .replace(/\b(id|varchar|text|richtext|int|decimal|money|date|datetime|bool|enum|json|fk|file|image)\b\s*(\([^)]*\))?/g, ' ')
    .replace(/\s+/g, '')
}

function guessType(phrase: string): string {
  if (has(phrase, '富文本', '富内容', '编辑器')) return 'richtext'
  if (has(phrase, '价格', '金额', '单价', '总价', '费用', '成本', '运费', '退款', '薪资', '工资', '小计', '优惠', '报价')) return 'money'
  if (has(phrase, '数量', '库存', '次数', '年龄', '排序', '序号', '权重', '积分', '点赞', '浏览', '评分', '件数', '总计', '级别', '等级', '个数', '大小', '时长', '座次')) return 'int'
  if (has(phrase, '是否', '上架', '下架', '启用', '禁用', '开关', '默认', '已支付', '已读', '命中', '允许', '禁止', '显示', '勾选')) return 'bool'
  if (has(phrase, '状态', '类型', '类别', '分类', '来源', '渠道', '方式', '性别', '币种', '语言', '级别', '档位')) return 'enum'
  if (has(phrase, '日期', '生日', '截止', '有效期', '到期', '年月日')) return 'date'
  if (has(phrase, '时间', '时刻', '创建', '更新', '发布', '下单', '支付于', '于')) return 'datetime'
  if (has(phrase, '内容', '详情', '描述', '备注', '说明', '简介', '正文', '摘要', '评论', '评价', '反馈', '原因')) return 'text'
  if (has(phrase, '配置', '扩展', '属性', '参数', '额外')) return 'json'
  if (has(phrase, '头像', '封面', '主图', '图片', '照片', '相册', '轮播', '二维码', '图')) return 'image'
  if (has(phrase, '文件', '附件', '文档', '素材')) return 'file'
  if (has(phrase, '关联', '所属', '外键', '上级', '父级')) return 'fk'
  if (/(id|编号|主键)$/i.test(phrase)) return 'varchar'
  return 'varchar'
}

function lengthFor(type: string, name: string): number | undefined {
  if (type === 'varchar') {
    if (has(name, '手机号', '电话', '手机', '传真')) return 20
    if (has(name, '邮箱')) return 128
    if (has(name, '身份证')) return 18
    if (has(name, '链接', '网址', '地址', '备注', '描述', '说明')) return 255
    if (has(name, '标题', '名称')) return 128
    return 64
  }
  if (type === 'enum') return 32
  if (type === 'fk') return undefined
  return undefined
}

function parseFieldToken(rawToken: string, table: string, taken: Set<string>): NluField | null {
  let s = rawToken.trim().replace(/^[的有]/g, '')
  if (!s || s.length > 40 || CUT.test(s) || isNoise(s)) return null
  s = s.replace(/^(字段|属性|包含|包括|如下|有)(名|名称)?[:：]?/, '').trim()
  if (!s || has(s, '安装', '卸载', '生成', '验证', '造数据', '删除', '回滚', '启动')) return null

  let required = false
  let unique = false
  let indexed = false
  let hidden = false
  if (has(s, '必填', '不能为空', '必选', 'required')) required = true
  if (has(s, '唯一', '不重复', '去重', 'unique')) unique = true
  if (has(s, '索引', 'indexed')) indexed = true
  if (has(s, '不显示', '隐藏', '列表隐藏')) hidden = true
  s = s.replace(/(必填|不能为空|必选|required|唯一|不重复|去重|unique|索引|不显示|列表隐藏|隐藏)/g, ' ')

  let def: string | undefined
  const dm = /默认[:：]?\s*([^,;\s]+)/.exec(s)
  if (dm) {
    def = grp(dm, 1)
    s = s.replace(grp(dm, 0), ' ')
  }
  let dictKey: string | undefined
  const cm = /字?典[:：]?\s*([a-z][a-z0-9_-]*)/i.exec(s)
  if (cm) {
    dictKey = grp(cm, 1)
    s = s.replace(grp(cm, 0), ' ')
  }
  let ref: string | undefined
  const rm = /(?:关联|引用|外键)\s*([A-Za-z][A-Za-z0-9_]*|[一-龥]{2,10})/.exec(s)
  if (rm) {
    const word = grp(rm, 1)
    ref = /^[A-Za-z]/.test(word) ? asciiSnake(word) : tableNameOf(word)
    s = s.replace(grp(rm, 0), ' ')
  }
  const options = /\(([^)]{1,80})\)/.exec(s)
  let enumOptions: string[] | undefined
  // `decimal(12,2)` 是类型参数，不是枚举值
  const optionText = options ? grp(options, 1) : ''
  if (options && optionText && !/^[\d.,\s]+$/.test(optionText) && !TYPE_WORDS.includes(optionText.toLowerCase())) {
    enumOptions = optionText.split(/[,;|]/).map(x => x.trim()).filter(Boolean)
    s = s.replace(grp(options, 0), ' ')
  }

  const ex = explicitType(s)
  const name = stripType(s).replace(/[,;\s]+/g, '')
  if (!name || name.length > 20) return null

  const type = ex?.type ?? (ref ? 'fk' : guessType(name))
  const guess = safeIdent(enWords(name))
  const key = dedupe(guess === 'item' ? `c${zhHash(name)}` : guess, taken, '_')
  taken.add(key)

  const field: NluField = { name, key, type }
  const length = ex?.length ?? lengthFor(type, name)
  if (length) field.length = length
  if (ex?.precision !== undefined) field.precision = ex.precision
  if (type === 'decimal' || type === 'money') field.precision = ex?.precision ?? 2
  if (required) field.required = true
  if (unique) field.unique = true
  if (indexed || type === 'fk') field.indexed = true
  if (def !== undefined) field.default = def
  if (type === 'enum') field.dict = dictKey ?? `${table}_${key}`
  else if (dictKey) field.dict = dictKey
  if (type === 'fk') field.ref = ref ?? safeIdent(enWords(name.replace(/(ID|id|外键|关联|所属)$/, '')) || 'item')
  if (hidden) field.listShow = false
  if (enumOptions?.length) field.remark = `可选值 ${enumOptions.join('/')}`
  return field
}

// ------------------------------------------------------------------ extractors

const FIELD_MARKERS = ['字段有', '字段如下', '包含字段', '字段包括', '属性有', '字段', '属性', '包含', '包括']

function fieldSegment(text: string): string {
  for (const marker of FIELD_MARKERS) {
    const i = text.indexOf(marker)
    if (i < 0) continue
    const rest = text.slice(i + marker.length).replace(/^[:\s的有]+/, '')
    if (rest) return rest.split(CUT)[0] ?? ''
  }
  return ''
}

function splitFields(segment: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of segment) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if ((ch === ',' || ch === ';') && depth === 0) {
      if (buf.trim()) out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** 名字里的量词前缀：「建一张分类树」→ 分类树。 */
function trimQuantifier(name: string): string {
  return name.replace(/^(一个|一张|一只|一批|一套|一支|个|张|只|批|套|条)/, '').trim()
}

const NOISE = /(?:^|\s)(?:造|灌|来)\s*\d*\s*(?:条|行|个)?\s*(?:假|测试|模拟|示例)?数据|安装|生成|验证|回滚|启动/

function isNoise(token: string): boolean {
  return NOISE.test(token) || /(\d+)\s*(?:条|行)\s*(?:假|测试|模拟|示例|的)?数据/.test(token)
}

function moduleNameOf(text: string): string | null {
  const quoted = /["'「『]([^"'」』]{1,24})["'」』]/.exec(text)
  const named = quoted ? trimQuantifier(grp(quoted, 1).trim()) : ''
  const re = /(?:建|新增|新建|创建|添加|增加|设计|做|来|给我建)(?:一个|一只|一张|一支|个|套|一套)?\s*["'「『]?([一-龥A-Za-z0-9_-]{2,20}?)["'」』]?\s*(?:表|模型|模块|实体|结构|页面)/
  const m = re.exec(text)
  if (m) return trimQuantifier(grp(m, 1))
  if (named && has(text, '表', '字段', '模型', '模块')) return named
  const loose = /(?:建|新增|新建|创建|添加)(?:一个|一只|一张|个)?\s*([一-龥]{2,10})(?=[,;]|$)/.exec(text)
  if (loose && has(text, '字段')) return trimQuantifier(grp(loose, 1))
  return null
}

function groupNameOf(text: string): string | null {
  const m = /(?:放在|归到|归入|加入|挂到|属于)\s*["'「『]?([^"'」』,;]{1,20}?)["'」』]?\s*(?:分组|菜单|目录|分类下|组)/.exec(text)
  if (m) return grp(m, 1).trim()
  const g = /分组\s*[:=]?\s*["'「『]?([^"'」』,;]{1,20})/.exec(text)
  return g ? grp(g, 1).trim() : null
}

function moduleRef(text: string, modules: NluModule[]): NluModule | null {
  let best: NluModule | null = null
  for (const m of modules) {
    for (const token of [m.name, m.res_key, m.table_name]) {
      if (!token || !text.includes(token)) continue
      if (!best || token.length > (best.name?.length ?? 0)) best = m
    }
  }
  return best
}

/**
 * 把「价格」「商品价格」「price」这类说法落到该模型真实存在的列上。
 * 解析不出来时返回 snake 猜测值，由 apply 阶段决定丢弃还是报错。
 */
function resolveFieldKey(token: string, target: NluModule | null): string {
  const raw = token.trim()
  const fields = target?.fields ?? []
  const snake = safeIdent(enWords(raw))
  const hit = fields.find(f => f.key === raw)
    ?? fields.find(f => f.name === raw)
    ?? fields.find(f => f.key === snake)
    ?? fields.find(f => f.name && (raw.endsWith(f.name) || f.name.endsWith(raw)))
    ?? fields.find(f => raw.toLowerCase().replace(/\s+/g, '') === f.key)
  return hit ? hit.key : snake
}

function capRefs(text: string, caps: NluCap[]): string[] {
  const found = new Set<string>()
  for (const c of caps) {
    if (text.includes(c.cap_key) || text.includes(c.name)) found.add(c.cap_key)
  }
  for (const [alias, key] of Object.entries(CAP_ALIASES)) {
    if (text.includes(alias) && caps.some(c => c.cap_key === key)) found.add(key)
  }
  return [...found]
}

// ------------------------------------------------------------------ analyze

export function analyze(content: string, ctx: NluContext): NluAction {
  const text = norm(content)
  if (!text) {
    return { intent: 'chat', tenantId: ctx.tenantId, payload: null, reply: '没收到内容，说说你想做什么，比如「建一个商品表，字段有名称、价格、上架状态」。' }
  }

  const tenant = ctx.tenants.find(t => text.includes(t.name) || text.includes(t.slug)) ?? null
  const tenantId = tenant ? tenant.id : ctx.tenantId
  const caps = ctx.caps
  const modules = ctx.modules.filter(m => !tenantId || m.tenant_id === tenantId)

  if (has(text, '卸载', '移除', '停用', '关掉', '去掉') && capRefs(text, caps).length) {
    const keys = capRefs(text, caps)
    return {
      intent: 'capability', tenantId,
      payload: { op: 'uninstall', capKeys: keys },
      reply: `将从子后台移除能力：${keys.join('、')}（不会删除已生成的业务数据，重新生成后生效）。`
    }
  }

  if (has(text, '安装', '装', '启用', '开启', '加上', '加一个', '引入', '来一个', '支持') && capRefs(text, caps).length
    && !has(text, '字段')) {
    const keys = capRefs(text, caps)
    const names = keys.map(k => caps.find(c => c.cap_key === k)?.name ?? k)
    return {
      intent: 'capability', tenantId,
      payload: { op: 'install', capKeys: keys },
      reply: `准备为子后台安装能力：${names.join('、')}（${keys.join(', ')}）。点「执行」即写入能力库。`
    }
  }

  const name = moduleNameOf(text)
  if (name) {
    const takenTables = new Set(modules.map(m => m.table_name))
    const takenRes = new Set(modules.map(m => m.res_key))
    const table = dedupe(tableNameOf(name), takenTables)
    const resKey = dedupe(resKeyFrom(table, name), takenRes)
    takenTables.add(table)
    takenRes.add(resKey)

    const keys = new Set<string>()
    const fields = splitFields(fieldSegment(text))
      .map(t => parseFieldToken(t, table, keys))
      .filter((f): f is NluField => !!f)
    if (!fields.some(f => f.type === 'id' || f.key === 'id')) {
      fields.unshift({ name: '主键', key: 'id', type: 'id' })
    }

    // 「订单明细」里的「订单」是已存在的模型，补外键比再造一张 orders 表更有用
    for (const other of ctx.modules) {
      if (other.tenant_id === tenantId && other.name && name.includes(other.name) && other.name !== name) {
        fields.push({ name: other.name, key: `${other.table_name}_id`, type: 'fk', ref: other.table_name, indexed: true })
      }
    }

    const alsoCaps = capRefs(text.split(CUT)[1] ?? text, caps)
    const seedMatch = /(\d+)\s*(?:条|行|个)\s*(?:假|测试|模拟|示例)?数据/.exec(text)
    const payload: Record<string, unknown> = {
      group: groupNameOf(text) || '默认分组',
      module: {
        name, key: resKey, tableName: table,
        icon: iconFor(name), comment: `${name}管理`
      },
      fields,
      capabilities: alsoCaps,
      seed: seedMatch ? { rows: Number(seedMatch[1]), enabled: true, rules: {} } : undefined,
      generate: /生成|出码|落盘/.test(text) && !has(text, '数据')
    }
    const fieldText = fields.filter(f => f.key !== 'id').map(f => `${f.name}(${f.key}:${f.type})`).join('、') || '（未解析到字段，只建表）'
    const extras = [
      alsoCaps.length ? `并安装能力 ${alsoCaps.join('、')}` : '',
      seedMatch ? `造 ${seedMatch[1]} 条假数据` : '',
      payload.generate ? '随后调用生成站出码' : ''
    ].filter(Boolean).join('，')
    return {
      intent: 'model', tenantId, payload,
      reply: `解析出模型「${name}」→ 表 ${table} / 资源 ${resKey}，字段：${fieldText}${extras ? '，' + extras : ''}。点「执行」写入建模站。`
    }
  }

  if (has(text, '造数据', '假数据', '模拟数据', '示例数据', '灌数据', '生成数据', '测试数据')
    || /(\d+)\s*条\s*(?:数据|记录)/.test(text)) {
    const target = moduleRef(text, modules)
    const off = has(text, '不要', '别', '关闭', '取消')
    const rows = off ? 0 : Number((/(\d+)\s*条/.exec(text) ?? [])[1] ?? 20)
    const rules: Record<string, string> = {}
    for (const r of text.matchAll(/([一-龥A-Za-z_]{2,12})\s*(?:用|为|=|:)\s*([a-z]+\([^)]*\))/g)) {
      rules[resolveFieldKey(grp(r, 1), target)] = grp(r, 2)
    }
    return {
      intent: 'seed', tenantId,
      payload: {
        moduleId: target?.id ?? null, moduleName: target?.name ?? null,
        seed: { rows, enabled: !off, rules }
      },
      reply: target
        ? `将为模型「${target.name}」${off ? '关闭' : `生成 ${rows} 条`}种子数据${Object.keys(rules).length ? `，字段规则：${JSON.stringify(rules)}` : ''}（生成时写入 INSERT）。`
        : `没有指明是哪个模型，请补上模型名（现有：${modules.map(m => m.name).join('、') || '暂无模型'}）。`
    }
  }

  if (/每页\s*\d+\s*条|列表|表格|表单|弹窗|抽屉|斑马纹|菜单位|图标|显示顺序|字段顺序|详情页/.test(text)) {
    const target = moduleRef(text, modules)
    if (target) {
      const design = designPatch(text, target)
      if (Object.keys(design).length) {
        return {
          intent: 'design', tenantId,
          payload: { moduleId: target.id, moduleName: target.name, design },
          reply: `将更新模型「${target.name}」的设计稿：${JSON.stringify(design)}。`
        }
      }
    }
  }

  if (has(text, '校验', '规则', '钩子', '接口', '必须大于', '不能超过', '必须小于', '回调', '触发')
    || /必填/.test(text)) {
    const target = moduleRef(text, modules)
    const logic = logicPatch(text, target)
    if (target && logic) {
      return {
        intent: 'logic', tenantId,
        payload: { moduleId: target.id, moduleName: target.name, logic },
        reply: `将为模型「${target.name}」写入逻辑：${JSON.stringify(logic)}。`
      }
    }
  }

  if (has(text, '验证', '校验一下', '自检', '跑测试', '测一测', '检查生成结果')) {
    return { intent: 'verify', tenantId, payload: {}, reply: '将调用验证站，对生成产物跑一遍检查用例。' }
  }
  if (has(text, '生成', '出码', '落盘', '发布', '生成代码', '开始生成', '重新生成')) {
    return {
      intent: 'gen', tenantId, payload: { note: text.slice(0, 200) },
      reply: '将调用生成站生成独立子后台工程（模型/能力/设计/逻辑/种子都会落盘）。'
    }
  }

  const capOnly = capRefs(text, caps)
  if (capOnly.length) {
    return {
      intent: 'capability', tenantId, payload: { op: 'install', capKeys: capOnly },
      reply: `你想装的能力是 ${capOnly.join('、')} 吗？确认后点「执行」。`
    }
  }

  return {
    intent: 'chat', tenantId, payload: null,
    reply: [
      '我可以驱动其它工位，试试这些说法：',
      '· 建一个商品表，字段有名称、价格、库存、上架状态，再造 50 条数据',
      '· 给商品表装数据字典和导入导出',
      '· 商品列表每页 20 条，只显示名称、价格、上架状态',
      '· 商品价格必须大于 0',
      '· 生成子后台',
      tenantId ? '' : '（当前会话没有绑定子后台，可以在新建会话时选择，或在句子里点名子后台）'
    ].filter(Boolean).join('\n')
  }
}

const ICON_WORDS: Record<string, string> = dict(`
商品:🛒 订单:🧾 用户:👤 客户:🤝 员工:🧑‍💼 部门:🏬 课程:🎓 学生:🧑‍🎓 医生:🩺 患者:🛏️
文章:📄 资讯:📰 财务:💰 账单:🧮 库存:📦 仓库:🏭 设备:🔧 车辆:🚚 酒店:🏨 餐厅:🍽️
消息:✉️ 审批:✅ 流程:🧭 报表:📊 看板:📈 文件:📎 图片:🖼️ 视频:🎬 合同:📑 活动:🎉
`)

function iconFor(name: string): string {
  for (const [k, v] of Object.entries(ICON_WORDS)) if (name.includes(k)) return v
  return '📄'
}

function designPatch(text: string, target: NluModule | null): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  const list: Record<string, unknown> = {}
  const form: Record<string, unknown> = {}
  const menu: Record<string, unknown> = {}

  const pageSize = /每页\s*(\d+)\s*条/.exec(text)
  if (pageSize) list.pageSize = Math.min(200, Math.max(1, Number(grp(pageSize, 1))))

  // 字段清单是逗号分隔的：取最后一个「显示/展示」之后的内容，遇到下一条指令就停
  const showAt = ['只显示', '展示', '显示'].map(w => ({ w, i: text.lastIndexOf(w) }))
    .filter(x => x.i >= 0).sort((a, b) => b.i - a.i)[0]
  if (showAt) {
    const after = (text.slice(showAt.i + showAt.w.length).replace(/^[:=为是的字段列\s]+/, '')).split(CUT)[0] ?? ''
    const items: string[] = []
    for (const token of splitFields(after)) {
      if (/每页|表单|表格|双列|单列|两列|弹窗|抽屉|斑马纹|导出|菜单|图标|宽度|详情|造|数据|生成|安装|装|校验|必须/.test(token)) break
      const key = resolveFieldKey(token.replace(/(列|字段)$/, ''), target)
      if (key && key !== 'item') items.push(key)
    }
    if (items.length) {
      if (/表单/.test(text.slice(0, showAt.i))) form.fields = items
      else list.columns = items
    }
  }

  if (/双列|两列/.test(text)) form.layout = 'double'
  if (/单列/.test(text)) form.layout = 'single'
  if (/分组布局|多段/.test(text)) form.layout = 'group'
  if (/弹窗|对话框/.test(text)) form.dialog = true
  if (/抽屉|侧滑/.test(text)) form.dialog = false
  const width = /宽度\s*(\d+)/.exec(text)
  if (width) form.width = Number(grp(width, 1))
  if (/不要斑马纹|关闭斑马纹/.test(text)) list.striped = false
  else if (/斑马纹/.test(text)) list.striped = true
  if (/不导出|关闭导出|去掉导出|不要导出/.test(text)) list.exportable = false
  else if (/可导出|要导出|加导出/.test(text)) list.exportable = true
  if (/不显示详情|关闭详情|不要详情/.test(text)) list.actions = ['create', 'edit', 'delete']
  if (/隐藏菜单|菜单不显示/.test(text)) menu.hidden = true
  else if (/显示菜单/.test(text)) menu.hidden = false
  const icon = /图标\s*[:=]?\s*(\S{1,4})/.exec(text)
  if (icon) menu.icon = grp(icon, 1)
  const rowKey = /主键\s*(?:用|为|[:=])\s*([a-z][a-z0-9_]*)/i.exec(text)
  if (rowKey) list.rowKey = resolveFieldKey(grp(rowKey, 1), target)

  if (Object.keys(list).length) patch.list = list
  if (Object.keys(form).length) patch.form = form
  if (Object.keys(menu).length) patch.menu = menu
  return patch
}

function logicPatch(text: string, target: NluModule | null): Record<string, unknown> | null {
  const out: Record<string, unknown> = {}
  const validators: Array<Record<string, string>> = []
  const hooks: Array<Record<string, unknown>> = []
  const endpoints: Array<Record<string, unknown>> = []

  const gt = /([一-龥A-Za-z_]{2,12})(?:必须|要|需)大于\s*(-?\d+(?:\.\d+)?)/.exec(text)
  if (gt) {
    validators.push({
      field: resolveFieldKey(grp(gt, 1), target), expr: `> ${grp(gt, 2)}`,
      message: `${grp(gt, 1)}必须大于${grp(gt, 2)}`
    })
  }
  const lt = /([一-龥A-Za-z_]{2,12})(?:必须|要|需)(?:小于|不超过|不能超过)\s*(-?\d+(?:\.\d+)?)/.exec(text)
  if (lt) {
    validators.push({
      field: resolveFieldKey(grp(lt, 1), target), expr: `< ${grp(lt, 2)}`,
      message: `${grp(lt, 1)}必须小于${grp(lt, 2)}`
    })
  }
  const req = /([一-龥]{2,12})必填/.exec(text)
  if (req) validators.push({ field: resolveFieldKey(grp(req, 1), target), expr: 'required', message: `${grp(req, 1)}不能为空` })
  const len = /([一-龥]{2,12})(?:最长|最多)\s*(\d+)\s*(?:个)?字/.exec(text)
  if (len) validators.push({ field: resolveFieldKey(grp(len, 1), target), expr: `maxLength ${grp(len, 2)}`, message: `${grp(len, 1)}最多 ${grp(len, 2)} 个字符` })

  const hookMap: Record<string, string> = {
    beforeCreate: '新增前', afterCreate: '新增后', beforeUpdate: '修改前', afterUpdate: '修改后',
    beforeDelete: '删除前', afterDelete: '删除后', beforeList: '查询前', afterList: '查询后', export: '导出前'
  }
  for (const [name, words] of Object.entries(hookMap)) {
    if (has(text, words)) hooks.push({ name, enabled: true })
  }
  const api = /(get|post|put|patch|delete)\s+(\/[A-Za-z0-9_\-/:]+)/i.exec(text)
  if (api) {
    endpoints.push({ method: grp(api, 1).toUpperCase(), path: grp(api, 2), comment: text.slice(0, 60), code: '', perm: '' })
  }

  if (validators.length) out.validators = validators
  if (hooks.length) out.hooks = hooks
  if (endpoints.length) out.endpoints = endpoints
  return Object.keys(out).length ? out : null
}

/**
 * 本文件是 /api/ai/chat 的规则引擎，不是路由。nitro 会把 server/api/** 下的每个 .ts 都登记成
 * 懒加载路由，所以这里显式拒绝，避免误访问时抛「Invalid lazy handler result」。
 */
export default defineEventHandler(() => {
  throw createError({ statusCode: 405, message: '内部共享模块，不提供 HTTP 访问' })
})
