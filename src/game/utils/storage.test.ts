import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import {
  SAVE_KEY,
  SAVE_VERSION,
  deleteGame,
  hasSave,
  loadGame,
  saveGame,
} from './storage'

function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('存档读写', () => {
  it('保存后关键状态保持一致', () => {
    const state = createInitialGameState()
    state.player.gold = 77
    state.world.currentLocationId = 'misty_ruins'
    saveGame(state)

    const save = loadGame()
    expect(save).not.toBeNull()
    expect(save?.version).toBe(SAVE_VERSION)
    expect(save?.gameState.player.gold).toBe(77)
    expect(save?.gameState.world.currentLocationId).toBe('misty_ruins')
    expect(save?.gameState.player.name).toBe('石头城')
    expect(save?.gameState.inventory).toHaveLength(2)
  })

  it('无存档时返回 null', () => {
    expect(loadGame()).toBeNull()
    expect(hasSave()).toBe(false)
  })

  it('保存后 hasSave 为 true，删除后为 false', () => {
    saveGame(createInitialGameState())
    expect(hasSave()).toBe(true)
    deleteGame()
    expect(hasSave()).toBe(false)
  })
})

describe('异常存档处理', () => {
  it('损坏 JSON 不导致崩溃，返回 null', () => {
    localStorage.setItem(SAVE_KEY, '{ not valid json !!!')
    expect(() => loadGame()).not.toThrow()
    expect(loadGame()).toBeNull()
  })

  it('结构不合法的存档被安全回退', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 'x', gameState: {} }))
    expect(() => loadGame()).not.toThrow()
    expect(loadGame()).toBeNull()
  })

  it('版本不匹配的存档被忽略', () => {
    const state = createInitialGameState()
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 999, savedAt: 'x', gameState: state }),
    )
    expect(loadGame()).toBeNull()
  })

  it('顶层非对象数据被忽略', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify('garbage'))
    expect(loadGame()).toBeNull()
  })
})

describe('TM-P0-001-R1：有效存档判定统一（loadGame / hasSave 共用）', () => {
  const writeRaw = (gameState: unknown) => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: SAVE_VERSION, savedAt: 'x', gameState }),
    )
  }

  it('合法存档 → hasSave 为 true', () => {
    saveGame(createInitialGameState())
    expect(hasSave()).toBe(true)
  })

  it('损坏 JSON → hasSave 为 false', () => {
    localStorage.setItem(SAVE_KEY, '{ broken json')
    expect(hasSave()).toBe(false)
  })

  it('顶层看似正确但 player 缺字段（空对象）→ 拒绝', () => {
    writeRaw({
      player: {},
      inventory: [],
      equipment: { weapon: null, armor: null, accessory: null },
      quests: [],
      world: { currentLocationId: 'x', flags: {}, completedEvents: [], npcStates: {} },
    })
    expect(loadGame()).toBeNull()
    expect(hasSave()).toBe(false)
  })

  it('attributes 缺字段 → 拒绝', () => {
    const state = createInitialGameState()
    const attrs = state.player.attributes as Record<string, number>
    delete attrs.str
    writeRaw(state)
    expect(loadGame()).toBeNull()
    expect(hasSave()).toBe(false)
  })

  it('inventory entry 数量非法（0 / 负数）→ 拒绝', () => {
    writeRaw({ ...createInitialGameState(), inventory: [{ itemId: 'x', quantity: 0 }] })
    expect(loadGame()).toBeNull()
    writeRaw({ ...createInitialGameState(), inventory: [{ itemId: 'x', quantity: -1 }] })
    expect(loadGame()).toBeNull()
    expect(hasSave()).toBe(false)
  })

  it('world 缺 currentLocationId → 拒绝', () => {
    const state = createInitialGameState()
    const world = state.world as Partial<typeof state.world>
    delete world.currentLocationId
    writeRaw(state)
    expect(loadGame()).toBeNull()
    expect(hasSave()).toBe(false)
  })

  it('错误版本 → 拒绝且 hasSave 为 false', () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 2, savedAt: 'x', gameState: createInitialGameState() }),
    )
    expect(loadGame()).toBeNull()
    expect(hasSave()).toBe(false)
  })

  it('坏档保留在 localStorage 但一律视为无效（行为确定：拒绝加载）', () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, savedAt: 'x', gameState: {} }))
    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()
    expect(loadGame()).toBeNull()
  })
})
