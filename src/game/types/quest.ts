/** 任务状态机 */
/** 任务状态白名单（const tuple，类型由此派生——单一来源） */
export const QUEST_STATUSES = [
  'undiscovered',
  'available',
  'in_progress',
  'completable',
  'completed',
  'failed',
] as const

export type QuestStatus = (typeof QUEST_STATUSES)[number]

export interface QuestState {
  questId: string
  status: QuestStatus
  stage: number
  /** 任务内分支标记（随玩家行为/检定结果/NPC 状态等变化） */
  flags: Record<string, boolean | number | string>
}
