/**
 * 樱花魔法盾即时减伤纯规则测试（TM-P2-004-R1 A/D）。
 * 覆盖 D 清单：Shield immediate hit absorbs / miss does not consume / next hit consumes /
 * actual HP delta correct / absorption log correct（absorbed 值）。
 * 不改 Combat V3：performAttack 语义由 rules/combat.test.ts 保持（本文件不触碰公式）。
 */
import { describe, expect, it } from 'vitest'
import { resolveEnemyCounterWithSupport } from './combatSupport'
import type { AttackResult } from './combat'

function hit(damage: number): AttackResult {
  return {
    roll: 15,
    attackerAgility: 10,
    defenderAgility: 10,
    attackPower: damage,
    hitValue: 12.5,
    rawDamage: damage,
    armor: 0,
    damageTakenRate: 1,
    hit: true,
    critical: false,
    damage,
    outcome: 'hit',
  }
}

function miss(): AttackResult {
  return {
    roll: 3,
    attackerAgility: 10,
    defenderAgility: 10,
    attackPower: 3,
    hitValue: 6.5,
    rawDamage: 3,
    armor: 0,
    damageTakenRate: 1,
    hit: false,
    critical: false,
    damage: 0,
    outcome: 'critical_miss',
  }
}

describe('TM-P2-004-R1 A：盾即时减伤（stale state 修复的纯规则层）', () => {
  it('immediate hit absorbs current counter：V3 damage 5 + 盾 3 → damage 2、absorbed 3、盾消耗', () => {
    const { result, absorbed, shieldConsumed } = resolveEnemyCounterWithSupport(hit(5), 3)
    expect(result.damage).toBe(2)
    expect(result.hit).toBe(true)
    expect(absorbed).toBe(3)
    expect(shieldConsumed).toBe(true)
  })

  it('V3 damage 2 + 盾 3 → 实际伤害 0（最低 0）、absorbed 2（吸收 = min(盾, damage)）', () => {
    const { result, absorbed } = resolveEnemyCounterWithSupport(hit(2), 3)
    expect(result.damage).toBe(0)
    expect(absorbed).toBe(2)
  })

  it('miss does not consume：敌人立即反击 miss → 结果不变、absorbed null、盾保留', () => {
    const { result, absorbed, shieldConsumed } = resolveEnemyCounterWithSupport(miss(), 3)
    expect(result.hit).toBe(false)
    expect(result.damage).toBe(0)
    expect(absorbed).toBeNull()
    expect(shieldConsumed).toBe(false)
  })

  it('next hit consumes：miss 保留后下一次真实命中 → 盾消耗并减伤', () => {
    // 第一击 miss（盾保留）
    const first = resolveEnemyCounterWithSupport(miss(), 3)
    expect(first.shieldConsumed).toBe(false)
    // 第二击 hit（activeShield 仍为 3——调用方把保留的盾继续传入）
    const second = resolveEnemyCounterWithSupport(hit(5), 3)
    expect(second.shieldConsumed).toBe(true)
    expect(second.result.damage).toBe(2)
    expect(second.absorbed).toBe(3)
    // 盾耗尽后：activeShield=0 → 无减伤
    const third = resolveEnemyCounterWithSupport(hit(5), 0)
    expect(third.result.damage).toBe(5)
    expect(third.absorbed).toBeNull()
    expect(third.shieldConsumed).toBe(false)
  })

  it('未展开盾（activeShield=0）→ 原样返回', () => {
    const { result, absorbed, shieldConsumed } = resolveEnemyCounterWithSupport(hit(5), 0)
    expect(result.damage).toBe(5)
    expect(absorbed).toBeNull()
    expect(shieldConsumed).toBe(false)
  })

  it('伤害恰好等于盾量 → 吸收全部、damage 0', () => {
    const { result, absorbed } = resolveEnemyCounterWithSupport(hit(3), 3)
    expect(result.damage).toBe(0)
    expect(absorbed).toBe(3)
  })

  it('hit 时 critical/glancing 信息保留（只改 damage）', () => {
    const crit: AttackResult = { ...hit(8), outcome: 'critical_hit', critical: true, roll: 20 }
    const { result, absorbed } = resolveEnemyCounterWithSupport(crit, 3)
    expect(result.outcome).toBe('critical_hit')
    expect(result.critical).toBe(true)
    expect(result.roll).toBe(20)
    expect(result.damage).toBe(5)
    expect(absorbed).toBe(3)
  })
})
