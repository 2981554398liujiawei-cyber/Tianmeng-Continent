// @vitest-environment happy-dom
/**
 * TM-P2-013 §19：背包中「未鉴定遗物」与「鉴定后职业装备」的真实 DOM 展示契约。
 *
 * 覆盖点：
 *  - 未鉴定物：列表与详情都标记「未鉴定」、不出现装备按钮、不暴露最终装备。
 *  - 鉴定后：进入现有装备 UI，显示类型 / 属性 / 等级要求 / 属性要求 / 当前差距。
 *  - UI 只 render 规则输出：属性门槛文案由 checkEquipEligibility 提供，不在 UI 里按职业特判。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BackpackPanel from './BackpackPanel'
import { checkEquipEligibility } from '../../game/rules/equipment'
import { ITEMS } from '../../game/content/items'

const NOOP = () => false

let root: Root | null = null

function mount(inventory: { itemId: string; quantity: number }[], attributes: Record<string, number>, playerLevel = 6, profession: 'warrior' | 'knight' | 'ranger' | 'mage' = 'ranger') {
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  document.body.innerHTML = ''
  root = createRoot(document.body)
  act(() => {
    root?.render(
      createElement(BackpackPanel, {
        open: true,
        onClose: NOOP,
        inventory,
        equipment: { weapon: null, armor: null, accessory: null },
        playerHp: 30,
        playerMaxHp: 40,
        profession,
        playerLevel,
        attributes,
        onEquipItem: NOOP,
        onUnequipSlot: NOOP,
        onUseItem: NOOP,
      }),
    )
  })
}

function text() {
  return document.body.textContent || ''
}

function click(testId: string) {
  const el = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null
  expect(el, `未找到 ${testId}`).toBeTruthy()
  act(() => { el?.click() })
}

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('TM-P2-013 §19：未鉴定遗物的背包展示', () => {
  beforeEach(() => {
    mount([{ itemId: 'unidentified_blackstone_relic', quantity: 1 }], { str: 12, agi: 14, con: 12, mnd: 10, lck: 10 })
  })

  it('列表行标记「未鉴定」', () => {
    expect(document.querySelector('[data-testid="backpack-unidentified-unidentified_blackstone_relic"]')).toBeTruthy()
    expect(text()).toContain('未鉴定')
  })

  it('详情视图：显示「未鉴定」、不出现装备按钮、不暴露最终装备', () => {
    click('backpack-item-unidentified_blackstone_relic')
    expect(document.querySelector('[data-testid="backpack-detail-unidentified"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="backpack-equip"]')).toBeNull()
    // 不得泄露四件职业装备中的任何一件
    for (const id of ['blackstone_warblade', 'blackstone_guard_armor', 'blackstone_hunter_bow', 'blackstone_resonance_staff']) {
      expect(text()).not.toContain(ITEMS[id]!.name)
    }
  })
})

describe('TM-P2-013 §19：鉴定后进入现有装备 UI', () => {
  it('AGI 达标：显示属性加成 / 等级与属性要求 / 出现可用装备按钮', () => {
    mount([{ itemId: 'blackstone_hunter_bow', quantity: 1 }], { str: 12, agi: 14, con: 12, mnd: 10, lck: 10 }, 6, 'ranger')
    click('backpack-item-blackstone_hunter_bow')
    expect(document.querySelector('[data-testid="backpack-detail-unidentified"]')).toBeNull()
    expect(text()).toContain('攻击')
    expect(text()).toContain('需要等级 6')
    expect(text()).toContain('需要AGI 14')
    expect(text()).toContain('14')
    const equip = document.querySelector('[data-testid="backpack-equip"]') as HTMLButtonElement | null
    expect(equip).toBeTruthy()
    expect(equip?.disabled).toBe(false)
  })

  it('AGI 不足：装备按钮 disabled 且显示当前值与要求值（文案来自规则，不是 UI 特判）', () => {
    mount([{ itemId: 'blackstone_hunter_bow', quantity: 1 }], { str: 12, agi: 12, con: 12, mnd: 10, lck: 10 }, 6, 'ranger')
    click('backpack-item-blackstone_hunter_bow')
    const equip = document.querySelector('[data-testid="backpack-equip"]') as HTMLButtonElement | null
    expect(equip?.disabled).toBe(true)
    expect(text()).toContain('需要AGI 14（当前 12）')
    // UI 展示与规则输出一致（§18：统一 checkEquipEligibility）
    const rule = checkEquipEligibility(ITEMS.blackstone_hunter_bow!, { level: 6, attributes: { str: 12, agi: 12, con: 12, mnd: 10, lck: 10 }, profession: 'ranger' })
    expect(rule.allowed).toBe(false)
    expect(rule.attribute).toBe('agi')
    expect(rule.requiredValue).toBe(14)
    expect(rule.currentValue).toBe(12)
  })
})
