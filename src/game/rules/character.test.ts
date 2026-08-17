import { describe, expect, it } from 'vitest'
import { getStartingMaxHp, getStartingMaxMp } from './character'

describe('TM-P0-004：初始 HP/MP 派生公式', () => {
  it('maxHp = 10 + CON', () => {
    expect(getStartingMaxHp(8)).toBe(18)
    expect(getStartingMaxHp(12)).toBe(22)
    expect(getStartingMaxHp(16)).toBe(26)
  })

  it('maxMp = max(0, MND - 2)', () => {
    expect(getStartingMaxMp(8)).toBe(6)
    expect(getStartingMaxMp(16)).toBe(14)
    expect(getStartingMaxMp(0)).toBe(0)
    expect(getStartingMaxMp(1)).toBe(0)
  })

  it('非法输入（非整数）抛 RangeError', () => {
    expect(() => getStartingMaxHp(Number.NaN)).toThrow(RangeError)
    expect(() => getStartingMaxMp(10.5)).toThrow(RangeError)
  })
})
