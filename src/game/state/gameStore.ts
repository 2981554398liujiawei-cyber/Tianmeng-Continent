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
  loadGame: () => void
  saveGame: () => void
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
    }
  },

  saveGame: () => {
    set((s) => {
      if (!s.gameState) return {}
      persistGame(s.gameState)
      return { hasSave: true }
    })
  },

  deleteGame: () => {
    deleteSave()
    set({ gameState: null, hasSave: false })
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
    if (!Number.isFinite(amount) || amount <= 0) return
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
    if (!Number.isFinite(amount) || amount <= 0) return
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
