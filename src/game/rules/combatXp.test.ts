import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { useGameStore } from '../state/gameStore'
import { getEnemyFirstKillXp, resolveEncounterVictoryXp } from './combatXp'
import { getEncounter } from '../content'
import type { GameState } from '../types/game'

function createMockStorage(): Storage {
  let store: Record<string, string> = {}
  return {
    get length() {
      return Object.keys(store).length
    },
    clear: () => {
      store = {}
    },
    getItem: (k: string) => store[k] ?? null,
    key: (i: number) => Object.keys(store)[i] ?? null,
    removeItem: (k: string) => {
      delete store[k]
    },
    setItem: (k: string, v: string) => {
      store[k] = String(v)
    },
  }
}

const gs = () => useGameStore.getState().gameState!

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockStorage())
  useGameStore.getState().newGame()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** 返回当前合法 GameState（新游戏） */
function baseState(): GameState {
  return useGameStore.getState().gameState!
}

describe('TM-P2-006：战斗阅历（Combat XP）规则（XP1-XP13）', () => {
  it('XP1. 无 adventureXpReward 的敌人（伪造 id / 未注册）→ 0 XP', () => {
    const s = baseState()
    expect(getEnemyFirstKillXp(s, 'ghost_enemy')).toBe(0)
  })

  it('XP2. 有 adventureXpReward 且首次击败 → 返回 reward', () => {
    // 《村外异动》in_progress 且村外草原 → corrupted_rabbit 首次击败 = 10
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: [
            ...state.gameState.quests,
            { questId: 'quest_village_monsters', status: 'in_progress', stage: 0, flags: {} },
          ],
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'corrupted_rabbit')).toBe(10)
  })

  it('XP3. 重复遭遇（任务已推进/已击败）→ 0 XP', () => {
    // 《村外异动》已 completed → corrupted_rabbit 重复击败 = 0
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: [
            ...state.gameState.quests,
            { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
          ],
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'corrupted_rabbit')).toBe(0)
  })

  it('XP4. 任务未开始（available）时不发放 → 0（正式击败以任务推进为准）', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: [
            ...state.gameState.quests,
            { questId: 'quest_village_monsters', status: 'available', stage: 0, flags: {} },
          ],
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'corrupted_rabbit')).toBe(0)
  })

  it('XP5. corrupted_rat：矿洞余患（quest_mine_cleanup 已完成）属重复遭遇 → 0 XP', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: [
            ...state.gameState.quests,
            { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
            { questId: 'quest_blacksmith_mine_remnant', status: 'in_progress', stage: 0, flags: {} },
          ],
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'corrupted_rat')).toBe(0)
  })

  it('XP6. corrupted_rat：主线《矿洞清理》in_progress → 首次 = 10', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: [
            ...state.gameState.quests,
            { questId: 'quest_mine_cleanup', status: 'in_progress', stage: 0, flags: {} },
          ],
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'corrupted_rat')).toBe(10)
  })

  it('XP7. dudu_rabbit：背包无 rabbit_path（首次 Boss 清场）→ 30；已有 rabbit_path → 0', () => {
    const s = baseState()
    expect(getEnemyFirstKillXp(s, 'dudu_rabbit')).toBe(30)
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: { ...state.gameState, inventory: [{ itemId: 'rabbit_path', quantity: 1 }] },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'dudu_rabbit')).toBe(0)
  })

  it('XP8. corrupted_wolf：《草原狼影》in_progress → 15；已完成 → 0', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: [
            ...state.gameState.quests,
            { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} },
          ],
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'corrupted_wolf')).toBe(15)
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: state.gameState.quests.map((q) =>
            q.questId === 'quest_grassland_wolf' ? { ...q, status: 'completed' as const } : q,
          ),
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'corrupted_wolf')).toBe(0)
  })

  it('XP9. 黑石塔系列：flag 未击败 → reward；已击败 → 0（以 skeleton_soldier 为例）', () => {
    const s = baseState()
    expect(getEnemyFirstKillXp(s, 'skeleton_soldier')).toBe(20)
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          quests: [
            ...state.gameState.quests,
            {
              questId: 'quest_wangcai_trouble',
              status: 'in_progress',
              stage: 0,
              flags: { floor1_soldier_defeated: true },
            },
          ],
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'skeleton_soldier')).toBe(0)
  })

  it('XP10. 残灾之影：sakura_calamity_defeated 未置 → 35；已击败 → 0', () => {
    const s = baseState()
    expect(getEnemyFirstKillXp(s, 'sakura_calamity_fragment')).toBe(35)
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: { ...state.gameState.world, flags: { ...state.gameState.world.flags, sakura_calamity_defeated: true } },
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'sakura_calamity_fragment')).toBe(0)
  })

  it('XP11. wild_wolf：狼群未 defeated → 15；荒原狼群 defeated → 0（TM-P2-009 §13 修复 P2-008 缺口）', () => {
    const s = baseState()
    expect(getEnemyFirstKillXp(s, 'wild_wolf')).toBe(15)
    // 荒原狼群 defeated → wild_wolf 视为已击败（0 XP）
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: { ...state.gameState.world, flags: { ...state.gameState.world.flags, steppe_wolf_pack_defeated: true } },
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'wild_wolf')).toBe(0)
  })

  it('XP12. wild_wolf：驿站狼群非战斗绕开（仅 neutralized，无 combat）→ 仍 15（TM-P2-009-R1 §2.1 A7）', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: {
            ...state.gameState.world,
            flags: { ...state.gameState.world.flags, waystation_wolf_pack_neutralized: true },
          },
        },
      }
    })
    // MND/LCK/Sakura/Mount 成功写 neutralized 只表示威胁被绕开/安抚/引走 → 不消耗 first-kill
    expect(getEnemyFirstKillXp(gs(), 'wild_wolf')).toBe(15)
  })

  it('XP12b. wild_wolf：驿站狼群战斗击败（combat 标记）→ 0（TM-P2-009-R1 §2.1）', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: {
            ...state.gameState.world,
            flags: { ...state.gameState.world.flags, waystation_wolf_pack_combat: true },
          },
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'wild_wolf')).toBe(0)
  })

  it('XP13. wild_wolf：异常 flag（非 boolean）→ 0（防异常刷分）', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: { ...state.gameState.world, flags: { ...state.gameState.world.flags, steppe_wolf_pack_defeated: 'yes' } },
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'wild_wolf')).toBe(0)
  })
})

describe('TM-P2-009-R1 §11：Encounter Diversity 重复 XP（H5/H6）', () => {
  it('XP14. resolveEncounterVictoryXp：首次给 first-kill 总和；repeatable 重复给低额 repeat XP；非 repeatable 重复 0', () => {
    const fresh = baseState()
    // cave_bat 遭遇：无首次标记 → 首次 = 8
    const caveDef = getEncounter('encounter_cave_bat')!
    expect(caveDef.repeatable).toBe(true)
    expect(caveDef.repeatAdventureXpReward).toBe(4)
    expect(resolveEncounterVictoryXp(fresh, caveDef, [{ enemyId: 'cave_bat' }])).toBe(8)
    // 已写首次标记 → 重复胜利 = repeat XP 4（明显低于首次 8）
    const marked = {
      ...fresh,
      world: { ...fresh.world, flags: { ...fresh.world.flags, cave_bat_first_kill: true } },
    } as GameState
    expect(resolveEncounterVictoryXp(marked, caveDef, [{ enemyId: 'cave_bat' }])).toBe(4)
    // 非 repeatable 遭遇重复胜利 → 0（H6：一次性遭遇不可刷任务 XP）
    const rabbitDef = getEncounter('encounter_corrupted_rabbit')!
    expect(rabbitDef.repeatable).not.toBe(true)
    const rabbitDone = {
      ...fresh,
      quests: [
        ...fresh.quests,
        { questId: 'quest_village_monsters', status: 'completed' as const, stage: 0, flags: {} },
      ],
    } as GameState
    expect(resolveEncounterVictoryXp(rabbitDone, rabbitDef, [{ enemyId: 'corrupted_rabbit' }])).toBe(0)
    // repeatable 多敌混合首次：矿洞混杂（鼠 + 蝙蝠）→ 10 + 8 = 18
    const mixedDef = getEncounter('encounter_mine_mixed')!
    const mineState = {
      ...fresh,
      quests: [
        ...fresh.quests,
        { questId: 'quest_mine_cleanup', status: 'in_progress' as const, stage: 0, flags: {} },
      ],
    } as GameState
    expect(
      resolveEncounterVictoryXp(mineState, mixedDef, [
        { enemyId: 'corrupted_rat' },
        { enemyId: 'cave_bat' },
      ]),
    ).toBe(18)
    // 多敌混合重复：鼠已随主线推进（quest_mine_cleanup completed）+ 蝙蝠已首次击败 → 无 first-kill → repeat XP 5
    const mixedDone = {
      ...mineState,
      quests: mineState.quests.map((q) => (q.questId === 'quest_mine_cleanup' ? { ...q, status: 'completed' as const } : q)),
      world: { ...mineState.world, flags: { cave_bat_first_kill: true } },
    } as GameState
    expect(
      resolveEncounterVictoryXp(mixedDone, mixedDef, [
        { enemyId: 'corrupted_rat' },
        { enemyId: 'cave_bat' },
      ]),
    ).toBe(5)
  })

  it('XP15. cave_bat：首次（无 flag）→ 8；cave_bat_first_kill=true → 0', () => {
    const s = baseState()
    expect(getEnemyFirstKillXp(s, 'cave_bat')).toBe(8)
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: { ...state.gameState.world, flags: { ...state.gameState.world.flags, cave_bat_first_kill: true } },
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'cave_bat')).toBe(0)
  })

  it('XP16. wild_boar：首次 → 12；wild_boar_first_kill=true → 0', () => {
    const s = baseState()
    expect(getEnemyFirstKillXp(s, 'wild_boar')).toBe(12)
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: { ...state.gameState.world, flags: { ...state.gameState.world.flags, wild_boar_first_kill: true } },
        },
      }
    })
    expect(getEnemyFirstKillXp(gs(), 'wild_boar')).toBe(0)
  })

  it('XP17. 单敌 repeatable 实际结算：resolveCombatVictory(cave_bat) 首次 +8 并写 flag；重复 +4', () => {
    useGameStore.setState((state) => {
      if (!state.gameState) return {}
      return {
        gameState: {
          ...state.gameState,
          world: { ...state.gameState.world, currentLocationId: 'abandoned_mine' },
        },
      }
    })
    const before = gs().player.adventureXp
    expect(useGameStore.getState().resolveCombatVictory('cave_bat')).toBe(true)
    const afterFirst = gs()
    expect(afterFirst.player.adventureXp).toBe(before + 8)
    expect(afterFirst.world.flags.cave_bat_first_kill).toBe(true)
    // 重复击败 → 不再给 first-kill，只给低额 repeat XP
    expect(useGameStore.getState().resolveCombatVictory('cave_bat')).toBe(true)
    expect(gs().player.adventureXp).toBe(afterFirst.player.adventureXp + 4)
  })
})
