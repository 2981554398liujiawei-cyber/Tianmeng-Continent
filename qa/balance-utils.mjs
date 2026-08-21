/**
 * qa/balance-utils.mjs —— TM-P2-006 数值平衡审计辅助工具（仅被 qa/p2-006-balance.mjs 引用）。
 *
 * 内容：
 *  1. mulberry32：seeded PRNG（确定性、可复现）。
 *  2. BUILDS：四职业 × 3 个代表性 build（战斗向 / 均衡 / LUCK-heavy），
 *     属性 STR/CON/AGI/MND/LCK 每项 8–16、总和恒为 54（5×8+14）。
 *  3. EQUIPMENT_PLAN：初始装备 / 各职业最佳可购防具（任务卡 TM-P2-006 范围）。
 *  4. 玩家派生数值：HP/MP/攻击/护甲/AGI 的正式公式与等级成长
 *     （HP=10+CON，MP=max(0,MND-2)，升级 +2 HP / +1 MP；攻击/护甲调用 combat.ts 正式函数）。
 *
 * 运行方式：不单独运行，由 qa/p2-006-balance.mjs import。
 */

/** mulberry32（确定性 PRNG；标准 32 位种子） */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 用 PRNG 生成 1–20 骰面 */
export function d20From(rng) {
  return Math.floor(rng() * 20) + 1
}

/** 属性修正（与 src/game/rules/d20.ts 一致；此处独立实现仅用于文档展示，模拟器一律调用正式函数） */
export function attributeModifier(score) {
  return Math.floor((score - 10) / 2)
}

export const PROFESSION_IDS = ['warrior', 'knight', 'ranger', 'mage']

/** 各职业默认技能 id（src/game/content/skills.ts DEFAULT_SKILLS_BY_PROFESSION） */
export const DEFAULT_SKILL_IDS = {
  warrior: 'warrior_suppress_strike', // 压制猛击：攻击力+1，MP2，正常命中/暴击压制反击
  knight: 'knight_power_strike', // 骑士重击：攻击力+2，MP2
  ranger: 'ranger_swift_strike', // 迅捷突袭：AGI 攻击力+2，MP0，每场一次
  mage: 'mage_spell', // 法术攻击：6+MND修正+等级加成，MP2
}

/**
 * 四职业 × 3 个代表性 build。
 * 合法性：每项 8–16，五维总和 = 54。
 * 战斗向：STR/CON/AGI 优先；均衡：均匀分配；LUCK-heavy：LCK 最高、战斗属性明显低。
 */
export const BUILDS = {
  warrior: {
    combat: { str: 16, con: 12, agi: 10, mnd: 8, lck: 8, label: '战斗向 STR16/CON12/AGI10' },
    balanced: { str: 12, con: 12, agi: 10, mnd: 10, lck: 10, label: '均衡 STR12/CON12/AGI10' },
    luck: { str: 10, con: 10, agi: 10, mnd: 8, lck: 16, label: 'LUCK-heavy LCK16（战斗属性仅 8–10）' },
  },
  knight: {
    combat: { str: 12, con: 16, agi: 10, mnd: 8, lck: 8, label: '战斗向 CON16/STR12' },
    balanced: { str: 12, con: 14, agi: 10, mnd: 10, lck: 8, label: '均衡 CON14/STR12' },
    luck: { str: 10, con: 10, agi: 10, mnd: 10, lck: 14, label: 'LUCK-heavy LCK14（战斗属性仅 10）' },
  },
  ranger: {
    combat: { str: 10, con: 12, agi: 16, mnd: 8, lck: 8, label: '战斗向 AGI16/CON12' },
    balanced: { str: 10, con: 12, agi: 14, mnd: 10, lck: 8, label: '均衡 AGI14/CON12' },
    luck: { str: 8, con: 10, agi: 10, mnd: 10, lck: 16, label: 'LUCK-heavy LCK16（战斗属性仅 8–10）' },
  },
  mage: {
    combat: { str: 8, con: 12, agi: 10, mnd: 16, lck: 8, label: '战斗向 MND16/CON12' },
    balanced: { str: 8, con: 10, agi: 10, mnd: 14, lck: 12, label: '均衡 MND14/LCK12' },
    luck: { str: 8, con: 10, agi: 10, mnd: 12, lck: 14, label: 'LUCK-heavy MND12/LCK14' },
  },
}

/** 各 build 的通用标签（审计文档表格用） */
export const BUILD_KIND_LABEL = {
  combat: '战斗向 (a)',
  balanced: '均衡 (b)',
  luck: 'LUCK-heavy (c)',
}

/** 装备方案：初始装备 + 各职业最佳可购防具（武器均铁剑 +2；任务卡可购范围） */
export const EQUIPMENT_PLAN = {
  starter: {
    weapon: 'iron_sword',
    armor: 'traveler_cloth_armor',
    label: '初始装备（铁剑+旅行布衣）',
    weaponBonus: 2,
    armorBonus: 1,
  },
  buyable: {
    warrior: { weapon: 'iron_sword', armor: 'chainmail_armor', label: '可购：锁子甲(+3)', weaponBonus: 2, armorBonus: 3 },
    knight: { weapon: 'iron_sword', armor: 'chainmail_armor', label: '可购：锁子甲(+3)', weaponBonus: 2, armorBonus: 3 },
    ranger: { weapon: 'iron_sword', armor: 'hardened_leather_armor', label: '可购：硬皮甲(+2)', weaponBonus: 2, armorBonus: 2 },
    mage: { weapon: 'iron_sword', armor: 'arcane_robe', label: '可购：灵纹法袍(+2)', weaponBonus: 2, armorBonus: 2 },
  },
}

/** 模拟器覆盖的代表怪物（Lv1–5 各一，按任务卡指定） */
export const REPRESENTATIVE_ENEMIES = [
  { id: 'corrupted_rabbit', level: 1 }, // 魔化兔 Lv1
  { id: 'corrupted_wolf', level: 2 }, // 魔化狼 Lv2
  { id: 'skeleton_soldier', level: 3 }, // 骷髅士兵 Lv3
  { id: 'skeleton_captain', level: 4 }, // 骷髅队长 Lv4（Boss）
  { id: 'skeleton_warrior', level: 5 }, // 骷髅战士 Lv5
]

/**
 * 玩家派生数值（等级成长按 progression：每级 +2 maxHp / +1 maxMp；攻击/护甲走 combat.ts 正式函数）。
 * @param {object} rules combat.ts 模块（正式函数）
 * @param {object} charRules character.ts 模块（getStartingMaxHp/getStartingMaxMp）
 * @param {object} skillRules skill.ts 模块（resolveSkillRawDamage/getSkillExecutionInfo）
 * @param {string} profession 职业 id
 * @param {object} attrs 五维属性
 * @param {number} level 等级 1–5
 * @param {object} equip { weaponBonus, armorBonus }
 */
export function derivePlayer(rules, charRules, skillRules, profession, attrs, level, equip) {
  const weaponBonus = equip.weaponBonus ?? 0
  const armorBonus = equip.armorBonus ?? 0
  const hp = charRules.getStartingMaxHp(attrs.con) + 2 * (level - 1)
  const mp = charRules.getStartingMaxMp(attrs.mnd) + (level - 1)
  const attack = rules.getPlayerAttackPower(attrs.str, weaponBonus, level)
  const armor = rules.getPlayerArmor(attrs.con, armorBonus)
  const agi = rules.getPlayerAgility(attrs.agi)
  const skillId = DEFAULT_SKILL_IDS[profession]
  const skillRawDamage = skillRules.resolveSkillRawDamage(skillId, {
    str: attrs.str,
    agi: attrs.agi,
    mnd: attrs.mnd,
    weaponDamageBonus: weaponBonus,
    level,
  })
  const skillInfo = skillRules.getSkillExecutionInfo(skillId)
  return {
    profession,
    level,
    hp,
    mp,
    attack,
    armor,
    agi,
    skillId,
    skillRawDamage: skillRawDamage ?? attack,
    skillMpCost: skillInfo?.mpCost ?? 0,
    skillOncePerCombat: skillInfo?.oncePerCombat === true,
    skillSuppressOnFullHit: skillInfo?.suppressCounterOnFullHit === true,
    attrs,
  }
}

/** 敌人战斗数值（直接从 enemies.ts 注册表读取） */
export function deriveEnemy(def) {
  return {
    id: def.id,
    name: def.name,
    level: def.level,
    hp: def.maxHp,
    attack: def.attackPower,
    armor: def.armor,
    agi: def.agility,
  }
}

/** 精确期望伤害：遍历 1–20 全部骰面调用 resolveAttack（每个骰面等概率 1/20）。 */
export function expectedDamagePerStrike(rules, attackerAgi, defenderAgi, rawDamage, defenderArmor) {
  let total = 0
  for (let roll = 1; roll <= 20; roll += 1) {
    total += rules.resolveAttack(roll, attackerAgi, defenderAgi, rawDamage, defenderArmor).damage
  }
  return total / 20
}

/** 期望击数（敌人 HP / 每击期望伤害）与敌人反击期望伤害——审计文档辅助 */
export function expectedStrikesToKill(hp, expectedPerStrike) {
  return expectedPerStrike > 0 ? Math.ceil(hp / expectedPerStrike) : Infinity
}
