import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, VILLAGE_ELDER_POST_QUEST_EVENT_ID } from './gameStore'
import { createInitialGameState } from '../content/initial'
import { checkTravel } from '../rules/exploration'
import { getNpc, getQuest } from '../content'
import type { QuestStatus } from '../types/quest'
import type { GameState } from '../types/game'

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
    useGameStore.getState().saveGame('slot1')
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
    const ok = useGameStore.getState().saveGame('slot1')
    expect(ok).toBe(false)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  it('deleteGame 后 hasSave 为 false 且 loadGame 失败', () => {
    useGameStore.getState().saveGame('slot1')
    useGameStore.getState().deleteGame()
    expect(useGameStore.getState().hasSave).toBe(false)
    expect(useGameStore.getState().loadGame()).toBe(false)
  })
})

describe('TM-P0-001-R2：hasSave 与 storage 真实状态一致', () => {
  it('已有合法旧档，下一次写入失败：saveGame 返回 false 但 hasSave 保持 true，旧档仍可加载', () => {
    useGameStore.getState().saveGame('slot1')
    expect(useGameStore.getState().hasSave).toBe(true)

    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    const ok = useGameStore.getState().saveGame('slot1')
    expect(ok).toBe(false)
    // R2：写入失败不得错误丢失旧存档的 hasSave=true
    expect(useGameStore.getState().hasSave).toBe(true)
    // 旧合法存档仍能加载
    expect(useGameStore.getState().loadGame()).toBe(true)
  })

  it('运行期间存档被改坏：loadGame 返回 false 并同步 hasSave=false', () => {
    useGameStore.getState().saveGame('slot1')
    expect(useGameStore.getState().hasSave).toBe(true)

    localStorage.setItem('tianmeng_continent_save_slot_slot1', '{ broken')
    const ok = useGameStore.getState().loadGame()
    expect(ok).toBe(false)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P0-001-R3：Store 与持久化约束一致', () => {
  it('deleteGame 时 removeItem 抛错：旧档保留则 hasSave 保持 true', () => {
    useGameStore.getState().saveGame('slot1')
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
    useGameStore.getState().saveGame('slot1')
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

  it('B. 第二次 Boss 胜利拒绝（TM-P1-014 清场）：首次 true → 再次 resolveCombatVictory false 且 GameState 完全不变、rabbit_path 仍只有 ×1', () => {
    // 首次：正式流程到兔王巢穴击败嘟嘟兔
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    expect(atRabbitLair()).toBe(true)
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(true)
    expect(pathQty()).toBe(1)
    // 第二次（重复胜利）：最终防线拒绝
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(hasPath()).toHaveLength(1)
    expect(pathQty()).toBe(1)
  })

  it('C. 预先已有地图时伪造 Boss 胜利拒绝（TM-P1-014）：rabbit_lair + rabbit_path ×1 → false 且 GameState 完全不变', () => {
    useGameStore.setState({
      gameState: {
        ...useGameStore.getState().gameState!,
        inventory: [...useGameStore.getState().gameState!.inventory, { itemId: 'rabbit_path', quantity: 1 }],
        world: { ...useGameStore.getState().gameState!.world, currentLocationId: 'rabbit_lair' },
      },
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('dudu_rabbit')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
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

describe('TM-P1-008：spendWarriorSuppressStrikeMp 战士压制猛击灵力消费', () => {
  const mp = () => useGameStore.getState().gameState?.player.mp

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

  it('A. warrior MP6 → true → 4', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('warrior', 6)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(true)
    expect(mp()).toBe(4)
  })

  it('B. warrior MP2 → true → 0', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('warrior', 2)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(true)
    expect(mp()).toBe(0)
  })

  it('C. warrior MP1 → false，MP 仍 1（不足）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('warrior', 1)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(false)
    expect(mp()).toBe(1)
  })

  it('D. knight MP6 → false，GameState 完全不变', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('knight', 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('E. mage MP6 → false，GameState 完全不变', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('mage', 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('F. ranger MP6 → false，GameState 完全不变', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('ranger', 6)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('G. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(false)
  })

  it('H. mp=-1 → false，GameState 完全不变（非法负 MP）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('warrior', -1)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('I. mp>maxMp → false，GameState 完全不变（越界）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('warrior', 7)
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().spendWarriorSuppressStrikeMp()).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
  })

  it('J. 成功时除 player.mp 外全部不变（hp/maxHp/maxMp/gold/level/profession/attributes/inventory/equipment/quests/world）', () => {
    useGameStore.getState().newGame()
    setProfessionAndMp('warrior', 6)
    const before = useGameStore.getState().gameState!
    useGameStore.getState().spendWarriorSuppressStrikeMp()
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
    setProfessionAndMp('warrior', 6)
    useGameStore.getState().spendWarriorSuppressStrikeMp()
    expect(mp()).toBe(4)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-010：第三个正式任务《草原狼影》', () => {
  const wolfQuest = () =>
    useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_grassland_wolf')
  const gold = () => useGameStore.getState().gameState?.player.gold

  /** 正式完成《村外异动》（金币 70）与《矿洞清理》（金币 85），当前在青石村 */
  const completeTwoQuests = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
  }

  it('A. 注册内容：quest_grassland_wolf 标题/发布者/奖励固定', () => {
    const def = getQuest('quest_grassland_wolf')
    expect(def?.title).toBe('草原狼影')
    expect(def?.summary).toContain('魔化狼')
    expect(def?.giverNpcId).toBe('village_elder')
    expect(def?.goldReward).toBe(25)
  })

  it('B. 前置未完成拒绝发现：新游戏 discoverQuest 返回 false 且 GameState 完全不变', () => {
    useGameStore.getState().newGame()
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().discoverQuest('quest_grassland_wolf')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(wolfQuest()).toBeUndefined()
  })

  it('C. 仅《矿洞清理》完成后可发现：discover → true → available（不依赖村长回应关系）', () => {
    completeTwoQuests()
    expect(useGameStore.getState().discoverQuest('quest_grassland_wolf')).toBe(true)
    expect(wolfQuest()?.status).toBe('available')
  })

  it('D. 正常接受：available → in_progress（复用 acceptQuest）', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    expect(useGameStore.getState().acceptQuest('quest_grassland_wolf')).toBe(true)
    expect(wolfQuest()?.status).toBe('in_progress')
  })

  it('E. 正式魔化狼胜利：草原 + in_progress → completable（复用 applyQuestTransition）', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    expect(wolfQuest()?.status).toBe('completable')
  })

  it('F. 魔化狼胜利不产生战利品/事件/关系/地点副作用', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    const before = useGameStore.getState().gameState!
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    const after = useGameStore.getState().gameState!
    expect(after.inventory).toEqual(before.inventory)
    expect(after.world.flags).toEqual(before.world.flags)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    expect(after.world.npcStates).toEqual(before.world.npcStates)
    expect(after.player.gold).toBe(before.player.gold)
    expect(after.player.hp).toBe(before.player.hp)
    expect(after.player.mp).toBe(before.player.mp)
  })

  it('G. available 状态下魔化狼胜利不推进任务（保持 available）', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    expect(wolfQuest()?.status).toBe('available')
  })

  it('H. completable 后再次胜利不重复推进（保持 completable）', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    expect(wolfQuest()?.status).toBe('completable')
  })

  it('I. 提交任务：completable + gold85 → true → completed + gold110', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    expect(gold()).toBe(85)
    expect(useGameStore.getState().completeQuest('quest_grassland_wolf')).toBe(true)
    expect(wolfQuest()?.status).toBe('completed')
    expect(gold()).toBe(110)
  })

  it('J. 重复提交 false 且金币仍 110', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    expect(useGameStore.getState().completeQuest('quest_grassland_wolf')).toBe(false)
    expect(gold()).toBe(110)
  })

  it('K. 村长关系在第三任务完成前后完全一致（信任 1 / 尊敬 0，无 trust+1/respect 副作用）', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    const before = useGameStore.getState().gameState!.world.npcStates.village_elder
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    const after = useGameStore.getState().gameState!.world.npcStates.village_elder
    expect(before?.relationship.trust).toBe(1)
    expect(before?.relationship.respect).toBe(0)
    expect(after?.relationship.trust).toBe(1)
    expect(after?.relationship.respect).toBe(0)
  })

  it('L. 不自动保存：完成《草原狼影》后 hasSave 仍 false', () => {
    completeTwoQuests()
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    expect(wolfQuest()?.status).toBe('completed')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-011：第一次里程碑升级 Lv.2（完成《草原狼影》时）', () => {
  const wolfQuest = () =>
    useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_grassland_wolf')
  const gold = () => useGameStore.getState().gameState?.player.gold
  const p = () => useGameStore.getState().gameState!.player

  /** 走正式流程到《草原狼影》completable（默认骑士 Lv.1：HP 22/22、MP 6/6、金币 85，当前在青石村） */
  const completeWolfQuest = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
  }

  /** 覆盖玩家资源状态（hp/mp/level/maxHp/maxMp） */
  const setPlayerState = (overrides: Partial<ReturnType<typeof p>>) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, player: { ...s.gameState.player, ...overrides } } }
    })
  }

  it('B. 正常完成：Lv1→Lv2、HP 22/22→22/24、MP 6/6→6/7、金币 85→110、任务 completed（同一原子更新）', () => {
    completeWolfQuest()
    expect(p().level).toBe(1)
    expect(gold()).toBe(85)
    expect(useGameStore.getState().completeQuest('quest_grassland_wolf')).toBe(true)
    expect(wolfQuest()?.status).toBe('completed')
    expect(p().level).toBe(2)
    expect(p().hp).toBe(22)
    expect(p().maxHp).toBe(24)
    expect(p().mp).toBe(6)
    expect(p().maxMp).toBe(7)
    expect(gold()).toBe(110)
  })

  it('C. 受伤状态不治疗：HP 10/22、MP 2/6 → 10/24、2/7', () => {
    completeWolfQuest()
    setPlayerState({ hp: 10, mp: 2 })
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    expect(p().hp).toBe(10)
    expect(p().maxHp).toBe(24)
    expect(p().mp).toBe(2)
    expect(p().maxMp).toBe(7)
    expect(p().level).toBe(2)
  })

  it('D. HP0 不复活：HP 0/22 → 0/24', () => {
    completeWolfQuest()
    setPlayerState({ hp: 0 })
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    expect(p().hp).toBe(0)
    expect(p().maxHp).toBe(24)
    expect(p().level).toBe(2)
  })

  it('E. 非 Lv.1 拒绝：level=2 时 completeQuest false 且任务/金币/等级/HP/MP 全不变', () => {
    completeWolfQuest()
    setPlayerState({ level: 2 })
    const snapshot = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_grassland_wolf')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot)
    expect(wolfQuest()?.status).toBe('completable')
  })

  it('F. 非法资源状态拒绝：hp>maxHp / maxHp 溢出（MAX_SAFE_INTEGER）→ false 且 GameState 完全不变', () => {
    completeWolfQuest()
    setPlayerState({ hp: 23 }) // > maxHp 22
    const snapshot1 = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_grassland_wolf')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot1)

    completeWolfQuest()
    setPlayerState({ maxHp: Number.MAX_SAFE_INTEGER })
    const snapshot2 = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().completeQuest('quest_grassland_wolf')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(snapshot2)
    expect(wolfQuest()?.status).toBe('completable')
  })

  it('G. 无副作用：attributes/profession/inventory/equipment/flags/completedEvents/npcStates 全不变', () => {
    completeWolfQuest()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    const after = useGameStore.getState().gameState!
    expect(after.player.attributes).toEqual(before.player.attributes)
    expect(after.player.profession).toBe(before.player.profession)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.world.flags).toEqual(before.world.flags)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    expect(after.world.npcStates).toEqual(before.world.npcStates)
  })

  it('H. 重复提交：首次 Lv1→Lv2、85→110；第二次 false 仍 Lv2/110，maxHp/maxMp 不再增长', () => {
    completeWolfQuest()
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    const afterFirst = { ...p() }
    expect(useGameStore.getState().completeQuest('quest_grassland_wolf')).toBe(false)
    expect(p().level).toBe(2)
    expect(gold()).toBe(110)
    expect(p().maxHp).toBe(afterFirst.maxHp)
    expect(p().maxMp).toBe(afterFirst.maxMp)
  })

  it('I. 不自动保存：完成第三任务（升级）后 hasSave 仍 false', () => {
    completeWolfQuest()
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    expect(p().level).toBe(2)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-013：正式查看《兔子的路径》（inspectRabbitPath）', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')

  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** R1：直接构造运行态（绕过 addItem 的入参拦截），使非法 quantity 真实进入 inventory */
  const seedRabbitPathQuantity = (quantity: number) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          inventory: [...s.gameState.inventory, { itemId: 'rabbit_path', quantity }],
        },
      }
    })
  }

  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().inspectRabbitPath()).toBe(false)
  })

  it('B. 没有 rabbit_path → false 且 GameState 完全不变', () => {
    const before = snapshot()
    expect(useGameStore.getState().inspectRabbitPath()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  // R1：以下五项均为「异常 quantity 真实存在于 inventory」的防回归证据（引用相等，不依赖 JSON.stringify——NaN/Infinity 会被 JSON 转换失真）
  it.each([
    ['quantity=0', 0],
    ['quantity=-1', -1],
    ['quantity=1.5', 1.5],
    ['quantity=NaN', Number.NaN],
    ['quantity=Infinity', Number.POSITIVE_INFINITY],
  ])('C. %s（真实 inventory 异常值）→ false 且 GameState 同一引用/完全不变、examined 未写成 true、异常值原样存在', (_label, invalidQuantity) => {
    seedRabbitPathQuantity(invalidQuantity)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().inspectRabbitPath()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(flags()?.rabbit_path_examined).toBeUndefined()
    expect(rabbitPath()?.quantity).toBe(invalidQuantity)
  })

  it('F. 合法 rabbit_path ×1 + flag 不存在 → true 且 rabbit_path_examined=true', () => {
    useGameStore.getState().addItem('rabbit_path', 1)
    expect(useGameStore.getState().inspectRabbitPath()).toBe(true)
    expect(flags()?.rabbit_path_examined).toBe(true)
  })

  it('G. 成功后 rabbit_path 仍 ×1（不消耗地图）', () => {
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    expect(rabbitPath()?.quantity).toBe(1)
  })

  it('H. 成功只修改 world.flags.rabbit_path_examined：player/inventory/equipment/quests/位置/completedEvents/npcStates 全不变', () => {
    useGameStore.getState().addItem('rabbit_path', 1)
    const before = useGameStore.getState().gameState!
    useGameStore.getState().inspectRabbitPath()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.world.currentLocationId).toBe(before.world.currentLocationId)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    expect(after.world.npcStates).toEqual(before.world.npcStates)
    // 唯一差异：rabbit_path_examined absent/false → true
    expect(after.world.flags.rabbit_path_examined).toBe(true)
  })

  it('I. flag=false 时 → true 成功', () => {
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: { rabbit_path_examined: false } } } }
    })
    expect(useGameStore.getState().inspectRabbitPath()).toBe(true)
    expect(flags()?.rabbit_path_examined).toBe(true)
  })

  it('J. flag=true 重复调用 → false 且 GameState 完全不变', () => {
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    const before = snapshot()
    expect(useGameStore.getState().inspectRabbitPath()).toBe(false)
    expect(snapshot()).toBe(before)
    expect(rabbitPath()?.quantity).toBe(1)
  })

  it('K. flag 为非 boolean（字符串/数字）→ false 且完全不变（不静默覆盖异常存档状态）', () => {
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: { rabbit_path_examined: 'yes' } } } }
    })
    const beforeStr = snapshot()
    expect(useGameStore.getState().inspectRabbitPath()).toBe(false)
    expect(snapshot()).toBe(beforeStr)
    expect(flags()?.rabbit_path_examined).toBe('yes')

    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: { rabbit_path_examined: 1 } } } }
    })
    const beforeNum = snapshot()
    expect(useGameStore.getState().inspectRabbitPath()).toBe(false)
    expect(snapshot()).toBe(beforeNum)
    expect(flags()?.rabbit_path_examined).toBe(1)
  })

  it('L. 不自动保存：成功查看后 hasSave 仍 false', () => {
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    expect(flags()?.rabbit_path_examined).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-016：向村长汇报《兔子的路径》（青石村阶段收束）', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')
  const elder = () => useGameStore.getState().gameState?.world.npcStates.village_elder?.relationship

  /** 走到完整合法前置：草原狼影 completed + 背包 rabbit_path ×1 + 已展开地图 + 在青石村（default 骑士 Lv.2） */
  const seedFullPrereqs = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
  }

  /** 直接构造运行态（绕过 addItem 入参拦截），使非法 quantity 真实进入 inventory */
  const seedRabbitPathQuantity = (quantity: number) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          inventory: [...s.gameState.inventory, { itemId: 'rabbit_path', quantity }],
        },
      }
    })
  }

  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
  })

  it('B. 不在青石村 → false 且完全不变', () => {
    seedFullPrereqs()
    useGameStore.getState().travelToLocation('village_grassland')
    const before = snapshot()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. 没有 rabbit_path → false', () => {
    seedFullPrereqs()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, inventory: s.gameState.inventory.filter((e) => e.itemId !== 'rabbit_path') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['quantity=0', 0],
    ['quantity=-1', -1],
    ['quantity=1.5', 1.5],
    ['quantity=NaN', Number.NaN],
    ['quantity=Infinity', Number.POSITIVE_INFINITY],
  ])('D. 非法 quantity %s（真实 inventory 异常值）→ false 且 GameState 同一引用不变、异常值原样存在', (_label, invalidQuantity) => {
    seedFullPrereqs()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          inventory: s.gameState.inventory
            .filter((e) => e.itemId !== 'rabbit_path')
            .concat({ itemId: 'rabbit_path', quantity: invalidQuantity }),
        },
      }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(flags()?.rabbit_path_reported).toBeUndefined()
    expect(rabbitPath()?.quantity).toBe(invalidQuantity)
  })

  it('E. 地图尚未查看（rabbit_path_examined !== true）→ false', () => {
    seedFullPrereqs()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, rabbit_path_examined: false } },
        },
      }
    })
    const before = snapshot()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. 《草原狼影》不是 completed → false', () => {
    seedFullPrereqs()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_grassland_wolf' ? { ...q, status: 'completable' as const } : q,
          ),
        },
      }
    })
    const before = snapshot()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('G. 全部合法 → true 且 rabbit_path_reported=true', () => {
    seedFullPrereqs()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(true)
    expect(flags()?.rabbit_path_reported).toBe(true)
  })

  it('H. 成功后兔子的路径仍 ×1（展示不交出地图）', () => {
    seedFullPrereqs()
    useGameStore.getState().reportRabbitPathToVillageElder()
    expect(rabbitPath()?.quantity).toBe(1)
  })

  it('I. 成功只修改 rabbit_path_reported：player/equipment/quests/inventory/位置/completedEvents/npcStates/其他 flags 全不变', () => {
    seedFullPrereqs()
    const before = useGameStore.getState().gameState!
    useGameStore.getState().reportRabbitPathToVillageElder()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.quests).toEqual(before.quests)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.world.currentLocationId).toBe(before.world.currentLocationId)
    expect(after.world.completedEvents).toEqual(before.world.completedEvents)
    expect(after.world.npcStates).toEqual(before.world.npcStates)
    expect(after.world.flags.rabbit_path_reported).toBe(true)
    // 其他 flags 完全一致（除 rabbit_path_reported 外）
    const otherBefore = { ...before.world.flags }
    const otherAfter = { ...after.world.flags }
    delete otherBefore.rabbit_path_reported
    delete otherAfter.rabbit_path_reported
    expect(otherAfter).toEqual(otherBefore)
  })

  it('J. flag=false 视为未汇报 → 成功改 true', () => {
    seedFullPrereqs()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, rabbit_path_reported: false } },
        },
      }
    })
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(true)
    expect(flags()?.rabbit_path_reported).toBe(true)
  })

  it('K. flag=true 重复调用 → false 且 GameState 完全不变', () => {
    seedFullPrereqs()
    useGameStore.getState().reportRabbitPathToVillageElder()
    const before = snapshot()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('L. flag 为非 boolean（"yes"/1）→ false 且完全不变（不静默覆盖）', () => {
    seedFullPrereqs()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, rabbit_path_reported: 'yes' } },
        },
      }
    })
    const beforeStr = snapshot()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(snapshot()).toBe(beforeStr)

    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, rabbit_path_reported: 1 } },
        },
      }
    })
    const beforeNum = snapshot()
    expect(useGameStore.getState().reportRabbitPathToVillageElder()).toBe(false)
    expect(snapshot()).toBe(beforeNum)
  })

  it('M. 村长 trust/respect 完全不变（汇报无关系奖励）', () => {
    seedFullPrereqs()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            npcStates: {
              ...s.gameState.world.npcStates,
              village_elder: {
                npcId: 'village_elder',
                alive: true,
                locationId: 'qingshi_village',
                relationship: { trust: 1, affection: 0, respect: 0, fear: 0, resentment: 0 },
              },
            },
          },
        },
      }
    })
    const beforeElder = JSON.stringify(elder())
    useGameStore.getState().reportRabbitPathToVillageElder()
    expect(JSON.stringify(elder())).toBe(beforeElder)
    expect(elder()?.trust).toBe(1)
    expect(elder()?.respect).toBe(0)
  })

  it('N. 金币/等级/HP/MP 完全不变（无奖励）', () => {
    seedFullPrereqs()
    const before = useGameStore.getState().gameState!.player
    useGameStore.getState().reportRabbitPathToVillageElder()
    const after = useGameStore.getState().gameState!.player
    expect(after.gold).toBe(before.gold)
    expect(after.level).toBe(before.level)
    expect(after.hp).toBe(before.hp)
    expect(after.maxHp).toBe(before.maxHp)
    expect(after.mp).toBe(before.mp)
    expect(after.maxMp).toBe(before.maxMp)
  })

  it('O. 不自动保存：成功汇报后 hasSave 仍 false', () => {
    seedFullPrereqs()
    useGameStore.getState().reportRabbitPathToVillageElder()
    expect(flags()?.rabbit_path_reported).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-017：《追寻黄金兔子王》第四主线任务（仅 rabbit_path_reported===true 可发现）', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')

  /** 新游戏（无任何汇报前置） */
  const freshGame = () => {
    useGameStore.getState().newGame()
  }

  /** 汇报完成（rabbit_path_reported=true）——复用 P1-016 完整前置链 */
  const seedReported = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    useGameStore.getState().reportRabbitPathToVillageElder()
  }

  /** 直接构造非严格 flag 运行态 */
  const seedFlagValue = (value: string | number | boolean) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, rabbit_path_reported: value } },
        },
      }
    })
  }

  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)
  const questsJson = () => JSON.stringify(useGameStore.getState().gameState?.quests)

  it('A. 汇报前 discover → false 且 quests 完全不变（新游戏无任何前置）', () => {
    freshGame()
    const beforeQuests = questsJson()
    expect(useGameStore.getState().discoverQuest('quest_golden_rabbit_search')).toBe(false)
    expect(questsJson()).toBe(beforeQuests)
    expect(goldenQuest()).toBeUndefined()
  })

  it('B. rabbit_path_reported=false → false', () => {
    freshGame()
    seedFlagValue(false)
    const beforeQuests = questsJson()
    expect(useGameStore.getState().discoverQuest('quest_golden_rabbit_search')).toBe(false)
    expect(questsJson()).toBe(beforeQuests)
  })

  it.each([
    ['"true"', 'true'],
    ['1', 1],
    ['0', 0],
    ['"yes"', 'yes'],
  ])('C. 非严格 flag %s → false 且全状态不变（不修复异常 flag）', (_label, invalidValue) => {
    freshGame()
    seedFlagValue(invalidValue)
    const before = snapshot()
    expect(useGameStore.getState().discoverQuest('quest_golden_rabbit_search')).toBe(false)
    expect(snapshot()).toBe(before)
    expect(flags()?.rabbit_path_reported).toBe(invalidValue)
  })

  it('D. reported=true discover → true 且 QuestState 为 available', () => {
    seedReported()
    expect(useGameStore.getState().discoverQuest('quest_golden_rabbit_search')).toBe(true)
    expect(goldenQuest()).toEqual({ questId: 'quest_golden_rabbit_search', status: 'available', stage: 0, flags: {} })
  })

  it('E. 重复 discover → false，不产生第二条', () => {
    seedReported()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    const beforeQuests = questsJson()
    expect(useGameStore.getState().discoverQuest('quest_golden_rabbit_search')).toBe(false)
    expect(questsJson()).toBe(beforeQuests)
    expect(useGameStore.getState().gameState?.quests.filter((q) => q.questId === 'quest_golden_rabbit_search')).toHaveLength(1)
  })

  it('F. accept → true → in_progress', () => {
    seedReported()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    expect(useGameStore.getState().acceptQuest('quest_golden_rabbit_search')).toBe(true)
    expect(goldenQuest()?.status).toBe('in_progress')
  })

  it('G. 重复 accept → false', () => {
    seedReported()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
    expect(useGameStore.getState().acceptQuest('quest_golden_rabbit_search')).toBe(false)
    expect(goldenQuest()?.status).toBe('in_progress')
  })

  it('H. 发现+接受无副作用：player/inventory/equipment/world/其他 quests 除新任务 QuestState 外全不变', () => {
    seedReported()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOtherQuests = useGameStore.getState().gameState!.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(after.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')).toEqual(beforeOtherQuests)
  })

  it('I. 发现+接受后兔子的路径仍 ×1 且 reported/examined 保持', () => {
    seedReported()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
    expect(rabbitPath()?.quantity).toBe(1)
    expect(flags()?.rabbit_path_reported).toBe(true)
    expect(flags()?.rabbit_path_examined).toBe(true)
  })

  it('J. 不自动保存：发现+接受后 hasSave 仍 false', () => {
    seedReported()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
    expect(goldenQuest()?.status).toBe('in_progress')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-018：向村中两人打听《追寻黄金兔子王》地图线索（QuestState.flags 持久化）', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到第四任务 in_progress（复用 P1-017 完整前置链） */
  const seedGoldenInProgress = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    useGameStore.getState().reportRabbitPathToVillageElder()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
  }

  /** 直接构造任务 flag 运行态 */
  const seedQuestFlag = (flagKey: string, value: string | number | boolean) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_golden_rabbit_search' ? { ...q, flags: { ...q.flags, [flagKey]: value } } : q,
          ),
        },
      }
    })
  }

  /** 直接构造任务状态运行态 */
  const seedQuestStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_golden_rabbit_search' ? { ...q, status } : q,
          ),
        },
      }
    })
  }

  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')).toBe(false)
  })

  it('B. 第四任务不存在 → false', () => {
    seedGoldenInProgress()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. 第四任务 available → false', () => {
    seedGoldenInProgress()
    seedQuestStatus('available')
    const before = snapshot()
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('D. 第四任务 completed/completable → false', () => {
    seedGoldenInProgress()
    seedQuestStatus('completed')
    const beforeCompleted = snapshot()
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(snapshot()).toBe(beforeCompleted)
    seedQuestStatus('completable')
    const beforeCompletable = snapshot()
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(snapshot()).toBe(beforeCompletable)
  })

  it('E. 不在青石村 → false', () => {
    seedGoldenInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    const before = snapshot()
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. 非法 npcId（运行时强转）→ false', () => {
    seedGoldenInProgress()
    const before = snapshot()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('innkeeper' as any)).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('G. 首次问铁匠 → true 且 asked_blacksmith=true', () => {
    seedGoldenInProgress()
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(true)
    expect(goldenQuest()?.flags.asked_blacksmith).toBe(true)
  })

  it('H. 首次问药师 → true 且 asked_apothecary=true', () => {
    seedGoldenInProgress()
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')).toBe(true)
    expect(goldenQuest()?.flags.asked_apothecary).toBe(true)
  })

  it('I. 铁匠重复询问 → false 且 GameState 同一引用不变', () => {
    seedGoldenInProgress()
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('J. 药师重复询问 → false 且同一引用不变', () => {
    seedGoldenInProgress()
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('K. flag=false → 可成功改 true', () => {
    seedGoldenInProgress()
    seedQuestFlag('asked_blacksmith', false)
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(true)
    expect(goldenQuest()?.flags.asked_blacksmith).toBe(true)
  })

  it.each([
    ['asked_blacksmith 非 boolean ("yes")', 'asked_blacksmith', 'yes'],
    ['asked_blacksmith 非 boolean (1)', 'asked_blacksmith', 1],
    ['asked_apothecary 非 boolean ("yes")', 'asked_apothecary', 'yes'],
    ['asked_apothecary 非 boolean (1)', 'asked_apothecary', 1],
  ])('L/M. %s → 拒绝且完全不变（不静默覆盖）', (_label, flagKey, invalidValue) => {
    seedGoldenInProgress()
    seedQuestFlag(flagKey, invalidValue)
    const before = snapshot()
    const npcId = flagKey === 'asked_blacksmith' ? 'blacksmith' : 'apothecary'
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc(npcId)).toBe(false)
    expect(snapshot()).toBe(before)
    expect(goldenQuest()?.flags[flagKey]).toBe(invalidValue)
  })

  // TM-P1-018-R1：交叉异常——另一相关 flag 非 boolean 时，本次调查也必须整次拒绝
  it('R1-a. asked_blacksmith="yes" 且咨询 apothecary → false 且同一引用不变、两 flag 均原样', () => {
    seedGoldenInProgress()
    seedQuestFlag('asked_blacksmith', 'yes')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(goldenQuest()?.flags.asked_blacksmith).toBe('yes')
    expect(goldenQuest()?.flags.asked_apothecary).toBeUndefined()
  })

  it('R1-b. asked_apothecary=1 且咨询 blacksmith → false 且同一引用不变、两 flag 均原样', () => {
    seedGoldenInProgress()
    seedQuestFlag('asked_apothecary', 1)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(goldenQuest()?.flags.asked_apothecary).toBe(1)
    expect(goldenQuest()?.flags.asked_blacksmith).toBeUndefined()
  })

  it('N. 问完一人 status 仍 in_progress、stage 仍 0', () => {
    seedGoldenInProgress()
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    expect(goldenQuest()?.status).toBe('in_progress')
    expect(goldenQuest()?.stage).toBe(0)
  })

  it('O. 两人都问完 → 两 flag=true、status 仍 in_progress、stage 仍 0', () => {
    seedGoldenInProgress()
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
    expect(goldenQuest()?.flags.asked_blacksmith).toBe(true)
    expect(goldenQuest()?.flags.asked_apothecary).toBe(true)
    expect(goldenQuest()?.status).toBe('in_progress')
    expect(goldenQuest()?.stage).toBe(0)
  })

  it('P. rabbit_path 仍 ×1', () => {
    seedGoldenInProgress()
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
    expect(rabbitPath()?.quantity).toBe(1)
  })

  it('Q. player/inventory/equipment/world/其他 quests 全不变（不建 npcState/无奖励）', () => {
    seedGoldenInProgress()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOtherQuests = useGameStore.getState().gameState!.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(after.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')).toEqual(beforeOtherQuests)
    expect(after.world.npcStates.blacksmith).toBeUndefined()
    expect(after.world.npcStates.apothecary).toBeUndefined()
    expect(flags()?.rabbit_path_reported).toBe(true)
  })

  it('R. 不自动保存：两人询问后 hasSave 仍 false', () => {
    seedGoldenInProgress()
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
    expect(goldenQuest()?.flags.asked_blacksmith).toBe(true)
    expect(goldenQuest()?.flags.asked_apothecary).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-019：向村长复命村内调查（两人均无法辨认地图）', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到两人均已询问（复用 P1-018 完整前置链） */
  const seedBothAsked = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    useGameStore.getState().reportRabbitPathToVillageElder()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
  }

  /** 直接构造任务 flag 运行态（undefined 表示从 flags 中移除该 key，模拟从未设置） */
  const seedQuestFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_golden_rabbit_search') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags[flagKey]
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, [flagKey]: value } }
          }),
        },
      }
    })
  }

  /** 直接构造任务状态运行态 */
  const seedQuestStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_golden_rabbit_search' ? { ...q, status } : q,
          ),
        },
      }
    })
  }

  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
  })

  it('B. 第四任务不存在 → false', () => {
    seedBothAsked()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. status available → false', () => {
    seedBothAsked()
    seedQuestStatus('available')
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('D. status completable/completed → false', () => {
    seedBothAsked()
    seedQuestStatus('completable')
    const beforeCompletable = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(beforeCompletable)
    seedQuestStatus('completed')
    const beforeCompleted = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(beforeCompleted)
  })

  it('E. 不在 qingshi_village → false', () => {
    seedBothAsked()
    useGameStore.getState().travelToLocation('village_grassland')
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. 0/2（两人均未询问）→ false', () => {
    seedBothAsked()
    seedQuestFlag('asked_blacksmith', undefined)
    seedQuestFlag('asked_apothecary', undefined)
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('G. 只有 asked_blacksmith=true（1/2）→ false', () => {
    seedBothAsked()
    seedQuestFlag('asked_apothecary', undefined)
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('H. 只有 asked_apothecary=true（1/2）→ false', () => {
    seedBothAsked()
    seedQuestFlag('asked_blacksmith', undefined)
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('I. 两人都 true → report true 且 village_inquiry_reported=true', () => {
    seedBothAsked()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(true)
    expect(goldenQuest()?.flags.village_inquiry_reported).toBe(true)
  })

  it('J. village_inquiry_reported=false → 可成功改 true', () => {
    seedBothAsked()
    seedQuestFlag('village_inquiry_reported', false)
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(true)
    expect(goldenQuest()?.flags.village_inquiry_reported).toBe(true)
  })

  it('K. village_inquiry_reported=true 重复 → false 且 GameState 同一引用不变', () => {
    seedBothAsked()
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it.each([
    ['asked_blacksmith 非 boolean ("yes")', 'asked_blacksmith', 'yes'],
    ['asked_blacksmith 非 boolean (1)', 'asked_blacksmith', 1],
    ['asked_apothecary 非 boolean ("yes")', 'asked_apothecary', 'yes'],
    ['asked_apothecary 非 boolean (1)', 'asked_apothecary', 1],
    ['village_inquiry_reported 非 boolean ("yes")', 'village_inquiry_reported', 'yes'],
    ['village_inquiry_reported 非 boolean (1)', 'village_inquiry_reported', 1],
  ])('L/M/N. %s → false 且完全不变（不静默覆盖）', (_label, flagKey, invalidValue) => {
    seedBothAsked()
    seedQuestFlag(flagKey, invalidValue)
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
    expect(goldenQuest()?.flags[flagKey]).toBe(invalidValue)
  })

  it('O. 交叉异常整体拒绝：asked_blacksmith=true + asked_apothecary="yes" + reported=false → false', () => {
    seedBothAsked()
    seedQuestFlag('asked_apothecary', 'yes')
    seedQuestFlag('village_inquiry_reported', false)
    const before = snapshot()
    expect(useGameStore.getState().reportGoldenRabbitVillageInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
    expect(goldenQuest()?.flags.asked_apothecary).toBe('yes')
    expect(goldenQuest()?.flags.village_inquiry_reported).toBe(false)
  })

  it('P. 成功后：两 asked 保持 true + village_inquiry_reported=true', () => {
    seedBothAsked()
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
    expect(goldenQuest()?.flags.asked_blacksmith).toBe(true)
    expect(goldenQuest()?.flags.asked_apothecary).toBe(true)
    expect(goldenQuest()?.flags.village_inquiry_reported).toBe(true)
  })

  it('Q. status 仍 in_progress、stage 仍 0', () => {
    seedBothAsked()
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
    expect(goldenQuest()?.status).toBe('in_progress')
    expect(goldenQuest()?.stage).toBe(0)
  })

  it('R. rabbit_path 仍 ×1', () => {
    seedBothAsked()
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
    expect(rabbitPath()?.quantity).toBe(1)
  })

  it('S. player/inventory/equipment/world/其他 quests/npcStates 全部不变（无奖励、不建关系）', () => {
    seedBothAsked()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOtherQuests = useGameStore.getState().gameState!.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(after.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')).toEqual(beforeOtherQuests)
    expect(after.world.npcStates.blacksmith).toBeUndefined()
    expect(after.world.npcStates.apothecary).toBeUndefined()
    expect(after.world.npcStates.village_elder).toEqual(beforeWorld.npcStates.village_elder)
    expect(flags()?.rabbit_path_reported).toBe(true)
  })

  it('T. 不自动保存：复命后 hasSave 仍 false', () => {
    seedBothAsked()
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
    expect(goldenQuest()?.flags.village_inquiry_reported).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-020：返回兔王巢穴复查《兔子的路径》', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到复命完成（复用 P1-019 完整前置链） */
  const seedReportedInvestigation = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    useGameStore.getState().reportRabbitPathToVillageElder()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
  }

  /** 从青石村走到兔王巢穴（村外草原 → 兔王巢穴，正式路线） */
  const gotoLair = () => {
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().travelToLocation('rabbit_lair')
  }

  /** 直接构造任务 flag 运行态（undefined 表示从 flags 中移除该 key） */
  const seedQuestFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_golden_rabbit_search') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags[flagKey]
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, [flagKey]: value } }
          }),
        },
      }
    })
  }

  /** 直接构造任务状态运行态 */
  const seedQuestStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_golden_rabbit_search' ? { ...q, status } : q,
          ),
        },
      }
    })
  }

  /** 直接构造背包运行态（真实异常 quantity，非 addItem 假覆盖） */
  const seedRabbitPathQuantity = (quantity: unknown) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const without = s.gameState.inventory.filter((e) => e.itemId !== 'rabbit_path')
      if (quantity === undefined) {
        return { gameState: { ...s.gameState, inventory: without } }
      }
      return {
        gameState: {
          ...s.gameState,
          inventory: [...without, { itemId: 'rabbit_path', quantity: quantity as number }],
        },
      }
    })
  }

  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
  })

  it('B. 不在 rabbit_lair → false', () => {
    seedReportedInvestigation()
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. 第四任务不存在 → false', () => {
    seedReportedInvestigation()
    gotoLair()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('D. available/completable/completed → false', () => {
    seedReportedInvestigation()
    gotoLair()
    for (const status of ['available', 'completable', 'completed'] as const) {
      seedQuestStatus(status)
      const before = snapshot()
      expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
      expect(snapshot()).toBe(before)
    }
  })

  it('E. asked_blacksmith !== true → false', () => {
    seedReportedInvestigation()
    gotoLair()
    seedQuestFlag('asked_blacksmith', false)
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. asked_apothecary !== true → false', () => {
    seedReportedInvestigation()
    gotoLair()
    seedQuestFlag('asked_apothecary', undefined)
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('G. village_inquiry_reported !== true → false', () => {
    seedReportedInvestigation()
    gotoLair()
    seedQuestFlag('village_inquiry_reported', false)
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('H. 无 rabbit_path → false', () => {
    seedReportedInvestigation()
    gotoLair()
    seedRabbitPathQuantity(undefined)
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['quantity=0', 0],
    ['quantity=-1', -1],
    ['quantity=1.5', 1.5],
    ['quantity=NaN', NaN],
    ['quantity=Infinity', Infinity],
  ])('I. %s → false 且同一引用不变', (_label, badQuantity) => {
    seedReportedInvestigation()
    gotoLair()
    seedRabbitPathQuantity(badQuantity)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(goldenQuest()?.flags.rabbit_lair_rechecked).toBeUndefined()
  })

  it('J. rabbit_path_examined !== true → false', () => {
    seedReportedInvestigation()
    gotoLair()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const nextFlags = { ...s.gameState.world.flags }
      nextFlags.rabbit_path_examined = false
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: nextFlags } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('K. 全前置合法 → true 且 rabbit_lair_rechecked=true', () => {
    seedReportedInvestigation()
    gotoLair()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(true)
    expect(goldenQuest()?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('L. rabbit_lair_rechecked=false → 可成功 true', () => {
    seedReportedInvestigation()
    gotoLair()
    seedQuestFlag('rabbit_lair_rechecked', false)
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(true)
    expect(goldenQuest()?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('M. rabbit_lair_rechecked=true 重复 → false 且同一引用不变', () => {
    seedReportedInvestigation()
    gotoLair()
    useGameStore.getState().recheckGoldenRabbitMapAtLair()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it.each([
    ['asked_blacksmith 非 boolean ("yes")', 'asked_blacksmith', 'yes'],
    ['asked_apothecary 非 boolean (1)', 'asked_apothecary', 1],
    ['village_inquiry_reported 非 boolean (1)', 'village_inquiry_reported', 1],
    ['rabbit_lair_rechecked 非 boolean ("yes")', 'rabbit_lair_rechecked', 'yes'],
    ['rabbit_lair_rechecked 非 boolean (0.5)', 'rabbit_lair_rechecked', 0.5],
  ])('N. %s → false 且完全不变（不静默覆盖）', (_label, flagKey, invalidValue) => {
    seedReportedInvestigation()
    gotoLair()
    seedQuestFlag(flagKey, invalidValue)
    const before = snapshot()
    expect(useGameStore.getState().recheckGoldenRabbitMapAtLair()).toBe(false)
    expect(snapshot()).toBe(before)
    expect(goldenQuest()?.flags[flagKey]).toBe(invalidValue)
  })

  it('O. 成功后前三 flag 保持 true', () => {
    seedReportedInvestigation()
    gotoLair()
    useGameStore.getState().recheckGoldenRabbitMapAtLair()
    expect(goldenQuest()?.flags.asked_blacksmith).toBe(true)
    expect(goldenQuest()?.flags.asked_apothecary).toBe(true)
    expect(goldenQuest()?.flags.village_inquiry_reported).toBe(true)
    expect(goldenQuest()?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('P. status 仍 in_progress、stage 仍 0', () => {
    seedReportedInvestigation()
    gotoLair()
    useGameStore.getState().recheckGoldenRabbitMapAtLair()
    expect(goldenQuest()?.status).toBe('in_progress')
    expect(goldenQuest()?.stage).toBe(0)
  })

  it('Q. rabbit_path 仍 ×1（复查不消耗地图）', () => {
    seedReportedInvestigation()
    gotoLair()
    useGameStore.getState().recheckGoldenRabbitMapAtLair()
    expect(rabbitPath()?.quantity).toBe(1)
  })

  it('R. player/equipment/world/其他 quests/npcStates 全不变（无奖励）', () => {
    seedReportedInvestigation()
    gotoLair()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOtherQuests = useGameStore.getState().gameState!.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')
    useGameStore.getState().recheckGoldenRabbitMapAtLair()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(after.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search')).toEqual(beforeOtherQuests)
    expect(flags()?.rabbit_path_examined).toBe(true)
  })

  it('S. 不自动保存：复查后 hasSave 仍 false', () => {
    seedReportedInvestigation()
    gotoLair()
    useGameStore.getState().recheckGoldenRabbitMapAtLair()
    expect(goldenQuest()?.flags.rabbit_lair_rechecked).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-021：首条正式支线《采药受阻》（药师发布）', () => {
  const flags = () => useGameStore.getState().gameState?.world.flags
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')
  const herbQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_apothecary_herb_route')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 完成第一主线《村外异动》（支线发现前置） */
  const seedVillageMonstersCompleted = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
  }

  /** 走到支线 in_progress（接受后，青石村） */
  const seedHerbInProgress = () => {
    seedVillageMonstersCompleted()
    useGameStore.getState().discoverQuest('quest_apothecary_herb_route')
    useGameStore.getState().acceptQuest('quest_apothecary_herb_route')
  }

  /** 直接构造支线 flag 运行态（undefined 表示移除该 key） */
  const seedHerbFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_apothecary_herb_route') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags[flagKey]
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, [flagKey]: value } }
          }),
        },
      }
    })
  }

  /** 直接构造支线状态运行态 */
  const seedHerbStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_apothecary_herb_route' ? { ...q, status } : q,
          ),
        },
      }
    })
  }

  it('A. 第一主线未完成 → 支线 discover false', () => {
    useGameStore.getState().newGame()
    expect(useGameStore.getState().discoverQuest('quest_apothecary_herb_route')).toBe(false)
    expect(herbQuest()).toBeUndefined()
  })

  it('B. 第一主线 completed → discover true / available', () => {
    seedVillageMonstersCompleted()
    expect(useGameStore.getState().discoverQuest('quest_apothecary_herb_route')).toBe(true)
    expect(herbQuest()?.status).toBe('available')
    expect(herbQuest()?.stage).toBe(0)
  })

  it('C. 重复 discover → false', () => {
    seedVillageMonstersCompleted()
    useGameStore.getState().discoverQuest('quest_apothecary_herb_route')
    expect(useGameStore.getState().discoverQuest('quest_apothecary_herb_route')).toBe(false)
  })

  it('D. accept → in_progress', () => {
    seedVillageMonstersCompleted()
    useGameStore.getState().discoverQuest('quest_apothecary_herb_route')
    expect(useGameStore.getState().acceptQuest('quest_apothecary_herb_route')).toBe(true)
    expect(herbQuest()?.status).toBe('in_progress')
  })

  it('E. 不在 village_grassland → inspect false', () => {
    seedHerbInProgress()
    const before = snapshot()
    expect(useGameStore.getState().inspectApothecaryHerbRoute()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. 支线不存在 → false', () => {
    seedHerbInProgress()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_apothecary_herb_route') } }
    })
    useGameStore.getState().travelToLocation('village_grassland')
    const before = snapshot()
    expect(useGameStore.getState().inspectApothecaryHerbRoute()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('G. available/completable/completed → false', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    for (const status of ['available', 'completable', 'completed'] as const) {
      seedHerbStatus(status)
      const before = snapshot()
      expect(useGameStore.getState().inspectApothecaryHerbRoute()).toBe(false)
      expect(snapshot()).toBe(before)
    }
  })

  it('H. 首次 inspect → true + grassland_checked=true + status=completable + stage=0', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    expect(useGameStore.getState().inspectApothecaryHerbRoute()).toBe(true)
    expect(herbQuest()?.flags.grassland_checked).toBe(true)
    expect(herbQuest()?.status).toBe('completable')
    expect(herbQuest()?.stage).toBe(0)
  })

  it('I. grassland_checked=false → 可执行', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    seedHerbFlag('grassland_checked', false)
    expect(useGameStore.getState().inspectApothecaryHerbRoute()).toBe(true)
    expect(herbQuest()?.flags.grassland_checked).toBe(true)
  })

  it('J. grassland_checked=true 重复 → false 且同一引用不变', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().inspectApothecaryHerbRoute()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().inspectApothecaryHerbRoute()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it.each([
    ['grassland_checked 非 boolean ("yes")', 'yes'],
    ['grassland_checked 非 boolean (1)', 1],
    ['grassland_checked 非 boolean (0.5)', 0.5],
  ])('K. %s → false 且同一引用不变、原值保留', (_label, invalidValue) => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    seedHerbFlag('grassland_checked', invalidValue)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().inspectApothecaryHerbRoute()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(herbQuest()?.flags.grassland_checked).toBe(invalidValue)
  })

  it('L. inspect 无金币/HP/MP/物品等副作用', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOtherQuests = useGameStore.getState().gameState!.quests.filter((q) => q.questId !== 'quest_apothecary_herb_route')
    useGameStore.getState().inspectApothecaryHerbRoute()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(after.quests.filter((q) => q.questId !== 'quest_apothecary_herb_route')).toEqual(beforeOtherQuests)
    expect(flags()?.rabbit_path_reported).toBeUndefined()
  })

  it('M. completeQuest 后 → completed + gold 精确 +10', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().inspectApothecaryHerbRoute()
    useGameStore.getState().travelToLocation('qingshi_village')
    const goldBefore = useGameStore.getState().gameState!.player.gold
    expect(useGameStore.getState().completeQuest('quest_apothecary_herb_route')).toBe(true)
    expect(herbQuest()?.status).toBe('completed')
    expect(useGameStore.getState().gameState!.player.gold).toBe(goldBefore + 10)
  })

  it('N. 除 gold 与该 QuestState 外其他状态不变', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().inspectApothecaryHerbRoute()
    useGameStore.getState().travelToLocation('qingshi_village')
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOtherQuests = useGameStore.getState().gameState!.quests.filter((q) => q.questId !== 'quest_apothecary_herb_route')
    const goldBefore = beforePlayer.gold
    useGameStore.getState().completeQuest('quest_apothecary_herb_route')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual({ ...beforePlayer, gold: goldBefore + 10 })
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(after.quests.filter((q) => q.questId !== 'quest_apothecary_herb_route')).toEqual(beforeOtherQuests)
  })

  it('O. inspect 不自动保存', () => {
    seedHerbInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().inspectApothecaryHerbRoute()
    expect(herbQuest()?.status).toBe('completable')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-022：第二条支线《矿洞余患》（铁匠发布）', () => {
  const mineRemnantQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_blacksmith_mine_remnant')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const herbQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_apothecary_herb_route')
  const ironOre = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'iron_ore')
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 完成《矿洞清理》（支线发现前置；也顺带完成第一主线） */
  const seedMineCleanupCompleted = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
  }

  /** 走到支线 in_progress（接受后，青石村） */
  const seedRemnantInProgress = () => {
    seedMineCleanupCompleted()
    useGameStore.getState().discoverQuest('quest_blacksmith_mine_remnant')
    useGameStore.getState().acceptQuest('quest_blacksmith_mine_remnant')
  }

  /** 直接构造支线状态运行态 */
  const seedRemnantStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_blacksmith_mine_remnant' ? { ...q, status } : q,
          ),
        },
      }
    })
  }

  it('A. 矿洞清理未 completed → discover 支线 false', () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    expect(useGameStore.getState().discoverQuest('quest_blacksmith_mine_remnant')).toBe(false)
    expect(mineRemnantQuest()).toBeUndefined()
  })

  it('B. 矿洞清理 completed → discover true / available', () => {
    seedMineCleanupCompleted()
    expect(useGameStore.getState().discoverQuest('quest_blacksmith_mine_remnant')).toBe(true)
    expect(mineRemnantQuest()?.status).toBe('available')
    expect(mineRemnantQuest()?.stage).toBe(0)
  })

  it('C. accept → in_progress', () => {
    seedMineCleanupCompleted()
    useGameStore.getState().discoverQuest('quest_blacksmith_mine_remnant')
    expect(useGameStore.getState().acceptQuest('quest_blacksmith_mine_remnant')).toBe(true)
    expect(mineRemnantQuest()?.status).toBe('in_progress')
  })

  it('D. 非 corrupted_rat 胜利 → 不推进支线（corrupted_rabbit 无副作用，GameState 完全不变）', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('village_grassland')
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rabbit')).toBe(true)
    expect(mineRemnantQuest()?.status).toBe('in_progress')
    expect(snapshot()).toBe(before)
  })

  it('E. corrupted_rat 但不在 abandoned_mine → 不推进', () => {
    seedRemnantInProgress()
    // 支线 in_progress 时 corrupted_rat 只在废弃矿洞配置；直接伪造当前地点（村外草原无 rat 配置，resolveCombatVictory 会被 enemyIds 校验拒绝）
    useGameStore.getState().travelToLocation('village_grassland')
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('corrupted_rat')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. 支线 available → rat victory 不推进', () => {
    seedMineCleanupCompleted()
    useGameStore.getState().discoverQuest('quest_blacksmith_mine_remnant')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(mineRemnantQuest()?.status).toBe('available')
  })

  it('G. 支线 in_progress + 合法 rat victory → status=completable + stage=0', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(mineRemnantQuest()?.status).toBe('completable')
    expect(mineRemnantQuest()?.stage).toBe(0)
  })

  it('H. 同次胜利仍获得 iron_ore +1', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('abandoned_mine')
    const before = ironOre()?.quantity ?? 0
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(ironOre()?.quantity).toBe(before + 1)
  })

  it('I. 已 completable 后再打 rat → 支线保持 completable（不回退/重复推进）', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(mineRemnantQuest()?.status).toBe('completable')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(mineRemnantQuest()?.status).toBe('completable')
    expect(mineRemnantQuest()?.stage).toBe(0)
  })

  it('J. generic completeQuest → completed + gold 精确 +10', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    const goldBefore = useGameStore.getState().gameState!.player.gold
    expect(useGameStore.getState().completeQuest('quest_blacksmith_mine_remnant')).toBe(true)
    expect(mineRemnantQuest()?.status).toBe('completed')
    expect(useGameStore.getState().gameState!.player.gold).toBe(goldBefore + 10)
  })

  it('K. 除 iron_ore+1/支线 QuestState/提交 gold+10 外无其他状态变化', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('abandoned_mine')
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOre = ironOre()?.quantity ?? 0
    // 打 rat：只应发生 iron_ore +1 与支线 QuestState 推进（player/equipment/world 除 quests 外不变）
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    const mid = useGameStore.getState().gameState!
    expect(mid.player).toEqual(beforePlayer)
    expect(mid.equipment).toEqual(beforeEquipment)
    expect(mid.world).toEqual(beforeWorld)
    expect(ironOre()?.quantity).toBe(beforeOre + 1)
    expect(mineRemnantQuest()?.status).toBe('completable')
    // 回青石村提交：只应 gold +10 与该支线 QuestState→completed
    useGameStore.getState().travelToLocation('qingshi_village')
    const travelWorld = useGameStore.getState().gameState!.world
    const goldBefore = useGameStore.getState().gameState!.player.gold
    useGameStore.getState().completeQuest('quest_blacksmith_mine_remnant')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual({ ...mid.player, gold: goldBefore + 10 })
    expect(after.inventory).toEqual(mid.inventory)
    expect(after.equipment).toEqual(mid.equipment)
    expect(after.world).toEqual(travelWorld)
    expect(mineRemnantQuest()?.status).toBe('completed')
  })

  it('L. 黄金兔子第四主线完全不变（本卡流程不创建/不推进；E2E 层在完整存档上验证四 flag 保持）', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_blacksmith_mine_remnant')
    expect(goldenQuest()).toBeUndefined()
    expect(herbQuest()).toBeUndefined()
  })

  it('M. 不自动保存', () => {
    seedRemnantInProgress()
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    expect(mineRemnantQuest()?.status).toBe('completable')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-023：离开青石村前往天龙城（区域跨越）', () => {
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const herbQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_apothecary_herb_route')
  const mineRemnantQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_blacksmith_mine_remnant')
  const rabbitPath = () => useGameStore.getState().gameState?.inventory.find((e) => e.itemId === 'rabbit_path')
  const currentLocation = () => useGameStore.getState().gameState?.world.currentLocationId
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到青石村收束 + 两条支线 completed（可离村的完整合法状态） */
  const seedDepartureReady = () => {
    useGameStore.getState().newGame()
    useGameStore.getState().discoverQuest('quest_village_monsters')
    useGameStore.getState().acceptQuest('quest_village_monsters')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_rabbit')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_village_monsters')
    useGameStore.getState().discoverQuest('quest_mine_cleanup')
    useGameStore.getState().acceptQuest('quest_mine_cleanup')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_mine_cleanup')
    useGameStore.getState().discoverQuest('quest_grassland_wolf')
    useGameStore.getState().acceptQuest('quest_grassland_wolf')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().resolveCombatVictory('corrupted_wolf')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_grassland_wolf')
    useGameStore.getState().addItem('rabbit_path', 1)
    useGameStore.getState().inspectRabbitPath()
    useGameStore.getState().reportRabbitPathToVillageElder()
    useGameStore.getState().discoverQuest('quest_golden_rabbit_search')
    useGameStore.getState().acceptQuest('quest_golden_rabbit_search')
    useGameStore.getState().consultGoldenRabbitSearchNpc('blacksmith')
    useGameStore.getState().consultGoldenRabbitSearchNpc('apothecary')
    useGameStore.getState().reportGoldenRabbitVillageInvestigation()
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().travelToLocation('rabbit_lair')
    useGameStore.getState().recheckGoldenRabbitMapAtLair()
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().travelToLocation('qingshi_village')
    // 两条支线完成（避免阻止离村）
    useGameStore.getState().discoverQuest('quest_apothecary_herb_route')
    useGameStore.getState().acceptQuest('quest_apothecary_herb_route')
    useGameStore.getState().travelToLocation('village_grassland')
    useGameStore.getState().inspectApothecaryHerbRoute()
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_apothecary_herb_route')
    useGameStore.getState().discoverQuest('quest_blacksmith_mine_remnant')
    useGameStore.getState().acceptQuest('quest_blacksmith_mine_remnant')
    useGameStore.getState().travelToLocation('abandoned_mine')
    useGameStore.getState().resolveCombatVictory('corrupted_rat')
    useGameStore.getState().travelToLocation('qingshi_village')
    useGameStore.getState().completeQuest('quest_blacksmith_mine_remnant')
  }

  /** 直接构造黄金主线 flag 运行态 */
  const seedGoldenFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_golden_rabbit_search') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags[flagKey]
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, [flagKey]: value } }
          }),
        },
      }
    })
  }

  /** 直接构造黄金主线状态/位置运行态 */
  const seedGoldenStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_golden_rabbit_search' ? { ...q, status } : q,
          ),
        },
      }
    })
  }
  const seedGoldenStage = (stage: number) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_golden_rabbit_search' ? { ...q, stage } : q,
          ),
        },
      }
    })
  }

  /** 直接构造支线状态运行态 */
  const seedSideQuestStatus = (sideId: string, status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === sideId ? { ...q, status } : q)),
        },
      }
    })
  }

  /** 直接构造背包运行态（真实异常 quantity） */
  const seedRabbitPathQuantity = (quantity: unknown) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const without = s.gameState.inventory.filter((e) => e.itemId !== 'rabbit_path')
      if (quantity === undefined) {
        return { gameState: { ...s.gameState, inventory: without } }
      }
      return {
        gameState: {
          ...s.gameState,
          inventory: [...without, { itemId: 'rabbit_path', quantity: quantity as number }],
        },
      }
    })
  }

  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
  })

  it('B. 不在 qingshi_village → false', () => {
    seedDepartureReady()
    useGameStore.getState().travelToLocation('village_grassland')
    const before = snapshot()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. 黄金兔子任务不存在 → false', () => {
    seedDepartureReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_golden_rabbit_search') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('D. available/completable/completed → false', () => {
    seedDepartureReady()
    for (const status of ['available', 'completable', 'completed'] as const) {
      seedGoldenStatus(status)
      const before = snapshot()
      expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
      expect(snapshot()).toBe(before)
      seedGoldenStatus('in_progress')
    }
  })

  it('E. stage 非 0 → false', () => {
    seedDepartureReady()
    seedGoldenStage(1)
    const before = snapshot()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. 四个剧情 flag 任一个非 true → false', () => {
    for (const flagKey of ['asked_blacksmith', 'asked_apothecary', 'village_inquiry_reported', 'rabbit_lair_rechecked']) {
      seedDepartureReady()
      seedGoldenFlag(flagKey, false)
      const before = snapshot()
      expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
      expect(snapshot()).toBe(before)
    }
  })

  it.each([
    ['asked_blacksmith 非 boolean ("yes")', 'asked_blacksmith', 'yes'],
    ['asked_apothecary 非 boolean (1)', 'asked_apothecary', 1],
    ['village_inquiry_reported 非 boolean (0.5)', 'village_inquiry_reported', 0.5],
    ['rabbit_lair_rechecked 非 boolean ("yes")', 'rabbit_lair_rechecked', 'yes'],
  ])('G. %s → false 且同一引用不变（不修复）', (_label, flagKey, invalidValue) => {
    seedDepartureReady()
    seedGoldenFlag(flagKey, invalidValue)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(goldenQuest()?.flags[flagKey]).toBe(invalidValue)
  })

  it('H. 无 rabbit_path → false', () => {
    seedDepartureReady()
    seedRabbitPathQuantity(undefined)
    const before = snapshot()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['quantity=0', 0],
    ['quantity=-1', -1],
    ['quantity=1.5', 1.5],
    ['quantity=NaN', NaN],
    ['quantity=Infinity', Infinity],
  ])('I. %s → false 且同一引用不变', (_label, badQuantity) => {
    seedDepartureReady()
    seedRabbitPathQuantity(badQuantity)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('J. rabbit_path_examined !== true → false', () => {
    seedDepartureReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const nextFlags = { ...s.gameState.world.flags }
      nextFlags.rabbit_path_examined = false
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: nextFlags } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('K. rabbit_path_reported !== true → false', () => {
    seedDepartureReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const nextFlags = { ...s.gameState.world.flags }
      nextFlags.rabbit_path_reported = false
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: nextFlags } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('L. 两条支线均不存在 → 可以离开', () => {
    seedDepartureReady()
    // 支线已在 seed 中完成；删除它们模拟从未接触
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.filter((q) => q.questId !== 'quest_apothecary_herb_route' && q.questId !== 'quest_blacksmith_mine_remnant'),
        },
      }
    })
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(true)
    expect(currentLocation()).toBe('tianlong_city')
  })

  it('M. 支线 completed → 可以离开', () => {
    seedDepartureReady()
    expect(herbQuest()?.status).toBe('completed')
    expect(mineRemnantQuest()?.status).toBe('completed')
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(true)
    expect(currentLocation()).toBe('tianlong_city')
  })

  it('N. 支线 failed → 可以离开', () => {
    seedDepartureReady()
    seedSideQuestStatus('quest_apothecary_herb_route', 'failed')
    seedSideQuestStatus('quest_blacksmith_mine_remnant', 'failed')
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(true)
    expect(currentLocation()).toBe('tianlong_city')
  })

  it.each([
    ['quest_apothecary_herb_route available', 'quest_apothecary_herb_route', 'available'],
    ['quest_apothecary_herb_route in_progress', 'quest_apothecary_herb_route', 'in_progress'],
    ['quest_apothecary_herb_route completable', 'quest_apothecary_herb_route', 'completable'],
    ['quest_blacksmith_mine_remnant available', 'quest_blacksmith_mine_remnant', 'available'],
    ['quest_blacksmith_mine_remnant in_progress', 'quest_blacksmith_mine_remnant', 'in_progress'],
    ['quest_blacksmith_mine_remnant completable', 'quest_blacksmith_mine_remnant', 'completable'],
  ] as const)('O/P/Q. %s → false 且完全不变（不自动改 failed）', (_label, sideId, status) => {
    seedDepartureReady()
    seedSideQuestStatus(sideId, status)
    const before = snapshot()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(snapshot()).toBe(before)
    expect(useGameStore.getState().gameState?.quests.find((q) => q.questId === sideId)?.status).toBe(status)
  })

  it('R. 全合法 → true 且 currentLocationId=tianlong_city', () => {
    seedDepartureReady()
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(true)
    expect(currentLocation()).toBe('tianlong_city')
  })

  it('S. 成功只改 currentLocationId', () => {
    seedDepartureReady()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeQuests = useGameStore.getState().gameState!.quests
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeNpcStates = useGameStore.getState().gameState!.world.npcStates
    const beforeEvents = useGameStore.getState().gameState!.world.completedEvents
    useGameStore.getState().departQingshiVillageToTianlongCity()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.quests).toEqual(beforeQuests)
    expect(after.world.npcStates).toEqual(beforeNpcStates)
    expect(after.world.completedEvents).toEqual(beforeEvents)
    expect(after.world.currentLocationId).toBe('tianlong_city')
    expect(after.world.flags).toEqual(beforeWorld.flags)
    expect(after.world.flags.rabbit_path_reported).toBe(true)
  })

  it('T. golden quest 完全不变（长期保留）', () => {
    seedDepartureReady()
    const beforeGolden = goldenQuest()
    useGameStore.getState().departQingshiVillageToTianlongCity()
    const after = goldenQuest()
    expect(after?.status).toBe('in_progress')
    expect(after?.stage).toBe(0)
    expect(after?.flags.asked_blacksmith).toBe(true)
    expect(after?.flags.asked_apothecary).toBe(true)
    expect(after?.flags.village_inquiry_reported).toBe(true)
    expect(after?.flags.rabbit_lair_rechecked).toBe(true)
    expect(JSON.stringify(after)).toBe(JSON.stringify(beforeGolden))
  })

  it('U. rabbit_path 仍 ×1', () => {
    seedDepartureReady()
    useGameStore.getState().departQingshiVillageToTianlongCity()
    expect(rabbitPath()?.quantity).toBe(1)
  })

  it('V. 成功后再次调用 → false 且 GameState 同一引用不变', () => {
    seedDepartureReady()
    useGameStore.getState().departQingshiVillageToTianlongCity()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().departQingshiVillageToTianlongCity()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('W. 不自动保存', () => {
    seedDepartureReady()
    useGameStore.getState().departQingshiVillageToTianlongCity()
    expect(currentLocation()).toBe('tianlong_city')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-024：天龙城第一段——向王财询问黑石塔遭遇（第五主线剧情交接）', () => {
  const wangcaiQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_wangcai_trouble')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const currentLocation = () => useGameStore.getState().gameState?.world.currentLocationId
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到武馆接取第五主线（在天龙城、任务 in_progress、未 brief；同时构造带四历史 flag 的黄金兔子 QuestState 用于 N 项精确锁定） */
  const seedWangcaiInProgress = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: 'tianlong_city' },
          quests: [
            // 黄金兔子第四主线（带青石村收束四历史 flag；P1-023 离村后保持）
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
            ...s.gameState.quests,
            {
              questId: 'quest_wangcai_trouble',
              status: 'in_progress',
              stage: 0,
              flags: {},
            },
          ],
        },
      }
    })
  }

  /** 直接构造 wangcai_briefed 运行态 */
  const seedWangcaiBriefed = (value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_wangcai_trouble') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags.wangcai_briefed
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, wangcai_briefed: value } }
          }),
        },
      }
    })
  }

  it('A. 无 gameState → ask false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(false)
  })

  it('B. 不在 tianlong_city → false', () => {
    seedWangcaiInProgress()
    // 直接改位置（tianlong_city 与青石村不相邻，travelToLocation 无法表达）
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'qingshi_village' } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. quest 不存在 → false', () => {
    seedWangcaiInProgress()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['available', 'available'],
    ['completable', 'completable'],
    ['completed', 'completed'],
  ] as const)('D/E/F. quest %s → false', (_label, status) => {
    seedWangcaiInProgress()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status } : q)),
        },
      }
    })
    const before = snapshot()
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('G. in_progress + 未 brief → true + wangcai_briefed=true', () => {
    seedWangcaiInProgress()
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(true)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(true)
  })

  it('H. wangcai_briefed=false → 可成功 true', () => {
    seedWangcaiInProgress()
    seedWangcaiBriefed(false)
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(true)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(true)
  })

  it('I. 已 true → false 且 GameState 同一引用', () => {
    seedWangcaiInProgress()
    seedWangcaiBriefed(true)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it.each([
    ['"yes"', 'yes'],
    ['1', 1],
    ['0.5', 0.5],
  ])('J. wangcai_briefed 非 boolean（%s）→ false 且同一引用不变（不修复）', (_label, invalidValue) => {
    seedWangcaiInProgress()
    seedWangcaiBriefed(invalidValue)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(invalidValue)
  })

  it('K. 成功后 status 仍 in_progress、stage 仍 0', () => {
    seedWangcaiInProgress()
    useGameStore.getState().askWangcaiAboutTrouble()
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
  })

  it('L. 成功只改变该 QuestState flag（其他字段/其他 quests 全不变）', () => {
    seedWangcaiInProgress()
    const before = useGameStore.getState().gameState!
    const beforeQuests = JSON.stringify(before.quests)
    useGameStore.getState().askWangcaiAboutTrouble()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(before.player)
    expect(after.inventory).toEqual(before.inventory)
    expect(after.equipment).toEqual(before.equipment)
    expect(after.world).toEqual(before.world)
    // 只有 wangcai_trouble 的 flags 增加 wangcai_briefed=true
    const changed = after.quests.map((q) => JSON.stringify(q)).join('\n') !== beforeQuests
    expect(changed).toBe(true)
    const otherQuests = after.quests.filter((q) => q.questId !== 'quest_wangcai_trouble')
    const otherBefore = before.quests.filter((q) => q.questId !== 'quest_wangcai_trouble')
    expect(JSON.stringify(otherQuests)).toBe(JSON.stringify(otherBefore))
  })

  it('M. player/inventory/equipment/world/其他 quests/npcStates 全不变', () => {
    seedWangcaiInProgress()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeNpcStates = useGameStore.getState().gameState!.world.npcStates
    useGameStore.getState().askWangcaiAboutTrouble()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(after.world.npcStates).toEqual(beforeNpcStates)
    // 未创建马科/王财 npcState
    expect(after.world.npcStates.knight_captain_make).toBeUndefined()
    expect(after.world.npcStates.merchant_wangcai).toBeUndefined()
  })

  it('N. 黄金兔子主线完全不变（真实构造带四历史 flag 的 QuestState，整个深比较前后精确相等）', () => {
    seedWangcaiInProgress()
    const golden = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_golden_rabbit_search')!
    expect(golden.status).toBe('in_progress')
    expect(golden.stage).toBe(0)
    expect(golden.flags.asked_blacksmith).toBe(true)
    expect(golden.flags.asked_apothecary).toBe(true)
    expect(golden.flags.village_inquiry_reported).toBe(true)
    expect(golden.flags.rabbit_lair_rechecked).toBe(true)
    const beforeGolden = JSON.stringify(golden)
    expect(useGameStore.getState().askWangcaiAboutTrouble()).toBe(true)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(true)
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
    const afterGolden = useGameStore.getState().gameState!.quests.find((q) => q.questId === 'quest_golden_rabbit_search')!
    // 整个 QuestState 深比较（含四 flag 与 status/stage）
    expect(JSON.stringify(afterGolden)).toBe(beforeGolden)
    expect(afterGolden.status).toBe('in_progress')
    expect(afterGolden.stage).toBe(0)
    expect(afterGolden.flags.asked_blacksmith).toBe(true)
    expect(afterGolden.flags.asked_apothecary).toBe(true)
    expect(afterGolden.flags.village_inquiry_reported).toBe(true)
    expect(afterGolden.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('O. 不自动保存', () => {
    seedWangcaiInProgress()
    useGameStore.getState().askWangcaiAboutTrouble()
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-025：黑石塔一层——解锁路线与骷髅士兵清场', () => {
  const wangcaiQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_wangcai_trouble')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const currentLocation = () => useGameStore.getState().gameState?.world.currentLocationId
  const unlockFlag = () => useGameStore.getState().gameState?.world.flags.black_stone_tower_unlocked
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到王财已说明、黑石塔未解锁（天龙城；带黄金兔子四 flag QuestState 供 AC 深比较） */
  const seedTowerReady = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: 'tianlong_city' },
          quests: [
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
            ...s.gameState.quests,
            {
              questId: 'quest_wangcai_trouble',
              status: 'in_progress',
              stage: 0,
              flags: { wangcai_briefed: true },
            },
          ],
        },
      }
    })
  }

  /** 直接构造 wangcai quest flag 运行态 */
  const seedWangcaiFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_wangcai_trouble') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags[flagKey]
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, [flagKey]: value } }
          }),
        },
      }
    })
  }

  /** 直接构造 wangcai quest 状态/位置运行态 */
  const seedWangcaiStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status } : q)),
        },
      }
    })
  }
  const seedWangcaiStage = (stage: number) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage } : q)),
        },
      }
    })
  }
  const seedWorldFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const nextFlags = { ...s.gameState.world.flags }
      if (value === undefined) delete nextFlags[flagKey]
      else nextFlags[flagKey] = value as boolean
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: nextFlags } } }
    })
  }

  // ---------- 路线解锁 ----------
  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
  })

  it('B. 不在 tianlong_city → false', () => {
    seedTowerReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'qingshi_village' } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. Wangcai quest 不存在 → false', () => {
    seedTowerReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['available', 'available'],
    ['completable', 'completable'],
    ['completed', 'completed'],
  ] as const)('D. 非 in_progress（%s）→ false', (_label, status) => {
    seedTowerReady()
    seedWangcaiStatus(status)
    const before = snapshot()
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('E. stage != 0 → false', () => {
    seedTowerReady()
    seedWangcaiStage(1)
    const before = snapshot()
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['undefined', undefined],
    ['false', false],
  ])('F. wangcai_briefed %s → false', (_label, briefedValue) => {
    seedTowerReady()
    seedWangcaiFlag('wangcai_briefed', briefedValue)
    const before = snapshot()
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['"yes"', 'yes'],
    ['1', 1],
    ['0.5', 0.5],
  ])('G. wangcai_briefed 非 boolean（%s）→ false 且同一引用不变（不修复）', (_label, invalidValue) => {
    seedTowerReady()
    seedWangcaiFlag('wangcai_briefed', invalidValue)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(invalidValue)
  })

  it('H. unlock flag undefined → success true', () => {
    seedTowerReady()
    expect(unlockFlag()).toBeUndefined()
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(true)
    expect(unlockFlag()).toBe(true)
  })

  it('I. unlock flag false → success true', () => {
    seedTowerReady()
    seedWorldFlag('black_stone_tower_unlocked', false)
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(true)
    expect(unlockFlag()).toBe(true)
  })

  it('J. unlock flag true → repeat false 且 GameState 同一引用', () => {
    seedTowerReady()
    seedWorldFlag('black_stone_tower_unlocked', true)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it.each([
    ['"yes"', 'yes'],
    ['1', 1],
    ['0.5', 0.5],
  ])('K. unlock flag 非 boolean（%s）→ false 且原值保留（不修复）', (_label, invalidValue) => {
    seedTowerReady()
    seedWorldFlag('black_stone_tower_unlocked', invalidValue)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().unlockBlackStoneTowerInvestigation()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(unlockFlag()).toBe(invalidValue)
  })

  it('L. 成功只写 black_stone_tower_unlocked=true', () => {
    seedTowerReady()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeQuests = useGameStore.getState().gameState!.quests
    const beforeWorld = useGameStore.getState().gameState!.world
    useGameStore.getState().unlockBlackStoneTowerInvestigation()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.quests).toEqual(beforeQuests)
    expect(after.world.currentLocationId).toBe('tianlong_city')
    expect(after.world.flags.black_stone_tower_unlocked).toBe(true)
    // 除 unlock flag 外其他 world.flags 不变
    const beforeOtherFlags = { ...beforeWorld.flags }
    delete (beforeOtherFlags as Record<string, unknown>).black_stone_tower_unlocked
    const afterOtherFlags = { ...after.world.flags }
    delete (afterOtherFlags as Record<string, unknown>).black_stone_tower_unlocked
    expect(JSON.stringify(afterOtherFlags)).toBe(JSON.stringify(beforeOtherFlags))
  })

  it('M. Wangcai QuestState 整体不变（解锁不塞 Quest）', () => {
    seedTowerReady()
    const beforeQuest = JSON.stringify(wangcaiQuest())
    useGameStore.getState().unlockBlackStoneTowerInvestigation()
    expect(JSON.stringify(wangcaiQuest())).toBe(beforeQuest)
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(true)
  })

  it('N. 解锁前 travelToLocation(floor1) → false', () => {
    seedTowerReady()
    expect(useGameStore.getState().travelToLocation('black_stone_tower_floor1')).toBe(false)
    expect(currentLocation()).toBe('tianlong_city')
  })

  it('O. 解锁后 travelToLocation(floor1) → true', () => {
    seedTowerReady()
    useGameStore.getState().unlockBlackStoneTowerInvestigation()
    expect(useGameStore.getState().travelToLocation('black_stone_tower_floor1')).toBe(true)
    expect(currentLocation()).toBe('black_stone_tower_floor1')
  })

  it('P. 不自动保存', () => {
    seedTowerReady()
    useGameStore.getState().unlockBlackStoneTowerInvestigation()
    expect(unlockFlag()).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- 骷髅士兵胜利 ----------
  /** 走到黑石塔一层 + 解锁 + 任务 in_progress/briefed（可击败骷髅士兵的完整合法状态） */
  const seedSoldierFight = () => {
    seedTowerReady()
    useGameStore.getState().unlockBlackStoneTowerInvestigation()
    useGameStore.getState().travelToLocation('black_stone_tower_floor1')
  }

  it('Q. wrong location → false（不在黑石塔一层）', () => {
    seedTowerReady()
    useGameStore.getState().unlockBlackStoneTowerInvestigation()
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('R. Wangcai quest 不存在 → false', () => {
    seedSoldierFight()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['available', 'available'],
    ['completable', 'completable'],
    ['completed', 'completed'],
  ] as const)('S. quest %s → false', (_label, status) => {
    seedSoldierFight()
    seedWangcaiStatus(status)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('T. stage != 0 → false', () => {
    seedSoldierFight()
    seedWangcaiStage(1)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['undefined', undefined],
    ['false', false],
    ['"yes"', 'yes'],
    ['1', 1],
  ])('U. wangcai_briefed !== true（%s）→ false', (_label, briefedValue) => {
    seedSoldierFight()
    seedWangcaiFlag('wangcai_briefed', briefedValue)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('V. black_stone_tower_unlocked !== true → false', () => {
    seedSoldierFight()
    seedWorldFlag('black_stone_tower_unlocked', false)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('W. 首次合法胜利 → true 且 floor1_soldier_defeated=true', () => {
    seedSoldierFight()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(true)
    expect(wangcaiQuest()?.flags.floor1_soldier_defeated).toBe(true)
  })

  it('X. explicit false → 可成功 true', () => {
    seedSoldierFight()
    seedWangcaiFlag('floor1_soldier_defeated', false)
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(true)
    expect(wangcaiQuest()?.flags.floor1_soldier_defeated).toBe(true)
  })

  it('Y. 已 true → false 且 GameState 同一引用', () => {
    seedSoldierFight()
    seedWangcaiFlag('floor1_soldier_defeated', true)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it.each([
    ['"yes"', 'yes'],
    ['1', 1],
    ['0.5', 0.5],
  ])('Z. defeated 非 boolean（%s）→ false 且同一引用不变（不修复）', (_label, invalidValue) => {
    seedSoldierFight()
    seedWangcaiFlag('floor1_soldier_defeated', invalidValue)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_soldier')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor1_soldier_defeated).toBe(invalidValue)
  })

  it('AA. 成功后 quest 仍 in_progress/stage 0（不推进 status）', () => {
    seedSoldierFight()
    useGameStore.getState().resolveCombatVictory('skeleton_soldier')
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(true)
  })

  it('AB. 无金币/物品/装备奖励（胜利只改 quest flag）', () => {
    seedSoldierFight()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    useGameStore.getState().resolveCombatVictory('skeleton_soldier')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    // 无任何物品新增（不含骨头/骷髅碎片/黑石）
    expect(after.inventory.every((e) => !e.itemId.includes('bone') && !e.itemId.includes('skull') && !e.itemId.includes('black_stone'))).toBe(true)
  })

  it('AC. 黄金兔子 QuestState 整体深比较不变', () => {
    seedSoldierFight()
    const beforeGolden = JSON.stringify(goldenQuest())
    useGameStore.getState().resolveCombatVictory('skeleton_soldier')
    const afterGolden = JSON.stringify(goldenQuest())
    expect(afterGolden).toBe(beforeGolden)
    const golden = goldenQuest()
    expect(golden?.status).toBe('in_progress')
    expect(golden?.stage).toBe(0)
    expect(golden?.flags.asked_blacksmith).toBe(true)
    expect(golden?.flags.asked_apothecary).toBe(true)
    expect(golden?.flags.village_inquiry_reported).toBe(true)
    expect(golden?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('AD. 不自动保存', () => {
    seedSoldierFight()
    useGameStore.getState().resolveCombatVictory('skeleton_soldier')
    expect(wangcaiQuest()?.flags.floor1_soldier_defeated).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-026：黑石塔一层——骷髅队长 Boss 战与项链线索推进', () => {
  const wangcaiQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_wangcai_trouble')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到黑石塔一层 + 解锁 + 任务 in_progress/briefed + 士兵已击败（可打骷髅队长的完整合法状态） */
  const seedCaptainFight = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: 'tianlong_city', flags: { ...s.gameState.world.flags, black_stone_tower_unlocked: true } },
          quests: [
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
            ...s.gameState.quests,
            {
              questId: 'quest_wangcai_trouble',
              status: 'in_progress',
              stage: 0,
              flags: { wangcai_briefed: true, floor1_soldier_defeated: true },
            },
          ],
        },
      }
    })
    useGameStore.getState().travelToLocation('black_stone_tower_floor1')
  }

  /** 直接构造 wangcai quest flag/stage/status 运行态 */
  const seedWangcaiFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_wangcai_trouble') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags[flagKey]
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, [flagKey]: value } }
          }),
        },
      }
    })
  }
  const seedWangcaiStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status } : q)),
        },
      }
    })
  }
  const seedWangcaiStage = (stage: number) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage } : q)),
        },
      }
    })
  }
  const seedWorldFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const nextFlags = { ...s.gameState.world.flags }
      if (value === undefined) delete nextFlags[flagKey]
      else nextFlags[flagKey] = value as boolean
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: nextFlags } } }
    })
  }

  it('A. wrong location → false（不在黑石塔一层）', () => {
    seedCaptainFight()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_city' } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('B. Wangcai quest 不存在 → false', () => {
    seedCaptainFight()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, quests: s.gameState.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') } }
    })
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['available', 'available'],
    ['completable', 'completable'],
    ['completed', 'completed'],
  ] as const)('C. 非 in_progress（%s）→ false', (_label, status) => {
    seedCaptainFight()
    seedWangcaiStatus(status)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('D. stage != 0 → false', () => {
    seedCaptainFight()
    seedWangcaiStage(1)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['undefined', undefined],
    ['false', false],
    ['"yes"', 'yes'],
    ['1', 1],
  ])('E. wangcai_briefed !== true（%s）→ false', (_label, briefedValue) => {
    seedCaptainFight()
    seedWangcaiFlag('wangcai_briefed', briefedValue)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('F. black_stone_tower_unlocked !== true → false', () => {
    seedCaptainFight()
    seedWorldFlag('black_stone_tower_unlocked', false)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it.each([
    ['undefined', undefined],
    ['false', false],
  ])('G. floor1_soldier_defeated !== true（%s）→ false', (_label, soldierValue) => {
    seedCaptainFight()
    seedWangcaiFlag('floor1_soldier_defeated', soldierValue)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('H. captain flag undefined → 首次合法胜利 true', () => {
    seedCaptainFight()
    expect(wangcaiQuest()?.flags.floor1_captain_defeated).toBeUndefined()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(true)
  })

  it('I. captain flag false → 首次合法胜利 true', () => {
    seedCaptainFight()
    seedWangcaiFlag('floor1_captain_defeated', false)
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(true)
  })

  it('J. 成功 → floor1_captain_defeated=true', () => {
    seedCaptainFight()
    useGameStore.getState().resolveCombatVictory('skeleton_captain')
    expect(wangcaiQuest()?.flags.floor1_captain_defeated).toBe(true)
  })

  it('K. captain=true → 重复 false 且 GameState 同一引用', () => {
    seedCaptainFight()
    seedWangcaiFlag('floor1_captain_defeated', true)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it.each([
    ['"yes"', 'yes'],
    ['1', 1],
    ['0.5', 0.5],
  ])('L. captain 非 boolean（%s）→ false 且同一引用不变原值保留', (_label, invalidValue) => {
    seedCaptainFight()
    seedWangcaiFlag('floor1_captain_defeated', invalidValue)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_captain')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor1_captain_defeated).toBe(invalidValue)
  })

  it('M. 成功后 status 仍 in_progress/stage 仍 0/briefed 仍 true/soldier_defeated 仍 true', () => {
    seedCaptainFight()
    useGameStore.getState().resolveCombatVictory('skeleton_captain')
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
    expect(wangcaiQuest()?.flags.wangcai_briefed).toBe(true)
    expect(wangcaiQuest()?.flags.floor1_soldier_defeated).toBe(true)
  })

  it('N. 无金币/物品/装备/等级奖励', () => {
    seedCaptainFight()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    useGameStore.getState().resolveCombatVictory('skeleton_captain')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    // 无骷髅大剑/黑石/骨头/骷髅套装物品
    expect(
      after.inventory.every(
        (e) => !e.itemId.includes('greatsword') && !e.itemId.includes('black_stone') && !e.itemId.includes('bone') && !e.itemId.includes('skull'),
      ),
    ).toBe(true)
  })

  it('O. 除本 Quest flag 外其他 GameState 不变', () => {
    seedCaptainFight()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    const beforeWorld = useGameStore.getState().gameState!.world
    const beforeOtherQuests = JSON.stringify(
      useGameStore.getState().gameState!.quests.filter((q) => q.questId !== 'quest_wangcai_trouble'),
    )
    useGameStore.getState().resolveCombatVictory('skeleton_captain')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
    expect(after.world).toEqual(beforeWorld)
    expect(
      JSON.stringify(after.quests.filter((q) => q.questId !== 'quest_wangcai_trouble')),
    ).toBe(beforeOtherQuests)
  })

  it('P. 黄金兔子 QuestState 整体深比较不变', () => {
    seedCaptainFight()
    const beforeGolden = JSON.stringify(goldenQuest())
    useGameStore.getState().resolveCombatVictory('skeleton_captain')
    const afterGolden = JSON.stringify(goldenQuest())
    expect(afterGolden).toBe(beforeGolden)
    const golden = goldenQuest()
    expect(golden?.status).toBe('in_progress')
    expect(golden?.stage).toBe(0)
    expect(golden?.flags.asked_blacksmith).toBe(true)
    expect(golden?.flags.asked_apothecary).toBe(true)
    expect(golden?.flags.village_inquiry_reported).toBe(true)
    expect(golden?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('Q. 不自动保存', () => {
    seedCaptainFight()
    useGameStore.getState().resolveCombatVictory('skeleton_captain')
    expect(wangcaiQuest()?.flags.floor1_captain_defeated).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P1-027：黑石塔二层——武馆休整、僵尸与黑法师', () => {
  const wangcaiQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_wangcai_trouble')
  const goldenQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 走到黑石塔二层 + 第五主线全前置（士兵+队长均已击败）+ 二层已解锁的完整合法状态 */
  const seedFloor2Ready = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            currentLocationId: 'black_stone_tower_floor1',
            flags: { ...s.gameState.world.flags, black_stone_tower_unlocked: true, black_stone_tower_floor2_unlocked: true },
          },
          quests: [
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
            ...s.gameState.quests,
            {
              questId: 'quest_wangcai_trouble',
              status: 'in_progress',
              stage: 0,
              flags: { wangcai_briefed: true, floor1_soldier_defeated: true, floor1_captain_defeated: true },
            },
          ],
        },
      }
    })
    useGameStore.getState().travelToLocation('black_stone_tower_floor2')
  }

  /** 走到二层且僵尸已击败（可打黑法师的完整合法状态） */
  const seedBlackMageReady = () => {
    seedFloor2Ready()
    useGameStore.getState().resolveCombatVictory('tower_zombie')
  }

  /** 直接改第五主线 quest flag/stage/status 运行态 */
  const seedQuestFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_wangcai_trouble') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags[flagKey]
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, [flagKey]: value } }
          }),
        },
      }
    })
  }
  const seedQuestStatus = (status: QuestStatus) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status } : q)),
        },
      }
    })
  }
  const seedQuestStage = (stage: number) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage } : q)),
        },
      }
    })
  }
  const seedWorldFlag = (flagKey: string, value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      const nextFlags = { ...s.gameState.world.flags }
      if (value === undefined) delete nextFlags[flagKey]
      else nextFlags[flagKey] = value as boolean
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, flags: nextFlags } } }
    })
  }

  /** 构造「黑石塔一层 + 全前置成立」的合法解锁状态 */
  const seedUnlockReady = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            currentLocationId: 'black_stone_tower_floor1',
            flags: { ...s.gameState.world.flags, black_stone_tower_unlocked: true },
          },
          quests: [
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
            ...s.gameState.quests,
            {
              questId: 'quest_wangcai_trouble',
              status: 'in_progress',
              stage: 0,
              flags: { wangcai_briefed: true, floor1_soldier_defeated: true, floor1_captain_defeated: true },
            },
          ],
        },
      }
    })
  }

  // ---------- restAtTianlongMartialHall ----------
  it('R1. 武馆 HP 未满 → true 且 HP=maxHp', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_martial_hall' }, player: { ...s.gameState.player, hp: 5 } } }
    })
    const maxHp = useGameStore.getState().gameState!.player.maxHp
    expect(useGameStore.getState().restAtTianlongMartialHall()).toBe(true)
    expect(useGameStore.getState().gameState!.player.hp).toBe(maxHp)
  })

  it('R2. 武馆 MP 未满 → true 且 MP=maxMp', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_martial_hall' } } }
    })
    const player = useGameStore.getState().gameState!.player
    if (player.maxMp > 0) {
      useGameStore.setState((s) => {
        if (!s.gameState) return {}
        return { gameState: { ...s.gameState, player: { ...s.gameState.player, mp: 0 } } }
      })
      expect(useGameStore.getState().restAtTianlongMartialHall()).toBe(true)
      expect(useGameStore.getState().gameState!.player.mp).toBe(player.maxMp)
    } else {
      // 骑士无 MP：HP 未满同样可休整
      useGameStore.setState((s) => {
        if (!s.gameState) return {}
        return { gameState: { ...s.gameState, player: { ...s.gameState.player, hp: 1 } } }
      })
      expect(useGameStore.getState().restAtTianlongMartialHall()).toBe(true)
    }
  })

  it('R3. 武馆 HP=0 → true 且 HP=maxHp（软锁出口）', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_martial_hall' }, player: { ...s.gameState.player, hp: 0 } } }
    })
    const maxHp = useGameStore.getState().gameState!.player.maxHp
    expect(useGameStore.getState().restAtTianlongMartialHall()).toBe(true)
    expect(useGameStore.getState().gameState!.player.hp).toBe(maxHp)
  })

  it('R4. 武馆 HP/MP 全满 → false 且完整 GameState unchanged', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_martial_hall' } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().restAtTianlongMartialHall()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('R5. 非武馆（青石村）→ false 且完整 GameState unchanged', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, player: { ...s.gameState.player, hp: 1 } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().restAtTianlongMartialHall()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('R6. 成功仅 hp/mp 改变——Quest/world flags/inventory/金币/level 全不变', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_martial_hall' }, player: { ...s.gameState.player, hp: 1 } } }
    })
    const beforeQuest = JSON.stringify(useGameStore.getState().gameState!.quests)
    const beforeWorld = JSON.stringify(useGameStore.getState().gameState!.world)
    const beforeInventory = JSON.stringify(useGameStore.getState().gameState!.inventory)
    const beforeEquipment = JSON.stringify(useGameStore.getState().gameState!.equipment)
    const beforeGold = useGameStore.getState().gameState!.player.gold
    const beforeLevel = useGameStore.getState().gameState!.player.level
    useGameStore.getState().restAtTianlongMartialHall()
    const after = useGameStore.getState().gameState!
    expect(JSON.stringify(after.quests)).toBe(beforeQuest)
    expect(JSON.stringify(after.world)).toBe(beforeWorld)
    expect(JSON.stringify(after.inventory)).toBe(beforeInventory)
    expect(JSON.stringify(after.equipment)).toBe(beforeEquipment)
    expect(after.player.gold).toBe(beforeGold)
    expect(after.player.level).toBe(beforeLevel)
  })

  it('R7. 武馆休整不自动保存', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_martial_hall' }, player: { ...s.gameState.player, hp: 1 } } }
    })
    useGameStore.getState().restAtTianlongMartialHall()
    expect(useGameStore.getState().gameState!.player.hp).toBe(useGameStore.getState().gameState!.player.maxHp)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- unlockBlackStoneTowerFloor2 ----------
  it('U1. 全前置成立 + target undefined → true 且 black_stone_tower_floor2_unlocked=true', () => {
    seedUnlockReady()
    expect(useGameStore.getState().gameState!.world.flags.black_stone_tower_floor2_unlocked).toBeUndefined()
    expect(useGameStore.getState().unlockBlackStoneTowerFloor2()).toBe(true)
    expect(useGameStore.getState().gameState!.world.flags.black_stone_tower_floor2_unlocked).toBe(true)
  })

  it('U2. 全前置成立 + target false → true（允许首次成功）', () => {
    seedUnlockReady()
    seedWorldFlag('black_stone_tower_floor2_unlocked', false)
    expect(useGameStore.getState().unlockBlackStoneTowerFloor2()).toBe(true)
    expect(useGameStore.getState().gameState!.world.flags.black_stone_tower_floor2_unlocked).toBe(true)
  })

  it.each([
    ['错误 location', (s: GameState) => ({ ...s, world: { ...s.world, currentLocationId: 'tianlong_city' } })],
    ['任务不存在', (s: GameState) => ({ ...s, quests: s.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') })],
    ['错误 status available', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'available' as const } : q)) })],
    ['错误 status completed', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'completed' as const } : q)) })],
    ['错误 stage 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage: 1 } : q)) })],
    ['wangcai_briefed 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, wangcai_briefed: false } } : q)) })],
    ['black_stone_tower_unlocked 非 true', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_unlocked: false } } })],
    ['floor1_soldier_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_soldier_defeated: false } } : q)) })],
    ['floor1_captain_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_captain_defeated: false } } : q)) })],
    ['target 已经 true', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: true } } })],
    ['target "yes"', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: 'yes' as unknown as boolean } } })],
    ['target 1', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: 1 as unknown as boolean } } })],
    ['target 0.5', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: 0.5 as unknown as boolean } } })],
  ])('U3. unlockBlackStoneTowerFloor2 拒绝：%s（false 且完整 GameState unchanged）', (_label, mutate) => {
    seedUnlockReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: mutate(s.gameState) }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().unlockBlackStoneTowerFloor2()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('U4. 成功只写 target flag——Quest/player/inventory/equipment/其他 world.flags 全不变且不自动保存', () => {
    seedUnlockReady()
    const beforeQuest = JSON.stringify(useGameStore.getState().gameState!.quests)
    const beforePlayer = JSON.stringify(useGameStore.getState().gameState!.player)
    const beforeInventory = JSON.stringify(useGameStore.getState().gameState!.inventory)
    const beforeEquipment = JSON.stringify(useGameStore.getState().gameState!.equipment)
    useGameStore.getState().unlockBlackStoneTowerFloor2()
    const after = useGameStore.getState().gameState!
    expect(after.world.flags.black_stone_tower_floor2_unlocked).toBe(true)
    expect(JSON.stringify(after.quests)).toBe(beforeQuest)
    expect(JSON.stringify(after.player)).toBe(beforePlayer)
    expect(JSON.stringify(after.inventory)).toBe(beforeInventory)
    expect(JSON.stringify(after.equipment)).toBe(beforeEquipment)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- resolveCombatVictory('tower_zombie') ----------
  it('Z1. 合法僵尸胜利 → true 且只写 floor2_zombie_defeated=true', () => {
    seedFloor2Ready()
    expect(wangcaiQuest()?.flags.floor2_zombie_defeated).toBeUndefined()
    expect(useGameStore.getState().resolveCombatVictory('tower_zombie')).toBe(true)
    expect(wangcaiQuest()?.flags.floor2_zombie_defeated).toBe(true)
  })

  it('Z2. 僵尸胜利后任务保持 in_progress/stage 0', () => {
    seedFloor2Ready()
    useGameStore.getState().resolveCombatVictory('tower_zombie')
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
  })

  it('Z3. 僵尸胜利无 XP/金币/item/装备/等级奖励', () => {
    seedFloor2Ready()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    useGameStore.getState().resolveCombatVictory('tower_zombie')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
  })

  it('Z4. 僵尸重复胜利无额外副作用（第二次 false 且 GameState 同一引用）', () => {
    seedFloor2Ready()
    useGameStore.getState().resolveCombatVictory('tower_zombie')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('tower_zombie')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor2_zombie_defeated).toBe(true)
  })

  it.each([
    ['错误地点', (s: GameState) => ({ ...s, world: { ...s.world, currentLocationId: 'tianlong_city' } })],
    ['任务不存在', (s: GameState) => ({ ...s, quests: s.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') })],
    ['任务 available', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'available' as const } : q)) })],
    ['任务 stage 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage: 1 } : q)) })],
    ['wangcai_briefed 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, wangcai_briefed: false } } : q)) })],
    ['二层未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: false } } })],
    ['floor1_soldier_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_soldier_defeated: false } } : q)) })],
    ['floor1_captain_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_captain_defeated: false } } : q)) })],
    ['zombie flag "yes"', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: 'yes' as unknown as boolean } } : q)) })],
    ['zombie flag 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: 1 as unknown as boolean } } : q)) })],
    ['zombie flag 0.5', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: 0.5 as unknown as boolean } } : q)) })],
  ])('Z5. 僵尸胜利拒绝：%s（false 且完整 GameState unchanged）', (_label, mutate) => {
    seedFloor2Ready()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: mutate(s.gameState) }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('tower_zombie')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('Z6. 僵尸胜利不自动保存', () => {
    seedFloor2Ready()
    useGameStore.getState().resolveCombatVictory('tower_zombie')
    expect(wangcaiQuest()?.flags.floor2_zombie_defeated).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- resolveCombatVictory('black_mage') ----------
  it('M1. 僵尸未击败 → 黑法师胜利拒绝（false 且完整 GameState unchanged）', () => {
    seedFloor2Ready()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('black_mage')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor2_black_mage_defeated).toBeUndefined()
  })

  it('M2. 合法黑法师胜利 → true 且只写 floor2_black_mage_defeated=true', () => {
    seedBlackMageReady()
    expect(wangcaiQuest()?.flags.floor2_black_mage_defeated).toBeUndefined()
    expect(useGameStore.getState().resolveCombatVictory('black_mage')).toBe(true)
    expect(wangcaiQuest()?.flags.floor2_black_mage_defeated).toBe(true)
  })

  it('M3. 黑法师胜利后任务保持 in_progress/stage 0', () => {
    seedBlackMageReady()
    useGameStore.getState().resolveCombatVictory('black_mage')
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
  })

  it('M4. 黑法师胜利无 XP/金币/item/装备/治疗奖励', () => {
    seedBlackMageReady()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    useGameStore.getState().resolveCombatVictory('black_mage')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
  })

  it('M5. 黑法师重复胜利无额外副作用（第二次 false 且 GameState 同一引用）', () => {
    seedBlackMageReady()
    useGameStore.getState().resolveCombatVictory('black_mage')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('black_mage')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor2_black_mage_defeated).toBe(true)
  })

  it.each([
    ['错误 location', (s: GameState) => ({ ...s, world: { ...s.world, currentLocationId: 'tianlong_city' } })],
    ['二层未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: false } } })],
    ['floor1_captain_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_captain_defeated: false } } : q)) })],
    ['zombie flag "yes"', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: 'yes' as unknown as boolean } } : q)) })],
    ['zombie flag 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: 1 as unknown as boolean } } : q)) })],
    ['mage flag "yes"', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_black_mage_defeated: 'yes' as unknown as boolean } } : q)) })],
    ['mage flag 0.5', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_black_mage_defeated: 0.5 as unknown as boolean } } : q)) })],
  ])('M6. 黑法师胜利拒绝：%s（false 且完整 GameState unchanged）', (_label, mutate) => {
    seedBlackMageReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: mutate(s.gameState) }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('black_mage')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('M7. 黄金兔子 QuestState 整体深比较不变（僵尸+黑法师胜利后）', () => {
    seedBlackMageReady()
    const beforeGolden = JSON.stringify(goldenQuest())
    useGameStore.getState().resolveCombatVictory('black_mage')
    const afterGolden = JSON.stringify(goldenQuest())
    expect(afterGolden).toBe(beforeGolden)
    const golden = goldenQuest()
    expect(golden?.status).toBe('in_progress')
    expect(golden?.stage).toBe(0)
    expect(golden?.flags.asked_blacksmith).toBe(true)
    expect(golden?.flags.asked_apothecary).toBe(true)
    expect(golden?.flags.village_inquiry_reported).toBe(true)
    expect(golden?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('M8. 黑法师胜利不自动保存', () => {
    seedBlackMageReady()
    useGameStore.getState().resolveCombatVictory('black_mage')
    expect(wangcaiQuest()?.flags.floor2_black_mage_defeated).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- resolveCombatVictory('skeleton_warrior')（TM-P1-028） ----------

  /** 走到二层且僵尸+黑法师均已击败（可打骷髅战士的完整合法状态） */
  const seedWarriorReady = () => {
    seedBlackMageReady()
    useGameStore.getState().resolveCombatVictory('black_mage')
  }

  it('W1. 入口区两敌未全部击败 → 骷髅战士胜利拒绝（false 且完整 GameState unchanged）', () => {
    // 僵尸未击败（黑法师也未击败）
    seedFloor2Ready()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_warrior')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor2_skeleton_warrior_defeated).toBeUndefined()
    // 僵尸已击败但黑法师未击败
    seedBlackMageReady()
    const before2 = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_warrior')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before2)
    expect(wangcaiQuest()?.flags.floor2_skeleton_warrior_defeated).toBeUndefined()
  })

  it('W2. 合法骷髅战士胜利 → true 且只写 floor2_skeleton_warrior_defeated=true', () => {
    seedWarriorReady()
    expect(wangcaiQuest()?.flags.floor2_skeleton_warrior_defeated).toBeUndefined()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_warrior')).toBe(true)
    expect(wangcaiQuest()?.flags.floor2_skeleton_warrior_defeated).toBe(true)
  })

  it('W3. 骷髅战士胜利后任务保持 in_progress/stage 0', () => {
    seedWarriorReady()
    useGameStore.getState().resolveCombatVictory('skeleton_warrior')
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
  })

  it('W4. 骷髅战士胜利无 XP/金币/item/装备/治疗奖励', () => {
    seedWarriorReady()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeInventory = useGameStore.getState().gameState!.inventory
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    useGameStore.getState().resolveCombatVictory('skeleton_warrior')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.inventory).toEqual(beforeInventory)
    expect(after.equipment).toEqual(beforeEquipment)
  })

  it('W5. 骷髅战士重复胜利无额外副作用（第二次 false 且 GameState 同一引用）', () => {
    seedWarriorReady()
    useGameStore.getState().resolveCombatVictory('skeleton_warrior')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_warrior')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor2_skeleton_warrior_defeated).toBe(true)
  })

  it.each([
    ['错误 location', (s: GameState) => ({ ...s, world: { ...s.world, currentLocationId: 'tianlong_city' } })],
    ['任务不存在', (s: GameState) => ({ ...s, quests: s.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') })],
    ['任务 available', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'available' as const } : q)) })],
    ['任务 stage 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage: 1 } : q)) })],
    ['wangcai_briefed 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, wangcai_briefed: false } } : q)) })],
    ['二层未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: false } } })],
    ['floor1_soldier_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_soldier_defeated: false } } : q)) })],
    ['floor1_captain_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_captain_defeated: false } } : q)) })],
    ['zombie flag "yes"', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: 'yes' as unknown as boolean } } : q)) })],
    ['mage flag 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_black_mage_defeated: 1 as unknown as boolean } } : q)) })],
    ['warrior flag true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_skeleton_warrior_defeated: true } } : q)) })],
    ['warrior flag "yes"', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_skeleton_warrior_defeated: 'yes' as unknown as boolean } } : q)) })],
    ['warrior flag 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_skeleton_warrior_defeated: 1 as unknown as boolean } } : q)) })],
    ['warrior flag 0.5', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_skeleton_warrior_defeated: 0.5 as unknown as boolean } } : q)) })],
  ])('W6. 骷髅战士胜利拒绝：%s（false 且完整 GameState unchanged）', (_label, mutate) => {
    seedWarriorReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: mutate(s.gameState) }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_warrior')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('W7. 黄金兔子 QuestState 整体深比较不变（骷髅战士胜利后）', () => {
    seedWarriorReady()
    const beforeGolden = JSON.stringify(goldenQuest())
    useGameStore.getState().resolveCombatVictory('skeleton_warrior')
    const afterGolden = JSON.stringify(goldenQuest())
    expect(afterGolden).toBe(beforeGolden)
    const golden = goldenQuest()
    expect(golden?.status).toBe('in_progress')
    expect(golden?.stage).toBe(0)
    expect(golden?.flags.asked_blacksmith).toBe(true)
    expect(golden?.flags.asked_apothecary).toBe(true)
    expect(golden?.flags.village_inquiry_reported).toBe(true)
    expect(golden?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('W8. 骷髅战士胜利不自动保存', () => {
    seedWarriorReady()
    useGameStore.getState().resolveCombatVictory('skeleton_warrior')
    expect(wangcaiQuest()?.flags.floor2_skeleton_warrior_defeated).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- unlockBlackStoneTowerFloor3（TM-P1-029） ----------

  /** 走到二层且僵尸+黑法师+骷髅战士均已击败（可解锁三层的完整合法状态） */
  const seedFloor3UnlockReady = () => {
    seedWarriorReady()
    useGameStore.getState().resolveCombatVictory('skeleton_warrior')
  }

  it('U1. 合法解锁三层 → true 且只写 black_stone_tower_floor3_unlocked=true', () => {
    seedFloor3UnlockReady()
    expect(useGameStore.getState().gameState!.world.flags.black_stone_tower_floor3_unlocked).toBeUndefined()
    expect(useGameStore.getState().unlockBlackStoneTowerFloor3()).toBe(true)
    expect(useGameStore.getState().gameState!.world.flags.black_stone_tower_floor3_unlocked).toBe(true)
  })

  it.each([
    ['错误位置', (s: GameState) => ({ ...s, world: { ...s.world, currentLocationId: 'black_stone_tower_floor1' } })],
    ['任务不存在', (s: GameState) => ({ ...s, quests: s.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') })],
    ['任务 available', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'available' as const } : q)) })],
    ['任务 stage 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage: 1 } : q)) })],
    ['wangcai_briefed 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, wangcai_briefed: false } } : q)) })],
    ['黑石塔未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_unlocked: false } } })],
    ['二层未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: false } } })],
    ['floor1_soldier_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_soldier_defeated: false } } : q)) })],
    ['floor1_captain_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_captain_defeated: false } } : q)) })],
    ['zombie 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: false } } : q)) })],
    ['mage 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_black_mage_defeated: false } } : q)) })],
    ['warrior 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_skeleton_warrior_defeated: false } } : q)) })],
    ['target flag true', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor3_unlocked: true } } })],
    ['target flag "yes"', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor3_unlocked: 'yes' as unknown as boolean } } })],
    ['target flag 1', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor3_unlocked: 1 as unknown as boolean } } })],
    ['target flag 0.5', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor3_unlocked: 0.5 as unknown as boolean } } })],
  ])('U2. 解锁三层拒绝：%s（false 且完整 GameState unchanged）', (_label, mutate) => {
    seedFloor3UnlockReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: mutate(s.gameState) }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().unlockBlackStoneTowerFloor3()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('U3. 骷髅战士未击败 → 解锁三层拒绝（false 且完整 GameState unchanged）', () => {
    seedWarriorReady()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().unlockBlackStoneTowerFloor3()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(useGameStore.getState().gameState!.world.flags.black_stone_tower_floor3_unlocked).toBeUndefined()
  })

  it('U4. 解锁三层不自动保存', () => {
    seedFloor3UnlockReady()
    useGameStore.getState().unlockBlackStoneTowerFloor3()
    expect(useGameStore.getState().gameState!.world.flags.black_stone_tower_floor3_unlocked).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- resolveCombatVictory('skeleton_witch')（TM-P1-029） ----------

  /** 走到三层且全部前序成立（可打骷髅女妖的完整合法状态） */
  const seedWitchReady = () => {
    seedFloor3UnlockReady()
    useGameStore.getState().unlockBlackStoneTowerFloor3()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'black_stone_tower_floor3' } } }
    })
  }

  it('V1. 前序未全部击败 → 骷髅女妖胜利拒绝（false 且完整 GameState unchanged）', () => {
    // 非三层
    seedFloor3UnlockReady()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_witch')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    // 三层但三层未解锁
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'black_stone_tower_floor3' } } }
    })
    const before2 = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_witch')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before2)
  })

  it('V2. 合法骷髅女妖胜利 → true 且写 flag + 夔峒项链 ×1', () => {
    seedWitchReady()
    expect(wangcaiQuest()?.flags.floor3_skeleton_witch_defeated).toBeUndefined()
    expect(useGameStore.getState().resolveCombatVictory('skeleton_witch')).toBe(true)
    expect(wangcaiQuest()?.flags.floor3_skeleton_witch_defeated).toBe(true)
    const necklaces = useGameStore.getState().gameState!.inventory.filter((i) => i.itemId === 'kuidong_necklace')
    expect(necklaces).toHaveLength(1)
    expect(necklaces[0]?.quantity).toBe(1)
  })

  it('V3. 骷髅女妖胜利后任务保持 in_progress/stage 0（不设 completable）', () => {
    seedWitchReady()
    useGameStore.getState().resolveCombatVictory('skeleton_witch')
    expect(wangcaiQuest()?.status).toBe('in_progress')
    expect(wangcaiQuest()?.stage).toBe(0)
    expect(useGameStore.getState().gameState!.inventory.filter((i) => i.itemId === 'kuidong_necklace')).toHaveLength(1)
  })

  it('V4. 骷髅女妖胜利无金币/XP/等级/装备奖励（除项链外 player/equipment 全不变）', () => {
    seedWitchReady()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    useGameStore.getState().resolveCombatVictory('skeleton_witch')
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.equipment).toEqual(beforeEquipment)
  })

  it('V5. 骷髅女妖重复胜利无额外副作用（第二次 false 且 GameState 同一引用、项链不重复堆叠）', () => {
    seedWitchReady()
    useGameStore.getState().resolveCombatVictory('skeleton_witch')
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_witch')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.floor3_skeleton_witch_defeated).toBe(true)
    expect(useGameStore.getState().gameState!.inventory.filter((i) => i.itemId === 'kuidong_necklace')).toHaveLength(1)
  })

  it.each([
    ['错误 location', (s: GameState) => ({ ...s, world: { ...s.world, currentLocationId: 'black_stone_tower_floor2' } })],
    ['任务不存在', (s: GameState) => ({ ...s, quests: s.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') })],
    ['任务 available', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'available' as const } : q)) })],
    ['任务 stage 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage: 1 } : q)) })],
    ['wangcai_briefed 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, wangcai_briefed: false } } : q)) })],
    ['三层未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor3_unlocked: false } } })],
    ['floor1_captain_defeated 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_captain_defeated: false } } : q)) })],
    ['warrior 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_skeleton_warrior_defeated: false } } : q)) })],
    ['witch flag true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor3_skeleton_witch_defeated: true } } : q)) })],
    ['witch flag "yes"', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor3_skeleton_witch_defeated: 'yes' as unknown as boolean } } : q)) })],
    ['witch flag 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor3_skeleton_witch_defeated: 1 as unknown as boolean } } : q)) })],
    ['witch flag 0.5', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor3_skeleton_witch_defeated: 0.5 as unknown as boolean } } : q)) })],
  ])('V6. 骷髅女妖胜利拒绝：%s（false 且完整 GameState unchanged）', (_label, mutate) => {
    seedWitchReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: mutate(s.gameState) }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().resolveCombatVictory('skeleton_witch')).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('V7. 黄金兔子 QuestState 整体深比较不变（骷髅女妖胜利后）', () => {
    seedWitchReady()
    const beforeGolden = JSON.stringify(goldenQuest())
    useGameStore.getState().resolveCombatVictory('skeleton_witch')
    const afterGolden = JSON.stringify(goldenQuest())
    expect(afterGolden).toBe(beforeGolden)
    const golden = goldenQuest()
    expect(golden?.status).toBe('in_progress')
    expect(golden?.stage).toBe(0)
    expect(golden?.flags.asked_blacksmith).toBe(true)
    expect(golden?.flags.asked_apothecary).toBe(true)
    expect(golden?.flags.village_inquiry_reported).toBe(true)
    expect(golden?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('V8. 骷髅女妖胜利不自动保存', () => {
    seedWitchReady()
    useGameStore.getState().resolveCombatVictory('skeleton_witch')
    expect(wangcaiQuest()?.flags.floor3_skeleton_witch_defeated).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })

  // ---------- returnKuidongNecklaceToWangcai（TM-P1-030） ----------

  /** 击败骷髅女妖拿到项链并回到天龙城（可交还项链的完整合法状态） */
  const seedReturnNecklaceReady = () => {
    seedWitchReady()
    useGameStore.getState().resolveCombatVictory('skeleton_witch')
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_city' } } }
    })
  }

  it('X1. 合法交还项链 → true 且原子完成：删除项链 + flag=true + status=completable + stage 保持 0', () => {
    seedReturnNecklaceReady()
    expect(wangcaiQuest()?.flags.kuidong_necklace_returned).toBeUndefined()
    expect(useGameStore.getState().gameState!.inventory.filter((i) => i.itemId === 'kuidong_necklace')).toHaveLength(1)
    expect(useGameStore.getState().returnKuidongNecklaceToWangcai()).toBe(true)
    expect(wangcaiQuest()?.flags.kuidong_necklace_returned).toBe(true)
    expect(wangcaiQuest()?.status).toBe('completable')
    expect(wangcaiQuest()?.stage).toBe(0)
    expect(useGameStore.getState().gameState!.inventory.filter((i) => i.itemId === 'kuidong_necklace')).toHaveLength(0)
  })

  it.each([
    ['错误 location', (s: GameState) => ({ ...s, world: { ...s.world, currentLocationId: 'black_stone_tower_floor1' } })],
    ['任务不存在', (s: GameState) => ({ ...s, quests: s.quests.filter((q) => q.questId !== 'quest_wangcai_trouble') })],
    ['任务 available', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'available' as const } : q)) })],
    ['任务 stage 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, stage: 1 } : q)) })],
    ['wangcai_briefed 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, wangcai_briefed: false } } : q)) })],
    ['黑石塔未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_unlocked: false } } })],
    ['二层未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor2_unlocked: false } } })],
    ['三层未解锁', (s: GameState) => ({ ...s, world: { ...s.world, flags: { ...s.world.flags, black_stone_tower_floor3_unlocked: false } } })],
    ['soldier 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_soldier_defeated: false } } : q)) })],
    ['captain 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor1_captain_defeated: false } } : q)) })],
    ['zombie 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_zombie_defeated: false } } : q)) })],
    ['mage 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_black_mage_defeated: false } } : q)) })],
    ['warrior 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor2_skeleton_warrior_defeated: false } } : q)) })],
    ['witch 非 true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, floor3_skeleton_witch_defeated: false } } : q)) })],
    ['背包无项链', (s: GameState) => ({ ...s, inventory: s.inventory.filter((i) => i.itemId !== 'kuidong_necklace') })],
    ['项链 quantity 2', (s: GameState) => ({ ...s, inventory: s.inventory.map((i) => (i.itemId === 'kuidong_necklace' ? { ...i, quantity: 2 } : i)) })],
    ['项链两条 entry', (s: GameState) => ({ ...s, inventory: [...s.inventory, { itemId: 'kuidong_necklace', quantity: 1 }] })],
    ['returned flag true', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, kuidong_necklace_returned: true } } : q)) })],
    ['returned flag "yes"', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, kuidong_necklace_returned: 'yes' as unknown as boolean } } : q)) })],
    ['returned flag 1', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, kuidong_necklace_returned: 1 as unknown as boolean } } : q)) })],
    ['returned flag 0.5', (s: GameState) => ({ ...s, quests: s.quests.map((q) => (q.questId === 'quest_wangcai_trouble' ? { ...q, flags: { ...q.flags, kuidong_necklace_returned: 0.5 as unknown as boolean } } : q)) })],
  ])('X2. 交还项链拒绝：%s（false 且完整 GameState unchanged）', (_label, mutate) => {
    seedReturnNecklaceReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: mutate(s.gameState) }
    })
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().returnKuidongNecklaceToWangcai()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('X3. 交还项链无金币/XP/等级/装备奖励（player/equipment 全不变）', () => {
    seedReturnNecklaceReady()
    const beforePlayer = useGameStore.getState().gameState!.player
    const beforeEquipment = useGameStore.getState().gameState!.equipment
    useGameStore.getState().returnKuidongNecklaceToWangcai()
    const after = useGameStore.getState().gameState!
    expect(after.player).toEqual(beforePlayer)
    expect(after.equipment).toEqual(beforeEquipment)
  })

  it('X4. 重复交还无副作用（第二次 false 且 GameState 同一引用、项链不再出现）', () => {
    seedReturnNecklaceReady()
    useGameStore.getState().returnKuidongNecklaceToWangcai()
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().returnKuidongNecklaceToWangcai()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
    expect(wangcaiQuest()?.flags.kuidong_necklace_returned).toBe(true)
    expect(useGameStore.getState().gameState!.inventory.filter((i) => i.itemId === 'kuidong_necklace')).toHaveLength(0)
  })

  it('X5. 黄金兔子 QuestState 整体深比较不变（交还项链后）', () => {
    seedReturnNecklaceReady()
    const beforeGolden = JSON.stringify(goldenQuest())
    useGameStore.getState().returnKuidongNecklaceToWangcai()
    const afterGolden = JSON.stringify(goldenQuest())
    expect(afterGolden).toBe(beforeGolden)
    const golden = goldenQuest()
    expect(golden?.status).toBe('in_progress')
    expect(golden?.stage).toBe(0)
    expect(golden?.flags.asked_blacksmith).toBe(true)
    expect(golden?.flags.asked_apothecary).toBe(true)
    expect(golden?.flags.village_inquiry_reported).toBe(true)
    expect(golden?.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('X6. 交还项链不自动保存', () => {
    seedReturnNecklaceReady()
    useGameStore.getState().returnKuidongNecklaceToWangcai()
    expect(wangcaiQuest()?.flags.kuidong_necklace_returned).toBe(true)
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

// ---- Phase 2：天龙城北门新剧情（TM-P2-001 D）----

describe('TM-P2-001 D2：发现《北门失联》前置（仅《商人王财的麻烦》completed）', () => {
  const northQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')

  const seedWangcaiCompleted = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: [{ questId: 'quest_wangcai_trouble', status: 'completed', stage: 0, flags: {} }],
        },
      }
    })
  }

  it('A. 王财任务未完成（不存在）→ 不能发现', () => {
    useGameStore.getState().newGame()
    expect(useGameStore.getState().discoverQuest('quest_north_gate_missing_patrol')).toBe(false)
    expect(northQuest()).toBeUndefined()
  })

  it('B. 王财任务 in_progress → 不能发现', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: [{ questId: 'quest_wangcai_trouble', status: 'in_progress', stage: 0, flags: {} }],
        },
      }
    })
    expect(useGameStore.getState().discoverQuest('quest_north_gate_missing_patrol')).toBe(false)
    expect(northQuest()).toBeUndefined()
  })

  it('C. 王财任务 completed → 可发现（available）', () => {
    seedWangcaiCompleted()
    expect(useGameStore.getState().discoverQuest('quest_north_gate_missing_patrol')).toBe(true)
    expect(northQuest()?.status).toBe('available')
  })

  it('D. 已 available 不重复创建', () => {
    seedWangcaiCompleted()
    useGameStore.getState().discoverQuest('quest_north_gate_missing_patrol')
    const before = JSON.stringify(useGameStore.getState().gameState)
    expect(useGameStore.getState().discoverQuest('quest_north_gate_missing_patrol')).toBe(false)
    expect(JSON.stringify(useGameStore.getState().gameState)).toBe(before)
  })
})

describe('TM-P2-001 D3：investigateNorthGateTrail 北门痕迹调查', () => {
  const northQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
  const currentLocation = () => useGameStore.getState().gameState?.world.currentLocationId
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 北门 + 北门任务 in_progress/stage 0（未调查） */
  const seedNorthGateInProgress = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: 'tianlong_north_gate' },
          quests: [{ questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: {} }],
        },
      }
    })
  }

  /** 直接设置 trail flag 值（undefined 删除键） */
  const seedTrailFlag = (value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_north_gate_missing_patrol') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags.north_gate_trail_checked
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, north_gate_trail_checked: value } }
          }),
        },
      }
    })
  }

  it('A. 无 gameState → false', () => {
    useGameStore.setState({ gameState: null })
    expect(useGameStore.getState().investigateNorthGateTrail()).toBe(false)
  })

  it('B. 不在北门 → false（完全不变）', () => {
    seedNorthGateInProgress()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_city' } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().investigateNorthGateTrail()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. 任务不存在 → false', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_north_gate' } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().investigateNorthGateTrail()).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('D. 任务非 in_progress（available/completable/completed）→ false', () => {
    seedNorthGateInProgress()
    for (const status of ['available', 'completable', 'completed', 'failed'] as const) {
      useGameStore.setState((s) => {
        if (!s.gameState) return {}
        return {
          gameState: {
            ...s.gameState,
            quests: s.gameState.quests.map((q) => (q.questId === 'quest_north_gate_missing_patrol' ? { ...q, status } : q)),
          },
        }
      })
      expect(useGameStore.getState().investigateNorthGateTrail()).toBe(false)
    }
  })

  it('E. 非 boolean 异常 flag（"yes"/1/0.5）→ false 且完全不变（不修复）', () => {
    seedNorthGateInProgress()
    for (const bad of ['yes', 1, 0.5] as const) {
      seedTrailFlag(bad)
      const before = snapshot()
      expect(useGameStore.getState().investigateNorthGateTrail()).toBe(false)
      expect(snapshot()).toBe(before)
    }
  })

  it('F. 已 true 重复调用 → false 且 GameState 同一引用', () => {
    seedNorthGateInProgress()
    seedTrailFlag(true)
    const before = useGameStore.getState().gameState
    expect(useGameStore.getState().investigateNorthGateTrail()).toBe(false)
    expect(useGameStore.getState().gameState).toBe(before)
  })

  it('G. 成功 → 只写 quest.flags.north_gate_trail_checked=true（status/stage 不变）', () => {
    seedNorthGateInProgress()
    expect(useGameStore.getState().investigateNorthGateTrail()).toBe(true)
    expect(northQuest()?.flags.north_gate_trail_checked).toBe(true)
    expect(northQuest()?.status).toBe('in_progress')
    expect(northQuest()?.stage).toBe(0)
  })

  it('H. 调查不自动保存', () => {
    seedNorthGateInProgress()
    useGameStore.getState().investigateNorthGateTrail()
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P2-001 D4/D5：resolveCombatVictory 黑鬃魔狼（北门外）', () => {
  const northQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
  const currentLocation = () => useGameStore.getState().gameState?.world.currentLocationId
  const snapshot = () => JSON.stringify(useGameStore.getState().gameState)

  /** 北门 + 任务 in_progress/stage 0 + 已调查痕迹（可刷狼的合法前置） */
  const seedWolfReady = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: 'tianlong_north_gate' },
          quests: [
            {
              questId: 'quest_north_gate_missing_patrol',
              status: 'in_progress',
              stage: 0,
              flags: { north_gate_trail_checked: true },
            },
          ],
        },
      }
    })
  }

  /** 直接设置 wolf flag 值（undefined 删除键） */
  const seedWolfFlag = (value: string | number | boolean | undefined) => {
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) => {
            if (q.questId !== 'quest_north_gate_missing_patrol') return q
            if (value === undefined) {
              const nextFlags = { ...q.flags }
              delete nextFlags.north_gate_wolf_defeated
              return { ...q, flags: nextFlags }
            }
            return { ...q, flags: { ...q.flags, north_gate_wolf_defeated: value } }
          }),
        },
      }
    })
  }

  it('A. 未接任务 → 不能刷狼（胜利拒绝且完全不变）', () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_north_gate' } } }
    })
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('B. 未调查痕迹（trail_checked 非 true）→ 不能刷狼', () => {
    seedWolfReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_north_gate_missing_patrol' ? { ...q, flags: {} } : q,
          ),
        },
      }
    })
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('C. 任务非 in_progress / stage!=0 → 拒绝', () => {
    seedWolfReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          quests: s.gameState.quests.map((q) =>
            q.questId === 'quest_north_gate_missing_patrol' ? { ...q, status: 'available' as const, stage: 0 } : q,
          ),
        },
      }
    })
    expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(false)
  })

  it('D. 不在北门（其他地点）→ 拒绝', () => {
    seedWolfReady()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return { gameState: { ...s.gameState, world: { ...s.gameState.world, currentLocationId: 'tianlong_city' } } }
    })
    expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(false)
  })

  it('E. 非法 wolf flag（"yes"/1/0.5）→ 拒绝且完全不变（不修复）', () => {
    seedWolfReady()
    for (const bad of ['yes', 1, 0.5] as const) {
      seedWolfFlag(bad)
      const before = snapshot()
      expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(false)
      expect(snapshot()).toBe(before)
    }
  })

  it('F. 击败后不能复活（重复胜利拒绝且完全不变）', () => {
    seedWolfReady()
    expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(true)
    const before = snapshot()
    expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(false)
    expect(snapshot()).toBe(before)
  })

  it('G. 合法首次胜利 → wolf_defeated=true + status→completable（stage 保持 0；无金币/物品奖励）', () => {
    seedWolfReady()
    const goldBefore = useGameStore.getState().gameState?.player.gold
    const invBefore = JSON.stringify(useGameStore.getState().gameState?.inventory)
    expect(useGameStore.getState().resolveCombatVictory('black_mane_wolf')).toBe(true)
    expect(northQuest()?.flags.north_gate_wolf_defeated).toBe(true)
    expect(northQuest()?.status).toBe('completable')
    expect(northQuest()?.stage).toBe(0)
    expect(northQuest()?.flags.north_gate_trail_checked).toBe(true)
    expect(useGameStore.getState().gameState?.player.gold).toBe(goldBefore)
    expect(JSON.stringify(useGameStore.getState().gameState?.inventory)).toBe(invBefore)
  })

  it('H. 胜利不自动保存', () => {
    seedWolfReady()
    useGameStore.getState().resolveCombatVictory('black_mane_wolf')
    expect(useGameStore.getState().hasSave).toBe(false)
  })
})

describe('TM-P2-001 D6：完成《北门失联》（generic 提交，金币 +30）', () => {
  const northQuest = () => useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')

  const seedCompletable = () => {
    useGameStore.getState().newGame()
    useGameStore.setState((s) => {
      if (!s.gameState) return {}
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: 'tianlong_martial_hall' },
          quests: [
            {
              questId: 'quest_north_gate_missing_patrol',
              status: 'completable',
              stage: 0,
              flags: { north_gate_trail_checked: true, north_gate_wolf_defeated: true },
            },
          ],
        },
      }
    })
  }

  it('A. completable → completed 且金币 +30', () => {
    seedCompletable()
    const goldBefore = useGameStore.getState().gameState?.player.gold
    expect(useGameStore.getState().completeQuest('quest_north_gate_missing_patrol')).toBe(true)
    expect(northQuest()?.status).toBe('completed')
    expect(useGameStore.getState().gameState?.player.gold).toBe((goldBefore ?? 0) + 30)
  })

  it('B. 已完成不能重复奖励', () => {
    seedCompletable()
    useGameStore.getState().completeQuest('quest_north_gate_missing_patrol')
    const gold = useGameStore.getState().gameState?.player.gold
    expect(useGameStore.getState().completeQuest('quest_north_gate_missing_patrol')).toBe(false)
    expect(useGameStore.getState().gameState?.player.gold).toBe(gold)
  })

  it('C. 王财任务完成后《北门失联》任务保持完成（不反转）', () => {
    seedCompletable()
    useGameStore.getState().completeQuest('quest_north_gate_missing_patrol')
    expect(northQuest()?.status).toBe('completed')
    expect(useGameStore.getState().gameState?.player.level).toBe(1) // 不升级、不建经验系统
  })
})
