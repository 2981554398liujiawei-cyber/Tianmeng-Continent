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

describe('TM-P2-008 OBJ1-6：北郊追踪当前目标（§20）', () => {
  const northOutskirtsQuest = (flags: Record<string, boolean | number | string> = {}, status = 'in_progress') => ({
    questId: 'quest_north_outskirts',
    status: status as 'in_progress' | 'completable',
    stage: 0,
    flags,
  })

  it('OBJ1: 未追踪 → 沿足迹继续追踪（北门）', () => {
    const state = createInitialGameState()
    state.quests = [northOutskirtsQuest()]
    const obj = getCurrentObjective(state)
    expect(obj?.questId).toBe('quest_north_outskirts')
    expect(obj?.objective).toContain('沿着巡逻队留下的足迹继续追踪')
    expect(obj?.locationHint).toBe('天龙城北门')
  })

  it('OBJ2: 已追踪未找到现场 → 前往北郊追踪足迹', () => {
    const state = createInitialGameState()
    state.quests = [northOutskirtsQuest({ north_outskirts_trail_tracked: true })]
    const obj = getCurrentObjective(state)
    expect(obj?.objective).toContain('前往北郊追踪足迹')
    expect(obj?.locationHint).toBe('天龙城北郊')
  })

  it('OBJ3: 已找到现场未调查 → 调查袭击现场', () => {
    const state = createInitialGameState()
    state.quests = [northOutskirtsQuest({ north_outskirts_trail_tracked: true, north_outskirts_ambush_found: true })]
    const obj = getCurrentObjective(state)
    expect(obj?.objective).toContain('调查袭击现场')
  })

  it('OBJ4: 已调查未回报 → 返回北门或武馆将发现告诉马科', () => {
    const state = createInitialGameState()
    state.quests = [
      northOutskirtsQuest({
        north_outskirts_trail_tracked: true,
        north_outskirts_ambush_found: true,
        north_outskirts_ambush_investigated: true,
      }),
    ]
    const obj = getCurrentObjective(state)
    expect(obj?.objective).toContain('将发现告诉马科')
    expect(obj?.locationHint).toBe('天龙城北门')
  })

  it('OBJ5: completable → 返回武馆向马科汇报北郊的发现', () => {
    const state = createInitialGameState()
    state.quests = [
      northOutskirtsQuest(
        {
          north_outskirts_trail_tracked: true,
          north_outskirts_ambush_found: true,
          north_outskirts_ambush_investigated: true,
          north_outskirts_reported: true,
        },
        'completable',
      ),
    ]
    const obj = getCurrentObjective(state)
    expect(obj?.objective).toContain('返回武馆向马科汇报')
    expect(obj?.locationHint).toBe('天龙城武馆')
  })

  it('OBJ6: 北郊优先级高于北门失联（MAIN_QUEST_PRIORITY 最前）', () => {
    const state = createInitialGameState()
    state.quests = [
      { questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: {} },
      northOutskirtsQuest({ north_outskirts_trail_tracked: true }),
    ]
    expect(getCurrentObjective(state)?.questId).toBe('quest_north_outskirts')
  })
})

/** TM-P2-009-R1 §12：Golden Rabbit 四调查完成 → 派生「待续」，不作为 Current Objective（零状态修改）。 */
describe('TM-P2-009-R1 §12：Golden Rabbit 不作为当前目标', () => {
  const goldenQuest = (flags: Record<string, boolean | number | string> = {}) => ({
    questId: 'quest_golden_rabbit_search',
    status: 'in_progress' as const,
    stage: 0,
    flags,
  })
  const allFourFlags = {
    asked_blacksmith: true,
    asked_apothecary: true,
    village_inquiry_reported: true,
    rabbit_lair_rechecked: true,
  }

  it('G1: 四调查未全部完成 → 仍作为当前目标（不误伤进行中状态）', () => {
    const state = createInitialGameState()
    state.quests = [
      goldenQuest({ asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true }),
    ]
    expect(getCurrentObjective(state)?.questId).toBe('quest_golden_rabbit_search')
  })

  it('G2: 四调查全部完成 → fall through 到下一优先 active（不选 golden rabbit）', () => {
    const state = createInitialGameState()
    state.quests = [
      goldenQuest(allFourFlags),
      { questId: 'quest_grassland_wolf', status: 'in_progress' as const, stage: 0, flags: {} },
    ]
    expect(getCurrentObjective(state)?.questId).toBe('quest_grassland_wolf')
  })

  it('G3: 四调查全部完成且无其他 active → 返回 null（不硬选「待续」任务）', () => {
    const state = createInitialGameState()
    state.quests = [goldenQuest(allFourFlags)]
    expect(getCurrentObjective(state)).toBeNull()
  })
})
