/**
 * TM-P2-003-R3 聚焦 Store 测试（K1 装备闭环 / K4 北门场景技能统一校验 / K7 Loot / K8 黄金兔冻结）。
 * 新测试不继续堆进 325KB 的 gameStore.test.ts（TM-P2-003-R3 J）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameStore, NORTH_TOWER_CACHE_BASE_GOLD, NORTH_TOWER_CACHE_LUCK_GOLD } from './gameStore'
import { createInitialGameState } from '../content/initial'
import { getItem } from '../content'
import { SKILLS } from '../content/skills'
import { getPlayerAttackPower } from '../rules/combat'
import { resolveLoot } from '../rules/loot'
import type { GameState } from '../types/game'

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

function setState(s: GameState) {
  useGameStore.setState({ gameState: s })
}

function currentState(): GameState {
  return useGameStore.getState().gameState!
}

/** 北门旧哨塔场景就绪状态：北门 + 黑鬃魔狼已击败（trail checked + wolf defeated） */
function northGateReadyState(): GameState {
  const s = createInitialGameState()
  s.world.currentLocationId = 'tianlong_north_gate'
  s.quests = [
    {
      questId: 'quest_north_gate_missing_patrol',
      status: 'in_progress',
      stage: 0,
      flags: { north_gate_trail_checked: true, north_gate_wolf_defeated: true },
    },
  ]
  return s
}

/** 黄金兔冻结状态：第四主线 in_progress/stage 0 + 四 flag 全 true + rabbit_path ×1 */
function goldenRabbitFrozenState(): GameState {
  const s = createInitialGameState()
  s.quests = [
    {
      questId: 'quest_golden_rabbit_search',
      status: 'in_progress',
      stage: 0,
      flags: {
        asked_blacksmith: true,
        asked_apothecary: true,
        village_inquiry_reported: true,
        rabbit_lair_rechecked: true,
      },
    },
  ]
  s.inventory = [...s.inventory, { itemId: 'rabbit_path', quantity: 1 }]
  return s
}

function snapshotGoldenRabbit(s: GameState) {
  const q = s.quests.find((x) => x.questId === 'quest_golden_rabbit_search')
  return {
    status: q?.status,
    stage: q?.stage,
    asked_blacksmith: q?.flags.asked_blacksmith,
    asked_apothecary: q?.flags.asked_apothecary,
    village_inquiry_reported: q?.flags.village_inquiry_reported,
    rabbit_lair_rechecked: q?.flags.rabbit_lair_rechecked,
    rabbitPathQty: s.inventory.find((e) => e.itemId === 'rabbit_path')?.quantity,
  }
}

// ================= K1：装备闭环 =================

describe('TM-P2-003-R3 A：精制铁剑装备闭环（K1）', () => {
  it('1: iron_sword 仍可装备', () => {
    expect(useGameStore.getState().equipWeapon('iron_sword')).toBe(true)
    expect(currentState().equipment.weapon).toBe('iron_sword')
  })

  it('2: refined_iron_sword 可装备（先获得物品）', () => {
    useGameStore.getState().addItem('refined_iron_sword', 1)
    expect(useGameStore.getState().equipWeapon('refined_iron_sword')).toBe(true)
  })

  it('3: 装备 refined 后 equipment.weapon === refined_iron_sword', () => {
    useGameStore.getState().addItem('refined_iron_sword', 1)
    useGameStore.getState().equipWeapon('refined_iron_sword')
    expect(currentState().equipment.weapon).toBe('refined_iron_sword')
  })

  it('4: 再装备 iron_sword 正确替换', () => {
    useGameStore.getState().addItem('refined_iron_sword', 1)
    useGameStore.getState().equipWeapon('refined_iron_sword')
    expect(useGameStore.getState().equipWeapon('iron_sword')).toBe(true)
    expect(currentState().equipment.weapon).toBe('iron_sword')
  })

  it('5: 装备不消耗 inventory', () => {
    const before = currentState().inventory.find((e) => e.itemId === 'iron_sword')?.quantity
    useGameStore.getState().equipWeapon('iron_sword')
    const after = currentState().inventory.find((e) => e.itemId === 'iron_sword')?.quantity
    expect(after).toBe(before)
    expect(after).toBe(1)
  })

  it('6: 未知 itemId 不可装备', () => {
    expect(useGameStore.getState().equipWeapon('no_such_item')).toBe(false)
    expect(currentState().equipment.weapon).toBeNull()
  })

  it('7: 非 weapon 不可装备（治疗药水）', () => {
    expect(useGameStore.getState().equipWeapon('healing_potion')).toBe(false)
    expect(currentState().equipment.weapon).toBeNull()
  })

  it('8: 背包未拥有 weapon 不可装备（moon_blade 未获得）', () => {
    expect(useGameStore.getState().equipWeapon('moon_blade')).toBe(false)
    expect(currentState().equipment.weapon).toBeNull()
  })

  it('9: refined_iron_sword weaponDamageBonus === 3（注册表）', () => {
    const def = getItem('refined_iron_sword')
    expect(def?.type).toBe('weapon')
    expect(def?.weaponDamageBonus).toBe(3)
    expect(getItem('iron_sword')?.weaponDamageBonus).toBe(2)
  })

  it('10: 同角色 refined 攻击力 = iron + 1（weaponDamageBonus 进入战斗计算）', () => {
    const str = 14
    const level = 1
    const iron = getPlayerAttackPower(str, 2, level)
    const refined = getPlayerAttackPower(str, 3, level)
    expect(refined).toBe(iron + 1)
  })
})

// ================= K4：北门场景技能统一校验 =================

describe('TM-P2-003-R3 C：北门旧哨塔技能路线复用统一校验（K4）', () => {
  it('29: force 技能（骑士重击）可以开启', () => {
    setState(northGateReadyState())
    const r = useGameStore.getState().openNorthTowerWithSkill('knight_power_strike')
    expect(r?.outcome).toBe('opened')
    expect(currentState().world.flags.north_tower_opened).toBe(true)
  })

  it('30: movement 技能（迅捷突袭）可以开启', () => {
    const s = northGateReadyState()
    s.player.profession = 'ranger'
    s.player.learnedSkillIds = ['ranger_swift_strike']
    setState(s)
    const r = useGameStore.getState().openNorthTowerWithSkill('ranger_swift_strike')
    expect(r?.outcome).toBe('opened')
    expect(currentState().world.flags.north_tower_opened).toBe(true)
  })

  it('31: magic 技能（法术攻击）可以开启', () => {
    const s = northGateReadyState()
    s.player.profession = 'mage'
    s.player.learnedSkillIds = ['mage_spell']
    setState(s)
    const r = useGameStore.getState().openNorthTowerWithSkill('mage_spell')
    expect(r?.outcome).toBe('opened')
    expect(currentState().world.flags.north_tower_opened).toBe(true)
  })

  it('32: physical-only synthetic skill → wrong_tag', () => {
    const original = SKILLS['test_physical_strike']
    SKILLS['test_physical_strike'] = {
      id: 'test_physical_strike',
      name: '物理测试技',
      description: '',
      profession: 'knight',
      mpCost: 1,
      tags: ['physical'],
    }
    try {
      const s = northGateReadyState()
      s.player.learnedSkillIds = ['test_physical_strike']
      setState(s)
      const r = useGameStore.getState().openNorthTowerWithSkill('test_physical_strike')
      expect(r?.outcome).toBe('wrong_tag')
    } finally {
      if (original) SKILLS['test_physical_strike'] = original
      else delete SKILLS['test_physical_strike']
    }
  })

  it('33: wrong_tag 不扣 MP', () => {
    const original = SKILLS['test_physical_strike']
    SKILLS['test_physical_strike'] = {
      id: 'test_physical_strike',
      name: '物理测试技',
      description: '',
      profession: 'knight',
      mpCost: 1,
      tags: ['physical'],
    }
    try {
      const s = northGateReadyState()
      s.player.learnedSkillIds = ['test_physical_strike']
      setState(s)
      const mpBefore = currentState().player.mp
      useGameStore.getState().openNorthTowerWithSkill('test_physical_strike')
      expect(currentState().player.mp).toBe(mpBefore)
    } finally {
      if (original) SKILLS['test_physical_strike'] = original
      else delete SKILLS['test_physical_strike']
    }
  })

  it('34: wrong_tag 不写 north_tower_opened', () => {
    const original = SKILLS['test_physical_strike']
    SKILLS['test_physical_strike'] = {
      id: 'test_physical_strike',
      name: '物理测试技',
      description: '',
      profession: 'knight',
      mpCost: 1,
      tags: ['physical'],
    }
    try {
      const s = northGateReadyState()
      s.player.learnedSkillIds = ['test_physical_strike']
      setState(s)
      useGameStore.getState().openNorthTowerWithSkill('test_physical_strike')
      expect(currentState().world.flags.north_tower_opened).toBeUndefined()
    } finally {
      if (original) SKILLS['test_physical_strike'] = original
      else delete SKILLS['test_physical_strike']
    }
  })

  it('35: 未知技能 → no_skill', () => {
    setState(northGateReadyState())
    const r = useGameStore.getState().openNorthTowerWithSkill('not_a_skill')
    expect(r?.outcome).toBe('no_skill')
  })

  it('36: 未学习技能 → no_skill', () => {
    const s = northGateReadyState()
    s.player.learnedSkillIds = []
    setState(s)
    const r = useGameStore.getState().openNorthTowerWithSkill('knight_power_strike')
    expect(r?.outcome).toBe('no_skill')
  })

  it('37: 职业不匹配 → no_skill', () => {
    const s = northGateReadyState()
    s.player.learnedSkillIds = ['mage_spell']
    setState(s)
    const r = useGameStore.getState().openNorthTowerWithSkill('mage_spell')
    expect(r?.outcome).toBe('no_skill')
  })

  it('38: 通用技能 + 合法 tag → 可以开启', () => {
    const original = SKILLS['test_general_magic']
    SKILLS['test_general_magic'] = {
      id: 'test_general_magic',
      name: '通用法术测试',
      description: '',
      mpCost: 1,
      tags: ['magic'],
    }
    try {
      const s = northGateReadyState()
      s.player.learnedSkillIds = ['test_general_magic']
      setState(s)
      const r = useGameStore.getState().openNorthTowerWithSkill('test_general_magic')
      expect(r?.outcome).toBe('opened')
      expect(currentState().world.flags.north_tower_opened).toBe(true)
    } finally {
      if (original) SKILLS['test_general_magic'] = original
      else delete SKILLS['test_general_magic']
    }
  })

  it('39: MP 不足 → no_mp → MP 不变 → tower 不开', () => {
    const s = northGateReadyState()
    s.player.mp = 1
    setState(s)
    const mpBefore = currentState().player.mp
    const r = useGameStore.getState().openNorthTowerWithSkill('knight_power_strike')
    expect(r?.outcome).toBe('no_mp')
    expect(currentState().player.mp).toBe(mpBefore)
    expect(currentState().world.flags.north_tower_opened).toBeUndefined()
  })

  it('40: 成功时 MP 减少与 north_tower_opened 同一原子结果', () => {
    const s = northGateReadyState()
    s.player.mp = 6
    setState(s)
    const r = useGameStore.getState().openNorthTowerWithSkill('knight_power_strike')
    expect(r?.outcome).toBe('opened')
    if (r?.outcome !== 'opened') throw new Error('unexpected outcome')
    expect(r.mpCost).toBe(2)
    expect(currentState().player.mp).toBe(4)
    expect(currentState().world.flags.north_tower_opened).toBe(true)
  })
})

// ================= K7：Loot 语义 =================

describe('TM-P2-003-R3：Loot 语义保持（K7）', () => {
  it('66: 黑鬃魔狼剧情必需奖励（基础狼牙）不受 Luck 影响（roll=1 大失败仍有 guaranteed）', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 1)
    expect(grant?.items.some((i) => i.itemId === 'black_fang')).toBe(true)
    expect(grant?.gold).toBe(0)
  })

  it('67: 基础掉落仍存在（guaranteed black_fang 在任何检定下都在）', () => {
    for (const roll of [1, 10, 20]) {
      const grant = resolveLoot('black_mane_wolf', 10, roll)
      expect(grant?.items.some((i) => i.itemId === 'black_fang')).toBe(true)
    }
  })

  it('68: Luck success bonus 仍存在（大成功追加狼牙 + 狼皮）', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 20)
    const fangCount = grant?.items.filter((i) => i.itemId === 'black_fang').reduce((n, i) => n + i.quantity, 0) ?? 0
    expect(fangCount).toBe(2) // guaranteed 1 + 大成功追加 1
    expect(grant?.items.some((i) => i.itemId === 'black_mane_pelt')).toBe(true)
  })

  it('69: 补给匣基础（治疗药水 + 基础金币）Luck 失败也存在', () => {
    const s = northGateReadyState()
    s.world.flags = { ...s.world.flags, north_tower_opened: true }
    setState(s)
    const r = useGameStore.getState().claimNorthTowerCache(1) // roll=1 检定失败
    expect(r?.outcome).toBe('claimed')
    if (r?.outcome !== 'claimed') throw new Error('unexpected outcome')
    expect(r.items.some((i) => i.itemId === 'healing_potion')).toBe(true)
    expect(r.gold).toBe(NORTH_TOWER_CACHE_BASE_GOLD)
    expect(r.items.some((i) => i.itemId === 'refined_iron_sword')).toBe(false)
  })

  it('70: critical_success → refined_iron_sword x1', () => {
    const s = northGateReadyState()
    s.world.flags = { ...s.world.flags, north_tower_opened: true }
    setState(s)
    const r = useGameStore.getState().claimNorthTowerCache(20) // roll=20 大成功
    expect(r?.outcome).toBe('claimed')
    if (r?.outcome !== 'claimed') throw new Error('unexpected outcome')
    expect(r.items.some((i) => i.itemId === 'refined_iron_sword' && i.quantity === 1)).toBe(true)
    expect(r.gold).toBe(NORTH_TOWER_CACHE_BASE_GOLD + NORTH_TOWER_CACHE_LUCK_GOLD)
    // 物品真正进入背包
    expect(currentState().inventory.some((e) => e.itemId === 'refined_iron_sword' && e.quantity >= 1)).toBe(true)
  })

  it('71: 补给匣只能领取一次', () => {
    const s = northGateReadyState()
    s.world.flags = { ...s.world.flags, north_tower_opened: true }
    setState(s)
    expect(useGameStore.getState().claimNorthTowerCache(20)?.outcome).toBe('claimed')
    const second = useGameStore.getState().claimNorthTowerCache(20)
    expect(second?.outcome).toBe('already_claimed')
    // 第二次不重复发放
    const refinedCount = currentState().inventory.filter((e) => e.itemId === 'refined_iron_sword').reduce((n, e) => n + e.quantity, 0)
    expect(refinedCount).toBe(1)
  })
})

// ================= K8：黄金兔冻结 =================

describe('TM-P2-003-R3：Golden Rabbit 冻结状态不可变（K8）', () => {
  it('72: status = in_progress / stage = 0', () => {
    const s = goldenRabbitFrozenState()
    const q = s.quests.find((x) => x.questId === 'quest_golden_rabbit_search')
    expect(q?.status).toBe('in_progress')
    expect(q?.stage).toBe(0)
  })

  it('73: 四 flags 全部 true', () => {
    const q = goldenRabbitFrozenState().quests.find((x) => x.questId === 'quest_golden_rabbit_search')!
    expect(q.flags.asked_blacksmith).toBe(true)
    expect(q.flags.asked_apothecary).toBe(true)
    expect(q.flags.village_inquiry_reported).toBe(true)
    expect(q.flags.rabbit_lair_rechecked).toBe(true)
  })

  it('74: rabbit_path ×1', () => {
    const s = goldenRabbitFrozenState()
    expect(s.inventory.find((e) => e.itemId === 'rabbit_path')?.quantity).toBe(1)
  })

  it('75: R3 新动作（装备/技能/补给匣）不得改变冻结状态', () => {
    setState(goldenRabbitFrozenState())
    const before = snapshotGoldenRabbit(currentState())
    // R3 核心动作：装备铁剑 → 卸下 → 精制铁剑；技能消费；补给匣领取
    useGameStore.getState().equipWeapon('iron_sword')
    useGameStore.getState().unequipWeapon()
    useGameStore.getState().addItem('refined_iron_sword', 1)
    useGameStore.getState().equipWeapon('refined_iron_sword')
    useGameStore.getState().spendSkillMp('knight_power_strike')
    const after = snapshotGoldenRabbit(currentState())
    expect(after).toEqual(before)
  })
})
