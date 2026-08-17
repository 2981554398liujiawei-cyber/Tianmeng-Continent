/**
 * 地点移动规则（TM-P0-005）。
 * 纯函数：只返回判断结果，不修改 GameState / flags / localStorage，不使用 Store。
 */
import { getLocation } from '../content'

export type TravelBlockReason =
  | 'current_location_not_found'
  | 'target_location_not_found'
  | 'not_connected'
  | 'required_flag_missing'

export interface TravelCheckResult {
  allowed: boolean
  reason?: TravelBlockReason
}

/**
 * 判断从当前地点前往目标地点是否合法。
 * 检查顺序：当前地点存在 → 目标地点存在 → 目标相邻 → 解锁 Flag（严格 === true）。
 */
export function checkTravel(
  currentLocationId: string,
  targetLocationId: string,
  flags: Record<string, boolean | number | string>,
): TravelCheckResult {
  const current = getLocation(currentLocationId)
  if (!current) {
    return { allowed: false, reason: 'current_location_not_found' }
  }
  const target = getLocation(targetLocationId)
  if (!target) {
    return { allowed: false, reason: 'target_location_not_found' }
  }
  if (!current.connections.includes(targetLocationId)) {
    return { allowed: false, reason: 'not_connected' }
  }
  if (target.requiredFlag !== undefined && flags[target.requiredFlag] !== true) {
    return { allowed: false, reason: 'required_flag_missing' }
  }
  return { allowed: true }
}
