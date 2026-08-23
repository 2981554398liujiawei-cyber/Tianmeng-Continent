/**
 * 线索读取规则（TM-P2-008 Clue Journal V1）。
 * 发现进度唯一持久化于 GameState.world.flags 的 `<clueId>`（boolean true，clueId 即注册表 key）。
 *  - 使用 world.flags 表达（§37 优先，避免 Save V7 六层迁移）。
 *  - 只读规则：写入必须走 store 的 addClue / 相关正式 action（store transaction，§38-39）。
 */
import type { GameState } from '../types'
import { CLUES } from '../content/clues'

/** 已发现线索 id 列表（按注册表顺序；UI 用 getClue 解析为 ClueDefinition） */
export function getDiscoveredClueIds(state: GameState): string[] {
  return Object.keys(CLUES).filter((id) => state.world.flags[id] === true)
}

/** 是否已发现指定线索（clueId 未注册或 flag 非严格 true 均视为未发现） */
export function hasClue(state: GameState, clueId: string): boolean {
  return CLUES[clueId] !== undefined && state.world.flags[clueId] === true
}
