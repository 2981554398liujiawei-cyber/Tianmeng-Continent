/** 地点定义（TM-P0-002 + TM-P0-008）：静态内容数据，仅描述地点身份与连接，不实现移动逻辑 */
export interface LocationDefinition {
  id: string
  name: string
  description: string
  /** 相邻可前往的地点 ID（无向连接） */
  connections: string[]
  /** 进入该地点所需的剧情 Flag（未设置时不可进入） */
  requiredFlag?: string
  /** 该地点可遭遇的敌人 ID（TM-P0-008；空数组表示无威胁） */
  enemyIds?: string[]
  /** TM-P2-007 §7：该地点可遭遇的 Encounter ID（Encounter V2 权威入口；与 enemyIds 并存，不删除 enemyIds） */
  encounters?: string[]
}

export const LOCATIONS: Record<string, LocationDefinition> = {
  qingshi_village: {
    id: 'qingshi_village',
    name: '青石村',
    description: '群山环抱中的小村，青石铺路，炊烟袅袅。近来村外野兽异动，人心惶惶。',
    // TM-P2-012 §4/§45/§83：神泉章节起官道重新开放——玩家可从天龙城返回青石村（P1-023 的单向离开不再是永久限制）
    connections: ['village_grassland', 'abandoned_mine', 'qingshi_north_hills', 'tianlong_city'],
    enemyIds: [],
  },
  qingshi_north_hills: {
    id: 'qingshi_north_hills', name: '青石北坡', description: '北坡林线起伏，旧猎路在草木之间断断续续地通向山谷。',
    // TM-P2-012 §50：低（野猪）/ 标准（蜂群×2）/ 高危（山林黑熊）三层可重复威胁
    connections: ['qingshi_village', 'spirit_spring_valley'], enemyIds: ['forest_boar', 'venom_bee_swarm', 'forest_black_bear'],
    encounters: ['encounter_forest_boar', 'encounter_venom_bee_pair', 'encounter_forest_black_bear'],
  },
  spirit_spring_valley: {
    id: 'spirit_spring_valley', name: '神泉山谷', description: '金色雾气笼罩的隐秘山谷，泉眼旁留着巨兽反复踏过的爪痕。',
    requiredFlag: 'spirit_spring_valley_unlocked', connections: ['qingshi_north_hills'],
    // TM-P2-012 §51：标准混合遭遇 + Boss story
    enemyIds: ['forest_boar', 'venom_bee_swarm', 'black_bear_qialala'],
    encounters: ['encounter_valley_beasts', 'encounter_black_bear_qialala'],
  },
  village_grassland: {
    id: 'village_grassland',
    name: '村外草原',
    description: '青石村外连绵的草坡，风吹草低，隐隐可见远处巢穴的轮廓。',
    connections: ['qingshi_village', 'rabbit_lair'],
    // TM-P1-010：投放既有 corrupted_wolf（数据零修改）；正式可见性仍由任务状态（仅 in_progress）在 GamePage/App 双守
    enemyIds: ['corrupted_rabbit', 'corrupted_wolf'],
    // TM-P2-007 §7：Encounter V2 挂载（与 enemyIds 一一对应）；TM-P2-009-R1 §11：+ 魔化兔群（high repeatable）
    encounters: ['encounter_corrupted_rabbit', 'encounter_corrupted_wolf', 'encounter_grassland_rabbit_pair'],
  },
  abandoned_mine: {
    id: 'abandoned_mine',
    name: '废弃矿洞',
    description: '早已废弃的矿洞，洞口杂草丛生，深处传来若有若无的声响。',
    connections: ['qingshi_village'],
    enemyIds: ['corrupted_rat', 'cave_bat'],
    // TM-P2-009-R1 §11：矿洞 3 层威胁（鼠低 / 蝙蝠标准 / 混合高危）
    encounters: ['encounter_corrupted_rat', 'encounter_cave_bat', 'encounter_mine_mixed'],
  },
  rabbit_lair: {
    id: 'rabbit_lair',
    name: '兔王巢穴',
    description: '魔化兔群的巢穴，草木被啃噬得一片狼藉，深处盘踞着庞然大物。',
    requiredFlag: 'rabbit_lair_unlocked',
    connections: ['village_grassland'],
    enemyIds: ['dudu_rabbit'],
    encounters: ['encounter_dudu_rabbit'],
  },
  // TM-P1-023：第二区域落点——天龙城（青石村→天龙城正式跨越；本卡只做区域切换与落点：connections=[] 单向不可返回，enemyIds=[] 无假内容；P1-024 再开始城内内容）
  tianlong_city: {
    id: 'tianlong_city',
    name: '天龙城',
    description: '天龙王朝的皇城。高大的城墙、宽阔的街道与成片建筑构成这座繁华城市。',
    // TM-P1-024：天龙城与武馆双向连接（本卡唯一城市子区域）；TM-P1-025：增加黑石塔一层（未解锁时按钮 disabled）；TM-P2-001 D1：增加北门
    // TM-P2-012 §4：增加青石村（神泉官道重新开放，双向）
    connections: ['tianlong_martial_hall', 'black_stone_tower_floor1', 'tianlong_north_gate', 'qingshi_village'],
    enemyIds: [],
  },
  // TM-P1-024：天龙城第一段子区域——武馆（骑士队长马科驻地；无敌人、无其他连接）
  tianlong_martial_hall: {
    id: 'tianlong_martial_hall',
    name: '武馆',
    description: '天龙城中的武馆，来往的武者与守卫在这里操练，兵器碰撞声不时从场中传来。',
    connections: ['tianlong_city', 'tianlong_martial_trial_ground'],
    enemyIds: [],
  },
  tianlong_martial_trial_ground: {
    id: 'tianlong_martial_trial_ground',
    name: '天龙武备场',
    description: '武馆后方的封闭演武场，木桩、沙地与练习兵器记录着一代代武者的步伐。',
    requiredFlag: 'martial_trial_invited',
    connections: ['tianlong_martial_hall'],
    enemyIds: ['trial_soldier', 'trial_duelist', 'trial_scout', 'trial_apprentice_mage'],
    encounters: ['encounter_trial_warrior', 'encounter_trial_knight', 'encounter_trial_ranger', 'encounter_trial_mage'],
  },
  // TM-P1-025：黑石塔一层（第二地区第一段地牢——解锁路线+骷髅士兵战斗；未解锁时移动按钮可见但 disabled，复用 requiredFlag；不建独立入口节点/城外道路）
  black_stone_tower_floor1: {
    id: 'black_stone_tower_floor1',
    name: '黑石塔一层',
    description: '黑石砌成的幽暗通道通向几处大厅，脚步声与骨骼摩擦声在塔内回荡。',
    requiredFlag: 'black_stone_tower_unlocked',
    // TM-P1-027：一层连接增加黑石塔二层（二层未解锁时移动按钮 disabled；天龙城 ↔ 一层 ↔ 二层）
    connections: ['tianlong_city', 'black_stone_tower_floor2'],
    // TM-P1-026：一层普通敌人骷髅士兵 + 一层 Boss 骷髅队长（同一场景节点；不建新大厅 Location）
    enemyIds: ['skeleton_soldier', 'skeleton_captain'],
    // TM-P2-009-R1 §11：+ 骷髅士兵巡队（standard repeatable）
    encounters: ['encounter_skeleton_soldier', 'encounter_skeleton_captain', 'encounter_floor1_soldier_pair'],
  },
  // TM-P1-027/P1-028：黑石塔二层（严格固定顺序战斗：僵尸→黑法师→骷髅战士；深度由剧情阶段控制，本卡不新建「二层深处」Location；三层未开放时移动按钮可见但 disabled）
  black_stone_tower_floor2: {
    id: 'black_stone_tower_floor2',
    name: '黑石塔二层',
    description: '曲折的黑石通道向深处延伸，腐败气息与幽暗魔力混在潮冷的空气中。',
    requiredFlag: 'black_stone_tower_floor2_unlocked',
    // TM-P1-029：二层连接三层（三层未解锁时移动按钮 disabled）
    connections: ['black_stone_tower_floor1', 'black_stone_tower_floor3'],
    // TM-P1-028：二层严格固定顺序三敌（僵尸→黑法师→骷髅战士）
    enemyIds: ['tower_zombie', 'black_mage', 'skeleton_warrior'],
    // TM-P2-007 §7.5：二层同时挂非主线可选多怪遭遇「残破巡逻队」（不进主线，可忽略）
    encounters: [
      'encounter_tower_zombie', 'encounter_black_mage', 'encounter_skeleton_warrior', 'encounter_broken_patrol',
      ...(import.meta.env?.DEV === true && import.meta.env.VITE_QA_COMBAT_V7 === '1' ? ['encounter_qa_combat_v7_four'] : []),
    ],
  },
  // TM-P1-029：黑石塔三层（越过石阶后更深；守卫敌人骷髅女妖；击败后找到夔峒项链；未解锁时移动按钮可见但 disabled）
  black_stone_tower_floor3: {
    id: 'black_stone_tower_floor3',
    name: '黑石塔三层',
    description: '越过石阶后，塔内变得更加阴冷。残破石柱围绕着中央厅堂，低沉的哭嚎声从黑暗中传来。',
    requiredFlag: 'black_stone_tower_floor3_unlocked',
    connections: ['black_stone_tower_floor2'],
    enemyIds: ['skeleton_witch'],
    // TM-P2-009-R1 §11：+ 女妖与护卫（high repeatable）
    encounters: ['encounter_skeleton_witch', 'encounter_floor3_witch_escort'],
  },
  // TM-P2-001 D1：Phase 2 新地点——天龙城北门（与天龙城双向连接；北门本身无需 requiredFlag，任何时候可参观；任务行动只在正确状态出现）
  // TM-P2-008 §17：北门与北郊双向连接（北郊 requiredFlag=north_outskirts_unlocked 未解锁时 travel 拒绝）
  tianlong_north_gate: {
    id: 'tianlong_north_gate',
    name: '天龙城北门',
    description: '高大的城门向北方荒野敞开。往来的商旅明显比南城稀少，城墙下能看到巡逻骑士留下的马蹄印。',
    connections: ['tianlong_city', 'tianlong_north_outskirts'],
    enemyIds: ['black_mane_wolf'],
    encounters: ['encounter_black_mane_wolf'],
  },
  // TM-P2-008 §17：北郊（追踪 Stage A 写 north_outskirts_unlocked 后解锁；连接北门）
  tianlong_north_outskirts: {
    id: 'tianlong_north_outskirts',
    name: '天龙城北郊',
    description: '荒草与碎石的官道一路向北延伸，两侧是起伏的荒原，风里隐约传来野兽的嚎叫。',
    requiredFlag: 'north_outskirts_unlocked',
    // TM-P2-009 §11：北郊连接北郊旧驿站（驿站 requiredFlag 未解锁时 travel 拒绝）
    connections: ['tianlong_north_gate', 'tianlong_north_abandoned_waystation'],
    // TM-P2-008 §23：单只落单野狼 + 荒原狼群（狼群首次胜利后不再出现；可选遭遇不阻塞主线）
    // TM-P2-009-R1 §11：+ 荒原野猪（low repeatable）+ 黑鬃魔狼伏击（high repeatable）
    enemyIds: ['wild_wolf', 'wild_boar'],
    encounters: ['encounter_wild_wolf', 'encounter_steppe_wolf_pack', 'encounter_north_boar', 'encounter_north_mane_pack'],
  },
  // TM-P2-009 §11：北线新地点——北郊旧驿站（《断旗余声》Stage A 写 north_waystation_unlocked 后解锁；连接北郊；驿站狼群遭遇为 Stage C 战斗解）
  tianlong_north_abandoned_waystation: {
    id: 'tianlong_north_abandoned_waystation',
    name: '北郊旧驿站',
    description: '半塌的驿站立在官道岔口，门板被风蚀得发白。院内一面战旗半悬空中，断口处的旗布在北风里轻轻晃动。',
    requiredFlag: 'north_waystation_unlocked',
    connections: ['tianlong_north_outskirts'],
    enemyIds: [],
    encounters: ['encounter_waystation_wolf_pack'],
  },
  // TM-P2-004 第 33/34 节：樱华神域·破碎边界（特殊事件地点；connections=[] 不允许普通 Travel 进入，只能通过 Sakura 特殊事件；完成后返回天龙城）
  sakura_domain_fragment: {
    id: 'sakura_domain_fragment',
    name: '樱华神域·破碎边界',
    description: '漂浮的石阶、残破神社、倒悬樱树与不断撕裂的天空。这是樱花女神神域崩落的一角，正随着裂隙缓慢坍缩。',
    connections: [],
    enemyIds: ['sakura_calamity_fragment'],
    encounters: ['encounter_sakura_calamity_fragment'],
  },
}
