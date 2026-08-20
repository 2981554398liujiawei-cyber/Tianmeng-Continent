import type { GameState, Character, Inventory, Equipment, WorldState } from '../types'
import { PROFESSION_IDS } from '../types/character'
import { QUEST_STATUSES } from '../types/quest'

/** 旧 V1 单槽存档 key（TM-P2-002 H：迁移源；迁移成功前不删除） */
export const LEGACY_SAVE_KEY = 'tianmeng_continent_save'
/** 新 V2 五槽位索引 key（轻量元数据，不含 gameState） */
export const SAVES_INDEX_KEY = 'tianmeng_continent_saves_index'
/** 新 V2 各槽位独立 key 前缀（逐槽隔离：坏掉一个槽位不影响其余槽位读取） */
export const SAVE_SLOT_KEY_PREFIX = 'tianmeng_continent_save_slot_'

export const SAVE_VERSION = 2
export const LEGACY_SAVE_VERSION = 1

export const SLOT_IDS = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'] as const
export type SlotId = (typeof SLOT_IDS)[number]

/** 槽位摘要（五槽位页面展示：姓名/职业/等级/位置/保存时间；空槽 null） */
export interface SlotSummary {
  playerName: string
  profession: string
  level: number
  locationId: string
  savedAt: string
}

/** 槽位存储（含完整 gameState；逐槽独立 key） */
export interface SaveSlot {
  savedAt: string
  gameState: GameState
}

/** 索引文件（V2） */
export interface SavesIndex {
  version: number
  lastSavedSlot: SlotId | null
  slots: Record<SlotId, SlotSummary | null>
}

/** 完整五槽导出/导入 JSON 结构（TM-P2-002 I） */
export interface SavesExport {
  version: number
  exportedAt: string
  /** 最近保存槽位（导入后恢复 Continue 语义） */
  lastSavedSlot: SlotId | null
  slots: Record<SlotId, SaveSlot | null>
}

/** 旧 V1 单槽存档结构 */
export interface LegacySaveFile {
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

// ---------- 手写校验（单一入口，统一「有效存档」语义） ----------

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
  if (typeof value.profession !== 'string' || !(PROFESSION_IDS as readonly string[]).includes(value.profession)) {
    return false
  }
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

/** Flag 值语义：boolean | string | 有限 number */
function isFlagValue(value: unknown): value is boolean | number | string {
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'boolean' || typeof value === 'string'
}

function isQuestState(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.questId !== 'string' || value.questId === '') return false
  if (typeof value.status !== 'string' || !(QUEST_STATUSES as readonly string[]).includes(value.status)) {
    return false
  }
  if (typeof value.stage !== 'number' || !Number.isInteger(value.stage) || value.stage < 0) return false
  const flags = value.flags
  if (!isRecord(flags)) return false
  return Object.values(flags).every(isFlagValue)
}

function isQuests(value: unknown): boolean {
  return Array.isArray(value) && value.every(isQuestState)
}

function isNpcState(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (typeof value.npcId !== 'string' || value.npcId === '') return false
  if (typeof value.alive !== 'boolean') return false
  if (typeof value.locationId !== 'string' || value.locationId === '') return false
  const rel = value.relationship
  if (!isRecord(rel)) return false
  for (const key of ['trust', 'affection', 'respect', 'fear', 'resentment']) {
    if (typeof rel[key] !== 'number' || !Number.isFinite(rel[key])) return false
  }
  if (rel.romanceInterest !== undefined && typeof rel.romanceInterest !== 'boolean') return false
  return true
}

function isNpcStates(value: unknown): boolean {
  if (!isRecord(value)) return false
  return Object.values(value).every(isNpcState)
}

function isWorld(value: unknown): value is WorldState {
  if (!isRecord(value)) return false
  if (typeof value.currentLocationId !== 'string' || value.currentLocationId === '') return false
  const flags = value.flags
  if (!isRecord(flags)) return false
  if (!Object.values(flags).every(isFlagValue)) return false
  const events = value.completedEvents
  if (!Array.isArray(events) || !events.every((e) => typeof e === 'string')) return false
  if (!isNpcStates(value.npcStates)) return false
  return true
}

/** 合法 GameState 判定（新旧存档共用） */
export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false
  return (
    isCharacter(value.player) &&
    isInventory(value.inventory) &&
    isEquipment(value.equipment) &&
    isQuests(value.quests) &&
    isWorld(value.world)
  )
}

/** 合法槽位存档判定（V2 单槽） */
export function isValidSaveSlot(raw: unknown): raw is SaveSlot {
  if (!isRecord(raw)) return false
  if (typeof raw.savedAt !== 'string') return false
  return isGameState(raw.gameState)
}

/** 合法旧 V1 单槽存档判定（迁移源） */
export function isValidLegacySave(raw: unknown): raw is LegacySaveFile {
  if (!isRecord(raw)) return false
  if (raw.version !== LEGACY_SAVE_VERSION) return false
  if (typeof raw.savedAt !== 'string') return false
  return isGameState(raw.gameState)
}

// ---------- 槽位 key 与索引 ----------

function slotKey(slotId: SlotId): string {
  return `${SAVE_SLOT_KEY_PREFIX}${slotId}`
}

function isValidSlotId(value: unknown): value is SlotId {
  return typeof value === 'string' && (SLOT_IDS as readonly string[]).includes(value)
}

/** 从 GameState 派生槽位摘要 */
function summaryOf(gameState: GameState, savedAt: string): SlotSummary {
  return {
    playerName: gameState.player.name,
    profession: gameState.player.profession,
    level: gameState.player.level,
    locationId: gameState.world.currentLocationId,
    savedAt,
  }
}

/** 空索引（无任何槽位） */
function emptyIndex(): SavesIndex {
  return {
    version: SAVE_VERSION,
    lastSavedSlot: null,
    slots: { slot1: null, slot2: null, slot3: null, slot4: null, slot5: null },
  }
}

/** 读取索引；损坏/缺失 → 空索引（不抛出）。调用方应先执行 migrateLegacySave() 保证迁移。 */
export function loadIndex(): SavesIndex {
  const storage = getStorage()
  if (!storage) return emptyIndex()
  try {
    const raw = storage.getItem(SAVES_INDEX_KEY)
    if (!raw) return emptyIndex()
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return emptyIndex()
    const index = emptyIndex()
    if (parsed.version !== SAVE_VERSION) return emptyIndex()
    index.lastSavedSlot = isValidSlotId(parsed.lastSavedSlot) ? parsed.lastSavedSlot : null
    const slots = parsed.slots
    if (isRecord(slots)) {
      for (const slotId of SLOT_IDS) {
        const entry = slots[slotId]
        index.slots[slotId] = isSlotSummary(entry) ? entry : null
      }
    }
    return index
  } catch {
    return emptyIndex()
  }
}

function isSlotSummary(value: unknown): value is SlotSummary {
  if (!isRecord(value)) return false
  return (
    typeof value.playerName === 'string' &&
    typeof value.profession === 'string' &&
    isNonNegativeInteger(value.level) &&
    typeof value.locationId === 'string' &&
    typeof value.savedAt === 'string'
  )
}

function writeIndex(index: SavesIndex): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(SAVES_INDEX_KEY, JSON.stringify(index))
    return true
  } catch {
    return false
  }
}

// ---------- 槽位操作 ----------

/** 写入指定槽位（含索引更新）；返回是否成功 */
export function saveSlot(slotId: SlotId, gameState: GameState): boolean {
  const storage = getStorage()
  if (!storage) return false
  if (!isGameState(gameState)) {
    console.error('[存档] 拒绝写入非法 GameState（与存档校验不一致）')
    return false
  }
  const slot: SaveSlot = { savedAt: new Date().toISOString(), gameState }
  try {
    storage.setItem(slotKey(slotId), JSON.stringify(slot))
  } catch (err) {
    console.error('[存档] 槽位写入失败', err)
    return false
  }
  const index = loadIndex()
  index.slots[slotId] = summaryOf(gameState, slot.savedAt)
  index.lastSavedSlot = slotId
  writeIndex(index)
  return true
}

/** 读取指定槽位；无存档/损坏 → null（该槽损坏不影响其他槽；不修复、不删除） */
export function loadSlot(slotId: SlotId): SaveSlot | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(slotKey(slotId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidSaveSlot(parsed)) {
      console.error(`[存档] 槽位 ${slotId} 无效（损坏/结构不合法），已拒绝加载；其余槽位不受影响`)
      return null
    }
    return parsed
  } catch (err) {
    console.error(`[存档] 槽位 ${slotId} 读取失败（数据损坏），已安全回退；其余槽位不受影响`, err)
    return null
  }
}

/** 删除指定槽位（同步更新索引）；返回是否删除成功 */
export function deleteSlot(slotId: SlotId): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.removeItem(slotKey(slotId))
  } catch (err) {
    console.error('[存档] 槽位删除失败', err)
    return false
  }
  const index = loadIndex()
  index.slots[slotId] = null
  if (index.lastSavedSlot === slotId) {
    // 最近槽位被删 → 回退到仍有存档的槽（按槽位顺序）
    const fallback = SLOT_IDS.find((id) => index.slots[id] !== null)
    index.lastSavedSlot = fallback ?? null
  }
  writeIndex(index)
  return true
}

/** 是否存在「任一有效」存档（索引摘要非空但实际槽位数据损坏/非法时不算有效；坏槽隔离，不影响其他槽） */
export function hasAnySave(): boolean {
  const index = loadIndex()
  return SLOT_IDS.some((id) => index.slots[id] !== null && loadSlot(id) !== null)
}

/** 读取最近一次有效存档（Continue 语义：索引 lastSavedSlot，其次任意有效槽） */
export function loadMostRecentSave(): SaveSlot | null {
  const index = loadIndex()
  if (index.lastSavedSlot !== null) {
    const slot = loadSlot(index.lastSavedSlot)
    if (slot) return slot
  }
  for (const id of SLOT_IDS) {
    if (index.slots[id] !== null) {
      const slot = loadSlot(id)
      if (slot) return slot
    }
  }
  return null
}

// ---------- V1 → V2 迁移（TM-P2-002 H） ----------

/**
 * 自动迁移旧 V1 单槽存档：
 * 若旧 key 存在且为合法 V1 存档，且 Slot 1 为空 → 迁移到 Slot 1 并标记为最近存档。
 * 迁移成功前不得删除旧 key；成功后删除旧 key（避免重复迁移）。
 * 任何读取路径（loadIndex/hasAnySave/loadMostRecentSave 之前）都应先调用本函数。
 */
export function migrateLegacySave(): boolean {
  const storage = getStorage()
  if (!storage) return false
  let legacy: LegacySaveFile | null = null
  try {
    const raw = storage.getItem(LEGACY_SAVE_KEY)
    if (!raw) return false
    const parsed: unknown = JSON.parse(raw)
    if (isValidLegacySave(parsed)) {
      legacy = parsed
    } else {
      // 旧 key 存在但非法：不是有效存档，无需迁移；也不删除（保留调试）
      return false
    }
  } catch {
    return false
  }
  if (!legacy) return false
  const index = loadIndex()
  if (index.slots.slot1 !== null) {
    // Slot 1 已有存档：不覆盖；旧 key 保留（不迁移）
    return false
  }
  const slot: SaveSlot = { savedAt: legacy.savedAt, gameState: legacy.gameState }
  try {
    storage.setItem(slotKey('slot1'), JSON.stringify(slot))
  } catch (err) {
    console.error('[存档] V1 迁移写入失败', err)
    return false
  }
  index.slots.slot1 = summaryOf(legacy.gameState, legacy.savedAt)
  index.lastSavedSlot = 'slot1'
  writeIndex(index)
  // 迁移成功后才删除旧 key
  try {
    storage.removeItem(LEGACY_SAVE_KEY)
  } catch {
    // 删除失败不阻断迁移（下次调用会检测旧 key 存在但 slot1 已占用 → 不重复迁移）
  }
  return true
}

// ---------- 导出 / 导入（TM-P2-002 I） ----------

/** 导出五槽位为单个 JSON 字符串（含完整 gameState；空槽为 null；损坏槽按空槽导出） */
export function exportSaves(): string {
  const slots: Record<SlotId, SaveSlot | null> = { slot1: null, slot2: null, slot3: null, slot4: null, slot5: null }
  for (const id of SLOT_IDS) {
    slots[id] = loadSlot(id)
  }
  const payload: SavesExport = {
    version: SAVE_VERSION,
    exportedAt: new Date().toISOString(),
    lastSavedSlot: loadIndex().lastSavedSlot,
    slots,
  }
  return JSON.stringify(payload, null, 2)
}

function isValidExport(raw: unknown): raw is SavesExport {
  if (!isRecord(raw)) return false
  if (raw.version !== SAVE_VERSION) return false
  if (typeof raw.exportedAt !== 'string') return false
  if (raw.lastSavedSlot !== null && !isValidSlotId(raw.lastSavedSlot)) return false
  const slots = raw.slots
  if (!isRecord(slots)) return false
  for (const slotId of SLOT_IDS) {
    const entry = slots[slotId]
    if (entry === null) continue
    if (!isValidSaveSlot(entry)) return false
  }
  return true
}

/**
 * 导入五槽位 JSON：完整校验版本与结构；任一槽非法 → 整体拒绝且不覆盖现有存档。
 * 全部合法才逐槽写入（含索引与最近槽位）。
 */
export function importSaves(json: string): boolean {
  const storage = getStorage()
  if (!storage) return false
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    console.error('[存档] 导入失败：非法 JSON', err)
    return false
  }
  if (!isValidExport(parsed)) {
    console.error('[存档] 导入失败：版本或结构不合法，未覆盖现有存档')
    return false
  }
  try {
    for (const slotId of SLOT_IDS) {
      const entry = parsed.slots[slotId]
      if (entry === null) {
        storage.removeItem(slotKey(slotId))
      } else {
        storage.setItem(slotKey(slotId), JSON.stringify(entry))
      }
    }
  } catch (err) {
    console.error('[存档] 导入写入失败（保持原样，未破坏）', err)
    return false
  }
  const index = emptyIndex()
  for (const slotId of SLOT_IDS) {
    const entry = parsed.slots[slotId]
    index.slots[slotId] = entry ? summaryOf(entry.gameState, entry.savedAt) : null
  }
  // 恢复导出时的最近槽位；若导出为 null 或指向空槽 → 回退到第一个有效槽
  if (parsed.lastSavedSlot !== null && index.slots[parsed.lastSavedSlot] !== null) {
    index.lastSavedSlot = parsed.lastSavedSlot
  } else {
    index.lastSavedSlot = SLOT_IDS.find((id) => index.slots[id] !== null) ?? null
  }
  writeIndex(index)
  return true
}

// ---------- 兼容旧导出（保留命名导出避免破坏既有引用；Store 将改用新 API） ----------

/** @deprecated V1 单槽保存（仅兼容；Store 不再调用） */
export function saveGame(gameState: GameState): boolean {
  const storage = getStorage()
  if (!storage) return false
  if (!isGameState(gameState)) return false
  const save: LegacySaveFile = { version: LEGACY_SAVE_VERSION, savedAt: new Date().toISOString(), gameState }
  try {
    storage.setItem(LEGACY_SAVE_KEY, JSON.stringify(save))
    return true
  } catch {
    return false
  }
}

/** @deprecated V1 单槽读取 */
export function loadGame(): LegacySaveFile | null {
  const storage = getStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(LEGACY_SAVE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isValidLegacySave(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** @deprecated V1 单槽删除 */
export function deleteGame(): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.removeItem(LEGACY_SAVE_KEY)
    return true
  } catch {
    return false
  }
}

/** @deprecated V1 单槽是否存在 */
export function hasSave(): boolean {
  return loadGame() !== null
}
