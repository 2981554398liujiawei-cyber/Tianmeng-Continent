/**
 * 敌人定义（TM-P0-002 + TM-P0-007）：内容身份 + V1 战斗平衡基线。
 */
export interface EnemyDefinition {
  id: string
  name: string
  /** 当前内容等级（非战斗平衡公式） */
  level: number
  description: string
  tags: string[]
  /** TM-P0-007：V1 战斗基线数据 */
  maxHp: number
  defense: number
  attackBonus: number
  damage: number
}

export const ENEMIES: Record<string, EnemyDefinition> = {
  corrupted_rabbit: {
    id: 'corrupted_rabbit',
    name: '魔化兔',
    level: 1,
    description: '双目赤红的兔子，皮毛下隐约透着黑气，攻击性极强。',
    tags: ['beast'],
    maxHp: 8,
    defense: 11,
    attackBonus: 2,
    damage: 2,
  },
  corrupted_rat: {
    id: 'corrupted_rat',
    name: '魔化鼠',
    level: 1,
    description: '比寻常老鼠大一倍的魔化鼠，成群出没于草丛与废墟。',
    tags: ['beast'],
    maxHp: 6,
    defense: 10,
    attackBonus: 2,
    damage: 2,
  },
  corrupted_wolf: {
    id: 'corrupted_wolf',
    name: '魔化狼',
    level: 2,
    description: '眸中泛着幽光的灰狼，是草原上最危险的猎手。',
    tags: ['beast'],
    maxHp: 12,
    defense: 12,
    attackBonus: 3,
    damage: 3,
  },
  dudu_rabbit: {
    id: 'dudu_rabbit',
    name: '嘟嘟兔',
    level: 3,
    description: '全身白色皮毛、胖胖嘟嘟的魔化兔BOSS，喜欢在草原游荡，是黄金兔子王的伴侣。',
    tags: ['beast', 'boss'],
    maxHp: 24,
    defense: 13,
    attackBonus: 4,
    damage: 4,
  },
  // TM-P1-025：黑石塔一层骷髅士兵（Lv.2 玩家进入第二地区后第一类普通敌人；无技能/状态/抗性/掉落——继续现有普通战斗规则；本卡不建骷髅队长 EnemyDefinition）
  skeleton_soldier: {
    id: 'skeleton_soldier',
    name: '骷髅士兵',
    level: 3,
    description: '在黑石塔一层大厅中机械游荡的骷髅士兵，骨骼碰撞时发出干涩的声响。',
    tags: ['undead'],
    maxHp: 14,
    defense: 12,
    attackBonus: 3,
    damage: 3,
  },
}
