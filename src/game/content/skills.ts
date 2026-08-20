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
      damageResolver: { type: 'magic_spell' },
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
      damageResolver: { type: 'attack_power', bonus: 2 },
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
      damageResolver: { type: 'agility_power', bonus: 2 },
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
      damageResolver: { type: 'attack_power', bonus: 1 },
      suppressCounterOnFullHit: true,
    },
  },
  // ---- TM-P2-004 第 44/45 节：樱花优子伙伴技能（profession = undefined 通用技能，复用 R3 语义；
  //      actor 无职业（伙伴）也可合法使用；不另造页面 if(sakuraSkill) 分支） ----
  sakura_petalslash: {
    id: 'sakura_petalslash',
    name: '樱花飞斩',
    description: '以神力凝成樱花刃锋，斩向敌人。',
    // 无 profession = 通用技能（伙伴可学可用；玩家学了也能用，但玩家不会获得该技能）
    mpCost: 1,
    tags: ['physical', 'movement', 'divine'],
    combat: {
      damageFormula: '以 AGI 为攻击属性的物理伤害 + 1（武器加成 0，等级 = 伙伴等级）',
      damageResolver: { type: 'agility_power', bonus: 1 },
    },
  },
  sakura_magic_shield: {
    id: 'sakura_magic_shield',
    name: '樱花魔法盾',
    description: '以花瓣编织的神力屏障，下一次敌人反击的最终伤害降低。',
    mpCost: 2,
    tags: ['magic', 'divine'],
    combat: {
      oncePerCombat: true,
      supportEffect: { type: 'reduce_next_enemy_damage', amount: 3 },
    },
  },
  sakura_light_dance: {
    id: 'sakura_light_dance',
    name: '樱花轻舞',
    description: '以轻舞般的步伐牵走敌人的攻势，本轮敌人不反击。',
    mpCost: 2,
    tags: ['movement', 'divine'],
    combat: {
      oncePerCombat: true,
      supportEffect: { type: 'cancel_next_enemy_counter' },
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
