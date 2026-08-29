/**
 * Party Combat 遭遇构建（TM-P2-007-R1 BLOCKER A）。
 *
 * 把 CombatPage 的 buildCombatSetup 抽为纯函数 + DI：
 *  - activeCompanionIds 泛化为任意伙伴（不再只认 sakura_yuko）→ 玩家 + 最多 3 名伙伴（4v4）
 *  - resolveCompanion / getCompanionDef 可注入（测试用 fixture 伙伴，不进生产注册表）
 *  - rng 可注入（测试确定性先手）
 *
 * 纯函数：不修改 GameState、不写 Store；CombatPage 在生产用默认注入（Math.random / gameState.companions / getCompanion）。
 */
import { getCompanion } from '../content/companions'
import type { CompanionDefinition } from '../types/companion'
import type { CompanionState } from '../types/companion'
import type { GameState } from '../types/game'
import type { EncounterDefinition } from '../types/encounter'
import type { SkillDefinition } from '../types/skill'
import { getPlayerAgility, getPlayerArmor, getPlayerAttackPower } from './combat'
import { getStartingMaxHp } from './character'
import { currentEncounterVariantId, singleEnemyIdOf } from './encounter'
import { getEffectiveCharacterAttributes } from './mount'
import {
  buildEnemyCombatant,
  buildEnemyInstances,
  buildFriendlyCombatant,
  rollInitiativeQueue,
  type Combatant,
  type InitiativeTurn,
  type Rng,
} from './partyCombat'
import { getUsableSkills } from './skill'
import { getItem } from '../content'

/** 参与战斗的伙伴上限（4v4 冻结规则：玩家 1 + companions ≤ 3 = 友方最多 4） */
export const MAX_PARTY_COMPANIONS = 3

/** 伙伴战斗信息（每个 active companion 一条；技能/属性独立） */
export interface CompanionCombatInfo {
  companionId: string
  name: string
  level: number
  skills: SkillDefinition[]
  attrs: GameState['player']['attributes']
}

/** 战斗构建结果（进入战斗时一次性生成；战斗过程全在页面本地 state） */
export interface CombatSetup {
  friendly: Combatant[]
  enemies: Combatant[]
  combatants: Combatant[]
  turns: InitiativeTurn[]
  singleEnemyId: string | undefined
  canEscape: boolean
  companions: CompanionCombatInfo[]
}

/** 伙伴状态解析（默认读 gameState.companions；测试可注入 mock resolver） */
export type CompanionStateResolver = (companionId: string, state: GameState) => CompanionState | undefined

/** 伙伴定义解析（默认查生产注册表；测试可注入 fixture 定义） */
export type CompanionDefResolver = (companionId: string) => CompanionDefinition | undefined

export interface BuildCombatSetupOptions {
  /** 伙伴状态解析（默认 gameState.companions） */
  resolveCompanion?: CompanionStateResolver
  /** 伙伴定义解析（默认生产注册表 getCompanion） */
  getCompanionDef?: CompanionDefResolver
  /** 随机源（默认 Math.random） */
  rng?: Rng
}

/** 读取装备武器攻击加成（与单敌版本一致；equipment 数据异常返回 0） */
export function weaponDamageBonusOf(state: GameState): number {
  const equipped = state.equipment.weapon ? getItem(state.equipment.weapon) : undefined
  return equipped?.type === 'weapon' && Number.isInteger(equipped.weaponDamageBonus) ? (equipped.weaponDamageBonus ?? 0) : 0
}

/** 读取装备护甲防御加成（equipment 数据异常返回 0） */
export function armorDefenseBonusOf(state: GameState): number {
  const equipped = state.equipment.armor ? getItem(state.equipment.armor) : undefined
  return equipped?.type === 'armor' && Number.isInteger(equipped.armorDefenseBonus) ? (equipped.armorDefenseBonus ?? 0) : 0
}

/** 默认伙伴状态解析：读 gameState.companions */
const defaultResolveCompanion: CompanionStateResolver = (companionId, state) => state.companions[companionId]

/** 默认伙伴定义解析：生产注册表 */
const defaultGetCompanionDef: CompanionDefResolver = getCompanion

/**
 * 构建本场遭遇的全部战斗单位与先手队列（纯函数）。
 *
 * 伙伴（guest/recruited 且 active；最多 MAX_PARTY_COMPANIONS 名）：
 *   - 按 activeCompanionIds 顺序取前 N 名，跳过未注册 / 非 guest|recruited 状态
 *   - 伙伴 HP 不持久化：战斗内按 con 派生满血进入；MP 取伙伴当前 MP
 *   - instanceId = `companion-${companionId}`（多伙伴唯一；sourceId = companionId）
 */
export function buildCombatSetup(state: GameState, def: EncounterDefinition, options?: BuildCombatSetupOptions): CombatSetup {
  const player = state.player
  const resolveCompanion = options?.resolveCompanion ?? defaultResolveCompanion
  const getCompanionDef = options?.getCompanionDef ?? defaultGetCompanionDef
  const rng = options?.rng ?? Math.random

  // P2-007 §20：Combat derived stats 使用「装备坐骑后的有效五维」
  const playerAttrs = getEffectiveCharacterAttributes(player.attributes, state.equippedMountId)
  const playerCombatant = buildFriendlyCombatant({
    instanceId: 'player',
    sourceType: 'player',
    sourceId: 'player',
    name: player.name,
    currentHp: player.hp,
    maxHp: player.maxHp,
    currentMp: player.mp,
    maxMp: player.maxMp,
    attack: getPlayerAttackPower(playerAttrs.str, weaponDamageBonusOf(state), player.level),
    armor: getPlayerArmor(playerAttrs.con, armorDefenseBonusOf(state)),
    agility: getPlayerAgility(playerAttrs.agi),
  })
  const friendly: Combatant[] = [playerCombatant]
  const companions: CompanionCombatInfo[] = []

  const activeCompanionIds = state.party?.activeCompanionIds ?? []
  for (const companionId of activeCompanionIds) {
    if (companions.length >= MAX_PARTY_COMPANIONS) break
    const companionState = resolveCompanion(companionId, state)
    if (!companionState) continue
    if (companionState.status !== 'guest' && companionState.status !== 'recruited') continue
    const companionDef = getCompanionDef(companionState.companionId)
    if (!companionDef) continue
    const attrs = companionDef.attributes
    const info: CompanionCombatInfo = {
      companionId: companionState.companionId,
      name: companionDef.name,
      level: companionState.level,
      skills: getUsableSkills(companionState.learnedSkillIds, undefined),
      attrs,
    }
    companions.push(info)
    const maxHp = getStartingMaxHp(attrs.con)
    friendly.push(
      buildFriendlyCombatant({
        instanceId: `companion-${companionState.companionId}`,
        sourceType: 'companion',
        sourceId: companionState.companionId,
        name: companionDef.name,
        currentHp: maxHp,
        maxHp,
        currentMp: companionState.mp,
        maxMp: companionDef.maxMp,
        attack: getPlayerAttackPower(attrs.str, 0, companionState.level),
        armor: getPlayerArmor(attrs.con, 0),
        agility: getPlayerAgility(attrs.agi),
      }),
    )
  }

  // 敌方（fixed 或已固化的 weighted variant 阵容）
  const variantId = currentEncounterVariantId(state, def)
  const members = def.fixedMembers ?? def.variants?.find((v) => v.id === variantId)?.members
  if (!members || members.length === 0) {
    throw new Error(`encounter ${def.id} 无有效阵容`)
  }
  const instances = buildEnemyInstances(members)
  const enemies = instances.map(buildEnemyCombatant)

  const turns = rollInitiativeQueue([...friendly, ...enemies], rng)
  return {
    friendly,
    enemies,
    combatants: [...friendly, ...enemies],
    turns,
    singleEnemyId: singleEnemyIdOf(def),
    canEscape: def.canEscape,
    companions,
  }
}
