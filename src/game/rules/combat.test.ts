import { describe, expect, it } from 'vitest'
import {
  getCombatPhaseAfterEnemyAttack,
  getCriticalDamage,
  getGlancingDamage,
  getKnightPowerStrikeDamage,
  getMageSpellAttackBonus,
  getMageSpellDamage,
  getPlayerAttackBonus,
  getPlayerAttackDamage,
  getPlayerBasicDamage,
  getPlayerDefense,
  getPlayerLevelDamageBonus,
  getRangerSwiftStrikeAttackBonus,
  getRangerSwiftStrikeDamage,
  KNIGHT_POWER_STRIKE_MP_COST,
  MAGE_SPELL_MP_COST,
  WARRIOR_SUPPRESS_STRIKE_MP_COST,
  performAttack,
  resolveAttack,
  resolvePlayerStrike,
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

describe('TM-P0-013：getPlayerAttackDamage 武器伤害加成', () => {
  it('STR14 无武器加成 → 6（getPlayerBasicDamage 语义不变）', () => {
    expect(getPlayerAttackDamage(14)).toBe(6)
    expect(getPlayerAttackDamage(14, 0)).toBe(6)
  })

  it('STR14 + 武器加成 2 → 8（装备铁剑）', () => {
    expect(getPlayerAttackDamage(14, 2)).toBe(8)
  })

  it('STR8 + 武器加成 2 → 5', () => {
    expect(getPlayerAttackDamage(8, 2)).toBe(5)
  })

  it('天然 20 暴击（V2 150%）：baseDamage 8 → damage 12', () => {
    const r = resolveAttack(20, 4, 11, getPlayerAttackDamage(14, 2))
    expect(r.damage).toBe(12)
    expect(r.outcome).toBe('critical_hit')
  })

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('非法武器加成 %p 抛 RangeError', (bonus) => {
    expect(() => getPlayerAttackDamage(14, bonus as number)).toThrow(RangeError)
  })

  it('正常返回为有限数字', () => {
    expect(Number.isFinite(getPlayerAttackDamage(14, 2))).toBe(true)
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

  it('普通未命中（V2）：total < defense - 4', () => {
    const r = resolveAttack(2, 4, 11, 6) // total 6 < 7
    expect(r.outcome).toBe('miss')
    expect(r.hit).toBe(false)
    expect(r.damage).toBe(0)
  })

  it('天然 20：即使 attackBonus=-10 / defense=99 仍暴击且伤害 150%', () => {
    const r = resolveAttack(20, -10, 99, 6)
    expect(r.outcome).toBe('critical_hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(true)
    expect(r.damage).toBe(9)
  })

  it('正常暴击为 150% 伤害（baseDamage 6 → 9）', () => {
    const r = resolveAttack(20, 0, 10, 6)
    expect(r.outcome).toBe('critical_hit')
    expect(r.damage).toBe(9)
  })

  it('高值整数可安全暴击且保持有限（1_000_000 → 1_500_000）', () => {
    const r = resolveAttack(20, 0, 10, 1_000_000)
    expect(r.damage).toBe(1_500_000)
    expect(Number.isFinite(r.damage)).toBe(true)
  })

  it('返回对象所有数值均为有限（普通命中与暴击）', () => {
    const hit = resolveAttack(7, 4, 11, 6)
    expect(Number.isFinite(hit.total)).toBe(true)
    expect(Number.isFinite(hit.damage)).toBe(true)
    const crit = resolveAttack(20, 4, 11, 6)
    expect(Number.isFinite(crit.total)).toBe(true)
    expect(Number.isFinite(crit.damage)).toBe(true)
    expect(Number.isFinite(crit.attackBonus)).toBe(true)
    expect(Number.isFinite(crit.defense)).toBe(true)
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

describe('TM-P0-008-R1：确定性战斗阶段结算', () => {
  it('A. 致死攻击 → enemyHp 0 / victory / 不反击', () => {
    const attack = resolveAttack(10, 4, 11, 6) // total 14 >= 11 命中
    const r = resolvePlayerStrike(6, attack)
    expect(r.enemyHp).toBe(0)
    expect(r.phase).toBe('victory')
    expect(r.enemyShouldCounter).toBe(false)
  })

  it('B. 超额伤害仍截断为 0（不得负数）', () => {
    const crit = resolveAttack(20, 0, 10, 6) // 暴击 damage 12
    const r = resolvePlayerStrike(2, crit)
    expect(r.enemyHp).toBe(0)
    expect(r.phase).toBe('victory')
  })

  it('C. 未击杀 → active / 允许反击', () => {
    const attack = resolveAttack(10, 4, 11, 2) // 命中 damage 2
    const r = resolvePlayerStrike(8, attack)
    expect(r.enemyHp).toBe(6)
    expect(r.phase).toBe('active')
    expect(r.enemyShouldCounter).toBe(true)
  })

  it('D. 未命中 → 敌人 HP 不变 / active / 允许反击', () => {
    const miss = resolveAttack(2, 4, 11, 6) // total 6 < 7（defense-4）未命中
    expect(miss.hit).toBe(false)
    const r = resolvePlayerStrike(8, miss)
    expect(r.enemyHp).toBe(8)
    expect(r.phase).toBe('active')
    expect(r.enemyShouldCounter).toBe(true)
  })

  it('E. 玩家 HP=0 → defeat；HP>0 → active', () => {
    expect(getCombatPhaseAfterEnemyAttack(0)).toBe('defeat')
    expect(getCombatPhaseAfterEnemyAttack(1)).toBe('active')
    expect(getCombatPhaseAfterEnemyAttack(10)).toBe('active')
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

  it('R1: Number.MAX_VALUE 暴击溢出被拒绝（不得返回 Infinity 伤害）', () => {
    expect(() => resolveAttack(20, 0, 10, Number.MAX_VALUE)).toThrow(RangeError)
    expect(() => resolveAttack(10, 0, 10, Number.MAX_VALUE)).toThrow(RangeError)
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

describe('TM-P1-001：法师法术攻击规则', () => {
  it('A. 法术攻击加值 = MND 修正 + 熟练加值（Lv1）', () => {
    expect(getMageSpellAttackBonus(8, 1)).toBe(1) // -1 + 2
    expect(getMageSpellAttackBonus(10, 1)).toBe(2) // 0 + 2
    expect(getMageSpellAttackBonus(14, 1)).toBe(4) // +2 + 2
    expect(getMageSpellAttackBonus(16, 1)).toBe(5) // +3 + 2
  })

  it('B. 法术伤害 = max(1, 6 + MND 修正)', () => {
    expect(getMageSpellDamage(8)).toBe(5)
    expect(getMageSpellDamage(10)).toBe(6)
    expect(getMageSpellDamage(14)).toBe(8)
    expect(getMageSpellDamage(16)).toBe(9)
  })

  it('C. 复用天然 20：MND14 法术伤害 8 → 暴击 12（150%）', () => {
    const result = resolveAttack(20, getMageSpellAttackBonus(14, 1), 11, getMageSpellDamage(14))
    expect(result.outcome).toBe('critical_hit')
    expect(result.damage).toBe(12)
  })

  it('D. 复用天然 1 → critical_miss 0 伤害', () => {
    const result = resolveAttack(1, getMageSpellAttackBonus(14, 1), 11, getMageSpellDamage(14))
    expect(result.outcome).toBe('critical_miss')
    expect(result.damage).toBe(0)
  })

  it('E. 武器不进入法术公式：getMageSpellDamage 接口无 weaponDamageBonus 参数', () => {
    // 接口签名只接受 mnd；装备铁剑不影响法术伤害（由 CombatPage 只调用 getMageSpellDamage(mnd) 保证）
    const fn = getMageSpellDamage as unknown as (mnd: number, weaponBonus?: number) => number
    expect(fn(14, 999)).toBe(8) // 忽略多余参数
  })

  it('MAGE_SPELL_MP_COST === 2（唯一业务常量）', () => {
    expect(MAGE_SPELL_MP_COST).toBe(2)
  })
})

describe('TM-P1-006：骑士职业技能「骑士重击」', () => {
  it('A. 无武器：STR14 → 普通攻击 6，骑士重击 8', () => {
    expect(getPlayerAttackDamage(14)).toBe(6)
    expect(getKnightPowerStrikeDamage(14)).toBe(8)
  })

  it('B. 铁剑：STR14 + weaponDamageBonus=2 → 普通攻击 8，骑士重击 10', () => {
    expect(getPlayerAttackDamage(14, 2)).toBe(8)
    expect(getKnightPowerStrikeDamage(14, 2)).toBe(10)
  })

  it('C. 固定比普通攻击高 2（多 STR 输入）', () => {
    for (const str of [8, 10, 12, 14, 16, 18, 20]) {
      expect(getKnightPowerStrikeDamage(str)).toBe(getPlayerAttackDamage(str) + 2)
      expect(getKnightPowerStrikeDamage(str, 2)).toBe(getPlayerAttackDamage(str, 2) + 2)
    }
  })

  it('D. 天然20：骑士重击伤害 10 → 暴击 15 伤害（150%，复用 resolveAttack，必中）', () => {
    const result = resolveAttack(20, getPlayerAttackBonus(14, 1), 10, getKnightPowerStrikeDamage(14, 2))
    expect(result.outcome).toBe('critical_hit')
    expect(result.hit).toBe(true)
    expect(result.damage).toBe(15)
  })

  it('E. 天然1：骑士重击大失败 0 伤害（复用 resolveAttack）', () => {
    const result = resolveAttack(1, getPlayerAttackBonus(14, 1), 10, getKnightPowerStrikeDamage(14))
    expect(result.outcome).toBe('critical_miss')
    expect(result.hit).toBe(false)
    expect(result.damage).toBe(0)
  })

  it('F. 武器参数安全语义沿用：负数/NaN/小数 weaponDamageBonus 仍抛 RangeError', () => {
    expect(() => getKnightPowerStrikeDamage(14, -1)).toThrow(RangeError)
    expect(() => getKnightPowerStrikeDamage(14, Number.NaN)).toThrow(RangeError)
    expect(() => getKnightPowerStrikeDamage(14, 2.5)).toThrow(RangeError)
  })

  it('KNIGHT_POWER_STRIKE_MP_COST === 2（唯一业务常量）', () => {
    expect(KNIGHT_POWER_STRIKE_MP_COST).toBe(2)
  })
})

describe('TM-P1-007：游侠职业技能「迅捷突袭」', () => {
  it('A. AGI 攻击加值（Lv1）：AGI8→+3 / AGI10→+4 / AGI14→+6 / AGI16→+7', () => {
    expect(getRangerSwiftStrikeAttackBonus(8, 1)).toBe(3)
    expect(getRangerSwiftStrikeAttackBonus(10, 1)).toBe(4)
    expect(getRangerSwiftStrikeAttackBonus(14, 1)).toBe(6)
    expect(getRangerSwiftStrikeAttackBonus(16, 1)).toBe(7)
  })

  it('B. 无武器伤害：AGI10 → 6，AGI14 → 8', () => {
    expect(getRangerSwiftStrikeDamage(10)).toBe(6)
    expect(getRangerSwiftStrikeDamage(14)).toBe(8)
  })

  it('C. 铁剑：AGI10 + weaponDamageBonus=2 → 8', () => {
    expect(getRangerSwiftStrikeDamage(10, 2)).toBe(8)
  })

  it('D. 证明使用 AGI：函数只接受 AGI 参数，STR16/AGI10 结果由 AGI10 得出（接口无 STR 参数）', () => {
    // 接口签名只接受 agi（+可选 weaponBonus），不接收 STR
    const fn = getRangerSwiftStrikeDamage as unknown as (str: number, agi: number) => number
    // 用 STR16 冒充第一个参数会被当作 agi 之外的调用错误——类型层面不可行；这里断言 signature 参数个数为 1（+可选）
    expect(getRangerSwiftStrikeDamage.length).toBe(1)
    expect(getRangerSwiftStrikeDamage(10)).toBe(6) // AGI10 → 6，而非 STR16 的 8
  })

  it('E. 天然20：AGI10 baseDamage 6 → 暴击 9 伤害（150%，复用 resolveAttack）', () => {
    const result = resolveAttack(20, getRangerSwiftStrikeAttackBonus(10, 1), 10, getRangerSwiftStrikeDamage(10))
    expect(result.outcome).toBe('critical_hit')
    expect(result.hit).toBe(true)
    expect(result.damage).toBe(9)
  })

  it('F. 天然1：迅捷突袭大失败 0 伤害（复用 resolveAttack）', () => {
    const result = resolveAttack(1, getRangerSwiftStrikeAttackBonus(10, 1), 10, getRangerSwiftStrikeDamage(10))
    expect(result.outcome).toBe('critical_miss')
    expect(result.hit).toBe(false)
    expect(result.damage).toBe(0)
  })

  it('G. 武器参数非法：-1/NaN/1.5/Infinity 抛 RangeError（复用 getPlayerAttackDamage 校验）', () => {
    expect(() => getRangerSwiftStrikeDamage(10, -1)).toThrow(RangeError)
    expect(() => getRangerSwiftStrikeDamage(10, Number.NaN)).toThrow(RangeError)
    expect(() => getRangerSwiftStrikeDamage(10, 1.5)).toThrow(RangeError)
    expect(() => getRangerSwiftStrikeDamage(10, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
})

describe('TM-P1-008：战士职业技能「压制猛击」', () => {
  it('WARRIOR_SUPPRESS_STRIKE_MP_COST === 2（唯一业务常量；不新增战士伤害函数，攻击公式等同普通攻击）', () => {
    expect(WARRIOR_SUPPRESS_STRIKE_MP_COST).toBe(2)
    // 无战士专属伤害函数：压制猛击伤害直接复用 getPlayerAttackDamage（CombatPage 不再调用其他公式）
    expect(getPlayerAttackDamage(14)).toBe(6)
    expect(getPlayerAttackDamage(14, 2)).toBe(8)
  })
})

// ---- Phase 2：战斗规则 V2（TM-P2-001 C）----

describe('TM-P2-001 C4：基础等级伤害成长', () => {
  it('Lv1–2 +0 / Lv3–4 +1 / Lv5–6 +2 / Lv7–8 +3 ...', () => {
    expect(getPlayerLevelDamageBonus(1)).toBe(0)
    expect(getPlayerLevelDamageBonus(2)).toBe(0)
    expect(getPlayerLevelDamageBonus(3)).toBe(1)
    expect(getPlayerLevelDamageBonus(4)).toBe(1)
    expect(getPlayerLevelDamageBonus(5)).toBe(2)
    expect(getPlayerLevelDamageBonus(6)).toBe(2)
    expect(getPlayerLevelDamageBonus(7)).toBe(3)
    expect(getPlayerLevelDamageBonus(8)).toBe(3)
    expect(getPlayerLevelDamageBonus(20)).toBe(9)
  })

  it('非法等级抛 RangeError', () => {
    expect(() => getPlayerLevelDamageBonus(0)).toThrow(RangeError)
    expect(() => getPlayerLevelDamageBonus(1.5)).toThrow(RangeError)
    expect(() => getPlayerLevelDamageBonus(Number.NaN)).toThrow(RangeError)
  })
})

describe('TM-P2-001 C1：玩家攻击 V2（擦中规则）', () => {
  it('天然 1 → 大失败 0 伤害', () => {
    const r = resolveAttack(1, 4, 11, 6)
    expect(r.outcome).toBe('critical_miss')
    expect(r.hit).toBe(false)
    expect(r.damage).toBe(0)
  })

  it('远低于防御（total < defense - 4）→ 未命中 0 伤害', () => {
    // defense 11，defense-4=7；total=6（roll 2 + 4）
    const r = resolveAttack(2, 4, 11, 6)
    expect(r.outcome).toBe('miss')
    expect(r.hit).toBe(false)
    expect(r.damage).toBe(0)
  })

  it('正好 defense - 4 → 擦中', () => {
    // defense 11，defense-4=7；total=7（roll 3 + 4）→ 擦中边界
    const r = resolveAttack(3, 4, 11, 6)
    expect(r.outcome).toBe('glancing_hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(false)
    expect(r.damage).toBe(3) // max(1, ceil(6/2))
  })

  it('defense - 1 → 擦中', () => {
    // defense 11；total=10（roll 6 + 4）→ 差 1 擦中
    const r = resolveAttack(6, 4, 11, 6)
    expect(r.outcome).toBe('glancing_hit')
    expect(r.hit).toBe(true)
    expect(r.damage).toBe(3)
  })

  it('达到防御 → 正常命中 100%', () => {
    const r = resolveAttack(7, 4, 11, 6) // total 11 === defense
    expect(r.outcome).toBe('hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(false)
    expect(r.damage).toBe(6)
  })

  it('天然 20 → 暴击 150%', () => {
    const r = resolveAttack(20, 4, 11, 6)
    expect(r.outcome).toBe('critical_hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(true)
    expect(r.damage).toBe(9)
  })

  it('奇数基础伤害擦中向上取整（baseDamage 7 → 4）', () => {
    expect(getGlancingDamage(7)).toBe(4) // ceil(3.5)
    const r = resolveAttack(6, 4, 11, 7) // total 10 → 擦中
    expect(r.outcome).toBe('glancing_hit')
    expect(r.damage).toBe(4)
  })

  it('奇数基础伤害暴击向上取整（baseDamage 7 → 11）', () => {
    expect(getCriticalDamage(7)).toBe(11) // ceil(10.5)
    const r = resolveAttack(20, 4, 11, 7)
    expect(r.outcome).toBe('critical_hit')
    expect(r.damage).toBe(11)
  })

  it('擦中至少 1 点伤害（baseDamage 1 → 1）', () => {
    const r = resolveAttack(6, 4, 11, 1) // total 10 → 擦中
    expect(r.outcome).toBe('glancing_hit')
    expect(r.damage).toBe(1)
  })

  it('擦中可击杀（resolvePlayerStrike 支持 glancing_hit 致死）', () => {
    const attack = resolveAttack(3, 4, 11, 6) // 擦中 3 伤害
    const r = resolvePlayerStrike(2, attack)
    expect(r.enemyHp).toBe(0)
    expect(r.phase).toBe('victory')
    expect(r.enemyShouldCounter).toBe(false)
  })
})

describe('TM-P2-001 C2：敌人不使用擦中（不对称设计）', () => {
  it('敌人模式：total 落在擦中区间 → 未命中 0 伤害（无 glancing_hit）', () => {
    // 玩家擦中区间 [7, 10]；敌人模式 total=10 < defense 11 → miss
    const r = resolveAttack(6, 4, 11, 6, 'enemy')
    expect(r.outcome).toBe('miss')
    expect(r.hit).toBe(false)
    expect(r.damage).toBe(0)
  })

  it('敌人模式：total >= defense → 命中', () => {
    const r = resolveAttack(7, 4, 11, 6, 'enemy')
    expect(r.outcome).toBe('hit')
    expect(r.damage).toBe(6)
  })

  it('敌人模式：天然 20 → 暴击 150%（同样降倍率）', () => {
    const r = resolveAttack(20, 4, 11, 6, 'enemy')
    expect(r.outcome).toBe('critical_hit')
    expect(r.damage).toBe(9)
  })

  it('敌人模式：天然 1 → 大失败 0 伤害', () => {
    const r = resolveAttack(1, 4, 11, 6, 'enemy')
    expect(r.outcome).toBe('critical_miss')
    expect(r.damage).toBe(0)
  })

  it('非法模式抛 RangeError', () => {
    expect(() => resolveAttack(10, 4, 11, 6, 'boss' as never)).toThrow(RangeError)
  })
})

describe('TM-P2-001 战斗平衡断言：Attack +4 vs Defense 10/11/12/13（枚举 D20 1–20）', () => {
  it.each([
    [10, 1], // defense 10：仅 roll 1 为 0 伤害（大失败）；roll 2+ 全部 >= 6（擦中或命中），无真正 miss（攻击已足够准）
    [11, 2], // defense 11：roll 1 大失败 + roll 2（total 6 < 7）真 miss
    [12, 3], // defense 12：roll 1 + roll 2/3（total 6/7 < 8）
    [13, 4], // defense 13：roll 1 + roll 2/3/4（total 6/7/8 < 9）
  ])('Defense %i：0 伤害骰面恰好 %i 个（确定性枚举）', (defense, zeroFaces) => {
    const results = Array.from({ length: 20 }, (_, i) => resolveAttack(i + 1, 4, defense, 6))
    const zeroDamage = results.filter((r) => r.damage === 0)
    const missFaces = results.filter((r) => r.outcome === 'miss')
    const glancingFaces = results.filter((r) => r.outcome === 'glancing_hit')
    const hitFaces = results.filter((r) => r.outcome === 'hit')
    const critFaces = results.filter((r) => r.outcome === 'critical_hit')
    // 0 伤害比例显著低于旧规则（旧规则 0 伤害 = 大失败 + total<defense；Defense 12 时 7/20=35%），但仍存在真正 miss
    expect(zeroDamage.length).toBe(zeroFaces)
    expect(zeroDamage.length / 20).toBeLessThanOrEqual(0.2)
    // 防御较高时真正 miss（非大失败）仍然存在；Defense 10 攻击已足够准（无真 miss 也合理）
    if (zeroFaces >= 2) {
      expect(missFaces.length).toBeGreaterThan(0)
    }
    // 擦中带来了非零伤害的中间档（擦中窗口宽度固定 4 个 total 值；骰面边界受 1–20 限制）
    expect(glancingFaces.length).toBeGreaterThanOrEqual(2)
    // 正常命中与暴击仍存在
    expect(hitFaces.length).toBeGreaterThan(0)
    expect(critFaces.length).toBe(1)
    // 20 个骰面覆盖全部结果
    expect(zeroDamage.length + glancingFaces.length + hitFaces.length + critFaces.length).toBe(20)
  })

  it('0 伤害比例随防御提高而上升（Defense 13 的 0 伤害面数 > Defense 10；确定性枚举）', () => {
    const countZero = (defense: number) =>
      Array.from({ length: 20 }, (_, i) => resolveAttack(i + 1, 4, defense, 6)).filter((r) => r.damage === 0).length
    expect(countZero(13)).toBe(4)
    expect(countZero(12)).toBe(3)
    expect(countZero(11)).toBe(2)
    expect(countZero(10)).toBe(1)
  })
})
