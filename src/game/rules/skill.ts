/**
 * 技能执行规则（TM-P2-003-R1 B / TM-P2-003-R2 B1：把伤害 resolver / MP cost / once-per-combat / 压制
 * 从页面与 Store 剥离，集中在此）。
 *
 * TM-P2-003-R2 B1：伤害结算不再按具体 skillId 分发——rules 只识别
 * `SkillDefinition.combat.damageResolver.type`（magic_spell / attack_power / agility_power）。
 * 未来新增技能只需在注册表声明 resolver + bonus，无需修改本文件。
 */
import { getSkill } from '../content/skills'
import {
  getMageSpellDamage,
  getPlayerAttackPower,
  getPlayerLevelDamageBonus,
} from './combat'
import type { SkillDefinition } from '../types/skill'
import type { ProfessionId } from '../types'

/** 技能伤害计算所需的玩家上下文（由调用方从 gameState 提取） */
export interface SkillDamageContext {
  str: number
  agi: number
  mnd: number
  weaponDamageBonus: number
  level: number
}

/** 技能执行所需元数据（从注册表读取；未知技能返回 null） */
export interface SkillExecutionInfo {
  skill: SkillDefinition
  /** 灵力消耗（0 = 不消耗） */
  mpCost: number
  /** 每场战斗仅一次 */
  oncePerCombat: boolean
  /** 正常命中/暴击压制本次反击（擦伤不压制） */
  suppressCounterOnFullHit: boolean
}

/** 未知/损坏技能 → null（调用方安全忽略） */
export function getSkillExecutionInfo(skillId: string): SkillExecutionInfo | null {
  const skill = getSkill(skillId)
  if (!skill) return null
  return {
    skill,
    mpCost: skill.mpCost,
    oncePerCombat: skill.combat?.oncePerCombat === true,
    suppressCounterOnFullHit: skill.combat?.suppressCounterOnFullHit === true,
  }
}

/** 技能灵力消耗（未知技能按 0 处理——但调用方应先 getSkillExecutionInfo 判空） */
export function skillMpCost(skillId: string): number {
  return getSkill(skillId)?.mpCost ?? 0
}

/** 每场一次？（未知技能 false） */
export function isOncePerCombatSkill(skillId: string): boolean {
  return getSkill(skillId)?.combat?.oncePerCombat === true
}

/** 正常命中/暴击压制反击？（未知技能 false） */
export function isSuppressOnFullHitSkill(skillId: string): boolean {
  return getSkill(skillId)?.combat?.suppressCounterOnFullHit === true
}

// ---- TM-P2-003-R2 B2：每场一次技能按 skillId 独立追踪（Set 语义） ----

/** 该技能本场是否已使用（未知/非 once 技能恒 false） */
export function isOncePerCombatUsed(used: ReadonlySet<string>, skillId: string): boolean {
  return used.has(skillId)
}

/** 标记技能本场已使用（返回新 Set，不修改原 Set） */
export function markOncePerCombatUsed(used: ReadonlySet<string>, skillId: string): Set<string> {
  const next = new Set(used)
  next.add(skillId)
  return next
}

/**
 * 技能原始伤害（V3 命中/护甲结算由 combat.ts 负责；本函数只算 rawDamage）。
 * 未知技能 / 无 damageResolver → null（调用方拒绝执行）。
 *
 * 分派仅基于 resolver.type（TM-P2-003-R2 B1）：
 * - magic_spell：max(1, 6 + MND修正) + 等级伤害加成
 * - attack_power：玩家攻击力（STR）+ bonus（骑士重击 +2 / 压制 +1）
 * - agility_power：玩家攻击力（AGI）+ bonus（迅捷突袭 +2）
 */
export function resolveSkillRawDamage(skillId: string, ctx: SkillDamageContext): number | null {
  const skill = getSkill(skillId)
  if (!skill) return null
  const resolver = skill.combat?.damageResolver
  if (!resolver) return null
  switch (resolver.type) {
    case 'magic_spell':
      return getMageSpellDamage(ctx.mnd) + getPlayerLevelDamageBonus(ctx.level)
    case 'attack_power':
      return getPlayerAttackPower(ctx.str, ctx.weaponDamageBonus, ctx.level) + (resolver.bonus ?? 0)
    case 'agility_power':
      return getPlayerAttackPower(ctx.agi, ctx.weaponDamageBonus, ctx.level) + (resolver.bonus ?? 0)
    default:
      return null
  }
}

/**
 * 已学习技能（learnedSkillIds → Registry 动态解析）。
 * R3 统一语义：
 *  - 未知/损坏 ID 安全忽略
 *  - 重复 ID 去重（保留首次出现顺序，避免重复技能按钮 / React duplicate key）
 *  - 职业兼容：skill.profession === undefined（通用技能）或 === profession 才保留
 * 供战斗页与场景共用（TM-P2-003-R1 C：Store 也用同款语义校验）。
 */
export function getUsableSkills(learnedSkillIds: readonly string[] | undefined, profession?: ProfessionId): SkillDefinition[] {
  const seen = new Set<string>()
  const result: SkillDefinition[] = []
  for (const id of learnedSkillIds ?? []) {
    if (seen.has(id)) continue
    seen.add(id)
    const skill = getSkill(id)
    if (!skill) continue
    if (skill.profession !== undefined && skill.profession !== profession) continue
    result.push(skill)
  }
  return result
}

/** 是否已学习某技能（Store/UI 共用；TM-P2-003-R1 C） */
export function hasLearnedSkill(learnedSkillIds: readonly string[] | undefined, skillId: string): boolean {
  return (learnedSkillIds ?? []).includes(skillId)
}

// ---- TM-P2-003-R3 C：统一技能「可使用性」纯校验（战斗 / 场景共用唯一规则） ----

/** 技能使用被阻断的原因（R3 统一；纯函数返回，不读 Store、不写 Store） */
export type SkillUseBlockReason =
  | 'unknown_skill'
  | 'not_learned'
  | 'profession_mismatch'
  | 'invalid_max_mp'
  | 'invalid_mp'
  | 'invalid_cost'
  | 'insufficient_mp'

/** 技能使用校验所需 actor 上下文（调用方从 gameState 提取）。
 *  TM-P2-004 第 46 节：profession 可选——伙伴无职业（undefined），
 *  语义：skill 有 profession + actor 无 profession → profession_mismatch；skill 无 profession → 玩家/伙伴均可。 */
export interface SkillUseContext {
  learnedSkillIds?: readonly string[]
  profession?: ProfessionId
  mp: number
  maxMp: number
}

/** 技能使用校验结果：allowed 时附带 skill 与 mpCost，调用方直接使用 */
export interface SkillUseCheck {
  allowed: boolean
  reason?: SkillUseBlockReason
  skill?: SkillDefinition
  mpCost?: number
}

/**
 * 统一技能使用校验（TM-P2-003-R3 C2/C3）。
 * 纯函数：不读 Store、不写 Store、不 roll、不写 world.flags。
 * 检查顺序（任一失败即返回，允许时附 skill/mpCost）：
 *  1. 技能 ID 是否存在（unknown_skill）
 *  2. 是否已学习（not_learned）
 *  3. 职业是否兼容（profession_mismatch；profession === undefined 为通用技能，人人可用）
 *  4. maxMp 是否安全整数且 >= 0（invalid_max_mp）
 *  5. mp 是否安全整数且 ∈ [0, maxMp]（invalid_mp）
 *  6. mpCost 是否安全整数且 >= 0（invalid_cost）
 *  7. mp 是否足够（insufficient_mp）
 */
export function checkSkillUse(skillId: string, ctx: SkillUseContext): SkillUseCheck {
  const skill = getSkill(skillId)
  if (!skill) return { allowed: false, reason: 'unknown_skill' }
  if (!hasLearnedSkill(ctx.learnedSkillIds, skillId)) {
    return { allowed: false, reason: 'not_learned', skill, mpCost: skill.mpCost }
  }
  if (skill.profession !== undefined && skill.profession !== ctx.profession) {
    return { allowed: false, reason: 'profession_mismatch', skill, mpCost: skill.mpCost }
  }
  if (!Number.isSafeInteger(ctx.maxMp) || ctx.maxMp < 0) {
    return { allowed: false, reason: 'invalid_max_mp', skill, mpCost: skill.mpCost }
  }
  if (!Number.isSafeInteger(ctx.mp) || ctx.mp < 0 || ctx.mp > ctx.maxMp) {
    return { allowed: false, reason: 'invalid_mp', skill, mpCost: skill.mpCost }
  }
  const cost = skill.mpCost
  if (!Number.isSafeInteger(cost) || cost < 0) {
    return { allowed: false, reason: 'invalid_cost', skill, mpCost: cost }
  }
  if (ctx.mp < cost) {
    return { allowed: false, reason: 'insufficient_mp', skill, mpCost: cost }
  }
  return { allowed: true, skill, mpCost: cost }
}
