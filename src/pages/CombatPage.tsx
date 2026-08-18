import { useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem } from '../game/content'
import { getProfessionName } from '../game/content/professions'
import {
  getKnightPowerStrikeDamage,
  getMageSpellAttackBonus,
  getMageSpellDamage,
  getRangerSwiftStrikeAttackBonus,
  getRangerSwiftStrikeDamage,
  KNIGHT_POWER_STRIKE_MP_COST,
  MAGE_SPELL_MP_COST,
  getPlayerAttackBonus,
  getPlayerAttackDamage,
  getPlayerDefense,
  performAttack,
  getCombatPhaseAfterEnemyAttack,
  resolvePlayerStrike,
  type AttackResult,
  type CombatPhase,
} from '../game/rules/combat'

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
  miss: '未命中',
  critical_miss: '大失败',
}

function attackLine(result: AttackResult, defenderName: string): string {
  const outcome = ATTACK_OUTCOME_LABELS[result.outcome]
  if (result.hit) {
    return `D20 ${result.roll} + 攻击加值 ${result.attackBonus} = ${result.total}；${defenderName}防御 ${result.defense}；${outcome}，造成 ${result.damage} 点伤害`
  }
  return `D20 ${result.roll} + 攻击加值 ${result.attackBonus} = ${result.total}；${defenderName}防御 ${result.defense}；${outcome}，未造成伤害`
}

export default function CombatPage({ enemyId, onVictory, onDefeat, onExitToMenu }: CombatPageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const damagePlayer = useGameStore((s) => s.damagePlayer)
  const spendMageSpellMp = useGameStore((s) => s.spendMageSpellMp)
  const spendKnightPowerStrikeMp = useGameStore((s) => s.spendKnightPowerStrikeMp)
  const enemy = getEnemy(enemyId)

  const [enemyCurrentHp, setEnemyCurrentHp] = useState(enemy?.maxHp ?? 0)
  const [phase, setPhase] = useState<CombatPhase>('active')
  const [lastPlayerAttack, setLastPlayerAttack] = useState<AttackResult | null>(null)
  const [lastEnemyAttack, setLastEnemyAttack] = useState<AttackResult | null>(null)
  /** TM-P1-001/006/007：最近一次玩家行动类型（仅页面本地，不进入 GameState）——区分「你的攻击/你的法术攻击/你的骑士重击/你的迅捷突袭」 */
  const [lastPlayerAction, setLastPlayerAction] = useState<
    'basic' | 'mage_spell' | 'knight_power_strike' | 'ranger_swift_strike' | null
  >(null)
  /** TM-P1-007：游侠迅捷突袭本场战斗是否已使用（仅页面本地；新 CombatPage 天然重置，不进入 GameState） */
  const [rangerSwiftStrikeUsed, setRangerSwiftStrikeUsed] = useState(false)

  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">当前没有进行中的游戏。</p>
        <Button onClick={onExitToMenu}>返回主菜单</Button>
      </div>
    )
  }

  if (!enemy) {
    // 未知 enemyId：不得进入战斗、不得崩溃（防御性异常出口，真正返回主菜单）
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">未知敌人（{enemyId}），无法进入战斗。</p>
        <Button onClick={onExitToMenu}>返回主菜单</Button>
      </div>
    )
  }

  const player = gameState.player
  const playerDefense = getPlayerDefense(player.attributes.agi)
  // TM-P0-013：读取当前装备武器伤害加成；无装备/未知/非武器安全按 0 处理
  const equippedWeapon = gameState.equipment.weapon ? getItem(gameState.equipment.weapon) : undefined
  const weaponDamageBonus =
    equippedWeapon?.type === 'weapon' && Number.isInteger(equippedWeapon.weaponDamageBonus)
      ? (equippedWeapon.weaponDamageBonus ?? 0)
      : 0

  const handleAttack = () => {
    if (phase !== 'active') return
    // 玩家先行动（复用封板战斗规则；阶段结算使用确定性纯函数 TM-P0-008-R1）
    const playerResult = performAttack(
      getPlayerAttackBonus(player.attributes.str, player.level),
      enemy.defense,
      getPlayerAttackDamage(player.attributes.str, weaponDamageBonus),
    )
    applyPlayerAttack(playerResult, 'basic')
  }

  /** TM-P1-001：法师法术攻击——先消费灵力，成功才施法掷骰 */
  const handleMageSpell = () => {
    if (phase !== 'active') return
    // 唯一灵力消费入口：false → 不掷骰、不改敌人 HP、不触发反击、不改最后一次攻击结果
    if (!spendMageSpellMp()) return
    const spellResult = performAttack(
      getMageSpellAttackBonus(player.attributes.mnd, player.level),
      enemy.defense,
      getMageSpellDamage(player.attributes.mnd),
    )
    applyPlayerAttack(spellResult, 'mage_spell')
  }

  /** TM-P1-006：骑士重击——先消费灵力，成功才掷骰；伤害=普通攻击伤害+2（吃武器加成） */
  const handleKnightPowerStrike = () => {
    if (phase !== 'active') return
    // 唯一灵力消费入口：false → 不掷骰、不改敌人 HP、不触发反击、不改最后一次攻击结果
    if (!spendKnightPowerStrikeMp()) return
    const strikeResult = performAttack(
      getPlayerAttackBonus(player.attributes.str, player.level),
      enemy.defense,
      getKnightPowerStrikeDamage(player.attributes.str, weaponDamageBonus),
    )
    applyPlayerAttack(strikeResult, 'knight_power_strike')
  }

  /** TM-P1-007：游侠迅捷突袭——每场战斗一次，不消费 MP，AGI 攻击；点击即消耗本场次数（命中/未命中/暴击/大失败都是已使用） */
  const handleRangerSwiftStrike = () => {
    if (phase !== 'active' || rangerSwiftStrikeUsed) return
    // 先标记本场已使用，再执行攻击（未命中/大失败也消耗本场次数）
    setRangerSwiftStrikeUsed(true)
    const strikeResult = performAttack(
      getRangerSwiftStrikeAttackBonus(player.attributes.agi, player.level),
      enemy.defense,
      getRangerSwiftStrikeDamage(player.attributes.agi, weaponDamageBonus),
    )
    applyPlayerAttack(strikeResult, 'ranger_swift_strike')
  }

  /** TM-P1-001/006/007：普通攻击/法术攻击/骑士重击/迅捷突袭共用的最小局部结算（不建 ActionSystem/TurnManager） */
  const applyPlayerAttack = (attack: AttackResult, action: 'basic' | 'mage_spell' | 'knight_power_strike' | 'ranger_swift_strike') => {
    setLastPlayerAttack(attack)
    setLastPlayerAction(action)
    setLastEnemyAttack(null)

    const strike = resolvePlayerStrike(enemyCurrentHp, attack)
    setEnemyCurrentHp(strike.enemyHp)
    if (!strike.enemyShouldCounter) {
      // 致死攻击 → 胜利，且敌人不得反击
      setPhase(strike.phase)
      return
    }

    // 敌人存活则立即反击（同一套 performAttack）
    const enemyResult = performAttack(enemy.attackBonus, playerDefense, enemy.damage)
    setLastEnemyAttack(enemyResult)
    if (enemyResult.hit) {
      damagePlayer(enemyResult.damage)
    }
    // 玩家 HP 归零 → 失败（不出现负 HP，damagePlayer 已保证）
    setPhase(getCombatPhaseAfterEnemyAttack(useGameStore.getState().gameState?.player.hp ?? 1))
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="border-b border-ink-600 pb-4 text-center">
        <h2 className="text-xl font-bold tracking-widest text-gold-300">战斗</h2>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
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
          <p>
            防御 <span className="tabular-nums text-bone-100">{playerDefense}</span>
          </p>
          <p>
            武器：{' '}
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

        <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
          <p className="text-base font-bold text-bone-100">{enemy.name}</p>
          <p className="mt-1 text-xs text-bone-500">Lv.{enemy.level}</p>
          <p className="mt-2">
            HP <span className="tabular-nums text-bone-100">{enemyCurrentHp}</span> / {enemy.maxHp}
          </p>
          <p>
            防御 <span className="tabular-nums text-bone-100">{enemy.defense}</span>
          </p>
        </section>
      </div>

      {(lastPlayerAttack || lastEnemyAttack) && (
        <section className="rounded border border-ink-600 bg-ink-900/50 p-4 text-sm leading-relaxed text-bone-300">
          {lastPlayerAttack && (
            <p>
              <span className="text-bone-500">
                {lastPlayerAction === 'mage_spell'
                  ? '你的法术攻击：'
                  : lastPlayerAction === 'knight_power_strike'
                    ? '你的骑士重击：'
                    : lastPlayerAction === 'ranger_swift_strike'
                      ? '你的迅捷突袭：'
                      : '你的攻击：'}
              </span>
              {attackLine(lastPlayerAttack, enemy.name)}
            </p>
          )}
          {lastEnemyAttack && (
            <p>
              <span className="text-bone-500">{enemy.name}的攻击：</span>
              {attackLine(lastEnemyAttack, player.name)}
            </p>
          )}
        </section>
      )}

      <footer className="flex flex-col items-center gap-4">
        {phase === 'active' && (
          <div className="flex flex-col items-center gap-3">
            <Button variant="primary" onClick={handleAttack}>
              普通攻击
            </Button>
            {/* TM-P1-001：仅法师显示法术攻击；灵力不足时禁用但普通攻击不受影响 */}
            {player.profession === 'mage' && (
              <div className="flex flex-col items-center gap-1">
                <Button variant="primary" disabled={player.mp < MAGE_SPELL_MP_COST} onClick={handleMageSpell}>
                  法术攻击（{MAGE_SPELL_MP_COST} 灵力）
                </Button>
                {player.mp < MAGE_SPELL_MP_COST && <span className="text-xs text-red-300">灵力不足</span>}
              </div>
            )}
            {/* TM-P1-006：仅骑士显示骑士重击；灵力不足时禁用但普通攻击不受影响 */}
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
            {/* TM-P1-007：仅游侠显示迅捷突袭（不消费 MP、每场一次；使用后禁用+本场战斗已使用，普通攻击不受影响） */}
            {player.profession === 'ranger' && (
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="primary"
                  disabled={rangerSwiftStrikeUsed}
                  onClick={handleRangerSwiftStrike}
                >
                  迅捷突袭
                </Button>
                {rangerSwiftStrikeUsed && <span className="text-xs text-bone-500">本场战斗已使用</span>}
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
