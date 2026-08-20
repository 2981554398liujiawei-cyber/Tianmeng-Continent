import type { ProfessionId } from '../types'
import type { SkillDefinition } from '../types/skill'

/**
 * 技能注册表（TM-P2-003 A：Skill Registry）。
 * 四职业技能迁入注册表；场景/战斗按 id 查询、按 Tag 判断解法。
 * V3 命中/护甲规则不变（combat.ts）；伤害公式描述仅供参考，结算仍走既有纯函数。
 */
export const SKILLS: Record<string, SkillDefinition> = {
  // ---- 法师（TM-P1-001）----
  mage_spell: {
    id: 'mage_spell',
    name: '法术攻击',
    description: '凝聚冥想之力，以咒术轰击敌人。',
    profession: 'mage',
    mpCost: 2,
    tags: ['magic'],
    combat: {
      damageFormula: 'max(1, 6 + MND修正) + 等级伤害加成',
    },
  },
  // ---- 骑士（TM-P1-006）----
  knight_power_strike: {
    id: 'knight_power_strike',
    name: '骑士重击',
    description: '以全身之力挥出沉重一击。',
    profession: 'knight',
    mpCost: 2,
    tags: ['force'],
    combat: {
      damageFormula: '玩家攻击力 + 2（吃武器与等级加成）',
    },
  },
  // ---- 游侠（TM-P1-007）----
  ranger_swift_strike: {
    id: 'ranger_swift_strike',
    name: '迅捷突袭',
    description: '借助敏捷的身手，抢先发动一次突袭。',
    profession: 'ranger',
    mpCost: 0,
    tags: ['movement'],
    combat: {
      damageFormula: 'max(1, 4 + AGI修正 + 武器 + 等级) + 2',
      oncePerCombat: true,
    },
  },
  // ---- 战士（TM-P1-008；TM-P2-003 A 修正：攻击力 +1）----
  warrior_suppress_strike: {
    id: 'warrior_suppress_strike',
    name: '压制猛击',
    description: '以重压之势击溃敌人的反击意图。',
    profession: 'warrior',
    mpCost: 2,
    tags: ['force'],
    combat: {
      damageFormula: '玩家攻击力 + 1（吃武器与等级加成）',
      suppressCounterOnFullHit: true,
    },
  },
}

/** 各职业初始技能（新角色自动获得；TM-P2-003 A） */
export const DEFAULT_SKILLS_BY_PROFESSION: Record<ProfessionId, readonly string[]> = {
  warrior: ['warrior_suppress_strike'],
  knight: ['knight_power_strike'],
  ranger: ['ranger_swift_strike'],
  mage: ['mage_spell'],
}

/** 查询技能；未知/损坏 id 返回 undefined（调用方安全忽略） */
export function getSkill(id: string): SkillDefinition | undefined {
  return SKILLS[id]
}

/** 职业初始技能列表（存档迁移/新角色共用） */
export function defaultSkillsForProfession(profession: ProfessionId): string[] {
  return [...(DEFAULT_SKILLS_BY_PROFESSION[profession] ?? [])]
}
