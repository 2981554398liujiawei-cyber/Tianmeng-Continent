import { describe, expect, it } from 'vitest'
import { checkTravel } from './exploration'

describe('TM-P0-005：checkTravel 合法相邻移动', () => {
  it('青石村 → 村外草原：allowed', () => {
    expect(checkTravel('qingshi_village', 'village_grassland', {})).toEqual({ allowed: true })
  })

  it('青石村 → 废弃矿洞：allowed', () => {
    expect(checkTravel('qingshi_village', 'abandoned_mine', {})).toEqual({ allowed: true })
  })

  it('村外草原 → 青石村：allowed（双向连接）', () => {
    expect(checkTravel('village_grassland', 'qingshi_village', {})).toEqual({ allowed: true })
  })

  it('废弃矿洞 → 青石村：allowed', () => {
    expect(checkTravel('abandoned_mine', 'qingshi_village', {})).toEqual({ allowed: true })
  })

  it('兔王巢穴 → 村外草原：allowed', () => {
    expect(checkTravel('rabbit_lair', 'village_grassland', { rabbit_lair_unlocked: true })).toEqual({
      allowed: true,
    })
  })
})

describe('TM-P0-005：checkTravel 非相邻拒绝', () => {
  it('青石村 → 兔王巢穴：not_connected', () => {
    const r = checkTravel('qingshi_village', 'rabbit_lair', { rabbit_lair_unlocked: true })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('not_connected')
  })

  it('废弃矿洞 → 村外草原：not_connected', () => {
    const r = checkTravel('abandoned_mine', 'village_grassland', {})
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('not_connected')
  })
})

describe('TM-P0-005：锁定地点 requiredFlag', () => {
  it('flags 为空时村外草原 → 兔王巢穴：required_flag_missing', () => {
    const r = checkTravel('village_grassland', 'rabbit_lair', {})
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('required_flag_missing')
  })

  it('flags.rabbit_lair_unlocked = true 时允许', () => {
    const r = checkTravel('village_grassland', 'rabbit_lair', { rabbit_lair_unlocked: true })
    expect(r.allowed).toBe(true)
    expect(r.reason).toBeUndefined()
  })

  it.each([1, 'true', 0, 'false', false])('rabbit_lair_unlocked = %p 仍被阻止（必须严格 === true）', (value) => {
    const r = checkTravel('village_grassland', 'rabbit_lair', { rabbit_lair_unlocked: value })
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('required_flag_missing')
  })
})

describe('TM-P0-005：不存在地点拒绝', () => {
  it('未知 currentLocationId：current_location_not_found', () => {
    const r = checkTravel('nowhere', 'qingshi_village', {})
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('current_location_not_found')
  })

  it('未知 targetLocationId：target_location_not_found', () => {
    const r = checkTravel('qingshi_village', 'nowhere', {})
    expect(r.allowed).toBe(false)
    expect(r.reason).toBe('target_location_not_found')
  })
})

describe('TM-P0-005：无副作用（flags 不变）', () => {
  it('checkTravel 前后 flags 内容完全不变', () => {
    const flags: Record<string, boolean | number | string> = { rabbit_lair_unlocked: true, test_flag: 1 }
    const snapshot = JSON.stringify(flags)
    checkTravel('village_grassland', 'rabbit_lair', flags)
    checkTravel('qingshi_village', 'rabbit_lair', flags)
    checkTravel('nowhere', 'qingshi_village', flags)
    expect(JSON.stringify(flags)).toBe(snapshot)
  })
})
