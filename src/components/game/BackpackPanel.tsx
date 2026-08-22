import { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../Button'
import { getItem } from '../../game/content'
import type { ItemType } from '../../game/content/items'
import { RARITY_LABELS } from '../../game/types/loot'
import type { Equipment, Inventory, ItemSlot } from '../../game/types/item'
import type { ProfessionId } from '../../game/types/character'
import { getProfessionName } from '../../game/content/professions'

/**
 * 完整背包面板（TM-P2-007 §4 Backpack V2）。
 * 桌面：居中 Modal；移动：底部全高 Drawer（响应式同一容器）。
 * 分类 tabs 复用 ItemDefinition.type（§4.3 允许复用，不新增 category 字段）：
 *   equipment = weapon/armor/accessory、consumable、material、quest、special = gift。
 * 详情视图：稀有度 / 类型 / 属性 / 适用职业 / 价值 + [装备]/[卸下]/[使用]。
 * 本阶段无制作系统 → 材料不出现 [制作]；任务物品不可误使用。
 * UI ephemeral（useState 控制），不进入 GameState。
 */
export type BackpackTabKey = 'all' | 'equipment' | 'consumable' | 'material' | 'quest' | 'special'

export const BACKPACK_TAB_LABELS: Record<BackpackTabKey, string> = {
  all: '全部',
  equipment: '装备',
  consumable: '消耗品',
  material: '材料',
  quest: '任务',
  special: '特殊',
}

export const BACKPACK_TAB_KEYS = Object.keys(BACKPACK_TAB_LABELS) as BackpackTabKey[]

/** ItemType → tab 归属（未知/缺数据回退 'all'；复用 ItemType，不建重复 category 字段） */
export function itemTypeToTab(type: ItemType | undefined): BackpackTabKey {
  switch (type) {
    case 'weapon':
    case 'armor':
    case 'accessory':
      return 'equipment'
    case 'consumable':
      return 'consumable'
    case 'material':
      return 'material'
    case 'quest':
      return 'quest'
    case 'gift':
      return 'special'
    default:
      return 'all'
  }
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  weapon: '武器',
  armor: '防具',
  accessory: '饰品',
  consumable: '消耗品',
  quest: '任务物品',
  material: '材料',
  gift: '礼物',
}

export interface BackpackPanelProps {
  open: boolean
  onClose: () => void
  inventory: Inventory
  equipment: Equipment
  playerHp: number
  playerMaxHp: number
  profession: ProfessionId
  onEquipItem: (itemId: string) => boolean
  onUnequipSlot: (slot: ItemSlot) => boolean
  onUseItem: (itemId: string) => boolean
  ariaLabel?: string
}

/** 稳定排序：按物品名称（中文本地化），未知物品名回退 itemId */
export function sortInventoryByName(rows: { itemId: string; name: string }[]): { itemId: string; name: string }[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export default function BackpackPanel({
  open,
  onClose,
  inventory,
  equipment,
  playerHp,
  playerMaxHp,
  profession,
  onEquipItem,
  onUnequipSlot,
  onUseItem,
  ariaLabel,
}: BackpackPanelProps) {
  const [tab, setTab] = useState<BackpackTabKey>('all')
  const [detailItemId, setDetailItemId] = useState<string | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // 物品变化或关闭时重置到列表视图（避免详情指向已不存在/跨 tab 的物品）
  useEffect(() => {
    if (!open) setDetailItemId(null)
  }, [open, inventory])

  // ESC 关闭 + 初始 focus（复用 Modal/Drawer 的无障碍模式）
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    closeButtonRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  const rows = useMemo(() => {
    // 稳定名称排序（map 产生新数组，sort 不改原 inventory）
    return inventory
      .map((entry) => {
        const def = getItem(entry.itemId)
        return { entry, def, name: def?.name ?? '未知物品' }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }, [inventory])

  const visibleRows = tab === 'all' ? rows : rows.filter((r) => itemTypeToTab(r.def?.type) === tab)
  const detail = detailItemId ? rows.find((r) => r.entry.itemId === detailItemId) : undefined
  const detailEntry = detail?.entry

  if (!open) return null

  const slotFor = (type: ItemType): ItemSlot | null => {
    if (type === 'weapon') return 'weapon'
    if (type === 'armor') return 'armor'
    if (type === 'accessory') return 'accessory'
    return null
  }

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-ink-950/70" aria-hidden onClick={onClose} />
      {/* 面板：移动底部全高 Drawer / 桌面居中 Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? '背包'}
        className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-xl border-t border-ink-600 bg-ink-900 shadow-2xl sm:inset-0 sm:m-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded sm:border"
        data-testid="backpack-panel"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-600 px-5 py-3">
          <h3 className="text-base font-bold tracking-widest text-gold-300">
            背包
            <span data-testid="backpack-count" className="ml-3 text-xs font-normal text-bone-500">
              {inventory.length} 种物品
            </span>
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭背包"
            className="rounded border border-ink-600 bg-ink-800/60 px-3 py-1 text-sm text-bone-300 hover:bg-ink-700"
            onClick={onClose}
          >
            关闭
          </button>
        </header>

        {/* 分类 tabs */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-ink-600 px-3 py-2" aria-label="背包分类">
          {BACKPACK_TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              data-testid={`backpack-tab-${key}`}
              onClick={() => {
                setTab(key)
                setDetailItemId(null)
              }}
              className={`shrink-0 rounded border px-3 py-1 text-sm transition-colors ${
                tab === key
                  ? 'border-gold-500/60 bg-gold-900/30 text-gold-200'
                  : 'border-ink-600 bg-ink-800/60 text-bone-400 hover:bg-ink-700'
              }`}
            >
              {BACKPACK_TAB_LABELS[key]}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {detailEntry && detail ? (
            <ItemDetail
              itemId={detailEntry.itemId}
              entry={detailEntry}
              profession={profession}
              equipment={equipment}
              playerHp={playerHp}
              playerMaxHp={playerMaxHp}
              onBack={() => setDetailItemId(null)}
              onEquipItem={onEquipItem}
              onUnequipSlot={onUnequipSlot}
              onUseItem={onUseItem}
              slotFor={slotFor}
            />
          ) : visibleRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-bone-500">此分类下没有物品。</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibleRows.map(({ entry, def, name }) => (
                <li key={`${entry.itemId}-${entry.quantity}-${name}`}>
                  <button
                    type="button"
                    data-testid={`backpack-item-${entry.itemId}`}
                    onClick={() => setDetailItemId(entry.itemId)}
                    className="flex w-full items-center justify-between gap-3 rounded border border-ink-600 bg-ink-800/50 px-3 py-2 text-left hover:bg-ink-700/60"
                  >
                    <span className="min-w-0">
                      <span className="font-bold text-bone-100">{name}</span>
                      <span className="ml-2 text-xs text-bone-500">
                        {def?.rarity ? RARITY_LABELS[def.rarity] : ''}
                      </span>
                    </span>
                    <span data-testid={`backpack-qty-${entry.itemId}`} className="shrink-0 text-sm tabular-nums text-bone-300">
                      ×{entry.quantity}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** 物品详情视图（任务卡 §4.5：稀有度/类型/属性/适用职业/价值 + 装备/使用） */
function ItemDetail({
  itemId,
  entry,
  profession,
  equipment,
  playerHp,
  playerMaxHp,
  onBack,
  onEquipItem,
  onUnequipSlot,
  onUseItem,
  slotFor,
}: {
  itemId: string
  entry: { quantity: number }
  profession: ProfessionId
  equipment: Equipment
  playerHp: number
  playerMaxHp: number
  onBack: () => void
  onEquipItem: (itemId: string) => boolean
  onUnequipSlot: (slot: ItemSlot) => boolean
  onUseItem: (itemId: string) => boolean
  slotFor: (type: ItemType) => ItemSlot | null
}) {
  const def = getItem(itemId)
  if (!def) {
    return (
      <div data-testid={`backpack-detail-${itemId}`}>
        <p className="font-bold text-bone-100">未知物品</p>
        <p className="mt-1 text-xs text-bone-500">物品数据异常</p>
        <Button variant="ghost" className="mt-4" onClick={onBack}>
          返回
        </Button>
      </div>
    )
  }
  const type = def.type
  const slot = slotFor(type)
  const equipped = slot ? equipment[slot] === itemId : false
  const professionAllowed = !def.allowedProfessions || def.allowedProfessions.includes(profession)
  const isHealPotion = type === 'consumable' && Number.isInteger(def.healAmount) && (def.healAmount ?? 0) > 0
  const canUseHeal =
    isHealPotion && playerHp > 0 && playerHp < playerMaxHp && entry.quantity >= 1
  const isWeapon = type === 'weapon'
  const weaponBonus = isWeapon && Number.isInteger(def.weaponDamageBonus) ? (def.weaponDamageBonus ?? 0) : 0
  const armorBonus = type === 'armor' && Number.isInteger(def.armorDefenseBonus) ? (def.armorDefenseBonus ?? 0) : 0
  const accessoryBonus = type === 'accessory'

  return (
    <div data-testid={`backpack-detail-${itemId}`}>
      <p className="text-lg font-bold text-bone-100">
        {def.name}
        <span className="ml-3 text-sm font-normal text-bone-500">
          {def.rarity ? RARITY_LABELS[def.rarity] : '普通'}
        </span>
      </p>
      <p className="mt-1 text-sm text-bone-400">
        {ITEM_TYPE_LABELS[type]}
        <span className="ml-3 text-bone-500">×{entry.quantity}</span>
      </p>

      <div className="mt-3 space-y-1 text-sm text-bone-300">
        {weaponBonus > 0 && (
          <p>
            攻击 <span className="text-gold-300">+{weaponBonus}</span>
          </p>
        )}
        {armorBonus > 0 && (
          <p>
            护甲 <span className="text-gold-300">+{armorBonus}</span>
          </p>
        )}
        {accessoryBonus && <p className="text-bone-500">饰品（无额外属性）</p>}
        {type === 'consumable' && isHealPotion && (
          <p>
            使用后恢复 <span className="text-green-300">{def.healAmount}</span> 点生命
          </p>
        )}
        {type === 'quest' && <p className="text-bone-500">任务物品 · 不可使用</p>}
        {type === 'material' && <p className="text-bone-500">材料 · 本阶段不可制作</p>}
        {type === 'gift' && <p className="text-bone-500">礼物 · 赠予伙伴提升好感</p>}
      </div>

      <p className="mt-3 text-sm text-bone-300">
        适用：
        <span className="ml-1 text-bone-100">
          {def.allowedProfessions?.length ? def.allowedProfessions.map(getProfessionName).join(' / ') : '无限制'}
        </span>
      </p>
      <p className="mt-1 text-sm text-bone-300">
        价值：<span className="ml-1 tabular-nums text-gold-300">{def.value} 金</span>
      </p>

      <p className="mt-3 border-t border-ink-600 pt-3 text-xs leading-relaxed text-bone-500">{def.description}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {slot ? (
          equipped ? (
            <Button variant="primary" data-testid="backpack-unequip" onClick={() => onUnequipSlot(slot)}>
              卸下
            </Button>
          ) : (
            <Button
              variant="primary"
              data-testid="backpack-equip"
              disabled={!professionAllowed}
              onClick={() => onEquipItem(itemId)}
            >
              装备
            </Button>
          )
        ) : null}
        {type === 'consumable' && (
          <Button
            variant="primary"
            data-testid="backpack-use"
            disabled={!canUseHeal}
            onClick={() => onUseItem(itemId)}
          >
            使用
          </Button>
        )}
        {!professionAllowed && slot && !equipped && (
          <span className="text-xs text-red-300">当前职业无法装备</span>
        )}
        {isHealPotion && playerHp >= playerMaxHp && (
          <span className="text-xs text-bone-500">生命已满</span>
        )}
        {isHealPotion && playerHp <= 0 && <span className="text-xs text-red-300">当前无法使用</span>}
        <Button variant="ghost" className="ml-auto" data-testid="backpack-back" onClick={onBack}>
          返回
        </Button>
      </div>
    </div>
  )
}
