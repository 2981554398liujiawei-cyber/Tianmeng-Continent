import type { GameState } from '../types'

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

/** 基本形状校验，防止损坏存档进入运行时 */
function isGameStateShape(value: unknown): value is GameState {
  if (typeof value !== 'object' || value === null) return false
  const gs = value as Record<string, unknown>
  if (typeof gs.player !== 'object' || gs.player === null) return false
  if (!Array.isArray(gs.inventory)) return false
  if (typeof gs.equipment !== 'object' || gs.equipment === null) return false
  if (!Array.isArray(gs.quests)) return false
  if (typeof gs.world !== 'object' || gs.world === null) return false
  return true
}

export function saveGame(gameState: GameState): void {
  const storage = getStorage()
  if (!storage) return
  const save: SaveFile = {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    gameState,
  }
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save))
  } catch (err) {
    console.error('[存档] 写入失败', err)
  }
}

/** 读取存档；无存档或数据损坏时返回 null（不抛出） */
export function loadGame(): SaveFile | null {
  const storage = getStorage()
  if (!storage) return null
  const raw = storage.getItem(SAVE_KEY)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const save = parsed as Record<string, unknown>
    if (save.version !== SAVE_VERSION) {
      console.error('[存档] 版本不匹配，忽略：', save.version)
      return null
    }
    if (!isGameStateShape(save.gameState)) {
      console.error('[存档] 数据损坏（结构不合法），忽略')
      return null
    }
    return {
      version: save.version as number,
      savedAt: save.savedAt as string,
      gameState: save.gameState as GameState,
    }
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

export function hasSave(): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    return storage.getItem(SAVE_KEY) !== null
  } catch {
    return false
  }
}
