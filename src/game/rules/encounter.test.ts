/**
 * 战斗入口规则测试（TM-P2-003-R3 D / K5/K6）。
 * 覆盖：通用守卫（敌人/地点/enemyIds）、全部特殊敌人前置、异常 flag 严格 boolean 语义。
 */
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { ENEMIES, getEnemy, getLocation } from '../content'
import { ENCOUNTERS, allEncounterMembers, getEncounter, SINGLE_ENEMY_ENCOUNTERS, validateEncounterDefinition } from '../content/encounters'
import type { EncounterDefinition } from '../types/encounter'
import { checkEnemyEncounter, checkEncounter, currentEncounterVariantId, encounterRosterPreview, formatEncounterMembers, resolveEncounterVariant } from './encounter'
import { buildCombatSetup } from './combatSetup'
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

  it('69: EN4 成员总数 >4 拒绝（fixed / weighted / 二选一 均校验抛错）', () => {
    const fixedOver: EncounterDefinition = {
      id: 'fixture_over_fixed',
      name: '测试超编',
      locationId: 'village_grassland',
      fixedMembers: [
        { enemyId: 'corrupted_rabbit', count: 1 },
        { enemyId: 'corrupted_rat', count: 1 },
        { enemyId: 'corrupted_wolf', count: 1 },
      { enemyId: 'dudu_rabbit', count: 2 },
      ],
      canEscape: true,
    }
    expect(() => validateEncounterDefinition(fixedOver)).toThrow(/sum\(count\) 必须为 1–4/)

    const variantOver: EncounterDefinition = {
      id: 'fixture_over_variant',
      name: '测试超编变体',
      locationId: 'village_grassland',
      variants: [{ id: 'v1', weight: 50, members: [{ enemyId: 'skeleton_warrior', count: 5 }] }],
      canEscape: true,
    }
    expect(() => validateEncounterDefinition(variantOver)).toThrow(/sum\(count\) 必须为 1–4/)

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

  it('77: EN12 迁移映射完整性：全部敌人都有 EncounterDefinition 收录；单敌映射成员必须 exact count:1', () => {
    const enemyIds = Object.keys(ENEMIES)
    // 现有 registry 实际 12 个敌人（含 sakura_calamity_fragment）；全量覆盖不遗漏
    expect(enemyIds.length).toBeGreaterThanOrEqual(11)
    for (const enemyId of enemyIds) {
      // TM-P2-012 §50/§51：venom_bee_swarm 只作为多敌遭遇成员出现（蜂群×2 / 山谷混合），
      // 不再有单敌遭遇——映射完整性改为「至少被一个 Encounter 收录」。
      const hosted = Object.values(ENCOUNTERS).some((def) => allEncounterMembers(def).some((m) => m.enemyId === enemyId))
      expect(hosted).toBe(true)
    }
    for (const [enemyId, encounterId] of Object.entries(SINGLE_ENEMY_ENCOUNTERS)) {
      const def = getEncounter(encounterId)
      expect(def).toBeDefined()
      expect(def!.fixedMembers).toEqual([{ enemyId, count: 1 }])
    }
  })
})

describe('TM-P2-008 EN1-8：北郊荒原狼群（§23-24）', () => {
  it('EN1: 荒原狼群注册有效——variants 三档、成员总数 1-3、敌人已注册', () => {
    const def = getEncounter('encounter_steppe_wolf_pack')
    expect(def).toBeDefined()
    expect(def!.fixedMembers).toBeUndefined()
    expect(def!.variants).toHaveLength(3)
    expect(def!.locationId).toBe('tianlong_north_outskirts')
    for (const v of def!.variants!) {
      expect(v.weight).toBeGreaterThan(0)
      const total = v.members.reduce((sum, m) => sum + m.count, 0)
      expect(total).toBeGreaterThanOrEqual(1)
      expect(total).toBeLessThanOrEqual(3)
      for (const m of v.members) {
        expect(getEnemy(m.enemyId)).toBeDefined()
      }
    }
    expect(def!.canEscape).toBe(true)
  })

  it('EN2: 荒原野狼单敌遭遇注册 + 迁移映射完整（EN12 全量覆盖）', () => {
    expect(getEncounter('encounter_wild_wolf')).toBeDefined()
    expect(SINGLE_ENEMY_ENCOUNTERS.wild_wolf).toBe('encounter_wild_wolf')
    const def = getEncounter('encounter_wild_wolf')!
    expect(def.fixedMembers).toEqual([{ enemyId: 'wild_wolf', count: 1 }])
    expect(def.encounterDefeatFlag).toBeUndefined()
  })

  it('EN3: 荒原野狼掉表——狼牙 guaranteed + 狼皮 random + 兽肉 lucky（§25 复用）', () => {
    const table = getEnemy('wild_wolf')?.dropTable
    expect(table).toBeDefined()
    expect(table!.guaranteed).toEqual([{ itemId: 'wolf_fang', quantity: [1, 1] }])
    expect(table!.random).toContainEqual({ itemId: 'wolf_pelt', quantity: [1, 1], baseChance: 0.35 })
    expect(table!.lucky).toContainEqual({ itemId: 'wolf_meat', quantity: [1, 1], dc: 12 })
  })

  it('EN4: 单敌落单野狼在北郊可进入（无任务前置、无 defeated 门）', () => {
    const state = atLocation(createInitialGameState(), 'tianlong_north_outskirts')
    const r = checkEncounter(state, 'encounter_wild_wolf')
    expect(r.allowed).toBe(true)
  })

  it('EN5: 狼群 defeated 门——未击败允许；world.flags 已击败拒绝（already_defeated）', () => {
    const fresh = atLocation(createInitialGameState(), 'tianlong_north_outskirts')
    expect(checkEncounter(fresh, 'encounter_steppe_wolf_pack').allowed).toBe(true)
    const defeated = withFlags(atLocation(createInitialGameState(), 'tianlong_north_outskirts'), {
      steppe_wolf_pack_defeated: true,
    })
    const r = checkEncounter(defeated, 'encounter_steppe_wolf_pack')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('already_defeated')
    // 非 boolean 异常值 → invalid_story_state
    const malformed = withFlags(atLocation(createInitialGameState(), 'tianlong_north_outskirts'), {
      steppe_wolf_pack_defeated: 'yes',
    })
    const r2 = checkEncounter(malformed, 'encounter_steppe_wolf_pack')
    expect(r2.allowed).toBe(false)
    expect(r2.reason).toBe('invalid_story_state')
  })

  it('EN6: 权重选择——rng 边界正确映射三档', () => {
    const def = getEncounter('encounter_steppe_wolf_pack')!
    // 三档权重 50/30/20 → 累积边界：0-0.5→a、0.5-0.8→b、0.8-1→c
    expect(resolveEncounterVariant(def, () => 0)).toBe('steppe_wolf_pack_a')
    expect(resolveEncounterVariant(def, () => 0.49)).toBe('steppe_wolf_pack_a')
    expect(resolveEncounterVariant(def, () => 0.5)).toBe('steppe_wolf_pack_b')
    expect(resolveEncounterVariant(def, () => 0.79)).toBe('steppe_wolf_pack_b')
    expect(resolveEncounterVariant(def, () => 0.8)).toBe('steppe_wolf_pack_c')
    expect(resolveEncounterVariant(def, () => 0.999)).toBe('steppe_wolf_pack_c')
  })

  it('EN7: variant 固化——world.encounterVariants 已固化不 reroll；未固化 undefined', () => {
    const def = getEncounter('encounter_steppe_wolf_pack')!
    const persisted = withFlags(createInitialGameState(), {}) as GameState
    persisted.world.encounterVariants = { encounter_steppe_wolf_pack: 'steppe_wolf_pack_b' }
    expect(currentEncounterVariantId(persisted, def)).toBe('steppe_wolf_pack_b')
    const fresh = atLocation(createInitialGameState(), 'tianlong_north_outskirts')
    expect(currentEncounterVariantId(fresh, def)).toBeUndefined()
  })

  it('EN8: 狼群 members 含黑鬃魔狼变体（§23 B 档）且单敌迁移不受影响', () => {
    const def = getEncounter('encounter_steppe_wolf_pack')!
    const variantB = def.variants!.find((v) => v.id === 'steppe_wolf_pack_b')!
    expect(variantB.members).toEqual([
      { enemyId: 'black_mane_wolf', count: 1 },
      { enemyId: 'wild_wolf', count: 1 },
    ])
    // 黑鬃魔狼单敌迁移仍指向北门遭遇
    expect(SINGLE_ENEMY_ENCOUNTERS.black_mane_wolf).toBe('encounter_black_mane_wolf')
    expect(getEncounter('encounter_black_mane_wolf')!.locationId).toBe('tianlong_north_gate')
  })
})

describe('TM-P2-009-R1 §4：Encounter roster 预览（未固化多候选 / 固化单一阵容；禁并集假阵容）', () => {
  const brokenPatrol = () => getEncounter('encounter_broken_patrol')!
  const atTower2 = (variants?: Record<string, string>): GameState => {
    const state = atLocation(createInitialGameState(), 'black_stone_tower_floor2')
    if (!variants) return state
    return { ...state, world: { ...state.world, encounterVariants: { ...state.world.encounterVariants, ...variants } } }
  }

  it('R1: 未固化 → locked=false，candidates 为各 variant 独立阵容（不并集）', () => {
    const preview = encounterRosterPreview(atTower2(), brokenPatrol())
    expect(preview.locked).toBe(false)
    expect(preview.members).toEqual([])
    expect(preview.candidates).toHaveLength(2)
    expect(preview.candidates[0]).toEqual([{ enemyId: 'skeleton_warrior', count: 2 }])
    expect(preview.candidates[1]).toEqual([
      { enemyId: 'skeleton_warrior', count: 1 },
      { enemyId: 'black_mage', count: 1 },
    ])
    // 禁止把 variants 并集当阵容：每个候选成员总数 ≤3，且永不出现 2 warriors + 1 mage 假阵容
    for (const members of preview.candidates) {
      const total = members.reduce((sum, m) => sum + m.count, 0)
      expect(total).toBeLessThanOrEqual(3)
      const warriors = members.find((m) => m.enemyId === 'skeleton_warrior')?.count ?? 0
      const mages = members.find((m) => m.enemyId === 'black_mage')?.count ?? 0
      expect(warriors <= 2 && mages <= 1).toBe(true)
    }
  })

  it('R2: 固化 variant A → locked=true 只显示单一阵容（2 warriors）', () => {
    const preview = encounterRosterPreview(atTower2({ encounter_broken_patrol: 'broken_patrol_a' }), brokenPatrol())
    expect(preview.locked).toBe(true)
    expect(preview.members).toEqual([{ enemyId: 'skeleton_warrior', count: 2 }])
    expect(preview.candidates).toEqual([])
  })

  it('R3: 固化 variant B → locked=true 只显示单一阵容（warrior + mage）', () => {
    const preview = encounterRosterPreview(atTower2({ encounter_broken_patrol: 'broken_patrol_b' }), brokenPatrol())
    expect(preview.locked).toBe(true)
    expect(preview.members).toEqual([
      { enemyId: 'skeleton_warrior', count: 1 },
      { enemyId: 'black_mage', count: 1 },
    ])
  })

  it('R4: 预览（preview）与战斗（buildCombatSetup 读同一 persisted variant）阵容一致，永不出现 2+1 假阵容', () => {
    const def = brokenPatrol()
    const cases: { variantId: string; total: number; warriors: number; mages: number }[] = [
      { variantId: 'broken_patrol_a', total: 2, warriors: 2, mages: 0 },
      { variantId: 'broken_patrol_b', total: 2, warriors: 1, mages: 1 },
    ]
    for (const c of cases) {
      const state = atTower2({ encounter_broken_patrol: c.variantId })
      const preview = encounterRosterPreview(state, def)
      expect(preview.locked).toBe(true)
      const battle = buildCombatSetup(state, def).enemies
      expect(battle).toHaveLength(c.total)
      const warriors = battle.filter((cc) => cc.sourceId === 'skeleton_warrior').length
      const mages = battle.filter((cc) => cc.sourceId === 'black_mage').length
      expect(warriors).toBe(c.warriors)
      expect(mages).toBe(c.mages)
      // 永不出现 2 warriors + 1 mage 假阵容
      expect(!(warriors === 2 && mages === 1)).toBe(true)
    }
  })

  it('R5: formatEncounterMembers 用户文案（×N / +；不泄露内部 ID）', () => {
    expect(formatEncounterMembers([{ enemyId: 'skeleton_warrior', count: 2 }])).toBe('骷髅战士×2')
    expect(
      formatEncounterMembers([
        { enemyId: 'skeleton_warrior', count: 1 },
        { enemyId: 'black_mage', count: 1 },
      ]),
    ).toBe('骷髅战士+黑法师')
    expect(formatEncounterMembers([])).toBe('')
  })

  it('R6: 单 variant 遭遇（驿站狼群）未固化显示唯一候选，固化后 locked 单一阵容', () => {
    const def = getEncounter('encounter_waystation_wolf_pack')!
    const fresh = atLocation(createInitialGameState(), 'tianlong_north_abandoned_waystation')
    const preview = encounterRosterPreview(fresh, def)
    expect(preview.locked).toBe(false)
    expect(preview.candidates).toHaveLength(1)
    expect(preview.candidates[0]).toEqual([
      { enemyId: 'wild_wolf', count: 2 },
      { enemyId: 'corrupted_wolf', count: 1 },
    ])
    const locked = {
      ...fresh,
      world: { ...fresh.world, encounterVariants: { encounter_waystation_wolf_pack: 'waystation_wolf_pack_fixed' } },
    }
    const lockedPreview = encounterRosterPreview(locked, def)
    expect(lockedPreview.locked).toBe(true)
    expect(lockedPreview.members).toEqual([
      { enemyId: 'wild_wolf', count: 2 },
      { enemyId: 'corrupted_wolf', count: 1 },
    ])
  })
})

describe('TM-P2-009-R1 §11：Encounter Diversity V1（H1-H6）', () => {
  const COVERED_MAPS = [
    'village_grassland',
    'abandoned_mine',
    'black_stone_tower_floor1',
    'black_stone_tower_floor2',
    'black_stone_tower_floor3',
    'tianlong_north_outskirts',
  ] as const

  it('H1: 关键探索地图每图至少两种可选威胁（location.encounters ≥2 且全部已注册）', () => {
    for (const locationId of COVERED_MAPS) {
      const location = getLocation(locationId)
      expect(location, locationId).toBeDefined()
      const encounterIds = location!.encounters ?? []
      expect(encounterIds.length, `${locationId} 至少 2 种威胁`).toBeGreaterThanOrEqual(2)
      for (const encounterId of encounterIds) {
        expect(getEncounter(encounterId), `${locationId} → ${encounterId}`).toBeDefined()
      }
    }
  })

  it('H2: 全部遭遇有推荐等级（recommendedLevelMin ≥1；Max ≥ Min 若提供）', () => {
    for (const def of Object.values(ENCOUNTERS)) {
      expect(def.recommendedLevelMin, def.id).toBeTypeOf('number')
      expect(def.recommendedLevelMin!, def.id).toBeGreaterThanOrEqual(1)
      if (def.recommendedLevelMax !== undefined) {
        expect(def.recommendedLevelMax, def.id).toBeGreaterThanOrEqual(def.recommendedLevelMin!)
      }
    }
  })

  it('H3: low/standard/dangerous 三种难度均可区分且均被使用', () => {
    const seen = new Set<string>()
    for (const def of Object.values(ENCOUNTERS)) {
      expect(['low', 'standard', 'dangerous'], def.id).toContain(def.difficulty)
      seen.add(def.difficulty!)
    }
    expect(seen).toEqual(new Set(['low', 'standard', 'dangerous']))
  })

  it('H4: 不动态缩放——全部遭遇定义校验通过（成员 1-4、敌人已注册；无 scaling 字段）', () => {
    for (const def of Object.values(ENCOUNTERS)) {
      expect(() => validateEncounterDefinition(def), def.id).not.toThrow()
    }
  })

  it('H5/H6: repeatable 约束——可重复的必为可选（无 defeated 门）且有低额重复 XP；一次性遭遇不标 repeatable', () => {
    for (const def of Object.values(ENCOUNTERS)) {
      if (def.repeatable) {
        expect(def.encounterDefeatFlag, `${def.id} repeatable 不可有 defeated 门`).toBeUndefined()
        expect(def.repeatAdventureXpReward ?? 0, `${def.id} repeat XP`).toBeGreaterThan(0)
      } else {
        expect(def.repeatAdventureXpReward, `${def.id} 非 repeatable 不应有 repeat XP`).toBeUndefined()
      }
    }
  })

  it('新增 7 个 repeatable 遭遇注册有效（二选一、成员已注册、可逃跑、有难度）', () => {
    const ids = [
      'encounter_grassland_rabbit_pair',
      'encounter_cave_bat',
      'encounter_mine_mixed',
      'encounter_floor1_soldier_pair',
      'encounter_floor3_witch_escort',
      'encounter_north_boar',
      'encounter_north_mane_pack',
    ]
    for (const id of ids) {
      const def = getEncounter(id)
      expect(def, id).toBeDefined()
      expect(() => validateEncounterDefinition(def!), id).not.toThrow()
      expect(def!.canEscape, id).toBe(true)
      expect(def!.repeatable, id).toBe(true)
      expect(def!.difficulty, id).toBeDefined()
      expect(def!.recommendedLevelMin, id).toBeGreaterThanOrEqual(1)
    }
  })

  it('新敌人 cave_bat/wild_boar 挂载对应地点 enemyIds 且单敌遭遇可进入（checkEnemyEncounter 委托）', () => {
    expect(getLocation('abandoned_mine')!.enemyIds).toContain('cave_bat')
    expect(getLocation('tianlong_north_outskirts')!.enemyIds).toContain('wild_boar')
    const mine = atLocation(createInitialGameState(), 'abandoned_mine')
    expect(checkEnemyEncounter(mine, 'cave_bat').allowed).toBe(true)
    expect(checkEncounter(mine, 'encounter_cave_bat').allowed).toBe(true)
    const north = atLocation(createInitialGameState(), 'tianlong_north_outskirts')
    expect(checkEnemyEncounter(north, 'wild_boar').allowed).toBe(true)
    expect(checkEncounter(north, 'encounter_north_boar').allowed).toBe(true)
  })
})

describe('TM-P2-010 武备试炼职业路由守卫', () => {
  const routes = [
    ['warrior', 'route_warrior', 'encounter_trial_warrior'],
    ['knight', 'route_knight', 'encounter_trial_knight'],
    ['ranger', 'route_ranger', 'encounter_trial_ranger'],
    ['mage', 'route_mage', 'encounter_trial_mage'],
  ] as const

  function trialState(profession: (typeof routes)[number][0], route: string): GameState {
    const state = atLocation(createInitialGameState(), 'tianlong_martial_trial_ground')
    state.player.profession = profession
    state.world.flags.martial_trial_invited = true
    state.quests = [{
      questId: 'quest_tianlong_martial_trial',
      status: 'in_progress',
      stage: 0,
      flags: {
        trial_registered: true,
        trial_observation_done: true,
        [route]: true,
      },
    }]
    return state
  }

  it.each(routes)('%s route → 允许对应职业试炼', (profession, route, encounterId) => {
    expect(checkEncounter(trialState(profession, route), encounterId).allowed).toBe(true)
  })

  it.each([
    ['warrior', 'route_knight', 'encounter_trial_warrior'], ['warrior', 'route_ranger', 'encounter_trial_warrior'], ['warrior', 'route_mage', 'encounter_trial_warrior'],
    ['knight', 'route_warrior', 'encounter_trial_knight'], ['knight', 'route_ranger', 'encounter_trial_knight'], ['knight', 'route_mage', 'encounter_trial_knight'],
    ['ranger', 'route_warrior', 'encounter_trial_ranger'], ['ranger', 'route_knight', 'encounter_trial_ranger'], ['ranger', 'route_mage', 'encounter_trial_ranger'],
    ['mage', 'route_warrior', 'encounter_trial_mage'], ['mage', 'route_knight', 'encounter_trial_mage'], ['mage', 'route_ranger', 'encounter_trial_mage'],
  ] as const)('%s cross-route %s → 拒绝', (profession, route, encounterId) => {
    const result = checkEncounter(trialState(profession, route), encounterId)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('missing_prerequisite')
  })
})
