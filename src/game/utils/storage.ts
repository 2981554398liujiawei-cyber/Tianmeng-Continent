import type { GameState, Character, Inventory, Equipment, WorldState } from '../types'

export const SAVE_KEY = 'tianmeng_continent_save'
export const SAVE_VERSION = 1

/** 版本化存档结构 */
export interface SaveFile {
  version: number
  savedAt: string
  gameState: GameState
}

/** 安全访问 localStorage（node/受限环境返回 null） */
function getStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null
  } catch {
    return null
  }
}

// ---------- 手写校验（TM-P0-001-R1：单一入口，统一「有效存档」语义） ----------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

const ATTRIBUTE_KEYS = ['str', 'con', 'agi', 'mnd', 'lck'] as const

function isCharacter(value: unknown): value is Character {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || value.id === '') return false
  if (typeof value.name !== 'string' || value.name === '') return false
  if (value.gender !== 'male' && value.gender !== 'female') return false
  if (!isNonNegativeInteger(value.level)) return false
  if (typeof value.profession !== 'string' || value.profession === '') return false
  const attrs = value.attributes
  if (!isRecord(attrs)) return false
  for (const key of ATTRIBUTE_KEYS) {
    if (!isNonNegativeInteger(attrs[key])) return false
  }
  if (!isNonNegativeInteger(value.hp) || !isNonNegativeInteger(value.maxHp)) return false
  if (!isNonNegativeInteger(value.mp) || !isNonNegativeInteger(value.maxMp)) return false
  if (!isNonNegativeInteger(value.gold)) return false
  return true
}

function isInventory(value: unknown): value is Inventory {
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (!isRecord(entry)) return false
    if (typeof entry.itemId !== 'string' || entry.itemId === '') return false
    return isPositiveInteger(entry.quantity)
  })
}

function isEquipment(value: unknown): value is Equipment {
  if (!isRecord(value)) return false
  const slotOk = (slot: unknown): boolean => slot === null || typeof slot === 'string'
  return slotOk(value.weapon) && slotOk(value.armor) && slotOk(value.accessory)
}

function isQuests(value: unknown): boolean {
  return Array.isArray(value)
}

function isWorld(value: unknown): value is WorldState {
  if (!isRecord(value)) return false
  if (typeof value.currentLocationId !== 'string' || value.currentLocationId === '') return false
  if (!isRecord(value.flags)) return false
  if (!Array.isArray(value.completedEvents)) return false
  if (!isRecord(value.npcStates)) return false
  return true
}

/** 合法 GameState 判定：当前运行时真正依赖的字段 */
function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false
  return (
    isCharacter(value.player) &&
    isInventory(value.inventory) &&
    isEquipment(value.equipment) &&
    isQuests(value.quests) &&
    isWorld(value.world)
  )
}

/** 合法存档判定（TM-P0-001-R1：loadGame / hasSave / 主菜单共用此语义） */
export function isValidSave(raw: unknown): raw is SaveFile {
  if (!isRecord(raw)) return false
  if (raw.version !== SAVE_VERSION) return false
  if (typeof raw.savedAt !== 'string') return false
  return isGameState(raw.gameState)
}

// ---------- 存档操作 ----------

/** 写入存档；返回是否成功（TM-P0-001-R1：写入失败必须可表达） */
export function saveGame(gameState: GameState): boolean {
  const storage = getStorage()
  if (!storage) return false
  const save: SaveFile = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    gameState,
  }
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save))
    return true
  } catch (err) {
    console.error('[存档] 写入失败', err)
    return false
  }
}

/** 读取存档；无存档或数据损坏时返回 null（不抛出）。坏档保留于 localStorage 以便调试，但一律视为无效。 */
export function loadGame(): SaveFile | null {
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isValidSave(parsed)) {
      console.error('[存档] 存档无效（损坏/版本不符/结构不合法），已拒绝加载')
      return null
    }
    return parsed
  } catch (err) {
    console.error('[存档] 读取失败（数据损坏），已安全回退', err)
    return null
  }
}

export function deleteGame(): void {
  const storage = getStorage()
  if (!storage) return
  try {
    storage.removeItem(SAVE_KEY)
  } catch (err) {
    console.error('[存档] 删除失败', err)
  }
}

/** 是否存在「有效」存档（TM-P0-001-R1：坏档不算有存档） */
export function hasSave(): boolean {
  return loadGame() !== null
}
