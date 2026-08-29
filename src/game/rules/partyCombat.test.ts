/**
 * Party Combat V5 纯规则测试（TM-P2-007 §8–16；§42–47 的 PC 用例）。
 * 覆盖：我方 1–3 / 敌方 1–4 展开、先手排序（tie/稳定序）、死亡跳过与轮次推进、
 * 敌方目标选择、胜负判定、多人逃跑、遭遇 XP（多实例各计一次/重复 0）、战利品聚合、
 * V3 公式原样复用、同源多实例展示名。
 */
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { SKILLS } from '../content/skills'
import { resolveAttack } from './combat'
import type { GameState } from '../types/game'
import type { QuestStatus } from '../types/quest'
import type { LootGrant } from '../types/loot'
import {
  buildEnemyCombatant,
  buildEnemyInstances,
  buildFriendlyCombatant,
  chooseEnemyAction,
  chooseEnemyTarget,
  didTurnLoop,
  friendlyBlockIndices,
  getLiveCombatant,
  instanceDisplaySuffix,
  isEncounterLost,
  isEncounterWon,
  MAX_ENCOUNTER_MEMBERS,
  nextAliveTurnIndex,
  nextLiveTurnIndex,
  resolveEncounterLoot,
  resolveEncounterXp,
  resolvePartyEscape,
  rollInitiativeQueue,
  updateCombatantHp,
  type Combatant,
  type InitiativeTurn,
  type Rng,
} from './partyCombat'

/** 固定序列 rng：按顺序返回注入值，越界回绕到 0 */
function seqRng(...values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

function makePlayer(overrides: Omit<Partial<Combatant>, 'sourceType'> = {}): Combatant {
  return buildFriendlyCombatant({
    instanceId: 'player',
    sourceType: 'player' as const,
    sourceId: 'player',
    name: '主角',
    currentHp: 30,
    maxHp: 30,
    currentMp: 10,
    maxMp: 10,
    attack: 14,
    armor: 10,
    agility: 12,
    ...overrides,
  })
}

function makeSakura(overrides: Omit<Partial<Combatant>, 'sourceType'> = {}): Combatant {
  return buildFriendlyCombatant({
    instanceId: 'sakura',
    sourceType: 'companion' as const,
    sourceId: 'sakura_yuko',
    name: '樱花优子',
    currentHp: 24,
    maxHp: 24,
    currentMp: 12,
    maxMp: 12,
    attack: 12,
    armor: 9,
    agility: 15,
    ...overrides,
  })
}

function makeEnemyCombatants(...members: { enemyId: string; count: number }[]): Combatant[] {
  return buildEnemyInstances(members).map(buildEnemyCombatant)
}

/** 构造带指定任务状态的 GameState fixture（初始 quests 为空，直接注入最小 QuestState） */
function withQuestStatus(questId: string, status: QuestStatus): GameState {
  const state = createInitialGameState()
  const existing = state.quests.find((quest) => quest.questId === questId)
  if (existing) {
    existing.status = status
  } else {
    state.quests.push({ questId, status, stage: 0, flags: {} })
  }
  return state
}

describe('buildEnemyInstances（§8 敌方 1–3 展开）', () => {
  it('PC1 单敌 count1 → 1 个实例，满血', () => {
    const instances = buildEnemyInstances([{ enemyId: 'corrupted_rabbit', count: 1 }])
    expect(instances).toHaveLength(1)
    expect(instances[0]!.enemyId).toBe('corrupted_rabbit')
    expect(instances[0]!.currentHp).toBe(8)
    expect(instances[0]!.maxHp).toBe(8)
    expect(instances[0]!.instanceId).toBe('enemy#1')
  })

  it('PC2 同一 enemyId count2 → 2 个实例，instanceId 区分、enemyId 相同', () => {
    const instances = buildEnemyInstances([{ enemyId: 'skeleton_warrior', count: 2 }])
    expect(instances).toHaveLength(2)
    expect(instances.map((i) => i.enemyId)).toEqual(['skeleton_warrior', 'skeleton_warrior'])
    expect(instances[0]!.instanceId).not.toBe(instances[1]!.instanceId)
    expect(instances.map((i) => i.instanceId)).toEqual(['enemy#1', 'enemy#2'])
  })

  it('PC3 三种敌各 1 → 3 个实例（敌方上限 4）', () => {
    const instances = buildEnemyInstances([
      { enemyId: 'corrupted_rabbit', count: 1 },
      { enemyId: 'corrupted_rat', count: 1 },
      { enemyId: 'corrupted_wolf', count: 1 },
    ])
    expect(instances).toHaveLength(3)
    expect(instances.map((i) => i.enemyId)).toEqual(['corrupted_rabbit', 'corrupted_rat', 'corrupted_wolf'])
  })

  it('PC4 总数 >4 拒绝（硬上限 4）', () => {
    expect(() => buildEnemyInstances([{ enemyId: 'corrupted_rabbit', count: 3 }, { enemyId: 'corrupted_rat', count: 2 }])).toThrow(RangeError)
    expect(MAX_ENCOUNTER_MEMBERS).toBe(4)
  })

  it('PC4b 四敌满编 → 4 个实例', () => {
    const instances = buildEnemyInstances([{ enemyId: 'corrupted_rabbit', count: 4 }])
    expect(instances).toHaveLength(4)
    expect(instances.map((i) => i.instanceId)).toEqual(['enemy#1', 'enemy#2', 'enemy#3', 'enemy#4'])
  })

  it('PC5 空成员 / count 为 0 拒绝', () => {
    expect(() => buildEnemyInstances([])).toThrow(RangeError)
    expect(() => buildEnemyInstances([{ enemyId: 'corrupted_rabbit', count: 0 }])).toThrow(RangeError)
  })

  it('PC6 未注册敌人拒绝', () => {
    expect(() => buildEnemyInstances([{ enemyId: 'not_a_real_enemy', count: 1 }])).toThrow(RangeError)
  })
})

describe('buildEnemyCombatant（§9.2 派生战斗单位）', () => {
  it('PC7 派生 attack/armor/agility 与 EnemyDefinition 基线一致', () => {
    const combatant = buildEnemyCombatant(buildEnemyInstances([{ enemyId: 'black_mane_wolf', count: 1 }])[0]!)
    expect(combatant.side).toBe('enemy')
    expect(combatant.sourceType).toBe('enemy')
    expect(combatant.sourceId).toBe('black_mane_wolf')
    expect(combatant.name).toBe('黑鬃魔狼')
    expect(combatant.attack).toBeGreaterThan(0)
    expect(combatant.armor).toBeGreaterThan(0)
    expect(combatant.agility).toBeGreaterThan(0)
    expect(combatant.currentHp).toBe(combatant.maxHp)
    expect(combatant.isAlive).toBe(true)
  })
})

describe('rollInitiativeQueue（§9.3 先手排序）', () => {
  it('PC8 D20+AGI 降序：rng 全 0（D20=1）时按敏捷排序', () => {
    const turns = rollInitiativeQueue([makePlayer(), ...makeEnemyCombatants({ enemyId: 'corrupted_wolf', count: 1 })], seqRng(0, 0))
    // player agi12 → 13；wolf agi12 → 13；initiative 相同再比 AGI（也相同）→ friendly 优先
    expect(turns.map((t) => t.combatant.name)).toEqual(['主角', '魔化狼'])
    expect(turns[0]!.initiative).toBe(13)
    expect(turns[1]!.initiative).toBe(13)
  })

  it('PC9 initiative 相同、敏捷不同 → 敏捷高者先', () => {
    // player agi12 roll13 → 25；sakura agi15 roll10 → 25；同 initiative → 比敏捷（sakura 先）
    const turns = rollInitiativeQueue([makePlayer(), makeSakura()], seqRng(0.6, 0.45))
    expect(turns[0]!.combatant.name).toBe('樱花优子')
    expect(turns[0]!.initiative).toBe(25)
    expect(turns[1]!.initiative).toBe(25)
  })

  it('PC10 initiative 与敏捷都相同 → friendly 优先', () => {
    // player agi12 roll10 → 22；rabbit agi10 roll12 → 22 但敏捷低；构造 wolf agi12 roll10 → 22
    const turns = rollInitiativeQueue(
      [makePlayer(), ...makeEnemyCombatants({ enemyId: 'corrupted_wolf', count: 1 })],
      seqRng(0.45, 0.45),
    )
    expect(turns.map((t) => t.combatant.name)).toEqual(['主角', '魔化狼'])
  })

  it('PC11 同 side 保持注入原始稳定序（两个同值敌人）', () => {
    const turns = rollInitiativeQueue(
      makeEnemyCombatants({ enemyId: 'corrupted_rat', count: 1 }, { enemyId: 'corrupted_wolf', count: 1 }),
      seqRng(0.45, 0.45),
    )
    // rat agi10、wolf agi12 不同敏捷；改用两个同敏捷敌人验证稳定序
    const twin = makeEnemyCombatants({ enemyId: 'corrupted_rat', count: 1 }, { enemyId: 'corrupted_rat', count: 1 })
    const twinTurns = rollInitiativeQueue(twin, seqRng(0.45, 0.45))
    expect(twinTurns.map((t) => t.combatant.instanceId)).toEqual(['enemy#1', 'enemy#2'])
    void turns
  })

  it('PC12 非法 rng 值拒绝', () => {
    expect(() => rollInitiativeQueue([makePlayer()], () => 1.5)).toThrow(RangeError)
    expect(() => rollInitiativeQueue([makePlayer()], () => -0.1)).toThrow(RangeError)
    expect(() => rollInitiativeQueue([], seqRng(0))).toThrow(RangeError)
  })

  it('PC12b 先手队列不凭空增减单位（§61：坐骑等非单位不会被注入队列）', () => {
    const input = [makePlayer(), makeSakura(), ...makeEnemyCombatants({ enemyId: 'corrupted_wolf', count: 1 })]
    const turns = rollInitiativeQueue(input, seqRng(0.99, 0.99, 0.99))
    // 队列严格 = 输入 combatants 全排列：不新增（坐骑/外挂单位）也不丢弃
    expect(turns).toHaveLength(input.length)
    expect(new Set(turns.map((t) => t.combatant.instanceId))).toEqual(new Set(input.map((c) => c.instanceId)))
  })
})

describe('回合推进（§9.4 死亡跳过 / round）', () => {
  it('PC13 死亡单位跳过：中间敌人死亡则跳到下一个存活', () => {
    const turns = rollInitiativeQueue(
      [makePlayer(), ...makeEnemyCombatants({ enemyId: 'corrupted_rat', count: 1 }, { enemyId: 'corrupted_wolf', count: 1 })],
      seqRng(0.99, 0.99, 0.99),
    )
    // 标记 index1（rat）死亡
    const dead = updateCombatantHp(turns[1]!.combatant, 0)
    const withDead = turns.map((t, i) => (i === 1 ? { ...t, combatant: dead } : t))
    const next = nextAliveTurnIndex(withDead, 0)
    expect(withDead[next]!.combatant.isAlive).toBe(true)
    expect(next).not.toBe(1)
  })

  it('PC14 队列末尾回绕到开头，didTurnLoop 为 true', () => {
    const turns = rollInitiativeQueue(
      [makePlayer(), makeSakura(), ...makeEnemyCombatants({ enemyId: 'corrupted_wolf', count: 1 })],
      seqRng(0.9, 0.9, 0.9),
    )
    const last = turns.length - 1
    const next = nextAliveTurnIndex(turns, last)
    expect(next).toBe(0)
    expect(didTurnLoop(last, next)).toBe(true)
    expect(didTurnLoop(0, 1)).toBe(false)
  })

  it('PC15 越界索引拒绝', () => {
    const turns = rollInitiativeQueue([makePlayer()], seqRng(0))
    expect(() => nextAliveTurnIndex(turns, -1)).toThrow(RangeError)
    expect(() => nextAliveTurnIndex(turns, 5)).toThrow(RangeError)
  })
})

describe('TM-P2-011 实时死亡单位回合跳过', () => {
  const turnOf = (combatant: Combatant, order: number): InitiativeTurn => ({
    combatant,
    roll: 1,
    initiative: combatant.agility + 1,
    order,
  })

  it('CB1/CB2：先手快照仍存活时，按实时状态跳过死亡玩家与伙伴', () => {
    const sakura = makeSakura()
    const player = makePlayer()
    const companion = makeSakura({ instanceId: 'companion#2', sourceId: 'companion#2' })
    const enemy = makeEnemyCombatants({ enemyId: 'corrupted_wolf', count: 1 })[0]!
    const turns = [turnOf(sakura, 0), turnOf(player, 1), turnOf(companion, 2), turnOf(enemy, 3)]
    const live = [sakura, updateCombatantHp(player, 0), updateCombatantHp(companion, 0), enemy]
    expect(turns[1]!.combatant.isAlive).toBe(true)
    expect(getLiveCombatant(turns[1], live)?.isAlive).toBe(false)
    expect(nextLiveTurnIndex(turns, live, 0)).toBe(3)
  })

  it('CB3：敌人在行动前死亡时不再执行该 initiative slot', () => {
    const player = makePlayer()
    const enemies = makeEnemyCombatants({ enemyId: 'corrupted_rat', count: 2 })
    const turns = [turnOf(player, 0), turnOf(enemies[0]!, 1), turnOf(enemies[1]!, 2)]
    const live = [player, updateCombatantHp(enemies[0]!, 0), enemies[1]!]
    expect(nextLiveTurnIndex(turns, live, 0)).toBe(2)
  })

  it('CB5/CB6：4v4 可连续跨越多个死亡槽位并保持固定先手顺序', () => {
    const friendlies = [makePlayer(), makeSakura(), makeSakura({ instanceId: 'companion#2' }), makeSakura({ instanceId: 'companion#3' })]
    const enemies = makeEnemyCombatants({ enemyId: 'corrupted_rat', count: 4 })
    const roster = [...friendlies, ...enemies]
    const turns = roster.map(turnOf)
    const live = roster.map((combatant, index) => (index === 0 || index >= 4 && index <= 6 ? updateCombatantHp(combatant, 0) : combatant))
    expect(nextLiveTurnIndex(turns, live, 7)).toBe(1)
    expect(nextLiveTurnIndex(turns, live, 3, { [enemies[3]!.instanceId]: true })).toBe(1)
  })

  it('CB4：玩家死亡但伙伴存活不判失败；全友军死亡才判失败', () => {
    const enemy = makeEnemyCombatants({ enemyId: 'corrupted_wolf', count: 1 })[0]!
    const playerDead = updateCombatantHp(makePlayer(), 0)
    const sakura = makeSakura()
    expect(isEncounterLost([playerDead, sakura, enemy])).toBe(false)
    expect(isEncounterLost([playerDead, updateCombatantHp(sakura, 0), enemy])).toBe(true)
  })
})

describe('friendlyBlockIndices（TM-P2-009-R1 §7 Friendly Ready Block 线性连续段）', () => {
  /** 直接构造 InitiativeTurn（不经过 rollInitiativeQueue），以便精确控制 friendly/enemy 几何布局 */
  function turnOf(combatant: Combatant, order: number): InitiativeTurn {
    return { combatant, roll: 1, initiative: combatant.agility + 1, order }
  }

  it('PC-§7-1 F1→F2→E1：同段 [0,1] 互切；E1 独立单段', () => {
    const f1 = makePlayer()
    const f2 = makeSakura()
    const e1 = makeEnemyCombatants({ enemyId: 'corrupted_rabbit', count: 1 })[0]!
    const turns = [turnOf(f1, 0), turnOf(f2, 1), turnOf(e1, 2)]
    expect(friendlyBlockIndices(turns, 0)).toEqual([0, 1])
    expect(friendlyBlockIndices(turns, 1)).toEqual([0, 1])
    expect(friendlyBlockIndices(turns, 2)).toEqual([2])
  })

  it('PC-§7-2 F1→E1→F2：F1/F2 被 E1 隔开，各自单段，不能跨 E1 互切', () => {
    const f1 = makePlayer()
    const f2 = makeSakura()
    const e1 = makeEnemyCombatants({ enemyId: 'corrupted_rabbit', count: 1 })[0]!
    const turns = [turnOf(f1, 0), turnOf(e1, 1), turnOf(f2, 2)]
    expect(friendlyBlockIndices(turns, 0)).toEqual([0])
    expect(friendlyBlockIndices(turns, 1)).toEqual([1])
    expect(friendlyBlockIndices(turns, 2)).toEqual([2])
  })

  it('PC-§7-3 全 friendly 段：无 enemy 时整列同一段', () => {
    const turns = [turnOf(makePlayer(), 0), turnOf(makeSakura(), 1)]
    expect(friendlyBlockIndices(turns, 0)).toEqual([0, 1])
    expect(friendlyBlockIndices(turns, 1)).toEqual([0, 1])
  })

  it('PC-§7-4 friendly 在末尾连续：E1→F1→F2 时 F1/F2 同段', () => {
    const e1 = makeEnemyCombatants({ enemyId: 'corrupted_rabbit', count: 1 })[0]!
    const f1 = makePlayer()
    const f2 = makeSakura()
    const turns = [turnOf(e1, 0), turnOf(f1, 1), turnOf(f2, 2)]
    expect(friendlyBlockIndices(turns, 1)).toEqual([1, 2])
    expect(friendlyBlockIndices(turns, 2)).toEqual([1, 2])
    expect(friendlyBlockIndices(turns, 0)).toEqual([0])
  })

  it('PC-§7-5 线性非环：turns 首尾的 friendly 不被错误相连', () => {
    // F1 → E1 → E2 → F2 布局：index0 与 index3 都是 friendly，但被 enemy 隔开 → 各自单段
    const f1 = makePlayer()
    const e1 = makeEnemyCombatants({ enemyId: 'corrupted_rabbit', count: 1 })[0]!
    const e2 = makeEnemyCombatants({ enemyId: 'corrupted_rat', count: 1 })[0]!
    const f2 = makeSakura()
    const turns = [turnOf(f1, 0), turnOf(e1, 1), turnOf(e2, 2), turnOf(f2, 3)]
    expect(friendlyBlockIndices(turns, 0)).toEqual([0])
    expect(friendlyBlockIndices(turns, 3)).toEqual([3])
  })

  it('PC-§7-6 空队列 / 越界索引拒绝', () => {
    expect(() => friendlyBlockIndices([], 0)).toThrow(RangeError)
    const turns = [turnOf(makePlayer(), 0)]
    expect(() => friendlyBlockIndices(turns, -1)).toThrow(RangeError)
    expect(() => friendlyBlockIndices(turns, 3)).toThrow(RangeError)
  })
})

describe('敌方目标选择（§12 AI V1）', () => {
  it('PC16 rng=0 → 第一个存活目标；接近 1 → 最后一个', () => {
    const targets = [makePlayer(), makeSakura()]
    expect(chooseEnemyTarget(targets, () => 0).instanceId).toBe('player')
    expect(chooseEnemyTarget(targets, () => 0.999).instanceId).toBe('sakura')
  })

  it('PC17 空目标 / 非我方目标拒绝', () => {
    expect(() => chooseEnemyTarget([], () => 0)).toThrow(RangeError)
    const enemy = makeEnemyCombatants({ enemyId: 'corrupted_rabbit', count: 1 })[0]!
    expect(() => chooseEnemyTarget([enemy], () => 0)).toThrow(RangeError)
    expect(() => chooseEnemyTarget([makePlayer()], () => 1)).toThrow(RangeError)
  })
})

describe('敌方行动选择（TM-P2-009-R1 §10 AI：技能 + 普攻）', () => {
  const skills = () => [SKILLS['enemy_rabbit_mad_bite']!, SKILLS['enemy_wolf_vicious_pounce']!]

  it('EC1 无可用技能 → 恒普攻（任何画像 / rng）', () => {
    expect(chooseEnemyAction([], 'aggressive', () => 0)).toEqual({ type: 'attack' })
    expect(chooseEnemyAction([], 'boss', () => 0.5)).toEqual({ type: 'attack' })
  })

  it('EC2 aiProfile 决定用技能倾向（aggressive 0.7）', () => {
    expect(chooseEnemyAction(skills(), 'aggressive', () => 0.5)).toEqual({ type: 'skill', skillId: 'enemy_wolf_vicious_pounce' })
    expect(chooseEnemyAction(skills(), 'aggressive', () => 0.8)).toEqual({ type: 'attack' })
  })

  it('EC3 caster / boss 高倾向用技能', () => {
    expect(chooseEnemyAction(skills(), 'caster', () => 0.8).type).toBe('skill')
    expect(chooseEnemyAction(skills(), 'boss', () => 0.75).type).toBe('skill')
    expect(chooseEnemyAction(skills(), 'defensive', () => 0.5).type).toBe('attack')
    expect(chooseEnemyAction(skills(), 'pack', () => 0.6).type).toBe('attack')
  })

  it('EC4 缺省画像按 aggressive（undefined）', () => {
    expect(chooseEnemyAction(skills(), undefined, () => 0.5).type).toBe('skill')
    expect(chooseEnemyAction(skills(), undefined, () => 0.8).type).toBe('attack')
  })

  it('EC5 技能在可用技能内等概率挑选（rng 0 → 第一个；接近 rate → 最后一个）', () => {
    expect(chooseEnemyAction(skills(), 'aggressive', () => 0)).toEqual({ type: 'skill', skillId: 'enemy_rabbit_mad_bite' })
    expect(chooseEnemyAction(skills(), 'aggressive', () => 0.69)).toEqual({ type: 'skill', skillId: 'enemy_wolf_vicious_pounce' })
  })

  it('EC6 非法 rng → RangeError', () => {
    expect(() => chooseEnemyAction(skills(), 'aggressive', () => 1)).toThrow(RangeError)
    expect(() => chooseEnemyAction(skills(), 'aggressive', () => -0.1)).toThrow(RangeError)
    expect(() => chooseEnemyAction(skills(), 'aggressive', () => NaN)).toThrow(RangeError)
  })
})

describe('胜负判定（§13）', () => {
  it('PC18 敌全灭 → won；我方全灭 → lost；双方存活 → 均 false', () => {
    const all = [...makeEnemyCombatants({ enemyId: 'corrupted_rabbit', count: 1 }), makePlayer()]
    expect(isEncounterWon(all)).toBe(false)
    expect(isEncounterLost(all)).toBe(false)

    const won = [updateCombatantHp(all[0]!, 0), all[1]!]
    expect(isEncounterWon(won)).toBe(true)
    expect(isEncounterLost(won)).toBe(false)

    const lost = [updateCombatantHp(all[1]!, 0), all[0]!]
    expect(isEncounterLost(lost)).toBe(true)
    expect(isEncounterWon(lost)).toBe(false)
  })
})

describe('updateCombatantHp（生命不可变更新）', () => {
  it('PC19 clamp 到 [0, maxHp]，isAlive 跟随', () => {
    const p = makePlayer()
    const healed = updateCombatantHp(p, 999)
    expect(healed.currentHp).toBe(p.maxHp)
    expect(healed.isAlive).toBe(true)
    const dead = updateCombatantHp(p, -5)
    expect(dead.currentHp).toBe(0)
    expect(dead.isAlive).toBe(false)
    expect(p.currentHp).toBe(30) // 原对象不变
  })
})

describe('多人逃跑（§14）', () => {
  it('PC20 复用 V1 公式：成功与失败', () => {
    const friendly = [makePlayer(), makeSakura()] // 最高敏捷 15
    const enemy = makeEnemyCombatants({ enemyId: 'black_mane_wolf', count: 1 }) // 敏捷待查
    const roll = 20
    const result = resolvePartyEscape(friendly, enemy, roll)
    expect(result.roll).toBe(20)
    expect(result.success).toBe((15 + 20) / 3 >= result.enemyAgility)
    const low = resolvePartyEscape(friendly, enemy, 1)
    expect(low.success).toBe(false)
  })

  it('PC21 空侧 / 骰面越界拒绝', () => {
    const enemy = makeEnemyCombatants({ enemyId: 'corrupted_rabbit', count: 1 })
    expect(() => resolvePartyEscape([], enemy, 10)).toThrow(RangeError)
    expect(() => resolvePartyEscape([makePlayer()], [], 10)).toThrow(RangeError)
    expect(() => resolvePartyEscape([makePlayer()], enemy, 25)).toThrow(RangeError)
    expect(() => resolvePartyEscape([makePlayer()], enemy, 0)).toThrow(RangeError)
  })
})

describe('遭遇 XP（§15）', () => {
  it('PC22 同 enemyId 多实例各计一次（first-kill 语义 ×2）', () => {
    const state = withQuestStatus('quest_village_monsters', 'in_progress')
    const instances = buildEnemyInstances([{ enemyId: 'corrupted_rabbit', count: 2 }])
    // corrupted_rabbit adventureXpReward=10 → 2 实例 = 20
    expect(resolveEncounterXp(state, instances)).toBe(20)
  })

  it('PC23 重复遭遇 0 XP；未注册/无奖励敌人 0 XP', () => {
    const pending = withQuestStatus('quest_village_monsters', 'in_progress')
    const done = withQuestStatus('quest_village_monsters', 'completed')
    const instances = buildEnemyInstances([{ enemyId: 'corrupted_rabbit', count: 1 }])
    expect(resolveEncounterXp(pending, instances)).toBe(10)
    expect(resolveEncounterXp(done, instances)).toBe(0)
    expect(resolveEncounterXp(pending, [{ instanceId: 'x', enemyId: 'not_a_real_enemy', currentHp: 0, maxHp: 1 }])).toBe(0)
  })
})

describe('遭遇战利品汇总（§16）', () => {
  it('PC24 多实例 pendingLoot 合并：同物品聚合、金币累加、幸运检定完整保留', () => {
    const grants: LootGrant[] = [
      { items: [{ itemId: 'wolf_meat', quantity: 1 }], gold: 0, luckCheck: null },
      {
        items: [
          { itemId: 'wolf_meat', quantity: 2 },
          { itemId: 'black_fang', quantity: 1 },
        ],
        gold: 5,
        luckCheck: null,
      },
      {
        items: [],
        gold: 3,
        luckCheck: { roll: 15, modifier: 1, situational: 0, total: 16, dc: 12, outcome: 'success', success: true },
      },
    ]
    const summary = resolveEncounterLoot(grants)
    expect(summary.items).toEqual([
      { itemId: 'wolf_meat', quantity: 3 },
      { itemId: 'black_fang', quantity: 1 },
    ])
    expect(summary.gold).toBe(8)
    expect(summary.luckChecks).toHaveLength(1)
    expect(summary.luckChecks[0]!.total).toBe(16)
  })

  it('PC25 空 grants → 空汇总（胜利但无掉落的合法情形）', () => {
    const summary = resolveEncounterLoot([])
    expect(summary.items).toEqual([])
    expect(summary.gold).toBe(0)
    expect(summary.luckChecks).toEqual([])
  })
})

describe('Combat V3 公式原样复用（冻结）', () => {
  it('PC26 天然1大失败 / 天然20暴击 / 命中走护甲：由 combat.ts resolveAttack 提供', () => {
    expect(resolveAttack(1, 12, 10, 14, 10).outcome).toBe('critical_miss')
    expect(resolveAttack(1, 12, 10, 14, 10).damage).toBe(0)
    expect(resolveAttack(20, 12, 10, 14, 10).outcome).toBe('critical_hit')
    const hit = resolveAttack(10, 12, 10, 14, 10)
    expect(hit.outcome).toBe('hit')
    expect(hit.damage).toBeGreaterThanOrEqual(1)
    const glance = resolveAttack(3, 12, 14, 14, 10) // (12+3)/2=7.5 < 14 → 擦伤
    expect(glance.outcome).toBe('glancing_hit')
  })
})

describe('同源多实例展示名（生产 UI 不泄露内部 ID）', () => {
  it('PC27 index 0 无后缀、1→①、2→②、超 3 回退括号', () => {
    expect(instanceDisplaySuffix(0)).toBe('')
    expect(instanceDisplaySuffix(1)).toBe('①')
    expect(instanceDisplaySuffix(2)).toBe('②')
    expect(instanceDisplaySuffix(5)).toBe('(6)')
    expect(() => instanceDisplaySuffix(-1)).toThrow(RangeError)
  })
})
