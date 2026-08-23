/**
 * 线索定义（TM-P2-008 Clue Journal V1）。
 * 与 Quest（玩家需要做什么）/ Log（刚发生什么）严格分离：Clue = 玩家已经知道什么。
 * 静态资料，纯数据；玩家发现进度由 GameState.world.flags 的 `clue_<id>` 表达（见 rules/clue.ts）。
 */

/** 线索分类（UI 分组标签；未来可扩展新的分类） */
export type ClueCategory = 'map' | 'north' | 'investigation' | 'lore'

export interface ClueDefinition {
  id: string
  title: string
  description: string
  /** 线索来源（地点 / NPC / 事件；纯文本展示，不用于逻辑） */
  source?: string
  /** 关联任务 ID（仅元数据；不改变任何任务逻辑） */
  relatedQuestIds?: string[]
  /** 分类（UI 分组标签；缺省 'lore'） */
  category?: ClueCategory
}
