// @vitest-environment happy-dom
/**
 * CombatPage 3v3 渲染测试（TM-P2-007 §10–17 的 UI 侧断言）。
 * 交互逻辑（敌人 AI、目标选择、回合推进、结算）由 rules/partyCombat.test.ts 纯规则覆盖；
 * 本文件用真实 DOM 渲染（createRoot + React.act，避免 zustand SSR getServerSnapshot 限制）验证：
 *  - 单敌 / 多敌单位卡齐全、玩家先手时行动栏出现、伙伴卡满血与技能展示、
 *  - 多实例敌方展示名（骷髅战士①）、防御性异常出口。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CombatPage, { combatLootItemKey } from './CombatPage'
import { createInitialGameState } from '../game/content/initial'
import { useGameStore } from '../game/state/gameStore'
import { SAKURA_COMPANION_ID } from '../game/content'
import { COMPANIONS } from '../game/content/companions'
import type { CompanionDefinition } from '../game/types/companion'
import type { GameState } from '../game/types/game'

const NOOP = () => undefined

let root: Root | null = null

/** 挂载 CombatPage 到 document.body 并同步 flush 初始渲染（客户端路径读 store getState） */
function mountCombat(encounterId: string): void {
  if (root) {
    act(() => root?.unmount())
    root = null
  }
  document.body.innerHTML = ''
  root = createRoot(document.body)
  act(() => {
    root?.render(
      createElement(CombatPage, {
        encounterId,
        onVictory: NOOP,
        onDefeat: NOOP,
        onEscape: NOOP,
        onExitToMenu: NOOP,
      }),
    )
  })
}

function bodyText(): string {
  return document.body.textContent ?? ''
}

function enemyUnitCount(): number {
  return document.querySelectorAll('[data-testid="combat-enemy-unit"]').length
}

/** 把初始 GameState 注入已招募的樱花优子（3v3 伙伴侧；伙伴 HP 不持久化，战斗内派生满血） */
function withRecruitedSakura(state: GameState): GameState {
  const next: GameState = {
    ...state,
    companions: { ...state.companions },
    party: { ...state.party },
  }
  next.companions[SAKURA_COMPANION_ID] = {
    companionId: SAKURA_COMPANION_ID,
    status: 'recruited',
    level: 3,
    mp: 6,
    maxMp: 6,
    learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'],
    flags: {},
  }
  next.party.activeCompanionIds = [SAKURA_COMPANION_ID]
  return next
}

describe('CombatPage victory loot React identity', () => {
  it('creates stable unique keys for guaranteed and luck duplicate drops', () => {
    const keys = [combatLootItemKey('black_fang', 0), combatLootItemKey('black_fang', 1)]
    expect(keys).toEqual(['black_fang-0', 'black_fang-1'])
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('CombatPage 单敌遭遇渲染', () => {
  beforeEach(() => useGameStore.setState({ gameState: null }))
  afterEach(() => {
    vi.restoreAllMocks()
    if (root) {
      act(() => root?.unmount())
      root = null
    }
    useGameStore.setState({ gameState: null })
  })

  it('玩家先手：玩家卡 + 敌方卡 + 先手行动栏（攻击/技能/物品/逃跑按钮）', () => {
    useGameStore.setState({ gameState: createInitialGameState() })
    // 玩家 D20=20（ini 30）> 魔化兔 D20=1（ini 11）→ 玩家先手
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValue(0)
    mountCombat('encounter_corrupted_rabbit')

    expect(document.querySelector('[data-testid="combat-player-panel"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="combat-enemy-panel"]')).not.toBeNull()
    expect(enemyUnitCount()).toBe(1)
    // 玩家卡：名称 / 职业 / 初始满血 22
    expect(bodyText()).toContain('石头城')
    expect(bodyText()).toContain('骑士')
    expect(bodyText()).toContain('22 / 22')
    // 敌方卡
    expect(bodyText()).toContain('魔化兔')
    // 先手行动栏（§10）
    expect(bodyText()).toContain('的回合')
    expect(bodyText()).toContain('普通攻击')
    expect(bodyText()).toContain('技能')
    expect(bodyText()).toContain('物品')
    expect(bodyText()).toContain('尝试逃跑')
    // 无伙伴
    expect(document.querySelector('[data-testid="combat-companion-panel"]')).toBeNull()
  })

  it('带樱花优子：伙伴卡渲染（con 派生满血 22 + 当前/封印技能）', () => {
    useGameStore.setState({ gameState: withRecruitedSakura(createInitialGameState()) })
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.99).mockReturnValue(0)
    mountCombat('encounter_corrupted_rabbit')

    expect(document.querySelector('[data-testid="combat-player-panel"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="combat-companion-panel"]')).not.toBeNull()
    expect(bodyText()).toContain('樱花优子')
    expect(bodyText()).toContain('神契宠物')
    // 伙伴满血（con=12 → getStartingMaxHp=22；战斗内不持久化 HP）
    expect(bodyText()).toContain('22 / 22')
    expect(bodyText()).toContain('当前技能')
    expect(bodyText()).toContain('封印技能')
  })

  it('无 gameState → 防御性异常出口返回主菜单', () => {
    mountCombat('encounter_corrupted_rabbit')
    expect(bodyText()).toContain('当前没有进行中的游戏')
    expect(bodyText()).toContain('返回主菜单')
  })

  it('未知 encounterId → 防御性异常出口', () => {
    useGameStore.setState({ gameState: createInitialGameState() })
    mountCombat('encounter_not_exists')
    expect(bodyText()).toContain('遭遇数据异常，无法进入战斗')
    expect(bodyText()).toContain('返回主菜单')
  })
})

describe('CombatPage 多敌遭遇渲染（3v3）', () => {
  beforeEach(() => useGameStore.setState({ gameState: null }))
  afterEach(() => {
    vi.restoreAllMocks()
    if (root) {
      act(() => root?.unmount())
      root = null
    }
    useGameStore.setState({ gameState: null })
  })

  it('巡逻队 variant_a（2 骷髅战士）：两个实例 + 展示名后缀 ①', () => {
    const state = createInitialGameState()
    // §7.3「首次生成后写死」：直接预置已固化 variant，渲染侧只读
    state.world.encounterVariants['encounter_broken_patrol'] = 'broken_patrol_a'
    useGameStore.setState({ gameState: state })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    mountCombat('encounter_broken_patrol')
    expect(enemyUnitCount()).toBe(2)
    // 生产 UI 不泄露 instanceId：同源多实例用 ① 后缀
    expect(bodyText()).toContain('骷髅战士')
    expect(bodyText()).toContain('骷髅战士①')
  })

  it('无已固化 variant 的多敌遭遇 → 防御性异常出口（未 roll 不硬编码阵容）', () => {
    useGameStore.setState({ gameState: createInitialGameState() })
    mountCombat('encounter_broken_patrol')
    expect(bodyText()).toContain('遭遇数据异常，无法进入战斗')
  })
})

// ---- TM-P2-007-R1 BLOCKER A：3v3 双伙伴集成（test-only companion，不进生产注册表）----
const TEST_FOX_ID = 'test_fox'
const TEST_FOX_DEF: CompanionDefinition = {
  id: TEST_FOX_ID,
  name: '测试狐',
  title: '测试伙伴甲',
  classification: 'divine_contract_pet',
  summary: 'R1 UI 集成测试用临时伙伴（测试后从注册表移除，绝不进生产剧情/注册表）。',
  attributes: { str: 10, con: 14, agi: 12, mnd: 10, lck: 10 },
  maxMp: 6,
  skillIds: ['sakura_petalslash', 'sakura_magic_shield'],
  tags: ['test'],
}

/** 注入已招募的樱花优子 + 测试狐（双伙伴；两者都会 once-per-combat 的魔法盾） */
function withTwoCompanions(state: GameState): GameState {
  const next: GameState = { ...state, companions: { ...state.companions }, party: { ...state.party } }
  next.companions[SAKURA_COMPANION_ID] = {
    companionId: SAKURA_COMPANION_ID,
    status: 'recruited',
    level: 3,
    mp: 6,
    maxMp: 6,
    learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'],
    flags: {},
  }
  next.companions[TEST_FOX_ID] = {
    companionId: TEST_FOX_ID,
    status: 'recruited',
    level: 3,
    mp: 6,
    maxMp: 6,
    learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield'],
    flags: {},
  }
  next.party.activeCompanionIds = [SAKURA_COMPANION_ID, TEST_FOX_ID]
  return next
}

/** 点击文本包含指定文案的按钮（act 包裹；找不到则抛错） */
function clickButtonByText(text: string): void {
  const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(text))
  if (!el) throw new Error(`找不到按钮：${text}`)
  act(() => {
    ;(el as HTMLButtonElement).click()
  })
}

describe('CombatPage 双伙伴 3v3 集成（BLOCKER A）', () => {
  beforeEach(() => {
    useGameStore.setState({ gameState: null })
    // test-only registry mutation：渲染侧 getCompanion 能解析测试狐；afterEach 移除
    ;(COMPANIONS as Record<string, CompanionDefinition>)[TEST_FOX_ID] = TEST_FOX_DEF
  })
  afterEach(() => {
    delete (COMPANIONS as Record<string, CompanionDefinition>)[TEST_FOX_ID]
    vi.restoreAllMocks()
    if (root) {
      act(() => root?.unmount())
      root = null
    }
    useGameStore.setState({ gameState: null })
  })

  it('R1-U1 双伙伴渲染：2 张伙伴卡 + 玩家卡 + 单敌；各伙伴显示自己的技能', () => {
    useGameStore.setState({ gameState: withTwoCompanions(createInitialGameState()) })
    // 先手掷骰：player→0(D20=1)、sakura→0.99(D20=20)、test_fox→0、rabbit→0 → Sakura 先手
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0)
    mountCombat('encounter_corrupted_rabbit')

    expect(bodyText()).toContain('樱花优子的回合')
    expect(document.querySelectorAll('[data-testid="combat-player-panel"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-testid="combat-companion-panel"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-testid="combat-enemy-unit"]')).toHaveLength(1)
    // 测试狐来自 test-only registry mutation（生产注册表只应有 sakura_yuko）
    expect(bodyText()).toContain('测试狐')
    expect(bodyText()).toContain('当前技能')
  })

  it('R1-U2 once-per-combat 按伙伴隔离：Sakura 用盾后 test_fox 的盾仍可用且能施放', () => {
    useGameStore.setState({ gameState: withTwoCompanions(createInitialGameState()) })
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValue(0)
    mountCombat('encounter_corrupted_rabbit')

    // Sakura 先手（ini 36）：技能 → 樱花魔法盾 → 目标（玩家「石头城」）
    clickButtonByText('技能')
    clickButtonByText('樱花魔法盾（2 灵力）')
    clickButtonByText('石头城')
    expect(bodyText()).toContain('樱花优子为石头城施展了樱花魔法盾')

    // 下一回合是 test_fox（agi12 ini13 > player agi10 ini11）→ 手动操作伙伴
    expect(bodyText()).toContain('测试狐的回合')
    clickButtonByText('技能')
    // 它的魔法盾不应因 Sakura 已用而被误标 once（BLOCKER A 串号 bug 的回归断言）
    const shieldBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('樱花魔法盾'))
    expect(shieldBtn).toBeDefined()
    expect((shieldBtn as HTMLButtonElement).disabled).toBe(false)
    // 测试狐实际施放盾 → 若共享 Set，这里会被 isOnceUsed 拦截、无事件
    clickButtonByText('樱花魔法盾（2 灵力）')
    clickButtonByText('石头城')
    expect(bodyText()).toContain('测试狐为石头城施展了樱花魔法盾')
  })

  it('R1-U3 真实残破巡逻队（3v2）+ 双伙伴 → 玩家+2 伙伴+2 敌人 5 卡，卡片可压缩（min-w 200）', () => {
    const state = withTwoCompanions(createInitialGameState())
    state.world.encounterVariants['encounter_broken_patrol'] = 'broken_patrol_a'
    useGameStore.setState({ gameState: state })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mountCombat('encounter_broken_patrol')

    expect(document.querySelectorAll('[data-testid="combat-player-panel"]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-testid="combat-companion-panel"]')).toHaveLength(2)
    expect(enemyUnitCount()).toBe(2)
    expect(bodyText()).toContain('骷髅战士①')
    // 3v3 布局：卡片最小宽度压缩到 200px（1280 两栏各 ~620px 单排 3 卡不溢出）
    const playerCard = document.querySelector('[data-testid="combat-player-panel"]') as HTMLElement
    expect(playerCard.className).toContain('min-w-[200px]')
  })
})
