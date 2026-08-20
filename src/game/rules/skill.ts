/**
 * 技能执行规则（TM-P2-003-R1 B：把伤害 resolver / MP cost / once-per-combat / 压制
 * 从页面与 Store 剥离，集中在此；CombatPage 只做「学过的技能 → 执行」）。
 * 伤害公式按技能类型分派，但调用方不再硬编码 skillId 分支。
 */
import { getSkill, getSkill as lookupSkill } from '../content/skills'
import {
  getKnightPowerStrikeDamage,
  getMageSpellDamage,
  getPlayerAttackPower,
  getRangerSwiftStrikeDamage,
  getWarriorSuppressStrikeDamage,
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

/**
 * 技能原始伤害（V3 命中/护甲结算由 combat.ts 负责；本函数只算 rawDamage）。
 * 未知技能 → null（调用方拒绝执行）。
 * 法术：max(1, 6 + MND修正) + 等级加成
 * 骑士重击：玩家攻击力 + 2
 * 迅捷突袭：AGI 物理 + 2
 * 压制猛击：玩家攻击力 + 1
 */
export function resolveSkillRawDamage(skillId: string, ctx: SkillDamageContext): number | null {
  const skill = lookupSkill(skillId)
  if (!skill) return null
  switch (skillId) {
    case 'mage_spell':
      return getMageSpellDamage(ctx.mnd) + Math.floor((ctx.level - 1) / 2)
    case 'knight_power_strike':
      return getKnightPowerStrikeDamage(ctx.str, ctx.weaponDamageBonus, ctx.level)
    case 'ranger_swift_strike':
      return getRangerSwiftStrikeDamage(ctx.agi, ctx.weaponDamageBonus, ctx.level)
    case 'warrior_suppress_strike':
      return getWarriorSuppressStrikeDamage(ctx.str, ctx.weaponDamageBonus, ctx.level)
    default:
      // 未知技能（不在注册表 combat 分派内）→ 拒绝执行
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
