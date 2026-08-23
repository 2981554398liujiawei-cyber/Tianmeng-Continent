/**
 * 坐骑 Store actions 测试（TM-P2-007 §19/§21）。
 * 覆盖：buyMount 五态校验、equipMount/unequipMount、exploreMountTrail optional 检定。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from './gameStore'
import { createInitialGameState } from '../content/initial'
import { CHI_TU_ID, FIRE_STALLION_ID } from '../content/mounts'

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

const state = () => useGameStore.getState().gameState!

/** 到天龙城并把金币设为指定值 */
function atTianlongCityWithGold(goldAmount: number) {
  useGameStore.setState((s) => ({
    gameState: s.gameState
      ? {
          ...s.gameState,
          player: { ...s.gameState.player, gold: goldAmount },
          world: { ...s.gameState.world, currentLocationId: 'tianlong_city' },
        }
      : null,
  }))
}

describe('buyMount（TM-P2-007 §19）', () => {
  it('未知坐骑 id → unknown', () => {
    expect(useGameStore.getState().buyMount('nope')).toBe('unknown')
  })

  it('无价格登记的坐骑（赤兔驹）→ locked', () => {
    expect(useGameStore.getState().buyMount(CHI_TU_ID)).toBe('locked')
  })

  it('不在天龙城 → not_in_city', () => {
    // 默认初始位置非天龙城
    expect(useGameStore.getState().buyMount(FIRE_STALLION_ID)).toBe('not_in_city')
  })

  it('金币不足 → not_enough_gold', () => {
    atTianlongCityWithGold(50)
    expect(useGameStore.getState().buyMount(FIRE_STALLION_ID)).toBe('not_enough_gold')
  })

  it('购买成功：扣金 + 加入 ownedMountIds + 不自动装备', () => {
    atTianlongCityWithGold(100)
    const before = state()
    expect(before.equippedMountId).toBeNull()
    expect(before.ownedMountIds).not.toContain(FIRE_STALLION_ID)

    expect(useGameStore.getState().buyMount(FIRE_STALLION_ID)).toBe('bought')
    const after = state()
    expect(after.player.gold).toBe(20)
    expect(after.ownedMountIds).toContain(FIRE_STALLION_ID)
    expect(after.equippedMountId).toBeNull() // 购买后不自动装备
  })

  it('已拥有 → already_owned', () => {
    atTianlongCityWithGold(200)
    useGameStore.getState().buyMount(FIRE_STALLION_ID)
    expect(useGameStore.getState().buyMount(FIRE_STALLION_ID)).toBe('already_owned')
    expect(state().player.gold).toBe(120) // 不重复扣款
  })
})

describe('equipMount / unequipMount（TM-P2-007 §19）', () => {
  it('未知坐骑 → false', () => {
    expect(useGameStore.getState().equipMount('nope')).toBe(false)
  })

  it('未拥有 → false', () => {
    expect(useGameStore.getState().equipMount(FIRE_STALLION_ID)).toBe(false)
    expect(state().equippedMountId).toBeNull()
  })

  it('拥有后装备 → true 且设置 equippedMountId', () => {
    atTianlongCityWithGold(100)
    useGameStore.getState().buyMount(FIRE_STALLION_ID)
    expect(useGameStore.getState().equipMount(FIRE_STALLION_ID)).toBe(true)
    expect(state().equippedMountId).toBe(FIRE_STALLION_ID)
  })

  it('卸下 → true 且置空', () => {
    atTianlongCityWithGold(100)
    useGameStore.getState().buyMount(FIRE_STALLION_ID)
    useGameStore.getState().equipMount(FIRE_STALLION_ID)
    expect(useGameStore.getState().unequipMount()).toBe(true)
    expect(state().equippedMountId).toBeNull()
  })

  it('未装备时卸下 → false', () => {
    expect(useGameStore.getState().unequipMount()).toBe(false)
  })
})

describe('exploreMountTrail（TM-P2-007 §21 optional 检定）', () => {
  it('不满足条件（无坐骑）→ null 且状态不变', () => {
    atTianlongCityWithGold(100)
    const before = JSON.stringify(state())
    expect(useGameStore.getState().exploreMountTrail()).toBeNull()
    expect(JSON.stringify(state())).toBe(before)
  })

  it('不在天龙城 → null', () => {
    useGameStore.setState((s) => ({
      gameState: s.gameState ? { ...s.gameState, equippedMountId: FIRE_STALLION_ID } : null,
    }))
    expect(useGameStore.getState().exploreMountTrail()).toBeNull()
  })

  it('检定成功：gold +8、写 found、一次性', () => {
    atTianlongCityWithGold(100)
    useGameStore.getState().buyMount(FIRE_STALLION_ID)
    useGameStore.getState().equipMount(FIRE_STALLION_ID)
    vi.spyOn(Math, 'random').mockReturnValue(0.99) // roll 20 → critical_success
    const result = useGameStore.getState().exploreMountTrail()
    expect(result?.success).toBe(true)
    expect(state().player.gold).toBe(28) // 100 - 80(买马) + 8
    expect(state().world.flags.mount_trail_explored).toBe('found')
    // 一次性：已探索后不再触发
    expect(useGameStore.getState().exploreMountTrail()).toBeNull()
    expect(state().player.gold).toBe(28)
  })

  it('检定失败：gold 不变、写 nothing、一次性', () => {
    atTianlongCityWithGold(100)
    useGameStore.getState().buyMount(FIRE_STALLION_ID)
    useGameStore.getState().equipMount(FIRE_STALLION_ID)
    vi.spyOn(Math, 'random').mockReturnValue(0) // roll 1 → critical_failure
    const result = useGameStore.getState().exploreMountTrail()
    expect(result?.success).toBe(false)
    expect(state().player.gold).toBe(20) // 只有买马的 80，无奖励
    expect(state().world.flags.mount_trail_explored).toBe('nothing')
    expect(useGameStore.getState().exploreMountTrail()).toBeNull()
  })
})
