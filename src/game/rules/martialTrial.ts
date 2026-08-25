import type { GameState } from '../types/game'
import type { ProfessionId } from '../types/character'
import { tier2SkillFor } from '../content/skillProgression'

export const MARTIAL_TRIAL_QUEST_ID = 'quest_tianlong_martial_trial'
export const MARTIAL_TRIAL_INVITE_FLAG = 'martial_trial_invited'
export const LEGACY_TRIAL_INVITE_FLAG = 'knight_trial_invited'
export const MARTIAL_TRIAL_MEDAL_ID = 'tianlong_martial_medal'

export type MartialTrialRoute = 'route_warrior' | 'route_knight' | 'route_ranger' | 'route_mage'
export type ObservationChoice = 'strength' | 'constitution' | 'agility' | 'meditation' | 'luck'
export type ObservationAdvantage = 'mp' | 'potion' | null

const ROUTE_BY_PROFESSION: Record<ProfessionId, MartialTrialRoute> = {
  warrior: 'route_warrior', knight: 'route_knight', ranger: 'route_ranger', mage: 'route_mage',
}

export function hasMartialTrialInvitation(state: Pick<GameState, 'world'>): boolean {
  return state.world.flags[MARTIAL_TRIAL_INVITE_FLAG] === true || state.world.flags[LEGACY_TRIAL_INVITE_FLAG] === true
}

export function routeForProfession(profession: ProfessionId): MartialTrialRoute {
  return ROUTE_BY_PROFESSION[profession]
}

export function trialRouteFlags(profession: ProfessionId): Record<MartialTrialRoute, boolean> {
  const route = routeForProfession(profession)
  return { route_warrior: route === 'route_warrior', route_knight: route === 'route_knight', route_ranger: route === 'route_ranger', route_mage: route === 'route_mage' }
}

export function canEnterMartialTrial(state: Pick<GameState, 'world' | 'quests'>): boolean {
  if (!hasMartialTrialInvitation(state)) return false
  return state.quests.some((q) => q.questId === MARTIAL_TRIAL_QUEST_ID && (q.status === 'in_progress' || q.status === 'completable'))
}

export function observationChoiceForProfession(profession: ProfessionId): ObservationChoice {
  return { warrior: 'strength', knight: 'constitution', ranger: 'agility', mage: 'meditation' }[profession] as ObservationChoice
}

export function resolveObservation(profession: ProfessionId, choice: ObservationChoice): { success: boolean; advantage: ObservationAdvantage } {
  if (choice === observationChoiceForProfession(profession)) return { success: true, advantage: 'mp' }
  if (choice === 'luck') return { success: true, advantage: 'potion' }
  return { success: false, advantage: null }
}

export function trialCombatEncounterId(profession: ProfessionId): string {
  return `encounter_trial_${profession}`
}

export function trialReward(state: Pick<GameState, 'quests' | 'player' | 'inventory'>): { gold: number; adventureXp: number; itemId: string; skillId: string } | null {
  const quest = state.quests.find((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
  if (!quest || quest.status !== 'completable' || quest.flags.trial_reward_claimed === true) return null
  const skillId = tier2SkillFor(state.player.profession)
  if (state.player.learnedSkillIds.includes(skillId)) return null
  return { gold: 50, adventureXp: 120, itemId: MARTIAL_TRIAL_MEDAL_ID, skillId }
}
