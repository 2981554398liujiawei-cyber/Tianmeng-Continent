import type { Character } from './character'
import type { CompanionState, PartyState } from './companion'
import type { Equipment, Inventory } from './item'
import type { QuestState } from './quest'
import type { RelationshipState } from './relationship'
import type { WorldState } from './world'

/** 统一游戏状态：所有系统的共享基础（TM-P2-004 Schema V4：+ companions/relationships/party） */
export interface GameState {
  player: Character
  inventory: Inventory
  equipment: Equipment
  quests: QuestState[]
  world: WorldState
  /** V4：伙伴状态（companionId -> 状态；未相识的伙伴不存在） */
  companions: Record<string, CompanionState>
  /** V4：红颜关系状态（npcId -> 状态；独立于 NpcState.relationship） */
  relationships: Record<string, RelationshipState>
  /** V4：队伍状态（activeCompanionIds 去重、最多 3） */
  party: PartyState
  /** V6：已持有坐骑 id 列表（P2-007 Mount V1；一次只能装备一匹） */
  ownedMountIds: string[]
  /** V6：当前装备坐骑 id（一次一匹；null 未装备；坐骑不是战斗单位） */
  equippedMountId: string | null
}
