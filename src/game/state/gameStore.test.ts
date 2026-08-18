import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, VILLAGE_ELDER_POST_QUEST_EVENT_ID } from './gameStore'
import { createInitialGameState } from '../content/initial'
import { checkTravel } from '../rules/exploration'
import { getNpc, getQuest } from '../content'

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

  it('G. 无奖励副作用：除 quest.status 与解锁 flag 与金币奖励外 player/inventory/equipment/currentLocationId/completedEvents/npcStates 全不变', () => {
    toCompletable()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().completeQuest('quest_village_monsters')
    const after = useGameStore.getState().gameState!
    // TM-P0-018：完成《村外异动》现在有固定 20 金币奖励，player 仅 gold 变化
    expect(after.player).toEqual({ ...before.player, gold: before.player.gold + 20 })
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.world.currentLocationId).toBe(before.world.currentLocationId)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    // TM-P1-002：完成《村外异动》现会懒创建 village_elder NpcState（信任 +1）；除此无其他 NPC 状态变化
    expect(after.world.npcStates.village_elder?.relationship.trust).toBe(1)
    expect(Object.keys(after.world.npcStates)).toEqual(['village_elder'])
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

describe('TM-P0-012：击败嘟嘟兔获得唯一《兔子的路径》', () => {
  const hasPath = () =>
    useGameStore.getState().gameState?.inventory.filter((e) => e.itemId === 'rabbit_path') ?? []
  const pathQty = () => {
    const entries = hasPath()
    return entries.length === 0 ? 0 : entries.reduce((sum, e) => sum + (e.quantity ?? 0), 0)
  }
  const atRabbitLair = () => useGameStore.getState().travelToLocation('rabbit_lair')

  it('A. 正常 Boss 胜利：兔王巢穴击败嘟嘟兔 → true 且 rabbit_path ×1', () => {
    // 先完成《村外异动》解锁巢穴（正式流程路径）
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    // 青石村 → 村外草原 → 兔王巢穴（经既有探索规则）
    useGameStore.getState().travelToLocation('village_grassland')
    expect(atRabbitLair()).toBe(true)
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(true)
    expect(pathQty()).toBe(1)
  })

  it('B. 重复 Boss 胜利不复制：再次击败仍 ×1 且仅一条 entry', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: [...useGameStore.getState().gameState!.inventory, { itemId: 'rabbit_path', quantity: 1 }],
        world: { ...useGameStore.getState().gameState!.world, currentLocationId: 'rabbit_lair' },
      },
    })
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(true)
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(true)
    expect(hasPath()).toHaveLength(1)
    expect(pathQty()).toBe(1)
  })

  it('C. 预先已有 ×1：Boss 胜利后保持 ×1', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: [...useGameStore.getState().gameState!.inventory, { itemId: 'rabbit_path', quantity: 1 }],
        world: { ...useGameStore.getState().gameState!.world, currentLocationId: 'rabbit_lair' },
      },
    })
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(true)
    expect(pathQty()).toBe(1)
  })

  it('D. 错误地点伪造 Boss 胜利：village_grassland → false 且 GameState 完全不变', () => {
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(pathQty()).toBe(0)
  })

  it('E. 其他敌人无奖励：废弃矿洞击败魔化鼠 → true 且 rabbit_path 不存在', () => {
    useGameStore.getState().travelToLocation('abandoned_mine')
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(pathQty()).toBe(0)
  })

  it('F. 魔化兔任务推进零回归：in_progress + 村外草原 + 魔化兔胜利 → completable 且无 rabbit_path', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(true)
    expect(
      useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_village_monsters')?.status,
    ).toBe('completable')
    expect(pathQty()).toBe(0)
  })

  it('G. 无额外副作用：Boss 胜利除 inventory 新增 rabbit_path 外 player/equipment/quests/world 全不变', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: { ...useGameStore.getState().gameState!.world, currentLocationId: 'rabbit_lair' },
      },
    })
    const before = useGameStore.getState().gameState!
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(true)
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world).toEqual(before.world)
    expect(after.inventory).toEqual([...before.inventory, { itemId: 'rabbit_path', quantity: 1 }])
    expect(before.player.gold).toBe(after.player.gold)
  })

  it('不自动保存：获得藏宝图后 hasSave 仍 false', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: { ...useGameStore.getState().gameState!.world, currentLocationId: 'rabbit_lair' },
      },
    })
    useGameStore.getState().resolveCombatVictory('dudu_rabbit')
    expect(pathQty()).toBe(1)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-013：equipWeapon / unequipWeapon 装备铁剑', () => {
  const weapon = () => useGameStore.getState().gameState?.equipment.weapon
  const swordQty = () =>
    useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'iron_sword')?.quantity ?? 0

  it('正常装备：iron_sword ×1 → true，weapon=iron_sword，inventory 仍 ×1', () => {
    expect(weapon()).toBeNull()
    expect(useGameStore.getState().equipWeapon('iron_sword')).toBe(true)
    expect(weapon()).toBe('iron_sword')
    expect(swordQty()).toBe(1)
  })

  it('非武器：治疗药水 → false，equipment 不变', () => {
    const snapshot = JSON.stringify(useGameStore.getState().gameState?.equipment)
    expect(useGameStore.getState().equipWeapon('healing_potion')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState?.equipment)).toBe(snapshot)
  })

  it('未知物品 → false，GameState 完全不变', () => {
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().equipWeapon('fake_item')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('未拥有武器：移除铁剑后 → false', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: useGameStore.getState().gameState!.inventory.filter((e) => e.itemId !== 'iron_sword'),
      },
    })
    expect(useGameStore.getState().equipWeapon('iron_sword')).toBe(false)
    expect(weapon()).toBeNull()
  })

  it('卸下：weapon=iron_sword → true，weapon=null，inventory 仍 ×1', () => {
    useGameStore.getState().equipWeapon('iron_sword')
    expect(useGameStore.getState().unequipWeapon()).toBe(true)
    expect(weapon()).toBeNull()
    expect(swordQty()).toBe(1)
  })

  it('重复卸下：weapon=null → false', () => {
    expect(useGameStore.getState().unequipWeapon()).toBe(false)
    expect(weapon()).toBeNull()
  })

  it('无 gameState：两操作均 false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().equipWeapon('iron_sword')).toBe(false)
    expect(useGameStore.getState().unequipWeapon()).toBe(false)
  })

  it('不自动保存：成功装备后 hasSave 仍 false', () => {
    useGameStore.getState().equipWeapon('iron_sword')
    expect(weapon()).toBe('iron_sword')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-014：buyHealingPotion 药师商店', () => {
  const gold = () => useGameStore.getState().gameState?.player.gold
  const potionQty = () =>
    useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'healing_potion')?.quantity ?? 0

  it('A. 正常购买：青石村 gold 50 药水×2 → true，gold 40，药水×3', () => {
    expect(gold()).toBe(50)
    expect(potionQty()).toBe(2)
    expect(useGameStore.getState().buyHealingPotion()).toBe(true)
    expect(gold()).toBe(40)
    expect(potionQty()).toBe(3)
  })

  it('B. 无药水条目：inventory 无 healing_potion → true，gold 40，新增 ×1', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: useGameStore.getState().gameState!.inventory.filter((e) => e.itemId !== 'healing_potion'),
      },
    })
    expect(useGameStore.getState().buyHealingPotion()).toBe(true)
    expect(gold()).toBe(40)
    expect(potionQty()).toBe(1)
  })

  it('C. 金币恰好够：gold 10 → true，gold 0，药水 +1', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, gold: 10 },
      },
    })
    expect(useGameStore.getState().buyHealingPotion()).toBe(true)
    expect(gold()).toBe(0)
    expect(potionQty()).toBe(3)
  })

  it('D. 金币不足：gold 9 → false，GameState 完全不变', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, gold: 9 },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().buyHealingPotion()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('E. 错误地点：village_grassland → false，GameState 完全不变', () => {
    useGameStore.getState().travelToLocation('village_grassland')
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().buyHealingPotion()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('F. 无 GameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().buyHealingPotion()).toBe(false)
  })

  it('G. 交易不治疗：HP 10/22 购买后仍 10', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: 10 },
      },
    })
    useGameStore.getState().buyHealingPotion()
    expect(useGameStore.getState().gameState?.player.hp).toBe(10)
  })

  it('H. 不自动保存：成功购买后 hasSave 仍 false', () => {
    useGameStore.getState().buyHealingPotion()
    expect(gold()).toBe(40)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  it('I. 数量安全边界：药水数量 MAX_SAFE_INTEGER → false，金币与 inventory 均不变', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: [{ itemId: 'healing_potion', quantity: Number.MAX_SAFE_INTEGER }],
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().buyHealingPotion()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })
})

describe('TM-P0-016：investigateAbandonedMine 矿洞调查', () => {
  const flag = () => useGameStore.getState().gameState?.world.flags.abandoned_mine_investigation
  const atMine = () => useGameStore.getState().travelToLocation('abandoned_mine')

  /** 固定下一次 D20 骰面（roll 为 1–20） */
  const mockRoll = (roll: number) => {
    vi.spyOn(Math, 'random').mockReturnValue((roll - 1) / 20)
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('A. 成功检定：MND8 修正 -1，骰13 → total 12，success，flag=success', () => {
    atMine()
    mockRoll(13)
    const result = useGameStore.getState().investigateAbandonedMine()
    expect(result).not.toBeNull()
    expect(result!.roll).toBe(13)
    expect(result!.total).toBe(12)
    expect(result!.success).toBe(true)
    expect(result!.dc).toBe(12)
    expect(flag()).toBe('success')
  })

  it('B. 失败检定：骰12 → total 11，flag=failure', () => {
    atMine()
    mockRoll(12)
    const result = useGameStore.getState().investigateAbandonedMine()
    expect(result).not.toBeNull()
    expect(result!.total).toBe(11)
    expect(result!.success).toBe(false)
    expect(flag()).toBe('failure')
  })

  it('C. 天然20 → critical_success，flag=success', () => {
    atMine()
    mockRoll(20)
    const result = useGameStore.getState().investigateAbandonedMine()
    expect(result!.outcome).toBe('critical_success')
    expect(flag()).toBe('success')
  })

  it('D. 天然1 → critical_failure，flag=failure', () => {
    atMine()
    mockRoll(1)
    const result = useGameStore.getState().investigateAbandonedMine()
    expect(result!.outcome).toBe('critical_failure')
    expect(flag()).toBe('failure')
  })

  it('E. 错误地点：青石村调用 → null，GameState 完全不变', () => {
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().investigateAbandonedMine()).toBeNull()
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('F. 已调查禁止重掷：第二次 → null，flag 不变，且不再调用随机数', () => {
    atMine()
    const spy = vi.spyOn(Math, 'random').mockReturnValue((13 - 1) / 20)
    useGameStore.getState().investigateAbandonedMine()
    expect(flag()).toBe('success')
    expect(spy).toHaveBeenCalledTimes(1)
    const second = useGameStore.getState().investigateAbandonedMine()
    expect(second).toBeNull()
    expect(flag()).toBe('success')
    expect(spy).toHaveBeenCalledTimes(1) // 第二次未再调用随机数
  })

  it('G. 非法角色数据安全：level=0 → 不抛异常，return null，GameState 不变', () => {
    atMine()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, level: 0 },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(() => useGameStore.getState().investigateAbandonedMine()).not.toThrow()
    expect(useGameStore.getState().investigateAbandonedMine()).toBeNull()
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('H. 无副作用：除调查 Flag 外 player/inventory/equipment/quests/currentLocationId/completedEvents/npcStates/其他 flags 全不变', () => {
    atMine()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          flags: { existing_flag: true },
        },
      },
    })
    const before = useGameStore.getState().gameState!
    mockRoll(13)
    useGameStore.getState().investigateAbandonedMine()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world.currentLocationId).toBe(before.world.currentLocationId)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    expect(after.world.npcStates).toEqual(before.world.npcStates)
    expect(after.world.flags).toEqual({ existing_flag: true, abandoned_mine_investigation: 'success' })
  })

  it('I. 不自动保存：调查后 hasSave 仍 false', () => {
    atMine()
    mockRoll(13)
    useGameStore.getState().investigateAbandonedMine()
    expect(flag()).toBe('success')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-018：《村外异动》固定金币奖励', () => {
  const gold = () => useGameStore.getState().gameState?.player.gold
  const questStatus = () =>
    useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_village_monsters')?.status ??
    'undiscovered'
  const lairFlag = () => useGameStore.getState().gameState?.world.flags.rabbit_lair_unlocked
  const toCompletable = () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
  }

  it('A. 正常奖励：completable gold 50 → true，completed，gold 70，rabbit_lair_unlocked true（同一次原子更新）', () => {
    toCompletable()
    expect(questStatus()).toBe('completable')
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(true)
    expect(questStatus()).toBe('completed')
    expect(gold()).toBe(70)
    expect(lairFlag()).toBe(true)
  })

  it('B. 不可完成状态不奖励：in_progress → false，gold 不变，flag 不变', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('C. 重复完成不重复奖励：第一次 gold 70，第二次 false 且仍 70', () => {
    toCompletable()
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(gold()).toBe(70)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(gold()).toBe(70)
  })

  it('D. 已完成旧状态不补发：status=completed gold 50 → false 且 gold 仍 50', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        quests: [{ questId: 'quest_village_monsters', status: 'completed' as const, stage: 0, flags: {} }],
        player: { ...useGameStore.getState().gameState!.player, gold: 50 },
      },
    })
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(gold()).toBe(50)
  })

  it('E. 金币安全溢出：gold + 20 超安全整数 → false，GameState 完全不变（任务仍 completable）', () => {
    toCompletable()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, gold: Number.MAX_SAFE_INTEGER },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(questStatus()).toBe('completable')
  })

  it('F. 无额外副作用：除 quest.status/player.gold/world.flags.rabbit_lair_unlocked 外全不变', () => {
    toCompletable()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().completeQuest('quest_village_monsters')
    const after = useGameStore.getState().gameState!
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.player.hp).toBe(before.player.hp)
    expect(after.player.mp).toBe(before.player.mp)
    expect(after.player.level).toBe(before.player.level)
    expect(after.player.attributes).toEqual(before.player.attributes)
    expect(after.world.currentLocationId).toBe(before.world.currentLocationId)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    // TM-P1-002：完成《村外异动》会懒创建 village_elder NpcState（信任 +1）；无其他 NPC 状态变化
    expect(after.world.npcStates.village_elder?.relationship.trust).toBe(1)
    expect(Object.keys(after.world.npcStates)).toEqual(['village_elder'])
    // 其他 flags 不变，仅新增 rabbit_lair_unlocked
    expect(after.world.flags).toEqual({ ...before.world.flags, rabbit_lair_unlocked: true })
    // 不发 rabbit_path
    expect(after.inventory.some((e) => e.itemId === 'rabbit_path')).toBe(false)
  })

  it('G. 不自动保存：成功完成后 hasSave 仍 false', () => {
    toCompletable()
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(gold()).toBe(70)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-020：魔化鼠掉落铁矿石', () => {
  const oreEntries = () =>
    useGameStore.getState().gameState?.inventory.filter((e) => e.itemId === 'iron_ore') ?? []
  const oreQty = () => {
    const entries = oreEntries()
    return entries.length === 0 ? 0 : entries.reduce((sum, e) => sum + (e.quantity ?? 0), 0)
  }
  const atMine = () => useGameStore.getState().travelToLocation('abandoned_mine')

  it('A. 首次合法胜利：废弃矿洞背包无 iron_ore → true，铁矿石 ×1', () => {
    atMine()
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(oreQty()).toBe(1)
  })

  it('B. 第二次合法胜利堆叠：已有 ×1 再胜利 → true，×2 且仅一条 entry', () => {
    atMine()
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(oreQty()).toBe(2)
    expect(oreEntries()).toHaveLength(1)
  })

  it('C. 错误地点伪造：青石村 → false，GameState 完全不变', () => {
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('D. 未知敌人 → false，GameState 完全不变', () => {
    atMine()
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().resolveCombatVictory('fake_enemy')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('E. 魔化兔零回归：村外草原击败魔化兔推进任务且不掉 iron_ore', () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(true)
    expect(
      useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_village_monsters')?.status,
    ).toBe('completable')
    expect(oreQty()).toBe(0)
  })

  it('F. 嘟嘟兔零回归：兔王巢穴击败嘟嘟兔 → rabbit_path ×1 且不掉 iron_ore', () => {
    // 解锁巢穴后进入
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().travelToLocation('rabbit_lair')
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(true)
    expect(
      useGameStore.getState().gameState?.inventory.some((e) => e.itemId === 'rabbit_path' && e.quantity === 1),
    ).toBe(true)
    expect(oreQty()).toBe(0)
  })

  it('G. 数量安全边界：iron_ore × MAX_SAFE_INTEGER → 合法胜利 true 但 inventory 不变', () => {
    atMine()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: [{ itemId: 'iron_ore', quantity: Number.MAX_SAFE_INTEGER }],
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('H. 无其他副作用：首次掉落除 inventory 新增 iron_ore ×1 外 player/equipment/quests/world 全不变', () => {
    atMine()
    const before = useGameStore.getState().gameState!
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world).toEqual(before.world)
    expect(after.inventory).toEqual([...before.inventory, { itemId: 'iron_ore', quantity: 1 }])
  })

  it('I. 不自动保存：魔化鼠胜利获得铁矿石后 hasSave 仍 false', () => {
    atMine()
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(oreQty()).toBe(1)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-021：sellIronOre 铁匠收购', () => {
  const gold = () => useGameStore.getState().gameState?.player.gold
  const oreQty = () =>
    useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'iron_ore')?.quantity ?? 0
  const hasOreEntry = () =>
    useGameStore.getState().gameState?.inventory.some((e) => e.itemId === 'iron_ore') ?? false

  const giveOre = (n: number) => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: [...useGameStore.getState().gameState!.inventory, { itemId: 'iron_ore', quantity: n }],
      },
    })
  }

  it('A. 正常出售：青石村 gold 50 铁矿石×2 → true，gold 55，×1', () => {
    giveOre(2)
    expect(useGameStore.getState().sellIronOre()).toBe(true)
    expect(gold()).toBe(55)
    expect(oreQty()).toBe(1)
  })

  it('B. 出售最后一个：×1 → true，gold 55，iron_ore entry 删除', () => {
    giveOre(1)
    expect(useGameStore.getState().sellIronOre()).toBe(true)
    expect(gold()).toBe(55)
    expect(hasOreEntry()).toBe(false)
  })

  it('C. 无铁矿石 → false，GameState 完全不变', () => {
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().sellIronOre()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('D. 错误地点：abandoned_mine 拥有铁矿石 → false，GameState 完全不变', () => {
    useGameStore.getState().travelToLocation('abandoned_mine')
    giveOre(1)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().sellIronOre()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('E. 无 GameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().sellIronOre()).toBe(false)
  })

  it('F. 金币溢出：gold=MAX_SAFE_INTEGER → false，GameState 完全不变', () => {
    giveOre(1)
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, gold: Number.MAX_SAFE_INTEGER },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().sellIronOre()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('G. 异常 quantity：0 / 非安全整数 → false，GameState 完全不变', () => {
    // quantity 0
    giveOre(0)
    const s0 = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().sellIronOre()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(s0)
    // 非安全整数（MAX_SAFE_INTEGER + 1 为不安全整数）
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: useGameStore.getState().gameState!.inventory.filter((e) => e.itemId !== 'iron_ore'),
      },
    })
    giveOre(Number.MAX_SAFE_INTEGER + 1)
    const s1 = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().sellIronOre()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(s1)
  })

  it('H. 原子副作用边界：除 player.gold 与 inventory.iron_ore 外 equipment/quests/world/hp/mp/level/attributes 全不变', () => {
    giveOre(2)
    const before = useGameStore.getState().gameState!
    useGameStore.getState().sellIronOre()
    const after = useGameStore.getState().gameState!
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world).toEqual(before.world)
    expect(after.player.hp).toBe(before.player.hp)
    expect(after.player.mp).toBe(before.player.mp)
    expect(after.player.level).toBe(before.player.level)
    expect(after.player.attributes).toEqual(before.player.attributes)
    expect(after.player.gold).toBe(before.player.gold + 5)
    // 铁剑装备不受影响（equipment 未变）
    expect(after.inventory.filter((e) => e.itemId === 'iron_ore')).toHaveLength(1)
  })

  it('I. 不自动保存：成功出售后 hasSave 仍 false', () => {
    giveOre(1)
    useGameStore.getState().sellIronOre()
    expect(gold()).toBe(55)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-022：restAtVillage 青石村休整', () => {
  const hp = () => useGameStore.getState().gameState?.player.hp
  const mp = () => useGameStore.getState().gameState?.player.mp
  const setVitals = (h: number, m: number) => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, hp: h, mp: m },
      },
    })
  }

  it('A. 正常受伤休整：青石村 HP10/22 MP6/6 → true，HP 22，MP 6', () => {
    setVitals(10, 6)
    expect(useGameStore.getState().restAtVillage()).toBe(true)
    expect(hp()).toBe(22)
    expect(mp()).toBe(6)
  })

  it('B. MP 不满：HP22/22 MP2/6 → true，HP 22，MP 6', () => {
    setVitals(22, 2)
    expect(useGameStore.getState().restAtVillage()).toBe(true)
    expect(hp()).toBe(22)
    expect(mp()).toBe(6)
  })

  it('C. HP0 恢复（战败软锁出口）：HP0/22 MP6/6 → true，HP 22', () => {
    setVitals(0, 6)
    expect(useGameStore.getState().restAtVillage()).toBe(true)
    expect(hp()).toBe(22)
  })

  it('D. HP/MP 都不满：HP5 MP1 → true，两项同时恢复最大值', () => {
    setVitals(5, 1)
    expect(useGameStore.getState().restAtVillage()).toBe(true)
    expect(hp()).toBe(22)
    expect(mp()).toBe(6)
  })

  it('E. 已全满：HP22 MP6 → false，GameState 完全不变', () => {
    setVitals(22, 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().restAtVillage()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('F. 错误地点：abandoned_mine HP10 → false，GameState 完全不变', () => {
    useGameStore.getState().travelToLocation('abandoned_mine')
    setVitals(10, 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().restAtVillage()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('G. 无 GameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().restAtVillage()).toBe(false)
  })

  it('H. 无额外副作用：成功休整除 player.hp/mp 外 gold/level/profession/attributes/inventory/equipment/quests/world 全不变', () => {
    setVitals(10, 2)
    const before = useGameStore.getState().gameState!
    useGameStore.getState().restAtVillage()
    const after = useGameStore.getState().gameState!
    expect(after.player.gold).toBe(before.player.gold)
    expect(after.player.level).toBe(before.player.level)
    expect(after.player.profession).toBe(before.player.profession)
    expect(after.player.attributes).toEqual(before.player.attributes)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world).toEqual(before.world)
  })

  it('I. 不自动保存：成功休整后 hasSave 仍 false', () => {
    setVitals(10, 6)
    useGameStore.getState().restAtVillage()
    expect(hp()).toBe(22)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  it('J. 药水 HP0 规则零回归：HP0 时 useHealingPotion 仍 false（休整是独立入口）', () => {
    setVitals(0, 6)
    expect(useGameStore.getState().useHealingPotion()).toBe(false)
    expect(hp()).toBe(0)
    // 休整可以恢复（独立入口）
    expect(useGameStore.getState().restAtVillage()).toBe(true)
    expect(hp()).toBe(22)
  })
})

describe('TM-P1-001：spendMageSpellMp 法师法术灵力消费', () => {
  const mp = () => useGameStore.getState().gameState?.player.mp
  const setProfession = (p: string) => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, profession: p as never },
      },
    })
  }
  const setMp = (m: number) => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        player: { ...useGameStore.getState().gameState!.player, mp: m },
      },
    })
  }

  it('A. 正常消费：mage MP6 → true，MP4', () => {
    setProfession('mage')
    setMp(6)
    expect(useGameStore.getState().spendMageSpellMp()).toBe(true)
    expect(mp()).toBe(4)
  })

  it('B. 刚好够：MP2 → true，MP0', () => {
    setProfession('mage')
    setMp(2)
    expect(useGameStore.getState().spendMageSpellMp()).toBe(true)
    expect(mp()).toBe(0)
  })

  it('C. 灵力不足：MP1 → false，GameState 完全不变', () => {
    setProfession('mage')
    setMp(1)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendMageSpellMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('D. 非法职业：knight MP6 → false，GameState 完全不变', () => {
    setProfession('knight')
    setMp(6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendMageSpellMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('E. 无 GameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().spendMageSpellMp()).toBe(false)
  })

  it('F. 非法 MP：mp=-1 与 mp>maxMp → false，GameState 不变', () => {
    setProfession('mage')
    // mp = -1
    setMp(-1)
    const s0 = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendMageSpellMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(s0)
    // mp 越界（> maxMp=6）
    setMp(7)
    const s1 = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendMageSpellMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(s1)
  })

  it('G. 无额外副作用：正常扣除前后除 player.mp 外 player 其他字段/inventory/equipment/quests/world 全不变', () => {
    setProfession('mage')
    setMp(6)
    const before = useGameStore.getState().gameState!
    useGameStore.getState().spendMageSpellMp()
    const after = useGameStore.getState().gameState!
    expect(after.player.hp).toBe(before.player.hp)
    expect(after.player.maxHp).toBe(before.player.maxHp)
    expect(after.player.maxMp).toBe(before.player.maxMp)
    expect(after.player.gold).toBe(before.player.gold)
    expect(after.player.level).toBe(before.player.level)
    expect(after.player.profession).toBe(before.player.profession)
    expect(after.player.attributes).toEqual(before.player.attributes)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world).toEqual(before.world)
    expect(after.player.mp).toBe(before.player.mp - 2)
  })

  it('H. 不自动保存：成功消费后 hasSave 仍 false', () => {
    setProfession('mage')
    setMp(6)
    useGameStore.getState().spendMageSpellMp()
    expect(mp()).toBe(4)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-002：《村外异动》完成村长信任 +1', () => {
  const elderState = () => useGameStore.getState().gameState?.world.npcStates.village_elder
  const gold = () => useGameStore.getState().gameState?.player.gold

  /** 走正式流程把任务推进到 completable（发现→接受→村外草原击败魔化兔→回村） */
  const toCompletableWithQuest = () => {
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
  }

  it('A. 初始状态：newGame 后 world.npcStates === {}（零回归）', () => {
    useGameStore.getState().newGame()
    expect(useGameStore.getState().gameState?.world.npcStates).toEqual({})
  })

  it('B. 正常任务完成：elder NpcState 懒创建（npcId/alive/locationId 注册表/五维关系）且四项原子提交', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    expect(elderState()).toBeUndefined()
    expect(gold()).toBe(50)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(true)
    const s = useGameStore.getState().gameState!
    expect(s.quests.find((q) => q.questId === 'quest_village_monsters')?.status).toBe('completed')
    expect(s.player.gold).toBe(70)
    expect(s.world.flags.rabbit_lair_unlocked).toBe(true)
    const elder = s.world.npcStates.village_elder
    expect(elder?.npcId).toBe('village_elder')
    expect(elder?.alive).toBe(true)
    expect(elder?.locationId).toBe(getNpc('village_elder')?.locationId)
    expect(elder?.relationship.trust).toBe(1)
    expect(elder?.relationship.affection).toBe(0)
    expect(elder?.relationship.respect).toBe(0)
    expect(elder?.relationship.fear).toBe(0)
    expect(elder?.relationship.resentment).toBe(0)
    expect(elder?.relationship.romanceInterest).toBeUndefined()
  })

  it('C. 已有关系增量：trust 5→6，其余关系字段完全保持', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          npcStates: {
            village_elder: {
              npcId: 'village_elder',
              alive: true,
              locationId: 'qingshi_village',
              relationship: { trust: 5, affection: 2, respect: 3, fear: 1, resentment: 4 },
            },
          },
        },
      },
    })
    useGameStore.getState().completeQuest('quest_village_monsters')
    const elder = elderState()!
    expect(elder.relationship.trust).toBe(6)
    expect(elder.relationship.affection).toBe(2)
    expect(elder.relationship.respect).toBe(3)
    expect(elder.relationship.fear).toBe(1)
    expect(elder.relationship.resentment).toBe(4)
  })

  it('D. 保持 NPC 状态：alive=false 与自定义 locationId 不被覆盖，只改 trust', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          npcStates: {
            village_elder: {
              npcId: 'village_elder',
              alive: false,
              locationId: 'some_existing_location',
              relationship: { trust: 0, affection: 0, respect: 0, fear: 0, resentment: 0 },
            },
          },
        },
      },
    })
    useGameStore.getState().completeQuest('quest_village_monsters')
    const elder = elderState()!
    expect(elder.alive).toBe(false)
    expect(elder.locationId).toBe('some_existing_location')
    expect(elder.relationship.trust).toBe(1)
  })

  it('E. 非 completable（in_progress）：false，无 elder NpcState，gold/flag 不变', () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(elderState()).toBeUndefined()
  })

  it('F. 重复完成：第一次 trust=1，第二次 false 且 trust 仍 1、gold 仍 70', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(true)
    expect(elderState()?.relationship.trust).toBe(1)
    expect(gold()).toBe(70)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(elderState()?.relationship.trust).toBe(1)
    expect(gold()).toBe(70)
  })

  it('G. 已完成旧状态不追补：quest completed 但无 elder NpcState → false，不补 trust', () => {
    useGameStore.getState().newGame()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        quests: [{ questId: 'quest_village_monsters', status: 'completed' as const, stage: 0, flags: {} }],
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(elderState()).toBeUndefined()
  })

  it('H. 其他 NPC 不变：成功提交前后 blacksmith/apothecary npcStates 完全不变', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().completeQuest('quest_village_monsters')
    const after = useGameStore.getState().gameState!
    expect(after.world.npcStates.blacksmith).toEqual(before.world.npcStates.blacksmith)
    expect(after.world.npcStates.apothecary).toEqual(before.world.npcStates.apothecary)
  })

  it('I. 其他关系不变：已有 elder 的 affection/respect/fear/resentment/romanceInterest 完全相同', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          npcStates: {
            village_elder: {
              npcId: 'village_elder',
              alive: true,
              locationId: 'qingshi_village',
              relationship: { trust: 3, affection: 2, respect: 4, fear: 1, resentment: 0, romanceInterest: true },
            },
          },
        },
      },
    })
    useGameStore.getState().completeQuest('quest_village_monsters')
    const elder = elderState()!
    expect(elder.relationship.trust).toBe(4)
    expect(elder.relationship.affection).toBe(2)
    expect(elder.relationship.respect).toBe(4)
    expect(elder.relationship.fear).toBe(1)
    expect(elder.relationship.resentment).toBe(0)
    expect(elder.relationship.romanceInterest).toBe(true) // 历史异常值保持，不重置
  })

  it('J. 关系异常拒绝：trust=Infinity → completeQuest false，整个 GameState 不变', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          npcStates: {
            village_elder: {
              npcId: 'village_elder',
              alive: true,
              locationId: 'qingshi_village',
              relationship: { trust: Number.POSITIVE_INFINITY, affection: 0, respect: 0, fear: 0, resentment: 0 },
            },
          },
        },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_village_monsters')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('K. 不自动保存：完成任务 trust=1 后 hasSave 仍 false', () => {
    useGameStore.getState().newGame()
    toCompletableWithQuest()
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(elderState()?.relationship.trust).toBe(1)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-003：村长任务后一次性回应选择', () => {
  const elderState = () => useGameStore.getState().gameState?.world.npcStates.village_elder
  const completedEvents = () => useGameStore.getState().gameState?.world.completedEvents ?? []

  /** 正式走完 P1-002：任务 completed、gold 70、兔王巢穴解锁、elder trust=1（在青石村） */
  const toCompletedQuest = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
  }

  it('A. 任务未完成拒绝：quest 未 completed → false，GameState 完全不变', () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().respondToVillageElderAfterQuest('reassure')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('B. 错误地点拒绝：任务 completed 但不在村长注册地点 → false，GameState 不变', () => {
    toCompletedQuest()
    useGameStore.getState().travelToLocation('village_grassland')
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().respondToVillageElderAfterQuest('resolve')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('C. 缺少 elder NpcState 拒绝：任务 completed 但 npcStates.village_elder undefined → false，不补建状态', () => {
    toCompletedQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: { ...useGameStore.getState().gameState!.world, npcStates: {} },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().respondToVillageElderAfterQuest('reassure')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(elderState()).toBeUndefined()
  })

  it('D. reassure 正常分支：trust 1→2，respect 0，completedEvents 含事件 ID 一次', () => {
    toCompletedQuest()
    expect(elderState()?.relationship.trust).toBe(1)
    expect(useGameStore.getState().respondToVillageElderAfterQuest('reassure')).toBe(true)
    const elder = elderState()!
    expect(elder.relationship.trust).toBe(2)
    expect(elder.relationship.respect).toBe(0)
    expect(completedEvents()).toEqual([VILLAGE_ELDER_POST_QUEST_EVENT_ID])
  })

  it('E. resolve 正常分支：trust 1，respect 0→1，completedEvents 含事件 ID', () => {
    toCompletedQuest()
    expect(useGameStore.getState().respondToVillageElderAfterQuest('resolve')).toBe(true)
    const elder = elderState()!
    expect(elder.relationship.trust).toBe(1)
    expect(elder.relationship.respect).toBe(1)
    expect(completedEvents()).toEqual([VILLAGE_ELDER_POST_QUEST_EVENT_ID])
  })

  it('F. 两选择互斥：先 reassure → true，再 resolve → false，trust2 respect0 事件仅一条', () => {
    toCompletedQuest()
    expect(useGameStore.getState().respondToVillageElderAfterQuest('reassure')).toBe(true)
    expect(useGameStore.getState().respondToVillageElderAfterQuest('resolve')).toBe(false)
    const elder = elderState()!
    expect(elder.relationship.trust).toBe(2)
    expect(elder.relationship.respect).toBe(0)
    expect(completedEvents()).toEqual([VILLAGE_ELDER_POST_QUEST_EVENT_ID])
  })

  it('G. 非法 choice：fake_choice → false，GameState 不变（不抛异常）', () => {
    toCompletedQuest()
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    // @ts-expect-error 运行时非法 choice 测试
    expect(useGameStore.getState().respondToVillageElderAfterQuest('fake_choice')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('H. trust 安全边界：reassure 时 trust=Infinity → false，GameState 完全不变', () => {
    toCompletedQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          npcStates: {
            village_elder: {
              npcId: 'village_elder',
              alive: true,
              locationId: 'qingshi_village',
              relationship: { trust: Number.POSITIVE_INFINITY, affection: 0, respect: 0, fear: 0, resentment: 0 },
            },
          },
        },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().respondToVillageElderAfterQuest('reassure')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('I. respect 安全边界：resolve 时 respect=Infinity → false，GameState 完全不变', () => {
    toCompletedQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          npcStates: {
            village_elder: {
              npcId: 'village_elder',
              alive: true,
              locationId: 'qingshi_village',
              relationship: { trust: 1, affection: 0, respect: Number.POSITIVE_INFINITY, fear: 0, resentment: 0 },
            },
          },
        },
      },
    })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().respondToVillageElderAfterQuest('resolve')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('J. 其他关系保持：affection/fear/resentment/romanceInterest 全保持', () => {
    toCompletedQuest()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        world: {
          ...useGameStore.getState().gameState!.world,
          npcStates: {
            village_elder: {
              npcId: 'village_elder',
              alive: true,
              locationId: 'qingshi_village',
              relationship: { trust: 1, affection: 2, respect: 0, fear: 3, resentment: 4, romanceInterest: true },
            },
          },
        },
      },
    })
    useGameStore.getState().respondToVillageElderAfterQuest('reassure')
    const elder = elderState()!
    expect(elder.relationship.trust).toBe(2)
    expect(elder.relationship.affection).toBe(2)
    expect(elder.relationship.respect).toBe(0)
    expect(elder.relationship.fear).toBe(3)
    expect(elder.relationship.resentment).toBe(4)
    expect(elder.relationship.romanceInterest).toBe(true)
  })

  it('K. NpcState 与其他 NPC 保持：elder.alive/locationId 与 blacksmith/apothecary state 全不变', () => {
    toCompletedQuest()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().respondToVillageElderAfterQuest('resolve')
    const after = useGameStore.getState().gameState!
    const bElder = before.world.npcStates.village_elder!
    const aElder = after.world.npcStates.village_elder!
    expect(aElder.alive).toBe(bElder.alive)
    expect(aElder.locationId).toBe(bElder.locationId)
    expect(after.world.npcStates.blacksmith).toEqual(before.world.npcStates.blacksmith)
    expect(after.world.npcStates.apothecary).toEqual(before.world.npcStates.apothecary)
  })

  it('L. 无额外世界/玩家副作用：除目标关系维度与 completedEvents 外 player/inventory/equipment/quests/flags/currentLocationId 全不变', () => {
    toCompletedQuest()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().respondToVillageElderAfterQuest('reassure')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world.flags).toEqual(before.world.flags)
    expect(after.world.currentLocationId).toBe(before.world.currentLocationId)
  })

  it('M. 不自动保存：回应成功后 hasSave 仍 false', () => {
    toCompletedQuest()
    useGameStore.getState().respondToVillageElderAfterQuest('resolve')
    expect(elderState()?.relationship.respect).toBe(1)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-005：第二个正式任务《矿洞清理》', () => {
  const mineQuest = () =>
    useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_mine_cleanup')
  const gold = () => useGameStore.getState().gameState?.player.gold
  const ironOre = () =>
    useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'iron_ore')?.quantity ?? 0

  /** 正式完成《村外异动》（金币 70，在青石村） */
  const completeFirstQuest = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
  }

  /** 接受《矿洞清理》并进入废弃矿洞（任务 in_progress） */
  const acceptMineQuestInMine = () => {
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
  }

  it('A. 注册内容：quest_mine_cleanup 标题/发布者/奖励固定', () => {
    const def = getQuest('quest_mine_cleanup')
    expect(def?.title).toBe('矿洞清理')
    expect(def?.summary).toContain('废弃矿洞')
    expect(def?.giverNpcId).toBe('blacksmith')
    expect(def?.goldReward).toBe(15)
  })

  it('B. 前置未完成拒绝发现：新游戏 discoverQuest 返回 false 且 GameState 完全不变', () => {
    useGameStore.getState().newGame()
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().discoverQuest('quest_mine_cleanup')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(mineQuest()).toBeUndefined()
  })

  it('C. 第一任务完成后可以发现：discover → true → available', () => {
    completeFirstQuest()
    expect(useGameStore.getState().discoverQuest('quest_mine_cleanup')).toBe(true)
    expect(mineQuest()?.status).toBe('available')
  })

  it('D. 正常接受：available → in_progress（复用 acceptQuest）', () => {
    completeFirstQuest()
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    expect(useGameStore.getState().acceptQuest('quest_mine_cleanup')).toBe(true)
    expect(mineQuest()?.status).toBe('in_progress')
  })

  it('E. 正式魔化鼠胜利：in_progress + abandoned_mine → completable 且铁矿石 +1（同一次 Store 更新）', () => {
    completeFirstQuest()
    acceptMineQuestInMine()
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(mineQuest()?.status).toBe('completable')
    expect(ironOre()).toBe(1)
  })

  it('F. 未接受时不推进：quest=available 击败魔化鼠 → 仍 available，铁矿石 +1', () => {
    completeFirstQuest()
    useGameStore.getState().discoverQuest('quest_mine_cleanup') // available
    useGameStore.getState().travelToLocation('abandoned_mine')
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(mineQuest()?.status).toBe('available')
    expect(ironOre()).toBe(1)
  })

  it('G. 已 completable 不重复推进：再次胜利 → 仍 completable，铁矿石继续 +1', () => {
    completeFirstQuest()
    acceptMineQuestInMine()
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(mineQuest()?.status).toBe('completable')
    expect(ironOre()).toBe(2)
  })

  it('H. 战利品异常但任务仍推进：iron_ore 数量非法 → true、任务 completable、inventory 不变', () => {
    completeFirstQuest()
    acceptMineQuestInMine()
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: [{ itemId: 'iron_ore', quantity: Number.MAX_SAFE_INTEGER }],
      },
    })
    const invBefore = useGameStore.getState().gameState!.inventory
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(true)
    expect(mineQuest()?.status).toBe('completable')
    expect(useGameStore.getState().gameState!.inventory).toEqual(invBefore)
  })

  it('I. 完成任务奖励：completable 且 gold=70 → completed 且 gold=85', () => {
    completeFirstQuest()
    acceptMineQuestInMine()
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    expect(gold()).toBe(70)
    expect(useGameStore.getState().completeQuest('quest_mine_cleanup')).toBe(true)
    expect(mineQuest()?.status).toBe('completed')
    expect(gold()).toBe(85)
  })

  it('J. 无额外副作用：flags/completedEvents/npcStates/hp/mp/inventory/equipment 保持，blacksmith NpcState 不创建', () => {
    completeFirstQuest()
    acceptMineQuestInMine()
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    const before = useGameStore.getState().gameState!
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    const after = useGameStore.getState().gameState!
    expect(after.world.flags).toEqual(before.world.flags)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    expect(after.world.npcStates).toEqual(before.world.npcStates)
    expect(after.player.hp).toBe(before.player.hp)
    expect(after.player.mp).toBe(before.player.mp)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.world.npcStates.blacksmith).toBeUndefined()
  })

  it('K. 重复完成：第一次 gold 70→85，第二次 false 且 gold 仍 85', () => {
    completeFirstQuest()
    acceptMineQuestInMine()
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    expect(useGameStore.getState().completeQuest('quest_mine_cleanup')).toBe(true)
    expect(gold()).toBe(85)
    expect(useGameStore.getState().completeQuest('quest_mine_cleanup')).toBe(false)
    expect(gold()).toBe(85)
  })

  it('L. 不自动保存：完成《矿洞清理》后 hasSave 仍 false', () => {
    completeFirstQuest()
    acceptMineQuestInMine()
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    expect(mineQuest()?.status).toBe('completed')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-006：spendKnightPowerStrikeMp 骑士重击灵力消费', () => {
  const mp = () => useGameStore.getState().gameState?.player.mp

  /** 切换职业（`as never` 绕过 ProfessionId 编译检查）并设置 MP */
  const setProfessionAndMp = (profession: string, value: number) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          player: {
            ...s.gameState.player,
            profession: profession as never,
            mp: value,
            maxMp: 6,
          },
        },
      }
    })
  }

  it('A. knight MP6 → true → 4', () => {
    useGameStore.getState().newGame() // 默认 knight
    setProfessionAndMp('knight', 6)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(true)
    expect(mp()).toBe(4)
  })

  it('B. knight MP2 → true → 0', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('knight', 2)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(true)
    expect(mp()).toBe(0)
  })

  it('C. knight MP1 → false，MP 仍 1（不足）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('knight', 1)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(false)
    expect(mp()).toBe(1)
  })

  it('D. mage MP6 → false，GameState 完全不变', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('mage', 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('E. warrior MP6 → false，GameState 完全不变', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('warrior', 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('F. ranger MP6 → false，GameState 完全不变', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('ranger', 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('G. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(false)
  })

  it('H. mp=-1 → false，GameState 完全不变（非法负 MP）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('knight', -1)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('I. mp>maxMp → false，GameState 完全不变（越界）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('knight', 7)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendKnightPowerStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('J. 成功时除 player.mp 外全部不变（hp/maxHp/maxMp/gold/level/profession/attributes/inventory/equipment/quests/world）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('knight', 6)
    const before = useGameStore.getState().gameState!
    useGameStore.getState().spendKnightPowerStrikeMp()
    const after = useGameStore.getState().gameState!
    expect(after.player.hp).toBe(before.player.hp)
    expect(after.player.maxHp).toBe(before.player.maxHp)
    expect(after.player.maxMp).toBe(before.player.maxMp)
    expect(after.player.gold).toBe(before.player.gold)
    expect(after.player.level).toBe(before.player.level)
    expect(after.player.profession).toBe(before.player.profession)
    expect(after.player.attributes).toEqual(before.player.attributes)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world).toEqual(before.world)
    expect(after.player.mp).toBe(before.player.mp - 2)
  })

  it('K. 不自动保存：成功消费后 hasSave 仍 false', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('knight', 6)
    useGameStore.getState().spendKnightPowerStrikeMp()
    expect(mp()).toBe(4)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})
