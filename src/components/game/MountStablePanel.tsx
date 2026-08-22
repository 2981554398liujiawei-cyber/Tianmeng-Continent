import { useEffect, useRef, useState } from 'react'
import Button from '../Button'
import { MOUNTS, MOUNT_PRICES, getMount } from '../../game/content'
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../../game/content/professions'
import { RARITY_LABELS } from '../../game/types/loot'

/** 购买结果（与 store.buyMount 返回值一致） */
export type BuyMountResult =
  | 'bought'
  | 'locked'
  | 'unknown'
  | 'not_in_city'
  | 'not_enough_gold'
  | 'already_owned'

export interface MountStablePanelProps {
  open: boolean
  onClose: () => void
  ownedMountIds: string[]
  equippedMountId: string | null
  gold: number
  locationId: string
  onBuy: (mountId: string) => BuyMountResult
  onEquip: (mountId: string) => boolean
  onUnequip: () => boolean
  ariaLabel?: string
}

/**
 * 天龙城马厩（TM-P2-007 §19）。
 * 桌面：居中 Modal；移动：底部全高 Drawer（与 BackpackPanel 同一响应式容器模式）。
 * 坐骑 registry 全部列出：可购买（有登记价格）显示 [购买 80 金]；未开放显示「尚未开放获取」；
 * 已拥有显示 [装备]/[卸下]；装备中的标记「已装备」。
 * UI ephemeral（useState 控制），不进入 GameState。
 */
export default function MountStablePanel({
  open,
  onClose,
  ownedMountIds,
  equippedMountId,
  gold,
  locationId,
  onBuy,
  onEquip,
  onUnequip,
  ariaLabel,
}: MountStablePanelProps) {
  const [feedback, setFeedback] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // 关闭时清空反馈（避免残留上一条结果）
  useEffect(() => {
    if (!open) setFeedback(null)
  }, [open])

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

  if (!open) return null

  const notInCity = locationId !== 'tianlong_city'

  const handleBuy = (mountId: string) => {
    const result = onBuy(mountId)
    if (result === 'bought') {
      setFeedback({ text: '已收入马厩。可在左栏坐骑处装备。', tone: 'ok' })
    } else if (result === 'not_enough_gold') {
      setFeedback({ text: '金币不足。', tone: 'err' })
    } else if (result === 'not_in_city') {
      setFeedback({ text: '此处没有马厩。', tone: 'err' })
    } else if (result === 'already_owned') {
      setFeedback({ text: '已拥有此坐骑。', tone: 'err' })
    } else {
      setFeedback({ text: '无法购买此坐骑。', tone: 'err' })
    }
  }

  const mountIds = Object.keys(MOUNTS)

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-ink-950/70" aria-hidden onClick={onClose} />
      {/* 面板：移动底部全高 Drawer / 桌面居中 Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? '马厩'}
        className="absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-xl border-t border-ink-600 bg-ink-900 shadow-2xl sm:inset-0 sm:m-auto sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded sm:border"
        data-testid="mount-panel"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-600 px-5 py-3">
          <h3 className="text-base font-bold tracking-widest text-gold-300">
            马厩
            <span className="ml-3 text-xs font-normal text-bone-500">天龙城</span>
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭马厩"
            className="rounded border border-ink-600 bg-ink-800/60 px-3 py-1 text-sm text-bone-300 hover:bg-ink-700"
            onClick={onClose}
          >
            关闭
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {notInCity && (
            <p className="text-xs text-bone-500">当前不在天龙城，无法购买坐骑。</p>
          )}
          {feedback && (
            <p
              data-testid="mount-feedback"
              className={`text-sm ${feedback.tone === 'ok' ? 'text-green-300' : 'text-red-300'}`}
            >
              {feedback.text}
            </p>
          )}
          <p className="text-xs leading-relaxed text-bone-500">
            坐骑装备后不参与战斗，但会提升角色能力，并解锁探索能力。
          </p>
          {mountIds.map((id) => (
            <MountEntry
              key={id}
              mountId={id}
              owned={ownedMountIds.includes(id)}
              equipped={equippedMountId === id}
              gold={gold}
              canBuy={!notInCity}
              onBuy={handleBuy}
              onEquip={onEquip}
              onUnequip={onUnequip}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** 单匹坐骑条目：展示 + 购买/装备/卸下操作 */
function MountEntry({
  mountId,
  owned,
  equipped,
  gold,
  canBuy,
  onBuy,
  onEquip,
  onUnequip,
}: {
  mountId: string
  owned: boolean
  equipped: boolean
  gold: number
  canBuy: boolean
  onBuy: (mountId: string) => void
  onEquip: (mountId: string) => boolean
  onUnequip: () => boolean
}) {
  const def = getMount(mountId)
  if (!def) return null
  const price = MOUNT_PRICES[mountId]
  const affordable = price !== undefined && gold >= price

  const bonusText = ATTRIBUTE_KEYS.filter((key) => (def.attributeBonuses[key] ?? 0) > 0)
    .map((key) => `${ATTRIBUTE_LABELS[key]}+${def.attributeBonuses[key]}`)
    .join(' · ')

  return (
    <article
      data-testid={`mount-entry-${mountId}`}
      className="rounded border border-ink-600 bg-ink-800/50 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-bone-100">
          {def.name}
          <span className="ml-2 text-xs font-normal text-bone-500">
            {def.rarity ? RARITY_LABELS[def.rarity] : '普通'}
          </span>
        </p>
        {equipped ? (
          <span data-testid={`mount-state-${mountId}`} className="text-xs text-gold-300">
            已装备
          </span>
        ) : owned ? (
          <span data-testid={`mount-state-${mountId}`} className="text-xs text-bone-500">
            已拥有
          </span>
        ) : null}
      </div>

      {bonusText && (
        <p className="mt-1 text-sm text-gold-300">
          加成 <span className="text-bone-300">{bonusText}</span>
        </p>
      )}
      <p className="mt-1 text-xs leading-relaxed text-bone-400">{def.description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {equipped ? (
          <Button variant="primary" data-testid={`mount-unequip-${mountId}`} onClick={onUnequip}>
            卸下
          </Button>
        ) : owned ? (
          <Button variant="primary" data-testid={`mount-equip-${mountId}`} onClick={() => onEquip(mountId)}>
            装备
          </Button>
        ) : price !== undefined ? (
          <Button
            variant="primary"
            data-testid={`mount-buy-${mountId}`}
            disabled={!canBuy || !affordable}
            onClick={() => onBuy(mountId)}
          >
            购买 {price} 金
          </Button>
        ) : (
          <span className="text-xs text-bone-500">{def.acquisitionHint ?? '尚未开放获取。'}</span>
        )}
      </div>
    </article>
  )
}
