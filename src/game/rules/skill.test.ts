import { describe, expect, it } from 'vitest'
import { getMageSpellDamage } from './combat'
import {
  filterUsableEnemySkills,
  getSkillExecutionInfo,
  isOncePerCombatSkill,
  isOncePerCombatUsed,
  isSuppressOnFullHitSkill,
  markOncePerCombatUsed,
  resolveEnemySkillRawDamage,
  resolveSkillRawDamage,
  getUsableSkills,
  hasLearnedSkill,
  skillCooldownTurns,
  skillMpCost,
  checkSkillUse,
} from './skill'
import { SKILLS } from '../content/skills'
import { ENEMIES } from '../content/enemies'

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

// ================= TM-P2-003-R3 C：checkSkillUse 统一纯校验（K2） =================

describe('TM-P2-003-R3 C：checkSkillUse 统一技能使用校验', () => {
  const knightCtx = {
    learnedSkillIds: ['knight_power_strike'],
    profession: 'knight' as const,
    mp: 6,
    maxMp: 6,
  }

  it('11: 未知技能 → unknown_skill / blocked', () => {
    const r = checkSkillUse('not_a_skill', knightCtx)
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('unknown_skill')
  })

  it('12: 未学习技能 → blocked (not_learned)', () => {
    const r = checkSkillUse('mage_spell', knightCtx)
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('not_learned')
  })

  it('13: 职业不匹配（已学习但职业不同）→ blocked (profession_mismatch)', () => {
    const r = checkSkillUse('mage_spell', { ...knightCtx, learnedSkillIds: ['mage_spell'] })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('profession_mismatch')
  })

  it('14: profession undefined 通用技能 + 已学习 → 玩家允许使用', () => {
    const original = SKILLS['test_general_skill']
    SKILLS['test_general_skill'] = {
      id: 'test_general_skill',
      name: '通用测试技能',
      description: '',
      mpCost: 1,
      tags: ['physical'],
    }
    try {
      const r = checkSkillUse('test_general_skill', { ...knightCtx, learnedSkillIds: ['test_general_skill'] })
      expect(r.allowed).toBe(true)
      expect(r.mpCost).toBe(1)
      // 任意职业均可使用
      const mage = checkSkillUse('test_general_skill', {
        learnedSkillIds: ['test_general_skill'],
        profession: 'mage',
        mp: 6,
        maxMp: 6,
      })
      expect(mage.allowed).toBe(true)
    } finally {
      if (original) SKILLS['test_general_skill'] = original
      else delete SKILLS['test_general_skill']
    }
  })

  it('15: maxMp < 0 → blocked (invalid_max_mp)', () => {
    const r = checkSkillUse('knight_power_strike', { ...knightCtx, maxMp: -1 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_max_mp')
  })

  it('16: maxMp 非 safe integer → blocked (invalid_max_mp)', () => {
    const r = checkSkillUse('knight_power_strike', { ...knightCtx, maxMp: Number.MAX_SAFE_INTEGER + 1 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_max_mp')
  })

  it('17: mp < 0 → blocked (invalid_mp)', () => {
    const r = checkSkillUse('knight_power_strike', { ...knightCtx, mp: -1 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_mp')
  })

  it('18: mp > maxMp → blocked (invalid_mp)', () => {
    const r = checkSkillUse('knight_power_strike', { ...knightCtx, mp: 7, maxMp: 6 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('invalid_mp')
  })

  it('19: mp NaN / Infinity / unsafe → blocked (invalid_mp)', () => {
    expect(checkSkillUse('knight_power_strike', { ...knightCtx, mp: NaN }).reason).toBe('invalid_mp')
    expect(checkSkillUse('knight_power_strike', { ...knightCtx, mp: Infinity }).reason).toBe('invalid_mp')
    expect(
      checkSkillUse('knight_power_strike', { ...knightCtx, mp: Number.MAX_SAFE_INTEGER + 1 }).reason,
    ).toBe('invalid_mp')
  })

  it('20: mpCost 非法（负数 / 非整数）→ blocked (invalid_cost)', () => {
    const originalBadCost = SKILLS['test_bad_cost']
    SKILLS['test_bad_cost'] = {
      id: 'test_bad_cost',
      name: '坏消耗测试技能',
      description: '',
      mpCost: -1,
      tags: ['physical'],
    }
    const originalFracCost = SKILLS['test_frac_cost']
    SKILLS['test_frac_cost'] = {
      id: 'test_frac_cost',
      name: '小数消耗测试技能',
      description: '',
      mpCost: 1.5,
      tags: ['physical'],
    }
    try {
      const neg = checkSkillUse('test_bad_cost', { ...knightCtx, learnedSkillIds: ['test_bad_cost'] })
      expect(neg.allowed).toBe(false)
      expect(neg.reason).toBe('invalid_cost')
      const frac = checkSkillUse('test_frac_cost', { ...knightCtx, learnedSkillIds: ['test_frac_cost'] })
      expect(frac.allowed).toBe(false)
      expect(frac.reason).toBe('invalid_cost')
    } finally {
      if (originalBadCost) SKILLS['test_bad_cost'] = originalBadCost
      else delete SKILLS['test_bad_cost']
      if (originalFracCost) SKILLS['test_frac_cost'] = originalFracCost
      else delete SKILLS['test_frac_cost']
    }
  })

  it('21: MP 不足 → blocked (insufficient_mp)', () => {
    const r = checkSkillUse('knight_power_strike', { ...knightCtx, mp: 1 })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('insufficient_mp')
  })

  it('22: MP 刚好足够 → allowed', () => {
    const r = checkSkillUse('knight_power_strike', { ...knightCtx, mp: 2 })
    expect(r.allowed).toBe(true)
    expect(r.mpCost).toBe(2)
  })

  it('23: 0 MP 技能 → allowed（但仍要求存在 + 已学习 + 职业兼容）', () => {
    const r = checkSkillUse('ranger_swift_strike', {
      learnedSkillIds: ['ranger_swift_strike'],
      profession: 'ranger',
      mp: 0,
      maxMp: 6,
    })
    expect(r.allowed).toBe(true)
    expect(r.mpCost).toBe(0)
    // 未学习 → blocked
    const notLearned = checkSkillUse('ranger_swift_strike', { ...knightCtx, profession: 'ranger', learnedSkillIds: [] })
    expect(notLearned.allowed).toBe(false)
    expect(notLearned.reason).toBe('not_learned')
  })
})

// ================= TM-P2-003-R3 C：getUsableSkills 去重与通用技能（K3） =================

describe('TM-P2-003-R3 C：getUsableSkills 重复/未知/通用技能解析', () => {
  it('24: 未知 ID 安全忽略', () => {
    const skills = getUsableSkills(['bogus_skill', 'knight_power_strike'], 'knight')
    expect(skills.map((s) => s.id)).toEqual(['knight_power_strike'])
  })

  it('25: 重复 ID 去重（mage_spell, mage_spell → 只一个）', () => {
    const skills = getUsableSkills(['mage_spell', 'mage_spell'], 'mage')
    expect(skills.map((s) => s.id)).toEqual(['mage_spell'])
  })

  it('26: 去重保持首次出现顺序稳定', () => {
    const skills = getUsableSkills(
      ['mage_spell', 'bogus', 'mage_spell', 'knight_power_strike', 'mage_spell'],
      'mage',
    )
    // bogus 未知忽略、knight 职业不匹配忽略、mage_spell 重复保留首次
    expect(skills.map((s) => s.id)).toEqual(['mage_spell'])
  })

  it('27: 职业不匹配忽略', () => {
    const skills = getUsableSkills(['mage_spell', 'knight_power_strike'], 'knight')
    expect(skills.map((s) => s.id)).toEqual(['knight_power_strike'])
  })

  it('28: professionless 通用技能保留（任意职业）', () => {
    const original = SKILLS['test_general_skill']
    SKILLS['test_general_skill'] = {
      id: 'test_general_skill',
      name: '通用测试技能',
      description: '',
      mpCost: 1,
      tags: ['physical'],
    }
    try {
      const knight = getUsableSkills(['test_general_skill'], 'knight')
      expect(knight.map((s) => s.id)).toEqual(['test_general_skill'])
      const mage = getUsableSkills(['test_general_skill'], 'mage')
      expect(mage.map((s) => s.id)).toEqual(['test_general_skill'])
    } finally {
      if (original) SKILLS['test_general_skill'] = original
      else delete SKILLS['test_general_skill']
    }
  })
})

// ================= TM-P2-009-R1 §10：敌人技能（resolveEnemySkillRawDamage / filterUsableEnemySkills / cooldown） =================

describe('TM-P2-009-R1 §10：敌人技能结算（EnemySkillContext）', () => {
  it('attack_power：敌人攻击力 + bonus（疯狂撕咬 / 骨刃斩）', () => {
    // 魔化兔 attack 16 → 16 + 2 = 18
    expect(resolveEnemySkillRawDamage('enemy_rabbit_mad_bite', { attackPower: 16, agility: 10 })).toBe(18)
    // 骷髅士兵 attack 20 → 20 + 2 = 22
    expect(resolveEnemySkillRawDamage('enemy_bone_blade', { attackPower: 20, agility: 8 })).toBe(22)
  })

  it('agility_power：敌人敏捷 + bonus（鼠群突袭 / 残影突袭）', () => {
    expect(resolveEnemySkillRawDamage('enemy_rat_swarm', { attackPower: 16, agility: 10 })).toBe(18)
    expect(resolveEnemySkillRawDamage('enemy_calamity_lunge', { attackPower: 14, agility: 10 })).toBe(17)
  })

  it('magic_spell：固定法术基准 6 + bonus（暗影箭 / 黑火球 / 夺魂哭嚎）', () => {
    expect(resolveEnemySkillRawDamage('enemy_dark_bolt', { attackPower: 14, agility: 8 })).toBe(16)
    expect(resolveEnemySkillRawDamage('enemy_black_fire', { attackPower: 14, agility: 8 })).toBe(18)
    expect(resolveEnemySkillRawDamage('enemy_witch_wail', { attackPower: 16, agility: 8 })).toBe(20)
  })

  it('未知技能 / 无 damageResolver → null（拒绝执行）', () => {
    expect(resolveEnemySkillRawDamage('not_a_skill', { attackPower: 10, agility: 10 })).toBeNull()
    // 敌人技能里没有任何 supportEffect-only 条目；用合成技能模拟缺失 resolver
    const original = SKILLS['test_enemy_no_resolver']
    SKILLS['test_enemy_no_resolver'] = {
      id: 'test_enemy_no_resolver',
      name: '无结算敌人技能',
      description: '',
      mpCost: 0,
      tags: ['physical'],
      combat: { damageFormula: '无 resolver' },
    }
    try {
      expect(resolveEnemySkillRawDamage('test_enemy_no_resolver', { attackPower: 10, agility: 10 })).toBeNull()
    } finally {
      if (original) SKILLS['test_enemy_no_resolver'] = original
      else delete SKILLS['test_enemy_no_resolver']
    }
  })
})

describe('TM-P2-009-R1 §10：敌人技能可用性过滤（filterUsableEnemySkills）', () => {
  const pool = () => [
    SKILLS['enemy_rabbit_mad_bite']!,
    SKILLS['enemy_wolf_vicious_pounce']!, // cd2
    SKILLS['sakura_magic_shield']!, // 玩家 once 技能（作 once 过滤样本）
  ]

  it('无冷却无 once → 全部可用', () => {
    const usable = filterUsableEnemySkills(pool())
    expect(usable.map((s) => s.id)).toEqual([
      'enemy_rabbit_mad_bite',
      'enemy_wolf_vicious_pounce',
      'sakura_magic_shield',
    ])
  })

  it('冷却中技能被过滤（cooldowns 按 skillId 计数 >0）', () => {
    const usable = filterUsableEnemySkills(pool(), { enemy_wolf_vicious_pounce: 1 })
    expect(usable.map((s) => s.id)).toEqual(['enemy_rabbit_mad_bite', 'sakura_magic_shield'])
  })

  it('once-per-combat 已用技能被过滤（usedOnce Set 语义）', () => {
    const usable = filterUsableEnemySkills(pool(), {}, new Set(['sakura_magic_shield']))
    expect(usable.map((s) => s.id)).toEqual(['enemy_rabbit_mad_bite', 'enemy_wolf_vicious_pounce'])
  })

  it('冷却 0 即可用（递减到 0 后恢复）', () => {
    const usable = filterUsableEnemySkills(pool(), { enemy_wolf_vicious_pounce: 0 })
    expect(usable.map((s) => s.id)).toContain('enemy_wolf_vicious_pounce')
  })

  it('空技能列表 / 全部冷却 → 返回空（AI 回退普攻）', () => {
    expect(filterUsableEnemySkills([])).toEqual([])
    const usable = filterUsableEnemySkills(pool(), { enemy_rabbit_mad_bite: 1, enemy_wolf_vicious_pounce: 1 })
    expect(usable.map((s) => s.id)).toEqual(['sakura_magic_shield'])
  })
})

describe('TM-P2-009-R1 §10：技能冷却回合数', () => {
  it('cd2 技能返回 2；无冷却/未知返回 0', () => {
    expect(skillCooldownTurns('enemy_wolf_vicious_pounce')).toBe(2)
    expect(skillCooldownTurns('enemy_rabbit_mad_bite')).toBe(0)
    expect(skillCooldownTurns('not_a_skill')).toBe(0)
  })
})

// ================= TM-P2-009-R1 §10：敌人技能挂载完整性（内容层校验） =================

describe('TM-P2-009-R1 §10：所有可战斗敌人会技能（enemy content 挂载）', () => {
  it('每个敌人至少 1 个主动技能，且 skillIds 均在技能注册表', () => {
    for (const enemy of Object.values(ENEMIES)) {
      expect(enemy.skillIds, `${enemy.id} 应有技能`).toBeDefined()
      expect(enemy.skillIds!.length, `${enemy.id} 应至少 1 个技能`).toBeGreaterThanOrEqual(1)
      for (const sid of enemy.skillIds!) {
        const skill = SKILLS[sid]
        expect(skill, `技能 ${sid} 应已注册`).toBeDefined()
        // 敌人技能：无职业、无 MP 消耗（敌人无 MP 系统）
        expect(skill?.profession, `${sid} 不应有职业`).toBeUndefined()
        expect(skill?.mpCost, `${sid} MP 消耗应为 0`).toBe(0)
      }
      expect(enemy.aiProfile, `${enemy.id} 应有 AI 画像`).toBeDefined()
    }
  })

  it('黑法师 / 骷髅女妖 / Boss 至少 2 个技能', () => {
    const requireTwo = ['black_mage', 'skeleton_witch', 'dudu_rabbit', 'skeleton_captain']
    for (const id of requireTwo) {
      expect(ENEMIES[id]!.skillIds!.length, `${id} 应至少 2 个技能`).toBeGreaterThanOrEqual(2)
    }
  })

  it('敌人技能均带 damageResolver（结算可用）且冷却语义合法', () => {
    for (const enemy of Object.values(ENEMIES)) {
      for (const sid of enemy.skillIds!) {
        const skill = SKILLS[sid]!
        expect(skill.combat?.damageResolver, `${sid} 应带 damageResolver`).toBeDefined()
        const cd = skill.combat?.cooldownTurns ?? 0
        expect(Number.isInteger(cd) && cd >= 0, `${sid} 冷却应为非负整数`).toBe(true)
      }
    }
  })
})
