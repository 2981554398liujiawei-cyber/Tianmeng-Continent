// @vitest-environment happy-dom
import { act } from 'react'
import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TaskActivitySidebar, { ClueJournalList } from './TaskActivitySidebar'
import { useGameStore } from '../../game/state/gameStore'
import { createInitialGameState } from '../../game/content/initial'
import type { GameState } from '../../game/types'

/** TM-P2-008 §47-54：AdventureSidebar V2 UI 单测（UI1-10）。
 *  TaskActivitySidebar 依赖 zustand store（useSyncExternalStore），node 环境 SSR 不渲染 → 用 happy-dom + createRoot 真实 DOM。 */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderToDom(element: ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    createRoot(container).render(element)
  })
  return container
}

beforeEach(() => {
  // store 重置放在 act 内（避免 useSyncExternalStore 订阅者在 act 外收到更新的 React warning）
  act(() => {
    useGameStore.setState({ gameState: createInitialGameState(), hasSave: false })
  })
})

const sidebarProps = { onCompleteQuest: vi.fn(), onViewQuest: vi.fn() }
const renderSidebarDom = () => renderToDom(createElement(TaskActivitySidebar, sidebarProps))
/** 在 act 内触发点击（避免 React act warning；与 UI10 现有用法一致） */
const clickIn = (container: HTMLElement, el: Element | null | undefined) => {
  act(() => {
    el?.dispatchEvent(new Event('click', { bubbles: true }))
  })
}
/** 在 act 内原地修改并提交 GameState（浅拷贝产生新引用触发重渲染；flags 原地写后由新引用读到） */
const mutateState = (mutate: (s: GameState) => void) => {
  act(() => {
    const s = useGameStore.getState().gameState!
    mutate(s)
    useGameStore.setState({ gameState: { ...s } })
  })
}

describe('UI1-2 面板结构与默认 Tab（§5）', () => {
  it('UI1: quest-column 容器 + 当前目标区块 + 任务/线索/日志三个 Tab 按钮', () => {
    const dom = renderSidebarDom()
    expect(dom.querySelector('[data-testid="quest-column"]')).not.toBeNull()
    expect(dom.textContent).toContain('当前目标')
    expect(dom.textContent).toContain('任务')
    expect(dom.textContent).toContain('线索')
    expect(dom.textContent).toContain('日志')
  })

  it('UI2: 默认选中「任务」Tab（aria-selected=true）', () => {
    const dom = renderSidebarDom()
    expect(dom.querySelector('[role="tablist"]')).not.toBeNull()
    const selected = dom.querySelector('[role="tab"][aria-selected="true"]')
    expect(selected).not.toBeNull()
    expect(selected?.textContent).toContain('任务')
  })

  it('UI8: 无 active 任务时当前目标显示空态', () => {
    expect(renderSidebarDom().textContent).toContain('暂无当前目标')
  })
})

describe('UI3-6 Clue Journal 列表（§7）', () => {
  it('UI3: 无线索时显示空态', () => {
    const state = createInitialGameState()
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    expect(dom.textContent).toContain('尚未发现任何线索')
  })

  it('UI4: 已发现线索默认折叠显示标题/分类，展开后显示描述/来源（TM-P2-009 §4）', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    state.world.flags.clue_north_drag_trail = true
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    // 默认折叠：标题 + 分类可见，描述/来源不可见
    expect(dom.textContent).toContain('兔子的路径')
    expect(dom.textContent).toContain('拖行痕迹')
    expect(dom.textContent).toContain('地图')
    expect(dom.textContent).toContain('北郊')
    expect(dom.textContent).not.toContain('来源：')
    // 展开第一条后描述/来源可见
    const expandBtn = [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('展开'))
    clickIn(dom, expandBtn)
    expect(dom.textContent).toContain('来源：兔王巢穴')
  })

  it('UI5: 兔子的路径线索正常展示（§8 迁移）', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    expect(dom.textContent).toContain('兔子的路径')
    // 默认折叠：描述（含黄金兔子王）不可见
    expect(dom.textContent).not.toContain('黄金兔子王')
    const expandBtn = [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('展开'))
    clickIn(dom, expandBtn)
    expect(dom.textContent).toContain('黄金兔子王')
  })

  it('UI6: 线索 UI 不含生产 ID（clue_/quest_ 前缀不泄漏）', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    state.world.flags.clue_north_drag_trail = true
    state.world.flags.clue_north_patrol_emblem = true
    state.world.flags.clue_north_black_mane = true
    const text = renderToDom(createElement(ClueJournalList, { gameState: state })).textContent ?? ''
    expect(text).not.toContain('clue_rabbit_path')
    expect(text).not.toContain('clue_north')
    expect(text).not.toContain('quest_golden_rabbit_search')
  })
})

describe('UI7/UI9/UI10 任务 Tab（§33）', () => {
  it('UI7: 进行中任务渲染进度文本', () => {
    const state = useGameStore.getState().gameState!
    state.quests = [{ questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: {} }]
    const text = renderSidebarDom().textContent ?? ''
    expect(text).toContain('进行中')
    expect(text).toContain('北门失联')
    expect(text).toContain('前往天龙城北门')
  })

  it('UI9: 可提交任务显示提交按钮（发布者在当前地点）', () => {
    const state = useGameStore.getState().gameState!
    state.quests = [{ questId: 'quest_apothecary_herb_route', status: 'completable', stage: 0, flags: {} }]
    const dom = renderSidebarDom()
    expect(dom.textContent).toContain('可提交')
    expect(dom.textContent).toContain('提交任务')
  })

  it('UI10: 已完成任务折叠条目（默认折叠，展开后任务名可见）', () => {
    const state = useGameStore.getState().gameState!
    state.quests = [{ questId: 'quest_apothecary_herb_route', status: 'completed', stage: 0, flags: {} }]
    const dom = renderSidebarDom()
    expect(dom.textContent).toContain('已完成')
    // 折叠时任务名不可见
    expect(dom.textContent).not.toContain('采药受阻')
    // 展开「已完成」Accordion 后任务名可见
    const btn = dom.querySelector('button[aria-label="已完成的任务"]')
    expect(btn).not.toBeNull()
    act(() => {
      btn?.dispatchEvent(new Event('click', { bubbles: true }))
    })
    expect(dom.textContent).toContain('采药受阻')
  })
})

/** TM-P2-009 §4：Clue Journal V2 默认折叠 + 未读（UI-only）。 */
describe('TM-P2-009 S1-S4：Clue 折叠（默认折叠 / 展开 / 收起 / 最多一条）', () => {
  it('S1: 每条线索默认折叠（标题/分类可见，描述/来源不可见，每条有「展开」按钮）', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    state.world.flags.clue_north_drag_trail = true
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    expect(dom.textContent).toContain('兔子的路径')
    expect(dom.textContent).toContain('拖行痕迹')
    expect(dom.textContent).toContain('地图')
    expect(dom.textContent).toContain('北郊')
    // description/source 不可见
    expect(dom.textContent).not.toContain('藏宝图')
    expect(dom.textContent).not.toContain('重物拖拽')
    expect(dom.textContent).not.toContain('来源：')
    expect([...dom.querySelectorAll('button')].filter((b) => b.textContent?.includes('展开'))).toHaveLength(2)
  })

  it('S2: 点击「展开」显示描述与来源', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    expect(dom.textContent).not.toContain('藏宝图')
    const expandBtn = [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('展开'))
    clickIn(dom, expandBtn)
    expect(dom.textContent).toContain('藏宝图')
    expect(dom.textContent).toContain('来源：兔王巢穴')
  })

  it('S3: 再次点击「收起」隐藏描述/来源', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    clickIn(dom, [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('展开')))
    expect(dom.textContent).toContain('来源：兔王巢穴')
    const collapseBtn = [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('收起'))
    clickIn(dom, collapseBtn)
    expect(dom.textContent).not.toContain('来源：')
    expect(dom.textContent).not.toContain('藏宝图')
  })

  it('S4: 同一时间最多展开一条（展开另一条后前一条自动收起）', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    state.world.flags.clue_north_drag_trail = true
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    // 展开第一条（兔子的路径）
    clickIn(dom, [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('展开')))
    expect(dom.textContent).toContain('来源：兔王巢穴')
    // 展开第二条（拖行痕迹）→ 第一条自动收起
    clickIn(dom, [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('展开')))
    expect(dom.textContent).toContain('重物拖拽')
    expect(dom.textContent).not.toContain('来源：兔王巢穴')
  })
})

/** TM-P2-009 §5：UI-only 未读线索（seenClueIds，不进 GameState / Save V6）。 */
describe('TM-P2-009 S5-S9：Clue 未读状态', () => {
  it('S5: 存量线索视为已读（无 badge，打开线索 Tab 后无未读标记）', () => {
    act(() => {
      const s = useGameStore.getState().gameState!
      s.world.flags.clue_rabbit_path = true
      useGameStore.setState({ gameState: { ...s } })
    })
    const dom = renderSidebarDom()
    const cluesTab = [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('线索'))
    expect(cluesTab?.textContent?.trim()).toBe('线索')
    clickIn(dom, cluesTab)
    expect(dom.textContent).not.toContain('●')
  })

  it('S6: 页面加载后新发现的线索未读（badge=1；组件级验证 ● 标记渲染）', () => {
    const dom = renderSidebarDom()
    mutateState((s) => {
      s.world.flags.clue_north_drag_trail = true
    })
    const cluesTab = [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('线索'))
    expect(cluesTab?.textContent).toContain('1')
    // 组件级：unreadClueIds 命中的线索显示未读标记（●）
    const state = useGameStore.getState().gameState!
    const clueDom = renderToDom(createElement(ClueJournalList, { gameState: state, unreadClueIds: ['clue_north_drag_trail'] }))
    expect(clueDom.textContent).toContain('●')
  })

  it('S7: 两条新线索累计 badge=2', () => {
    const dom = renderSidebarDom()
    mutateState((s) => {
      s.world.flags.clue_north_drag_trail = true
    })
    mutateState((s) => {
      s.world.flags.clue_north_patrol_emblem = true
    })
    const cluesTab = [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('线索'))
    expect(cluesTab?.textContent).toContain('2')
  })

  it('S8: 打开线索 Tab 后未读清零（badge 消失）', () => {
    const dom = renderSidebarDom()
    mutateState((s) => {
      s.world.flags.clue_north_drag_trail = true
    })
    let cluesTab = [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('线索'))
    expect(cluesTab?.textContent).toContain('1')
    clickIn(dom, cluesTab)
    cluesTab = [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('线索'))
    expect(cluesTab?.textContent?.trim()).toBe('线索')
    expect(cluesTab?.textContent).not.toContain('1')
  })

  it('S9: 停留线索 Tab 时新发现的线索直接已读（无 ● 无 badge）', () => {
    const dom = renderSidebarDom()
    const cluesTab = [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('线索'))
    clickIn(dom, cluesTab)
    mutateState((s) => {
      s.world.flags.clue_north_drag_trail = true
    })
    expect(dom.textContent).not.toContain('●')
    const cluesTab2 = [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('线索'))
    expect(cluesTab2?.textContent?.trim()).toBe('线索')
  })
})

/** TM-P2-009 §6-7：Activity Log 禁止 ID 泄露 + Drawer 上限。 */
describe('TM-P2-009 S10-S14：Activity 上限与 event 文案', () => {
  const questsCompleted = (ids: string[]) =>
    ids.map((questId) => ({ questId, status: 'completed' as const, stage: 0, flags: {} }))

  it('S10: 最近记录最多 5 条（超出显示「查看全部」）', () => {
    mutateState((s) => {
      s.quests = questsCompleted([
        'quest_village_monsters',
        'quest_mine_cleanup',
        'quest_grassland_wolf',
        'quest_apothecary_herb_route',
        'quest_blacksmith_mine_remnant',
        'quest_wangcai_trouble',
      ])
      s.world.completedEvents = ['village_elder_post_quest_response']
      s.player.level = 1
    })
    const dom = renderSidebarDom()
    clickIn(dom, [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('日志')))
    expect((dom.textContent ?? '').match(/《[^》]+》已完成/g)).toHaveLength(5)
    expect(dom.textContent).toContain('查看全部')
  })

  it('S11: 消息中心 Drawer 最多 20 条', () => {
    mutateState((s) => {
      s.world.completedEvents = Array.from({ length: 30 }, () => 'north_survivor_rescued')
      s.player.level = 1
    })
    const dom = renderSidebarDom()
    clickIn(dom, [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('日志')))
    clickIn(dom, [...dom.querySelectorAll('button')].find((b) => b.textContent?.includes('查看全部')))
    const dialog = dom.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect((dialog?.textContent ?? '').match(/你在北郊旧驿站救出了失联巡逻骑士沈拓/g)).toHaveLength(20)
  })

  it('S12: 已注册 event 显示用户文案（不显示内部 id）', () => {
    mutateState((s) => {
      s.world.completedEvents = ['village_elder_post_quest_response']
    })
    const dom = renderSidebarDom()
    clickIn(dom, [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('日志')))
    expect(dom.textContent).toContain('你向村长表示，会继续追查村外的异常。')
    expect(dom.textContent).not.toContain('village_elder_post_quest_response')
  })

  it('S13: 未注册 event 隐藏（无 fallback「事件记录：」，不泄露 id）', () => {
    mutateState((s) => {
      s.world.completedEvents = ['event_not_registered_xyz']
    })
    const dom = renderSidebarDom()
    clickIn(dom, [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('日志')))
    const text = dom.textContent ?? ''
    expect(text).not.toContain('event_not_registered_xyz')
    expect(text).not.toContain('事件记录：')
  })

  it('S14: 日志区域任何 raw event id 都不进入用户可见文本', () => {
    mutateState((s) => {
      s.world.completedEvents = ['village_elder_post_quest_response', 'north_survivor_rescued', 'knight_trial_invited']
    })
    const dom = renderSidebarDom()
    clickIn(dom, [...dom.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.includes('日志')))
    const text = dom.textContent ?? ''
    expect(text).not.toContain('village_elder_post_quest_response')
    expect(text).not.toContain('north_survivor_rescued')
    expect(text).not.toContain('knight_trial_invited')
    expect(text).toContain('你向村长表示，会继续追查村外的异常。')
    expect(text).toContain('你在北郊旧驿站救出了失联巡逻骑士沈拓。')
    expect(text).toContain('马科认可了你的北线表现，并准备安排正式骑士试炼。')
  })
})
