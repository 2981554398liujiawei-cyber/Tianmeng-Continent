/**
 * 坐骑规则测试（TM-P2-007 §18.3/§20/§21）。
 * 覆盖：getEffectiveCharacterAttributes（有效五维）、hasTravelTag（探索标签）、canExploreMountTrail（optional 场景门槛）。
 */
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { CHI_TU_ID, FIRE_STALLION_ID, getMount } from '../content/mounts'
import type { GameState } from '../types/game'
import {
  canExploreMountTrail,
  canSearchNorthOutskirtsByMount,
  getEffectiveCharacterAttributes,
  hasTravelTag,
  MOUNT_TRAIL_REWARD_GOLD,
} from './mount'

function atLocation(state: GameState, locationId: string): GameState {
  return { ...state, world: { ...state.world, currentLocationId: locationId } }
}

function withMount(state: GameState, mountId: string, equipped = true): GameState {
  return {
    ...state,
    ownedMountIds: state.ownedMountIds.includes(mountId) ? state.ownedMountIds : [...state.ownedMountIds, mountId],
    equippedMountId: equipped ? mountId : state.equippedMountId,
  }
}

describe('getEffectiveCharacterAttributes', () => {
  it('无坐骑时返回原五维（引用不变）', () => {
    const state = createInitialGameState()
    expect(getEffectiveCharacterAttributes(state.player.attributes, null)).toBe(state.player.attributes)
  })

  it('未知坐骑 id 返回原五维', () => {
    const state = createInitialGameState()
    const result = getEffectiveCharacterAttributes(state.player.attributes, 'unknown_mount')
    expect(result).toBe(state.player.attributes)
  })

  it('火焰驹叠加 str+1 / agi+1，其余维不变', () => {
    const state = createInitialGameState()
    const base = state.player.attributes
    const result = getEffectiveCharacterAttributes(base, FIRE_STALLION_ID)
    expect(result.str).toBe(base.str + 1)
    expect(result.agi).toBe(base.agi + 1)
    expect(result.con).toBe(base.con)
    expect(result.mnd).toBe(base.mnd)
    expect(result.lck).toBe(base.lck)
  })

  it('赤兔驹只叠加 agi+2', () => {
    const state = createInitialGameState()
    const base = state.player.attributes
    const result = getEffectiveCharacterAttributes(base, CHI_TU_ID)
    expect(result.agi).toBe(base.agi + 2)
    expect(result.str).toBe(base.str)
    expect(result.con).toBe(base.con)
    expect(result.mnd).toBe(base.mnd)
    expect(result.lck).toBe(base.lck)
  })
})

describe('hasTravelTag', () => {
  it('未装备坐骑返回 false', () => {
    expect(hasTravelTag(createInitialGameState(), 'fast_travel')).toBe(false)
  })

  it('装备火焰驹：fast_travel → true，flight → false', () => {
    const state = withMount(createInitialGameState(), FIRE_STALLION_ID)
    expect(hasTravelTag(state, 'fast_travel')).toBe(true)
    expect(hasTravelTag(state, 'flight')).toBe(false)
  })

  it('装备未知坐骑 id 返回 false（数据兜底）', () => {
    const state = withMount(createInitialGameState(), 'unknown_mount')
    expect(hasTravelTag(state, 'fast_travel')).toBe(false)
  })
})

describe('canExploreMountTrail', () => {
  it('不在天龙城 → false', () => {
    const state = withMount(createInitialGameState(), FIRE_STALLION_ID)
    expect(canExploreMountTrail(state)).toBe(false)
  })

  it('天龙城但未装备坐骑 → false', () => {
    expect(canExploreMountTrail(atLocation(createInitialGameState(), 'tianlong_city'))).toBe(false)
  })

  it('天龙城 + 火焰驹 + 未探索 → true', () => {
    const state = withMount(atLocation(createInitialGameState(), 'tianlong_city'), FIRE_STALLION_ID)
    expect(canExploreMountTrail(state)).toBe(true)
  })

  it('已探索（flag 已固化）→ false（一次性）', () => {
    const state = withMount(atLocation(createInitialGameState(), 'tianlong_city'), FIRE_STALLION_ID)
    const done = { ...state, world: { ...state.world, flags: { ...state.world.flags, mount_trail_explored: 'found' } } }
    expect(canExploreMountTrail(done)).toBe(false)
  })

  it('奖励金币为固定正整数 8', () => {
    expect(MOUNT_TRAIL_REWARD_GOLD).toBe(8)
    expect(Number.isInteger(MOUNT_TRAIL_REWARD_GOLD) && MOUNT_TRAIL_REWARD_GOLD > 0).toBe(true)
  })

  it('火焰驹定义满足 fast_travel 标签（registry 与规则一致）', () => {
    const mount = getMount(FIRE_STALLION_ID)
    expect(mount?.travelTags).toContain('fast_travel')
  })
})

// ---- TM-P2-008 §50：北郊「沿官道快速搜索」（M1-4）----
describe('TM-P2-008 M1-4：canSearchNorthOutskirtsByMount（北郊 fast_travel 快速搜索门槛）', () => {
  it('M1：北郊 + 装备火焰驹 + 未搜索 → true', () => {
    const state = withMount(atLocation(createInitialGameState(), 'tianlong_north_outskirts'), FIRE_STALLION_ID)
    expect(canSearchNorthOutskirtsByMount(state)).toBe(true)
  })

  it('M2：不在北郊（天龙城）→ false', () => {
    const state = withMount(atLocation(createInitialGameState(), 'tianlong_city'), FIRE_STALLION_ID)
    expect(canSearchNorthOutskirtsByMount(state)).toBe(false)
  })

  it('M3：北郊但未装备坐骑 / 未知坐骑（无 fast_travel 兜底）→ false', () => {
    expect(canSearchNorthOutskirtsByMount(atLocation(createInitialGameState(), 'tianlong_north_outskirts'))).toBe(false)
    const state = withMount(atLocation(createInitialGameState(), 'tianlong_north_outskirts'), 'unknown_mount')
    expect(canSearchNorthOutskirtsByMount(state)).toBe(false)
  })

  it('M4：已搜索（north_outskirts_mount_search 已固化）→ false（一次性）', () => {
    const state = withMount(atLocation(createInitialGameState(), 'tianlong_north_outskirts'), FIRE_STALLION_ID)
    const done = {
      ...state,
      world: { ...state.world, flags: { ...state.world.flags, north_outskirts_mount_search: true } },
    }
    expect(canSearchNorthOutskirtsByMount(done)).toBe(false)
  })

  it('坐骑不攻击不进 initiative：北郊搜索不改敌人/遭遇状态（纯标记）', () => {
    const state = withMount(atLocation(createInitialGameState(), 'tianlong_north_outskirts'), FIRE_STALLION_ID)
    expect(canSearchNorthOutskirtsByMount(state)).toBe(true)
    // 无 encounter/combat 副作用字段被触碰（helper 只读）
    expect(state.world.encounterVariants).toEqual(createInitialGameState().world.encounterVariants)
  })
})
