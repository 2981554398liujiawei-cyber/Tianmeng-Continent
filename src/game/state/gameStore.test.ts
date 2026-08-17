import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { createInitialGameState } from '../content/initial'
import { checkTravel } from '../rules/exploration'

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

describe('TM-P0-008：damagePlayer 战斗伤害', () => {
  const hp = () => useGameStore.getState().gameState?.player.hp

  it('HP 22 受到 2 点伤害 → HP 20 返回 true', () => {
    expect(hp()).toBe(22)
    expect(useGameStore.getState().damagePlayer(2)).toBe(true)
    expect(hp()).toBe(20)
  })

  it('HP 2 受到 5 点伤害 → HP 0（不出现负数）', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 2 },
      },
    })
    expect(useGameStore.getState().damagePlayer(5)).toBe(true)
    expect(hp()).toBe(0)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('非法伤害 %p → false 且 HP 不变', (amount) => {
    const before = hp()
    expect(useGameStore.getState().damagePlayer(amount as number)).toBe(false)
    expect(hp()).toBe(before)
  })

  it('无 gameState 时返回 false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().damagePlayer(2)).toBe(false)
  })
})

describe('TM-P0-009：resolveCombatVictory 战斗胜利推进任务', () => {
  const questStatus = () =>
    useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_village_monsters')?.status ??
    'undiscovered'
  const acceptQuest = () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
  }
  const travelGrassland = () => useGameStore.getState().travelToLocation('village_grassland')

  it('合法推进：接受任务 → 村外草原 → 击败魔化兔 → completable', () => {
    acceptQuest()
    expect(travelGrassland()).toBe(true)
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(true)
    expect(questStatus()).toBe('completable')
  })

  it('未接受任务：quests=[] 时击败魔化兔 → 返回 true 且 quests 仍 []（不自动发现）', () => {
    travelGrassland()
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(true)
    expect(useGameStore.getState().gameState?.quests).toEqual([])
  })

  it('available 不会被战斗跳过：发现但未接受 → 击败魔化兔 → available 不变', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    travelGrassland()
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(true)
    expect(questStatus()).toBe('available')
  })

  it('错误敌人：in_progress 时在废弃矿洞击败魔化鼠 → 任务仍 in_progress', () => {
    acceptQuest()
    useGameStore.getState().travelToLocation('abandoned_mine')
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(questStatus()).toBe('in_progress')
  })

  it('错误地点/伪造胜利：在青石村调用魔化兔胜利 → false 且 GameState 完全不变', () => {
    acceptQuest()
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('未知敌人 → false 且 GameState 不变', () => {
    acceptQuest()
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().resolveCombatVictory('fake_enemy')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('已完成终态：completed 后再击败魔化兔 → 仍 completed 不回退', () => {
    acceptQuest()
    travelGrassland()
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(questStatus()).toBe('completed')
    travelGrassland()
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(true)
    expect(questStatus()).toBe('completed')
  })

  it('无奖励副作用：推进成功后除 quest.status 外 player/inventory/world 全部不变', () => {
    acceptQuest()
    travelGrassland()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.world).toEqual(before.world)
    expect(after.quests[0]?.status).toBe('completable')
  })

  it('不自动保存：内存推进后 hasSave 仍 false', () => {
    acceptQuest()
    travelGrassland()
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    expect(questStatus()).toBe('completable')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-010：useHealingPotion 治疗药水', () => {
  const player = () => useGameStore.getState().gameState!.player
  const potionQty = () =>
    useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'healing_potion')?.quantity ?? 0

  it('正常治疗：HP 10/22 药水×2 → true，HP 18，药水×1', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 10 },
      },
    })
    expect(useGameStore.getState().useHealingPotion()).toBe(true)
    expect(player().hp).toBe(18)
    expect(potionQty()).toBe(1)
  })

  it('上限截断：HP 20/22 → HP 22（不超过 maxHp），药水×1', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 20 },
      },
    })
    expect(useGameStore.getState().useHealingPotion()).toBe(true)
    expect(player().hp).toBe(22)
    expect(potionQty()).toBe(1)
  })

  it('满血不浪费：HP 22/22 → false，HP 与药水不变', () => {
    const before = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().useHealingPotion()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(before)
  })

  it('HP 0 不允许复活：→ false，HP 与药水不变', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 0 },
      },
    })
    const before = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().useHealingPotion()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(before)
  })

  it('无药水：背包无 healing_potion → false，GameState 完全不变', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 10 },
        inventory: useGameStore.getState().gameState!.inventory.filter((e) => e.itemId !== 'healing_potion'),
      },
    })
    const before = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().useHealingPotion()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(before)
  })

  it('最后一瓶：药水×1 成功使用后 inventory 移除该条目', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 10 },
        inventory: [{ itemId: 'healing_potion', quantity: 1 }],
      },
    })
    expect(useGameStore.getState().useHealingPotion()).toBe(true)
    expect(player().hp).toBe(18)
    expect(useGameStore.getState().gameState?.inventory.some((e) => e.itemId === 'healing_potion')).toBe(false)
  })

  it('无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().useHealingPotion()).toBe(false)
  })

  it('不自动保存：使用成功后 hasSave 仍 false', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 10 },
      },
    })
    expect(useGameStore.getState().useHealingPotion()).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-011：完成《村外异动》解锁兔王巢穴', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const questStatus = () =>
    useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_village_monsters')?.status ??
    'undiscovered'
  const toCompletable = () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
  }

  it('A. 正常完成解锁：completable → completed 且 rabbit_lair_unlocked === true', () => {
    toCompletable()
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(true)
    expect(questStatus()).toBe('completed')
    expect(flags()?.rabbit_lair_unlocked).toBe(true)
  })

  it('B. in_progress 不得提前解锁', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(questStatus()).toBe('in_progress')
    expect(flags()?.rabbit_lair_unlocked).toBeUndefined()
  })

  it('C. available 不得解锁', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(questStatus()).toBe('available')
    expect(flags()?.rabbit_lair_unlocked).toBeUndefined()
  })

  it('D. failed 不得解锁', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().failQuest('quest_village_monsters')
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(questStatus()).toBe('failed')
    expect(flags()?.rabbit_lair_unlocked).toBeUndefined()
  })

  it('E. 其他 world.flags 完整保留', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          flags: { existing_flag: true, number_flag: 3 },
        },
      },
    })
    toCompletable()
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(flags()).toEqual({ existing_flag: true, number_flag: 3, rabbit_lair_unlocked: true })
  })

  it('F. 已有 false 被正式完成覆盖为 true', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          flags: { rabbit_lair_unlocked: false },
        },
      },
    })
    toCompletable()
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(flags()?.rabbit_lair_unlocked).toBe(true)
  })

  it('G. 无奖励副作用：除 quest.status 与解锁 flag 外 player/inventory/equipment/currentLocationId/completedEvents/npcStates 全不变', () => {
    toCompletable()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().completeQuest('quest_village_monsters')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.world.currentLocationId).toBe(before.world.currentLocationId)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    expect(after.world.npcStates).toEqual(before.world.npcStates)
    expect(after.quests[0]?.status).toBe('completed')
  })

  it('探索联动：完成前 required_flag_missing，完成后 allowed=true（任务 Flag 被既有探索规则消费）', () => {
    const before = useGameStore.getState().gameState!.world
    expect(checkTravel('village_grassland', 'rabbit_lair', before.flags).reason).toBe('required_flag_missing')
    toCompletable()
    useGameStore.getState().completeQuest('quest_village_monsters')
    const after = useGameStore.getState().gameState!.world
    expect(checkTravel('village_grassland', 'rabbit_lair', after.flags).allowed).toBe(true)
    // 实际移动也走既有 travelToLocation
    useGameStore.getState().travelToLocation('village_grassland')
    expect(useGameStore.getState().travelToLocation('rabbit_lair')).toBe(true)
  })

  it('不自动保存：完成任务并解锁后 hasSave 仍 false', () => {
    toCompletable()
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(flags()?.rabbit_lair_unlocked).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})
