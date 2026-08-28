import { getGathering } from '../content/gathering'
import type { GameState } from '../types/game'

export type GatheringFailure = 'unknown' | 'wrong_location' | 'locked' | 'collected'
export type GatheringCheck = { allowed: true } | { allowed: false; reason: GatheringFailure }
export const gatheringFlag = (id: string) => `gathered_${id}`

export function checkGathering(state: GameState | null | undefined, id: string): GatheringCheck {
  const node = getGathering(id)
  if (!node) return { allowed: false, reason: 'unknown' }
  if (!state || state.world.currentLocationId !== node.locationId) return { allowed: false, reason: 'wrong_location' }
  if (state.world.flags.gathering_v1_unlocked !== true) return { allowed: false, reason: 'locked' }
  if (node.prerequisiteFlag && state.world.flags[node.prerequisiteFlag] !== true) return { allowed: false, reason: 'locked' }
  if (node.once !== false && state.world.flags[gatheringFlag(id)] === true) return { allowed: false, reason: 'collected' }
  return { allowed: true }
}
