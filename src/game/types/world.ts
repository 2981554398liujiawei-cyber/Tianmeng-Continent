import type { NpcState } from './npc'

/** 独立于玩家的世界状态 */
export interface WorldState {
  currentLocationId: string
  /** 关键剧情 Flag（布尔/数字/字符串） */
  flags: Record<string, boolean | number | string>
  /** 已触发事件列表 */
  completedEvents: string[]
  /** 重要 NPC 状态（npcId -> 状态） */
  npcStates: Record<string, NpcState>
  /** V4：休整次数（Long Rest MVP；TM-P2-004 第 54 节；新游戏 0；V3→V4 缺失补 0） */
  restCount: number
  /** V6：Encounter variant 固化（encounterId -> variantId；首次生成后写死，刷新/读档/切地点不 reroll） */
  encounterVariants: Record<string, string>
}
