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
import { getEncounter, allEncounterMembers } from '../content/encounters'
import type { EncounterDefinition, EncounterMember } from '../types/encounter'
import type { GameState } from '../types/game'
import { routeForProfession, trialCombatEncounterId } from './martialTrial'
import { canFightCalamity, SAKURA_CALAMITY_ENEMY_ID } from './sakura'

export type EncounterBlockReason =
  | 'enemy_not_found'
  | 'location_not_found'
  | 'enemy_not_in_location'
  | 'quest_not_active'
  | 'missing_prerequisite'
  | 'already_defeated'
  | 'invalid_story_state'
  | 'encounter_not_found'

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

// ---------------------------------------------------------------------------
// Encounter V2（TM-P2-007 §7）：玩家面对的是「遭遇」而非单个 enemyId。
//  - checkEncounter：Encounter 权威入口（注册 / 地点挂载 / 单敌委托 / 多敌 defeated 门）。
//  - resolveEncounterVariant：加权 variant 纯选择（不写状态）。
//  - currentEncounterVariantId：只读读取已固化的 variant（weighted；已固化不 reroll）。
//    world.encounterVariants 的首次写入由调用方（gameStore 集成）在 allowed 时负责，规则层只读。
// ---------------------------------------------------------------------------

/** 单敌遭遇的 enemyId：fixedMembers 恰为 1 名且 count===1 时返回该敌人，否则 undefined */
export function singleEnemyIdOf(def: EncounterDefinition): string | undefined {
  if (def.fixedMembers && def.fixedMembers.length === 1 && def.fixedMembers[0]?.count === 1) {
    return def.fixedMembers[0]?.enemyId
  }
  return undefined
}

/**
 * Encounter 权威战斗入口守卫（TM-P2-007 §7.4 外部 authoritative path）。
 * 1. 注册检查：encounter 必须已注册。
 * 2. 地点挂载：当前 location.encounters 必须包含该 encounter。
 * 3. defeated / 剧情前置：
 *    - 单敌遭遇：直接委托 checkEnemyEncounter（完整复用现有特殊敌人 guard 链与 defeated 门）。
 *    - 多敌 / 加权遭遇：若设置 encounterDefeatFlag，按 world.flags 严格 boolean 语义检查 defeated 门。
 * 4. 数据完整性：全部成员敌人必须已注册。
 * 纯函数：不写 Store、不随机。
 */
export function checkEncounter(gameState: GameState, encounterId: string): EncounterCheckResult {
  const def = getEncounter(encounterId)
  if (!def) return { allowed: false, reason: 'encounter_not_found' }

  const location = getLocation(gameState.world.currentLocationId)
  if (!location) return { allowed: false, reason: 'location_not_found' }
  if (!location.encounters?.includes(encounterId)) {
    return { allowed: false, reason: 'enemy_not_in_location' }
  }

  // TM-P2-010：武备试炼遭遇只能在武备场、获得新/旧邀请资格且完成观察考后开战。
  // 旧 knight_trial_invited 作为兼容资格读取，但新流程只写 martial_trial_invited。
  if (def.trialProfession) {
    const trialQuest = gameState.quests.find((q) => q.questId === 'quest_tianlong_martial_trial')
    const invited = gameState.world.flags.martial_trial_invited === true || gameState.world.flags.knight_trial_invited === true
    const expectedEncounterId = trialCombatEncounterId(gameState.player.profession)
    const expectedRoute = routeForProfession(gameState.player.profession)
    if (def.trialProfession !== gameState.player.profession || encounterId !== expectedEncounterId || trialQuest?.flags[expectedRoute] !== true) {
      return { allowed: false, reason: 'missing_prerequisite' }
    }
    if (trialQuest?.flags.trial_combat_done === true) {
      return { allowed: false, reason: 'already_defeated' }
    }
    if (location.id !== 'tianlong_martial_trial_ground' || !invited || trialQuest?.status !== 'in_progress' || trialQuest.flags.trial_registered !== true || trialQuest.flags.trial_observation_done !== true) {
      return { allowed: false, reason: 'missing_prerequisite' }
    }
  }

  // 单敌遭遇：委托现有 checkEnemyEncounter（特殊敌人前置 + defeated 门原样复用）
  const singleEnemyId = singleEnemyIdOf(def)
  if (singleEnemyId) {
    return checkEnemyEncounter(gameState, singleEnemyId)
  }

  // 多敌 / 加权遭遇：通用 defeated 门（encounterDefeatFlag 位于 world.flags；可选遭遇未设置则跳过）
  if (def.encounterDefeatFlag) {
    const flag = gameState.world.flags[def.encounterDefeatFlag]
    if (isMalformedFlag(flag) || flag === true) {
      return { allowed: false, reason: flag === true ? 'already_defeated' : 'invalid_story_state' }
    }
  }

  // 数据完整性：全部成员敌人已注册
  for (const member of allEncounterMembers(def)) {
    if (!getEnemy(member.enemyId)) return { allowed: false, reason: 'enemy_not_found' }
  }

  return { allowed: true }
}

/**
 * 选择 Encounter 生效的 variant id（纯函数；TM-P2-007 §7.3）。
 *  - weighted：按 weight 加权随机（rng 注入 [0,1)），返回选中的 variantId。
 *  - fixed：无变体，返回固定 id（def.id）。
 * 不写状态：world.encounterVariants 的持久化由调用方在首次选择后负责。
 */
export function resolveEncounterVariant(def: EncounterDefinition, rng: () => number): string {
  if (def.fixedMembers) return def.id
  const variants = def.variants ?? []
  if (variants.length === 0) {
    throw new Error(`encounter ${def.id} 既无 fixedMembers 也无 variants`)
  }
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0)
  if (!(totalWeight > 0)) {
    throw new Error(`encounter ${def.id} 权重总和必须 > 0`)
  }
  let roll = rng() * totalWeight
  for (const variant of variants) {
    roll -= variant.weight
    if (roll < 0) return variant.id
  }
  // 浮点边界兜底：取最后一个变体
  return variants[variants.length - 1]!.id
}

/**
 * 只读读取当前生效的 variant id（TM-P2-007 §7.3「首次生成后写死，刷新/读档/切地点不 reroll」）。
 *  - weighted：world.encounterVariants[encounterId] 已有值则返回该值；未固化返回 undefined
 *    （表示「尚未首次 roll」，由调用方负责 roll 并写入，规则层不写）。
 *  - fixed：无变体，返回固定 id。
 */
export function currentEncounterVariantId(gameState: GameState, def: EncounterDefinition): string | undefined {
  if (!def.variants) return def.id
  return gameState.world.encounterVariants?.[def.id] ?? undefined
}

/**
 * TM-P2-009-R1 §4：Encounter roster 预览数据（预览卡与 CombatPage 共享同一固化 variant）。
 *  - fixedMembers：固定阵容 → locked=true、members=固定成员。
 *  - weighted 已固化（world.encounterVariants 有值）：locked=true、members=固化后的单一阵容（UI 显示「本次遭遇」）。
 *  - weighted 未固化：locked=false、candidates=各候选 variant 成员（UI 显示「可能遭遇」多候选用「或」分隔）。
 * 绝不把 variants 成员并集当「本次阵容」（2 warriors 与 warrior+mage 并集会拼出假三人组）。
 */
export interface EncounterRosterPreview {
  /** variant 已固化（或 fixed）：true 时 UI 应只显示单一「本次遭遇」阵容 */
  locked: boolean
  /** 固化后的单一阵容（locked=true 时有效） */
  members: EncounterMember[]
  /** 未固化时的候选阵容（locked=false；每个元素是单个 variant 的成员列表） */
  candidates: EncounterMember[][]
}

export function encounterRosterPreview(gameState: GameState, def: EncounterDefinition): EncounterRosterPreview {
  if (def.fixedMembers) {
    return { locked: true, members: def.fixedMembers, candidates: [] }
  }
  const lockedId = currentEncounterVariantId(gameState, def)
  const lockedVariant = lockedId ? def.variants?.find((v) => v.id === lockedId) : undefined
  if (lockedVariant) {
    return { locked: true, members: lockedVariant.members, candidates: [] }
  }
  return { locked: false, members: [], candidates: (def.variants ?? []).map((v) => v.members) }
}

/** 格式化成员列表为用户文案（不泄露内部 ID）：骷髅战士×2 / 骷髅战士+黑法师 */
export function formatEncounterMembers(members: readonly EncounterMember[]): string {
  return members
    .map((m) => `${getEnemy(m.enemyId)?.name ?? m.enemyId}${m.count > 1 ? `×${m.count}` : ''}`)
    .join('+')
}
