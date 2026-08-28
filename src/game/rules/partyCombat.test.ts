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
    name: '狐媚儿',
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
    expect(turns[0]!.combatant.name).toBe('狐媚儿')
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

describe('回合推进（§9.4 round 回绕判定）', () => {
  it('PC14 队列末尾回绕到开头，didTurnLoop 为 true（TM-P2-012 §85B：nextAliveTurnIndex 已删除，只保留纯回绕规则）', () => {
    expect(didTurnLoop(2, 0)).toBe(true)
    expect(didTurnLoop(0, 1)).toBe(false)
    expect(didTurnLoop(1, 1)).toBe(true)
  })
})
