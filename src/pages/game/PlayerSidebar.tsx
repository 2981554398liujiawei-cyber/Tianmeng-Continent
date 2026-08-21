import { useState } from 'react'
import Button from '../../components/Button'
import Accordion from '../../components/Accordion'
import InventoryPanel from '../../components/game/InventoryPanel'
import { useGameStore } from '../../game/state/gameStore'
import { getProfessionName, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../../game/content/professions'
import { getItem } from '../../game/content'
import { getPlayerArmor, getPlayerAttackPower, getPlayerAgility, getPlayerLevelDamageBonus } from '../../game/rules/combat'
import { getLevelFromXp, getXpRequiredForNextLevel, getXpThresholdForLevel } from '../../game/rules/character'

/**
 * 左栏：玩家栏（TM-P2-006）。
 * 固定承载：角色摘要（名称/Lv/职业/HP/MP/冒险阅历 XP 条 + 距离下一等级）、战斗摘要、角色详情（折叠）、装备、背包。
 * 内部区域可滚动，不撑高整个页面。
 */
export default function PlayerSidebar() {
  const gameState = useGameStore((s) => s.gameState)
  // 五维折叠（UI ephemeral，不进入 GameState）
  const [showDetails, setShowDetails] = useState(false)
  const equipWeapon = useGameStore((s) => s.equipWeapon)
  const unequipWeapon = useGameStore((s) => s.unequipWeapon)
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

  const attack = getPlayerAttackPower(player.attributes.str, weaponDamageBonus, player.level)
  const armor = getPlayerArmor(player.attributes.con, armorDefenseBonus)
  const agility = getPlayerAgility(player.attributes.agi)

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

      {/* 背包（内部滚动） */}
      <Accordion title="背包" defaultOpen ariaLabel="背包">
        <InventoryPanel
          inventory={gameState.inventory}
          equippedWeaponId={gameState.equipment.weapon}
          playerHp={player.hp}
          playerMaxHp={player.maxHp}
          onEquipWeapon={(itemId) => equipWeapon(itemId)}
          onUnequipWeapon={() => unequipWeapon()}
          onUseHealingPotion={() => useHealingPotion()}
          equippedArmorId={gameState.equipment.armor}
          onEquipItem={(itemId) => useGameStore.getState().equipItem(itemId)}
          onUnequipArmor={() => useGameStore.getState().unequipSlot('armor')}
          profession={player.profession}
        />
      </Accordion>
    </div>
  )
}
