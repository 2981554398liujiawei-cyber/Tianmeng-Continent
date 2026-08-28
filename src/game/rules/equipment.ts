import type { GameState, ItemSlot } from '../types'
import { getItem } from '../content/items'

export type EquipFailure = 'no_state' | 'unknown_item' | 'not_owned' | 'invalid_quantity' | 'wrong_type' | 'profession' | 'level' | 'attribute'
export interface EquipCheck { allowed: boolean; reason?: EquipFailure; slot?: ItemSlot; required?: string }

export function checkEquipItem(state: GameState | null | undefined, itemId: string): EquipCheck {
  if (!state) return { allowed: false, reason: 'no_state' }
  const item = getItem(itemId)
  if (!item) return { allowed: false, reason: 'unknown_item' }
  const entry = state.inventory.find((e) => e.itemId === itemId)
  if (!entry) return { allowed: false, reason: 'not_owned' }
  if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return { allowed: false, reason: 'invalid_quantity' }
  if (item.type !== 'weapon' && item.type !== 'armor') return { allowed: false, reason: 'wrong_type' }
  if (item.allowedProfessions && !item.allowedProfessions.includes(state.player.profession)) return { allowed: false, reason: 'profession' }
  if (item.requirements?.minLevel && state.player.level < item.requirements.minLevel) return { allowed: false, reason: 'level', required: `需要等级 ${item.requirements.minLevel}` }
  for (const [attribute, required] of Object.entries(item.requirements?.attributes ?? {})) {
    const current = state.player.attributes[attribute as keyof typeof state.player.attributes]
    if (typeof required === 'number' && current < required) return { allowed: false, reason: 'attribute', required: `需要${attribute.toUpperCase()} ${required}（当前 ${current}）` }
  }
  return { allowed: true, slot: item.type }
}
