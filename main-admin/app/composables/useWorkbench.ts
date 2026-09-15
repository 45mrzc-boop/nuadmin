export interface Workbench {
  tenantId: number
  tenant: Record<string, any>
  groups: any[]
  modules: any[]
  caps: any[]
  /** 控制面字典定义（含条目与 usedBy），字段表单的「关联字典 / 枚举值」读这份。 */
  dicts: any[]
  reload: () => Promise<void>
}

export function useWb(): Workbench {
  const wb = inject<Workbench>('wb')
  if (!wb) throw new Error('工作台上下文缺失：站点组件必须在 /wb/[id] 下渲染')
  return wb
}

/** Grouped menu/module picker shared by 设计站/逻辑站/数据站. */
export function useModulePicker() {
  const wb = useWb()
  const current = useState<number>('wb.currentModule', () => 0)
  const flat = computed(() => wb.modules)
  const module = computed(() => flat.value[current.value] ?? flat.value[0] ?? null)
  const select = (i: number) => { current.value = i }
  return { wb, flat, module, current, select }
}
