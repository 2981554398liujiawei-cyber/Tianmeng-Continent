/**
 * 线索内容注册表（TM-P2-008 Clue Journal V1）。
 *  - Clue = 玩家已经知道的信息（静态资料）；发现进度由 GameState.world.flags 的 `clue_<id>` 表达。
 *  - 新增线索必须同时在本注册表登记，store 的 addClue 只接受已注册的 id。
 *  - 纯数据注册表：不写状态、不随机、不改变任何任务逻辑（relatedQuestIds 仅为元数据）。
 */
import type { ClueDefinition } from '../types/clue'

export const CLUES: Record<string, ClueDefinition> = {
  clue_north_hill_tracks: { id: 'clue_north_hill_tracks', title: '北坡足迹', description: '旧猎路上有大型熊类与人类足迹交错，指向山谷。' },
  clue_spring_golden_fur: { id: 'clue_spring_golden_fur', title: '金色毛发', description: '毛发在泉雾中泛着微光，说明泉眼正在影响恰拉拉。' },
  clue_spirit_spring_trace: { id: 'clue_spirit_spring_trace', title: '神泉痕迹', description: '泉边爪痕与被折断的树枝，共同指向被守住的泉眼。' },
  // TM-P2-008 §8：迁移「兔子的路径」→ Clue（id=clue_rabbit_path；category=map；
  // relatedQuestIds=['quest_golden_rabbit_search']）。不改变 Golden Rabbit 剧情状态（HARD FREEZE）。
  clue_rabbit_path: {
    id: 'clue_rabbit_path',
    title: '兔子的路径',
    description: '一份指向黄金兔子王所在之地的藏宝图，上面以景物和路标标记着前往目标地点的路线。',
    source: '兔王巢穴',
    relatedQuestIds: ['quest_golden_rabbit_search'],
    category: 'map',
  },
  // TM-P2-008 §20：北门 / 北郊新增线索（禁关联黄金兔）。
  clue_north_drag_trail: {
    id: 'clue_north_drag_trail',
    title: '拖行痕迹',
    description: '从北门一路向北，荒草间有一道被重物拖拽过的痕迹。某样沉重的东西，曾被从官道上拖进了北面的荒原。',
    source: '天龙城北门',
    relatedQuestIds: ['quest_north_outskirts'],
    category: 'north',
  },
  clue_north_patrol_emblem: {
    id: 'clue_north_patrol_emblem',
    title: '巡逻队徽记',
    description: '一枚嵌在乱石间的骑士团徽记，与你见过的北门第三巡逻队徽记一致。他们确实曾抵达这片北郊。',
    source: '天龙城北郊',
    relatedQuestIds: ['quest_north_outskirts'],
    category: 'north',
  },
  clue_north_black_mane: {
    id: 'clue_north_black_mane',
    title: '黑色鬃毛',
    description: '袭击现场残留的黑色鬃毛，比寻常野狼更长更粗，散发着淡淡的魔化气息。像这样的狼毛，北门外也见过。',
    source: '天龙城北郊',
    relatedQuestIds: ['quest_north_outskirts'],
    category: 'north',
  },
  // TM-P2-009 §15：北线剧情《断旗余声》新线索（禁连接黄金兔；relatedQuestIds 仅登记本剧情任务）
  clue_north_broken_banner: {
    id: 'clue_north_broken_banner',
    title: '断裂队旗',
    description: '一面被撕成两半的骑士团战旗，绣着北门第三巡逻队的徽记。断裂处边缘平整——这不是野兽所为，更像是被利器斩断。',
    source: '北郊旧驿站',
    relatedQuestIds: ['quest_north_broken_banner'],
    category: 'north',
  },
  clue_north_black_wagon_tracks: {
    id: 'clue_north_black_wagon_tracks',
    title: '黑篷车辙',
    description: '驿站院墙外的车辙又深又新，辙印比寻常货运马车窄而深，一路延伸向西北荒野，被刻意用枯草掩盖过。',
    source: '北郊旧驿站',
    relatedQuestIds: ['quest_north_broken_banner'],
    category: 'north',
  },
  clue_north_alchemical_bait: {
    id: 'clue_north_alchemical_bait',
    title: '魔化诱饵',
    description: '散落在驿站角落的碎骨被一层淡紫色膏状物包裹，散发着令野兽狂躁的气息。有人用炼金诱饵把狼群引到了驿站。',
    source: '北郊旧驿站',
    relatedQuestIds: ['quest_north_broken_banner'],
    category: 'investigation',
  },
}

export function getClue(id: string): ClueDefinition | undefined {
  return CLUES[id]
}
