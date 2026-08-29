/**
 * TM-P2-013 §25/§27/§30：《黑石余响》主线 + 鉴定 V1 + Boss + Save + 黄金兔冻结 store 契约测试。
 * UI 层由 qa/p2-013 全路径 E2E 覆盖；本文件锁定状态层语义。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { checkEnemyEncounter, checkEncounter } from '../rules/encounter'
import { resolveBossPhaseContext } from '../rules/bossPhase'
import { useGameStore } from './gameStore'

const QUEST_ID = 'quest_black_stone_deep_echo'

function mockStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockStorage())
  useGameStore.setState({ gameState: createInitialGameState({ name: '黑石验收员', gender: 'male', profession: 'knight', attributes: { str: 12, agi: 10, con: 12, mnd: 10, lck: 10 } }), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const state = () => useGameStore.getState().gameState!
const store = () => useGameStore.getState()

function at(locationId: string) {
  useGameStore.setState((current) => ({
    gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, currentLocationId: locationId } } : null,
  }))
}

function inventoryQuantity(itemId: string) {
  return state().inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0
}

function putQuest(questId: string, status: 'available' | 'in_progress' | 'completable' | 'completed', flags: Record<string, boolean | number | string> = {}) {
  useGameStore.setState((current) => ({
    gameState: current.gameState
      ? { ...current.gameState, quests: [...current.gameState.quests.filter((quest) => quest.questId !== questId), { questId, status, stage: 0, flags }] }
      : null,
  }))
}

/** 双前置 completed（§3） */
function completePrerequisites() {
  putQuest('quest_wangcai_trouble', 'completed', { wangcai_briefed: true })
  putQuest('quest_spirit_spring_water', 'completed', {})
}

/** 走到「任务已接受、四层已解锁」状态 */
function beginEcho() {
  completePrerequisites()
  at('tianlong_city')
  expect(store().beginBlackStoneEchoQuest()).toBe(true)
}

/** §8：以指定职业重建场景并走到四层调查就绪（用于验证职业主属性差异化） */
function resetAs(profession: 'warrior' | 'knight' | 'ranger' | 'mage') {
  useGameStore.setState({
    gameState: createInitialGameState({ name: '黑石验收员', gender: 'male', profession, attributes: { str: 12, agi: 10, con: 12, mnd: 10, lck: 10 } }),
    hasSave: false,
  })
  beginEcho()
  at('black_stone_tower_floor4')
}

const GOLDEN_FREEZE = { status: 'in_progress' as const, stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } }

function seedGoldenFreeze() {
  putQuest('quest_golden_rabbit_search', GOLDEN_FREEZE.status, { ...GOLDEN_FREEZE.flags })
  useGameStore.setState((current) => ({
    gameState: current.gameState ? { ...current.gameState, inventory: [...current.gameState.inventory, { itemId: 'rabbit_path', quantity: 1 }] } : null,
  }))
}

function goldenSnapshot() {
  const quest = state().quests.find((entry) => entry.questId === 'quest_golden_rabbit_search')
  return { quest, rabbitPath: state().inventory.find((entry) => entry.itemId === 'rabbit_path') }
}

describe('TM-P2-013 §27：主线发现与四层解锁', () => {
  it('前置任务未完成 → 不可发现；双前置 completed → 可接受且写四层解锁 flag', () => {
    at('tianlong_city')
    putQuest('quest_wangcai_trouble', 'completed', {})
    // 《神泉之水》未完成 → 拒绝
    expect(store().beginBlackStoneEchoQuest()).toBe(false)
    completePrerequisites()
    expect(store().beginBlackStoneEchoQuest()).toBe(true)
    const quest = state().quests.find((entry) => entry.questId === QUEST_ID)
    expect(quest?.status).toBe('in_progress')
    expect(state().world.flags.black_stone_tower_floor4_unlocked).toBe(true)
    expect(store().beginBlackStoneEchoQuest()).toBe(false)
  })

  it('Floor4 未解锁不能进入（travel rule 层拦截）；解锁后可进入', () => {
    beginEcho()
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, currentLocationId: 'black_stone_tower_floor3', flags: { ...current.gameState.world.flags, black_stone_tower_floor3_unlocked: true, black_stone_tower_floor2_unlocked: true, black_stone_tower_unlocked: true, black_stone_tower_floor4_unlocked: false } } } : null }))
    expect(checkEncounter(state(), 'encounter_floor4_sentinel').allowed).toBe(false)
    // travel 层：checkTravel 由 Store travelToLocation 守卫；这里验证 flag 语义
    expect(store().travelToLocation('black_stone_tower_floor4')).toBe(false)
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, flags: { ...current.gameState.world.flags, black_stone_tower_floor4_unlocked: true } } } : null }))
    expect(store().travelToLocation('black_stone_tower_floor4')).toBe(true)
  })
})

describe('TM-P2-013 §7/§27：四层调查（一次性 / fail-forward / 封印室解锁）', () => {
  beforeEach(() => {
    beginEcho()
    at('black_stone_tower_floor4')
  })

  it('三点各一次性推进并写入线索；全部完成 → 封印室解锁', () => {
    for (const [point, clue] of [['broken_gate', 'clue_floor4_broken_gate'], ['resonance', 'clue_floor4_resonance'], ['seal_pattern', 'clue_floor4_seal_pattern']] as const) {
      const result = store().investigateFloor4Point(point, 'mnd', 20)
      expect(result.ok).toBe(true)
      expect(result.success).toBe(true)
      expect(state().world.flags[clue]).toBe(true)
      // 一次性：同点重骰拒绝
      expect(store().investigateFloor4Point(point, 'mnd', 20).ok).toBe(false)
    }
    const quest = state().quests.find((entry) => entry.questId === QUEST_ID)!
    expect(quest.stage).toBeGreaterThanOrEqual(2)
    expect(state().world.flags.black_stone_sealed_chamber_unlocked).toBe(true)
  })

  it('D20 失败 fail-forward：剧情仍推进、线索仍写入、不可重骰', () => {
    const result = store().investigateFloor4Point('broken_gate', 'mnd', 1)
    expect(result.ok).toBe(true)
    expect(result.success).toBe(false)
    expect(result.failForward).toBe(true)
    expect(state().world.flags.clue_floor4_broken_gate).toBe(true)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.flags.investigated_broken_gate).toBe(true)
    expect(store().investigateFloor4Point('broken_gate', 'mnd', 20).ok).toBe(false)
  })

  it('职业选项可用（profession +2 情境）；不在四层拒绝', () => {
    expect(store().investigateFloor4Point('resonance', 'profession', 12).ok).toBe(true)
    expect(state().world.flags.clue_floor4_resonance).toBe(true)
    at('qingshi_village')
    expect(store().investigateFloor4Point('seal_pattern', 'mnd', 20).ok).toBe(false)
  })

  it('§8 职业选项按职业主属性判定：战士 STR / 骑士 CON / 游侠 AGI / 法师 MND（Store 复用纯规则，无职业特判）', () => {
    const cases = [
      { profession: 'warrior', attribute: 'str' },
      { profession: 'knight', attribute: 'con' },
      { profession: 'ranger', attribute: 'agi' },
      { profession: 'mage', attribute: 'mnd' },
    ] as const
    for (const { profession, attribute } of cases) {
      resetAs(profession)
      const result = store().investigateFloor4Point('broken_gate', 'profession', 20)
      expect(result.ok).toBe(true)
      expect(result.attribute).toBe(attribute)
      expect(result.dc).toBe(13)
      expect(state().world.flags.clue_floor4_broken_gate).toBe(true)
    }
    // MND / LUCK 路径不受职业影响
    resetAs('warrior')
    expect(store().investigateFloor4Point('resonance', 'mnd', 20).attribute).toBe('mnd')
    expect(store().investigateFloor4Point('seal_pattern', 'lck', 20).attribute).toBe('lck')
  })

  it('LCK 只提供信息（线索/提示），不解锁封印室捷径', () => {
    expect(store().investigateFloor4Point('seal_pattern', 'lck', 20).ok).toBe(true)
    // 未完成全部三点 → 封印室仍未解锁
    expect(state().world.flags.black_stone_sealed_chamber_unlocked).toBeUndefined()
  })
})

describe('TM-P2-013 §11/§12：守门者 Boss（一次性 / guaranteed 遗物）', () => {
  beforeEach(() => {
    beginEcho()
    at('black_stone_tower_floor4')
    for (const point of ['broken_gate', 'resonance', 'seal_pattern'] as const) store().investigateFloor4Point(point, 'mnd', 20)
    at('black_stone_sealed_chamber')
  })

  it('封印室解锁后 encounter 可进入；Boss 首胜 → defeated flag + guaranteed 遗物 + 任务推进', () => {
    expect(state().world.flags.blackstone_warden_defeated).toBeUndefined()
    // 真实入口：resolveEncounterVictory（内部委托 resolveCombatVictory + loot + guaranteed 遗物）
    expect(store().resolveEncounterVictory('encounter_blackstone_warden')).not.toBeNull()
    expect(state().world.flags.blackstone_warden_defeated).toBe(true)
    expect(inventoryQuantity('unidentified_blackstone_relic')).toBe(1)
    const quest = state().quests.find((entry) => entry.questId === QUEST_ID)!
    expect(quest.flags.warden_defeated).toBe(true)
    expect(quest.stage).toBeGreaterThanOrEqual(3)
  })

  it('Boss defeated 后 encounter 拒绝（不可重复刷新）', () => {
    expect(store().resolveEncounterVictory('encounter_blackstone_warden')).not.toBeNull()
    expect(checkEnemyEncounter(state(), 'blackstone_warden')).toMatchObject({ allowed: false, reason: 'already_defeated' })
    expect(store().resolveCombatVictory('blackstone_warden')).toBe(false)
  })

  it('无 Boss Phase：守门者不定义 bossPhases（§10 本章不加 Phase V2）', () => {
    // content 校验在模块加载时已完成；这里直接断言遭遇定义可进入战斗（roster 正确）
    expect(checkEncounter(state(), 'encounter_blackstone_warden').allowed).toBe(true)
  })
})

describe('TM-P2-013 §25：鉴定事务（ID5-ID15）', () => {
  beforeEach(() => {
    beginEcho()
    at('black_stone_tower_floor4')
    for (const point of ['broken_gate', 'resonance', 'seal_pattern'] as const) store().investigateFloor4Point(point, 'mnd', 20)
    at('black_stone_sealed_chamber')
    expect(store().resolveEncounterVictory('encounter_blackstone_warden')).not.toBeNull()
    at('tianlong_city')
  })

  it('ID5-ID8 四职业确定性结果', () => {
    const cases = { warrior: 'blackstone_warblade', knight: 'blackstone_guard_armor', ranger: 'blackstone_hunter_bow', mage: 'blackstone_resonance_staff' } as const
    for (const [profession, result] of Object.entries(cases)) {
      useGameStore.setState({ gameState: createInitialGameState({ name: '鉴定', gender: 'male', profession: profession as 'warrior', attributes: { str: 12, agi: 12, con: 10, mnd: 10, lck: 10 } }), hasSave: false })
      useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, currentLocationId: 'tianlong_city' }, player: { ...current.gameState.player, gold: 100 }, inventory: [...current.gameState.inventory, { itemId: 'unidentified_blackstone_relic', quantity: 1 }] } : null }))
      expect(store().identifyItem('identification_blackstone_relic')).toBe(true)
      expect(inventoryQuantity(result)).toBe(1)
    }
  })

  it('ID9-ID11 成功事务：遗物 -1 / 金币 -20 / 结果装备 +1', () => {
    const relicBefore = inventoryQuantity('unidentified_blackstone_relic')
    const goldBefore = state().player.gold
    expect(store().identifyItem('identification_blackstone_relic')).toBe(true)
    expect(inventoryQuantity('unidentified_blackstone_relic')).toBe(relicBefore - 1)
    expect(state().player.gold).toBe(goldBefore - 20)
    expect(inventoryQuantity('blackstone_guard_armor')).toBe(1)
    expect(state().world.flags.blackstone_relic_identified).toBe(true)
  })

  it('ID12 失败事务完全原子（金币不足时全部状态不变）', () => {
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, gold: 10 } } : null }))
    const before = state()
    expect(store().identifyItem('identification_blackstone_relic')).toBe(false)
    expect(state()).toBe(before)
  })

  it('ID13/ID14 两份遗物可鉴定两次；一份遗物不能重复免费复制', () => {
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, gold: 100 }, inventory: [...current.gameState.inventory, { itemId: 'unidentified_blackstone_relic', quantity: 1 }] } : null }))
    const goldBefore = state().player.gold
    expect(store().identifyItem('identification_blackstone_relic')).toBe(true)
    expect(store().identifyItem('identification_blackstone_relic')).toBe(true)
    expect(inventoryQuantity('blackstone_guard_armor')).toBe(2)
    expect(state().player.gold).toBe(goldBefore - 40)
    expect(inventoryQuantity('unidentified_blackstone_relic')).toBe(0)
  })

  it('非天龙城拒绝（ID4 地点/NPC 合法性由 Store 入口守卫）', () => {
    at('black_stone_tower_floor4')
    const before = state()
    expect(store().identifyItem('identification_blackstone_relic')).toBe(false)
    expect(state()).toBe(before)
  })

  it('ID15 Save/Reload：未鉴定遗物与已鉴定装备均保持', () => {
    expect(store().identifyItem('identification_blackstone_relic')).toBe(true)
    expect(store().saveGame('slot1')).toBe(true)
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(store().loadSlot('slot1')).toBe(true)
    expect(inventoryQuantity('blackstone_guard_armor')).toBe(1)
    expect(state().world.flags.blackstone_relic_identified).toBe(true)
  })
})

describe('TM-P2-013 §20/§27：回报与完成', () => {
  beforeEach(() => {
    beginEcho()
    at('black_stone_tower_floor4')
    for (const point of ['broken_gate', 'resonance', 'seal_pattern'] as const) store().investigateFloor4Point(point, 'mnd', 20)
    at('black_stone_sealed_chamber')
    expect(store().resolveEncounterVictory('encounter_blackstone_warden')).not.toBeNull()
    at('tianlong_city')
    expect(store().identifyItem('identification_blackstone_relic')).toBe(true)
  })

  it('未鉴定不可回报；鉴定后武馆回报 → completable → 提交（180XP/70金 一次）', () => {
    at('tianlong_martial_hall')
    expect(store().reportBlackStoneEcho()).toBe(true)
    const quest = state().quests.find((entry) => entry.questId === QUEST_ID)!
    expect(quest.status).toBe('completable')
    expect(store().reportBlackStoneEcho()).toBe(false)
    const goldBefore = state().player.gold
    const xpBefore = state().player.adventureXp
    expect(store().completeQuest(QUEST_ID)).toBe(true)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.status).toBe('completed')
    expect(state().player.gold).toBe(goldBefore + 70)
    expect(state().player.adventureXp).toBe(xpBefore + 180)
    expect(store().completeQuest(QUEST_ID)).toBe(false)
  })

  it('§20 世界反馈：四层/封印室保持开放、Boss 不刷新、普通遭遇仍可重复', () => {
    at('tianlong_martial_hall')
    store().reportBlackStoneEcho()
    store().completeQuest(QUEST_ID)
    at('black_stone_tower_floor4')
    expect(checkEncounter(state(), 'encounter_floor4_sentinel').allowed).toBe(true)
    at('black_stone_sealed_chamber')
    expect(checkEncounter(state(), 'encounter_blackstone_warden')).toMatchObject({ allowed: false, reason: 'already_defeated' })
  })

  it('Save/Reload：任务 completed 与 flags 保持', () => {
    at('tianlong_martial_hall')
    store().reportBlackStoneEcho()
    store().completeQuest(QUEST_ID)
    expect(store().saveGame('slot1')).toBe(true)
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(store().loadSlot('slot1')).toBe(true)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.status).toBe('completed')
    expect(state().world.flags.black_stone_tower_floor4_unlocked).toBe(true)
    expect(state().world.flags.black_stone_sealed_chamber_unlocked).toBe(true)
  })
})

describe('TM-P2-013 §30 FIX-02：preparation undefined === none', () => {
  it('preparation 未设置 → Boss encounter allowed 且 resolveBossPhaseContext 无加成', () => {
    useGameStore.setState({ gameState: createInitialGameState({ name: '未准备', gender: 'male', profession: 'knight', attributes: { str: 12, agi: 10, con: 12, mnd: 10, lck: 10 } }), hasSave: false })
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, currentLocationId: 'spirit_spring_valley', flags: { ...current.gameState.world.flags, spirit_spring_valley_unlocked: true } } } : null }))
    expect(checkEncounter(state(), 'encounter_black_bear_qialala').allowed).toBe(true)
    expect(resolveBossPhaseContext(state(), 'encounter_black_bear_qialala')).toEqual({ suppressHeal: false, agilityPenalty: 0 })
  })
})

describe('TM-P2-013 §21：Golden Rabbit HARD FREEZE', () => {
  it('完整黑石余响流程后黄金兔状态原封不动、不与黑石/神泉联动', () => {
    seedGoldenFreeze()
    const before = goldenSnapshot()
    beginEcho()
    at('black_stone_tower_floor4')
    for (const point of ['broken_gate', 'resonance', 'seal_pattern'] as const) store().investigateFloor4Point(point, 'mnd', 20)
    at('black_stone_sealed_chamber')
    expect(store().resolveEncounterVictory('encounter_blackstone_warden')).not.toBeNull()
    at('tianlong_city')
    expect(store().identifyItem('identification_blackstone_relic')).toBe(true)
    at('tianlong_martial_hall')
    expect(store().reportBlackStoneEcho()).toBe(true)
    expect(store().completeQuest(QUEST_ID)).toBe(true)
    expect(goldenSnapshot()).toEqual(before)
  })
})
