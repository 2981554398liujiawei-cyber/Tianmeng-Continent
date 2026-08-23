import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { useGameStore } from '../state/gameStore'
import { getEnemyFirstKillXp } from './combatXp'
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
