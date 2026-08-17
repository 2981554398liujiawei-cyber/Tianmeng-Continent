import { create } from 'zustand'
import type { CharacterCreationInput, GameState, QuestStatus } from '../types'
import { createInitialGameState } from '../content/initial'
import { checkTravel } from '../rules/exploration'
import { canTransitionQuestStatus } from '../rules/quest'
import { getEnemy, getItem, getLocation, getNpc, getQuest } from '../content'
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
  /** 新建游戏：传入创建输入则按玩家数据生成角色，否则生成默认开发角色（TM-P0-004） */
  newGame: (input?: CharacterCreationInput) => void
  /** 读档成功返回 true，无有效存档返回 false（TM-P0-001-R1：调用方据此决定是否可进入游戏页） */
  loadGame: () => boolean
  /** 保存成功返回 true，写入失败返回 false（TM-P0-001-R1） */
  saveGame: () => boolean
  deleteGame: () => void

  // 状态修改（数据流验证用最小动作集）
  /** 开发验证入口：直接设置地点（正式游戏页面禁止调用，仅开发者控制台使用，TM-P0-005） */
  setCurrentLocation: (locationId: string) => void
  /** 正式移动入口：Store 自身执行 checkTravel 校验，非法移动不改变 GameState（TM-P0-005） */
  travelToLocation: (targetLocationId: string) => boolean

  // 任务生命周期（TM-P0-006）
  /** 发现任务：不存在则创建 available QuestState；undiscovered → available；其余状态不重复创建 */
  discoverQuest: (questId: string) => boolean
  /** 接受任务：仅 available → in_progress */
  acceptQuest: (questId: string) => boolean
  /** 标记可完成：仅 in_progress → completable */
  markQuestCompletable: (questId: string) => boolean
  /** 完成任务：仅 completable → completed，不发奖励 */
  completeQuest: (questId: string) => boolean
  /** 任务失败：仅 in_progress/completable → failed（终态） */
  failQuest: (questId: string) => boolean

  /** 战斗伤害：hp = max(0, hp - amount)，仅正整数伤害，不设通用 setPlayerHp（TM-P0-008） */
  damagePlayer: (amount: number) => boolean
  /** 战斗胜利提交：Store 自校验敌人存在且属于当前地点；《村外异动》进行中在村外草原击败魔化兔 → completable（TM-P0-009） */
  resolveCombatVictory: (enemyId: string) => boolean
  /** 使用治疗药水：hp = min(maxHp, hp + healAmount)，药水 -1；满血/HP0/无药水返回 false 不变（TM-P0-010） */
  useHealingPotion: () => boolean
  /** 装备武器：仅可装备已拥有的 weapon，装备不消耗 inventory（TM-P0-013） */
  equipWeapon: (itemId: string) => boolean
  /** 卸下武器：weapon → null，inventory 不变（TM-P0-013） */
  unequipWeapon: () => boolean
  /** 在药师处购买治疗药水：gold 扣减与药水增加原子完成；不治疗、不自动保存（TM-P0-014） */
  buyHealingPotion: () => boolean
  addGold: (amount: number) => void
  removeGold: (amount: number) => void
  addItem: (itemId: string, quantity?: number) => void
  removeItem: (itemId: string, quantity?: number) => void
  setFlag: (key: string, value: boolean | number | string) => void
}

/** 任务发现：不存在 → 创建 available；undiscovered → available；其余状态不重复创建。非法返回 null（TM-P0-006） */
function applyQuestDiscovery(gameState: GameState, questId: string): GameState | null {
  if (!getQuest(questId)) return null
  const index = gameState.quests.findIndex((q) => q.questId === questId)
  if (index < 0) {
    return {
      ...gameState,
      quests: [...gameState.quests, { questId, status: 'available', stage: 0, flags: {} }],
    }
  }
  const current = gameState.quests[index]
  if (!current) return null
  if (current.status !== 'undiscovered') return null
  const nextQuests = [...gameState.quests]
  nextQuests[index] = { ...current, status: 'available' }
  return { ...gameState, quests: nextQuests }
}

/** 通用任务状态转换：仅当 questId 存在且状态转换合法时更新，否则返回 null（TM-P0-006） */
function applyQuestTransition(gameState: GameState, questId: string, to: QuestStatus): GameState | null {
  if (!getQuest(questId)) return null
  const index = gameState.quests.findIndex((q) => q.questId === questId)
  if (index < 0) return null
  const current = gameState.quests[index]
  if (!current) return null
  if (!canTransitionQuestStatus(current.status, to)) return null
  const nextQuests = [...gameState.quests]
  nextQuests[index] = { ...current, status: to }
  return { ...gameState, quests: nextQuests }
}

export const useGameStore = create<GameStoreState>()((set) => ({
  gameState: null,
  hasSave: storageHasSave(),

  newGame: (input) => {
    set({ gameState: createInitialGameState(input) })
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

  travelToLocation: (targetLocationId) => {
    let moved = false
    set((s) => {
      if (!s.gameState) return {}
      const check = checkTravel(s.gameState.world.currentLocationId, targetLocationId, s.gameState.world.flags)
      if (!check.allowed) return {}
      moved = true
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: targetLocationId },
        },
      }
    })
    return moved
  },

  // ---- 任务生命周期（TM-P0-006）----
  discoverQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyQuestDiscovery(s.gameState, questId)
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  acceptQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyQuestTransition(s.gameState, questId, 'in_progress')
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  markQuestCompletable: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyQuestTransition(s.gameState, questId, 'completable')
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  completeQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 先通过封板任务状态机（仅 completable → completed），再产生世界效果（TM-P0-011）
      const next = applyQuestTransition(s.gameState, questId, 'completed')
      if (!next) return {}
      changed = true
      // 《村外异动》成功完成 → 原子设置 rabbit_lair_unlocked（保留其他 flags）
      if (questId === 'quest_village_monsters') {
        return {
          gameState: {
            ...next,
            world: {
              ...next.world,
              flags: { ...next.world.flags, rabbit_lair_unlocked: true },
            },
          },
        }
      }
      return { gameState: next }
    })
    return changed
  },

  failQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyQuestTransition(s.gameState, questId, 'failed')
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  damagePlayer: (amount) => {
    if (!Number.isInteger(amount) || amount <= 0) return false
    let damaged = false
    set((s) => {
      if (!s.gameState) return {}
      const hp = Math.max(0, s.gameState.player.hp - amount)
      damaged = true
      return { gameState: { ...s.gameState, player: { ...s.gameState.player, hp } } }
    })
    return damaged
  },

  resolveCombatVictory: (enemyId) => {
    let ok = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验（不能只信 CombatPage）：敌人必须存在且属于当前地点
      const enemy = getEnemy(enemyId)
      if (!enemy) return {}
      const location = getLocation(s.gameState.world.currentLocationId)
      if (!location) return {}
      if (!location.enemyIds?.includes(enemyId)) return {}
      ok = true
      // 《村外异动》任务推进：村外草原击败魔化兔 → completable（复用封板状态机）
      if (enemyId === 'corrupted_rabbit' && location.id === 'village_grassland') {
        const next = applyQuestTransition(s.gameState, 'quest_village_monsters', 'completable')
        if (next) return { gameState: next }
      }
      // 嘟嘟兔固定战利品（TM-P0-012）：兔王巢穴击败嘟嘟兔 → 首次获得《兔子的路径》×1（唯一，不重复）
      if (enemyId === 'dudu_rabbit' && location.id === 'rabbit_lair') {
        const hasPath = s.gameState.inventory.some((e) => e.itemId === 'rabbit_path')
        if (!hasPath) {
          return {
            gameState: {
              ...s.gameState,
              inventory: [...s.gameState.inventory, { itemId: 'rabbit_path', quantity: 1 }],
            },
          }
        }
      }
      // 合法胜利但无持久效果（其他敌人 / 重复嘟嘟兔胜利 / 任务不在推进条件）：其余状态全部不变
      return {}
    })
    return ok
  },

  useHealingPotion: () => {
    let used = false
    set((s) => {
      if (!s.gameState) return {}
      const player = s.gameState.player
      // HP 0 不能复活；满血不浪费药水
      if (player.hp <= 0 || player.hp >= player.maxHp) return {}
      const potion = getItem('healing_potion')
      if (!potion?.healAmount || !Number.isInteger(potion.healAmount) || potion.healAmount <= 0) return {}
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === 'healing_potion')
      if (idx < 0) return {}
      const entry = inv[idx]
      if (!entry || entry.quantity < 1) return {}
      // 原子更新：HP 恢复与药水扣减在同一次 Store 更新中完成
      const hp = Math.min(player.maxHp, player.hp + potion.healAmount)
      const remaining = entry.quantity - 1
      const inventory =
        remaining > 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: remaining } : e))
          : inv.filter((e) => e.itemId !== 'healing_potion')
      used = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...player, hp },
          inventory,
        },
      }
    })
    return used
  },

  equipWeapon: (itemId) => {
    let equipped = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验：物品存在、是 weapon、且背包实际拥有该武器
      const item = getItem(itemId)
      if (!item || item.type !== 'weapon') return {}
      const owned = s.gameState.inventory.some((e) => e.itemId === itemId && e.quantity >= 1)
      if (!owned) return {}
      equipped = true
      return {
        gameState: {
          ...s.gameState,
          equipment: { ...s.gameState.equipment, weapon: itemId },
        },
      }
    })
    return equipped
  },

  unequipWeapon: () => {
    let unequipped = false
    set((s) => {
      if (!s.gameState) return {}
      if (s.gameState.equipment.weapon === null) return {}
      unequipped = true
      return {
        gameState: {
          ...s.gameState,
          equipment: { ...s.gameState.equipment, weapon: null },
        },
      }
    })
    return unequipped
  },

  buyHealingPotion: () => {
    let bought = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验：当前地点必须有药师在场（读 NPC 注册表，不硬编码地点）
      const apothecary = getNpc('apothecary')
      if (!apothecary || apothecary.locationId !== s.gameState.world.currentLocationId) return {}
      // 商品数据校验：治疗药水存在、consumable、value 为正整数（价格唯一来源 ItemDefinition.value）
      const potion = getItem('healing_potion')
      if (!potion || potion.type !== 'consumable') return {}
      const price = potion.value
      if (!Number.isSafeInteger(price) || price <= 0) return {}
      const gold = s.gameState.player.gold
      if (!Number.isSafeInteger(gold) || gold < price) return {}
      // 数量安全：药水数量 +1 必须是安全整数
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === 'healing_potion')
      const current = idx >= 0 ? (inv[idx]?.quantity ?? 0) : 0
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(current + 1)) return {}
      // 原子交易：金币扣除与药水增加在同一次 Store 更新中完成（不拼接 removeGold/addItem）
      const inventory =
        idx >= 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: (e.quantity ?? 0) + 1 } : e))
          : [...inv, { itemId: 'healing_potion', quantity: 1 }]
      bought = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...s.gameState.player, gold: gold - price },
          inventory,
        },
      }
    })
    return bought
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
    // R4：拒绝非有限数字（NaN/±Infinity 无法 JSON round-trip，写入后存档将不可加载）
    if (typeof value === 'number' && !Number.isFinite(value)) return
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
