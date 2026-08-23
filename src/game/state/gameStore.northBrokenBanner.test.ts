import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../state/gameStore'
import { createInitialGameState } from '../content/initial'
import { getDiscoveredClueIds, hasClue } from '../rules/clue'
import {
  WAYSTATION_BARRIER_DC,
  NORTH_SURVIVOR_RESCUED_EVENT_ID,
  KNIGHT_TRIAL_INVITED_EVENT_ID,
} from '../state/gameStore'
import { getEnemy, getEncounter } from '../content'
import { checkEncounter, resolveEncounterVariant, singleEnemyIdOf } from '../rules/encounter'
import { resolveEscape } from '../rules/escape'
import { getEnemyFirstKillXp } from '../rules/combatXp'

/**
 * TM-P2-009 §9-19：北线剧情《断旗余声》全流程 store 单测。
 * 覆盖：Q1-Q24 剧情（发现前置 / Stage A-F 推进 / 多解解屏障 / 搜救 / 回报 / 完成特判）、
 * C1-C12 combat/escape（驿站狼群注册 / 位置门 / defeated 门 / variant 固化 / 胜利 / 逃跑不保留）。
 * 安全约束：Save 保持 V6（SV 系列在 storage.test.ts）；Sakura 只补线索不推进；坐骑不进战斗。
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

/** 《断旗余声》任务 in_progress（可带阶段 flag） */
function northBrokenBannerInProgress(flags: Record<string, boolean | number | string> = {}): void {
  useGameStore.getState().gameState!.quests = [
    { questId: 'quest_north_broken_banner', status: 'in_progress', stage: 0, flags },
  ]
}

/** 北郊追踪 completed（断旗余声发现前置） */
function northOutskirtsCompleted(): void {
  useGameStore.getState().gameState!.quests = [
    { questId: 'quest_north_outskirts', status: 'completed', stage: 0, flags: {} },
  ]
}

/** 推进到 Stage C 就绪态（已简报 + 已搜索 + 在旧驿站） */
function stageCReady(): void {
  const state = useGameStore.getState().gameState!
  state.world.currentLocationId = 'tianlong_north_abandoned_waystation'
  state.quests = [
    {
      questId: 'quest_north_broken_banner',
      status: 'in_progress',
      stage: 0,
      flags: { north_broken_banner_make_briefed: true, north_waystation_searched: true },
    },
  ]
}

/** Sakura 在场（recruited + active） */
function sakuraPresent(): void {
  const state = useGameStore.getState().gameState!
  state.companions['sakura_yuko'] = { status: 'recruited' } as never
  state.party.activeCompanionIds = ['sakura_yuko']
}

/** 装备火焰驹（fast_travel） */
function mountEquipped(): void {
  const state = useGameStore.getState().gameState!
  state.ownedMountIds = ['fire_stallion']
  state.equippedMountId = 'fire_stallion'
}

const WAYSTATION_ID = 'tianlong_north_abandoned_waystation'

// ---------------------------------------------------------------------------
// Q1-Q4：发现前置（§9 窄前置，非通用 engine）
// ---------------------------------------------------------------------------
describe('TM-P2-009 Q1-4：发现前置', () => {
  it('Q1: 北郊追踪未 completed → discoverQuest 断旗余声 false 且不创建', () => {
    expect(useGameStore.getState().discoverQuest('quest_north_broken_banner')).toBe(false)
    expect(useGameStore.getState().gameState!.quests.some((q) => q.questId === 'quest_north_broken_banner')).toBe(false)
  })

  it('Q2: 北郊追踪 completed → discoverQuest 断旗余声 true 且 available', () => {
    northOutskirtsCompleted()
    expect(useGameStore.getState().discoverQuest('quest_north_broken_banner')).toBe(true)
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_broken_banner')
    expect(quest?.status).toBe('available')
    expect(quest?.stage).toBe(0)
  })

  it('Q3: 接受任务 → in_progress（stage 保持 0）', () => {
    northOutskirtsCompleted()
    useGameStore.getState().discoverQuest('quest_north_broken_banner')
    expect(useGameStore.getState().acceptQuest('quest_north_broken_banner')).toBe(true)
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.status).toBe('in_progress')
    expect(quest.stage).toBe(0)
  })

  it('Q4: 已 available 重复 discover 幂等拒绝（不覆盖 available）', () => {
    northOutskirtsCompleted()
    useGameStore.getState().discoverQuest('quest_north_broken_banner')
    expect(useGameStore.getState().discoverQuest('quest_north_broken_banner')).toBe(false)
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.status).toBe('available')
  })
})

// ---------------------------------------------------------------------------
// Q5-Q7：Stage A 马科简报（武馆；§11）
// ---------------------------------------------------------------------------
describe('TM-P2-009 Q5-7：Stage A 马科简报（武馆）', () => {
  it('Q5: 武馆 + in_progress → 原子写 make_briefed + north_waystation_unlocked（解锁旧驿站）', () => {
    northBrokenBannerInProgress()
    atLocation('tianlong_martial_hall')
    expect(useGameStore.getState().startNorthBrokenBanner()).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_broken_banner_make_briefed).toBe(true)
    expect(state.world.flags.north_waystation_unlocked).toBe(true)
    expect(quest.status).toBe('in_progress')
    expect(quest.stage).toBe(0)
  })

  it('Q6: 不在武馆 → false 且完全不变', () => {
    northBrokenBannerInProgress()
    atLocation('tianlong_city')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().startNorthBrokenBanner()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('Q7: 重复简报 → false 且 GameState 同一引用', () => {
    northBrokenBannerInProgress()
    atLocation('tianlong_martial_hall')
    useGameStore.getState().startNorthBrokenBanner()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().startNorthBrokenBanner()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// Q8-Q10：Stage B 搜索旧驿站（§12）
// ---------------------------------------------------------------------------
describe('TM-P2-009 Q8-10：Stage B 搜索旧驿站', () => {
  it('Q8: 旧驿站 + 已简报 → 写 searched + 线索「断裂队旗」（guaranteed）', () => {
    northBrokenBannerInProgress({ north_broken_banner_make_briefed: true })
    atLocation(WAYSTATION_ID)
    expect(useGameStore.getState().searchNorthAbandonedWaystation()).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_searched).toBe(true)
    expect(hasClue(state, 'clue_north_broken_banner')).toBe(true)
    expect(getDiscoveredClueIds(state)).toContain('clue_north_broken_banner')
    expect(quest.status).toBe('in_progress')
    expect(quest.stage).toBe(0)
  })

  it('Q9: 未简报就在旧驿站 → false（顺序强制）', () => {
    northBrokenBannerInProgress()
    atLocation(WAYSTATION_ID)
    expect(useGameStore.getState().searchNorthAbandonedWaystation()).toBe(false)
  })

  it('Q10: 重复搜索 → false 且线索不重复', () => {
    northBrokenBannerInProgress({ north_broken_banner_make_briefed: true })
    atLocation(WAYSTATION_ID)
    useGameStore.getState().searchNorthAbandonedWaystation()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().searchNorthAbandonedWaystation()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })
})

// ---------------------------------------------------------------------------
// Q11-Q17：Stage C 多解解屏障（§13）
// ---------------------------------------------------------------------------
describe('TM-P2-009 Q11-17：Stage C 多解解屏障', () => {
  it('Q11: combat 但狼群未击退 → ok:false reason:wolves_not_neutralized', () => {
    stageCReady()
    const res = useGameStore.getState().resolveWaystationBarrier('combat')
    expect(res).toEqual({ ok: false, reason: 'wolves_not_neutralized' })
  })

  it('Q12: combat 已击退（waystation_wolf_pack_neutralized）→ barrier_resolved + 线索「魔化诱饵」', () => {
    stageCReady()
    useGameStore.getState().gameState!.world.flags.waystation_wolf_pack_neutralized = true
    const res = useGameStore.getState().resolveWaystationBarrier('combat')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'combat', clueAdded: 'clue_north_alchemical_bait' })
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_barrier_resolved).toBe(true)
    expect(hasClue(state, 'clue_north_alchemical_bait')).toBe(true)
  })

  it('Q13: mnd 检定成功 → barrier_resolved + neutralized + 线索「魔化诱饵」', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.9) // roll=19 → mnd 8 → mod -1 → 18 >= DC 12
    const res = useGameStore.getState().resolveWaystationBarrier('mnd')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'mnd', progressed: true })
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_barrier_resolved).toBe(true)
    expect(state.world.flags.waystation_wolf_pack_neutralized).toBe(true)
    expect(hasClue(state, 'clue_north_alchemical_bait')).toBe(true)
    expect(WAYSTATION_BARRIER_DC).toBe(12)
  })

  it('Q14: mnd 检定失败 → 不推进 + progressed:false + 可重试', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.1) // roll=3 → 2 < DC 12
    const res = useGameStore.getState().resolveWaystationBarrier('mnd')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'mnd', progressed: false })
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_barrier_resolved).toBeUndefined()
    // 失败后可重试（不软阻断 §13）
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const retry = useGameStore.getState().resolveWaystationBarrier('mnd')
    expect(retry?.ok).toBe(true)
    expect(retry).toMatchObject({ progressed: true })
  })

  it('Q15: lck 检定成功 → barrier_resolved + neutralized + 线索「黑篷车辙」', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const res = useGameStore.getState().resolveWaystationBarrier('lck')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'lck', progressed: true })
    const state = useGameStore.getState().gameState!
    expect(hasClue(state, 'clue_north_black_wagon_tracks')).toBe(true)
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_barrier_resolved).toBe(true)
    expect(state.world.flags.waystation_wolf_pack_neutralized).toBe(true)
  })

  it('Q16: sakura 在场 → 找到安全路线 + barrier_resolved + neutralized + 线索「魔化诱饵」', () => {
    stageCReady()
    sakuraPresent()
    const res = useGameStore.getState().resolveWaystationBarrier('sakura')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'sakura', present: true, progressed: true })
    const state = useGameStore.getState().gameState!
    expect(hasClue(state, 'clue_north_alchemical_bait')).toBe(true)
    expect(state.world.flags.waystation_sakura_observation).toBe(true)
    expect(state.world.flags.waystation_wolf_pack_neutralized).toBe(true)
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_barrier_resolved).toBe(true)
  })

  it('Q17: mount 装备 → 骑马引开 + barrier_resolved + neutralized + 线索「黑篷车辙」+ 一次性', () => {
    stageCReady()
    mountEquipped()
    const res = useGameStore.getState().resolveWaystationBarrier('mount')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'mount', clueAdded: 'clue_north_black_wagon_tracks', progressed: true })
    const state = useGameStore.getState().gameState!
    expect(hasClue(state, 'clue_north_black_wagon_tracks')).toBe(true)
    expect(state.world.flags.waystation_mount_search).toBe(true)
    expect(state.world.flags.waystation_wolf_pack_neutralized).toBe(true)
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_barrier_resolved).toBe(true)
    // 已解决后再次触发 → already_done（屏障已解，不重复触发）
    const again = useGameStore.getState().resolveWaystationBarrier('mount')
    expect(again).toEqual({ ok: false, reason: 'already_done' })
  })
})

// ---------------------------------------------------------------------------
// A5-A8：非战斗路线不授予击杀语义（TM-P2-009-R1 §2.1）
// ---------------------------------------------------------------------------
describe('TM-P2-009-R1 A5-8：非战斗路线不冒充击杀', () => {
  it('A5/A6: MND 成功不授予 enemy XP/Loot（player 状态与背包不变）', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const before = JSON.stringify(useGameStore.getState().gameState!.player)
    const beforeInventory = JSON.stringify(useGameStore.getState().gameState!.inventory)
    useGameStore.getState().resolveWaystationBarrier('mnd')
    const state = useGameStore.getState().gameState!
    expect(JSON.stringify(state.player)).toBe(before)
    expect(JSON.stringify(state.inventory)).toBe(beforeInventory)
  })

  it('A7: 非战斗路线不消耗 wild_wolf first-kill（getEnemyFirstKillXp 仍 15）', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    useGameStore.getState().resolveWaystationBarrier('lck')
    const state = useGameStore.getState().gameState!
    expect(state.world.flags.waystation_wolf_pack_neutralized).toBe(true)
    expect(state.world.flags.waystation_wolf_pack_combat).toBeUndefined()
    expect(getEnemyFirstKillXp(state, 'wild_wolf')).toBe(15)
  })

  it('A8: 非战斗路线解决后驿站狼群遭遇消失（checkEncounter already_defeated）', () => {
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    useGameStore.getState().resolveWaystationBarrier('mnd')
    const state = useGameStore.getState().gameState!
    const r = checkEncounter(state, 'encounter_waystation_wolf_pack')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('already_defeated')
  })
})

// ---------------------------------------------------------------------------
// Q18-Q20：Stage D 搜救沈拓（§14）
// ---------------------------------------------------------------------------
describe('TM-P2-009 Q18-20：Stage D 搜救幸存者', () => {
  it('Q18: 已解屏障 → rescued + 事件 north_survivor_rescued + 线索「黑篷车辙」', () => {
    northBrokenBannerInProgress({
      north_broken_banner_make_briefed: true,
      north_waystation_searched: true,
      north_waystation_barrier_resolved: true,
    })
    atLocation(WAYSTATION_ID)
    expect(useGameStore.getState().rescueWaystationSurvivor()).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_survivor_rescued).toBe(true)
    expect(state.world.completedEvents).toContain(NORTH_SURVIVOR_RESCUED_EVENT_ID)
    expect(hasClue(state, 'clue_north_black_wagon_tracks')).toBe(true)
    expect(quest.status).toBe('in_progress')
    expect(quest.stage).toBe(0)
  })

  it('Q19: 未解屏障 → false（顺序强制）', () => {
    northBrokenBannerInProgress({ north_broken_banner_make_briefed: true, north_waystation_searched: true })
    atLocation(WAYSTATION_ID)
    expect(useGameStore.getState().rescueWaystationSurvivor()).toBe(false)
  })

  it('Q20: 重复搜救 → false 且事件不重复', () => {
    northBrokenBannerInProgress({
      north_broken_banner_make_briefed: true,
      north_waystation_searched: true,
      north_waystation_barrier_resolved: true,
    })
    atLocation(WAYSTATION_ID)
    useGameStore.getState().rescueWaystationSurvivor()
    const events = useGameStore.getState().gameState!.world.completedEvents.filter(
      (e) => e === NORTH_SURVIVOR_RESCUED_EVENT_ID,
    )
    expect(events).toHaveLength(1)
    expect(useGameStore.getState().rescueWaystationSurvivor()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q21-Q22：Stage E 问沈拓（§15）
// ---------------------------------------------------------------------------
describe('TM-P2-009 Q21-22：Stage E 问沈拓详情', () => {
  it('Q21: 已救出 → debriefed + 线索「魔化诱饵」', () => {
    northBrokenBannerInProgress({
      north_broken_banner_make_briefed: true,
      north_waystation_searched: true,
      north_waystation_barrier_resolved: true,
      north_waystation_survivor_rescued: true,
    })
    atLocation(WAYSTATION_ID)
    expect(useGameStore.getState().debriefWaystationSurvivor()).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_survivor_debriefed).toBe(true)
    expect(hasClue(state, 'clue_north_alchemical_bait')).toBe(true)
  })

  it('Q22: 未救出 → false（顺序强制）', () => {
    northBrokenBannerInProgress({ north_broken_banner_make_briefed: true, north_waystation_searched: true })
    atLocation(WAYSTATION_ID)
    expect(useGameStore.getState().debriefWaystationSurvivor()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q23-Q24：Stage F 回报马科 + 完成特判（§16-17）
// ---------------------------------------------------------------------------
describe('TM-P2-009 Q23-24：Stage F 回报与完成', () => {
  it('Q23: 已问沈拓 + 武馆 → reported + status→completable + 当场骑士试炼邀请（TM-P2-009-R1 §2.3）', () => {
    northBrokenBannerInProgress({
      north_broken_banner_make_briefed: true,
      north_waystation_searched: true,
      north_waystation_barrier_resolved: true,
      north_waystation_survivor_rescued: true,
      north_waystation_survivor_debriefed: true,
    })
    atLocation('tianlong_martial_hall')
    expect(useGameStore.getState().reportNorthBrokenBanner()).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.status).toBe('completable')
    expect(quest.flags.north_broken_banner_reported).toBe(true)
    expect(quest.stage).toBe(0)
    // 向马科汇报当场出现骑士试炼邀请（世界 flag + 活动事件；正式骑士试炼本体不实现）
    expect(state.world.flags.knight_trial_invited).toBe(true)
    expect(state.world.completedEvents).toContain(KNIGHT_TRIAL_INVITED_EVENT_ID)
  })

  it('Q24: completeQuest → completed + 50 金 + 120 XP（邀请已在回报时写，正式提交不重复追加）', () => {
    northBrokenBannerInProgress({
      north_broken_banner_make_briefed: true,
      north_waystation_searched: true,
      north_waystation_barrier_resolved: true,
      north_waystation_survivor_rescued: true,
      north_waystation_survivor_debriefed: true,
    })
    atLocation('tianlong_martial_hall')
    useGameStore.getState().reportNorthBrokenBanner()
    const beforeGold = useGameStore.getState().gameState!.player.gold
    const beforeXp = useGameStore.getState().gameState!.player.adventureXp
    expect(useGameStore.getState().completeQuest('quest_north_broken_banner')).toBe(true)
    const state = useGameStore.getState().gameState!
    const quest = state.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.status).toBe('completed')
    expect(state.player.gold).toBe(beforeGold + 50)
    expect(state.player.adventureXp).toBe(beforeXp + 120)
    // 邀请已在 reportNorthBrokenBanner 写入；completeQuest 只负责 50 金/120 XP/completed，不重复追加 invitation event
    expect(state.world.flags.knight_trial_invited).toBe(true)
    expect(state.world.completedEvents.filter((e) => e === KNIGHT_TRIAL_INVITED_EVENT_ID)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// C1-C12：combat/escape 驿站狼群（§13 战斗解）
// ---------------------------------------------------------------------------
describe('TM-P2-009 C1-12：驿站狼群 combat/escape', () => {
  it('C1: 注册有效——单一 weighted variant、成员 2×wild_wolf+1×corrupted_wolf、canEscape', () => {
    const def = getEncounter('encounter_waystation_wolf_pack')
    expect(def).toBeDefined()
    expect(def!.locationId).toBe(WAYSTATION_ID)
    expect(def!.fixedMembers).toBeUndefined()
    expect(def!.variants).toHaveLength(1)
    const v = def!.variants![0]!
    expect(v.id).toBe('waystation_wolf_pack_fixed')
    expect(v.members).toEqual([
      { enemyId: 'wild_wolf', count: 2 },
      { enemyId: 'corrupted_wolf', count: 1 },
    ])
    expect(def!.canEscape).toBe(true)
    expect(def!.encounterDefeatFlag).toBe('waystation_wolf_pack_neutralized')
  })

  it('C2: 固定阵容 ≤3 敌（无 6 人队/动态缩放），成员全部已注册', () => {
    const def = getEncounter('encounter_waystation_wolf_pack')!
    const v = def.variants![0]!
    const total = v.members.reduce((sum, m) => sum + m.count, 0)
    expect(total).toBe(3)
    expect(total).toBeLessThanOrEqual(3)
    expect(getEnemy('wild_wolf')).toBeDefined()
    expect(getEnemy('corrupted_wolf')).toBeDefined()
  })

  it('C3: singleEnemyIdOf undefined（多敌遭遇，非单敌）', () => {
    expect(singleEnemyIdOf(getEncounter('encounter_waystation_wolf_pack')!)).toBeUndefined()
  })

  it('C4: checkEncounter 位置守卫——在旧驿站 allowed；不在（北郊）拒绝', () => {
    const fresh = { ...createInitialGameState(), world: { ...createInitialGameState().world, currentLocationId: WAYSTATION_ID } }
    expect(checkEncounter(fresh, 'encounter_waystation_wolf_pack').allowed).toBe(true)
    const wrong = { ...createInitialGameState(), world: { ...createInitialGameState().world, currentLocationId: 'tianlong_north_outskirts' } }
    const r = checkEncounter(wrong, 'encounter_waystation_wolf_pack')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('enemy_not_in_location')
  })

  it('C5: defeated 门——world.flags 已 neutralized 拒绝（already_defeated）', () => {
    const state = { ...createInitialGameState(), world: { ...createInitialGameState().world, currentLocationId: WAYSTATION_ID, flags: { waystation_wolf_pack_neutralized: true } } }
    const r = checkEncounter(state, 'encounter_waystation_wolf_pack')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('already_defeated')
  })

  it('C6: 非 boolean 异常值 → invalid_story_state', () => {
    const state = { ...createInitialGameState(), world: { ...createInitialGameState().world, currentLocationId: WAYSTATION_ID, flags: { waystation_wolf_pack_neutralized: 'yes' } } }
    const r = checkEncounter(state, 'encounter_waystation_wolf_pack')
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_story_state')
  })

  it('C7: resolveEncounterVariant 单一档恒返回 waystation_wolf_pack_fixed（无随机档）', () => {
    const def = getEncounter('encounter_waystation_wolf_pack')!
    expect(resolveEncounterVariant(def, () => 0)).toBe('waystation_wolf_pack_fixed')
    expect(resolveEncounterVariant(def, () => 0.999)).toBe('waystation_wolf_pack_fixed')
  })

  it('C8: startEncounter 通过 → 固化 variant（首次 roll 后写死不 reroll）', () => {
    atLocation(WAYSTATION_ID)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    expect(useGameStore.getState().startEncounter('encounter_waystation_wolf_pack')).toBe(true)
    const state = useGameStore.getState().gameState!
    expect(state.world.encounterVariants.encounter_waystation_wolf_pack).toBe('waystation_wolf_pack_fixed')
  })

  it('C9: resolveEncounterVictory → 写 waystation_wolf_pack_neutralized + combat 标记 + XP（首次击杀 3×15）+ 掉落聚合', () => {
    atLocation(WAYSTATION_ID)
    // 3 只狼均走首次击杀 XP：wild_wolf（2 只，各 15）+ corrupted_wolf（1 只，需《草原狼影》进行中）
    useGameStore.getState().gameState!.quests = [
      { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} },
    ]
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    useGameStore.getState().startEncounter('encounter_waystation_wolf_pack')
    const beforeXp = useGameStore.getState().gameState!.player.adventureXp
    const summary = useGameStore.getState().resolveEncounterVictory('encounter_waystation_wolf_pack')
    expect(summary).not.toBeNull()
    const state = useGameStore.getState().gameState!
    expect(state.world.flags.waystation_wolf_pack_neutralized).toBe(true)
    // TM-P2-009-R1 §2.1：战斗击败额外写 combat 标记（供 wild_wolf first-kill 判定；非战斗绕开不写）
    expect(state.world.flags.waystation_wolf_pack_combat).toBe(true)
    expect(state.player.adventureXp).toBeGreaterThanOrEqual(beforeXp + 45)
  })

  it('C10: 胜利后 resolveWaystationBarrier(combat) 通过（战斗↔剧情联动）', () => {
    atLocation(WAYSTATION_ID)
    stageCReady()
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    useGameStore.getState().startEncounter('encounter_waystation_wolf_pack')
    useGameStore.getState().resolveEncounterVictory('encounter_waystation_wolf_pack')
    const res = useGameStore.getState().resolveWaystationBarrier('combat')
    expect(res?.ok).toBe(true)
    expect(res).toMatchObject({ method: 'combat' })
    const quest = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_north_broken_banner')!
    expect(quest.flags.north_waystation_barrier_resolved).toBe(true)
  })

  it('C11: 逃跑成功不保留进度——neutralized 仍 undefined、combat 解仍拒绝', () => {
    atLocation(WAYSTATION_ID)
    stageCReady()
    const state = useGameStore.getState().gameState!
    // 构造逃跑可成功的队伍敏捷（(16+20)/3 = 12 >= 狼 agi 12）
    state.player.attributes.agi = 16
    // 狼群最高敏捷 12（wild_wolf / corrupted_wolf 均为 12）
    const escape = resolveEscape(16, 12, 20)
    expect(escape.success).toBe(true)
    // 逃跑是纯 UI 结果，不写任何 store 标记
    expect(state.world.flags.waystation_wolf_pack_neutralized).toBeUndefined()
    const res = useGameStore.getState().resolveWaystationBarrier('combat')
    expect(res).toEqual({ ok: false, reason: 'wolves_not_neutralized' })
  })

  it('C12: 已 defeated 后无法再战（startEncounter false）；战斗解一次后狼群从「附近威胁」消失', () => {
    atLocation(WAYSTATION_ID)
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
    useGameStore.getState().startEncounter('encounter_waystation_wolf_pack')
    useGameStore.getState().resolveEncounterVictory('encounter_waystation_wolf_pack')
    expect(useGameStore.getState().startEncounter('encounter_waystation_wolf_pack')).toBe(false)
    const after = { ...useGameStore.getState().gameState! }
    expect(checkEncounter(after, 'encounter_waystation_wolf_pack').allowed).toBe(false)
  })
})
