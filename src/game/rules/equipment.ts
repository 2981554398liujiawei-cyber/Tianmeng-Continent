import type { GameState, ItemSlot } from '../types'
import { getItem } from '../content/items'

export type EquipFailure = 'no_state' | 'unknown_item' | 'not_owned' | 'invalid_quantity' | 'wrong_type' | 'profession'
export interface EquipCheck { allowed: boolean; reason?: EquipFailure; slot?: ItemSlot }

export function checkEquipItem(state: GameState | null | undefined, itemId: string): EquipCheck {
  if (!state) return { allowed: false, reason: 'no_state' }
  const item = getItem(itemId)
  if (!item) return { allowed: false, reason: 'unknown_item' }
  const entry = state.inventory.find((e) => e.itemId === itemId)
  if (!entry) return { allowed: false, reason: 'not_owned' }
  if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return { allowed: false, reason: 'invalid_quantity' }
  if (item.type !== 'weapon' && item.type !== 'armor') return { allowed: false, reason: 'wrong_type' }
  if (item.allowedProfessions && !item.allowedProfessions.includes(state.player.profession)) return { allowed: false, reason: 'profession' }
  return { allowed: true, slot: item.type }
}
