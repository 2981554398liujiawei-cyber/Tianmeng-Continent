/**
 * 战斗入口规则测试（TM-P2-003-R3 D / K5/K6）。
 * 覆盖：通用守卫（敌人/地点/enemyIds）、全部特殊敌人前置、异常 flag 严格 boolean 语义。
 */
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { checkEnemyEncounter } from './encounter'
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
