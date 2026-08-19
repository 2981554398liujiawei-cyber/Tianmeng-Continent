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
  it('地点 9 个：青石村/村外草原/废弃矿洞/兔王巢穴/天龙城/武馆/黑石塔一层/黑石塔二层/黑石塔三层', () => {
    expect(Object.keys(LOCATIONS)).toHaveLength(9)
    expect(getLocation('qingshi_village')?.name).toBe('青石村')
    expect(getLocation('village_grassland')?.name).toBe('村外草原')
    expect(getLocation('abandoned_mine')?.name).toBe('废弃矿洞')
    expect(getLocation('rabbit_lair')?.name).toBe('兔王巢穴')
    expect(getLocation('tianlong_city')?.name).toBe('天龙城')
    expect(getLocation('tianlong_martial_hall')?.name).toBe('武馆')
    expect(getLocation('black_stone_tower_floor1')?.name).toBe('黑石塔一层')
    expect(getLocation('black_stone_tower_floor2')?.name).toBe('黑石塔二层')
    expect(getLocation('black_stone_tower_floor3')?.name).toBe('黑石塔三层')
  })

  // TM-P1-023：天龙城落点锁定——本卡只做区域切换与落点；TM-P1-024 起 connections=['tianlong_martial_hall']（双向武馆）、enemyIds=[]（无假内容）
  it('TM-P1-023：天龙城注册表定义锁定（id/name/description/enemyIds=[]/无 requiredFlag）', () => {
    const city = getLocation('tianlong_city')
    expect(city).toBeDefined()
    expect(city?.id).toBe('tianlong_city')
    expect(city?.name).toBe('天龙城')
    expect(city?.description).toContain('天龙王朝的皇城')
    expect(city?.enemyIds).toEqual([])
    expect(city?.requiredFlag).toBeUndefined()
  })

  // TM-P1-024：天龙城第一段子区域——武馆（双向连接天龙城；无敌人）+ 天龙城连接更新
  it('TM-P1-024：武馆注册表定义锁定（id/name=武馆/connections=[tianlong_city]/enemyIds=[]）', () => {
    const hall = getLocation('tianlong_martial_hall')
    expect(hall).toBeDefined()
    expect(hall?.id).toBe('tianlong_martial_hall')
    expect(hall?.name).toBe('武馆')
    expect(hall?.connections).toEqual(['tianlong_city'])
    expect(hall?.enemyIds).toEqual([])
    expect(hall?.requiredFlag).toBeUndefined()
    expect(getLocation('tianlong_city')?.connections).toContain('tianlong_martial_hall')
  })

  // TM-P1-025/P1-026/P1-027：黑石塔一层（第二地区第一段地牢——解锁路线+骷髅士兵+骷髅队长 Boss；P1-027 起 connections 含黑石塔二层；未解锁时按钮 disabled 复用 requiredFlag）
  it('TM-P1-025/P1-026/P1-027：黑石塔一层注册表定义锁定（id/name/requiredFlag/connections/enemyIds）', () => {
    const tower = getLocation('black_stone_tower_floor1')
    expect(tower).toBeDefined()
    expect(tower?.id).toBe('black_stone_tower_floor1')
    expect(tower?.name).toBe('黑石塔一层')
    expect(tower?.requiredFlag).toBe('black_stone_tower_unlocked')
    // TM-P1-027：一层连接精确包含天龙城与黑石塔二层（二层未解锁时移动按钮 disabled）
    expect(tower?.connections).toEqual(['tianlong_city', 'black_stone_tower_floor2'])
    expect(tower?.enemyIds).toEqual(['skeleton_soldier', 'skeleton_captain'])
    // 天龙城正式连接包含黑石塔一层（未解锁时移动按钮 disabled）
    expect(getLocation('tianlong_city')?.connections).toEqual(['tianlong_martial_hall', 'black_stone_tower_floor1'])
    // 不建独立入口节点/城外道路
    expect(getLocation('black_stone_tower_entrance')).toBeUndefined()
    expect(getLocation('black_stone_tower_outskirts')).toBeUndefined()
  })

  // TM-P1-027/P1-029：黑石塔二层（入口固定顺序战斗：僵尸→黑法师→骷髅战士；连接一层与三层）
  it('TM-P1-027：黑石塔二层注册表定义锁定（id/name/description/requiredFlag/connections/enemyIds）', () => {
    const floor2 = getLocation('black_stone_tower_floor2')
    expect(floor2).toBeDefined()
    expect(floor2?.id).toBe('black_stone_tower_floor2')
    expect(floor2?.name).toBe('黑石塔二层')
    expect(floor2?.description).toContain('曲折的黑石通道向深处延伸')
    expect(floor2?.requiredFlag).toBe('black_stone_tower_floor2_unlocked')
    // TM-P1-029：二层连接一层与三层
    expect(floor2?.connections).toEqual(['black_stone_tower_floor1', 'black_stone_tower_floor3'])
    // TM-P1-028：二层严格固定顺序三敌（僵尸→黑法师→骷髅战士）
    expect(floor2?.enemyIds).toEqual(['tower_zombie', 'black_mage', 'skeleton_warrior'])
  })

  // TM-P1-029：黑石塔三层（越过石阶后的厅堂；守卫骷髅女妖；击败后找到夔峒项链）
  it('TM-P1-029：黑石塔三层注册表定义锁定（id/name/description/requiredFlag/connections/enemyIds）', () => {
    const floor3 = getLocation('black_stone_tower_floor3')
    expect(floor3).toBeDefined()
    expect(floor3?.id).toBe('black_stone_tower_floor3')
    expect(floor3?.name).toBe('黑石塔三层')
    expect(floor3?.description).toContain('越过石阶后，塔内变得更加阴冷')
    expect(floor3?.requiredFlag).toBe('black_stone_tower_floor3_unlocked')
    expect(floor3?.connections).toEqual(['black_stone_tower_floor2'])
    expect(floor3?.enemyIds).toEqual(['skeleton_witch'])
  })

  it('连接关系符合设定', () => {
    expect(getLocation('qingshi_village')?.connections).toContain('village_grassland')
    expect(getLocation('qingshi_village')?.connections).toContain('abandoned_mine')
    expect(getLocation('village_grassland')?.connections).toContain('rabbit_lair')
  })

  it('兔王巢穴需要 rabbit_lair_unlocked 解锁', () => {
    expect(getLocation('rabbit_lair')?.requiredFlag).toBe('rabbit_lair_unlocked')
  })

  it('NPC 5 个：村长/铁匠/药师位于青石村，马科位于武馆，王财位于天龙城', () => {
    expect(Object.keys(NPCS)).toHaveLength(5)
    expect(getNpc('village_elder')?.locationId).toBe('qingshi_village')
    expect(getNpc('blacksmith')?.locationId).toBe('qingshi_village')
    expect(getNpc('apothecary')?.locationId).toBe('qingshi_village')
    expect(getNpc('knight_captain_make')?.locationId).toBe('tianlong_martial_hall')
    expect(getNpc('merchant_wangcai')?.locationId).toBe('tianlong_city')
  })

  it('敌人 10 个且等级符合设定', () => {
    expect(Object.keys(ENEMIES)).toHaveLength(10)
    expect(getEnemy('corrupted_rabbit')?.level).toBe(1)
    expect(getEnemy('corrupted_rat')?.level).toBe(1)
    expect(getEnemy('corrupted_wolf')?.level).toBe(2)
    expect(getEnemy('dudu_rabbit')?.level).toBe(3)
    expect(getEnemy('skeleton_soldier')?.level).toBe(3)
    expect(getEnemy('skeleton_captain')?.level).toBe(4)
    expect(getEnemy('tower_zombie')?.level).toBe(4)
    expect(getEnemy('black_mage')?.level).toBe(4)
    expect(getEnemy('skeleton_warrior')?.level).toBe(5)
    expect(getEnemy('skeleton_witch')?.level).toBe(5)
  })

  // TM-P1-025：骷髅士兵完整锁定（普通战斗规则，无技能/状态/抗性/掉落）
  it('TM-P1-025：骷髅士兵注册表定义锁定（id/name/level=3/tags/maxHp/defense/attackBonus/damage）', () => {
    const soldier = getEnemy('skeleton_soldier')
    expect(soldier).toBeDefined()
    expect(soldier?.id).toBe('skeleton_soldier')
    expect(soldier?.name).toBe('骷髅士兵')
    expect(soldier?.level).toBe(3)
    expect(soldier?.tags).toEqual(['undead'])
    expect(soldier?.maxHp).toBe(14)
    expect(soldier?.defense).toBe(12)
    expect(soldier?.attackBonus).toBe(3)
    expect(soldier?.damage).toBe(3)
  })

  // TM-P1-026：骷髅队长完整锁定（一层 Boss——普通确定性 D20 战斗；无技能系统/抗性/掉落）
  it('TM-P1-026：骷髅队长注册表定义锁定（id/name/level=4/tags/maxHp/defense/attackBonus/damage）', () => {
    const captain = getEnemy('skeleton_captain')
    expect(captain).toBeDefined()
    expect(captain?.id).toBe('skeleton_captain')
    expect(captain?.name).toBe('骷髅队长')
    expect(captain?.level).toBe(4)
    expect(captain?.tags).toEqual(['undead', 'boss'])
    expect(captain?.maxHp).toBe(22)
    expect(captain?.defense).toBe(13)
    expect(captain?.attackBonus).toBe(4)
    expect(captain?.damage).toBe(4)
  })

  // TM-P1-027：僵尸完整锁定（入口固定顺序第一场——普通 D20 战斗；无中毒/吸血/持续伤害/特殊恢复/掉落）
  it('TM-P1-027：僵尸注册表定义锁定（id/name/level=4/tags/maxHp/defense/attackBonus/damage）', () => {
    const zombie = getEnemy('tower_zombie')
    expect(zombie).toBeDefined()
    expect(zombie?.id).toBe('tower_zombie')
    expect(zombie?.name).toBe('僵尸')
    expect(zombie?.level).toBe(4)
    expect(zombie?.description).toContain('受到魔气侵染的腐败尸体')
    expect(zombie?.tags).toEqual(['undead'])
    expect(zombie?.maxHp).toBe(18)
    expect(zombie?.defense).toBe(12)
    expect(zombie?.attackBonus).toBe(4)
    expect(zombie?.damage).toBe(4)
  })

  // TM-P1-027：黑法师完整锁定（入口固定顺序第二场——普通战斗模型；无盲目/暗属性/黑色火球/暴躁/特殊法术 AI/掉落）
  it('TM-P1-027：黑法师注册表定义锁定（id/name/level=4/tags/maxHp/defense/attackBonus/damage）', () => {
    const blackMage = getEnemy('black_mage')
    expect(blackMage).toBeDefined()
    expect(blackMage?.id).toBe('black_mage')
    expect(blackMage?.name).toBe('黑法师')
    expect(blackMage?.level).toBe(4)
    expect(blackMage?.description).toContain('生前曾是法师')
    expect(blackMage?.tags).toEqual(['undead'])
    expect(blackMage?.maxHp).toBe(14)
    expect(blackMage?.defense).toBe(11)
    expect(blackMage?.attackBonus).toBe(5)
    expect(blackMage?.damage).toBe(4)
  })

  // TM-P1-028：骷髅战士完整锁定（二层深处第三场——普通 D20 战斗；无技能系统/重击/格挡/眩晕/亡灵抗性/特殊 AI/掉落）
  it('TM-P1-028：骷髅战士注册表定义锁定（id/name/level=5/tags/maxHp/defense/attackBonus/damage）', () => {
    const warrior = getEnemy('skeleton_warrior')
    expect(warrior).toBeDefined()
    expect(warrior?.id).toBe('skeleton_warrior')
    expect(warrior?.name).toBe('骷髅战士')
    expect(warrior?.level).toBe(5)
    expect(warrior?.description).toContain('骷髅战士')
    expect(warrior?.tags).toEqual(['undead'])
    expect(warrior?.maxHp).toBe(20)
    expect(warrior?.defense).toBe(13)
    expect(warrior?.attackBonus).toBe(4)
    expect(warrior?.damage).toBe(4)
  })

  // TM-P1-029：骷髅女妖完整锁定（三层守卫——普通 D20 战斗；不因「女妖」增加法术系统；无诅咒/恐惧/吸血/灵魂攻击/暗属性/召唤/特殊 AI）
  it('TM-P1-029：骷髅女妖注册表定义锁定（id/name/level=5/tags/maxHp/defense/attackBonus/damage）', () => {
    const witch = getEnemy('skeleton_witch')
    expect(witch).toBeDefined()
    expect(witch?.id).toBe('skeleton_witch')
    expect(witch?.name).toBe('骷髅女妖')
    expect(witch?.level).toBe(5)
    expect(witch?.description).toContain('骷髅女妖')
    expect(witch?.tags).toEqual(['undead'])
    expect(witch?.maxHp).toBe(18)
    expect(witch?.defense).toBe(12)
    expect(witch?.attackBonus).toBe(5)
    expect(witch?.damage).toBe(5)
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

  // TM-P1-029：夔峒项链完整锁定（任务物品——复用现有 ItemDefinition quest 类型，不新建任务物品系统；value 0）
  it('TM-P1-029：夔峒项链注册表定义锁定（id/name/type=quest/description/value=0）', () => {
    const necklace = getItem('kuidong_necklace')
    expect(necklace).toBeDefined()
    expect(necklace?.id).toBe('kuidong_necklace')
    expect(necklace?.name).toBe('夔峒项链')
    expect(necklace?.type).toBe('quest')
    expect(necklace?.description).toContain('王财在黑石塔附近遭遇魔物袭击时遗失的项链')
    expect(necklace?.value).toBe(0)
  })

  it('注册表数量与 ID 未被改动（无新增黄金兔子王条目；TM-P1-005 新增《矿洞清理》、TM-P1-010 新增《草原狼影》、TM-P1-017 新增《追寻黄金兔子王》、TM-P1-021 新增《采药受阻》、TM-P1-022 新增《矿洞余患》、TM-P1-024 新增《商人王财的麻烦》与马科/王财、TM-P1-025 新增骷髅士兵、TM-P1-026 新增骷髅队长、TM-P1-027 新增僵尸/黑法师与黑石塔二层、TM-P1-028 新增骷髅战士、TM-P1-029 新增骷髅女妖/黑石塔三层/夔峒项链）', () => {
    expect(Object.keys(ENEMIES)).toHaveLength(10)
    expect(Object.keys(NPCS)).toHaveLength(5)
    expect(Object.keys(QUESTS)).toHaveLength(7)
    expect(Object.keys(ITEMS)).toHaveLength(6)
    expect(getEnemy('golden_rabbit_king')).toBeUndefined()
    // TM-P1-028/029：骷髅战士、骷髅女妖已注册（本卡新增）
    expect(getEnemy('skeleton_warrior')).toBeDefined()
    expect(getEnemy('skeleton_witch')).toBeDefined()
  })

  // TM-P1-024：第五正式主线 + 天龙城 NPC 注册表锁定（无 goldReward、本卡不完成任务；马科/王财无 relationship）
  it('TM-P1-024：《商人王财的麻烦》注册表定义锁定（title/giver=马科/无 goldReward/summary 含关键文案）', () => {
    const quest = getQuest('quest_wangcai_trouble')
    expect(quest).toBeDefined()
    expect(quest?.id).toBe('quest_wangcai_trouble')
    expect(quest?.title).toBe('商人王财的麻烦')
    expect(quest?.giverNpcId).toBe('knight_captain_make')
    expect(quest?.goldReward).toBeUndefined()
    expect(quest?.summary).toContain('商人王财')
    expect(quest?.summary).toContain('黑石塔')
  })

  it('TM-P1-024：马科/王财 NPC 定义锁定（name/role/location/summary 含关键文案）', () => {
    const make = getNpc('knight_captain_make')
    expect(make).toBeDefined()
    expect(make?.name).toBe('马科')
    expect(make?.role).toBe('骑士队长')
    expect(make?.locationId).toBe('tianlong_martial_hall')
    expect(make?.summary).toContain('武馆')
    const wangcai = getNpc('merchant_wangcai')
    expect(wangcai).toBeDefined()
    expect(wangcai?.name).toBe('王财')
    expect(wangcai?.role).toBe('商人')
    expect(wangcai?.locationId).toBe('tianlong_city')
    expect(wangcai?.summary).toContain('头疼')
  })

  // TM-P1-017：第四正式主线任务注册表锁定（本卡只建立目标不新增地图/敌人）
  it('TM-P1-017：《追寻黄金兔子王》注册表定义锁定（title/giver/无 goldReward/summary 含关键文案）', () => {
    const quest = getQuest('quest_golden_rabbit_search')
    expect(quest).toBeDefined()
    expect(quest?.id).toBe('quest_golden_rabbit_search')
    expect(quest?.title).toBe('追寻黄金兔子王')
    expect(quest?.giverNpcId).toBe('village_elder')
    expect(quest?.goldReward).toBeUndefined()
    expect(quest?.summary).toContain('《兔子的路径》')
    expect(quest?.summary).toContain('黄金兔子王')
    // TM-P1-031：正式任务简介不得含开发占位符【待补充】；表述为目的地未知的自然剧情态（不编造地点）
    expect(quest?.summary).not.toContain('【待补充】')
    expect(quest?.summary).toContain('地图上的标记还无法对应到任何已知地点')
    // 不测试额外不存在的 lore
  })

  // TM-P1-021：首条正式支线注册表锁定（复用现有 NPC/地点/任务系统；goldReward 10 走 generic 提交路径）
  it('TM-P1-021：《采药受阻》注册表定义锁定（title/giver/goldReward 10/summary 含关键文案）', () => {
    const quest = getQuest('quest_apothecary_herb_route')
    expect(quest).toBeDefined()
    expect(quest?.id).toBe('quest_apothecary_herb_route')
    expect(quest?.title).toBe('采药受阻')
    expect(quest?.giverNpcId).toBe('apothecary')
    expect(quest?.goldReward).toBe(10)
    expect(quest?.summary).toContain('魔化野兽')
    expect(quest?.summary).toContain('村外草原')
    expect(quest?.summary).toContain('查看采药区域')
  })

  // TM-P1-022：第二条正式支线注册表锁定（复用废弃矿洞/魔化鼠/战斗系统；goldReward 10 走 generic 提交路径）
  it('TM-P1-022：《矿洞余患》注册表定义锁定（title/giver/goldReward 10/summary 含关键文案）', () => {
    const quest = getQuest('quest_blacksmith_mine_remnant')
    expect(quest).toBeDefined()
    expect(quest?.id).toBe('quest_blacksmith_mine_remnant')
    expect(quest?.title).toBe('矿洞余患')
    expect(quest?.giverNpcId).toBe('blacksmith')
    expect(quest?.goldReward).toBe(10)
    expect(quest?.summary).toContain('矿洞清理')
    expect(quest?.summary).toContain('废弃矿洞')
    expect(quest?.summary).toContain('魔化鼠')
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
    // TM-P1-010：草原投放既有 corrupted_wolf（追加在魔化兔之后，不替换）
    expect(getLocation('village_grassland')?.enemyIds).toEqual(['corrupted_rabbit', 'corrupted_wolf'])
    expect(getLocation('abandoned_mine')?.enemyIds).toEqual(['corrupted_rat'])
    expect(getLocation('rabbit_lair')?.enemyIds).toEqual(['dudu_rabbit'])
  })

  it('corrupted_wolf 仅投放于村外草原（其他地点无）', () => {
    for (const loc of Object.values(LOCATIONS)) {
      if (loc.id === 'village_grassland') {
        expect(loc.enemyIds ?? []).toContain('corrupted_wolf')
      } else {
        expect(loc.enemyIds ?? []).not.toContain('corrupted_wolf')
      }
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

describe('TM-P0-013：铁剑武器伤害加成数据约束', () => {
  it('iron_sword 为 weapon 且 weaponDamageBonus === 2', () => {
    const sword = getItem('iron_sword')
    expect(sword?.type).toBe('weapon')
    expect(sword?.weaponDamageBonus).toBe(2)
  })

  it('weaponDamageBonus 若存在必须为正整数且仅用于 weapon', () => {
    for (const item of Object.values(ITEMS)) {
      if (item.weaponDamageBonus !== undefined) {
        expect(Number.isInteger(item.weaponDamageBonus), `${item.id} weaponDamageBonus 正整数`).toBe(true)
        expect(item.weaponDamageBonus).toBeGreaterThan(0)
        expect(item.type, `${item.id} weaponDamageBonus 仅 weapon`).toBe('weapon')
      }
    }
  })

  it('其他物品不携带 weaponDamageBonus', () => {
    expect(getItem('healing_potion')?.weaponDamageBonus).toBeUndefined()
    expect(getItem('test_artifact')?.weaponDamageBonus).toBeUndefined()
    expect(getItem('rabbit_path')?.weaponDamageBonus).toBeUndefined()
  })
})

describe('TM-P0-020：铁矿石静态数据约束', () => {
  it('iron_ore 精确锁定（id/name/type/description/value）', () => {
    const ore = getItem('iron_ore')
    expect(ore?.id).toBe('iron_ore')
    expect(ore?.name).toBe('铁矿石')
    expect(ore?.type).toBe('material')
    expect(ore?.description).toBe('从废弃矿洞中取得的普通铁矿石，表面带着粗粝的金属光泽。')
    expect(ore?.value).toBe(5)
  })

  it('iron_ore 无 healAmount / weaponDamageBonus', () => {
    expect(getItem('iron_ore')?.healAmount).toBeUndefined()
    expect(getItem('iron_ore')?.weaponDamageBonus).toBeUndefined()
  })
})

describe('TM-P0-015：NPC greeting 对话数据约束', () => {
  it('所有 NPC greeting 为非空字符串（trim 后长度 > 0）', () => {
    for (const npc of Object.values(NPCS)) {
      expect(typeof npc.greeting).toBe('string')
      expect(npc.greeting.trim().length).toBeGreaterThan(0)
    }
  })

  it('三 NPC 固定 greeting 精确锁定', () => {
    expect(NPCS.village_elder!.greeting).toBe('村外的野兽越来越不安分，村里的人都很担心。')
    expect(NPCS.blacksmith!.greeting).toBe('出门冒险前把兵器检查仔细，别等到交手时才发现出了毛病。')
    expect(NPCS.apothecary!.greeting).toBe('最近村外采药不太安稳。要是受了伤，我这里还有些治疗药水。')
  })

  it('NPC 既有资料（id/name/role/locationId/summary）保持不变', () => {
    expect(NPCS.village_elder!.role).toBe('青石村村长')
    expect(NPCS.village_elder!.locationId).toBe('qingshi_village')
    expect(NPCS.blacksmith!.role).toBe('铁匠')
    expect(NPCS.blacksmith!.locationId).toBe('qingshi_village')
    expect(NPCS.apothecary!.role).toBe('药师')
    expect(NPCS.apothecary!.locationId).toBe('qingshi_village')
  })
})

describe('TM-P0-018：任务金币奖励数据约束', () => {
  it('quest_village_monsters.goldReward === 20', () => {
    expect(getQuest('quest_village_monsters')?.goldReward).toBe(20)
  })

  it('所有 goldReward 若存在必须为安全正整数', () => {
    for (const quest of Object.values(QUESTS)) {
      if (quest.goldReward !== undefined) {
        expect(Number.isSafeInteger(quest.goldReward), `${quest.id} goldReward 安全整数`).toBe(true)
        expect(quest.goldReward).toBeGreaterThan(0)
      }
    }
  })
})
