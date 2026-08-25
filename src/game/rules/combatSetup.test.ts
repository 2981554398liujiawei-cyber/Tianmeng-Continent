/**
 * Party Combat 遭遇构建泛化测试（TM-P2-007-R1 BLOCKER A）。
 *
 * 覆盖（§2.7 3v3 必测中属于构建层的部分）：
 *  - player + 最多 2 名 active companion（DI 注入 fixture 伙伴，不进生产注册表）
 *  - 真实残破巡逻队（weighted 固化后）2 敌 / 自定义 3 敌 def → 3v3 满编
 *  - initiative 队列数量 = 我方+敌方单位数（无 mount/外挂注入）
 *  - instanceId 唯一、companion 满血按 con 派生、MP 取状态
 *  - status 过滤（met 不参与）、未注册过滤、active 截断（前 MAX_PARTY_COMPANIONS 名）
 */
import { describe, expect, it } from 'vitest'
import { createInitialGameState } from '../content/initial'
import { getEnemy } from '../content'
import { getStartingMaxHp } from './character'
import { buildCombatSetup, MAX_PARTY_COMPANIONS, type CompanionCombatInfo } from './combatSetup'
import { getEncounter } from '../content'
import type { CompanionDefinition, CompanionState } from '../types/companion'
import type { EncounterDefinition } from '../types/encounter'
import type { GameState } from '../types/game'

// ---- test-only fixture 伙伴（DI 注入；绝不写入生产 COMPANIONS 注册表）----
const FIXTURE_DEFS: Record<string, CompanionDefinition> = {
  test_fox: {
    id: 'test_fox',
    name: '测试狐',
    title: '测试伙伴甲',
    classification: 'divine_contract_pet',
    summary: 'R1 构建层测试用临时伙伴。',
    attributes: { str: 10, con: 14, agi: 12, mnd: 10, lck: 10 },
    maxMp: 6,
    skillIds: ['sakura_petalslash', 'sakura_magic_shield'],
    tags: ['test'],
  },
  test_crane: {
    id: 'test_crane',
    name: '测试鹤',
    title: '测试伙伴乙',
    classification: 'divine_contract_pet',
    summary: 'R1 构建层测试用临时伙伴。',
    attributes: { str: 8, con: 12, agi: 16, mnd: 14, lck: 10 },
    maxMp: 8,
    skillIds: ['sakura_light_dance', 'sakura_petalslash'],
    tags: ['test'],
  },
  test_monk: {
    id: 'test_monk',
    name: '测试僧',
    title: '测试伙伴丙',
    classification: 'divine_contract_pet',
    summary: 'R1 构建层测试用临时伙伴。',
    attributes: { str: 12, con: 13, agi: 11, mnd: 12, lck: 10 },
    maxMp: 7,
    skillIds: ['sakura_petalslash'],
    tags: ['test'],
  },
}

function fixtureState(id: string, status: CompanionState['status'], level: number, mp: number, skillIds: string[]): CompanionState {
  return { companionId: id, status, level, mp, maxMp: mp, learnedSkillIds: skillIds, flags: {} }
}

const FIXTURE_STATES: Record<string, CompanionState> = {
  test_fox: fixtureState('test_fox', 'recruited', 3, 6, ['sakura_petalslash', 'sakura_magic_shield']),
  test_crane: fixtureState('test_crane', 'guest', 4, 8, ['sakura_light_dance', 'sakura_petalslash']),
  test_monk: fixtureState('test_monk', 'recruited', 2, 7, ['sakura_petalslash']),
}

const resolveFixture = (id: string) => FIXTURE_STATES[id]
const defFixture = (id: string) => FIXTURE_DEFS[id]

/** 构造带指定 activeCompanionIds 的 GameState（其余取初始状态） */
function stateWithParty(activeIds: string[]): GameState {
  const state = createInitialGameState()
  state.party = { ...state.party, activeCompanionIds: [...activeIds] }
  return state
}

/** 固定 rng 序列（每单位 1 次先手骰） */
function seqRng(...values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length] ?? 0
}

/** 3 敌自定义 def（构建层验证 3v3 满编；生产 registry 无 3 敌遭遇） */
const THREE_ENEMY_DEF: EncounterDefinition = {
  id: 'test_three_enemy',
  name: '测试三敌',
  locationId: 'village_outskirts',
  fixedMembers: [
    { enemyId: 'corrupted_rabbit', count: 1 },
    { enemyId: 'corrupted_rat', count: 1 },
    { enemyId: 'corrupted_wolf', count: 1 },
  ],
  canEscape: true,
}

const FOUR_ENEMY_DEF: EncounterDefinition = {
  id: 'test_four_enemy', name: '测试四敌', locationId: 'village_outskirts',
  fixedMembers: [{ enemyId: 'corrupted_rabbit', count: 4 }], canEscape: true,
}

describe('buildCombatSetup（BLOCKER A：player + 最多 2 名 active companion）', () => {
  it('R1-1 player + 2 fixture 伙伴 → friendly 3、companions 2、sourceId/名称正确', () => {
    const setup = buildCombatSetup(stateWithParty(['test_fox', 'test_crane']), getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99),
    })
    expect(setup.friendly).toHaveLength(3)
    expect(setup.companions).toHaveLength(2)
    const sources = setup.friendly.map((c) => c.sourceType)
    expect(sources).toEqual(['player', 'companion', 'companion'])
    expect(setup.friendly[1]!.sourceId).toBe('test_fox')
    expect(setup.friendly[1]!.name).toBe('测试狐')
    expect(setup.friendly[2]!.sourceId).toBe('test_crane')
    expect(setup.friendly[2]!.name).toBe('测试鹤')
    expect(setup.companions.map((c) => c.companionId)).toEqual(['test_fox', 'test_crane'])
  })

  it('R1-2 instanceId 唯一（player / companion-<id>）且 friendly 无重复 combatant', () => {
    const setup = buildCombatSetup(stateWithParty(['test_fox', 'test_crane']), getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99),
    })
    const ids = setup.combatants.map((c) => c.instanceId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('player')
    expect(ids).toContain('companion-test_fox')
    expect(ids).toContain('companion-test_crane')
  })

  it('R1-3 companion 满血按 con 派生（getStartingMaxHp）、MP 取状态值', () => {
    const setup = buildCombatSetup(stateWithParty(['test_fox', 'test_crane']), getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99),
    })
    const fox = setup.friendly.find((c) => c.sourceId === 'test_fox')!
    expect(fox.currentHp).toBe(getStartingMaxHp(14)) // 24
    expect(fox.maxHp).toBe(getStartingMaxHp(14))
    expect(fox.currentMp).toBe(6)
    expect(fox.maxMp).toBe(6)
    const crane = setup.friendly.find((c) => c.sourceId === 'test_crane')!
    expect(crane.currentHp).toBe(getStartingMaxHp(12)) // 22
    expect(crane.maxMp).toBe(8)
  })

  it('R1-4 met 状态不参与战斗（只有 guest/recruited 进入）', () => {
    const setup = buildCombatSetup(stateWithParty(['test_fox']), getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: () => fixtureState('test_fox', 'met', 3, 6, []),
      getCompanionDef: defFixture,
      rng: seqRng(0.99),
    })
    expect(setup.friendly).toHaveLength(1)
    expect(setup.companions).toHaveLength(0)
  })

  it('R1-5 未注册伙伴被安全跳过（getCompanionDef 返回 undefined），其余仍加入', () => {
    const state = stateWithParty(['test_fox', 'unknown_one'])
    const setup = buildCombatSetup(state, getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: (id) => (id === 'unknown_one' ? fixtureState('unknown_one', 'recruited', 1, 2, []) : resolveFixture(id)),
      getCompanionDef: (id) => (id === 'unknown_one' ? undefined : defFixture(id)),
      rng: seqRng(0.99, 0.99),
    })
    expect(setup.friendly).toHaveLength(2)
    expect(setup.companions.map((c) => c.companionId)).toEqual(['test_fox'])
  })

  it('R1-6 active 超 3 名只取前 MAX_PARTY_COMPANIONS（3 名）', () => {
    const state = stateWithParty(['test_fox', 'test_crane', 'test_monk', 'sakura_yuko'])
    const setup = buildCombatSetup(state, getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: (id) => resolveFixture(id) ?? (id === 'sakura_yuko' ? fixtureState('sakura_yuko', 'recruited', 5, 6, []) : undefined),
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99),
    })
    expect(MAX_PARTY_COMPANIONS).toBe(3)
    expect(setup.companions).toHaveLength(MAX_PARTY_COMPANIONS)
    expect(setup.companions.map((c) => c.companionId)).toEqual(['test_fox', 'test_crane', 'test_monk'])
    expect(setup.friendly).toHaveLength(4)
  })

  it('R1-7 真实残破巡逻队（weighted 固化 variant）→ 2 敌、combatants 5、turns 5', () => {
    const state = stateWithParty(['test_fox', 'test_crane'])
    state.world = { ...state.world, encounterVariants: { encounter_broken_patrol: 'broken_patrol_a' } }
    const setup = buildCombatSetup(state, getEncounter('encounter_broken_patrol')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99, 0.99, 0.99),
    })
    expect(setup.enemies).toHaveLength(2) // 骷髅战士 ×2
    expect(setup.enemies.every((c) => c.sourceId === 'skeleton_warrior')).toBe(true)
    expect(setup.combatants).toHaveLength(5)
    expect(setup.turns).toHaveLength(5)
  })

  it('R1-8 自定义 3 敌 def → 3v3 满编（friendly 3 / enemy 3 / initiative 6）', () => {
    const setup = buildCombatSetup(stateWithParty(['test_fox', 'test_crane']), THREE_ENEMY_DEF, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99, 0.99, 0.99, 0.99),
    })
    expect(setup.friendly).toHaveLength(3)
    expect(setup.enemies).toHaveLength(3)
    expect(setup.combatants).toHaveLength(6)
    expect(setup.turns).toHaveLength(6)
  })

  it('R1-5b 失效 active 槽位不占 4v4 名额，后续三个有效伙伴依次补位', () => {
    const state = stateWithParty(['stale-id', 'test_fox', 'test_crane', 'test_monk'])
    const setup = buildCombatSetup(state, getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99, 0.99),
    })
    expect(setup.companions.map((c) => c.companionId)).toEqual(['test_fox', 'test_crane', 'test_monk'])
    expect(setup.friendly).toHaveLength(4)
  })

  it('R1-8b 自定义 4 敌 + 3 伙伴 → 4v4 满编（initiative 8）', () => {
    const setup = buildCombatSetup(stateWithParty(['test_fox', 'test_crane', 'test_monk']), FOUR_ENEMY_DEF, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99),
    })
    expect(setup.friendly).toHaveLength(4)
    expect(setup.enemies).toHaveLength(4)
    expect(setup.combatants).toHaveLength(8)
    expect(setup.turns).toHaveLength(8)
  })

  it('R1-9 先手队列严格等于我方+敌方单位（mount 等非单位不注入）', () => {
    const state = stateWithParty(['test_fox', 'test_crane'])
    const setup = buildCombatSetup(state, THREE_ENEMY_DEF, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.5, 0.5, 0.5, 0.5, 0.5, 0.5),
    })
    expect(setup.turns).toHaveLength(setup.combatants.length)
    expect(new Set(setup.turns.map((t) => t.combatant.instanceId))).toEqual(
      new Set(setup.combatants.map((c) => c.instanceId)),
    )
  })

  it('R1-10 无 active 伙伴 → friendly 只有 player（回归基线）', () => {
    const setup = buildCombatSetup(stateWithParty([]), getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99),
    })
    expect(setup.friendly).toHaveLength(1)
    expect(setup.companions).toHaveLength(0)
    expect(setup.friendly[0]!.sourceType).toBe('player')
  })

  it('R1-11 companion 技能来自状态 learnedSkillIds（getUsableSkills 语义），attrs 来自定义', () => {
    const setup = buildCombatSetup(stateWithParty(['test_fox']), getEncounter('encounter_corrupted_rabbit')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99),
    })
    const info: CompanionCombatInfo = setup.companions[0]!
    expect(info.companionId).toBe('test_fox')
    expect(info.level).toBe(3)
    expect(info.skills.map((s) => s.id)).toEqual(['sakura_petalslash', 'sakura_magic_shield'])
    expect(info.attrs.con).toBe(14)
  })

  it('R1-12 敌人战斗属性取 EnemyDefinition 基线（attack/armor/agility 非零）', () => {
    const state = stateWithParty([])
    state.world = { ...state.world, encounterVariants: { encounter_broken_patrol: 'broken_patrol_b' } }
    const setup = buildCombatSetup(state, getEncounter('encounter_broken_patrol')!, {
      resolveCompanion: resolveFixture,
      getCompanionDef: defFixture,
      rng: seqRng(0.99, 0.99),
    })
    for (const enemy of setup.enemies) {
      expect(getEnemy(enemy.sourceId)).toBeDefined()
      expect(enemy.attack).toBeGreaterThan(0)
      expect(enemy.armor).toBeGreaterThan(0)
      expect(enemy.agility).toBeGreaterThan(0)
    }
  })
})
