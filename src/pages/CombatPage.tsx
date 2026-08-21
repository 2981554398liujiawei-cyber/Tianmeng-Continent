import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem, getCompanion, SAKURA_COMPANION_ID } from '../game/content'
import { ATTRIBUTE_LABELS, getProfessionName } from '../game/content/professions'
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
import { getHighestPartyAgility, getHighestEnemyAgility, resolveEscape, rollEscape } from '../game/rules/escape'
import { getEnemyFirstKillXp } from '../game/rules/combatXp'
import { applyAdventureXpReward } from '../game/rules/progression'
import { combatEventId, type CombatEvent } from '../game/rules/combatEvent'

interface CombatPageProps {
  enemyId: string
  onVictory: () => void
  onDefeat: () => void
  /** TM-P2-006 第 33 节：逃跑成功 → 直接结束战斗返回冒险（不结算 defeated/XP/loot） */
  onEscape: () => void
  /** TM-P0-022-R2：防御性异常出口（无 GameState / 未知 enemyId）→ 真正返回主菜单 */
  onExitToMenu: () => void
}

/** TM-P2-002-R1 A：敌人先手攻击演示延迟（期间玩家操作全封锁；卸载后 timer 被清理不造成伤害） */
const ENEMY_FIRST_STRIKE_DELAY_MS = 400

/** TM-P2-004 第 48/49 节：樱花魔法盾减伤量（reduce_next_enemy_damage amount=3，来自技能注册表） */
const SAKURA_SHIELD_AMOUNT = 3

/** V4：战斗事件（summary 简洁播报 / detail 详细日志） */
type CombatEventKind = CombatEvent['kind']

export default function CombatPage({ enemyId, onVictory, onDefeat, onEscape, onExitToMenu }: CombatPageProps) {
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

  // ---- TM-P2-006 Combat V4：事件流（简洁播报 summary / 详细日志 detail 按回合分组）----
  const [events, setEvents] = useState<CombatEvent[]>([])
  const eventSeqRef = useRef(0)
  const roundRef = useRef(0)
  const pushEvent = (kind: CombatEventKind, actor: CombatEvent['actor'], summary: string, detail: string[] = []) => {
    eventSeqRef.current += 1
    const ev: CombatEvent = {
      id: combatEventId(eventSeqRef.current),
      round: roundRef.current,
      actor,
      kind,
      summary,
      detail,
    }
    setEvents((prev) => [...prev, ev])
  }
  /** 玩家/伙伴行动后进入下一回合计数（先手/系统事件为 0 回合） */
  const nextRound = () => {
    roundRef.current += 1
  }

  // ---- TM-P2-006 第 32 节：逃跑系统 V1（纯公式 escapeScore=(highestPartyAgility+d20)/3 >= highestEnemyAgility）----
  const canEscape = enemy?.canEscape !== false

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
    nextRound()
    pushEvent('initiative', 'enemy', `${enemy.name}抢得先手。`)
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
    // V4：敌人攻击事件（summary 简洁 + detail 完整公式）
    const detail = formatAttackLog(result, player.name)
    if (result.hit && result.damage > 0) {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}的攻击命中，造成 ${result.damage} 点伤害。`, detail)
      damagePlayer(result.damage)
    } else if (result.hit && result.damage <= 0) {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}的攻击被挡下，没有造成伤害。`, detail)
    } else {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}的攻击落空了。`, detail)
    }
    if (absorbed !== null && absorbed > 0) {
      pushEvent('shield', 'companion', `樱花魔法盾抵消了 ${absorbed} 点伤害。`)
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
    nextRound()
    pushEvent('potion', 'player', `你使用了治疗药水，恢复 ${hpAfter - hpBefore} 点生命。`)
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
    nextRound()
    // V4：玩家攻击事件（summary 简洁 + detail 完整公式）
    const detail = formatAttackLog(attack, enemy.name)
    const skillName = action === 'basic' ? null : getSkill(action)?.name ?? '技能'
    if (attack.outcome === 'critical_miss') {
      pushEvent('player_attack', 'player', `你的攻击落空了。`, detail)
    } else if (attack.damage > 0) {
      pushEvent('player_attack', 'player', `${skillName ? `${skillName}命中` : '你的攻击命中'}${enemy.name}，造成 ${attack.damage} 点伤害。`, detail)
    } else {
      pushEvent('player_attack', 'player', `${skillName ? `${skillName}没有` : '你的攻击没有'}造成伤害。`, detail)
    }

    const strike = resolvePlayerStrike(enemyCurrentHp, attack)
    setEnemyCurrentHp(strike.enemyHp)
    if (!strike.enemyShouldCounter) {
      setPhase(strike.phase)
      // TM-P2-003 C：胜利时结算掉落（基础 + 幸运追加；只结算一次）
      if (strike.phase === 'victory') {
        setVictoryLoot(useGameStore.getState().grantLoot(enemyId))
        pushEvent('system', 'system', `${enemy.name}被击败了！`, [])
      }
      return
    }
    // TM-P1-008/TM-P2-003-R1：suppressCounterOnFullHit 技能仅「正常命中/暴击」压制本次反击；擦伤不压制
    // eslint-disable-next-line no-console
    console.log('[DBG-SUPPRESS]', JSON.stringify({ action, outcome: attack.outcome, isSuppress: action !== 'basic' && isSuppressOnFullHitSkill(action), shouldCounter: strike.enemyShouldCounter }))
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
        pushEvent('companion_support', 'companion', `樱花优子展开了魔法盾（可抵消 ${support.amount} 点伤害）。`)
        applyEnemyCounter({ incomingDamageReduction: support.amount })
      } else if (support.type === 'cancel_next_enemy_counter') {
        // 樱花轻舞：本轮敌人不反击
        setCompanionCanceledCounter(true)
        setLastCompanionAction('light_dance')
        pushEvent('companion_support', 'companion', '樱花优子施展轻舞，敌人的攻势被牵走，没有找到反击的机会。')
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
    nextRound()
    // V4：伙伴飞斩事件
    const detail = formatAttackLog(result, enemy.name)
    if (result.damage > 0) {
      pushEvent('companion_attack', 'companion', `樱花飞斩命中${enemy.name}，造成 ${result.damage} 点伤害。`, detail)
    } else {
      pushEvent('companion_attack', 'companion', `樱花飞斩落空了。`, detail)
    }
    const strike = resolvePlayerStrike(enemyCurrentHp, result)
    setEnemyCurrentHp(strike.enemyHp)
    if (!strike.enemyShouldCounter) {
      setPhase(strike.phase)
      // 伙伴击杀 → 胜利（只结算一次 loot / 一次 victory 提交；无反击）
      if (strike.phase === 'victory') {
        setVictoryLoot(useGameStore.getState().grantLoot(enemyId))
        pushEvent('system', 'system', `${enemy.name}被击败了！`, [])
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
    pushEvent('companion_skip', 'companion', '樱花优子静静守在后方。')
    applyEnemyCounter()
  }

  // ---- TM-P2-006 第 31-35 节：逃跑（成功→onEscape；失败→消耗本轮行动，敌人正常行动）----
  const handleEscape = () => {
    if (phase !== 'active' || enemyFirstStriking || awaitingCompanionAction || !canEscape) return
    const partyAgility = getHighestPartyAgility(playerAgility, companionReady && sakuraAttrs ? [sakuraAgility] : [])
    const enemyAgility = getHighestEnemyAgility([enemy.agility])
    const result = rollEscape(partyAgility, enemyAgility)
    nextRound()
    if (result.success) {
      pushEvent('escape_success', 'player', `你成功脱离了战斗。`, [`逃跑值 = (最高敏捷 ${partyAgility} + D20 ${result.roll}) / 3 = ${result.score}；敌方最高敏捷 ${enemyAgility}。`])
      onEscape()
      return
    }
    pushEvent('escape_failure', 'player', `逃跑失败，${enemy.name}封住了你的退路。`, [`逃跑值 = (最高敏捷 ${partyAgility} + D20 ${result.roll}) / 3 = ${result.score}；敌方最高敏捷 ${enemyAgility}。`])
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

  // ---- TM-P2-006 第 42 节：胜利结算面板数据（首次击败 XP + 掉落 + 升级预览）----
  const victoryXp = phase === 'victory' ? getEnemyFirstKillXp(gameState, enemyId) : 0
  const victoryLevelPreview = phase === 'victory' && victoryXp > 0
    ? applyAdventureXpReward(player, victoryXp)
    : null

  // ---- V4：回合分组（详细日志按回合折叠分组）----
  const roundGroups = (() => {
    const groups: { round: number; items: CombatEvent[] }[] = []
    for (const ev of events) {
      const last = groups[groups.length - 1]
      if (last && last.round === ev.round) {
        last.items.push(ev)
      } else {
        groups.push({ round: ev.round, items: [ev] })
      }
    }
    return groups
  })()

  // ---- V4：行动栏 tray 状态（技能 / 物品；仅页面本地 UI 状态）----
  const [actionTray, setActionTray] = useState<'skill' | 'item' | null>(null)

  const actionsLocked = phase !== 'active' || enemyFirstStriking || awaitingCompanionAction

  return (
    <div className="combat-page mx-auto flex h-full w-full max-w-[1600px] flex-col px-4 py-3">
      {/* 顶部薄标题栏 */}
      <header className="mb-3 flex items-center justify-between border-b border-ink-600 pb-2">
        <p className="text-sm tracking-widest text-bone-500">
          战斗 · <span className="text-gold-300">{enemy.name}</span>
          <span className="ml-2 text-bone-500">Lv.{enemy.level}</span>
        </p>
        <p className="text-xs text-bone-500">
          {phase === 'active' ? (enemyFirstStriking ? '敌方先手' : '战斗进行中') : phase === 'victory' ? '胜利' : '失败'}
        </p>
      </header>

      {/* 上：战况（玩家 / 敌人 / 伙伴三面板） */}
      <section className="combat-status mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {/* TM-P2-002 E：玩家面板 */}
        <section data-testid="combat-player-panel" className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
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
        <section data-testid="combat-enemy-panel" className="rounded border border-gold-500/40 bg-ink-800/50 p-4 text-sm text-bone-300">
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
          <section data-testid="combat-companion-panel" className="rounded border border-sakura-500/40 bg-ink-800/50 p-4 text-sm text-bone-300 sm:col-span-2 xl:col-span-1">
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
        {!companion && (
          <section className="hidden rounded border border-ink-700 bg-ink-900/40 p-4 text-sm text-bone-500 sm:col-span-2 xl:col-span-1 xl:block">
            没有并肩作战的伙伴。
          </section>
        )}
      </section>

      {/* 中 + 右：简洁战斗播报（中央）+ 详细战斗日志（右侧，按回合分组） */}
      <section className="combat-main grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* 中央：简洁战斗播报（summary feed） */}
        <div data-testid="combat-summary-feed" className="combat-feed min-h-0 overflow-y-auto rounded border border-ink-600 bg-ink-900/40 p-4">
          <p className="mb-3 text-xs tracking-widest text-bone-500">战况播报</p>
          {events.length === 0 ? (
            <p className="text-sm text-bone-500">战斗开始。</p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((ev) => (
                <p key={ev.id} className="text-sm leading-relaxed text-bone-200">
                  {ev.actor === 'enemy' ? <span className="text-gold-300">【{enemy.name}】</span> : ev.actor === 'companion' ? <span className="text-sakura-300">【樱花优子】</span> : ev.actor === 'system' ? <span className="text-bone-500">【系统】</span> : <span className="text-bone-500">【你】</span>}{' '}
                  {ev.summary}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：详细战斗日志（detail log，按回合分组） */}
        <div data-testid="combat-detail-log" className="combat-log min-h-0 overflow-y-auto rounded border border-ink-600 bg-ink-900/50 p-4">
          <p className="mb-3 text-xs tracking-widest text-bone-500">详细战斗日志</p>
          {roundGroups.length === 0 ? (
            <p className="text-sm text-bone-500">尚无记录。</p>
          ) : (
            <div className="flex flex-col gap-3">
              {roundGroups.map((group) => (
                <div key={`round-${group.round}`} className="rounded border border-ink-700 bg-ink-950/50 p-3">
                  <p className="mb-2 text-xs font-bold text-bone-500">回合 {group.round}</p>
                  <div className="flex flex-col gap-2">
                    {group.items.map((ev) => (
                      <div key={ev.id}>
                        <p className="text-sm text-bone-200">{ev.summary}</p>
                        {ev.detail.length > 0 && (
                          <div className="mt-1 pl-3 text-xs leading-relaxed text-bone-500">
                            {ev.detail.map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 下：固定行动栏（V4 P0：fixed action bar；技能/物品 tray；逃跑） */}
      <footer className="mt-3 border-t border-ink-600 pt-3">
        {phase === 'active' && !awaitingCompanionAction && (
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" disabled={actionsLocked} onClick={handleAttack}>
                普通攻击
              </Button>
              {learnedSkills.length > 0 && (
                <Button variant="ghost" disabled={actionsLocked} onClick={() => setActionTray(actionTray === 'skill' ? null : 'skill')}>
                  技能{actionTray === 'skill' ? ' ▴' : ' ▾'}
                </Button>
              )}
              {healingPotionAmount !== undefined && (
                <Button variant="ghost" disabled={actionsLocked} onClick={() => setActionTray(actionTray === 'item' ? null : 'item')}>
                  物品{actionTray === 'item' ? ' ▴' : ' ▾'}
                </Button>
              )}
              {canEscape && (
                <Button variant="ghost" disabled={actionsLocked} onClick={handleEscape}>
                  逃跑
                </Button>
              )}
              {!canEscape && (
                <span className="text-xs text-bone-600">无法逃离</span>
              )}
            </div>
            {/* TM-P2-003 A：技能 tray（按 learnedSkillIds → Skill Registry 动态生成） */}
            {actionTray === 'skill' && (
              <div data-testid="combat-skill-tray" className="flex flex-wrap items-center justify-center gap-2">
                {learnedSkills.map((skill) => {
                  const mpNotEnough = skill.mpCost > 0 && player.mp < skill.mpCost
                  const onceUsed =
                    skill.combat?.oncePerCombat === true && isOncePerCombatUsed(usedOnceSkillIds, skill.id)
                  return (
                    <div key={skill.id} className="flex flex-col items-center gap-1">
                      <Button
                        variant="primary"
                        disabled={actionsLocked || mpNotEnough || onceUsed}
                        onClick={() => {
                          setActionTray(null)
                          handleSkill(skill.id)
                        }}
                      >
                        {skill.name}
                        {skill.mpCost > 0 ? `（${skill.mpCost} 灵力）` : ''}
                      </Button>
                      {mpNotEnough && <span className="text-xs text-red-300">灵力不足</span>}
                      {onceUsed && <span className="text-xs text-bone-500">本场战斗已使用</span>}
                    </div>
                  )
                })}
              </div>
            )}
            {/* TM-P2-006：物品 tray（当前 MVP：治疗药水） */}
            {actionTray === 'item' && (
              <div data-testid="combat-item-tray" className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <Button
                    variant="primary"
                    disabled={actionsLocked || player.hp >= player.maxHp || healingPotionCount <= 0}
                    onClick={() => {
                      setActionTray(null)
                      handleUseHealingPotion()
                    }}
                  >
                    使用治疗药水（+{healingPotionAmount} 生命）
                  </Button>
                  {healingPotionCount > 0 && <span className="text-xs text-bone-500">剩余：{healingPotionCount}</span>}
                  {healingPotionCount <= 0 && <span className="text-xs text-red-300">没有治疗药水</span>}
                  {healingPotionCount > 0 && player.hp >= player.maxHp && (
                    <span className="text-xs text-bone-500">生命已满</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {/* TM-P2-004 第 47/49 节：伙伴行动阶段（玩家行动后、敌人反击前；MVP 每轮一次） */}
        {phase === 'active' && awaitingCompanionAction && companionReady && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-base font-bold text-sakura-200">樱花优子的行动</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
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
          </div>
        )}
        {/* TM-P2-006 第 42 节：胜利结算面板（XP + 掉落 + 升级预览） */}
        {phase === 'victory' && (
          <>
            <div className="flex flex-col items-center gap-3">
              <p className="text-lg font-bold text-gold-300">战斗胜利</p>
              <div className="w-full max-w-md rounded border border-gold-500/40 bg-ink-900/40 p-4 text-left text-sm text-bone-300">
                {victoryXp > 0 && (
                  <p className="font-bold text-gold-300">冒险阅历 +{victoryXp}</p>
                )}
                {victoryLevelPreview && victoryLevelPreview.levelGain > 0 && (
                  <p className="mt-1 text-bone-200">
                    等级提升至 Lv.{victoryLevelPreview.player.level}
                    {victoryLevelPreview.maxHpGain > 0 && `（生命上限 +${victoryLevelPreview.maxHpGain}`}
                    {victoryLevelPreview.maxMpGain > 0 && `，灵力上限 +${victoryLevelPreview.maxMpGain}`}
                    {victoryLevelPreview.maxHpGain > 0 && '）'}
                  </p>
                )}
                {victoryLoot && (
                  <div className="mt-3">
                    <p className="text-bone-500">掉落：</p>
                    {victoryLoot.items.map((it, index) => {
                      const def = getItem(it.itemId)
                      const rarity = def?.rarity ? `（${RARITY_LABELS[def.rarity]}）` : ''
                      return (
                        <p key={combatLootItemKey(it.itemId, index)} className="mt-1">
                          {def?.name ?? '异常物品（无法识别）'} ×{it.quantity}
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
                {victoryXp <= 0 && !victoryLoot && (
                  <p className="text-bone-500">本次胜利没有额外奖励。</p>
                )}
              </div>
              <Button variant="primary" onClick={onVictory}>
                返回冒险
              </Button>
            </div>
          </>
        )}
        {phase === 'defeat' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-lg font-bold text-red-300">战斗失败</p>
            <Button variant="danger" onClick={onDefeat}>
              返回冒险
            </Button>
          </div>
        )}
      </footer>
    </div>
  )
}

/** React-only identity for victory loot rows; duplicate itemId drops remain separate. */
export function combatLootItemKey(itemId: string, index: number): string {
  return `${itemId}-${index}`
}

/** 读取玩家敏捷（在 gameState 可能为 null 的惰性初始化场景下安全取值） */
function playerAgilityOf(state: { player: { attributes: { agi: number } } }): number {
  return state.player.attributes.agi
}
