import { useState, type ReactNode } from 'react'
import Modal from '../../components/Modal'
import Button from '../../components/Button'
import MerchantPanel from './MerchantPanel'
import { useGameStore } from '../../game/state/gameStore'
import { BLACKSMITH_MERCHANT_ID, WANGCAI_MERCHANT_ID } from '../../game/rules/merchant'
import type { NpcDefinition } from '../../game/content/npcs'

/**
 * NPC 交互面板（TM-P2-006）：统一的事务型二级 UI。
 * 点击附近人物的「交谈」打开；面板内：交谈正文 / 购买（MerchantPanel） / 相关委托 / 离开。
 * 不新开路由；UI ephemeral state（useState）。
 */
export interface NearbyQuestInfo {
  questId: string
  title: string
  status: 'undiscovered' | 'available'
}

/** 铁匠/药师等散装商品与服务（由 GamePage 组装，保持 store 动作接线集中） */
export interface NpcShopExtras {
  /** 额外单行商品（如药师的治疗药水） */
  items: { itemId: string; price?: number; buy: () => boolean }[]
  /** 额外服务（如铁匠收购） */
  services: { label: string; note: string; buttonLabel: string; disabled: boolean; disabledReason?: string; onAction: () => void }[]
}

interface NpcInteractionPanelProps {
  npc: NpcDefinition
  /** 交谈正文（greeting + 剧情选项；由 GamePage 传入，保持剧情逻辑集中） */
  dialogContent: ReactNode
  /** 该 NPC 当前地点的相关委托 */
  nearbyQuests: NearbyQuestInfo[]
  /** TM-P2-006：额外散装商品/服务（药师药水、铁匠收购） */
  shopExtras?: NpcShopExtras
  onClose: () => void
}

/** 拥有购买服务的 NPC → merchantId（无则隐藏购买入口；药师等散装商品走 shopExtras） */
function merchantIdFor(npcId: string): string | null {
  if (npcId === BLACKSMITH_MERCHANT_ID || npcId === WANGCAI_MERCHANT_ID) return npcId
  return null
}

export default function NpcInteractionPanel({ npc, dialogContent, nearbyQuests, shopExtras, onClose }: NpcInteractionPanelProps) {
  const [view, setView] = useState<'talk' | 'shop' | 'quests'>('talk')
  const merchantId = merchantIdFor(npc.id)
  const hasShop = merchantId !== null || (shopExtras?.items.length ?? 0) > 0
  const acceptQuest = useGameStore((s) => s.acceptQuest)
  const discoverQuest = useGameStore((s) => s.discoverQuest)

  const handleQuestAction = (questId: string, status: 'undiscovered' | 'available') => {
    if (status === 'undiscovered') discoverQuest(questId)
    else acceptQuest(questId)
  }

  return (
    <Modal open onClose={onClose} title={`${npc.name} · ${npc.role}`} ariaLabel={`与${npc.name}交谈`}>
      {/* 交谈正文 */}
      {view === 'talk' && (
        <div className="flex flex-col gap-3 text-sm text-bone-300">
          <div className="rounded border border-ink-600 bg-ink-900/60 p-4">
            <p className="mb-3 text-xs leading-relaxed text-bone-500">{npc.summary}</p>
            <div>{dialogContent}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasShop && (
              <Button variant="primary" onClick={() => setView('shop')}>
                购买装备
              </Button>
            )}
            {nearbyQuests.length > 0 && (
              <Button variant="ghost" onClick={() => setView('quests')}>
                相关委托（{nearbyQuests.length}）
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              离开
            </Button>
          </div>
        </div>
      )}

      {/* 购买（MerchantPanel） */}
      {view === 'shop' && (
        <div className="flex flex-col gap-3">
          <MerchantPanel
            merchantId={merchantId ?? npc.id}
            merchantName={npc.name}
            extras={shopExtras?.items.map(({ itemId, price }) => ({ itemId, price })) ?? []}
            services={shopExtras?.services ?? []}
            buyFnForExtra={(itemId) => {
              const extra = shopExtras?.items.find((e) => e.itemId === itemId)
              return extra ? () => extra.buy() : undefined
            }}
          />
          <Button variant="ghost" onClick={() => setView('talk')}>
            返回交谈
          </Button>
        </div>
      )}

      {/* 相关委托 */}
      {view === 'quests' && (
        <div className="flex flex-col gap-3 text-sm text-bone-300">
          {nearbyQuests.map((quest) => (
            <div key={quest.questId} className="rounded border border-ink-600 bg-ink-900/40 p-3">
              <p className="font-bold text-bone-100">《{quest.title}》</p>
              {quest.status === 'undiscovered' ? (
                <Button variant="primary" className="mt-2" onClick={() => handleQuestAction(quest.questId, 'undiscovered')}>
                  查看委托
                </Button>
              ) : (
                <Button variant="primary" className="mt-2" onClick={() => handleQuestAction(quest.questId, 'available')}>
                  接受任务
                </Button>
              )}
            </div>
          ))}
          <Button variant="ghost" onClick={() => setView('talk')}>
            返回交谈
          </Button>
        </div>
      )}
    </Modal>
  )
}
