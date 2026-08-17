/**
 * 最小战斗规则内核（TM-P0-007）。
 * 只输出规则计算结果，不修改任何 GameState / 敌人注册数据 / 玩家 HP。
 */
import { getAttributeModifier, getProficiencyBonus, rollD20 } from './d20'

/** 玩家防御：10 + AGI 属性修正（复用已封板 getAttributeModifier） */
export function getPlayerDefense(agi: number): number {
  return 10 + getAttributeModifier(agi)
}

/** 玩家普通攻击加值：STR 属性修正 + 熟练加值 */
export function getPlayerAttackBonus(str: number, level: number): number {
  return getAttributeModifier(str) + getProficiencyBonus(level)
}

/** 玩家普通攻击基础伤害：max(1, 4 + STR 属性修正) */
export function getPlayerBasicDamage(str: number): number {
  return Math.max(1, 4 + getAttributeModifier(str))
}

export type AttackOutcome = 'critical_hit' | 'hit' | 'miss' | 'critical_miss'

export interface AttackResult {
  roll: number
  attackBonus: number
  total: number
  defense: number
  hit: boolean
  critical: boolean
  damage: number
  outcome: AttackOutcome
}

/** 确定性攻击结算（测试入口）：骰面必须为 1–20 整数 */
export function resolveAttack(
  roll: number,
  attackBonus: number,
  defense: number,
  baseDamage: number,
): AttackResult {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new RangeError('骰面必须是 1–20 之间的整数')
  }
  if (!Number.isInteger(attackBonus)) {
    throw new RangeError('攻击加值必须是有限整数')
  }
  if (!Number.isInteger(defense) || defense < 0) {
    throw new RangeError('防御必须是非负整数')
  }
  if (!Number.isInteger(baseDamage) || baseDamage < 1 || !Number.isFinite(baseDamage * 2)) {
    throw new RangeError('基础伤害必须是可安全结算暴击的正整数')
  }

  const total = roll + attackBonus
  // 最小防线：正常返回的所有数值必须有限（TM-P0-007-R1）
  if (!Number.isFinite(total)) {
    throw new RangeError('攻击结算结果溢出')
  }

  // 天然 20：必定暴击命中，伤害双倍，无视 total
  if (roll === 20) {
    const criticalDamage = baseDamage * 2
    if (!Number.isFinite(criticalDamage)) {
      throw new RangeError('暴击伤害溢出')
    }
    return {
      roll,
      attackBonus,
      total,
      defense,
      hit: true,
      critical: true,
      damage: criticalDamage,
      outcome: 'critical_hit',
    }
  }
  // 天然 1：必定大失败，伤害 0，无视 total
  if (roll === 1) {
    return {
      roll,
      attackBonus,
      total,
      defense,
      hit: false,
      critical: false,
      damage: 0,
      outcome: 'critical_miss',
    }
  }
  if (total >= defense) {
    return {
      roll,
      attackBonus,
      total,
      defense,
      hit: true,
      critical: false,
      damage: baseDamage,
      outcome: 'hit',
    }
  }
  return {
    roll,
    attackBonus,
    total,
    defense,
    hit: false,
    critical: false,
    damage: 0,
    outcome: 'miss',
  }
}

/** 随机攻击入口：复用现有 rollD20，不实现第二个 D20 函数 */
export function performAttack(attackBonus: number, defense: number, baseDamage: number): AttackResult {
  return resolveAttack(rollD20(), attackBonus, defense, baseDamage)
}
