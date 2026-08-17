/** 任务状态机 */
export type QuestStatus =
  | 'undiscovered' // 未发现
  | 'available' // 可接受
  | 'in_progress' // 进行中
  | 'completable' // 可完成
  | 'completed' // 已完成
  | 'failed' // 失败

/** 任务状态白名单（运行时校验用，与 QuestStatus 保持单一来源） */
export const QUEST_STATUSES: readonly QuestStatus[] = [
  'undiscovered',
  'available',
  'in_progress',
  'completable',
  'completed',
  'failed',
]

export interface QuestState {
  questId: string
  status: QuestStatus
  stage: number
  /** 任务内分支标记（随玩家行为/检定结果/NPC 状态等变化） */
  flags: Record<string, boolean | number | string>
}
