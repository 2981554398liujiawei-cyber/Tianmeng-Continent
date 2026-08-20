/**
 * 樱花优子完整剧情集成测试（TM-P2-004 第 110-120 节最低清单）。
 * 流程：触发樱雨 → 进神域 → 初见三分支 → 职业对话 → MND/LUCK 检定（一次性）→
 * 临时合作 guest → 残灾战斗胜利 → 契约（三分支/拒绝/再议）→ recruited → 交谈/赠礼 → 首次休整 → banter。
 * 以及：存档刷新保持、神域刷新不重复、黄金兔冻结迁移、伙伴 MP/once 语义、combat victory alone != recruited。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { createInitialGameState } from '../content/initial'
import { getItem, getCompanion } from '../content'
import { saveSlot, migrateSave, SLOT_FORMAT_VERSION } from '../utils/storage'
import type { GameState } from '../types/game'

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

/** 构造"北门失联 completed"的 Phase 2 尾端合法档（触发条件压缩 fallback） */
function phase2DoneState(): GameState {
  const gs = createInitialGameState()
  gs.world.currentLocationId = 'tianlong_city'
  gs.quests = [
    { questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} },
  ]
  return gs
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockStorage())
  useGameStore.setState({ gameState: phase2DoneState(), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const gs = () => useGameStore.getState().gameState!
const sakuraRel = () => useGameStore.getState().gameState?.relationships.sakura_yuko
const sakuraCompanion = () => useGameStore.getState().gameState?.companions.sakura_yuko

describe('TM-P2-004：《落樱越界》完整剧情（trigger → recruited）', () => {
  it('完整主路径：樱雨→神域→初见(help)→职业→MND 成功→guest→战斗胜利→契约(affirm)→recruited', () => {
    // 1. 触发樱雨
    expect(useGameStore.getState().startSakuraEncounter()).toBe(true)
    expect(gs().world.flags.sakura_encounter_started).toBe(true)
    const boundaryQuest = gs().quests.find((q) => q.questId === 'quest_sakura_boundary')
    expect(boundaryQuest?.status).toBe('in_progress')
    // 重复触发 no-op
    expect(useGameStore.getState().startSakuraEncounter()).toBe(false)

    // 2. 进入神域
    expect(useGameStore.getState().enterSakuraDomain()).toBe(true)
    expect(gs().world.currentLocationId).toBe('sakura_domain_fragment')
    expect(gs().world.flags.sakura_domain_entered).toBe(true)

    // 3. 初见（help：affection+2 trust+3）
    const meet = useGameStore.getState().meetSakura('help')
    expect(meet?.outcome).toBe('met')
    expect(meet?.affectionDelta).toBe(2)
    expect(meet?.trustDelta).toBe(3)
    expect(sakuraRel()?.affection).toBe(7)
    expect(sakuraRel()?.trust).toBe(8)
    expect(sakuraCompanion()?.status).toBe('met')
    expect(gs().world.flags.sakura_met).toBe(true)
    // 重复初见 no-op（canMeetSakura false → null）
    expect(useGameStore.getState().meetSakura('help')).toBeNull()

    // 4. 职业对话（骑士：trust+3 affection+1）
    expect(useGameStore.getState().sakuraProfessionTalk()?.outcome).toBe('talked')
    expect(useGameStore.getState().sakuraProfessionTalk()).toBeNull()

    // 5. MND 检定成功（roll=20 保证 ≥ DC12；玩家 MND8 修正 -1）
    const mnd = useGameStore.getState().sakuraMndCheck(20)
    expect(mnd?.outcome).toBe('success')
    expect(gs().world.flags.sakura_mnd_attempted).toBe(true)
    expect(gs().world.flags.sakura_mnd_succeeded).toBe(true)
    // 一次性：不重掷
    expect(useGameStore.getState().sakuraMndCheck(20)).toBeNull()
    // MND 成功 → 不再可用 LUCK
    expect(useGameStore.getState().sakuraLuckRescue(20)).toBeNull()

    // 6. 临时合作 guest（加入 activeCompanionIds）
    expect(useGameStore.getState().offerSakuraGuest()).toBe(true)
    expect(sakuraCompanion()?.status).toBe('guest')
    expect(gs().party.activeCompanionIds).toContain('sakura_yuko')
    expect(gs().world.flags.sakura_guest).toBe(true)

    // 7. 残灾战斗胜利（回天龙城 + calamityDefeated + contractOffered）
    expect(useGameStore.getState().resolveCombatVictory('sakura_calamity_fragment')).toBe(true)
    expect(gs().world.flags.sakura_calamity_defeated).toBe(true)
    expect(gs().world.currentLocationId).toBe('tianlong_city')
    expect(gs().world.flags.sakura_contract_offered).toBe(true)
    // 仍未 recruited（combat victory alone != recruited）
    expect(sakuraCompanion()?.status).toBe('guest')

    // 8. 契约（affirm：trust+5 affection+2）→ recruited
    const contract = useGameStore.getState().acceptSakuraContract('affirm')
    expect(contract?.outcome).toBe('recruited')
    expect(sakuraCompanion()?.status).toBe('recruited')
    expect(sakuraRel()?.personalQuestStage).toBe(1)
    expect(gs().world.flags.sakura_contract_accepted).toBe(true)
    // 《落樱越界》completed
    expect(gs().quests.find((q) => q.questId === 'quest_sakura_boundary')?.status).toBe('completed')
    // 重复招募 no-op（防双入队；canAcceptContract false → null）
    expect(useGameStore.getState().acceptSakuraContract('affirm')).toBeNull()
  })

  it('初见三分支：pet_joke 被明确拒绝但不永久断线（affection-2 trust-4；不锁死后续）', () => {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    const meet = useGameStore.getState().meetSakura('pet_joke')
    expect(meet?.affectionDelta).toBe(-2)
    expect(meet?.trustDelta).toBe(-4)
    expect(sakuraRel()?.affection).toBe(3)
    expect(sakuraRel()?.trust).toBe(1)
    // 关系仍在 acquaintance（5-4=1 ≥ 0），后续剧情可继续
    expect(useGameStore.getState().offerSakuraGuest()).toBe(true)
  })

  it('MND 失败 → LUCK 命运补救（大成功额外 affection+1）；LUCK 失败一次性；LUCK 20 不自动 recruited', () => {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    // MND 失败（roll=1）
    const mnd = useGameStore.getState().sakuraMndCheck(1)
    expect(mnd?.outcome).toBe('failed')
    expect(gs().world.flags.sakura_mnd_succeeded).not.toBe(true)
    // 可 LUCK 补救；大成功（roll=20）
    const luck = useGameStore.getState().sakuraLuckRescue(20)
    expect(luck?.outcome).toBe('success')
    expect(luck?.nat20).toBe(true)
    expect(sakuraRel()?.trust).toBe(9) // 5+3+1
    expect(sakuraRel()?.affection).toBe(8) // 5+2+1
    // LUCK 一次性
    expect(useGameStore.getState().sakuraLuckRescue(20)).toBeNull()
    // LUCK 大成功也绝不自动 recruited
    expect(sakuraCompanion()?.status).toBe('met')
  })

  it('契约拒绝：不 recruited、任务保持 in_progress、关系保留、红颜录保留、可再谈', () => {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    useGameStore.getState().offerSakuraGuest()
    useGameStore.getState().resolveCombatVictory('sakura_calamity_fragment')
    expect(useGameStore.getState().refuseSakuraContract()).toBe(true)
    expect(sakuraCompanion()?.status).toBe('guest')
    expect(gs().quests.find((q) => q.questId === 'quest_sakura_boundary')?.status).toBe('in_progress')
    // 关系/红颜录保留（relationships 仍在）
    expect(sakuraRel()).toBeDefined()
    // 可再谈（reoffer → accept）
    expect(useGameStore.getState().reofferSakuraContract()).toBe(true)
    const contract = useGameStore.getState().acceptSakuraContract('try')
    expect(contract?.outcome).toBe('recruited')
  })

  it('契约三选择数值：affirm trust+5/affection+2；try trust+2；joke 关系尚可 affection+1（她纠正所有权含义）', () => {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    useGameStore.getState().offerSakuraGuest()
    useGameStore.getState().resolveCombatVictory('sakura_calamity_fragment')
    // try：trust+2
    const relBefore = sakuraRel()!
    expect(relBefore.trust).toBe(8)
    const c1 = useGameStore.getState().acceptSakuraContract('try')
    expect(c1?.trustDelta).toBe(2)
  })
})

describe('TM-P2-004：交谈与赠礼', () => {
  function recruitedState() {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    useGameStore.getState().offerSakuraGuest()
    useGameStore.getState().resolveCombatVictory('sakura_calamity_fragment')
    useGameStore.getState().acceptSakuraContract('affirm')
  }

  it('常驻交谈：每休整周期前 2 次 affection+1；第 3 次 cycle_limited 不刷分', () => {
    recruitedState()
    const before = sakuraRel()!.affection
    expect(useGameStore.getState().talkToSakura('continent')?.outcome).toBe('talked')
    expect(useGameStore.getState().talkToSakura('wound')?.outcome).toBe('talked')
    expect(useGameStore.getState().talkToSakura('past')?.outcome).toBe('cycle_limited')
    expect(sakuraRel()!.affection).toBe(before + 2)
  })

  it('询问伤势在 MND 成功后特别契合 +2', () => {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    useGameStore.getState().sakuraMndCheck(20)
    useGameStore.getState().offerSakuraGuest()
    useGameStore.getState().resolveCombatVictory('sakura_calamity_fragment')
    useGameStore.getState().acceptSakuraContract('affirm')
    const before = sakuraRel()!.affection
    const result = useGameStore.getState().talkToSakura('wound')
    expect(result?.affectionDelta).toBe(2)
    expect(sakuraRel()!.affection).toBe(before + 2)
  })

  it('赠礼：桂花糕（liked）好感 +2 且 inventory 精确 -1；同周期再送拒绝不消耗', () => {
    recruitedState()
    useGameStore.getState().addGold(100)
    expect(useGameStore.getState().buyOsmanthusCake()).toBe(true)
    expect(useGameStore.getState().buyOsmanthusCake()).toBe(true)
    const beforeCount = gs().inventory.find((e) => e.itemId === 'tianlong_osmanthus_cake')!.quantity
    const beforeAffection = sakuraRel()!.affection
    const gift = useGameStore.getState().giveGift('sakura_yuko', 'tianlong_osmanthus_cake')
    expect(gift?.outcome).toBe('given')
    expect(gift?.affectionDelta).toBe(2)
    expect(gs().inventory.find((e) => e.itemId === 'tianlong_osmanthus_cake')!.quantity).toBe(beforeCount - 1)
    expect(sakuraRel()!.affection).toBe(beforeAffection + 2)
    // 同周期再送 → already_gifted 且不消耗
    const again = useGameStore.getState().giveGift('sakura_yuko', 'tianlong_osmanthus_cake')
    expect(again?.outcome).toBe('already_gifted')
    expect(gs().inventory.find((e) => e.itemId === 'tianlong_osmanthus_cake')!.quantity).toBe(beforeCount - 1)
  })

  it('赠礼失败不消费：未知物品/非礼物/未持有/未知 NPC', () => {
    recruitedState()
    const beforeInv = JSON.stringify(gs().inventory)
    expect(useGameStore.getState().giveGift('sakura_yuko', 'ghost_item')?.outcome).toBe('unknown_item')
    expect(useGameStore.getState().giveGift('sakura_yuko', 'healing_potion')?.outcome).toBe('not_gift')
    expect(useGameStore.getState().giveGift('sakura_yuko', 'iron_sword')?.outcome).toBe('not_gift')
    expect(useGameStore.getState().giveGift('nobody', 'tianlong_osmanthus_cake')?.outcome).toBe('locked')
    expect(JSON.stringify(gs().inventory)).toBe(beforeInv)
  })

  it('桂花糕购买：非天龙城拒绝；金币不足拒绝', () => {
    recruitedState()
    useGameStore.getState().setCurrentLocation('qingshi_village')
    expect(useGameStore.getState().buyOsmanthusCake()).toBe(false)
    useGameStore.getState().setCurrentLocation('tianlong_city')
    useGameStore.getState().removeGold(9999)
    expect(useGameStore.getState().buyOsmanthusCake()).toBe(false)
  })

  it('首次休整谈话（respect：trust+4 affection+2）；Long Rest 后 firstRestReady', () => {
    recruitedState()
    expect(gs().world.flags.sakura_first_rest_ready).not.toBe(true)
    // 回到青石村休整
    useGameStore.getState().setCurrentLocation('qingshi_village')
    useGameStore.getState().restAtVillage()
    expect(gs().world.flags.sakura_first_rest_ready).toBe(true)
    const beforeTrust = sakuraRel()!.trust
    const result = useGameStore.getState().sakuraFirstRestTalk('respect')
    expect(result?.trustDelta).toBe(4)
    expect(sakuraRel()!.trust).toBe(beforeTrust + 4)
    // 一次性
    expect(useGameStore.getState().sakuraFirstRestTalk('respect')).toBeNull()
  })

  it('首次休整谈话 joke：trust>=15 → affection+1；否则 -1', () => {
    recruitedState()
    useGameStore.getState().setCurrentLocation('qingshi_village')
    useGameStore.getState().restAtVillage()
    const before = sakuraRel()!.affection
    const result = useGameStore.getState().sakuraFirstRestTalk('joke')
    expect(result?.affectionDelta).toBe(sakuraRel()!.trust >= 15 ? 1 : -1)
    expect(sakuraRel()!.affection).toBe(before + result!.affectionDelta)
  })

  it('天龙城 banter：-1/0/+1 轻量变化；一次性', () => {
    recruitedState()
    useGameStore.getState().setCurrentLocation('tianlong_city')
    const before = sakuraRel()!.affection
    expect(useGameStore.getState().sakuraBanter('will_like')?.affectionDelta).toBe(1)
    expect(sakuraRel()!.affection).toBe(before + 1)
    expect(useGameStore.getState().sakuraBanter('habit')).toBeNull() // 一次性
  })
})

describe('TM-P2-004：伙伴 MP 与队伍', () => {
  function recruitedState() {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    useGameStore.getState().offerSakuraGuest()
    useGameStore.getState().resolveCombatVictory('sakura_calamity_fragment')
    useGameStore.getState().acceptSakuraContract('affirm')
  }

  it('spendCompanionSkillMp：飞斩 6→5 / 盾 6→4 / 轻舞 6→4；不足拒绝不消耗', () => {
    recruitedState()
    expect(useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'sakura_petalslash')).toBe(true)
    expect(sakuraCompanion()!.mp).toBe(5)
    expect(useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'sakura_magic_shield')).toBe(true)
    expect(sakuraCompanion()!.mp).toBe(3)
    expect(useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'sakura_light_dance')).toBe(true)
    expect(sakuraCompanion()!.mp).toBe(1)
    // 不足：轻舞 cost2 > mp1 → false 不消耗
    expect(useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'sakura_light_dance')).toBe(false)
    expect(sakuraCompanion()!.mp).toBe(1)
    // 未知技能 / 未学会技能拒绝
    expect(useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'knight_power_strike')).toBe(false)
    expect(useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'ghost_skill')).toBe(false)
  })

  it('Long Rest：Sakura mp 1/6 → 6/6；restCount+1', () => {
    recruitedState()
    useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'sakura_light_dance')
    useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'sakura_light_dance')
    useGameStore.getState().spendCompanionSkillMp('sakura_yuko', 'sakura_petalslash')
    expect(sakuraCompanion()!.mp).toBe(1)
    useGameStore.getState().setCurrentLocation('qingshi_village')
    expect(useGameStore.getState().restAtVillage()).toBe(true)
    expect(sakuraCompanion()!.mp).toBe(6)
    expect(gs().world.restCount).toBe(1)
  })

  it('暂不同行 / 重新同行：recruited 不变、不降关系', () => {
    recruitedState()
    const affectionBefore = sakuraRel()!.affection
    expect(useGameStore.getState().setCompanionActive('sakura_yuko', false)).toBe(true)
    expect(gs().party.activeCompanionIds).not.toContain('sakura_yuko')
    expect(sakuraCompanion()!.status).toBe('recruited')
    expect(sakuraRel()!.affection).toBe(affectionBefore)
    expect(useGameStore.getState().setCompanionActive('sakura_yuko', true)).toBe(true)
    expect(gs().party.activeCompanionIds).toContain('sakura_yuko')
  })
})

describe('TM-P2-004：存档刷新保持（V4 持久化）', () => {
  it('存档 → 读档：已见面/好感/信任/recruited/MP/active/周期 全部保持', () => {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    useGameStore.getState().sakuraMndCheck(12)
    useGameStore.getState().offerSakuraGuest()
    useGameStore.getState().resolveCombatVictory('sakura_calamity_fragment')
    useGameStore.getState().acceptSakuraContract('affirm')
    useGameStore.getState().talkToSakura('continent')
    useGameStore.getState().addGold(100)
    useGameStore.getState().buyOsmanthusCake()
    useGameStore.getState().giveGift('sakura_yuko', 'tianlong_osmanthus_cake')
    expect(useGameStore.getState().saveGame('slot1')).toBe(true)
    expect(gs().world.flags.sakura_first_rest_ready).not.toBe(true)

    // 模拟刷新：重新设置 state 后 load
    useGameStore.getState().setCurrentLocation('qingshi_village')
    useGameStore.getState().restAtVillage()
    expect(gs().world.flags.sakura_first_rest_ready).toBe(true)
    const restCount = gs().world.restCount
    expect(useGameStore.getState().saveGame('slot1')).toBe(true)

    useGameStore.setState({ gameState: null, hasSave: true })
    expect(useGameStore.getState().loadGame()).toBe(true)
    const reloaded = gs()
    expect(reloaded.world.flags.sakura_contract_accepted).toBe(true)
    expect(reloaded.companions.sakura_yuko.status).toBe('recruited')
    expect(reloaded.relationships.sakura_yuko.personalQuestStage).toBe(1)
    expect(reloaded.relationships.sakura_yuko.affection).toBeGreaterThan(5)
    expect(reloaded.party.activeCompanionIds).toContain('sakura_yuko')
    expect(reloaded.world.restCount).toBe(restCount)
    // 神域刷新不重复初见/不重复 roll（flags 持久化）
    expect(reloaded.world.flags.sakura_met).toBe(true)
    expect(reloaded.world.flags.sakura_mnd_attempted).toBe(true)
    expect(reloaded.world.flags.sakura_guest).toBe(true)
  })

  it('V3 存档（黄金兔冻结 in_progress + 无 V4 字段）迁移到 V4 后完全一致', () => {
    const v3 = phase2DoneState()
    v3.world.currentLocationId = 'qingshi_village'
    v3.quests = [
      { questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } },
    ]
    v3.inventory = [{ itemId: 'rabbit_path', quantity: 1 }]
    // @ts-expect-error 模拟 V3 无 V4 字段
    delete v3.companions
    // @ts-expect-error 模拟 V3 无 V4 字段
    delete v3.relationships
    // @ts-expect-error 模拟 V3 无 V4 字段
    delete v3.party
    // @ts-expect-error 模拟 V3 无 restCount
    delete v3.world.restCount
    const slot = { version: 3, savedAt: '2026-01-01T08:00:00.000Z', gameState: v3 }
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(slot))
    expect(migrateSave()).toBe(true)
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1')!)
    expect(raw.version).toBe(SLOT_FORMAT_VERSION)
    const migrated = raw.gameState
    // 黄金兔冻结线完全一致
    expect(migrated.quests[0]).toMatchObject({
      questId: 'quest_golden_rabbit_search',
      status: 'in_progress',
      stage: 0,
      flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true },
    })
    expect(migrated.inventory).toEqual([{ itemId: 'rabbit_path', quantity: 1 }])
    // V4 字段补全
    expect(migrated.companions).toEqual({})
    expect(migrated.relationships).toEqual({})
    expect(migrated.party).toEqual({ activeCompanionIds: [] })
    expect(migrated.world.restCount).toBe(0)
  })

  it('saveGame 写出 V4（companions/relationships/party/restCount 全部持久化）', () => {
    useGameStore.getState().startSakuraEncounter()
    useGameStore.getState().enterSakuraDomain()
    useGameStore.getState().meetSakura('help')
    useGameStore.getState().saveGame('slot1')
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1')!)
    expect(raw.version).toBe(SLOT_FORMAT_VERSION)
    expect(raw.gameState.companions.sakura_yuko.status).toBe('met')
    expect(raw.gameState.relationships.sakura_yuko).toBeDefined()
    expect(raw.gameState.party).toEqual({ activeCompanionIds: [] })
    expect(raw.gameState.world.restCount).toBe(0)
  })
})
