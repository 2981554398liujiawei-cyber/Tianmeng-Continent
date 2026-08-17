/**
 * D20 核心检定规则（TM-P0-003）。
 *
 * 检定模型：D20 + 属性修正 + 熟练加值(仅熟练时) + 情境修正 vs DC。
 * 本模块只实现通用检定，不涉及战斗/任务/NPC 判定等具体玩法。
 */

/** 标准 DC（统一开发语义） */
export const CHECK_DC = {
  easy: 8, // 简单
  normal: 10, // 普通
  moderate: 12, // 中等
  hard: 15, // 困难
  severe: 18, // 极难
} as const

/** 属性修正：floor((score - 10) / 2) */
export function getAttributeModifier(score: number): number {
  if (!Number.isInteger(score) || score < 0) {
    throw new RangeError('属性值必须是非负整数')
  }
  return Math.floor((score - 10) / 2)
}

/** 熟练加值（等级 1–20） */
export function getProficiencyBonus(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError('等级必须在 1–20 之间')
  }
  return Math.floor((level - 1) / 4) + 2
}

export interface D20CheckInput {
  /** 用于检定的属性值 */
  attributeScore: number
  /** 角色等级（决定熟练加值） */
  level: number
  /** 目标难度 */
  dc: number
  /** 是否熟练（默认 false） */
  proficient?: boolean
  /** 情境修正（默认 0） */
  situationalModifier?: number
}

export type CheckOutcome = 'critical_success' | 'success' | 'failure' | 'critical_failure'

export interface D20CheckResult {
  roll: number
  attributeModifier: number
  proficiencyBonus: number
  situationalModifier: number
  total: number
  dc: number
  success: boolean
  outcome: CheckOutcome
}

/** 掷 D20：始终返回 1–20 整数 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1
}

function validateInput(input: D20CheckInput): void {
  const { attributeScore, level, dc, situationalModifier = 0 } = input
  if (!Number.isInteger(attributeScore) || attributeScore < 0) {
    throw new RangeError('属性值必须是非负整数')
  }
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError('等级必须在 1–20 之间')
  }
  if (!Number.isInteger(dc) || dc < 0) {
    throw new RangeError('DC 必须是非负整数')
  }
  if (!Number.isInteger(situationalModifier)) {
    throw new RangeError('情境修正必须是整数')
  }
}

/**
 * 确定性结算（测试入口）：使用指定骰面计算检定结果。
 * 骰面必须是 1–20 整数，非法值抛 RangeError。
 */
export function resolveD20Check(input: D20CheckInput, roll: number): D20CheckResult {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new RangeError('骰面必须是 1–20 之间的整数')
  }
  validateInput(input)

  const attributeModifier = getAttributeModifier(input.attributeScore)
  const proficiencyBonus = input.proficient ? getProficiencyBonus(input.level) : 0
  const situationalModifier = input.situationalModifier ?? 0
  const total = roll + attributeModifier + proficiencyBonus + situationalModifier

  let outcome: CheckOutcome
  if (roll === 20) {
    outcome = 'critical_success' // 天然 20：无视 total 直接大成功
  } else if (roll === 1) {
    outcome = 'critical_failure' // 天然 1：无视 total 直接大失败
  } else {
    outcome = total >= input.dc ? 'success' : 'failure'
  }

  return {
    roll,
    attributeModifier,
    proficiencyBonus,
    situationalModifier,
    total,
    dc: input.dc,
    success: outcome === 'critical_success' || outcome === 'success',
    outcome,
  }
}

/** 运行时入口：真实掷骰并结算 */
export function performD20Check(input: D20CheckInput): D20CheckResult {
  return resolveD20Check(input, rollD20())
}
