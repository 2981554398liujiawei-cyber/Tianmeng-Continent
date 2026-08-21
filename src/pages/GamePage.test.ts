import { describe, expect, it } from 'vitest'
import { rewardItemKey } from './GamePage'

describe('GamePage reward item React identity', () => {
  it('creates stable unique keys for duplicate loot itemId entries', () => {
    const keys = [
      rewardItemKey('black_fang', 0),
      rewardItemKey('black_fang', 1),
    ]

    expect(keys).toEqual(['black_fang-0', 'black_fang-1'])
    expect(new Set(keys).size).toBe(keys.length)
  })
})
