import { create } from 'zustand'
import type { GameState } from '../types'
import { createInitialGameState } from '../content/initial'
import {
  deleteGame as deleteSave,
  hasSave as storageHasSave,
  loadGame as loadSaveFromStorage,
  saveGame as persistGame,
} from '../utils/storage'

interface GameStoreState {
  /** 当前游戏状态；null 表示尚未开始 */
  gameState: GameState | null
  /** 是否存在可继续的存档 */
  hasSave: boolean

  // 存档生命周期
  newGame: () => void
  /** 读档成功返回 true，无有效存档返回 false（TM-P0-001-R1：调用方据此决定是否可进入游戏页） */
  loadGame: () => boolean
  /** 保存成功返回 true，写入失败返回 false（TM-P0-001-R1） */
  saveGame: () => boolean
  deleteGame: () => void

  // 状态修改（数据流验证用最小动作集）
  setCurrentLocation: (locationId: string) => void
  addGold: (amount: number) => void
  removeGold: (amount: number) => void
  addItem: (itemId: string, quantity?: number) => void
  removeItem: (itemId: string, quantity?: number) => void
  setFlag: (key: string, value: boolean | number | string) => void
}

export const useGameStore = create<GameStoreState>()((set) => ({
  gameState: null,
  hasSave: storageHasSave(),

  newGame: () => {
    set({ gameState: createInitialGameState() })
  },

  loadGame: () => {
    const save = loadSaveFromStorage()
    if (save) {
      set({ gameState: save.gameState, hasSave: true })
      return true
    }
    // R2：storage 已无合法存档时同步 hasSave，保持「hasSave = storage 当前是否存在合法档」
    set({ hasSave: false })
    return false
  },

  saveGame: () => {
    let ok = false
    set((s) => {
      if (!s.gameState) return {}
      ok = persistGame(s.gameState)
      // R2：hasSave 始终反映 storage 的真实状态，而不是本次写入结果；
      // 写入失败但旧合法存档仍在时，不得错误地丢失 hasSave=true
      return { hasSave: storageHasSave() }
    })
    return ok
  },

  deleteGame: () => {
    deleteSave()
    // R3：以 storage 实际状态为准——删除失败时旧档仍在，不得错误宣称无存档
    set({ gameState: null, hasSave: storageHasSave() })
  },

  setCurrentLocation: (locationId) => {
    if (!locationId) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              world: { ...s.gameState.world, currentLocationId: locationId },
            },
          }
        : {},
    )
  },

  addGold: (amount) => {
    // R3：与存档校验一致，金币仅允许正整数增量（保持非负整数约束）
    if (!Number.isInteger(amount) || amount <= 0) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              player: { ...s.gameState.player, gold: s.gameState.player.gold + amount },
            },
          }
        : {},
    )
  },

  removeGold: (amount) => {
    if (!Number.isInteger(amount) || amount <= 0) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              player: {
                ...s.gameState.player,
                gold: Math.max(0, s.gameState.player.gold - amount),
              },
            },
          }
        : {},
    )
  },

  addItem: (itemId, quantity = 1) => {
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) return
    set((s) => {
      if (!s.gameState) return {}
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === itemId)
      const next =
        idx >= 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + quantity } : e))
          : [...inv, { itemId, quantity }]
      return { gameState: { ...s.gameState, inventory: next } }
    })
  },

  removeItem: (itemId, quantity = 1) => {
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) return
    set((s) => {
      if (!s.gameState) return {}
      const inv = s.gameState.inventory
      const entry = inv.find((e) => e.itemId === itemId)
      if (!entry) return {}
      const remaining = entry.quantity - quantity
      const next =
        remaining > 0
          ? inv.map((e) => (e.itemId === itemId ? { ...e, quantity: remaining } : e))
          : inv.filter((e) => e.itemId !== itemId)
      return { gameState: { ...s.gameState, inventory: next } }
    })
  },

  setFlag: (key, value) => {
    if (!key) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              world: {
                ...s.gameState.world,
                flags: { ...s.gameState.world.flags, [key]: value },
              },
            },
          }
        : {},
    )
  },
}))
