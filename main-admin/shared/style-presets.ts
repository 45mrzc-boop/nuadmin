import type { SkinId } from './skins'

export interface StylePreset {
  key: string
  name: string
  industry: string
  desc: string
  skin: SkinId
  palette: string
  primary: string
  radius: number
  collapseMode: 'icon' | 'hidden'
  loginTpl: 'split' | 'card' | 'simple'
  layout: 'side' | 'top'
  density: 'normal' | 'compact'
  striped: boolean
  formLayout: 'single' | 'double'
  tags: string[]
}

/**
 * GenPlus 工业级实战风格库预设矩阵
 * 每套风格预设完整贯通：皮肤规范、调色板、物理圆角、侧栏折叠模式、登录页形态、布局与表单密度
 */
export const STYLE_PRESETS: StylePreset[] = [
  {
    key: 'medical-health',
    name: '智慧医疗 · 纯净水青',
    industry: '医疗卫生 / 挂号问诊 / 体检康复 / 药品健康',
    desc: '水滴胶囊 · 护眼清爽 · 大留白 · 双列弹窗 · 极简圆润',
    skin: 'macos-droplet',
    palette: 'teal',
    primary: '#12b3a6',
    radius: 999,
    collapseMode: 'icon',
    loginTpl: 'split',
    layout: 'side',
    density: 'normal',
    striped: true,
    formLayout: 'double',
    tags: ['医疗', '健康', '医院', '挂号', '诊所', '体检', '药房']
  },
  {
    key: 'tech-saas',
    name: '科技中台 · 现代系统蓝',
    industry: '通用 SaaS / 企业中台 / 协作协同 / 数字化转型',
    desc: '毛玻璃质感 · 现代系统蓝 · 10px圆角 · 轻投影 · 弹性侧栏',
    skin: 'macos-modern',
    palette: 'blue',
    primary: '#0a84ff',
    radius: 10,
    collapseMode: 'icon',
    loginTpl: 'card',
    layout: 'side',
    density: 'normal',
    striped: true,
    formLayout: 'double',
    tags: ['科技', 'SaaS', '互联网', '软件', '办公', '平台', '中台']
  },
  {
    key: 'fin-bank',
    name: '金融风控 · 严谨藏青',
    industry: '银行证券 / 风险管控 / 资产对账 / 审计结算',
    desc: '严谨编排 · 经典藏青 · 4px微圆角 · 高密度紧凑 · 稳重防错',
    skin: 'macos-arranged',
    palette: 'navy',
    primary: '#0a6fd6',
    radius: 4,
    collapseMode: 'icon',
    loginTpl: 'split',
    layout: 'side',
    density: 'compact',
    striped: true,
    formLayout: 'single',
    tags: ['金融', '银行', '证券', '信贷', '风控', '资产', '财务', '对账']
  },
  {
    key: 'gov-affairs',
    name: '党政国企 · 沉稳赤红',
    industry: '党政机关 / 国企协同 / 公文流转 / 权威考评',
    desc: '庄重大气 · 赤红印章 · 严格栅格 · 稳健排布 · 权威沉稳',
    skin: 'macos-arranged',
    palette: 'crimson',
    primary: '#d70015',
    radius: 4,
    collapseMode: 'icon',
    loginTpl: 'card',
    layout: 'side',
    density: 'normal',
    striped: false,
    formLayout: 'double',
    tags: ['政府', '党建', '国企', '公文', '审批', '纪检', '考评', '政务']
  },
  {
    key: 'ops-monitor',
    name: '极客运维 · 玄黑高抗',
    industry: '运维监控 / 开发者平台 / 容器指标 / 物联网告警',
    desc: '玄黑极速 · 零圆角零投影 · 极致高对比 · 100%全宽隐藏侧栏 · 极客纯粹',
    skin: 'flat',
    palette: 'slate',
    primary: '#111827',
    radius: 0,
    collapseMode: 'hidden',
    loginTpl: 'simple',
    layout: 'side',
    density: 'compact',
    striped: true,
    formLayout: 'double',
    tags: ['运维', '监控', 'DevOps', '服务器', '探针', '指标', '告警', '日志', '极客']
  },
  {
    key: 'retail-brand',
    name: '新零售 · 蜜橙活力',
    industry: '会员商城 / 连锁餐饮 / 新零售 / 营销活动私域',
    desc: '蜜橙活力 · 胶囊水滴 · 饱满生机 · 促销转化 · 亲和热情',
    skin: 'macos-droplet',
    palette: 'honey',
    primary: '#f59e0b',
    radius: 999,
    collapseMode: 'icon',
    loginTpl: 'card',
    layout: 'side',
    density: 'normal',
    striped: true,
    formLayout: 'double',
    tags: ['电商', '零售', '会员', '积分', '外卖', '餐饮', '私域', '活动']
  },
  {
    key: 'creative-studio',
    name: '潮流先锋 · 丁香玻璃拟态',
    industry: '文化创意 / 设计工作室 / 潮流展演 / 数字艺术',
    desc: '玻璃拟态 · 丁香粉紫 · 16px柔润 · 半透明光斑 · 梦幻先锋',
    skin: 'glass',
    palette: 'lilac',
    primary: '#a78bfa',
    radius: 16,
    collapseMode: 'icon',
    loginTpl: 'card',
    layout: 'side',
    density: 'normal',
    striped: false,
    formLayout: 'double',
    tags: ['创意', '设计', '艺术', '摄影', '元宇宙', '展会', '文创', '社交']
  },
  {
    key: 'energy-industrial',
    name: '工业智造 · 现代草绿',
    industry: '智能制造 / 设备巡检 / 水务水利 / 绿色能源MES',
    desc: '工业草绿 · 现代耐看 · 环保智能 · 设备资产 · 清晰耐用',
    skin: 'macos-modern',
    palette: 'green',
    primary: '#30d158',
    radius: 8,
    collapseMode: 'icon',
    loginTpl: 'split',
    layout: 'side',
    density: 'compact',
    striped: true,
    formLayout: 'double',
    tags: ['工业', '制造', '设备', '能源', '水务', '光伏', 'MES', '工厂', '巡检']
  }
]

/**
 * 根据行业关键词、业务描述自动推断最匹配的实战风格预设
 */
export function inferStylePreset(query: string = ''): StylePreset {
  const q = String(query).toLowerCase().trim()
  if (!q) return STYLE_PRESETS[1] // 默认 tech-saas

  for (const preset of STYLE_PRESETS) {
    if (preset.key === q || preset.name.toLowerCase().includes(q)) return preset
    for (const t of preset.tags) {
      if (q.includes(t.toLowerCase())) return preset
    }
  }

  // 正则兜底推断
  if (/医|诊|药|挂号|就医|体检|护士|病|康复|卫生/.test(q)) return STYLE_PRESETS[0] // medical-health
  if (/融|银|证|财|贷|险|对账|票据|汇|审计/.test(q)) return STYLE_PRESETS[2] // fin-bank
  if (/政|党|委|检|察|协|公文|公章|纪检|考评/.test(q)) return STYLE_PRESETS[3] // gov-affairs
  if (/运维|监控|探针|服务器|容器|k8s|日志|告警|devops/.test(q)) return STYLE_PRESETS[4] // ops-monitor
  if (/店|商城|零售|会员|点单|外卖|餐|积分|分销|券/.test(q)) return STYLE_PRESETS[5] // retail-brand
  if (/设计|艺术|影|创|展|媒|画|文创|虚拟/.test(q)) return STYLE_PRESETS[6] // creative-studio
  if (/工|造|机|备|设备|能源|光伏|电|水|厂|mes|巡检/.test(q)) return STYLE_PRESETS[7] // energy-industrial

  return STYLE_PRESETS[1] // tech-saas
}
