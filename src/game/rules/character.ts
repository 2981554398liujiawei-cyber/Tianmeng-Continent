/**
 * 角色初始派生公式（TM-P0-004）。
 * HP/MP 公式集中于此，不在 UI / Store 内重复。
 */

/** 初始最大生命：10 + CON */
export function getStartingMaxHp(con: number): number {
  if (!Number.isInteger(con)) {
    throw new RangeError('体质必须为整数')
  }
  return 10 + con
}

/** 初始最大灵力：max(0, MND - 2) */
export function getStartingMaxMp(mnd: number): number {
  if (!Number.isInteger(mnd)) {
    throw new RangeError('冥想必须为整数')
  }
  return Math.max(0, mnd - 2)
}

// ---- Phase 1：第一次里程碑升级 Lv.2（TM-P1-011）----

/** 里程碑 Lv.2 最大生命成长（唯一业务常量；不建等级表） */
export const LEVEL_2_MAX_HP_GAIN = 2
/** 里程碑 Lv.2 最大灵力成长（唯一业务常量；不建等级表） */
export const LEVEL_2_MAX_MP_GAIN = 1

export function getXpThresholdForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('等级必须为正整数')
  return level <= 1 ? 0 : 25 * level * (level + 1) - 50
}
export function getLevelFromXp(xp: number): number {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError('冒险阅历必须为非负安全整数')
  let level = 1
  while (level < 15 && getXpThresholdForLevel(level + 1) <= xp) level += 1
  return level
}
export function getXpIntoCurrentLevel(xp: number): number {
  return xp - getXpThresholdForLevel(getLevelFromXp(xp))
}
export function getXpRequiredForNextLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new RangeError('等级必须为正整数')
  return level >= 15 ? 0 : getXpThresholdForLevel(level + 1) - getXpThresholdForLevel(level)
}
