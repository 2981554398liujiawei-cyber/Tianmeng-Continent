import { describe, expect, it } from 'vitest'
import {
  ENEMIES,
  getEnemy,
  getItem,
  getLocation,
  getNpc,
  getProfession,
  getQuest,
  ITEMS,
  LOCATIONS,
  NPCS,
  PROFESSIONS,
  QUESTS,
  START_LOCATION_ID,
  createInitialGameState,
} from './index'

describe('TM-P0-002：内容注册表交叉引用一致性', () => {
  it('地点引用：所有 connections 指向已存在地点', () => {
    for (const loc of Object.values(LOCATIONS)) {
      for (const connId of loc.connections) {
        expect(getLocation(connId), `${loc.id} -> ${connId}`).toBeDefined()
      }
    }
  })

  it('NPC 引用：所有 locationId 指向已存在地点', () => {
    for (const npc of Object.values(NPCS)) {
      expect(getLocation(npc.locationId), `${npc.id} 位于 ${npc.locationId}`).toBeDefined()
    }
  })

  it('任务引用：所有 giverNpcId 指向已存在 NPC', () => {
    for (const quest of Object.values(QUESTS)) {
      expect(getNpc(quest.giverNpcId), `${quest.id} 由 ${quest.giverNpcId} 发布`).toBeDefined()
    }
  })

  it('Registry ID 一致：LOCATIONS/NPCS/ENEMIES/QUESTS/ITEMS 的 key 与定义内 id 相同', () => {
    for (const [key, def] of Object.entries(LOCATIONS)) expect(def.id).toBe(key)
    for (const [key, def] of Object.entries(NPCS)) expect(def.id).toBe(key)
    for (const [key, def] of Object.entries(ENEMIES)) expect(def.id).toBe(key)
    for (const [key, def] of Object.entries(QUESTS)) expect(def.id).toBe(key)
    for (const [key, def] of Object.entries(ITEMS)) expect(def.id).toBe(key)
  })
})

describe('TM-P0-002：内容数量与指定条目', () => {
  it('地点 4 个：青石村/村外草原/废弃矿洞/兔王巢穴', () => {
    expect(Object.keys(LOCATIONS)).toHaveLength(4)
    expect(getLocation('qingshi_village')?.name).toBe('青石村')
    expect(getLocation('village_grassland')?.name).toBe('村外草原')
    expect(getLocation('abandoned_mine')?.name).toBe('废弃矿洞')
    expect(getLocation('rabbit_lair')?.name).toBe('兔王巢穴')
  })

  it('连接关系符合设定', () => {
    expect(getLocation('qingshi_village')?.connections).toContain('village_grassland')
    expect(getLocation('qingshi_village')?.connections).toContain('abandoned_mine')
    expect(getLocation('village_grassland')?.connections).toContain('rabbit_lair')
  })

  it('兔王巢穴需要 rabbit_lair_unlocked 解锁', () => {
    expect(getLocation('rabbit_lair')?.requiredFlag).toBe('rabbit_lair_unlocked')
  })

  it('NPC 3 个：村长/铁匠/药师，均位于青石村', () => {
    expect(Object.keys(NPCS)).toHaveLength(3)
    for (const npc of Object.values(NPCS)) {
      expect(npc.locationId).toBe('qingshi_village')
    }
  })

  it('敌人 4 个且等级符合设定', () => {
    expect(Object.keys(ENEMIES)).toHaveLength(4)
    expect(getEnemy('corrupted_rabbit')?.level).toBe(1)
    expect(getEnemy('corrupted_rat')?.level).toBe(1)
    expect(getEnemy('corrupted_wolf')?.level).toBe(2)
    expect(getEnemy('dudu_rabbit')?.level).toBe(3)
  })

  it('任务 quest_village_monsters 由村长发布', () => {
    expect(getQuest('quest_village_monsters')?.title).toBe('村外异动')
    expect(getQuest('quest_village_monsters')?.giverNpcId).toBe('village_elder')
  })

  it('物品包含 rabbit_path（任务物品）', () => {
    expect(getItem('rabbit_path')?.name).toBe('兔子的路径')
    expect(getItem('rabbit_path')?.type).toBe('quest')
  })

  it('4 个职业保持可查询', () => {
    expect(getProfession('warrior')?.name).toBe('战士')
    expect(getProfession('knight')?.name).toBe('骑士')
    expect(getProfession('ranger')?.name).toBe('游侠')
    expect(getProfession('mage')?.name).toBe('法师')
  })
})

describe('TM-P0-002：与 GameState 初始状态集成', () => {
  it('START_LOCATION_ID 能解析到青石村', () => {
    expect(START_LOCATION_ID).toBe('qingshi_village')
    expect(getLocation(START_LOCATION_ID)?.name).toBe('青石村')
  })

  it('初始背包所有 itemId 都能在物品注册表找到', () => {
    const state = createInitialGameState()
    for (const entry of state.inventory) {
      expect(getItem(entry.itemId), `背包物品 ${entry.itemId}`).toBeDefined()
    }
  })

  it('默认职业 knight 能在职业注册表找到', () => {
    const state = createInitialGameState()
    expect(getProfession(state.player.profession)?.name).toBe('骑士')
  })

  it('初始地点 NPC 定义存在', () => {
    // 初始地点青石村的 3 个 NPC 均可在注册表查到
    expect(getNpc('village_elder')).toBeDefined()
    expect(getNpc('blacksmith')).toBeDefined()
    expect(getNpc('apothecary')).toBeDefined()
  })
})

describe('TM-P0-002：不存在 ID 查询安全返回 undefined', () => {
  it('getLocation/getNpc/getEnemy/getQuest/getItem/getProfession 对不存在 ID 均返回 undefined 且不抛', () => {
    expect(() => getLocation('not_exists')).not.toThrow()
    expect(getLocation('not_exists')).toBeUndefined()
    expect(getNpc('not_exists')).toBeUndefined()
    expect(getEnemy('not_exists')).toBeUndefined()
    expect(getQuest('not_exists')).toBeUndefined()
    expect(getItem('not_exists')).toBeUndefined()
    expect(getProfession('not_exists' as never)).toBeUndefined()
    expect(Object.keys(PROFESSIONS)).toHaveLength(4)
  })
})

describe('TM-P0-002-R1：关键内容身份锁', () => {
  it('apothecary 是药师大叔（非女性设定）', () => {
    expect(getNpc('apothecary')?.summary).toContain('药师大叔')
    expect(getNpc('apothecary')?.summary).not.toContain('女子')
  })

  it('dudu_rabbit 是黄金兔子王的伴侣，不是兔王/吞吃过路者', () => {
    const desc = getEnemy('dudu_rabbit')?.description ?? ''
    expect(desc).toContain('黄金兔子王')
    expect(desc).not.toContain('吞吃过路者')
    expect(desc).not.toContain('兔王')
  })

  it('rabbit_path 是通往黄金兔子王所在之地的藏宝图', () => {
    const desc = getItem('rabbit_path')?.description ?? ''
    expect(desc).toContain('黄金兔子王')
    expect(desc).toContain('藏宝图')
    expect(desc).not.toContain('迁徙')
  })

  it('注册表数量与 ID 未被改动（无新增黄金兔子王条目）', () => {
    expect(Object.keys(ENEMIES)).toHaveLength(4)
    expect(Object.keys(NPCS)).toHaveLength(3)
    expect(Object.keys(QUESTS)).toHaveLength(1)
    expect(getEnemy('golden_rabbit_king')).toBeUndefined()
  })
})

describe('TM-P0-007：敌人战斗数据一致性', () => {
  it('全部敌人战斗字段为整数且 maxHp/defense/damage 为正整数', () => {
    for (const enemy of Object.values(ENEMIES)) {
      expect(Number.isInteger(enemy.maxHp), `${enemy.id} maxHp`).toBe(true)
      expect(enemy.maxHp).toBeGreaterThan(0)
      expect(Number.isInteger(enemy.defense), `${enemy.id} defense`).toBe(true)
      expect(enemy.defense).toBeGreaterThan(0)
      expect(Number.isInteger(enemy.attackBonus), `${enemy.id} attackBonus`).toBe(true)
      expect(Number.isInteger(enemy.damage), `${enemy.id} damage`).toBe(true)
      expect(enemy.damage).toBeGreaterThan(0)
    }
  })

  it('四敌人战斗基线数值锁定（V1 平衡基线）', () => {
    expect(getEnemy('corrupted_rabbit')).toMatchObject({ maxHp: 8, defense: 11, attackBonus: 2, damage: 2 })
    expect(getEnemy('corrupted_rat')).toMatchObject({ maxHp: 6, defense: 10, attackBonus: 2, damage: 2 })
    expect(getEnemy('corrupted_wolf')).toMatchObject({ maxHp: 12, defense: 12, attackBonus: 3, damage: 3 })
    expect(getEnemy('dudu_rabbit')).toMatchObject({ maxHp: 24, defense: 13, attackBonus: 4, damage: 4 })
  })

  it('已锁定身份字段未被修改：name/description/tags/level', () => {
    expect(getEnemy('corrupted_rabbit')?.name).toBe('魔化兔')
    expect(getEnemy('corrupted_rat')?.name).toBe('魔化鼠')
    expect(getEnemy('corrupted_wolf')?.name).toBe('魔化狼')
    expect(getEnemy('dudu_rabbit')?.name).toBe('嘟嘟兔')
    expect(getEnemy('corrupted_rabbit')?.tags).toEqual(['beast'])
    expect(getEnemy('dudu_rabbit')?.tags).toEqual(['beast', 'boss'])
    expect(getEnemy('dudu_rabbit')?.level).toBe(3)
    expect(getEnemy('dudu_rabbit')?.description).toContain('黄金兔子王')
  })
})

describe('TM-P0-008：地点遭遇敌人数据一致性', () => {
  it('所有 Location.enemyIds 均可通过 getEnemy 查询', () => {
    for (const loc of Object.values(LOCATIONS)) {
      for (const enemyId of loc.enemyIds ?? []) {
        expect(getEnemy(enemyId), `${loc.id} 遭遇 ${enemyId}`).toBeDefined()
      }
    }
  })

  it('四地点遭遇配置符合任务卡', () => {
    expect(getLocation('qingshi_village')?.enemyIds).toEqual([])
    expect(getLocation('village_grassland')?.enemyIds).toEqual(['corrupted_rabbit'])
    expect(getLocation('abandoned_mine')?.enemyIds).toEqual(['corrupted_rat'])
    expect(getLocation('rabbit_lair')?.enemyIds).toEqual(['dudu_rabbit'])
  })

  it('corrupted_wolf 未放入正式地点遭遇', () => {
    for (const loc of Object.values(LOCATIONS)) {
      expect(loc.enemyIds ?? []).not.toContain('corrupted_wolf')
    }
  })

  it('已锁定地点字段保持不变：name/description/connections/requiredFlag', () => {
    expect(getLocation('qingshi_village')?.connections).toEqual(['village_grassland', 'abandoned_mine'])
    expect(getLocation('village_grassland')?.connections).toEqual(['qingshi_village', 'rabbit_lair'])
    expect(getLocation('rabbit_lair')?.requiredFlag).toBe('rabbit_lair_unlocked')
    expect(getLocation('qingshi_village')?.description).toContain('群山环抱')
  })
})

describe('TM-P0-010：治疗药水数据约束', () => {
  it('healing_potion 为 consumable 且 healAmount === 8', () => {
    const potion = getItem('healing_potion')
    expect(potion?.type).toBe('consumable')
    expect(potion?.healAmount).toBe(8)
  })

  it('healAmount 若存在必须为正整数且仅用于 consumable', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.healAmount !== undefined) {
        expect(Number.isInteger(item.healAmount), `${item.id} healAmount 正整数`).toBe(true)
        expect(item.healAmount).toBeGreaterThan(0)
        expect(item.type, `${item.id} healAmount 仅 consumable`).toBe('consumable')
      }
    }
  })

  it('其他物品不携带 healAmount', () => {
    expect(getItem('iron_sword')?.healAmount).toBeUndefined()
    expect(getItem('test_artifact')?.healAmount).toBeUndefined()
    expect(getItem('rabbit_path')?.healAmount).toBeUndefined()
  })
})
