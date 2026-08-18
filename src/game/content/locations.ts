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
    // TM-P1-024：天龙城与武馆双向连接（本卡唯一城市子区域；黑石塔仍不开放）
    connections: ['tianlong_martial_hall'],
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
}
