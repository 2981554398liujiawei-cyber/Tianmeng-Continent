import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import InventoryPanel, { inventoryEntryKey } from './InventoryPanel'

describe('InventoryPanel duplicate item identities', () => {
  it('creates stable unique React keys for duplicate itemId entries', () => {
    const keys = [
      inventoryEntryKey('black_fang', 0),
      inventoryEntryKey('black_fang', 1),
    ]
    expect(keys).toEqual(['black_fang-0', 'black_fang-1'])
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('renders every duplicate entry without changing quantity or visible order', () => {
    const markup = renderToStaticMarkup(createElement(InventoryPanel, {
      inventory: [
        { itemId: 'black_fang', quantity: 1 },
        { itemId: 'black_fang', quantity: 2 },
      ],
      equippedWeaponId: null,
      playerHp: 10,
      playerMaxHp: 10,
      onEquipWeapon: vi.fn(),
      onUnequipWeapon: vi.fn(),
      onUseHealingPotion: vi.fn(),
      equippedArmorId: null,
      onEquipItem: vi.fn(),
      onUnequipArmor: vi.fn(),
      profession: 'knight',
    }))

    expect(markup.match(/黑鬃狼牙/g)).toHaveLength(2)
    expect(markup.indexOf('×1')).toBeLessThan(markup.indexOf('×2'))
  })
})
