import type { GameState, Character, Inventory, Equipment, WorldState } from '../types'
import { PROFESSION_IDS } from '../types/character'
import { defaultSkillsForProfession } from '../content/skills'
import { QUEST_STATUSES } from '../types/quest'
import type { CompanionState, PartyState } from '../types/companion'
import type { RelationshipState, RelationshipStage } from '../types/relationship'
// TM-P2-004-R1 C：Party 上限单一来源（rules/companion 纯规则，无循环依赖）
import { MAX_ACTIVE_COMPANIONS } from '../rules/companion'

/** 旧 V1 单槽存档 key（TM-P2-002 H：迁移源；迁移成功前不删除） */
export const LEGACY_SAVE_KEY = 'tianmeng_continent_save'
/** 新 V2 五槽位索引 key（轻量元数据，不含 gameState） */
export const SAVES_INDEX_KEY = 'tianmeng_continent_saves_index'
/** 新 V2 各槽位独立 key 前缀（逐槽隔离：坏掉一个槽位不影响其余槽位读取） */
export const SAVE_SLOT_KEY_PREFIX = 'tianmeng_continent_save_slot_'

export const SAVE_VERSION = 2
export const LEGACY_SAVE_VERSION = 1
/** TM-P2-002-R1 G：槽位文件自身格式版本（SaveSlot.version）。
 *  3（TM-P2-003 A）：player 增加 learnedSkillIds（技能注册表）。
 *  4（TM-P2-004）：GameState 增加 companions / relationships / party / world.restCount（Schema V4）。
 *  兼容 514f3e2 无版本 V2 槽与 2.x/3 版本槽（迁移链补齐 version / learnedSkillIds / V4 字段）。 */
export const SLOT_FORMAT_VERSION = 4

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

/** 槽位存储（含完整 gameState；逐槽独立 key）。version 为槽位文件格式版本（TM-P2-002-R1 G）。 */
export interface SaveSlot {
  version: number
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
  // TM-P2-003 A：learnedSkillIds 可选（旧 schema 无此字段仍合法；迁移链负责补全）
  if (
    value.learnedSkillIds !== undefined &&
    (!Array.isArray(value.learnedSkillIds) || !value.learnedSkillIds.every((id) => typeof id === 'string'))
  ) {
    return false
  }
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
  // V4：restCount 可选（旧档无此字段仍合法；迁移链负责补 0）
  if (value.restCount !== undefined && !isNonNegativeInteger(value.restCount)) return false
  return true
}

// ---- TM-P2-004 Schema V4：伙伴/关系/队伍 校验 ----

const COMPANION_STATUSES = ['met', 'guest', 'recruited'] as const
const RELATIONSHIP_STAGES = ['stranger', 'acquaintance', 'trusted', 'close', 'romance', 'committed'] as const

function isCompanionState(value: unknown): value is CompanionState {
  if (!isRecord(value)) return false
  if (typeof value.companionId !== 'string' || value.companionId === '') return false
  if (typeof value.status !== 'string' || !(COMPANION_STATUSES as readonly string[]).includes(value.status)) {
    return false
  }
  if (!isPositiveInteger(value.level)) return false
  if (!isNonNegativeInteger(value.mp) || !isNonNegativeInteger(value.maxMp)) return false
  if (value.mp > value.maxMp) return false
  const skills = value.learnedSkillIds
  if (!Array.isArray(skills) || !skills.every((id) => typeof id === 'string')) return false
  const flags = value.flags
  if (!isRecord(flags) || !Object.values(flags).every(isFlagValue)) return false
  return true
}

function isCompanions(value: unknown): boolean {
  if (!isRecord(value)) return false
  return Object.values(value).every(isCompanionState)
}

function isRelationshipState(value: unknown): value is RelationshipState {
  if (!isRecord(value)) return false
  if (typeof value.npcId !== 'string' || value.npcId === '') return false
  if (!isNonNegativeInteger(value.affection) || value.affection > 100) return false
  if (!isNonNegativeInteger(value.trust) || value.trust > 100) return false
  if (typeof value.stage !== 'string' || !(RELATIONSHIP_STAGES as readonly string[]).includes(value.stage)) {
    return false
  }
  if (!isNonNegativeInteger(value.personalQuestStage)) return false
  const flags = value.flags
  if (!isRecord(flags) || !Object.values(flags).every(isFlagValue)) return false
  return true
}

function isRelationships(value: unknown): boolean {
  if (!isRecord(value)) return false
  return Object.values(value).every(isRelationshipState)
}

/** V4 Party 结构判定（TM-P2-004-R1 C strictness）：activeCompanionIds 全 string + 无重复 + 不超过 MAX_ACTIVE_COMPANIONS */
function isParty(value: unknown): value is PartyState {
  if (!isRecord(value)) return false
  const active = value.activeCompanionIds
  if (!Array.isArray(active) || !active.every((id) => typeof id === 'string')) return false
  // 去重（["sakura_yuko","sakura_yuko"] 拒绝）
  if (new Set(active).size !== active.length) return false
  // 上限（active 数量 > MAX_ACTIVE_COMPANIONS 拒绝）
  if (active.length > MAX_ACTIVE_COMPANIONS) return false
  return true
}

/** V4 交叉引用校验（TM-P2-004 第 99/100 节 + R1 C strictness）：
 *  - activeCompanionIds 每个 ID 必须存在于 companions 且 status ∈ {guest, recruited}（met 拒绝）
 *  - companions Record key 必须与 companion.companionId 一致（推荐项，防键名漂移） */
function isPartyCrossReferenceValid(
  party: PartyState,
  companions: Record<string, CompanionState>,
): boolean {
  for (const id of party.activeCompanionIds) {
    const companion = companions[id]
    if (!companion) return false
    if (companion.status !== 'guest' && companion.status !== 'recruited') return false
  }
  for (const [key, companion] of Object.entries(companions)) {
    if (companion.companionId !== key) return false
  }
  return true
}

/** V4 关系 key 一致性（TM-P2-004-R1 C 推荐项）：relationships Record key 必须与 relationship.npcId 一致 */
function isRelationshipKeyConsistent(relationships: Record<string, RelationshipState>): boolean {
  for (const [key, rel] of Object.entries(relationships)) {
    if (rel.npcId !== key) return false
  }
  return true
}

/** 合法 GameState 判定（新旧存档共用；V4 字段可选——旧档/迁移源兼容） */
export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value)) return false
  return (
    isCharacter(value.player) &&
    isInventory(value.inventory) &&
    isEquipment(value.equipment) &&
    isQuests(value.quests) &&
    isWorld(value.world) &&
    (value.companions === undefined || isCompanions(value.companions)) &&
    (value.relationships === undefined || isRelationships(value.relationships)) &&
    (value.party === undefined || isParty(value.party))
  )
}

/** 当前 v4 格式 GameState 判定（TM-P2-004 第 96 节：必须带完整 V4 字段 + 交叉引用合法；
 * 新保存只允许此校验通过——防止 saveSlot 写出自身无法读取的 v4） */
export function isCurrentGameState(value: unknown): value is GameState {
  if (!isGameState(value)) return false
  const gs = value as GameState
  const skills = gs.player.learnedSkillIds
  if (!Array.isArray(skills) || !skills.every((id) => typeof id === 'string')) return false
  if (gs.companions === undefined || gs.relationships === undefined || gs.party === undefined) return false
  if (!isCompanions(gs.companions) || !isRelationships(gs.relationships) || !isParty(gs.party)) return false
  if (!isNonNegativeInteger(gs.world.restCount)) return false
  if (!isPartyCrossReferenceValid(gs.party, gs.companions)) return false
  if (!isRelationshipKeyConsistent(gs.relationships)) return false
  return true
}

/** 合法槽位存档判定（TM-P2-003-R1 D：版本感知——可迁移格式 version undefined(514f3e2)/2(9ddb5db)/3(TM-P2-003)/4(当前) 均合法；
 * 其中 version 4 必须携带完整 V4 字段（companions/relationships/party/restCount），缺失判 malformed；旧版本允许缺失（迁移链补全）） */
export function isValidSaveSlot(raw: unknown): raw is SaveSlot {
  if (!isRecord(raw)) return false
  const v = raw.version
  if (v !== undefined && v !== 2 && v !== 3 && v !== SLOT_FORMAT_VERSION) return false
  if (typeof raw.savedAt !== 'string') return false
  if (!isGameState(raw.gameState)) return false
  // v4 严格：必须已带完整 V4 字段（TM-P2-004 第 96 节）
  if (v === SLOT_FORMAT_VERSION && !isCurrentGameState(raw.gameState)) {
    return false
  }
  return true
}

/** 合法旧 V1 单槽存档判定（迁移源） */
export function isValidLegacySave(raw: unknown): raw is LegacySaveFile {
  if (!isRecord(raw)) return false
  if (raw.version !== LEGACY_SAVE_VERSION) return false
  if (typeof raw.savedAt !== 'string') return false
  return isGameState(raw.gameState)
}

// ---------- 槽位 key 与索引 ----------

/** TM-P2-004 Schema V4 字段补全（幂等）：companions={} relationships={} party={activeCompanionIds:[]} world.restCount=0；
 * 缺哪个补哪个，已存在的不动。返回新对象（不修改原对象）。 */
export function withV4Fields(gs: GameState): GameState {
  const companions = gs.companions ?? {}
  const relationships = gs.relationships ?? {}
  const party: PartyState = gs.party
    ? { activeCompanionIds: Array.isArray(gs.party.activeCompanionIds) ? gs.party.activeCompanionIds : [] }
    : { activeCompanionIds: [] }
  const restCount = Number.isInteger(gs.world.restCount) && gs.world.restCount >= 0 ? gs.world.restCount : 0
  return {
    ...gs,
    companions,
    relationships,
    party,
    world: { ...gs.world, restCount },
  }
}

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

/** 读取索引；缺失/损坏/版本不符 → 扫描真实槽位重建并写回缓存（TM-P2-002-R1 E）。实现在下方（rebuildIndexFromSlots 之后）。 */

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

/**
 * TM-P2-002-R1 E：扫描五个真实槽位重建索引。
 * index 只是缓存/摘要，不是唯一事实源：这里直接读 slot1~slot5 的真实数据，
 * lastSavedSlot 按 savedAt 最新（TM-P2-002-R1 F）。坏槽保留原始数据不删除。
 */
function rebuildIndexFromSlots(): SavesIndex {
  const index = emptyIndex()
  let bestId: SlotId | null = null
  let bestTime = -1
  for (const id of SLOT_IDS) {
    const slot = loadSlot(id)
    index.slots[id] = slot ? summaryOf(slot.gameState, slot.savedAt) : null
    if (slot) {
      const t = Date.parse(slot.savedAt)
      if (Number.isFinite(t) && t > bestTime) {
        bestTime = t
        bestId = id
      }
    }
  }
  index.lastSavedSlot = bestId
  return index
}

/**
 * TM-P2-002-R1 E / R2 A：读取索引。
 * index 只是 cache/摘要，不是唯一事实源——R2 明确：合法外壳的 index 也可能与真实槽不一致
 * （summary 被部分污染 / 声称存在的槽实际缺失 / summary 结构损坏但真实槽合法）。
 * 因此 loadIndex 始终直接扫描 slot1~slot5 的真实数据重建 summary（仅 5 个 key，不值得做缓存优化），
 * lastSavedSlot 按 savedAt 最新；坏槽原始数据保留不删除。空状态不写缓存（prod smoke 零写入）。
 */
export function loadIndex(): SavesIndex {
  const storage = getStorage()
  if (!storage) return emptyIndex()
  const index = rebuildIndexFromSlots()
  const hasAny = SLOT_IDS.some((id) => index.slots[id] !== null)
  if (hasAny) writeIndex(index)
  return index
}

// ---------- 槽位操作 ----------

/** 快照五槽 + 索引（事务回滚用；TM-P2-002-R1 C） */
function snapshotAll(): { slotRaws: Record<SlotId, string | null>; indexRaw: string | null } {
  const storage = getStorage()
  const slotRaws = { slot1: null as string | null, slot2: null as string | null, slot3: null as string | null, slot4: null as string | null, slot5: null as string | null }
  if (!storage) return { slotRaws, indexRaw: null }
  for (const id of SLOT_IDS) {
    try {
      slotRaws[id] = storage.getItem(slotKey(id))
    } catch {
      slotRaws[id] = null
    }
  }
  try {
    return { slotRaws, indexRaw: storage.getItem(SAVES_INDEX_KEY) }
  } catch {
    return { slotRaws, indexRaw: null }
  }
}

/** 恢复快照（事务回滚；失败静默） */
function restoreSnapshot(snap: { slotRaws: Record<SlotId, string | null>; indexRaw: string | null }): void {
  const storage = getStorage()
  if (!storage) return
  try {
    for (const id of SLOT_IDS) {
      const raw = snap.slotRaws[id]
      if (raw === null) storage.removeItem(slotKey(id))
      else storage.setItem(slotKey(id), raw)
    }
    if (snap.indexRaw === null) storage.removeItem(SAVES_INDEX_KEY)
    else storage.setItem(SAVES_INDEX_KEY, snap.indexRaw)
  } catch {
    // 回滚失败无法再处理；保持日志
  }
}

/**
 * 写入指定槽位（含索引更新；TM-P2-002-R1 C：槽位写入 + 索引写入视为一个事务，
 * 任一步失败恢复原状态返回 false）。
 */
export function saveSlot(slotId: SlotId, gameState: GameState): boolean {
  const storage = getStorage()
  if (!storage) return false
  // TM-P2-003-R2 D + TM-P2-004-R1 F：新保存只允许当前 v4 格式（完整 V4 字段 + Party/关系 key 交叉引用）——
  // 防止写出 version 4 但自身校验无法读取的槽（宽松 isGameState 只用于旧档/迁移源）
  if (!isCurrentGameState(gameState)) {
    console.error('[存档] 拒绝写入非当前格式 GameState（v4 需携带完整 V4 字段与合法 Party/关系交叉引用）')
    return false
  }
  const slot: SaveSlot = { version: SLOT_FORMAT_VERSION, savedAt: new Date().toISOString(), gameState }
  const snap = snapshotAll()
  try {
    storage.setItem(slotKey(slotId), JSON.stringify(slot))
  } catch (err) {
    console.error('[存档] 槽位写入失败', err)
    return false
  }
  const index = loadIndex()
  index.slots[slotId] = summaryOf(gameState, slot.savedAt)
  index.lastSavedSlot = slotId
  if (!writeIndex(index)) {
    console.error('[存档] 索引写入失败，回滚槽位写入')
    restoreSnapshot(snap)
    return false
  }
  return true
}

/** 读取指定槽位；无存档/损坏 → null（该槽损坏不影响其他槽；不修复、不删除；TM-P2-002-R1 G：无版本旧槽读时补全 version） */
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
    const p = parsed as { version?: number; savedAt: string; gameState: GameState }
    // TM-P2-003 A/R1：旧版本（undefined/2）读时补 learnedSkillIds（内存级；不写回——持久迁移由 migrateSave/importSaves 负责）
    // TM-P2-004 V4：读时补 companions/relationships/party/restCount（内存级；持久迁移同由 migrateSave 负责）
    let gs = p.gameState
    if (!Array.isArray(gs.player.learnedSkillIds)) {
      gs.player.learnedSkillIds = defaultSkillsForProfession(gs.player.profession)
    }
    gs = withV4Fields(gs)
    return { version: SLOT_FORMAT_VERSION, savedAt: p.savedAt, gameState: gs }
  } catch (err) {
    console.error(`[存档] 槽位 ${slotId} 读取失败（数据损坏），已安全回退；其余槽位不受影响`, err)
    return null
  }
}

/**
 * 删除指定槽位（TM-P2-002-R1 C：删除 + 索引更新视为一个事务；index 更新失败 →
 * 恢复被删除槽位 + 恢复旧 index → false）。
 */
export function deleteSlot(slotId: SlotId): boolean {
  const storage = getStorage()
  if (!storage) return false
  const snap = snapshotAll()
  try {
    storage.removeItem(slotKey(slotId))
  } catch (err) {
    console.error('[存档] 槽位删除失败', err)
    return false
  }
  // TM-P2-002-R1 F：索引基于真实槽位重建 → lastSavedSlot 自动选择剩余槽中 savedAt 最新者
  if (!writeIndex(rebuildIndexFromSlots())) {
    console.error('[存档] 索引写入失败，回滚槽位删除')
    restoreSnapshot(snap)
    return false
  }
  return true
}

/** 是否存在「任一有效」存档（TM-P2-002-R1 E：直接扫描真实槽位，不依赖 index 摘要；坏槽隔离） */
export function hasAnySave(): boolean {
  return SLOT_IDS.some((id) => loadSlot(id) !== null)
}

/**
 * 读取最近一次有效存档（TM-P2-002-R2 B：不允许优先 return index.lastSavedSlot——
 * index 可能指向合法但过时的槽。每次扫描全部合法槽，按 Date.parse(savedAt) 选择真正最新，
 * 绝不因编号小就读 slot1）。
 */
export function loadMostRecentSave(): SaveSlot | null {
  let best: SaveSlot | null = null
  let bestTime = -1
  for (const id of SLOT_IDS) {
    const slot = loadSlot(id)
    if (slot) {
      const t = Date.parse(slot.savedAt)
      if (Number.isFinite(t) && t > bestTime) {
        bestTime = t
        best = slot
      }
    }
  }
  return best
}

// ---------- V1 → V2 迁移（TM-P2-002 H / TM-P2-002-R1 D） ----------

/**
 * 自动迁移旧 V1 单槽存档（TM-P2-002-R1 D 安全化）：
 * 1) 判断 Slot1 是否已有数据：检查真实 Slot1（loadSlot 验证），绝不只看 index。
 * 2) 已有 Slot1 → 绝对禁止覆盖，legacy key 保留。
 * 3) 迁移流程：验证旧档 → 写新 Slot1 → 写/重建 index → 再验证新档可读取 → 最后才删除旧 key。
 * 4) 任何前一步失败 → 新写入回滚，旧 tianmeng_continent_save 必须保留。
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
  // R2 C：判断 Slot1 是否占用必须检查 raw key 是否存在——只要 slot1 raw 存在，
  // 无论数据正常、损坏（JSON 坏）、还是可解析但结构非法，都绝对禁止自动覆盖；
  // 损坏 raw 可能仍值得保留恢复/调试，legacy key 一并保留。
  let slot1RawExists = false
  try {
    slot1RawExists = storage.getItem(slotKey('slot1')) !== null
  } catch {
    slot1RawExists = true // 读不到也视为已占用，宁可保守不覆盖
  }
  if (slot1RawExists) {
    return false
  }
  const snap = snapshotAll()
  // TM-P2-003-R2 D：真正历史 V1 存档没有 learnedSkillIds——写当前格式前必须按职业补全，
  // 否则 loadSlot 的严格校验会失败导致迁移回滚（旧 V1 自动迁移断裂）。
  // TM-P2-004 V4：同时补 companions/relationships/party/restCount。
  const gs = withV4Fields(legacy.gameState)
  if (!Array.isArray(gs.player.learnedSkillIds)) {
    gs.player.learnedSkillIds = defaultSkillsForProfession(gs.player.profession)
  }
  const slot: SaveSlot = { version: SLOT_FORMAT_VERSION, savedAt: legacy.savedAt, gameState: gs }
  try {
    storage.setItem(slotKey('slot1'), JSON.stringify(slot))
  } catch (err) {
    console.error('[存档] V1 迁移写入失败', err)
    return false
  }
  // 写/重建 index（写失败 → 回滚新写入，legacy 保留）
  const index = loadIndex()
  index.slots.slot1 = summaryOf(legacy.gameState, legacy.savedAt)
  index.lastSavedSlot = 'slot1'
  if (!writeIndex(index)) {
    console.error('[存档] V1 迁移索引写入失败，回滚')
    restoreSnapshot(snap)
    return false
  }
  // 再验证新档可读取（验证失败 → 回滚，legacy 保留）
  if (!loadSlot('slot1')) {
    console.error('[存档] V1 迁移后新档不可读，回滚')
    restoreSnapshot(snap)
    return false
  }
  // 最后才允许删除旧 key（删除失败不阻断迁移：下次检测旧 key 存在但 slot1 已占用 → 不重复迁移）
  try {
    storage.removeItem(LEGACY_SAVE_KEY)
  } catch {
    // 忽略
  }
  return true
}

/**
 * TM-P2-002-R1 G：存档迁移单一入口（可扩展 migration chain）。
 * 兼容：旧 V1 单档 / 514f3e2 已在线产生的无 slot-version V2 存档 / 修复后的当前格式。
 * 当前最小实现：
 *   Step 1: V1 单档 → Slot1（migrateLegacySave，安全分步提交）
 *   Step 2: 无 version 字段的旧 V2 槽位补齐 version 字段
 * 未来升级（V4+）在此链上追加即可，不破坏既有存档。
 */
export function migrateSave(): boolean {
  let changed = false
  if (migrateLegacySave()) changed = true
  const storage = getStorage()
  if (storage) {
    for (const id of SLOT_IDS) {
      try {
        const raw = storage.getItem(slotKey(id))
        if (!raw) continue
        const parsed: unknown = JSON.parse(raw)
        if (!isRecord(parsed) || typeof parsed.savedAt !== 'string') continue
        // Step 2（R1 G）：514f3e2 无版本 V2 槽 → 补 version + learnedSkillIds（TM-P2-003 A 一并迁移）+ V4 字段（TM-P2-004）
        if (parsed.version === undefined && isGameState(parsed.gameState)) {
          let gs = parsed.gameState
          if (!Array.isArray(gs.player.learnedSkillIds)) {
            gs.player.learnedSkillIds = defaultSkillsForProfession(gs.player.profession)
          }
          gs = withV4Fields(gs)
          storage.setItem(
            slotKey(id),
            JSON.stringify({ version: SLOT_FORMAT_VERSION, savedAt: parsed.savedAt, gameState: gs }),
          )
          changed = true
          continue
        }
        // Step 3（TM-P2-003 A）：schema 2 → 3 —— player 补 learnedSkillIds（按职业初始技能）；同时补 V4 字段（TM-P2-004）
        if (parsed.version === 2 && isGameState(parsed.gameState)) {
          let gs = parsed.gameState
          if (!Array.isArray(gs.player.learnedSkillIds)) {
            gs.player.learnedSkillIds = defaultSkillsForProfession(gs.player.profession)
          }
          gs = withV4Fields(gs)
          storage.setItem(
            slotKey(id),
            JSON.stringify({ version: SLOT_FORMAT_VERSION, savedAt: parsed.savedAt, gameState: gs }),
          )
          changed = true
          continue
        }
        // Step 4（TM-P2-004）：schema 3 → 4 —— 补 companions/relationships/party/restCount（黄金兔冻结档原样迁移）
        if (parsed.version === 3 && isGameState(parsed.gameState)) {
          const gs = withV4Fields(parsed.gameState)
          storage.setItem(
            slotKey(id),
            JSON.stringify({ version: SLOT_FORMAT_VERSION, savedAt: parsed.savedAt, gameState: gs }),
          )
          changed = true
        }
      } catch {
        // 损坏槽保留原样，不阻断
      }
    }
  }
  return changed
}

// ---------- 导出 / 导入（TM-P2-002 I / TM-P2-003-R1 D） ----------

/** 将单个槽位条目迁移到当前格式（version 4 + learnedSkillIds + V4 字段）；旧版本原地升级，v4 直接返回 */
function migrateSlotEntryToCurrent(entry: SaveSlot): SaveSlot {
  let gs = entry.gameState
  if (!Array.isArray(gs.player.learnedSkillIds)) {
    gs.player.learnedSkillIds = defaultSkillsForProfession(gs.player.profession)
  }
  gs = withV4Fields(gs)
  return { version: SLOT_FORMAT_VERSION, savedAt: entry.savedAt, gameState: gs }
}

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
 * 导入五槽位 JSON（TM-P2-002-R1 C：完整校验后先快照全部槽位与索引，再写入；
 * 任意一步失败 → 全部恢复原样返回 false。禁止部分导入）。
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
  const snap = snapshotAll()
  try {
    for (const slotId of SLOT_IDS) {
      const entry = parsed.slots[slotId]
      if (entry === null) {
        storage.removeItem(slotKey(slotId))
        continue
      }
      // TM-P2-003-R1 D + TM-P2-004-R1 F：旧导出（version undefined/2/3）导入时迁移到当前格式（v4 字段 + version 4）
      const migrated = migrateSlotEntryToCurrent(entry)
      storage.setItem(slotKey(slotId), JSON.stringify(migrated))
    }
  } catch (err) {
    console.error('[存档] 导入写入失败，全部回滚', err)
    restoreSnapshot(snap)
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
  if (!writeIndex(index)) {
    console.error('[存档] 导入索引写入失败，全部回滚')
    restoreSnapshot(snap)
    return false
  }
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
