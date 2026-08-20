/**
 * 樱花优子剧情规则集中（TM-P2-004 第 31/127 节）。
 * 负责：触发条件 / 场景阶段（scene stage）/ 契约资格。
 *  - 纯函数：不读 Store、不写 Store、不随机；所有持久状态由 world.flags 派生。
 *  - GamePage/面板只消费这些规则，禁止在页面里写几十行 Sakura 判断。
 */
import type { GameState } from '../types/game'
import { getQuest } from '../content'
import { isCompanionPresent } from './relationship'

/** 樱华神域事件地点 */
export const SAKURA_DOMAIN_LOCATION = 'sakura_domain_fragment'
/** 触发地点白名单（TM-P2-004 第 32 节） */
export const SAKURA_TRIGGER_LOCATIONS = ['tianlong_city', 'tianlong_martial_hall'] as const

/** 残灾之影敌人 ID（TM-P2-004 第 40 节） */
export const SAKURA_CALAMITY_ENEMY_ID = 'sakura_calamity_fragment'

// ---- 场景持久 flag 常量（唯一来源；Store/面板共用，禁止散落字符串） ----
export const SAKURA_FLAGS = {
  encounterStarted: 'sakura_encounter_started',
  domainEntered: 'sakura_domain_entered',
  met: 'sakura_met',
  mndAttempted: 'sakura_mnd_attempted',
  mndSucceeded: 'sakura_mnd_succeeded',
  luckUsed: 'sakura_luck_used',
  guest: 'sakura_guest',
  calamityDefeated: 'sakura_calamity_defeated',
  contractOffered: 'sakura_contract_offered',
  contractRejected: 'sakura_contract_rejected',
  contractAccepted: 'sakura_contract_accepted',
  firstRestReady: 'sakura_first_rest_ready',
  firstRestDone: 'sakura_first_rest_done',
  banterSeen: 'sakura_banter_seen',
} as const

/** 场景检定 DC（TM-P2-004 第 25/26 节） */
export const SAKURA_MND_DC = 12
export const SAKURA_LUCK_DC = 12

/** 场景阶段（由 flags 派生；UI 按阶段渲染对应面板） */
export type SakuraSceneStage =
  | 'hidden' // 未触发
  | 'sakura_rain' // 反季樱雨已出现（可调查/暂不管）
  | 'domain' // 已进入神域（含 MND/LUCK 检定 + 初见对话）
  | 'guest' // 临时合作（残灾战斗前）
  | 'combat_done' // 残灾击败（神域崩塌 → 契约提议）
  | 'awaiting_contract' // 拒绝契约后等待再次提议
  | 'recruited' // 神契完成

/** 当前场景阶段（纯函数；world.flags 派生） */
export function getSakuraSceneStage(gameState: GameState): SakuraSceneStage {
  const f = gameState.world.flags
  if (f[SAKURA_FLAGS.contractAccepted] === true) return 'recruited'
  if (f[SAKURA_FLAGS.calamityDefeated] === true) return 'combat_done'
  if (f[SAKURA_FLAGS.guest] === true) return 'guest'
  if (f[SAKURA_FLAGS.domainEntered] === true) return 'domain'
  if (f[SAKURA_FLAGS.encounterStarted] === true) return 'sakura_rain'
  return 'hidden'
}

/** 拒绝契约后的再议状态：sakura_rain/domain 阶段但已拒绝 → awaiting_contract（任务保持 in_progress） */
export function isAwaitingContract(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.contractRejected] === true && f[SAKURA_FLAGS.contractAccepted] !== true
}

// ---- 触发条件（TM-P2-004 第 29/30/31 节）----

/**
 * 是否可触发反季樱雨（Sakura 事件）。
 * 规则：
 *  1. 当前在天龙城或武馆（TM-P2-004 第 32 节）；
 *  2. 尚未触发过（sakura_encounter_started 非 true；一次性，不可重复刷）；
 *  3. 满足任一触发路径：
 *     a. 正常路径：player.level >= 8（Lv8–12 天龙城阶段；本卡等级只有 Lv2，规则先行）；
 *     b. 压缩剧情 fallback（TM-P2-004 第 30 节）：已完成 Phase 2 官方末端里程碑《北门失联》completed——
 *        直接读取现有正式完成状态，不新造 phase2_done_again / sakura_phase2_override 重复 flag；
 *     c. Lv14 兜底（TM-P2-004 第 81 节）：level >= 14 且尚未 recruited（强制剧情再次出现，但绝不强迫接受）。
 */
export function canTriggerSakuraEncounter(gameState: GameState): boolean {
  const location = gameState.world.currentLocationId
  if (!(SAKURA_TRIGGER_LOCATIONS as readonly string[]).includes(location)) return false
  const recruited = gameState.companions[SAKURA_COMPANION_ID_REF]?.status === 'recruited'
  // 已正式入队 → 不再触发（Lv14 兜底的前提是「尚未 recruited」；TM-P2-004 第 81 节）
  if (recruited) return false
  // Lv14 兜底：尚未 recruited 时，下一次合法机会必须再次强提醒/进入契约解决
  // （强制的是「剧情再次出现」，绝不强迫接受；当前无 Lv14 内容，规则先行）
  if (gameState.player.level >= 14) return true
  if (gameState.world.flags[SAKURA_FLAGS.encounterStarted] === true) return false
  const northGate = gameState.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
  const phase2Completed = northGate?.status === 'completed'
  if (phase2Completed) return true
  return gameState.player.level >= 8
}

/** 内部引用（避免循环 import；与 content 的 SAKURA_COMPANION_ID 一致） */
const SAKURA_COMPANION_ID_REF = 'sakura_yuko'

/** 是否为 Sakura 触发/事件地点（面板显示樱雨提示用） */
export function isSakuraTriggerLocation(locationId: string): boolean {
  return (SAKURA_TRIGGER_LOCATIONS as readonly string[]).includes(locationId)
}

// ---- 场景动作前置（供 Store 使用；避免 Store 内堆长 if）----

/** 可进入神域：樱雨已触发 + 在天龙城/武馆 + 未进入过 */
export function canEnterSakuraDomain(gameState: GameState): boolean {
  const f = gameState.world.flags
  if (f[SAKURA_FLAGS.encounterStarted] !== true) return false
  if (f[SAKURA_FLAGS.domainEntered] === true) return false
  return isSakuraTriggerLocation(gameState.world.currentLocationId)
}

/** 可初见对话：已进入神域 + 未见过 */
export function canMeetSakura(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.domainEntered] === true && f[SAKURA_FLAGS.met] !== true
}

/** 可 MND 检定：已初见 + 未尝试过 + 未进入 guest */
export function canMndCheckSakura(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.met] === true && f[SAKURA_FLAGS.mndAttempted] !== true && f[SAKURA_FLAGS.guest] !== true
}

/** 可 LUCK 命运补救：MND 已失败 + 未使用过 + 未进入 guest */
export function canLuckRescueSakura(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.mndAttempted] === true && f[SAKURA_FLAGS.mndSucceeded] !== true && f[SAKURA_FLAGS.luckUsed] !== true && f[SAKURA_FLAGS.guest] !== true
}

/** 可提议临时合作（进入 guest）：已初见 + 未 guest + 未击败残灾 */
export function canOfferGuest(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.met] === true && f[SAKURA_FLAGS.guest] !== true && f[SAKURA_FLAGS.calamityDefeated] !== true
}

/** 可挑战残灾之影（战斗入口守卫；与 encounter.ts 联动）：guest 状态 + 在神域 + 未击败 */
export function canFightCalamity(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.guest] === true && f[SAKURA_FLAGS.calamityDefeated] !== true && gameState.world.currentLocationId === SAKURA_DOMAIN_LOCATION
}

/** 可提议契约：残灾已击败 + 未接受 + 未拒绝过（拒绝后走 reoffer） */
export function canOfferContract(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.calamityDefeated] === true && f[SAKURA_FLAGS.contractAccepted] !== true && f[SAKURA_FLAGS.contractRejected] !== true
}

/** 拒绝后可再次提议（TM-P2-004 第 80 节）：下次 Long Rest / 天龙城安全场景可再谈 */
export function canReofferContract(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.calamityDefeated] === true && f[SAKURA_FLAGS.contractAccepted] !== true && f[SAKURA_FLAGS.contractRejected] === true
}

/** 可接受契约：已提议（或可再议）且未接受 */
export function canAcceptContract(gameState: GameState): boolean {
  const f = gameState.world.flags
  if (f[SAKURA_FLAGS.contractAccepted] === true) return false
  return f[SAKURA_FLAGS.contractOffered] === true || f[SAKURA_FLAGS.contractRejected] === true
}

/** 首次休整谈话是否就绪（recruited + 第一次 Long Rest 后 + 未谈过） */
export function isFirstRestTalkReady(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.contractAccepted] === true && f[SAKURA_FLAGS.firstRestReady] === true && f[SAKURA_FLAGS.firstRestDone] !== true
}

/** 天龙城 banter 是否可触发（recruited + 在天龙城 + 未看过） */
export function canTriggerSakuraBanter(gameState: GameState): boolean {
  const f = gameState.world.flags
  return f[SAKURA_FLAGS.contractAccepted] === true && f[SAKURA_FLAGS.banterSeen] !== true && gameState.world.currentLocationId === 'tianlong_city'
}

/** Sakura 是否在场（响应场景关系变化；TM-P2-004 第 21/22 节 presence） */
export function isSakuraPresent(gameState: GameState): boolean {
  return isCompanionPresent(gameState.companions, gameState.party, SAKURA_COMPANION_ID_REF)
}

/** 《落樱越界》任务状态是否 in_progress（拒绝契约后保持；TM-P2-004 第 118 节） */
export function isSakuraBoundaryQuestInProgress(gameState: GameState): boolean {
  return getQuest('quest_sakura_boundary') !== undefined && gameState.quests.some((q) => q.questId === 'quest_sakura_boundary' && q.status === 'in_progress')
}
