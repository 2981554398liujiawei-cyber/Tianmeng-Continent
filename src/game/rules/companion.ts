/**
 * 伙伴/队伍/休整纯规则（TM-P2-004 第 6/8/53-57/128 节）。
 *  - 纯函数：不读 Store、不写 Store、无副作用。
 *  - activeCompanionIds 去重、最多 MAX_ACTIVE_COMPANIONS（3）。
 *  - guest/recruited 可 active；met 只解锁红颜录。
 *  - longRest 统一规则：安全地点 + 玩家满资源 + 全部 active/recruited 伙伴 MP 回满 + restCount+1
 *    + 重置交谈/送礼周期（TM-P2-004 第 55/56 节：满资源也允许休整——它承担关系互动周期）。
 */
import type { CompanionDefinition, CompanionState, CompanionStatus, PartyState } from '../types/companion'
import type { GameState } from '../types/game'
import type { RelationshipState } from '../types/relationship'

/** 队伍上限（TM-P2-004 第 8 节：玩家 + 最多 3 名 active companions） */
export const MAX_ACTIVE_COMPANIONS = 3

/** Long Rest 安全地点（TM-P2-004 第 53 节） */
export const LONG_REST_SAFE_LOCATIONS = ['qingshi_village', 'tianlong_martial_hall'] as const

/** 创建伙伴状态（TM-P2-004 第 11 节：首次进入 guest 时 level = player.level；mp = maxMp） */
export function createCompanionState(
  def: CompanionDefinition,
  playerLevel: number,
  status: CompanionStatus,
): CompanionState {
  return {
    companionId: def.id,
    status,
    level: playerLevel,
    mp: def.maxMp,
    maxMp: def.maxMp,
    learnedSkillIds: [...def.skillIds],
    flags: {},
  }
}

/** 伙伴状态是否合法（存档校验辅助） */
export function isCompanionStateSafe(companion: CompanionState): boolean {
  return (
    typeof companion.companionId === 'string' &&
    companion.companionId !== '' &&
    (companion.status === 'met' || companion.status === 'guest' || companion.status === 'recruited') &&
    Number.isInteger(companion.level) &&
    companion.level > 0 &&
    Number.isInteger(companion.mp) &&
    Number.isInteger(companion.maxMp) &&
    companion.mp >= 0 &&
    companion.maxMp >= 0 &&
    companion.mp <= companion.maxMp &&
    Array.isArray(companion.learnedSkillIds) &&
    companion.learnedSkillIds.every((id) => typeof id === 'string')
  )
}

// ---- 队伍操作（TM-P2-004 第 145-151 节）----

/** 伙伴是否已 active（在 activeCompanionIds 中） */
export function isActive(party: PartyState, companionId: string): boolean {
  return party.activeCompanionIds.includes(companionId)
}

/** 激活伙伴：已 active → null；队伍满（>=3）→ null；否则返回新 PartyState（去重追加） */
export function activateCompanion(party: PartyState, companionId: string): PartyState | null {
  if (isActive(party, companionId)) return null
  if (party.activeCompanionIds.length >= MAX_ACTIVE_COMPANIONS) return null
  return { activeCompanionIds: [...party.activeCompanionIds, companionId] }
}

/** 暂不同行：从 activeCompanionIds 移除（recruited 状态不变；不降低关系；TM-P2-004 第 149/150 节） */
export function deactivateCompanion(party: PartyState, companionId: string): PartyState {
  return { activeCompanionIds: party.activeCompanionIds.filter((id) => id !== companionId) }
}

/** 伙伴是否可同行（guest/recruited 且有槽位）：供「重新同行」入口判断 */
export function canRejoinParty(
  companions: Record<string, { status: string }>,
  party: PartyState,
  companionId: string,
): boolean {
  const companion = companions[companionId]
  if (!companion) return false
  if (companion.status !== 'guest' && companion.status !== 'recruited') return false
  if (isActive(party, companionId)) return false
  return party.activeCompanionIds.length < MAX_ACTIVE_COMPANIONS
}

// ---- Long Rest（TM-P2-004 第 53-57 节）----

/** 是否为 Long Rest 安全地点 */
export function isLongRestLocation(locationId: string): boolean {
  return (LONG_REST_SAFE_LOCATIONS as readonly string[]).includes(locationId)
}

/** 校验 player 资源字段安全（返回可安全恢复的完整目标状态；非法 → null） */
function safePlayerRestTarget(player: GameState['player']): { hp: number; mp: number } | null {
  if (!Number.isSafeInteger(player.maxHp) || player.maxHp <= 0) return null
  if (!Number.isSafeInteger(player.maxMp) || player.maxMp < 0) return null
  if (!Number.isSafeInteger(player.hp) || !Number.isSafeInteger(player.mp)) return null
  if (player.hp < 0 || player.hp > player.maxHp || player.mp < 0 || player.mp > player.maxMp) return null
  return { hp: player.maxHp, mp: player.maxMp }
}

/** 恢复全部 active/recruited 伙伴 MP 至 maxMp（返回新 companions；原对象不变） */
export function restoreCompanionMp(companions: Record<string, CompanionState>): Record<string, CompanionState> {
  const next: Record<string, CompanionState> = {}
  for (const [id, companion] of Object.entries(companions)) {
    if (companion.status === 'guest' || companion.status === 'recruited') {
      next[id] = { ...companion, mp: companion.maxMp }
    } else {
      next[id] = companion
    }
  }
  return next
}

/** 休整后重置关系周期（talksThisRest=0、giftedThisRest=false；TM-P2-004 第 64/71 节） */
export function resetRelationshipRestCycle(relationships: Record<string, RelationshipState>): Record<string, RelationshipState> {
  const next: Record<string, RelationshipState> = {}
  for (const [id, rel] of Object.entries(relationships)) {
    next[id] = { ...rel, flags: { ...rel.flags, talksThisRest: 0, giftedThisRest: false } }
  }
  return next
}

/**
 * 统一 Long Rest（TM-P2-004 第 55 节：满资源也允许——休整承担关系互动周期，不是纯治疗按钮）。
 * 成功：player hp/mp 回满 + 全部 active/recruited 伙伴 mp 回满 + restCount+1 + 关系周期重置。
 * 失败（位置不安全 / 资源字段非法）→ null 且不变。
 */
export function applyLongRest(gameState: GameState): GameState | null {
  if (!isLongRestLocation(gameState.world.currentLocationId)) return null
  const playerTarget = safePlayerRestTarget(gameState.player)
  if (!playerTarget) return null
  const restCount = gameState.world.restCount
  if (!Number.isSafeInteger(restCount) || restCount < 0) return null
  const nextCompanions = restoreCompanionMp(gameState.companions)
  const nextRelationships = resetRelationshipRestCycle(gameState.relationships)
  return {
    ...gameState,
    player: { ...gameState.player, hp: playerTarget.hp, mp: playerTarget.mp },
    companions: nextCompanions,
    relationships: nextRelationships,
    world: { ...gameState.world, restCount: restCount + 1 },
  }
}
