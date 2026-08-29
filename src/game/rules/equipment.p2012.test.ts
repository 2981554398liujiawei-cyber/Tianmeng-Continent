import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { checkEquipItem, checkEquipEligibility } from './equipment'
import { useGameStore } from '../state/gameStore'

function mockStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockStorage())
  useGameStore.setState({ gameState: createInitialGameState({ name: '持盾验收员', gender: 'male', profession: 'knight', attributes: { str: 15, agi: 10, con: 9, mnd: 10, lck: 10 } }), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const state = () => useGameStore.getState().gameState!

function grantShield() {
  useGameStore.setState((current) => ({
    // minLevel 4 校验要求 adventureXp >= 25*4*5-50 = 450（等级与阅历不匹配时存档校验拒绝）
    gameState: current.gameState
      ? { ...current.gameState, player: { ...current.gameState.player, level: 4, adventureXp: Math.max(current.gameState.player.adventureXp, 450) }, inventory: [...current.gameState.inventory, { itemId: 'king_kong_giant_shield', quantity: 1 }] }
      : null,
  }))
}

describe('TM-P2-012 §70：装备要求（金刚巨盾 REQ1-6）', () => {
  it('REQ1 力量达标（STR>=15）→ 允许装备', () => {
    grantShield()
    expect(checkEquipItem(state(), 'king_kong_giant_shield')).toMatchObject({ allowed: true })
    expect(useGameStore.getState().equipItem('king_kong_giant_shield')).toBe(true)
    expect(state().equipment.armor).toBe('king_kong_giant_shield')
  })

  it('REQ2 力量不达标 → 拒绝且给出差距文案', () => {
    grantShield()
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, attributes: { ...current.gameState.player.attributes, str: 12 } } } : null }))
    const check = checkEquipItem(state(), 'king_kong_giant_shield')
    expect(check).toMatchObject({ allowed: false, reason: 'attribute' })
    expect(check.allowed === false && check.required).toBe('需要STR 15（当前 12）')
  })

  it('REQ3/REQ4 拒绝不改变 equipment 且不丢 inventory', () => {
    grantShield()
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, attributes: { ...current.gameState.player.attributes, str: 12 } } } : null }))
    const before = state()
    expect(useGameStore.getState().equipItem('king_kong_giant_shield')).toBe(false)
    expect(state().equipment).toEqual(before.equipment)
    expect(state().inventory).toEqual(before.inventory)
  })

  it('REQ5 差距文案区分需求与当前值（UI Tooltip 数据源）', () => {
    grantShield()
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, attributes: { ...current.gameState.player.attributes, str: 14 } } } : null }))
    const check = checkEquipItem(state(), 'king_kong_giant_shield')
    expect(check.allowed).toBe(false)
    expect(check.allowed === false && check.required).toContain('需要STR 15')
    expect(check.allowed === false && check.required).toContain('当前 14')
  })

  it('REQ6 达标装备后 save/load 保持 equipment', () => {
    grantShield()
    expect(useGameStore.getState().equipItem('king_kong_giant_shield')).toBe(true)
    expect(useGameStore.getState().saveGame('slot1')).toBe(true)
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(useGameStore.getState().loadSlot('slot1')).toBe(true)
    expect(state().equipment.armor).toBe('king_kong_giant_shield')
    // 卸下 → save/load 同样保持
    expect(useGameStore.getState().unequipSlot('armor')).toBe(true)
    expect(useGameStore.getState().saveGame('slot1')).toBe(true)
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(useGameStore.getState().loadSlot('slot1')).toBe(true)
    expect(state().equipment.armor).toBeNull()
    expect(state().inventory.some((entry) => entry.itemId === 'king_kong_giant_shield')).toBe(true)
  })
})

describe('TM-P2-012-R1 P1-06：统一装备资格规则（checkEquipEligibility 结构化输出）', () => {
  const shield = { type: 'armor', allowedProfessions: ['warrior', 'knight'] as const, requirements: { minLevel: 4, attributes: { str: 15 } } }

  it('满足等级 + STR → allowed；STR 不足给出结构化 attribute/requiredValue/currentValue', () => {
    expect(checkEquipEligibility(shield, { level: 4, attributes: { str: 15, agi: 10, con: 10, mnd: 10, lck: 10 }, profession: 'knight' })).toMatchObject({ allowed: true })
    const fail = checkEquipEligibility(shield, { level: 4, attributes: { str: 12, agi: 10, con: 10, mnd: 10, lck: 10 }, profession: 'knight' })
    expect(fail).toMatchObject({ allowed: false, reason: 'attribute', attribute: 'str', requiredValue: 15, currentValue: 12 })
    expect(fail.allowed === false && fail.required).toBe('需要STR 15（当前 12）')
  })

  it('等级不足 → reason=level 且给出等级差距', () => {
    const fail = checkEquipEligibility(shield, { level: 3, attributes: { str: 15, agi: 10, con: 10, mnd: 10, lck: 10 }, profession: 'knight' })
    expect(fail).toMatchObject({ allowed: false, reason: 'level', requiredValue: 4, currentValue: 3 })
  })

  it('失败原子性：装备失败不改变 equipment 且不丢 inventory（同一规则下再次验证）', () => {
    grantShield()
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, attributes: { ...current.gameState.player.attributes, str: 10 } } } : null }))
    const before = state()
    expect(useGameStore.getState().equipItem('king_kong_giant_shield')).toBe(false)
    expect(state().equipment).toEqual(before.equipment)
    expect(state().inventory).toEqual(before.inventory)
  })
})
