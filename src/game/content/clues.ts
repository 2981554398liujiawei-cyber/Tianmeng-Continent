/**
 * 线索内容注册表（TM-P2-008 Clue Journal V1）。
 *  - Clue = 玩家已经知道的信息（静态资料）；发现进度由 GameState.world.flags 的 `clue_<id>` 表达。
 *  - 新增线索必须同时在本注册表登记，store 的 addClue 只接受已注册的 id。
 *  - 纯数据注册表：不写状态、不随机、不改变任何任务逻辑（relatedQuestIds 仅为元数据）。
 */
import type { ClueDefinition } from '../types/clue'

export const CLUES: Record<string, ClueDefinition> = {
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
}

export function getClue(id: string): ClueDefinition | undefined {
  return CLUES[id]
}
