/**
 * 最小任务状态机（TM-P0-006）。
 * 只定义合法状态转换；任务目标判定、奖励、分支由后续任务卡实现。
 */
import type { QuestStatus } from '../types'

/** 合法状态转换表（completed / failed 为终态） */
const ALLOWED_TRANSITIONS: Record<QuestStatus, readonly QuestStatus[]> = {
  undiscovered: ['available'],
  available: ['in_progress'],
  in_progress: ['completable', 'failed'],
  completable: ['completed', 'failed'],
  completed: [],
  failed: [],
}

/** 判断 from → to 是否为合法任务状态转换 */
export function canTransitionQuestStatus(from: QuestStatus, to: QuestStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to)
}
