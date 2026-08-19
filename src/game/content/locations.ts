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
}

export const LOCATIONS: Record<string, LocationDefinition> = {
  qingshi_village: {
    id: 'qingshi_village',
    name: '青石村',
    description: '群山环抱中的小村，青石铺路，炊烟袅袅。近来村外野兽异动，人心惶惶。',
    connections: ['village_grassland', 'abandoned_mine'],
    enemyIds: [],
  },
  village_grassland: {
    id: 'village_grassland',
    name: '村外草原',
    description: '青石村外连绵的草坡，风吹草低，隐隐可见远处巢穴的轮廓。',
    connections: ['qingshi_village', 'rabbit_lair'],
    // TM-P1-010：投放既有 corrupted_wolf（数据零修改）；正式可见性仍由任务状态（仅 in_progress）在 GamePage/App 双守
    enemyIds: ['corrupted_rabbit', 'corrupted_wolf'],
  },
  abandoned_mine: {
    id: 'abandoned_mine',
    name: '废弃矿洞',
    description: '早已废弃的矿洞，洞口杂草丛生，深处传来若有若无的声响。',
    connections: ['qingshi_village'],
    enemyIds: ['corrupted_rat'],
  },
  rabbit_lair: {
    id: 'rabbit_lair',
    name: '兔王巢穴',
    description: '魔化兔群的巢穴，草木被啃噬得一片狼藉，深处盘踞着庞然大物。',
    requiredFlag: 'rabbit_lair_unlocked',
    connections: ['village_grassland'],
    enemyIds: ['dudu_rabbit'],
  },
  // TM-P1-023：第二区域落点——天龙城（青石村→天龙城正式跨越；本卡只做区域切换与落点：connections=[] 单向不可返回，enemyIds=[] 无假内容；P1-024 再开始城内内容）
  tianlong_city: {
    id: 'tianlong_city',
    name: '天龙城',
    description: '天龙王朝的皇城。高大的城墙、宽阔的街道与成片建筑构成这座繁华城市。',
    // TM-P1-024：天龙城与武馆双向连接（本卡唯一城市子区域）；TM-P1-025：增加黑石塔一层（未解锁时按钮 disabled）
    connections: ['tianlong_martial_hall', 'black_stone_tower_floor1'],
    enemyIds: [],
  },
  // TM-P1-024：天龙城第一段子区域——武馆（骑士队长马科驻地；无敌人、无其他连接）
  tianlong_martial_hall: {
    id: 'tianlong_martial_hall',
    name: '武馆',
    description: '天龙城中的武馆，来往的武者与守卫在这里操练，兵器碰撞声不时从场中传来。',
    connections: ['tianlong_city'],
    enemyIds: [],
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
  },
  // TM-P1-029：黑石塔三层（越过石阶后更深；守卫敌人骷髅女妖；击败后找到夔峒项链；未解锁时移动按钮可见但 disabled）
  black_stone_tower_floor3: {
    id: 'black_stone_tower_floor3',
    name: '黑石塔三层',
    description: '越过石阶后，塔内变得更加阴冷。残破石柱围绕着中央厅堂，低沉的哭嚎声从黑暗中传来。',
    requiredFlag: 'black_stone_tower_floor3_unlocked',
    connections: ['black_stone_tower_floor2'],
    enemyIds: ['skeleton_witch'],
  },
}
