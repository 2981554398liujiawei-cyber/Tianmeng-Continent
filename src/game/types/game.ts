import type { Character } from './character'
import type { Equipment, Inventory } from './item'
import type { QuestState } from './quest'
import type { WorldState } from './world'

/** 统一游戏状态：所有系统的共享基础 */
export interface GameState {
  player: Character
  inventory: Inventory
  equipment: Equipment
  quests: QuestState[]
  world: WorldState
}
