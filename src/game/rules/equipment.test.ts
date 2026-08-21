import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { checkEquipItem } from './equipment'
describe('TM-P2-005 防具规则', () => {
  it('职业限制由 definition 驱动', () => {
    const state = createInitialGameState({ name: '法师', gender: 'female', profession: 'mage', attributes: { str: 8, con: 10, agi: 10, mnd: 16, lck: 10 } })
    state.inventory.push({ itemId: 'chainmail_armor', quantity: 1 })
    expect(checkEquipItem(state, 'chainmail_armor').allowed).toBe(false)
    expect(checkEquipItem(state, 'traveler_cloth_armor').allowed).toBe(true)
  })
  it('未拥有或错误类型拒绝', () => { const state = createInitialGameState(); expect(checkEquipItem(state, 'chainmail_armor').reason).toBe('not_owned'); expect(checkEquipItem(state, 'healing_potion').reason).toBe('wrong_type') })
})
