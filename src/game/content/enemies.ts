/**
 * 敌人定义（TM-P0-002）：只定义敌人的内容身份，不实现战斗模型/平衡公式。
 */
export interface EnemyDefinition {
  id: string
  name: string
  /** 当前内容等级（非战斗平衡公式） */
  level: number
  description: string
  tags: string[]
}

export const ENEMIES: Record<string, EnemyDefinition> = {
  corrupted_rabbit: {
    id: 'corrupted_rabbit',
    name: '魔化兔',
    level: 1,
    description: '双目赤红的兔子，皮毛下隐约透着黑气，攻击性极强。',
    tags: ['beast'],
  },
  corrupted_rat: {
    id: 'corrupted_rat',
    name: '魔化鼠',
    level: 1,
    description: '比寻常老鼠大一倍的魔化鼠，成群出没于草丛与废墟。',
    tags: ['beast'],
  },
  corrupted_wolf: {
    id: 'corrupted_wolf',
    name: '魔化狼',
    level: 2,
    description: '眸中泛着幽光的灰狼，是草原上最危险的猎手。',
    tags: ['beast'],
  },
  dudu_rabbit: {
    id: 'dudu_rabbit',
    name: '嘟嘟兔',
    level: 3,
    description: '盘踞巢穴深处的巨大兔王，魔化最深，据说吞吃过路者。',
    tags: ['beast', 'boss'],
  },
}
