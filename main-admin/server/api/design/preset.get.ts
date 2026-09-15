import { STYLE_PRESETS } from '#shared/style-presets'
import { PALETTES, SKINS } from '#shared/skins'

export default defineAuthed(async () => {
  return ok({
    presets: STYLE_PRESETS,
    skins: SKINS,
    palettes: PALETTES
  })
})
