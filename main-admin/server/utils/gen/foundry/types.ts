import type { PageIntent, SiteIntent } from '../../../../shared/intent'
import type { TenantPlan } from '../types'

export interface ComponentGroupItem {
  type: string
  text: string
  icon?: string
}

export interface ComponentGroup {
  title: string
  items: ComponentGroupItem[]
}

/**
 * 代工厂契约 (Foundry Contract)
 * 渲染底座是一个代工厂包：包含编译器 (compiler) + 物料包 (materials) + 可选画布 (canvas) + 运行时 (runtime)。
 */
export interface Foundry {
  /** 代工厂唯一标识符，如 'tmagic' | 'nuxtui' */
  readonly id: string
  /** 厂商显示名称 */
  readonly label: string

  /** 核心编译器：将单张 PageIntent 图纸转译为代工厂原生节点结构 (如 tmagic 节点树) */
  compilePage(page: PageIntent, ctx?: { tenant?: TenantPlan }): unknown

  /** 将站点所有图纸与物料包编译输出为要落盘到租户工程的物理文件字典 */
  emitFiles(site: SiteIntent, tenant: TenantPlan): Record<string, string>

  /** 可选低代码画布支持定义 */
  materialGroups?: ComponentGroup[]
  propsConfigs?: Record<string, unknown>
  propsValues?: Record<string, unknown>
  eventMethodList?: Record<string, unknown>
}
