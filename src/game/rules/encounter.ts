/**
 * 战斗入口规则（TM-P2-003-R3 D：从 App.tsx 的 enemyId 专属 if 链抽出的纯规则模块）。
 *  - 纯函数：不读 Store、无 React、无副作用、不随机。
 *  - 通用守卫：敌人注册存在 / 当前地点注册存在 / 敌人属于当前地点 enemyIds。
 *  - 特殊敌人前置（剧情一次性 Boss / 固定顺序）业务分支集中在 rules 层（允许），
 *    App.tsx 只负责「校验通过才进 CombatPage」。
 *  - Flag 语义保持严格 boolean：defeated 类 flag 只接受 undefined/false 视为「尚未击败」，
 *    true 视为已击败（already_defeated），非 boolean 异常值（"yes"/1/'false'）视为损坏（invalid_story_state）。
 */
import { getEnemy, getLocation } from '../content'
import type { GameState } from '../types/game'
import { canFightCalamity, SAKURA_CALAMITY_ENEMY_ID } from './sakura'

export type EncounterBlockReason =
  | 'enemy_not_found'
  | 'location_not_found'
  | 'enemy_not_in_location'
  | 'quest_not_active'
  | 'missing_prerequisite'
  | 'already_defeated'
  | 'invalid_story_state'

export interface EncounterCheckResult {
  allowed: boolean
  reason?: EncounterBlockReason
}

/** defeated flag 是否「尚未击败」（undefined/false 允许；true / 非 boolean 异常均拒绝） */
function isDefeatedFlagPending(value: unknown): boolean {
  return typeof value === 'undefined' || (typeof value === 'boolean' && value !== true)
}

/** flag 是否为损坏的非 boolean 值（undefined/false/true 之外的一切） */
function isMalformedFlag(value: unknown): boolean {
  return value !== undefined && typeof value !== 'boolean'
}

export function checkEnemyEncounter(gameState: GameState, enemyId: string): EncounterCheckResult {
  // ---- 第一层通用守卫 ----
  const enemy = getEnemy(enemyId)
  if (!enemy) return { allowed: false, reason: 'enemy_not_found' }
  const location = getLocation(gameState.world.currentLocationId)
  if (!location) return { allowed: false, reason: 'location_not_found' }
  if (!location.enemyIds?.includes(enemyId)) return { allowed: false, reason: 'enemy_not_in_location' }

  // ---- 特殊敌人前置（原样迁移自 App.tsx handleEngage / Store resolveCombatVictory 守卫） ----
  switch (enemyId) {
    case 'corrupted_wolf': {
      // 《草原狼影》in_progress 才可进入战斗（不只靠 UI 隐藏）
      const wolfQuest = gameState.quests.find((q) => q.questId === 'quest_grassland_wolf')
      if (wolfQuest?.status !== 'in_progress') return { allowed: false, reason: 'quest_not_active' }
      break
    }

    case 'dudu_rabbit': {
      // 一次性 Boss：已取得《兔子的路径》→ 禁止重新进入 Boss 战
      const hasPath = gameState.inventory.some((e) => e.itemId === 'rabbit_path')
      if (hasPath) return { allowed: false, reason: 'already_defeated' }
      break
    }

    case 'skeleton_soldier': {
      // 黑石塔一层 + 第五主线 in_progress/stage 0 + wangcai_briefed===true +
      // black_stone_tower_unlocked===true + floor1_soldier_defeated 仅允许 undefined/false
      if (gameState.world.currentLocationId !== 'black_stone_tower_floor1') {
        return { allowed: false, reason: 'enemy_not_in_location' }
      }
      const quest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const defeated = quest?.flags.floor1_soldier_defeated
      if (isMalformedFlag(defeated) || defeated === true) {
        return { allowed: false, reason: defeated === true ? 'already_defeated' : 'invalid_story_state' }
      }
      if (
        quest?.status !== 'in_progress' ||
        quest?.stage !== 0 ||
        quest?.flags.wangcai_briefed !== true ||
        gameState.world.flags.black_stone_tower_unlocked !== true
      ) {
        return { allowed: false, reason: quest?.status !== 'in_progress' ? 'quest_not_active' : 'missing_prerequisite' }
      }
      break
    }

    case 'skeleton_captain': {
      // 一层 + 士兵已击败 + floor1_captain_defeated 仅允许 undefined/false
      if (gameState.world.currentLocationId !== 'black_stone_tower_floor1') {
        return { allowed: false, reason: 'enemy_not_in_location' }
      }
      const quest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const captain = quest?.flags.floor1_captain_defeated
      if (isMalformedFlag(captain) || captain === true) {
        return { allowed: false, reason: captain === true ? 'already_defeated' : 'invalid_story_state' }
      }
      if (
        quest?.status !== 'in_progress' ||
        quest?.stage !== 0 ||
        quest?.flags.wangcai_briefed !== true ||
        gameState.world.flags.black_stone_tower_unlocked !== true ||
        quest?.flags.floor1_soldier_defeated !== true
      ) {
        return { allowed: false, reason: quest?.status !== 'in_progress' ? 'quest_not_active' : 'missing_prerequisite' }
      }
      break
    }

    case 'tower_zombie': {
      // 二层 + 完整前置链 + floor2_zombie_defeated 仅允许 undefined/false
      if (gameState.world.currentLocationId !== 'black_stone_tower_floor2') {
        return { allowed: false, reason: 'enemy_not_in_location' }
      }
      const quest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const zombie = quest?.flags.floor2_zombie_defeated
      if (isMalformedFlag(zombie) || zombie === true) {
        return { allowed: false, reason: zombie === true ? 'already_defeated' : 'invalid_story_state' }
      }
      if (
        quest?.status !== 'in_progress' ||
        quest?.stage !== 0 ||
        quest?.flags.wangcai_briefed !== true ||
        gameState.world.flags.black_stone_tower_unlocked !== true ||
        gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
        quest?.flags.floor1_soldier_defeated !== true ||
        quest?.flags.floor1_captain_defeated !== true
      ) {
        return { allowed: false, reason: quest?.status !== 'in_progress' ? 'quest_not_active' : 'missing_prerequisite' }
      }
      break
    }

    case 'black_mage': {
      // 额外要求 floor2_zombie_defeated===true（僵尸未击败不得提前挑战）+ floor2_black_mage_defeated 仅允许 undefined/false
      if (gameState.world.currentLocationId !== 'black_stone_tower_floor2') {
        return { allowed: false, reason: 'enemy_not_in_location' }
      }
      const quest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const mage = quest?.flags.floor2_black_mage_defeated
      if (isMalformedFlag(mage) || mage === true) {
        return { allowed: false, reason: mage === true ? 'already_defeated' : 'invalid_story_state' }
      }
      if (
        quest?.status !== 'in_progress' ||
        quest?.stage !== 0 ||
        quest?.flags.wangcai_briefed !== true ||
        gameState.world.flags.black_stone_tower_unlocked !== true ||
        gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
        quest?.flags.floor1_soldier_defeated !== true ||
        quest?.flags.floor1_captain_defeated !== true ||
        quest?.flags.floor2_zombie_defeated !== true
      ) {
        return { allowed: false, reason: quest?.status !== 'in_progress' ? 'quest_not_active' : 'missing_prerequisite' }
      }
      break
    }

    case 'skeleton_warrior': {
      // 额外要求入口区两敌均已击败 + floor2_skeleton_warrior_defeated 仅允许 undefined/false
      if (gameState.world.currentLocationId !== 'black_stone_tower_floor2') {
        return { allowed: false, reason: 'enemy_not_in_location' }
      }
      const quest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const warrior = quest?.flags.floor2_skeleton_warrior_defeated
      if (isMalformedFlag(warrior) || warrior === true) {
        return { allowed: false, reason: warrior === true ? 'already_defeated' : 'invalid_story_state' }
      }
      if (
        quest?.status !== 'in_progress' ||
        quest?.stage !== 0 ||
        quest?.flags.wangcai_briefed !== true ||
        gameState.world.flags.black_stone_tower_unlocked !== true ||
        gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
        quest?.flags.floor1_soldier_defeated !== true ||
        quest?.flags.floor1_captain_defeated !== true ||
        quest?.flags.floor2_zombie_defeated !== true ||
        quest?.flags.floor2_black_mage_defeated !== true
      ) {
        return { allowed: false, reason: quest?.status !== 'in_progress' ? 'quest_not_active' : 'missing_prerequisite' }
      }
      break
    }

    case 'skeleton_witch': {
      // 三层 + 全部前序严格 true + floor3_skeleton_witch_defeated 仅允许 undefined/false
      if (gameState.world.currentLocationId !== 'black_stone_tower_floor3') {
        return { allowed: false, reason: 'enemy_not_in_location' }
      }
      const quest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const witch = quest?.flags.floor3_skeleton_witch_defeated
      if (isMalformedFlag(witch) || witch === true) {
        return { allowed: false, reason: witch === true ? 'already_defeated' : 'invalid_story_state' }
      }
      if (
        quest?.status !== 'in_progress' ||
        quest?.stage !== 0 ||
        quest?.flags.wangcai_briefed !== true ||
        gameState.world.flags.black_stone_tower_unlocked !== true ||
        gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
        gameState.world.flags.black_stone_tower_floor3_unlocked !== true ||
        quest?.flags.floor1_soldier_defeated !== true ||
        quest?.flags.floor1_captain_defeated !== true ||
        quest?.flags.floor2_zombie_defeated !== true ||
        quest?.flags.floor2_black_mage_defeated !== true ||
        quest?.flags.floor2_skeleton_warrior_defeated !== true
      ) {
        return { allowed: false, reason: quest?.status !== 'in_progress' ? 'quest_not_active' : 'missing_prerequisite' }
      }
      break
    }

    case 'black_mane_wolf': {
      // 北门 + 《北门失联》in_progress/stage 0 + north_gate_trail_checked===true +
      // north_gate_wolf_defeated 仅允许 undefined/false
      if (gameState.world.currentLocationId !== 'tianlong_north_gate') {
        return { allowed: false, reason: 'enemy_not_in_location' }
      }
      const quest = gameState.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
      const wolf = quest?.flags.north_gate_wolf_defeated
      if (isMalformedFlag(wolf) || wolf === true) {
        return { allowed: false, reason: wolf === true ? 'already_defeated' : 'invalid_story_state' }
      }
      if (quest?.status !== 'in_progress' || quest?.stage !== 0 || quest?.flags.north_gate_trail_checked !== true) {
        return { allowed: false, reason: quest?.status !== 'in_progress' ? 'quest_not_active' : 'missing_prerequisite' }
      }
      break
    }

    case SAKURA_CALAMITY_ENEMY_ID: {
      // TM-P2-004 第 42 节：残灾之影——仅 guest 状态 + 神域 + 未击败可战（sakura.ts 纯规则）
      if (!canFightCalamity(gameState)) {
        return { allowed: false, reason: 'missing_prerequisite' }
      }
      break
    }

    default:
      // 普通敌人（corrupted_rabbit / corrupted_rat）：无额外前置
      break
  }

  return { allowed: true }
}
