import Button from '../Button'
import { getItem } from '../../game/content'
import type { Inventory } from '../../game/types/item'

/**
 * 背包面板（TM-P2-003-R3 B：从 GamePage 抽出的纯 UI 组件）。
 * 职责：渲染背包条目（解析 ItemDefinition 名称/数量/描述）、武器装备/卸下按钮、
 * 治疗药水使用按钮与不可用原因、未知物品安全展示。
 * 不负责：剧情/任务/移动/NPC/战斗/北门事件/存档。
 * 武器入口数据驱动：ItemDefinition.type === 'weapon' 且玩家合法拥有即提供装备按钮，
 * 未来注册任意新武器无需 itemId 特判（TM-P2-003-R3 A5）。
 */
export interface InventoryPanelProps {
  inventory: Inventory
  equippedWeaponId: string | null
  playerHp: number
  playerMaxHp: number
  onEquipWeapon: (itemId: string) => boolean
  onUnequipWeapon: () => boolean
  onUseHealingPotion: () => boolean
  equippedArmorId: string | null
  onEquipItem: (itemId: string) => boolean
  onUnequipArmor: () => boolean
  profession: string
}

export default function InventoryPanel({
  inventory,
  equippedWeaponId,
  playerHp,
  playerMaxHp,
  onEquipWeapon,
  onUnequipWeapon,
  onUseHealingPotion,
  equippedArmorId, onEquipItem, onUnequipArmor, profession,
}: InventoryPanelProps) {
  return (
    <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
      <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">背包</h3>
      {inventory.length === 0 ? (
        <p className="text-bone-500">背包空空如也。</p>
      ) : (
        <div className="flex flex-col gap-2">
          {inventory.map((entry) => {
            const def = getItem(entry.itemId)
            // TM-P2-003-R3 A：武器判断只看 ItemDefinition.type === 'weapon'（数据驱动，不再 hardcode iron_sword）
            const isWeapon = def?.type === 'weapon'
            const isEquipped = equippedWeaponId === entry.itemId
            // TM-P0-010：只有治疗药水提供使用入口；满血 / HP 0 时禁用
            const isPotion = def?.id === 'healing_potion'
            const canUse = isPotion && playerHp > 0 && playerHp < playerMaxHp
            return (
              <div
                key={entry.itemId}
                className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3"
              >
                <div>
                  <p className="font-bold text-bone-100">
                    {def?.name ?? '未知物品'}{' '}
                    <span className="text-xs font-normal text-bone-500">×{entry.quantity}</span>
                  </p>
                  <p className="mt-1 text-xs text-bone-500">
                    {def ? def.description : '物品数据异常'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isWeapon && (
                    <Button
                      variant="primary"
                      onClick={() => (isEquipped ? onUnequipWeapon() : onEquipWeapon(entry.itemId))}
                    >
                      {isEquipped ? '卸下' : '装备'}
                    </Button>
                  )}
                  {def?.type === 'armor' && (() => {
                    const allowed = !def.allowedProfessions || def.allowedProfessions.includes(profession as never)
                    const equipped = equippedArmorId === entry.itemId
                    return <>
                      <span className="text-xs text-bone-500">护甲 +{def.armorDefenseBonus ?? 0}</span>
                      {!allowed && <span className="text-xs text-red-300">当前职业无法装备</span>}
                      <Button variant="primary" disabled={!allowed} onClick={() => (equipped ? onUnequipArmor() : onEquipItem(entry.itemId))}>{equipped ? '卸下' : '装备'}</Button>
                    </>
                  })()}
                  {isPotion && (
                    <>
                      <Button variant="primary" disabled={!canUse} onClick={() => onUseHealingPotion()}>
                        使用
                      </Button>
                      {playerHp >= playerMaxHp && <span className="text-xs text-bone-500">生命已满</span>}
                      {playerHp <= 0 && <span className="text-xs text-red-300">当前无法使用</span>}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
