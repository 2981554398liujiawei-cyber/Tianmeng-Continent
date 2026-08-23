import type { Character } from '../types/character'
import type { GameState } from '../types/game'
import { getMount } from '../content'

/**
 * 坐骑有效属性规则（P2-007 §18.3/§20/§21）。
 * 所有派生规则从「有效五维」获取：装备坐骑的加成叠加到角色基础属性上。
 * 禁止 CombatPage / PlayerSidebar 各自再加一遍。
 */
export function getEffectiveCharacterAttributes(
  attributes: Character['attributes'],
  equippedMountId: string | null,
): Character['attributes'] {
  const mount = equippedMountId ? getMount(equippedMountId) : undefined
  if (!mount) return attributes
  const b = mount.attributeBonuses
  return {
    str: attributes.str + (b.str ?? 0),
    con: attributes.con + (b.con ?? 0),
    agi: attributes.agi + (b.agi ?? 0),
    mnd: attributes.mnd + (b.mnd ?? 0),
    lck: attributes.lck + (b.lck ?? 0),
  }
}

/**
 * 当前装备坐骑是否具备指定 travel tag（P2-007 §21）。
 * 未装备 / 未知坐骑 / 标签不匹配 → false。
 */
export function hasTravelTag(state: GameState, tag: string): boolean {
  if (!state.equippedMountId) return false
  return getMount(state.equippedMountId)?.travelTags?.includes(tag) ?? false
}

/** 城郊古驿道 optional 检定的奖励金币（P2-007 §21；不影响主线，成功仅 +金） */
export const MOUNT_TRAIL_REWARD_GOLD = 8

/**
 * 城郊古驿道 optional 场景可否触发（P2-007 §21）。
 * 条件：在天龙城 + 装备带 fast_travel 的坐骑 + 尚未探索（一次性）。
 * 不影响主线；未连接 Golden Rabbit。
 */
export function canExploreMountTrail(state: GameState): boolean {
  return (
    state.world.currentLocationId === 'tianlong_city' &&
    hasTravelTag(state, 'fast_travel') &&
    state.world.flags.mount_trail_explored === undefined
  )
}

/**
 * 北郊「沿官道快速搜索」可否触发（TM-P2-008 §50）。
 * 条件：在北郊 + 装备带 fast_travel 的坐骑 + 尚未搜索（一次性）。
 * 坐骑不攻击、不进 initiative，仅作为袭击现场调查的 optional 补充手段（得巡逻队徽记线索，不推进任务）。
 */
export function canSearchNorthOutskirtsByMount(state: GameState): boolean {
  return (
    state.world.currentLocationId === 'tianlong_north_outskirts' &&
    hasTravelTag(state, 'fast_travel') &&
    state.world.flags.north_outskirts_mount_search === undefined
  )
}
