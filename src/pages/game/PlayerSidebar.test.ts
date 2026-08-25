// @vitest-environment happy-dom
import { act } from 'react'
import { createElement, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import PlayerSidebar from './PlayerSidebar'
import { useGameStore } from '../../game/state/gameStore'
import { createInitialGameState } from '../../game/content/initial'

/** TM-P2-009-R1 §13：冒险阅历条统一语义（xpRatio = xp / nextThreshold；删除「距离 Lv.X」文本）。
 *  复现玩家侧栏：Lv3 XP250 → 250/450 ≈ 55.6%（旧公式 0% 的 bug 修复）。 */
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
  act(() => {
    useGameStore.setState({ gameState: createInitialGameState(), hasSave: false })
  })
})

/** 读 XP bar 的 fill 宽度百分比 */
function xpFillWidth(): number {
  const xpBar = document.querySelector('[data-testid="adventure-xp-bar"]')
  const fill = xpBar?.querySelector<HTMLElement>('div[style*="width"]')
  return parseFloat(fill?.style.width ?? '0')
}

describe('TM-P2-009-R1 §13：冒险阅历条（X1-X3）', () => {
  it('X1: Lv3 XP250 → 显示 250 / 450，填充约 55.6%，无「距离 Lv」文本', () => {
    act(() => {
      const s = useGameStore.getState().gameState!
      s.player.level = 3
      s.player.adventureXp = 250
      useGameStore.setState({ gameState: { ...s } })
    })
    renderToDom(createElement(PlayerSidebar))
    const xpBar = document.querySelector('[data-testid="adventure-xp-bar"]')!
    expect(xpBar.textContent).toContain('冒险阅历')
    expect(xpBar.textContent).toContain('250 / 450')
    expect(xpBar.textContent).not.toContain('距离 Lv')
    expect(xpFillWidth()).toBeCloseTo(55.6, 1)
  })

  it('X2: Lv3 XP450 满级区间上沿 → 填充 100%（不越过条）', () => {
    act(() => {
      const s = useGameStore.getState().gameState!
      s.player.level = 3
      s.player.adventureXp = 450
      useGameStore.setState({ gameState: { ...s } })
    })
    renderToDom(createElement(PlayerSidebar))
    expect(document.querySelector('[data-testid="adventure-xp-bar"]')!.textContent).toContain('450 / 450')
    expect(xpFillWidth()).toBeCloseTo(100, 1)
  })

  it('X3: 满级 Lv15 → 显示「上限」+「等级已达到当前上限」，填充 100%，无虚构 Lv16 数字', () => {
    act(() => {
      const s = useGameStore.getState().gameState!
      s.player.level = 15
      s.player.adventureXp = 5950
      useGameStore.setState({ gameState: { ...s } })
    })
    renderToDom(createElement(PlayerSidebar))
    const xpBar = document.querySelector('[data-testid="adventure-xp-bar"]')!
    expect(xpBar.textContent).toContain('5950 / 上限')
    expect(xpBar.textContent).toContain('等级已达到当前上限')
    expect(xpBar.textContent).not.toContain('距离 Lv')
    expect(xpFillWidth()).toBe(100)
  })
})

describe('TM-P2-010 技能成长入口', () => {
  it('显示共用技能入口，展开后不泄露内部技能标识', () => {
    renderToDom(createElement(PlayerSidebar))
    const panel = document.querySelector('[data-testid="skill-progression-panel"]')!
    expect(panel).toBeTruthy()
    const button = panel.querySelector('[data-testid="open-skill-progression"]') as HTMLButtonElement
    expect(button.textContent).toContain('查看技能')
    act(() => button.click())
    expect(panel.querySelector('[data-testid="skill-tree"]')).toBeTruthy()
    expect(panel.textContent).not.toMatch(/(?:quest_|skill_|enemy_|encounter_|location_|item_|trial_)/)
  })
})
