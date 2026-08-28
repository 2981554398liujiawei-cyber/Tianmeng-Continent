import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { GATHERING, getItem, getLocation } from '../content'
import { checkGathering } from './gathering'
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
  useGameStore.setState({ gameState: createInitialGameState({ name: '采集验收员', gender: 'male', profession: 'ranger', attributes: { str: 10, agi: 14, con: 10, mnd: 12, lck: 8 } }), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const state = () => useGameStore.getState().gameState!
const store = () => useGameStore.getState()

function at(locationId: string) {
  useGameStore.setState((current) => ({
    gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, currentLocationId: locationId } } : null,
  }))
}

function unlockGathering() {
  useGameStore.setState((current) => ({
    gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, flags: { ...current.gameState.world.flags, gathering_v1_unlocked: true } } } : null,
  }))
}

function setFlag(flag: string) {
  useGameStore.setState((current) => ({
    gameState: current.gameState ? { ...current.gameState, world: { ...current.gameState.world, flags: { ...current.gameState.world.flags, [flag]: true } } } : null,
  }))
}

function quantity(itemId: string) {
  return state().inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0
}

describe('TM-P2-012 §71：Gathering V1（G1-G12）', () => {
  it('G1 definition valid：全部节点 id/name/location/category/resultItems 合法且物品已注册', () => {
    const ids = Object.keys(GATHERING)
    expect(ids.length).toBeGreaterThanOrEqual(5)
    expect(ids.length).toBeLessThanOrEqual(6)
    for (const node of Object.values(GATHERING)) {
      expect(node.name.length).toBeGreaterThan(0)
      expect(getLocation(node.locationId)).toBeDefined()
      expect(['herb', 'natural', 'creature']).toContain(node.category)
      expect(node.resultItems.length).toBeGreaterThan(0)
      for (const result of node.resultItems) {
        expect(Number.isInteger(result.quantity)).toBe(true)
        expect(result.quantity).toBeGreaterThan(0)
        expect(getItem(result.itemId)).toBeDefined()
      }
    }
  })

  it('G2 node location：节点挂载在北坡 / 神泉山谷两个 authored 地点', () => {
    for (const node of Object.values(GATHERING)) {
      expect(['qingshi_north_hills', 'spirit_spring_valley']).toContain(node.locationId)
    }
  })

  it('G3/G6 一次性采集：成功写入 world flag 与背包', () => {
    at('qingshi_north_hills')
    unlockGathering()
    expect(store().gather('north_hills_hemostatic_herb')).toBe(true)
    expect(state().world.flags.gathered_north_hills_hemostatic_herb).toBe(true)
    expect(quantity('hemostatic_herb')).toBe(2)
  })

  it('G4 第二次采集拒绝', () => {
    at('qingshi_north_hills')
    unlockGathering()
    expect(store().gather('north_hills_hemostatic_herb')).toBe(true)
    expect(store().gather('north_hills_hemostatic_herb')).toBe(false)
    expect(quantity('hemostatic_herb')).toBe(2)
  })

  it('G5 prerequisite：未满足前置的节点拒绝（locked）', () => {
    at('spirit_spring_valley')
    unlockGathering()
    expect(checkGathering(state(), 'spirit_spring_water')).toMatchObject({ allowed: false, reason: 'locked' })
  })

  it('G7 unknown node rejected', () => {
    at('qingshi_north_hills')
    unlockGathering()
    expect(checkGathering(state(), 'no_such_node')).toMatchObject({ allowed: false, reason: 'unknown' })
    expect(store().gather('no_such_node')).toBe(false)
  })

  it('G8 任务物品神泉之水 guaranteed：Boss 后恰好 1 瓶', () => {
    at('spirit_spring_valley')
    unlockGathering()
    setFlag('black_bear_qialala_defeated')
    expect(store().gather('spirit_spring_water')).toBe(true)
    expect(quantity('spirit_spring_water')).toBe(1)
  })

  it('G9 LUCK 不影响 mandatory item：高 LCK 不改变采集结果', () => {
    at('spirit_spring_valley')
    unlockGathering()
    setFlag('black_bear_qialala_defeated')
    expect(store().gather('spirit_spring_water')).toBe(true)
    expect(quantity('spirit_spring_water')).toBe(1)
    useGameStore.setState((current) => ({ gameState: current.gameState ? { ...current.gameState, player: { ...current.gameState.player, attributes: { ...current.gameState.player.attributes, lck: 18 } } } : null }))
    expect(store().gather('spirit_spring_water')).toBe(false)
    expect(quantity('spirit_spring_water')).toBe(1)
  })

  it('G10 creature gather requires defeat：未击败对应野兽时锁定', () => {
    at('qingshi_north_hills')
    unlockGathering()
    expect(checkGathering(state(), 'forest_boar_hide')).toMatchObject({ allowed: false, reason: 'locked' })
    expect(store().gather('forest_boar_hide')).toBe(false)
    setFlag('forest_boar_first_kill')
    expect(store().gather('forest_boar_hide')).toBe(true)
    expect(quantity('wild_boar_hide')).toBe(1)
  })

  it('G11 unrelated enemy cannot gather：击败无关敌人不解锁采集', () => {
    at('qingshi_north_hills')
    unlockGathering()
    setFlag('wild_boar_first_kill')
    setFlag('corrupted_rat_first_kill')
    expect(checkGathering(state(), 'forest_boar_hide')).toMatchObject({ allowed: false, reason: 'locked' })
  })

  it('G12 save/load preserves gathered state', () => {
    at('qingshi_north_hills')
    unlockGathering()
    expect(store().gather('north_hills_hemostatic_herb')).toBe(true)
    expect(store().saveGame('slot1')).toBe(true)
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(store().loadSlot('slot1')).toBe(true)
    expect(state().world.flags.gathered_north_hills_hemostatic_herb).toBe(true)
    expect(quantity('hemostatic_herb')).toBe(2)
    expect(store().gather('north_hills_hemostatic_herb')).toBe(false)
  })

  it('补充：未解锁采集（王五教学前）全部节点锁定；地点不对拒绝', () => {
    at('qingshi_north_hills')
    setFlag('forest_boar_first_kill')
    expect(checkGathering(state(), 'north_hills_hemostatic_herb')).toMatchObject({ allowed: false, reason: 'locked' })
    expect(store().gather('north_hills_hemostatic_herb')).toBe(false)
    unlockGathering()
    at('spirit_spring_valley')
    expect(checkGathering(state(), 'north_hills_hemostatic_herb')).toMatchObject({ allowed: false, reason: 'wrong_location' })
  })
})
