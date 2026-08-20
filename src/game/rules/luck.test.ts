import { describe, expect, it } from 'vitest'
import { getLuckModifier, resolveLuckCheck, formatLuckCheckLog } from './luck'

describe('TM-P2-003 B：幸运检定规则', () => {
  it('幸运修正 = floor((LCK-10)/2)', () => {
    expect(getLuckModifier(10)).toBe(0)
    expect(getLuckModifier(14)).toBe(2)
    expect(getLuckModifier(8)).toBe(-1)
    expect(getLuckModifier(20)).toBe(5)
  })

  it('成功：D20 + 修正 >= DC', () => {
    const r = resolveLuckCheck(14, 12, 12)
    expect(r.modifier).toBe(1)
    expect(r.total).toBe(15)
    expect(r.success).toBe(true)
    expect(r.outcome).toBe('success')
  })

  it('失败：total < DC', () => {
    const r = resolveLuckCheck(5, 10, 12)
    expect(r.total).toBe(5)
    expect(r.success).toBe(false)
    expect(r.outcome).toBe('failure')
  })

  it('天然 1 → 大失败（无视 total）；天然 20 → 大成功', () => {
    expect(resolveLuckCheck(1, 14, 5).outcome).toBe('critical_failure')
    expect(resolveLuckCheck(20, 8, 20).outcome).toBe('critical_success')
    expect(resolveLuckCheck(20, 8, 20).success).toBe(true)
  })

  it('情境修正参与总值', () => {
    const r = resolveLuckCheck(10, 10, 12, 3)
    expect(r.total).toBe(13)
    expect(r.success).toBe(true)
  })

  it('日志格式：D20 + 幸运修正 = 总值；DC；幸运检定：结果', () => {
    const r = resolveLuckCheck(14, 12, 12)
    const lines = formatLuckCheckLog(r)
    expect(lines[0]).toBe('D20 14 + 幸运修正 1 = 15')
    expect(lines[1]).toBe('DC 12')
    expect(lines[2]).toBe('幸运检定：成功')
  })

  it('非法输入抛 RangeError', () => {
    expect(() => resolveLuckCheck(0, 10, 12)).toThrow(RangeError)
    expect(() => resolveLuckCheck(21, 10, 12)).toThrow(RangeError)
    expect(() => resolveLuckCheck(10, 10, 0)).toThrow(RangeError)
  })
})
