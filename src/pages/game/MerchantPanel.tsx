import Button from '../../components/Button'
import { useGameStore } from '../../game/state/gameStore'
import { getItem } from '../../game/content'
import { getMerchantOffers } from '../../game/rules/merchant'
import type { ItemDefinition } from '../../game/content/items'

/**
 * 商店面板（TM-P2-006）：商品 | 效果 | 价格 | 操作。
 * 仅通过 NPC Interaction Panel 的「购买」入口打开，不常驻 GamePage。
 * 职业不可用 → 购买按钮 disabled + 提示。
 */
interface MerchantPanelProps {
  merchantId: string
  merchantName: string
  /** 额外单行商品（如药师的治疗药水；不注册到 MERCHANT_OFFERS 的散装商品） */
  extras?: { itemId: string; price?: number }[]
  /** 散装商品的自定义购买动作（如 buyHealingPotion），缺省走 buyMerchantItem */
  buyFnForExtra?: (itemId: string) => (() => boolean) | undefined
  /** 额外服务（如铁匠收购；显示在商品列表下方） */
  services?: { label: string; note: string; buttonLabel: string; disabled: boolean; disabledReason?: string; onAction: () => void }[]
}

function ProfessionHint({ item }: { item: ItemDefinition }) {
  if (item.type !== 'armor' || !item.allowedProfessions) return null
  return <span className="text-xs text-bone-500">{item.allowedProfessions.length === 1 ? '仅限法师' : ''}</span>
}

export default function MerchantPanel({ merchantId, merchantName, extras = [], buyFnForExtra, services = [] }: MerchantPanelProps) {
  const player = useGameStore((s) => s.gameState?.player)
  const buyMerchantItem = useGameStore((s) => s.buyMerchantItem)
  const buyHealingPotion = useGameStore((s) => s.buyHealingPotion)

  if (!player) return null

  const offers = getMerchantOffers(merchantId)

  const renderItemRow = (itemId: string, price: number | undefined, buyFn: () => boolean) => {
    const item = getItem(itemId)
    if (!item) return null
    const professionAllowed = item.type !== 'armor' || item.allowedProfessions?.includes(player.profession) === true
    const canAfford = price !== undefined && Number.isSafeInteger(player.gold) && player.gold >= price
    return (
      <div key={item.id} className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3">
        <div>
          <p className="font-bold text-bone-100">
            {item.name} <ProfessionHint item={item} />
          </p>
          <p className="mt-1 text-xs text-bone-500">
            {item.type === 'armor' ? `护甲 +${item.armorDefenseBonus ?? 0}` : item.healAmount !== undefined ? `恢复生命：${item.healAmount}` : item.description}
            {price !== undefined && <span> · {price} 金</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="primary"
            disabled={!professionAllowed || (price !== undefined && !canAfford)}
            onClick={buyFn}
          >
            购买
          </Button>
          {!professionAllowed ? (
            <span className="text-xs text-red-300">职业无法使用</span>
          ) : price !== undefined && !canAfford ? (
            <span className="text-xs text-red-300">金币不足</span>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div data-testid="merchant-panel" className="flex flex-col gap-3">
      <p className="text-sm text-bone-500">{merchantName}的商品</p>
      <div className="flex flex-col gap-2">
        {offers.map((offer) => renderItemRow(offer.itemId, offer.price, () => buyMerchantItem(merchantId, offer.itemId)))}
        {extras.map((extra) => {
          const custom = buyFnForExtra?.(extra.itemId)
          return renderItemRow(extra.itemId, extra.price, custom ?? (() => buyHealingPotion()))
        })}
      </div>
      {services.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {services.map((service) => (
            <div key={service.label} className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3">
              <div>
                <p className="font-bold text-bone-100">{service.label}</p>
                <p className="mt-1 text-xs text-bone-500">{service.note}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Button variant="primary" disabled={service.disabled} onClick={service.onAction}>
                  {service.buttonLabel}
                </Button>
                {service.disabled && service.disabledReason && (
                  <span className="text-xs text-red-300">{service.disabledReason}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
