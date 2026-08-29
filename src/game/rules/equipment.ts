import type { GameState, ItemSlot } from '../types'
import type { ProfessionId } from '../types/character'
import { getItem } from '../content/items'

export type EquipFailure = 'no_state' | 'unknown_item' | 'not_owned' | 'invalid_quantity' | 'wrong_type' | 'profession' | 'level' | 'attribute'
export interface EquipCheck {
  allowed: boolean
  reason?: EquipFailure
  slot?: ItemSlot
  /** 人类可读差距文案（Store/Tests 消费；UI 只 render，不自行计算） */
  required?: string
  /** TM-P2-012-R1 P1-06：结构化差距（UI 由统一规则输出渲染，不各自实现判断） */
  attribute?: string
  requiredValue?: number
  currentValue?: number
}

/** 装备资格纯规则：只看物品定义与玩家等级/属性/职业（不含持有检查——持有由 checkEquipItem 守卫） */
export function checkEquipEligibility(
  item: { type: string; allowedProfessions?: readonly ProfessionId[]; requirements?: { minLevel?: number; attributes?: Record<string, number> } },
  player: { level: number; attributes: Record<string, number>; profession: ProfessionId },
): EquipCheck {
  if (item.type !== 'weapon' && item.type !== 'armor') return { allowed: false, reason: 'wrong_type' }
  if (item.allowedProfessions && !item.allowedProfessions.includes(player.profession)) return { allowed: false, reason: 'profession' }
  if (item.requirements?.minLevel && player.level < item.requirements.minLevel) {
    return { allowed: false, reason: 'level', required: `需要等级 ${item.requirements.minLevel}（当前 ${player.level}）`, requiredValue: item.requirements.minLevel, currentValue: player.level }
  }
  for (const [attribute, required] of Object.entries(item.requirements?.attributes ?? {})) {
    const current = player.attributes[attribute] ?? 0
    if (typeof required === 'number' && current < required) {
      return { allowed: false, reason: 'attribute', attribute, required: `需要${attribute.toUpperCase()} ${required}（当前 ${current}）`, requiredValue: required, currentValue: current }
    }
  }
  return { allowed: true, slot: (item.type === 'weapon' || item.type === 'armor') ? item.type : undefined }
}

export function checkEquipItem(state: GameState | null | undefined, itemId: string): EquipCheck {
  if (!state) return { allowed: false, reason: 'no_state' }
  const item = getItem(itemId)
  if (!item) return { allowed: false, reason: 'unknown_item' }
  const entry = state.inventory.find((e) => e.itemId === itemId)
  if (!entry) return { allowed: false, reason: 'not_owned' }
  if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return { allowed: false, reason: 'invalid_quantity' }
  const eligibility = checkEquipEligibility(item, state.player)
  if (!eligibility.allowed) return eligibility
  // eligibility 已保证 type ∈ {weapon, armor}
  return { allowed: true, slot: item.type as ItemSlot }
}
