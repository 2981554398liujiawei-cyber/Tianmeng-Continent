/**
 * 最小战斗规则内核（TM-P0-007 / TM-P1-001~008 / TM-P2-001 战斗 V2 → TM-P2-002 战斗 V3）。
 *
 * V3（TM-P2-002）：废弃「攻击加值 vs 防御值」语义，改为：
 *   - 玩家派生：攻击力 = max(1, 4 + STR修正 + 武器伤害加成 + 等级伤害加成)；
 *               护甲   = max(0, 10 + CON修正 + 装备护甲加成)；
 *               敏捷   = AGI 原始属性（不得再用 AGI 计算护甲）。
 *   - 命中：D20，天然1 → critical_miss(0)；天然20 → critical_hit(原始×2)；
 *           其他 (攻击者敏捷 + roll)/2 >= 防守者敏捷 → hit；否则 → glancing_hit(原始×50% 向上取整)。
 *   - 护甲：非 MISS 攻击 finalDamage = max(1, ceil(rawDamage × roll/(armor+roll)))。
 *   - 先手：双方 D20+AGI，高者先；平局 AGI 高者先；仍相同则玩家先。
 * 本模块只输出规则计算结果，不修改任何 GameState / 敌人注册数据 / 玩家 HP。
 */
import { getAttributeModifier, rollD20 } from './d20'

// ---- 玩家派生属性（TM-P2-002 A）----

/** 基础等级伤害成长（TM-P2-001 C4）：Lv1–2 +0 / Lv3–4 +1 / Lv5–6 +2 ... */
export function getPlayerLevelDamageBonus(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError('等级必须为正整数')
  }
  return Math.floor((level - 1) / 2)
}

/**
 * 玩家攻击力：max(1, 4 + STR修正 + 武器伤害加成 + 等级伤害加成)（TM-P2-002 A）。
 * weaponDamageBonus 允许 0 / 正整数，非法抛 RangeError。
 */
export function getPlayerAttackPower(str: number, weaponDamageBonus = 0, level = 1): number {
  if (!Number.isInteger(weaponDamageBonus) || weaponDamageBonus < 0 || !Number.isFinite(weaponDamageBonus)) {
    throw new RangeError('武器伤害加成必须是 0 或正整数')
  }
  const power = Math.max(1, 4 + getAttributeModifier(str) + weaponDamageBonus + getPlayerLevelDamageBonus(level))
  if (!Number.isFinite(power)) {
    throw new RangeError('攻击力溢出')
  }
  return power
}

/**
 * 玩家护甲：max(0, 10 + CON修正 + 装备护甲加成)（TM-P2-002 A）。
 * armorDefenseBonus 允许 0 / 正整数，非法抛 RangeError。
 */
export function getPlayerArmor(con: number, armorDefenseBonus = 0): number {
  if (!Number.isInteger(armorDefenseBonus) || armorDefenseBonus < 0 || !Number.isFinite(armorDefenseBonus)) {
    throw new RangeError('装备护甲加成必须是 0 或正整数')
  }
  const armor = Math.max(0, 10 + getAttributeModifier(con) + armorDefenseBonus)
  if (!Number.isFinite(armor)) {
    throw new RangeError('护甲溢出')
  }
  return armor
}

/** 玩家敏捷：AGI 原始属性（TM-P2-002 A；不再由 AGI 推导护甲） */
export function getPlayerAgility(agi: number): number {
  if (!Number.isInteger(agi) || agi < 0) {
    throw new RangeError('敏捷必须是非负整数')
  }
  return agi
}

// ---- 敌人数据语义（TM-P2-002 A）：attackPower / armor / agility 直接读取注册表 ----

/** 敌人攻击力（原始伤害）：读 EnemyDefinition.attackPower */
export function getEnemyAttackPower(attackPower: number): number {
  if (!Number.isInteger(attackPower) || attackPower < 1) {
    throw new RangeError('敌人攻击力必须为正整数')
  }
  return attackPower
}

/** 敌人护甲：读 EnemyDefinition.armor */
export function getEnemyArmor(armor: number): number {
  if (!Number.isInteger(armor) || armor < 0) {
    throw new RangeError('敌人护甲必须是非负整数')
  }
  return armor
}

/** 敌人敏捷：读 EnemyDefinition.agility */
export function getEnemyAgility(agility: number): number {
  if (!Number.isInteger(agility) || agility < 0) {
    throw new RangeError('敌人敏捷必须是非负整数')
  }
  return agility
}

// ---- 职业技能原始伤害（TM-P1-001/006/007/008；V3 下只负责 rawDamage，命中/护甲统一走 V3）----

/** 法术攻击灵力消耗（唯一业务常量） */
export const MAGE_SPELL_MP_COST = 2
/** 骑士重击灵力消耗（唯一业务常量） */
export const KNIGHT_POWER_STRIKE_MP_COST = 2
/** 压制猛击灵力消耗（唯一业务常量） */
export const WARRIOR_SUPPRESS_STRIKE_MP_COST = 2

/** 法师法术原始伤害：max(1, 6 + MND修正)（不吃 STR / 武器加成） */
export function getMageSpellDamage(mnd: number): number {
  return Math.max(1, 6 + getAttributeModifier(mnd))
}

/** 骑士重击原始伤害 = 玩家攻击力 + 2（吃武器加成与等级加成） */
export function getKnightPowerStrikeDamage(str: number, weaponDamageBonus = 0, level = 1): number {
  const damage = getPlayerAttackPower(str, weaponDamageBonus, level) + 2
  if (!Number.isFinite(damage)) {
    throw new RangeError('骑士重击伤害溢出')
  }
  return damage
}

/** 战士压制猛击原始伤害 = 玩家攻击力 + 1（TM-P2-003 A 修正：原为等同普攻，现 +1 提升价值；仍低于骑士重击的 +2） */
export function getWarriorSuppressStrikeDamage(str: number, weaponDamageBonus = 0, level = 1): number {
  const damage = getPlayerAttackPower(str, weaponDamageBonus, level) + 1
  if (!Number.isFinite(damage)) {
    throw new RangeError('压制猛击伤害溢出')
  }
  return damage
}

/** 游侠迅捷突袭原始伤害 = 以 AGI 为攻击属性的物理伤害 + 2 */
export function getRangerSwiftStrikeDamage(agi: number, weaponDamageBonus = 0, level = 1): number {
  // 迅捷突袭沿用「AGI 视为力量」的封板语义：4 + AGI修正 + 武器 + 等级，再 +2
  if (!Number.isInteger(weaponDamageBonus) || weaponDamageBonus < 0 || !Number.isFinite(weaponDamageBonus)) {
    throw new RangeError('武器伤害加成必须是 0 或正整数')
  }
  const damage = Math.max(1, 4 + getAttributeModifier(agi) + weaponDamageBonus + getPlayerLevelDamageBonus(level)) + 2
  if (!Number.isFinite(damage)) {
    throw new RangeError('迅捷突袭伤害溢出')
  }
  return damage
}

// ---- 命中判定（TM-P2-002 B）----

export type AttackOutcome = 'critical_hit' | 'hit' | 'glancing_hit' | 'critical_miss'

export interface AttackResult {
  roll: number
  /** 攻击者敏捷（命中判定输入） */
  attackerAgility: number
  /** 防守者敏捷（命中判定输入） */
  defenderAgility: number
  /** 攻击力（面板值 = rawDamage 输入；TM-P2-002-R1 B 日志字段） */
  attackPower: number
  /** 命中值 (攻击者敏捷 + roll)/2；天然 1/20 不参与阈值比较时为 null（TM-P2-002-R1 B） */
  hitValue: number | null
  /** 原始伤害（倍率应用前，= attackPower） */
  rawDamage: number
  /** 防守者护甲 */
  armor: number
  /** 本次骰面承伤率 roll/(armor+roll)（0–1） */
  damageTakenRate: number
  hit: boolean
  critical: boolean
  damage: number
  outcome: AttackOutcome
}

/**
 * 命中判定（确定性）：天然1 → critical_miss；天然20 → critical_hit；
 * 其他 (attackerAgility + roll)/2 >= defenderAgility → hit；否则 glancing_hit（TM-P2-002 B）。
 */
export function resolveHit(
  roll: number,
  attackerAgility: number,
  defenderAgility: number,
): AttackOutcome {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new RangeError('骰面必须是 1–20 之间的整数')
  }
  if (!Number.isInteger(attackerAgility) || attackerAgility < 0) {
    throw new RangeError('攻击者敏捷必须是非负整数')
  }
  if (!Number.isInteger(defenderAgility) || defenderAgility < 0) {
    throw new RangeError('防守者敏捷必须是非负整数')
  }
  if (roll === 1) return 'critical_miss'
  if (roll === 20) return 'critical_hit'
  return (attackerAgility + roll) / 2 >= defenderAgility ? 'hit' : 'glancing_hit'
}

/** 护甲减伤后最终伤害：max(1, ceil(rawDamage × roll/(armor+roll)))（TM-P2-002 C；非 MISS 至少 1 点） */
export function applyArmor(rawDamage: number, armor: number, roll: number): number {
  if (!Number.isInteger(rawDamage) || rawDamage < 1) {
    throw new RangeError('原始伤害必须为正整数')
  }
  if (!Number.isInteger(armor) || armor < 0) {
    throw new RangeError('护甲必须是非负整数')
  }
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new RangeError('骰面必须是 1–20 之间的整数')
  }
  const takenRate = roll / (armor + roll)
  const damage = Math.max(1, Math.ceil(rawDamage * takenRate))
  if (!Number.isFinite(damage)) {
    throw new RangeError('最终伤害溢出')
  }
  return damage
}

/**
 * 攻击结算（确定性）：命中判定 + 倍率 + 护甲减伤。
 * critical_miss → 0；critical_hit → raw×2；glancing_hit → ceil(raw×0.5)；hit → raw；
 * 然后统一过护甲（TM-P2-002 B/C）。
 */
export function resolveAttack(
  roll: number,
  attackerAgility: number,
  defenderAgility: number,
  rawDamage: number,
  armor: number,
): AttackResult {
  const outcome = resolveHit(roll, attackerAgility, defenderAgility)
  const hitValue = outcome === 'critical_miss' || outcome === 'critical_hit' ? null : (attackerAgility + roll) / 2
  if (outcome === 'critical_miss') {
    return {
      roll,
      attackerAgility,
      defenderAgility,
      attackPower: rawDamage,
      hitValue,
      rawDamage,
      armor,
      damageTakenRate: 0,
      hit: false,
      critical: false,
      damage: 0,
      outcome,
    }
  }
  const multiplier = outcome === 'critical_hit' ? 2 : outcome === 'glancing_hit' ? 0.5 : 1
  // 原始伤害倍率（擦伤向上取整；暴击 2 倍）
  const rawAfterMultiplier =
    outcome === 'glancing_hit'
      ? Math.max(1, Math.ceil(rawDamage * 0.5))
      : outcome === 'critical_hit'
        ? rawDamage * 2
        : rawDamage
  if (!Number.isFinite(rawAfterMultiplier)) {
    throw new RangeError('倍率伤害溢出')
  }
  const damage = applyArmor(rawAfterMultiplier, armor, roll)
  return {
    roll,
    attackerAgility,
    defenderAgility,
    attackPower: rawDamage,
    hitValue,
    rawDamage,
    armor,
    damageTakenRate: roll / (armor + roll),
    hit: true,
    critical: outcome === 'critical_hit',
    damage,
    outcome,
  }
}

/** 随机攻击入口：复用 rollD20 */
export function performAttack(
  attackerAgility: number,
  defenderAgility: number,
  rawDamage: number,
  armor: number,
): AttackResult {
  return resolveAttack(rollD20(), attackerAgility, defenderAgility, rawDamage, armor)
}

// ---- 先手（TM-P2-002 D）----

export type InitiativeWinner = 'player' | 'enemy'

/**
 * 先手判定：D20+AGI 高者先；总和平局 → AGI 高者先；仍相同 → 玩家先。
 * 纯函数：双方骰面由调用方提供（测试确定性）。
 */
export function resolveInitiative(
  playerAgility: number,
  enemyAgility: number,
  playerRoll: number,
  enemyRoll: number,
): InitiativeWinner {
  for (const value of [playerAgility, enemyAgility, playerRoll, enemyRoll]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError('先手判定输入必须是非负整数')
    }
  }
  if (playerRoll < 1 || playerRoll > 20 || enemyRoll < 1 || enemyRoll > 20) {
    throw new RangeError('先手骰面必须是 1–20 之间的整数')
  }
  const playerTotal = playerRoll + playerAgility
  const enemyTotal = enemyRoll + enemyAgility
  if (playerTotal > enemyTotal) return 'player'
  if (enemyTotal > playerTotal) return 'enemy'
  // 平局：AGI 高者先；仍相同则玩家先
  if (playerAgility > enemyAgility) return 'player'
  if (enemyAgility > playerAgility) return 'enemy'
  return 'player'
}

/** 随机先手入口 */
export function rollInitiative(playerAgility: number, enemyAgility: number): InitiativeWinner {
  return resolveInitiative(playerAgility, enemyAgility, rollD20(), rollD20())
}

// ---- 单回合战斗阶段辅助（TM-P0-008-R1 语义保留）----

export type CombatPhase = 'active' | 'victory' | 'defeat'

export interface PlayerStrikeResolution {
  enemyHp: number
  phase: 'active' | 'victory'
  /** 玩家攻击后敌人是否应进行反击 */
  enemyShouldCounter: boolean
}

/** 玩家一击后的战斗阶段结算：致死攻击 → victory 且不反击；未造成伤害（critical_miss）→ 敌人回合继续 */
export function resolvePlayerStrike(enemyCurrentHp: number, attack: AttackResult): PlayerStrikeResolution {
  if (!attack.hit) {
    return { enemyHp: enemyCurrentHp, phase: 'active', enemyShouldCounter: true }
  }
  const enemyHp = Math.max(0, enemyCurrentHp - attack.damage)
  if (enemyHp === 0) {
    return { enemyHp, phase: 'victory', enemyShouldCounter: false }
  }
  return { enemyHp, phase: 'active', enemyShouldCounter: true }
}

/** 敌人反击后玩家战斗阶段：HP 归零 → defeat */
export function getCombatPhaseAfterEnemyAttack(playerHp: number): 'active' | 'defeat' {
  return playerHp === 0 ? 'defeat' : 'active'
}

// ---- 战斗日志格式化（TM-P2-002-R1 B）----

const ATTACK_OUTCOME_ZH: Record<AttackOutcome, string> = {
  critical_hit: '暴击',
  hit: '命中',
  glancing_hit: '擦伤',
  critical_miss: '大失败',
}

/** 倍率后的原始伤害（与 resolveAttack 内部一致；供日志展示） */
function rawAfterMultiplier(result: AttackResult): number {
  if (result.outcome === 'critical_hit') return result.rawDamage * 2
  if (result.outcome === 'glancing_hit') return Math.max(1, Math.ceil(result.rawDamage * 0.5))
  return result.rawDamage
}

/**
 * 战斗日志行（TM-P2-002-R1 B：不再让玩家误认为 D20+数值=攻击力）。
 * 明确区分：攻击力 / 命中值 / 原始伤害 / 护甲 / 承伤率 / 最终伤害。
 * 天然 1：`天然1：大失败，不进行普通命中阈值比较`；天然 20 同理。
 * 2–19：`命中值 = (D20 9 + 敏捷 12) / 2 = 10.5；对方敏捷 = 10；结果：命中`。
 */
export function formatAttackLog(result: AttackResult, defenderName: string): string[] {
  if (result.outcome === 'critical_miss') {
    return ['天然1：大失败，不进行普通命中阈值比较。', '未造成伤害。']
  }
  if (result.outcome === 'critical_hit') {
    const rawAfter = rawAfterMultiplier(result)
    const pct = Math.round(result.damageTakenRate * 100)
    return [
      '天然20：暴击，不进行普通命中阈值比较。',
      `攻击力 ${result.attackPower} × 2 = ${rawAfter}；${defenderName}护甲 ${result.armor}；承伤率 ${result.roll} / (${result.armor} + ${result.roll}) = ${pct}%；最终造成 ${result.damage} 点伤害。`,
    ]
  }
  // 命中 / 擦伤：展示命中值公式
  const hitValue = result.hitValue
  const hitText = hitValue === null ? '?' : String(hitValue)
  const outcome = ATTACK_OUTCOME_ZH[result.outcome]
  const rawAfter = rawAfterMultiplier(result)
  const pct = Math.round(result.damageTakenRate * 100)
  const multiplierText = result.outcome === 'glancing_hit' ? ' × 50%' : ''
  return [
    `命中值 = (D20 ${result.roll} + 敏捷 ${result.attackerAgility}) / 2 = ${hitText}`,
    `对方敏捷 = ${result.defenderAgility}；结果：${outcome}`,
    `攻击力 ${result.attackPower}${multiplierText} = ${rawAfter}；原始伤害 ${rawAfter}；${defenderName}护甲 ${result.armor}；承伤率 ${result.roll} / (${result.armor} + ${result.roll}) = ${pct}%；最终造成 ${result.damage} 点伤害。`,
  ]
}
