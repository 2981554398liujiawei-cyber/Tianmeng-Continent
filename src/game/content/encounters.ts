/**
 * Encounter V2 内容注册表（TM-P2-007 §7）。
 *  - 现有全部单敌战斗包进 EncounterDefinition（fixedMembers 单敌；defeated 门继续由
 *    rules/encounter.ts 委托现有 checkEnemyEncounter 守卫链处理，本文件只负责定义与挂载）。
 *  - 新增非主线可选多怪遭遇：残破巡逻队（TM-P2-007 §7.5；黑石塔二层；不影响主线 flag）。
 *  - 模块加载即校验：成员总数 sum(count)<=4、fixedMembers 与 variants 二选一、count>=1、敌人已注册。
 *  - 纯数据注册表：不写状态、不随机。
 */
import { ENEMIES } from './enemies'
import type { EncounterDefinition, EncounterMember } from '../types/encounter'

/** 单敌遭遇迁移映射：enemyId -> encounterId（与现有 guard 链敌人一一对应；全量覆盖不遗漏） */
export const SINGLE_ENEMY_ENCOUNTERS: Record<string, string> = {
  corrupted_rabbit: 'encounter_corrupted_rabbit',
  corrupted_rat: 'encounter_corrupted_rat',
  corrupted_wolf: 'encounter_corrupted_wolf',
  dudu_rabbit: 'encounter_dudu_rabbit',
  skeleton_soldier: 'encounter_skeleton_soldier',
  skeleton_captain: 'encounter_skeleton_captain',
  tower_zombie: 'encounter_tower_zombie',
  black_mage: 'encounter_black_mage',
  skeleton_warrior: 'encounter_skeleton_warrior',
  skeleton_witch: 'encounter_skeleton_witch',
  black_mane_wolf: 'encounter_black_mane_wolf',
  sakura_calamity_fragment: 'encounter_sakura_calamity_fragment',
  // TM-P2-008 §23：荒原野狼（北郊单只落单野狼 + 狼群 variants 成员）
  wild_wolf: 'encounter_wild_wolf',
  // TM-P2-009-R1 §11：新增单敌可重复遭遇（反查用：重复 XP 授予 + checkEnemyEncounter 委托）
  cave_bat: 'encounter_cave_bat',
  wild_boar: 'encounter_north_boar',
  trial_soldier: 'encounter_trial_soldier',
  trial_duelist: 'encounter_trial_duelist',
  trial_scout: 'encounter_trial_scout',
  trial_apprentice_mage: 'encounter_trial_apprentice_mage',
}

/** 残破巡逻队：非主线可选多怪遭遇（TM-P2-007 §7.5；骷髅战士×2 或 骷髅战士+黑法师，权重二选一） */
const BROKEN_PATROL_ENCOUNTER_ID = 'encounter_broken_patrol'

export const ENCOUNTERS: Record<string, EncounterDefinition> = {
  // ---- 现有单敌战斗迁移（fixedMembers 单敌；canEscape / locationId 与现有守卫一致）----
  encounter_corrupted_rabbit: {
    id: 'encounter_corrupted_rabbit',
    name: '魔化兔',
    locationId: 'village_grassland',
    fixedMembers: [{ enemyId: 'corrupted_rabbit', count: 1 }],
    canEscape: true,
    difficulty: 'low',
    recommendedLevelMin: 1,
    recommendedLevelMax: 2,
  },
  encounter_corrupted_rat: {
    id: 'encounter_corrupted_rat',
    name: '魔化鼠',
    locationId: 'abandoned_mine',
    fixedMembers: [{ enemyId: 'corrupted_rat', count: 1 }],
    canEscape: true,
    difficulty: 'low',
    recommendedLevelMin: 1,
    recommendedLevelMax: 2,
  },
  encounter_corrupted_wolf: {
    id: 'encounter_corrupted_wolf',
    name: '魔化狼',
    locationId: 'village_grassland',
    fixedMembers: [{ enemyId: 'corrupted_wolf', count: 1 }],
    canEscape: true,
    difficulty: 'standard',
    recommendedLevelMin: 2,
    recommendedLevelMax: 3,
  },
  encounter_dudu_rabbit: {
    id: 'encounter_dudu_rabbit',
    name: '嘟嘟兔',
    locationId: 'rabbit_lair',
    fixedMembers: [{ enemyId: 'dudu_rabbit', count: 1 }],
    canEscape: true,
    difficulty: 'dangerous',
    recommendedLevelMin: 3,
  },
  encounter_skeleton_soldier: {
    id: 'encounter_skeleton_soldier',
    name: '骷髅士兵',
    locationId: 'black_stone_tower_floor1',
    fixedMembers: [{ enemyId: 'skeleton_soldier', count: 1 }],
    canEscape: true,
    // defeated 门位于 quest_wangcai_trouble.flags（checkEncounter 委托 checkEnemyEncounter 处理）
    encounterDefeatFlag: 'floor1_soldier_defeated',
    difficulty: 'low',
    recommendedLevelMin: 2,
    recommendedLevelMax: 3,
  },
  encounter_skeleton_captain: {
    id: 'encounter_skeleton_captain',
    name: '骷髅队长',
    locationId: 'black_stone_tower_floor1',
    fixedMembers: [{ enemyId: 'skeleton_captain', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor1_captain_defeated',
    difficulty: 'dangerous',
    recommendedLevelMin: 3,
  },
  encounter_tower_zombie: {
    id: 'encounter_tower_zombie',
    name: '僵尸',
    locationId: 'black_stone_tower_floor2',
    fixedMembers: [{ enemyId: 'tower_zombie', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor2_zombie_defeated',
    difficulty: 'low',
    recommendedLevelMin: 2,
    recommendedLevelMax: 3,
  },
  encounter_black_mage: {
    id: 'encounter_black_mage',
    name: '黑法师',
    locationId: 'black_stone_tower_floor2',
    fixedMembers: [{ enemyId: 'black_mage', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor2_black_mage_defeated',
    difficulty: 'standard',
    recommendedLevelMin: 3,
    recommendedLevelMax: 4,
  },
  encounter_skeleton_warrior: {
    id: 'encounter_skeleton_warrior',
    name: '骷髅战士',
    locationId: 'black_stone_tower_floor2',
    fixedMembers: [{ enemyId: 'skeleton_warrior', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor2_skeleton_warrior_defeated',
    difficulty: 'standard',
    recommendedLevelMin: 3,
    recommendedLevelMax: 5,
  },
  encounter_skeleton_witch: {
    id: 'encounter_skeleton_witch',
    name: '骷髅女妖',
    locationId: 'black_stone_tower_floor3',
    fixedMembers: [{ enemyId: 'skeleton_witch', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor3_skeleton_witch_defeated',
    difficulty: 'standard',
    recommendedLevelMin: 4,
    recommendedLevelMax: 5,
  },
  encounter_black_mane_wolf: {
    id: 'encounter_black_mane_wolf',
    name: '黑鬃魔狼',
    locationId: 'tianlong_north_gate',
    fixedMembers: [{ enemyId: 'black_mane_wolf', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'north_gate_wolf_defeated',
    difficulty: 'standard',
    recommendedLevelMin: 3,
  },
  // TM-P2-008 §23：北郊单只落单野狼（可重复遭遇；无 encounterDefeatFlag，不打不影响主线 flag）
  encounter_wild_wolf: {
    id: 'encounter_wild_wolf',
    name: '落单野狼',
    locationId: 'tianlong_north_outskirts',
    fixedMembers: [{ enemyId: 'wild_wolf', count: 1 }],
    canEscape: true,
    // TM-P2-009-R1 §11.3：北郊低风险可选遭遇可重复刷（首次仍 first-kill XP；重复给低额）
    difficulty: 'low',
    recommendedLevelMin: 2,
    recommendedLevelMax: 3,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 4,
  },
  encounter_sakura_calamity_fragment: {
    id: 'encounter_sakura_calamity_fragment',
    name: '残灾之影',
    locationId: 'sakura_domain_fragment',
    fixedMembers: [{ enemyId: 'sakura_calamity_fragment', count: 1 }],
    // 剧情契约链核心战：强制战斗不可逃跑（与 EnemyDefinition.canEscape=false 一致）
    canEscape: false,
    // defeated 门位于 world.flags.sakura_calamity_defeated（sakura.ts 纯规则）
    encounterDefeatFlag: 'sakura_calamity_defeated',
    difficulty: 'dangerous',
    recommendedLevelMin: 3,
  },
  // ---- 非主线可选多怪遭遇（TM-P2-007 §7.5）----
  [BROKEN_PATROL_ENCOUNTER_ID]: {
    id: BROKEN_PATROL_ENCOUNTER_ID,
    name: '残破巡逻队',
    locationId: 'black_stone_tower_floor2',
    variants: [
      { id: 'broken_patrol_a', weight: 60, members: [{ enemyId: 'skeleton_warrior', count: 2 }] },
      { id: 'broken_patrol_b', weight: 40, members: [{ enemyId: 'skeleton_warrior', count: 1 }, { enemyId: 'black_mage', count: 1 }] },
    ],
    canEscape: true,
    // 无 encounterDefeatFlag：可选遭遇，不打不影响主线 flag
    // TM-P2-009-R1 §11.3：可选高威胁遭遇可重复刷（黑石塔二层练级选择；重复低额 XP）
    difficulty: 'dangerous',
    recommendedLevelMin: 4,
    recommendedLevelMax: 5,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 10,
  },
  // ---- TM-P2-008 §23：北郊荒原狼群（可选遭遇；首次胜利后不再出现；不阻塞主线）----
  encounter_steppe_wolf_pack: {
    id: 'encounter_steppe_wolf_pack',
    name: '荒原狼群',
    locationId: 'tianlong_north_outskirts',
    variants: [
      { id: 'steppe_wolf_pack_a', weight: 50, members: [{ enemyId: 'wild_wolf', count: 2 }] },
      { id: 'steppe_wolf_pack_b', weight: 30, members: [{ enemyId: 'black_mane_wolf', count: 1 }, { enemyId: 'wild_wolf', count: 1 }] },
      { id: 'steppe_wolf_pack_c', weight: 20, members: [{ enemyId: 'wild_wolf', count: 3 }] },
    ],
    canEscape: true,
    // 首次胜利后写 world.flags.steppe_wolf_pack_defeated=true，不再刷出（§24；可选遭遇不阻塞主线）
    encounterDefeatFlag: 'steppe_wolf_pack_defeated',
    // 首次胜利后不再刷出 → 不标 repeatable（H6：一次性遭遇不可刷任务 XP）
    difficulty: 'standard',
    recommendedLevelMin: 2,
    recommendedLevelMax: 3,
  },
  // ---- TM-P2-009 §13：北郊旧驿站狼群（《断旗余声》Stage C 战斗解；固定阵容 wild_wolf×2 + corrupted_wolf×1；canEscape=true；胜利得 XP/Loot/neutralized，逃跑不推进不保留）----
  // 固定阵容用单一 weighted variant 表达（fixedMembers 多敌不走 resolveEncounterVictory 结算路径）。
  encounter_waystation_wolf_pack: {
    id: 'encounter_waystation_wolf_pack',
    name: '驿站狼群',
    locationId: 'tianlong_north_abandoned_waystation',
    variants: [
      {
        id: 'waystation_wolf_pack_fixed',
        weight: 1,
        members: [
          { enemyId: 'wild_wolf', count: 2 },
          { enemyId: 'corrupted_wolf', count: 1 },
        ],
      },
    ],
    canEscape: true,
    // 首次胜利后写 world.flags.waystation_wolf_pack_neutralized=true（Stage C combat 解前置；§13）
    encounterDefeatFlag: 'waystation_wolf_pack_neutralized',
    difficulty: 'dangerous',
    recommendedLevelMin: 3,
  },
  // ---- TM-P2-009-R1 §11：Encounter Diversity V1（每图多威胁 + repeatable 低额重复 XP；纯 optional，不阻塞主线）。
  //      repeatable 遭遇不设 encounterDefeatFlag（可反复刷）；剧情/Boss/一次性遭遇不标 repeatable（H6）。 ----
  encounter_grassland_rabbit_pair: {
    id: 'encounter_grassland_rabbit_pair',
    name: '魔化兔群',
    locationId: 'village_grassland',
    variants: [
      { id: 'grassland_rabbit_pair_a', weight: 1, members: [{ enemyId: 'corrupted_rabbit', count: 2 }] },
    ],
    canEscape: true,
    difficulty: 'dangerous',
    recommendedLevelMin: 1,
    recommendedLevelMax: 2,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 4,
  },
  encounter_cave_bat: {
    id: 'encounter_cave_bat',
    name: '洞穴蝙蝠',
    locationId: 'abandoned_mine',
    fixedMembers: [{ enemyId: 'cave_bat', count: 1 }],
    canEscape: true,
    difficulty: 'standard',
    recommendedLevelMin: 1,
    recommendedLevelMax: 2,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 4,
  },
  encounter_mine_mixed: {
    id: 'encounter_mine_mixed',
    name: '矿洞混杂魔物',
    locationId: 'abandoned_mine',
    variants: [
      {
        id: 'mine_mixed_a',
        weight: 1,
        members: [
          { enemyId: 'corrupted_rat', count: 1 },
          { enemyId: 'cave_bat', count: 1 },
        ],
      },
    ],
    canEscape: true,
    difficulty: 'dangerous',
    recommendedLevelMin: 2,
    recommendedLevelMax: 3,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 5,
  },
  encounter_floor1_soldier_pair: {
    id: 'encounter_floor1_soldier_pair',
    name: '骷髅士兵巡队',
    locationId: 'black_stone_tower_floor1',
    variants: [
      { id: 'floor1_soldier_pair_a', weight: 1, members: [{ enemyId: 'skeleton_soldier', count: 2 }] },
    ],
    canEscape: true,
    difficulty: 'standard',
    recommendedLevelMin: 3,
    recommendedLevelMax: 4,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 8,
  },
  encounter_floor3_witch_escort: {
    id: 'encounter_floor3_witch_escort',
    name: '女妖与护卫',
    locationId: 'black_stone_tower_floor3',
    variants: [
      {
        id: 'floor3_witch_escort_a',
        weight: 1,
        members: [
          { enemyId: 'skeleton_witch', count: 1 },
          { enemyId: 'skeleton_warrior', count: 1 },
        ],
      },
    ],
    canEscape: true,
    difficulty: 'dangerous',
    recommendedLevelMin: 5,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 10,
  },
  encounter_north_boar: {
    id: 'encounter_north_boar',
    name: '荒原野猪',
    locationId: 'tianlong_north_outskirts',
    fixedMembers: [{ enemyId: 'wild_boar', count: 1 }],
    canEscape: true,
    difficulty: 'low',
    recommendedLevelMin: 2,
    recommendedLevelMax: 3,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 5,
  },
  encounter_north_mane_pack: {
    id: 'encounter_north_mane_pack',
    name: '黑鬃魔狼伏击',
    locationId: 'tianlong_north_outskirts',
    variants: [
      {
        id: 'north_mane_pack_a',
        weight: 1,
        members: [
          { enemyId: 'black_mane_wolf', count: 1 },
          { enemyId: 'wild_wolf', count: 1 },
        ],
      },
    ],
    canEscape: true,
    difficulty: 'dangerous',
    recommendedLevelMin: 3,
    recommendedLevelMax: 4,
    activityType: 'optional',
    repeatable: true,
    repeatAdventureXpReward: 8,
  },
  encounter_trial_warrior: {
    id: 'encounter_trial_warrior', name: '战士武备试炼', locationId: 'tianlong_martial_trial_ground',
    fixedMembers: [{ enemyId: 'trial_soldier', count: 2 }, { enemyId: 'trial_duelist', count: 1 }],
    canEscape: true, activityType: 'story', trialProfession: 'warrior', difficulty: 'dangerous', recommendedLevelMin: 3, recommendedLevelMax: 5,
  },
  encounter_trial_knight: {
    id: 'encounter_trial_knight', name: '骑士武备试炼', locationId: 'tianlong_martial_trial_ground',
    fixedMembers: [{ enemyId: 'trial_duelist', count: 1 }, { enemyId: 'trial_soldier', count: 1 }],
    canEscape: true, activityType: 'story', trialProfession: 'knight', difficulty: 'standard', recommendedLevelMin: 3, recommendedLevelMax: 5,
  },
  encounter_trial_ranger: {
    id: 'encounter_trial_ranger', name: '游侠武备试炼', locationId: 'tianlong_martial_trial_ground',
    fixedMembers: [{ enemyId: 'trial_scout', count: 2 }, { enemyId: 'trial_soldier', count: 1 }],
    canEscape: true, activityType: 'story', trialProfession: 'ranger', difficulty: 'standard', recommendedLevelMin: 3, recommendedLevelMax: 5,
  },
  encounter_trial_mage: {
    id: 'encounter_trial_mage', name: '法师武备试炼', locationId: 'tianlong_martial_trial_ground',
    fixedMembers: [{ enemyId: 'trial_apprentice_mage', count: 1 }, { enemyId: 'trial_soldier', count: 1 }],
    canEscape: true, activityType: 'story', trialProfession: 'mage', difficulty: 'standard', recommendedLevelMin: 3, recommendedLevelMax: 5,
  },
  // 单敌迁移映射只供通用校验/XP 规则使用；正式入口使用上方四个职业试炼。
  encounter_trial_soldier: { id: 'encounter_trial_soldier', name: '武备场士兵', locationId: 'tianlong_martial_trial_ground', fixedMembers: [{ enemyId: 'trial_soldier', count: 1 }], canEscape: true, activityType: 'training', difficulty: 'low', recommendedLevelMin: 3, recommendedLevelMax: 4 },
  encounter_trial_duelist: { id: 'encounter_trial_duelist', name: '武备场教习', locationId: 'tianlong_martial_trial_ground', fixedMembers: [{ enemyId: 'trial_duelist', count: 1 }], canEscape: true, activityType: 'training', difficulty: 'standard', recommendedLevelMin: 3, recommendedLevelMax: 5 },
  encounter_trial_scout: { id: 'encounter_trial_scout', name: '武备场斥候', locationId: 'tianlong_martial_trial_ground', fixedMembers: [{ enemyId: 'trial_scout', count: 1 }], canEscape: true, activityType: 'training', difficulty: 'low', recommendedLevelMin: 3, recommendedLevelMax: 4 },
  encounter_trial_apprentice_mage: { id: 'encounter_trial_apprentice_mage', name: '武备场术士', locationId: 'tianlong_martial_trial_ground', fixedMembers: [{ enemyId: 'trial_apprentice_mage', count: 1 }], canEscape: true, activityType: 'training', difficulty: 'dangerous', recommendedLevelMin: 4, recommendedLevelMax: 5 },
  ...(import.meta.env?.DEV === true && import.meta.env.VITE_QA_COMBAT_V7 === '1'
    ? {
        encounter_qa_combat_v7_four: {
          id: 'encounter_qa_combat_v7_four', name: 'Combat V7 四敌阵列', locationId: 'black_stone_tower_floor2',
          fixedMembers: [{ enemyId: 'skeleton_warrior', count: 4 }], canEscape: true,
          activityType: 'optional' as const, difficulty: 'dangerous' as const,
        },
      }
    : {}),
}

export function getEncounter(id: string): EncounterDefinition | undefined {
  return ENCOUNTERS[id]
}

/** 展开一个 Encounter 的全部成员（fixed 或 全部 variants 并集） */
export function allEncounterMembers(def: EncounterDefinition): EncounterMember[] {
  if (def.fixedMembers) return def.fixedMembers
  return def.variants?.flatMap((v) => v.members) ?? []
}

/** 成员总数 sum(count)（fixed：固定阵容；variants：全部变体并集） */
export function totalEncounterMemberCount(def: EncounterDefinition): number {
  return allEncounterMembers(def).reduce((sum, m) => sum + m.count, 0)
}

/** 校验单个 EncounterDefinition（fixedMembers 与 variants 二选一 / count>=1 / 成员总数 1–3 / 敌人已注册） */
export function validateEncounterDefinition(def: EncounterDefinition): void {
  const hasFixed = Array.isArray(def.fixedMembers) && def.fixedMembers.length > 0
  const hasVariants = Array.isArray(def.variants) && def.variants.length > 0
  if (hasFixed === hasVariants) {
    throw new Error(`encounter ${def.id}: fixedMembers 与 variants 必须二选一且至少一个`)
  }
  if (hasFixed) {
    validateMembers(def.id, def.fixedMembers ?? [])
    return
  }
  const variants = def.variants ?? []
  for (const variant of variants) {
    if (!Number.isFinite(variant.weight) || variant.weight <= 0) {
      throw new Error(`encounter ${def.id} variant ${variant.id}: weight 必须 > 0`)
    }
    validateMembers(`${def.id} variant ${variant.id}`, variant.members)
  }
}

function validateMembers(label: string, members: EncounterMember[]): void {
  if (members.length === 0) {
    throw new Error(`encounter ${label}: 成员不能为空`)
  }
  const total = members.reduce((sum, m) => sum + m.count, 0)
  if (total < 1 || total > 4) {
    throw new Error(`encounter ${label}: 成员总数 sum(count) 必须为 1–4，实际 ${total}`)
  }
  for (const m of members) {
    if (!Number.isInteger(m.count) || m.count < 1) {
      throw new Error(`encounter ${label}: count 必须为 >=1 的整数，实际 ${m.count}`)
    }
    if (!ENEMIES[m.enemyId]) {
      throw new Error(`encounter ${label}: 敌人 ${m.enemyId} 未注册`)
    }
  }
}

/** 批量校验全部 EncounterDefinition（模块加载即执行；数据错误立即抛错） */
export function validateEncounterDefinitions(definitions: readonly EncounterDefinition[]): void {
  const ids = new Set<string>()
  for (const def of definitions) {
    if (ids.has(def.id)) {
      throw new Error(`encounter ${def.id}: id 重复`)
    }
    ids.add(def.id)
    validateEncounterDefinition(def)
  }
}

// 模块加载即校验（build 时数据错误立即失败；不允许坏数据静默进入游戏）
validateEncounterDefinitions(Object.values(ENCOUNTERS))
