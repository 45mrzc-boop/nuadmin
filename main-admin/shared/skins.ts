/**
 * 皮肤与配色的唯一来源。
 *
 * 主后台的风格实战库（/styles）和子后台生成器都从这里取，物理上不可能各写一套。
 * 之前 7 套皮肤只活在 styles.vue 的 <style> 里，是给演示框手画的（.tl-dot/.panel 这些
 * 演示专用类），生成出来的子后台是真实 Nuxt UI 组件，搬过去一行都不会生效。
 *
 * 这里刻意不用 [data-slot='card'] 之类的选择器：实测 Nuxt UI v4 渲染出的 slot 名是
 * root/body/header/item…，并没有 card/sidebar/navbar，按组件名猜 slot 只会得到死 CSS。
 * 结构层改挂在生成布局自己打的 data-gen 标记上，元素层用原生标签兜底。
 */

export type SkinId =
  | 'macos-modern' | 'macos-arranged' | 'macos-droplet' | 'macos-retro'
  | 'material' | 'flat' | 'glass'

export type Palette = { id: string, name: string, accent: string, fg: string }

export const DEFAULT_SKIN: SkinId = 'macos-modern'

/**
 * 默认暗色表面基准色（实测 Nuxt UI neutral-900 为 slate-900 #0f172a）。
 * 用于设计系统 dark 模式与 WCAG AA 对比度数学推导。
 */
export const DEFAULT_DARK_BG = '#0f172a'

export const SKINS: Array<{ id: SkinId, group: string, name: string, hint: string }> = [
  { id: 'macos-modern', group: 'macOS', name: '现代', hint: '毛玻璃侧栏 · 系统蓝 · 10px 圆角 · 轻投影' },
  { id: 'macos-arranged', group: 'macOS', name: '编排', hint: '严格栅格 · 细分隔线 · 单强调色 · 高密度' },
  { id: 'macos-droplet', group: 'macOS', name: '水滴', hint: '全胶囊控件 · 高光渐变 · 大留白' },
  { id: 'macos-retro', group: 'macOS', name: '复古', hint: 'Aqua 斜角 · 厚边框 · 米灰金属底盘' },
  { id: 'material', group: 'Google', name: 'Material Design', hint: '海拔投影 · 大圆角卡片 · 色调表面' },
  { id: 'flat', group: '通用', name: '扁平化', hint: '零投影 · 零圆角 · 硬边框 · 高对比色块' },
  { id: 'glass', group: '通用', name: '玻璃拟态', hint: '背景渐变光斑 · 半透明面板 · 细高光描边' }
]

/** 每套皮肤自带几个和它气质相配的配色，选皮肤后再选色。 */
export const PALETTES: Record<SkinId, Palette[]> = {
  'macos-modern': [
    { id: 'blue', name: '系统蓝', accent: '#0a84ff', fg: '#fff' },
    { id: 'indigo', name: '靛紫', accent: '#5e5ce6', fg: '#fff' },
    { id: 'cyan', name: '青蓝', accent: '#32ade6', fg: '#08324a' },
    { id: 'pink', name: '粉红', accent: '#ff375f', fg: '#fff' },
    { id: 'green', name: '草绿', accent: '#30d158', fg: '#06310f' }
  ],
  'macos-arranged': [
    { id: 'ink', name: '墨黑', accent: '#1d1d1f', fg: '#fff' },
    { id: 'navy', name: '藏青', accent: '#0a6fd6', fg: '#fff' },
    { id: 'crimson', name: '赤红', accent: '#d70015', fg: '#fff' },
    { id: 'amber', name: '琥珀', accent: '#b25000', fg: '#fff' }
  ],
  'macos-droplet': [
    { id: 'indigo', name: '靛蓝', accent: '#4f7dff', fg: '#fff' },
    { id: 'magenta', name: '洋红', accent: '#d946a6', fg: '#fff' },
    { id: 'teal', name: '水青', accent: '#12b3a6', fg: '#03302c' },
    { id: 'honey', name: '蜜橙', accent: '#f59e0b', fg: '#3d2500' }
  ],
  'macos-retro': [
    { id: 'aqua', name: 'Aqua 蓝', accent: '#2f6fd0', fg: '#fff' },
    { id: 'moss', name: '苔绿', accent: '#3a7d44', fg: '#fff' },
    { id: 'brick', name: '砖红', accent: '#a4442c', fg: '#fff' },
    { id: 'graphite', name: '石墨', accent: '#3b3a36', fg: '#fff' }
  ],
  material: [
    { id: 'violet', name: 'M3 紫', accent: '#6750a4', fg: '#fff' },
    { id: 'ocean', name: '海蓝', accent: '#006397', fg: '#fff' },
    { id: 'mint', name: '薄荷', accent: '#006a60', fg: '#fff' },
    { id: 'berry', name: '莓红', accent: '#984061', fg: '#fff' }
  ],
  flat: [
    { id: 'blue', name: '纯蓝', accent: '#2563eb', fg: '#fff' },
    { id: 'red', name: '正红', accent: '#dc2626', fg: '#fff' },
    { id: 'emerald', name: '翠绿', accent: '#059669', fg: '#fff' },
    { id: 'slate', name: '玄黑', accent: '#111827', fg: '#fff' },
    { id: 'orange', name: '亮橙', accent: '#ea580c', fg: '#fff' }
  ],
  glass: [
    { id: 'frost', name: '霜蓝', accent: '#8ea2c0', fg: '#101521' },
    { id: 'sky', name: '天青', accent: '#38bdf8', fg: '#0c2a44' },
    { id: 'rose', name: '藕荷', accent: '#f472b6', fg: '#4a1030' },
    { id: 'lilac', name: '丁香', accent: '#a78bfa', fg: '#241454' }
  ]
}

export const isSkin = (v: unknown): v is SkinId =>
  SKINS.some(s => s.id === String(v))

export const palettesOf = (skin: unknown): Palette[] =>
  PALETTES[(isSkin(skin) ? skin : DEFAULT_SKIN) as SkinId] ?? []

export const findPalette = (skin: unknown, id: unknown): Palette | undefined =>
  palettesOf(skin).find(p => p.id === String(id))

/** 皮肤自带的默认圆角：设计站没显式改过圆角时用它，避免所有皮肤一个圆法。 */
const RADIUS: Record<SkinId, number> = {
  'macos-modern': 10, 'macos-arranged': 4, 'macos-droplet': 999,
  'macos-retro': 6, material: 16, flat: 0, glass: 16
}
export const skinRadius = (skin: unknown): number =>
  RADIUS[(isSkin(skin) ? skin : DEFAULT_SKIN) as SkinId] ?? 10

/* ══════════════════════════════════════════════════════════════════
 * 以下变量与角色 CSS 是从 /styles 画廊原样抽出的，不是重新设计。
 * 画廊与生成的子后台共用这一份，所以「选了就是那个样子」是结构上保证的，
 * 不靠两边各自维护一份相似实现（那正是之前漂移的原因）。
 * ══════════════════════════════════════════════════════════════════ */

/** 基座（= macOS·现代）：画廊里写在 .skin-frame 自身上。 */
export const SKIN_BASE_VARS = "--r: 10px; --r-md: 8px; --r-sm: 7px; --r-pill: 999px; --bg: #f5f5f7; --bg-dark: #0f172a; --panel: #ffffff; --side: rgba(246,246,248,.78); --line: rgba(0,0,0,.09); --line-strong: rgba(0,0,0,.14); --text: #1d1d1f; --muted: #6e6e73; --side-fg: var(--text); --side-muted: var(--muted); --accent: #0a84ff; --accent-fg: #fff; --shadow: 0 1px 2px rgba(0,0,0,.05), 0 6px 20px rgba(0,0,0,.06); --blur: saturate(180%) blur(20px); --pad: 14px; --row-h: 40px; --fs: 13px; --gap: 10px; --frame-r: calc(var(--r) + 4px); --grad: none; --btn-grad: none; --inset: none; border: 1px solid var(--line-strong); border-radius: var(--frame-r, var(--r)); background: var(--bg); color: var(--text); font-size: var(--fs); overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.14);"

/** 暗色基座变量：暗色模式下接管浅色面板/侧栏/文本/边框/渐变 */
export const SKIN_DARK_BASE_VARS = "--bg: #0b1220; --bg-dark: #0f172a; --panel: rgba(30,41,59,.93); --side: rgba(15,23,42,.72); --line: rgba(255,255,255,.12); --line-strong: rgba(255,255,255,.20); --text: #e2e8f0; --muted: #94a3b8; --side-fg: var(--text); --side-muted: var(--muted); --grad: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); --btn-grad: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.02)); --ui-bg: var(--bg-dark, #0f172a);"
 
 /** 各皮肤覆盖的变量，逐条来自画廊的 .skin-frame[data-skin=x] 块。 */
 export const SKIN_VARS: Record<string, string> = {
   "macos-arranged": "--r: 5px; --r-md: 4px; --r-sm: 4px; --bg: #fbfbfd; --side: #f2f2f4; --line: rgba(0,0,0,.07); --line-strong: rgba(0,0,0,.16); --shadow: none; --blur: none; --pad: 10px; --row-h: 32px; --fs: 12px; --gap: 6px;",
   "macos-droplet": "--r: 26px; --r-md: 14px; --r-sm: 999px; --bg: linear-gradient(160deg,#eef4ff,#f7efff 55%,#eafaf6); --panel: rgba(255,255,255,.93); --side: rgba(255,255,255,.62); --line: rgba(120,120,160,.16); --line-strong: rgba(120,120,160,.22); --accent: #4f7dff; --shadow: 0 10px 30px rgba(80,110,220,.16); --blur: saturate(180%) blur(26px); --pad: 20px; --row-h: 52px; --gap: 14px; --grad: linear-gradient(180deg,rgba(255,255,255,.85),rgba(255,255,255,.25)); --btn-grad: linear-gradient(180deg,#7ba4ff,#3f6df0);",
   "macos-retro": "--r: 6px; --r-md: 5px; --r-sm: 5px; --bg: #d4d0c8; --panel: #eceae4; --side: #cfcabf; --line: #a8a29a; --line-strong: #8b857c; --text: #23201c; --muted: #6b655c; --accent: #2f6fd0; --side-fg: var(--text); --side-muted: #6b655c; --shadow: none; --blur: none; --pad: 10px; --row-h: 30px; --fs: 12px; --inset: inset 1px 1px 0 rgba(255,255,255,.9), inset -1px -1px 0 rgba(0,0,0,.22); --btn-grad: linear-gradient(180deg,rgba(255,255,255,.62),rgba(255,255,255,.12) 48%,rgba(0,0,0,.14));",
   "material": "--r: 28px; --r-md: 16px; --r-sm: 16px; --bg: #f7f2fd; --panel: #fffbfe; --side: #f3edf9; --line: rgba(0,0,0,.08); --line-strong: rgba(0,0,0,.1); --text: #1c1b1f; --muted: #49454f; --accent: #6750a4; --shadow: 0 1px 2px rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15); --blur: none; --pad: 16px; --row-h: 48px; --fs: 14px; --gap: 12px;",
   "flat": "--r: 0px; --r-md: 0px; --r-sm: 0px; --bg: #ffffff; --panel: #ffffff; --side: #f4f5f7; --line: #d1d5db; --line-strong: #111827; --text: #111827; --muted: #6b7280; --accent: #2563eb; --accent-fg: #fff; --side-fg: #111827; --side-muted: #6b7280; --shadow: none; --blur: none; --pad: 12px; --row-h: 36px; --gap: 8px; --frame-r: 0px;",
   "glass": "--r: 20px; --r-md: 14px; --r-sm: 14px; --bg: radial-gradient(900px 500px at 12% 8%, #ff8fb1 0%, transparent 55%),         radial-gradient(800px 520px at 88% 18%, #7ad0ff 0%, transparent 55%),         radial-gradient(760px 520px at 50% 96%, #b39cff 0%, transparent 55%), #1b1f3a; --bg-dark: #121526; --panel: rgba(255,255,255,.12); --side: rgba(255,255,255,.08); --line: rgba(255,255,255,.22); --line-strong: rgba(255,255,255,.3); --text: #fff; --muted: rgba(255,255,255,.68); --accent: rgba(255,255,255,.9); --accent-fg: #1b1f3a; --shadow: 0 8px 32px rgba(0,0,0,.28); --blur: blur(18px) saturate(160%); --pad: 16px; --row-h: 44px; --fs: 13px; --gap: 12px;"
 }

/** 与皮肤无关的结构 CSS（侧栏/顶栏/面板/表格/按钮/输入/标签/页签…）。 */
const ROLE_GENERIC = "/* ── 结构（所有皮肤共用） ── */\n\n.skin-titlebar { display: flex; align-items: center; gap: 7px; padding: 9px 12px; border-bottom: 1px solid var(--line); background: var(--side); backdrop-filter: var(--blur); }\n\n.tl-dot { width: 11px; height: 11px; border-radius: 50%; }\n\n.tl-text { margin-left: 8px; font-size: 12px; color: var(--muted); }\n\n.skin-app { display: flex; min-height: 620px; }\n\n.skin-side { height: 100dvh; max-height: 100dvh; position: sticky; top: 0; flex-shrink: 0; display: flex; flex-direction: column; background: var(--side); backdrop-filter: var(--blur); border-right: 1px solid var(--line); transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.22s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease; }\n\n.skin-side [data-slot='header'] { flex-shrink: 0; }\n\n.skin-side [data-slot='body'] { flex: 1 1 0%; min-height: 0; overflow-y: auto; overflow-x: hidden; }\n\n.skin-side [data-slot='footer'] { flex-shrink: 0; margin-top: auto; }\n\naside.skin-side:not([data-slot='root']) { width: 240px; padding: 12px 10px; }\n\n[data-slot='root']:not([data-collapsed='true']) { min-width: 240px !important; }\n\n[data-slot='root'][data-collapsed='true'] [data-slot='header'], [data-slot='root'][data-collapsed='true'] [data-slot='body'], [data-slot='root'][data-collapsed='true'] [data-slot='footer'] { padding-left: 0.5rem; padding-right: 0.5rem; }\n\n[data-slot='root'][data-collapsed='true'] a[data-slot=\"link\"] { padding: 7px 0 !important; justify-content: center !important; }\n\n[data-slot='root'][data-collapsed='true'] a[data-slot=\"link\"] [data-slot=\"linkLeadingIcon\"] { margin: 0 auto; }\n\n[data-slot='root'][data-collapsed='true'] li[data-slot=\"item\"]:has(>[data-slot=\"label\"]) { display: none !important; }\n\n/* ── 表格人体工学与常识列宽保护 ── */\n.tbl { table-layout: auto; }\n.tbl th:first-child:has(input[type='checkbox']), .tbl td:first-child:has(input[type='checkbox']), .tbl th[data-col='__select'], .tbl td[data-col='__select'] { width: 44px !important; min-width: 44px !important; max-width: 44px !important; text-align: center; }\n.tbl th.col-id, .tbl td.col-id, .tbl th[data-col='id'], .tbl td[data-col='id'], .tbl th[data-col='pk'], .tbl td[data-col='pk'] { width: 72px !important; min-width: 64px !important; max-width: 80px !important; text-align: center; }\n.tbl th.col-status, .tbl td.col-status, .tbl th[data-col='status'], .tbl td[data-col='status'] { width: 100px !important; min-width: 90px !important; max-width: 110px !important; text-align: center; }\n.tbl th.col-actions, .tbl td.col-actions, .tbl th[data-col='__actions'], .tbl td[data-col='__actions'] { width: 160px !important; min-width: 140px !important; text-align: right; }\n\n/* ── 搜索区域防挤压防堆叠安全保护 ── */\n[data-gen='search'] [data-gen='field'] { min-width: 170px; max-width: 100%; }\n[data-gen='search'] input, [data-gen='search'] select, [data-gen='search'] button { max-width: 100%; box-sizing: border-box; }\n\n.skin-side.mode-hidden[data-collapsed='true'], [data-slot='root'][data-collapsed='true'][data-collapse-mode='hidden'] { width: 0 !important; min-width: 0 !important; max-width: 0 !important; padding: 0 !important; border-right: none !important; overflow: hidden !important; opacity: 0; pointer-events: none; }\n\n.side-brand { display: flex; align-items: center; gap: 8px; padding: 4px 6px 14px; }\n\n.brand-mark { width: 26px; height: 26px; border-radius: calc(var(--r) - 4px); background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-weight: 800; font-size: 13px; box-shadow: var(--inset); }\n\n.brand-text { font-weight: 700; font-size: 14px; color: var(--side-fg); }\n\n.side-nav { flex: 1; display: flex; flex-direction: column; gap: 3px; }\n\n.side-group { padding: 6px 8px; font-size: 10px; letter-spacing: .5px; color: var(--side-muted); }\n\n.side-item { text-align: left; padding: 7px 10px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--side-muted); font-size: var(--fs); cursor: pointer; font-family: inherit; }\n\n.side-item:hover { background: color-mix(in srgb, var(--side-fg) 12%, transparent); color: var(--side-fg); }\n\n.side-foot { display: flex; align-items: center; gap: 8px; padding-top: 10px; border-top: 1px solid var(--line); }\n\n.side-avatar { width: 24px; height: 24px; border-radius: 50%; background: color-mix(in srgb, var(--side-fg) 18%, transparent); color: var(--side-fg); display: grid; place-items: center; font-size: 11px; }\n\n.side-user { font-size: 12px; color: var(--side-muted); }\n\n.skin-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }\n\n.skin-top { display: flex; align-items: center; justify-content: space-between; padding: 10px var(--pad); border-bottom: 1px solid var(--line); background: var(--panel); backdrop-filter: var(--blur); }\n\n.crumb { font-size: 12px; color: var(--muted); }\n\n.crumb span { margin: 0 5px; opacity: .5; }\n\n.top-actions { display: flex; align-items: center; gap: 8px; }\n\n.top-chip { padding: 2px 8px; border-radius: var(--r-pill); border: 1px solid var(--line); font-size: 11px; color: var(--muted); }\n\n.top-avatar { width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); display: grid; place-items: center; font-size: 11px; font-weight: 700; }\n\n.skin-body { flex: 1; padding: var(--pad); display: flex; flex-direction: column; gap: var(--gap); background: var(--bg); }\n\n.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: var(--pad); border-bottom: 1px solid var(--line); background: var(--grad); }\n\n.ph-title { font-size: calc(var(--fs) + 2px); font-weight: 700; }\n\n.ph-sub { font-size: 11px; color: var(--muted); margin-top: 2px; }\n\n.ph-actions { display: flex; gap: 8px; }\n\n.filter { display: flex; flex-wrap: wrap; gap: 8px; padding: calc(var(--pad) - 2px) var(--pad); border-bottom: 1px solid var(--line); align-items: center; }\n\n.field { height: 30px; padding: 0 9px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); background: color-mix(in srgb, var(--panel) 80%, transparent); color: var(--text); font-size: var(--fs); font-family: inherit; outline: none; min-width: 0; }\n\n.field:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent); }\n\n.grow { flex: 1; min-width: 140px; }\nselect.field { padding-right: 4px; }\n\n.btn { height: 30px; padding: 0 12px; border-radius: var(--r-sm); border: 1px solid transparent; font-size: var(--fs); font-family: inherit; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; box-shadow: var(--inset); background: var(--btn-grad), color-mix(in srgb, var(--text) 6%, transparent); color: var(--text); }\n\n.btn:hover { background: color-mix(in srgb, var(--text) 11%, transparent); }\n\n.btn.primary { background: var(--btn-grad), var(--accent); color: var(--accent-fg); border-color: color-mix(in srgb, var(--accent) 70%, #000); }\n\n.btn.primary:hover { filter: brightness(1.06); background: var(--accent); }\n\n.btn.ghost { background: transparent; border-color: var(--line-strong); }\n\n.btn.sm { height: 26px; padding: 0 10px; font-size: calc(var(--fs) - 1px); }\n\n.table-wrap { overflow-x: auto; }\n\n.tbl { width: 100%; border-collapse: collapse; }\n\n.tbl th { text-align: left; font-size: calc(var(--fs) - 1px); font-weight: 600; color: var(--muted); padding: 8px var(--pad); border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--text) 3%, transparent); white-space: nowrap; }\n\n.tbl td { padding: 0 var(--pad); height: var(--row-h); border-bottom: 1px solid var(--line); white-space: nowrap; }\n\n.ta-r { text-align: right; }\n\n.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: calc(var(--fs) - 1px); }\n\n.muted { color: var(--muted); }\n\n.strong { font-weight: 600; }\n\n.row:hover { background: color-mix(in srgb, var(--accent) 5%, transparent); }\n\n.row.picked { background: color-mix(in srgb, var(--accent) 11%, transparent); }\n\n.cbox { display: inline-block; width: 14px; height: 14px; border: 1px solid var(--line-strong); border-radius: calc(var(--r-sm) / 2); background: var(--panel); vertical-align: middle; cursor: pointer; position: relative; }\n\n.cbox:hover { border-color: var(--accent); }\n\n.cbox.on { background: var(--accent); border-color: var(--accent); }\n\n.cbox.on::after { content: ''; position: absolute; left: 4px; top: 1px; width: 4px; height: 8px; border: solid var(--accent-fg); border-width: 0 2px 2px 0; transform: rotate(45deg); }\n\n.pill { display: inline-flex; padding: 2px 9px; border-radius: var(--r-pill); font-size: calc(var(--fs) - 2px); border: 1px solid transparent; }\n\n.pill[data-tone='warn'] { background: color-mix(in srgb, #ff9500 16%, transparent); color: #b06800; border-color: color-mix(in srgb,#ff9500 28%, transparent); }\n\n.pill[data-tone='ok'] { background: color-mix(in srgb, #34c759 15%, transparent); color: #1f8a3c; border-color: color-mix(in srgb,#34c759 28%, transparent); }\n\n.ops { display: flex; gap: 10px; }\n\n.link { border: 0; background: transparent; color: var(--color-primary-fg-light, var(--accent)); font-size: calc(var(--fs) - 1px); cursor: pointer; font-family: inherit; padding: 0; }\n\n.dark .link { color: var(--color-primary-fg-dark, var(--accent)); }\n\n.pager { display: flex; align-items: center; justify-content: space-between; padding: 10px var(--pad); }\n\n.pg-info { font-size: 11px; color: var(--muted); }\n\n.pg-btns { display: flex; gap: 5px; }\n\n.pbtn { min-width: 26px; height: 26px; padding: 0 6px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); background: var(--panel); color: var(--text); font-size: 12px; cursor: pointer; font-family: inherit; box-shadow: var(--inset); }\n\n.pbtn.on { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }\n\n.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: var(--gap); padding: var(--pad); }\n\n.fi { display: flex; flex-direction: column; gap: 5px; }\n\n.fi.span2 { grid-column: span 2; }\n\n.fi-l { font-size: 11px; color: var(--muted); }\n\n.fi-l em { color: #ff3b30; font-style: normal; }\ntextarea.field { height: auto; padding: 7px 9px; resize: vertical; }\n\n/* ── 配色选择 ── */\n\n.pal-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; box-shadow: 0 0 0 1px rgba(0,0,0,.12) inset; transition: transform .15s, border-color .15s; }\n\n.pal-dot:hover { transform: scale(1.14); }\n\n.pal-dot.on { border-color: var(--text); transform: scale(1.14); }\n\n/* ── 进度条：紧贴页签栏下方的整宽轨道 ── */\n\n.loadbar { height: 2px; flex-shrink: 0; background: color-mix(in srgb, var(--accent) 14%, transparent); opacity: 0; transition: opacity .25s; }\n\n.loadbar.on { opacity: 1; }\n\n.loadbar > i { display: block; height: 100%; width: 0; background: var(--accent); box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 65%, transparent); transition: width .32s linear; }\n\n.skin-main { position: relative; }\n\n/* ── 页签栏 ── */\n\n.tabbar { display: flex; align-items: stretch; gap: 2px; padding: 0 var(--pad); background: var(--panel); border-bottom: 1px solid var(--line); overflow-x: auto; scrollbar-width: thin; }\n\n.tab { display: inline-flex; align-items: center; gap: 6px; padding: 8px 10px; font-size: calc(var(--fs) - 1px); color: var(--muted); cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; border-radius: var(--r-sm) var(--r-sm) 0 0; transition: background .15s, color .15s; }\n\n.tab:hover { background: color-mix(in srgb, var(--text) 6%, transparent); color: var(--text); }\n\n.tab.on { color: var(--text); font-weight: 600; border-bottom-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }\n\n.tab-x { width: 15px; height: 15px; display: grid; place-items: center; border-radius: 50%; font-size: 13px; line-height: 1; color: var(--muted); }\n\n.tab-x:hover { background: color-mix(in srgb, var(--text) 14%, transparent); color: var(--text); }\n\n.tab-spin { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent); border-top-color: var(--accent); animation: spin .7s linear infinite; }\n\n@keyframes spin { to { transform: rotate(360deg); } }\n\n/* ── 切页动效 ── */\n\n.stack { display: flex; flex-direction: column; gap: var(--gap); }\n\n.fx-enter-active, .fx-leave-active { transition: opacity .18s ease, transform .18s ease; }\n\n.fx-enter-from { opacity: 0; transform: translateY(8px); }\n\n.fx-leave-to { opacity: 0; transform: translateY(-6px); }\n\n/* ── 骨架行 ── */\n\n.skel-row td { height: var(--row-h); }\n\n.sk { display: block; height: 10px; border-radius: 5px; background: linear-gradient(90deg, color-mix(in srgb, var(--text) 8%, transparent) 25%, color-mix(in srgb, var(--text) 15%, transparent) 37%, color-mix(in srgb, var(--text) 8%, transparent) 63%); background-size: 400% 100%; animation: shimmer 1.3s ease-in-out infinite; }\n\n@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }\n\n/* ── 统计页 ── */\n\n.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--gap); padding: var(--pad); }\n\n.stat-grid + .stat-grid { padding-top: 0; }\n\n.stat-card { display: flex; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid var(--line); border-radius: var(--r-sm); background: color-mix(in srgb, var(--text) 3%, transparent); }\n\n.st-label { font-size: 11px; color: var(--muted); }\n\n.st-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }\n\n.st-bar { display: block; height: 5px; border-radius: 999px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; }\n\n.st-bar i { display: block; height: 100%; border-radius: 999px; transition: width .6s cubic-bezier(.2,.8,.2,1); }\n\n.st-bar i[data-tone='ok'] { background: #34c759; }\n\n.st-bar i[data-tone='info'] { background: var(--accent); }\n\n.st-bar i[data-tone='warn'] { background: #ff9500; }\n\n.kpi { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px; border: 1px solid var(--line); border-radius: var(--r-sm); }\n\n.kpi-n { font-size: 22px; font-weight: 800; font-variant-numeric: tabular-nums; }\n\n.kpi-l { font-size: 11px; color: var(--muted); }\n\n/* ── 开关与保存反馈 ── */\n\n.toggle-row { flex-direction: row; align-items: center; gap: 8px; }\n\n.switch { width: 34px; height: 20px; border-radius: 999px; background: color-mix(in srgb, var(--text) 22%, transparent); position: relative; cursor: pointer; transition: background .18s; flex-shrink: 0; }\n\n.switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform .18s; box-shadow: 0 1px 2px rgba(0,0,0,.25); }\n\n.switch.on { background: var(--accent); }\n\n.switch.on::after { transform: translateX(14px); }\n\n.saved-tip { margin: 0; font-size: 11px; color: var(--accent); }\n\n/* ── 皮肤内日期选择（替代原生 date input） ── */\n\n.datewrap { position: relative; }\n\n.datebtn { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; text-align: left; min-width: 132px; }\n\n.datebtn span:first-child { flex: 1; color: var(--muted); }\n\n.datebtn.filled span:first-child { color: var(--text); }\n\n.cal-ico { font-size: 11px; opacity: .55; }\n\n.date-clear { position: absolute; right: 26px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; display: grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--text) 16%, transparent); color: var(--muted); font-size: 12px; line-height: 1; cursor: pointer; }\n\n.date-clear:hover { background: color-mix(in srgb, var(--text) 26%, transparent); }\n\n.cal { position: absolute; z-index: 20; top: calc(100% + 6px); left: 0; width: 246px; padding: 10px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--r-sm); box-shadow: 0 12px 32px rgba(0,0,0,.18); color: var(--text); }\n\n.datewrap.inline .cal { left: 0; }\n\n.cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }\n\n.cal-title { font-size: 12px; font-weight: 600; }\n\n.cal-nav { width: 22px; height: 22px; border: 1px solid var(--line); border-radius: calc(var(--r-sm) - 2px); background: transparent; color: var(--muted); cursor: pointer; font-size: 13px; line-height: 1; }\n\n.cal-nav:hover { border-color: var(--accent); color: var(--accent); }\n\n.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }\n\n.cal-wd { text-align: center; font-size: 10px; color: var(--muted); padding: 3px 0; }\n\n.cal-d { aspect-ratio: 1; border: 0; border-radius: calc(var(--r-sm) - 2px); background: transparent; color: var(--text); font-size: 11px; cursor: pointer; font-family: inherit; font-variant-numeric: tabular-nums; }\n\n.cal-d:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 14%, transparent); }\n\n.cal-d.on { background: var(--accent); color: var(--accent-fg); font-weight: 700; }\n\n.cal-d.today:not(.on) { box-shadow: inset 0 0 0 1px var(--accent); color: var(--accent); }\n\n.cal-d.blank { visibility: hidden; cursor: default; }\n\n.cal-foot { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 6px; border-top: 1px solid var(--line); }\n\n/* ── 搜索反馈与批量条 ── */\n\n.filter-hint { margin-left: auto; font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }\n\n.bulk { position: sticky; bottom: 0; display: flex; align-items: center; gap: 8px; margin: 0 var(--pad) var(--pad); padding: 8px 12px; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--r-sm); box-shadow: 0 -4px 18px rgba(0,0,0,.10); }\n\n.bulk-n { font-size: 12px; font-weight: 600; margin-right: auto; }\n\n.bulk-x { width: 20px; height: 20px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); cursor: pointer; font-size: 14px; line-height: 1; }\n\n.bulk-x:hover { background: color-mix(in srgb, var(--text) 12%, transparent); }\n\n.btn.ghost.danger, .btn.danger { color: #ff3b30; }\n\n.btn.primary.danger { background: #ff3b30; color: #fff; border-color: #d62828; }\n\n.pbtn:disabled { opacity: .4; pointer-events: none; }\n\n/* ── 空态 ── */\n\n.empty-row td { padding: 0; }\n\n.empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 34px 12px; }\n\n.empty-ico { font-size: 26px; color: var(--muted); opacity: .5; line-height: 1; }\n\n.empty-t { font-size: 13px; font-weight: 600; }\n\n.empty-s { font-size: 11px; color: var(--muted); margin-bottom: 4px; }\n\n/* ── 浮层：详情 / 编辑 / 确认 ── */\n\n.ov-back { position: absolute; inset: 0; z-index: 40; display: flex; background: rgba(15,17,23,.42); backdrop-filter: blur(2px); }\n\n.ov-side { margin-left: auto; width: min(420px, 86%); display: flex; flex-direction: column; background: var(--panel); border-left: 1px solid var(--line-strong); box-shadow: -12px 0 34px rgba(0,0,0,.20); }\n\n.ov-modal { margin: auto; width: min(560px, 92%); max-height: 88%; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--line-strong); border-radius: var(--r); box-shadow: 0 24px 60px rgba(0,0,0,.28); }\n\n.ov-modal.narrow { width: min(420px, 92%); }\n\n.ov-head { display: flex; align-items: flex-start; gap: 10px; padding: 14px var(--pad); border-bottom: 1px solid var(--line); }\n\n.ov-h-text { min-width: 0; flex: 1; }\n\n.ov-kicker { display: block; font-size: 11px; color: var(--muted); }\n\n.ov-kicker.danger { color: #ff3b30; }\n\n.ov-title { font-size: 15px; font-weight: 700; margin-top: 2px; }\n\n.ov-x { width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 17px; line-height: 1; cursor: pointer; }\n\n.ov-x:hover { background: color-mix(in srgb, var(--text) 12%, transparent); color: var(--text); }\n\n.ov-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--pad); }\n\n.ov-body.form-grid { padding: var(--pad); }\n\n.ov-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px var(--pad); border-top: 1px solid var(--line); background: color-mix(in srgb, var(--text) 3%, transparent); }\n\n.dl { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }\n\n.dl-r { display: flex; flex-direction: column; gap: 4px; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--r-sm); background: color-mix(in srgb, var(--text) 3%, transparent); }\n\n.dl-r.col { grid-column: span 2; }\n\n.dl-r dt { font-size: 11px; color: var(--muted); }\n\n.dl-r dd { font-size: 13px; word-break: break-word; }\n\n.confirm-t { font-size: 13px; color: var(--muted); }\n\n/* 校验反馈 */\n\n.field.bad { border-color: #ff3b30; box-shadow: 0 0 0 3px rgba(255,59,48,.16); }\n\n.fi-err { font-size: 11px; color: #ff3b30; }\n\n/* 浮层动效 */\n\n.slide-enter-active, .slide-leave-active { transition: opacity .2s ease; }\n\n.slide-enter-active .ov-side, .slide-leave-active .ov-side { transition: transform .24s cubic-bezier(.2,.8,.2,1); }\n\n.slide-enter-from, .slide-leave-to { opacity: 0; }\n\n.slide-enter-from .ov-side, .slide-leave-to .ov-side { transform: translateX(24px); }\n\n.pop-enter-active, .pop-leave-active { transition: opacity .16s ease; }\n\n.pop-enter-active .ov-modal, .pop-leave-active .ov-modal { transition: transform .18s cubic-bezier(.2,.8,.2,1); }\n\n.pop-enter-from, .pop-leave-to { opacity: 0; }\n\n.pop-enter-from .ov-modal, .pop-leave-to .ov-modal { transform: scale(.97) translateY(6px); }\n\n/* 按钮忙态：禁用指针 + 轻微脉冲 */\n\n.btn.busy { pointer-events: none; opacity: .78; animation: pulse .9s ease-in-out infinite; }\n\n@keyframes pulse { 50% { opacity: .55; } }"

/** 少数带 [data-skin] 限定的规则，按皮肤归组。 */
const ROLE_OWN: Record<string, string> = {
  "macos-arranged": [
    ".tl-dot.r { background: #ff5f57; } .tl-dot.y { background: #febc2e; } .tl-dot.g { background: #28c840; }\n[data-skin='flat'] .tl-dot, [data-skin='macos-arranged'] .tl-dot { background: var(--line); }"
  ],
  "flat": [
    ".tl-dot.r { background: #ff5f57; } .tl-dot.y { background: #febc2e; } .tl-dot.g { background: #28c840; }\n[data-skin='flat'] .tl-dot, [data-skin='macos-arranged'] .tl-dot { background: var(--line); }",
    ".side-item.on { background: var(--accent); color: var(--accent-fg); font-weight: 600; }\n[data-skin='flat'] .side-item.on { background: var(--accent); }",
    ".panel { background: var(--panel); backdrop-filter: var(--blur); border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--shadow); overflow: hidden; }\n[data-skin='macos-retro'] .panel, [data-skin='flat'] .panel { box-shadow: var(--inset); }"
  ],
  "macos-retro": [
    ".panel { background: var(--panel); backdrop-filter: var(--blur); border: 1px solid var(--line); border-radius: var(--r); box-shadow: var(--shadow); overflow: hidden; }\n[data-skin='macos-retro'] .panel, [data-skin='flat'] .panel { box-shadow: var(--inset); }",
    ".pill[data-tone='info'] { background: color-mix(in srgb, #0a84ff 14%, transparent); color: #0a6fd6; border-color: color-mix(in srgb,#0a84ff 26%, transparent); }\n[data-skin='macos-retro'] .pill[data-tone='info'] { background: #cfe2ff; color: #17365d; border-color: #8aa9d6; }\n[data-skin='macos-retro'] .pill[data-tone='warn'] { background: #ffe6b3; color: #6b4300; border-color: #c9a35a; }\n[data-skin='macos-retro'] .pill[data-tone='ok'] { background: #c8ecc7; color: #14501a; border-color: #86b585; }\n[data-skin='macos-retro'] .pill[data-tone='mute'] { background: #dedbd4; color: #4a453d; border-color: #a8a29a; }"
  ],
  "glass": [
    ".pill[data-tone='mute'] { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--muted); border-color: var(--line); }\n[data-skin='glass'] .pill { color: var(--text); }",
    ".link.danger { color: #ff3b30; }\n[data-skin='glass'] .link.danger { color: #ffd0d0; }"
  ]
}

/**
 * 某个皮肤的变量声明（基座 + 覆盖），**只保留自定义属性**。
 *
 * 画廊的 .skin-frame 块里混着框体装饰（border / box-shadow / overflow / background），
 * 那些是给演示框用的，整块搬到 :root 会给整个页面套上一个带阴影和裁剪的框。
 */
export function skinVars(skin: unknown, palette?: unknown): string {
  const id = (isSkin(skin) ? skin : DEFAULT_SKIN) as SkinId
  const onlyVars = (block: string) => block
    .split(';')
    .map(x => x.trim())
    .filter(x => x.startsWith('--'))
    .join('; ')
  const vars = [onlyVars(SKIN_BASE_VARS), onlyVars(SKIN_VARS[id] ?? '')].filter(Boolean).join('; ')
  // 画廊规则里的按钮/标签/激活态都引用 --accent，让它跟随所选配色，
  // 否则会出现「主色是翠绿、画廊控件还是蓝」这种两套色。
  const pal = findPalette(id, palette) ?? palettesOf(id)[0]
  return pal ? `${vars}; --accent: ${pal.accent}; --accent-fg: ${pal.fg}` : vars
}

/**
 * 适配层。画廊的演示 DOM 上有 .side-item / .tbl 这些类，
 * 而真实产物里侧栏菜单由 UNavigationMenu 渲染、表格由 UTable 渲染，拿不到这些类。
 *
 * 这里不复制任何数值：只从画廊规则里**取出声明块**，换一组真实选择器再声明一遍，
 * 声明里引用的仍是同一批 CSS 变量。所以改画廊的变量，产物一定跟着变。
 */
function declsOf(css: string, selector: string): string {
  const i = css.indexOf(selector + ' {')
  if (i < 0) return ''
  const j = css.indexOf('}', i)
  return j < 0 ? '' : css.slice(i + selector.length + 2, j).trim()
}

/** 去掉声明块里可能残留的选择器前缀（画廊里 hover 规则写成一行时会出现）。 */
function stripSel(decls: string, sel: string): string {
  return decls.replace(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{?'), '').replace(/\}\s*$/, '').trim()
}

function skinAdapter(): string {
  const item = declsOf(ROLE_GENERIC, '.side-item')
  const itemOn = declsOf(ROLE_GENERIC, '.side-item.on')
  const itemHover = declsOf(ROLE_GENERIC, '.side-item:hover')
  const group = declsOf(ROLE_GENERIC, '.side-group')
  const field = declsOf(ROLE_GENERIC, '.field')
  const btn = declsOf(ROLE_GENERIC, '.btn')
  const btnPrimary = declsOf(ROLE_GENERIC, '.btn.primary')
  const btnGhost = declsOf(ROLE_GENERIC, '.btn.ghost')
  const pill = declsOf(ROLE_GENERIC, '.pill')
  // 实测 UNavigationMenu 渲染成 a[data-slot="link"]，激活类是 router-link-active
  const NAV = '.skin-side:not([data-collapsed="true"]) a[data-slot="link"]'
  return [
    item ? `${NAV} { ${item} }` : '',
    itemHover ? `${NAV}:hover { ${stripSel(itemHover, '.side-item:hover')} }` : '',
    itemOn ? `${NAV}.router-link-active, ${NAV}[aria-current="page"] { ${itemOn} }` : '',
    group ? `.skin-side [data-gen="nav-group"] { ${group} }` : '',
    // 输入框：画廊 .field 是给原生 input 写的，真实产物里 input 包在
    // span.relative.inline-flex 里，所以同时映射外层与内层，避免高度被两层各算一次。
    field ? `.skin-main .field { ${field} }` : '',
    // 只给真正的控件加边框/高度。曾经也加到 >div / >span 包裹层上，
    // 而 Nuxt UI 的 input 自带 1px 边框，两层边框相距 1px 看着就是"框叠框"。
    field ? `.skin-main [data-gen="field"] input, .skin-main [data-gen="field"] textarea, .skin-main [data-gen="field"] select, .skin-main [data-gen="field"] button[role="combobox"] { ${field} }` : '',
    // 搜索区里 textarea 会比单行框高出一截，导致整列的标签被顶上去；这里统一压成一行高。
    field ? `.skin-main [data-gen="search"] textarea { height: 30px; resize: none }` : '',
    // 按钮：只接管「带文字的工具栏按钮」。图标按钮、分页、表格行内的 ghost 图标
    // 不套 .btn 的固定高度与内边距，否则会被撑坏。
    btn ? `.skin-main [data-gen="toolbar"] button:not(:empty), .skin-main [data-gen="search-actions"] button { ${btn} }` : '',
    btnPrimary ? `.skin-main [data-gen="toolbar"] button.bg-primary, .skin-main [data-gen="search-actions"] button.bg-primary { ${btnPrimary} }` : '',
    btnGhost ? `.skin-main [data-gen="toolbar"] button.ring-inset, .skin-main [data-gen="search-actions"] button.ring-inset { ${btnGhost} }` : '',
    pill ? `.skin-main .pill { ${pill} }` : ''
  ].filter(Boolean).join('\n')
}

/**
 * 输出给子后台的 CSS。画廊的选择器带 .skin-frame / [data-skin=x] 限定，
 * 产物里只存在被选中的那一套皮肤，所以把这些限定剥掉即可，声明本身一字不改。
 */
export function skinCss(skin: unknown, p?: { theme?: { palette?: string } }): string {
  const id = (isSkin(skin) ? skin : DEFAULT_SKIN) as SkinId
  const darkBlock = id === 'glass' ? '--ui-bg: var(--bg-dark, #121526);' : SKIN_DARK_BASE_VARS
  const rules = (ROLE_GENERIC + '\n\n' + (ROLE_OWN[id] ?? ''))
    .replace(/\.skin-frame\[data-skin='[a-z-]+'\]/g, '')
    .replace(/\[data-skin='[a-z-]+'\]/g, '')
    .replace(/\.skin-frame/g, '')
  return `/* 皮肤：${id}（与主后台 /styles 同一份定义，非重写） */\n:root { ${skinVars(id, p?.theme?.palette)} }\n.dark { ${darkBlock} }\n${rules}\n${skinAdapter()}\n`
}

/** 画廊用：保留 .skin-frame 作用域，避免角色类泄漏到主后台其他页面。 */
export function galleryCss(): string {
  const scopeOne = (sel: string) => sel.includes('.skin-frame') ? sel : `.skin-frame ${sel}`
  /**
   * 先压平跨行选择器列表再作用域化。画廊里有
   *   .field,
   *   select.field,
   *   textarea.field { … }
   * 这种写法，按行匹配会把规则拆坏（前两行变成游离文本），所以先把 `X,` 结尾的行并起来。
   */
  const flatten = (css: string) => css.replace(/([^{}\n]+,)\s*\n\s*/g, '$1 ')
  const scoped = (css: string) => flatten(css).replace(/^([^@{}\n]+)\{/gm, (m: string, sel: string) => {
    const t = sel.trim()
    // 只放过 at-rule 与 @keyframes 里的节点（0% / from / to）；
    // 其余一律限定进 .skin-frame，包括 select.field 这种「元素+类」选择器。
    if (!t || t.startsWith('@') || /^(\d+|from|to)%?$/.test(t)) return m
    const one = sel.split(',').map(x => scopeOne(x.trim())).join(', ')
    return one + ' {'
  })
  const vars = `.skin-frame { ${SKIN_BASE_VARS} }\n`
    + Object.entries(SKIN_VARS).map(([k, v]) => `.skin-frame[data-skin='${k}'] { ${v} }`).join('\n')
    + `\n.dark .skin-frame:not([data-skin='glass']), .skin-frame.dark:not([data-skin='glass']) { ${SKIN_DARK_BASE_VARS} }\n.dark .skin-frame[data-skin='glass'], .skin-frame.dark[data-skin='glass'] { --ui-bg: var(--bg-dark, #121526); }\n`
  return vars + '\n' + scoped(ROLE_GENERIC) + '\n' + scoped(Object.values(ROLE_OWN).join('\n'))
}
