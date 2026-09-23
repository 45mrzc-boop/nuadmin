import type { Foundry } from './types'
import { tmagicFoundry } from './tmagic'

export * from './types'

const FOUNDRIES: Record<string, Foundry> = {
  tmagic: tmagicFoundry
}

export function getFoundry(id = 'tmagic'): Foundry {
  return FOUNDRIES[id] || tmagicFoundry
}
