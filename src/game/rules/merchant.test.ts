import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import type { ProfessionId } from '../types/character'
import {
  BLACKSMITH_MERCHANT_ID,
  WANGCAI_MERCHANT_ID,
  canBuyMerchantItem,
  getMerchantOffer,
  getMerchantOffers,
} from './merchant'

describe('TM-P2-005-R1 商人报价规则', () => {
  it('铁匠与王财报价按 merchantId 隔离，王财保留 8 金币桂花糕与防具', () => {
    expect(getMerchantOffers(BLACKSMITH_MERCHANT_ID).map((offer) => offer.itemId)).toEqual([
      'traveler_cloth_armor', 'hardened_leather_armor', 'chainmail_armor',
    ])
    expect(getMerchantOffer(BLACKSMITH_MERCHANT_ID, 'chainmail_armor')?.price).toBe(55)
    expect(getMerchantOffer(BLACKSMITH_MERCHANT_ID, 'arcane_robe')).toBeUndefined()
    expect(getMerchantOffer(WANGCAI_MERCHANT_ID, 'chainmail_armor')?.price).toBe(55)
    expect(getMerchantOffer(WANGCAI_MERCHANT_ID, 'tianlong_osmanthus_cake')?.price).toBe(8)
  })

  it.each<[ProfessionId, string, boolean]>([
    ['warrior', 'chainmail_armor', true],
    ['knight', 'chainmail_armor', true],
    ['ranger', 'chainmail_armor', false],
    ['mage', 'chainmail_armor', false],
    ['warrior', 'arcane_robe', false],
    ['knight', 'arcane_robe', false],
    ['ranger', 'arcane_robe', false],
    ['mage', 'arcane_robe', true],
  ])('%s 购买 %s => %s', (profession, itemId, expected) => {
    const state = createInitialGameState()
    state.world.currentLocationId = 'tianlong_city'
    state.player.profession = profession
    state.player.gold = 100
    expect(canBuyMerchantItem(state, WANGCAI_MERCHANT_ID, itemId)).toBe(expected)
  })

  it('桂花糕不受职业矩阵限制', () => {
    for (const profession of ['warrior', 'knight', 'ranger', 'mage'] as const) {
      const state = createInitialGameState()
      state.world.currentLocationId = 'tianlong_city'
      state.player.profession = profession
      expect(canBuyMerchantItem(state, WANGCAI_MERCHANT_ID, 'tianlong_osmanthus_cake')).toBe(true)
    }
  })
})
