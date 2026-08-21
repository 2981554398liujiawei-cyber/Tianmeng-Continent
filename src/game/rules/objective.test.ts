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

  it.each([
    ['quest_village_monsters', 'quest_apothecary_herb_route'],
    ['quest_mine_cleanup', 'quest_apothecary_herb_route'],
    ['quest_grassland_wolf', 'quest_mine_remnant'],
    ['quest_golden_rabbit_search', 'quest_apothecary_herb_route'],
  ])('%s 为 active 时不被可提交支线 %s 抢占', (mainQuestId, sideQuestId) => {
    const state = createInitialGameState()
    state.quests = [
      { questId: sideQuestId, status: 'completable', stage: 0, flags: {} },
      { questId: mainQuestId, status: 'in_progress', stage: 0, flags: {} },
    ]
    expect(getCurrentObjective(state)?.questId).toBe(mainQuestId)
  })

  it.each([
    [['quest_grassland_wolf', 'quest_mine_cleanup'], 'quest_grassland_wolf'],
    [['quest_mine_cleanup', 'quest_village_monsters'], 'quest_mine_cleanup'],
    [['quest_village_monsters', 'quest_mine_cleanup', 'quest_grassland_wolf'], 'quest_grassland_wolf'],
  ])('早期主线并存 %j 时选择 %s', (questIds, expectedQuestId) => {
    const state = createInitialGameState()
    state.quests = questIds.map((questId) => ({
      questId,
      status: 'in_progress' as const,
      stage: 0,
      flags: {},
    }))
    expect(getCurrentObjective(state)?.questId).toBe(expectedQuestId)
  })

  it('没有 active 正式主线时，可提交支线成为当前目标', () => {
    const state = createInitialGameState()
    state.quests = [
      { questId: 'quest_mine_remnant', status: 'in_progress', stage: 0, flags: {} },
      { questId: 'quest_apothecary_herb_route', status: 'completable', stage: 0, flags: {} },
    ]
    expect(getCurrentObjective(state)?.questId).toBe('quest_apothecary_herb_route')
  })
})
