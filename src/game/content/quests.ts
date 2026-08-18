/**
 * 任务定义（TM-P0-002）：任务是什么（静态资料）。
 * 与 QuestState（玩家当前做到哪里）严格分离；不含 objectives/奖励/分支/状态机。
 */
export interface QuestDefinition {
  id: string
  title: string
  summary: string
  /** 发布任务的 NPC ID */
  giverNpcId: string
  /** 任务完成固定金币奖励（TM-P0-018）；缺省 0 */
  goldReward?: number
}

export const QUESTS: Record<string, QuestDefinition> = {
  quest_village_monsters: {
    id: 'quest_village_monsters',
    title: '村外异动',
    summary: '青石村附近的野兽出现异常魔化迹象，村长需要冒险者调查村外情况。',
    giverNpcId: 'village_elder',
    goldReward: 20,
  },
  // TM-P1-005：第二个正式任务（复用既有矿洞/魔化鼠/铁匠内容；解锁由 Store 窄前置守住）
  quest_mine_cleanup: {
    id: 'quest_mine_cleanup',
    title: '矿洞清理',
    summary: '废弃矿洞里的魔化鼠让进出变得危险，铁匠希望你先把这处威胁清理掉。',
    giverNpcId: 'blacksmith',
    goldReward: 15,
  },
}
