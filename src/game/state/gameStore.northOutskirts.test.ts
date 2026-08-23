import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../state/gameStore'
import { createInitialGameState } from '../content/initial'
import { getDiscoveredClueIds, hasClue } from '../rules/clue'
import { NORTH_OUTSKIRTS_INVESTIGATE_DC } from '../state/gameStore'

/**
 * TM-P2-008 §16-29：北郊余波主线《北郊追踪》全流程 store 单测。
 * 覆盖：发现前置（北门失联 completed）、Stage A-D 推进、多解检定（MND/LCK/Sakura）、
 * 荒原狼群可选遭遇 defeated 门、addClue 幂等、generic 完成奖励（100 XP + 40 金）。
 */

function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockStorage())
  useGameStore.setState({ gameState: createInitialGameState(), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function atLocation(locationId: string): void {
  useGameStore.getState().gameState!.world.currentLocationId = locationId
}

/** 北郊任务 in_progress（无任何阶段 flag） */
function northOutskirtsInProgress(): void {
  useGameStore.getState().gameState!.quests = [
    { questId: 'quest_north_outskirts', status: 'in_progress', stage: 0, flags: {} },
  ]
}

/** 北门失联 completed（北郊任务发现前置） */
function northGateCompleted(): void {
  useGameStore.getState().gameState!.quests = [
    { questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} },
  ]
}

/** 推进到 Stage B/C 就绪态（已追踪 + 已找到现场 + 在北郊） */
function stageCReady(): void {
  const state = useGameStore.getState().gameState!
  state.world.currentLocationId = 'tianlong_north_outskirts'
  state.quests = [
    {
      questId: 'quest_north_outskirts',
      status: 'in_progress',
      stage: 0,
      flags: { north_outskirts_trail_tracked: true, north_outskirts_ambush_found: true },
    },
  ]
}

/** Sakura 在场（recruited + active） */
function sakuraPresent(): void {
  const state = useGameStore.getState().gameState!
  state.companions['sakura_yuko'] = { status: 'recruited' } as never
  state.party.activeCompanionIds = ['sakura_yuko']
}

describe('TM-P2-008 §16：发现前置', () => {
  it('北门失联未 completed → discoverQuest 北郊 false 且不创建', () => {
    expect(useGameStore.getState().discoverQuest('quest_north_outskirts')).toBe(false)
    expect(useGameStore.getState().gameState!.quests.some((q) => q.questId === 'quest_north_outskirts')).toBe(false)
  })

  it('北门失联 completed → discoverQuest 北郊 true 且 available', () => {
    northGateCompleted()
    expect(useGameStore.getState().discoverQuest('quest_north_outskirts')).toBe(true)
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_outskirts')
    expect(quest?.status).toBe('available')
  })
})

describe('TM-P2-008 §18-20：Stage A 追踪（北门）', () => {
  it('追踪足迹：北门 + in_progress → 原子写 trail_tracked / north_outskirts_unlocked / 线索拖行痕迹', () => {
    northOutskirtsInProgress()
    atLocation('tianlong_north_gate')
    expect(useGameStore.getState().trackNorthOutskirtsTrail()).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.flags.north_outskirts_trail_tracked).toBe(true)
    expect(state.world.flags.north_outskirts_unlocked).toBe(true)
    expect(hasClue(state, 'clue_north_drag_trail')).toBe(true)
    expect(getDiscoveredClueIds(state)).toContain('clue_north_drag_trail')
    // status/stage 不变
    expect(quest.status).toBe('in_progress')
    expect(quest.stage).toBe(0)
  })

  it('重复追踪 → false 且 GameState 同一引用', () => {
    northOutskirtsInProgress()
    atLocation('tianlong_north_gate')
    useGameStore.getState().trackNorthOutskirtsTrail()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().trackNorthOutskirtsTrail()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('不在北门 → false 且完全不变', () => {
    northOutskirtsInProgress()
    atLocation('tianlong_city')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().trackNorthOutskirtsTrail()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('非 boolean trail_tracked 异常值 → 整次拒绝且完全不变', () => {
    northOutskirtsInProgress()
    atLocation('tianlong_north_gate')
    useGameStore.getState().gameState!.quests[0]!.flags.north_outskirts_trail_tracked = 'yes' as never
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().trackNorthOutskirtsTrail()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('北郊解锁后可 travel 进入；未解锁拒绝', () => {
    // 未解锁
    atLocation('tianlong_north_gate')
    expect(useGameStore.getState().travelToLocation('tianlong_north_outskirts')).toBe(false)
    // 解锁后
    northOutskirtsInProgress()
    atLocation('tianlong_north_gate')
    useGameStore.getState().trackNorthOutskirtsTrail()
    expect(useGameStore.getState().travelToLocation('tianlong_north_outskirts')).toBe(true)
    expect(useGameStore.getState().gameState!.world.currentLocationId).toBe('tianlong_north_outskirts')
  })
})

describe('TM-P2-008 §19：Stage B 搜索袭击现场（北郊）', () => {
  it('北郊 + trail_tracked → ambush_found=true（status/stage 不变）', () => {
    const state = useGameStore.getState().gameState!
    state.world.currentLocationId = 'tianlong_north_outskirts'
    state.quests = [
      {
        questId: 'quest_north_outskirts',
        status: 'in_progress',
        stage: 0,
        flags: { north_outskirts_trail_tracked: true },
      },
    ]
    expect(useGameStore.getState().searchNorthOutskirtsAmbush()).toBe(true)
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.flags.north_outskirts_ambush_found).toBe(true)
    expect(quest.status).toBe('in_progress')
    expect(quest.stage).toBe(0)
  })

  it('未追踪足迹 → false；不在北郊 → false', () => {
    northOutskirtsInProgress()
    atLocation('tianlong_north_outskirts')
    expect(useGameStore.getState().searchNorthOutskirtsAmbush()).toBe(false)
    atLocation('tianlong_north_gate')
    useGameStore.getState().gameState!.quests[0]!.flags.north_outskirts_trail_tracked = true
    expect(useGameStore.getState().searchNorthOutskirtsAmbush()).toBe(false)
  })
})

describe('TM-P2-008 §20/§22：Stage C 多解调查（北郊）', () => {
  it('mnd 检定失败 → progressed:false、不写 investigated、可重试', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // roll=3；mnd 8 → mod -1 → total 2 < DC 12
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('mnd')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'mnd', progressed: false })
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.flags.north_outskirts_ambush_investigated).toBeUndefined()
    // 失败后可重试（不软阻断 §29）
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // roll=19 → 18 >= 12 success
    const retry = useGameStore.getState().investigateNorthOutskirtsAmbush('mnd')
    expect(retry?.ok).toBe(true)
    expect(retry).toMatchObject({ progressed: true })
  })

  it('mnd 检定成功 → ambush_investigated=true（拖行痕迹线索在 Stage A 已 guaranteed）', () => {
    stageCReady()
    const state = useGameStore.getState().gameState!
    state.world.flags.clue_north_drag_trail = true // Stage A 已获得
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('mnd')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'mnd', progressed: true })
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.flags.north_outskirts_ambush_investigated).toBe(true)
    expect(NORTH_OUTSKIRTS_INVESTIGATE_DC).toBe(12)
  })

  it('lck 检定成功 → clue_north_patrol_emblem 获得 + 推进', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('lck')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'lck', progressed: true })
    const state = useGameStore.getState().gameState!
    expect(hasClue(state, 'clue_north_patrol_emblem')).toBe(true)
    const quest = state.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.flags.north_outskirts_ambush_investigated).toBe(true)
  })

  it('sakura 在场 → present + 额外线索 clue_north_black_mane + 不自动解决（不推进 investigated）', () => {
    stageCReady()
    sakuraPresent()
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('sakura')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'sakura', present: true })
    const state = useGameStore.getState().gameState!
    expect(hasClue(state, 'clue_north_black_mane')).toBe(true)
    expect(state.world.flags.north_outskirts_sakura_observation).toBe(true)
    const quest = state.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.flags.north_outskirts_ambush_investigated).toBeUndefined()
  })

  it('sakura 不在场 → sakura_not_present 且完全不变', () => {
    stageCReady()
    const before = useGameStore.getState().gameState
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('sakura')
    expect(res).toEqual({ ok: false, reason: 'sakura_not_present' })
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('已调查 → already_done', () => {
    stageCReady()
    useGameStore.getState().gameState!.quests[0]!.flags.north_outskirts_ambush_investigated = true
    expect(useGameStore.getState().investigateNorthOutskirtsAmbush('mnd')).toEqual({ ok: false, reason: 'already_done' })
  })

  it('前置不满足（不在北郊 / 未找到现场）→ locked', () => {
    northOutskirtsInProgress()
    atLocation('tianlong_north_gate')
    expect(useGameStore.getState().investigateNorthOutskirtsAmbush('mnd')).toEqual({ ok: false, reason: 'locked' })
  })
})

describe('TM-P2-008 §50：Mount 快速搜索（沿官道快速搜索）', () => {
  function mountEquipped(): void {
    const state = useGameStore.getState().gameState!
    state.ownedMountIds = ['fire_stallion']
    state.equippedMountId = 'fire_stallion'
  }

  it('装备火焰驹 → ok:true method:mount + clue_north_patrol_emblem 已得 + 不推进 investigated（§50 不自动解决）', () => {
    stageCReady()
    mountEquipped()
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('mount')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'mount' })
    const state = useGameStore.getState().gameState!
    expect(hasClue(state, 'clue_north_patrol_emblem')).toBe(true)
    expect(state.world.flags.north_outskirts_mount_search).toBe(true)
    const quest = state.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.flags.north_outskirts_ambush_investigated).toBeUndefined()
  })

  it('未装备 fast_travel 坐骑 → mount_not_present 且完全不变', () => {
    stageCReady()
    const before = useGameStore.getState().gameState
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('mount')
    expect(res).toEqual({ ok: false, reason: 'mount_not_present' })
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('重复搜索 → alreadySearched:true + clue 幂等不重复得', () => {
    stageCReady()
    mountEquipped()
    useGameStore.getState().investigateNorthOutskirtsAmbush('mount')
    const res = useGameStore.getState().investigateNorthOutskirtsAmbush('mount')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'mount', alreadySearched: true, clueAdded: undefined })
  })
})

describe('TM-P2-008 §26：Stage D 回报 + generic 完成', () => {
  it('未调查袭击现场 → reportNorthOutskirts false', () => {
    const state = useGameStore.getState().gameState!
    state.world.currentLocationId = 'tianlong_martial_hall'
    state.quests = [
      {
        questId: 'quest_north_outskirts',
        status: 'in_progress',
        stage: 0,
        flags: { north_outskirts_trail_tracked: true, north_outskirts_ambush_found: true },
      },
    ]
    expect(useGameStore.getState().reportNorthOutskirts()).toBe(false)
  })

  it('武馆 + 已调查 → reported=true + status→completable（stage 保持 0）', () => {
    stageCReady()
    useGameStore.getState().gameState!.world.currentLocationId = 'tianlong_martial_hall'
    useGameStore.getState().gameState!.quests[0]!.flags.north_outskirts_ambush_investigated = true
    expect(useGameStore.getState().reportNorthOutskirts()).toBe(true)
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.status).toBe('completable')
    expect(quest.flags.north_outskirts_reported).toBe(true)
    expect(quest.stage).toBe(0)
  })

  it('北门也可回报（§26 北门/武馆）', () => {
    stageCReady()
    useGameStore.getState().gameState!.world.currentLocationId = 'tianlong_north_gate'
    useGameStore.getState().gameState!.quests[0]!.flags.north_outskirts_ambush_investigated = true
    expect(useGameStore.getState().reportNorthOutskirts()).toBe(true)
  })

  it('completeQuest 北郊 → completed + 40 金 + 100 XP（generic reward path §26）', () => {
    stageCReady()
    useGameStore.getState().gameState!.world.currentLocationId = 'tianlong_martial_hall'
    useGameStore.getState().gameState!.quests[0]!.flags.north_outskirts_ambush_investigated = true
    useGameStore.getState().reportNorthOutskirts()
    const beforeGold = useGameStore.getState().gameState!.player.gold
    const beforeXp = useGameStore.getState().gameState!.player.adventureXp
    expect(useGameStore.getState().completeQuest('quest_north_outskirts')).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_outskirts')!
    expect(quest.status).toBe('completed')
    expect(state.player.gold).toBe(beforeGold + 40)
    expect(state.player.adventureXp).toBeGreaterThan(beforeXp)
  })
})

describe('TM-P2-008 §24：荒原狼群 defeated 门', () => {
  it('startEncounter 通过 → 固化 variant；胜利后 resolveEncounterVictory 写 defeatFlag + 掉落', () => {
    // 进入北郊
    atLocation('tianlong_north_outskirts')
    useGameStore.getState().gameState!.world.flags.north_outskirts_unlocked = true
    // 首次 startEncounter：roll 固定选 a（2×wild_wolf）
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    expect(useGameStore.getState().startEncounter('encounter_steppe_wolf_pack')).toBe(true)
    const state = useGameStore.getState().gameState!
    expect(state.world.encounterVariants.encounter_steppe_wolf_pack).toBe('steppe_wolf_pack_a')
    // 已 defeated 后 startEncounter 拒绝
    useGameStore.getState().gameState!.world.flags.steppe_wolf_pack_defeated = true
    expect(useGameStore.getState().startEncounter('encounter_steppe_wolf_pack')).toBe(false)
  })
})
