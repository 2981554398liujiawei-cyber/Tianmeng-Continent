import { getEnemy } from '../content'
import type { Combatant } from './partyCombat'

export interface BossPhaseRuntime { phaseId: string; transitioned: boolean }
export interface BossPhaseTransition { combatant: Combatant; runtime: BossPhaseRuntime; logText: string } 

/** 在伤害已经结算、死亡已经判定后调用；不创建单位也不触碰 initiative/action state。 */
export function resolveBossPhaseTransition(
  combatant: Combatant,
  runtime: BossPhaseRuntime | undefined,
  suppressHeal = false,
  agilityPenalty = 0,
): BossPhaseTransition | null {
  if (combatant.sourceType !== 'enemy' || combatant.currentHp <= 0 || runtime?.transitioned) return null
  const def = getEnemy(combatant.sourceId)
  const phase = def?.bossPhases?.find((p) => combatant.currentHp <= combatant.maxHp * p.triggerHpRatio)
  if (!phase) return null
  const heal = suppressHeal ? 0 : phase.healAmount
  return {
    combatant: { ...combatant, name: phase.displayName, attack: combatant.attack + phase.attackBonus, armor: combatant.armor + phase.armorBonus, agility: combatant.agility - agilityPenalty, currentHp: Math.min(combatant.maxHp, combatant.currentHp + heal) },
    runtime: { phaseId: phase.id, transitioned: true }, logText: phase.logText,
  }
}

/** Boss Phase 战前上下文（TM-P2-012-R1 P1-04）：prep 效果只作用于对应 encounter，禁止 world flag 泄漏到其他 phased boss。 */
export interface BossPhasePrepContext { suppressHeal: boolean; agilityPenalty: number }
export const SPIRIT_SPRING_BOSS_ENCOUNTER_ID = 'encounter_black_bear_qialala'
export function resolveBossPhaseContext(
  gameState: { world: { flags: Record<string, string | number | boolean> } },
  encounterId: string,
): BossPhasePrepContext {
  if (encounterId !== SPIRIT_SPRING_BOSS_ENCOUNTER_ID) return { suppressHeal: false, agilityPenalty: 0 }
  const prep = gameState.world.flags.spirit_spring_preparation
  return { suppressHeal: prep === 'incense', agilityPenalty: prep === 'old_injury' ? 1 : 0 }
}
