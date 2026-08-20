/**
 * 关系系统纯规则（TM-P2-004 第 15/16/20/21/64/68-71 节）。
 *  - 纯函数：不读 Store、不写 Store、无副作用。
 *  - affection/trust ∈ [0,100]，delta 必须有限整数，最终 clamp；NaN/Infinity/非整数拒绝。
 *  - stage 由数值 + 显式关系 flag（romance_started / committed）决定；romance/committed 必须显式解锁。
 *  - personalQuestStage 不参与 stage 判定（TM-P2-004 第 17 节：不是恋爱门槛）。
 *  - presence 原则（TM-P2-004 第 21/22 节）：场景关系变化只作用于「在场/被告知」的角色；
 *    规则层提供 isCompanionPresent，调用方（Store/场景）负责只对在场者应用。
 */
import type { RelationshipState, RelationshipStage } from '../types/relationship'

export const AFFECTION_MIN = 0
export const AFFECTION_MAX = 100
export const TRUST_MIN = 0
export const TRUST_MAX = 100

/** 基础认识阈值（初始关系 5/5 即 acquaintance） */
export const ACQUAINTANCE_THRESHOLD = 5
export const TRUSTED_AFFECTION = 30
export const TRUSTED_TRUST = 25
export const CLOSE_AFFECTION = 50
export const CLOSE_TRUST = 40

/** 普通交谈每休整周期基础好感收益（TM-P2-004 第 63 节） */
export const TALK_AFFECTION_GAIN = 1
/** 每休整周期可正常获得基础关系收益的交谈次数上限（TM-P2-004 第 64 节） */
export const TALKS_PER_REST_LIMIT = 2

/** 初始化关系状态（TM-P2-004 第 18 节：初次正式交谈时初始化，默认 5/5 acquaintance，不初遇即高好感） */
export function createInitialRelationship(npcId: string): RelationshipState {
  return {
    npcId,
    affection: ACQUAINTANCE_THRESHOLD,
    trust: ACQUAINTANCE_THRESHOLD,
    stage: 'acquaintance',
    personalQuestStage: 0,
    flags: {},
  }
}

/** delta 必须是有限整数（NaN/Infinity/小数拒绝） */
function assertDelta(value: number, label: string): void {
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    throw new RangeError(`${label} 变化量必须为有限整数`)
  }
}

/** clamp 到 [0,100]（TM-P2-004 第 15 节：不得溢出 -12/127） */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** 阶段判定（TM-P2-004 第 16 节）：romance/committed 必须显式事件解锁；数值档位在显式 flag 之后判断 */
export function stageOf(rel: RelationshipState): RelationshipStage {
  if (rel.flags.committed === true) return 'committed'
  if (rel.flags.romance_started === true) return 'romance'
  if (rel.affection >= CLOSE_AFFECTION && rel.trust >= CLOSE_TRUST) return 'close'
  if (rel.affection >= TRUSTED_AFFECTION && rel.trust >= TRUSTED_TRUST) return 'trusted'
  if (rel.affection >= ACQUAINTANCE_THRESHOLD || rel.trust >= ACQUAINTANCE_THRESHOLD) return 'acquaintance'
  return 'stranger'
}

/** 应用关系变化（delta clamp 后重算 stage）；返回新 RelationshipState（原对象不变） */
export function applyRelationshipDelta(
  rel: RelationshipState,
  delta: { affection?: number; trust?: number },
): RelationshipState {
  const affectionDelta = delta.affection ?? 0
  const trustDelta = delta.trust ?? 0
  if (affectionDelta !== 0) assertDelta(affectionDelta, '好感')
  if (trustDelta !== 0) assertDelta(trustDelta, '信任')
  const next: RelationshipState = {
    ...rel,
    affection: clamp(rel.affection + affectionDelta, AFFECTION_MIN, AFFECTION_MAX),
    trust: clamp(rel.trust + trustDelta, TRUST_MIN, TRUST_MAX),
  }
  return { ...next, stage: stageOf(next) }
}

// ---- TM-P2-004 第 21/22 节：presence（在场/被告知）----

/** 角色当前是否在场（可响应场景关系变化）：guest/recruited 且 active */
export function isCompanionPresent(
  companions: Record<string, { status: string }>,
  party: { activeCompanionIds: string[] },
  companionId: string,
): boolean {
  const companion = companions[companionId]
  if (!companion) return false
  if (companion.status !== 'guest' && companion.status !== 'recruited') return false
  return party.activeCompanionIds.includes(companionId)
}

// ---- TM-P2-004 第 64 节：交谈周期 ----

/** 本休整周期是否还能正常获得基础交谈收益 */
export function canTalkGain(rel: RelationshipState): boolean {
  const talks = rel.flags.talksThisRest
  if (typeof talks !== 'number' || !Number.isInteger(talks) || talks < 0) return true
  return talks < TALKS_PER_REST_LIMIT
}

/** 记录一次正常交谈（talksThisRest + 1；返回新 state） */
export function markTalk(rel: RelationshipState): RelationshipState {
  const current = typeof rel.flags.talksThisRest === 'number' && Number.isInteger(rel.flags.talksThisRest) ? rel.flags.talksThisRest : 0
  return { ...rel, flags: { ...rel.flags, talksThisRest: current + 1 } }
}

// ---- TM-P2-004 第 71 节：礼物周期 ----

/** 本休整周期是否已收过礼物（同周期继续赠送应拒绝且不消耗物品） */
export function hasGiftedThisRest(rel: RelationshipState): boolean {
  return rel.flags.giftedThisRest === true
}

/** 标记已收礼（返回新 state） */
export function markGifted(rel: RelationshipState): RelationshipState {
  return { ...rel, flags: { ...rel.flags, giftedThisRest: true } }
}

// ---- TM-P2-004 第 69/70 节：礼物好感规则 ----

/** 礼物好感收益：普通 +1 / 喜欢（giftTags 命中 likedGiftTags）+2 / 非常契合（favoriteItemIds）+4；不加信任 */
export function giftAffectionGain(
  profile: { likedGiftTags: string[]; favoriteItemIds: string[] } | undefined,
  item: { id: string; giftTags?: string[] },
): number {
  if (!profile) return 1
  if (profile.favoriteItemIds.includes(item.id)) return 4
  const tags = item.giftTags ?? []
  if (tags.some((tag) => profile.likedGiftTags.includes(tag))) return 2
  return 1
}

// ---- TM-P2-004 第 15 节：安全判定辅助 ----

/** 关系状态数值是否安全（防 NaN/Infinity/越界/非整数写入存档） */
export function isRelationshipStateSafe(rel: RelationshipState): boolean {
  return (
    Number.isInteger(rel.affection) &&
    Number.isFinite(rel.affection) &&
    rel.affection >= AFFECTION_MIN &&
    rel.affection <= AFFECTION_MAX &&
    Number.isInteger(rel.trust) &&
    Number.isFinite(rel.trust) &&
    rel.trust >= TRUST_MIN &&
    rel.trust <= TRUST_MAX &&
    Number.isInteger(rel.personalQuestStage) &&
    rel.personalQuestStage >= 0
  )
}
