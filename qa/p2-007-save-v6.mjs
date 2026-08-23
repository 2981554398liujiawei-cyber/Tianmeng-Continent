// ============================================================================
// 《天梦大陆》TM-P2-007 §51 Save V6 迁移验收（纯 Node，不依赖浏览器）
//
//  覆盖：
//   - V1→V6 / V2→V6 / V3→V6 / V4→V6 / V5→V6 槽位迁移（旧版本存档可加载，版本号升到 6）
//   - 特别断言：V5 存档 XP 130 → V6 后仍 130（迁移不得重算/丢失 XP）
//   - V6 mount save→load 保留（ownedMountIds / equippedMountId / world.encounterVariants）
//   - V6 导出→导入→载入保留（exportSaves / importSaves 链）
//
// 运行：node qa/p2-007-save-v6.mjs
// ============================================================================
import { registerHooks } from 'node:module'

// ---- TS 扩展名 resolve hook（同步版，必须在任何 .ts 动态 import 之前注册）----
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context)
      } catch {
        /* 继续尝试下一个候选 */
      }
      try {
        return nextResolve(specifier + '/index.ts', context)
      } catch {
        /* 继续尝试下一个候选 */
      }
    }
    return nextResolve(specifier, context)
  },
})

// ---- 内存 localStorage mock（storage.ts 依赖 typeof localStorage !== 'undefined'）----
function createMemoryStorage() {
  const store = new Map()
  const storage = {
    get length() {
      return store.size
    },
    key(index) {
      return [...store.keys()][index] ?? null
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(String(key), String(value))
    },
    removeItem(key) {
      store.delete(String(key))
    },
    clear() {
      store.clear()
    },
  }
  return { storage, clear: () => store.clear() }
}
const memory = createMemoryStorage()
globalThis.localStorage = memory.storage

// ---- 动态加载正式模块（registerHooks 之后）----
const storage = await import('../src/game/utils/storage.ts')
const SLOT_VERSION = storage.SLOT_FORMAT_VERSION

// ---- 结果收集 ----
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 基础 GameState（V5 语义：完整 V4 字段 + 严格 level/XP）。
 * XP=130 / Lv.2（Lv.3 阈值 250 → 130 < 250 合法；Lv.2 阈值 0 → 130 >= 0 合法）。
 * V1-V4 构造基于此裁剪出「该版本应有的字段」，缺字段由迁移链补齐。
 */
function baseGameState() {
  return {
    player: {
      id: 'player-savev6',
      name: '存档迁移测试',
      gender: 'male',
      level: 2,
      profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20,
      maxHp: 24,
      mp: 7,
      maxMp: 7,
      gold: 150,
      adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [],
    world: { currentLocationId: 'tianlong_city', flags: {}, completedEvents: [], npcStates: {}, restCount: 0 },
    companions: {},
    relationships: {},
    party: { activeCompanionIds: [] },
  }
}

/** 真实 V1 档：无 learnedSkillIds / V4 / V6 字段 */
function v1GameState() {
  const gs = baseGameState()
  delete gs.player.learnedSkillIds
  delete gs.companions
  delete gs.relationships
  delete gs.party
  delete gs.world.restCount
  return gs
}

/** 真实 V2 档：无 learnedSkillIds（V3 才引入）；无 V4 / V6 字段 */
function v2GameState() {
  const gs = baseGameState()
  delete gs.player.learnedSkillIds
  delete gs.companions
  delete gs.relationships
  delete gs.party
  delete gs.world.restCount
  return gs
}

/** 真实 V3 档：有 learnedSkillIds；无 V4 / V6 字段 */
function v3GameState() {
  const gs = baseGameState()
  delete gs.companions
  delete gs.relationships
  delete gs.party
  delete gs.world.restCount
  return gs
}

/** 真实 V4 档：完整 V4 字段（companions/relationships/party/restCount）；无 V6 字段 */
function v4GameState() {
  return baseGameState()
}

/** 真实 V5 档：完整 V4 字段 + 严格 level/XP（adventureXp 权威，130）；无 V6 字段 */
function v5GameState() {
  return baseGameState()
}

/** 当前 V6 档：完整 V4 + V6 字段（含坐骑） */
function v6GameStateWithMount() {
  return {
    ...baseGameState(),
    ownedMountIds: ['fire_stallion'],
    equippedMountId: 'fire_stallion',
    world: { ...baseGameState().world, encounterVariants: { enc_city_street: 'variant_bandit_pair' } },
  }
}

const LEGACY_KEY = 'tianmeng_continent_save'
const SLOT1_KEY = 'tianmeng_continent_save_slot_slot1'
const savedAt = '2026-08-21T08:00:00.000Z'

const readRawSlot1 = () => {
  const raw = memory.storage.getItem(SLOT1_KEY)
  return raw ? JSON.parse(raw) : null
}

try {
  // =====================================================================
  // Case 1：V1 → V6（legacy 单槽自动迁移；migrateSave → migrateLegacySave）
  // =====================================================================
  memory.clear()
  memory.storage.setItem(LEGACY_KEY, JSON.stringify({ version: 1, savedAt, gameState: v1GameState() }))
  const v1changed = storage.migrateSave()
  const v1slot = storage.loadSlot('slot1')
  check('V1: migrateSave 触发迁移', v1changed === true, v1changed ? '' : 'changed=false')
  check('V1: 迁移后 slot1 可加载', v1slot !== null)
  check('V1: 版本号升至 6', v1slot?.version === SLOT_VERSION, `version=${v1slot?.version}`)
  check(
    'V1: V6 三字段补齐（ownedMountIds/equippedMountId/encounterVariants）',
    Array.isArray(v1slot?.gameState?.ownedMountIds) &&
      v1slot?.gameState?.ownedMountIds.length === 0 &&
      v1slot?.gameState?.equippedMountId === null &&
      v1slot?.gameState?.world?.encounterVariants !== undefined &&
      typeof v1slot?.gameState?.world?.encounterVariants === 'object',
  )
  check(
    'V1: V4 字段补齐（learnedSkillIds/companions/relationships/party/restCount）',
    Array.isArray(v1slot?.gameState?.player?.learnedSkillIds) &&
      v1slot?.gameState?.player?.learnedSkillIds.includes('knight_power_strike') &&
      v1slot?.gameState?.companions !== undefined &&
      v1slot?.gameState?.relationships !== undefined &&
      Array.isArray(v1slot?.gameState?.party?.activeCompanionIds) &&
      v1slot?.gameState?.world?.restCount === 0,
  )
  check('V1: 持久迁移后 raw slot1.version === 6', readRawSlot1()?.version === SLOT_VERSION)
  check('V1: 迁移保留玩家名/位置', v1slot?.gameState?.player?.name === '存档迁移测试' && v1slot?.gameState?.world?.currentLocationId === 'tianlong_city')

  // =====================================================================
  // Case 2a：V2（version: 2）→ V6
  // =====================================================================
  memory.clear()
  memory.storage.setItem(SLOT1_KEY, JSON.stringify({ version: 2, savedAt, gameState: v2GameState() }))
  const v2changed = storage.migrateSave()
  const v2slot = storage.loadSlot('slot1')
  check('V2: migrateSave 触发迁移', v2changed === true)
  check('V2: 迁移后 slot1 可加载且版本 6', v2slot?.version === SLOT_VERSION)
  check(
    'V2: 补齐 learnedSkillIds 与 V6 三字段',
    Array.isArray(v2slot?.gameState?.player?.learnedSkillIds) &&
      v2slot?.gameState?.player?.learnedSkillIds.includes('knight_power_strike') &&
      Array.isArray(v2slot?.gameState?.ownedMountIds) &&
      v2slot?.gameState?.equippedMountId === null &&
      typeof v2slot?.gameState?.world?.encounterVariants === 'object',
  )

  // =====================================================================
  // Case 2b：无版本旧 V2 槽（514f3e2 在线产生的无 slot-version V2 档）→ V6
  // =====================================================================
  memory.clear()
  memory.storage.setItem(SLOT1_KEY, JSON.stringify({ savedAt, gameState: v2GameState() }))
  const v2noChanged = storage.migrateSave()
  const v2noSlot = storage.loadSlot('slot1')
  check('V2(无版本): migrateSave 触发迁移', v2noChanged === true)
  check('V2(无版本): 迁移后版本 6 且 V4/V6 字段齐全', v2noSlot?.version === SLOT_VERSION && Array.isArray(v2noSlot?.gameState?.ownedMountIds) && v2noSlot?.gameState?.world?.restCount === 0)

  // =====================================================================
  // Case 3：V3 → V6
  // =====================================================================
  memory.clear()
  memory.storage.setItem(SLOT1_KEY, JSON.stringify({ version: 3, savedAt, gameState: v3GameState() }))
  const v3changed = storage.migrateSave()
  const v3slot = storage.loadSlot('slot1')
  check('V3: migrateSave 触发迁移', v3changed === true)
  check('V3: 迁移后版本 6 且可加载', v3slot?.version === SLOT_VERSION)
  check(
    'V3: V4 字段（companions/relationships/party/restCount）+ V6 三字段补齐',
    v3slot?.gameState?.companions !== undefined &&
      v3slot?.gameState?.relationships !== undefined &&
      Array.isArray(v3slot?.gameState?.party?.activeCompanionIds) &&
      v3slot?.gameState?.world?.restCount === 0 &&
      Array.isArray(v3slot?.gameState?.ownedMountIds) &&
      v3slot?.gameState?.equippedMountId === null &&
      typeof v3slot?.gameState?.world?.encounterVariants === 'object',
  )

  // =====================================================================
  // Case 4：V4 → V6
  // =====================================================================
  memory.clear()
  memory.storage.setItem(SLOT1_KEY, JSON.stringify({ version: 4, savedAt, gameState: v4GameState() }))
  const v4changed = storage.migrateSave()
  const v4slot = storage.loadSlot('slot1')
  check('V4: migrateSave 触发迁移', v4changed === true)
  check('V4: 迁移后版本 6 且可加载', v4slot?.version === SLOT_VERSION)
  check(
    'V4: V4 字段保留 + V6 三字段补齐',
    v4slot?.gameState?.companions !== undefined &&
      v4slot?.gameState?.relationships !== undefined &&
      v4slot?.gameState?.world?.restCount === 0 &&
      Array.isArray(v4slot?.gameState?.ownedMountIds) &&
      v4slot?.gameState?.equippedMountId === null &&
      typeof v4slot?.gameState?.world?.encounterVariants === 'object',
  )
  check('V4: 迁移保留玩家名/金币', v4slot?.gameState?.player?.name === '存档迁移测试' && v4slot?.gameState?.player?.gold === 150)

  // =====================================================================
  // Case 5：V5 → V6（核心：XP 130 不得重算/丢失）
  // =====================================================================
  memory.clear()
  memory.storage.setItem(SLOT1_KEY, JSON.stringify({ version: 5, savedAt, gameState: v5GameState() }))
  // 内存级迁移（loadSlot 不写回，仅返回 V6 语义）
  const v5mem = storage.loadSlot('slot1')
  check('V5: loadSlot 内存迁移 → 版本 6 且可加载', v5mem?.version === SLOT_VERSION)
  check('V5: loadSlot 迁移后 XP 仍为 130', v5mem?.gameState?.player?.adventureXp === 130, `xp=${v5mem?.gameState?.player?.adventureXp}`)
  check('V5: loadSlot 迁移后 level 不变（2）', v5mem?.gameState?.player?.level === 2)
  // 持久迁移（migrateSave 写回 slot1）
  const v5changed = storage.migrateSave()
  const v5raw = readRawSlot1()
  check('V5: migrateSave 触发迁移', v5changed === true)
  check('V5: 持久迁移后 raw slot1.version === 6', v5raw?.version === SLOT_VERSION)
  check('V5: 持久迁移后 XP 仍为 130（不重算）', v5raw?.gameState?.player?.adventureXp === 130, `xp=${v5raw?.gameState?.player?.adventureXp}`)
  check('V5: 持久迁移后 level 仍为 2', v5raw?.gameState?.player?.level === 2)
  check(
    'V5: V6 三字段补齐且无坐骑',
    Array.isArray(v5raw?.gameState?.ownedMountIds) &&
      v5raw?.gameState?.ownedMountIds.length === 0 &&
      v5raw?.gameState?.equippedMountId === null &&
      typeof v5raw?.gameState?.world?.encounterVariants === 'object',
  )
  check('V5: 其余数据原样保留（金币 150 / 位置天龙城）', v5raw?.gameState?.player?.gold === 150 && v5raw?.gameState?.world?.currentLocationId === 'tianlong_city')
  // 迁移后可再 loadSlot
  const v5reload = storage.loadSlot('slot1')
  check('V5: 迁移后 reload 仍 130', v5reload?.gameState?.player?.adventureXp === 130)

  // =====================================================================
  // Case 6：V6 mount save → load 保留
  // =====================================================================
  memory.clear()
  const gs = v6GameStateWithMount()
  const savedOk = storage.saveSlot('slot1', gs)
  check('V6: saveSlot(slot1, 含坐骑 V6) 成功', savedOk === true)
  const loaded = storage.loadSlot('slot1')
  check('V6: loadSlot 后版本 6', loaded?.version === SLOT_VERSION)
  check(
    'V6: ownedMountIds 保留 [fire_stallion]',
    Array.isArray(loaded?.gameState?.ownedMountIds) && loaded?.gameState?.ownedMountIds.includes('fire_stallion'),
  )
  check('V6: equippedMountId 保留 fire_stallion', loaded?.gameState?.equippedMountId === 'fire_stallion')
  check(
    'V6: world.encounterVariants 保留',
    loaded?.gameState?.world?.encounterVariants?.enc_city_street === 'variant_bandit_pair',
  )
  check('V6: 其他字段保留（玩家名/金币/XP）', loaded?.gameState?.player?.name === '存档迁移测试' && loaded?.gameState?.player?.gold === 150 && loaded?.gameState?.player?.adventureXp === 130)

  // =====================================================================
  // Case 7：V6 导出 → 清空 → 导入 → 载入保留（exportSaves / importSaves 链）
  // =====================================================================
  const exported = storage.exportSaves()
  memory.clear()
  const importedOk = storage.importSaves(exported)
  const afterImport = storage.loadSlot('slot1')
  check('V6: exportSaves → importSaves 成功', importedOk === true)
  check('V6: 导入后版本 6 且可加载', afterImport?.version === SLOT_VERSION)
  check(
    'V6: 导入后坐骑字段保留',
    Array.isArray(afterImport?.gameState?.ownedMountIds) &&
      afterImport?.gameState?.ownedMountIds.includes('fire_stallion') &&
      afterImport?.gameState?.equippedMountId === 'fire_stallion' &&
      afterImport?.gameState?.world?.encounterVariants?.enc_city_street === 'variant_bandit_pair',
  )
  check('V6: 导入后 XP 130 保留', afterImport?.gameState?.player?.adventureXp === 130)

  // 显式等待异步队列排空（无害）
  await sleep(10)
} catch (err) {
  check('save-v6 脚本执行无异常', false, String(err))
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-007 §51 Save V6 迁移结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
