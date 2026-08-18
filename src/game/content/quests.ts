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
  // TM-P1-010：第三个正式任务（复用既有 corrupted_wolf 敌人；仅矿洞清理完成后可发现；奖励走 generic goldReward，无关系/世界副作用）
  quest_grassland_wolf: {
    id: 'quest_grassland_wolf',
    title: '草原狼影',
    summary: '矿洞的威胁暂时平息后，村长提到草原上出现了魔化狼的踪迹，希望你前去处理。',
    giverNpcId: 'village_elder',
    goldReward: 25,
  },
  // TM-P1-017：第四正式主线任务（第二段主线入口；本卡只建立目标不新增地图——summary 保留【待补充】；无 goldReward，本卡不允许完成该任务）
  quest_golden_rabbit_search: {
    id: 'quest_golden_rabbit_search',
    title: '追寻黄金兔子王',
    summary: '《兔子的路径》指向黄金兔子王所在之地。具体目的地：【待补充】',
    giverNpcId: 'village_elder',
  },
  // TM-P1-021：首条正式支线（药师发布；复用现有地点/NPC/任务系统；仅第一主线完成后可发现；goldReward 10 走 generic 提交路径，无专属奖励 action）
  quest_apothecary_herb_route: {
    id: 'quest_apothecary_herb_route',
    title: '采药受阻',
    summary: '村外魔化野兽让采药变得不安全。药师希望你去村外草原查看采药区域的情况。',
    giverNpcId: 'apothecary',
    goldReward: 10,
  },
  // TM-P1-022：第二条正式支线（铁匠发布；复用废弃矿洞/魔化鼠/战斗系统；仅《矿洞清理》完成后可发现；无专属 flag/action，胜利窄分支推进 + generic 提交 goldReward 10）
  quest_blacksmith_mine_remnant: {
    id: 'quest_blacksmith_mine_remnant',
    title: '矿洞余患',
    summary: '矿洞清理后，铁匠仍担心里面还有魔化鼠活动，希望你再去废弃矿洞确认一次。',
    giverNpcId: 'blacksmith',
    goldReward: 10,
  },
}
