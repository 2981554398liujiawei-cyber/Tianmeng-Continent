/**
 * 樱花优子剧情规则测试（TM-P2-004 第 29-32/81 节）。
 * 覆盖：触发条件（Lv8 正常路径 / 北门失联 completed 压缩 fallback / Lv14 兜底 / 位置白名单 / 一次性）、
 * 场景阶段派生、MND/LUCK/guest/契约 eligibility。
 */
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import {
  canTriggerSakuraEncounter,
  getSakuraSceneStage,
  canEnterSakuraDomain,
  canMeetSakura,
  canMndCheckSakura,
  canLuckRescueSakura,
  canOfferGuest,
  canFightCalamity,
  canOfferContract,
  canReofferContract,
  canAcceptContract,
  isFirstRestTalkReady,
  canTriggerSakuraBanter,
  isAwaitingContract,
  SAKURA_FLAGS,
  SAKURA_DOMAIN_LOCATION,
} from './sakura'

function baseState() {
  const gs = createInitialGameState()
  gs.world.currentLocationId = 'tianlong_city'
  return gs
}

function withPhase2Completed(gs: ReturnType<typeof baseState>) {
  gs.quests = [
    { questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} },
  ]
  return gs
}

describe('TM-P2-004：触发条件', () => {
  it('非触发地点（青石村/北门）→ false', () => {
    const gs = baseState()
    gs.world.currentLocationId = 'qingshi_village'
    expect(canTriggerSakuraEncounter(gs)).toBe(false)
    gs.world.currentLocationId = 'tianlong_north_gate'
    expect(canTriggerSakuraEncounter(gs)).toBe(false)
  })

  it('正常路径：Lv8-12 在天龙城阶段（规则先行）→ true', () => {
    const gs = baseState()
    gs.player.level = 8
    expect(canTriggerSakuraEncounter(gs)).toBe(true)
  })

  it('Lv8 以下且未完成 Phase 2 里程碑 → false', () => {
    const gs = baseState()
    gs.player.level = 2
    expect(canTriggerSakuraEncounter(gs)).toBe(false)
  })

  it('压缩 fallback（TM-P2-004 第 30 节）：已完成《北门失联》→ 任何等级可触发（读现有完成状态，不造重复 flag）', () => {
    const gs = withPhase2Completed(baseState())
    gs.player.level = 2
    expect(canTriggerSakuraEncounter(gs)).toBe(true)
    // 不产生 phase2_done_again 等重复 flag
    expect(gs.world.flags.sakura_phase2_override).toBeUndefined()
    expect(gs.world.flags.phase2_done_again).toBeUndefined()
  })

  it('已触发过（encounter_started）→ 不再触发（一次性）', () => {
    const gs = withPhase2Completed(baseState())
    gs.world.flags[SAKURA_FLAGS.encounterStarted] = true
    expect(canTriggerSakuraEncounter(gs)).toBe(false)
  })

  it('Lv14 兜底（TM-P2-004 第 81 节）：未 recruited 时强制再次出现（不强迫接受）', () => {
    const gs = baseState()
    gs.player.level = 14
    gs.world.flags[SAKURA_FLAGS.encounterStarted] = true // 已触发过但未缔约
    expect(canTriggerSakuraEncounter(gs)).toBe(true)
    // 已 recruited → 不再强制
    const recruited = baseState()
    recruited.player.level = 14
    recruited.companions = { sakura_yuko: { companionId: 'sakura_yuko', status: 'recruited', level: 14, mp: 6, maxMp: 6, learnedSkillIds: [], flags: {} } }
    expect(canTriggerSakuraEncounter(recruited)).toBe(false)
  })
})

describe('TM-P2-004：场景阶段派生', () => {
  it('hidden → sakura_rain → domain → guest → combat_done → recruited', () => {
    const gs = baseState()
    expect(getSakuraSceneStage(gs)).toBe('hidden')
    gs.world.flags[SAKURA_FLAGS.encounterStarted] = true
    expect(getSakuraSceneStage(gs)).toBe('sakura_rain')
    gs.world.flags[SAKURA_FLAGS.domainEntered] = true
    expect(getSakuraSceneStage(gs)).toBe('domain')
    gs.world.flags[SAKURA_FLAGS.guest] = true
    expect(getSakuraSceneStage(gs)).toBe('guest')
    gs.world.flags[SAKURA_FLAGS.calamityDefeated] = true
    expect(getSakuraSceneStage(gs)).toBe('combat_done')
    gs.world.flags[SAKURA_FLAGS.contractAccepted] = true
    expect(getSakuraSceneStage(gs)).toBe('recruited')
  })

  it('拒绝契约后 → awaiting_contract（任务保持 in_progress）', () => {
    const gs = baseState()
    gs.world.flags[SAKURA_FLAGS.calamityDefeated] = true
    gs.world.flags[SAKURA_FLAGS.contractRejected] = true
    expect(isAwaitingContract(gs)).toBe(true)
  })
})

describe('TM-P2-004：场景动作 eligibility', () => {
  it('canEnterSakuraDomain：樱雨已触发 + 触发地点 + 未进入', () => {
    const gs = baseState()
    expect(canEnterSakuraDomain(gs)).toBe(false)
    gs.world.flags[SAKURA_FLAGS.encounterStarted] = true
    expect(canEnterSakuraDomain(gs)).toBe(true)
    gs.world.flags[SAKURA_FLAGS.domainEntered] = true
    expect(canEnterSakuraDomain(gs)).toBe(false)
  })

  it('canMeetSakura：已进入神域 + 未见过', () => {
    const gs = baseState()
    expect(canMeetSakura(gs)).toBe(false)
    gs.world.flags[SAKURA_FLAGS.domainEntered] = true
    expect(canMeetSakura(gs)).toBe(true)
    gs.world.flags[SAKURA_FLAGS.met] = true
    expect(canMeetSakura(gs)).toBe(false)
  })

  it('canMndCheckSakura：已初见 + 未尝试 + 未 guest（一次性持久化）', () => {
    const gs = baseState()
    gs.world.flags[SAKURA_FLAGS.met] = true
    expect(canMndCheckSakura(gs)).toBe(true)
    gs.world.flags[SAKURA_FLAGS.mndAttempted] = true
    expect(canMndCheckSakura(gs)).toBe(false)
  })

  it('canLuckRescueSakura：仅 MND 失败后可用一次；成功过不可用', () => {
    const gs = baseState()
    gs.world.flags[SAKURA_FLAGS.met] = true
    expect(canLuckRescueSakura(gs)).toBe(false) // MND 未尝试
    gs.world.flags[SAKURA_FLAGS.mndAttempted] = true
    gs.world.flags[SAKURA_FLAGS.mndSucceeded] = false
    expect(canLuckRescueSakura(gs)).toBe(true)
    gs.world.flags[SAKURA_FLAGS.luckUsed] = true
    expect(canLuckRescueSakura(gs)).toBe(false)
  })

  it('canOfferGuest：已初见 + 未 guest + 未击败残灾', () => {
    const gs = baseState()
    gs.world.flags[SAKURA_FLAGS.met] = true
    expect(canOfferGuest(gs)).toBe(true)
    gs.world.flags[SAKURA_FLAGS.guest] = true
    expect(canOfferGuest(gs)).toBe(false)
  })

  it('canFightCalamity：guest + 神域 + 未击败（残灾战斗入口守卫）', () => {
    const gs = baseState()
    gs.world.flags[SAKURA_FLAGS.guest] = true
    gs.world.currentLocationId = SAKURA_DOMAIN_LOCATION
    expect(canFightCalamity(gs)).toBe(true)
    gs.world.currentLocationId = 'tianlong_city'
    expect(canFightCalamity(gs)).toBe(false)
    gs.world.currentLocationId = SAKURA_DOMAIN_LOCATION
    gs.world.flags[SAKURA_FLAGS.calamityDefeated] = true
    expect(canFightCalamity(gs)).toBe(false)
  })

  it('契约 eligibility：击败后可提议；拒绝后可再议；接受后关闭', () => {
    const gs = baseState()
    expect(canOfferContract(gs)).toBe(false)
    gs.world.flags[SAKURA_FLAGS.calamityDefeated] = true
    expect(canOfferContract(gs)).toBe(true)
    expect(canAcceptContract(gs)).toBe(false) // 需先 offer
    gs.world.flags[SAKURA_FLAGS.contractOffered] = true
    expect(canAcceptContract(gs)).toBe(true)
    // 拒绝
    gs.world.flags[SAKURA_FLAGS.contractRejected] = true
    expect(canOfferContract(gs)).toBe(false)
    expect(canReofferContract(gs)).toBe(true)
    expect(canAcceptContract(gs)).toBe(true) // 再议后可接受
    // 接受后全部关闭
    gs.world.flags[SAKURA_FLAGS.contractAccepted] = true
    expect(canAcceptContract(gs)).toBe(false)
    expect(canReofferContract(gs)).toBe(false)
  })

  it('isFirstRestTalkReady：recruited + 第一次 Long Rest 后就绪 + 未谈过', () => {
    const gs = baseState()
    expect(isFirstRestTalkReady(gs)).toBe(false)
    gs.world.flags[SAKURA_FLAGS.contractAccepted] = true
    gs.world.flags[SAKURA_FLAGS.firstRestReady] = true
    expect(isFirstRestTalkReady(gs)).toBe(true)
    gs.world.flags[SAKURA_FLAGS.firstRestDone] = true
    expect(isFirstRestTalkReady(gs)).toBe(false)
  })

  it('canTriggerSakuraBanter：recruited + 天龙城 + 未看过', () => {
    const gs = baseState()
    expect(canTriggerSakuraBanter(gs)).toBe(false)
    gs.world.flags[SAKURA_FLAGS.contractAccepted] = true
    expect(canTriggerSakuraBanter(gs)).toBe(true)
    gs.world.flags[SAKURA_FLAGS.banterSeen] = true
    expect(canTriggerSakuraBanter(gs)).toBe(false)
  })
})
