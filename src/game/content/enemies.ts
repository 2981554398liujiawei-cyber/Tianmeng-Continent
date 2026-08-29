/**
 * 敌人定义（TM-P0-002 + TM-P0-007）：内容身份 + V1 战斗平衡基线。
 * TM-P2-006 After：attackPower 全表上调（平衡审计 P1/P2 修复），Combat V3 公式冻结不动。
 * TM-P2-007 After：新增 dropTable 引用（Loot V2 统一掉落入口）。
 */
import type { DropTable } from '../types/loot'
import { DROP_TABLES } from './lootTables'

export interface BossPhaseDefinition {
  id: string
  triggerHpRatio: number
  displayName: string
  attackBonus: number
  armorBonus: number
  skillIds: string[]
  healAmount: number
  logText: string
}

export interface EnemyDefinition {
  id: string
  name: string
  /** 当前内容等级（非战斗平衡公式） */
  level: number
  description: string
  tags: string[]
  /** TM-P2-002：V3 战斗基线数据（废弃 attackBonus/defense/damage 语义） */
  maxHp: number
  /** 护甲（原 defense 语义重定义：减伤用，与敏捷无关） */
  armor: number
  /** 原始攻击力（原 damage 语义） */
  attackPower: number
  /** 敏捷（命中判定用；攻击方 (敏捷+roll)/2 vs 防守方敏捷） */
  agility: number
  /** TM-P2-006：首次正式击败的冒险阅历奖励（遭遇奖励；重复击败 0 XP）。缺省无 XP */
  adventureXpReward?: number
  /** TM-P2-006：是否可逃跑（默认 true；强制剧情战 / Boss / 特殊封闭空间可设 false） */
  canEscape?: boolean
  /** TM-P2-007：Loot V2 掉落表（guaranteed / random / lucky；无表则无掉落） */
  dropTable?: DropTable
  /** TM-P2-009-R1 §9：敌人主动技能（skillIds 指向技能注册表；缺省 = 只会普攻） */
  skillIds?: string[]
  /** TM-P2-009-R1 §9：敌人 AI 行为画像（影响战斗内技能/普攻选择倾向） */
  aiProfile?: 'aggressive' | 'defensive' | 'caster' | 'pack' | 'boss'
  bossPhases?: BossPhaseDefinition[]
}

export const ENEMIES: Record<string, EnemyDefinition> = {
  forest_boar: { id: 'forest_boar', name: '山林野猪', level: 4, description: '在北坡拱土觅食的野猪，警觉而暴躁。', tags: ['beast'], maxHp: 22, armor: 12, attackPower: 18, agility: 8, adventureXpReward: 18, dropTable: DROP_TABLES.forest_boar, skillIds: ['enemy_boar_charge'], aiProfile: 'aggressive' },
  venom_bee_swarm: { id: 'venom_bee_swarm', name: '毒针蜂群', level: 4, description: '围绕泉雾盘旋的毒针蜂群。', tags: ['beast'], maxHp: 18, armor: 10, attackPower: 17, agility: 15, adventureXpReward: 18, dropTable: DROP_TABLES.venom_bee_swarm, skillIds: ['enemy_bat_swoop'], aiProfile: 'pack' },
  // TM-P2-012 §49：北坡高危普通黑熊（高 HP / 低 AGI；技能表与 Boss 恰拉拉刻意区分）
  forest_black_bear: { id: 'forest_black_bear', name: '山林黑熊', level: 4, description: '在北坡矮林里游荡的壮实黑熊，被惊扰时极其危险。', tags: ['beast'], maxHp: 32, armor: 13, attackPower: 20, agility: 6, adventureXpReward: 35, dropTable: DROP_TABLES.forest_black_bear, skillIds: ['enemy_bear_paw'], aiProfile: 'aggressive' },
  // TM-P2-013 §9：黑石塔四层普通敌人（authored 固定数值；无动态缩放）
  blackstone_sentinel: { id: 'blackstone_sentinel', name: '黑石守卫', level: 6, description: '由黑石构成的守卫傀儡，甲片沉重，行动迟缓却极难击穿。', tags: ['construct'], maxHp: 30, armor: 15, attackPower: 19, agility: 5, adventureXpReward: 30, dropTable: DROP_TABLES.blackstone_sentinel, skillIds: ['enemy_sentinel_crushing_maul'], aiProfile: 'aggressive' },
  black_mist_wraith: { id: 'black_mist_wraith', name: '黑雾残影', level: 6, description: '在黑石缝隙间游荡的雾状残影，攻击带着侵蚀性的寒意。', tags: ['spirit'], maxHp: 22, armor: 9, attackPower: 15, agility: 12, adventureXpReward: 26, dropTable: DROP_TABLES.black_mist_wraith, skillIds: ['enemy_mist_drain'], aiProfile: 'caster' },
  // TM-P2-013 §10：守卫 Boss（高 HP/高护甲/低中 AGI/强正面压力；无 Boss Phase——本章重点是探索+鉴定）
  // §34 Balance 调整后：HP 48 / armor 12 / attack 18，保证 Lv7 单人与组队胜率落在合理区间。
  blackstone_warden: {
    id: 'blackstone_warden', name: '黑石守门者', level: 7, description: '镇守黑石封印室的巨大守门者，周身甲片随深层共鸣缓缓亮起。', tags: ['construct', 'boss'],
    maxHp: 48, armor: 12, attackPower: 18, agility: 6, adventureXpReward: 110, canEscape: false, dropTable: DROP_TABLES.blackstone_warden, skillIds: ['enemy_warden_black_smash', 'enemy_warden_shock_armor', 'enemy_warden_gate_sweep'], aiProfile: 'boss',
  },
  black_bear_qialala: {
    id: 'black_bear_qialala', name: '黑熊恰拉拉', level: 5, description: '守在神泉前的巨大黑熊，金色泉光正在渗入它的毛发。', tags: ['beast', 'boss'],
    maxHp: 36, armor: 9, attackPower: 13, agility: 7, adventureXpReward: 80, canEscape: false, dropTable: DROP_TABLES.black_bear_qialala, skillIds: ['enemy_bear_rending_claw'], aiProfile: 'boss',
    bossPhases: [{ id: 'golden', triggerHpRatio: 0.5, displayName: '黄金战熊·恰拉拉', attackBonus: 3, armorBonus: 1, skillIds: ['enemy_golden_ground_slam', 'enemy_golden_rage_charge'], healAmount: 6, logText: '恰拉拉扑向泉边，金色光芒沿着毛发迅速蔓延。' }],
  },
  corrupted_rabbit: {
    id: 'corrupted_rabbit',
    name: '魔化兔',
    level: 1,
    description: '双目赤红的兔子，皮毛下隐约透着黑气，攻击性极强。',
    tags: ['beast'],
    maxHp: 8,
    armor: 11,
    attackPower: 16,
    agility: 10,
    adventureXpReward: 10,
    dropTable: DROP_TABLES.corrupted_rabbit,
    // TM-P2-009-R1 §10：魔化兔主动技能
    skillIds: ['enemy_rabbit_mad_bite'],
    aiProfile: 'aggressive',
  },
  corrupted_rat: {
    id: 'corrupted_rat',
    name: '魔化鼠',
    level: 1,
    description: '比寻常老鼠大一倍的魔化鼠，成群出没于草丛与废墟。',
    tags: ['beast'],
    maxHp: 6,
    armor: 10,
    attackPower: 16,
    agility: 10,
    adventureXpReward: 10,
    dropTable: DROP_TABLES.corrupted_rat,
    // TM-P2-009-R1 §10：魔化鼠主动技能（鼠群，偏好群攻节奏）
    skillIds: ['enemy_rat_swarm'],
    aiProfile: 'pack',
  },
  corrupted_wolf: {
    id: 'corrupted_wolf',
    name: '魔化狼',
    level: 2,
    description: '眸中泛着幽光的灰狼，是草原上最危险的猎手。',
    tags: ['beast'],
    maxHp: 12,
    armor: 12,
    attackPower: 14,
    agility: 12,
    adventureXpReward: 15,
    dropTable: DROP_TABLES.corrupted_wolf,
    // TM-P2-009-R1 §10：魔化狼主动技能（狼群）
    skillIds: ['enemy_wolf_vicious_pounce'],
    aiProfile: 'pack',
  },
  dudu_rabbit: {
    id: 'dudu_rabbit',
    name: '嘟嘟兔',
    level: 3,
    description: '全身白色皮毛、胖胖嘟嘟的魔化兔BOSS，喜欢在草原游荡，是黄金兔子王的伴侣。',
    tags: ['beast', 'boss'],
    maxHp: 24,
    armor: 13,
    attackPower: 18,
    agility: 10,
    adventureXpReward: 30,
    dropTable: DROP_TABLES.dudu_rabbit,
    // TM-P2-009-R1 §10：嘟嘟兔（Boss）≥2 技能
    skillIds: ['enemy_dudu_stomp', 'enemy_dudu_thunder_leap'],
    aiProfile: 'boss',
  },
  // TM-P1-025：黑石塔一层骷髅士兵（Lv.2 玩家进入第二地区后第一类普通敌人；无技能/状态/抗性/掉落——继续现有普通战斗规则）
  skeleton_soldier: {
    id: 'skeleton_soldier',
    name: '骷髅士兵',
    level: 3,
    description: '在黑石塔一层大厅中机械游荡的骷髅士兵，骨骼碰撞时发出干涩的声响。',
    tags: ['undead'],
    maxHp: 14,
    armor: 12,
    attackPower: 20,
    agility: 8,
    adventureXpReward: 20,
    dropTable: DROP_TABLES.skeleton_soldier,
    // TM-P2-009-R1 §10：骷髅士兵主动技能
    skillIds: ['enemy_bone_blade'],
    aiProfile: 'aggressive',
  },
  // TM-P1-026：黑石塔一层骷髅队长（一层 Boss——骷髅士兵头领；继续现有普通确定性 D20 战斗；无骨刺/反弹/重斩/击晕/Boss 技能系统/亡灵抗性/特殊 AI/掉落）
  skeleton_captain: {
    id: 'skeleton_captain',
    name: '骷髅队长',
    level: 4,
    description: '身材高大的骷髅，双手握着大剑，是黑石塔一层骷髅士兵的头领。',
    tags: ['undead', 'boss'],
    maxHp: 22,
    armor: 13,
    attackPower: 14,
    agility: 8,
    adventureXpReward: 30,
    dropTable: DROP_TABLES.skeleton_captain,
    // TM-P2-009-R1 §10：骷髅队长（Boss）≥2 技能
    skillIds: ['enemy_captain_heavy', 'enemy_captain_quake'],
    aiProfile: 'boss',
  },
  // TM-P1-027：黑石塔二层入口第一只——僵尸（固定顺序战斗第一场；继续现有普通 D20 战斗；无中毒/吸血/持续伤害/特殊恢复）
  tower_zombie: {
    id: 'tower_zombie',
    name: '僵尸',
    level: 4,
    description: '受到魔气侵染的腐败尸体，只剩下本能的杀戮欲望。',
    tags: ['undead'],
    maxHp: 18,
    armor: 12,
    attackPower: 18,
    agility: 6,
    adventureXpReward: 25,
    dropTable: DROP_TABLES.tower_zombie,
    // TM-P2-009-R1 §10：僵尸主动技能
    skillIds: ['enemy_zombie_grasp'],
    aiProfile: 'aggressive',
  },
  // TM-P1-027：黑石塔二层入口第二只——黑法师（僵尸击败后才出现；固定顺序战斗第二场；继续现有普通战斗模型；无盲目/暗属性/黑色火球/暴躁/特殊法术 AI）
  black_mage: {
    id: 'black_mage',
    name: '黑法师',
    level: 4,
    description: '生前曾是法师，受到魔气侵染后躲在黑暗中袭击闯入者。',
    tags: ['undead'],
    maxHp: 14,
    armor: 11,
    attackPower: 14,
    agility: 8,
    adventureXpReward: 30,
    dropTable: DROP_TABLES.black_mage,
    // TM-P2-009-R1 §10：黑法师（施法者）≥2 技能
    skillIds: ['enemy_dark_bolt', 'enemy_black_fire'],
    aiProfile: 'caster',
  },
  // TM-P1-028：黑石塔二层深处骷髅战士（入口区清场后出现的第三只；固定顺序战斗第三场；继续现有普通确定性 D20 战斗；无技能系统/重击/格挡/眩晕/亡灵抗性/特殊 AI/掉落）
  skeleton_warrior: {
    id: 'skeleton_warrior',
    name: '骷髅战士',
    level: 5,
    description: '手持锈蚀战刀的骷髅战士，浑身骨甲残破却仍透着凶悍的气息，镇守着黑石塔二层深处的小厅。',
    tags: ['undead'],
    maxHp: 20,
    armor: 13,
    attackPower: 18,
    agility: 8,
    adventureXpReward: 40,
    dropTable: DROP_TABLES.skeleton_warrior,
    // TM-P2-009-R1 §10：骷髅战士主动技能
    skillIds: ['enemy_warrior_cleave'],
    aiProfile: 'aggressive',
  },
  // TM-P1-029：黑石塔三层骷髅女妖（三层守卫；继续现有普通确定性 D20 战斗；不因「女妖」二字增加法术系统——无诅咒/恐惧/吸血/灵魂攻击/暗属性/召唤/特殊 AI）
  skeleton_witch: {
    id: 'skeleton_witch',
    name: '骷髅女妖',
    level: 5,
    description: '披着破碎长袍的骷髅女妖，嘶哑的哭嚎在黑暗厅堂中回荡。',
    tags: ['undead'],
    maxHp: 18,
    armor: 12,
    attackPower: 16,
    agility: 8,
    adventureXpReward: 45,
    dropTable: DROP_TABLES.skeleton_witch,
    // TM-P2-009-R1 §10：骷髅女妖（施法者）≥2 技能
    skillIds: ['enemy_witch_wail', 'enemy_bone_claw'],
    aiProfile: 'caster',
  },
  // TM-P2-001 D4：Phase 2 新敌人——黑鬃魔狼（北门外荒野；无技能系统，继续普通战斗模型；仅任务进行中+已调查痕迹+未击败时出现）
  black_mane_wolf: {
    id: 'black_mane_wolf',
    name: '黑鬃魔狼',
    level: 3,
    description: '鬃毛乌黑发亮的魔狼，碧绿的眼瞳里没有一丝畏惧，盯上了追查踪迹的你。',
    tags: ['beast'],
    maxHp: 15,
    armor: 12,
    attackPower: 16,
    agility: 12,
    adventureXpReward: 25,
    dropTable: DROP_TABLES.black_mane_wolf,
    // TM-P2-009-R1 §10：黑鬃魔狼主动技能
    skillIds: ['enemy_black_mane_bite'],
    aiProfile: 'aggressive',
  },
  // TM-P2-008 §23：荒原野狼（北郊荒原狼群主力；Lv2 普通野兽，结构仿 corrupted_wolf；无技能系统）
  wild_wolf: {
    id: 'wild_wolf',
    name: '荒原野狼',
    level: 2,
    description: '北郊荒原上成群出没的野狼，皮毛灰褐，眼瞳警觉而凶狠。',
    tags: ['beast'],
    maxHp: 10,
    armor: 11,
    attackPower: 14,
    agility: 12,
    adventureXpReward: 15,
    dropTable: DROP_TABLES.wild_wolf,
    // TM-P2-009-R1 §10：荒原野狼主动技能（狼群）
    skillIds: ['enemy_wild_bite'],
    aiProfile: 'pack',
  },
  // TM-P2-004 第 40 节：残灾之影（樱华神域·破碎边界专属；不是八歧大蛇本体/世界 Boss/九尾妖狐）
  // TM-P2-006 第 35 节：剧情契约链核心战 → canEscape=false（强制战斗）
  sakura_calamity_fragment: {
    id: 'sakura_calamity_fragment',
    name: '残灾之影',
    level: 3,
    description: '从神域裂隙中渗出的灾厄残影，没有固定形态，只是本能地撕扯着身边的一切。',
    tags: ['calamity', 'shadow'],
    maxHp: 14,
    armor: 11,
    attackPower: 14,
    agility: 10,
    adventureXpReward: 35,
    canEscape: false,
    dropTable: DROP_TABLES.sakura_calamity_fragment,
    // TM-P2-009-R1 §10：残灾之影主动技能（快而凶）
    skillIds: ['enemy_calamity_lunge'],
    aiProfile: 'aggressive',
  },
  // TM-P2-009-R1 §11.4：新增低复杂度通用敌人——洞穴蝙蝠（废弃矿洞标准练级怪；Lv1 高敏捷低血量，快攻节奏）
  cave_bat: {
    id: 'cave_bat',
    name: '洞穴蝙蝠',
    level: 1,
    description: '盘踞在矿洞深处的巨型蝙蝠，被魔气熏染后格外凶戾。',
    tags: ['beast'],
    maxHp: 5,
    armor: 9,
    attackPower: 12,
    agility: 14,
    adventureXpReward: 8,
    dropTable: DROP_TABLES.cave_bat,
    // TM-P2-009-R1 §10：洞穴蝙蝠主动技能
    skillIds: ['enemy_bat_swoop'],
    aiProfile: 'aggressive',
  },
  // TM-P2-009-R1 §11.4：新增低复杂度通用敌人——荒原野猪（北郊非狼系野兽；Lv2 高血低敏，慢速重装节奏）
  wild_boar: {
    id: 'wild_boar',
    name: '荒原野猪',
    level: 2,
    description: '北郊荒野上横冲直撞的野猪，皮糙肉厚，獠牙锋利。',
    tags: ['beast'],
    maxHp: 14,
    armor: 12,
    attackPower: 15,
    agility: 8,
    adventureXpReward: 12,
    dropTable: DROP_TABLES.wild_boar,
    // TM-P2-009-R1 §10：荒原野猪主动技能
    skillIds: ['enemy_boar_charge'],
    aiProfile: 'aggressive',
  },
  trial_soldier: {
    id: 'trial_soldier', name: '武备场士兵', level: 3,
    description: '身披训练甲的武馆士兵，擅长以盾牌稳住阵线。', tags: ['humanoid', 'training'],
    maxHp: 10, armor: 11, attackPower: 13, agility: 8,
    skillIds: ['trial_shield_bash'], aiProfile: 'defensive',
  },
  trial_duelist: {
    id: 'trial_duelist', name: '武备场教习', level: 4,
    description: '负责检验武者节奏的武馆教习，出手沉稳而精准。', tags: ['humanoid', 'training'],
    maxHp: 12, armor: 11, attackPower: 15, agility: 10,
    skillIds: ['trial_breaking_slash'], aiProfile: 'aggressive',
  },
  trial_scout: {
    id: 'trial_scout', name: '武备场斥候', level: 3,
    description: '在沙地边缘高速移动的训练斥候，专门寻找破绽。', tags: ['humanoid', 'training'],
    maxHp: 8, armor: 10, attackPower: 13, agility: 14,
    skillIds: ['trial_lunge'], aiProfile: 'pack',
  },
  trial_apprentice_mage: {
    id: 'trial_apprentice_mage', name: '武备场术士', level: 4,
    description: '负责模拟法术压力的武馆学徒，法术尚不纯熟但不可大意。', tags: ['humanoid', 'training', 'magic'],
    maxHp: 14, armor: 10, attackPower: 13, agility: 9,
    skillIds: ['trial_arcane_bolt'], aiProfile: 'caster',
  },
}
