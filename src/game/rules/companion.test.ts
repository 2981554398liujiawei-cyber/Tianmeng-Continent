/**
 * 伙伴/队伍/休整纯规则测试（TM-P2-004 第 6/8/11/12/53-57/145-151 节）。
 * 覆盖：创建伙伴状态（level=player.level/mp=maxMp）、active 上限 3、去重、重新同行、
 * longRest（满资源合法、restCount+1、伙伴 MP 回满、周期重置、非安全地点拒绝）。
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_ACTIVE_COMPANIONS,
  createCompanionState,
  isCompanionStateSafe,
  activateCompanion,
  deactivateCompanion,
  isActive,
  canRejoinParty,
  isLongRestLocation,
  applyLongRest,
  restoreCompanionMp,
  resetRelationshipRestCycle,
} from './companion'
import { createInitialGameState } from '../content/initial'
import { getCompanion } from '../content'
import { createInitialRelationship } from './relationship'

const SAKURA = 'sakura_yuko'

function makeSakuraState(status: 'met' | 'guest' | 'recruited' = 'recruited') {
  const def = getCompanion(SAKURA)!
  return createCompanionState(def, 3, status)
}

describe('TM-P2-004：创建伙伴状态', () => {
  it('level = player.level；mp = maxMp = 6；learnedSkillIds = 注册表技能', () => {
    const companion = makeSakuraState('guest')
    expect(companion.level).toBe(3)
    expect(companion.maxMp).toBe(6)
    expect(companion.mp).toBe(6)
    expect(companion.learnedSkillIds).toEqual(['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'])
    expect(companion.status).toBe('guest')
  })

  it('isCompanionStateSafe：合法 true；非法 status/负 mp/越界 mp/空 id false', () => {
    const good = makeSakuraState()
    expect(isCompanionStateSafe(good)).toBe(true)
    expect(isCompanionStateSafe({ ...good, status: 'owned' as never })).toBe(false)
    expect(isCompanionStateSafe({ ...good, mp: -1 })).toBe(false)
    expect(isCompanionStateSafe({ ...good, mp: 7 })).toBe(false)
    expect(isCompanionStateSafe({ ...good, companionId: '' })).toBe(false)
    expect(isCompanionStateSafe({ ...good, level: 0 })).toBe(false)
  })
})

describe('TM-P2-004：队伍操作（上限 3 / 去重 / 暂不同行）', () => {
  it('激活：加入 activeCompanionIds；重复激活 no-op', () => {
    const party = { activeCompanionIds: [] as string[] }
    const next = activateCompanion(party, SAKURA)!
    expect(next.activeCompanionIds).toEqual([SAKURA])
    expect(activateCompanion(next, SAKURA)).toBeNull()
  })

  it('最多 MAX_ACTIVE_COMPANIONS=3；满员拒绝新激活', () => {
    const party = { activeCompanionIds: ['a', 'b', 'c'] }
    expect(activateCompanion(party, SAKURA)).toBeNull()
    expect(MAX_ACTIVE_COMPANIONS).toBe(3)
  })

  it('暂不同行：移除 active 但状态不变；可重新同行（有槽位）', () => {
    const party = { activeCompanionIds: [SAKURA] }
    const next = deactivateCompanion(party, SAKURA)
    expect(next.activeCompanionIds).toEqual([])
    expect(isActive(next, SAKURA)).toBe(false)
    expect(
      canRejoinParty({ sakura_yuko: { status: 'recruited' } }, next, SAKURA),
    ).toBe(true)
  })

  it('canRejoinParty：met 不可同行；已 active 不可；满员不可；未知不可', () => {
    expect(canRejoinParty({ sakura_yuko: { status: 'met' } }, { activeCompanionIds: [] }, SAKURA)).toBe(false)
    expect(canRejoinParty({ sakura_yuko: { status: 'recruited' } }, { activeCompanionIds: [SAKURA] }, SAKURA)).toBe(false)
    expect(canRejoinParty({ sakura_yuko: { status: 'recruited' } }, { activeCompanionIds: ['a', 'b', 'c'] }, SAKURA)).toBe(false)
    expect(canRejoinParty({}, { activeCompanionIds: [] }, SAKURA)).toBe(false)
  })
})

describe('TM-P2-004：Long Rest（第 53-57 节）', () => {
  function stateWithSakuraMp(mp: number, locationId = 'qingshi_village') {
    const gs = createInitialGameState()
    gs.player.hp = 5
    gs.player.mp = 2
    gs.world.currentLocationId = locationId
    gs.companions = { sakura_yuko: makeSakuraState('recruited') }
    gs.companions.sakura_yuko!.mp = mp
    gs.party = { activeCompanionIds: [SAKURA] }
    gs.relationships = { sakura_yuko: { ...createInitialRelationship(SAKURA), flags: { talksThisRest: 2, giftedThisRest: true } } }
    return gs
  }

  it('安全地点：玩家满资源 + 伙伴 MP 回满 + restCount+1 + 周期重置', () => {
    const gs = stateWithSakuraMp(1)
    expect(gs.player.hp).toBe(5)
    const next = applyLongRest(gs)!
    expect(next.player.hp).toBe(next.player.maxHp)
    expect(next.player.mp).toBe(next.player.maxMp)
    expect(next.companions.sakura_yuko!.mp).toBe(6)
    expect(next.world.restCount).toBe(1)
    expect(next.relationships.sakura_yuko!.flags.talksThisRest).toBe(0)
    expect(next.relationships.sakura_yuko!.flags.giftedThisRest).toBe(false)
  })

  it('满资源也允许（产品规则修改）：全满时成功且 restCount+1', () => {
    const gs = createInitialGameState()
    const next = applyLongRest(gs)!
    expect(next.world.restCount).toBe(1)
  })

  it('非安全地点（天龙城/神域/北门）→ null 且不变', () => {
    for (const loc of ['tianlong_city', 'sakura_domain_fragment', 'tianlong_north_gate', 'black_stone_tower_floor1']) {
      const gs = stateWithSakuraMp(1, loc)
      expect(applyLongRest(gs)).toBeNull()
    }
  })

  it('资源字段非法（hp 负数）→ null', () => {
    const gs = stateWithSakuraMp(1)
    gs.player.hp = -1
    expect(applyLongRest(gs)).toBeNull()
  })

  it('restoreCompanionMp 只恢复 guest/recruited（met 不动）', () => {
    const companions = {
      sakura_yuko: makeSakuraState('recruited'),
      met_one: { ...makeSakuraState('met'), mp: 2 },
    }
    const next = restoreCompanionMp(companions)
    expect(next.sakura_yuko!.mp).toBe(6)
    expect(next.met_one!.mp).toBe(2)
  })

  it('resetRelationshipRestCycle 重置全部关系周期（无关系时不报错）', () => {
    const next = resetRelationshipRestCycle({})
    expect(next).toEqual({})
    const rel = createInitialRelationship('x')
    expect(resetRelationshipRestCycle({ x: { ...rel, flags: { talksThisRest: 3, giftedThisRest: true } } }).x!.flags).toMatchObject({
      talksThisRest: 0,
      giftedThisRest: false,
    })
  })

  it('isLongRestLocation 白名单', () => {
    expect(isLongRestLocation('qingshi_village')).toBe(true)
    expect(isLongRestLocation('tianlong_martial_hall')).toBe(true)
    expect(isLongRestLocation('tianlong_city')).toBe(false)
  })
})
