import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getItem, getCompanion, getEncounter } from '../game/content'
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
  filterUsableEnemySkills,
  getSkillExecutionInfo,
  getUsableSkills,
  isOncePerCombatUsed,
  markOncePerCombatUsed,
  resolveEnemySkillRawDamage,
  resolveSkillRawDamage,
  skillCooldownTurns,
} from '../game/rules/skill'
import type { SkillDefinition } from '../game/types/skill'
import { formatLuckCheckLog } from '../game/rules/luck'
import { getSkill } from '../game/content/skills'
import { rollD20 } from '../game/rules/d20'
import { RARITY_LABELS } from '../game/types/loot'
import { SAKURA_SEALED_SKILLS } from '../game/content/companions'
import { getEffectiveCharacterAttributes } from '../game/rules/mount'
import { combatEventId, type CombatEvent } from '../game/rules/combatEvent'
import {
  buildCombatSetup,
  weaponDamageBonusOf,
  type CompanionCombatInfo,
  type CombatSetup,
} from '../game/rules/combatSetup'
import {
  chooseEnemyAction,
  chooseEnemyTarget,
  instanceDisplaySuffix,
  isEncounterLost,
  isEncounterWon,
  getLiveCombatant,
  nextLiveTurnIndex,
  resolvePartyEscape,
  updateCombatantHp,
  type Combatant,
  type EncounterLootSummary,
  type EnemyInstance,
  type InitiativeTurn,
} from '../game/rules/partyCombat'
import { resolveEncounterVictoryXp } from '../game/rules/combatXp'
import { applyAdventureXpReward } from '../game/rules/progression'

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

/** 击败统计（§6 VictorySummary：按 enemyId 聚合数量） */
interface DefeatedEntry {
  enemyId: string
  name: string
  count: number
}

/** 技能目标模式推导（TM-P2-007 §11 / TM-P2-009-R1 §9：优先读显式 targetMode，无则按 supportEffect/标签语义回退） */
function skillTargetMode(skill: SkillDefinition): SkillTargetMode {
  if (skill.combat?.targetMode) return skill.combat.targetMode
  if (skill.combat?.supportEffect?.type === 'reduce_next_enemy_damage') return 'friendly'
  if (skill.combat?.supportEffect?.type === 'cancel_next_enemy_counter') return 'self'
  if (skill.tags.includes('healing')) return 'friendly'
  return 'enemy'
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
  /** 当前查看单位只影响卡片高亮；真正执行动作的单位始终由 initiative 队列决定。 */
  const [viewedFriendlyId, setViewedFriendlyId] = useState<string | null>(() => {
    const firstFriendly = setup?.turns.find((turn) => turn.combatant.side === 'friendly')
    return firstFriendly?.combatant.instanceId ?? null
  })
  const [phase, setPhase] = useState<'active' | 'victory' | 'defeat'>('active')
  const [pendingTarget, setPendingTarget] = useState<PendingTarget | null>(null)
  const [actionTray, setActionTray] = useState<'skill' | 'item' | null>(null)
  const [tooltipSkillId, setTooltipSkillId] = useState<string | null>(null)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  /** TM-P2-009-R1 §6：每单位独立 Action/Bonus（按 instanceId；纯 UI 资源，不写 Save；新回合重置） */
  const [turnResources, setTurnResources] = useState<Record<string, { action: number; bonus: number }>>({})
  /** §7/§8：每单位已结束回合标记（End Turn 后 true；新回合重置） */
  const [endedByInstance, setEndedByInstance] = useState<Record<string, boolean>>({})
  /** §5：当前回合号（roundRef 的 UI 镜像，供顶部标题展示） */
  const [round, setRound] = useState(1)

  /** 每场一次技能按 skillId 独立追踪（玩家 / 伙伴分开；TM-P2-003-R2 B2） */
  const [usedOnceSkillIds, setUsedOnceSkillIds] = useState<ReadonlySet<string>>(new Set())
  /** 伙伴 once-per-combat 按 companionId 隔离（R1：双伙伴各自独立，不串号） */
  const [usedOnceCompanionSkillIds, setUsedOnceCompanionSkillIds] = useState<Record<string, ReadonlySet<string>>>({})

  /** TM-P2-009-R1 §10：敌人技能冷却（enemy instanceId → skillId → 剩余冷却回合；行动开始先递减）。
   *  ref 同步读写、无需重渲染（敌人冷却不展示给 UI），但必须在每次 executeEnemyTurn 内就地更新。 */
  const enemySkillCooldownsRef = useRef<Record<string, Record<string, number>>>({})
  /** TM-P2-009-R1 §10：敌人 once-per-combat 技能使用追踪（按 enemy instanceId 独立） */
  const enemyUsedOnceSkillIdsRef = useRef<ReadonlySet<string>>(new Set())

  /** 护盾——target instanceId → 剩余减伤量 + 施术技能名（敌人命中时消耗；播报用技能名泛化） */
  const [shieldByTarget, setShieldByTarget] = useState<Record<string, { amount: number; skillName: string }>>({})
  /** 取消下一次敌方行动（cancel_next_enemy_counter；R1：记录触发技能名以泛化播报） */
  const [skipNextEnemy, setSkipNextEnemy] = useState(false)
  const [skipSourceName, setSkipSourceName] = useState('轻舞')

  const [events, setEvents] = useState<CombatEvent[]>([])
  const summaryFeedRef = useRef<HTMLDivElement>(null)
  const detailLogRef = useRef<HTMLDivElement>(null)
  const detailDrawerLogRef = useRef<HTMLDivElement>(null)
  const [victorySummary, setVictorySummary] = useState<EncounterLootSummary | null>(null)
  const [defeatedList, setDefeatedList] = useState<DefeatedEntry[]>([])
  const [victoryXp, setVictoryXp] = useState(0)
  const [victoryLevelPreview, setVictoryLevelPreview] = useState<ReturnType<typeof applyAdventureXpReward> | null>(null)
  /** 战斗内使用治疗药水的次数（结束同步时一次扣减 inventory） */
  const potionsUsedRef = useRef(0)

  const eventSeqRef = useRef(0)
  const roundRef = useRef(1)
  /** React effect 因实时 combatants 更新重跑时，同一单位同一回合仍只允许调度一次 AI。 */
  const executedEnemyTurnKeysRef = useRef<ReadonlySet<string>>(new Set())
  const pushEvent = (
    kind: CombatEventKind,
    actor: CombatEvent['actor'],
    summary: string,
    detail: string[] = [],
    actorName?: string,
  ) => {
    eventSeqRef.current += 1
    const ev: CombatEvent = {
      id: combatEventId(eventSeqRef.current),
      round: roundRef.current,
      actor,
      kind,
      summary,
      detail,
      actorName,
    }
    setEvents((prev) => [...prev, ev])
  }

  useEffect(() => {
    for (const element of [summaryFeedRef.current, detailLogRef.current, detailDrawerLogRef.current]) {
      if (element) element.scrollTop = element.scrollHeight
    }
  }, [events, detailDrawerOpen])

  // ---- 敌方 AI 回合（effect + ref 防 StrictMode 双调；timer 卸载清理）----
  // 注：effect 回调在渲染完成后才执行，此处引用定义在下方条件 return 之后的 executeEnemyTurn 是安全的（TDZ 已解除）。
  useEffect(() => {
    if (phase !== 'active') return
    const turn = turns[currentTurnIndex]
    if (!turn) return
    const actor = getLiveCombatant(turn, combatants)
    if (!actor?.isAlive) {
      if (isEncounterWon(combatants)) {
        setPhase('victory')
        finalizeCombatEnd(combatants)
      } else if (isEncounterLost(combatants)) {
        setPhase('defeat')
        finalizeCombatEnd(combatants)
      } else {
        advanceTurn(currentTurnIndex, combatants)
      }
      return
    }
    if (actor.side !== 'enemy') return
    const enemyTurnKey = `${roundRef.current}:${actor.instanceId}`
    if (executedEnemyTurnKeysRef.current.has(enemyTurnKey)) return
    if (skipNextEnemy) {
      executedEnemyTurnKeysRef.current = new Set(executedEnemyTurnKeysRef.current).add(enemyTurnKey)
      setSkipNextEnemy(false)
      pushEvent('companion_skip', 'companion', `${actor.name}被${skipSourceName}牵走了注意力，本回合没有行动。`)
      setEndedByInstance((prev) => ({ ...prev, [actor.instanceId]: true }))
      advanceTurn(currentTurnIndex)
      return
    }
    const timer = window.setTimeout(() => {
      executedEnemyTurnKeysRef.current = new Set(executedEnemyTurnKeysRef.current).add(enemyTurnKey)
      executeEnemyTurn(actor)
    }, ENEMY_ACTION_DELAY_MS)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurnIndex, phase, skipNextEnemy, combatants])

  // ---- 战斗开场播报（ref 防 StrictMode 双调）----
  const introLoggedRef = useRef(false)
  useEffect(() => {
    if (introLoggedRef.current) return
    introLoggedRef.current = true
    const first = turns[currentTurnIndex]?.combatant
    // TM-P2-009-R1 §3：开场简报保留「XX先行动」；详细日志追加每个单位的 D20 明细
    // （D20(骰面) + 敏捷N = 总和）。只做可理解性可视化，不改 D20+AGI 公式。
    const detail =
      turns.length > 0
        ? turns.map((t) => `${displayNameForCombatant(t.combatant)}：D20(${t.roll}) + 敏捷${t.combatant.agility} = ${t.initiative}`)
        : []
    pushEvent('initiative', 'system', first ? `战斗开始——${first.name}先行动。` : '战斗开始。', detail)
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
  const companionInfos = setup.companions
  // TM-P2-009-R1 §3：Initiative 展示名（生产 UI 不泄露 instanceId）——玩家用角色名、伙伴用注册名、
  // 敌方同 sourceId 多实例用「骷髅战士①/②」后缀（与 enemyDisplays 语义一致，供 Strip / D20 明细复用）。
  const displayNameForCombatant = (c: Combatant): string => {
    if (c.sourceType === 'player') return player.name
    if (c.sourceType === 'companion') return getCompanion(c.sourceId)?.name ?? c.name
    const siblings = enemyInstances.filter((e) => e.sourceId === c.sourceId)
    const index = siblings.findIndex((e) => e.instanceId === c.instanceId)
    return index <= 0 ? c.name : `${c.name}${instanceDisplaySuffix(index)}`
  }
  const companionInfoFor = (sourceId: string): CompanionCombatInfo | undefined =>
    companionInfos.find((info) => info.companionId === sourceId)
  const canEscape = setup.canEscape

  // 当前行动单位（turns 内的引用；HP 变化以 combatants 为准）
  const currentCombatant = combatants.find((c) => c.instanceId === turns[currentTurnIndex]?.combatant.instanceId)
  const isPlayerTurn = currentCombatant?.sourceType === 'player' && currentCombatant?.isAlive
  const isFriendlyTurn = currentCombatant?.side === 'friendly' && currentCombatant?.isAlive

  // 玩家 / 伙伴当前 combatant（面板展示 + 行动）
  const playerCombatant = combatants.find((c) => c.sourceType === 'player')
  const companionCombatants = combatants.filter((c) => c.sourceType === 'companion')

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

  /** TM-P2-009-R1 §6：每单位资源读取（未初始化 = 满资源 {action:1, bonus:1}） */
  // TM-P2-009-R1 §6.3：玩家装备 combatTurnBonus 聚合（武器/防具/饰品逐件累加 actions/bonusActions；
  // 伙伴无装备、敌方无资源。缺省 {action:1, bonus:1}。置于 resourcesFor 前避免 TDZ 前向引用。）
  const equipmentTurnBonus = (() => {
    let actions = 0
    let bonusActions = 0
    for (const slot of [gameState.equipment.weapon, gameState.equipment.armor, gameState.equipment.accessory]) {
      if (!slot) continue
      const def = getItem(slot)
      const bonus = def?.combatTurnBonus
      if (!bonus) continue
      actions += bonus.actions ?? 0
      bonusActions += bonus.bonusActions ?? 0
    }
    return { actions, bonusActions }
  })()
  /** 单位回合基础资源（未消耗时的初始值）：玩家按装备 bonus 加成；其余固定 {1,1} */
  const baseResourcesFor = (instanceId: string): { action: number; bonus: number } =>
    instanceId === playerCombatant?.instanceId
      ? { action: 1 + equipmentTurnBonus.actions, bonus: 1 + equipmentTurnBonus.bonusActions }
      : { action: 1, bonus: 1 }
  const resourcesFor = (instanceId: string): { action: number; bonus: number } =>
    turnResources[instanceId] ?? baseResourcesFor(instanceId)
  const hasResourceOf = (instanceId: string, type: 'action' | 'bonus_action'): boolean => {
    const r = resourcesFor(instanceId)
    return type === 'action' ? r.action > 0 : r.bonus > 0
  }
  /** 消耗资源（当前渲染 state 读取 + 函数式更新；单次操作内闭包值可靠） */
  const consumeResource = (instanceId: string, type: 'action' | 'bonus_action'): boolean => {
    if (!hasResourceOf(instanceId, type)) return false
    setTurnResources((prev) => {
      const cur = prev[instanceId] ?? baseResourcesFor(instanceId)
      return {
        ...prev,
        [instanceId]:
          type === 'action'
            ? { action: Math.max(0, cur.action - 1), bonus: cur.bonus }
            : { action: cur.action, bonus: Math.max(0, cur.bonus - 1) },
      }
    })
    return true
  }

  /** §8：下一个「可行动」单位（turns 环）。friendly 要求未 ended；enemy 行动后也标记 ended（本轮只行动一次）。
   *  整圈扫描遇到 fromIndex 自身 → 说明全场 friendly/enemy 均已 ended → 返回 null 进入新回合。
   *  绝不能返回 fromIndex 自己，否则 enemy 行动完会无限循环。 */
  const nextActorIndex = (fromIndex: number, liveCombatants: readonly Combatant[] = combatants): number | null => {
    const next = nextLiveTurnIndex(turns, liveCombatants, fromIndex, endedByInstance)
    return next === fromIndex ? null : next
  }

  /** §8：新回合——round+1、清空所有单位 ended 与资源、回到第一个存活单位 */
  const startNewRound = (fromIndex: number, liveCombatants: readonly Combatant[] = combatants): number => {
    roundRef.current += 1
    setRound(roundRef.current)
    setEndedByInstance({})
    setTurnResources({})
    return nextLiveTurnIndex(turns, liveCombatants, fromIndex) ?? fromIndex
  }

  /** 回合推进（End Turn / 敌方行动后）：下一未结束存活单位；全场已结束 → 新回合 */
  const advanceTurn = (fromIndex: number, liveCombatants: readonly Combatant[] = combatants) => {
    const next = nextActorIndex(fromIndex, liveCombatants)
    if (next !== null) {
      setCurrentTurnIndex(next)
    } else {
      setCurrentTurnIndex(startNewRound(fromIndex, liveCombatants))
    }
  }

  /** §8：结束回合——当前单位 ended=true、放弃剩余资源、推进 */
  const handleEndTurn = () => {
    if (phase !== 'active' || !currentCombatant) return
    if (currentCombatant.side !== 'friendly' || !currentCombatant.isAlive) return
    setPendingTarget(null)
    setActionTray(null)
    const id = currentCombatant.instanceId
    setEndedByInstance((prev) => ({ ...prev, [id]: true }))
    setTurnResources((prev) => ({ ...prev, [id]: { action: 0, bonus: 0 } }))
    advanceTurn(currentTurnIndex)
  }

  /** 点击我方卡只切换查看对象，绝不改变 initiative 当前行动单位。 */
  const handleViewFriendly = (instanceId: string) => {
    if (phase !== 'active' || pendingTarget !== null) return
    const c = combatants.find((combatant) => combatant.instanceId === instanceId)
    if (!c || c.side !== 'friendly') return
    setViewedFriendlyId(instanceId)
  }

  /** 行动后统一收尾：胜负判定 → 结算。TM-P2-009-R1 §6.2：不再自动换人——
   *  当前单位仍有 Action/Bonus 时留在原地，由玩家手动 End Turn 才推进。 */
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
  }

  // TM-P2-009-R1 §6/§7/§8：当前单位资源 / ended / friendly 段可切换集合
  //（置于 resourcesFor 之后派生，避免对 const 箭头函数的前向引用 TDZ）
  const currentEnded = currentCombatant ? (endedByInstance[currentCombatant.instanceId] ?? false) : false
  const currentResources = currentCombatant ? resourcesFor(currentCombatant.instanceId) : { action: 0, bonus: 0 }
  const hasAction = currentResources.action > 0
  const hasBonus = currentResources.bonus > 0
  const actionsLocked = phase !== 'active' || !isFriendlyTurn || pendingTarget !== null || currentEnded

  /** 战斗结束统一同步：玩家 HP/MP + 药水 + 伙伴 MP 写入 GameState；胜利再结算 XP/loot/flags */
  const finalizeCombatEnd = (next: Combatant[]) => {
    const playerC = next.find((c) => c.sourceType === 'player')
    useGameStore.getState().applyPartyCombatEnd({
      playerHp: playerC?.currentHp ?? 0,
      playerMp: playerC?.currentMp ?? 0,
      potionsUsed: potionsUsedRef.current,
      companions: next
        .filter((c) => c.sourceType === 'companion')
        .map((c) => ({ companionId: c.sourceId, mp: c.currentMp })),
    })
    if (!isEncounterWon(next)) return
    // 胜利结算统一由 Encounter 权威入口先校验再发奖励；单敌/多敌都返回展示 summary。
    const summary = useGameStore.getState().resolveEncounterVictory(encounterId)
    setVictorySummary(summary)
    const defeatedInstances: EnemyInstance[] = next
      .filter((c) => c.side === 'enemy' && !c.isAlive)
      .map((c) => ({ instanceId: c.instanceId, enemyId: c.sourceId, currentHp: 0, maxHp: c.maxHp }))
    // TM-P2-009-R1 §11.3：遭遇胜利 XP（展示值，与 gameStore 真实授予同一公式）
    const xp = resolveEncounterVictoryXp(gameState, def, defeatedInstances)
    setDefeatedList(buildDefeatedList(next))
    setVictoryXp(xp)
    setVictoryLevelPreview(xp > 0 ? applyAdventureXpReward(gameState.player, xp) : null)
  }

  /** 逃跑成功同步（无任何奖励：§14） */
  const finalizeEscape = () => {
    const playerC = combatants.find((c) => c.sourceType === 'player')
    useGameStore.getState().applyPartyCombatEnd({
      playerHp: playerC?.currentHp ?? 0,
      playerMp: playerC?.currentMp ?? 0,
      potionsUsed: potionsUsedRef.current,
      companions: combatants
        .filter((c) => c.sourceType === 'companion')
        .map((c) => ({ companionId: c.sourceId, mp: c.currentMp })),
    })
  }

  /** 攻击结果结算（普通攻击 / 技能共用）：伤害 + 事件 + 收尾 */
  const applyAttackResult = (actor: Combatant, target: Combatant, result: AttackResult, action: string) => {
    const skillName = action === 'basic' ? null : getSkill(action)?.name ?? '技能'
    const detail = formatAttackLog(result, target.name)
    const kind: CombatEventKind = actor.sourceType === 'companion' ? 'companion_attack' : 'player_attack'
    const actorName = actor.sourceType === 'companion' ? actor.name : undefined
    if (result.outcome === 'critical_miss') {
      pushEvent(kind, actor.sourceType, `${actor.name}的攻击落空了。`, detail, actorName)
    } else if (result.damage > 0) {
      pushEvent(
        kind,
        actor.sourceType,
        `${skillName ? `${skillName}命中` : `${actor.name}的攻击命中`}${target.name}，造成 ${result.damage} 点伤害。`,
        detail,
        actorName,
      )
    } else {
      pushEvent(kind, actor.sourceType, `${skillName ? `${skillName}没有` : `${actor.name}的攻击没有`}造成伤害。`, detail, actorName)
    }
    const next = commitCombatantUpdate((cs) =>
      cs.map((c) => (c.instanceId === target.instanceId ? updateCombatantHp(c, c.currentHp - result.damage) : c)),
    )
    afterAction(next)
  }

  /** 每场一次技能标记（玩家一个 Set；伙伴按 companionId 隔离——R1：双伙伴不串号） */
  const markOnceUsed = (actor: Combatant, skillId: string) => {
    if (actor.sourceType === 'companion') {
      setUsedOnceCompanionSkillIds((prev) => ({
        ...prev,
        [actor.sourceId]: markOncePerCombatUsed(prev[actor.sourceId] ?? new Set(), skillId),
      }))
    } else {
      setUsedOnceSkillIds((prev) => markOncePerCombatUsed(prev, skillId))
    }
  }

  /** oncePerCombat 是否已用（按 actor 归属；伙伴各自独立 Set） */
  const isOnceUsed = (actor: Combatant, skillId: string): boolean =>
    actor.sourceType === 'companion'
      ? isOncePerCombatUsed(usedOnceCompanionSkillIds[actor.sourceId] ?? new Set(), skillId)
      : isOncePerCombatUsed(usedOnceSkillIds, skillId)

  /** 伤害技能 rawDamage 上下文（玩家走装备加成；伙伴武器加成 0，按 sourceId 独立取属性） */
  const skillContextFor = (actor: Combatant) => {
    const info = actor.sourceType === 'companion' ? companionInfoFor(actor.sourceId) : undefined
    return actor.sourceType === 'companion'
      ? {
          str: info?.attrs.str ?? 0,
          agi: info?.attrs.agi ?? 0,
          mnd: info?.attrs.mnd ?? 0,
          weaponDamageBonus: 0,
          level: info?.level ?? 1,
        }
      : {
          str: effectivePlayerAttrs.str,
          agi: effectivePlayerAttrs.agi,
          mnd: effectivePlayerAttrs.mnd,
          weaponDamageBonus: weaponDamageBonusOf(gameState),
          level: player.level,
        }
  }

  /** 技能执行（伤害→目标 / 盾→友方目标 / 轻舞→自身无 picker） */
  const executeSkill = (actor: Combatant, skillId: string, target?: Combatant) => {
    const info = getSkillExecutionInfo(skillId)
    if (!info) return
    if (info.oncePerCombat && isOnceUsed(actor, skillId)) return
    // TM-P2-009-R1 §6.1：主动技能消耗由 SkillDefinition.combat.actionType 决定（缺省 action）
    const actionType = info.skill.combat?.actionType ?? 'action'
    if (!hasResourceOf(actor.instanceId, actionType)) return
    const support = info.skill.combat?.supportEffect
    // 盾：选友方目标，目标下次被敌人命中减伤
    if (support?.type === 'reduce_next_enemy_damage') {
      const supportTarget = target ?? (skillTargetMode(info.skill) === 'self' ? actor : undefined)
      if (!supportTarget || supportTarget.side !== 'friendly') return
      if (actor.currentMp < info.skill.mpCost) {
        pushEvent('system', 'system', '灵力不足，技能无法施展。')
        return
      }
      if (!consumeResource(actor.instanceId, actionType)) return
      const next = commitCombatantUpdate((cs) =>
        cs.map((c) => (c.instanceId === actor.instanceId ? { ...c, currentMp: c.currentMp - info.skill.mpCost } : c)),
      )
      if (info.oncePerCombat) markOnceUsed(actor, skillId)
      setShieldByTarget((prev) => ({
        ...prev,
        [supportTarget.instanceId]: { amount: support.amount, skillName: info.skill.name },
      }))
      pushEvent('companion_support', actor.sourceType, `${actor.name}为${supportTarget.name}施展了${info.skill.name}（可抵消 ${support.amount} 点伤害）。`, [], actor.name)
      afterAction(next)
      return
    }
    // 轻舞：自身技能，取消下一次敌方行动
    if (support?.type === 'cancel_next_enemy_counter') {
      if (actor.currentMp < info.skill.mpCost) {
        pushEvent('system', 'system', '灵力不足，技能无法施展。')
        return
      }
      if (!consumeResource(actor.instanceId, actionType)) return
      const next = commitCombatantUpdate((cs) =>
        cs.map((c) => (c.instanceId === actor.instanceId ? { ...c, currentMp: c.currentMp - info.skill.mpCost } : c)),
      )
      if (info.oncePerCombat) markOnceUsed(actor, skillId)
      setSkipNextEnemy(true)
      setSkipSourceName(info.skill.name)
      pushEvent('companion_support', 'companion', `${actor.name}施展了${info.skill.name}，敌人的注意力被牵走，下一次攻势落空。`, [], actor.name)
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
    if (!consumeResource(actor.instanceId, actionType)) return
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
    const actorName = actor.sourceType === 'companion' ? actor.name : undefined
    const attackKind = actor.sourceType === 'companion' ? 'companion_attack' : 'player_attack'
    if (result.outcome === 'critical_miss') {
      pushEvent(attackKind, actor.sourceType, `${actor.name}的攻击落空了。`, detail, actorName)
    } else if (result.damage > 0) {
      pushEvent(attackKind, actor.sourceType, `${skillName}命中${target.name}，造成 ${result.damage} 点伤害。`, detail, actorName)
    } else {
      pushEvent(attackKind, actor.sourceType, `${skillName}没有造成伤害。`, detail, actorName)
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
      // TM-P2-009-R1 §6.1：普通攻击消耗 Action -1
      if (!consumeResource(actor.instanceId, 'action')) return
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
    // TM-P2-009-R1 §6.1：治疗药水消耗 Bonus Action -1
    if (!consumeResource(playerCombatant.instanceId, 'bonus_action')) return
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

  /** 伙伴跳过（不耗 MP；§8 语义 = 放弃本回合剩余资源并推进，等同 End Turn） */
  const handleCompanionSkip = () => {
    if (phase !== 'active' || !currentCombatant || currentCombatant.sourceType !== 'companion') return
    setPendingTarget(null)
    setActionTray(null)
    pushEvent('companion_skip', 'companion', `${currentCombatant.name}静静守在后方。`, [], currentCombatant.name)
    handleEndTurn()
  }

  /** 逃跑（§14：只在玩家自己的回合；成功无奖励 / 失败消耗本回合） */
  const handleEscape = () => {
    if (phase !== 'active' || !isPlayerTurn || !playerCombatant || !canEscape) return
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
    // TM-P2-009-R1 §6.1：逃跑消耗 Action -1；失败不自动换人（仍有 Bonus 可用或玩家 End Turn）
    consumeResource(playerCombatant.instanceId, 'action')
  }

  /** 敌方 AI 行动（§12 V1 + TM-P2-009-R1 §10：技能 + 普攻选择；敌人不占 Action/Bonus） */
  const executeEnemyTurn = (enemy: Combatant) => {
    // TM-P2-009-R1 §10：该敌人行动开始——自身技能冷却先递减（归 0 的本行动即可用；ref 同步就地更新）
    const mine = enemySkillCooldownsRef.current[enemy.instanceId]
    if (mine) {
      const nextMine: Record<string, number> = {}
      for (const [skillId, turns] of Object.entries(mine)) nextMine[skillId] = Math.max(0, turns - 1)
      enemySkillCooldownsRef.current[enemy.instanceId] = nextMine
    }
    const livingFriendly = combatants.filter((c) => c.side === 'friendly' && c.isAlive)
    if (livingFriendly.length === 0) {
      setPhase('defeat')
      finalizeCombatEnd(combatants)
      return
    }
    const target = chooseEnemyTarget(livingFriendly, Math.random)
    // TM-P2-009-R1 §10：敌人技能（注册表解析 → 过滤冷却/once → AI 在技能与普攻间选择）
    const enemyDef = getEnemy(enemy.sourceId)
    const skillPool = (enemyDef?.skillIds ?? [])
      .map((id) => getSkill(id))
      .filter((s): s is SkillDefinition => Boolean(s))
    const usable = filterUsableEnemySkills(
      skillPool,
      enemySkillCooldownsRef.current[enemy.instanceId] ?? {},
      enemyUsedOnceSkillIdsRef.current,
    )
    const choice = chooseEnemyAction(usable, enemyDef?.aiProfile, Math.random)
    let result: AttackResult
    let usedSkillName: string | undefined
    if (choice.type === 'skill') {
      const skillDef = getSkill(choice.skillId)
      const rawDamage = resolveEnemySkillRawDamage(choice.skillId, {
        attackPower: enemy.attack,
        agility: enemy.agility,
      })
      result = performAttack(enemy.agility, target.agility, rawDamage ?? enemy.attack, target.armor)
      usedSkillName = skillDef?.name
      const cd = skillCooldownTurns(choice.skillId)
      if (cd > 0) {
        enemySkillCooldownsRef.current[enemy.instanceId] = {
          ...(enemySkillCooldownsRef.current[enemy.instanceId] ?? {}),
          [choice.skillId]: cd,
        }
      }
      if (skillDef?.combat?.oncePerCombat === true) {
        const next = new Set(enemyUsedOnceSkillIdsRef.current)
        next.add(choice.skillId)
        enemyUsedOnceSkillIdsRef.current = next
      }
    } else {
      result = performAttack(enemy.agility, target.agility, enemy.attack, target.armor)
    }
    // TM-P2-009-R1 §10：详细日志必须显示技能名（prepend；普攻无技能名）
    const detail = usedSkillName
      ? [`${usedSkillName}`, ...formatAttackLog(result, target.name)]
      : formatAttackLog(result, target.name)
    const skillTag = usedSkillName ? `的技能${usedSkillName}` : '的攻击'
    // 盾（命中才消耗；miss 保留）
    const shield = shieldByTarget[target.instanceId]
    let damage = result.damage
    let absorbed = 0
    if (result.hit && shield && shield.amount > 0) {
      absorbed = Math.min(shield.amount, damage)
      damage = Math.max(0, damage - absorbed)
    }
    const next = commitCombatantUpdate((cs) =>
      cs.map((c) => (c.instanceId === target.instanceId ? updateCombatantHp(c, c.currentHp - damage) : c)),
    )
    if (result.hit && damage > 0) {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}${skillTag}命中${target.name}，造成 ${damage} 点伤害。`, detail)
    } else if (result.hit) {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}${skillTag}被${target.name}挡下，没有造成伤害。`, detail)
    } else {
      pushEvent('enemy_attack', 'enemy', `${enemy.name}${skillTag}落空了。`, detail)
    }
    if (absorbed > 0) {
      pushEvent('shield', 'companion', `${shield?.skillName ?? '魔法盾'}抵消了 ${absorbed} 点伤害。`)
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
    // TM-P2-009-R1 §7/§8：敌方不占 Action/Bonus，行动完标记本轮已行动并推进到下一未结束存活单位
    setEndedByInstance((prev) => ({ ...prev, [enemy.instanceId]: true }))
    advanceTurn(currentTurnIndex, next)
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
    // R1：3v3 单排 3 卡（min-w 200px）→ 1280 视口两栏各 ~620px 不换行不溢出
    const base = 'min-w-[200px] flex-1 rounded border p-3 text-sm text-bone-300 transition-colors'
    if (!c.isAlive) return `${base} border-ink-800 bg-ink-950/40 text-bone-600 opacity-60`
    // TM-P2-009-R1 §7：已结束回合的 friendly 单位弱化（仅 friendly 有 ended 语义）
    const ended = c.side === 'friendly' && (endedByInstance[c.instanceId] ?? false)
    const isCurrent = c.instanceId === currentCombatant?.instanceId
    if (isCurrent) return `${base} border-gold-400 bg-ink-800/70 ring-1 ring-gold-400`
    if (c.side === 'friendly' && c.instanceId === viewedFriendlyId) {
      return `${base} cursor-pointer border-sky-500/60 bg-ink-800/60 ring-1 ring-sky-500/50`
    }
    if (ended) return `${base} border-ink-800 bg-ink-950/60 text-bone-600 opacity-70`
    if (c.side === 'friendly') {
      return `${base} cursor-pointer border-sky-500/60 bg-ink-800/60 hover:border-sky-400`
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
    const isViewable =
      c.side === 'friendly' &&
      !isTarget &&
      phase === 'active' &&
      isFriendlyTurn &&
      pendingTarget === null &&
      c.isAlive
    // 伙伴卡信息按 sourceId 独立（R1：多伙伴各自展示自己的技能/等级）
    const companionInfo = c.sourceType === 'companion' ? companionInfoFor(c.sourceId) : undefined
    const mpText = c.currentMp > 0 ? ` · 灵力 ${c.currentMp} / ${c.maxMp}` : ''
    return (
      <div
        key={c.instanceId}
        data-testid={c.side === 'enemy' ? 'combat-enemy-unit' : c.sourceType === 'player' ? 'combat-player-panel' : 'combat-companion-panel'}
        className={`combat-unit-card ${unitCardClass(c)} ${isTarget ? 'cursor-pointer border-sky-400 ring-1 ring-sky-400' : ''}`}
        onClick={isTarget ? () => executeTargeted(c) : isViewable ? () => handleViewFriendly(c.instanceId) : undefined}
        role={isTarget || isViewable ? 'button' : undefined}
      >
        {/* TM-P2-009-R1 §5.2 三行：名字(·职业) · Lv / 生命 · 灵力 / 攻击 · 护甲 · 敏捷 */}
        <p className="font-bold text-bone-100">
          {label} · <span className="text-xs font-normal text-bone-400">{levelText}</span>
        </p>
        <p className="mt-1 text-xs text-bone-500">
          生命 <span className="tabular-nums text-bone-100">{c.currentHp}</span> / {c.maxHp}
          {mpText}
        </p>
        <p className="mt-1">
          攻击 <span className="tabular-nums text-bone-100">{c.attack}</span> · 护甲{' '}
          <span className="tabular-nums text-bone-100">{c.armor}</span> · 敏捷{' '}
          <span className="tabular-nums text-bone-100">{c.agility}</span>
        </p>
        {c.side === 'friendly' && c.instanceId === currentCombatant?.instanceId && <p className="mt-1 text-[11px] text-gold-300">当前行动单位</p>}
        {c.side === 'friendly' && c.instanceId !== currentCombatant?.instanceId && c.instanceId === viewedFriendlyId && <p className="mt-1 text-[11px] text-sky-300">正在查看 · 尚未轮到行动</p>}
        {companionInfo && (
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
    const info = c.sourceType === 'companion' ? companionInfoFor(c.sourceId) : undefined
    // TM-P2-009-R1 §5.2：玩家第一行 `名字 · 职业 · Lv.N`（职业并入 label；levelText 仅 Lv.N）
    const label = c.sourceType === 'player' ? `${player.name} · ${getProfessionName(player.profession)}` : info ? getCompanion(c.sourceId)?.name ?? c.name : c.name
    const levelText =
      c.sourceType === 'player'
        ? `Lv.${player.level}`
        : `Lv.${info?.level ?? 1}${info ? (gameState.companions[c.sourceId]?.status === 'recruited' ? ' · 神契宠物' : ' · 临时同行') : ''}`
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
  const currentCompanionInfo =
    currentCombatant?.sourceType === 'companion' ? companionInfoFor(currentCombatant.sourceId) : undefined
  const unitSkills = currentCompanionInfo ? currentCompanionInfo.skills : getUsableSkills(player.learnedSkillIds, player.profession)
  const unitOnceUsed = (skillId: string) =>
    currentCombatant?.sourceType === 'companion'
      ? isOncePerCombatUsed(usedOnceCompanionSkillIds[currentCombatant.sourceId] ?? new Set(), skillId)
      : isOncePerCombatUsed(usedOnceSkillIds, skillId)

  const tooltipSkill = tooltipSkillId ? unitSkills.find((skill) => skill.id === tooltipSkillId) : undefined
  const renderSkillTooltip = () => {
    if (!tooltipSkill || typeof document === 'undefined') return null
    const target = skillTargetMode(tooltipSkill)
    const targetLabel = target === 'enemy' ? '敌方目标' : target === 'friendly' ? '友方目标' : '自身'
    const actionLabel = tooltipSkill.combat?.actionType === 'bonus_action' ? '附赠行动' : '行动'
    return createPortal(
      <div role="tooltip" data-testid="combat-skill-tooltip" className="combat-skill-tooltip">
        <p className="font-bold text-bone-100">{tooltipSkill.name}</p>
        <p className="mt-1">{tooltipSkill.description}</p>
        <p className="mt-1 text-bone-400">
          {tooltipSkill.mpCost > 0 ? `消耗 ${tooltipSkill.mpCost} 灵力 · ` : '不消耗灵力 · '}{actionLabel} · {targetLabel}
        </p>
        {(tooltipSkill.combat?.cooldownTurns ?? 0) > 0 && <p className="mt-1 text-bone-500">冷却 {tooltipSkill.combat!.cooldownTurns} 回合</p>}
        {tooltipSkill.combat?.oncePerCombat === true && <p className="mt-1 text-bone-500">每场战斗一次</p>}
        {tooltipSkill.combat?.damageFormula && <p className="mt-1 text-bone-500">{tooltipSkill.combat.damageFormula}</p>}
      </div>,
      document.body,
    )
  }

  return (
    <div className="combat-page mx-auto flex h-full w-full max-w-[1600px] flex-col px-4 py-3">
      {/* 顶部薄标题栏 */}
      <header className="mb-3 flex items-center justify-between gap-3 border-b border-ink-600 pb-2">
        <p className="text-sm tracking-widest text-bone-500">
          战斗 · <span className="text-gold-300">{def.name}</span>
        </p>
        <div className="flex items-center gap-3">
          <p className="text-xs text-bone-500">
            {phase === 'active' ? `第 ${round} 回合 · 战斗进行中` : phase === 'victory' ? '胜利' : '失败'}
          </p>
          <Button variant="ghost" className="xl:hidden" onClick={() => setDetailDrawerOpen(true)}>
            详细战斗日志
          </Button>
        </div>
      </header>

      {/* TM-P2-009-R1 §3：顶部 Initiative Strip（先手顺序 D20+AGI 可视化；不泄露 instanceId） */}
      <div
        data-testid="combat-initiative-strip"
        aria-label="先手顺序"
        className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-ink-700 bg-ink-900/40 px-3 py-1.5 text-xs text-bone-400"
      >
        <span className="font-bold tracking-widest text-bone-500">先手：</span>
        {turns.map((t, i) => (
          <span key={t.combatant.instanceId} className="flex items-center gap-1">
            {i > 0 && <span className="text-bone-600">{'>'}</span>}
            <span className="whitespace-nowrap">
              <span className="text-bone-200">{displayNameForCombatant(t.combatant)}</span>{' '}
              <span className="tabular-nums text-gold-300">{t.initiative}</span>
            </span>
          </span>
        ))}
      </div>

      {/* 上：我方 / 敌方两栏（§17） */}
      <section className="combat-status mb-3 grid gap-3 lg:grid-cols-2">
        {/* 我方（玩家 + 伙伴） */}
        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <p className="col-span-full text-xs font-bold tracking-widest text-bone-500">我方</p>
          {combatants.filter((c) => c.side === 'friendly').map((c) => renderFriendlyCard(c))}
        </section>
        {/* 敌方 */}
        <section data-testid="combat-enemy-panel" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <p className="col-span-full text-xs font-bold tracking-widest text-bone-500">敌方</p>
          {enemyDisplays.map((entry) => renderEnemyCard(entry))}
        </section>
      </section>

      {/* 中 + 右：简洁战斗播报（中央）+ 详细战斗日志（右侧，按回合分组） */}
      <section className="combat-main grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div ref={summaryFeedRef} data-testid="combat-summary-feed" className="combat-feed min-h-0 overflow-y-auto rounded border border-ink-600 bg-ink-900/40 p-4">
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
                    <span className="text-sakura-300">【{ev.actorName ?? '伙伴'}】</span>
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

        <div ref={detailLogRef} data-testid="combat-detail-log" className="combat-log hidden min-h-0 overflow-y-auto rounded border border-ink-600 bg-ink-900/50 p-4 xl:block">
          <p className="mb-3 text-xs tracking-widest text-bone-500">详细战斗日志</p>
          {renderDetailLogBody()}
        </div>
      </section>

      {/* 下：固定行动栏 */}
      <footer className="relative z-[60] mt-3 border-t border-ink-600 pt-3">
        {phase === 'active' && isFriendlyTurn && !pendingTarget && (
          <div className="flex flex-col items-center gap-2">
            {/* TM-P2-009-R1 §5.3：Action Tray（脱离流内，absolute 弹出在 Action Bar 上方；
                内容高矮不影响 footer 高度 → Action Bar 主按钮行 Y 恒定；内容超限内部滚动） */}
            <div
              data-testid="combat-action-tray"
              className="combat-action-tray absolute bottom-full left-0 right-0 mb-2 flex min-h-[56px] max-h-[168px] w-full flex-col items-center justify-start gap-2 overflow-y-auto"
            >
              {!currentEnded && !hasAction && !hasBonus && (
                <p className="text-center text-xs text-bone-500">本回合已无可用行动——点击「结束回合」继续。</p>
              )}
              {actionTray === 'skill' && (
                <div data-testid="combat-skill-tray" className="flex flex-wrap items-center justify-center gap-2">
                  {unitSkills.map((skill) => {
                    const mpNotEnough = skill.mpCost > 0 && (currentCombatant?.currentMp ?? 0) < skill.mpCost
                    const onceUsed = skill.combat?.oncePerCombat === true && unitOnceUsed(skill.id)
                    // TM-P2-009-R1 §6.1：主动技能资源由 SkillDefinition.combat.actionType 决定（缺省 action）
                    const actionType = skill.combat?.actionType ?? 'action'
                    const resourceOk = actionType === 'action' ? hasAction : hasBonus
                    return (
                      <div
                        key={skill.id}
                        className="relative flex flex-col items-center gap-1"
                        tabIndex={0}
                        aria-label={`${skill.name}技能说明`}
                        onMouseEnter={() => setTooltipSkillId(skill.id)}
                        onMouseLeave={() => setTooltipSkillId((current) => (current === skill.id ? null : current))}
                        onFocus={() => setTooltipSkillId(skill.id)}
                        onBlur={() => setTooltipSkillId((current) => (current === skill.id ? null : current))}
                      >
                        <Button
                          variant="primary"
                          disabled={actionsLocked || mpNotEnough || onceUsed || !resourceOk}
                          onClick={() => (currentCombatant?.sourceType === 'companion' ? handleCompanionSkill(skill.id) : handleSkill(skill.id))}
                        >
                          {skill.name}
                          {skill.mpCost > 0 ? `（${skill.mpCost} 灵力）` : ''}
                        </Button>
                        {mpNotEnough && <span className="text-xs text-red-300">灵力不足</span>}
                        {onceUsed && <span className="text-xs text-bone-500">本场战斗已使用</span>}
                        {!resourceOk && (
                          <span className="text-xs text-bone-500">
                            {actionType === 'action' ? '本回合行动已用完' : '本回合附赠行动已用完'}
                          </span>
                        )}
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
                      disabled={actionsLocked || !hasBonus || (playerCombatant?.currentHp ?? 0) >= (playerCombatant?.maxHp ?? 0) || healingPotionCount <= 0}
                      onClick={handleUseHealingPotion}
                    >
                      使用治疗药水（+{healingPotionAmount} 生命）
                    </Button>
                    {healingPotionCount > 0 && <span className="text-xs text-bone-500">剩余：{healingPotionCount}</span>}
                    {healingPotionCount <= 0 && <span className="text-xs text-red-300">没有治疗药水</span>}
                    {!hasBonus && <span className="text-xs text-bone-500">本回合附赠行动已用完</span>}
                    {(playerCombatant?.currentHp ?? 0) >= (playerCombatant?.maxHp ?? 0) && (
                      <span className="text-xs text-bone-500">生命已满</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            {/* §5.3：Action Bar 主按钮行（固定底部；技能/背包只改变上方 Tray，Y 位置不变） */}
            <div className="flex w-full flex-col items-center gap-1 border-t border-ink-700 pt-2">
              <p className="text-base font-bold text-bone-100">{currentCombatant?.name}的回合</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" disabled={actionsLocked || !hasAction} onClick={handleAttack}>
                  普通攻击
                </Button>
                {unitSkills.length > 0 && (
                  <Button variant="ghost" disabled={actionsLocked} onClick={() => setActionTray(actionTray === 'skill' ? null : 'skill')}>
                    技能{actionTray === 'skill' ? ' ▴' : ' ▾'}
                  </Button>
                )}
                {currentCombatant?.sourceType === 'player' && healingPotionAmount !== undefined && (
                  <Button variant="ghost" disabled={actionsLocked} onClick={() => setActionTray(actionTray === 'item' ? null : 'item')}>
                    背包{actionTray === 'item' ? ' ▴' : ' ▾'}
                  </Button>
                )}
                {isPlayerTurn && canEscape && (
                  <Button variant="ghost" disabled={actionsLocked || !hasAction} onClick={handleEscape}>
                    逃跑
                  </Button>
                )}
                {currentCombatant?.sourceType === 'companion' && (
                  <Button variant="ghost" disabled={actionsLocked} onClick={handleCompanionSkip}>
                    跳过
                  </Button>
                )}
                {!canEscape && isPlayerTurn && <span className="text-xs text-bone-600">无法逃离</span>}
                {/* TM-P2-009-R1 §8：底部固定结束回合按钮（无费用；放弃剩余资源并推进） */}
                <Button variant="ghost" disabled={phase !== 'active' || !isFriendlyTurn} onClick={handleEndTurn}>
                  结束回合
                </Button>
              </div>
            </div>
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
              {(victorySummary?.gold ?? 0) > 0 && <p className="mt-2">金币 +{victorySummary?.gold ?? 0}</p>}
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
              {victorySummary?.luckChecks?.length ? (
                <div className="mt-2 text-xs text-bone-500">
                  {victorySummary?.luckChecks?.map((lc, i) =>
                    formatLuckCheckLog(lc).map((line) => (
                      <p key={`${i}-${line}`}>{line}</p>
                    )),
                  )}
                </div>
              ) : null}
              {((victoryXp > 0) || (victorySummary && (victorySummary.gold > 0 || victorySummary.items.length > 0 || victorySummary.luckChecks.length > 0))) && (
                <p className="mt-3 text-bone-500">已收入背包</p>
              )}
              {victoryXp <= 0 && !(victorySummary && (victorySummary.gold > 0 || victorySummary.items.length > 0 || victorySummary.luckChecks.length > 0)) && (
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
            <div ref={detailDrawerLogRef} className="min-h-0 flex-1 overflow-y-auto">{renderDetailLogBody()}</div>
          </div>
        </div>
      )}
      {renderSkillTooltip()}
    </div>
  )
}

/** React-only identity for victory loot rows; duplicate itemId drops remain separate. */
export function combatLootItemKey(itemId: string, index: number): string {
  return `${itemId}-${index}`
}
