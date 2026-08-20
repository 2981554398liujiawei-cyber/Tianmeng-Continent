import { describe, expect, it } from 'vitest'
import { getMageSpellDamage } from './combat'
import {
  getSkillExecutionInfo,
  isOncePerCombatSkill,
  isSuppressOnFullHitSkill,
  resolveSkillRawDamage,
  getUsableSkills,
  hasLearnedSkill,
  skillMpCost,
} from './skill'

const CTX = { str: 14, agi: 10, mnd: 14, weaponDamageBonus: 0, level: 1 }

describe('TM-P2-003-R1 B：技能执行注册化（rules/skill）', () => {
  it('未知技能 → getSkillExecutionInfo null / resolveSkillRawDamage null / mpCost 0', () => {
    expect(getSkillExecutionInfo('not_a_skill')).toBeNull()
    expect(resolveSkillRawDamage('not_a_skill', CTX)).toBeNull()
    expect(skillMpCost('not_a_skill')).toBe(0)
    expect(isOncePerCombatSkill('not_a_skill')).toBe(false)
    expect(isSuppressOnFullHitSkill('not_a_skill')).toBe(false)
  })

  it('技能执行元数据来自注册表（mpCost / oncePerCombat / suppress）', () => {
    expect(getSkillExecutionInfo('mage_spell')?.mpCost).toBe(2)
    expect(getSkillExecutionInfo('ranger_swift_strike')?.oncePerCombat).toBe(true)
    expect(getSkillExecutionInfo('ranger_swift_strike')?.mpCost).toBe(0)
    expect(getSkillExecutionInfo('warrior_suppress_strike')?.suppressCounterOnFullHit).toBe(true)
  })

  it('oncePerCombat 按 skillId 独立（迅捷突袭 true；其他 false）', () => {
    expect(isOncePerCombatSkill('ranger_swift_strike')).toBe(true)
    expect(isOncePerCombatSkill('mage_spell')).toBe(false)
    expect(isOncePerCombatSkill('knight_power_strike')).toBe(false)
    expect(isOncePerCombatSkill('warrior_suppress_strike')).toBe(false)
  })

  it('伤害 resolver：法术 MND 公式 / 骑士重击 +2 / 压制 +1 / 迅捷 AGI 公式', () => {
    expect(resolveSkillRawDamage('mage_spell', CTX)).toBe(getMageSpellDamage(14) + 0)
    expect(resolveSkillRawDamage('knight_power_strike', CTX)).toBe(8) // 攻击力 6 + 2
    expect(resolveSkillRawDamage('warrior_suppress_strike', CTX)).toBe(7) // 攻击力 6 + 1
    expect(resolveSkillRawDamage('ranger_swift_strike', CTX)).toBe(6) // AGI10 修正 0 → 4 + 2
  })

  it('getUsableSkills：learnedSkillIds → 注册表过滤（未知/职业不匹配忽略）', () => {
    const skills = getUsableSkills(['knight_power_strike', 'mage_spell', 'bogus'], 'knight')
    expect(skills.map((s) => s.id)).toEqual(['knight_power_strike'])
    expect(getUsableSkills(undefined, 'knight')).toEqual([])
  })

  it('hasLearnedSkill：显式包含才 true', () => {
    expect(hasLearnedSkill(['knight_power_strike'], 'knight_power_strike')).toBe(true)
    expect(hasLearnedSkill([], 'knight_power_strike')).toBe(false)
    expect(hasLearnedSkill(undefined, 'knight_power_strike')).toBe(false)
  })
})
