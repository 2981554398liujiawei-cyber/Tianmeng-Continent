/**
 * 逃跑系统 V1（TM-P2-006 第 31–35 节）。
 *
 * 公式（严格按任务卡要求）：
 *   escapeScore = (highestPartyAgility + d20) / 3
 *   成功条件：escapeScore >= highestEnemyAgility
 *
 * highestPartyAgility：当前参与战斗的玩家 + active combat companion 的最高敏捷。
 * highestEnemyAgility：当前敌人（未来多敌人取最高）。
 *
 * 纯函数：不修改 GameState、不掷随机数（骰面由调用方提供）。
 * D20 范围 1–20；自然 1 / 自然 20 本阶段不增加额外规则，按公式正常处理。
 */
import { rollD20 } from './d20'

export interface EscapeResult {
  /** 逃跑检定值（(最高敏捷 + D20) / 3；可能为小数） */
  score: number
  /** 敌方最高敏捷 */
  enemyAgility: number
  /** 本次骰面（1–20） */
  roll: number
  /** 是否成功（score >= enemyAgility） */
  success: boolean
}

/** 计算队伍最高敏捷：玩家 + active combat companions 取最高。 */
export function getHighestPartyAgility(playerAgility: number, companionAgilities: readonly number[]): number {
  if (!Number.isInteger(playerAgility) || playerAgility < 0) {
    throw new RangeError('玩家敏捷必须是非负整数')
  }
  let highest = playerAgility
  for (const agi of companionAgilities) {
    if (!Number.isInteger(agi) || agi < 0) {
      throw new RangeError('伙伴敏捷必须是非负整数')
    }
    if (agi > highest) highest = agi
  }
  return highest
}

/** 敌方最高敏捷：当前单敌人（未来多敌人取最高；空数组视为无敌人 → 抛错）。 */
export function getHighestEnemyAgility(enemyAgilities: readonly number[]): number {
  if (!Array.isArray(enemyAgilities) || enemyAgilities.length === 0) {
    throw new RangeError('敌方敏捷列表不能为空')
  }
  let highest = -1
  for (const agi of enemyAgilities) {
    if (!Number.isInteger(agi) || agi < 0) {
      throw new RangeError('敌方敏捷必须是非负整数')
    }
    if (agi > highest) highest = agi
  }
  return highest
}

/**
 * 逃跑检定（确定性）：escapeScore = (highestPartyAgility + d20) / 3。
 * 成功条件：escapeScore >= highestEnemyAgility。
 * roll 必须是 1–20 整数。
 */
export function resolveEscape(
  highestPartyAgility: number,
  highestEnemyAgility: number,
  roll: number,
): EscapeResult {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new RangeError('逃跑骰面必须是 1–20 之间的整数')
  }
  if (!Number.isInteger(highestPartyAgility) || highestPartyAgility < 0) {
    throw new RangeError('队伍最高敏捷必须是非负整数')
  }
  if (!Number.isInteger(highestEnemyAgility) || highestEnemyAgility < 0) {
    throw new RangeError('敌方最高敏捷必须是非负整数')
  }
  const score = (highestPartyAgility + roll) / 3
  if (!Number.isFinite(score)) {
    throw new RangeError('逃跑检定值溢出')
  }
  return { score, enemyAgility: highestEnemyAgility, roll, success: score >= highestEnemyAgility }
}

/** 随机逃跑检定入口（复用系统 D20） */
export function rollEscape(highestPartyAgility: number, highestEnemyAgility: number): EscapeResult {
  return resolveEscape(highestPartyAgility, highestEnemyAgility, rollD20())
}

/** 逃跑成功播报（任务卡第 33 节文案） */
export function formatEscapeSuccess(actorName: string, result: EscapeResult): string[] {
  return [
    `${actorName}寻找到了脱身机会。`,
    `逃跑检定：成功。`,
    `你与敌人拉开距离，撤出了战斗。`,
  ]
}

/** 逃跑失败播报（任务卡第 34 节文案） */
export function formatEscapeFailure(actorName: string): string[] {
  return [`${actorName}试图撤离，但被对方封住退路。`, `逃跑失败。`]
}

/** 逃跑详细日志（右侧详细战斗日志展示公式） */
export function formatEscapeDetail(result: EscapeResult): string[] {
  return [
    `逃跑值 = (最高敏捷 ${result.roll >= 1 ? '（含 D20）' : ''}${result.roll} + 敏捷修正) / 3 = ${result.score}`,
    `敌方最高敏捷：${result.enemyAgility}`,
    `结果：${result.success ? '成功' : '失败'}`,
  ]
}
