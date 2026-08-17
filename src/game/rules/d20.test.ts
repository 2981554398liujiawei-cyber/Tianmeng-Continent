import { describe, expect, it } from 'vitest'
import {
  CHECK_DC,
  getAttributeModifier,
  getProficiencyBonus,
  performD20Check,
  resolveD20Check,
  rollD20,
  type D20CheckInput,
} from './d20'
import { createInitialGameState } from '../content/initial'

describe('TM-P0-003：属性修正公式', () => {
  it.each([
    [6, -2],
    [8, -1],
    [10, 0],
    [12, 1],
    [14, 2],
    [16, 3],
    [18, 4],
    [20, 5],
  ])('getAttributeModifier(%d) === %d', (score, expected) => {
    expect(getAttributeModifier(score)).toBe(expected)
  })
})

describe('TM-P0-003：熟练加值', () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])('getProficiencyBonus(level %d) === %d', (level, expected) => {
    expect(getProficiencyBonus(level)).toBe(expected)
  })
})

describe('TM-P0-003：CHECK_DC 常量', () => {
  it('包含五档标准 DC', () => {
    expect(CHECK_DC).toEqual({ easy: 8, normal: 10, moderate: 12, hard: 15, severe: 18 })
  })
})

describe('TM-P0-003：rollD20', () => {
  it('始终产生 1–20 的整数', () => {
    for (let i = 0; i < 200; i++) {
      const roll = rollD20()
      expect(Number.isInteger(roll)).toBe(true)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
    }
  })
})

describe('TM-P0-003：结算规则', () => {
  const base = (over: Partial<D20CheckInput> = {}): D20CheckInput => ({
    attributeScore: 14, // +2
    level: 1, // 熟练 +2
    dc: 14,
    proficient: true,
    situationalModifier: 0,
    ...over,
  })

  it('普通成功：total >= DC', () => {
    // roll 10 + 2 + 2 + 0 = 14 >= 14
    const r = resolveD20Check(base(), 10)
    expect(r.outcome).toBe('success')
    expect(r.success).toBe(true)
    expect(r.total).toBe(14)
  })

  it('普通失败：total < DC', () => {
    // roll 9 + 2 + 2 + 0 = 13 < 14
    const r = resolveD20Check(base(), 9)
    expect(r.outcome).toBe('failure')
    expect(r.success).toBe(false)
  })

  it('天然 20：即使 total < DC 也是 critical_success', () => {
    // DC 99 远超总值，但骰面 20 直接大成功
    const r = resolveD20Check(base({ dc: 99 }), 20)
    expect(r.outcome).toBe('critical_success')
    expect(r.success).toBe(true)
  })

  it('天然 1：即使 total >= DC 也是 critical_failure', () => {
    // DC 0 远低于总值，但骰面 1 直接大失败
    const r = resolveD20Check(base({ dc: 0 }), 1)
    expect(r.outcome).toBe('critical_failure')
    expect(r.success).toBe(false)
  })

  it('情境修正：正负整数正确进入 total', () => {
    expect(resolveD20Check(base({ situationalModifier: 3 }), 10).total).toBe(17)
    expect(resolveD20Check(base({ situationalModifier: -5 }), 10).total).toBe(9)
  })

  it('非熟练时 proficiencyBonus = 0', () => {
    const r = resolveD20Check(base({ proficient: false }), 10)
    expect(r.proficiencyBonus).toBe(0)
    expect(r.total).toBe(12) // 10 + 2 + 0 + 0
  })

  it('结果字段完整且正确', () => {
    const r = resolveD20Check(base(), 12)
    expect(r.roll).toBe(12)
    expect(r.attributeModifier).toBe(2)
    expect(r.proficiencyBonus).toBe(2)
    expect(r.situationalModifier).toBe(0)
    expect(r.dc).toBe(14)
    expect(r.total).toBe(16)
  })
})

describe('TM-P0-003：非法输入不产生正常结果', () => {
  const base = (): D20CheckInput => ({
    attributeScore: 14,
    level: 1,
    dc: 12,
    proficient: true,
    situationalModifier: 0,
  })

  it.each([
    [0],
    [21],
    [1.5],
    [-1],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
  ])('骰面非法值 %p → throw RangeError', (roll) => {
    expect(() => resolveD20Check(base(), roll as number)).toThrow(RangeError)
  })

  it.each([[0], [21], [-1], [1.5]])('level 非法 %p → throw', (level) => {
    expect(() => resolveD20Check(base(), 10)).not.toThrow()
    expect(() => resolveD20Check({ ...base(), level: level as number }, 10)).toThrow(RangeError)
  })

  it('attributeScore NaN → throw', () => {
    expect(() => resolveD20Check({ ...base(), attributeScore: Number.NaN }, 10)).toThrow(RangeError)
  })

  it('dc Infinity → throw', () => {
    expect(() =>
      resolveD20Check({ ...base(), dc: Number.POSITIVE_INFINITY }, 10),
    ).toThrow(RangeError)
  })

  it('situationalModifier NaN → throw', () => {
    expect(() =>
      resolveD20Check({ ...base(), situationalModifier: Number.NaN }, 10),
    ).toThrow(RangeError)
  })

  it('合法输入结果不含 NaN/Infinity', () => {
    const r = performD20Check(base())
    expect(Number.isFinite(r.total)).toBe(true)
    expect(Number.isFinite(r.attributeModifier)).toBe(true)
    expect(Number.isFinite(r.proficiencyBonus)).toBe(true)
    expect(Number.isFinite(r.situationalModifier)).toBe(true)
  })
})

describe('TM-P0-003：检定无状态副作用（GameState 不变）', () => {
  it('执行检定前后 GameState 完全一致', () => {
    const state = createInitialGameState()
    const snapshot = JSON.stringify(state)
    performD20Check({
      attributeScore: state.player.attributes.str,
      level: state.player.level,
      dc: 12,
    })
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('performD20Check 不改变存档状态', () => {
    const state = createInitialGameState()
    const goldBefore = state.player.gold
    const hpBefore = state.player.hp
    performD20Check({ attributeScore: 14, level: 1, dc: 12 })
    expect(state.player.gold).toBe(goldBefore)
    expect(state.player.hp).toBe(hpBefore)
  })
})
