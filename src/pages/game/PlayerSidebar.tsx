import { useState } from 'react'
import Button from '../../components/Button'
import BackpackPanel, { sortInventoryByName } from '../../components/game/BackpackPanel'
import MountStablePanel from '../../components/game/MountStablePanel'
import { useGameStore } from '../../game/state/gameStore'
import { getProfessionName, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../../game/content/professions'
import { getItem, getMount } from '../../game/content'
import { getPlayerArmor, getPlayerAttackPower, getPlayerAgility } from '../../game/rules/combat'
import { getEffectiveCharacterAttributes } from '../../game/rules/mount'
import { getXpRequiredForNextLevel, getXpThresholdForLevel } from '../../game/rules/character'

/**
 * 左栏：玩家栏（TM-P2-006）。
 * 固定承载：角色摘要（名称/Lv/职业/HP/MP/冒险阅历 XP 条 + 距离下一等级）、战斗摘要、角色详情（折叠）、装备、坐骑、背包。
 * 内部区域可滚动，不撑高整个页面。
 */
export default function PlayerSidebar() {
  const gameState = useGameStore((s) => s.gameState)
  // 五维折叠 / 背包面板 / 马厩（UI ephemeral，不进入 GameState）
  const [showDetails, setShowDetails] = useState(false)
  const [backpackOpen, setBackpackOpen] = useState(false)
  const [mountStableOpen, setMountStableOpen] = useState(false)
  const useHealingPotion = useGameStore((s) => s.useHealingPotion)

  if (!gameState) return null
  const { player } = gameState

  const equippedWeaponDef = gameState.equipment.weapon ? getItem(gameState.equipment.weapon) : undefined
  const equippedWeaponName = gameState.equipment.weapon
    ? (equippedWeaponDef?.name ?? '物品数据异常')
    : '未装备'
  const equippedArmorDef = gameState.equipment.armor ? getItem(gameState.equipment.armor) : undefined
  const equippedArmorName = gameState.equipment.armor ? (equippedArmorDef?.name ?? '物品数据异常') : '未装备'
  const weaponDamageBonus =
    equippedWeaponDef?.type === 'weapon' && Number.isInteger(equippedWeaponDef.weaponDamageBonus)
      ? (equippedWeaponDef.weaponDamageBonus ?? 0)
      : 0
  const armorDefenseBonus =
    equippedArmorDef?.type === 'armor' && Number.isInteger(equippedArmorDef.armorDefenseBonus)
      ? (equippedArmorDef.armorDefenseBonus ?? 0)
      : 0

  // P2-007 §20：战斗摘要使用装备坐骑后的有效五维（与 CombatPage 一致）
  const equippedMountDef = gameState.equippedMountId ? getMount(gameState.equippedMountId) : undefined
  const effectiveAttrs = getEffectiveCharacterAttributes(player.attributes, gameState.equippedMountId)
  const attack = getPlayerAttackPower(effectiveAttrs.str, weaponDamageBonus, player.level)
  const armor = getPlayerArmor(effectiveAttrs.con, armorDefenseBonus)
  const agility = getPlayerAgility(effectiveAttrs.agi)

  const mountBonusesText = equippedMountDef
    ? ATTRIBUTE_KEYS.filter((key) => (equippedMountDef.attributeBonuses[key] ?? 0) > 0)
        .map((key) => `${ATTRIBUTE_LABELS[key]}+${equippedMountDef.attributeBonuses[key]}`)
        .join(' · ')
    : ''

  // ---- 冒险阅历（XP）条：总 XP / 下一等级阈值 + 距离下一等级（TM-P2-006 第 43 节）----
  const level = player.level
  const xp = player.adventureXp
  const nextThreshold = getXpThresholdForLevel(level + 1)
  const requiredForNext = getXpRequiredForNextLevel(level)
  const isMaxLevel = level >= 15
  // 15 级封顶展示：等级已达到当前上限（不显示 NaN/Infinity/不存在的 Lv16 阈值）
  const xpRatio = isMaxLevel ? 1 : Math.min(1, Math.max(0, (xp - getXpThresholdForLevel(level)) / requiredForNext))

  const Bar = ({ label, value, max }: { label: string; value: number; max: number }) => {
    const ratio = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
    return (
      <div className="flex items-center gap-3">
        <span className="w-10 shrink-0 text-sm text-bone-500">{label}</span>
        <div className="h-3 flex-1 overflow-hidden rounded border border-ink-600 bg-ink-800">
          <div className="h-full bg-gold-500/70 transition-all" style={{ width: `${ratio}%` }} />
        </div>
        <span className="w-20 shrink-0 text-right text-sm tabular-nums text-bone-300">
          {value} / {max}
        </span>
      </div>
    )
  }

  // 背包 compact 预览：按名称稳定排序取前 5（与 BackpackPanel 一致）；完整背包进 BackpackPanel
  const inventoryPreview = sortInventoryByName(
    gameState.inventory.map((e) => ({ itemId: e.itemId, name: getItem(e.itemId)?.name ?? '未知物品' })),
  ).slice(0, 5)

  return (
    <div data-testid="player-column" className="flex h-full flex-col gap-4">
      {/* 角色摘要 */}
      <section className="rounded border border-ink-600 bg-ink-800/50 p-4">
        <h3 className="text-lg font-bold text-bone-100">
          {player.name}
          <span className="ml-3 text-sm font-normal text-bone-500">
            Lv.{player.level} · {getProfessionName(player.profession)}
          </span>
        </h3>
        <div className="mt-3 flex flex-col gap-2">
          <Bar label="生命" value={player.hp} max={player.maxHp} />
          <Bar label="灵力" value={player.mp} max={player.maxMp} />
        </div>
        {/* 冒险阅历（XP 条）——常驻 */}
        <div data-testid="adventure-xp-bar" className="mt-4 rounded border border-gold-500/30 bg-gold-900/10 p-3">
          <p className="text-xs font-bold tracking-wider text-gold-300">冒险阅历</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded border border-ink-600 bg-ink-800">
              <div className="h-full bg-gold-500/80 transition-all" style={{ width: `${xpRatio * 100}%` }} />
            </div>
            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-bone-300">
              {xp} / {isMaxLevel ? '上限' : nextThreshold}
            </span>
          </div>
          <p className="mt-2 text-xs text-bone-500">
            {isMaxLevel ? '等级已达到当前上限' : `距离 Lv.${level + 1}：${nextThreshold - xp}`}
          </p>
        </div>
      </section>

      {/* 战斗摘要（默认显示；完整五维进「角色详情」） */}
      <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
        <h3 className="mb-2 text-xs font-bold tracking-wider text-bone-500">战斗能力</h3>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <div className="flex justify-between"><span className="text-bone-500">攻击</span><span className="tabular-nums text-bone-100">{attack}</span></div>
          <div className="flex justify-between"><span className="text-bone-500">护甲</span><span className="tabular-nums text-bone-100">{armor}</span></div>
          <div className="flex justify-between"><span className="text-bone-500">敏捷</span><span className="tabular-nums text-bone-100">{agility}</span></div>
          <div className="flex justify-between"><span className="text-bone-500">金币</span><span className="tabular-nums text-gold-300">{player.gold}</span></div>
        </div>
        <div className="mt-2 border-t border-ink-600 pt-2 text-xs text-bone-500">
          武器：<span className="text-bone-100">{equippedWeaponName}</span>
          {'　'}防具：<span className="text-bone-100">{equippedArmorName}</span>
        </div>
        {/* 角色详情（五维）折叠——容器常驻（data-testid 供响应式断言 display:none），展开态切换 class */}
        <div className="mt-3">
          <Button variant="ghost" className="w-full justify-center" onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? '收起角色详情' : '查看角色详情'}
          </Button>
          <div
            data-testid="mobile-character-details"
            className={showDetails ? 'mt-3 grid grid-cols-2 gap-x-4 gap-y-1' : 'hidden'}
          >
            {ATTRIBUTE_KEYS.map((key) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-bone-500">{ATTRIBUTE_LABELS[key]}</span>
                <span className="tabular-nums text-bone-300">{player.attributes[key]}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 装备 */}
      <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
        <h3 className="mb-2 text-xs font-bold tracking-wider text-bone-500">装备</h3>
        <p>
          武器：<span className="text-bone-100">{equippedWeaponName}</span>
        </p>
        <p className="mt-1">
          防具：<span className="text-bone-100">{equippedArmorName}</span>
        </p>
        <p className="mt-1">
          护甲等级：<span className="text-bone-100">{armor}</span>
        </p>
      </section>

      {/* 坐骑（TM-P2-007 §19：左栏展示当前坐骑 + 马厩管理入口；未装备显示「未装备」） */}
      <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-bold tracking-wider text-bone-500">坐骑</h3>
          <Button
            variant="ghost"
            data-testid="open-mount-stable"
            className="!px-2 !py-0 text-xs"
            onClick={() => setMountStableOpen(true)}
          >
            管理
          </Button>
        </div>
        {equippedMountDef ? (
          <p data-testid="sidebar-equipped-mount">
            <span className="text-bone-100">{equippedMountDef.name}</span>
            {mountBonusesText && <span className="ml-2 text-xs text-gold-300">{mountBonusesText}</span>}
          </p>
        ) : (
          <p data-testid="sidebar-equipped-mount" className="text-bone-500">
            未装备
          </p>
        )}
      </section>

      {/* 背包（compact：最多 5 项 + [打开背包]；完整背包进 BackpackPanel，TM-P2-007 §4） */}
      <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-xs font-bold tracking-wider text-bone-500">背包</h3>
          <span data-testid="sidebar-backpack-count" className="text-xs text-bone-500">
            {gameState.inventory.length} 种物品
          </span>
        </div>
        {inventoryPreview.length === 0 ? (
          <p className="text-bone-500">背包空空如也。</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {inventoryPreview.map(({ itemId, name }) => (
              <li key={itemId} className="flex justify-between text-sm">
                <span className="text-bone-100">{name}</span>
                <span className="tabular-nums text-bone-400">
                  ×{gameState.inventory.find((e) => e.itemId === itemId)?.quantity ?? 0}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="primary"
          className="mt-3 w-full justify-center"
          data-testid="open-backpack"
          onClick={() => setBackpackOpen(true)}
        >
          打开背包
        </Button>
      </section>

      {/* 完整背包面板（桌面 Modal / 移动底部全高 Drawer） */}
      <BackpackPanel
        open={backpackOpen}
        onClose={() => setBackpackOpen(false)}
        inventory={gameState.inventory}
        equipment={gameState.equipment}
        playerHp={player.hp}
        playerMaxHp={player.maxHp}
        profession={player.profession}
        onEquipItem={(itemId) => useGameStore.getState().equipItem(itemId)}
        onUnequipSlot={(slot) => useGameStore.getState().unequipSlot(slot)}
        onUseItem={(itemId) => (itemId === 'healing_potion' ? useHealingPotion() : false)}
      />

      {/* 马厩面板（TM-P2-007 §19：购买/装备/卸下；桌面 Modal / 移动 Drawer） */}
      <MountStablePanel
        open={mountStableOpen}
        onClose={() => setMountStableOpen(false)}
        ownedMountIds={gameState.ownedMountIds}
        equippedMountId={gameState.equippedMountId}
        gold={player.gold}
        locationId={gameState.world.currentLocationId}
        onBuy={(mountId) => useGameStore.getState().buyMount(mountId)}
        onEquip={(mountId) => useGameStore.getState().equipMount(mountId)}
        onUnequip={() => useGameStore.getState().unequipMount()}
      />
    </div>
  )
}
