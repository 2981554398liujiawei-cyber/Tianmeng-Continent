import { beforeEach, describe, expect, it } from 'vitest'
import { useGameStore } from './gameStore'
import { createInitialGameState } from '../content/initial'

beforeEach(() => {
  useGameStore.setState({ gameState: createInitialGameState(), hasSave: false })
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
