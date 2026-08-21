import { describe, expect, it } from 'vitest'
import { combatLootItemKey } from './CombatPage'

describe('CombatPage victory loot React identity', () => {
  it('creates stable unique keys for guaranteed and luck duplicate drops', () => {
    const keys = [
      combatLootItemKey('black_fang', 0),
      combatLootItemKey('black_fang', 1),
    ]

    expect(keys).toEqual(['black_fang-0', 'black_fang-1'])
    expect(new Set(keys).size).toBe(keys.length)
  })
})
