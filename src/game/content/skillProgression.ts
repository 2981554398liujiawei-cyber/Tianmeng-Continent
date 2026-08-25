import type { ProfessionId } from '../types/character'

export interface ProfessionSkillNode {
  skillId: string
  tier: 1 | 2
  unlock: { type: 'starting' | 'quest'; questId?: string }
}

export const SKILL_PROGRESSION: Record<ProfessionId, readonly ProfessionSkillNode[]> = {
  warrior: [
    { skillId: 'warrior_suppress_strike', tier: 1, unlock: { type: 'starting' } },
    { skillId: 'warrior_breaking_slash', tier: 2, unlock: { type: 'quest', questId: 'quest_tianlong_martial_trial' } },
  ],
  knight: [
    { skillId: 'knight_power_strike', tier: 1, unlock: { type: 'starting' } },
    { skillId: 'knight_oath_guard', tier: 2, unlock: { type: 'quest', questId: 'quest_tianlong_martial_trial' } },
  ],
  ranger: [
    { skillId: 'ranger_swift_strike', tier: 1, unlock: { type: 'starting' } },
    { skillId: 'ranger_windstep_strike', tier: 2, unlock: { type: 'quest', questId: 'quest_tianlong_martial_trial' } },
  ],
  mage: [
    { skillId: 'mage_spell', tier: 1, unlock: { type: 'starting' } },
    { skillId: 'mage_flame_lance', tier: 2, unlock: { type: 'quest', questId: 'quest_tianlong_martial_trial' } },
  ],
}

export function skillProgressionFor(profession: ProfessionId): ProfessionSkillNode[] {
  return [...SKILL_PROGRESSION[profession]]
}

export function tier2SkillFor(profession: ProfessionId): string {
  return SKILL_PROGRESSION[profession].find((node) => node.tier === 2)!.skillId
}
