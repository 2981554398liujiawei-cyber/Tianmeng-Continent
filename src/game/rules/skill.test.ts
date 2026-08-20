import { describe, expect, it } from 'vitest'
import { getMageSpellDamage } from './combat'
import {
  getSkillExecutionInfo,
  isOncePerCombatSkill,
  isOncePerCombatUsed,
  isSuppressOnFullHitSkill,
  markOncePerCombatUsed,
  resolveSkillRawDamage,
  getUsableSkills,
  hasLearnedSkill,
  skillMpCost,
} from './skill'
import { SKILLS } from '../content/skills'

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

// ================= TM-P2-003-R2 B1/B2：resolver 元数据驱动 + once 按 skillId 独立 =================

describe('TM-P2-003-R2 B1：注册表携带 damageResolver，rules 按 type 分发', () => {
  it('四个职业技能均有 damageResolver（元数据驱动，无 skillId switch）', () => {
    for (const id of ['mage_spell', 'knight_power_strike', 'ranger_swift_strike', 'warrior_suppress_strike']) {
      expect(getSkillExecutionInfo(id)?.skill.combat?.damageResolver).toBeDefined()
    }
  })

  it('resolver 元数据正确（attack_power bonus / agility_power bonus / magic_spell）', () => {
    expect(getSkillExecutionInfo('knight_power_strike')?.skill.combat?.damageResolver).toMatchObject({ type: 'attack_power', bonus: 2 })
    expect(getSkillExecutionInfo('warrior_suppress_strike')?.skill.combat?.damageResolver).toMatchObject({ type: 'attack_power', bonus: 1 })
    expect(getSkillExecutionInfo('ranger_swift_strike')?.skill.combat?.damageResolver).toMatchObject({ type: 'agility_power', bonus: 2 })
    expect(getSkillExecutionInfo('mage_spell')?.skill.combat?.damageResolver).toMatchObject({ type: 'magic_spell' })
  })

  it('同 resolver 类型不同 bonus 走同一分支（attack_power：骑士 +2 / 压制 +1）', () => {
    const ctx = { str: 14, agi: 10, mnd: 14, weaponDamageBonus: 0, level: 1 }
    const base = 6 // STR14 修正 2 → 4+2+0+0 = 6
    expect(resolveSkillRawDamage('knight_power_strike', ctx)).toBe(base + 2)
    expect(resolveSkillRawDamage('warrior_suppress_strike', ctx)).toBe(base + 1)
  })

  it('无 damageResolver 的技能 → resolveSkillRawDamage null（拒绝执行）', () => {
    // 构造一个只有 oncePerCombat 没有 resolver 的合成技能（模拟未来元数据缺失）
    const original = SKILLS['ranger_swift_strike']!
    SKILLS['ranger_swift_strike'] = {
      ...original,
      combat: { ...original.combat!, damageResolver: undefined },
    } as (typeof SKILLS)[string]
    try {
      expect(resolveSkillRawDamage('ranger_swift_strike', { str: 10, agi: 10, mnd: 10, weaponDamageBonus: 0, level: 1 })).toBeNull()
    } finally {
      SKILLS['ranger_swift_strike'] = original
    }
  })
})

describe('TM-P2-003-R2 B2：oncePerCombat 按 skillId 独立（两项 once 互不影响）', () => {
  it('使用技能 A 后，技能 B（同为 once）不受影响', () => {
    const usedA = markOncePerCombatUsed(new Set(), 'ranger_swift_strike')
    expect(isOncePerCombatUsed(usedA, 'ranger_swift_strike')).toBe(true)
    // 另一 once 技能（未来技能）不受影响
    expect(isOncePerCombatUsed(usedA, 'future_once_skill')).toBe(false)
    // 非 once 技能更不受影响
    expect(isOncePerCombatUsed(usedA, 'knight_power_strike')).toBe(false)
  })

  it('markOncePerCombatUsed 不修改原 Set（不可变语义）', () => {
    const before = new Set<string>()
    const after = markOncePerCombatUsed(before, 'ranger_swift_strike')
    expect(before.has('ranger_swift_strike')).toBe(false)
    expect(after.has('ranger_swift_strike')).toBe(true)
    expect(after.has('future_once_skill')).toBe(false)
  })

  it('两个 once 技能分别标记后互相独立', () => {
    let used = new Set<string>()
    used = markOncePerCombatUsed(used, 'ranger_swift_strike')
    used = markOncePerCombatUsed(used, 'future_once_skill')
    expect(isOncePerCombatUsed(used, 'ranger_swift_strike')).toBe(true)
    expect(isOncePerCombatUsed(used, 'future_once_skill')).toBe(true)
  })
})
