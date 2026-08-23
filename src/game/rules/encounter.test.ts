/**
 * 战斗入口规则测试（TM-P2-003-R3 D / K5/K6）。
 * 覆盖：通用守卫（敌人/地点/enemyIds）、全部特殊敌人前置、异常 flag 严格 boolean 语义。
 */
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { ENEMIES, getEnemy } from '../content'
import { getEncounter, SINGLE_ENEMY_ENCOUNTERS, validateEncounterDefinition } from '../content/encounters'
import type { EncounterDefinition } from '../types/encounter'
import { checkEnemyEncounter, checkEncounter, currentEncounterVariantId, resolveEncounterVariant } from './encounter'
import type { GameState } from '../types/game'
import type { QuestState } from '../types/quest'

function atLocation(state: GameState, locationId: string): GameState {
  return { ...state, world: { ...state.world, currentLocationId: locationId } }
}

function withQuests(state: GameState, quests: QuestState[]): GameState {
  return { ...state, quests }
}

function withFlags(state: GameState, flags: Record<string, boolean | number | string>): GameState {
  return { ...state, world: { ...state.world, flags: { ...state.world.flags, ...flags } } }
}

function withInventory(state: GameState, entries: { itemId: string; quantity: number }[]): GameState {
  return { ...state, inventory: entries }
}

function wangcaiQuest(flags: Record<string, boolean | number | string> = {}): QuestState {
  return { questId: 'quest_wangcai_trouble', status: 'in_progress', stage: 0, flags }
}

function northGateQuest(flags: Record<string, boolean | number | string> = {}): QuestState {
  return { questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags }
}

/** 黑石塔一层全前置合法状态（skeleton_soldier 可进入） */
function towerFloor1Ready(): GameState {
  return withFlags(
    withQuests(atLocation(createInitialGameState(), 'black_stone_tower_floor1'), [
      wangcaiQuest({ wangcai_briefed: true }),
    ]),
    { black_stone_tower_unlocked: true },
  )
}

/** 黑石塔二层全前置合法状态（tower_zombie 可进入） */
function towerFloor2Ready(): GameState {
  return withFlags(
    withQuests(atLocation(createInitialGameState(), 'black_stone_tower_floor2'), [
      wangcaiQuest({
        wangcai_briefed: true,
        floor1_soldier_defeated: true,
        floor1_captain_defeated: true,
      }),
    ]),
    { black_stone_tower_unlocked: true, black_stone_tower_floor2_unlocked: true },
  )
}

/** 黑石塔三层全前置合法状态（skeleton_witch 可进入） */
function towerFloor3Ready(): GameState {
  return withFlags(
    withQuests(atLocation(createInitialGameState(), 'black_stone_tower_floor3'), [
      wangcaiQuest({
        wangcai_briefed: true,
        floor1_soldier_defeated: true,
        floor1_captain_defeated: true,
        floor2_zombie_defeated: true,
        floor2_black_mage_defeated: true,
        floor2_skeleton_warrior_defeated: true,
      }),
    ]),
    {
      black_stone_tower_unlocked: true,
      black_stone_tower_floor2_unlocked: true,
      black_stone_tower_floor3_unlocked: true,
    },
  )
}

describe('TM-P2-003-R3 D：checkEnemyEncounter 通用守卫', () => {
  it('41: 敌人不存在 → denied (enemy_not_found)', () => {
    const r = checkEnemyEncounter(createInitialGameState(), 'no_such_enemy')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('enemy_not_found')
  })

  it('42: 当前地点不存在 → denied (location_not_found)', () => {
    const r = checkEnemyEncounter(atLocation(createInitialGameState(), 'no_such_location'), 'corrupted_rabbit')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('location_not_found')
  })

  it('43: 敌人不属于当前 location.enemyIds → denied (enemy_not_in_location)', () => {
    // 初始地点 qingshi_village 无敌人
    const r = checkEnemyEncounter(createInitialGameState(), 'corrupted_rabbit')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('enemy_not_in_location')
  })

  it('44: 普通合法敌人（corrupted_rabbit 在村外草原，无额外前置）→ allowed', () => {
    const r = checkEnemyEncounter(atLocation(createInitialGameState(), 'village_grassland'), 'corrupted_rabbit')
    expect(r.allowed).toBe(true)
  })
})

describe('TM-P2-003-R3 D：特殊敌人前置（原样迁移）', () => {
  it('45: corrupted_wolf 非 quest in_progress → denied (quest_not_active)', () => {
    const state = atLocation(createInitialGameState(), 'village_grassland')
    const r = checkEnemyEncounter(state, 'corrupted_wolf')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('quest_not_active')
  })

  it('46: corrupted_wolf 正确状态（《草原狼影》in_progress）→ allowed', () => {
    const state = withQuests(atLocation(createInitialGameState(), 'village_grassland'), [
      { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} },
    ])
    expect(checkEnemyEncounter(state, 'corrupted_wolf').allowed).toBe(true)
  })

  it('47: dudu_rabbit 无兔子路径 → allowed', () => {
    const state = atLocation(createInitialGameState(), 'rabbit_lair')
    expect(checkEnemyEncounter(state, 'dudu_rabbit').allowed).toBe(true)
  })

  it('48: dudu_rabbit 已有 rabbit_path → denied (already_defeated)', () => {
    const state = withInventory(atLocation(createInitialGameState(), 'rabbit_lair'), [
      { itemId: 'rabbit_path', quantity: 1 },
    ])
    const r = checkEnemyEncounter(state, 'dudu_rabbit')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('already_defeated')
  })

  it('49: skeleton_soldier 合法前置 → allowed', () => {
    expect(checkEnemyEncounter(towerFloor1Ready(), 'skeleton_soldier').allowed).toBe(true)
  })

  it('50: skeleton_soldier 错误前置（未解锁黑石塔）→ denied', () => {
    const state = withQuests(atLocation(createInitialGameState(), 'black_stone_tower_floor1'), [
      wangcaiQuest({ wangcai_briefed: true }),
    ])
    expect(checkEnemyEncounter(state, 'skeleton_soldier').allowed).toBe(false)
  })

  it('51: skeleton_captain 合法前置（士兵已击败）→ allowed', () => {
    const state = withQuests(towerFloor1Ready(), [wangcaiQuest({ wangcai_briefed: true, floor1_soldier_defeated: true })])
    expect(checkEnemyEncounter(state, 'skeleton_captain').allowed).toBe(true)
  })

  it('52: skeleton_captain 错误前置（士兵未击败）→ denied', () => {
    expect(checkEnemyEncounter(towerFloor1Ready(), 'skeleton_captain').allowed).toBe(false)
  })

  it('53: tower_zombie 合法前置（二层全开）→ allowed', () => {
    expect(checkEnemyEncounter(towerFloor2Ready(), 'tower_zombie').allowed).toBe(true)
  })

  it('54: tower_zombie 错误前置（二层未解锁）→ denied', () => {
    const state = withQuests(atLocation(createInitialGameState(), 'black_stone_tower_floor2'), [
      wangcaiQuest({ wangcai_briefed: true }),
    ])
    expect(checkEnemyEncounter(state, 'tower_zombie').allowed).toBe(false)
  })

  it('55: black_mage 合法前置（僵尸已击败）→ allowed', () => {
    const state = withQuests(towerFloor2Ready(), [
      wangcaiQuest({
        wangcai_briefed: true,
        floor1_soldier_defeated: true,
        floor1_captain_defeated: true,
        floor2_zombie_defeated: true,
      }),
    ])
    expect(checkEnemyEncounter(state, 'black_mage').allowed).toBe(true)
  })

  it('56: black_mage 错误前置（僵尸未击败）→ denied', () => {
    expect(checkEnemyEncounter(towerFloor2Ready(), 'black_mage').allowed).toBe(false)
  })

  it('57: skeleton_warrior 合法前置（入口区两敌均已击败）→ allowed', () => {
    const state = withQuests(towerFloor2Ready(), [
      wangcaiQuest({
        wangcai_briefed: true,
        floor1_soldier_defeated: true,
        floor1_captain_defeated: true,
        floor2_zombie_defeated: true,
        floor2_black_mage_defeated: true,
      }),
    ])
    expect(checkEnemyEncounter(state, 'skeleton_warrior').allowed).toBe(true)
  })

  it('58: skeleton_warrior 错误前置（黑法师未击败）→ denied', () => {
    const state = withQuests(towerFloor2Ready(), [
      wangcaiQuest({
        wangcai_briefed: true,
        floor1_soldier_defeated: true,
        floor1_captain_defeated: true,
        floor2_zombie_defeated: true,
      }),
    ])
    expect(checkEnemyEncounter(state, 'skeleton_warrior').allowed).toBe(false)
  })

  it('59: skeleton_witch 合法前置（三层全开）→ allowed', () => {
    expect(checkEnemyEncounter(towerFloor3Ready(), 'skeleton_witch').allowed).toBe(true)
  })

  it('60: skeleton_witch 错误前置（二层骷髅战士未击败）→ denied', () => {
    const state = withQuests(towerFloor3Ready(), [
      wangcaiQuest({
        wangcai_briefed: true,
        floor1_soldier_defeated: true,
        floor1_captain_defeated: true,
        floor2_zombie_defeated: true,
        floor2_black_mage_defeated: true,
      }),
    ])
    expect(checkEnemyEncounter(state, 'skeleton_witch').allowed).toBe(false)
  })

  it('61: black_mane_wolf 合法前置（北门 + 已查痕迹）→ allowed', () => {
    const state = withQuests(atLocation(createInitialGameState(), 'tianlong_north_gate'), [
      northGateQuest({ north_gate_trail_checked: true }),
    ])
    expect(checkEnemyEncounter(state, 'black_mane_wolf').allowed).toBe(true)
  })

  it('62: black_mane_wolf 错误前置（未查痕迹）→ denied', () => {
    const state = withQuests(atLocation(createInitialGameState(), 'tianlong_north_gate'), [northGateQuest()])
    expect(checkEnemyEncounter(state, 'black_mane_wolf').allowed).toBe(false)
  })
})

describe('TM-P2-003-R3 D：异常 Flag 严格 boolean 语义（K6）', () => {
  it('63: floor1_soldier_defeated = "yes" → 不得视为 false → denied (invalid_story_state)', () => {
    const state = withQuests(towerFloor1Ready(), [
      wangcaiQuest({ wangcai_briefed: true, floor1_soldier_defeated: 'yes' }),
    ])
    const r = checkEnemyEncounter(state, 'skeleton_soldier')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_story_state')
  })

  it('64: north_gate_wolf_defeated = 1 → denied (invalid_story_state)', () => {
    const state = withQuests(atLocation(createInitialGameState(), 'tianlong_north_gate'), [
      northGateQuest({ north_gate_trail_checked: true, north_gate_wolf_defeated: 1 }),
    ])
    const r = checkEnemyEncounter(state, 'black_mane_wolf')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_story_state')
  })

  it('65: floor3_skeleton_witch_defeated = "false" → denied (invalid_story_state)', () => {
    const state = withQuests(towerFloor3Ready(), [
      wangcaiQuest({
        wangcai_briefed: true,
        floor1_soldier_defeated: true,
        floor1_captain_defeated: true,
        floor2_zombie_defeated: true,
        floor2_black_mage_defeated: true,
        floor2_skeleton_warrior_defeated: true,
        floor3_skeleton_witch_defeated: 'false',
      }),
    ])
    const r = checkEnemyEncounter(state, 'skeleton_witch')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_story_state')
  })
})

describe('TM-P2-007 §7/44：Encounter V2 数据层（checkEncounter / 权重 / 持久化 / 迁移）', () => {
  function withEncounterVariants(state: GameState, variants: Record<string, string>): GameState {
    return { ...state, world: { ...state.world, encounterVariants: { ...state.world.encounterVariants, ...variants } } }
  }

  it('66: EN1 固定单敌遭遇（fixed 1 敌）→ 可进入，resolveEncounterVariant 返回固定 id', () => {
    const r = checkEncounter(atLocation(createInitialGameState(), 'village_grassland'), 'encounter_corrupted_rabbit')
    expect(r.allowed).toBe(true)
    const def = getEncounter('encounter_corrupted_rabbit')
    expect(def).toBeDefined()
    expect(resolveEncounterVariant(def!, () => 0)).toBe('encounter_corrupted_rabbit')
  })

  it('67: EN2 固定双敌遭遇（fixed 2 敌）→ 定义校验通过', () => {
    const def: EncounterDefinition = {
      id: 'fixture_fixed_2',
      name: '测试双敌',
      locationId: 'village_grassland',
      fixedMembers: [
        { enemyId: 'corrupted_rabbit', count: 1 },
        { enemyId: 'corrupted_rat', count: 1 },
      ],
      canEscape: true,
    }
    expect(() => validateEncounterDefinition(def)).not.toThrow()
  })

  it('68: EN3 固定三敌遭遇（fixed 3 敌）→ 定义校验通过', () => {
    const def: EncounterDefinition = {
      id: 'fixture_fixed_3',
      name: '测试三敌',
      locationId: 'village_grassland',
      fixedMembers: [
        { enemyId: 'corrupted_rabbit', count: 1 },
        { enemyId: 'corrupted_rat', count: 1 },
        { enemyId: 'corrupted_wolf', count: 1 },
      ],
      canEscape: true,
    }
    expect(() => validateEncounterDefinition(def)).not.toThrow()
  })

  it('69: EN4 成员总数 >3 拒绝（fixed / weighted / 二选一 均校验抛错）', () => {
    const fixedOver: EncounterDefinition = {
      id: 'fixture_over_fixed',
      name: '测试超编',
      locationId: 'village_grassland',
      fixedMembers: [
        { enemyId: 'corrupted_rabbit', count: 1 },
        { enemyId: 'corrupted_rat', count: 1 },
        { enemyId: 'corrupted_wolf', count: 1 },
        { enemyId: 'dudu_rabbit', count: 1 },
      ],
      canEscape: true,
    }
    expect(() => validateEncounterDefinition(fixedOver)).toThrow(/sum\(count\) 必须为 1–3/)

    const variantOver: EncounterDefinition = {
      id: 'fixture_over_variant',
      name: '测试超编变体',
      locationId: 'village_grassland',
      variants: [{ id: 'v1', weight: 50, members: [{ enemyId: 'skeleton_warrior', count: 4 }] }],
      canEscape: true,
    }
    expect(() => validateEncounterDefinition(variantOver)).toThrow(/sum\(count\) 必须为 1–3/)

    const neither: EncounterDefinition = {
      id: 'fixture_neither',
      name: '无阵容',
      locationId: 'village_grassland',
      canEscape: true,
    }
    expect(() => validateEncounterDefinition(neither)).toThrow(/fixedMembers 与 variants 必须二选一/)
  })

  it('70: EN5 加权遭遇确定性：同一 rng 序列稳定，结果始终落在 variants 内', () => {
    const def = getEncounter('encounter_broken_patrol')
    expect(def).toBeDefined()
    const variantIds = def!.variants!.map((v) => v.id)
    expect(resolveEncounterVariant(def!, () => 0.25)).toBe(resolveEncounterVariant(def!, () => 0.25))
    expect(resolveEncounterVariant(def!, () => 0)).toBe('broken_patrol_a')
    for (let i = 0; i < 100; i++) {
      expect(variantIds).toContain(resolveEncounterVariant(def!, () => i / 100))
    }
  })

  it('71: EN6 variant 持久化：encounterVariants 已有值则使用且不 reroll（规则层只读）', () => {
    const def = getEncounter('encounter_broken_patrol')!
    const persisted = withEncounterVariants(atLocation(createInitialGameState(), 'black_stone_tower_floor2'), {
      encounter_broken_patrol: 'broken_patrol_b',
    })
    expect(currentEncounterVariantId(persisted, def)).toBe('broken_patrol_b')
    // 未固化 → undefined（规则层不 roll；首次写入由调用方在 allowed 时负责）
    const fresh = atLocation(createInitialGameState(), 'black_stone_tower_floor2')
    expect(currentEncounterVariantId(fresh, def)).toBeUndefined()
    // 只读函数不修改 state（读档后原值原样保留 → 不 reroll）
    expect(persisted.world.encounterVariants.encounter_broken_patrol).toBe('broken_patrol_b')
  })

  it('72: EN7 缺敌注册拒绝（encounter_not_found）', () => {
    const r = checkEncounter(createInitialGameState(), 'encounter_no_such')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('encounter_not_found')
  })

  it('73: EN8 错地点拒绝（enemy_not_in_location / location_not_found）', () => {
    // qingshi_village 无该遭遇挂载
    const r = checkEncounter(atLocation(createInitialGameState(), 'qingshi_village'), 'encounter_corrupted_rabbit')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('enemy_not_in_location')
    // 不存在的地点 → location_not_found
    const r2 = checkEncounter(atLocation(createInitialGameState(), 'no_such_location'), 'encounter_corrupted_rabbit')
    expect(r2.allowed).toBe(false)
    expect(r2.reason).toBe('location_not_found')
  })

  it('74: EN9 defeated 门（单敌委托复用现有守卫；残灾 world.flags 门同样生效）', () => {
    // 单敌：skeleton_soldier 已击败（quest.flags）→ already_defeated
    const soldierDefeated = withQuests(towerFloor1Ready(), [
      wangcaiQuest({ wangcai_briefed: true, floor1_soldier_defeated: true }),
    ])
    const r1 = checkEncounter(soldierDefeated, 'encounter_skeleton_soldier')
    expect(r1.allowed).toBe(false)
    expect(r1.reason).toBe('already_defeated')
    // 单敌：残灾之影 world.flags 已击败 → denied
    const calamityDefeated = withFlags(atLocation(createInitialGameState(), 'sakura_domain_fragment'), {
      sakura_calamity_defeated: true,
    })
    expect(checkEncounter(calamityDefeated, 'encounter_sakura_calamity_fragment').allowed).toBe(false)
  })

  it('75: EN10 canEscape 语义：残灾不可逃，普通与可选遭遇可逃', () => {
    expect(getEncounter('encounter_sakura_calamity_fragment')!.canEscape).toBe(false)
    expect(getEncounter('encounter_corrupted_rabbit')!.canEscape).toBe(true)
    expect(getEncounter('encounter_broken_patrol')!.canEscape).toBe(true)
  })

  it('76: EN11 残破巡逻队可选：加权、无主线 defeated flag、二层可进入且无任务前置', () => {
    const def = getEncounter('encounter_broken_patrol')!
    // 加权（非 fixed），两个变体
    expect(def.fixedMembers).toBeUndefined()
    expect(def.variants).toHaveLength(2)
    for (const v of def.variants!) {
      const total = v.members.reduce((sum, m) => sum + m.count, 0)
      expect(total).toBeGreaterThanOrEqual(1)
      expect(total).toBeLessThanOrEqual(3)
    }
    // 不进主线：无 encounterDefeatFlag、无 quest 前置，初始 state（无任务）即可进入
    expect(def.encounterDefeatFlag).toBeUndefined()
    const r = checkEncounter(atLocation(createInitialGameState(), 'black_stone_tower_floor2'), 'encounter_broken_patrol')
    expect(r.allowed).toBe(true)
    // 成员敌人均已注册（骷髅战士 / 黑法师）
    expect(getEnemy('skeleton_warrior')).toBeDefined()
    expect(getEnemy('black_mage')).toBeDefined()
  })

  it('77: EN12 迁移映射完整性：全部既有敌人都有对应单敌 EncounterDefinition', () => {
    const enemyIds = Object.keys(ENEMIES)
    // 现有 registry 实际 12 个敌人（含 sakura_calamity_fragment）；全量覆盖不遗漏
    expect(enemyIds.length).toBeGreaterThanOrEqual(11)
    for (const enemyId of enemyIds) {
      const encounterId = SINGLE_ENEMY_ENCOUNTERS[enemyId]
      expect(encounterId).toBeDefined()
      const def = getEncounter(encounterId!)
      expect(def).toBeDefined()
      expect(def!.fixedMembers).toEqual([{ enemyId, count: 1 }])
    }
  })
})
