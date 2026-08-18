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
  // TM-P1-025：黑石塔一层骷髅士兵（Lv.2 玩家进入第二地区后第一类普通敌人；无技能/状态/抗性/掉落——继续现有普通战斗规则）
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
  // TM-P1-026：黑石塔一层骷髅队长（一层 Boss——骷髅士兵头领；继续现有普通确定性 D20 战斗；无骨刺/反弹/重斩/击晕/Boss 技能系统/亡灵抗性/特殊 AI/掉落）
  skeleton_captain: {
    id: 'skeleton_captain',
    name: '骷髅队长',
    level: 4,
    description: '身材高大的骷髅，双手握着大剑，是黑石塔一层骷髅士兵的头领。',
    tags: ['undead', 'boss'],
    maxHp: 22,
    defense: 13,
    attackBonus: 4,
    damage: 4,
  },
  // TM-P1-027：黑石塔二层入口第一只——僵尸（固定顺序战斗第一场；继续现有普通 D20 战斗；无中毒/吸血/持续伤害/特殊恢复）
  tower_zombie: {
    id: 'tower_zombie',
    name: '僵尸',
    level: 4,
    description: '受到魔气侵染的腐败尸体，只剩下本能的杀戮欲望。',
    tags: ['undead'],
    maxHp: 18,
    defense: 12,
    attackBonus: 4,
    damage: 4,
  },
  // TM-P1-027：黑石塔二层入口第二只——黑法师（僵尸击败后才出现；固定顺序战斗第二场；继续现有普通战斗模型；无盲目/暗属性/黑色火球/暴躁/特殊法术 AI）
  black_mage: {
    id: 'black_mage',
    name: '黑法师',
    level: 4,
    description: '生前曾是法师，受到魔气侵染后躲在黑暗中袭击闯入者。',
    tags: ['undead'],
    maxHp: 14,
    defense: 11,
    attackBonus: 5,
    damage: 4,
  },
  // TM-P1-028：黑石塔二层深处骷髅战士（入口区清场后出现的第三只；固定顺序战斗第三场；继续现有普通确定性 D20 战斗；无技能系统/重击/格挡/眩晕/亡灵抗性/特殊 AI/掉落）
  skeleton_warrior: {
    id: 'skeleton_warrior',
    name: '骷髅战士',
    level: 5,
    description: '手持锈蚀战刀的骷髅战士，浑身骨甲残破却仍透着凶悍的气息，镇守着黑石塔二层深处的小厅。',
    tags: ['undead'],
    maxHp: 20,
    defense: 13,
    attackBonus: 4,
    damage: 4,
  },
}
