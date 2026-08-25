import type { GameState } from '../types'

export const GOLDEN_RABBIT_QUEST_ID = 'quest_golden_rabbit_search'

/** TM-P2-009-R1 §12：Golden Rabbit 全部已开放调查完成判定（只读派生，绝不修改 quest status/stage/flags 或 rabbit_path）。
 *  四个调查 flag 全部为 true 时，UI 显示「现阶段线索已收集 · 待续」，且不再作为 Current Objective。
 *  HARD FREEZE：本函数不触碰 quest_golden_rabbit_search 内部状态。 */
export function isGoldenRabbitInvestigationComplete(state: GameState): boolean {
  const q = state.quests.find((x) => x.questId === GOLDEN_RABBIT_QUEST_ID)
  if (!q || q.status !== 'in_progress') return false
  return (
    q.flags.asked_blacksmith === true &&
    q.flags.asked_apothecary === true &&
    q.flags.village_inquiry_reported === true &&
    q.flags.rabbit_lair_rechecked === true
  )
}
