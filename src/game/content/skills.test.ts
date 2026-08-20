import { describe, expect, it } from 'vitest'
import { SKILLS, DEFAULT_SKILLS_BY_PROFESSION, getSkill, defaultSkillsForProfession } from './skills'

describe('TM-P2-003 A：技能注册表（Skill Registry）', () => {
  it('四职业技能定义锁定（id/name/profession/mpCost/tags）', () => {
    expect(SKILLS.mage_spell).toMatchObject({ id: 'mage_spell', name: '法术攻击', profession: 'mage', mpCost: 2 })
    expect(SKILLS.mage_spell?.tags).toContain('magic')
    expect(SKILLS.knight_power_strike).toMatchObject({ id: 'knight_power_strike', name: '骑士重击', profession: 'knight', mpCost: 2 })
    expect(SKILLS.knight_power_strike?.tags).toContain('force')
    expect(SKILLS.ranger_swift_strike).toMatchObject({ id: 'ranger_swift_strike', name: '迅捷突袭', profession: 'ranger', mpCost: 0 })
    expect(SKILLS.ranger_swift_strike?.tags).toContain('movement')
    expect(SKILLS.ranger_swift_strike?.combat?.oncePerCombat).toBe(true)
    expect(SKILLS.warrior_suppress_strike).toMatchObject({ id: 'warrior_suppress_strike', name: '压制猛击', profession: 'warrior', mpCost: 2 })
    expect(SKILLS.warrior_suppress_strike?.tags).toContain('force')
    expect(SKILLS.warrior_suppress_strike?.combat?.suppressCounterOnFullHit).toBe(true)
  })

  it('压制猛击为「玩家攻击力 +1」（TM-P2-003 A 修正；低于骑士重击 +2）', () => {
    // 通过注册表 damageFormula 描述锁定
    expect(SKILLS.warrior_suppress_strike?.combat?.damageFormula).toContain('+ 1')
    expect(SKILLS.knight_power_strike?.combat?.damageFormula).toContain('+ 2')
  })

  it('各职业初始技能映射（新角色自动获得）', () => {
    expect(DEFAULT_SKILLS_BY_PROFESSION.warrior).toEqual(['warrior_suppress_strike'])
    expect(DEFAULT_SKILLS_BY_PROFESSION.knight).toEqual(['knight_power_strike'])
    expect(DEFAULT_SKILLS_BY_PROFESSION.ranger).toEqual(['ranger_swift_strike'])
    expect(DEFAULT_SKILLS_BY_PROFESSION.mage).toEqual(['mage_spell'])
  })

  it('defaultSkillsForProfession 返回副本（不共享引用）', () => {
    const a = defaultSkillsForProfession('knight')
    a.push('fake')
    expect(defaultSkillsForProfession('knight')).toEqual(['knight_power_strike'])
  })

  it('未知/损坏 skillId 安全忽略（getSkill 返回 undefined）', () => {
    expect(getSkill('not_a_skill')).toBeUndefined()
    expect(getSkill('')).toBeUndefined()
  })
})
