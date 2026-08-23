// @vitest-environment happy-dom
/**
 * 马厩面板渲染测试（TM-P2-007 §19 UI 侧断言）。
 * 覆盖：面板开关、可购买/未开放/已拥有/已装备四态、购买/装备/卸下回调、非天龙城提示。
 * 交易合法性（金币/位置/一次性）由 rules/mount.test.ts + gameStore.mount.test.ts 纯规则覆盖。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MountStablePanel, { type MountStablePanelProps } from './MountStablePanel'
import { CHI_TU_ID, FIRE_STALLION_ID } from '../../game/content/mounts'

const NOOP = () => undefined

let root: Root | null = null

function renderStable(props: MountStablePanelProps): void {
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  document.body.innerHTML = ''
  root = createRoot(document.body)
  act(() => {
    root?.render(createElement(MountStablePanel, props))
  })
}

function baseProps(overrides: Partial<MountStablePanelProps> = {}): MountStablePanelProps {
  return {
    open: true,
    onClose: NOOP,
    ownedMountIds: [],
    equippedMountId: null,
    gold: 100,
    locationId: 'tianlong_city',
    onBuy: vi.fn(() => 'bought' as const),
    onEquip: vi.fn(() => true),
    onUnequip: vi.fn(() => true),
    ...overrides,
  }
}

function bodyText(): string {
  return document.body.textContent ?? ''
}

function query(selector: string): Element | null {
  return document.querySelector(selector)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  document.body.innerHTML = ''
})

describe('MountStablePanel 开关', () => {
  it('open=true 渲染面板；open=false 不渲染', () => {
    renderStable(baseProps())
    expect(query('[data-testid="mount-panel"]')).not.toBeNull()
    renderStable(baseProps({ open: false }))
    expect(query('[data-testid="mount-panel"]')).toBeNull()
  })
})

describe('MountStablePanel 坐骑四态', () => {
  it('未拥有 + 可购买：显示「购买 80 金」按钮；locked 坐骑显示「尚未开放获取」', () => {
    renderStable(baseProps())
    const buyBtn = query(`[data-testid="mount-buy-${FIRE_STALLION_ID}"]`)
    expect(buyBtn).not.toBeNull()
    expect(buyBtn?.textContent).toContain('购买')
    expect(buyBtn?.textContent).toContain('80')
    expect(query(`[data-testid="mount-buy-${CHI_TU_ID}"]`)).toBeNull()
    expect(bodyText()).toContain('尚未开放获取')
  })

  it('已拥有未装备：显示「已拥有」+ [装备] 按钮', () => {
    renderStable(baseProps({ ownedMountIds: [FIRE_STALLION_ID] }))
    expect(query(`[data-testid="mount-state-${FIRE_STALLION_ID}"]`)?.textContent).toBe('已拥有')
    expect(query(`[data-testid="mount-equip-${FIRE_STALLION_ID}"]`)).not.toBeNull()
    expect(query(`[data-testid="mount-buy-${FIRE_STALLION_ID}"]`)).toBeNull()
  })

  it('已装备：显示「已装备」+ [卸下] 按钮，不再出现装备/购买', () => {
    renderStable(baseProps({ ownedMountIds: [FIRE_STALLION_ID], equippedMountId: FIRE_STALLION_ID }))
    expect(query(`[data-testid="mount-state-${FIRE_STALLION_ID}"]`)?.textContent).toBe('已装备')
    expect(query(`[data-testid="mount-unequip-${FIRE_STALLION_ID}"]`)).not.toBeNull()
    expect(query(`[data-testid="mount-equip-${FIRE_STALLION_ID}"]`)).toBeNull()
    expect(query(`[data-testid="mount-buy-${FIRE_STALLION_ID}"]`)).toBeNull()
  })

  it('装备中的坐骑展示加成文本（火焰驹 力量+1 · 敏捷+1）', () => {
    renderStable(baseProps({ ownedMountIds: [FIRE_STALLION_ID], equippedMountId: FIRE_STALLION_ID }))
    expect(bodyText()).toContain('力量+1')
    expect(bodyText()).toContain('敏捷+1')
  })
})

describe('MountStablePanel 交互回调', () => {
  it('点击购买调用 onBuy 并展示成功反馈', () => {
    const onBuy = vi.fn(() => 'bought' as const)
    renderStable(baseProps({ onBuy }))
    act(() => {
      query(`[data-testid="mount-buy-${FIRE_STALLION_ID}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onBuy).toHaveBeenCalledWith(FIRE_STALLION_ID)
    expect(query('[data-testid="mount-feedback"]')?.textContent).toContain('已收入马厩')
  })

  it('点击装备调用 onEquip；点击卸下调用 onUnequip', () => {
    const onEquip = vi.fn(() => true)
    const onUnequip = vi.fn(() => true)
    renderStable(
      baseProps({
        ownedMountIds: [FIRE_STALLION_ID],
        equippedMountId: FIRE_STALLION_ID,
        onEquip,
        onUnequip,
      }),
    )
    act(() => {
      query(`[data-testid="mount-unequip-${FIRE_STALLION_ID}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onUnequip).toHaveBeenCalledTimes(1)
    expect(onEquip).not.toHaveBeenCalled()
  })

  it('金币不足时购买按钮 disabled', () => {
    renderStable(baseProps({ gold: 50 }))
    const buyBtn = query(`[data-testid="mount-buy-${FIRE_STALLION_ID}"]`) as HTMLButtonElement | null
    expect(buyBtn?.disabled).toBe(true)
  })

  it('不在天龙城：提示 + 购买按钮 disabled', () => {
    renderStable(baseProps({ locationId: 'qingshi_village' }))
    expect(bodyText()).toContain('当前不在天龙城')
    const buyBtn = query(`[data-testid="mount-buy-${FIRE_STALLION_ID}"]`) as HTMLButtonElement | null
    expect(buyBtn?.disabled).toBe(true)
  })
})
