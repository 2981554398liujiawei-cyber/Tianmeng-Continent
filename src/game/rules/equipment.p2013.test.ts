/**
 * TM-P2-013 §26：黑石职业装备 Requirement QA（EQ1-EQ12）。
 * 四件装备覆盖 STR/CON/AGI/MND 四属性门槛——统一由 checkEquipEligibility 处理，无职业特判。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { getItem } from '../content'
import { checkEquipItem, checkEquipEligibility } from './equipment'
import { useGameStore } from '../state/gameStore'

function mockStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockStorage())
  useGameStore.setState({ gameState: createInitialGameState({ name: '装备验收员', gender: 'male', profession: 'warrior', attributes: { str: 14, agi: 10, con: 10, mnd: 10, lck: 10 } }), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const state = () => useGameStore.getState().gameState!
const store = () => useGameStore.getState()

function asPlayer(profession: 'warrior' | 'knight' | 'ranger' | 'mage', attrs: { str: number; agi: number; con: number; mnd: number; lck: number }, level = 6) {
  return { level, attributes: attrs, profession }
}

describe('TM-P2-013 §26：黑石职业装备（EQ1-EQ12）', () => {
  const ATTR = { pass: 14, fail: 12 }
  const base = { str: ATTR.fail, agi: ATTR.fail, con: ATTR.fail, mnd: ATTR.fail, lck: 10 }

  it('EQ1/EQ2 Warrior：STR 达标可装备；不足拒绝且给出结构化差距', () => {
    const def = getItem('blackstone_warblade')!
    expect(checkEquipEligibility(def, asPlayer('warrior', { ...base, str: ATTR.pass }))).toMatchObject({ allowed: true, slot: 'weapon' })
    const fail = checkEquipEligibility(def, asPlayer('warrior', base))
    expect(fail).toMatchObject({ allowed: false, reason: 'attribute', attribute: 'str', requiredValue: 14, currentValue: 12 })
    expect(fail.allowed === false && fail.required).toBe('需要STR 14（当前 12）')
  })

  it('EQ3/EQ4 Knight：CON 达标可装备守卫甲；不足拒绝', () => {
    const def = getItem('blackstone_guard_armor')!
    expect(checkEquipEligibility(def, asPlayer('knight', { ...base, con: ATTR.pass }))).toMatchObject({ allowed: true, slot: 'armor' })
    const fail = checkEquipEligibility(def, asPlayer('knight', base))
    expect(fail).toMatchObject({ allowed: false, reason: 'attribute', attribute: 'con', requiredValue: 14, currentValue: 12 })
  })

  it('EQ5/EQ6 Ranger：AGI 达标可装备猎弓；不足拒绝（UI 翻译规则输出，无职业特判）', () => {
    const def = getItem('blackstone_hunter_bow')!
    expect(checkEquipEligibility(def, asPlayer('ranger', { ...base, agi: ATTR.pass }))).toMatchObject({ allowed: true, slot: 'weapon' })
    const fail = checkEquipEligibility(def, asPlayer('ranger', base))
    expect(fail).toMatchObject({ allowed: false, reason: 'attribute', attribute: 'agi', requiredValue: 14, currentValue: 12 })
  })

  it('EQ7/EQ8 Mage：MND 达标可装备共鸣杖；不足拒绝', () => {
    const def = getItem('blackstone_resonance_staff')!
    expect(checkEquipEligibility(def, asPlayer('mage', { ...base, mnd: ATTR.pass }))).toMatchObject({ allowed: true, slot: 'weapon' })
    const fail = checkEquipEligibility(def, asPlayer('mage', base))
    expect(fail).toMatchObject({ allowed: false, reason: 'attribute', attribute: 'mnd', requiredValue: 14, currentValue: 12 })
  })

  it('EQ9 minLevel：等级不足拒绝（属性达标也不行）', () => {
    const def = getItem('blackstone_warblade')!
    const fail = checkEquipEligibility(def, asPlayer('warrior', { str: 14, agi: 10, con: 10, mnd: 10, lck: 10 }, 5))
    expect(fail).toMatchObject({ allowed: false, reason: 'level', requiredValue: 6, currentValue: 5 })
  })

  it('EQ10 profession：职业不符拒绝（统一 allowedProfessions，非职业特判）', () => {
    expect(checkEquipEligibility(getItem('blackstone_warblade')!, asPlayer('knight', { str: 14, agi: 10, con: 10, mnd: 10, lck: 10 }))).toMatchObject({ allowed: false, reason: 'profession' })
    expect(checkEquipEligibility(getItem('blackstone_guard_armor')!, asPlayer('warrior', { str: 14, agi: 10, con: 10, mnd: 10, lck: 10 }))).toMatchObject({ allowed: false, reason: 'profession' })
  })

  it('EQ11 equip failure inventory 不变（Store checkEquipItem 走同一规则）', () => {
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, level: 6 }, inventory: [...current.gameState.inventory, { itemId: 'blackstone_warblade', quantity: 1 }] } : null }))
    const before = state()
    // warrior str14 达标 → 成功
    expect(store().equipItem('blackstone_warblade')).toBe(true)
    expect(state().equipment.weapon).toBe('blackstone_warblade')
    expect(store().unequipSlot('weapon')).toBe(true)
    // str 不足 → 拒绝且原状态不变
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, attributes: { ...current.gameState.player.attributes, str: 12 } } } : null }))
    const before2 = state()
    expect(checkEquipItem(state(), 'blackstone_warblade')).toMatchObject({ allowed: false, reason: 'attribute' })
    expect(store().equipItem('blackstone_warblade')).toBe(false)
    expect(state().equipment).toEqual(before2.equipment)
    expect(state().inventory).toEqual(before2.inventory)
    expect(before.player.attributes.str).toBe(14)
  })

  it('EQ12 UI 消息数据源：required 文案包含当前值与要求值（UI 只 render 规则输出）', () => {
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, level: 6, attributes: { ...current.gameState.player.attributes, str: 12 } }, inventory: [...current.gameState.inventory, { itemId: 'blackstone_warblade', quantity: 1 }] } : null }))
    const check = checkEquipItem(state(), 'blackstone_warblade')
    expect(check.allowed).toBe(false)
    expect(check.allowed === false && check.required).toContain('需要STR 14')
    expect(check.allowed === false && check.required).toContain('当前 12')
    expect(check.allowed === false && check.requiredValue).toBe(14)
    expect(check.allowed === false && check.currentValue).toBe(12)
  })

  it('Save/Reload：鉴定装备穿在身上保持', () => {
    // level 6 需 adventureXp >= 1000（25*6*7-50），否则存档格式校验拒绝写入
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, level: 6, adventureXp: Math.max(current.gameState.player.adventureXp, 1000) }, inventory: [...current.gameState.inventory, { itemId: 'blackstone_warblade', quantity: 1 }] } : null }))
    expect(store().equipItem('blackstone_warblade')).toBe(true)
    expect(store().saveGame('slot1')).toBe(true)
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(store().loadSlot('slot1')).toBe(true)
    expect(state().equipment.weapon).toBe('blackstone_warblade')
  })
})
