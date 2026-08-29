/**
 * TM-P2-012 §72：神泉之水主线 store 契约测试（S1-S25 中可在状态层验证的部分）。
 *
 * UI 层入口（中央卡出现/消失、按钮文案）由 qa/p2-012-e2e.mjs 与 full journey 覆盖；
 * 本文件锁定状态层语义：发现/接受门槛、追踪 fail-forward、战前准备互斥、
 * Boss 首胜幂等、任务水 guaranteed、回报与奖励不可重复、黄金兔 HARD FREEZE。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { useGameStore } from './gameStore'
import type { QuestStatus } from '../types/quest'

const QUEST_ID = 'quest_spirit_spring_water'

type SpiritSpringTrackingResult = { ok: boolean; success?: boolean; failForward?: boolean; reason?: 'locked' | 'unavailable' }

function createMockStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockStorage())
  useGameStore.setState({ gameState: createInitialGameState({ name: '神泉验收员', gender: 'male', profession: 'knight', attributes: { str: 12, agi: 10, con: 12, mnd: 10, lck: 10 } }), hasSave: false })
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

function setFlags(flags: Record<string, boolean | number | string>) {
  useGameStore.setState((current) => ({
    gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, flags: { ...current.gameState.world.flags, ...flags } } } : null,
  }))
}

function putQuest(questId: string, status: QuestStatus, flags: Record<string, boolean | number | string> = {}) {
  useGameStore.setState((current) => ({
    gameState: current.gameState
      ? {
          ...current.gameState,
          quests: [...current.gameState.quests.filter((quest) => quest.questId !== questId), { questId, status, stage: 0, flags }],
        }
      : null,
  }))
}

/** 完成《天龙武备试炼》——神泉任务发现的正式前置 */
function completeMartialTrial() {
  putQuest('quest_tianlong_martial_trial', 'completed', { trial_reward_claimed: true })
}

/** 走到「已接任务、已见王五、可开始追踪」的最小状态 */
function readyForTracking() {
  completeMartialTrial()
  at('tianlong_city')
  expect(store().discoverSpiritSpringRumor()).toBe(true)
  at('qingshi_village')
  expect(store().askVillageAboutSpiritSpring()).toBe(true)
  at('qingshi_north_hills')
  expect(store().beginSpiritSpringQuest()).toBe(true)
}

function inventoryQuantity(itemId: string) {
  return state().inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0
}

function goldenRabbitSnapshot() {
  return {
    quest: state().quests.find((quest) => quest.questId === 'quest_golden_rabbit_search'),
    rabbitPath: state().inventory.find((entry) => entry.itemId === 'rabbit_path'),
  }
}

describe('TM-P2-012 §72：主线发现与回村打听（S1/S3/S7）', () => {
  it('S1 武备试炼完成前不能发现；完成后只发现一次（tianlong_city 入口）', () => {
    at('tianlong_city')
    expect(store().discoverSpiritSpringRumor()).toBe(false)
    expect(state().quests.some((quest) => quest.questId === QUEST_ID)).toBe(false)
    completeMartialTrial()
    expect(store().discoverSpiritSpringRumor()).toBe(true)
    expect(state().quests.find((quest) => quest.questId === QUEST_ID)?.status).toBe('available')
    expect(state().world.flags.spirit_spring_rumor_heard).toBe(true)
    expect(store().discoverSpiritSpringRumor()).toBe(false)
  })

  it('S3/S7 回青石村打听推进 stage 1 并解锁北坡入口；未听传闻时拒绝', () => {
    completeMartialTrial()
    expect(store().discoverSpiritSpringRumor()).toBe(false) // 不在天龙城
    at('qingshi_village')
    expect(store().askVillageAboutSpiritSpring()).toBe(false) // 未听传闻
    at('tianlong_city')
    expect(store().discoverSpiritSpringRumor()).toBe(true)
    at('qingshi_village')
    expect(store().askVillageAboutSpiritSpring()).toBe(true)
    const quest = state().quests.find((entry) => entry.questId === QUEST_ID)
    expect(quest?.stage).toBe(1)
    expect(quest?.flags.village_asked).toBe(true)
    expect(state().world.flags.qingshi_north_hills_unlocked).toBe(true)
    expect(store().askVillageAboutSpiritSpring()).toBe(false)
  })
})

describe('TM-P2-012 §72：王五与猎人的旧路（S4/S5/S6）', () => {
  it('S4/S5/S6 在北坡见王五：主线 in_progress stage 2 + 支线同时开启 + 采集解锁', () => {
    readyForTracking()
    const main = state().quests.find((entry) => entry.questId === QUEST_ID)
    expect(main?.status).toBe('in_progress')
    expect(main?.stage).toBe(2)
    expect(main?.flags.wang_wu_met).toBe(true)
    const side = state().quests.find((entry) => entry.questId === 'quest_hunter_old_path')
    expect(side?.status).toBe('in_progress')
    expect(state().world.flags.gathering_v1_unlocked).toBe(true)
    expect(state().world.flags.spirit_spring_wang_wu_taught).toBe(true)
  })

  it('未回村打听（village_asked 非 true）时王五不开启任务', () => {
    completeMartialTrial()
    at('tianlong_city')
    store().discoverSpiritSpringRumor()
    at('qingshi_north_hills')
    expect(store().beginSpiritSpringQuest()).toBe(false)
    expect(state().world.flags.gathering_v1_unlocked).toBeUndefined()
  })
})

describe('TM-P2-012 §72：追踪多解与 fail-forward（S8-S15）', () => {
  beforeEach(() => {
    readyForTracking()
    at('qingshi_north_hills')
  })

  it('S8 MND 成功：解锁山谷 + 记录兽迹线索 + stage 4', () => {
    const result = store().trackSpiritSpring('mnd', 20) as SpiritSpringTrackingResult
    expect(result.ok).toBe(true)
    expect(result.success).toBe(true)
    expect(result.failForward).toBe(false)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.stage).toBe(4)
    expect(state().world.flags.spirit_spring_valley_unlocked).toBe(true)
    expect(state().world.flags.clue_north_hill_tracks).toBe(true)
  })

  it('S9 MND 失败 fail-forward：剧情仍推进、不可无限重骰', () => {
    const result = store().trackSpiritSpring('mnd', 1) as SpiritSpringTrackingResult
    expect(result.ok).toBe(true)
    expect(result.success).toBe(false)
    expect(result.failForward).toBe(true)
    expect(state().world.flags.spirit_spring_valley_unlocked).toBe(true)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.flags.tracking_fail_forward).toBe(true)
    const snapshot = state()
    expect(store().trackSpiritSpring('mnd', 20).ok).toBe(false)
    expect(state()).toBe(snapshot)
  })

  it('S10/S11 LUCK 成功与失败都只提供信息优势，不解锁额外奖励', () => {
    const success = store().trackSpiritSpring('lck', 20) as SpiritSpringTrackingResult
    expect(success.ok).toBe(true)
    expect(success.success).toBe(true)
    expect(inventoryQuantity('spirit_spring_water')).toBe(0)
    // 重置后失败路径同样 fail-forward（重新走发现链）
    useGameStore.setState({ gameState: createInitialGameState({ name: '神泉验收员', gender: 'male', profession: 'knight', attributes: { str: 12, agi: 10, con: 12, mnd: 10, lck: 10 } }), hasSave: false })
    readyForTracking()
    at('qingshi_north_hills')
    const failure = store().trackSpiritSpring('lck', 1) as SpiritSpringTrackingResult
    expect(failure.ok).toBe(true)
    expect(failure.failForward).toBe(true)
    expect(state().world.flags.spirit_spring_valley_unlocked).toBe(true)
  })

  it('S12 游侠辨迹仅游侠可用（+2 情境修正），非游侠拒绝', () => {
    expect(store().trackSpiritSpring('ranger', 20)).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.flags.tracked).toBeUndefined()
  })

  it('S13 坐骑路径需要已装备坐骑；无坐骑拒绝且不消耗追踪机会', () => {
    expect(store().trackSpiritSpring('mount')).toMatchObject({ ok: false, reason: 'unavailable' })
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.flags.tracked).toBeUndefined()
  })

  it('S14 Sakura 同行提供金色兽毛线索；不同行拒绝', () => {
    expect(store().trackSpiritSpring('sakura')).toMatchObject({ ok: false, reason: 'unavailable' })
    useGameStore.setState((current) => ({
      gameState: current.gameState
        ? {
            ...current.gameState,
            companions: { sakura_yuko: { companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 8, maxMp: 8, learnedSkillIds: [], flags: {} } },
            party: { activeCompanionIds: ['sakura_yuko'] },
          }
        : null,
    }))
    const result = store().trackSpiritSpring('sakura') as SpiritSpringTrackingResult
    expect(result.ok).toBe(true)
    expect(state().world.flags.clue_spring_golden_fur).toBe(true)
  })

  it('追踪只能进行一次（tracked 已 true 后全部方法拒绝）', () => {
    expect(store().trackSpiritSpring('mnd', 20).ok).toBe(true)
    expect(store().trackSpiritSpring('mnd', 20).ok).toBe(false)
    expect(store().trackSpiritSpring('lck', 20).ok).toBe(false)
  })
})

describe('TM-P2-012 §72：战前准备（S17-S19，最多一项）', () => {
  beforeEach(() => {
    readyForTracking()
    at('qingshi_north_hills')
    expect(store().trackSpiritSpring('mnd', 20).ok).toBe(true)
    at('spirit_spring_valley')
  })

  it('S17 直接挑战是合法选择', () => {
    expect(store().chooseSpiritSpringPreparation('none')).toBe(true)
    expect(state().world.flags.spirit_spring_preparation).toBe('none')
  })

  it('S18 驱熊香需要王五教导；未教导拒绝', () => {
    expect(state().world.flags.spirit_spring_wang_wu_taught).toBe(true)
    expect(store().chooseSpiritSpringPreparation('incense')).toBe(true)
    expect(state().world.flags.spirit_spring_preparation).toBe('incense')
  })

  it('S19 旧伤观察需要高 MND 或游侠；低 MND 非游侠拒绝', () => {
    expect(state().player.attributes.mnd).toBeLessThan(12)
    expect(state().player.profession).not.toBe('ranger')
    expect(store().chooseSpiritSpringPreparation('old_injury')).toBe(false)
    expect(state().world.flags.spirit_spring_preparation).toBeUndefined()
  })

  it('准备只能选一次，二次选择被拒绝且不覆盖', () => {
    expect(store().chooseSpiritSpringPreparation('incense')).toBe(true)
    expect(store().chooseSpiritSpringPreparation('none')).toBe(false)
    expect(store().chooseSpiritSpringPreparation('old_injury')).toBe(false)
    expect(state().world.flags.spirit_spring_preparation).toBe('incense')
  })
})

describe('TM-P2-012 §72：Boss 首胜、神泉之水与奖励幂等（S20-S24）', () => {
  beforeEach(() => {
    readyForTracking()
    at('qingshi_north_hills')
    expect(store().trackSpiritSpring('mnd', 20).ok).toBe(true)
    at('spirit_spring_valley')
  })

  it('S20 Boss 首胜写 defeated flag + stage 6；重复结算拒绝', () => {
    expect(store().resolveCombatVictory('black_bear_qialala')).toBe(true)
    expect(state().world.flags.black_bear_qialala_defeated).toBe(true)
    const quest = state().quests.find((entry) => entry.questId === QUEST_ID)
    expect(quest?.stage).toBe(6)
    expect(quest?.flags.qialala_defeated).toBe(true)
    expect(store().resolveCombatVictory('black_bear_qialala')).toBe(false)
  })

  it('S20b Boss 未击败时不能进入胜利结算之外的状态（挡在山下取水）', () => {
    expect(inventoryQuantity('spirit_spring_water')).toBe(0)
    expect(store().gather('spirit_spring_water')).toBe(false)
    expect(inventoryQuantity('spirit_spring_water')).toBe(0)
  })

  it('S21 收集神泉之水 guaranteed：一次性、不受 LCK 影响', () => {
    expect(store().resolveCombatVictory('black_bear_qialala')).toBe(true)
    const before = inventoryQuantity('spirit_spring_water')
    expect(store().gather('spirit_spring_water')).toBe(true)
    expect(inventoryQuantity('spirit_spring_water')).toBe(before + 1)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.flags.water_collected).toBe(true)
    expect(store().gather('spirit_spring_water')).toBe(false)
    expect(inventoryQuantity('spirit_spring_water')).toBe(before + 1)
  })

  it('S22/S23/S24 带水回村回报 → 提交完成 → 奖励只发一次', () => {
    expect(store().resolveCombatVictory('black_bear_qialala')).toBe(true)
    expect(store().gather('spirit_spring_water')).toBe(true)
    at('qingshi_village')
    expect(store().reportSpiritSpringWater()).toBe(true)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.status).toBe('completable')
    expect(store().reportSpiritSpringWater()).toBe(false)

    const goldBefore = state().player.gold
    const xpBefore = state().player.adventureXp
    expect(store().completeQuest(QUEST_ID)).toBe(true)
    expect(state().quests.find((entry) => entry.questId === QUEST_ID)?.status).toBe('completed')
    expect(state().player.gold).toBe(goldBefore + 60)
    expect(state().player.adventureXp).toBe(xpBefore + 160)
    expect(store().completeQuest(QUEST_ID)).toBe(false)
    expect(state().player.gold).toBe(goldBefore + 60)
    expect(state().player.adventureXp).toBe(xpBefore + 160)
  })
})

describe('TM-P2-012 §63/§64：Golden Rabbit HARD FREEZE', () => {
  beforeEach(() => {
    // 模拟 P2-011 之后的真实黄金兔冻结态
    putQuest('quest_golden_rabbit_search', 'in_progress', {
      asked_blacksmith: true,
      asked_apothecary: true,
      village_inquiry_reported: true,
      rabbit_lair_rechecked: true,
    })
    useGameStore.setState((current) => ({
      gameState: current.gameState
        ? { ...current.gameState, inventory: [...current.gameState.inventory, { itemId: 'rabbit_path', quantity: 1 }] }
        : null,
    }))
  })

  it('S25b 完整神泉流程后黄金兔任务、flags 与 rabbit_path 原封不动', () => {
    const before = goldenRabbitSnapshot()
    readyForTracking()
    at('qingshi_north_hills')
    expect(store().trackSpiritSpring('mnd', 20).ok).toBe(true)
    at('spirit_spring_valley')
    expect(store().chooseSpiritSpringPreparation('incense')).toBe(true)
    expect(store().resolveCombatVictory('black_bear_qialala')).toBe(true)
    expect(store().gather('spirit_spring_water')).toBe(true)
    at('qingshi_village')
    expect(store().reportSpiritSpringWater()).toBe(true)
    expect(store().completeQuest(QUEST_ID)).toBe(true)

    expect(goldenRabbitSnapshot()).toEqual(before)
    // 两条剧情完全隔离：神泉 flag 不得出现在黄金兔任务 flags
    expect(before.quest?.flags).not.toHaveProperty('spirit_spring')
  })
})

describe('TM-P2-012 §72 S25：旧存档路径', () => {
  it('旧 V6 存档（无任何神泉 flag）加载后流程仍可达且初始状态无神泉残留', () => {
    const fresh = createInitialGameState({ name: '旧存档玩家', gender: 'female', profession: 'ranger', attributes: { str: 10, agi: 14, con: 10, mnd: 10, lck: 10 } })
    useGameStore.setState({ gameState: fresh, hasSave: false })
    expect(state().world.flags.spirit_spring_rumor_heard).toBeUndefined()
    expect(state().world.flags.gathering_v1_unlocked).toBeUndefined()
    expect(state().quests.some((quest) => quest.questId === QUEST_ID)).toBe(false)
    // 旧存档玩家完成试炼后依然可以走完整发现链
    completeMartialTrial()
    at('tianlong_city')
    expect(store().discoverSpiritSpringRumor()).toBe(true)
    at('qingshi_village')
    expect(store().askVillageAboutSpiritSpring()).toBe(true)
    at('qingshi_north_hills')
    expect(store().beginSpiritSpringQuest()).toBe(true)
    // 旧存档的游侠在北坡可用职业辨迹
    const result = store().trackSpiritSpring('ranger', 20) as SpiritSpringTrackingResult
    expect(result.ok).toBe(true)
    expect(result.success).toBe(true)
  })
})

describe('TM-P2-012-R1 P1-03：《猎人的旧路》完整生命周期', () => {
  it('随王五教学自动开启；教学采集推进 progress；北坡复命 → completable → 完成；重复提交被拒绝', () => {
    readyForTracking() // beginSpiritSpringQuest 同时 discover+accept 猎人的旧路
    const side = () => state().quests.find((entry) => entry.questId === 'quest_hunter_old_path')!
    expect(side().status).toBe('in_progress')
    // 未教学时复命被拒绝
    at('qingshi_north_hills')
    expect(store().reportHunterOldPath()).toBe(false)
    // 教学采集推进（任一 authored 节点）
    expect(store().gather('north_hills_hemostatic_herb')).toBe(true)
    expect(side().flags.tutorial_gathered).toBe(true)
    expect(side().stage).toBe(1)
    // 复命 → completable（不在北坡则拒绝）
    at('qingshi_village')
    expect(store().reportHunterOldPath()).toBe(false)
    at('qingshi_north_hills')
    expect(store().reportHunterOldPath()).toBe(true)
    expect(side().status).toBe('completable')
    expect(side().flags.reported).toBe(true)
    expect(store().reportHunterOldPath()).toBe(false)
    // 提交：奖励 15金/25XP 只发一次
    const goldBefore = state().player.gold
    const xpBefore = state().player.adventureXp
    expect(store().completeQuest('quest_hunter_old_path')).toBe(true)
    expect(side().status).toBe('completed')
    expect(state().player.gold).toBe(goldBefore + 15)
    expect(state().player.adventureXp).toBe(xpBefore + 25)
    expect(store().completeQuest('quest_hunter_old_path')).toBe(false)
    expect(state().player.gold).toBe(goldBefore + 15)
  })

  it('Save/Reload 保持《猎人的旧路》进度', () => {
    readyForTracking()
    at('qingshi_north_hills')
    store().gather('north_hills_hemostatic_herb')
    store().reportHunterOldPath()
    expect(store().saveGame('slot1')).toBe(true)
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(store().loadSlot('slot1')).toBe(true)
    const side = state().quests.find((entry) => entry.questId === 'quest_hunter_old_path')!
    expect(side.status).toBe('completable')
    expect(side.flags.tutorial_gathered).toBe(true)
    expect(side.flags.reported).toBe(true)
  })
})
