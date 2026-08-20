import { describe, expect, it } from 'vitest'
import {
  applyArmor,
  formatAttackLog,
  getCombatPhaseAfterEnemyAttack,
  getEnemyAgility,
  getEnemyArmor,
  getEnemyAttackPower,
  getKnightPowerStrikeDamage,
  getMageSpellDamage,
  getPlayerAgility,
  getPlayerArmor,
  getPlayerAttackPower,
  getPlayerLevelDamageBonus,
  getRangerSwiftStrikeDamage,
  KNIGHT_POWER_STRIKE_MP_COST,
  MAGE_SPELL_MP_COST,
  performAttack,
  resolveAttack,
  resolveHit,
  resolveInitiative,
  resolvePlayerStrike,
  WARRIOR_SUPPRESS_STRIKE_MP_COST,
} from './combat'
import { ENEMIES } from '../content/enemies'
import { createInitialGameState } from '../content/initial'

describe('TM-P2-002 A：玩家派生属性（攻击力/护甲/敏捷）', () => {
  it('攻击力 = max(1, 4 + STR修正 + 武器 + 等级加成)', () => {
    expect(getPlayerAttackPower(14)).toBe(6) // +2 修正，Lv1 等级加成 0
    expect(getPlayerAttackPower(8)).toBe(3) // -1 修正
    expect(getPlayerAttackPower(16)).toBe(7) // +3 修正
    expect(getPlayerAttackPower(14, 2)).toBe(8) // 铁剑 +2
    expect(getPlayerAttackPower(14, 0, 3)).toBe(7) // Lv3 等级加成 +1
    expect(getPlayerAttackPower(14, 2, 5)).toBe(10) // 4+2+2+2
  })

  it('攻击力最低 1（极端低 STR）', () => {
    expect(getPlayerAttackPower(4)).toBe(1) // 4 + (-3) = 1
  })

  it('非法武器加成抛 RangeError', () => {
    expect(() => getPlayerAttackPower(14, -1)).toThrow(RangeError)
    expect(() => getPlayerAttackPower(14, 1.5)).toThrow(RangeError)
    expect(() => getPlayerAttackPower(14, Number.NaN)).toThrow(RangeError)
  })

  it('护甲 = max(0, 10 + CON修正 + 装备护甲加成)', () => {
    expect(getPlayerArmor(12)).toBe(11) // +1 修正
    expect(getPlayerArmor(10)).toBe(10)
    expect(getPlayerArmor(16)).toBe(13)
    expect(getPlayerArmor(8)).toBe(9)
    expect(getPlayerArmor(12, 2)).toBe(13) // 装备护甲 +2
    expect(getPlayerArmor(4)).toBe(7) // 修正 -3 → 10-3
  })

  it('护甲下限为 0（max(0, ...) 防御性钳制）', () => {
    // 玩家属性范围 8–16 时护甲恒 >= 9；max(0, ...) 保护极端非典型输入
    expect(getPlayerArmor(8)).toBe(9)
    expect(getPlayerArmor(16, 0)).toBe(13)
    expect(Math.max(0, getPlayerArmor(0))).toBe(5)
  })

  it('敏捷 = AGI 原始属性（不再用 AGI 推导护甲）', () => {
    expect(getPlayerAgility(8)).toBe(8)
    expect(getPlayerAgility(16)).toBe(16)
  })

  it('非法护甲加成抛 RangeError', () => {
    expect(() => getPlayerArmor(12, -1)).toThrow(RangeError)
    expect(() => getPlayerArmor(12, Number.NaN)).toThrow(RangeError)
  })

  it('敌人数据语义：attackPower/armor/agility 直接读取（无派生公式）', () => {
    expect(getEnemyAttackPower(2)).toBe(2)
    expect(getEnemyArmor(11)).toBe(11)
    expect(getEnemyAgility(10)).toBe(10)
    expect(() => getEnemyAttackPower(0)).toThrow(RangeError)
  })
})

describe('TM-P2-002 B：命中判定（敏捷制）', () => {
  it('天然 1 → critical_miss（0 伤害）', () => {
    const r = resolveAttack(1, 10, 10, 6, 11)
    expect(r.outcome).toBe('critical_miss')
    expect(r.hit).toBe(false)
    expect(r.damage).toBe(0)
  })

  it('天然 20 → critical_hit（原始伤害 ×2）', () => {
    const r = resolveAttack(20, 10, 10, 6, 11)
    expect(r.outcome).toBe('critical_hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(true)
  })

  it('(攻击者敏捷 + roll)/2 >= 防守者敏捷 → hit', () => {
    // AGI 10 vs AGI 10：roll 10 → (10+10)/2 = 10 >= 10 → hit
    expect(resolveHit(10, 10, 10)).toBe('hit')
    // AGI 12 vs AGI 10：roll 8 → (12+8)/2 = 10 >= 10 → hit
    expect(resolveHit(8, 12, 10)).toBe('hit')
  })

  it('低于阈值 → glancing_hit（擦伤，原始伤害 50% 向上取整）', () => {
    // AGI 10 vs AGI 10：roll 9 → 9.5 < 10 → glancing
    expect(resolveHit(9, 10, 10)).toBe('glancing_hit')
    const r = resolveAttack(9, 10, 10, 6, 11)
    expect(r.outcome).toBe('glancing_hit')
    expect(r.hit).toBe(true)
    expect(r.critical).toBe(false)
  })

  it('取消旧 Defense-4 擦中区间（V3 不再有 total<defense-4 的纯 miss）', () => {
    // V2 语义下 total < defense-4 → miss；V3 下同骰面由敏捷判定，擦中仍造成伤害
    const r = resolveAttack(5, 8, 10, 6, 11) // (8+5)/2=6.5 < 10 → glancing
    expect(r.outcome).toBe('glancing_hit')
    expect(r.damage).toBeGreaterThan(0)
  })

  it('擦伤伤害 = max(1, ceil(raw × 0.5)) 后再过护甲', () => {
    // raw 7 → 擦伤倍率 ceil(3.5)=4；护甲 0 → 最终 4
    const r = resolveAttack(9, 10, 10, 7, 0)
    expect(r.outcome).toBe('glancing_hit')
    expect(r.damage).toBe(4)
  })
})

describe('TM-P2-002 C：护甲减伤', () => {
  it('finalDamage = max(1, ceil(raw × roll/(armor+roll)))', () => {
    // raw 6, armor 11, roll 10 → 10/21 → ceil(2.857) = 3
    expect(applyArmor(6, 11, 10)).toBe(3)
    const r = resolveAttack(10, 10, 10, 6, 11)
    expect(r.outcome).toBe('hit')
    expect(r.damage).toBe(3)
  })

  it('护甲 0 → 满伤（takenRate = 1）', () => {
    expect(applyArmor(6, 0, 10)).toBe(6)
    const r = resolveAttack(10, 10, 10, 6, 0)
    expect(r.damage).toBe(6)
  })

  it('极高护甲 → 最终至少 1 点伤害', () => {
    expect(applyArmor(6, 100, 10)).toBe(1)
    expect(applyArmor(6, 1000, 10)).toBe(1)
    const r = resolveAttack(10, 10, 10, 6, 100)
    expect(r.damage).toBe(1)
  })

  it('小数伤害向上取整（奇数伤害/高护甲）', () => {
    // raw 7, armor 5, roll 10 → 10/15 → ceil(4.667) = 5
    expect(applyArmor(7, 5, 10)).toBe(5)
    // raw 9, armor 8, roll 6 → 6/14 → ceil(3.857) = 4
    expect(applyArmor(9, 8, 6)).toBe(4)
  })

  it('暴击顺序：raw × 2 → 护甲', () => {
    // raw 6 暴击 → 12；armor 11, roll 20 → 20/31 → ceil(7.74) = 8
    const r = resolveAttack(20, 10, 10, 6, 11)
    expect(r.outcome).toBe('critical_hit')
    expect(r.damage).toBe(8)
  })

  it('擦伤顺序：raw × 50% → 护甲', () => {
    // raw 6 擦伤 → 3；armor 11, roll 9 → 9/20 → ceil(1.35) = 2
    const r = resolveAttack(9, 10, 10, 6, 11)
    expect(r.outcome).toBe('glancing_hit')
    expect(r.damage).toBe(2)
  })

  it('damageTakenRate = roll/(armor+roll) 供日志展示', () => {
    const r = resolveAttack(10, 10, 10, 6, 11)
    expect(r.damageTakenRate).toBeCloseTo(10 / 21)
  })
})

describe('TM-P2-002 D：先手', () => {
  it('D20+AGI 高者先手', () => {
    // 玩家 AGI 8 roll 15 → 23；敌人 AGI 10 roll 10 → 20 → 玩家先
    expect(resolveInitiative(8, 10, 15, 10)).toBe('player')
    // 玩家 18 vs 敌人 25 → 敌人先
    expect(resolveInitiative(8, 10, 10, 15)).toBe('enemy')
  })

  it('平局 → AGI 高者先手', () => {
    // 玩家 20 vs 敌人 20 → 平局 → 敌人 AGI 10 > 玩家 8 → 敌人先
    expect(resolveInitiative(8, 10, 12, 10)).toBe('enemy')
    // 玩家 AGI 高 → 玩家先
    expect(resolveInitiative(12, 10, 10, 12)).toBe('player')
  })

  it('平局且 AGI 相同 → 玩家先手', () => {
    expect(resolveInitiative(8, 8, 10, 10)).toBe('player')
    expect(resolveInitiative(10, 10, 5, 5)).toBe('player')
  })

  it('非法输入抛 RangeError', () => {
    expect(() => resolveInitiative(8, 10, 0, 10)).toThrow(RangeError)
    expect(() => resolveInitiative(8, 10, 21, 10)).toThrow(RangeError)
  })
})

describe('TM-P2-002 F：所有现有职业技能均走 V3（敏捷命中 + 护甲减伤）', () => {
  const player = createInitialGameState().player
  const rabbit = ENEMIES.corrupted_rabbit!
  const playerAgility = getPlayerAgility(player.attributes.agi)

  it('普通攻击走 V3 结算', () => {
    const raw = getPlayerAttackPower(player.attributes.str, 0, player.level)
    const r = resolveAttack(10, playerAgility, rabbit.agility, raw, rabbit.armor)
    // (10+10)/2=10 >= 10 → hit
    expect(r.outcome).toBe('hit')
    expect(r.damage).toBeGreaterThanOrEqual(1)
  })

  it('法师法术攻击：rawDamage 用 MND，命中统一用敏捷', () => {
    const raw = getMageSpellDamage(player.attributes.mnd)
    const r = resolveAttack(20, playerAgility, rabbit.agility, raw, rabbit.armor)
    expect(r.outcome).toBe('critical_hit')
    expect(r.damage).toBeGreaterThanOrEqual(1)
    // 无命中加值概念：命中只依赖敏捷与骰面
    expect(r.attackerAgility).toBe(playerAgility)
  })

  it('骑士重击走 V3', () => {
    const raw = getKnightPowerStrikeDamage(player.attributes.str, 0, player.level)
    const r = resolveAttack(10, playerAgility, rabbit.agility, raw, rabbit.armor)
    expect(['hit', 'glancing_hit']).toContain(r.outcome)
  })

  it('游侠迅捷突袭走 V3', () => {
    const raw = getRangerSwiftStrikeDamage(player.attributes.agi, 0, player.level)
    const r = resolveAttack(10, playerAgility, rabbit.agility, raw, rabbit.armor)
    expect(['hit', 'glancing_hit']).toContain(r.outcome)
  })

  it('战士压制猛击 = 普通攻击公式走 V3', () => {
    const raw = getPlayerAttackPower(player.attributes.str, 0, player.level)
    const r = resolveAttack(10, playerAgility, rabbit.agility, raw, rabbit.armor)
    expect(r.damage).toBeGreaterThanOrEqual(1)
  })

  it('MP 消耗常量保持（本卡不开发技能系统）', () => {
    expect(MAGE_SPELL_MP_COST).toBe(2)
    expect(KNIGHT_POWER_STRIKE_MP_COST).toBe(2)
    expect(WARRIOR_SUPPRESS_STRIKE_MP_COST).toBe(2)
  })
})

describe('TM-P0-007：随机入口 performAttack（V3 签名）', () => {
  it('多次执行后 roll 始终为 1–20 整数且结果有限', () => {
    for (let i = 0; i < 100; i++) {
      const r = performAttack(10, 10, 6, 11)
      expect(Number.isInteger(r.roll)).toBe(true)
      expect(r.roll).toBeGreaterThanOrEqual(1)
      expect(r.roll).toBeLessThanOrEqual(20)
      expect(Number.isFinite(r.damage)).toBe(true)
    }
  })
})

describe('TM-P0-008-R1：确定性战斗阶段结算', () => {
  it('致死攻击 → enemyHp 0 / victory / 不反击', () => {
    const attack = resolveAttack(20, 10, 10, 6, 0) // 暴击 12，护甲 0
    const r = resolvePlayerStrike(6, attack)
    expect(r.enemyHp).toBe(0)
    expect(r.phase).toBe('victory')
    expect(r.enemyShouldCounter).toBe(false)
  })

  it('超额伤害截断为 0（不得负数）', () => {
    const attack = resolveAttack(20, 10, 10, 6, 0)
    const r = resolvePlayerStrike(2, attack)
    expect(r.enemyHp).toBe(0)
    expect(r.phase).toBe('victory')
  })

  it('未击杀 → active / 允许反击', () => {
    const attack = resolveAttack(10, 10, 10, 6, 11) // 命中 3 伤
    const r = resolvePlayerStrike(8, attack)
    expect(r.enemyHp).toBe(5)
    expect(r.phase).toBe('active')
    expect(r.enemyShouldCounter).toBe(true)
  })

  it('critical_miss → 敌人 HP 不变 / active / 允许反击', () => {
    const miss = resolveAttack(1, 10, 10, 6, 11)
    expect(miss.hit).toBe(false)
    const r = resolvePlayerStrike(8, miss)
    expect(r.enemyHp).toBe(8)
    expect(r.phase).toBe('active')
    expect(r.enemyShouldCounter).toBe(true)
  })

  it('玩家 HP=0 → defeat；HP>0 → active', () => {
    expect(getCombatPhaseAfterEnemyAttack(0)).toBe('defeat')
    expect(getCombatPhaseAfterEnemyAttack(1)).toBe('active')
  })
})

describe('TM-P2-002 输入异常抛 RangeError', () => {
  it('roll 非法：0 / 21 / 1.5', () => {
    expect(() => resolveAttack(0, 10, 10, 6, 11)).toThrow(RangeError)
    expect(() => resolveAttack(21, 10, 10, 6, 11)).toThrow(RangeError)
    expect(() => resolveAttack(1.5, 10, 10, 6, 11)).toThrow(RangeError)
  })

  it('敏捷非法：-1 / NaN', () => {
    expect(() => resolveAttack(10, -1, 10, 6, 11)).toThrow(RangeError)
    expect(() => resolveAttack(10, Number.NaN, 10, 6, 11)).toThrow(RangeError)
  })

  it('护甲非法：-1', () => {
    expect(() => resolveAttack(10, 10, 10, 6, -1)).toThrow(RangeError)
  })

  it('原始伤害非法：0 / 1.5', () => {
    expect(() => resolveAttack(10, 10, 10, 0, 11)).toThrow(RangeError)
    expect(() => resolveAttack(10, 10, 10, 1.5, 11)).toThrow(RangeError)
  })

  it('applyArmor 非法输入', () => {
    expect(() => applyArmor(6, 11, 0)).toThrow(RangeError)
    expect(() => applyArmor(0, 11, 10)).toThrow(RangeError)
  })
})

describe('TM-P2-002 无副作用', () => {
  it('玩家攻击 / 敌人攻击后 GameState 完全不变', () => {
    const state = createInitialGameState()
    const snapshot = JSON.stringify(state)
    const { str, con, agi } = state.player.attributes
    const enemy = ENEMIES.corrupted_rabbit!
    const raw = getPlayerAttackPower(str, 0, state.player.level)
    resolveAttack(10, getPlayerAgility(agi), enemy.agility, raw, enemy.armor)
    resolveAttack(10, enemy.agility, getPlayerAgility(agi), enemy.attackPower, getPlayerArmor(con))
    expect(JSON.stringify(state)).toBe(snapshot)
    expect(state.player.hp).toBe(state.player.maxHp)
  })
})

describe('TM-P2-002 平衡抽样（枚举骰面，确定性）', () => {
  it('玩家 AGI 10 vs 敌人 AGI 10：天然1 必 0 伤；其余骰面全部造成 >=1 伤害', () => {
    const results = Array.from({ length: 20 }, (_, i) => resolveAttack(i + 1, 10, 10, 6, 11))
    expect(results[0]!.damage).toBe(0) // roll 1
    for (let i = 1; i < 20; i++) {
      expect(results[i]!.damage, `roll ${i + 1}`).toBeGreaterThanOrEqual(1)
    }
    // 命中/擦伤/暴击齐全
    expect(results.some((r) => r.outcome === 'hit')).toBe(true)
    expect(results.some((r) => r.outcome === 'glancing_hit')).toBe(true)
    expect(results.some((r) => r.outcome === 'critical_hit')).toBe(true)
  })

  it('高敏捷攻击方命中占比更高（AGI 14 vs AGI 8）', () => {
    const countMissish = (attAgi: number, defAgi: number) =>
      Array.from({ length: 20 }, (_, i) => resolveAttack(i + 1, attAgi, defAgi, 6, 11)).filter(
        (r) => r.outcome === 'glancing_hit' || r.outcome === 'critical_miss',
      ).length
    expect(countMissish(14, 8)).toBeLessThan(countMissish(8, 14))
  })
})

// ================= TM-P2-002-R1 B：战斗日志格式 =================

describe('TM-P2-002-R1 B：formatAttackLog 命中值公式与字段区分', () => {
  it('2–19 普通骰面：命中值 = (D20 + 敏捷) / 2，明确区分字段', () => {
    // roll 9、攻方敏捷 12、守方敏捷 10、攻击力 8、护甲 11 → (12+9)/2=10.5 >= 10 → 命中
    const r = resolveAttack(9, 12, 10, 8, 11)
    expect(r.outcome).toBe('hit')
    expect(r.hitValue).toBe(10.5)
    const lines = formatAttackLog(r, '魔化兔')
    expect(lines[0]).toBe('命中值 = (D20 9 + 敏捷 12) / 2 = 10.5')
    expect(lines[1]).toBe('对方敏捷 = 10；结果：命中')
    // 字段区分：攻击力 / 原始伤害 / 护甲 / 承伤率 / 最终伤害
    expect(lines[2]).toContain('攻击力 8')
    expect(lines[2]).toContain('原始伤害 8')
    expect(lines[2]).toContain('魔化兔护甲 11')
    expect(lines[2]).toContain('承伤率 9 / (11 + 9)')
    expect(lines[2]).toMatch(/最终造成 \d+ 点伤害/)
  })

  it('擦伤：命中值公式 + ×50% + 字段区分', () => {
    // roll 2、攻方敏捷 8、守方敏捷 10 → (8+2)/2=5 < 10 → 擦伤
    const r = resolveAttack(2, 8, 10, 7, 12)
    expect(r.outcome).toBe('glancing_hit')
    const lines = formatAttackLog(r, '魔化兔')
    expect(lines[0]).toBe('命中值 = (D20 2 + 敏捷 8) / 2 = 5')
    expect(lines[1]).toBe('对方敏捷 = 10；结果：擦伤')
    expect(lines[2]).toContain('攻击力 7 × 50%')
    expect(lines[2]).toContain('原始伤害')
  })

  it('天然 1：大失败，不进行普通命中阈值比较', () => {
    const r = resolveAttack(1, 12, 10, 8, 11)
    expect(r.outcome).toBe('critical_miss')
    expect(r.hitValue).toBeNull()
    const lines = formatAttackLog(r, '魔化兔')
    expect(lines[0]).toBe('天然1：大失败，不进行普通命中阈值比较。')
    expect(lines[1]).toBe('未造成伤害。')
  })

  it('天然 20：暴击，不进行普通命中阈值比较；攻击力 ×2', () => {
    const r = resolveAttack(20, 12, 10, 8, 11)
    expect(r.outcome).toBe('critical_hit')
    expect(r.hitValue).toBeNull()
    const lines = formatAttackLog(r, '魔化兔')
    expect(lines[0]).toBe('天然20：暴击，不进行普通命中阈值比较。')
    expect(lines[1]).toContain('攻击力 8 × 2 = 16')
    expect(lines[1]).toContain('最终造成')
  })

  it('日志不含「D20 8 + 攻击加值 4 = 12」式误导（D20 不被当成攻击力）', () => {
    const r = resolveAttack(9, 12, 10, 8, 11)
    const lines = formatAttackLog(r, '魔化兔')
    const joined = lines.join('')
    expect(joined).not.toContain('攻击加值')
    expect(joined).toContain('命中值')
  })
})
