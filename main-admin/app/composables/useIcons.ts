/**
 * 建模库可选图标集。
 *
 * 这里刻意用「精选集 + 手输兜底」而不是把 lucide 全量 1700+ 名字打进前端：
 * 全量列表会显著增大主后台 bundle，而后台模块图标的需求高度集中。
 * 找不到合适的再在图标框里直接输入 i-lucide-xxx。
 */
export const ICON_GROUPS: { label: string, icons: string[] }[] = [
  {
    label: '业务对象',
    icons: ['package', 'boxes', 'shopping-cart', 'shopping-bag', 'store', 'building-2', 'briefcase', 'id-card', 'contact', 'users', 'user-round', 'shield-check', 'badge-check', 'clipboard-list', 'file-text', 'folder', 'folder-tree', 'archive', 'tag', 'tags']
  },
  {
    label: '数据与统计',
    icons: ['database', 'server', 'table', 'pie-chart', 'bar-chart-3', 'line-chart', 'activity', 'gauge', 'trending-up', 'trending-down', 'hash', 'calculator', 'git-branch', 'network', 'workflow']
  },
  {
    label: '沟通与内容',
    icons: ['message-square', 'messages-square', 'mail', 'inbox', 'send', 'megaphone', 'newspaper', 'rss', 'bookmark', 'star', 'heart', 'thumbs-up', 'at-sign', 'bell']
  },
  {
    label: '设备与现场',
    icons: ['smartphone', 'tablet', 'monitor', 'printer', 'camera', 'video', 'qr-code', 'barcode', 'nfc', 'wrench', 'hard-drive', 'cpu', 'zap', 'plug', 'droplets', 'flame', 'thermometer', 'gauge-circle']
  },
  {
    label: '地图与出行',
    icons: ['map', 'map-pin', 'compass', 'navigation', 'route', 'car', 'truck', 'ship', 'plane', 'train-front', 'footprints', 'signpost']
  },
  {
    label: '安全与运维',
    icons: ['shield', 'lock', 'unlock', 'key-round', 'fingerprint', 'eye', 'scan-line', 'bug', 'terminal', 'settings', 'sliders-horizontal', 'refresh-cw', 'rotate-cw', 'power', 'alert-triangle', 'circle-check', 'circle-x', 'circle-alert', 'clock', 'calendar', 'calendar-days', 'history']
  },
  {
    label: '人员与组织',
    icons: ['user', 'users-round', 'circle-user', 'headset', 'stethoscope', 'graduation-cap', 'briefcase-medical', 'handshake', 'git-commit-vertical', 'list-tree', 'layers', 'puzzle']
  },
  {
    label: '财务与流程',
    icons: ['wallet', 'credit-card', 'banknote', 'coins', 'receipt', 'scale', 'percent', 'arrow-right-left', 'file-check', 'file-spreadsheet', 'file-input', 'upload', 'download', 'search', 'filter', 'more-horizontal']
  }
]

/** 全部图标名（去重），供搜索与校验用。 */
export const ALL_ICONS: string[] = [...new Set(ICON_GROUPS.flatMap(g => g.icons))]

/** 图标值 → 可直接给 UIcon 用的名字；emoji 等原样返回交给调用方兜底。 */
export function toIconName(v: unknown): string {
  const raw = String(v ?? '').trim()
  if (!raw) return 'i-lucide-square'
  if (raw.startsWith('i-')) return raw
  const bare = raw.replace(/^lucide[:-]/, '')
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(bare)) return `i-lucide-${bare}`
  return raw
}

/** 是不是图标名（而非 emoji 文本）。 */
export const isIconName = (v: unknown) => /^i-lucide-[a-z0-9-]+$/.test(toIconName(v)) && !String(v ?? '').match(/[^\x00-\x7F]/)
