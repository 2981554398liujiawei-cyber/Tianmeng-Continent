import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem } from '../game/content'
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, getProfessionName } from '../game/content/professions'
import {
  getKnightPowerStrikeDamage,
  getMageSpellDamage,
  getPlayerAgility,
  getPlayerArmor,
  getPlayerAttackPower,
  getPlayerLevelDamageBonus,
  getRangerSwiftStrikeDamage,
  KNIGHT_POWER_STRIKE_MP_COST,
  MAGE_SPELL_MP_COST,
  WARRIOR_SUPPRESS_STRIKE_MP_COST,
  performAttack,
  rollInitiative,
  getCombatPhaseAfterEnemyAttack,
  resolvePlayerStrike,
  type AttackResult,
  type CombatPhase,
} from '../game/rules/combat'
import type { InitiativeWinner } from '../game/rules/combat'

interface CombatPageProps {
  enemyId: string
  onVictory: () => void
  onDefeat: () => void
  /** TM-P0-022-R2：防御性异常出口（无 GameState / 未知 enemyId）→ 真正返回主菜单 */
  onExitToMenu: () => void
}

const ATTACK_OUTCOME_LABELS: Record<AttackResult['outcome'], string> = {
  critical_hit: '暴击',
  hit: '命中',
  glancing_hit: '擦伤',
  critical_miss: '大失败',
}

/** V3 攻击日志行（TM-P2-002 E：不再让玩家误认为 D20+数值=攻击力） */
function attackLine(result: AttackResult, defenderName: string): string[] {
  const outcome = ATTACK_OUTCOME_LABELS[result.outcome]
  const initTotal = result.roll + result.attackerAgility
  if (result.outcome === 'critical_miss') {
    return [`D20 ${result.roll} + 敏捷 ${result.attackerAgility} = ${initTotal}；对方敏捷 ${result.defenderAgility}；${outcome}，未造成伤害。`]
  }
  const multiplier =
    result.outcome === 'critical_hit' ? ` × 2` : result.outcome === 'glancing_hit' ? ` × 50%` : ''
  const rawAfter =
    result.outcome === 'critical_hit'
      ? result.rawDamage * 2
      : result.outcome === 'glancing_hit'
        ? Math.max(1, Math.ceil(result.rawDamage * 0.5))
        : result.rawDamage
  const pct = Math.round(result.damageTakenRate * 100)
  return [
    `D20 ${result.roll} + 敏捷 ${result.attackerAgility} = ${initTotal}；对方敏捷 ${result.defenderAgility}；${outcome}。`,
    `原始伤害 ${result.rawDamage}${multiplier} = ${rawAfter}；${defenderName}护甲 ${result.armor}；承伤率 ${result.roll} / (${result.armor} + ${result.roll}) = ${pct}%；最终造成 ${result.damage} 点伤害。`,
  ]
}

export default function CombatPage({ enemyId, onVictory, onDefeat, onExitToMenu }: CombatPageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const damagePlayer = useGameStore((s) => s.damagePlayer)
  const spendMageSpellMp = useGameStore((s) => s.spendMageSpellMp)
  const spendKnightPowerStrikeMp = useGameStore((s) => s.spendKnightPowerStrikeMp)
  const spendWarriorSuppressStrikeMp = useGameStore((s) => s.spendWarriorSuppressStrikeMp)
  const useHealingPotion = useGameStore((s) => s.useHealingPotion)
  const enemy = getEnemy(enemyId)

  const [enemyCurrentHp, setEnemyCurrentHp] = useState(enemy?.maxHp ?? 0)
  const [phase, setPhase] = useState<CombatPhase>('active')
  const [lastPlayerAttack, setLastPlayerAttack] = useState<AttackResult | null>(null)
  const [lastEnemyAttack, setLastEnemyAttack] = useState<AttackResult | null>(null)
  /** TM-P1-015：最近一次成功药水行动的实际恢复量（仅战斗 UI 即时日志） */
  const [lastPotionHeal, setLastPotionHeal] = useState<number | null>(null)
  /** TM-P1-001/006/007/008：最近一次玩家行动类型（仅页面本地） */
  const [lastPlayerAction, setLastPlayerAction] = useState<
    | 'basic'
    | 'mage_spell'
    | 'knight_power_strike'
    | 'ranger_swift_strike'
    | 'warrior_suppress_strike'
    | null
  >(null)
  /** TM-P1-007：游侠迅捷突袭本场是否已使用（仅页面本地） */
  const [rangerSwiftStrikeUsed, setRangerSwiftStrikeUsed] = useState(false)
  /** TM-P2-002 D：先手（进入战斗时双方各掷 D20+AGI；高者先，平局 AGI 高者先，仍同则玩家先） */
  const [initiativeWinner] = useState<InitiativeWinner | null>(() =>
    gameState && enemy ? rollInitiative(playerAgilityOf(gameState), enemy.agility) : null,
  )
  const [enemyFirstStrikeDone, setEnemyFirstStrikeDone] = useState(false)
  const enemyFirstStrikeRef = useRef(false)

  // ---- 防御性异常出口 ----
  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">当前没有进行中的游戏。</p>
        <Button onClick={onExitToMenu}>返回主菜单</Button>
      </div>
    )
  }

  if (!enemy) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">未知敌人（{enemyId}），无法进入战斗。</p>
        <Button onClick={onExitToMenu}>返回主菜单</Button>
      </div>
    )
  }

  const player = gameState.player
  // TM-P2-002 A：V3 玩家派生属性
  const equippedWeapon = gameState.equipment.weapon ? getItem(gameState.equipment.weapon) : undefined
  const weaponDamageBonus =
    equippedWeapon?.type === 'weapon' && Number.isInteger(equippedWeapon.weaponDamageBonus)
      ? (equippedWeapon.weaponDamageBonus ?? 0)
      : 0
  const equippedArmor = gameState.equipment.armor ? getItem(gameState.equipment.armor) : undefined
  const armorDefenseBonus =
    equippedArmor?.type === 'armor' && Number.isInteger(equippedArmor.armorDefenseBonus)
      ? (equippedArmor.armorDefenseBonus ?? 0)
      : 0
  const playerAttackPower = getPlayerAttackPower(player.attributes.str, weaponDamageBonus, player.level)
  const playerArmor = getPlayerArmor(player.attributes.con, armorDefenseBonus)
  const playerAgility = getPlayerAgility(player.attributes.agi)
  const levelDamageBonus = getPlayerLevelDamageBonus(player.level)

  // TM-P2-002 D：敌人先手 → 进入正常回合前先执行一次敌人攻击（仅一次）
  useEffect(() => {
    if (initiativeWinner !== 'enemy' || enemyFirstStrikeRef.current) return
    enemyFirstStrikeRef.current = true
    const timer = window.setTimeout(() => {
      setEnemyFirstStrikeDone(true)
      applyEnemyCounter()
    }, 400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiativeWinner])

  const healingPotion = getItem('healing_potion')
  const healingPotionAmount = healingPotion?.healAmount
  const healingPotionCount = gameState.inventory
    .filter((entry) => entry.itemId === 'healing_potion' && Number.isSafeInteger(entry.quantity) && entry.quantity >= 1)
    .reduce((total, entry) => total + entry.quantity, 0)

  /** TM-P2-002：敌人反击（V3：敏捷命中 + 护甲减伤）——玩家/职业技能/喝药行动共用 */
  const applyEnemyCounter = () => {
    const enemyResult = performAttack(enemy.agility, playerAgility, enemy.attackPower, playerArmor)
    setLastEnemyAttack(enemyResult)
    if (enemyResult.hit) {
      damagePlayer(enemyResult.damage)
    }
    setPhase(getCombatPhaseAfterEnemyAttack(useGameStore.getState().gameState?.player.hp ?? 1))
  }

  const handleUseHealingPotion = () => {
    if (phase !== 'active') return
    const hpBefore = player.hp
    if (!useHealingPotion()) return
    const hpAfter = useGameStore.getState().gameState?.player.hp ?? hpBefore
    setLastPlayerAttack(null)
    setLastPlayerAction(null)
    setLastPotionHeal(hpAfter - hpBefore)
    setLastEnemyAttack(null)
    applyEnemyCounter()
  }

  const handleAttack = () => {
    if (phase !== 'active') return
    const playerResult = performAttack(playerAgility, enemy.agility, playerAttackPower, enemy.armor)
    applyPlayerAttack(playerResult, 'basic')
  }

  const handleMageSpell = () => {
    if (phase !== 'active') return
    if (!spendMageSpellMp()) return
    const spellResult = performAttack(playerAgility, enemy.agility, getMageSpellDamage(player.attributes.mnd) + levelDamageBonus, enemy.armor)
    applyPlayerAttack(spellResult, 'mage_spell')
  }

  const handleKnightPowerStrike = () => {
    if (phase !== 'active') return
    if (!spendKnightPowerStrikeMp()) return
    const strikeResult = performAttack(
      playerAgility,
      enemy.agility,
      getKnightPowerStrikeDamage(player.attributes.str, weaponDamageBonus, player.level),
      enemy.armor,
    )
    applyPlayerAttack(strikeResult, 'knight_power_strike')
  }

  const handleRangerSwiftStrike = () => {
    if (phase !== 'active' || rangerSwiftStrikeUsed) return
    setRangerSwiftStrikeUsed(true)
    const strikeResult = performAttack(
      playerAgility,
      enemy.agility,
      getRangerSwiftStrikeDamage(player.attributes.agi, weaponDamageBonus, player.level),
      enemy.armor,
    )
    applyPlayerAttack(strikeResult, 'ranger_swift_strike')
  }

  const handleWarriorSuppressStrike = () => {
    if (phase !== 'active') return
    if (!spendWarriorSuppressStrikeMp()) return
    const strikeResult = performAttack(playerAgility, enemy.agility, playerAttackPower, enemy.armor)
    applyPlayerAttack(strikeResult, 'warrior_suppress_strike')
  }

  /** TM-P1-001/006/007/008：玩家攻击共用最小局部结算（V3 保持；压制仅正常命中/暴击压制） */
  const applyPlayerAttack = (
    attack: AttackResult,
    action: 'basic' | 'mage_spell' | 'knight_power_strike' | 'ranger_swift_strike' | 'warrior_suppress_strike',
  ) => {
    setLastPlayerAttack(attack)
    setLastPlayerAction(action)
    setLastPotionHeal(null)
    setLastEnemyAttack(null)

    const strike = resolvePlayerStrike(enemyCurrentHp, attack)
    setEnemyCurrentHp(strike.enemyHp)
    if (!strike.enemyShouldCounter) {
      setPhase(strike.phase)
      return
    }
    // TM-P2-001 C3：压制猛击仅「正常命中/暴击」压制本次反击；擦伤只半伤不压制
    if (action === 'warrior_suppress_strike' && (attack.outcome === 'hit' || attack.outcome === 'critical_hit')) {
      return
    }
    applyEnemyCounter()
  }

  const actionLabel =
    lastPlayerAction === 'mage_spell'
      ? '你的法术攻击：'
      : lastPlayerAction === 'knight_power_strike'
        ? '你的骑士重击：'
        : lastPlayerAction === 'ranger_swift_strike'
          ? '你的迅捷突袭：'
          : lastPlayerAction === 'warrior_suppress_strike'
            ? '你的压制猛击：'
            : '你的攻击：'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="border-b border-ink-600 pb-4 text-center">
        <h2 className="text-xl font-bold tracking-widest text-gold-300">战斗</h2>
      </header>

      {/* TM-P2-002 D：先手提示 */}
      {enemyFirstStrikeDone && phase === 'active' && (
        <p className="text-center text-sm text-gold-300">{enemy.name}先手！</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* TM-P2-002 E：玩家面板（攻击力/护甲/敏捷/五属性/武器） */}
        <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
          <p className="text-base font-bold text-bone-100">{player.name}</p>
          <p className="mt-1 text-xs text-bone-500">
            Lv.{player.level} · {getProfessionName(player.profession)}
          </p>
          <p className="mt-2">
            生命 <span className="tabular-nums text-bone-100">{player.hp}</span> / {player.maxHp}
          </p>
          <p>
            灵力 <span className="tabular-nums text-bone-100">{player.mp}</span> / {player.maxMp}
          </p>
          <p className="mt-2">
            攻击力 <span className="tabular-nums text-bone-100">{playerAttackPower}</span>
          </p>
          <p>
            护甲等级 <span className="tabular-nums text-bone-100">{playerArmor}</span>
          </p>
          <p>
            敏捷 <span className="tabular-nums text-bone-100">{playerAgility}</span>
          </p>
          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
            {ATTRIBUTE_KEYS.map((key) => (
              <div key={key} className="flex justify-between">
                <span className="text-bone-500">{ATTRIBUTE_LABELS[key]}</span>
                <span className="tabular-nums text-bone-300">{player.attributes[key]}</span>
              </div>
            ))}
          </div>
          <p className="mt-2">
            当前武器：{' '}
            {equippedWeapon ? (
              <span className="text-bone-100">{equippedWeapon.name}</span>
            ) : gameState.equipment.weapon ? (
              <span className="text-bone-100">
                未知武器 <span className="text-bone-500">（{gameState.equipment.weapon}）</span>
              </span>
            ) : (
              <span className="text-bone-500">未装备</span>
            )}
          </p>
        </section>

        {/* TM-P2-002 E：敌人面板（名称/等级/HP/攻击力/护甲/敏捷） */}
        <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
          <p className="text-base font-bold text-bone-100">{enemy.name}</p>
          <p className="mt-1 text-xs text-bone-500">Lv.{enemy.level}</p>
          <p className="mt-2">
            HP <span className="tabular-nums text-bone-100">{enemyCurrentHp}</span> / {enemy.maxHp}
          </p>
          <p className="mt-2">
            攻击力 <span className="tabular-nums text-bone-100">{enemy.attackPower}</span>
          </p>
          <p>
            护甲等级 <span className="tabular-nums text-bone-100">{enemy.armor}</span>
          </p>
          <p>
            敏捷 <span className="tabular-nums text-bone-100">{enemy.agility}</span>
          </p>
        </section>
      </div>

      {(lastPlayerAttack || lastEnemyAttack || lastPotionHeal !== null) && (
        <section className="rounded border border-ink-600 bg-ink-900/50 p-4 text-sm leading-relaxed text-bone-300">
          {lastPlayerAttack && (
            <div>
              <p className="text-bone-500">{actionLabel}</p>
              {attackLine(lastPlayerAttack, enemy.name).map((line, i) => (
                <p key={i} className="mt-1">
                  {line}
                </p>
              ))}
            </div>
          )}
          {lastPotionHeal !== null && (
            <p className="mt-2">
              <span className="text-bone-500">你使用了治疗药水：恢复 {lastPotionHeal} 点生命。</span>
            </p>
          )}
          {lastEnemyAttack && (
            <div className="mt-2">
              <p className="text-bone-500">{enemy.name}的攻击：</p>
              {attackLine(lastEnemyAttack, player.name).map((line, i) => (
                <p key={i} className="mt-1">
                  {line}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="flex flex-col items-center gap-4">
        {phase === 'active' && (
          <div className="flex flex-col items-center gap-3">
            <Button variant="primary" onClick={handleAttack}>
              普通攻击
            </Button>
            {player.profession === 'mage' && (
              <div className="flex flex-col items-center gap-1">
                <Button variant="primary" disabled={player.mp < MAGE_SPELL_MP_COST} onClick={handleMageSpell}>
                  法术攻击（{MAGE_SPELL_MP_COST} 灵力）
                </Button>
                {player.mp < MAGE_SPELL_MP_COST && <span className="text-xs text-red-300">灵力不足</span>}
              </div>
            )}
            {player.profession === 'knight' && (
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="primary"
                  disabled={player.mp < KNIGHT_POWER_STRIKE_MP_COST}
                  onClick={handleKnightPowerStrike}
                >
                  骑士重击（{KNIGHT_POWER_STRIKE_MP_COST} 灵力）
                </Button>
                {player.mp < KNIGHT_POWER_STRIKE_MP_COST && <span className="text-xs text-red-300">灵力不足</span>}
              </div>
            )}
            {player.profession === 'ranger' && (
              <div className="flex flex-col items-center gap-1">
                <Button variant="primary" disabled={rangerSwiftStrikeUsed} onClick={handleRangerSwiftStrike}>
                  迅捷突袭
                </Button>
                {rangerSwiftStrikeUsed && <span className="text-xs text-bone-500">本场战斗已使用</span>}
              </div>
            )}
            {player.profession === 'warrior' && (
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="primary"
                  disabled={player.mp < WARRIOR_SUPPRESS_STRIKE_MP_COST}
                  onClick={handleWarriorSuppressStrike}
                >
                  压制猛击（{WARRIOR_SUPPRESS_STRIKE_MP_COST} 灵力）
                </Button>
                {player.mp < WARRIOR_SUPPRESS_STRIKE_MP_COST && <span className="text-xs text-red-300">灵力不足</span>}
              </div>
            )}
            {healingPotionAmount !== undefined && (
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="primary"
                  disabled={player.hp >= player.maxHp || healingPotionCount <= 0}
                  onClick={handleUseHealingPotion}
                >
                  使用治疗药水（+{healingPotionAmount} 生命）
                </Button>
                {healingPotionCount > 0 && <span className="text-xs text-bone-500">剩余：{healingPotionCount}</span>}
                {healingPotionCount <= 0 && <span className="text-xs text-red-300">没有治疗药水</span>}
                {healingPotionCount > 0 && player.hp >= player.maxHp && (
                  <span className="text-xs text-bone-500">生命已满</span>
                )}
              </div>
            )}
          </div>
        )}
        {phase === 'victory' && (
          <>
            <p className="text-lg font-bold text-gold-300">战斗胜利</p>
            <Button variant="primary" onClick={onVictory}>
              返回冒险
            </Button>
          </>
        )}
        {phase === 'defeat' && (
          <>
            <p className="text-lg font-bold text-red-300">战斗失败</p>
            <Button variant="danger" onClick={onDefeat}>
              返回冒险
            </Button>
          </>
        )}
      </footer>
    </div>
  )
}

/** 读取玩家敏捷（在 gameState 可能为 null 的惰性初始化场景下安全取值） */
function playerAgilityOf(state: { player: { attributes: { agi: number } } }): number {
  return state.player.attributes.agi
}
