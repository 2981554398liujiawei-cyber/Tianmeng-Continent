import { create } from 'zustand'
import type { CharacterCreationInput, GameState, QuestStatus } from '../types'
import { createInitialGameState } from '../content/initial'
import { checkTravel } from '../rules/exploration'
import { canTransitionQuestStatus } from '../rules/quest'
import { getEnemy, getItem, getLocation, getNpc, getQuest } from '../content'
import { performD20Check, CHECK_DC, type D20CheckResult } from '../rules/d20'
import { MAGE_SPELL_MP_COST } from '../rules/combat'

/** TM-P1-003：《村外异动》完成后村长一次性回应事件 ID（唯一代码来源，GamePage 亦读取） */
export const VILLAGE_ELDER_POST_QUEST_EVENT_ID = 'village_elder_post_quest_response'
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
  /** 村长任务后一次性回应选择（TM-P1-003）：仅 completed 且在村长处且未回应过才可执行；reassure→信任+1 / resolve→尊敬+1 */
  respondToVillageElderAfterQuest: (choice: 'reassure' | 'resolve') => boolean

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
  /** 在铁匠处出售铁矿石：gold 增加与铁矿石减少原子完成；不自动保存（TM-P0-021） */
  sellIronOre: () => boolean
  /** 青石村休整：HP/MP 恢复至最大值；免费、只改 hp/mp、不自动保存（TM-P0-022） */
  restAtVillage: () => boolean
  /** 法师法术攻击灵力消费（TM-P1-001）：仅 mage 可消费 MAGE_SPELL_MP_COST；只改 player.mp；不自动保存 */
  spendMageSpellMp: () => boolean
  /** 调查废弃矿洞（TM-P0-016）：心智 D20 检定一次性写入 flags；非法/已调查/异常 → null 且不变 */
  investigateAbandonedMine: () => D20CheckResult | null
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
      // 金币安全边界（TM-P0-018）：gold 非负安全整数、goldReward 正安全整数、相加仍安全整数；否则完全拒绝完成
      const reward = getQuest(questId)?.goldReward
      if (reward !== undefined) {
        const gold = next.player.gold
        if (
          !Number.isSafeInteger(gold) ||
          gold < 0 ||
          !Number.isSafeInteger(reward) ||
          reward <= 0 ||
          !Number.isSafeInteger(gold + reward)
        ) {
          return {}
        }
      }
      // TM-P1-002 关系安全预检（《村外异动》专属）：村长 trust 可安全 +1 才允许完成，否则整次拒绝
      if (questId === 'quest_village_monsters') {
        const existing = next.world.npcStates.village_elder
        if (existing) {
          const trust = existing.relationship.trust
          if (!Number.isFinite(trust) || !Number.isFinite(trust + 1)) return {}
        } else if (!getNpc('village_elder')) {
          return {}
        }
      }
      changed = true
      // 任务完成 + 金币奖励 +（《村外异动》）兔王巢穴解锁 + 村长信任：同一原子更新
      const player = reward !== undefined ? { ...next.player, gold: next.player.gold + reward } : next.player
      if (questId === 'quest_village_monsters') {
        // TM-P1-002：《村外异动》专属关系奖励——村长信任 +1（仅本任务；懒创建 NpcState；locationId 读注册表）
        const existing = next.world.npcStates.village_elder
        const elderState = existing
          ? { ...existing, relationship: { ...existing.relationship, trust: existing.relationship.trust + 1 } }
          : {
              npcId: 'village_elder',
              alive: true,
              locationId: getNpc('village_elder')!.locationId,
              relationship: { trust: 1, affection: 0, respect: 0, fear: 0, resentment: 0 },
            }
        return {
          gameState: {
            ...next,
            player,
            world: {
              ...next.world,
              flags: { ...next.world.flags, rabbit_lair_unlocked: true },
              npcStates: { ...next.world.npcStates, village_elder: elderState },
            },
          },
        }
      }
      return reward !== undefined ? { gameState: { ...next, player } } : { gameState: next }
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
      // 魔化鼠固定战利品（TM-P0-020）：废弃矿洞击败魔化鼠 → 铁矿石 +1（重复胜利堆叠同一 entry）
      if (enemyId === 'corrupted_rat' && location.id === 'abandoned_mine') {
        const inv = s.gameState.inventory
        const idx = inv.findIndex((e) => e.itemId === 'iron_ore')
        const current = idx >= 0 ? (inv[idx]?.quantity ?? 0) : 0
        // 数量安全：已有数量合法且 +1 仍为安全整数才更新；否则胜利仍合法但 inventory 不变
        if (
          idx < 0 ||
          (Number.isSafeInteger(current) && current >= 1 && Number.isSafeInteger(current + 1))
        ) {
          const inventory =
            idx >= 0
              ? inv.map((e, i) => (i === idx ? { ...e, quantity: current + 1 } : e))
              : [...inv, { itemId: 'iron_ore', quantity: 1 }]
          return { gameState: { ...s.gameState, inventory } }
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

  investigateAbandonedMine: () => {
    let result: D20CheckResult | null = null
    set((s) => {
      if (!s.gameState) return {}
      // 合法性：必须在废弃矿洞，且未调查过（一次性检定，禁止重掷）
      if (s.gameState.world.currentLocationId !== 'abandoned_mine') return {}
      if (s.gameState.world.flags.abandoned_mine_investigation !== undefined) return {}
      // D20 异常安全：角色数据非法（如 level=0）抛 RangeError → 返回 null 且状态不变、页面不崩溃
      let check: D20CheckResult
      try {
        check = performD20Check({
          attributeScore: s.gameState.player.attributes.mnd,
          level: s.gameState.player.level,
          dc: CHECK_DC.moderate,
          proficient: false,
          situationalModifier: 0,
        })
      } catch {
        return {}
      }
      // 原子更新：D20 结算与 flags 写入在同一次 Store 更新中完成（不调用通用 setFlag 二次更新）
      result = check
      const investigation = check.success ? 'success' : 'failure'
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            flags: { ...s.gameState.world.flags, abandoned_mine_investigation: investigation },
          },
        },
      }
    })
    return result
  },

  sellIronOre: () => {
    let sold = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验：当前地点必须有铁匠在场（读 NPC 注册表，不硬编码地点）
      const blacksmith = getNpc('blacksmith')
      if (!blacksmith || blacksmith.locationId !== s.gameState.world.currentLocationId) return {}
      // 商品数据校验：铁矿石存在、material、value 为正安全整数（价格唯一来源 ItemDefinition.value）
      const ore = getItem('iron_ore')
      if (!ore || ore.type !== 'material') return {}
      const price = ore.value
      if (!Number.isSafeInteger(price) || price <= 0) return {}
      // 库存校验：拥有铁矿石且数量为正安全整数
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === 'iron_ore')
      if (idx < 0) return {}
      const quantity = inv[idx]?.quantity
      if (!Number.isSafeInteger(quantity) || (quantity ?? 0) < 1) return {}
      // 金币安全：非负安全整数且 +price 仍安全整数
      const gold = s.gameState.player.gold
      if (!Number.isSafeInteger(gold) || gold < 0 || !Number.isSafeInteger(gold + price)) return {}
      // 原子交易：金币增加与铁矿石减少在同一次 Store 更新中完成（不拼接 removeItem/addGold）
      const remaining = (quantity ?? 0) - 1
      const inventory = remaining > 0 ? inv.map((e, i) => (i === idx ? { ...e, quantity: remaining } : e)) : inv.filter((e) => e.itemId !== 'iron_ore')
      sold = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...s.gameState.player, gold: gold + price },
          inventory,
        },
      }
    })
    return sold
  },

  restAtVillage: () => {
    let rested = false
    set((s) => {
      if (!s.gameState) return {}
      // 地点限制：仅青石村可休整（本卡允许以既有固定地点 ID 校验）
      if (s.gameState.world.currentLocationId !== 'qingshi_village') return {}
      const player = s.gameState.player
      // 数据安全：maxHp 正安全整数 / maxMp 非负安全整数 / hp·mp 安全整数且在 [0, max] 内
      if (!Number.isSafeInteger(player.maxHp) || player.maxHp <= 0) return {}
      if (!Number.isSafeInteger(player.maxMp) || player.maxMp < 0) return {}
      if (!Number.isSafeInteger(player.hp) || !Number.isSafeInteger(player.mp)) return {}
      if (player.hp < 0 || player.hp > player.maxHp || player.mp < 0 || player.mp > player.maxMp) return {}
      // 可恢复条件：至少一个资源未满（含 HP 0）；全满则无意义更新
      if (player.hp >= player.maxHp && player.mp >= player.maxMp) return {}
      rested = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...player, hp: player.maxHp, mp: player.maxMp },
        },
      }
    })
    return rested
  },

  spendMageSpellMp: () => {
    let spent = false
    set((s) => {
      if (!s.gameState) return {}
      const player = s.gameState.player
      // 职业边界：仅法师可以施放法术攻击
      if (player.profession !== 'mage') return {}
      // 数据安全：maxMp 非负安全整数 / mp 非负安全整数且在 [0, maxMp] 内
      if (!Number.isSafeInteger(player.maxMp) || player.maxMp < 0) return {}
      if (!Number.isSafeInteger(player.mp) || player.mp < 0 || player.mp > player.maxMp) return {}
      // 灵力不足：mp < 消耗 → 拒绝且状态完全不变
      if (player.mp < MAGE_SPELL_MP_COST) return {}
      spent = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...player, mp: player.mp - MAGE_SPELL_MP_COST },
        },
      }
    })
    return spent
  },

  respondToVillageElderAfterQuest: (choice) => {
    let responded = false
    set((s) => {
      if (!s.gameState) return {}
      // 非法 choice 拒绝（不抛异常）
      if (choice !== 'reassure' && choice !== 'resolve') return {}
      // 前置：任务已完成 + 村长注册存在 + 当前在村长所在地 + 村长 NpcState 已存在（P1-002 保证；缺失不追补）
      const questCompleted = s.gameState.quests.some(
        (q) => q.questId === 'quest_village_monsters' && q.status === 'completed',
      )
      if (!questCompleted) return {}
      const elder = getNpc('village_elder')
      if (!elder || elder.locationId !== s.gameState.world.currentLocationId) return {}
      const elderState = s.gameState.world.npcStates.village_elder
      if (!elderState) return {}
      // 一次性事件：completedEvents 已含事件 ID → 不可再回应
      if (s.gameState.world.completedEvents.includes(VILLAGE_ELDER_POST_QUEST_EVENT_ID)) return {}
      // 关系数值安全（只结算目标维度）：finite 且 +1 仍 finite，否则整次拒绝（不把坏值归零）
      const target = choice === 'reassure' ? elderState.relationship.trust : elderState.relationship.respect
      if (!Number.isFinite(target) || !Number.isFinite(target + 1)) return {}
      responded = true
      const relationship =
        choice === 'reassure'
          ? { ...elderState.relationship, trust: elderState.relationship.trust + 1 }
          : { ...elderState.relationship, respect: elderState.relationship.respect + 1 }
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            npcStates: { ...s.gameState.world.npcStates, village_elder: { ...elderState, relationship } },
            completedEvents: [...s.gameState.world.completedEvents, VILLAGE_ELDER_POST_QUEST_EVENT_ID],
          },
        },
      }
    })
    return responded
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
