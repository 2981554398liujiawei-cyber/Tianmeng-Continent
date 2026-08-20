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
 * 已学习技能（learnedSkillIds → Registry 动态解析；未知/损坏/职业不匹配安全忽略）。
 * 供战斗页与场景共用（TM-P2-003-R1 C：Store 也用同款语义校验）。
 */
export function getUsableSkills(learnedSkillIds: readonly string[] | undefined, profession: ProfessionId): SkillDefinition[] {
  return (learnedSkillIds ?? [])
    .map((id) => getSkill(id))
    .filter((s): s is SkillDefinition => s !== undefined && s.profession === profession)
}

/** 是否已学习某技能（Store/UI 共用；TM-P2-003-R1 C） */
export function hasLearnedSkill(learnedSkillIds: readonly string[] | undefined, skillId: string): boolean {
  return (learnedSkillIds ?? []).includes(skillId)
}
