/**
 * Party Combat V5 纯规则（TM-P2-007 §8–16）。
 *
 * 3v3 多人遭遇战斗：我方 1–3 / 敌方 1–3 硬上限（EncounterDefinition 数据层已校验）。
 * 本文件只含纯函数：不修改 GameState、不掷系统随机数（rng 一律注入、返回 [0,1)）。
 *
 * 职责边界：
 *   - Combat V3 命中/护甲/伤害公式冻结不动——由 combat.ts 的 resolveHit/resolveAttack/applyArmor
 *     提供，本文件不重复定义。攻击动作的执行（含技能/道具/逃跑请求）由调用方（CombatPage）驱动。
 *   - XP 只在「整个 Encounter 胜利」时结算（§15）；Loot 只在胜利时统一写入（§16），
 *     Escape / Defeat 一律丢弃——这两个时序约束由调用方执行，本文件提供对应的纯结算函数。
 *   - 逃跑只允许在我方单位行动回合发起点（§14）——UI 层约束，不在纯规则中表达。
 */
import { getEnemy } from '../content'
import { getEnemyFirstKillXp } from './combatXp'
import { resolveEscape } from './escape'
import type { EscapeResult } from './escape'
import type { LuckCheckResult } from './luck'
import type { GameState } from '../types/game'
import type { EncounterMember } from '../types/encounter'
import type { LootGrant } from '../types/loot'
import type { SkillDefinition } from '../types/skill'

/** 注入随机源：返回 [0,1) 区间的数（测试可注入固定序列） */
export type Rng = () => number

/** 遭遇敌方单位硬上限（3v3；§8） */
export const MAX_ENCOUNTER_MEMBERS = 4

/**
 * 战斗单位（§9.2）。
 * instanceId 在同一场遭遇内唯一（同 sourceId 的多实例以此区分，如骷髅战士①/②）。
 * currentHp 与 isAlive 是战斗过程中的可变状态，以 updateCombatantHp 不可变更新。
 */
export interface Combatant {
  instanceId: string
  side: 'friendly' | 'enemy'
  sourceType: 'player' | 'companion' | 'enemy'
  sourceId: string
  name: string
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
  attack: number
  armor: number
  agility: number
  isAlive: boolean
}

/** 敌方实例（§8）：同一 enemyId 出现多次时以 instanceId 区分 */
export interface EnemyInstance {
  instanceId: string
  enemyId: string
  currentHp: number
  maxHp: number
}

/** 先手队列项（§9.3）：initiative = D20 + 敏捷 */
export interface InitiativeTurn {
  combatant: Combatant
  /** D20 骰面（1–20） */
  roll: number
  /** D20 + 敏捷（排序主键） */
  initiative: number
  /** 注入时的原始顺序（同 side 稳定序兜底） */
  order: number
}

/** 遭遇战利品汇总（§16：胜利事务统一写入） */
export interface EncounterLootSummary {
  items: { itemId: string; quantity: number }[]
  gold: number
  /** 幸运检定完整结果（保留全部，供展示公式） */
  luckChecks: LuckCheckResult[]
}

/** 我方单位构建输入（战斗派生属性由调用方提供：Player 走 getEffectiveCharacterAttributes） */
export interface FriendlyCombatantInput {
  instanceId: string
  sourceType: 'player' | 'companion'
  sourceId: string
  name: string
  currentHp: number
  maxHp: number
  currentMp: number
  maxMp: number
  attack: number
  armor: number
  agility: number
}

/** rng 校验 + D20 生成：rng() ∈ [0,1) → 1–20 */
function rollD20With(rng: Rng): number {
  const v = rng()
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 1) {
    throw new RangeError('rng 必须返回 [0,1) 区间的数')
  }
  return Math.floor(v * 20) + 1
}

/**
 * 展开遭遇成员为敌方实例（§8）。
 * 同一 enemyId 多实例各生成一个独立 EnemyInstance（instanceId 形如 enemy#1/enemy#2）。
 */
export function buildEnemyInstances(members: readonly EncounterMember[]): EnemyInstance[] {
  if (!Array.isArray(members) || members.length === 0) {
    throw new RangeError('遭遇成员不能为空')
  }
  const total = members.reduce((sum, m) => sum + m.count, 0)
  if (total < 1) throw new RangeError('遭遇至少要有 1 个敌人')
  if (total > MAX_ENCOUNTER_MEMBERS) {
    throw new RangeError(`敌人总数不能超过 ${MAX_ENCOUNTER_MEMBERS}`)
  }
  const instances: EnemyInstance[] = []
  let seq = 1
  for (const member of members) {
    const def = getEnemy(member.enemyId)
    if (!def) throw new RangeError(`敌人 ${member.enemyId} 未注册`)
    for (let i = 0; i < member.count; i += 1) {
      instances.push({
        instanceId: `enemy#${seq}`,
        enemyId: member.enemyId,
        currentHp: def.maxHp,
        maxHp: def.maxHp,
      })
      seq += 1
    }
  }
  return instances
}

/** 从敌方实例派生战斗单位（攻击/护甲/敏捷取 EnemyDefinition 基线，不经平衡公式再加工） */
export function buildEnemyCombatant(instance: EnemyInstance): Combatant {
  const def = getEnemy(instance.enemyId)
  if (!def) throw new RangeError(`敌人 ${instance.enemyId} 未注册`)
  return {
    instanceId: instance.instanceId,
    side: 'enemy',
    sourceType: 'enemy',
    sourceId: def.id,
    name: def.name,
    currentHp: instance.currentHp,
    maxHp: instance.maxHp,
    currentMp: 0,
    maxMp: 0,
    attack: def.attackPower,
    armor: def.armor,
    agility: def.agility,
    isAlive: instance.currentHp > 0,
  }
}

/** 构建我方战斗单位（side 恒为 friendly；isAlive 由 currentHp 派生） */
export function buildFriendlyCombatant(input: FriendlyCombatantInput): Combatant {
  return { ...input, side: 'friendly', isAlive: input.currentHp > 0 }
}

/**
 * 先手队列（§9.3）：D20+AGI 降序；同 initiative → 敏捷高者先；
 * 仍相同 → friendly 优先；同 side → 注入原始稳定序。纯函数，rng 注入。
 */
export function rollInitiativeQueue(combatants: readonly Combatant[], rng: Rng): InitiativeTurn[] {
  if (!Array.isArray(combatants) || combatants.length === 0) {
    throw new RangeError('先手队列不能为空')
  }
  return combatants
    .map((combatant, order) => {
      const roll = rollD20With(rng)
      return { combatant, roll, initiative: combatant.agility + roll, order }
    })
    .sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative
      if (b.combatant.agility !== a.combatant.agility) return b.combatant.agility - a.combatant.agility
      if (a.combatant.side !== b.combatant.side) return a.combatant.side === 'friendly' ? -1 : 1
      return a.order - b.order
    })
}

/**
 * 从固定先手槽位解析实时战斗单位。InitiativeTurn 中的 combatant 只是开战快照，
 * HP / isAlive 必须始终以战斗中的 combatants 为准。
 */
export function getLiveCombatant(
  turn: InitiativeTurn | undefined,
  combatants: readonly Combatant[],
): Combatant | undefined {
  if (!turn) return undefined
  return combatants.find((combatant) => combatant.instanceId === turn.combatant.instanceId)
}

/**
 * @deprecated TM-P2-012 §85B：生产代码已不使用（实时回合推进走 nextLiveTurnIndex）。
 * 仅为历史 QA 平衡模拟脚本（qa/p2-007/008/009-balance.mjs 的回合推进注入）保留；
 * 生产代码与 CombatPage 禁止调用（不得读取开战快照的存活状态）。
 */
export function nextAliveTurnIndex(turns: readonly InitiativeTurn[], fromIndex: number): number {
  const n = turns.length
  if (n === 0) throw new RangeError('先手队列不能为空')
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= n) {
    throw new RangeError('当前行动索引越界')
  }
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIndex + step) % n
    if (turns[idx]!.combatant.isAlive) return idx
  }
  return fromIndex
}

/** 固定先手顺序中，从 fromIndex 之后寻找下一个实时存活且未结束回合的槽位。 */
export function nextLiveTurnIndex(
  turns: readonly InitiativeTurn[],
  combatants: readonly Combatant[],
  fromIndex: number,
  endedByInstance: Readonly<Record<string, boolean>> = {},
): number | null {
  const n = turns.length
  if (n === 0) throw new RangeError('先手队列不能为空')
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= n) {
    throw new RangeError('当前行动索引越界')
  }
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIndex + step) % n
    const live = getLiveCombatant(turns[idx], combatants)
    if (live?.isAlive && endedByInstance[live.instanceId] !== true) return idx
  }
  return null
}

/** 是否已进入新一轮：nextIndex 回绕到 fromIndex 或更小（nextAliveTurnIndex 环状前进） */
export function didTurnLoop(fromIndex: number, nextIndex: number): boolean {
  return nextIndex <= fromIndex
}

/**
 * TM-P2-009-R1 §7：从 fromIndex 出发的 Friendly Ready Block（线性连续 friendly 段）。
 * 从 fromIndex 沿 turns 数组向两侧扩展连续 friendly 单位，直到遇到 enemy 或数组端点。
 * 有意用「线性」而非「环」：turns 首尾的 friendly 不被错误相连，从而保证
 *   `F1 → E1 → F2` 中 F1 不能跨过 E1 切到 F2、F2 也不能切回 F1；
 *   `F1 → F2 → E1` 中 F1/F2 同段可互切。
 * fromIndex 本身不是 friendly（enemy 位置）时只返回自身——段是「friendly 单位集」，
 * 敌人不在任何段内；UI 层实际只在友好行动时调用（isFriendlyTurn）。
 * 本函数只表达「段」的几何；是否可切换（未 ended / 存活）由调用方在 UI 层过滤。
 */
export function friendlyBlockIndices(turns: readonly InitiativeTurn[], fromIndex: number): number[] {
  const n = turns.length
  if (n === 0) throw new RangeError('先手队列不能为空')
  if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= n) {
    throw new RangeError('当前行动索引越界')
  }
  if (turns[fromIndex]!.combatant.side !== 'friendly') return [fromIndex]
  const result = new Set<number>([fromIndex])
  for (let i = fromIndex + 1; i < n && turns[i]!.combatant.side === 'friendly'; i += 1) result.add(i)
  for (let i = fromIndex - 1; i >= 0 && turns[i]!.combatant.side === 'friendly'; i -= 1) result.add(i)
  return [...result].sort((a, b) => a - b)
}

/** 敌方 AI 目标选择（§12 AI V1）：随机选取存活我方单位。livingTargets 必须已过滤为存活我方。 */
export function chooseEnemyTarget(livingTargets: readonly Combatant[], rng: Rng): Combatant {
  if (!Array.isArray(livingTargets) || livingTargets.length === 0) {
    throw new RangeError('没有存活的我方目标')
  }
  if (livingTargets.some((c) => c.side !== 'friendly')) {
    throw new RangeError('敌方目标必须是我方单位')
  }
  const v = rng()
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 1) {
    throw new RangeError('rng 必须返回 [0,1) 区间的数')
  }
  const index = Math.min(livingTargets.length - 1, Math.floor(v * livingTargets.length))
  return livingTargets[index]!
}

/**
 * TM-P2-009-R1 §10：敌方行动选择（主动技能 / 普攻）。
 * usableSkills 必须是已过滤的可用技能（冷却归零 + 非 once-per-combat 已用，见 rules/skill 的
 * filterUsableEnemySkills）——本函数只做「倾向性选择」，不重复校验。无可用技能 → 恒普攻。
 * aiProfile 决定用技能倾向（aggressive 0.7 / defensive 0.4 / caster 0.85 / pack 0.55 / boss 0.8；
 * 缺省按 aggressive）。rng 注入 [0,1)，测试可固定序列。
 */
export type EnemyActionChoice = { type: 'attack' } | { type: 'skill'; skillId: string }

const AI_SKILL_RATE: Record<'aggressive' | 'defensive' | 'caster' | 'pack' | 'boss', number> = {
  aggressive: 0.7,
  defensive: 0.4,
  caster: 0.85,
  pack: 0.55,
  boss: 0.8,
}

export function chooseEnemyAction(
  usableSkills: readonly SkillDefinition[],
  aiProfile: 'aggressive' | 'defensive' | 'caster' | 'pack' | 'boss' | undefined,
  rng: Rng,
): EnemyActionChoice {
  const v = rng()
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 1) {
    throw new RangeError('rng 必须返回 [0,1) 区间的数')
  }
  if (usableSkills.length === 0) return { type: 'attack' }
  const rate = AI_SKILL_RATE[aiProfile ?? 'aggressive']
  if (v >= rate) return { type: 'attack' }
  // v ∈ [0, rate)：在可用技能中等概率挑选一个（rate < 1 时按比例归一到技能数，避免低率画像偏向前几项）
  const skillIndex = Math.min(usableSkills.length - 1, Math.floor((v / rate) * usableSkills.length))
  return { type: 'skill', skillId: usableSkills[skillIndex]!.id }
}

/** 遭遇胜利：敌方全部单位死亡（§13） */
export function isEncounterWon(combatants: readonly Combatant[]): boolean {
  return !combatants.some((c) => c.side === 'enemy' && c.isAlive)
}

/** 遭遇失败：我方全部单位死亡（§13） */
export function isEncounterLost(combatants: readonly Combatant[]): boolean {
  return !combatants.some((c) => c.side === 'friendly' && c.isAlive)
}

/** 不可变更新单位生命：clamp 到 [0, maxHp]；isAlive 跟随 currentHp */
export function updateCombatantHp(combatant: Combatant, nextHp: number): Combatant {
  if (!Number.isFinite(nextHp)) throw new RangeError('生命值必须是有穷数')
  const clamped = Math.min(combatant.maxHp, Math.max(0, nextHp))
  return { ...combatant, currentHp: clamped, isAlive: clamped > 0 }
}

/**
 * 多人逃跑检定（§14）：沿用 V1 公式
 *   escapeScore = (highestFriendlyAgility + d20) / 3，成功 = score >= highestEnemyAgility。
 * 成功无任何奖励（XP/Loot 一律丢弃）——由调用方不在胜利结算中发放。
 */
export function resolvePartyEscape(
  friendlyCombatants: readonly Combatant[],
  enemyCombatants: readonly Combatant[],
  roll: number,
): EscapeResult {
  if (!Array.isArray(friendlyCombatants) || friendlyCombatants.length === 0) {
    throw new RangeError('我方单位不能为空')
  }
  if (!Array.isArray(enemyCombatants) || enemyCombatants.length === 0) {
    throw new RangeError('敌方单位不能为空')
  }
  const highestFriendly = Math.max(...friendlyCombatants.map((c) => c.agility))
  const highestEnemy = Math.max(...enemyCombatants.map((c) => c.agility))
  return resolveEscape(highestFriendly, highestEnemy, roll)
}

/**
 * 遭遇 XP 结算（§15）：sum(每个 defeated EnemyInstance × adventureXpReward)。
 * 复用 combatXp 的 first-kill 语义：同一 enemyId 本次遭遇的多个实例各计一次（如骷髅战士×2 → 2× 奖励）；
 * 整场遭遇胜利才调用（时序由调用方保证）。
 */
export function resolveEncounterXp(gameState: GameState, defeatedInstances: readonly EnemyInstance[]): number {
  return defeatedInstances.reduce(
    (sum, inst) => sum + getEnemyFirstKillXp(gameState, inst.enemyId),
    0,
  )
}

/**
 * 遭遇战利品汇总（§16）：把多个 EnemyInstance 的 pendingLoot（LootGrant）合并为一次胜利结算。
 * 同 itemId 聚合数量、gold 累加、幸运检定完整结果保留。Escape/Defeat 时调用方直接丢弃。
 */
export function resolveEncounterLoot(grants: readonly LootGrant[]): EncounterLootSummary {
  const itemMap = new Map<string, number>()
  let gold = 0
  const luckChecks: LuckCheckResult[] = []
  for (const grant of grants) {
    for (const item of grant.items) {
      itemMap.set(item.itemId, (itemMap.get(item.itemId) ?? 0) + item.quantity)
    }
    gold += grant.gold
    if (grant.luckCheck) luckChecks.push(grant.luckCheck)
  }
  return {
    items: [...itemMap.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
    gold,
    luckChecks,
  }
}

const CIRCLE_SUFFIXES = ['', '①', '②', '③']

/**
 * 同 sourceId 多实例的展示后缀（阶段 7 CombatEvent 用）：index 0 → 无后缀、1 → ①、2 → ②、
 * 3 个以上回退阿拉伯括号。生产 UI 只展示此派生名，不泄露内部 instanceId。
 */
export function instanceDisplaySuffix(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new RangeError('实例序号必须是非负整数')
  }
  return index < CIRCLE_SUFFIXES.length ? CIRCLE_SUFFIXES[index]! : `(${index + 1})`
}
