import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialGameState } from '../content/initial'
import {
  LEGACY_SAVE_KEY,
  LEGACY_SAVE_VERSION,
  SAVE_VERSION,
  deleteSlot,
  exportSaves,
  hasAnySave,
  importSaves,
  loadIndex,
  loadMostRecentSave,
  loadSlot,
  migrateLegacySave,
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

  it('五个槽位摘要正确（空槽 null）', () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot3', stateWithGold(80))
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

  it('删除最近槽后最近存档回退到其他有效槽', () => {
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot2', stateWithGold(80))
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
    saveSlot('slot1', stateWithGold(70))
    saveSlot('slot3', stateWithGold(80))
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
