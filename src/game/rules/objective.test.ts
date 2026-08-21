import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { getCurrentObjective } from './objective'

describe('TM-P2-005 当前目标优先级', () => {
  it('北门 > 王财 > 黄金兔子，且主线不被支线抢占', () => {
    const state = createInitialGameState()
    state.quests = [
      { questId: 'quest_apothecary_herb_route', status: 'completable', stage: 0, flags: {} },
      { questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0, flags: {} },
      { questId: 'quest_wangcai_trouble', status: 'in_progress', stage: 0, flags: {} },
      { questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: {} },
    ]
    expect(getCurrentObjective(state)?.questId).toBe('quest_north_gate_missing_patrol')
    state.quests = state.quests.filter((quest) => quest.questId !== 'quest_north_gate_missing_patrol')
    expect(getCurrentObjective(state)?.questId).toBe('quest_wangcai_trouble')
    state.quests = state.quests.filter((quest) => quest.questId !== 'quest_wangcai_trouble')
    expect(getCurrentObjective(state)?.questId).toBe('quest_golden_rabbit_search')
  })
})
