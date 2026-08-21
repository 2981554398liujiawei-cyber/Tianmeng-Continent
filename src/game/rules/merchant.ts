import { getItem, getNpc } from '../content'
import type { GameState } from '../types'

/** 商店报价的最小稳定契约：价格与物品定义解耦，便于后续扩展折扣/限购。 */
export interface MerchantOffer {
  itemId: string
  price: number
}

/** 王财当前出售的防具；商品顺序也是 UI 的稳定展示顺序。 */
export const MERCHANT_OFFERS: MerchantOffer[] = [
  { itemId: 'traveler_cloth_armor', price: 12 },
  { itemId: 'hardened_leather_armor', price: 30 },
  { itemId: 'chainmail_armor', price: 55 },
  { itemId: 'arcane_robe', price: 40 },
]

export const MERCHANT_NPC_ID = 'merchant_wangcai'

export function getMerchantOffer(itemId: string): MerchantOffer | undefined {
  return MERCHANT_OFFERS.find((offer) => offer.itemId === itemId)
}

export function canBuyMerchantItem(state: GameState | null | undefined, itemId: string): boolean {
  if (!state) return false
  const merchant = getNpc(MERCHANT_NPC_ID)
  const offer = getMerchantOffer(itemId)
  const item = getItem(itemId)
  if (!merchant || merchant.locationId !== state.world.currentLocationId || !offer || !item) return false
  if (item.type !== 'armor' || !Number.isSafeInteger(offer.price) || offer.price <= 0) return false
  return Number.isSafeInteger(state.player.gold) && state.player.gold >= offer.price
}
