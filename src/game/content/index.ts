/**
 * 内容统一出口（TM-P0-002）：通过 ID 稳定查询全部内容注册表。
 * 查询不存在的 ID 一律返回 undefined，不 throw、不创建占位。
 */
export { createInitialGameState, START_LOCATION_ID } from './initial'
export type { ItemType, ItemDefinition } from './items'
export { ITEMS, getItem } from './items'
export type { ProfessionInfo } from './professions'
export { PROFESSIONS, getProfessionName, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from './professions'
export type { ProfessionId } from '../types'
export type { LocationDefinition } from './locations'
export { LOCATIONS } from './locations'
export type { NpcDefinition } from './npcs'
export { NPCS } from './npcs'
export type { EnemyDefinition } from './enemies'
export { ENEMIES } from './enemies'
export type { QuestDefinition } from './quests'
export { QUESTS } from './quests'
export type { CompanionDefinition } from '../types/companion'
export {
  COMPANIONS,
  SAKURA_COMPANION_ID,
  getCompanion,
  sakuraDefaultSkillIds,
  SAKURA_SEALED_SKILLS,
} from './companions'
export type { RelationshipProfile } from '../types/relationship'
export { RELATIONSHIP_PROFILES, getRelationshipProfile, isRomanceableNpc } from './relationships'

import type { ProfessionId } from '../types'
import { LOCATIONS, type LocationDefinition } from './locations'
import { NPCS, type NpcDefinition } from './npcs'
import { ENEMIES, type EnemyDefinition } from './enemies'
import { QUESTS, type QuestDefinition } from './quests'
import { PROFESSIONS, type ProfessionInfo } from './professions'

export function getLocation(id: string): LocationDefinition | undefined {
  return LOCATIONS[id]
}

export function getNpc(id: string): NpcDefinition | undefined {
  return NPCS[id]
}

export function getEnemy(id: string): EnemyDefinition | undefined {
  return ENEMIES[id]
}

export function getQuest(id: string): QuestDefinition | undefined {
  return QUESTS[id]
}

export function getProfession(id: ProfessionId): ProfessionInfo | undefined {
  return PROFESSIONS[id]
}
