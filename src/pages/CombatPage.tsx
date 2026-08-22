import { useEffect, useRef, useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem, getCompanion, getEncounter, SAKURA_COMPANION_ID } from '../game/content'
import { getProfessionName } from '../game/content/professions'
import {
  formatAttackLog,
  getPlayerAgility,
  getPlayerArmor,
  getPlayerAttackPower,
  performAttack,
  type AttackResult,
} from '../game/rules/combat'
import {
  getSkillExecutionInfo,
  getUsableSkills,
  isOncePerCombatUsed,
  markOncePerCombatUsed,
  resolveSkillRawDamage,
} from '../game/rules/skill'
import type { SkillDefinition } from '../game/types/skill'
import { formatLuckCheckLog } from '../game/rules/luck'
import { getSkill } from '../game/content/skills'
import { rollD20 } from '../game/rules/d20'
import type { LootGrant } from '../game/types/loot'
import { RARITY_LABELS } from '../game/types/loot'
import { SAKURA_SEALED_SKILLS } from '../game/content/companions'
import { getStartingMaxHp } from '../game/rules/character'
import { currentEncounterVariantId, singleEnemyIdOf } from '../game/rules/encounter'
import {
  buildEnemyCombatant,
  buildEnemyInstances,
  buildFriendlyCombatant,
  chooseEnemyTarget,
  didTurnLoop,
  instanceDisplaySuffix,
  isEncounterLost,
  isEncounterWon,
  nextAliveTurnIndex,
  resolveEncounterXp,
  resolvePartyEscape,
  rollInitiativeQueue,
  updateCombatantHp,
  type Combatant,
  type EncounterLootSummary,
  type EnemyInstance,
  type InitiativeTurn,
} from '../game/rules/partyCombat'
import { applyAdventureXpReward } from '../game/rules/progression'
import { getEffectiveCharacterAttributes } from '../game/rules/mount'
import { combatEventId, type CombatEvent } from '../game/rules/combatEvent'
import type { EncounterDefinition } from '../game/types/encounter'
import type { GameState } from '../game/types/game'

interface CombatPageProps {
  /** TM-P2-007 §7：Encounter 战斗入口（App 已通过 startEncounter 校验并固化 weighted variant） */
  encounterId: string
  onVictory: () => void
  onDefeat: () => void
  /** TM-P2-006 第 33 节：逃跑成功 → 直接结束战斗返回冒险（不结算 defeated/XP/loot） */
  onEscape: () => void
  /** TM-P0-022-R2：防御性异常出口（无 GameState / 未知 encounterId / 无有效阵容）→ 真正返回主菜单 */
  onExitToMenu: () => void
}

/** TM-P2-007 §12：敌方单位 AI 行动的演示延迟（期间玩家操作不可用；卸载后 timer 被清理） */
const ENEMY_ACTION_DELAY_MS = 400

/** V4：战斗事件（summary 简洁播报 / detail 详细日志） */
type CombatEventKind = CombatEvent['kind']

/** 技能目标模式（TM-P2-007 §11：伤害→敌方 / 盾、治疗→友方 / 自身技能→无 picker） */
type SkillTargetMode = 'enemy' | 'friendly' | 'self'

/** 目标选择挂起状态（§11：点击后先选目标再执行；取消不耗行动） */
interface PendingTarget {
  mode: 'enemy' | 'friendly'
  kind: 'attack' | 'skill'
  skillId?: string
}

/** 战斗构建结果（进入战斗时一次性生成；战斗过程全在本地 state） */
interface CombatSetup {
  friendly: Combatant[]
  enemies: Combatant[]
  combatants: Combatant[]
  turns: InitiativeTurn[]
  singleEnemyId: string | undefined
  canEscape: boolean
  companion: {
    companionId: string
    level: number
    skills: SkillDefinition[]
    attrs: GameState['player']['attributes']
  } | null
}

/** 击败统计（§6 VictorySummary：按 enemyId 聚合数量） */
interface DefeatedEntry {
  enemyId: string
  name: string
  count: number
}

/** 读取装备武器攻击加成（与单敌版本一致；equipment 数据异常返回 0） */
function weaponDamageBonusOf(state: GameState): number {
  const equipped = state.equipment.weapon ? getItem(state.equipment.weapon) : undefined
  return equipped?.type === 'weapon' && Number.isInteger(equipped.weaponDamageBonus) ? (equipped.weaponDamageBonus ?? 0) : 0
}

/** 读取装备护甲防御加成（equipment 数据异常返回 0） */
function armorDefenseBonusOf(state: GameState): number {
  const equipped = state.equipment.armor ? getItem(state.equipment.armor) : undefined
  return equipped?.type === 'armor' && Number.isInteger(equipped.armorDefenseBonus) ? (equipped.armorDefenseBonus ?? 0) : 0
}

/** 技能目标模式推导（§11：不按 skillId 硬编码；supportEffect/标签语义决定） */
function skillTargetMode(skill: SkillDefinition): SkillTargetMode {
  if (skill.combat?.supportEffect?.type === 'reduce_next_enemy_damage') return 'friendly'
  if (skill.combat?.supportEffect?.type === 'cancel_next_enemy_counter') return 'self'
  if (skill.tags.includes('healing')) return 'friendly'
  return 'enemy'
}

/** 构建本场遭遇的全部战斗单位与先手队列（纯函数；生产用 Math.random 注入） */
function buildCombatSetup(state: GameState, def: EncounterDefinition): CombatSetup {
  const player = state.player
  // P2-007 §20：Combat derived stats 使用「装备坐骑后的有效五维」
  const playerAttrs = getEffectiveCharacterAttributes(player.attributes, state.equippedMountId)
  const playerCombatant = buildFriendlyCombatant({
    instanceId: 'player',
    sourceType: 'player',
    sourceId: 'player',
    name: player.name,
    currentHp: player.hp,
    maxHp: player.maxHp,
    currentMp: player.mp,
    maxMp: player.maxMp,
    attack: getPlayerAttackPower(playerAttrs.str, weaponDamageBonusOf(state), player.level),
    armor: getPlayerArmor(playerAttrs.con, armorDefenseBonusOf(state)),
    agility: getPlayerAgility(playerAttrs.agi),
  })
  const friendly = [playerCombatant]

  // 伙伴（guest/recruited 且 active；伙伴 HP 不持久化，战斗内按 con 派生满血进入）
  const activeCompanionIds = state.party?.activeCompanionIds ?? []
  const companionState = activeCompanionIds.includes(SAKURA_COMPANION_ID)
    ? state.companions[SAKURA_COMPANION_ID]
    : undefined
  const companionDef = companionState ? getCompanion(companionState.companionId) : undefined
  const companionReady =
    !!companionState && (companionState.status === 'guest' || companionState.status === 'recruited') && !!companionDef
  const companion = companionReady && companionState && companionDef
    ? {
        companionId: companionState.companionId,
        level: companionState.level,
        skills: getUsableSkills(companionState.learnedSkillIds, undefined),
        attrs: companionDef.attributes,
      }
    : null
  if (companion) {
    const attrs = companion.attrs
    const maxHp = getStartingMaxHp(attrs.con)
    friendly.push(
      buildFriendlyCombatant({
        instanceId: 'companion',
        sourceType: 'companion',
        sourceId: companion.companionId,
        name: companionDef!.name,
        currentHp: maxHp,
        maxHp,
        currentMp: companionState!.mp,
        maxMp: companionDef!.maxMp,
        attack: getPlayerAttackPower(attrs.str, 0, companion.level),
        armor: getPlayerArmor(attrs.con, 0),
        agility: getPlayerAgility(attrs.agi),
      }),
    )
  }

  // 敌方（fixed 或已固化的 weighted variant 阵容）
  const variantId = currentEncounterVariantId(state, def)
  const members = def.fixedMembers ?? def.variants?.find((v) => v.id === variantId)?.members
  if (!members || members.length === 0) {
    throw new Error(`encounter ${def.id} 无有效阵容`)
  }
  const instances = buildEnemyInstances(members)
  const enemies = instances.map(buildEnemyCombatant)

  const turns = rollInitiativeQueue([...friendly, ...enemies], Math.random)
  return {
    friendly,
    enemies,
    combatants: [...friendly, ...enemies],
    turns,
    singleEnemyId: singleEnemyIdOf(def),
    canEscape: def.canEscape,
    companion,
  }
}

/** 击败统计（§6：敌方死亡单位按 sourceId 聚合） */
function buildDefeatedList(combatants: readonly Combatant[]): DefeatedEntry[] {
  const map = new Map<string, DefeatedEntry>()
  for (const c of combatants) {
    if (c.side !== 'enemy' || c.isAlive) continue
    const entry = map.get(c.sourceId)
    if (entry) {
      entry.count += 1
    } else {
      map.set(c.sourceId, { enemyId: c.sourceId, name: c.name, count: 1 })
    }
  }
  return [...map.values()]
}

export default function CombatPage({ encounterId, onVictory, onDefeat, onEscape, onExitToMenu }: CombatPageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const def = gameState ? getEncounter(encounterId) : undefined

  // 战斗构建（ref 缓存：StrictMode 双调用组件体 / useState initializer 只构建一次）
  const setupRef = useRef<CombatSetup | null>(null)
  if (!setupRef.current && gameState && def) {
    try {
      setupRef.current = buildCombatSetup(gameState, def)
    } catch {
      setupRef.current = null
    }
  }
  const setup = setupRef.current

  const [combatants, setCombatants] = useState<Combatant[]>(() => setup?.combatants ?? [])
  const [turns, setTurns] = useState<InitiativeTurn[]>(() => setup?.turns ?? [])
  const [currentTurnIndex, setCurrentTurnIndex] = useState(0)
  const [phase, setPhase] = useState<'active' | 'victory' | 'defeat'>('active')
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(null)
  const [actionTray, setActionTray] = useState<'skill' | 'item' | null>(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)

  /** 每场一次技能按 skillId 独立追踪（玩家 / 伙伴分开；TM-P2-003-R2 B2） */
  const [usedOnceSkillIds, setUsedOnceSkillIds] = useState<ReadonlySet<string>>(new Set())
  const [usedOnceCompanionSkillIds, setUsedOnceCompanionSkillIds] = useState<ReadonlySet<string>>(new Set())

  /** TM-P2-004 第 48/49 节：樱花魔法盾——target instanceId → 剩余减伤量（敌人命中该目标时消耗） */
  const [shieldByTarget, setShieldByTarget] = useState<Record<string, number>>({})
  /** 樱花轻舞：标记「下一个敌方行动被取消」（本场一次；cancel_next_enemy_counter） */
  const [skipNextEnemy, setSkipNextEnemy] = useState(false)

  const [events, setEvents] = useState<CombatEvent[]>([])
  const [victoryLoot, setVictoryLoot] = useState<LootGrant | null>(null)
  const [victorySummary, setVictorySummary] = useState<EncounterLootSummary | null>(null)
  const [defeatedList, setDefeatedList] = useState<DefeatedEntry[]>([])
  const [victoryXp, setVictoryXp] = useState(0)
  const [victoryLevelPreview, setVictoryLevelPreview] = useState<ReturnType<typeof applyAdventureXpReward> | null>(null)
  /** 战斗内使用治疗药水的次数（结束同步时一次扣减 inventory） */
  const potionsUsedRef = useRef(0)

  const eventSeqRef = useRef(0)
  const roundRef = useRef(0)
  const pushEvent = (kind: CombatEventKind, actor: CombatEvent['actor'], summary: string, detail: string[] = []) => {
    eventSeqRef.current += 1
    const ev: CombatEvent = { id: combatEventId(eventSeqRef.current), round: roundRef.current, actor, kind, summary, detail }
    setEvents((prev) => [...prev, ev])
  }

  // ---- 敌方 AI 回合（effect + ref 防 StrictMode 双调；timer 卸载清理）----
  // 注：effect 回调在渲染完成后才执行，此处引用定义在下方条件 return 之后的 executeEnemyTurn 是安全的（TDZ 已解除）。
  useEffect(() => {
    if (phase !== 'active') return
    const actor = turns[currentTurnIndex]?.combatant
    if (!actor || actor.side !== 'enemy' || !actor.isAlive) return
    if (skipNextEnemy) {
      setSkipNextEnemy(false)
      pushEvent('companion_skip', 'companion', `${actor.name}被樱花轻舞牵走了注意力，本回合没有行动。`)
      setCurrentTurnIndex((idx) => advanceTurnIndex(idx))
      return
    }
    const timer = window.setTimeout(() => {
      executeEnemyTurn(actor)
    }, ENEMY_ACTION_DELAY_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurnIndex, phase, skipNextEnemy])

  // ---- 战斗开场播报（ref 防 StrictMode 双调）----
  const introLoggedRef = useRef(false)
  useEffect(() => {
    if (introLoggedRef.current) return
    introLoggedRef.current = true
    const first = turns[currentTurnIndex]?.combatant
    pushEvent('initiative', 'system', first ? `战斗开始——${first.name}先行动。` : '战斗开始。')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 移动端详细战斗日志抽屉 ESC 关闭 ----
  useEffect(() => {
    if (!detailDrawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetailDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [detailDrawerOpen])

  // ---- 防御性异常出口 ----
  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">当前没有进行中的游戏。</p>
        <Button onClick={onExitToMenu}>返回主菜单</Button>
      </div>
    )
  }
  if (!def || !setup || setup.turns.length === 0 || setup.combatants.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">遭遇数据异常，无法进入战斗。</p>
        <Button onClick={onExitToMenu}>返回主菜单</Button>
      </div>
    )
  }

  const player = gameState.player
  // P2-007 §20：技能 rawDamage 上下文同样使用装备坐骑后的有效五维
  const effectivePlayerAttrs = getEffectiveCharacterAttributes(player.attributes, gameState.equippedMountId)
  const enemyInstances = setup.enemies
  const friendlyInstances = setup.friendly
  const companionInfo = setup.companion
  const canEscape = setup.canEscape

  // 当前行动单位（turns 内的引用；HP 变化以 combatants 为准）
  const currentCombatant = combatants.find((c) => c.instanceId === turns[currentTurnIndex]?.combatant.instanceId)
  const isPlayerTurn = currentCombatant?.sourceType === 'player' && currentCombatant?.isAlive
  const isFriendlyTurn = currentCombatant?.side === 'friendly' && currentCombatant?.isAlive
  const actionsLocked = phase !== 'active' || !isFriendlyTurn || pendingTarget !== null

  // 玩家 / 伙伴当前 combatant（面板展示 + 行动）
  const playerCombatant = combatants.find((c) => c.sourceType === 'player')
  const companionCombatant = combatants.find((c) => c.sourceType === 'companion')

  const healingPotion = getItem('healing_potion')
  const healingPotionAmount = healingPotion?.healAmount
  const healingPotionCount = gameState.inventory
    .filter((entry) => entry.itemId === 'healing_potion' && Number.isSafeInteger(entry.quantity) && entry.quantity >= 1)
    .reduce((total, entry) => total + entry.quantity, 0)

  /** 提交战斗单位状态更新：基于当前 combatants 计算 next 并返回（一次行动只 commit 一次） */
  const commitCombatantUpdate = (updater: (cs: Combatant[]) => Combatant[]): Combatant[] => {
    const next = updater(combatants)
    setCombatants(next)
    return next
  }

  /** 推进到下一个存活单位（§9.4：环状；回绕 = 新回合 round+1） */
  const advanceTurnIndex = (fromIndex: number): number => {
    const next = nextAliveTurnIndex(turns, fromIndex)
    if (didTurnLoop(fromIndex, next)) roundRef.current += 1
    return next
  }

  /** 行动后统一收尾：胜负判定 → 结算 / 推进回合 */
  const afterAction = (next: Combatant[]) => {
    if (isEncounterWon(next)) {
      setPhase('victory')
      finalizeCombatEnd(next)
      return
    }
    if (isEncounterLost(next)) {
      setPhase('defeat')
      finalizeCombatEnd(next)
      return
    }
    setCurrentTurnIndex((idx) => advanceTurnIndex(idx))
  }

  /** 战斗结束统一同步：玩家 HP/MP + 药水 + 伙伴 MP 写入 GameState；胜利再结算 XP/loot/flags */
  const finalizeCombatEnd = (next: Combatant[]) => {
    const playerC = next.find((c) => c.sourceType === 'player')
    const companionC = next.find((c) => c.sourceType === 'companion')
    useGameStore.getState().applyPartyCombatEnd({
      playerHp: playerC?.currentHp ?? 0,
      playerMp: playerC?.currentMp ?? 0,
      potionsUsed: potionsUsedRef.current,
      companion: companionC ? { companionId: companionC.sourceId, mp: companionC.currentMp } : undefined,
    })
    if (!isEncounterWon(next)) return
    // 胜利结算（§6/§15/§16）：单敌委托 grantLoot + resolveCombatVictory；多敌整体事务一次写入并返回 summary
    if (setup.singleEnemyId) {
      setVictoryLoot(useGameStore.getState().grantLoot(setup.singleEnemyId))
      useGameStore.getState().resolveEncounterVictory(encounterId)
    } else {
      const summary = useGameStore.getState().resolveEncounterVictory(encounterId)
      setVictorySummary(summary)
    }
    const defeatedInstances: EnemyInstance[] = next
      .filter((c) => c.side === 'enemy' && !c.isAlive)
      .map((c) => ({ instanceId: c.instanceId, enemyId: c.sourceId, currentHp: 0, maxHp: c.maxHp }))
    const xp = resolveEncounterXp(gameState, defeatedInstances)
    setDefeatedList(buildDefeatedList(next))
    setVictoryXp(xp)
    setVictoryLevelPreview(xp > 0 ? applyAdventureXpReward(gameState.player, xp) : null)
  }

  /** 逃跑成功同步（无任何奖励：§14） */
  const finalizeEscape = () => {
    const playerC = combatants.find((c) => c.sourceType === 'player')
    const companionC = combatants.find((c) => c.sourceType === 'companion')
    useGameStore.getState().applyPartyCombatEnd({
      playerHp: playerC?.currentHp ?? 0,
      playerMp: playerC?.currentMp ?? 0,
      potionsUsed: potionsUsedRef.current,
      companion: companionC ? { companionId: companionC.sourceId, mp: companionC.currentMp } : undefined,
    })
  }

  /** 攻击结果结算（普通攻击 / 技能共用）：伤害 + 事件 + 收尾 */
  const applyAttackResult = (actor: Combatant, target: Combatant, result: AttackResult, action: string) => {
    const skillName = action === 'basic' ? null : getSkill(action)?.name ?? '技能'
    const detail = formatAttackLog(result, target.name)
    const kind: CombatEventKind = actor.sourceType === 'companion' ? 'companion_attack' : 'player_attack'
    if (result.outcome === 'critical_miss') {
      pushEvent(kind, actor.sourceType, `${actor.name}的攻击落空了。`, detail)
    } else if (result.damage > 0) {
      pushEvent(
        kind,
        actor.sourceType,
        `${skillName ? `${skillName}命中` : `${actor.name}的攻击命中`}${target.name}，造成 ${result.damage} 点伤害。`,
        detail,
      )
    } else {
      pushEvent(kind, actor.sourceType, `${skillName ? `${skillName}没有` : `${actor.name}的攻击没有`}造成伤害。`, detail)
    }
    const next = commitCombatantUpdate((cs) =>
      cs.map((c) => (c.instanceId === target.instanceId ? updateCombatantHp(c, c.currentHp - result.damage) : c)),
    )
    afterAction(next)
  }

  /** 每场一次技能标记（玩家 / 伙伴分开） */
  const markOnceUsed = (actor: Combatant, skillId: string) => {
    if (actor.sourceType === 'companion') {
      setUsedOnceCompanionSkillIds((prev) => markOncePerCombatUsed(prev, skillId))
    } else {
      setUsedOnceSkillIds((prev) => markOncePerCombatUsed(prev, skillId))
    }
  }

  /** oncePerCombat 是否已用（按 actor 归属） */
  const isOnceUsed = (actor: Combatant, skillId: string): boolean =>
    actor.sourceType === 'companion'
      ? isOncePerCombatUsed(usedOnceCompanionSkillIds, skillId)
      : isOncePerCombatUsed(usedOnceSkillIds, skillId)

  /** 伤害技能 rawDamage 上下文（玩家走装备加成；伙伴武器加成 0） */
  const skillContextFor = (actor: Combatant) =>
    actor.sourceType === 'companion'
      ? {
          str: companionInfo?.attrs.str ?? 0,
          agi: companionInfo?.attrs.agi ?? 0,
          mnd: companionInfo?.attrs.mnd ?? 0,
          weaponDamageBonus: 0,
          level: companionInfo?.level ?? 1,
        }
      : {
          str: effectivePlayerAttrs.str,
          agi: effectivePlayerAttrs.agi,
          mnd: effectivePlayerAttrs.mnd,
          weaponDamageBonus: weaponDamageBonusOf(gameState),
          level: player.level,
        }

  /** 技能执行（伤害→目标 / 盾→友方目标 / 轻舞→自身无 picker） */
  const executeSkill = (actor: Combatant, skillId: string, target?: Combatant) => {
    const info = getSkillExecutionInfo(skillId)
    if (!info) return
    if (info.oncePerCombat && isOnceUsed(actor, skillId)) return
    const support = info.skill.combat?.supportEffect
    // 盾：选友方目标，目标下次被敌人命中减伤
    if (support?.type === 'reduce_next_enemy_damage') {
      if (!target || target.side !== 'friendly') return
      if (actor.currentMp < info.skill.mpCost) {
        pushEvent('system', 'system', '灵力不足，技能无法施展。')
        return
      }
      const next = commitCombatantUpdate((cs) =>
        cs.map((c) => (c.instanceId === actor.instanceId ? { ...c, currentMp: c.currentMp - info.skill.mpCost } : c)),
      )
      if (info.oncePerCombat) markOnceUsed(actor, skillId)
      setShieldByTarget((prev) => ({ ...prev, [target.instanceId]: support.amount }))
      pushEvent('companion_support', 'companion', `${actor.name}为${target.name}展开了魔法盾（可抵消 ${support.amount} 点伤害）。`)
      afterAction(next)
      return
    }
    // 轻舞：自身技能，取消下一次敌方行动
    if (support?.type === 'cancel_next_enemy_counter') {
      if (actor.currentMp < info.skill.mpCost) {
        pushEvent('system', 'system', '灵力不足，技能无法施展。')
        return
      }
      const next = commitCombatantUpdate((cs) =>
        cs.map((c) => (c.instanceId === actor.instanceId ? { ...c, currentMp: c.currentMp - info.skill.mpCost } : c)),
      )
      if (info.oncePerCombat) markOnceUsed(actor, skillId)
      setSkipNextEnemy(true)
      pushEvent('companion_support', 'companion', `${actor.name}施展了樱花轻舞，敌人的注意力被牵走，下一次攻势落空。`)
      afterAction(next)
      return
    }
    // 伤害技能：选敌方目标
    if (!target || target.side !== 'enemy') return
    const rawDamage = resolveSkillRawDamage(skillId, skillContextFor(actor))
    if (rawDamage === null) return
    if (actor.currentMp < info.skill.mpCost) {
      pushEvent('system', 'system', '灵力不足，技能无法施展。')
      return
    }
    const result = performAttack(actor.agility, target.agility, rawDamage, target.armor)
    const next = commitCombatantUpdate((cs) =>
      cs.map((c) => {
        if (c.instanceId === actor.instanceId) return { ...c, currentMp: c.currentMp - info.skill.mpCost }
        if (c.instanceId === target.instanceId) return updateCombatantHp(c, c.currentHp - result.damage)
        return c
      }),
    )
    if (info.oncePerCombat) markOnceUsed(actor, skillId)
    const detail = formatAttackLog(result, target.name)
    const skillName = getSkill(skillId)?.name ?? '技能'
    if (result.outcome === 'critical_miss') {
      pushEvent(actor.sourceType === 'companion' ? 'companion_attack' : 'player_attack', actor.sourceType, `${actor.name}的攻击落空了。`, detail)
    } else if (result.damage > 0) {
      pushEvent(actor.sourceType === 'companion' ? 'companion_attack' : 'player_attack', actor.sourceType, `${skillName}命中${target.name}，造成 ${result.damage} 点伤害。`, detail)
    } else {
      pushEvent(actor.sourceType === 'companion' ? 'companion_attack' : 'player_attack', actor.sourceType, `${skillName}没有造成伤害。`, detail)
    }
    afterAction(next)
  }

  /** 普通攻击：进入目标选择（敌） */
  const handleAttack = () => {
    if (actionsLocked) return
    setActionTray(null)
    setPendingTarget({ mode: 'enemy', kind: 'attack' })
  }

  /** 技能：按目标模式进入选择或直接执行（自身技能无 picker） */
  const handleSkill = (skillId: string) => {
    if (actionsLocked || !currentCombatant) return
    const info = getSkillExecutionInfo(skillId)
    if (!info) return
    if (info.skill.profession !== undefined && info.skill.profession !== player.profession) return
    const mode = skillTargetMode(info.skill)
    setActionTray(null)
    if (mode === 'self') {
      executeSkill(currentCombatant, skillId)
    } else {
      setPendingTarget({ mode, kind: 'skill', skillId })
    }
  }

  /** 伙伴技能入口（无职业校验；支持盾 / 轻舞 / 飞斩） */
  const handleCompanionSkill = (skillId: string) => {
    if (actionsLocked || !currentCombatant || currentCombatant.sourceType !== 'companion') return
    const info = getSkillExecutionInfo(skillId)
    if (!info) return
    const mode = skillTargetMode(info.skill)
    setActionTray(null)
    if (mode === 'self') {
      executeSkill(currentCombatant, skillId)
    } else {
      setPendingTarget({ mode, kind: 'skill', skillId })
    }
  }

  /** 目标选择确认（§11：点存活目标执行；取消由独立按钮处理） */
  const executeTargeted = (target: Combatant) => {
    if (!pendingTarget || !currentCombatant) return
    const actor = currentCombatant
    const { kind, skillId } = pendingTarget
    setPendingTarget(null)
    if (kind === 'attack') {
      const result = performAttack(actor.agility, target.agility, actor.attack, target.armor)
      applyAttackResult(actor, target, result, 'basic')
    } else if (skillId) {
      executeSkill(actor, skillId, target)
    }
  }

  /** 治疗药水（仅玩家回合；本地治疗 combatant，结束同步时统一扣 inventory） */
  const handleUseHealingPotion = () => {
    if (phase !== 'active' || !isPlayerTurn || !playerCombatant) return
    if (playerCombatant.currentHp <= 0 || playerCombatant.currentHp >= playerCombatant.maxHp) return
    if (!healingPotionAmount || healingPotionAmount <= 0 || healingPotionCount <= 0) return
    const hpBefore = playerCombatant.currentHp
    const next = commitCombatantUpdate((cs) =>
      cs.map((c) =>
        c.instanceId === playerCombatant.instanceId
          ? { ...c, currentHp: Math.min(c.maxHp, c.currentHp + healingPotionAmount) }
          : c,
      ),
    )
    const hpAfter = next.find((c) => c.instanceId === playerCombatant.instanceId)?.currentHp ?? hpBefore
    const actual = Math.max(0, hpAfter - hpBefore)
    potionsUsedRef.current += 1
    pushEvent('potion', 'player', `你使用了治疗药水，恢复 ${actual} 点生命。`)
    afterAction(next)
  }

  /** 伙伴跳过（不耗 MP；视为行动，推进回合） */
  const handleCompanionSkip = () => {
    if (phase !== 'active' || !currentCombatant || currentCombatant.sourceType !== 'companion') return
    setPendingTarget(null)
    setActionTray(null)
    pushEvent('companion_skip', 'companion', `${currentCombatant.name}静静守在后方。`)
    afterAction(combatants)
  }

  /** 逃跑（§14：只在玩家自己的回合；成功无奖励 / 失败消耗本回合） */
  const handleEscape = () => {
    if (phase !== 'active' || !isPlayerTurn || !canEscape) return
    const friendly = combatants.filter((c) => c.side === 'friendly')
    const enemies = combatants.filter((c) => c.side === 'enemy')
    const highestFriendly = Math.max(...friendly.map((c) => c.agility))
    const highestEnemy = Math.max(...enemies.map((c) => c.agility))
    const roll = rollD20()
    const result = resolvePartyEscape(friendly, enemies, roll)
    if (result.success) {
      pushEvent('escape_success', 'player', `你成功脱离了战斗。`, [
        `逃跑值 = (最高敏捷 ${highestFriendly} + D20 ${result.roll}) / 3 = ${result.score}；敌方最高敏捷 ${highestEnemy}。`,
      ])
      finalizeEscape()
      onEscape()
      return
    }
    pushEvent('escape_failure', 'player', `逃跑失败，敌人封住了退路。`, [
      `逃跑值 = (最高敏捷 ${highestFriendly} + D20 ${result.roll}) / 3 = ${result.score}；敌方最高敏捷 ${highestEnemy}。`,
    ])
    setCurrentTurnIndex((idx) => advanceTurnIndex(idx))
  }

  /** 敌方 AI 行动（§12 V1：随机存活我方目标 → 正式攻击） */
  const executeEnemyTurn = (enemy: Combatant) => {
    const livingFriendly = combatants.filter((c) => c.side === 'friendly' && c.isAlive)
    if (livingFriendly.length === 0) {
      setPhase('defeat')
      finalizeCombatEnd(combatants)
      return
    }
    const target = chooseEnemyTarget(livingFriendly, Math.random)
    const result = performAttack(enemy.agility, target.agility, enemy.attack, target.armor)
    const detail = formatAttackLog(result, target.name)
    // 盾（命中才消耗；miss 保留）
    const shield = shieldByTarget[target.instanceId] ?? 0
    let damage = result.damage
    let absorbed = 0
    if (result.hit && shield > 0) {
      absorbed = Math.min(shield, damage)
      damage = Math.max(0, damage - absorbed)
    }
    const next = commitCombatantUpdate((cs) =>
      cs.map((c) => (c.instanceId === target.instanceId ? updateCombatantHp(c, c.currentHp - damage) : c)),
    )
    if (result.hit && damage > 0) {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}的攻击命中${target.name}，造成 ${damage} 点伤害。`, detail)
    } else if (result.hit) {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}的攻击被${target.name}挡下，没有造成伤害。`, detail)
    } else {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}的攻击落空了。`, detail)
    }
    if (absorbed > 0) {
      pushEvent('shield', 'companion', `樱花魔法盾抵消了 ${absorbed} 点伤害。`)
      setShieldByTarget((prev) => {
        const nextShield = { ...prev }
        delete nextShield[target.instanceId]
        return nextShield
      })
    }
    if (isEncounterLost(next)) {
      setPhase('defeat')
      finalizeCombatEnd(next)
      return
    }
    setCurrentTurnIndex((idx) => advanceTurnIndex(idx))
  }

  // ---- V4：回合分组（详细日志按回合折叠分组） ----
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

  const renderDetailLogBody = () =>
    roundGroups.length === 0 ? (
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
    )

  // ---- 单位卡渲染 ----
  const unitCardClass = (c: Combatant): string => {
    const base = 'min-w-[240px] flex-1 rounded border p-3 text-sm text-bone-300 transition-colors'
    if (!c.isAlive) return `${base} border-ink-800 bg-ink-950/40 text-bone-600 opacity-60`
    if (c.instanceId === currentCombatant?.instanceId) {
      return `${base} border-gold-400 bg-ink-800/70 ring-1 ring-gold-400`
    }
    return `${base} border-ink-600 bg-ink-800/50`
  }

  // 敌方多实例展示名（骷髅战士①/②；生产 UI 不泄露 instanceId）。
  // P2-007 缺陷修复：combatant 取 combatants 实时实例，敌方卡 HP 随战斗刷新（击杀后显示 0/最大）；
  // 保留 enemyInstances 作顺序/重名后缀基准（构建后敌单位集合稳定）。
  const enemyDisplays = (() => {
    const counts = new Map<string, number>()
    return enemyInstances.map((c) => {
      const n = counts.get(c.sourceId) ?? 0
      counts.set(c.sourceId, n + 1)
      const live = combatants.find((cc) => cc.instanceId === c.instanceId) ?? c
      return { combatant: live, label: n === 0 ? live.name : `${live.name}${instanceDisplaySuffix(n)}` }
    })
  })()

  const renderUnitCard = (c: Combatant, label: string, levelText: string) => {
    const isTarget = pendingTarget !== null && pendingTarget.mode === (c.side === 'enemy' ? 'enemy' : 'friendly') && c.isAlive
    return (
      <div
        key={c.instanceId}
        data-testid={c.side === 'enemy' ? 'combat-enemy-unit' : c.sourceType === 'player' ? 'combat-player-panel' : 'combat-companion-panel'}
        className={`${unitCardClass(c)} ${isTarget ? 'cursor-pointer border-sky-400 ring-1 ring-sky-400' : ''}`}
        onClick={isTarget ? () => executeTargeted(c) : undefined}
        role={isTarget ? 'button' : undefined}
      >
        <p className="font-bold text-bone-100">
          {label}
          {c.sourceType === 'player' && (
            <span className="ml-2 text-xs font-normal text-bone-500">
              {getProfessionName(player.profession)}
            </span>
          )}
        </p>
        <p className="mt-1 text-xs text-bone-500">
          {levelText}
          {c.currentMp > 0 ? ` · 灵力 ${c.currentMp}/${c.maxMp}` : ''}
        </p>
        <p className="mt-2">
          生命 <span className="tabular-nums text-bone-100">{c.currentHp}</span> / {c.maxHp}
        </p>
        <p>
          攻击 <span className="tabular-nums text-bone-100">{c.attack}</span> · 护甲{' '}
          <span className="tabular-nums text-bone-100">{c.armor}</span> · 敏捷{' '}
          <span className="tabular-nums text-bone-100">{c.agility}</span>
        </p>
        {c.sourceType === 'companion' && companionInfo && (
          <div className="mt-2 border-t border-ink-600 pt-2 text-xs text-bone-500">
            <p>
              当前技能：{companionInfo.skills.length > 0 ? companionInfo.skills.map((s) => s.name).join('、') : '—'}
            </p>
            {SAKURA_SEALED_SKILLS.length > 0 && (
              <p>封印技能：{SAKURA_SEALED_SKILLS.map((entry) => getSkill(entry.skillId)?.name ?? entry.name).join('、')}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  // 我方（玩家 + 伙伴）
  const renderFriendlyCard = (c: Combatant) => {
    const label = c.sourceType === 'player' ? player.name : companionInfo ? getCompanion(c.sourceId)?.name ?? c.name : c.name
    const levelText =
      c.sourceType === 'player'
        ? `Lv.${player.level}`
        : `Lv.${companionInfo?.level ?? 1}${companionInfo ? (gameState.companions[c.sourceId]?.status === 'recruited' ? ' · 神契宠物' : ' · 临时同行') : ''}`
    return renderUnitCard(c, label, levelText)
  }

  const renderEnemyCard = (entry: { combatant: Combatant; label: string }) => {
    const levelText = `Lv.${getEnemy(entry.combatant.sourceId)?.level ?? '?'}`
    return renderUnitCard(entry.combatant, entry.label, levelText)
  }

  // ---- 行动栏目标选择 ----
  const targetCandidates = pendingTarget
    ? combatants.filter((c) => (pendingTarget.mode === 'enemy' ? c.side === 'enemy' : c.side === 'friendly') && c.isAlive)
    : []
  const renderTargetPicker = () => (
    <div className="flex flex-col items-center gap-3">
      <p className="text-base font-bold text-bone-100">选择目标（{pendingTarget?.mode === 'enemy' ? '敌方' : '友方'}）</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {targetCandidates.map((c) => (
          <Button key={c.instanceId} variant="primary" onClick={() => executeTargeted(c)}>
            {c.sourceType === 'enemy' ? c.name : c.name}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => setPendingTarget(null)}>
          取消
        </Button>
      </div>
    </div>
  )

  // ---- 单位技能 tray ----
  const unitSkills = currentCombatant?.sourceType === 'companion' ? companionInfo?.skills ?? [] : getUsableSkills(player.learnedSkillIds, player.profession)
  const unitOnceUsed = (skillId: string) => (currentCombatant?.sourceType === 'companion' ? isOncePerCombatUsed(usedOnceCompanionSkillIds, skillId) : isOncePerCombatUsed(usedOnceSkillIds, skillId))

  return (
    <div className="combat-page mx-auto flex h-full w-full max-w-[1600px] flex-col px-4 py-3">
      {/* 顶部薄标题栏 */}
      <header className="mb-3 flex items-center justify-between gap-3 border-b border-ink-600 pb-2">
        <p className="text-sm tracking-widest text-bone-500">
          战斗 · <span className="text-gold-300">{def.name}</span>
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-bone-500">
            {phase === 'active' ? '战斗进行中' : phase === 'victory' ? '胜利' : '失败'}
          </p>
          <Button variant="ghost" className="xl:hidden" onClick={() => setDetailDrawerOpen(true)}>
            详细战斗日志
          </Button>
        </div>
      </header>

      {/* 上：我方 / 敌方两栏（§17） */}
      <section className="combat-status mb-3 grid gap-3 sm:grid-cols-2">
        {/* 我方（玩家 + 伙伴） */}
        <section className="flex flex-wrap gap-2">
          <p className="text-xs font-bold tracking-widest text-bone-500">我方</p>
          {combatants.filter((c) => c.side === 'friendly').map((c) => renderFriendlyCard(c))}
        </section>
        {/* 敌方 */}
        <section data-testid="combat-enemy-panel" className="flex flex-wrap gap-2">
          <p className="text-xs font-bold tracking-widest text-bone-500">敌方</p>
          {enemyDisplays.map((entry) => renderEnemyCard(entry))}
        </section>
      </section>

      {/* 中 + 右：简洁战斗播报（中央）+ 详细战斗日志（右侧，按回合分组） */}
      <section className="combat-main grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div data-testid="combat-summary-feed" className="combat-feed min-h-0 overflow-y-auto rounded border border-ink-600 bg-ink-900/40 p-4">
          <p className="mb-3 text-xs tracking-widest text-bone-500">战况播报</p>
          {events.length === 0 ? (
            <p className="text-sm text-bone-500">战斗开始。</p>
          ) : (
            <div className="flex flex-col gap-2">
              {events.map((ev) => (
                <p key={ev.id} className="text-sm leading-relaxed text-bone-200">
                  {ev.actor === 'enemy' ? (
                    <span className="text-gold-300">【敌方】</span>
                  ) : ev.actor === 'companion' ? (
                    <span className="text-sakura-300">【樱花优子】</span>
                  ) : ev.actor === 'system' ? (
                    <span className="text-bone-500">【系统】</span>
                  ) : (
                    <span className="text-bone-500">【你】</span>
                  )}{' '}
                  {ev.summary}
                </p>
              ))}
            </div>
          )}
        </div>

        <div data-testid="combat-detail-log" className="combat-log hidden min-h-0 overflow-y-auto rounded border border-ink-600 bg-ink-900/50 p-4 xl:block">
          <p className="mb-3 text-xs tracking-widest text-bone-500">详细战斗日志</p>
          {renderDetailLogBody()}
        </div>
      </section>

      {/* 下：固定行动栏 */}
      <footer className="relative z-[60] mt-3 border-t border-ink-600 pt-3">
        {phase === 'active' && isFriendlyTurn && !pendingTarget && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-base font-bold text-bone-100">{currentCombatant?.name}的回合</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="primary" disabled={actionsLocked} onClick={handleAttack}>
                普通攻击
              </Button>
              {unitSkills.length > 0 && (
                <Button variant="ghost" disabled={actionsLocked} onClick={() => setActionTray(actionTray === 'skill' ? null : 'skill')}>
                  技能{actionTray === 'skill' ? ' ▴' : ' ▾'}
                </Button>
              )}
              {currentCombatant?.sourceType === 'player' && healingPotionAmount !== undefined && (
                <Button variant="ghost" disabled={actionsLocked} onClick={() => setActionTray(actionTray === 'item' ? null : 'item')}>
                  物品{actionTray === 'item' ? ' ▴' : ' ▾'}
                </Button>
              )}
              {isPlayerTurn && canEscape && (
                <Button variant="ghost" disabled={actionsLocked} onClick={handleEscape}>
                  尝试逃跑
                </Button>
              )}
              {currentCombatant?.sourceType === 'companion' && (
                <Button variant="ghost" disabled={actionsLocked} onClick={handleCompanionSkip}>
                  跳过
                </Button>
              )}
              {!canEscape && isPlayerTurn && <span className="text-xs text-bone-600">无法逃离</span>}
            </div>
            {actionTray === 'skill' && (
              <div data-testid="combat-skill-tray" className="flex flex-wrap items-center justify-center gap-2">
                {unitSkills.map((skill) => {
                  const mpNotEnough = skill.mpCost > 0 && (currentCombatant?.currentMp ?? 0) < skill.mpCost
                  const onceUsed = skill.combat?.oncePerCombat === true && unitOnceUsed(skill.id)
                  return (
                    <div key={skill.id} className="flex flex-col items-center gap-1">
                      <Button
                        variant="primary"
                        disabled={actionsLocked || mpNotEnough || onceUsed}
                        onClick={() => (currentCombatant?.sourceType === 'companion' ? handleCompanionSkill(skill.id) : handleSkill(skill.id))}
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
            {actionTray === 'item' && (
              <div data-testid="combat-item-tray" className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex flex-col items-center gap-1">
                  <Button
                    variant="primary"
                    disabled={actionsLocked || (playerCombatant?.currentHp ?? 0) >= (playerCombatant?.maxHp ?? 0) || healingPotionCount <= 0}
                    onClick={handleUseHealingPotion}
                  >
                    使用治疗药水（+{healingPotionAmount} 生命）
                  </Button>
                  {healingPotionCount > 0 && <span className="text-xs text-bone-500">剩余：{healingPotionCount}</span>}
                  {healingPotionCount <= 0 && <span className="text-xs text-red-300">没有治疗药水</span>}
                  {(playerCombatant?.currentHp ?? 0) >= (playerCombatant?.maxHp ?? 0) && (
                    <span className="text-xs text-bone-500">生命已满</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {phase === 'active' && isFriendlyTurn && pendingTarget && renderTargetPicker()}

        {/* TM-P2-007 §6：胜利结算面板（§6 格式：击败 / 阅历 / 金币 / 战利品 / 已收入背包） */}
        {phase === 'victory' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-lg font-bold text-gold-300">战斗胜利</p>
            <div className="w-full max-w-md rounded border border-gold-500/40 bg-ink-900/40 p-4 text-left text-sm text-bone-300">
              <p className="font-bold text-bone-500">击败：</p>
              {defeatedList.length === 0 && <p className="text-bone-500">无</p>}
              {defeatedList.map((d) => (
                <p key={d.enemyId} className="mt-0.5 text-bone-200">
                  {d.name} ×{d.count}
                </p>
              ))}
              {victoryXp > 0 && <p className="mt-2 font-bold text-gold-300">冒险阅历 +{victoryXp}</p>}
              {victoryLevelPreview && victoryLevelPreview.levelGain > 0 && (
                <p className="mt-1 text-bone-200">
                  等级提升至 Lv.{victoryLevelPreview.player.level}
                  {victoryLevelPreview.maxHpGain > 0 && `（生命上限 +${victoryLevelPreview.maxHpGain}`}
                  {victoryLevelPreview.maxMpGain > 0 && `，灵力上限 +${victoryLevelPreview.maxMpGain}`}
                  {victoryLevelPreview.maxHpGain > 0 && '）'}
                </p>
              )}
              {(victoryLoot?.gold ?? 0) > 0 && <p className="mt-2">金币 +{victoryLoot?.gold ?? 0}</p>}
              {(victorySummary?.gold ?? 0) > 0 && <p className="mt-2">金币 +{victorySummary?.gold ?? 0}</p>}
              {victoryLoot && victoryLoot.items.length > 0 && (
                <div className="mt-3">
                  <p className="text-bone-500">战利品：</p>
                  {victoryLoot.items.map((it, index) => {
                    const itemDef = getItem(it.itemId)
                    const rarity = itemDef?.rarity ? `（${RARITY_LABELS[itemDef.rarity]}）` : ''
                    return (
                      <p key={combatLootItemKey(it.itemId, index)} className="mt-1">
                        {itemDef?.name ?? '异常物品（无法识别）'} ×{it.quantity}
                        {rarity}
                      </p>
                    )
                  })}
                </div>
              )}
              {victorySummary && victorySummary.items.length > 0 && (
                <div className="mt-3">
                  <p className="text-bone-500">战利品：</p>
                  {victorySummary.items.map((it, index) => {
                    const itemDef = getItem(it.itemId)
                    const rarity = itemDef?.rarity ? `（${RARITY_LABELS[itemDef.rarity]}）` : ''
                    return (
                      <p key={combatLootItemKey(it.itemId, index)} className="mt-1">
                        {itemDef?.name ?? '异常物品（无法识别）'} ×{it.quantity}
                        {rarity}
                      </p>
                    )
                  })}
                </div>
              )}
              {(victoryLoot?.luckCheck || victorySummary?.luckChecks?.length) && (
                <div className="mt-2 text-xs text-bone-500">
                  {victoryLoot?.luckCheck && formatLuckCheckLog(victoryLoot.luckCheck).map((line) => <p key={line}>{line}</p>)}
                  {victorySummary?.luckChecks?.map((lc, i) =>
                    formatLuckCheckLog(lc).map((line) => (
                      <p key={`${i}-${line}`}>{line}</p>
                    )),
                  )}
                </div>
              )}
              {(victoryXp > 0 || victoryLoot || victorySummary) && (
                <p className="mt-3 text-bone-500">已收入背包</p>
              )}
              {victoryXp <= 0 && !victoryLoot && !victorySummary && (
                <p className="text-bone-500">本次胜利没有额外奖励。</p>
              )}
            </div>
            <Button variant="primary" onClick={onVictory}>
              返回冒险
            </Button>
          </div>
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

      {/* 移动端详细战斗日志抽屉 */}
      {detailDrawerOpen && (
        <div
          data-testid="combat-detail-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="详细战斗日志"
          className="fixed inset-x-0 bottom-24 top-0 z-50"
        >
          <button
            type="button"
            aria-label="关闭详细战斗日志"
            className="absolute inset-0 h-full w-full bg-ink-950/60"
            onClick={() => setDetailDrawerOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 top-16 flex flex-col rounded-t-lg border border-ink-600 bg-ink-900 p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs tracking-widest text-bone-500">详细战斗日志</p>
              <Button variant="ghost" onClick={() => setDetailDrawerOpen(false)}>
                关闭（Esc）
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{renderDetailLogBody()}</div>
          </div>
        </div>
      )}
    </div>
  )
}

/** React-only identity for victory loot rows; duplicate itemId drops remain separate. */
export function combatLootItemKey(itemId: string, index: number): string {
  return `${itemId}-${index}`
}
