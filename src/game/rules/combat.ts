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

/**
 * 玩家普通攻击伤害：基础伤害 + 武器伤害加成（TM-P0-013）。
 * weaponDamageBonus 允许 0 / 正整数，非法（负数/小数/NaN/Infinity）抛 RangeError。
 */
export function getPlayerAttackDamage(str: number, weaponDamageBonus = 0): number {
  if (!Number.isInteger(weaponDamageBonus) || weaponDamageBonus < 0 || !Number.isFinite(weaponDamageBonus)) {
    throw new RangeError('武器伤害加成必须是 0 或正整数')
  }
  const damage = getPlayerBasicDamage(str) + weaponDamageBonus
  if (!Number.isFinite(damage)) {
    throw new RangeError('攻击伤害溢出')
  }
  return damage
}

// ---- Phase 1：法师职业技能「法术攻击」（TM-P1-001）----

/** 法术攻击灵力消耗（唯一业务常量，CombatPage 与 Store 都读取它） */
export const MAGE_SPELL_MP_COST = 2

/** 法师法术攻击加值：MND 属性修正 + 熟练加值（复用已封板 d20 公式） */
export function getMageSpellAttackBonus(mnd: number, level: number): number {
  return getAttributeModifier(mnd) + getProficiencyBonus(level)
}

/** 法师法术伤害：max(1, 6 + MND 属性修正)（不吃 STR / 武器伤害加成） */
export function getMageSpellDamage(mnd: number): number {
  return Math.max(1, 6 + getAttributeModifier(mnd))
}

// ---- Phase 1：骑士职业技能「骑士重击」（TM-P1-006）----

/** 骑士重击灵力消耗（唯一业务常量，CombatPage 与 Store 都读取它） */
export const KNIGHT_POWER_STRIKE_MP_COST = 2

/**
 * 骑士重击伤害 = 普通攻击伤害 + 2（TM-P1-006）。
 * 复用封板 getPlayerAttackDamage（含 weaponDamageBonus 校验与溢出保护）；最终结果必须可安全结算，否则抛 RangeError。
 */
export function getKnightPowerStrikeDamage(str: number, weaponDamageBonus = 0): number {
  const damage = getPlayerAttackDamage(str, weaponDamageBonus) + 2
  if (!Number.isFinite(damage)) {
    throw new RangeError('骑士重击伤害溢出')
  }
  return damage
}

// ---- Phase 1：游侠职业技能「迅捷突袭」（TM-P1-007）----

/** 游侠迅捷突袭攻击加值：AGI 属性修正 + 熟练加值 + 2（复用已封板 d20 公式） */
export function getRangerSwiftStrikeAttackBonus(agi: number, level: number): number {
  return getAttributeModifier(agi) + getProficiencyBonus(level) + 2
}

/**
 * 游侠迅捷突袭伤害 = 以 AGI 为攻击属性的物理伤害 + 2（TM-P1-007）。
 * 刻意把 AGI 传给封板 getPlayerAttackDamage（普通攻击用 STR）；未新增通用「任意属性攻击」系统。
 */
export function getRangerSwiftStrikeDamage(agi: number, weaponDamageBonus = 0): number {
  const damage = getPlayerAttackDamage(agi, weaponDamageBonus) + 2
  if (!Number.isFinite(damage)) {
    throw new RangeError('迅捷突袭伤害溢出')
  }
  return damage
}

// ---- Phase 1：战士职业技能「压制猛击」（TM-P1-008）----

/** 压制猛击灵力消耗（唯一业务常量，CombatPage 与 Store 都读取它） */
export const WARRIOR_SUPPRESS_STRIKE_MP_COST = 2

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

// ---- 单回合战斗阶段辅助（TM-P0-008-R1：确定性可测）----

export type CombatPhase = 'active' | 'victory' | 'defeat'

export interface PlayerStrikeResolution {
  enemyHp: number
  phase: 'active' | 'victory'
  /** 玩家攻击后敌人是否应进行反击 */
  enemyShouldCounter: boolean
}

/** 玩家一击后的战斗阶段结算：致死攻击 → victory 且不反击；未命中 → 敌人回合继续 */
export function resolvePlayerStrike(enemyCurrentHp: number, attack: AttackResult): PlayerStrikeResolution {
  if (!attack.hit) {
    return { enemyHp: enemyCurrentHp, phase: 'active', enemyShouldCounter: true }
  }
  const enemyHp = Math.max(0, enemyCurrentHp - attack.damage)
  if (enemyHp === 0) {
    return { enemyHp, phase: 'victory', enemyShouldCounter: false }
  }
  return { enemyHp, phase: 'active', enemyShouldCounter: true }
}

/** 敌人反击后玩家战斗阶段：HP 归零 → defeat */
export function getCombatPhaseAfterEnemyAttack(playerHp: number): 'active' | 'defeat' {
  return playerHp === 0 ? 'defeat' : 'active'
}
