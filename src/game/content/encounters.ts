/**
 * Encounter V2 内容注册表（TM-P2-007 §7）。
 *  - 现有全部单敌战斗包进 EncounterDefinition（fixedMembers 单敌；defeated 门继续由
 *    rules/encounter.ts 委托现有 checkEnemyEncounter 守卫链处理，本文件只负责定义与挂载）。
 *  - 新增非主线可选多怪遭遇：残破巡逻队（TM-P2-007 §7.5；黑石塔二层；不影响主线 flag）。
 *  - 模块加载即校验：成员总数 sum(count)<=3、fixedMembers 与 variants 二选一、count>=1、敌人已注册。
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
  },
  encounter_corrupted_rat: {
    id: 'encounter_corrupted_rat',
    name: '魔化鼠',
    locationId: 'abandoned_mine',
    fixedMembers: [{ enemyId: 'corrupted_rat', count: 1 }],
    canEscape: true,
  },
  encounter_corrupted_wolf: {
    id: 'encounter_corrupted_wolf',
    name: '魔化狼',
    locationId: 'village_grassland',
    fixedMembers: [{ enemyId: 'corrupted_wolf', count: 1 }],
    canEscape: true,
  },
  encounter_dudu_rabbit: {
    id: 'encounter_dudu_rabbit',
    name: '嘟嘟兔',
    locationId: 'rabbit_lair',
    fixedMembers: [{ enemyId: 'dudu_rabbit', count: 1 }],
    canEscape: true,
  },
  encounter_skeleton_soldier: {
    id: 'encounter_skeleton_soldier',
    name: '骷髅士兵',
    locationId: 'black_stone_tower_floor1',
    fixedMembers: [{ enemyId: 'skeleton_soldier', count: 1 }],
    canEscape: true,
    // defeated 门位于 quest_wangcai_trouble.flags（checkEncounter 委托 checkEnemyEncounter 处理）
    encounterDefeatFlag: 'floor1_soldier_defeated',
  },
  encounter_skeleton_captain: {
    id: 'encounter_skeleton_captain',
    name: '骷髅队长',
    locationId: 'black_stone_tower_floor1',
    fixedMembers: [{ enemyId: 'skeleton_captain', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor1_captain_defeated',
  },
  encounter_tower_zombie: {
    id: 'encounter_tower_zombie',
    name: '僵尸',
    locationId: 'black_stone_tower_floor2',
    fixedMembers: [{ enemyId: 'tower_zombie', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor2_zombie_defeated',
  },
  encounter_black_mage: {
    id: 'encounter_black_mage',
    name: '黑法师',
    locationId: 'black_stone_tower_floor2',
    fixedMembers: [{ enemyId: 'black_mage', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor2_black_mage_defeated',
  },
  encounter_skeleton_warrior: {
    id: 'encounter_skeleton_warrior',
    name: '骷髅战士',
    locationId: 'black_stone_tower_floor2',
    fixedMembers: [{ enemyId: 'skeleton_warrior', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor2_skeleton_warrior_defeated',
  },
  encounter_skeleton_witch: {
    id: 'encounter_skeleton_witch',
    name: '骷髅女妖',
    locationId: 'black_stone_tower_floor3',
    fixedMembers: [{ enemyId: 'skeleton_witch', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'floor3_skeleton_witch_defeated',
  },
  encounter_black_mane_wolf: {
    id: 'encounter_black_mane_wolf',
    name: '黑鬃魔狼',
    locationId: 'tianlong_north_gate',
    fixedMembers: [{ enemyId: 'black_mane_wolf', count: 1 }],
    canEscape: true,
    encounterDefeatFlag: 'north_gate_wolf_defeated',
  },
  // TM-P2-008 §23：北郊单只落单野狼（可重复遭遇；无 encounterDefeatFlag，不打不影响主线 flag）
  encounter_wild_wolf: {
    id: 'encounter_wild_wolf',
    name: '落单野狼',
    locationId: 'tianlong_north_outskirts',
    fixedMembers: [{ enemyId: 'wild_wolf', count: 1 }],
    canEscape: true,
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
  },
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
  if (total < 1 || total > 3) {
    throw new Error(`encounter ${label}: 成员总数 sum(count) 必须为 1–3，实际 ${total}`)
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
