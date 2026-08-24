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
      damageFormula: '不造成伤害：为下一次敌人反击附加 reduce_next_enemy_damage(3)（本场一次）',
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
      damageFormula: '不造成伤害：本轮敌人反击被取消（cancel_next_enemy_counter，本场一次）',
      oncePerCombat: true,
      supportEffect: { type: 'cancel_next_enemy_counter' },
    },
  },
  // ---- TM-P2-009-R1 §10：敌人主动技能（enemy_* 前缀；无 profession、mpCost=0——敌人无 MP 系统。
  //      结算走 rules/skill 的 resolveEnemySkillRawDamage（attack_power→attackPower+bonus /
  //      agility_power→agility+bonus / magic_spell→6+bonus）。V3 命中/护甲由 combat.ts 负责） ----
  enemy_rabbit_mad_bite: {
    id: 'enemy_rabbit_mad_bite',
    name: '疯狂撕咬',
    description: '魔化兔双目赤红，疯狂撕咬眼前的敌人。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方攻击力 + 2',
      damageResolver: { type: 'attack_power', bonus: 2 },
    },
  },
  enemy_rat_swarm: {
    id: 'enemy_rat_swarm',
    name: '鼠群突袭',
    description: '魔化鼠尖啸着扑来，成群撕咬。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方敏捷 + 8',
      damageResolver: { type: 'agility_power', bonus: 8 },
    },
  },
  enemy_wolf_vicious_pounce: {
    id: 'enemy_wolf_vicious_pounce',
    name: '嗜血猛扑',
    description: '魔化狼腾身而起，露出獠牙猛扑而下。',
    mpCost: 0,
    tags: ['physical', 'movement'],
    combat: {
      damageFormula: '敌方攻击力 + 3（冷却 2 回合）',
      damageResolver: { type: 'attack_power', bonus: 3 },
      cooldownTurns: 2,
    },
  },
  enemy_dudu_stomp: {
    id: 'enemy_dudu_stomp',
    name: '狂暴践踏',
    description: '嘟嘟兔狂暴地蹬踏地面，震得尘土飞扬。',
    mpCost: 0,
    tags: ['physical', 'force'],
    combat: {
      damageFormula: '敌方攻击力 + 4',
      damageResolver: { type: 'attack_power', bonus: 4 },
    },
  },
  enemy_dudu_thunder_leap: {
    id: 'enemy_dudu_thunder_leap',
    name: '惊雷扑跃',
    description: '嘟嘟兔化作一道白光扑向敌人，快如惊雷。',
    mpCost: 0,
    tags: ['physical', 'movement'],
    combat: {
      damageFormula: '敌方敏捷 + 12（冷却 2 回合）',
      damageResolver: { type: 'agility_power', bonus: 12 },
      cooldownTurns: 2,
    },
  },
  enemy_bone_blade: {
    id: 'enemy_bone_blade',
    name: '骨刃斩',
    description: '骷髅士兵挥动骨刃，斩向闯入者。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方攻击力 + 2',
      damageResolver: { type: 'attack_power', bonus: 2 },
    },
  },
  enemy_captain_heavy: {
    id: 'enemy_captain_heavy',
    name: '破甲重斩',
    description: '骷髅队长抡起大剑，以重压之势当头斩下。',
    mpCost: 0,
    tags: ['physical', 'force'],
    combat: {
      damageFormula: '敌方攻击力 + 3',
      damageResolver: { type: 'attack_power', bonus: 3 },
    },
  },
  enemy_captain_quake: {
    id: 'enemy_captain_quake',
    name: '震地重击',
    description: '骷髅队长狠狠砸向地面，震得整个大厅都在摇晃。',
    mpCost: 0,
    tags: ['physical', 'force'],
    combat: {
      damageFormula: '敌方攻击力 + 5（冷却 2 回合）',
      damageResolver: { type: 'attack_power', bonus: 5 },
      cooldownTurns: 2,
    },
  },
  enemy_zombie_grasp: {
    id: 'enemy_zombie_grasp',
    name: '腐尸擒抓',
    description: '僵尸伸出僵硬的双臂，试图将敌人抓入怀中。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方攻击力 + 2（冷却 2 回合）',
      damageResolver: { type: 'attack_power', bonus: 2 },
      cooldownTurns: 2,
    },
  },
  enemy_dark_bolt: {
    id: 'enemy_dark_bolt',
    name: '暗影箭',
    description: '黑法师凝出一支暗影箭矢，无声地射向敌人。',
    mpCost: 0,
    tags: ['magic', 'illusion'],
    combat: {
      damageFormula: '法术 6 + 10',
      damageResolver: { type: 'magic_spell', bonus: 10 },
    },
  },
  enemy_black_fire: {
    id: 'enemy_black_fire',
    name: '黑火球',
    description: '黑法师抬手掷出一团翻涌的黑色火球。',
    mpCost: 0,
    tags: ['magic', 'fire'],
    combat: {
      damageFormula: '法术 6 + 12（冷却 2 回合）',
      damageResolver: { type: 'magic_spell', bonus: 12 },
      cooldownTurns: 2,
    },
  },
  enemy_warrior_cleave: {
    id: 'enemy_warrior_cleave',
    name: '顺劈斩',
    description: '骷髅战士横斩战刀，划出一道凶猛的弧线。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方攻击力 + 4',
      damageResolver: { type: 'attack_power', bonus: 4 },
    },
  },
  enemy_witch_wail: {
    id: 'enemy_witch_wail',
    name: '夺魂哭嚎',
    description: '骷髅女妖发出刺耳的哭嚎，直刺心神。',
    mpCost: 0,
    tags: ['magic', 'illusion'],
    combat: {
      damageFormula: '法术 6 + 14',
      damageResolver: { type: 'magic_spell', bonus: 14 },
    },
  },
  enemy_bone_claw: {
    id: 'enemy_bone_claw',
    name: '白骨利爪',
    description: '骷髅女妖张开的骨爪带起一阵阴风。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方攻击力 + 3（冷却 2 回合）',
      damageResolver: { type: 'attack_power', bonus: 3 },
      cooldownTurns: 2,
    },
  },
  enemy_black_mane_bite: {
    id: 'enemy_black_mane_bite',
    name: '黑鬃撕咬',
    description: '黑鬃魔狼低吼着咬向猎物，獠牙泛着冷光。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方攻击力 + 3（冷却 2 回合）',
      damageResolver: { type: 'attack_power', bonus: 3 },
      cooldownTurns: 2,
    },
  },
  enemy_wild_bite: {
    id: 'enemy_wild_bite',
    name: '獠牙撕咬',
    description: '荒原野狼露出獠牙，凶狠地咬向敌人。',
    mpCost: 0,
    tags: ['physical'],
    combat: {
      damageFormula: '敌方攻击力 + 2',
      damageResolver: { type: 'attack_power', bonus: 2 },
    },
  },
  enemy_calamity_lunge: {
    id: 'enemy_calamity_lunge',
    name: '残影突袭',
    description: '残灾之影撕裂空气，化作残影猛然扑来。',
    mpCost: 0,
    tags: ['physical', 'movement'],
    combat: {
      damageFormula: '敌方敏捷 + 7（冷却 2 回合）',
      damageResolver: { type: 'agility_power', bonus: 7 },
      cooldownTurns: 2,
    },
  },
  // ---- TM-P2-009-R1 §11：新增低复杂度通用敌人技能 ----
  enemy_bat_swoop: {
    id: 'enemy_bat_swoop',
    name: '俯冲扑击',
    description: '洞穴蝙蝠自黑暗中俯冲而下，尖牙直取敌人。',
    mpCost: 0,
    tags: ['physical', 'movement'],
    combat: {
      damageFormula: '敌方敏捷 + 5',
      damageResolver: { type: 'agility_power', bonus: 5 },
    },
  },
  enemy_boar_charge: {
    id: 'enemy_boar_charge',
    name: '蛮牛冲撞',
    description: '荒原野猪低头蓄力，猛然向前冲撞。',
    mpCost: 0,
    tags: ['physical', 'force'],
    combat: {
      damageFormula: '敌方攻击力 + 3（冷却 2 回合）',
      damageResolver: { type: 'attack_power', bonus: 3 },
      cooldownTurns: 2,
    },
  },
  warrior_breaking_slash: {
    id: 'warrior_breaking_slash',
    name: '破阵重斩',
    description: '将力量压在一点，斩开敌人的阵势。',
    profession: 'warrior',
    mpCost: 2,
    tags: ['physical', 'force'],
    combat: { damageFormula: '玩家攻击力 + 3', actionType: 'action', cooldownTurns: 2, targetMode: 'enemy', damageResolver: { type: 'attack_power', bonus: 3 } },
  },
  knight_oath_guard: {
    id: 'knight_oath_guard',
    name: '守誓之盾',
    description: '以守誓之力护住自己，降低下一次敌方命中的伤害。',
    profession: 'knight',
    mpCost: 2,
    tags: ['divine', 'physical'],
    combat: { damageFormula: '下一次敌方伤害降低 4', actionType: 'action', targetMode: 'self', oncePerCombat: true, supportEffect: { type: 'reduce_next_enemy_damage', amount: 4 } },
  },
  ranger_windstep_strike: {
    id: 'ranger_windstep_strike',
    name: '风行一击',
    description: '借风势切入，精准打击敌人的弱点。',
    profession: 'ranger',
    mpCost: 1,
    tags: ['physical', 'movement'],
    combat: { damageFormula: '玩家敏捷 + 4', actionType: 'action', cooldownTurns: 2, targetMode: 'enemy', damageResolver: { type: 'agility_power', bonus: 4 } },
  },
  mage_flame_lance: {
    id: 'mage_flame_lance',
    name: '炎矢',
    description: '在合适的施法窗口凝成灼热长矢。',
    profession: 'mage',
    mpCost: 3,
    tags: ['magic', 'fire'],
    combat: { damageFormula: '法术固定基准 + 4', actionType: 'action', cooldownTurns: 2, targetMode: 'enemy', damageResolver: { type: 'magic_spell', bonus: 4 } },
  },
  trial_shield_bash: { id: 'trial_shield_bash', name: '盾击', description: '训练士兵用盾牌撞击对手。', mpCost: 0, tags: ['physical', 'force'], combat: { damageFormula: '敌方攻击力 + 2', damageResolver: { type: 'attack_power', bonus: 2 } } },
  trial_breaking_slash: { id: 'trial_breaking_slash', name: '破势斩', description: '教习以沉重斩击测试对手的防线。', mpCost: 0, tags: ['physical', 'force'], combat: { damageFormula: '敌方攻击力 + 3', cooldownTurns: 2, damageResolver: { type: 'attack_power', bonus: 3 } } },
  trial_lunge: { id: 'trial_lunge', name: '突进', description: '斥候借速度突进攻击。', mpCost: 0, tags: ['physical', 'movement'], combat: { damageFormula: '敌方敏捷 + 4', cooldownTurns: 2, damageResolver: { type: 'agility_power', bonus: 4 } } },
  trial_arcane_bolt: { id: 'trial_arcane_bolt', name: '灵能弹', description: '学徒发射一枚不稳定的灵能弹。', mpCost: 0, tags: ['magic'], combat: { damageFormula: '法术 6 + 4', damageResolver: { type: 'magic_spell', bonus: 4 } } },
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
