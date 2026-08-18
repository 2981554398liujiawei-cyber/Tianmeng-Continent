import { describe, expect, it } from 'vitest'
import { getStartingMaxHp, getStartingMaxMp, LEVEL_2_MAX_HP_GAIN, LEVEL_2_MAX_MP_GAIN } from './character'

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

describe('TM-P1-011：里程碑 Lv.2 成长常量', () => {
  it('LEVEL_2_MAX_HP_GAIN === 2 且 LEVEL_2_MAX_MP_GAIN === 1（唯一业务常量，不建等级表）', () => {
    expect(LEVEL_2_MAX_HP_GAIN).toBe(2)
    expect(LEVEL_2_MAX_MP_GAIN).toBe(1)
  })
})
