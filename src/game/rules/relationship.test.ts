/**
 * 关系系统纯规则测试（TM-P2-004 第 15/16/17/20/21/22/63/64/69/70/71 节）。
 * 覆盖：clamp 0/100、NaN/Infinity/小数拒绝、±delta、stage 五档、无自动 romance、
 * romance/committed 需显式 flag、personalQuestStage 不参与普通 close、presence、交谈周期、礼物规则。
 */
import { describe, expect, it } from 'vitest'
import {
  AFFECTION_MAX,
  TRUST_MAX,
  createInitialRelationship,
  applyRelationshipDelta,
  stageOf,
  isCompanionPresent,
  canTalkGain,
  markTalk,
  hasGiftedThisRest,
  markGifted,
  giftAffectionGain,
  isRelationshipStateSafe,
  TALK_AFFECTION_GAIN,
  TALKS_PER_REST_LIMIT,
} from './relationship'

describe('TM-P2-004：关系初始化', () => {
  it('初次初始化 5/5 acquaintance（不初遇即高好感）', () => {
    const rel = createInitialRelationship('sakura_yuko')
    expect(rel.npcId).toBe('sakura_yuko')
    expect(rel.affection).toBe(5)
    expect(rel.trust).toBe(5)
    expect(rel.stage).toBe('acquaintance')
    expect(rel.personalQuestStage).toBe(0)
  })
})

describe('TM-P2-004：clamp 与 delta 安全', () => {
  it('正 delta 超上限 → clamp 100（不得 127/溢出）', () => {
    const rel = applyRelationshipDelta(createInitialRelationship('s'), { affection: 200, trust: 300 })
    expect(rel.affection).toBe(AFFECTION_MAX)
    expect(rel.trust).toBe(TRUST_MAX)
  })

  it('负 delta 超下限 → clamp 0（不得 -12）', () => {
    const rel = applyRelationshipDelta(createInitialRelationship('s'), { affection: -100, trust: -100 })
    expect(rel.affection).toBe(0)
    expect(rel.trust).toBe(0)
    expect(rel.stage).toBe('stranger')
  })

  it('±delta 正常累加', () => {
    const rel = applyRelationshipDelta(createInitialRelationship('s'), { affection: 3, trust: -2 })
    expect(rel.affection).toBe(8)
    expect(rel.trust).toBe(3)
  })

  it('NaN delta → throw（禁止污染关系数值）', () => {
    expect(() => applyRelationshipDelta(createInitialRelationship('s'), { affection: NaN })).toThrow(RangeError)
    expect(() => applyRelationshipDelta(createInitialRelationship('s'), { trust: Infinity })).toThrow(RangeError)
    expect(() => applyRelationshipDelta(createInitialRelationship('s'), { affection: 1.5 })).toThrow(RangeError)
  })

  it('isRelationshipStateSafe 拒绝 NaN/越界/小数/负 personalQuestStage', () => {
    const base = createInitialRelationship('s')
    expect(isRelationshipStateSafe(base)).toBe(true)
    expect(isRelationshipStateSafe({ ...base, affection: NaN })).toBe(false)
    expect(isRelationshipStateSafe({ ...base, trust: 150 })).toBe(false)
    expect(isRelationshipStateSafe({ ...base, affection: 2.5 })).toBe(false)
    expect(isRelationshipStateSafe({ ...base, personalQuestStage: -1 })).toBe(false)
  })
})

describe('TM-P2-004：stage 判定（数值档位 + 显式 flag）', () => {
  const base = createInitialRelationship('s')

  it('双低 → stranger', () => {
    const rel = applyRelationshipDelta(base, { affection: -5, trust: -5 })
    expect(rel.stage).toBe('stranger')
  })

  it('任一达基础认识 → acquaintance（默认 5/5 即 acquaintance）', () => {
    expect(stageOf(base)).toBe('acquaintance')
  })

  it('affection>=30 && trust>=25 → trusted', () => {
    const rel = applyRelationshipDelta(base, { affection: 25, trust: 20 })
    expect(rel.stage).toBe('trusted')
  })

  it('affection>=50 && trust>=40 → close', () => {
    const rel = applyRelationshipDelta(base, { affection: 45, trust: 35 })
    expect(rel.stage).toBe('close')
  })

  it('无显式 flag 时即使数值很高也不自动 romance', () => {
    const rel = applyRelationshipDelta(base, { affection: 99, trust: 99 })
    expect(rel.stage).toBe('close')
    expect(rel.stage).not.toBe('romance')
  })

  it('romance 必须显式 flags.romance_started===true', () => {
    const rel = { ...applyRelationshipDelta(base, { affection: 99, trust: 99 }), flags: { romance_started: true } }
    expect(stageOf(rel)).toBe('romance')
  })

  it('committed 必须显式 flags.committed===true（优先于 romance）', () => {
    const rel = { ...applyRelationshipDelta(base, { affection: 99, trust: 99 }), flags: { romance_started: true, committed: true } }
    expect(stageOf(rel)).toBe('committed')
  })

  it('personalQuestStage 不参与普通 close 判定（第 17 节：不是恋爱门槛）', () => {
    const rel = { ...applyRelationshipDelta(base, { affection: 99, trust: 99 }), personalQuestStage: 0 }
    expect(stageOf(rel)).toBe('close')
    const rel2 = { ...applyRelationshipDelta(base, { affection: 10, trust: 10 }), personalQuestStage: 5 }
    expect(stageOf(rel2)).toBe('acquaintance')
  })
})

describe('TM-P2-004：presence（第 21/22 节）', () => {
  it('active 伙伴（guest/recruited）→ 在场可响应', () => {
    expect(
      isCompanionPresent(
        { sakura_yuko: { status: 'recruited' }, other: { status: 'recruited' } },
        { activeCompanionIds: ['sakura_yuko'] },
        'sakura_yuko',
      ),
    ).toBe(true)
    expect(
      isCompanionPresent(
        { sakura_yuko: { status: 'guest' } },
        { activeCompanionIds: ['sakura_yuko'] },
        'sakura_yuko',
      ),
    ).toBe(true)
  })

  it('未 active / met / 未知 → 不在场', () => {
    expect(
      isCompanionPresent({ sakura_yuko: { status: 'recruited' } }, { activeCompanionIds: [] }, 'sakura_yuko'),
    ).toBe(false)
    expect(
      isCompanionPresent({ sakura_yuko: { status: 'met' } }, { activeCompanionIds: ['sakura_yuko'] }, 'sakura_yuko'),
    ).toBe(false)
    expect(isCompanionPresent({}, { activeCompanionIds: [] }, 'ghost')).toBe(false)
  })

  it('接口允许 active 在场 +2、inactive 0（调用方只对在场者应用）', () => {
    const active = isCompanionPresent(
      { a: { status: 'recruited' }, c: { status: 'recruited' } },
      { activeCompanionIds: ['a'] },
      'a',
    )
    const inactive = isCompanionPresent(
      { a: { status: 'recruited' }, c: { status: 'recruited' } },
      { activeCompanionIds: ['a'] },
      'c',
    )
    expect(active).toBe(true)
    expect(inactive).toBe(false)
  })
})

describe('TM-P2-004：交谈周期（第 63/64 节）', () => {
  it('每休整周期前 2 次有基础收益，之后不刷分', () => {
    const base = createInitialRelationship('s')
    expect(canTalkGain(base)).toBe(true)
    let rel = markTalk(applyRelationshipDelta(base, { affection: TALK_AFFECTION_GAIN }))
    expect(canTalkGain(rel)).toBe(true)
    rel = markTalk(rel)
    expect(canTalkGain(rel)).toBe(false)
    expect(rel.flags.talksThisRest).toBe(2)
  })

  it('TALKS_PER_REST_LIMIT = 2', () => {
    expect(TALKS_PER_REST_LIMIT).toBe(2)
  })
})

describe('TM-P2-004：礼物（第 69/70/71 节）', () => {
  const profile = { likedGiftTags: ['sweet', 'refined'], favoriteItemIds: ['favorite_cake'] }

  it('普通 +1 / liked +2 / favorite +4', () => {
    expect(giftAffectionGain(profile, { id: 'generic_item' })).toBe(1)
    expect(giftAffectionGain(profile, { id: 'osmanthus', giftTags: ['sweet'] })).toBe(2)
    expect(giftAffectionGain(profile, { id: 'favorite_cake' })).toBe(4)
  })

  it('无档案默认 +1；giftTags 缺失视为普通', () => {
    expect(giftAffectionGain(undefined, { id: 'x' })).toBe(1)
    expect(giftAffectionGain(profile, { id: 'x' })).toBe(1)
  })

  it('同休整周期只收一份（markGifted/hasGiftedThisRest）', () => {
    const rel = createInitialRelationship('s')
    expect(hasGiftedThisRest(rel)).toBe(false)
    const gifted = markGifted(rel)
    expect(hasGiftedThisRest(gifted)).toBe(true)
  })
})
