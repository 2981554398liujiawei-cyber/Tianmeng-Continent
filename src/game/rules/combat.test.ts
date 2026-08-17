import { describe, expect, it } from 'vitest'
import {
  getPlayerAttackBonus,
  getPlayerBasicDamage,
  getPlayerDefense,
  performAttack,
  resolveAttack,
} from './combat'
import { ENEMIES } from '../content/enemies'
import { createInitialGameState } from '../content/initial'

describe('TM-P0-007：玩家派生规则', () => {
  it('getPlayerDefense = 10 + AGI 修正', () => {
    expect(getPlayerDefense(8)).toBe(9)
    expect(getPlayerDefense(10)).toBe(10)
    expect(getPlayerDefense(14)).toBe(12)
    expect(getPlayerDefense(16)).toBe(13)
  })

  it('getPlayerAttackBonus = STR 修正 + 熟练加值', () => {
    expect(getPlayerAttackBonus(14, 1)).toBe(4) // +2 + +2
    expect(getPlayerAttackBonus(8, 1)).toBe(1) // -1 + +2
    expect(getPlayerAttackBonus(14, 5)).toBe(5) // +2 + +3
  })

  it('getPlayerBasicDamage = max(1, 4 + STR 修正)', () => {
    expect(getPlayerBasicDamage(8)).toBe(3)
    expect(getPlayerBasicDamage(10)).toBe(4)
    expect(getPlayerBasicDamage(14)).toBe(6)
    expect(getPlayerBasicDamage(16)).toBe(7)
  })
})

describe('TM-P0-007：攻击结算', () => {
  it('普通命中：total >= defense', () => {
    const r = resolveAttack(7, 4, 11, 6) // total 11
    expect(r.outcome).toBe('hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(false)
    expect(r.damage).toBe(6)
    expect(r.total).toBe(11)
  })

  it('普通未命中：total < defense', () => {
    const r = resolveAttack(6, 4, 11, 6) // total 10
    expect(r.outcome).toBe('miss')
    expect(r.hit).toBe(false)
    expect(r.damage).toBe(0)
  })

  it('天然 20：即使 attackBonus=-10 / defense=99 仍暴击且伤害双倍', () => {
    const r = resolveAttack(20, -10, 99, 6)
    expect(r.outcome).toBe('critical_hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(true)
    expect(r.damage).toBe(12)
  })

  it('天然 1：即使 attackBonus=100 / defense=0 仍大失败且伤害 0', () => {
    const r = resolveAttack(1, 100, 0, 6)
    expect(r.outcome).toBe('critical_miss')
    expect(r.hit).toBe(false)
    expect(r.critical).toBe(false)
    expect(r.damage).toBe(0)
  })

  it('敌人攻击复用 resolveAttack：魔化兔 vs 玩家 Defense 10', () => {
    // 玩家 AGI 10 → Defense 10；魔化兔 attackBonus 2 / damage 2
    const rabbit = ENEMIES.corrupted_rabbit!
    const r = resolveAttack(8, rabbit.attackBonus, getPlayerDefense(10), rabbit.damage)
    expect(r.outcome).toBe('hit') // total 10 >= 10
    expect(r.hit).toBe(true)
    expect(r.damage).toBe(2)
  })

  it('负攻击加值可进入结算（有限整数允许）', () => {
    const r = resolveAttack(15, -3, 10, 4)
    expect(r.total).toBe(12)
    expect(r.outcome).toBe('hit')
  })
})

describe('TM-P0-007：随机入口 performAttack', () => {
  it('多次执行后 roll 始终为 1–20 整数', () => {
    for (let i = 0; i < 100; i++) {
      const r = performAttack(4, 11, 6)
      expect(Number.isInteger(r.roll)).toBe(true)
      expect(r.roll).toBeGreaterThanOrEqual(1)
      expect(r.roll).toBeLessThanOrEqual(20)
      expect(Number.isFinite(r.total)).toBe(true)
      expect(Number.isFinite(r.damage)).toBe(true)
    }
  })
})

describe('TM-P0-007：输入异常抛 RangeError', () => {
  it('roll 非法：0 / 21 / 1.5', () => {
    expect(() => resolveAttack(0, 4, 11, 6)).toThrow(RangeError)
    expect(() => resolveAttack(21, 4, 11, 6)).toThrow(RangeError)
    expect(() => resolveAttack(1.5, 4, 11, 6)).toThrow(RangeError)
  })

  it('attackBonus 非法：NaN / Infinity', () => {
    expect(() => resolveAttack(10, Number.NaN, 11, 6)).toThrow(RangeError)
    expect(() => resolveAttack(10, Number.POSITIVE_INFINITY, 11, 6)).toThrow(RangeError)
  })

  it('defense 非法：-1 / NaN', () => {
    expect(() => resolveAttack(10, 4, -1, 6)).toThrow(RangeError)
    expect(() => resolveAttack(10, 4, Number.NaN, 6)).toThrow(RangeError)
  })

  it('baseDamage 非法：0 / 1.5 / Infinity', () => {
    expect(() => resolveAttack(10, 4, 11, 0)).toThrow(RangeError)
    expect(() => resolveAttack(10, 4, 11, 1.5)).toThrow(RangeError)
    expect(() => resolveAttack(10, 4, 11, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('TM-P0-007：无副作用', () => {
  it('玩家攻击 / 敌人攻击后 GameState 完全不变', () => {
    const state = createInitialGameState()
    const snapshot = JSON.stringify(state)
    const { str, agi } = state.player.attributes
    const enemy = ENEMIES.corrupted_rabbit!
    performAttack(getPlayerAttackBonus(str, state.player.level), enemy.defense, getPlayerBasicDamage(str))
    performAttack(enemy.attackBonus, getPlayerDefense(agi), enemy.damage)
    expect(JSON.stringify(state)).toBe(snapshot)
    expect(state.player.hp).toBe(state.player.maxHp)
  })
})
