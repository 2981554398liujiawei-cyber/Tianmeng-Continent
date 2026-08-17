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
