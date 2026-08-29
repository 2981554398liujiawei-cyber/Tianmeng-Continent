/**
 * 鉴定纯规则（TM-P2-013 §13）：Identification Definition → Pure Rules → Store 事务 → UI render。
 *  - 确定性 authored：同一遗物按正式 profession 映射结果；无随机、无失败率。
 *  - checkIdentification 只做校验，不写状态；Store identifyItem 负责原子事务。
 */
import { getIdentification, getItem } from '../content'
import type { GameState } from '../types/game'

export type IdentificationFailure = 'unknown' | 'no_source' | 'gold_insufficient'
export type IdentificationCheck =
  | { allowed: true; resultItemId: string; goldCost: number }
  | { allowed: false; reason: IdentificationFailure }

/** 纯校验：未知鉴定 / 无遗物或数量不足 / 金币不足。地点与 NPC 合法性由 Store 层入口守卫（UI 触发源唯一）。 */
export function checkIdentification(state: GameState | null | undefined, identificationId: string): IdentificationCheck {
  const def = getIdentification(identificationId)
  if (!def) return { allowed: false, reason: 'unknown' }
  const resultItemId = def.resultsByProfession[state?.player.profession ?? '']
  if (!resultItemId || !getItem(resultItemId)) return { allowed: false, reason: 'unknown' }
  const owned = state?.inventory.find((entry) => entry.itemId === def.sourceItemId)?.quantity ?? 0
  if (owned < 1) return { allowed: false, reason: 'no_source' }
  const gold = state?.player.gold ?? 0
  if (!Number.isSafeInteger(gold) || gold < def.goldCost) return { allowed: false, reason: 'gold_insufficient' }
  return { allowed: true, resultItemId, goldCost: def.goldCost }
}
