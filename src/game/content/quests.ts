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
  adventureXpReward?: number
}

export const QUESTS: Record<string, QuestDefinition> = {
  quest_village_monsters: {
    id: 'quest_village_monsters',
    title: '村外异动',
    summary: '青石村附近的野兽出现异常魔化迹象，村长需要冒险者调查村外情况。',
    giverNpcId: 'village_elder',
    goldReward: 20, adventureXpReward: 20,
  },
  // TM-P1-005：第二个正式任务（复用既有矿洞/魔化鼠/铁匠内容；解锁由 Store 窄前置守住）
  quest_mine_cleanup: {
    id: 'quest_mine_cleanup',
    title: '矿洞清理',
    summary: '废弃矿洞里的魔化鼠让进出变得危险，铁匠希望你先把这处威胁清理掉。',
    giverNpcId: 'blacksmith',
    goldReward: 15, adventureXpReward: 20,
  },
  // TM-P1-010：第三个正式任务（复用既有 corrupted_wolf 敌人；仅矿洞清理完成后可发现；奖励走 generic goldReward，无关系/世界副作用）
  quest_grassland_wolf: {
    id: 'quest_grassland_wolf',
    title: '草原狼影',
    summary: '矿洞的威胁暂时平息后，村长提到草原上出现了魔化狼的踪迹，希望你前去处理。',
    giverNpcId: 'village_elder',
    goldReward: 25, adventureXpReward: 60,
  },
  // TM-P1-017：第四正式主线任务（第二段主线入口；本卡只建立目标不新增地图——summary 表达目的地未知的自然剧情态，不编造地点；无 goldReward，本卡不允许完成该任务）
  quest_golden_rabbit_search: {
    id: 'quest_golden_rabbit_search',
    title: '追寻黄金兔子王',
    summary: '《兔子的路径》指向黄金兔子王所在之地，但地图上的标记还无法对应到任何已知地点。',
    giverNpcId: 'village_elder',
  },
  // TM-P1-021：首条正式支线（药师发布；复用现有地点/NPC/任务系统；仅第一主线完成后可发现；goldReward 10 走 generic 提交路径，无专属奖励 action）
  quest_apothecary_herb_route: {
    id: 'quest_apothecary_herb_route',
    title: '采药受阻',
    summary: '村外魔化野兽让采药变得不安全。药师希望你去村外草原查看采药区域的情况。',
    giverNpcId: 'apothecary',
    goldReward: 10, adventureXpReward: 25,
  },
  // TM-P1-022：第二条正式支线（铁匠发布；复用废弃矿洞/魔化鼠/战斗系统；仅《矿洞清理》完成后可发现；无专属 flag/action，胜利窄分支推进 + generic 提交 goldReward 10）
  quest_blacksmith_mine_remnant: {
    id: 'quest_blacksmith_mine_remnant',
    title: '矿洞余患',
    summary: '矿洞清理后，铁匠仍担心里面还有魔化鼠活动，希望你再去废弃矿洞确认一次。',
    giverNpcId: 'blacksmith',
    goldReward: 10, adventureXpReward: 25,
  },
  // TM-P1-024：第五正式主线《商人王财的麻烦》（武馆骑士队长马科发布；无 goldReward、本卡不允许完成任务；入口直接复用 localQuests，不建额外发现 prerequisite）
  quest_wangcai_trouble: {
    id: 'quest_wangcai_trouble',
    title: '商人王财的麻烦',
    summary: '骑士队长马科请你找到商人王财，了解他最近在黑石塔附近遇到的麻烦。',
    giverNpcId: 'knight_captain_make', adventureXpReward: 100,
  },
  // TM-P2-001 D2：Phase 2 新主线《北门失联》（马科发布；仅《商人王财的麻烦》完成后可发现；奖励 30 gold；不升级、不建经验系统）
  quest_north_gate_missing_patrol: {
    id: 'quest_north_gate_missing_patrol',
    title: '北门失联',
    summary: '一支前往天龙城北门外巡查的骑士小队迟迟没有返回。马科希望你先去北门附近寻找他们留下的踪迹。',
    giverNpcId: 'knight_captain_make',
    goldReward: 30, adventureXpReward: 100,
  },
  // TM-P2-004 第 28 节：《落樱越界》（伙伴招募/世界奇遇任务；不是 Sakura 的攻略任务）
  quest_sakura_boundary: {
    id: 'quest_sakura_boundary',
    title: '落樱越界',
    summary: '天龙城附近出现了不合时节的樱雨。花瓣背后的空间裂隙似乎连接着一个正在崩塌的陌生神域。',
    giverNpcId: 'sakura_yuko', adventureXpReward: 100,
  },
  // TM-P2-008 §16：北郊余波主线《北郊追踪》（马科发布；仅《北门失联》完成后可发现；奖励走 generic 提交路径 100 XP + 40 金）
  quest_north_outskirts: {
    id: 'quest_north_outskirts',
    title: '北郊追踪',
    summary: '失联的巡逻队显然没有停在北门。沿着他们留下的足迹追到北郊，查明这里到底发生了什么。',
    giverNpcId: 'knight_captain_make',
    goldReward: 40, adventureXpReward: 100,
  },
  // TM-P2-009 §9：北线主线《断旗余声》（马科发布；仅《北郊追踪》completed 后可发现；奖励走 generic 提交路径 120 XP + 50 金；Stage A-F 用 flags 表达，stage 保持 number）
  quest_north_broken_banner: {
    id: 'quest_north_broken_banner',
    title: '断旗余声',
    summary: '北郊深处一座废弃的驿站，挂着被斩断的巡逻队战旗。失联的第三巡逻队，似乎在这里留下了最后的痕迹。',
    giverNpcId: 'knight_captain_make',
    goldReward: 50, adventureXpReward: 120,
  },
  quest_tianlong_martial_trial: {
    id: 'quest_tianlong_martial_trial',
    title: '天龙武备试炼',
    summary: '马科邀请你进入天龙武备场，证明自己在压力下判断、战斗与管理资源的能力。',
    giverNpcId: 'knight_captain_make',
    goldReward: 50,
    adventureXpReward: 120,
  },
}
