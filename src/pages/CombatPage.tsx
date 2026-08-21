import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem, getCompanion, SAKURA_COMPANION_ID } from '../game/content'
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
  getUsableSkills,
  isOncePerCombatUsed,
  isSuppressOnFullHitSkill,
  markOncePerCombatUsed,
  resolveSkillRawDamage,
} from '../game/rules/skill'
import type { InitiativeWinner } from '../game/rules/combat'
import { formatLuckCheckLog } from '../game/rules/luck'
import { getSkill } from '../game/content/skills'
import { resolveEnemyCounterWithSupport } from '../game/rules/combatSupport'
import type { LootGrant } from '../game/types/loot'
import { RARITY_LABELS } from '../game/types/loot'
import { SAKURA_SEALED_SKILLS } from '../game/content/companions'

interface CombatPageProps {
  enemyId: string
  onVictory: () => void
  onDefeat: () => void
  /** TM-P0-022-R2：防御性异常出口（无 GameState / 未知 enemyId）→ 真正返回主菜单 */
  onExitToMenu: () => void
}

/** TM-P2-002-R1 A：敌人先手攻击演示延迟（期间玩家操作全封锁；卸载后 timer 被清理不造成伤害） */
const ENEMY_FIRST_STRIKE_DELAY_MS = 400

/** TM-P2-004 第 48/49 节：樱花魔法盾减伤量（reduce_next_enemy_damage amount=3，来自技能注册表） */
const SAKURA_SHIELD_AMOUNT = 3

export default function CombatPage({ enemyId, onVictory, onDefeat, onExitToMenu }: CombatPageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const damagePlayer = useGameStore((s) => s.damagePlayer)
  const spendSkillMp = useGameStore((s) => s.spendSkillMp)
  const spendCompanionSkillMp = useGameStore((s) => s.spendCompanionSkillMp)
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

  // ---- TM-P2-004：伙伴阶段（樱花优子临时/正式并肩作战）----
  /** 玩家行动后、敌人反击前，等待伙伴行动的标志（MVP：每轮最多一次伙伴行动） */
  const [awaitingCompanionAction, setAwaitingCompanionAction] = useState(false)
  /** 樱花魔法盾剩余减伤（reduce_next_enemy_damage；一次实际命中反击消耗） */
  const [shieldRemaining, setShieldRemaining] = useState(0)
  /** 最近一次盾实际抵消值（日志显示真实抵消量，不足 3 显示真实值） */
  const [shieldAbsorbedLast, setShieldAbsorbedLast] = useState<number | null>(null)
  /** 樱花轻舞：本轮敌人不反击（cancel_next_enemy_counter） */
  const [companionCanceledCounter, setCompanionCanceledCounter] = useState(false)
  /** 伙伴每场一次技能独立追踪（与玩家 Set 分开；TM-P2-004 第 107 节） */
  const [usedOnceCompanionSkillIds, setUsedOnceCompanionSkillIds] = useState<ReadonlySet<string>>(new Set())
  /** 最近一次伙伴行动（'petalslash' | 'shield' | 'light_dance' | 'skip'；仅页面本地） */
  const [lastCompanionAction, setLastCompanionAction] = useState<string | null>(null)
  /** 最近一次伙伴飞斩攻击结果（日志展示） */
  const [lastCompanionAttack, setLastCompanionAttack] = useState<AttackResult | null>(null)

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
        <p className="text-bone-300">敌人数据异常，无法进入战斗。</p>
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
  // TM-P2-003-R3 C：已学习技能统一解析入口（learnedSkillIds → getUsableSkills）
  const learnedSkills = getUsableSkills(gameState.player.learnedSkillIds, player.profession)

  // ---- TM-P2-004：当前战斗伙伴（sakura_yuko；guest/recruited 且 active）----
  const activeCompanionIds = gameState.party?.activeCompanionIds ?? []
  const companion = activeCompanionIds.includes(SAKURA_COMPANION_ID)
    ? gameState.companions[SAKURA_COMPANION_ID]
    : undefined
  const companionDef = companion ? getCompanion(companion.companionId) : undefined
  const companionReady =
    !!companion && (companion.status === 'guest' || companion.status === 'recruited') && !!companionDef
  /** 伙伴技能走 getUsableSkills（profession=undefined → 仅通用技能，即 Sakura 三技能；不硬编码名字） */
  const companionSkills = companion ? getUsableSkills(companion.learnedSkillIds, undefined) : []
  const sakuraAttrs = companionDef?.attributes
  const sakuraAgility = sakuraAttrs ? getPlayerAgility(sakuraAttrs.agi) : 0

  // TM-P2-002 D：敌人先手 → 进入正常回合前先执行一次敌人攻击（仅一次）
  // TM-P2-002-R1 A：攻击进行期间封锁玩家操作（enemyFirstStriking）；timer 由 cleanup 清理
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

  /** TM-P2-002：敌人反击（V3：敏捷命中 + 护甲减伤）——玩家/伙伴行动共用。
   *  TM-P2-004 第 48 节 + R1 A：樱花魔法盾在 V3 最终伤害后额外减伤（最低 0）；命中才消耗盾（miss 保留）。
   *  R1 A：盾减伤走显式上下文参数（incomingDamageReduction）或当前 shieldRemaining，
   *  绝不在同一 call stack 里依赖 setShieldRemaining 之后的闭包值（stale state 修复）。 */
  const applyEnemyCounter = (opts?: { incomingDamageReduction?: number }) => {
    const rawResult = performAttack(enemy.agility, playerAgility, enemy.attackPower, playerArmor)
    // 施盾同回合：显式传入本次盾量（不依赖刚 set 的 state）；跨回合：读当前 shieldRemaining（miss 保留）
    const activeShield = opts?.incomingDamageReduction ?? shieldRemaining
    const { result, absorbed, shieldConsumed } = resolveEnemyCounterWithSupport(rawResult, activeShield)
    setShieldAbsorbedLast(absorbed)
    // 仅真实命中消耗盾；miss 保留到下一次真实命中的敌人反击
    if (shieldConsumed) setShieldRemaining(0)
    setLastEnemyAttack(result)
    if (result.hit && result.damage > 0) {
      damagePlayer(result.damage)
    }
    setPhase(getCombatPhaseAfterEnemyAttack(useGameStore.getState().gameState?.player.hp ?? 1))
  }

  const handleUseHealingPotion = () => {
    // TM-P2-002-R1 A：敌人先手攻击期间药水不可执行
    if (phase !== 'active' || enemyFirstStriking || awaitingCompanionAction) return
    const hpBefore = player.hp
    if (!useHealingPotion()) return
    const hpAfter = useGameStore.getState().gameState?.player.hp ?? hpBefore
    setLastPlayerAttack(null)
    setLastPlayerAction(null)
    setLastPotionHeal(hpAfter - hpBefore)
    setLastEnemyAttack(null)
    // 药水行动后同样可进入伙伴阶段（MVP 统一流程）
    if (companionReady) {
      setAwaitingCompanionAction(true)
      return
    }
    applyEnemyCounter()
  }

  const handleAttack = () => {
    // TM-P2-002-R1 A：敌人先手攻击期间普通攻击不可执行；伙伴行动期间玩家按钮封锁
    if (phase !== 'active' || enemyFirstStriking || awaitingCompanionAction) return
    const playerResult = performAttack(playerAgility, enemy.agility, playerAttackPower, enemy.armor)
    applyPlayerAttack(playerResult, 'basic')
  }

  /** TM-P2-003-R2 B1/B2：技能统一入口（learnedSkillIds → Skill Registry → rules/skill 执行） */
  const handleSkill = (skillId: string) => {
    if (phase !== 'active' || enemyFirstStriking || awaitingCompanionAction) return
    const info = getSkillExecutionInfo(skillId)
    if (!info) return
    if (info.skill.profession !== undefined && info.skill.profession !== player.profession) return
    if (info.oncePerCombat && isOncePerCombatUsed(usedOnceSkillIds, skillId)) return
    const rawDamage = resolveSkillRawDamage(skillId, {
      str: player.attributes.str,
      agi: player.attributes.agi,
      mnd: player.attributes.mnd,
      weaponDamageBonus,
      level: player.level,
    })
    if (rawDamage === null) return
    if (!spendSkillMp(skillId)) return
    if (info.oncePerCombat) {
      setUsedOnceSkillIds((prev) => markOncePerCombatUsed(prev, skillId))
    }
    const skillResult = performAttack(playerAgility, enemy.agility, rawDamage, enemy.armor)
    applyPlayerAttack(skillResult, skillId)
  }

  /** TM-P1-001/006/007/008：玩家攻击共用最小局部结算（V3 保持）——压制按 Skill Registry 标志判断。
   *  TM-P2-004 第 47 节：玩家行动后若伙伴在场且敌人存活 → 进入伙伴行动阶段（敌人反击推迟到伙伴行动后）。 */
  const applyPlayerAttack = (attack: AttackResult, action: string) => {
    setLastPlayerAttack(attack)
    setLastPlayerAction(action)
    setLastPotionHeal(null)
    setLastEnemyAttack(null)

    const strike = resolvePlayerStrike(enemyCurrentHp, attack)
    setEnemyCurrentHp(strike.enemyHp)
    if (!strike.enemyShouldCounter) {
      setPhase(strike.phase)
      // TM-P2-003 C：胜利时结算掉落（基础 + 幸运追加；只结算一次）
      if (strike.phase === 'victory') {
        setVictoryLoot(useGameStore.getState().grantLoot(enemyId))
      }
      return
    }
    // TM-P1-008/TM-P2-003-R1：suppressCounterOnFullHit 技能仅「正常命中/暴击」压制本次反击；擦伤不压制
    if (action !== 'basic' && isSuppressOnFullHitSkill(action) && (attack.outcome === 'hit' || attack.outcome === 'critical_hit')) {
      // 压制已取消本次反击：不进入伙伴阶段（轻舞无意义，绝不白耗 MP）
      return
    }
    // 有反击：伙伴在场且敌人存活 → 伙伴行动阶段
    if (companionReady && strike.phase === 'active') {
      setAwaitingCompanionAction(true)
      return
    }
    applyEnemyCounter()
  }

  // ---- TM-P2-004 第 47-51 节：伙伴行动（按技能注册表 supportEffect 分派，不硬编码 skillId 分支）----

  const handleCompanionSkill = (skillId: string) => {
    if (!companion || !companionReady || phase !== 'active' || !awaitingCompanionAction) return
    const info = getSkillExecutionInfo(skillId)
    if (!info) return
    const support = info.skill.combat?.supportEffect
    // 支持效果：盾 / 轻舞（oncePerCombat 独立追踪；MP 不足不消耗不结束阶段）
    if (support) {
      if (info.oncePerCombat && isOncePerCombatUsed(usedOnceCompanionSkillIds, skillId)) return
      if (!spendCompanionSkillMp(companion.companionId, skillId)) return
      if (info.oncePerCombat) {
        setUsedOnceCompanionSkillIds((prev) => markOncePerCombatUsed(prev, skillId))
      }
      setLastPlayerAttack(null)
      setLastEnemyAttack(null)
      setLastPotionHeal(null)
      setAwaitingCompanionAction(false)
      if (support.type === 'reduce_next_enemy_damage') {
        // 樱花魔法盾：下一次敌人反击最终伤害 -amount（最低 0）
        // R1 A：盾量以显式上下文传给本次反击（不依赖刚 setShieldRemaining 的闭包旧值）
        setShieldRemaining(support.amount)
        setLastCompanionAction('shield')
        applyEnemyCounter({ incomingDamageReduction: support.amount })
      } else if (support.type === 'cancel_next_enemy_counter') {
        // 樱花轻舞：本轮敌人不反击
        setCompanionCanceledCounter(true)
        setLastCompanionAction('light_dance')
      }
      return
    }
    // 伤害技能：樱花飞斩（agility_power；Sakura 自身 AGI/等级，武器加成 0）
    const rawDamage = resolveSkillRawDamage(skillId, {
      str: sakuraAttrs?.str ?? 0,
      agi: sakuraAttrs?.agi ?? 0,
      mnd: sakuraAttrs?.mnd ?? 0,
      weaponDamageBonus: 0,
      level: companion.level,
    })
    if (rawDamage === null) return
    if (!spendCompanionSkillMp(companion.companionId, skillId)) return
    const result = performAttack(sakuraAgility, enemy.agility, rawDamage, enemy.armor)
    setLastPlayerAttack(null)
    setLastEnemyAttack(null)
    setLastPotionHeal(null)
    setLastCompanionAttack(result)
    setLastCompanionAction('petalslash')
    setAwaitingCompanionAction(false)
    const strike = resolvePlayerStrike(enemyCurrentHp, result)
    setEnemyCurrentHp(strike.enemyHp)
    if (!strike.enemyShouldCounter) {
      setPhase(strike.phase)
      // 伙伴击杀 → 胜利（只结算一次 loot / 一次 victory 提交；无反击）
      if (strike.phase === 'victory') {
        setVictoryLoot(useGameStore.getState().grantLoot(enemyId))
      }
      return
    }
    applyEnemyCounter()
  }

  const handleCompanionSkip = () => {
    if (!awaitingCompanionAction) return
    setLastPlayerAttack(null)
    setLastEnemyAttack(null)
    setLastPotionHeal(null)
    setLastCompanionAction('skip')
    setAwaitingCompanionAction(false)
    applyEnemyCounter()
  }

  const actionLabel =
    lastPlayerAction === null || lastPlayerAction === 'basic'
      ? '你的攻击：'
      : `你的${getSkill(lastPlayerAction)?.name ?? '技能'}：`

  const companionActionLabel = (() => {
    if (lastCompanionAction === 'petalslash') return '樱花优子的攻击：'
    if (lastCompanionAction === 'shield') return '樱花优子施展了樱花魔法盾：'
    if (lastCompanionAction === 'light_dance') return '樱花优子施展了樱花轻舞：'
    if (lastCompanionAction === 'skip') return '樱花优子按兵不动。'
    return null
  })()

  return (
    <div className="combat-page mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
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
          <p className="mt-1">
            当前防具：{' '}
            {equippedArmor ? <span className="text-bone-100">{equippedArmor.name}</span> : gameState.equipment.armor ? <span className="text-bone-100">物品数据异常</span> : <span className="text-bone-500">未装备</span>}
          </p>
          <p className="mt-2">
            当前武器：{' '}
            {equippedWeapon ? (
              <span className="text-bone-100">{equippedWeapon.name}</span>
            ) : gameState.equipment.weapon ? (
              <span className="text-bone-100">
                物品数据异常
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

        {/* TM-P2-004 第 47 节：伙伴面板（樱花优子——MP/技能/封印技能展示；敌人只攻击玩家，她不参与受击） */}
        {companion && companionDef && (
          <section className="rounded border border-sakura-500/40 bg-ink-800/50 p-4 text-sm text-bone-300 sm:col-span-2">
            <p className="text-base font-bold text-sakura-200">
              {companionDef.name}
              <span className="ml-2 text-xs font-normal text-bone-500">
                {companion.status === 'recruited' ? '神契宠物' : '临时同行'} · Lv.{companion.level}
              </span>
            </p>
            <p className="mt-1">
              灵力 <span className="tabular-nums text-bone-100">{companion.mp}</span> / {companion.maxMp}
            </p>
            <p className="mt-2 text-xs text-bone-500">可用技能：</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {companionSkills.map((skill) => (
                <span key={skill.id} className="rounded border border-ink-600 bg-ink-900/60 px-2 py-0.5 text-xs text-bone-300">
                  {skill.name}
                  {skill.mpCost > 0 ? `（${skill.mpCost} 灵力）` : ''}
                  {skill.combat?.oncePerCombat === true ? '·每场一次' : ''}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-bone-500">封印技能（尚未恢复）：</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {SAKURA_SEALED_SKILLS.map((sealed) => (
                <span key={sealed.skillId} className="rounded border border-ink-700 bg-ink-900/40 px-2 py-0.5 text-xs text-bone-600">
                  {sealed.name}（封印）
                </span>
              ))}
            </div>
            {shieldRemaining > 0 && (
              <p className="mt-2 text-xs text-sakura-200">樱花魔法盾已展开（可抵消 {shieldRemaining} 点伤害）。</p>
            )}
          </section>
        )}
      </div>

      {(lastPlayerAttack || lastEnemyAttack || lastPotionHeal !== null || lastCompanionAction !== null) && (
        <section className="combat-log rounded border border-ink-600 bg-ink-900/50 p-4 text-sm leading-relaxed text-bone-300">
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
          {/* TM-P2-004：伙伴行动日志 */}
          {lastCompanionAction === 'petalslash' && lastCompanionAttack && (
            <div className="mt-2">
              <p className="text-sakura-200">{companionActionLabel}</p>
              {formatAttackLog(lastCompanionAttack, enemy.name).map((line, i) => (
                <p key={i} className="mt-1">
                  {line}
                </p>
              ))}
            </div>
          )}
          {lastCompanionAction === 'shield' && (
            <p className="mt-2 text-sakura-200">下一次敌人反击的伤害将被削减。</p>
          )}
          {shieldAbsorbedLast !== null && (
            <p className="mt-1 text-sakura-200">樱花魔法盾抵消了 {shieldAbsorbedLast} 点伤害。</p>
          )}
          {lastCompanionAction === 'light_dance' && (
            <p className="mt-2 text-sakura-200">敌人的攻势被轻舞牵走，没有找到反击的机会。</p>
          )}
          {lastCompanionAction === 'skip' && (
            <p className="mt-2 text-bone-500">樱花优子静静守在后方。</p>
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
        {phase === 'active' && !awaitingCompanionAction && (
          <div className="flex flex-col items-center gap-3">
            <Button variant="primary" disabled={enemyFirstStriking} onClick={handleAttack}>
              普通攻击
            </Button>
            {/* TM-P2-003 A：技能按钮由 learnedSkillIds → Skill Registry 动态生成 */}
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
        {/* TM-P2-004 第 47/49 节：伙伴行动阶段（玩家行动后、敌人反击前；MVP 每轮一次） */}
        {phase === 'active' && awaitingCompanionAction && companionReady && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-base font-bold text-sakura-200">樱花优子的行动</p>
            {companionSkills.map((skill) => {
              const mpNotEnough = skill.mpCost > 0 && (companion?.mp ?? 0) < skill.mpCost
              const onceUsed =
                skill.combat?.oncePerCombat === true &&
                isOncePerCombatUsed(usedOnceCompanionSkillIds, skill.id)
              const shieldAlreadyUp = skill.combat?.supportEffect?.type === 'reduce_next_enemy_damage' && shieldRemaining > 0
              return (
                <div key={skill.id} className="flex flex-col items-center gap-1">
                  <Button
                    variant="primary"
                    disabled={mpNotEnough || onceUsed || shieldAlreadyUp}
                    onClick={() => handleCompanionSkill(skill.id)}
                  >
                    {skill.name}
                    {skill.mpCost > 0 ? `（${skill.mpCost} 灵力）` : ''}
                  </Button>
                  {mpNotEnough && <span className="text-xs text-red-300">灵力不足</span>}
                  {onceUsed && <span className="text-xs text-bone-500">本场战斗已使用</span>}
                  {shieldAlreadyUp && <span className="text-xs text-bone-500">盾已展开</span>}
                </div>
              )
            })}
            <Button variant="ghost" onClick={handleCompanionSkip}>
              跳过
            </Button>
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
