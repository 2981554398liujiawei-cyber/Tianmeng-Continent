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

describe('TM-P0-001-R4：setFlag 拒绝非有限数字', () => {
  it("setFlag('x', NaN) 不改变 GameState", () => {
    const flagsBefore = useGameStore.getState().gameState?.world.flags
    useGameStore.getState().setFlag('x', Number.NaN)
    const flagsAfter = useGameStore.getState().gameState?.world.flags
    expect(flagsAfter).toEqual(flagsBefore)
    expect(flagsAfter?.['x']).toBeUndefined()
  })

  it("setFlag('x', Infinity) / setFlag('x', -Infinity) 不改变 GameState", () => {
    const flagsBefore = useGameStore.getState().gameState?.world.flags
    useGameStore.getState().setFlag('x', Number.POSITIVE_INFINITY)
    useGameStore.getState().setFlag('y', Number.NEGATIVE_INFINITY)
    expect(useGameStore.getState().gameState?.world.flags).toEqual(flagsBefore)
  })

  it('有限小数 Flag 可保存并读回（0.5 不被误伤）', () => {
    useGameStore.getState().setFlag('progress', 0.5)
    useGameStore.getState().saveGame()
    expect(useGameStore.getState().loadGame()).toBe(true)
    expect(useGameStore.getState().gameState?.world.flags.progress).toBe(0.5)
  })
})

describe('TM-P0-005：travelToLocation 正式移动入口', () => {
  const locationId = () => useGameStore.getState().gameState?.world.currentLocationId

  it('合法相邻移动：青石村 → 村外草原，更新并返回 true', () => {
    expect(locationId()).toBe('qingshi_village')
    expect(useGameStore.getState().travelToLocation('village_grassland')).toBe(true)
    expect(locationId()).toBe('village_grassland')
  })

  it('合法相邻移动：青石村 → 废弃矿洞', () => {
    expect(useGameStore.getState().travelToLocation('abandoned_mine')).toBe(true)
    expect(locationId()).toBe('abandoned_mine')
  })

  it('非相邻移动：青石村 → 兔王巢穴，位置不变返回 false', () => {
    expect(useGameStore.getState().travelToLocation('rabbit_lair')).toBe(false)
    expect(locationId()).toBe('qingshi_village')
  })

  it('锁定地点：村外草原 → 兔王巢穴（未解锁），位置不变返回 false', () => {
    useGameStore.getState().travelToLocation('village_grassland')
    expect(useGameStore.getState().travelToLocation('rabbit_lair')).toBe(false)
    expect(locationId()).toBe('village_grassland')
  })

  it('解锁后：村外草原 → 兔王巢穴成功', () => {
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().setFlag('rabbit_lair_unlocked', true)
    expect(useGameStore.getState().travelToLocation('rabbit_lair')).toBe(true)
    expect(locationId()).toBe('rabbit_lair')
    // 兔王巢穴可返回村外草原
    expect(useGameStore.getState().travelToLocation('village_grassland')).toBe(true)
  })

  it('无 gameState 时返回 false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().travelToLocation('village_grassland')).toBe(false)
  })

  it('移动不自动保存', () => {
    useGameStore.getState().travelToLocation('village_grassland')
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  it('非严格解锁值不生效：1 与 "true" 均无法进入兔王巢穴', () => {
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().setFlag('rabbit_lair_unlocked', 1)
    expect(useGameStore.getState().travelToLocation('rabbit_lair')).toBe(false)
    useGameStore.getState().setFlag('rabbit_lair_unlocked', 'true')
    expect(useGameStore.getState().travelToLocation('rabbit_lair')).toBe(false)
    expect(locationId()).toBe('village_grassland')
  })
})

describe('TM-P0-006：discoverQuest 任务发现', () => {
  const quests = () => useGameStore.getState().gameState?.quests

  it('初始 quests=[]，发现后创建 available QuestState（stage 0 / flags {}）', () => {
    expect(quests()).toEqual([])
    expect(useGameStore.getState().discoverQuest('quest_village_monsters')).toBe(true)
    const list = quests()
    expect(list).toHaveLength(1)
    expect(list?.[0]).toEqual({
      questId: 'quest_village_monsters',
      status: 'available',
      stage: 0,
      flags: {},
    })
  })

  it('重复发现返回 false 且不产生重复任务', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    expect(useGameStore.getState().discoverQuest('quest_village_monsters')).toBe(false)
    expect(quests()).toHaveLength(1)
  })

  it('显式 undiscovered 可被发现为 available', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        quests: [{ questId: 'quest_village_monsters', status: 'undiscovered', stage: 0, flags: {} }],
      },
    })
    expect(useGameStore.getState().discoverQuest('quest_village_monsters')).toBe(true)
    expect(quests()?.[0]?.status).toBe('available')
  })

  it('未知任务 ID 返回 false 且 quests 不变', () => {
    const before = JSON.stringify(quests())
    expect(useGameStore.getState().discoverQuest('not_exists')).toBe(false)
    expect(JSON.stringify(quests())).toBe(before)
  })
})

describe('TM-P0-006：任务状态转换', () => {
  const status = () => useGameStore.getState().gameState?.quests[0]?.status
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  beforeEach(() => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
  })

  it('acceptQuest：available → in_progress', () => {
    expect(useGameStore.getState().acceptQuest('quest_village_monsters')).toBe(true)
    expect(status()).toBe('in_progress')
  })

  it('禁止跳状态：available 时 completeQuest 返回 false 且状态不变', () => {
    const before = snapshot()
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(status()).toBe('available')
    expect(snapshot()).toBe(before)
  })

  it('markQuestCompletable：in_progress → completable', () => {
    useGameStore.getState().acceptQuest('quest_village_monsters')
    expect(useGameStore.getState().markQuestCompletable('quest_village_monsters')).toBe(true)
    expect(status()).toBe('completable')
  })

  it('completeQuest：completable → completed', () => {
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().markQuestCompletable('quest_village_monsters')
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(true)
    expect(status()).toBe('completed')
  })

  it('终态：completed 后 accept/fail/markCompletable/complete 全部 false', () => {
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().markQuestCompletable('quest_village_monsters')
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(useGameStore.getState().acceptQuest('quest_village_monsters')).toBe(false)
    expect(useGameStore.getState().failQuest('quest_village_monsters')).toBe(false)
    expect(useGameStore.getState().markQuestCompletable('quest_village_monsters')).toBe(false)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(status()).toBe('completed')
  })

  it('failQuest：in_progress → failed', () => {
    useGameStore.getState().acceptQuest('quest_village_monsters')
    expect(useGameStore.getState().failQuest('quest_village_monsters')).toBe(true)
    expect(status()).toBe('failed')
  })

  it('failQuest：completable → failed', () => {
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().markQuestCompletable('quest_village_monsters')
    expect(useGameStore.getState().failQuest('quest_village_monsters')).toBe(true)
    expect(status()).toBe('failed')
  })

  it('失败操作无副作用：player/inventory/equipment/world 均不变', () => {
    const before = snapshot()
    useGameStore.getState().completeQuest('quest_village_monsters') // available 时非法
    useGameStore.getState().failQuest('quest_village_monsters') // available 时非法
    expect(snapshot()).toBe(before)
  })

  it('任务状态修改不自动保存', () => {
    useGameStore.getState().acceptQuest('quest_village_monsters')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})
