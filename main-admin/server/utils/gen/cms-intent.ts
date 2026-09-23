import type { PageBlock, SiteIntent } from '../../../shared/intent'
import type { TenantPlan } from './types'

export function capCfg(p: TenantPlan, cap: string, key: string, dflt: unknown): unknown {
  const v = p.caps?.[cap]?.config?.[key]
  return v === undefined || v === null || v === '' ? dflt : v
}

/**
 * 构建 landing_cms 纯净页面意图图纸 (SiteIntent)
 * 遵循四大禁令：无 CSS 样式/单位、无布局引擎词、无引擎私有节点名、无引擎私有动作。
 */
export function buildCmsSiteIntent(p: TenantPlan): SiteIntent {
  const isMedical = /医|诊|药|挂号|就医|体检|护士|病|康复|卫生/.test((p.title || '') + ' ' + (p.description || ''))
  const rawSiteName = capCfg(p, 'landing_cms', 'siteName', '')
  const siteName = (rawSiteName && rawSiteName !== '企业官方网站') ? String(rawSiteName) : (p.title || '企业官方网站')
  const defaultSlogan = isMedical ? '精医厚德 · 科技赋能 · 提供全天候高品质便民医疗服务' : '连接未来 · 科技驱动 · 赋能企业全链路数字化转型'
  const rawSlogan = capCfg(p, 'landing_cms', 'siteSlogan', '')
  const siteSlogan = (rawSlogan && rawSlogan !== '连接未来，赋能企业数字化') ? String(rawSlogan) : defaultSlogan
  const contactPhone = String(capCfg(p, 'landing_cms', 'contactPhone', '400-888-9999'))
  const contactEmail = String(capCfg(p, 'landing_cms', 'contactEmail', 'service@example.com'))
  const address = String(capCfg(p, 'landing_cms', 'address', '高新科技产业园区数智创新大厦 18 层'))
  const icp = String(capCfg(p, 'landing_cms', 'icp', '京ICP备20260915号-1'))

  const features = isMedical ? [
    { title: '智能预约挂号', text: '分时段精准预约，提前规划就医行程，减少现场等候。', icon: 'stethoscope' },
    { title: '名医专家门诊', text: '多学科权威专家领衔，提供全方位高质量诊疗保障。', icon: 'doctor' },
    { title: '便民报告速查', text: '检验检查结果秒级同步，支持移动端随时查阅调阅。', icon: 'report' },
    { title: '健康档案管理', text: '电子健康记录全程留痕，构建终身连续的健康管理体系。', icon: 'hospital' }
  ] : [
    { title: '确定性极速编译', text: '底层毫秒级工业编译，告别黑盒与慢速启动。', icon: 'bolt' },
    { title: 'Casbin零信任门禁', text: '多租户RBAC细粒度权限管控，保护核心业务资产。', icon: 'shield' },
    { title: '双端业务全闭环', text: 'B端集中管控与C端快速获客无缝衔接，实现数据互通。', icon: 'sync' },
    { title: '开箱即用高扩展', text: '模块化能力随心装配，支持持续低成本演进升级。', icon: 'package' }
  ]

  const steps = isMedical ? [
    { stepNumber: 1, title: '分时预约挂号', text: '线上实时选择科室与意向名医，选定精准就诊时间段并锁定号源。' },
    { stepNumber: 2, title: '智能自助签到', text: '就医当日凭就诊码或身份证在院内自助机或手机上一键报到候诊。' },
    { stepNumber: 3, title: '专家规范诊疗', text: '权威专家面对面精准诊疗，依据临床路径制定个性化诊疗方案。' },
    { stepNumber: 4, title: '云端查单取药', text: '移动端秒级调阅化验与检查报告，手机端无感结算后快速取药。' }
  ] : [
    { stepNumber: 1, title: '业务需求对齐', text: '与架构师深入研讨业务实体与角色权限，秒级生成声明式图纸模型。' },
    { stepNumber: 2, title: '毫秒编译生成', text: '基于确定性工业代工厂架构，一键编译前后端全链路无黑盒代码。' },
    { stepNumber: 3, title: '独立库表部署', text: '多租户物理分库与Casbin权限树就绪，零污染构建企业专属系统。' },
    { stepNumber: 4, title: '双端闭环运营', text: '微页面全渠道获客与后台数据对账实时联动，实现业务持续增长。' }
  ]

  const faqs = isMedical ? [
    { q: '就诊需要提前多久预约？', a: '医院全面推行分时段精准预约，建议提前1至7天通过平台挂号。每日上午8:00准时开放最新号源。' },
    { q: '检验与检查报告多久能在手机端查询？', a: '常规生化、血常规通常在采样后30-60分钟出具；放射与超声检查在检查完成后2小时内秒级推送到您的健康中心。' },
    { q: '异地医保患者是否可以直接在线报销结算？', a: '可以。我院已全面接通全国异地就医直接结算平台，出示医保电子凭证即可实时扣减统筹与个人账户基金。' }
  ] : [
    { q: '系统生成的代码能否脱离主控制台独立运行？', a: '完全可以。每个租户为独立的 Nuxt 4 + MySQL 工程，拥有独立的依赖与生命周期，删掉主控制台仍可独立运行。' },
    { q: '多租户权限与数据安全是如何保障的？', a: '底层采用 Casbin 细粒度 RBAC 权限引擎，配合物理独立子库隔离与 Fail-Closed 门禁设计，彻底杜绝越权与数据泄漏。' },
    { q: '页面意图（Page Intent）与可视化画布如何协同？', a: '图纸与画布共享同一份声明式 Page Intent 结构，AI 生成与人工拖拽互不冲突，保持单一真理源。' }
  ]

  const articles = isMedical ? [
    {
      title: '全面推行数字化分时段预约挂号：看病就医无需排队',
      meta: '就医指南',
      text: '为进一步缩短患者门诊就医等候时间，我院全科室全面开通精准至30分钟的分时段线上挂号与自助签到服务。',
      tags: ['便民挂号', '智慧就医'],
      action: { kind: 'navigate' as const, page: '/cms/1' }
    },
    {
      title: '特聘权威专家名医团队每周专科门诊排班公告',
      meta: '名医专家',
      text: '本月起特邀心血管内科、神经内科、骨科及妇产科领域顶尖学科带头人定期出诊，号源每周一早8点准时同步开放。',
      tags: ['名医出诊', '专家门诊'],
      action: { kind: 'navigate' as const, page: '/cms/2' }
    },
    {
      title: '便民新举措：线上健康档案建立与检验报告即时查询',
      meta: '便民服务',
      text: '市民完成实名认证后即可建立终身电子健康档案，血液化验、医学影像、超声报告出具后秒级同步推送。',
      tags: ['电子档案', '报告查询'],
      action: { kind: 'navigate' as const, page: '/cms/3' }
    }
  ] : [
    {
      title: '新一代企业级低代码数字中台解决方案正式发布',
      meta: '产品更新',
      text: '基于确定性工业级代码编译架构，实现数据建模、权限设计、业务流程与前台门户秒级闭环，大幅降本增效。',
      tags: ['中台发布', '技术创新'],
      action: { kind: 'navigate' as const, page: '/cms/1' }
    },
    {
      title: '企业数据安全与Casbin细粒度权限管控白皮书',
      meta: '技术白皮书',
      text: '深度解析基于RBAC+Casbin多租户资源隔离与Fail-Closed安全门禁机制，护航企业级核心资产。',
      tags: ['数据安全', 'Casbin'],
      action: { kind: 'navigate' as const, page: '/cms/2' }
    },
    {
      title: 'B+C 双端业务协同闭环：从后台运营到前台转化的实践',
      meta: '行业案例',
      text: '如何通过带参渠道活码、动态表单与免鉴权微页面构建前台用户高转化、后台数据实时对账的业务闭环。',
      tags: ['双端协同', '最佳实践'],
      action: { kind: 'navigate' as const, page: '/cms/3' }
    }
  ]

  const stats = isMedical ? [
    { label: '出诊科室', value: '30+' },
    { label: '专家名医', value: '120+' },
    { label: '年服务人次', value: '50万+' },
    { label: '患者满意度', value: '99.2%' }
  ] : [
    { label: '落地应用', value: '500+' },
    { label: '提效幅度', value: '95%' },
    { label: '服务企业', value: '1000+' },
    { label: '稳定运行', value: '99.9%' }
  ]

  // 变体生产者：根据租户行业特征与配置动态装配变体（医疗场景：左右分栏+边框矩阵+卡片CTA；通用/科技场景：居中大屏+卡片网格+横条CTA）
  const heroVariant = (capCfg(p, 'landing_cms', 'heroVariant', isMedical ? 'split' : 'centered') as any) || (isMedical ? 'split' : 'centered')
  const headerVariant = (capCfg(p, 'landing_cms', 'headerVariant', 'bar') as any) || 'bar'
  const featureVariant = (capCfg(p, 'landing_cms', 'featureVariant', isMedical ? 'bordered' : 'cards') as any) || (isMedical ? 'bordered' : 'cards')
  const ctaVariant = (capCfg(p, 'landing_cms', 'ctaVariant', isMedical ? 'card' : 'band') as any) || (isMedical ? 'card' : 'band')
  const rawDensity = (capCfg(p, 'landing_cms', 'density', p.theme?.density || 'normal') as any)
  const density = ['compact', 'normal', 'airy'].includes(rawDensity) ? rawDensity : 'normal'

  const homeBlocks: PageBlock[] = [
    {
      kind: 'header',
      variant: headerVariant,
      brand: { name: siteName, title: siteSlogan },
      links: [
        { label: '首页', action: { kind: 'navigate', page: '/cms' } },
        { label: '资讯动态', action: { kind: 'navigate', page: '/cms' } },
        { label: '后台管理', action: { kind: 'navigate', page: '/admin' } }
      ],
      action: { label: isMedical ? '就医咨询' : '在线咨询', action: { kind: 'openForm', form: 'inquiry' } }
    },
    {
      kind: 'hero',
      variant: heroVariant,
      density,
      eyebrow: isMedical ? '精医厚德 · 守护健康' : '科技赋能 · 智领未来',
      title: siteName,
      text: siteSlogan,
      stats,
      action: { label: isMedical ? '立即挂号咨询' : '立即咨询', action: { kind: 'openForm', form: 'inquiry' } }
    },
    {
      kind: 'section',
      density,
      title: isMedical ? '特色医疗服务' : '核心服务矩阵',
      subtitle: isMedical ? '全方位、全周期的优质医疗保障体系' : '全链路数智化解决方案与专业服务支持',
      body: {
        kind: 'featureGrid',
        variant: featureVariant,
        features
      }
    },
    {
      kind: 'section',
      density,
      title: isMedical ? '就医全流程指南' : '数智中台交付流程',
      subtitle: isMedical ? '标准化就医指引，省时省心更高效' : '四步极速交付，业务秒级上线运行',
      body: {
        kind: 'stepList',
        steps
      }
    },
    {
      kind: 'section',
      density,
      title: '最新资讯动态',
      subtitle: '权威资讯、重要公告与行业深度动态',
      body: {
        kind: 'mediaList',
        rows: articles
      }
    },
    {
      kind: 'section',
      density,
      title: isMedical ? '常见就医咨询解答' : '常见技术与架构答疑',
      subtitle: '针对高频关注问题提供详尽解答与操作指引',
      body: {
        kind: 'faqList',
        faqs
      }
    },
    {
      kind: 'cta',
      variant: ctaVariant,
      title: isMedical ? '需要专业的健康指导或预约咨询？' : '开启您的数字化转型新征程',
      text: '我们的专业团队随时准备为您提供全方位的支持与解答。',
      action: { label: isMedical ? '预约就医服务' : '即刻联系我们', action: { kind: 'openForm', form: 'inquiry' } }
    },
    {
      kind: 'overlayForm',
      id: 'inquiry',
      title: '业务咨询与留言预约',
      subtitle: '请填写您的联系方式，我们将于1个工作日内与您联系',
      fields: [
        { key: 'name', label: '您的称呼', type: 'text', required: true },
        { key: 'phone', label: '联系电话', type: 'tel', required: true },
        { key: 'content', label: '咨询需求说明', type: 'textarea', required: false }
      ],
      submitText: '提交预约',
      cancelText: '取消'
    },
    {
      kind: 'footer',
      lines: [
        siteName + ' 版权所有 © 2026',
        'ICP备案号：' + icp
      ],
      contact: {
        phone: contactPhone,
        email: contactEmail,
        address,
        icp
      }
    },
    {
      kind: 'tabbar',
      current: 'home',
      tabs: [
        { id: 'home', label: '首页', icon: 'home', action: { kind: 'navigate', page: '/cms' } },
        { id: 'services', label: isMedical ? '特色专科' : '核心矩阵', icon: 'service', action: { kind: 'navigate', page: '/cms' } },
        { id: 'news', label: '动态资讯', icon: 'news', action: { kind: 'navigate', page: '/cms' } },
        { id: 'contact', label: isMedical ? '就医预约' : '在线咨询', icon: 'chat', action: { kind: 'openForm', form: 'inquiry' } }
      ]
    }
  ]

  return {
    siteName,
    pages: [
      {
        id: 'cms-home',
        name: siteName + ' - 官网首页',
        route: '/cms',
        blocks: homeBlocks
      }
    ]
  }
}
