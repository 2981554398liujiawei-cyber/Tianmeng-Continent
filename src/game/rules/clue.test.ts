import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore } from '../state/gameStore'
import { createInitialGameState } from '../content/initial'
import { CLUES } from '../content/clues'
import { getDiscoveredClueIds, hasClue } from './clue'

/** TM-P2-008 §47-48：Clue Journal V1 单元测试（CL1-8） */
function createMockStorage(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => {
      store.delete(key)
    },
    setItem: (key, value) => {
      store.set(key, String(value))
    },
  } as Storage
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMockStorage())
  useGameStore.setState({ gameState: createInitialGameState(), hasSave: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CL1 线索注册表定义有效', () => {
  it('每条定义 id===key、title/description 非空', () => {
    for (const [key, def] of Object.entries(CLUES)) {
      expect(def.id).toBe(key)
      expect(def.title.length).toBeGreaterThan(0)
      expect(def.description.length).toBeGreaterThan(0)
    }
  })

  it('《兔子的路径》线索关联黄金兔任务且分类为 map（§8）', () => {
    const rabbitPath = CLUES.clue_rabbit_path!
    expect(rabbitPath.category).toBe('map')
    expect(rabbitPath.relatedQuestIds).toContain('quest_golden_rabbit_search')
  })
})

describe('CL2 addClue 未注册 id 拒绝', () => {
  it('返回 { ok:false } 且 GameState 完全不变', () => {
    const before = useGameStore.getState().gameState
    const res = useGameStore.getState().addClue('clue_nonexistent')
    expect(res).toEqual({ ok: false, added: false, alreadyKnown: false })
    expect(useGameStore.getState().gameState).toBe(before)
  })
})

describe('CL3 addClue 首次获得', () => {
  it('写 world.flags.clue_<id>=true + 返回 added:true + 出现在已发现列表', () => {
    const res = useGameStore.getState().addClue('clue_north_drag_trail')
    expect(res.ok).toBe(true)
    expect(res.added).toBe(true)
    expect(res.alreadyKnown).toBe(false)
    expect(res.clue?.id).toBe('clue_north_drag_trail')
    const state = useGameStore.getState().gameState!
    expect(state.world.flags.clue_north_drag_trail).toBe(true)
    expect(getDiscoveredClueIds(state)).toContain('clue_north_drag_trail')
  })
})

describe('CL4 addClue 幂等（§39）', () => {
  it('重复获取 added:false + alreadyKnown:true + 不重复插入 + GameState 同一引用', () => {
    useGameStore.getState().addClue('clue_north_drag_trail')
    const before = useGameStore.getState().gameState
    const res = useGameStore.getState().addClue('clue_north_drag_trail')
    expect(res).toEqual({ ok: true, added: false, alreadyKnown: true })
    expect(useGameStore.getState().gameState).toBe(before)
  })
})

describe('CL5 getDiscoveredClueIds 只返回已发现', () => {
  it('flag 非严格 true 不出现；已发现按注册表顺序', () => {
    const state = createInitialGameState()
    state.world.flags.clue_rabbit_path = true
    expect(getDiscoveredClueIds(state)).toEqual(['clue_rabbit_path'])
    state.world.flags.clue_north_drag_trail = true
    expect(getDiscoveredClueIds(state)).toEqual(['clue_rabbit_path', 'clue_north_drag_trail'])
  })
})

describe('CL6 hasClue 语义', () => {
  it('未注册 / 未设置 / 非严格 true 均视为未发现', () => {
    const state = createInitialGameState()
    expect(hasClue(state, 'clue_rabbit_path')).toBe(false)
    expect(hasClue(state, 'clue_nonexistent')).toBe(false)
    state.world.flags.clue_rabbit_path = 'true'
    expect(hasClue(state, 'clue_rabbit_path')).toBe(false)
    state.world.flags.clue_rabbit_path = true
    expect(hasClue(state, 'clue_rabbit_path')).toBe(true)
  })
})

describe('CL7 《兔子的路径》→ 线索迁移（§8）', () => {
  it('inspectRabbitPath 首次查看时同时记录线索，且不改变 Golden Rabbit 剧情状态', () => {
    const state = useGameStore.getState().gameState!
    state.inventory = [{ itemId: 'rabbit_path', quantity: 1 }]
    expect(useGameStore.getState().inspectRabbitPath()).toBe(true)
    const s = useGameStore.getState().gameState!
    expect(s.world.flags.rabbit_path_examined).toBe(true)
    expect(s.world.flags.clue_rabbit_path).toBe(true)
    expect(getDiscoveredClueIds(s)).toContain('clue_rabbit_path')
    // Golden Rabbit HARD FREEZE：本迁移不触碰 quest_golden_rabbit_search 状态
    const golden = s.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
    expect(golden).toBeUndefined()
  })
})

describe('CL8 load/save 后线索保留（§37）', () => {
  it('addClue → saveGame → loadSlot 后 hasClue 仍 true（world.flags 已持久化）', () => {
    useGameStore.getState().addClue('clue_north_patrol_emblem')
    useGameStore.getState().saveGame('slot1')
    useGameStore.setState({ gameState: null, hasSave: false })
    expect(useGameStore.getState().loadSlot('slot1')).toBe(true)
    const s = useGameStore.getState().gameState!
    expect(hasClue(s, 'clue_north_patrol_emblem')).toBe(true)
  })
})
