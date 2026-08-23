// @vitest-environment happy-dom
import { act } from 'react'
import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TaskActivitySidebar, { ClueJournalList } from './TaskActivitySidebar'
import { useGameStore } from '../../game/state/gameStore'
import { createInitialGameState } from '../../game/content/initial'

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
  useGameStore.setState({ gameState: createInitialGameState(), hasSave: false })
})

const sidebarProps = { onCompleteQuest: vi.fn(), onViewQuest: vi.fn() }
const renderSidebarDom = () => renderToDom(createElement(TaskActivitySidebar, sidebarProps))

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

  it('UI4: 已发现线索显示 title/描述/来源/分类标签', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    state.world.flags.clue_north_drag_trail = true
    const dom = renderToDom(createElement(ClueJournalList, { gameState: state }))
    const text = dom.textContent ?? ''
    expect(text).toContain('兔子的路径')
    expect(text).toContain('拖行痕迹')
    expect(text).toContain('来源：兔王巢穴')
    expect(text).toContain('地图')
    expect(text).toContain('北郊')
  })

  it('UI5: 兔子的路径线索正常展示（§8 迁移）', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    const text = renderToDom(createElement(ClueJournalList, { gameState: state })).textContent ?? ''
    expect(text).toContain('兔子的路径')
    expect(text).toContain('黄金兔子王')
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
