import { getItem, getNpc } from '../content'
import type { GameState } from '../types'

/** 商店报价的最小稳定契约：价格与物品定义解耦，便于后续扩展折扣/限购。 */
export interface MerchantOffer {
  merchantId: string
  itemId: string
  price: number
}

export const BLACKSMITH_MERCHANT_ID = 'blacksmith'
export const WANGCAI_MERCHANT_ID = 'merchant_wangcai'

/** 商品顺序也是 UI 的稳定展示顺序。 */
export const MERCHANT_OFFERS: MerchantOffer[] = [
  { merchantId: BLACKSMITH_MERCHANT_ID, itemId: 'traveler_cloth_armor', price: 12 },
  { merchantId: BLACKSMITH_MERCHANT_ID, itemId: 'hardened_leather_armor', price: 30 },
  { merchantId: BLACKSMITH_MERCHANT_ID, itemId: 'chainmail_armor', price: 55 },
  { merchantId: WANGCAI_MERCHANT_ID, itemId: 'traveler_cloth_armor', price: 12 },
  { merchantId: WANGCAI_MERCHANT_ID, itemId: 'hardened_leather_armor', price: 30 },
  { merchantId: WANGCAI_MERCHANT_ID, itemId: 'chainmail_armor', price: 55 },
  { merchantId: WANGCAI_MERCHANT_ID, itemId: 'arcane_robe', price: 40 },
  { merchantId: WANGCAI_MERCHANT_ID, itemId: 'tianlong_osmanthus_cake', price: 8 },
]

export function getMerchantOffers(merchantId: string): MerchantOffer[] {
  return MERCHANT_OFFERS.filter((offer) => offer.merchantId === merchantId)
}

export function getMerchantOffer(merchantId: string, itemId: string): MerchantOffer | undefined {
  return MERCHANT_OFFERS.find((offer) => offer.merchantId === merchantId && offer.itemId === itemId)
}

export function canBuyMerchantItem(state: GameState | null | undefined, merchantId: string, itemId: string): boolean {
  if (!state) return false
  const merchant = getNpc(merchantId)
  const offer = getMerchantOffer(merchantId, itemId)
  const item = getItem(itemId)
  if (!merchant || merchant.locationId !== state.world.currentLocationId || !offer || !item) return false
  if (item.type !== 'armor' && item.type !== 'gift') return false
  if (item.type === 'armor' && (!item.allowedProfessions || !item.allowedProfessions.includes(state.player.profession))) return false
  if (!Number.isSafeInteger(offer.price) || offer.price <= 0) return false
  return Number.isSafeInteger(state.player.gold) && state.player.gold >= offer.price
}
