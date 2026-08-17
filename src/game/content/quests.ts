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
}

export const QUESTS: Record<string, QuestDefinition> = {
  quest_village_monsters: {
    id: 'quest_village_monsters',
    title: '村外异动',
    summary: '青石村附近的野兽出现异常魔化迹象，村长需要冒险者调查村外情况。',
    giverNpcId: 'village_elder',
  },
}
