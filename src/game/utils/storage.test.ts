import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import {
  LEGACY_SAVE_KEY,
  LEGACY_SAVE_VERSION,
  SAVE_VERSION,
  SAVES_INDEX_KEY,
  SLOT_IDS,
  SLOT_FORMAT_VERSION,
  deleteSlot,
  exportSaves,
  hasAnySave,
  importSaves,
  isValidSaveSlot,
  loadIndex,
  loadMostRecentSave,
  loadSlot,
  migrateLegacySave,
  migrateSave,
  saveSlot,
  type SlotId,
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

const stateWithGold = (gold: number) => {
  const state = createInitialGameState()
  state.player.gold = gold
  return state
}

describe('TM-P2-002 G：五槽位相互独立', () => {
  it('保存到 slot1/slot2 互不覆盖，各自读回', () => {
    expect(saveSlot('slot1', stateWithGold(70))).toBe(true)
    expect(saveSlot('slot2', stateWithGold(80))).toBe(true)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(loadSlot('slot3')).toBeNull()
  })

  it('删除 slot1 不影响 slot2', () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot2', stateWithGold(80))
    expect(deleteSlot('slot1')).toBe(true)
    expect(loadSlot('slot1')).toBeNull()
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(hasAnySave()).toBe(true)
  })

  it('覆盖写入同一槽位（保存前确认由 UI 负责；storage 允许覆盖）', () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot1', stateWithGold(90))
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(90)
  })

  it('五个槽位摘要正确（空槽 null；lastSavedSlot 按 savedAt 最新）', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 70)
    writeSlotRawAt('slot3', '2026-01-01T12:00:00.000Z', 80)
    const index = loadIndex()
    expect(index.slots.slot1?.playerName).toBe('石头城')
    expect(index.slots.slot1?.level).toBe(1)
    expect(index.slots.slot1?.locationId).toBe('qingshi_village')
    expect(index.slots.slot1?.profession).toBe('knight')
    expect(index.slots.slot2).toBeNull()
    expect(index.slots.slot3).not.toBeNull()
    expect(index.slots.slot4).toBeNull()
    expect(index.slots.slot5).toBeNull()
    expect(index.lastSavedSlot).toBe('slot3')
  })
})

describe('TM-P2-002 H：V1 单档自动迁移', () => {
  const writeLegacy = (gameState: unknown, version = LEGACY_SAVE_VERSION) => {
    localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({ version, savedAt: '2026-01-01T00:00:00.000Z', gameState }))
  }

  it('旧 V1 单档存在且 Slot1 为空 → 迁移到 Slot1 并删除旧 key', () => {
    const legacy = createInitialGameState()
    legacy.player.gold = 66
    writeLegacy(legacy)
    expect(migrateLegacySave()).toBe(true)
    // Slot1 有存档，旧 key 已删除
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(66)
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).toBeNull()
    expect(loadIndex().lastSavedSlot).toBe('slot1')
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(66)
  })

  it('Slot1 已有存档 → 不迁移、不覆盖、旧 key 保留', () => {
    saveSlot('slot1', stateWithGold(70))
    const legacy = createInitialGameState()
    legacy.player.gold = 66
    writeLegacy(legacy)
    expect(migrateLegacySave()).toBe(false)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).not.toBeNull()
  })

  it('旧 key 非法（损坏 JSON）→ 不迁移、不抛', () => {
    localStorage.setItem(LEGACY_SAVE_KEY, '{ broken')
    expect(() => migrateLegacySave()).not.toThrow()
    expect(migrateLegacySave()).toBe(false)
  })

  it('旧 key 版本不匹配 → 不迁移', () => {
    writeLegacy(createInitialGameState(), 999)
    expect(migrateLegacySave()).toBe(false)
    expect(loadSlot('slot1')).toBeNull()
  })

  it('迁移后可正常加载（Continue 语义）', () => {
    const legacy = createInitialGameState()
    legacy.player.name = '老存档'
    writeLegacy(legacy)
    migrateLegacySave()
    expect(loadMostRecentSave()?.gameState.player.name).toBe('老存档')
  })
})

describe('TM-P2-002 H：损坏单槽隔离', () => {
  it('slot1 损坏 JSON → loadSlot null；slot2 正常读取', () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot2', stateWithGold(80))
    localStorage.setItem('tianmeng_continent_save_slot_slot1', '{ broken json')
    expect(loadSlot('slot1')).toBeNull()
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(hasAnySave()).toBe(true)
  })

  it('slot1 结构非法 → 拒绝；slot2 正常；最近槽回退', () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot2', stateWithGold(80))
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ savedAt: 'x', gameState: {} }))
    expect(loadSlot('slot1')).toBeNull()
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    // 最近槽是 slot2，不受影响
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(80)
  })

  it('删除最近槽后最近存档回退到其他有效槽（按 savedAt 最新）', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 70)
    writeSlotRawAt('slot2', '2026-01-01T12:00:00.000Z', 80)
    expect(loadIndex().lastSavedSlot).toBe('slot2')
    deleteSlot('slot2')
    expect(loadIndex().lastSavedSlot).toBe('slot1')
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(70)
  })

  it('全部删除 → 无存档', () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot2', stateWithGold(80))
    deleteSlot('slot1')
    deleteSlot('slot2')
    expect(hasAnySave()).toBe(false)
    expect(loadMostRecentSave()).toBeNull()
  })
})

describe('TM-P2-002 I：导出 / 导入', () => {
  it('导出五槽位 JSON → 删除 → 导入 → 恢复', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 70)
    writeSlotRawAt('slot3', '2026-01-01T12:00:00.000Z', 80)
    const json = exportSaves()
    expect(json).toContain('slot1')
    expect(json).toContain('slot3')

    // 删除全部
    deleteSlot('slot1')
    deleteSlot('slot3')
    expect(hasAnySave()).toBe(false)

    // 导入恢复
    expect(importSaves(json)).toBe(true)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot3')?.gameState.player.gold).toBe(80)
    expect(loadIndex().lastSavedSlot).toBe('slot3')
  })

  it('非法 JSON → 导入失败且不覆盖现有存档', () => {
    saveSlot('slot1', stateWithGold(70))
    expect(importSaves('{ not valid json')).toBe(false)
    expect(importSaves('garbage')).toBe(false)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
  })

  it('版本不匹配 → 导入失败且不覆盖', () => {
    saveSlot('slot1', stateWithGold(70))
    const bad = JSON.stringify({
      version: 999,
      exportedAt: 'x',
      slots: { slot1: { savedAt: 'x', gameState: stateWithGold(999) }, slot2: null, slot3: null, slot4: null, slot5: null },
    })
    expect(importSaves(bad)).toBe(false)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
  })

  it('任一槽结构非法 → 整体拒绝（不部分覆盖）', () => {
    saveSlot('slot1', stateWithGold(70))
    const state = createInitialGameState()
    state.player.gold = 10.5 // 非法（非整数）
    const bad = JSON.stringify({
      version: SAVE_VERSION,
      exportedAt: 'x',
      slots: { slot1: { savedAt: 'x', gameState: state }, slot2: null, slot3: null, slot4: null, slot5: null },
    })
    expect(importSaves(bad)).toBe(false)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
  })

  it('保存 → 模拟刷新（重新读取）→ 状态保持', () => {
    saveSlot('slot1', stateWithGold(123))
    // 模拟刷新：localStorage 内容仍在（mock storage 未清空）
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(123)
    expect(hasAnySave()).toBe(true)
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(123)
  })
})

describe('TM-P0-001 校验语义（V2 槽位）', () => {
  it('非法 GameState 不得写入任何槽位', () => {
    const bad = createInitialGameState()
    bad.player.gold = 10.5
    expect(saveSlot('slot1', bad)).toBe(false)
    expect(loadSlot('slot1')).toBeNull()
  })

  it('写入后关键状态保持一致', () => {
    const state = stateWithGold(77)
    state.world.currentLocationId = 'tianlong_city'
    saveSlot('slot2', state)
    const save = loadSlot('slot2')
    expect(save?.savedAt).toBeTypeOf('string')
    expect(save?.gameState.player.gold).toBe(77)
    expect(save?.gameState.world.currentLocationId).toBe('tianlong_city')
  })

  it('setItem 抛错 → saveSlot false，旧档保留', () => {
    saveSlot('slot1', stateWithGold(70))
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveSlot('slot2', stateWithGold(80))).toBe(false)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
  })

  it('removeItem 抛错 → deleteSlot false', () => {
    saveSlot('slot1', stateWithGold(70))
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(deleteSlot('slot1')).toBe(false)
    expect(loadSlot('slot1')).not.toBeNull()
  })
})

describe('TM-P2-002 槽位 ID 常量', () => {
  it('SLOT_IDS 顺序固定（slot1..slot5）', () => {
    expect(loadIndex().slots).toHaveProperty('slot1')
    expect(loadIndex().slots).toHaveProperty('slot5')
  })

  it('lastSavedSlot 随保存更新', () => {
    saveSlot('slot4', stateWithGold(70))
    expect(loadIndex().lastSavedSlot).toBe('slot4')
  })
})

describe('TM-P2-002 导出包含全部五个槽位键', () => {
  it('导出 JSON 解析后 slots 含 slot1–slot5', () => {
    saveSlot('slot2', stateWithGold(70))
    const parsed = JSON.parse(exportSaves()) as { slots: Record<SlotId, unknown> }
    expect(Object.keys(parsed.slots).sort()).toEqual(['slot1', 'slot2', 'slot3', 'slot4', 'slot5'])
  })
})

// ================= TM-P2-002-R1：审计返修新增测试 =================

/** 以固定 savedAt 直接写入槽位 raw（模拟真实存储内容；用于构造时间序列场景） */
function writeSlotRawAt(slotId: SlotId, savedAt: string, gold: number, withVersion = true) {
  const state = stateWithGold(gold)
  const payload = withVersion
    ? { version: SLOT_FORMAT_VERSION, savedAt, gameState: state }
    : { savedAt, gameState: state } // 514f3e2 无槽版本 V2 格式
  localStorage.setItem(`tianmeng_continent_save_slot_${slotId}`, JSON.stringify(payload))
}

/** 让对指定 key 的 setItem 抛错（模拟存储写入失败） */
function failSetItemOn(keyToFail: string) {
  const storage = localStorage
  const orig = storage.setItem.bind(storage)
  vi.spyOn(storage, 'setItem').mockImplementation((key: string, value: string) => {
    if (key === keyToFail) throw new Error(`mock write fail: ${key}`)
    return orig(key, value)
  })
}

describe('TM-P2-002-R1 C1：saveSlot 事务（slot 成功、index 失败 → 回滚）', () => {
  it('slot 写入成功但 index 写入失败 → 槽位回滚为旧值且返回 false', () => {
    // 先有旧值
    expect(saveSlot('slot1', stateWithGold(70))).toBe(true)
    const before = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    failSetItemOn(SAVES_INDEX_KEY)
    expect(saveSlot('slot1', stateWithGold(99))).toBe(false)
    // 槽位保持旧值（未覆盖为新值）
    const after = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    expect(after).toBe(before)
    expect(JSON.parse(after!).gameState.player.gold).toBe(70)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
  })

  it('全新槽位 index 失败 → 槽位被回滚删除（不留半成品）', () => {
    failSetItemOn(SAVES_INDEX_KEY)
    expect(saveSlot('slot2', stateWithGold(80))).toBe(false)
    expect(localStorage.getItem('tianmeng_continent_save_slot_slot2')).toBeNull()
    expect(loadSlot('slot2')).toBeNull()
  })
})

describe('TM-P2-002-R1 C2：deleteSlot 事务（删除成功、index 失败 → 回滚）', () => {
  it('槽位删除后 index 更新失败 → 恢复被删除槽位与旧 index，返回 false', () => {
    expect(saveSlot('slot1', stateWithGold(70))).toBe(true)
    expect(saveSlot('slot3', stateWithGold(90))).toBe(true)
    const slot3Before = localStorage.getItem('tianmeng_continent_save_slot_slot3')
    const indexBefore = localStorage.getItem(SAVES_INDEX_KEY)
    failSetItemOn(SAVES_INDEX_KEY)
    expect(deleteSlot('slot3')).toBe(false)
    // 槽位恢复
    expect(localStorage.getItem('tianmeng_continent_save_slot_slot3')).toBe(slot3Before)
    expect(localStorage.getItem(SAVES_INDEX_KEY)).toBe(indexBefore)
    expect(loadSlot('slot3')?.gameState.player.gold).toBe(90)
    expect(loadIndex().slots.slot3?.playerName).toBe('石头城')
  })
})

describe('TM-P2-002-R1 C3：importSaves 事务（任一步失败 → 五槽全部保持原样）', () => {
  const seedTwo = () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot2', stateWithGold(80))
  }
  const makeExport = () => {
    const payload = {
      version: SAVE_VERSION,
      exportedAt: '2026-01-02T00:00:00.000Z',
      lastSavedSlot: 'slot4',
      slots: {
        slot1: { version: SLOT_FORMAT_VERSION, savedAt: '2026-01-02T00:00:00.000Z', gameState: stateWithGold(111) },
        slot2: null,
        slot3: { version: SLOT_FORMAT_VERSION, savedAt: '2026-01-02T00:01:00.000Z', gameState: stateWithGold(333) },
        slot4: { version: SLOT_FORMAT_VERSION, savedAt: '2026-01-02T00:02:00.000Z', gameState: stateWithGold(444) },
        slot5: null,
      },
    }
    return JSON.stringify(payload)
  }
  const snapshotRaw = () =>
    SLOT_IDS.map((id) => localStorage.getItem(`tianmeng_continent_save_slot_${id}`)).join('|') +
    '||' +
    localStorage.getItem(SAVES_INDEX_KEY)

  it('第 1 步（slot1）失败 → 全部恢复原样', () => {
    seedTwo()
    const before = snapshotRaw()
    failSetItemOn('tianmeng_continent_save_slot_slot1')
    expect(importSaves(makeExport())).toBe(false)
    expect(snapshotRaw()).toBe(before)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(loadSlot('slot3')).toBeNull()
  })

  it('第 3 步（slot3）失败 → 已写入的 slot1/slot2 回滚', () => {
    seedTwo()
    const before = snapshotRaw()
    failSetItemOn('tianmeng_continent_save_slot_slot3')
    expect(importSaves(makeExport())).toBe(false)
    expect(snapshotRaw()).toBe(before)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(loadSlot('slot3')).toBeNull()
  })

  it('最后一步（index 写入）失败 → 全部恢复', () => {
    seedTwo()
    const before = snapshotRaw()
    failSetItemOn(SAVES_INDEX_KEY)
    expect(importSaves(makeExport())).toBe(false)
    expect(snapshotRaw()).toBe(before)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(loadSlot('slot3')).toBeNull()
    expect(loadSlot('slot4')).toBeNull()
  })
})

describe('TM-P2-002-R1 D1：迁移不覆盖（index 坏但 Slot1 已有档）', () => {
  it('index 损坏、Slot1 有真实档 + legacy 存在 → 不覆盖 Slot1，legacy 保留', () => {
    // Slot1 真实数据
    expect(saveSlot('slot1', stateWithGold(70))).toBe(true)
    // 弄坏 index
    localStorage.setItem(SAVES_INDEX_KEY, '{ broken')
    // legacy 档
    const legacy = createInitialGameState()
    legacy.player.gold = 66
    localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({ version: LEGACY_SAVE_VERSION, savedAt: '2026-01-01T00:00:00.000Z', gameState: legacy }))
    // index 损坏不能导致误判 Slot1 为空 → 不迁移
    expect(migrateLegacySave()).toBe(false)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).not.toBeNull()
  })
})

describe('TM-P2-002-R1 D2：迁移分步提交（新 slot 成功、index 失败 → legacy 保留）', () => {
  it('写 Slot1 成功后 index 写入失败 → 回滚新写入、legacy 保留、返回 false', () => {
    const legacy = createInitialGameState()
    legacy.player.gold = 66
    localStorage.setItem(LEGACY_SAVE_KEY, JSON.stringify({ version: LEGACY_SAVE_VERSION, savedAt: '2026-01-01T00:00:00.000Z', gameState: legacy }))
    failSetItemOn(SAVES_INDEX_KEY)
    expect(migrateLegacySave()).toBe(false)
    // 新写入回滚
    expect(loadSlot('slot1')).toBeNull()
    // legacy 保留
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).not.toBeNull()
  })
})

describe('TM-P2-002-R1 E：index 损坏自动恢复（缓存定位）', () => {
  it('index 为 broken JSON、slot2/slot4 合法 → 自动重建索引并可见两槽', () => {
    writeSlotRawAt('slot2', '2026-01-01T08:00:00.000Z', 82)
    writeSlotRawAt('slot4', '2026-01-01T10:00:00.000Z', 84)
    localStorage.setItem(SAVES_INDEX_KEY, '{ broken')
    const index = loadIndex()
    expect(index.slots.slot2?.playerName).toBe('石头城')
    expect(index.slots.slot4?.playerName).toBe('石头城')
    expect(index.slots.slot1).toBeNull()
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(84) // 最新 = slot4
    // 坏槽原始数据保留（不删除）
    expect(localStorage.getItem('tianmeng_continent_save_slot_slot2')).not.toBeNull()
  })

  it('index 缺失但槽位有效 → 扫描重建', () => {
    writeSlotRawAt('slot5', '2026-01-01T12:00:00.000Z', 95)
    expect(localStorage.getItem(SAVES_INDEX_KEY)).toBeNull()
    expect(hasAnySave()).toBe(true)
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(95)
  })
})

describe('TM-P2-002-R1 F：Continue 按 savedAt 选真正最新（不按编号）', () => {
  it('slot1(08:00) / slot3(12:00) / slot5(15:00 损坏) → Continue 选 slot3', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 1)
    writeSlotRawAt('slot3', '2026-01-01T12:00:00.000Z', 3)
    localStorage.setItem('tianmeng_continent_save_slot_slot5', '{ broken')
    const idx = {
      version: SAVE_VERSION,
      lastSavedSlot: 'slot5',
      slots: { slot1: { playerName: 'a', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T08:00:00.000Z' }, slot2: null, slot3: { playerName: 'b', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T12:00:00.000Z' }, slot4: null, slot5: { playerName: 'c', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T15:00:00.000Z' } },
    }
    localStorage.setItem(SAVES_INDEX_KEY, JSON.stringify(idx))
    const save = loadMostRecentSave()
    expect(save?.gameState.player.gold).toBe(3) // 不是 slot1（编号小）
  })

  it('删除最新槽 → 自动选择次新槽', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 1)
    writeSlotRawAt('slot3', '2026-01-01T12:00:00.000Z', 3)
    // 先正常保存建立索引（saveSlot 会把 lastSavedSlot 设为 slot3？不——直接构造索引）
    localStorage.setItem(
      SAVES_INDEX_KEY,
      JSON.stringify({
        version: SAVE_VERSION,
        lastSavedSlot: 'slot3',
        slots: {
          slot1: { playerName: 'a', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T08:00:00.000Z' },
          slot2: null,
          slot3: { playerName: 'b', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T12:00:00.000Z' },
          slot4: null,
          slot5: null,
        },
      }),
    )
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(3)
    expect(deleteSlot('slot3')).toBe(true)
    // 删除最新后 → 次新 slot1
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(1)
  })
})

describe('TM-P2-002-R1 G：兼容 514f3e2 已产生的无版本 V2 存档', () => {
  it('无 version 字段的旧 V2 槽可正常读取（读时补全）', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 70, false)
    const slot = loadSlot('slot1')
    expect(slot?.gameState.player.gold).toBe(70)
    expect(slot?.version).toBe(SLOT_FORMAT_VERSION)
  })

  it('migrateSave 为无版本槽原地补 version 字段', () => {
    writeSlotRawAt('slot2', '2026-01-01T08:00:00.000Z', 72, false)
    expect(migrateSave()).toBe(true)
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot2')!)
    expect(raw.version).toBe(SLOT_FORMAT_VERSION)
    expect(raw.gameState.player.gold).toBe(72)
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(72)
  })

  it('migrateSave 幂等：已带版本槽不重复改写，返回 false（无变更）', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 70, true)
    expect(migrateSave()).toBe(false)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
  })
})

describe('TM-P2-005：V5 XP 保真与 V1/V2/V3/V4 → V5 迁移', () => {
  it('读取当前 V5 时 XP、等级和资源保持 bit-for-bit', () => {
    const state = createInitialGameState()
    state.player.adventureXp = 137
    state.player.level = 2
    state.player.hp = 7
    state.player.maxHp = 31
    state.player.mp = 2
    state.player.maxMp = 11
    const raw = { version: SLOT_FORMAT_VERSION, savedAt: '2026-01-01T08:00:00.000Z', gameState: state }
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(raw))
    expect(loadSlot('slot1')?.gameState).toEqual(state)
  })

  it.each([undefined, 2, 3, 4] as const)('旧格式 %s 可严格迁移为 V5，并补齐 XP/当前字段', (version) => {
    const state = createInitialGameState()
    state.quests = [{ questId: 'quest_grassland_wolf', status: 'completed', stage: 0, flags: {} }]
    if (version !== 3 && version !== 4) delete (state.player as Partial<typeof state.player>).learnedSkillIds
    if (version !== 4) {
      delete (state as Partial<typeof state>).companions
      delete (state as Partial<typeof state>).relationships
      delete (state as Partial<typeof state>).party
      delete (state.world as Partial<typeof state.world>).restCount
    }
    delete (state.player as Partial<typeof state.player>).adventureXp
    const entry = version === undefined ? { savedAt: '2026-01-01T08:00:00.000Z', gameState: state } : { version, savedAt: '2026-01-01T08:00:00.000Z', gameState: state }
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(entry))
    expect(migrateSave()).toBe(true)
    const migrated = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1')!)
    expect(migrated.version).toBe(SLOT_FORMAT_VERSION)
    expect(migrated.gameState.player.adventureXp).toBe(60)
    expect(loadSlot('slot1')?.gameState.player.adventureXp).toBe(60)
  })
})

// ================= TM-P2-002-R2：索引一致性 / 真正最近档 / 迁移 raw 边界 =================

/** 写一个合法外壳但内容可控的 index raw（模拟部分污染的缓存） */
function writeIndexRaw(lastSavedSlot: SlotId | null, slotSummaries: Record<string, unknown>) {
  localStorage.setItem(
    SAVES_INDEX_KEY,
    JSON.stringify({ version: SAVE_VERSION, lastSavedSlot, slots: slotSummaries }),
  )
}

describe('TM-P2-002-R2 A：loadIndex 以真实槽为准（index 只是 cache）', () => {
  it('① index 合法但 summary.slot2=null；真实 slot2 合法 → loadIndex 恢复 slot2', () => {
    writeSlotRawAt('slot2', '2026-01-01T10:00:00.000Z', 82)
    // 合法外壳 index：slot2 被误标为空
    writeIndexRaw('slot2', { slot1: null, slot2: null, slot3: null, slot4: null, slot5: null })
    const index = loadIndex()
    expect(index.slots.slot2?.playerName).toBe('石头城')
    expect(index.slots.slot2?.level).toBe(1)
  })

  it('② index 声称 slot3 有存档；真实 slot3 不存在 → loadIndex 显示 slot3 为空', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 81)
    // index 声称 slot3 有档（幽灵摘要）
    writeIndexRaw('slot3', {
      slot1: { playerName: 'a', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T08:00:00.000Z' },
      slot2: null,
      slot3: { playerName: 'ghost', profession: 'knight', level: 9, locationId: 'y', savedAt: '2026-01-01T12:00:00.000Z' },
      slot4: null,
      slot5: null,
    })
    const index = loadIndex()
    expect(index.slots.slot3).toBeNull() // 真实不存在 → 空
    expect(index.slots.slot1?.playerName).toBe('石头城') // 真实存在 → 恢复
  })

  it('③ index 的 slot4 summary 结构损坏；真实 slot4 合法 → 恢复真实 summary', () => {
    writeSlotRawAt('slot4', '2026-01-01T11:00:00.000Z', 84)
    writeIndexRaw('slot4', {
      slot1: null,
      slot2: null,
      slot3: null,
      slot4: { playerName: 123, profession: {}, level: 'x', locationId: null, savedAt: 42 }, // 结构损坏
      slot5: null,
    })
    const index = loadIndex()
    expect(index.slots.slot4?.playerName).toBe('石头城')
    expect(index.slots.slot4?.level).toBe(1)
  })
})

describe('TM-P2-002-R2 B：Continue 每次扫描选真正最新（不信任 index.lastSavedSlot）', () => {
  it('④ slot1=08:00、slot3=12:00、index.lastSavedSlot=slot1 → Continue 读 slot3', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 1)
    writeSlotRawAt('slot3', '2026-01-01T12:00:00.000Z', 3)
    writeIndexRaw('slot1', {
      slot1: { playerName: 'a', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T08:00:00.000Z' },
      slot2: null,
      slot3: { playerName: 'b', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T12:00:00.000Z' },
      slot4: null,
      slot5: null,
    })
    const save = loadMostRecentSave()
    expect(save?.gameState.player.gold).toBe(3) // 不是过时的 slot1
  })

  it('⑤ slot1=08:00、slot3=12:00、slot5 损坏、index.lastSavedSlot=slot1 → Continue 读 slot3', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 1)
    writeSlotRawAt('slot3', '2026-01-01T12:00:00.000Z', 3)
    localStorage.setItem('tianmeng_continent_save_slot_slot5', '{ broken')
    writeIndexRaw('slot1', {
      slot1: { playerName: 'a', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T08:00:00.000Z' },
      slot2: null,
      slot3: { playerName: 'b', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T12:00:00.000Z' },
      slot4: null,
      slot5: { playerName: 'c', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T15:00:00.000Z' },
    })
    const save = loadMostRecentSave()
    expect(save?.gameState.player.gold).toBe(3)
  })

  it('⑥ 删除最新槽 → Continue 读次新槽（无论 index 残留指向谁）', () => {
    writeSlotRawAt('slot1', '2026-01-01T08:00:00.000Z', 1)
    writeSlotRawAt('slot3', '2026-01-01T12:00:00.000Z', 3)
    writeIndexRaw('slot3', {
      slot1: { playerName: 'a', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T08:00:00.000Z' },
      slot2: null,
      slot3: { playerName: 'b', profession: 'knight', level: 1, locationId: 'x', savedAt: '2026-01-01T12:00:00.000Z' },
      slot4: null,
      slot5: null,
    })
    expect(deleteSlot('slot3')).toBe(true)
    expect(loadMostRecentSave()?.gameState.player.gold).toBe(1)
  })
})

describe('TM-P2-002-R2 C：迁移按 raw key 判断 Slot1 占用（禁止覆盖任何已有数据）', () => {
  const writeLegacyRaw = (gold: number) => {
    const legacy = createInitialGameState()
    legacy.player.gold = gold
    localStorage.setItem(
      LEGACY_SAVE_KEY,
      JSON.stringify({ version: LEGACY_SAVE_VERSION, savedAt: '2026-01-01T00:00:00.000Z', gameState: legacy }),
    )
  }

  it('⑦ Slot1 raw="{ broken" + 合法 legacy → 不迁移、损坏 raw 原样保留、legacy 保留', () => {
    localStorage.setItem('tianmeng_continent_save_slot_slot1', '{ broken')
    writeLegacyRaw(66)
    expect(migrateLegacySave()).toBe(false)
    expect(localStorage.getItem('tianmeng_continent_save_slot_slot1')).toBe('{ broken')
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).not.toBeNull()
    expect(loadSlot('slot1')).toBeNull() // 损坏 raw 仍不可读，但不被覆盖
  })

  it('⑧ Slot1 可解析但结构非法 + 合法 legacy → 同样不得覆盖', () => {
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 999, savedAt: 'x', gameState: null }))
    writeLegacyRaw(66)
    expect(migrateLegacySave()).toBe(false)
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!).version).toBe(999) // 原样保留
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).not.toBeNull()
  })
})

// ================= TM-P2-003 A：schema 2 → 3 迁移（learnedSkillIds） =================

describe('TM-P2-003 A：旧 V2 存档迁移 learnedSkillIds', () => {
  /** 构造 version 2 槽（player 无 learnedSkillIds；模拟 2407f78 时代存档） */
  const writeV2Slot = (slotId: SlotId, gold: number, profession = 'knight') => {
    const state = stateWithGold(gold)
    state.player.profession = profession as never
    // 关键旧状态（黄金兔冻结 + 兔子的路径）——验证迁移前后原封不动
    state.quests = [
      {
        questId: 'quest_golden_rabbit_search',
        status: 'in_progress',
        stage: 0,
        flags: {
          asked_blacksmith: true,
          asked_apothecary: true,
          village_inquiry_reported: true,
          rabbit_lair_rechecked: true,
        },
      },
    ]
    state.inventory = [{ itemId: 'rabbit_path', quantity: 1 }]
    // @ts-expect-error 模拟旧 schema（无 learnedSkillIds 字段）
    delete state.player.learnedSkillIds
    localStorage.setItem(`tianmeng_continent_save_slot_${slotId}`, JSON.stringify({ version: 2, savedAt: '2026-01-01T08:00:00.000Z', gameState: state }))
  }

  it('version 2 槽 → migrateSave 补 learnedSkillIds（按职业）并升级当前版本', () => {
    writeV2Slot('slot1', 70)
    expect(migrateSave()).toBe(true)
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1')!)
    expect(raw.version).toBe(SLOT_FORMAT_VERSION)
    expect(raw.gameState.player.learnedSkillIds).toEqual(['knight_power_strike'])
    // TM-P2-004 V4：迁移同时补全 V4 字段
    expect(raw.gameState.companions).toEqual({})
    expect(raw.gameState.relationships).toEqual({})
    expect(raw.gameState.party).toEqual({ activeCompanionIds: [] })
    expect(raw.gameState.world.restCount).toBe(0)
  })

  it('法师旧档迁移获得法术攻击', () => {
    writeV2Slot('slot2', 70, 'mage')
    migrateSave()
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot2')!)
    expect(raw.gameState.player.learnedSkillIds).toEqual(['mage_spell'])
  })

  it('迁移前后黄金兔四 flags / rabbit_path ×1 原封不动', () => {
    writeV2Slot('slot3', 70)
    migrateSave()
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot3')!)
    const gs = raw.gameState
    expect(gs.quests[0]).toMatchObject({
      questId: 'quest_golden_rabbit_search',
      status: 'in_progress',
      stage: 0,
      flags: {
        asked_blacksmith: true,
        asked_apothecary: true,
        village_inquiry_reported: true,
        rabbit_lair_rechecked: true,
      },
    })
    expect(gs.inventory).toEqual([{ itemId: 'rabbit_path', quantity: 1 }])
  })

  it('migrateSave 幂等：已带 learnedSkillIds 的 v3 槽不重复改写', () => {
    writeV2Slot('slot4', 70)
    migrateSave()
    const before = localStorage.getItem('tianmeng_continent_save_slot_slot4')
    expect(migrateSave()).toBe(false)
    expect(localStorage.getItem('tianmeng_continent_save_slot_slot4')).toBe(before)
  })

  it('无版本旧 V2 槽（514f3e2 时代）迁移后同时获得 version 与 learnedSkillIds', () => {
    const state = stateWithGold(70)
    // @ts-expect-error 模拟无版本旧槽
    delete state.player.learnedSkillIds
    localStorage.setItem(
      'tianmeng_continent_save_slot_slot5',
      JSON.stringify({ savedAt: '2026-01-01T08:00:00.000Z', gameState: state }),
    )
    expect(migrateSave()).toBe(true)
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot5')!)
    expect(raw.version).toBe(SLOT_FORMAT_VERSION)
    expect(raw.gameState.player.learnedSkillIds).toEqual(['knight_power_strike'])
    expect(raw.gameState.world.restCount).toBe(0)
  })
})

// ================= TM-P2-003-R1 D：旧 V2 导出兼容 / v3 严格 =================

describe('TM-P2-003-R1 D1：9ddb5db V2 export 真正可以导入', () => {
  it('⑤ 旧 V2 导出（slot version 2、无 learnedSkillIds）→ 导入成功并迁移为当前版本', () => {
    const v2Slot = () => {
      const state = stateWithGold(70)
      // @ts-expect-error 模拟旧 schema
      delete state.player.learnedSkillIds
      return { version: 2, savedAt: '2026-01-01T08:00:00.000Z', gameState: state }
    }
    const json = JSON.stringify({
      version: SAVE_VERSION,
      exportedAt: '2026-01-01T09:00:00.000Z',
      lastSavedSlot: 'slot1',
      slots: { slot1: v2Slot(), slot2: null, slot3: null, slot4: null, slot5: null },
    })
    expect(importSaves(json)).toBe(true)
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1')!)
    expect(raw.version).toBe(SLOT_FORMAT_VERSION)
    expect(raw.gameState.player.learnedSkillIds).toEqual(['knight_power_strike'])
    expect(raw.gameState.player.gold).toBe(70)
    expect(raw.gameState.world.restCount).toBe(0)
  })

  it('⑥ V2 导入中途失败 → 完整 rollback（五槽保持原样）', () => {
    // 已有存档
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot2', stateWithGold(80))
    const before = [1, 2].map((n) => localStorage.getItem(`tianmeng_continent_save_slot_slot${n}`)).join('|')
    const makeV2Export = () => {
      const mk = (gold: number) => {
        const state = stateWithGold(gold)
        // @ts-expect-error 模拟旧 schema
        delete state.player.learnedSkillIds
        return { version: 2, savedAt: '2026-01-01T08:00:00.000Z', gameState: state }
      }
      return JSON.stringify({
        version: SAVE_VERSION,
        exportedAt: '2026-01-01T09:00:00.000Z',
        lastSavedSlot: 'slot3',
        slots: { slot1: mk(111), slot2: mk(222), slot3: mk(333), slot4: mk(444), slot5: mk(555) },
      })
    }
    const storage = localStorage
    const orig = storage.setItem.bind(storage)
    vi.spyOn(storage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'tianmeng_continent_save_slot_slot3') throw new Error('mock fail slot3')
      return orig(key, value)
    })
    expect(importSaves(makeV2Export())).toBe(false)
    const after = [1, 2].map((n) => localStorage.getItem(`tianmeng_continent_save_slot_slot${n}`)).join('|')
    expect(after).toBe(before)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(loadSlot('slot3')).toBeNull()
    expect(loadSlot('slot4')).toBeNull()
    expect(loadSlot('slot5')).toBeNull()
  })
})

describe('TM-P2-004：v4 缺 V4 字段判 malformed（TM-P2-003-R1 D2 语义随版本升级）', () => {
  it('⑧ version 4 但缺 V4 字段（无 companions/party/restCount）→ isValidSaveSlot false / importSaves 拒绝', () => {
    const state = stateWithGold(70)
    // @ts-expect-error 模拟 v4 缺 V4 字段
    delete state.companions
    // @ts-expect-error 模拟 v4 缺 V4 字段
    delete state.relationships
    // @ts-expect-error 模拟 v4 缺 V4 字段
    delete state.party
    // @ts-expect-error 模拟 v4 缺 V4 字段
    delete state.world.restCount
    const badSlot = { version: 4, savedAt: '2026-01-01T08:00:00.000Z', gameState: state }
    expect(isValidSaveSlot(badSlot)).toBe(false)
    // 通过 importSaves 整体拒绝
    const json = JSON.stringify({
      version: SAVE_VERSION,
      exportedAt: '2026-01-01T09:00:00.000Z',
      lastSavedSlot: null,
      slots: { slot1: badSlot, slot2: null, slot3: null, slot4: null, slot5: null },
    })
    expect(importSaves(json)).toBe(false)
    expect(loadSlot('slot1')).toBeNull()
  })
})

// ================= TM-P2-004-R1 C：Save V4 Party strictness =================

describe('TM-P2-004-R1 C：V4 Party/关系 strictness（重复/上限/交叉引用/key 一致性）', () => {
  /** 构造合法 V4 档（Sakura recruited + active；gold 50 验证保存穿透） */
  function validV4State() {
    const state = createInitialGameState()
    state.companions = {
      sakura_yuko: {
        companionId: 'sakura_yuko',
        status: 'recruited',
        level: 3,
        mp: 6,
        maxMp: 6,
        learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'],
        flags: {},
      },
    }
    state.relationships = {
      sakura_yuko: {
        npcId: 'sakura_yuko',
        affection: 5,
        trust: 5,
        stage: 'acquaintance',
        personalQuestStage: 1,
        flags: {},
      },
    }
    state.party = { activeCompanionIds: ['sakura_yuko'] }
    return state
  }

  const slotOf = (gameState: unknown) => ({ version: 4, savedAt: '2026-01-01T08:00:00.000Z', gameState })

  it('合法 V4（recruited + active + key 一致）→ isValidSaveSlot true 且 saveSlot 可写', () => {
    expect(isValidSaveSlot(slotOf(validV4State()))).toBe(true)
    expect(saveSlot('slot1', validV4State())).toBe(true)
    expect(loadSlot('slot1')?.version).toBe(SLOT_FORMAT_VERSION)
  })

  it('activeCompanionIds 含重复 ID（["sakura_yuko","sakura_yuko"]）→ 拒绝', () => {
    const state = validV4State()
    state.party = { activeCompanionIds: ['sakura_yuko', 'sakura_yuko'] }
    expect(isValidSaveSlot(slotOf(state))).toBe(false)
    expect(saveSlot('slot1', state)).toBe(false)
  })

  it('activeCompanionIds.length > MAX_ACTIVE_COMPANIONS(3) → 拒绝', () => {
    const state = validV4State()
    const extra: Record<string, string> = {}
    for (let i = 0; i < 4; i += 1) {
      state.companions[`c${i}`] = {
        companionId: `c${i}`,
        status: 'recruited',
        level: 1,
        mp: 1,
        maxMp: 1,
        learnedSkillIds: [],
        flags: {},
      }
      extra[`c${i}`] = `c${i}`
    }
    state.party = { activeCompanionIds: ['sakura_yuko', 'c0', 'c1', 'c2'] }
    expect(isValidSaveSlot(slotOf(state))).toBe(false)
    // 恰好 3 个 → 合法
    state.party = { activeCompanionIds: ['sakura_yuko', 'c0', 'c1'] }
    expect(isValidSaveSlot(slotOf(state))).toBe(true)
  })

  it('active ID 不存在于 companions → 拒绝', () => {
    const state = validV4State()
    state.party = { activeCompanionIds: ['ghost_companion'] }
    expect(isValidSaveSlot(slotOf(state))).toBe(false)
  })

  it('active companion.status === met → 拒绝（未缔约不可同行）', () => {
    const state = validV4State()
    state.companions.sakura_yuko!.status = 'met'
    expect(isValidSaveSlot(slotOf(state))).toBe(false)
  })

  it('companions Record key 与 companion.companionId 不一致 → 拒绝', () => {
    const state = validV4State()
    state.companions['wrong_key'] = state.companions.sakura_yuko!
    delete state.companions.sakura_yuko
    state.party = { activeCompanionIds: ['wrong_key'] }
    expect(isValidSaveSlot(slotOf(state))).toBe(false)
  })

  it('relationships Record key 与 npcId 不一致 → 拒绝', () => {
    const state = validV4State()
    state.relationships['wrong_key'] = state.relationships.sakura_yuko!
    delete state.relationships.sakura_yuko
    expect(isValidSaveSlot(slotOf(state))).toBe(false)
  })
})

// ================= TM-P2-003-R2 D：V1 真实迁移 / v3 strict saveSlot / V2 multi-slot 导入 =================

describe('TM-P2-003-R2 D1：真正历史 V1 单档（无 learnedSkillIds）自动迁移', () => {
  it('真实 V1 legacy（player 无 learnedSkillIds）→ 迁移成功，slot1 补全职业技能 + 当前版本 + legacy key 删除', () => {
    const legacy = createInitialGameState()
    legacy.player.gold = 66
    // @ts-expect-error 模拟真正历史 V1（本就没有 learnedSkillIds 字段）
    delete legacy.player.learnedSkillIds
    localStorage.setItem(
      LEGACY_SAVE_KEY,
      JSON.stringify({ version: LEGACY_SAVE_VERSION, savedAt: '2026-01-01T00:00:00.000Z', gameState: legacy }),
    )
    expect(migrateLegacySave()).toBe(true)
    const slot = loadSlot('slot1')
    expect(slot?.version).toBe(SLOT_FORMAT_VERSION)
    expect(slot?.gameState.player.learnedSkillIds).toEqual(['knight_power_strike'])
    expect(slot?.gameState.player.gold).toBe(66)
    expect(slot?.gameState.world.restCount).toBe(0)
    expect(localStorage.getItem(LEGACY_SAVE_KEY)).toBeNull()
  })

  it('migrateSave 链上 V1 迁移同样补全（Step1 走 migrateLegacySave）', () => {
    const legacy = createInitialGameState()
    legacy.player.gold = 55
    legacy.player.profession = 'mage' as never
    // @ts-expect-error 模拟真正历史 V1
    delete legacy.player.learnedSkillIds
    localStorage.setItem(
      LEGACY_SAVE_KEY,
      JSON.stringify({ version: LEGACY_SAVE_VERSION, savedAt: '2026-01-01T00:00:00.000Z', gameState: legacy }),
    )
    expect(migrateSave()).toBe(true)
    expect(loadSlot('slot1')?.gameState.player.learnedSkillIds).toEqual(['mage_spell'])
  })
})

describe('TM-P2-003-R2 D2：saveSlot 只写当前 v3（防止写出读不回的档）', () => {
  it('gameState 缺 learnedSkillIds（宽松 isGameState 会放过）→ saveSlot 拒绝且槽位不变', () => {
    const state = stateWithGold(70)
    // @ts-expect-error 模拟异常运行态：learnedSkillIds 缺失
    delete state.player.learnedSkillIds
    expect(saveSlot('slot1', state)).toBe(false)
    expect(localStorage.getItem('tianmeng_continent_save_slot_slot1')).toBeNull()
    expect(loadSlot('slot1')).toBeNull()
  })

  it('learnedSkillIds 非字符串数组 → saveSlot 拒绝', () => {
    const state = stateWithGold(70)
    ;(state.player as { learnedSkillIds: unknown }).learnedSkillIds = [42]
    expect(saveSlot('slot1', state)).toBe(false)
    expect(loadSlot('slot1')).toBeNull()
  })

  it('正常 v3 状态仍可保存（回归）', () => {
    expect(saveSlot('slot1', stateWithGold(70))).toBe(true)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
  })
})

describe('TM-P2-003-R2 D3：V2 multi-slot 导出导入（含黄金兔冻结）', () => {
  const mkV2Slot = (gold: number, profession: string, savedAt = '2026-01-01T08:00:00.000Z') => {
    const state = stateWithGold(gold)
    state.player.profession = profession as never
    state.quests = [
      {
        questId: 'quest_golden_rabbit_search',
        status: 'in_progress',
        stage: 0,
        flags: {
          asked_blacksmith: true,
          asked_apothecary: true,
          village_inquiry_reported: true,
          rabbit_lair_rechecked: true,
        },
      },
    ]
    state.inventory = [{ itemId: 'rabbit_path', quantity: 1 }]
    // @ts-expect-error 模拟旧 V2 schema
    delete state.player.learnedSkillIds
    return { version: 2, savedAt, gameState: state }
  }
  const makeV2Export = () =>
    JSON.stringify({
      version: SAVE_VERSION,
      exportedAt: '2026-01-01T09:00:00.000Z',
      lastSavedSlot: 'slot3',
      slots: {
        slot1: mkV2Slot(111, 'knight'),
        slot2: null,
        slot3: mkV2Slot(333, 'mage', '2026-01-01T08:01:00.000Z'), // 更晚 savedAt → 重建索引时 slot3 为最新
        slot4: null,
        slot5: null,
      },
    })

  it('slot1/slot3 两槽迁移为当前版本；黄金兔四 flags 与 rabbit_path ×1 原封不动；lastSavedSlot=slot3', () => {
    expect(importSaves(makeV2Export())).toBe(true)
    const s1 = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1')!)
    expect(s1.version).toBe(SLOT_FORMAT_VERSION)
    expect(s1.gameState.player.learnedSkillIds).toEqual(['knight_power_strike'])
    expect(s1.gameState.player.gold).toBe(111)
    expect(s1.gameState.world.restCount).toBe(0)
    expect(s1.gameState.quests[0]).toMatchObject({
      questId: 'quest_golden_rabbit_search',
      status: 'in_progress',
      stage: 0,
      flags: {
        asked_blacksmith: true,
        asked_apothecary: true,
        village_inquiry_reported: true,
        rabbit_lair_rechecked: true,
      },
    })
    expect(s1.gameState.inventory).toEqual([{ itemId: 'rabbit_path', quantity: 1 }])
    const s3 = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot3')!)
    expect(s3.gameState.player.learnedSkillIds).toEqual(['mage_spell'])
    expect(loadIndex().lastSavedSlot).toBe('slot3')
  })

  it('V2 导入 index 写入失败 → 五槽与 index 完整回滚（含已迁移的 slot1/slot3）', () => {
    expect(saveSlot('slot1', stateWithGold(70))).toBe(true)
    expect(saveSlot('slot2', stateWithGold(80))).toBe(true)
    const before = SLOT_IDS.map((id) => localStorage.getItem(`tianmeng_continent_save_slot_${id}`)).join('|') + '||' + localStorage.getItem(SAVES_INDEX_KEY)
    failSetItemOn(SAVES_INDEX_KEY)
    expect(importSaves(makeV2Export())).toBe(false)
    expect(SLOT_IDS.map((id) => localStorage.getItem(`tianmeng_continent_save_slot_${id}`)).join('|') + '||' + localStorage.getItem(SAVES_INDEX_KEY)).toBe(before)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot2')?.gameState.player.gold).toBe(80)
    expect(loadSlot('slot3')).toBeNull()
  })

  it('V2 导入第 1 步（slot1）写入失败 → 完整回滚', () => {
    expect(saveSlot('slot1', stateWithGold(70))).toBe(true)
    const before = SLOT_IDS.map((id) => localStorage.getItem(`tianmeng_continent_save_slot_${id}`)).join('|') + '||' + localStorage.getItem(SAVES_INDEX_KEY)
    failSetItemOn('tianmeng_continent_save_slot_slot1')
    expect(importSaves(makeV2Export())).toBe(false)
    expect(SLOT_IDS.map((id) => localStorage.getItem(`tianmeng_continent_save_slot_${id}`)).join('|') + '||' + localStorage.getItem(SAVES_INDEX_KEY)).toBe(before)
    expect(loadSlot('slot1')?.gameState.player.gold).toBe(70)
    expect(loadSlot('slot3')).toBeNull()
  })
})
