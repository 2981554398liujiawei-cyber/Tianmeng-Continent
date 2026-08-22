import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import BackpackPanel, {
  itemTypeToTab,
  sortInventoryByName,
  ITEM_TYPE_LABELS,
  BACKPACK_TAB_LABELS,
} from './BackpackPanel'

describe('BackpackPanel 分类映射（复用 ItemType，任务卡 §4.3）', () => {
  it('weapon/armor/accessory → equipment', () => {
    expect(itemTypeToTab('weapon')).toBe('equipment')
    expect(itemTypeToTab('armor')).toBe('equipment')
    expect(itemTypeToTab('accessory')).toBe('equipment')
  })
  it('consumable/material/quest/gift → 各自分类', () => {
    expect(itemTypeToTab('consumable')).toBe('consumable')
    expect(itemTypeToTab('material')).toBe('material')
    expect(itemTypeToTab('quest')).toBe('quest')
    expect(itemTypeToTab('gift')).toBe('special')
  })
  it('未知类型回退 all（不崩溃）', () => {
    expect(itemTypeToTab(undefined)).toBe('all')
  })
})

describe('sortInventoryByName 稳定排序', () => {
  it('按中文拼音稳定排序', () => {
    const sorted = sortInventoryByName([
      { itemId: 'healing_potion', name: '治疗药水' },
      { itemId: 'iron_sword', name: '铁剑' },
      { itemId: 'black_fang', name: '黑鬃狼牙' },
    ])
    expect(sorted.map((r) => r.name)).toEqual(['黑鬃狼牙', '铁剑', '治疗药水'])
  })
  it('不修改原数组', () => {
    const rows = [
      { itemId: 'b', name: '乙' },
      { itemId: 'a', name: '甲' },
    ]
    const before = [...rows]
    sortInventoryByName(rows)
    expect(rows).toEqual(before)
  })
})

describe('BackpackPanel 渲染', () => {
  const baseProps = {
    open: true,
    onClose: vi.fn(),
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'black_fang', quantity: 3 },
    ],
    equipment: { weapon: null, armor: null, accessory: null },
    playerHp: 10,
    playerMaxHp: 22,
    profession: 'knight' as const,
    onEquipItem: vi.fn(),
    onUnequipSlot: vi.fn(),
    onUseItem: vi.fn(),
  }

  it('closed 时不渲染', () => {
    const markup = renderToStaticMarkup(createElement(BackpackPanel, { ...baseProps, open: false }))
    expect(markup).toBe('')
  })

  it('列表模式展示物品名与数量（全部 tab）', () => {
    const markup = renderToStaticMarkup(createElement(BackpackPanel, baseProps))
    expect(markup).toContain('data-testid="backpack-panel"')
    expect(markup).toContain('data-testid="backpack-item-iron_sword"')
    expect(markup).toContain('data-testid="backpack-item-healing_potion"')
    expect(markup).toContain('data-testid="backpack-item-black_fang"')
    expect(markup).toContain('×2')
    expect(markup).toContain('3 种物品')
    // 六个 tab 齐全
    for (const key of ['all', 'equipment', 'consumable', 'material', 'quest', 'special']) {
      expect(markup).toContain(`data-testid="backpack-tab-${key}"`)
    }
  })

  it('六类 tab 文案齐全（装备/消耗品/材料/任务/特殊）', () => {
    expect(BACKPACK_TAB_LABELS).toEqual({
      all: '全部',
      equipment: '装备',
      consumable: '消耗品',
      material: '材料',
      quest: '任务',
      special: '特殊',
    })
  })

  it('ItemType 中文类型标签齐全', () => {
    expect(ITEM_TYPE_LABELS.weapon).toBe('武器')
    expect(ITEM_TYPE_LABELS.armor).toBe('防具')
    expect(ITEM_TYPE_LABELS.accessory).toBe('饰品')
    expect(ITEM_TYPE_LABELS.quest).toBe('任务物品')
    expect(ITEM_TYPE_LABELS.material).toBe('材料')
    expect(ITEM_TYPE_LABELS.gift).toBe('礼物')
  })
})
