import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { checkIdentification } from './identification'

const state = (overrides: { relic?: number; gold?: number; profession?: 'warrior' | 'knight' | 'ranger' | 'mage' } = {}) => {
  const s = createInitialGameState({ name: '鉴定验收员', gender: 'male', profession: overrides.profession ?? 'knight', attributes: { str: 12, agi: 10, con: 12, mnd: 10, lck: 10 } })
  if (overrides.relic) s.inventory.push({ itemId: 'unidentified_blackstone_relic', quantity: overrides.relic })
  if (overrides.gold !== undefined) s.player.gold = overrides.gold
  return s
}

describe('TM-P2-013 §25：鉴定纯规则（ID1-ID4 校验层）', () => {
  it('ID1 未知 identification → reject', () => {
    expect(checkIdentification(state({ relic: 1 }), 'no_such_identification')).toMatchObject({ allowed: false, reason: 'unknown' })
  })

  it('ID2 无遗物 → reject（数量 <1 同样拒绝）', () => {
    expect(checkIdentification(state(), 'identification_blackstone_relic')).toMatchObject({ allowed: false, reason: 'no_source' })
    expect(checkIdentification(state({ relic: 0 }), 'identification_blackstone_relic')).toMatchObject({ allowed: false, reason: 'no_source' })
  })

  it('ID3 金币不足 → reject', () => {
    expect(checkIdentification(state({ relic: 1, gold: 19 }), 'identification_blackstone_relic')).toMatchObject({ allowed: false, reason: 'gold_insufficient' })
  })

  it('四职业各自映射确定结果（纯规则层预览；事务原子性在 Store 层测）', () => {
    expect(checkIdentification(state({ relic: 1, gold: 100, profession: 'warrior' }), 'identification_blackstone_relic')).toMatchObject({ allowed: true, resultItemId: 'blackstone_warblade', goldCost: 20 })
    expect(checkIdentification(state({ relic: 1, gold: 100, profession: 'knight' }), 'identification_blackstone_relic')).toMatchObject({ allowed: true, resultItemId: 'blackstone_guard_armor' })
    expect(checkIdentification(state({ relic: 1, gold: 100, profession: 'ranger' }), 'identification_blackstone_relic')).toMatchObject({ allowed: true, resultItemId: 'blackstone_hunter_bow' })
    expect(checkIdentification(state({ relic: 1, gold: 100, profession: 'mage' }), 'identification_blackstone_relic')).toMatchObject({ allowed: true, resultItemId: 'blackstone_resonance_staff' })
  })
})
