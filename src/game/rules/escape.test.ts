import { describe, expect, it } from 'vitest'
import {
  getHighestPartyAgility,
  getHighestEnemyAgility,
  resolveEscape,
} from '../rules/escape'

describe('TM-P2-006：逃跑系统 V1（E1-E13）', () => {
  // ---- 纯函数：队伍/敌方最高敏捷 ----

  it('E1. 无伙伴：队伍最高敏捷 = 玩家敏捷', () => {
    expect(getHighestPartyAgility(10, [])).toBe(10)
    expect(getHighestPartyAgility(16, [])).toBe(16)
  })

  it('E2. 有伙伴：取玩家与伙伴中的最高敏捷', () => {
    expect(getHighestPartyAgility(10, [16])).toBe(16)
    expect(getHighestPartyAgility(16, [10])).toBe(16)
    expect(getHighestPartyAgility(10, [8, 14, 12])).toBe(14)
  })

  it('E3. 敌方最高敏捷：单敌人 = 该敌人敏捷；多敌人取最高', () => {
    expect(getHighestEnemyAgility([10])).toBe(10)
    expect(getHighestEnemyAgility([8, 12, 10])).toBe(12)
  })

  it('E4. 非法输入拒绝：负敏捷 / 非整数敏捷 / 空敌方列表 → RangeError', () => {
    expect(() => getHighestPartyAgility(-1, [])).toThrow(RangeError)
    expect(() => getHighestPartyAgility(1.5, [])).toThrow(RangeError)
    expect(() => getHighestPartyAgility(10, [-1])).toThrow(RangeError)
    expect(() => getHighestPartyAgility(10, [1.5])).toThrow(RangeError)
    expect(() => getHighestEnemyAgility([])).toThrow(RangeError)
    expect(() => getHighestEnemyAgility([-1])).toThrow(RangeError)
    expect(() => getHighestEnemyAgility([1.5])).toThrow(RangeError)
  })

  // ---- 核心公式：escapeScore = (highestPartyAgility + d20) / 3 ----

  it('E5. 公式示例（任务卡）：(16 + 14) / 3 = 10 且 10 >= 10 → 成功', () => {
    const result = resolveEscape(16, 10, 14)
    expect(result.score).toBe(10)
    expect(result.success).toBe(true)
  })

  it('E6. 成功边界：score 恰等于敌方最高敏捷 → 成功', () => {
    // (10 + 20) / 3 = 10 = enemy 10 → 成功
    expect(resolveEscape(10, 10, 20).success).toBe(true)
    // (8 + 19) / 3 = 9 < 10 → 失败
    expect(resolveEscape(8, 10, 19).success).toBe(false)
  })

  it('E7. 失败：score < 敌方最高敏捷 → 失败', () => {
    const result = resolveEscape(10, 10, 5)
    expect(result.score).toBe(5)
    expect(result.success).toBe(false)
  })

  it('E8. 敏捷高者更易逃跑：同骰面下高敏捷成功率更高', () => {
    // 骰 5：AGI16 → (16+5)/3=7；AGI10 → (10+5)/3=5；敌方 6
    expect(resolveEscape(16, 6, 5).success).toBe(true)
    expect(resolveEscape(10, 6, 5).success).toBe(false)
  })

  it('E9. 骰面范围校验：roll < 1 或 > 20 → RangeError', () => {
    expect(() => resolveEscape(16, 10, 0)).toThrow(RangeError)
    expect(() => resolveEscape(16, 10, 21)).toThrow(RangeError)
    expect(() => resolveEscape(16, 10, 1.5)).toThrow(RangeError)
  })

  it('E10. 结果字段完整：score/enemyAgility/roll/success 均存在且类型正确', () => {
    const result = resolveEscape(16, 10, 14)
    expect(typeof result.score).toBe('number')
    expect(result.enemyAgility).toBe(10)
    expect(result.roll).toBe(14)
    expect(typeof result.success).toBe('boolean')
  })

  // ---- 自然 1 / 自然 20 无额外规则（任务卡第 35 节）----

  it('E11. nat1 无额外惩罚：按公式正常计算', () => {
    // 高敏捷 + 骰 1 仍可能成功（如 AGI28 玩家对敌方 9：(28+1)/3=9.66 >= 9）
    const result = resolveEscape(28, 9, 1)
    expect(result.roll).toBe(1)
    expect(result.success).toBe(true)
  })

  it('E12. nat20 无额外奖励：仅按公式计算', () => {
    // 低敏捷 + 骰 20 若仍不足（如 AGI4 对敌方 8：(4+20)/3=8 >= 8 成功；对敌方 9 失败）
    expect(resolveEscape(4, 8, 20).success).toBe(true)
    expect(resolveEscape(4, 9, 20).success).toBe(false)
  })

  // ---- 与敌方敏捷关系 ----

  it('E13. 我方最高敏捷低于敌方时，即使骰 20 也可能失败', () => {
    // 玩家 AGI6 vs 敌人 AGI12：(6+20)/3=8.67 < 12 → 失败
    expect(resolveEscape(6, 12, 20).success).toBe(false)
    // 玩家 AGI6 但骰 20 且敌方 AGI 低（如 8）：(6+20)/3=8.67 >= 8 → 成功
    expect(resolveEscape(6, 8, 20).success).toBe(true)
  })
})
