import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem } from '../game/content'
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, getProfessionName } from '../game/content/professions'
import {
  formatAttackLog,
  getPlayerAgility,
  getPlayerArmor,
  getPlayerAttackPower,
  getPlayerLevelDamageBonus,
  performAttack,
  rollInitiative,
  getCombatPhaseAfterEnemyAttack,
  resolvePlayerStrike,
  type AttackResult,
  type CombatPhase,
} from '../game/rules/combat'
import {
  getSkillExecutionInfo,
  isOncePerCombatUsed,
  isSuppressOnFullHitSkill,
  markOncePerCombatUsed,
  resolveSkillRawDamage,
} from '../game/rules/skill'
import type { InitiativeWinner } from '../game/rules/combat'
import { formatLuckCheckLog } from '../game/rules/luck'
import { getSkill } from '../game/content/skills'
import type { SkillDefinition } from '../game/types/skill'
import type { LootGrant } from '../game/types/loot'
import { RARITY_LABELS } from '../game/types/loot'

interface CombatPageProps {
  enemyId: string
  onVictory: () => void
  onDefeat: () => void
  /** TM-P0-022-R2：防御性异常出口（无 GameState / 未知 enemyId）→ 真正返回主菜单 */
  onExitToMenu: () => void
}

/** TM-P2-002-R1 A：敌人先手攻击演示延迟（期间玩家操作全封锁；卸载后 timer 被清理不造成伤害） */
const ENEMY_FIRST_STRIKE_DELAY_MS = 400

export default function CombatPage({ enemyId, onVictory, onDefeat, onExitToMenu }: CombatPageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const damagePlayer = useGameStore((s) => s.damagePlayer)
  const spendSkillMp = useGameStore((s) => s.spendSkillMp)
  const useHealingPotion = useGameStore((s) => s.useHealingPotion)
  const enemy = getEnemy(enemyId)

  const [enemyCurrentHp, setEnemyCurrentHp] = useState(enemy?.maxHp ?? 0)
  const [phase, setPhase] = useState<CombatPhase>('active')
  const [lastPlayerAttack, setLastPlayerAttack] = useState<AttackResult | null>(null)
  const [lastEnemyAttack, setLastEnemyAttack] = useState<AttackResult | null>(null)
  /** TM-P1-015：最近一次成功药水行动的实际恢复量（仅战斗 UI 即时日志） */
  const [lastPotionHeal, setLastPotionHeal] = useState<number | null>(null)
  /** TM-P2-003 C：战斗胜利结算的掉落（基础 + 幸运追加；victory 界面展示） */
  const [victoryLoot, setVictoryLoot] = useState<LootGrant | null>(null)
  /** TM-P1-001/006/007/008：最近一次玩家行动类型（仅页面本地） */
  /** TM-P2-003 A：最近一次玩家行动（'basic' 或技能 id；仅页面本地） */
  const [lastPlayerAction, setLastPlayerAction] = useState<string | null>(null)
  /** TM-P2-003-R2 B2：每场一次技能按 skillId 独立追踪（Set；使用 A 不影响 B） */
  const [usedOnceSkillIds, setUsedOnceSkillIds] = useState<ReadonlySet<string>>(new Set())
  /** TM-P2-002 D：先手（进入战斗时双方各掷 D20+AGI；高者先，平局 AGI 高者先，仍同则玩家先）。
   * 用 ref 缓存结果：React StrictMode 会双调用组件体/useState initializer，若直接掷骰会消耗两次随机数
   * 导致序列错位；ref 保证同一组件实例只掷一次。 */
  const initiativeWinnerRef = useRef<InitiativeWinner | null>(null)
  if (initiativeWinnerRef.current === null) {
    initiativeWinnerRef.current = gameState && enemy ? rollInitiative(playerAgilityOf(gameState), enemy.agility) : null
  }
  const initiativeWinner = initiativeWinnerRef.current
  /** TM-P2-002-R1 A：敌人先手攻击进行中 → 所有玩家操作（攻击/技能/药水）封锁、不消耗 MP */
  const [enemyFirstStriking, setEnemyFirstStriking] = useState(false)
  const [enemyFirstStrikeDone, setEnemyFirstStrikeDone] = useState(false)

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
  // TM-P2-003 A：已学习技能 = learnedSkillIds → Skill Registry 动态解析（未知/损坏/职业不匹配安全忽略）
  const learnedSkills = (gameState.player.learnedSkillIds ?? [])
    .map((id) => getSkill(id))
    .filter((s): s is SkillDefinition => s !== undefined && s.profession === player.profession)

  // TM-P2-002 D：敌人先手 → 进入正常回合前先执行一次敌人攻击（仅一次）
  // TM-P2-002-R1 A：攻击进行期间封锁玩家操作（enemyFirstStriking）；timer 由 cleanup 清理，
  // 组件卸载/战斗结束/退出后残留 timer 不得继续造成伤害。
  // StrictMode 双挂载兼容：第一次挂载的 timer 被 cleanup 取消后，第二次挂载会重新创建 timer，
  // 最终恰好攻击一次、封锁恰好一次（不用 ref 防重，避免 cleanup 后永久锁死）。
  useEffect(() => {
    if (initiativeWinner !== 'enemy') return
    setEnemyFirstStriking(true)
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (cancelled) return
      applyEnemyCounter()
      setEnemyFirstStrikeDone(true)
      setEnemyFirstStriking(false)
    }, ENEMY_FIRST_STRIKE_DELAY_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
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
    // TM-P2-002-R1 A：敌人先手攻击期间药水不可执行
    if (phase !== 'active' || enemyFirstStriking) return
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
    // TM-P2-002-R1 A：敌人先手攻击期间普通攻击不可执行
    if (phase !== 'active' || enemyFirstStriking) return
    const playerResult = performAttack(playerAgility, enemy.agility, playerAttackPower, enemy.armor)
    applyPlayerAttack(playerResult, 'basic')
  }

  /** TM-P2-003-R2 B1/B2：技能统一入口（learnedSkillIds → Skill Registry → rules/skill 执行）。
   * 伤害 resolver / MP cost / once-per-combat / 压制全部来自注册表与 rules/skill.ts，
   * 页面不硬编码任何 skillId 分支；once 按 skillId 独立（Set）。
   * 执行顺序：先纯计算校验 → 再耗 MP → 再标记已用 → 最后结算（MP 失败不吞标记）。 */
  const handleSkill = (skillId: string) => {
    if (phase !== 'active' || enemyFirstStriking) return
    const info = getSkillExecutionInfo(skillId)
    if (!info || info.skill.profession !== player.profession) return
    // 每场一次：已使用（本技能）→ 拒绝
    if (info.oncePerCombat && isOncePerCombatUsed(usedOnceSkillIds, skillId)) return
    // 原始伤害（rules/skill resolver；未知/无 resolver 返回 null → 拒绝）
    const rawDamage = resolveSkillRawDamage(skillId, {
      str: player.attributes.str,
      agi: player.attributes.agi,
      mnd: player.attributes.mnd,
      weaponDamageBonus,
      level: player.level,
    })
    if (rawDamage === null) return
    // MP 消费（注册表 cost；唯一入口；false → 不掷骰、不改 HP、不反击、不标记）
    if (!spendSkillMp(skillId)) return
    // 标记每场一次（此时才确认真正执行）
    if (info.oncePerCombat) {
      setUsedOnceSkillIds((prev) => markOncePerCombatUsed(prev, skillId))
    }
    const skillResult = performAttack(playerAgility, enemy.agility, rawDamage, enemy.armor)
    applyPlayerAttack(skillResult, skillId)
  }

  /** TM-P1-001/006/007/008：玩家攻击共用最小局部结算（V3 保持）——压制按 Skill Registry 标志判断 */
  const applyPlayerAttack = (attack: AttackResult, action: string) => {
    setLastPlayerAttack(attack)
    setLastPlayerAction(action)
    setLastPotionHeal(null)
    setLastEnemyAttack(null)

    const strike = resolvePlayerStrike(enemyCurrentHp, attack)
    setEnemyCurrentHp(strike.enemyHp)
    if (!strike.enemyShouldCounter) {
      setPhase(strike.phase)
      // TM-P2-003 C：胜利时结算掉落（基础 + 幸运追加；无掉落表返回 null 不展示）
      setVictoryLoot(useGameStore.getState().grantLoot(enemyId))
      return
    }
    // TM-P1-008/TM-P2-003-R1：suppressCounterOnFullHit 技能仅「正常命中/暴击」压制本次反击；擦伤不压制
    if (action !== 'basic' && isSuppressOnFullHitSkill(action) && (attack.outcome === 'hit' || attack.outcome === 'critical_hit')) {
      return
    }
    applyEnemyCounter()
  }

  const actionLabel =
    lastPlayerAction === null || lastPlayerAction === 'basic'
      ? '你的攻击：'
      : `你的${getSkill(lastPlayerAction)?.name ?? '技能'}：`

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="border-b border-ink-600 pb-4 text-center">
        <h2 className="text-xl font-bold tracking-widest text-gold-300">战斗</h2>
      </header>

      {/* TM-P2-002 D：先手提示（TM-P2-002-R1 A：攻击进行期间显示「抢得先手」并封锁操作） */}
      {enemyFirstStriking && phase === 'active' && (
        <p className="text-center text-sm text-gold-300">{enemy.name}抢得先手……</p>
      )}
      {enemyFirstStrikeDone && !enemyFirstStriking && phase === 'active' && (
        <p className="text-center text-sm text-bone-500">{enemy.name}先手。</p>
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
              {formatAttackLog(lastPlayerAttack, enemy.name).map((line, i) => (
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
              {formatAttackLog(lastEnemyAttack, player.name).map((line, i) => (
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
            <Button variant="primary" disabled={enemyFirstStriking} onClick={handleAttack}>
              普通攻击
            </Button>
            {/* TM-P2-003 A：技能按钮由 learnedSkillIds → Skill Registry 动态生成（不再按职业四段 if） */}
            {learnedSkills.map((skill) => {
              const mpNotEnough = skill.mpCost > 0 && player.mp < skill.mpCost
              const onceUsed =
                skill.combat?.oncePerCombat === true && isOncePerCombatUsed(usedOnceSkillIds, skill.id)
              return (
                <div key={skill.id} className="flex flex-col items-center gap-1">
                  <Button
                    variant="primary"
                    disabled={enemyFirstStriking || mpNotEnough || onceUsed}
                    onClick={() => handleSkill(skill.id)}
                  >
                    {skill.name}
                    {skill.mpCost > 0 ? `（${skill.mpCost} 灵力）` : ''}
                  </Button>
                  {mpNotEnough && <span className="text-xs text-red-300">灵力不足</span>}
                  {onceUsed && <span className="text-xs text-bone-500">本场战斗已使用</span>}
                </div>
              )
            })}
            {healingPotionAmount !== undefined && (
              <div className="flex flex-col items-center gap-1">
                <Button
                  variant="primary"
                  disabled={enemyFirstStriking || player.hp >= player.maxHp || healingPotionCount <= 0}
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
            {victoryLoot && (
              <div className="rounded border border-gold-500/40 bg-ink-900/40 p-4 text-left text-sm text-bone-300">
                <p className="text-bone-500">掉落：</p>
                {victoryLoot.items.map((it) => {
                  const def = getItem(it.itemId)
                  const rarity = def?.rarity ? `（${RARITY_LABELS[def.rarity]}）` : ''
                  return (
                    <p key={it.itemId} className="mt-1">
                      {def?.name ?? it.itemId} ×{it.quantity}
                      {rarity}
                    </p>
                  )
                })}
                {victoryLoot.gold > 0 && <p className="mt-1">金币 +{victoryLoot.gold}</p>}
                {victoryLoot.luckCheck && (
                  <div className="mt-2 text-xs text-bone-500">
                    {formatLuckCheckLog(victoryLoot.luckCheck).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
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
