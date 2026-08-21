import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_MAX,
  ATTRIBUTE_MIN,
  ATTRIBUTE_POINT_BUDGET,
  ATTRIBUTE_TOTAL,
  createInitialGameState,
  validateCreationInput,
} from './initial'
import type { CharacterCreationInput } from '../types'

const yunlan = (over: Partial<CharacterCreationInput> = {}): CharacterCreationInput => ({
  name: '云岚',
  gender: 'female',
  profession: 'mage',
  attributes: { str: 8, con: 10, agi: 10, mnd: 16, lck: 10 }, // 总和 54
  ...over,
})

describe('TM-P0-004-R1：属性点预算语义', () => {
  it('常量语义正确：8 最低 / 16 最高 / 14 点预算 / 总和 54', () => {
    expect(ATTRIBUTE_MIN).toBe(8)
    expect(ATTRIBUTE_MAX).toBe(16)
    expect(ATTRIBUTE_POINT_BUDGET).toBe(14)
    expect(ATTRIBUTE_TOTAL).toBe(54)
    expect(ATTRIBUTE_MIN * 5 + ATTRIBUTE_POINT_BUDGET).toBe(ATTRIBUTE_TOTAL)
  })
})

describe('TM-P0-004：默认创建兼容（无 input）', () => {
  it('仍生成默认开发角色石头城/骑士/五属性/HP/MP', () => {
    const state = createInitialGameState()
    expect(state.player.name).toBe('石头城')
    expect(state.player.gender).toBe('male')
    expect(state.player.profession).toBe('knight')
    expect(state.player.attributes).toEqual({ str: 14, con: 12, agi: 10, mnd: 8, lck: 10 })
    expect(state.player.hp).toBe(22)
    expect(state.player.maxHp).toBe(22)
    expect(state.player.mp).toBe(6)
    expect(state.player.maxMp).toBe(6)
    expect(state.player.level).toBe(1)
    expect(state.player.gold).toBe(50)
  })

  it('初始资源基线不变（背包/装备/任务/位置/世界）', () => {
    const state = createInitialGameState()
    expect(state.inventory).toEqual([
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ])
    expect(state.equipment).toEqual({ weapon: null, armor: 'traveler_cloth_armor', accessory: null })
    expect(state.quests).toEqual([])
    expect(state.world.currentLocationId).toBe('qingshi_village')
    expect(state.world.flags).toEqual({})
    expect(state.world.completedEvents).toEqual([])
    expect(state.world.npcStates).toEqual({})
  })
})

describe('TM-P0-004：自定义角色创建', () => {
  it('生成结果完全对应输入（云岚/法师/属性/HP/MP）', () => {
    const state = createInitialGameState(yunlan())
    expect(state.player.name).toBe('云岚')
    expect(state.player.gender).toBe('female')
    expect(state.player.profession).toBe('mage')
    expect(state.player.attributes).toEqual({ str: 8, con: 10, agi: 10, mnd: 16, lck: 10 })
    expect(state.player.maxHp).toBe(20) // 10 + CON10
    expect(state.player.hp).toBe(20)
    expect(state.player.maxMp).toBe(14) // 16 - 2
    expect(state.player.mp).toBe(14)
    expect(state.player.level).toBe(1)
    expect(state.player.gold).toBe(50)
    // 初始资源基线不变
    expect(state.inventory).toHaveLength(3)
    expect(state.quests).toEqual([])
  })

  it('姓名 trim 后写入', () => {
    const state = createInitialGameState(yunlan({ name: '  云岚  ' }))
    expect(state.player.name).toBe('云岚')
  })
})

describe('TM-P0-004：非法创建输入拒绝', () => {
  const expectReject = (input: CharacterCreationInput) => {
    expect(() => validateCreationInput(input)).toThrow()
    expect(() => createInitialGameState(input)).toThrow()
  }

  it('非法姓名：空串 / 纯空格 / 超过 16 字符', () => {
    expectReject(yunlan({ name: '' }))
    expectReject(yunlan({ name: '   ' }))
    expectReject(yunlan({ name: '一二三四五六七八九十一二三四五六七' })) // 17 字符
  })

  it('非法性别', () => {
    expectReject(yunlan({ gender: 'other' as never }))
  })

  it('非法职业', () => {
    expectReject(yunlan({ profession: 'cleric' as never }))
  })

  it('属性低于 8', () => {
    expectReject(yunlan({ attributes: { str: 7, con: 11, agi: 10, mnd: 16, lck: 10 } }))
  })

  it('属性高于 16', () => {
    expectReject(yunlan({ attributes: { str: 8, con: 17, agi: 10, mnd: 16, lck: 10 } }))
  })

  it('属性非整数', () => {
    expectReject(yunlan({ attributes: { str: 8.5, con: 10, agi: 10, mnd: 16, lck: 10 } }))
  })

  it('属性总和不是 54', () => {
    expectReject(yunlan({ attributes: { str: 9, con: 10, agi: 10, mnd: 16, lck: 10 } })) // 55
  })
})
