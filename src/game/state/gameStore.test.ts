import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { createInitialGameState } from '../content/initial'

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
  useGameStore.setState({ gameState: createInitialGameState(), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const gold = () => useGameStore.getState().gameState?.player.gold
const inv = () => useGameStore.getState().gameState?.inventory

describe('金币操作', () => {
  it('增加金币正确', () => {
    expect(gold()).toBe(50)
    useGameStore.getState().addGold(10)
    expect(gold()).toBe(60)
  })

  it('扣除金币正确', () => {
    useGameStore.getState().removeGold(10)
    expect(gold()).toBe(40)
  })

  it('金币不能变成非法值（余额不足时扣到 0，不出现负数）', () => {
    useGameStore.getState().removeGold(9999)
    expect(gold()).toBe(0)
  })

  it('非法金额（负数/NaN）被忽略', () => {
    useGameStore.getState().addGold(-5)
    expect(gold()).toBe(50)
    useGameStore.getState().addGold(Number.NaN)
    expect(gold()).toBe(50)
  })
})

describe('背包操作', () => {
  it('添加已有物品时数量增加', () => {
    useGameStore.getState().addItem('healing_potion', 1)
    const entry = inv()?.find((e) => e.itemId === 'healing_potion')
    expect(entry?.quantity).toBe(3)
  })

  it('添加新物品时新增条目', () => {
    useGameStore.getState().addItem('test_artifact', 2)
    const entry = inv()?.find((e) => e.itemId === 'test_artifact')
    expect(entry?.quantity).toBe(2)
  })

  it('减少物品时数量减少', () => {
    useGameStore.getState().removeItem('healing_potion', 1)
    const entry = inv()?.find((e) => e.itemId === 'healing_potion')
    expect(entry?.quantity).toBe(1)
  })

  it('数量归零后条目被移除', () => {
    useGameStore.getState().removeItem('healing_potion', 2)
    expect(inv()?.find((e) => e.itemId === 'healing_potion')).toBeUndefined()
  })

  it('移除不存在的物品不影响背包', () => {
    const before = inv()?.length
    useGameStore.getState().removeItem('no_such_item', 1)
    expect(inv()?.length).toBe(before)
  })
})

describe('世界 Flag 操作', () => {
  it('能够设置世界 Flag', () => {
    useGameStore.getState().setFlag('test_flag', true)
    expect(useGameStore.getState().gameState?.world.flags['test_flag']).toBe(true)
  })

  it('能够读取世界 Flag', () => {
    useGameStore.getState().setFlag('meet_elder', 'done')
    const flags = useGameStore.getState().gameState?.world.flags
    expect(flags?.['meet_elder']).toBe('done')
  })

  it('不同 Flag 互不影响', () => {
    useGameStore.getState().setFlag('a', 1)
    useGameStore.getState().setFlag('b', false)
    const flags = useGameStore.getState().gameState?.world.flags
    expect(flags?.['a']).toBe(1)
    expect(flags?.['b']).toBe(false)
  })
})

describe('地点切换', () => {
  it('setCurrentLocation 更新当前位置', () => {
    useGameStore.getState().setCurrentLocation('misty_ruins')
    expect(useGameStore.getState().gameState?.world.currentLocationId).toBe('misty_ruins')
  })
})

describe('newGame 与状态完整性', () => {
  it('newGame 生成完整的 GameState 五件套', () => {
    useGameStore.getState().newGame()
    const gs = useGameStore.getState().gameState
    expect(gs).toBeDefined()
    expect(gs?.player).toBeDefined()
    expect(gs?.inventory).toBeDefined()
    expect(gs?.equipment).toBeDefined()
    expect(gs?.quests).toBeDefined()
    expect(gs?.world).toBeDefined()
    expect(gs?.player.name).toBe('石头城')
    expect(gs?.player.profession).toBe('knight')
  })
})

describe('TM-P0-001-R1：存档生命周期', () => {
  it('保存成功 → hasSave 为 true，loadGame 成功', () => {
    useGameStore.getState().saveGame()
    expect(useGameStore.getState().hasSave).toBe(true)
    expect(useGameStore.getState().loadGame()).toBe(true)
  })

  it('loadGame 在无有效存档时返回 false', () => {
    expect(useGameStore.getState().loadGame()).toBe(false)
  })

  it('storage 写入失败时 saveGame 返回 false 且不得把 hasSave 设为 true', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const ok = useGameStore.getState().saveGame()
    expect(ok).toBe(false)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  it('deleteGame 后 hasSave 为 false 且 loadGame 失败', () => {
    useGameStore.getState().saveGame()
    useGameStore.getState().deleteGame()
    expect(useGameStore.getState().hasSave).toBe(false)
    expect(useGameStore.getState().loadGame()).toBe(false)
  })
})

describe('TM-P0-001-R2：hasSave 与 storage 真实状态一致', () => {
  it('已有合法旧档，下一次写入失败：saveGame 返回 false 但 hasSave 保持 true，旧档仍可加载', () => {
    useGameStore.getState().saveGame()
    expect(useGameStore.getState().hasSave).toBe(true)

    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const ok = useGameStore.getState().saveGame()
    expect(ok).toBe(false)
    // R2：写入失败不得错误丢失旧存档的 hasSave=true
    expect(useGameStore.getState().hasSave).toBe(true)
    // 旧合法存档仍能加载
    expect(useGameStore.getState().loadGame()).toBe(true)
  })

  it('运行期间存档被改坏：loadGame 返回 false 并同步 hasSave=false', () => {
    useGameStore.getState().saveGame()
    expect(useGameStore.getState().hasSave).toBe(true)

    localStorage.setItem('tianmeng_continent_save', '{ broken')
    const ok = useGameStore.getState().loadGame()
    expect(ok).toBe(false)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-001-R3：Store 与持久化约束一致', () => {
  it('deleteGame 时 removeItem 抛错：旧档保留则 hasSave 保持 true', () => {
    useGameStore.getState().saveGame()
    expect(useGameStore.getState().hasSave).toBe(true)

    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    useGameStore.getState().deleteGame()
    // R3：删除失败，旧档仍在，不得错误宣称无存档
    expect(useGameStore.getState().hasSave).toBe(true)
    expect(useGameStore.getState().loadGame()).toBe(true)
  })

  it('addGold 拒绝非整数金额（与存档校验一致）', () => {
    useGameStore.getState().addGold(0.5)
    expect(useGameStore.getState().gameState?.player.gold).toBe(50)
    useGameStore.getState().addGold(5)
    expect(useGameStore.getState().gameState?.player.gold).toBe(55)
  })

  it('removeGold 拒绝非整数金额', () => {
    useGameStore.getState().removeGold(2.5)
    expect(useGameStore.getState().gameState?.player.gold).toBe(50)
    useGameStore.getState().removeGold(10)
    expect(useGameStore.getState().gameState?.player.gold).toBe(40)
  })
})
