import { useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem } from '../game/content'
import { getProfessionName } from '../game/content/professions'
import {
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

export default function CombatPage({ enemyId, onVictory, onDefeat }: CombatPageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const damagePlayer = useGameStore((s) => s.damagePlayer)
  const enemy = getEnemy(enemyId)

  const [enemyCurrentHp, setEnemyCurrentHp] = useState(enemy?.maxHp ?? 0)
  const [phase, setPhase] = useState<CombatPhase>('active')
  const [lastPlayerAttack, setLastPlayerAttack] = useState<AttackResult | null>(null)
  const [lastEnemyAttack, setLastEnemyAttack] = useState<AttackResult | null>(null)

  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">当前没有进行中的游戏。</p>
        <Button onClick={onDefeat}>返回主菜单</Button>
      </div>
    )
  }

  if (!enemy) {
    // 未知 enemyId：不得进入战斗、不得崩溃
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">未知敌人（{enemyId}），无法进入战斗。</p>
        <Button onClick={onDefeat}>返回主菜单</Button>
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
    setLastPlayerAttack(playerResult)
    setLastEnemyAttack(null)

    const strike = resolvePlayerStrike(enemyCurrentHp, playerResult)
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
              <span className="text-bone-500">你的攻击：</span>
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
          <Button variant="primary" onClick={handleAttack}>
            普通攻击
          </Button>
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
