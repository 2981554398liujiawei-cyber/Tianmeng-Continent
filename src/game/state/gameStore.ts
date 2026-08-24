import { create } from 'zustand'
import type { CharacterCreationInput, ClueDefinition, GameState, QuestStatus } from '../types'
import { createInitialGameState } from '../content/initial'
import { checkTravel } from '../rules/exploration'
import { canTransitionQuestStatus } from '../rules/quest'
import { getClue, getEnemy, getEncounter, getItem, getLocation, getMount, getNpc, getQuest } from '../content'
import { checkEncounter, currentEncounterVariantId, resolveEncounterVariant, singleEnemyIdOf } from '../rules/encounter'
import { performD20Check, CHECK_DC, type D20CheckResult } from '../rules/d20'
import { KNIGHT_POWER_STRIKE_MP_COST, MAGE_SPELL_MP_COST, WARRIOR_SUPPRESS_STRIKE_MP_COST } from '../rules/combat'
import { applyAdventureXpReward } from '../rules/progression'
import { getEnemyFirstKillXp, FIRST_KILL_FLAG_ENEMIES, resolveEncounterVictoryXp } from '../rules/combatXp'
import { SINGLE_ENEMY_ENCOUNTERS } from '../content/encounters'
import type { EncounterDefinition } from '../types/encounter'
import { checkEquipItem } from '../rules/equipment'
import { canBuyMerchantItem, getMerchantOffer } from '../rules/merchant'
import { rollLoot } from '../rules/loot'
import type { LootGrant } from '../types/loot'
import { resolveEncounterLoot } from '../rules/partyCombat'
import type { EncounterLootSummary } from '../rules/partyCombat'
import { checkSkillUse } from '../rules/skill'
import { rollLuckCheck, resolveLuckCheck, type LuckCheckResult } from '../rules/luck'
import { canExploreMountTrail, canSearchNorthOutskirtsByMount, canSearchWaystationByMount, getEffectiveCharacterAttributes, hasTravelTag, MOUNT_TRAIL_REWARD_GOLD } from '../rules/mount'
import { resolveD20Check, rollD20 } from '../rules/d20'
import {
  canTriggerSakuraEncounter,
  canEnterSakuraDomain,
  canMeetSakura,
  canMndCheckSakura,
  canLuckRescueSakura,
  canOfferGuest,
  canFightCalamity,
  canAcceptContract,
  canReofferContract,
  isFirstRestTalkReady,
  canTriggerSakuraBanter,
  isSakuraPresent,
  SAKURA_FLAGS,
  SAKURA_MND_DC,
  SAKURA_LUCK_DC,
  SAKURA_DOMAIN_LOCATION,
  SAKURA_CALAMITY_ENEMY_ID,
} from '../rules/sakura'
import {
  createCompanionState,
  applyLongRest,
  activateCompanion,
  deactivateCompanion,
  canRejoinParty,
} from '../rules/companion'
import {
  createInitialRelationship,
  applyRelationshipDelta,
  canTalkGain,
  markTalk,
  hasGiftedThisRest,
  markGifted,
  giftAffectionGain,
} from '../rules/relationship'
import {
  getCompanion,
  MOUNT_PRICES,
  sakuraDefaultSkillIds,
  SAKURA_COMPANION_ID,
  getRelationshipProfile,
} from '../content'

/** TM-P1-003：《村外异动》完成后村长一次性回应事件 ID（唯一代码来源，GamePage 亦读取） */
export const VILLAGE_ELDER_POST_QUEST_EVENT_ID = 'village_elder_post_quest_response'
/** TM-P2-009 §14：《断旗余声》Stage D 救出沈拓活动事件 ID（activityEvents.ts 已登记文案） */
export const NORTH_SURVIVOR_RESCUED_EVENT_ID = 'north_survivor_rescued'
/** TM-P2-009 §17：《断旗余声》完成后骑士试炼邀请活动事件 ID（activityEvents.ts 已登记文案；试炼本体不实现） */
export const KNIGHT_TRIAL_INVITED_EVENT_ID = 'knight_trial_invited'
/** TM-P2-010：职业无关的武备试炼邀请（旧 knight_trial_invited 保留兼容）。 */
export const MARTIAL_TRIAL_INVITED_FLAG = 'martial_trial_invited'
export const MARTIAL_TRIAL_QUEST_ID = 'quest_tianlong_martial_trial'
export const MARTIAL_TRIAL_GROUND_ID = 'tianlong_martial_trial_ground'
const MARTIAL_TRIAL_BRONZE_MEDAL_ID = 'tianlong_martial_medal'

export type MartialTrialObservationMethod = 'str' | 'con' | 'agi' | 'mnd' | 'lck'
export type MartialTrialObservationResult = { ok: boolean; success?: boolean; progressed?: boolean; method?: MartialTrialObservationMethod }
import {
  deleteSlot as storageDeleteSlot,
  exportSaves as storageExportSaves,
  hasAnySave,
  importSaves as storageImportSaves,
  loadMostRecentSave,
  loadSlot as storageLoadSlot,
  loadIndex,
  migrateSave,
  saveSlot as persistSlot,
  type SavesIndex,
  type SlotId,
  type SlotSummary,
} from '../utils/storage'

interface GameStoreState {
  /** 当前游戏状态；null 表示尚未开始 */
  gameState: GameState | null
  /** 是否存在可继续的存档（任一槽位有效） */
  hasSave: boolean
  /** 五槽位摘要（姓名/职业/等级/位置/时间；空槽 null；TM-P2-002 G） */
  slots: SavesIndex['slots']
  /** 最近一次保存的槽位（Continue 入口；TM-P2-002 G） */
  lastSavedSlot: SlotId | null

  // 存档生命周期（TM-P2-002 G/H：五槽位 + V1 迁移）
  /** 新建游戏：传入创建输入则按玩家数据生成角色，否则生成默认开发角色（TM-P0-004） */
  newGame: (input?: CharacterCreationInput) => void
  /** 读取最近一次有效存档（Continue）；成功返回 true（自动执行 V1→V2 迁移） */
  loadGame: () => boolean
  /** 保存到指定槽位；成功返回 true（TM-P2-002 G：保存前需覆盖确认由 UI 负责） */
  saveGame: (slotId: SlotId) => boolean
  /** 读取指定槽位；成功返回 true */
  loadSlot: (slotId: SlotId) => boolean
  /** 删除指定槽位；成功返回 true（坏槽不影响其他槽） */
  deleteSlot: (slotId: SlotId) => boolean
  /** 删除最近存档槽位（兼容旧调用方；DevStatePage 使用） */
  deleteGame: () => void
  /** 导出五槽位 JSON（TM-P2-002 I） */
  exportSaves: () => string
  /** 导入五槽位 JSON：完整校验，非法不覆盖（TM-P2-002 I） */
  importSaves: (json: string) => boolean
  /** TM-P2-005：云导入/外部写入后刷新槽位索引（不触碰 gameState 内存态） */
  refreshSlots: () => void

  // 状态修改（数据流验证用最小动作集）
  /** 开发验证入口：直接设置地点（正式游戏页面禁止调用，仅开发者控制台使用，TM-P0-005） */
  setCurrentLocation: (locationId: string) => void
  /** 正式移动入口：Store 自身执行 checkTravel 校验，非法移动不改变 GameState（TM-P0-005） */
  travelToLocation: (targetLocationId: string) => boolean

  // 任务生命周期（TM-P0-006）
  /** 发现任务：不存在则创建 available QuestState；undiscovered → available；其余状态不重复创建 */
  discoverQuest: (questId: string) => boolean
  /** 接受任务：仅 available → in_progress */
  acceptQuest: (questId: string) => boolean
  /** 标记可完成：仅 in_progress → completable */
  markQuestCompletable: (questId: string) => boolean
  /** 完成任务：仅 completable → completed，不发奖励 */
  completeQuest: (questId: string) => boolean
  /** 任务失败：仅 in_progress/completable → failed（终态） */
  failQuest: (questId: string) => boolean
  /** 村长任务后一次性回应选择（TM-P1-003）：仅 completed 且在村长处且未回应过才可执行；reassure→信任+1 / resolve→尊敬+1 */
  respondToVillageElderAfterQuest: (choice: 'reassure' | 'resolve') => boolean
  /** 骑士重击灵力消费（TM-P1-006）：仅 knight 且 mp>=2 成功，mp-=2；失败 false 且 GameState 完全不变 */
  spendKnightPowerStrikeMp: () => boolean
  /** 压制猛击灵力消费（TM-P1-008）：仅 warrior 且 mp>=2 成功，mp-=2；失败 false 且 GameState 完全不变 */
  spendWarriorSuppressStrikeMp: () => boolean

  /** 战斗伤害：hp = max(0, hp - amount)，仅正整数伤害，不设通用 setPlayerHp（TM-P0-008） */
  damagePlayer: (amount: number) => boolean
  /** 战斗胜利提交：Store 自校验敌人存在且属于当前地点；《村外异动》进行中在村外草原击败魔化兔 → completable（TM-P0-009） */
  resolveCombatVictory: (enemyId: string) => boolean
  /** TM-P2-007 §7.4：Encounter 战斗入口（外部 authoritative path）。校验 + weighted variant 首次固化 world.encounterVariants（已固化不 reroll）；通过才允许进 CombatPage */
  startEncounter: (encounterId: string) => boolean
  /** TM-P2-007 §6/§15/§16：Encounter 整体胜利结算事务。单敌遭遇委托 resolveCombatVictory（返回 null，loot 展示由 CombatPage 走 grantLoot）；多敌遭遇一次写入 XP sum + loot 聚合 + encounterDefeatFlag，返回聚合的 EncounterLootSummary 供 VictorySummary 展示 */
  resolveEncounterVictory: (encounterId: string) => EncounterLootSummary | null
  /** TM-P2-007 §9/§13：多人战斗结束同步——玩家战后 HP/MP、药水消耗与伙伴战后 MP 一次性写入 GameState（伙伴 HP 不持久化：战斗内按 con 派生满血进入） */
  applyPartyCombatEnd: (input: {
    playerHp: number
    playerMp: number
    potionsUsed: number
    companions?: { companionId: string; mp: number }[]
  }) => boolean
  /** TM-P2-007 §19：在天龙城马厩购买坐骑。校验顺序：坐骑存在 → 已登记价格 → 位置在天龙城 → 金币足够 → 未拥有；成功扣金并加入 ownedMountIds（不自动装备） */
  buyMount: (
    mountId: string,
  ) => 'bought' | 'locked' | 'unknown' | 'not_in_city' | 'not_enough_gold' | 'already_owned'
  /** TM-P2-007 §19：装备已拥有的坐骑；未知/未拥有返回 false 且 GameState 不变 */
  equipMount: (mountId: string) => boolean
  /** TM-P2-007 §19：卸下当前坐骑；未装备返回 false */
  unequipMount: () => boolean
  /** TM-P2-007 §21：城郊古驿道 optional 检定（天龙城 + fast_travel 坐骑 + 一次性）。D20 敏捷检定（使用装备坐骑后的有效敏捷）；成功 +金并写 found，失败写 nothing（不再可探）；不满足条件 → null 且状态不变 */
  exploreMountTrail: () => D20CheckResult | null
  /** 使用治疗药水：hp = min(maxHp, hp + healAmount)，药水 -1；满血/HP0/无药水返回 false 不变（TM-P0-010） */
  useHealingPotion: () => boolean
  /** 装备武器：仅可装备已拥有的 weapon，装备不消耗 inventory（TM-P0-013） */
  equipWeapon: (itemId: string) => boolean
  /** 卸下武器：weapon → null，inventory 不变（TM-P0-013） */
  unequipWeapon: () => boolean
  equipItem: (itemId: string) => boolean
  unequipSlot: (slot: 'weapon' | 'armor' | 'accessory') => boolean
  /** 在药师处购买治疗药水：gold 扣减与药水增加原子完成；不治疗、不自动保存（TM-P0-014） */
  buyHealingPotion: () => boolean
  /** TM-P2-005-R1：在指定商人处购买其注册报价中的一件物品。 */
  buyMerchantItem: (merchantId: string, itemId: string) => boolean
  /** 在铁匠处出售铁矿石：gold 增加与铁矿石减少原子完成；不自动保存（TM-P0-021） */
  sellIronOre: () => boolean
  /** 青石村休整：HP/MP 恢复至最大值；免费、只改 hp/mp、不自动保存（TM-P0-022） */
  restAtVillage: () => boolean
  /** 武馆免费休整（TM-P1-027）：仅武馆可用——hp=maxHp、mp=maxMp；HP=0 时允许、任一资源未满即可成功；HP/MP 全满 → false 且 GameState 完全不变；成功只改 hp/mp（金币/XP/等级/物品/装备/Quest/flags/关系/npcState 全不变）；不自动保存；未建 RestSystem */
  restAtTianlongMartialHall: () => boolean
  /** 法师法术攻击灵力消费（TM-P1-001）：仅 mage 可消费 MAGE_SPELL_MP_COST；只改 player.mp；不自动保存 */
  /** TM-P2-003-R1 B：按技能注册表灵力消耗通用消费（CombatPage 唯一技能 MP 入口） */
  spendSkillMp: (skillId: string) => boolean
  spendMageSpellMp: () => boolean
  /** 调查废弃矿洞（TM-P0-016）：心智 D20 检定一次性写入 flags；非法/已调查/异常 → null 且不变 */
  investigateAbandonedMine: () => D20CheckResult | null
  addGold: (amount: number) => void
  removeGold: (amount: number) => void
  addItem: (itemId: string, quantity?: number) => void
  /** TM-P2-003 C：结算敌人掉落（基础 + 幸运追加）；返回掉落结果（组件展示）；无掉落表返回 null */
  grantLoot: (enemyId: string) => LootGrant | null
  // ---- TM-P2-003 D/E/F：北门旧哨塔补给匣 ----
  /** 技能路线开启（按 Tag：force/movement/magic）；正常消耗 MP；返回结果供 UI 展示 */
  openNorthTowerWithSkill: (skillId: string) => NorthTowerSkillResult
  /** MND 检定寻找备用机关（确定性：roll 可选）；失败写 north_tower_mnd_failed（可触发命运补救） */
  northTowerMndCheck: (roll?: number) => NorthTowerMndResult
  /** 命运补救（每节点最多一次）：MND 失败后的一次幸运检定；结果进存档不可重刷 */
  northTowerLuckRescue: (roll?: number) => NorthTowerLuckResult
  /** 领取补给匣宝箱（基础必给 + Luck 追加；一次性，不可重复领） */
  claimNorthTowerCache: (roll?: number) => NorthTowerClaimResult
  // ---- TM-P2-003 G：机缘型社交（路边旧货商；首次交流自动幸运检定，结果进存档不可反复刷） ----
  oldTraderTalk: (roll?: number) => OldTraderResult
  removeItem: (itemId: string, quantity?: number) => void
  setFlag: (key: string, value: boolean | number | string) => void
  /** 正式查看《兔子的路径》（TM-P1-013）：仅背包合法持有 rabbit_path（quantity 安全整数 >=1）且 rabbit_path_examined 为 undefined/false 时成功，只写 world.flags.rabbit_path_examined=true；重复/非法 quantity/非 boolean 旧 flag → false 且完全不变；不消耗地图、不自动保存 */
  inspectRabbitPath: () => boolean
  /** 向村长汇报《兔子的路径》（TM-P1-016）：青石村 + 合法持有 rabbit_path + 已查看地图 + 《草原狼影》completed + 未汇报时成功，只写 world.flags.rabbit_path_reported=true；非法状态全部拒绝且完全不变；地图不消耗、无任何奖励、不自动保存 */
  reportRabbitPathToVillageElder: () => boolean
  /** 向村中两人打听地图线索（TM-P1-018）：第四任务专属窄 action——青石村 + quest_golden_rabbit_search in_progress + npcId 为 blacksmith/apothecary 时成功，只写该任务 QuestState.flags.asked_{npcId}=true；重复/非 boolean 异常 flag/非法前置全部拒绝且完全不变；无奖励/不建 npcState/不改 stage/不推进 completable、不自动保存 */
  consultGoldenRabbitSearchNpc: (npcId: 'blacksmith' | 'apothecary') => boolean
  /** 向村长复命村内调查（TM-P1-019）：第四任务专属窄 action——青石村 + 任务 in_progress + 两人均已询问（asked 均 === true）+ 未复命时成功，只写 quest.flags.village_inquiry_reported=true；三个相关 flag 任一非 boolean 整体拒绝（R1 原则）；重复复命/未问完/非法前置全部拒绝且完全不变；不改 status/stage/询问 flag、无奖励、不建 npcState、不自动保存 */
  reportGoldenRabbitVillageInvestigation: () => boolean
  /** 返回兔王巢穴复查《兔子的路径》（TM-P1-020）：第四任务专属窄 action——当前位置 rabbit_lair + 任务 in_progress + 前三调查 flag 均 === true + 未复查时成功，只写 quest.flags.rabbit_lair_rechecked=true；四个相关 flag 任一非 boolean 整体拒绝；rabbit_path 非法 quantity（0/-1/1.5/NaN/Infinity/缺失）拒绝；examined 非 true 拒绝；重复复查拒绝；不改 status/stage、不消耗地图、无奖励、不自动保存 */
  recheckGoldenRabbitMapAtLair: () => boolean
  /** 查看村外草原采药区域（TM-P1-021）：支线专属窄 action——当前位置 village_grassland + quest_apothecary_herb_route in_progress + grassland_checked undefined/false 时成功，原子写 flags.grassland_checked=true 且 status→completable（stage 保持 0）；重复（true）/非 boolean 异常 flag/非法前置全部拒绝且完全不变；无金币/HP/MP/物品副作用、不自动保存 */
  inspectApothecaryHerbRoute: () => boolean
  /** 离开青石村前往天龙城（TM-P1-023）：一次性区域跨越 action——青石村 + 黄金主线 in_progress/stage 0 + 四剧情 flag 均 true + rabbit_path 合法持有（安全整数>=1）+ examined/reported true + 已接触未完成的两条支线（available/in_progress/completable）阻止时成功，只改 world.currentLocationId='tianlong_city'（无 qingshi_departed flag）；任何非法前置/异常 flag/quantity 全部拒绝且完全不变；player/inventory/equipment/quests/flags/npcStates/completedEvents 全不变、不自动保存 */
  departQingshiVillageToTianlongCity: () => boolean
  /** 向王财询问黑石塔附近的遭遇（TM-P1-024）：第五主线第一次剧情交接专属窄 action——当前位置 tianlong_city + quest_wangcai_trouble in_progress + wangcai_briefed undefined/false 时成功，原子写 quest.flags.wangcai_briefed=true（status 保持 in_progress、stage 保持 0）；非 boolean 异常 flag（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用 false 且 GameState 同一引用；无金币/HP/MP/物品/装备/关系/flags/completedEvents 副作用、不自动保存 */
  askWangcaiAboutTrouble: () => boolean
  /** 动身调查黑石塔（TM-P1-025）：解锁黑石塔一层路线专属窄 action——当前位置 tianlong_city + quest_wangcai_trouble in_progress/stage 0 + wangcai_briefed 严格 true + world.flags.black_stone_tower_unlocked undefined/false 时成功，原子写 world.flags.black_stone_tower_unlocked=true（Quest status 保持 in_progress/stage 0、wangcai_briefed 保持 true）；wangcai_briefed 非 boolean 或 unlock flag 非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用 false 且 GameState 同一引用；player/inventory/equipment/quests/npcStates/completedEvents 全不变、不自动保存 */
  unlockBlackStoneTowerInvestigation: () => boolean
  /** 解锁黑石塔二层（TM-P1-027）：黑石塔一层 + 第五主线 in_progress/stage 0 + wangcai_briefed 严格 true + black_stone_tower_unlocked 严格 true + floor1_soldier_defeated 严格 true + floor1_captain_defeated 严格 true + 目标 flag black_stone_tower_floor2_unlocked undefined/false → 成功原子写 world.flags.black_stone_tower_floor2_unlocked=true；目标 flag 已 true 或非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；player/inventory/equipment/quests/其他 world.flags/npcStates/completedEvents 全不变；不自动保存 */
  unlockBlackStoneTowerFloor2: () => boolean
  /** 解锁黑石塔三层（TM-P1-029）：黑石塔二层 + 第五主线 in_progress/stage 0 + wangcai_briefed 严格 true + black_stone_tower_unlocked 严格 true + black_stone_tower_floor2_unlocked 严格 true + floor1_soldier_defeated/captain_defeated + floor2_zombie_defeated/black_mage_defeated/skeleton_warrior_defeated 全部严格 true + 目标 flag black_stone_tower_floor3_unlocked undefined/false → 成功原子写 world.flags.black_stone_tower_floor3_unlocked=true；目标 flag 已 true 或非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；不建 DungeonEngine/楼层系统；player/inventory/equipment/quests/其他 world.flags/npcStates/completedEvents 全不变；不自动保存 */
  unlockBlackStoneTowerFloor3: () => boolean
  /** 交还夔峒项链给王财（TM-P1-030）：天龙城 + 第五主线 in_progress/stage 0 + wangcai_briefed 严格 true + 黑石塔一二三层全部解锁 + 一层两敌/二层三敌/三层骷髅女妖全部严格 true + 背包合法持有夔峒项链（唯一 entry、quantity===1）+ 目标 flag kuidong_necklace_returned undefined/false → 成功原子完成：删除夔峒项链 + kuidong_necklace_returned=true + status→completable（stage 保持 0）；目标 flag 已 true 或非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；无金币/XP/等级/装备/关系值/其他奖励；player/equipment/npcStates/completedEvents/其他 world.flags/quests（除本任务 status）全不变；不自动保存 */
  returnKuidongNecklaceToWangcai: () => boolean
  /** 查看北门巡逻队痕迹（TM-P2-001 D3）：天龙城北门 + 《北门失联》in_progress/stage 0 + north_gate_trail_checked undefined/false 时成功，只写 quest.flags.north_gate_trail_checked=true（status/stage 不变）；非 boolean 异常 flag 整次拒绝且完全不变（不修复）；已 true 重复调用 false 且 GameState 同一引用；无金币/HP/MP/物品/装备/关系/flags/completedEvents 副作用、不自动保存 */
  investigateNorthGateTrail: () => boolean

  // ---- TM-P2-008：Clue Journal V1（§7-8/§37-39；发现进度持久化于 world.flags[clueId]）----
  /** 正式记录一条线索（幂等）：clueId 未注册 → { ok:false } 且 GameState 完全不变；未发现 → 写 world.flags[clueId]=true 返回 { ok:true, added:true, clue }；已发现 → { ok:true, added:false, alreadyKnown:true }（不重复插入，§39） */
  addClue: (clueId: string) => { ok: boolean; added: boolean; alreadyKnown: boolean; clue?: ClueDefinition }

  // ---- TM-P2-008：北郊余波主线《北郊追踪》（§16-29；Stage A-D 用 quest.flags 表达，stage 保持 number）----
  /** Stage A 追踪（北门）：quest_north_outskirts in_progress + trail_tracked undefined/false 时成功，原子写 quest.flags.north_outskirts_trail_tracked=true + world.flags.north_outskirts_unlocked=true（解锁北郊，§18）+ 记录线索「拖行痕迹」（guaranteed §29）；重复/非 boolean 异常 flag/非法前置全部拒绝且完全不变；无金币/HP/MP/物品/装备副作用、不自动保存 */
  trackNorthOutskirtsTrail: () => boolean
  /** Stage B 找到袭击现场（北郊）：quest in_progress + trail_tracked===true + ambush_found undefined/false 时成功，只写 quest.flags.north_outskirts_ambush_found=true（status/stage 不变）；非法前置/异常 flag/重复全部拒绝且完全不变 */
  searchNorthOutskirtsAmbush: () => boolean
  /** Stage C 调查多解（北郊）：mnd/lck 检定（DC 12）任一成功 → 写 ambush_investigated=true + 对应线索返回 progressed:true；sakura 在场 → flavor + 额外线索（不自动解决，§22）；mount（装备 fast_travel 坐骑）→ 沿官道快速搜索得巡逻队徽记线索（不自动解决，§50）；检定失败可重试（§29，不软阻断）；前置不满足 → locked 且完全不变 */
  investigateNorthOutskirtsAmbush: (method: 'mnd' | 'lck' | 'sakura' | 'mount') => NorthOutskirtsInvestigateResult
  /** Stage D 回报（武馆/北门）：quest in_progress + ambush_investigated===true + reported undefined/false 时成功，写 quest.flags.north_outskirts_reported=true 且 status→completable（stage 保持 0）；非法前置/异常 flag/重复全部拒绝且完全不变 */
  reportNorthOutskirts: () => boolean

  // ---- TM-P2-009：北线主线《断旗余声》（§9-19；Stage A-F 用 quest.flags 表达，stage 保持 number）----
  /** Stage A 马科简报（武馆）：quest_north_broken_banner in_progress + make_briefed undefined/false 时成功，原子写 quest.flags.north_broken_banner_make_briefed=true + world.flags.north_waystation_unlocked=true（解锁旧驿站 §11）；重复/非 boolean 异常 flag/非法前置全部拒绝且完全不变；无金币/HP/MP/物品/装备副作用、不自动保存 */
  startNorthBrokenBanner: () => boolean
  /** Stage B 搜索驿站（旧驿站）：quest in_progress + make_briefed===true + searched undefined/false 时成功，原子写 quest.flags.north_waystation_searched=true + 线索「断裂队旗」（guaranteed §15）；非法前置/异常 flag/重复全部拒绝且完全不变 */
  searchNorthAbandonedWaystation: () => boolean
  /** Stage C 多解（旧驿站）：combat（已 neutralized 才通过）/mnd/lck 检定（DC 12）任一成功 → 写 quest.flags.north_waystation_barrier_resolved=true + 对应线索；sakura 在场 → flavor + 额外线索（不自动解决，§13）；mount（装备 fast_travel 坐骑）→ 快速侦查得黑篷车辙线索（不自动解决）；检定失败可重试（不软阻断）；前置不满足 → locked 且完全不变 */
  resolveWaystationBarrier: (method: 'combat' | 'mnd' | 'lck' | 'sakura' | 'mount') => WaystationBarrierResult
  /** Stage D 救出沈拓（旧驿站）：quest in_progress + barrier_resolved===true + rescued undefined/false 时成功，原子写 quest.flags.north_waystation_survivor_rescued=true + 活动事件 north_survivor_rescued（§14 唯一写入点）+ 线索「黑篷车辙」；非法前置/异常 flag/重复全部拒绝且完全不变 */
  rescueWaystationSurvivor: () => boolean
  /** Stage D 沈拓汇报（旧驿站）：quest in_progress + rescued===true + debriefed undefined/false 时成功，原子写 quest.flags.north_waystation_survivor_debriefed=true + 线索「魔化诱饵」（§15）；非法前置/异常 flag/重复全部拒绝且完全不变 */
  debriefWaystationSurvivor: () => boolean
  /** Stage E 回报马科（武馆）：quest in_progress + debriefed===true + reported undefined/false 时成功，写 quest.flags.north_broken_banner_reported=true 且 status→completable（stage 保持 0）；非法前置/异常 flag/重复全部拒绝且完全不变 */
  reportNorthBrokenBanner: () => boolean

  // ---- TM-P2-010：天龙武备试炼（Save V6：仅复用 quest flags/world flags/inventory/learnedSkillIds）----
  /** 接取试炼：仅武馆 + 新/旧邀请资格；按职业只落一个 route flag。 */
  acceptMartialTrial: () => boolean
  /** Stage A 武馆报到；接取后写 trial_registered。 */
  registerMartialTrial: () => boolean
  /** Stage B 职业观察考；成功/失败均 fail-forward 推进，结果只影响 preparation flag。 */
  resolveMartialTrialObservation: (method: MartialTrialObservationMethod, roll?: number) => MartialTrialObservationResult
  /** 试炼回报：战斗胜利后推进复盘阶段。 */
  reportMartialTrial: () => boolean
  /** 领取试炼奖励；单次授予职业 Tier II 技能、铜章、金币/XP 与后续 hook。 */
  completeMartialTrial: () => boolean

  // ---- TM-P2-004：Sakura 剧情 / 伙伴 / 关系 / 休整 ----
  /** 触发反季樱雨（TM-P2-004 第 31 节）：canTriggerSakuraEncounter 纯规则；成功写 sakura_encounter_started=true + 《落樱越界》discover→in_progress */
  startSakuraEncounter: () => boolean
  /** 进入樱华神域·破碎边界（TM-P2-004 第 33/34 节）：特殊事件地点，不允许普通 Travel */
  enterSakuraDomain: () => boolean
  /** 初见选择（TM-P2-004 第 37 节）：help/ask/pet_joke；创建 companions（met）+ relationships（5/5 acquaintance）+ 关系 delta；一次性 */
  meetSakura: (choice: SakuraMeetChoice) => SakuraMeetResult
  /** 职业对话（TM-P2-004 第 24 节）：至少 4 个职业专属回应；一次性（sakura_profession_talked）；战士 trust+2 / 骑士 trust+3+affection+1 / 游侠·法师情报无变化 */
  sakuraProfessionTalk: () => SakuraTalkResult
  /** MND 检定（TM-P2-004 第 25 节）：DC 12 观察旧伤与破裂神印；一次性（attempted 后不可重掷）；成功 trust+2 */
  sakuraMndCheck: (roll?: number) => SakuraSceneCheckResult | null
  /** LUCK 命运补救（TM-P2-004 第 26 节）：MND 失败后可用，DC 12；一次性；成功 trust+1，大成功额外 affection+1 */
  sakuraLuckRescue: (roll?: number) => SakuraSceneCheckResult | null
  /** 提议临时合作（TM-P2-004 第 39 节）：残灾袭击 → status guest + 加入 activeCompanionIds */
  offerSakuraGuest: () => boolean
  /** 接受神契（TM-P2-004 第 79/82 节）：affirm/try/joke；自愿、显式；重复调用 no-op */
  acceptSakuraContract: (choice: SakuraContractChoice) => SakuraContractResult
  /** 拒绝神契（TM-P2-004 第 80 节）：不 recruited、任务保持 in_progress、未来可再谈 */
  refuseSakuraContract: () => boolean
  /** 再次提议神契（TM-P2-004 第 80 节）：Long Rest / 天龙城安全场景可再谈 */
  reofferSakuraContract: () => boolean
  /** 常驻交谈（TM-P2-004 第 62/63 节）：每休整周期前 2 次正常收益 affection+1 */
  talkToSakura: (topic: SakuraTalkTopic) => SakuraTalkResult
  /** 首次休整谈话《第一夜：神与凡人的距离》（TM-P2-004 第 59-61 节） */
  sakuraFirstRestTalk: (choice: SakuraFirstRestChoice) => SakuraTalkResult
  /** 天龙城同行 banter（TM-P2-004 第 88 节）：入队后首次返回天龙城触发一次 */
  sakuraBanter: (choice: SakuraBanterChoice) => SakuraTalkResult
  /** 赠礼（TM-P2-004 第 68/69 节）：generic；同一休整周期只收一份（拒绝且不消耗） */
  giveGift: (npcId: string, itemId: string) => GiftResult
  /** 购买天龙桂花糕（TM-P2-004 第 67 节）：天龙城 + 8 金币 */
  buyOsmanthusCake: () => boolean
  /** 统一 Long Rest（TM-P2-004 第 53-56 节）：满资源也允许；restCount+1 + 玩家满资源 + 伙伴 MP 回满 */
  longRest: () => boolean
  /** 暂不同行 / 重新同行（TM-P2-004 第 149-151 节）：recruited 不变、不降关系 */
  setCompanionActive: (companionId: string, active: boolean) => boolean
  /** 伙伴技能 MP 消费（TM-P2-004 第 106 节）：伙伴自身 MP；checkSkillUse（profession=undefined）统一校验 */
  spendCompanionSkillMp: (companionId: string, skillId: string) => boolean
}

/** 线索发现（TM-P2-008 §38）：clueId 已注册 + `world.flags[clueId]` 非严格 true → 写 flag 返回新 GameState；未注册 / 已发现返回 null（不变）。幂等、纯函数 */
function applyClueDiscovery(gameState: GameState, clueId: string): GameState | null {
  if (!getClue(clueId)) return null
  if (gameState.world.flags[clueId] === true) return null
  return {
    ...gameState,
    world: {
      ...gameState.world,
      flags: { ...gameState.world.flags, [clueId]: true },
    },
  }
}

/** 任务发现：不存在 → 创建 available；undiscovered → available；其余状态不重复创建。非法返回 null（TM-P0-006） */
function applyQuestDiscovery(gameState: GameState, questId: string): GameState | null {
  if (!getQuest(questId)) return null
  // TM-P1-017：第四主线《追寻黄金兔子王》窄特判——仅 rabbit_path_reported===true（非严格 true 如 undefined/false/"true"/"yes"/1/0 均不解锁）才能发现；不修复异常 flag
  if (questId === 'quest_golden_rabbit_search' && gameState.world.flags.rabbit_path_reported !== true) {
    return null
  }
  // TM-P1-021：首条支线《采药受阻》窄特判——仅《村外异动》completed（第一主线完成）才能发现；不建 prerequisite 系统
  if (questId === 'quest_apothecary_herb_route') {
    const villageQuest = gameState.quests.find((q) => q.questId === 'quest_village_monsters')
    if (villageQuest?.status !== 'completed') return null
  }
  // TM-P1-022：第二条支线《矿洞余患》窄特判——仅《矿洞清理》completed 才能发现；不建 prerequisite 系统
  if (questId === 'quest_blacksmith_mine_remnant') {
    const mineQuest = gameState.quests.find((q) => q.questId === 'quest_mine_cleanup')
    if (mineQuest?.status !== 'completed') return null
  }
  // TM-P2-001 D2：《北门失联》窄特判——仅《商人王财的麻烦》completed（Phase 1 主线收束）才能发现；不建 prerequisite 系统
  if (questId === 'quest_north_gate_missing_patrol') {
    const wangcaiQuest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
    if (wangcaiQuest?.status !== 'completed') return null
  }
  // TM-P2-008 §16：《北郊追踪》窄特判——仅《北门失联》completed 才能发现（北门失联保持原样，老存档可直接接新任务）；不建 prerequisite 系统
  if (questId === 'quest_north_outskirts') {
    const northGateQuest = gameState.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
    if (northGateQuest?.status !== 'completed') return null
  }
  // TM-P2-009 §9：《断旗余声》窄特判——仅《北郊追踪》completed 才能发现；不建 prerequisite 系统
  if (questId === 'quest_north_broken_banner') {
    const northOutskirtsQuest = gameState.quests.find((q) => q.questId === 'quest_north_outskirts')
    if (northOutskirtsQuest?.status !== 'completed') return null
  }
  const index = gameState.quests.findIndex((q) => q.questId === questId)
  if (index < 0) {
    return {
      ...gameState,
      quests: [...gameState.quests, { questId, status: 'available', stage: 0, flags: {} }],
    }
  }
  const current = gameState.quests[index]
  if (!current) return null
  if (current.status !== 'undiscovered') return null
  const nextQuests = [...gameState.quests]
  nextQuests[index] = { ...current, status: 'available' }
  return { ...gameState, quests: nextQuests }
}

/** 通用任务状态转换：仅当 questId 存在且状态转换合法时更新，否则返回 null（TM-P0-006） */
function applyQuestTransition(gameState: GameState, questId: string, to: QuestStatus): GameState | null {
  if (!getQuest(questId)) return null
  const index = gameState.quests.findIndex((q) => q.questId === questId)
  if (index < 0) return null
  const current = gameState.quests[index]
  if (!current) return null
  if (!canTransitionQuestStatus(current.status, to)) return null
  const nextQuests = [...gameState.quests]
  nextQuests[index] = { ...current, status: to }
  return { ...gameState, quests: nextQuests }
}

/**
 * 单敌可重复遭遇定义（TM-P2-009-R1 §11.3）：enemyId → 其 SINGLE_ENEMY_ENCOUNTERS 单敌遭遇，
 * 且该遭遇 repeatable=true → 返回 def；否则 undefined。用于 resolveCombatVictory 重复胜利给低额 XP。
 */
function repeatableEncounterDefForEnemy(enemyId: string): EncounterDefinition | undefined {
  const encounterId = SINGLE_ENEMY_ENCOUNTERS[enemyId]
  if (!encounterId) return undefined
  const def = getEncounter(encounterId)
  return def?.repeatable ? def : undefined
}

export const useGameStore = create<GameStoreState>()((set, get) => ({
  gameState: null,
  // TM-P2-002 H：初始化即尝试自动迁移旧 V1 单档（Slot 1 为空时迁入）
  hasSave: (migrateSave(), hasAnySave()),
  slots: loadIndexSummary(),
  lastSavedSlot: loadIndexLast(),

  newGame: (input) => {
    set({ gameState: createInitialGameState(input) })
  },

  loadGame: () => {
    migrateSave()
    const save = loadMostRecentSave()
    if (save) {
      set({ gameState: save.gameState, hasSave: true, slots: loadIndexSummary(), lastSavedSlot: loadIndexLast() })
      return true
    }
    set({ hasSave: false })
    return false
  },

  saveGame: (slotId) => {
    let ok = false
    set((s) => {
      if (!s.gameState) return {}
      ok = persistSlot(slotId, s.gameState)
      return { hasSave: hasAnySave(), slots: loadIndexSummary(), lastSavedSlot: loadIndexLast() }
    })
    return ok
  },

  loadSlot: (slotId) => {
    migrateSave()
    const save = storageLoadSlot(slotId)
    if (save) {
      set({ gameState: save.gameState, hasSave: true, slots: loadIndexSummary(), lastSavedSlot: loadIndexLast() })
      return true
    }
    set({ hasSave: hasAnySave() })
    return false
  },

  deleteSlot: (slotId) => {
    const ok = storageDeleteSlot(slotId)
    set({ hasSave: hasAnySave(), slots: loadIndexSummary(), lastSavedSlot: loadIndexLast() })
    return ok
  },

  deleteGame: () => {
    // 兼容旧调用方：删除最近存档槽位（单槽场景即全部清除）
    const last = loadIndexLast()
    if (last) storageDeleteSlot(last)
    set({ gameState: null, hasSave: hasAnySave(), slots: loadIndexSummary(), lastSavedSlot: loadIndexLast() })
  },

  exportSaves: () => {
    migrateSave()
    return storageExportSaves()
  },

  importSaves: (json) => {
    const ok = storageImportSaves(json)
    set({ hasSave: hasAnySave(), slots: loadIndexSummary(), lastSavedSlot: loadIndexLast() })
    return ok
  },

  // TM-P2-005：云导入/外部写入后刷新槽位索引（不触碰 gameState 内存态）
  refreshSlots: () => {
    set({ hasSave: hasAnySave(), slots: loadIndexSummary(), lastSavedSlot: loadIndexLast() })
  },


  // ---- TM-P2-003 D/E/F：北门旧哨塔补给匣实现 ----
  openNorthTowerWithSkill: (skillId) => {
    const s = get().gameState
    if (!s) return null
    // 场景前置：当前位置北门 + 黑鬃魔狼已击败 + 旧哨塔尚未开启 + 补给匣尚未领取
    const atNorthGate = s.world.currentLocationId === 'tianlong_north_gate'
    const wolfDefeated = s.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')?.flags.north_gate_wolf_defeated === true
    if (!atNorthGate || !wolfDefeated) return null
    const opened = s.world.flags.north_tower_opened === true
    const claimed = s.world.flags.north_tower_cache_claimed === true
    if (opened || claimed) return { outcome: 'already_opened' }
    // TM-P2-003-R3 C：统一技能校验（与战斗 spendSkillMp 同一 pure rule，不再复制一套业务判断）；
    // 外部 API 语义保持：unknown_skill / not_learned / profession_mismatch / invalid_* 统一映射为 no_skill，
    // insufficient_mp 保持 no_mp（UI 已有灵力不足提示分支）
    const check = checkSkillUse(skillId, {
      learnedSkillIds: s.player.learnedSkillIds,
      profession: s.player.profession,
      mp: s.player.mp,
      maxMp: s.player.maxMp,
    })
    if (!check.allowed || !check.skill) {
      if (check.reason === 'insufficient_mp') return { outcome: 'no_mp' }
      return { outcome: 'no_skill' }
    }
    const skill = check.skill
    // TM-P2-003 D：按 Tag 判断解法（不是按技能 ID）
    const hasTag = skill.tags.some((t) => t === 'force' || t === 'movement' || t === 'magic')
    if (!hasTag) return { outcome: 'wrong_tag' }
    // 原子：MP 扣减 + north_tower_opened 同一次 Store 更新（set 内按最新 state 重新校验防竞态）
    set((st) => {
      if (!st.gameState) return {}
      const recheck = checkSkillUse(skillId, {
        learnedSkillIds: st.gameState.player.learnedSkillIds,
        profession: st.gameState.player.profession,
        mp: st.gameState.player.mp,
        maxMp: st.gameState.player.maxMp,
      })
      if (!recheck.allowed || !recheck.skill) return {}
      const reSkill = recheck.skill
      if (!reSkill.tags.some((t) => t === 'force' || t === 'movement' || t === 'magic')) return {}
      return {
        gameState: {
          ...st.gameState,
          player: { ...st.gameState.player, mp: st.gameState.player.mp - reSkill.mpCost },
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, north_tower_opened: true },
          },
        },
      }
    })
    return { outcome: 'opened', skillName: skill.name, mpCost: skill.mpCost }
  },

  northTowerMndCheck: (roll) => {
    const s = get().gameState
    if (!s) return null
    const atNorthGate = s.world.currentLocationId === 'tianlong_north_gate'
    const wolfDefeated = s.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')?.flags.north_gate_wolf_defeated === true
    if (!atNorthGate || !wolfDefeated) return null
    if (s.world.flags.north_tower_opened === true) return null
    // TM-P2-003-R2 A：异常状态守卫——已领取（claimed=true）则无论 opened 状态如何都拒绝再次开启
    if (s.world.flags.north_tower_cache_claimed === true) return null
    // TM-P2-003-R1 A：MND 检定一次性——失败后（north_tower_mnd_failed）不得再掷，只能走命运补救
    if (s.world.flags.north_tower_mnd_failed === true) return null
    const check = resolveD20Check(
      { attributeScore: s.player.attributes.mnd, level: s.player.level, dc: NORTH_TOWER_MND_DC },
      roll ?? rollD20(),
    )
    if (check.success) {
      set((st) =>
        st.gameState
          ? {
              gameState: {
                ...st.gameState,
                world: { ...st.gameState.world, flags: { ...st.gameState.world.flags, north_tower_opened: true } },
              },
            }
          : {},
      )
      return { outcome: 'success', check }
    }
    // 失败：写 north_tower_mnd_failed（幂等；触发命运补救入口）
    set((st) =>
      st.gameState
        ? {
            gameState: {
              ...st.gameState,
              world: {
                ...st.gameState.world,
                flags: { ...st.gameState.world.flags, north_tower_mnd_failed: true },
              },
            },
          }
        : {},
    )
    return { outcome: 'failed', check }
  },

  northTowerLuckRescue: (roll) => {
    const s = get().gameState
    if (!s) return null
    const atNorthGate = s.world.currentLocationId === 'tianlong_north_gate'
    const wolfDefeated = s.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')?.flags.north_gate_wolf_defeated === true
    if (!atNorthGate || !wolfDefeated) return null
    if (s.world.flags.north_tower_opened === true) return null
    // TM-P2-003-R2 A：异常状态守卫——已领取则拒绝补救（无论 opened 状态如何）
    if (s.world.flags.north_tower_cache_claimed === true) return null
    // 每节点最多一次：MND 失败后 + 未使用过
    if (s.world.flags.north_tower_mnd_failed !== true) return null
    if (s.world.flags.north_tower_luck_used === true) return null
    const check = resolveLuckCheck(roll ?? rollD20(), s.player.attributes.lck, NORTH_TOWER_LUCK_DC)
    if (check.success) {
      set((st) =>
        st.gameState
          ? {
              gameState: {
                ...st.gameState,
                world: {
                  ...st.gameState.world,
                  flags: {
                    ...st.gameState.world.flags,
                    north_tower_opened: true,
                    north_tower_luck_used: true,
                  },
                },
              },
            }
          : {},
      )
      return { outcome: 'rescued', check }
    }
    set((st) =>
      st.gameState
        ? {
            gameState: {
              ...st.gameState,
              world: { ...st.gameState.world, flags: { ...st.gameState.world.flags, north_tower_luck_used: true } },
            },
          }
        : {},
    )
    return { outcome: 'failed', check }
  },

  claimNorthTowerCache: (roll) => {
    const s = get().gameState
    if (!s) return null
    if (s.world.flags.north_tower_opened !== true) return { outcome: 'locked' }
    if (s.world.flags.north_tower_cache_claimed === true) return { outcome: 'already_claimed' }
    const check = resolveLuckCheck(roll ?? rollD20(), s.player.attributes.lck, NORTH_TOWER_LUCK_DC)
    const items: { itemId: string; quantity: number }[] = [{ itemId: 'healing_potion', quantity: 1 }]
    let gold = NORTH_TOWER_CACHE_BASE_GOLD
    if (check.success) gold += NORTH_TOWER_CACHE_LUCK_GOLD
    if (check.outcome === 'critical_success') items.push({ itemId: 'refined_iron_sword', quantity: 1 })
    set((st) => {
      if (!st.gameState) return {}
      let inventory = [...st.gameState.inventory]
      for (const it of items) {
        const idx = inventory.findIndex((e) => e.itemId === it.itemId)
        inventory =
          idx >= 0
            ? inventory.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + it.quantity } : e))
            : [...inventory, { itemId: it.itemId, quantity: it.quantity }]
      }
      return {
        gameState: {
          ...st.gameState,
          inventory,
          player: { ...st.gameState.player, gold: st.gameState.player.gold + gold },
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, north_tower_cache_claimed: true },
          },
        },
      }
    })
    return { outcome: 'claimed', items, gold, luckCheck: check }
  },

  oldTraderTalk: (roll) => {
    const s = get().gameState
    if (!s) return null
    if (s.world.currentLocationId !== 'tianlong_city') return null
    // 一次性：结果进存档，刷新/反复交谈不重刷
    if (s.world.flags.old_trader_talked === true) return null
    const check = resolveLuckCheck(roll ?? rollD20(), s.player.attributes.lck, OLD_TRADER_LUCK_DC)
    // 归一化：大失败视为失败（叙事只有 失败/成功/大成功 三档）
    const outcome = check.outcome === 'critical_success' ? 'critical_success' : check.success ? 'success' : 'failure'
    let goldBonus = 0
    if (outcome === 'critical_success') goldBonus = OLD_TRADER_CRITICAL_GOLD
    set((st) => {
      if (!st.gameState) return {}
      return {
        gameState: {
          ...st.gameState,
          player: { ...st.gameState.player, gold: st.gameState.player.gold + goldBonus },
          world: {
            ...st.gameState.world,
            flags: {
              ...st.gameState.world.flags,
              old_trader_talked: true,
              old_trader_outcome: outcome,
            },
          },
        },
      }
    })
    return {
      outcome,
      luckCheck: check,
      goldBonus,
    }
  },

  setCurrentLocation: (locationId) => {
    if (!locationId) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              world: { ...s.gameState.world, currentLocationId: locationId },
            },
          }
        : {},
    )
  },

  travelToLocation: (targetLocationId) => {
    let moved = false
    set((s) => {
      if (!s.gameState) return {}
      const flags = targetLocationId === MARTIAL_TRIAL_GROUND_ID &&
        (s.gameState.world.flags[MARTIAL_TRIAL_INVITED_FLAG] === true || s.gameState.world.flags.knight_trial_invited === true)
        ? { ...s.gameState.world.flags, [MARTIAL_TRIAL_INVITED_FLAG]: true }
        : s.gameState.world.flags
      const check = checkTravel(s.gameState.world.currentLocationId, targetLocationId, flags)
      if (!check.allowed) return {}
      moved = true
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: targetLocationId },
        },
      }
    })
    return moved
  },

  // ---- 任务生命周期（TM-P0-006）----
  discoverQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // TM-P1-005：窄前置——仅《矿洞清理》要求《村外异动》已完成才可发现（不建通用 prerequisite 系统）
      if (questId === 'quest_mine_cleanup') {
        const villageMonstersCompleted = s.gameState.quests.some(
          (q) => q.questId === 'quest_village_monsters' && q.status === 'completed',
        )
        if (!villageMonstersCompleted) return {}
      }
      // TM-P1-010：窄前置——仅《草原狼影》要求《矿洞清理》已完成才可发现（与村长回应关系无关）
      if (questId === 'quest_grassland_wolf') {
        const mineCleanupCompleted = s.gameState.quests.some(
          (q) => q.questId === 'quest_mine_cleanup' && q.status === 'completed',
        )
        if (!mineCleanupCompleted) return {}
      }
      const next = applyQuestDiscovery(s.gameState, questId)
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  acceptQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyQuestTransition(s.gameState, questId, 'in_progress')
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  markQuestCompletable: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyQuestTransition(s.gameState, questId, 'completable')
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  completeQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 先通过封板任务状态机（仅 completable → completed），再产生世界效果（TM-P0-011）
      const next = applyQuestTransition(s.gameState, questId, 'completed')
      if (!next) return {}
      // 金币安全边界（TM-P0-018）：gold 非负安全整数、goldReward 正安全整数、相加仍安全整数；否则完全拒绝完成
      const reward = getQuest(questId)?.goldReward
      if (reward !== undefined) {
        const gold = next.player.gold
        if (
          !Number.isSafeInteger(gold) ||
          gold < 0 ||
          !Number.isSafeInteger(reward) ||
          reward <= 0 ||
          !Number.isSafeInteger(gold + reward)
        ) {
          return {}
        }
      }
      // TM-P1-002 关系安全预检（《村外异动》专属）：村长 trust 可安全 +1 才允许完成，否则整次拒绝
      if (questId === 'quest_village_monsters') {
        const existing = next.world.npcStates.village_elder
        if (existing) {
          const trust = existing.relationship.trust
          if (!Number.isFinite(trust) || !Number.isFinite(trust + 1)) return {}
        } else if (!getNpc('village_elder')) {
          return {}
        }
      }
      const xpReward = getQuest(questId)?.adventureXpReward ?? 0
      const progression = applyAdventureXpReward(next.player, xpReward)
      if (!progression) return {}
      changed = true
      // 任务完成 + 金币奖励 +（《村外异动》）兔王巢穴解锁 + 村长信任：同一原子更新
      const player = reward !== undefined ? { ...next.player, gold: next.player.gold + reward } : next.player
      // TM-P1-011：里程碑升级（仅《草原狼影》）：Lv1→Lv2、maxHp+2、maxMp+1；当前 hp/mp 保持不变（受伤不治疗、HP0 不复活）
      const playerAfterLevel = { ...progression.player, gold: player.gold }
      if (questId === 'quest_village_monsters') {
        // TM-P1-002：《村外异动》专属关系奖励——村长信任 +1（仅本任务；懒创建 NpcState；locationId 读注册表）
        const existing = next.world.npcStates.village_elder
        const elderState = existing
          ? { ...existing, relationship: { ...existing.relationship, trust: existing.relationship.trust + 1 } }
          : {
              npcId: 'village_elder',
              alive: true,
              locationId: getNpc('village_elder')!.locationId,
              relationship: { trust: 1, affection: 0, respect: 0, fear: 0, resentment: 0 },
            }
        return {
          gameState: {
            ...next,
            player: playerAfterLevel,
            world: {
              ...next.world,
              flags: { ...next.world.flags, rabbit_lair_unlocked: true },
              npcStates: { ...next.world.npcStates, village_elder: elderState },
            },
          },
        }
      }
      // TM-P2-009-R1 §2.3：《断旗余声》正式提交只负责 50 Gold / 120 XP / completed——
      // 骑士试炼邀请已由 reportNorthBrokenBanner() 在向马科汇报时写入，completeQuest 不重复追加 invitation event。
      if (questId === 'quest_north_broken_banner') {
        return {
          gameState: {
            ...next,
            player: playerAfterLevel,
            world: { ...next.world, flags: { ...next.world.flags, [MARTIAL_TRIAL_INVITED_FLAG]: true } },
          },
        }
      }
      if (questId === MARTIAL_TRIAL_QUEST_ID) {
        const skillByProfession: Record<string, string> = {
          warrior: 'warrior_breaking_slash',
          knight: 'knight_oath_guard',
          ranger: 'ranger_windstep_strike',
          mage: 'mage_flame_lance',
        }
        const tierTwoSkill = skillByProfession[next.player.profession]
        const learnedSkillIds = tierTwoSkill && !next.player.learnedSkillIds.includes(tierTwoSkill)
          ? [...next.player.learnedSkillIds, tierTwoSkill]
          : next.player.learnedSkillIds
        const medalIndex = next.inventory.findIndex((entry) => entry.itemId === MARTIAL_TRIAL_BRONZE_MEDAL_ID)
        const inventory = medalIndex >= 0
          ? next.inventory.map((entry, index) => index === medalIndex ? { ...entry, quantity: entry.quantity + 1 } : entry)
          : [...next.inventory, { itemId: MARTIAL_TRIAL_BRONZE_MEDAL_ID, quantity: 1 }]
        return {
          gameState: {
            ...next,
            player: { ...playerAfterLevel, learnedSkillIds },
            inventory,
            world: {
              ...next.world,
              flags: { ...next.world.flags, martial_trial_completed: true, martial_trial_bronze_medal_awarded: true, p2_011_hook_available: true },
            },
          },
        }
      }
      return reward !== undefined
        ? { gameState: { ...next, player: playerAfterLevel } }
        : { gameState: { ...next, player: playerAfterLevel } }
    })
    return changed
  },

  failQuest: (questId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyQuestTransition(s.gameState, questId, 'failed')
      if (!next) return {}
      changed = true
      return { gameState: next }
    })
    return changed
  },

  damagePlayer: (amount) => {
    if (!Number.isInteger(amount) || amount <= 0) return false
    let damaged = false
    set((s) => {
      if (!s.gameState) return {}
      const hp = Math.max(0, s.gameState.player.hp - amount)
      damaged = true
      return { gameState: { ...s.gameState, player: { ...s.gameState.player, hp } } }
    })
    return damaged
  },

  resolveCombatVictory: (enemyId) => {
    let ok = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验（不能只信 CombatPage）：敌人必须存在且属于当前地点
      const enemy = getEnemy(enemyId)
      if (!enemy) return {}
      const location = getLocation(s.gameState.world.currentLocationId)
      if (!location) return {}
      if (!location.enemyIds?.includes(enemyId)) return {}
      // TM-P1-014：嘟嘟兔一次性 Boss 清场（最终防线）——兔王巢穴且背包已有《兔子的路径》时，重复/伪造胜利拒绝（false 且 GameState 完全不变，不置 ok）
      if (enemyId === 'dudu_rabbit' && location.id === 'rabbit_lair') {
        const hasPath = s.gameState.inventory.some((e) => e.itemId === 'rabbit_path')
        if (hasPath) return {}
      }
      // TM-P1-025：骷髅士兵一次性清场（完整前置守卫）——黑石塔一层骷髅士兵胜利必须：第五主线存在且 in_progress/stage 0 + wangcai_briefed===true + black_stone_tower_unlocked===true + floor1_soldier_defeated undefined/false；
      // 否则拒绝（false 且 GameState 完全不变，不置 ok）：quest 不存在/非 in_progress/stage!=0/briefed 非 true/unlocked 非 true/defeated 已 true 或非 boolean 一律拒绝
      if (enemyId === 'skeleton_soldier' && location.id === 'black_stone_tower_floor1') {
        const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
        const okDefeated =
          quest &&
          quest.flags.floor1_soldier_defeated !== true &&
          (typeof quest.flags.floor1_soldier_defeated === 'undefined' || typeof quest.flags.floor1_soldier_defeated === 'boolean')
        if (
          !quest ||
          quest.status !== 'in_progress' ||
          quest.stage !== 0 ||
          quest.flags.wangcai_briefed !== true ||
          s.gameState.world.flags.black_stone_tower_unlocked !== true ||
          !okDefeated
        ) {
          return {}
        }
      }
      // TM-P1-026：骷髅队长一次性 Boss 清场（完整前置守卫）——黑石塔一层骷髅队长胜利必须：第五主线存在且 in_progress/stage 0 + wangcai_briefed===true + black_stone_tower_unlocked===true + floor1_soldier_defeated===true + floor1_captain_defeated undefined/false；
      // 否则拒绝（false 且 GameState 完全不变，不置 ok）：士兵未击败/quest 不存在/非 in_progress/stage!=0/briefed 非 true/unlocked 非 true/captain 已 true 或非 boolean 一律拒绝
      if (enemyId === 'skeleton_captain' && location.id === 'black_stone_tower_floor1') {
        const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
        const captainFlag = quest?.flags.floor1_captain_defeated
        const captainOk = captainFlag !== true && (typeof captainFlag === 'undefined' || typeof captainFlag === 'boolean')
        if (
          !quest ||
          quest.status !== 'in_progress' ||
          quest.stage !== 0 ||
          quest.flags.wangcai_briefed !== true ||
          s.gameState.world.flags.black_stone_tower_unlocked !== true ||
          quest.flags.floor1_soldier_defeated !== true ||
          !captainOk
        ) {
          return {}
        }
      }
      // TM-P1-027：二层僵尸（固定顺序第一场）完整前置守卫——黑石塔二层 + 第五主线 in_progress/stage 0 + briefed===true + unlocked===true + floor2_unlocked===true + soldier===true + captain===true + floor2_zombie_defeated undefined/false；
      // 否则拒绝（false 且 GameState 完全不变，不置 ok）
      if (enemyId === 'tower_zombie' && location.id === 'black_stone_tower_floor2') {
        const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
        const zombieFlag = quest?.flags.floor2_zombie_defeated
        const zombieOk = zombieFlag !== true && (typeof zombieFlag === 'undefined' || typeof zombieFlag === 'boolean')
        if (
          !quest ||
          quest.status !== 'in_progress' ||
          quest.stage !== 0 ||
          quest.flags.wangcai_briefed !== true ||
          s.gameState.world.flags.black_stone_tower_unlocked !== true ||
          s.gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
          quest.flags.floor1_soldier_defeated !== true ||
          quest.flags.floor1_captain_defeated !== true ||
          !zombieOk
        ) {
          return {}
        }
      }
      // TM-P1-027：二层黑法师（固定顺序第二场）完整前置守卫——额外要求 floor2_zombie_defeated===true（僵尸未击败不得提前挑战黑法师）+ floor2_black_mage_defeated undefined/false；否则拒绝
      if (enemyId === 'black_mage' && location.id === 'black_stone_tower_floor2') {
        const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
        const mageFlag = quest?.flags.floor2_black_mage_defeated
        const mageOk = mageFlag !== true && (typeof mageFlag === 'undefined' || typeof mageFlag === 'boolean')
        if (
          !quest ||
          quest.status !== 'in_progress' ||
          quest.stage !== 0 ||
          quest.flags.wangcai_briefed !== true ||
          s.gameState.world.flags.black_stone_tower_unlocked !== true ||
          s.gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
          quest.flags.floor1_soldier_defeated !== true ||
          quest.flags.floor1_captain_defeated !== true ||
          quest.flags.floor2_zombie_defeated !== true ||
          !mageOk
        ) {
          return {}
        }
      }
      // TM-P1-028：二层骷髅战士（固定顺序第三场）完整前置守卫——额外要求 floor2_zombie_defeated===true 且 floor2_black_mage_defeated===true（入口区两敌未全部击败不得挑战骷髅战士）+ floor2_skeleton_warrior_defeated undefined/false；否则拒绝
      if (enemyId === 'skeleton_warrior' && location.id === 'black_stone_tower_floor2') {
        const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
        const warriorFlag = quest?.flags.floor2_skeleton_warrior_defeated
        const warriorOk = warriorFlag !== true && (typeof warriorFlag === 'undefined' || typeof warriorFlag === 'boolean')
        if (
          !quest ||
          quest.status !== 'in_progress' ||
          quest.stage !== 0 ||
          quest.flags.wangcai_briefed !== true ||
          s.gameState.world.flags.black_stone_tower_unlocked !== true ||
          s.gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
          quest.flags.floor1_soldier_defeated !== true ||
          quest.flags.floor1_captain_defeated !== true ||
          quest.flags.floor2_zombie_defeated !== true ||
          quest.flags.floor2_black_mage_defeated !== true ||
          !warriorOk
        ) {
          return {}
        }
      }
      // TM-P1-029：三层骷髅女妖（三层守卫）完整前置守卫——必须在三层 + 全部前序严格 true（含二层三敌均击败）+ floor3_skeleton_witch_defeated undefined/false；否则拒绝
      if (enemyId === 'skeleton_witch' && location.id === 'black_stone_tower_floor3') {
        const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
        const witchFlag = quest?.flags.floor3_skeleton_witch_defeated
        const witchOk = witchFlag !== true && (typeof witchFlag === 'undefined' || typeof witchFlag === 'boolean')
        if (
          !quest ||
          quest.status !== 'in_progress' ||
          quest.stage !== 0 ||
          quest.flags.wangcai_briefed !== true ||
          s.gameState.world.flags.black_stone_tower_unlocked !== true ||
          s.gameState.world.flags.black_stone_tower_floor2_unlocked !== true ||
          s.gameState.world.flags.black_stone_tower_floor3_unlocked !== true ||
          quest.flags.floor1_soldier_defeated !== true ||
          quest.flags.floor1_captain_defeated !== true ||
          quest.flags.floor2_zombie_defeated !== true ||
          quest.flags.floor2_black_mage_defeated !== true ||
          quest.flags.floor2_skeleton_warrior_defeated !== true ||
          !witchOk
        ) {
          return {}
        }
      }
      // TM-P2-001 D4/D5：黑鬃魔狼（北门外）完整前置守卫——必须在天龙城北门 + 《北门失联》in_progress/stage 0 + north_gate_trail_checked===true（未调查痕迹不得提前刷狼）+ north_gate_wolf_defeated undefined/false（true/非 boolean 拒绝）；否则拒绝
      if (enemyId === 'black_mane_wolf' && location.id === 'tianlong_north_gate') {
        const quest = s.gameState.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
        const wolfFlag = quest?.flags.north_gate_wolf_defeated
        const wolfOk = wolfFlag !== true && (typeof wolfFlag === 'undefined' || typeof wolfFlag === 'boolean')
        if (
          !quest ||
          quest.status !== 'in_progress' ||
          quest.stage !== 0 ||
          quest.flags.north_gate_trail_checked !== true ||
          !wolfOk
        ) {
          return {}
        }
      }
      // TM-P2-004 第 42 节：残灾之影守卫——guest 状态 + 神域 + 未击败（sakura.ts 纯规则 canFightCalamity）；否则拒绝
      if (enemyId === SAKURA_CALAMITY_ENEMY_ID && location.id === SAKURA_DOMAIN_LOCATION) {
        if (!canFightCalamity(s.gameState)) return {}
      }
      ok = true
      // TM-P2-006 第 38/40 节：战斗阅历——只在「首次正式击败」时授予（getEnemyFirstKillXp 复用现有 defeated flags 防重复）；
      // 重复遭遇 / 无 XP 定义 → firstKillXp=0，withFirstKillXp 原样返回
      const firstKillXp = getEnemyFirstKillXp(s.gameState, enemyId)
      const withXp = (gs: GameState, amount: number): GameState => {
        if (amount <= 0) return gs
        const progression = applyAdventureXpReward(gs.player, amount)
        if (!progression) return gs
        return { ...gs, player: progression.player }
      }
      const withFirstKillXp = (gs: GameState): GameState => withXp(gs, firstKillXp)
      // 《村外异动》任务推进：村外草原击败魔化兔 → completable（复用封板状态机）
      if (enemyId === 'corrupted_rabbit' && location.id === 'village_grassland') {
        const next = applyQuestTransition(s.gameState, 'quest_village_monsters', 'completable')
        if (next) return { gameState: withFirstKillXp(next) }
      }
      // 嘟嘟兔固定战利品（TM-P0-012）：兔王巢穴击败嘟嘟兔 → 首次获得《兔子的路径》×1（唯一，不重复）
      if (enemyId === 'dudu_rabbit' && location.id === 'rabbit_lair') {
        const hasPath = s.gameState.inventory.some((e) => e.itemId === 'rabbit_path')
        if (!hasPath) {
          return {
            gameState: withFirstKillXp({
              ...s.gameState,
              inventory: [...s.gameState.inventory, { itemId: 'rabbit_path', quantity: 1 }],
            }),
          }
        }
      }
      // 魔化鼠固定战利品（TM-P0-020）+《矿洞清理》任务推进（TM-P1-005）+《矿洞余患》支线推进（TM-P1-022）：
      // 废弃矿洞击败魔化鼠 → 铁矿石 +1（重复胜利堆叠同一 entry）；若《矿洞清理》in_progress 则同一次胜利推进为 completable；
      // 若《矿洞余患》支线 in_progress 则同一次胜利同时推进为 completable（二者互不排斥，均走既有状态机）
      if (enemyId === 'corrupted_rat' && location.id === 'abandoned_mine') {
        const inv = s.gameState.inventory
        const idx = inv.findIndex((e) => e.itemId === 'iron_ore')
        const current = idx >= 0 ? (inv[idx]?.quantity ?? 0) : 0
        // 数量安全：已有数量合法且 +1 仍为安全整数才更新；否则胜利仍合法但 inventory 不变
        const lootOk =
          idx < 0 ||
          (Number.isSafeInteger(current) && current >= 1 && Number.isSafeInteger(current + 1))
        // 战利品异常不阻断任务推进（P0-020 安全语义）：inventory 保持原样，任务仍可推进
        let next = applyQuestTransition(s.gameState, 'quest_mine_cleanup', 'completable') ?? s.gameState
        // TM-P1-022：同一次胜利叠加支线推进（不写 if/else 互斥；支线已非 in_progress 时 applyQuestTransition 返回 null 即不推进）
        const withSide = applyQuestTransition(next, 'quest_blacksmith_mine_remnant', 'completable')
        if (withSide) next = withSide
        const inventory = lootOk
          ? idx >= 0
            ? inv.map((e, i) => (i === idx ? { ...e, quantity: current + 1 } : e))
            : [...inv, { itemId: 'iron_ore', quantity: 1 }]
          : inv
        return { gameState: withFirstKillXp({ ...next, inventory }) }
      }
      // 《草原狼影》任务推进（TM-P1-010）：村外草原击败魔化狼且任务 in_progress → completable；无战利品（金币只在回村提交时获得）
      if (enemyId === 'corrupted_wolf' && location.id === 'village_grassland') {
        const next = applyQuestTransition(s.gameState, 'quest_grassland_wolf', 'completable')
        if (next) return { gameState: withFirstKillXp(next) }
      }
      // 黑石塔一层骷髅士兵（TM-P1-025）：黑石塔一层击败骷髅士兵且第五主线 in_progress/stage 0 + wangcai_briefed===true + 黑石塔已解锁 + floor1_soldier_defeated undefined/false → 成功只写 quest.flags.floor1_soldier_defeated=true（status/stage 不变；无金币/物品/装备/经验/关系奖励；不自动保存）
      if (enemyId === 'skeleton_soldier' && location.id === 'black_stone_tower_floor1') {
        const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_wangcai_trouble')
        if (questIndex >= 0) {
          const quest = s.gameState.quests[questIndex]
          if (quest && quest.status === 'in_progress' && quest.stage === 0) {
            const briefed = quest.flags.wangcai_briefed
            const defeated = quest.flags.floor1_soldier_defeated
            const unlocked = s.gameState.world.flags.black_stone_tower_unlocked
            // 前置：wangcai_briefed 严格 true；black_stone_tower_unlocked 严格 true；floor1_soldier_defeated 只允许 undefined/false（非 boolean 拒绝且完全不变；true 重复拒绝）
            if (briefed === true && unlocked === true && (defeated === undefined || defeated === false)) {
              const nextQuests = [...s.gameState.quests]
              nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, floor1_soldier_defeated: true } }
              return { gameState: withFirstKillXp({ ...s.gameState, quests: nextQuests }) }
            }
          }
        }
      }
      // 黑石塔一层骷髅队长（TM-P1-026）：合法首次 Boss 胜利只新增 quest.flags.floor1_captain_defeated=true（守卫已在 ok=true 前完成：士兵已击败+任务 in_progress/stage 0+briefed===true+unlocked===true+captain undefined/false）；status 保持 in_progress、stage 保持 0、soldier_defeated 保持 true；无金币/经验/等级/属性/装备/道具/声望/关系/治疗奖励；不自动保存
      if (enemyId === 'skeleton_captain' && location.id === 'black_stone_tower_floor1') {
        const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_wangcai_trouble')
        if (questIndex >= 0) {
          const quest = s.gameState.quests[questIndex]
          if (quest) {
            const nextQuests = [...s.gameState.quests]
            nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, floor1_captain_defeated: true } }
            return { gameState: withFirstKillXp({ ...s.gameState, quests: nextQuests }) }
          }
        }
      }
      // 黑石塔二层僵尸（TM-P1-027）：合法首次胜利只写 quest.flags.floor2_zombie_defeated=true（守卫已在 ok=true 前完成）；status/stage 不变；无 XP/金币/等级/物品/装备/关系/npcState/world flag/奖励；不自动保存
      if (enemyId === 'tower_zombie' && location.id === 'black_stone_tower_floor2') {
        const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_wangcai_trouble')
        if (questIndex >= 0) {
          const quest = s.gameState.quests[questIndex]
          if (quest) {
            const nextQuests = [...s.gameState.quests]
            nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, floor2_zombie_defeated: true } }
            return { gameState: withFirstKillXp({ ...s.gameState, quests: nextQuests }) }
          }
        }
      }
      // 黑石塔二层黑法师（TM-P1-027）：合法首次胜利只写 quest.flags.floor2_black_mage_defeated=true（守卫已在 ok=true 前完成：僵尸已击败）；status/stage 不变；无 XP/金币/等级/物品/装备/关系/治疗/奖励；不自动保存
      if (enemyId === 'black_mage' && location.id === 'black_stone_tower_floor2') {
        const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_wangcai_trouble')
        if (questIndex >= 0) {
          const quest = s.gameState.quests[questIndex]
          if (quest) {
            const nextQuests = [...s.gameState.quests]
            nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, floor2_black_mage_defeated: true } }
            return { gameState: withFirstKillXp({ ...s.gameState, quests: nextQuests }) }
          }
        }
      }
      // 黑石塔二层骷髅战士（TM-P1-028）：合法首次胜利只写 quest.flags.floor2_skeleton_warrior_defeated=true（守卫已在 ok=true 前完成：入口区僵尸+黑法师均已击败）；status/stage 不变；无 XP/金币/等级/装备/掉落/恢复/关系/npcState/world flag/战后剧情；不自动保存
      if (enemyId === 'skeleton_warrior' && location.id === 'black_stone_tower_floor2') {
        const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_wangcai_trouble')
        if (questIndex >= 0) {
          const quest = s.gameState.quests[questIndex]
          if (quest) {
            const nextQuests = [...s.gameState.quests]
            nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, floor2_skeleton_warrior_defeated: true } }
            return { gameState: withFirstKillXp({ ...s.gameState, quests: nextQuests }) }
          }
        }
      }
      // 黑石塔三层骷髅女妖（TM-P1-029）：合法首次胜利原子完成——只写 quest.flags.floor3_skeleton_witch_defeated=true + 获得夔峒项链 ×1（只允许一条 entry 不重复堆叠）；status/stage 保持 in_progress/stage 0 不设 completable；无金币/XP/等级/装备/治疗/关系/npcState/其他 world flag/战后奖励；不自动保存
      if (enemyId === 'skeleton_witch' && location.id === 'black_stone_tower_floor3') {
        const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_wangcai_trouble')
        if (questIndex >= 0) {
          const quest = s.gameState.quests[questIndex]
          if (quest) {
            const nextQuests = [...s.gameState.quests]
            nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, floor3_skeleton_witch_defeated: true } }
            // 背包只允许一条 kuidong_necklace entry；已有则不重复堆叠
            const hasNecklace = s.gameState.inventory.some((i) => i.itemId === 'kuidong_necklace')
            const nextInventory = hasNecklace ? s.gameState.inventory : [...s.gameState.inventory, { itemId: 'kuidong_necklace', quantity: 1 }]
            return { gameState: withFirstKillXp({ ...s.gameState, quests: nextQuests, inventory: nextInventory }) }
          }
        }
      }
      // 黑鬃魔狼（TM-P2-001 D5）：合法首次胜利推进《北门失联》——只写 quest.flags.north_gate_wolf_defeated=true 且 status→completable（stage 保持 0；无金币/物品/装备/经验/等级/关系奖励——金币在回武馆提交时获得；不自动保存）
      if (enemyId === 'black_mane_wolf' && location.id === 'tianlong_north_gate') {
        const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_gate_missing_patrol')
        if (questIndex >= 0) {
          const quest = s.gameState.quests[questIndex]
          if (quest) {
            const nextQuests = [...s.gameState.quests]
            nextQuests[questIndex] = {
              ...quest,
              status: 'completable',
              flags: { ...quest.flags, north_gate_wolf_defeated: true },
            }
            return { gameState: withFirstKillXp({ ...s.gameState, quests: nextQuests }) }
          }
        }
      }
      // TM-P2-004 第 42/43 节：残灾之影胜利——写 sakura_calamity_defeated=true + 位置回天龙城 + 契约提议就绪（神域崩塌 → 契约场景由 UI 消费；只结算一次）
      if (enemyId === SAKURA_CALAMITY_ENEMY_ID && location.id === SAKURA_DOMAIN_LOCATION) {
        return {
          gameState: withFirstKillXp({
            ...s.gameState,
            world: {
              ...s.gameState.world,
              currentLocationId: 'tianlong_city',
              flags: {
                ...s.gameState.world.flags,
                [SAKURA_FLAGS.calamityDefeated]: true,
                [SAKURA_FLAGS.contractOffered]: true,
              },
            },
          }),
        }
      }
      // 合法胜利但无持久效果（其他敌人 / 重复嘟嘟兔胜利 / 任务不在推进条件）：仍可能授予首次击败 XP（如：未接任务就击败的可重复遭遇敌人首次奖励）；其余状态全部不变
      // TM-P2-009-R1 §11.3：单敌可重复遭遇——首次授予 first-kill 并写首次标记（cave_bat/wild_boar，见 FIRST_KILL_FLAG_ENEMIES）；
      // 非首次（重复胜利）给低额 repeatAdventureXpReward（wild_wolf/cave_bat/wild_boar 单敌可重复遭遇）
      const repeatDef = repeatableEncounterDefForEnemy(enemyId)
      let base = s.gameState
      if (firstKillXp > 0 && repeatDef && FIRST_KILL_FLAG_ENEMIES.has(enemyId)) {
        base = {
          ...base,
          world: { ...base.world, flags: { ...base.world.flags, [`${enemyId}_first_kill`]: true } },
        }
      }
      const xp = firstKillXp > 0 ? firstKillXp : (repeatDef?.repeatAdventureXpReward ?? 0)
      const xpState = xp > 0 ? withXp(base, xp) : base
      return xpState === s.gameState ? {} : { gameState: xpState }
    })
    return ok
  },

  startEncounter: (encounterId) => {
    const state = get().gameState
    if (!state) return false
    const def = getEncounter(encounterId)
    if (!def) return false
    const check = checkEncounter(state, encounterId)
    if (!check.allowed) return false
    // weighted：首次 roll 并固化 world.encounterVariants（已固化不 reroll；§7.3 刷新/读档/切地点不重算）
    if (def.variants) {
      const existing = state.world.encounterVariants?.[encounterId]
      if (!existing) {
        const variantId = resolveEncounterVariant(def, () => Math.random())
        set((s) => {
          if (!s.gameState) return {}
          return {
            gameState: {
              ...s.gameState,
              world: {
                ...s.gameState.world,
                encounterVariants: {
                  ...(s.gameState.world.encounterVariants ?? {}),
                  [encounterId]: variantId,
                },
              },
            },
          }
        })
      }
    }
    return true
  },

  resolveEncounterVictory: (encounterId) => {
    const state = get().gameState
    if (!state) return null
    const def = getEncounter(encounterId)
    if (!def) return null
    // 单敌遭遇：委托现有 resolveCombatVictory（quest flags / 固定战利品 / first-kill XP 全复用）；返回 null（loot 展示由 CombatPage 走 grantLoot）
    const singleEnemyId = singleEnemyIdOf(def)
    if (singleEnemyId) {
      get().resolveCombatVictory(singleEnemyId)
      return null
    }
    // 多敌遭遇：整体胜利事务（§6/§15/§16）——XP sum + loot 聚合 + encounterDefeatFlag 一次性写入
    const check = checkEncounter(state, encounterId)
    if (!check.allowed) return null
    const variantId = currentEncounterVariantId(state, def)
    const variant = variantId ? def.variants?.find((v) => v.id === variantId) : undefined
    if (!variant) return null
    let firstKillXp = 0
    const grants: LootGrant[] = []
    for (const member of variant.members) {
      for (let i = 0; i < member.count; i += 1) {
        // 每个 EnemyInstance 独立结算（§16 pendingLoot；同 enemyId 多实例各算一次 XP）
        firstKillXp += getEnemyFirstKillXp(state, member.enemyId)
        const grant = rollLoot(member.enemyId, state.player.attributes.lck)
        if (grant) grants.push(grant)
      }
    }
    // TM-P2-009-R1 §11.3：遭遇胜利 XP——首次击败优先 first-kill 总和；否则 repeatable 遭遇重复胜利给低额 repeat XP
    // 同 enemyId 多实例按 count 展开各计一次（如 wild_wolf×2 → 2 次）
    const xp = resolveEncounterVictoryXp(
      state,
      def,
      variant.members.flatMap((m) => Array.from({ length: m.count }, () => ({ enemyId: m.enemyId }))),
    )
    let ok = false
    set((s) => {
      if (!s.gameState) return {}
      let gs = s.gameState
      if (xp > 0) {
        const progression = applyAdventureXpReward(gs.player, xp)
        if (progression) gs = { ...gs, player: progression.player }
      }
      let inventory = [...gs.inventory]
      let gold = gs.player.gold
      for (const grant of grants) {
        for (const it of grant.items) {
          const idx = inventory.findIndex((e) => e.itemId === it.itemId)
          inventory =
            idx >= 0
              ? inventory.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + it.quantity } : e))
              : [...inventory, { itemId: it.itemId, quantity: it.quantity }]
        }
        gold += grant.gold
      }
      // TM-P2-009-R1 §2.1：驿站狼群战斗胜利额外写 waystation_wolf_pack_combat=true——
      // 区分「战斗击杀」与「非战斗绕开」：非战斗路线（MND/LCK/Sakura/Mount）只写 neutralized，不消耗 wild_wolf first-kill（A7）
      const extraCombatFlags: Record<string, boolean> =
        encounterId === 'encounter_waystation_wolf_pack' ? { waystation_wolf_pack_combat: true } : {}
      // TM-P2-009-R1 §11：多敌可重复遭遇首次击败写入 first-kill 标记（仅 FIRST_KILL_FLAG_ENEMIES 需要 flag 记录）
      const firstKillFlags: Record<string, boolean> = {}
      if (firstKillXp > 0) {
        for (const member of variant.members) {
          if (FIRST_KILL_FLAG_ENEMIES.has(member.enemyId) && getEnemyFirstKillXp(state, member.enemyId) > 0) {
            firstKillFlags[`${member.enemyId}_first_kill`] = true
          }
        }
      }
      const hasFlagChanges =
        Boolean(def.encounterDefeatFlag) || Object.keys(extraCombatFlags).length > 0 || Object.keys(firstKillFlags).length > 0
      const world = hasFlagChanges
        ? {
            ...gs.world,
            flags: {
              ...gs.world.flags,
              ...extraCombatFlags,
              ...firstKillFlags,
              ...(def.encounterDefeatFlag ? { [def.encounterDefeatFlag]: true } : {}),
            },
          }
        : gs.world
      ok = true
      return { gameState: { ...gs, inventory, player: { ...gs.player, gold }, world } }
    })
    if (ok && encounterId.startsWith('encounter_trial_')) {
      set((s) => {
        const state = s.gameState
        if (!state) return {}
        const index = state.quests.findIndex((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
        const quest = state.quests[index]
        if (index < 0 || !quest || quest.status !== 'in_progress' || quest.flags.trial_observation_done !== true || quest.flags.trial_combat_done === true) return {}
        const quests = [...state.quests]
        quests[index] = { ...quest, stage: Math.max(quest.stage, 2), flags: { ...quest.flags, trial_combat_done: true } }
        return { gameState: { ...state, quests } }
      })
    }
    return ok ? resolveEncounterLoot(grants) : null
  },

  applyPartyCombatEnd: ({ playerHp, playerMp, potionsUsed, companions }) => {
    if (
      !Number.isFinite(playerHp) ||
      !Number.isFinite(playerMp) ||
      !Number.isInteger(potionsUsed) ||
      potionsUsed < 0
    ) {
      return false
    }
    let ok = false
    set((s) => {
      if (!s.gameState) return {}
      const player = s.gameState.player
      const hp = Math.min(player.maxHp, Math.max(0, Math.round(playerHp)))
      const mp = Math.min(player.maxMp, Math.max(0, Math.round(playerMp)))
      let inventory = s.gameState.inventory
      if (potionsUsed > 0) {
        const idx = inventory.findIndex((e) => e.itemId === 'healing_potion')
        const remaining = (idx >= 0 ? inventory[idx]?.quantity ?? 0 : 0) - potionsUsed
        if (remaining > 0) {
          inventory = idx >= 0 ? inventory.map((e, i) => (i === idx ? { ...e, quantity: remaining } : e)) : inventory
        } else {
          inventory = inventory.filter((e) => e.itemId !== 'healing_potion')
        }
      }
      let nextCompanions = s.gameState.companions
      for (const companion of companions ?? []) {
        const entry = nextCompanions[companion.companionId]
        if (entry) {
          const companionMp = Math.min(entry.maxMp, Math.max(0, Math.round(companion.mp)))
          nextCompanions = { ...nextCompanions, [companion.companionId]: { ...entry, mp: companionMp } }
        }
      }
      ok = true
      return { gameState: { ...s.gameState, player: { ...player, hp, mp }, inventory, companions: nextCompanions } }
    })
    return ok
  },

  buyMount: (mountId) => {
    let result: 'bought' | 'locked' | 'unknown' | 'not_in_city' | 'not_enough_gold' | 'already_owned' = 'unknown'
    set((s) => {
      const state = s.gameState
      if (!state) return {}
      // 坐骑必须存在
      if (!getMount(mountId)) return {}
      // 必须登记了价格（本阶段只有火焰驹）；未登记 = locked
      const price = MOUNT_PRICES[mountId]
      if (!price || price <= 0) {
        result = 'locked'
        return {}
      }
      // 马厩仅在天龙城可用
      if (state.world.currentLocationId !== 'tianlong_city') {
        result = 'not_in_city'
        return {}
      }
      // 已拥有不重复购买
      if (state.ownedMountIds.includes(mountId)) {
        result = 'already_owned'
        return {}
      }
      if (state.player.gold < price) {
        result = 'not_enough_gold'
        return {}
      }
      result = 'bought'
      // 原子更新：扣金与加入 ownedMountIds 一次完成；购买后不自动装备
      return {
        gameState: {
          ...state,
          player: { ...state.player, gold: state.player.gold - price },
          ownedMountIds: [...state.ownedMountIds, mountId],
        },
      }
    })
    return result
  },

  equipMount: (mountId) => {
    let ok = false
    set((s) => {
      const state = s.gameState
      if (!state) return {}
      if (!getMount(mountId)) return {}
      if (!state.ownedMountIds.includes(mountId)) return {}
      ok = true
      return { gameState: { ...state, equippedMountId: mountId } }
    })
    return ok
  },

  unequipMount: () => {
    let ok = false
    set((s) => {
      const state = s.gameState
      if (!state || state.equippedMountId === null) return {}
      ok = true
      return { gameState: { ...state, equippedMountId: null } }
    })
    return ok
  },

  exploreMountTrail: () => {
    let result: D20CheckResult | null = null
    set((s) => {
      const state = s.gameState
      if (!state) return {}
      // 合法性：天龙城 + fast_travel 坐骑 + 一次性（不满足 → null 且状态不变）
      if (!canExploreMountTrail(state)) return {}
      // D20 异常安全：角色数据非法抛 RangeError → 返回 null 且状态不变、页面不崩溃
      let check: D20CheckResult
      try {
        check = performD20Check({
          attributeScore: getEffectiveCharacterAttributes(state.player.attributes, state.equippedMountId).agi,
          level: state.player.level,
          dc: CHECK_DC.moderate,
          proficient: false,
          situationalModifier: 0,
        })
      } catch {
        return {}
      }
      // 原子更新：D20 结算与 flags/gold 写入在同一次 Store 更新中完成
      result = check
      return check.success
        ? {
            gameState: {
              ...state,
              player: { ...state.player, gold: state.player.gold + MOUNT_TRAIL_REWARD_GOLD },
              world: {
                ...state.world,
                flags: { ...state.world.flags, mount_trail_explored: 'found' },
              },
            },
          }
        : {
            gameState: {
              ...state,
              world: {
                ...state.world,
                flags: { ...state.world.flags, mount_trail_explored: 'nothing' },
              },
            },
          }
    })
    return result
  },

  useHealingPotion: () => {
    let used = false
    set((s) => {
      if (!s.gameState) return {}
      const player = s.gameState.player
      // HP 0 不能复活；满血不浪费药水
      if (player.hp <= 0 || player.hp >= player.maxHp) return {}
      const potion = getItem('healing_potion')
      if (!potion?.healAmount || !Number.isInteger(potion.healAmount) || potion.healAmount <= 0) return {}
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === 'healing_potion')
      if (idx < 0) return {}
      const entry = inv[idx]
      if (!entry || entry.quantity < 1) return {}
      // 原子更新：HP 恢复与药水扣减在同一次 Store 更新中完成
      const hp = Math.min(player.maxHp, player.hp + potion.healAmount)
      const remaining = entry.quantity - 1
      const inventory =
        remaining > 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: remaining } : e))
          : inv.filter((e) => e.itemId !== 'healing_potion')
      used = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...player, hp },
          inventory,
        },
      }
    })
    return used
  },

  equipWeapon: (itemId) => {
    let equipped = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验：物品存在、是 weapon、且背包实际拥有该武器
      const item = getItem(itemId)
      if (!item || item.type !== 'weapon') return {}
      const owned = s.gameState.inventory.some((e) => e.itemId === itemId && e.quantity >= 1)
      if (!owned) return {}
      equipped = true
      return {
        gameState: {
          ...s.gameState,
          equipment: { ...s.gameState.equipment, weapon: itemId },
        },
      }
    })
    return equipped
  },

  equipItem: (itemId) => {
    let ok = false
    set((s) => {
      const state = s.gameState
      const check = checkEquipItem(state, itemId)
      if (!state || !check.allowed || !check.slot) return {}
      ok = true
      return { gameState: { ...state, equipment: { ...state.equipment, [check.slot]: itemId } } }
    })
    return ok
  },

  unequipSlot: (slot) => {
    let ok = false
    set((s) => {
      if (!s.gameState || s.gameState.equipment[slot] === null) return {}
      ok = true
      return { gameState: { ...s.gameState, equipment: { ...s.gameState.equipment, [slot]: null } } }
    })
    return ok
  },

  unequipWeapon: () => {
    let unequipped = false
    set((s) => {
      if (!s.gameState) return {}
      if (s.gameState.equipment.weapon === null) return {}
      unequipped = true
      return {
        gameState: {
          ...s.gameState,
          equipment: { ...s.gameState.equipment, weapon: null },
        },
      }
    })
    return unequipped
  },

  buyHealingPotion: () => {
    let bought = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验：当前地点必须有药师在场（读 NPC 注册表，不硬编码地点）
      const apothecary = getNpc('apothecary')
      if (!apothecary || apothecary.locationId !== s.gameState.world.currentLocationId) return {}
      // 商品数据校验：治疗药水存在、consumable、value 为正整数（价格唯一来源 ItemDefinition.value）
      const potion = getItem('healing_potion')
      if (!potion || potion.type !== 'consumable') return {}
      const price = potion.value
      if (!Number.isSafeInteger(price) || price <= 0) return {}
      const gold = s.gameState.player.gold
      if (!Number.isSafeInteger(gold) || gold < price) return {}
      // 数量安全：药水数量 +1 必须是安全整数
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === 'healing_potion')
      const current = idx >= 0 ? (inv[idx]?.quantity ?? 0) : 0
      if (!Number.isSafeInteger(current) || !Number.isSafeInteger(current + 1)) return {}
      // 原子交易：金币扣除与药水增加在同一次 Store 更新中完成（不拼接 removeGold/addItem）
      const inventory =
        idx >= 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: (e.quantity ?? 0) + 1 } : e))
          : [...inv, { itemId: 'healing_potion', quantity: 1 }]
      bought = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...s.gameState.player, gold: gold - price },
          inventory,
        },
      }
    })
    return bought
  },

  buyMerchantItem: (merchantId, itemId) => {
    let bought = false
    set((s) => {
      const state = s.gameState
      const offer = getMerchantOffer(merchantId, itemId)
      if (!offer || !canBuyMerchantItem(state, merchantId, itemId) || !state) return {}
      const matchingEntries = state.inventory
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.itemId === itemId)
      if (matchingEntries.length > 1) return {}
      const idx = matchingEntries[0]?.index ?? -1
      const current = idx >= 0 ? (matchingEntries[0]?.entry.quantity ?? 0) : 0
      if (!Number.isSafeInteger(current) || current < 0 || !Number.isSafeInteger(current + 1)) return {}
      const inventory = idx >= 0
        ? state.inventory.map((entry, i) => (i === idx ? { ...entry, quantity: current + 1 } : entry))
        : [...state.inventory, { itemId, quantity: 1 }]
      bought = true
      return { gameState: { ...state, player: { ...state.player, gold: state.player.gold - offer.price }, inventory } }
    })
    return bought
  },

  investigateAbandonedMine: () => {
    let result: D20CheckResult | null = null
    set((s) => {
      if (!s.gameState) return {}
      // 合法性：必须在废弃矿洞，且未调查过（一次性检定，禁止重掷）
      if (s.gameState.world.currentLocationId !== 'abandoned_mine') return {}
      if (s.gameState.world.flags.abandoned_mine_investigation !== undefined) return {}
      // D20 异常安全：角色数据非法（如 level=0）抛 RangeError → 返回 null 且状态不变、页面不崩溃
      let check: D20CheckResult
      try {
        check = performD20Check({
          attributeScore: s.gameState.player.attributes.mnd,
          level: s.gameState.player.level,
          dc: CHECK_DC.moderate,
          proficient: false,
          situationalModifier: 0,
        })
      } catch {
        return {}
      }
      // 原子更新：D20 结算与 flags 写入在同一次 Store 更新中完成（不调用通用 setFlag 二次更新）
      result = check
      const investigation = check.success ? 'success' : 'failure'
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            flags: { ...s.gameState.world.flags, abandoned_mine_investigation: investigation },
          },
        },
      }
    })
    return result
  },

  sellIronOre: () => {
    let sold = false
    set((s) => {
      if (!s.gameState) return {}
      // Store 自校验：当前地点必须有铁匠在场（读 NPC 注册表，不硬编码地点）
      const blacksmith = getNpc('blacksmith')
      if (!blacksmith || blacksmith.locationId !== s.gameState.world.currentLocationId) return {}
      // 商品数据校验：铁矿石存在、material、value 为正安全整数（价格唯一来源 ItemDefinition.value）
      const ore = getItem('iron_ore')
      if (!ore || ore.type !== 'material') return {}
      const price = ore.value
      if (!Number.isSafeInteger(price) || price <= 0) return {}
      // 库存校验：拥有铁矿石且数量为正安全整数
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === 'iron_ore')
      if (idx < 0) return {}
      const quantity = inv[idx]?.quantity
      if (!Number.isSafeInteger(quantity) || (quantity ?? 0) < 1) return {}
      // 金币安全：非负安全整数且 +price 仍安全整数
      const gold = s.gameState.player.gold
      if (!Number.isSafeInteger(gold) || gold < 0 || !Number.isSafeInteger(gold + price)) return {}
      // 原子交易：金币增加与铁矿石减少在同一次 Store 更新中完成（不拼接 removeItem/addGold）
      const remaining = (quantity ?? 0) - 1
      const inventory = remaining > 0 ? inv.map((e, i) => (i === idx ? { ...e, quantity: remaining } : e)) : inv.filter((e) => e.itemId !== 'iron_ore')
      sold = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...s.gameState.player, gold: gold + price },
          inventory,
        },
      }
    })
    return sold
  },

  restAtVillage: () => {
    // TM-P2-004 第 58 节：旧休整入口作为 wrapper 走统一 longRest 纯规则（本入口固定只允许青石村）
    const s = get().gameState
    if (!s || s.world.currentLocationId !== 'qingshi_village') return false
    return get().longRest()
  },

  restAtTianlongMartialHall: () => {
    // TM-P2-004 第 58 节：旧休整入口作为 wrapper 走统一 longRest 纯规则（本入口固定只允许武馆）
    const s = get().gameState
    if (!s || s.world.currentLocationId !== 'tianlong_martial_hall') return false
    return get().longRest()
  },

  spendSkillMp: (skillId) => {
    const s = get().gameState
    if (!s) return false
    const player = s.player
    // TM-P2-003-R3 C：统一校验（与北门场景共用同一 pure rule，不再复制一套业务判断）
    const check = checkSkillUse(skillId, {
      learnedSkillIds: player.learnedSkillIds,
      profession: player.profession,
      mp: player.mp,
      maxMp: player.maxMp,
    })
    if (!check.allowed) return false
    const cost = check.mpCost ?? 0
    if (cost === 0) return true // 不耗 MP，但必须已学习且职业兼容（上面已统一校验）
    let spent = false
    set((st) => {
      if (!st.gameState) return {}
      const p = st.gameState.player
      // 防竞态：set 内按最新 Character 重新走同一 pure 校验（不能只信旧 snapshot）
      const recheck = checkSkillUse(skillId, {
        learnedSkillIds: p.learnedSkillIds,
        profession: p.profession,
        mp: p.mp,
        maxMp: p.maxMp,
      })
      if (!recheck.allowed) return {}
      spent = true
      return { gameState: { ...st.gameState, player: { ...p, mp: p.mp - cost } } }
    })
    return spent
  },

  spendMageSpellMp: () => {
    let spent = false
    set((s) => {
      if (!s.gameState) return {}
      const player = s.gameState.player
      // 职业边界：仅法师可以施放法术攻击
      if (player.profession !== 'mage') return {}
      // 数据安全：maxMp 非负安全整数 / mp 非负安全整数且在 [0, maxMp] 内
      if (!Number.isSafeInteger(player.maxMp) || player.maxMp < 0) return {}
      if (!Number.isSafeInteger(player.mp) || player.mp < 0 || player.mp > player.maxMp) return {}
      // 灵力不足：mp < 消耗 → 拒绝且状态完全不变
      if (player.mp < MAGE_SPELL_MP_COST) return {}
      spent = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...player, mp: player.mp - MAGE_SPELL_MP_COST },
        },
      }
    })
    return spent
  },

  spendKnightPowerStrikeMp: () => {
    let spent = false
    set((s) => {
      if (!s.gameState) return {}
      const player = s.gameState.player
      // 职业边界：仅骑士可以使用骑士重击
      if (player.profession !== 'knight') return {}
      // 数据安全：maxMp 非负安全整数 / mp 非负安全整数且在 [0, maxMp] 内
      if (!Number.isSafeInteger(player.maxMp) || player.maxMp < 0) return {}
      if (!Number.isSafeInteger(player.mp) || player.mp < 0 || player.mp > player.maxMp) return {}
      // 灵力不足：mp < 消耗 → 拒绝且状态完全不变
      if (player.mp < KNIGHT_POWER_STRIKE_MP_COST) return {}
      spent = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...player, mp: player.mp - KNIGHT_POWER_STRIKE_MP_COST },
        },
      }
    })
    return spent
  },

  spendWarriorSuppressStrikeMp: () => {
    let spent = false
    set((s) => {
      if (!s.gameState) return {}
      const player = s.gameState.player
      // 职业边界：仅战士可以使用压制猛击
      if (player.profession !== 'warrior') return {}
      // 数据安全：maxMp 非负安全整数 / mp 非负安全整数且在 [0, maxMp] 内
      if (!Number.isSafeInteger(player.maxMp) || player.maxMp < 0) return {}
      if (!Number.isSafeInteger(player.mp) || player.mp < 0 || player.mp > player.maxMp) return {}
      // 灵力不足：mp < 消耗 → 拒绝且状态完全不变
      if (player.mp < WARRIOR_SUPPRESS_STRIKE_MP_COST) return {}
      spent = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...player, mp: player.mp - WARRIOR_SUPPRESS_STRIKE_MP_COST },
        },
      }
    })
    return spent
  },

  respondToVillageElderAfterQuest: (choice) => {
    let responded = false
    set((s) => {
      if (!s.gameState) return {}
      // 非法 choice 拒绝（不抛异常）
      if (choice !== 'reassure' && choice !== 'resolve') return {}
      // 前置：任务已完成 + 村长注册存在 + 当前在村长所在地 + 村长 NpcState 已存在（P1-002 保证；缺失不追补）
      const questCompleted = s.gameState.quests.some(
        (q) => q.questId === 'quest_village_monsters' && q.status === 'completed',
      )
      if (!questCompleted) return {}
      const elder = getNpc('village_elder')
      if (!elder || elder.locationId !== s.gameState.world.currentLocationId) return {}
      const elderState = s.gameState.world.npcStates.village_elder
      if (!elderState) return {}
      // 一次性事件：completedEvents 已含事件 ID → 不可再回应
      if (s.gameState.world.completedEvents.includes(VILLAGE_ELDER_POST_QUEST_EVENT_ID)) return {}
      // 关系数值安全（只结算目标维度）：finite 且 +1 仍 finite，否则整次拒绝（不把坏值归零）
      const target = choice === 'reassure' ? elderState.relationship.trust : elderState.relationship.respect
      if (!Number.isFinite(target) || !Number.isFinite(target + 1)) return {}
      responded = true
      const relationship =
        choice === 'reassure'
          ? { ...elderState.relationship, trust: elderState.relationship.trust + 1 }
          : { ...elderState.relationship, respect: elderState.relationship.respect + 1 }
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            npcStates: { ...s.gameState.world.npcStates, village_elder: { ...elderState, relationship } },
            completedEvents: [...s.gameState.world.completedEvents, VILLAGE_ELDER_POST_QUEST_EVENT_ID],
          },
        },
      }
    })
    return responded
  },

  addGold: (amount) => {
    // R3：与存档校验一致，金币仅允许正整数增量（保持非负整数约束）
    if (!Number.isInteger(amount) || amount <= 0) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              player: { ...s.gameState.player, gold: s.gameState.player.gold + amount },
            },
          }
        : {},
    )
  },

  removeGold: (amount) => {
    if (!Number.isInteger(amount) || amount <= 0) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              player: {
                ...s.gameState.player,
                gold: Math.max(0, s.gameState.player.gold - amount),
              },
            },
          }
        : {},
    )
  },

  addItem: (itemId, quantity = 1) => {
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) return
    set((s) => {
      if (!s.gameState) return {}
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === itemId)
      const next =
        idx >= 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + quantity } : e))
          : [...inv, { itemId, quantity }]
      return { gameState: { ...s.gameState, inventory: next } }
    })
  },

  grantLoot: (enemyId) => {
    const player = get().gameState?.player
    if (!player) return null
    const grant = rollLoot(enemyId, player.attributes.lck)
    if (!grant) return null
    set((s) => {
      if (!s.gameState) return {}
      let inventory = [...s.gameState.inventory]
      for (const it of grant.items) {
        const idx = inventory.findIndex((e) => e.itemId === it.itemId)
        inventory =
          idx >= 0
            ? inventory.map((e, i) => (i === idx ? { ...e, quantity: e.quantity + it.quantity } : e))
            : [...inventory, { itemId: it.itemId, quantity: it.quantity }]
      }
      return {
        gameState: {
          ...s.gameState,
          inventory,
          player: { ...s.gameState.player, gold: s.gameState.player.gold + grant.gold },
        },
      }
    })
    return grant
  },

  removeItem: (itemId, quantity = 1) => {
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) return
    set((s) => {
      if (!s.gameState) return {}
      const inv = s.gameState.inventory
      const entry = inv.find((e) => e.itemId === itemId)
      if (!entry) return {}
      const remaining = entry.quantity - quantity
      const next =
        remaining > 0
          ? inv.map((e) => (e.itemId === itemId ? { ...e, quantity: remaining } : e))
          : inv.filter((e) => e.itemId !== itemId)
      return { gameState: { ...s.gameState, inventory: next } }
    })
  },

  setFlag: (key, value) => {
    if (!key) return
    // R4：拒绝非有限数字（NaN/±Infinity 无法 JSON round-trip，写入后存档将不可加载）
    if (typeof value === 'number' && !Number.isFinite(value)) return
    set((s) =>
      s.gameState
        ? {
            gameState: {
              ...s.gameState,
              world: {
                ...s.gameState.world,
                flags: { ...s.gameState.world.flags, [key]: value },
              },
            },
          }
        : {},
    )
  },

  inspectRabbitPath: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      const entry = s.gameState.inventory.find((e) => e.itemId === 'rabbit_path')
      // TM-P1-013：非法 quantity（0/-1/1.5/NaN/Infinity/非安全整数）一律拒绝
      if (!entry || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return {}
      const existing = s.gameState.world.flags.rabbit_path_examined
      // TM-P1-013：已查看（true）重复调用拒绝；已存在但非 boolean 的异常旧值拒绝（不静默覆盖）
      if (existing === true || (existing !== undefined && typeof existing !== 'boolean')) return {}
      changed = true
      // TM-P1-013：成功只设置 world.flags.rabbit_path_examined=true（地图不消耗；player/inventory/equipment/quests/位置/completedEvents/npcStates 全不变；不自动保存）
      // TM-P2-008 §8：同时把《兔子的路径》登记为已发现线索 clue_rabbit_path（同一原子写入，幂等；不改变 Golden Rabbit 剧情状态）
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            flags: { ...s.gameState.world.flags, rabbit_path_examined: true, clue_rabbit_path: true },
          },
        },
      }
    })
    return changed
  },

  addClue: (clueId) => {
    // TM-P2-008 §38：clueId 未注册直接拒绝，GameState 完全不变
    if (!getClue(clueId)) return { ok: false, added: false, alreadyKnown: false }
    let added = false
    set((s) => {
      if (!s.gameState) return {}
      const next = applyClueDiscovery(s.gameState, clueId)
      if (!next) return {}
      added = true
      return { gameState: next }
    })
    // §39：重复获取（已发现）不重复插入，返回 alreadyKnown
    return added
      ? { ok: true, added: true, alreadyKnown: false, clue: getClue(clueId) }
      : { ok: true, added: false, alreadyKnown: true }
  },

  reportRabbitPathToVillageElder: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在青石村（正式剧情位置约束）
      if (s.gameState.world.currentLocationId !== 'qingshi_village') return {}
      // 必须合法持有 rabbit_path（quantity 安全整数 >=1；非法一律拒绝）
      const entry = s.gameState.inventory.find((e) => e.itemId === 'rabbit_path')
      if (!entry || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return {}
      // 必须已展开地图
      if (s.gameState.world.flags.rabbit_path_examined !== true) return {}
      // 必须《草原狼影》已完成（青石村主线链收束前置）
      const wolfQuest = s.gameState.quests.find((q) => q.questId === 'quest_grassland_wolf')
      if (wolfQuest?.status !== 'completed') return {}
      const existing = s.gameState.world.flags.rabbit_path_reported
      // 已汇报（true）重复拒绝；已存在但非 boolean 的异常旧值拒绝（不静默覆盖）
      if (existing === true || (existing !== undefined && typeof existing !== 'boolean')) return {}
      changed = true
      // TM-P1-016：成功只写 world.flags.rabbit_path_reported=true（地图不消耗；金币/等级/HP/MP/关系全 +0；player/equipment/quests/inventory/位置/completedEvents/npcStates/其他 flags 全不变；不自动保存）
      return {
        gameState: {
          ...s.gameState,
          world: {
            ...s.gameState.world,
            flags: { ...s.gameState.world.flags, rabbit_path_reported: true },
          },
        },
      }
    })
    return changed
  },

  consultGoldenRabbitSearchNpc: (npcId) => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在青石村（两位调查对象均常驻青石村）
      if (s.gameState.world.currentLocationId !== 'qingshi_village') return {}
      // 第四任务必须存在且 in_progress（唯一调查对象；stage 保持 0，本卡不推进）
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_golden_rabbit_search')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest || quest.status !== 'in_progress') return {}
      // 非法 npcId（运行时强转）拒绝
      if (npcId !== 'blacksmith' && npcId !== 'apothecary') return {}
      const flagKey = npcId === 'blacksmith' ? 'asked_blacksmith' : 'asked_apothecary'
      // TM-P1-018-R1：写任何调查 flag 前同时验证两个相关 flag——各自只允许 undefined/false/true；任一个为非 boolean 已存在值（"yes"/1/0.5 等）整次拒绝且完全不变（不静默覆盖）
      const blacksmithFlag = quest.flags.asked_blacksmith
      const apothecaryFlag = quest.flags.asked_apothecary
      const malformed =
        (blacksmithFlag !== undefined && typeof blacksmithFlag !== 'boolean') ||
        (apothecaryFlag !== undefined && typeof apothecaryFlag !== 'boolean')
      if (malformed) return {}
      // 当前 NPC 已询问（true）重复拒绝
      if (quest.flags[flagKey] === true) return {}
      changed = true
      // TM-P1-018：成功只写该任务 QuestState.flags.asked_{npcId}=true（其他状态完全不变；不建 npcState/不改 stage/不推进 completable/无奖励/不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, [flagKey]: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  reportGoldenRabbitVillageInvestigation: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在青石村（村长常驻青石村）
      if (s.gameState.world.currentLocationId !== 'qingshi_village') return {}
      // 第四任务必须存在且 in_progress（stage 保持 0，具体目的地未确定，本卡不推进）
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_golden_rabbit_search')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest || quest.status !== 'in_progress') return {}
      // TM-P1-019：三个相关 flag 完整校验（R1 原则）——各自只允许 undefined/boolean；任一非 boolean 已存在值整体拒绝且完全不变（不静默覆盖）
      const blacksmithFlag = quest.flags.asked_blacksmith
      const apothecaryFlag = quest.flags.asked_apothecary
      const reportedFlag = quest.flags.village_inquiry_reported
      const malformed =
        (blacksmithFlag !== undefined && typeof blacksmithFlag !== 'boolean') ||
        (apothecaryFlag !== undefined && typeof apothecaryFlag !== 'boolean') ||
        (reportedFlag !== undefined && typeof reportedFlag !== 'boolean')
      if (malformed) return {}
      // 两人必须均已询问（严格 === true；0/2、1/2 均不可复命）
      if (blacksmithFlag !== true || apothecaryFlag !== true) return {}
      // 已复命（true）重复拒绝
      if (reportedFlag === true) return {}
      changed = true
      // TM-P1-019：成功只写 quest.flags.village_inquiry_reported=true（两个 asked flag 保持 true；status 仍 in_progress、stage 仍 0；不建 npcState/无奖励/不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, village_inquiry_reported: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  recheckGoldenRabbitMapAtLair: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在兔王巢穴（正式剧情位置约束）
      if (s.gameState.world.currentLocationId !== 'rabbit_lair') return {}
      // 第四任务必须存在且 in_progress（stage 保持 0，真实下一地点仍未知，本卡不推进）
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_golden_rabbit_search')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest || quest.status !== 'in_progress') return {}
      // TM-P1-020：四个相关 flag 完整校验（R1 原则）——各自只允许 undefined/boolean；任一非 boolean 已存在值整体拒绝且完全不变（不静默覆盖）
      const blacksmithFlag = quest.flags.asked_blacksmith
      const apothecaryFlag = quest.flags.asked_apothecary
      const reportedFlag = quest.flags.village_inquiry_reported
      const recheckedFlag = quest.flags.rabbit_lair_rechecked
      const malformed =
        (blacksmithFlag !== undefined && typeof blacksmithFlag !== 'boolean') ||
        (apothecaryFlag !== undefined && typeof apothecaryFlag !== 'boolean') ||
        (reportedFlag !== undefined && typeof reportedFlag !== 'boolean') ||
        (recheckedFlag !== undefined && typeof recheckedFlag !== 'boolean')
      if (malformed) return {}
      // 前三调查 flag 必须严格 === true（村内调查已走完）
      if (blacksmithFlag !== true || apothecaryFlag !== true || reportedFlag !== true) return {}
      // 已复查（true）重复拒绝
      if (recheckedFlag === true) return {}
      // 必须合法持有 rabbit_path（quantity 安全整数 >=1；0/-1/1.5/NaN/Infinity/缺失一律拒绝）
      const entry = s.gameState.inventory.find((e) => e.itemId === 'rabbit_path')
      if (!entry || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return {}
      // 必须已展开地图
      if (s.gameState.world.flags.rabbit_path_examined !== true) return {}
      changed = true
      // TM-P1-020：成功只写 quest.flags.rabbit_lair_rechecked=true（前三 flag 保持 true；status 仍 in_progress、stage 仍 0；地图不消耗/无奖励/不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, rabbit_lair_rechecked: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  inspectApothecaryHerbRoute: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在村外草原（采药区域所在地）
      if (s.gameState.world.currentLocationId !== 'village_grassland') return {}
      // 支线必须存在且 in_progress（可接受后才有调查动作）
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_apothecary_herb_route')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest || quest.status !== 'in_progress') return {}
      // TM-P1-021：grassland_checked flag 安全——只允许 undefined/false/true；非 boolean 已存在值（"yes"/1/0.5）拒绝且不静默覆盖
      const checkedFlag = quest.flags.grassland_checked
      if (checkedFlag !== undefined && typeof checkedFlag !== 'boolean') return {}
      // 已调查（true）重复拒绝
      if (checkedFlag === true) return {}
      changed = true
      // TM-P1-021：成功原子写 flags.grassland_checked=true 且 status→completable（stage 保持 0；金币/等级/HP/MP/物品/装备/关系/world.flags/completedEvents 全不变；不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, status: 'completable', flags: { ...quest.flags, grassland_checked: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  departQingshiVillageToTianlongCity: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在青石村（出发地）
      if (s.gameState.world.currentLocationId !== 'qingshi_village') return {}
      // 黄金兔子主线必须存在且 in_progress + stage 0（青石村调查部分确实已收束）
      const goldenQuest = s.gameState.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
      if (!goldenQuest || goldenQuest.status !== 'in_progress' || goldenQuest.stage !== 0) return {}
      // TM-P1-023：四个剧情 flag 完整校验（R1 原则）——各自只允许 boolean 且必须严格 true；任一非 boolean 已存在值整次拒绝且完全不变（不静默覆盖）
      const blacksmithFlag = goldenQuest.flags.asked_blacksmith
      const apothecaryFlag = goldenQuest.flags.asked_apothecary
      const reportedFlag = goldenQuest.flags.village_inquiry_reported
      const recheckedFlag = goldenQuest.flags.rabbit_lair_rechecked
      const malformed =
        typeof blacksmithFlag !== 'boolean' ||
        typeof apothecaryFlag !== 'boolean' ||
        typeof reportedFlag !== 'boolean' ||
        typeof recheckedFlag !== 'boolean'
      if (malformed || !blacksmithFlag || !apothecaryFlag || !reportedFlag || !recheckedFlag) return {}
      // 必须合法持有《兔子的路径》（quantity 安全整数 >=1；0/-1/1.5/NaN/Infinity/缺失一律拒绝——长期线索必须带往后续区域）
      const entry = s.gameState.inventory.find((e) => e.itemId === 'rabbit_path')
      if (!entry || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return {}
      // 必须已展开地图且已向村长汇报
      if (s.gameState.world.flags.rabbit_path_examined !== true) return {}
      if (s.gameState.world.flags.rabbit_path_reported !== true) return {}
      // 已接触但未完成的两条支线阻止离村（不存在/completed/failed 不阻止；available/in_progress/completable 阻止；不自动改 failed）
      for (const sideId of ['quest_apothecary_herb_route', 'quest_blacksmith_mine_remnant']) {
        const side = s.gameState.quests.find((q) => q.questId === sideId)
        if (!side) continue
        if (side.status === 'available' || side.status === 'in_progress' || side.status === 'completable') return {}
      }
      changed = true
      // TM-P1-023：成功只改 world.currentLocationId='tianlong_city'（无 qingshi_departed flag；player/inventory/equipment/quests/flags/npcStates/completedEvents 全不变；不自动保存）
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, currentLocationId: 'tianlong_city' },
        },
      }
    })
    return changed
  },

  askWangcaiAboutTrouble: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在天龙城（王财所在地）
      if (s.gameState.world.currentLocationId !== 'tianlong_city') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_wangcai_trouble')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // TM-P1-024：wangcai_briefed 只允许 undefined/false/true；非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用拒绝
      const briefed = quest.flags.wangcai_briefed
      if (typeof briefed !== 'undefined' && typeof briefed !== 'boolean') return {}
      if (briefed === true) return {}
      changed = true
      // TM-P1-024：成功只写 quest.flags.wangcai_briefed=true（status 保持 in_progress、stage 保持 0；无奖励/状态污染，不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, wangcai_briefed: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  unlockBlackStoneTowerInvestigation: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // 必须在天龙城（出发地）
      if (s.gameState.world.currentLocationId !== 'tianlong_city') return {}
      const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      if (!quest || quest.status !== 'in_progress' || quest.stage !== 0) return {}
      // TM-P1-025：wangcai_briefed 必须严格 ===true（非 boolean 整次拒绝且完全不变，不修复）
      const briefed = quest.flags.wangcai_briefed
      if (typeof briefed !== 'boolean') return {}
      if (briefed !== true) return {}
      // unlock flag 只允许 undefined/false/true；非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用拒绝
      const unlocked = s.gameState.world.flags.black_stone_tower_unlocked
      if (typeof unlocked !== 'undefined' && typeof unlocked !== 'boolean') return {}
      if (unlocked === true) return {}
      changed = true
      // TM-P1-025：成功只写 world.flags.black_stone_tower_unlocked=true（Quest 不塞路线状态；player/inventory/equipment/quests/npcStates/completedEvents 全不变；不自动保存）
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, black_stone_tower_unlocked: true } },
        },
      }
    })
    return changed
  },

  unlockBlackStoneTowerFloor2: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // TM-P1-027：必须在一层（从一层深入）
      if (s.gameState.world.currentLocationId !== 'black_stone_tower_floor1') return {}
      const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      if (!quest || quest.status !== 'in_progress' || quest.stage !== 0) return {}
      // 一层全部前置严格 true：briefed / unlocked / soldier_defeated / captain_defeated
      if (quest.flags.wangcai_briefed !== true) return {}
      if (s.gameState.world.flags.black_stone_tower_unlocked !== true) return {}
      if (quest.flags.floor1_soldier_defeated !== true) return {}
      if (quest.flags.floor1_captain_defeated !== true) return {}
      // 目标 flag 只允许 undefined/false；非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用拒绝
      const target = s.gameState.world.flags.black_stone_tower_floor2_unlocked
      if (typeof target !== 'undefined' && typeof target !== 'boolean') return {}
      if (target === true) return {}
      changed = true
      // 成功只写 world.flags.black_stone_tower_floor2_unlocked=true（Quest 不塞路线状态；player/inventory/equipment/quests/其他 world.flags/npcStates/completedEvents 全不变；不自动保存）
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, black_stone_tower_floor2_unlocked: true } },
        },
      }
    })
    return changed
  },
  unlockBlackStoneTowerFloor3: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // TM-P1-029：必须在二层（从二层「继续向上」）
      if (s.gameState.world.currentLocationId !== 'black_stone_tower_floor2') return {}
      const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      if (!quest || quest.status !== 'in_progress' || quest.stage !== 0) return {}
      // 全部前序严格 true：briefed / unlocked / floor2_unlocked / 一层两敌 / 二层三敌
      if (quest.flags.wangcai_briefed !== true) return {}
      if (s.gameState.world.flags.black_stone_tower_unlocked !== true) return {}
      if (s.gameState.world.flags.black_stone_tower_floor2_unlocked !== true) return {}
      if (quest.flags.floor1_soldier_defeated !== true) return {}
      if (quest.flags.floor1_captain_defeated !== true) return {}
      if (quest.flags.floor2_zombie_defeated !== true) return {}
      if (quest.flags.floor2_black_mage_defeated !== true) return {}
      if (quest.flags.floor2_skeleton_warrior_defeated !== true) return {}
      // 目标 flag 只允许 undefined/false；非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用拒绝
      const target = s.gameState.world.flags.black_stone_tower_floor3_unlocked
      if (typeof target !== 'undefined' && typeof target !== 'boolean') return {}
      if (target === true) return {}
      changed = true
      // 成功只写 world.flags.black_stone_tower_floor3_unlocked=true（不建 DungeonEngine/楼层系统；player/inventory/equipment/quests/其他 world.flags/npcStates/completedEvents 全不变；不自动保存）
      return {
        gameState: {
          ...s.gameState,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, black_stone_tower_floor3_unlocked: true } },
        },
      }
    })
    return changed
  },
  returnKuidongNecklaceToWangcai: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // TM-P1-030：必须在天龙城（向王财交还）
      if (s.gameState.world.currentLocationId !== 'tianlong_city') return {}
      const quest = s.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      if (!quest || quest.status !== 'in_progress' || quest.stage !== 0) return {}
      // 全部前置严格 true：briefed / 一二三层解锁 / 一层两敌 / 二层三敌 / 三层女妖
      if (quest.flags.wangcai_briefed !== true) return {}
      if (s.gameState.world.flags.black_stone_tower_unlocked !== true) return {}
      if (s.gameState.world.flags.black_stone_tower_floor2_unlocked !== true) return {}
      if (s.gameState.world.flags.black_stone_tower_floor3_unlocked !== true) return {}
      if (quest.flags.floor1_soldier_defeated !== true) return {}
      if (quest.flags.floor1_captain_defeated !== true) return {}
      if (quest.flags.floor2_zombie_defeated !== true) return {}
      if (quest.flags.floor2_black_mage_defeated !== true) return {}
      if (quest.flags.floor2_skeleton_warrior_defeated !== true) return {}
      if (quest.flags.floor3_skeleton_witch_defeated !== true) return {}
      // 目标 flag 只允许 undefined/false；非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用拒绝
      const target = quest.flags.kuidong_necklace_returned
      if (typeof target !== 'undefined' && typeof target !== 'boolean') return {}
      if (target === true) return {}
      // 背包必须合法持有夔峒项链（唯一 entry、quantity===1）；否则拒绝
      const necklaceEntries = s.gameState.inventory.filter((i) => i.itemId === 'kuidong_necklace')
      if (necklaceEntries.length !== 1 || necklaceEntries[0]?.quantity !== 1) return {}
      changed = true
      // 成功原子完成：删除夔峒项链 + kuidong_necklace_returned=true + status→completable（stage 保持 0；无金币/XP/等级/装备/关系值/其他奖励；不自动保存）
      const nextInventory = s.gameState.inventory.filter((i) => i.itemId !== 'kuidong_necklace')
      const nextQuests = s.gameState.quests.map((q) =>
        q.questId === 'quest_wangcai_trouble' ? { ...q, status: 'completable' as const, flags: { ...q.flags, kuidong_necklace_returned: true } } : q,
      )
      return { gameState: { ...s.gameState, inventory: nextInventory, quests: nextQuests } }
    })
    return changed
  },

  investigateNorthGateTrail: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // TM-P2-001 D3：必须在天龙城北门（痕迹所在地）
      if (s.gameState.world.currentLocationId !== 'tianlong_north_gate') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_gate_missing_patrol')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // north_gate_trail_checked 只允许 undefined/false/true；非 boolean（"yes"/1/0.5）整次拒绝且完全不变（不修复）；已 true 重复调用拒绝
      const checked = quest.flags.north_gate_trail_checked
      if (typeof checked !== 'undefined' && typeof checked !== 'boolean') return {}
      if (checked === true) return {}
      changed = true
      // 成功只写 quest.flags.north_gate_trail_checked=true（status 保持 in_progress、stage 保持 0；无奖励/状态污染，不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_gate_trail_checked: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  // ---- TM-P2-008：北郊余波主线《北郊追踪》（§16-29；Stage A-D 用 quest.flags 表达）----

  trackNorthOutskirtsTrail: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage A：必须在北门（巡逻队痕迹所在地）
      if (s.gameState.world.currentLocationId !== 'tianlong_north_gate') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_outskirts')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // trail_tracked 只允许 undefined/false/true；非 boolean 整次拒绝且完全不变（不修复）；已 true 重复调用拒绝
      const tracked = quest.flags.north_outskirts_trail_tracked
      if (typeof tracked !== 'undefined' && typeof tracked !== 'boolean') return {}
      if (tracked === true) return {}
      changed = true
      // 原子：写 quest.flags.north_outskirts_trail_tracked=true + world.flags.north_outskirts_unlocked=true（解锁北郊，§18）+ 记录线索「拖行痕迹」（guaranteed §29）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_outskirts_trail_tracked: true } }
      const base = {
        ...s.gameState,
        quests: nextQuests,
        world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, north_outskirts_unlocked: true } },
      }
      const withClue = applyClueDiscovery(base, 'clue_north_drag_trail')
      return { gameState: withClue ?? base }
    })
    return changed
  },

  searchNorthOutskirtsAmbush: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage B：必须在北郊（追踪足迹）
      if (s.gameState.world.currentLocationId !== 'tianlong_north_outskirts') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_outskirts')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // trail_tracked 必须严格 true（未追踪足迹不得提前发现现场）
      if (quest.flags.north_outskirts_trail_tracked !== true) return {}
      // ambush_found 只允许 undefined/false/true；非 boolean 整次拒绝；已 true 重复调用拒绝
      const found = quest.flags.north_outskirts_ambush_found
      if (typeof found !== 'undefined' && typeof found !== 'boolean') return {}
      if (found === true) return {}
      changed = true
      // 成功只写 quest.flags.north_outskirts_ambush_found=true（status/stage 不变；无奖励、不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_outskirts_ambush_found: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  investigateNorthOutskirtsAmbush: (method) => {
    let result: NorthOutskirtsInvestigateResult | null = null
    set((s) => {
      const state = s.gameState
      if (!state) return {}
      // Stage C：必须在北郊 + quest in_progress + 现场已找到 + 尚未调查完成
      if (state.world.currentLocationId !== 'tianlong_north_outskirts') return {}
      const questIndex = state.quests.findIndex((q) => q.questId === 'quest_north_outskirts')
      if (questIndex < 0) return {}
      const quest = state.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      if (quest.flags.north_outskirts_ambush_found !== true) return {}
      // ambush_investigated 只允许 undefined/false/true；非 boolean 整次拒绝
      const investigated = quest.flags.north_outskirts_ambush_investigated
      if (typeof investigated !== 'undefined' && typeof investigated !== 'boolean') return {}
      if (investigated === true) {
        result = { ok: false, reason: 'already_done' }
        return {}
      }
      // Sakura 插话（§22）：非强制 flavor + 额外线索，禁止自动解决任务（不推进 ambush_investigated）
      if (method === 'sakura') {
        if (!isSakuraPresent(state)) {
          result = { ok: false, reason: 'sakura_not_present' }
          return {}
        }
        const base = {
          ...state,
          world: { ...state.world, flags: { ...state.world.flags, north_outskirts_sakura_observation: true } },
        }
        const withClue = applyClueDiscovery(base, 'clue_north_black_mane')
        result = {
          ok: true,
          method: 'sakura',
          present: true,
          clueAdded: withClue ? 'clue_north_black_mane' : undefined,
        }
        return { gameState: withClue ?? base }
      }
      // Mount 快速搜索（§50）：装备 fast_travel 坐骑可「沿官道快速搜索」得巡逻队徽记线索；optional，不推进 ambush_investigated
      if (method === 'mount') {
        if (!hasTravelTag(state, 'fast_travel')) {
          result = { ok: false, reason: 'mount_not_present' }
          return {}
        }
        const alreadySearched = state.world.flags.north_outskirts_mount_search === true
        const base = {
          ...state,
          world: {
            ...state.world,
            flags: { ...state.world.flags, north_outskirts_mount_search: true },
          },
        }
        const withClue = applyClueDiscovery(base, 'clue_north_patrol_emblem')
        result = {
          ok: true,
          method: 'mount',
          clueAdded: withClue ? 'clue_north_patrol_emblem' : undefined,
          alreadySearched,
        }
        return { gameState: withClue ?? base }
      }
      // mnd / lck 检定（DC 12；失败可重试，不软阻断 §29）
      let check: D20CheckResult
      try {
        check = performD20Check({
          attributeScore: state.player.attributes[method],
          level: state.player.level,
          dc: NORTH_OUTSKIRTS_INVESTIGATE_DC,
          proficient: false,
          situationalModifier: 0,
        })
      } catch {
        return {}
      }
      if (!check.success) {
        result = { ok: true, method, check, progressed: false }
        return {}
      }
      // 检定成功：原子推进 ambush_investigated=true + 对应线索（MND→拖行痕迹 / LCK→巡逻队徽记）
      const clueId = method === 'mnd' ? 'clue_north_drag_trail' : 'clue_north_patrol_emblem'
      const nextQuests = [...state.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_outskirts_ambush_investigated: true } }
      const base = { ...state, quests: nextQuests }
      const withClue = applyClueDiscovery(base, clueId)
      result = { ok: true, method, check, progressed: true, clueAdded: withClue ? clueId : undefined }
      return { gameState: withClue ?? base }
    })
    return result ?? { ok: false, reason: 'locked' }
  },

  reportNorthOutskirts: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage D：必须在武馆（马科所在）或北门（§26：北门/武馆都可汇报）
      const loc = s.gameState.world.currentLocationId
      if (loc !== 'tianlong_martial_hall' && loc !== 'tianlong_north_gate') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_outskirts')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // 必须先调查袭击现场（Stage C 完成才可回报）
      if (quest.flags.north_outskirts_ambush_investigated !== true) return {}
      // reported 只允许 undefined/false/true；非 boolean 整次拒绝；已 true 重复调用拒绝
      const reported = quest.flags.north_outskirts_reported
      if (typeof reported !== 'undefined' && typeof reported !== 'boolean') return {}
      if (reported === true) return {}
      changed = true
      // 原子：写 quest.flags.north_outskirts_reported=true 且 status→completable（stage 保持 0；无金币/XP/物品副作用、不自动保存）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, status: 'completable', flags: { ...quest.flags, north_outskirts_reported: true } }
      return { gameState: { ...s.gameState, quests: nextQuests } }
    })
    return changed
  },

  // ---- TM-P2-009：《断旗余声》Stage A-F（§9-19；Stage 用 quest.flags 表达，stage 保持 number）----

  startNorthBrokenBanner: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage A：必须在武馆（马科简报）
      if (s.gameState.world.currentLocationId !== 'tianlong_martial_hall') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_broken_banner')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      const briefed = quest.flags.north_broken_banner_make_briefed
      if (typeof briefed !== 'undefined' && typeof briefed !== 'boolean') return {}
      if (briefed === true) return {}
      const unlocked = s.gameState.world.flags.north_waystation_unlocked
      if (typeof unlocked !== 'undefined' && typeof unlocked !== 'boolean') return {}
      changed = true
      // 原子：quest.flags.north_broken_banner_make_briefed=true + world.flags.north_waystation_unlocked=true（解锁旧驿站 §11）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_broken_banner_make_briefed: true } }
      return {
        gameState: {
          ...s.gameState,
          quests: nextQuests,
          world: { ...s.gameState.world, flags: { ...s.gameState.world.flags, north_waystation_unlocked: true } },
        },
      }
    })
    return changed
  },

  searchNorthAbandonedWaystation: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage B：必须在旧驿站
      if (s.gameState.world.currentLocationId !== 'tianlong_north_abandoned_waystation') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_broken_banner')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // 必须先接受马科简报（Stage A 完成才可搜索）
      if (quest.flags.north_broken_banner_make_briefed !== true) return {}
      const searched = quest.flags.north_waystation_searched
      if (typeof searched !== 'undefined' && typeof searched !== 'boolean') return {}
      if (searched === true) return {}
      changed = true
      // 原子：quest.flags.north_waystation_searched=true + 线索「断裂队旗」（guaranteed §15）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_waystation_searched: true } }
      const base = { ...s.gameState, quests: nextQuests }
      const withClue = applyClueDiscovery(base, 'clue_north_broken_banner')
      return { gameState: withClue ?? base }
    })
    return changed
  },

  resolveWaystationBarrier: (method) => {
    let result: WaystationBarrierResult | null = null
    set((s) => {
      const state = s.gameState
      if (!state) return {}
      // Stage C：必须在旧驿站 + quest in_progress + 驿站已搜索 + 屏障尚未解除
      if (state.world.currentLocationId !== 'tianlong_north_abandoned_waystation') return {}
      const questIndex = state.quests.findIndex((q) => q.questId === 'quest_north_broken_banner')
      if (questIndex < 0) return {}
      const quest = state.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      if (quest.flags.north_waystation_searched !== true) return {}
      const resolved = quest.flags.north_waystation_barrier_resolved
      if (typeof resolved !== 'undefined' && typeof resolved !== 'boolean') return {}
      if (resolved === true) {
        result = { ok: false, reason: 'already_done' }
        return {}
      }
      // combat 解（§13）：必须先击退驿站狼群（world.flags.waystation_wolf_pack_neutralized===true）才可通过
      if (method === 'combat') {
        const neutralized = state.world.flags.waystation_wolf_pack_neutralized
        if (typeof neutralized !== 'boolean' || neutralized !== true) {
          result = { ok: false, reason: 'wolves_not_neutralized' }
          return {}
        }
        // 通过：写 barrier_resolved + 线索「魔化诱饵」（击败狼群后能从狼穴找到诱饵）
        const nextQuests = [...state.quests]
        nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_waystation_barrier_resolved: true } }
        const base = { ...state, quests: nextQuests }
        const withClue = applyClueDiscovery(base, 'clue_north_alchemical_bait')
        result = { ok: true, method: 'combat', clueAdded: withClue ? 'clue_north_alchemical_bait' : undefined }
        return { gameState: withClue ?? base }
      }
      // Sakura 路线（TM-P2-009-R1 §2.1）：樱花优子找到绕过狼群的安全路线 → 屏障真正解决（威胁被引开，非击杀）
      if (method === 'sakura') {
        if (!isSakuraPresent(state)) {
          result = { ok: false, reason: 'sakura_not_present' }
          return {}
        }
        const nextQuests = [...state.quests]
        nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_waystation_barrier_resolved: true } }
        const base = {
          ...state,
          quests: nextQuests,
          world: {
            ...state.world,
            flags: {
              ...state.world.flags,
              waystation_sakura_observation: true,
              waystation_wolf_pack_neutralized: true,
            },
          },
        }
        const withClue = applyClueDiscovery(base, 'clue_north_alchemical_bait')
        result = {
          ok: true,
          method: 'sakura',
          present: true,
          progressed: true,
          clueAdded: withClue ? 'clue_north_alchemical_bait' : undefined,
        }
        return { gameState: withClue ?? base }
      }
      // Mount 路线（TM-P2-009-R1 §2.1）：骑马引开狼群后从另一侧进入 → 屏障真正解决（威胁被引走，非击杀）
      if (method === 'mount') {
        if (!hasTravelTag(state, 'fast_travel')) {
          result = { ok: false, reason: 'mount_not_present' }
          return {}
        }
        const alreadySearched = state.world.flags.waystation_mount_search === true
        const nextQuests = [...state.quests]
        nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_waystation_barrier_resolved: true } }
        const base = {
          ...state,
          quests: nextQuests,
          world: {
            ...state.world,
            flags: {
              ...state.world.flags,
              waystation_mount_search: true,
              waystation_wolf_pack_neutralized: true,
            },
          },
        }
        const withClue = applyClueDiscovery(base, 'clue_north_black_wagon_tracks')
        result = {
          ok: true,
          method: 'mount',
          progressed: true,
          clueAdded: withClue ? 'clue_north_black_wagon_tracks' : undefined,
          alreadySearched,
        }
        return { gameState: withClue ?? base }
      }
      // mnd / lck 检定（DC 12；失败可重试，不软阻断 §13）
      let check: D20CheckResult
      try {
        check = performD20Check({
          attributeScore: state.player.attributes[method],
          level: state.player.level,
          dc: WAYSTATION_BARRIER_DC,
          proficient: false,
          situationalModifier: 0,
        })
      } catch {
        return {}
      }
      if (!check.success) {
        result = { ok: true, method, check, progressed: false }
        return {}
      }
      // 检定成功（TM-P2-009-R1 §2.1）：原子推进 barrier_resolved=true + neutralized=true（威胁被绕开，非击杀）
      // + 对应线索（MND→魔化诱饵 / LCK→黑篷车辙）
      const clueId = method === 'mnd' ? 'clue_north_alchemical_bait' : 'clue_north_black_wagon_tracks'
      const nextQuests = [...state.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_waystation_barrier_resolved: true } }
      const base = {
        ...state,
        quests: nextQuests,
        world: { ...state.world, flags: { ...state.world.flags, waystation_wolf_pack_neutralized: true } },
      }
      const withClue = applyClueDiscovery(base, clueId)
      result = { ok: true, method, check, progressed: true, clueAdded: withClue ? clueId : undefined }
      return { gameState: withClue ?? base }
    })
    return result ?? { ok: false, reason: 'locked' }
  },

  rescueWaystationSurvivor: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage D：必须在旧驿站（沈拓所在）
      if (s.gameState.world.currentLocationId !== 'tianlong_north_abandoned_waystation') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_broken_banner')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // 必须先解除屏障（Stage C 完成才可进入后院）
      if (quest.flags.north_waystation_barrier_resolved !== true) return {}
      const rescued = quest.flags.north_waystation_survivor_rescued
      if (typeof rescued !== 'undefined' && typeof rescued !== 'boolean') return {}
      if (rescued === true) return {}
      changed = true
      // 原子：quest.flags.north_waystation_survivor_rescued=true + 活动事件 north_survivor_rescued（§14 唯一写入点）+ 线索「黑篷车辙」
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_waystation_survivor_rescued: true } }
      const base = {
        ...s.gameState,
        quests: nextQuests,
        world: {
          ...s.gameState.world,
          completedEvents: [...s.gameState.world.completedEvents, NORTH_SURVIVOR_RESCUED_EVENT_ID],
        },
      }
      const withClue = applyClueDiscovery(base, 'clue_north_black_wagon_tracks')
      return { gameState: withClue ?? base }
    })
    return changed
  },

  debriefWaystationSurvivor: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage D：必须在旧驿站（听沈拓汇报）
      if (s.gameState.world.currentLocationId !== 'tianlong_north_abandoned_waystation') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_broken_banner')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // 必须先救出沈拓
      if (quest.flags.north_waystation_survivor_rescued !== true) return {}
      const debriefed = quest.flags.north_waystation_survivor_debriefed
      if (typeof debriefed !== 'undefined' && typeof debriefed !== 'boolean') return {}
      if (debriefed === true) return {}
      changed = true
      // 原子：quest.flags.north_waystation_survivor_debriefed=true + 线索「魔化诱饵」（§15；沈拓提到有人预先布置炼金诱饵）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, flags: { ...quest.flags, north_waystation_survivor_debriefed: true } }
      const base = { ...s.gameState, quests: nextQuests }
      const withClue = applyClueDiscovery(base, 'clue_north_alchemical_bait')
      return { gameState: withClue ?? base }
    })
    return changed
  },

  reportNorthBrokenBanner: () => {
    let changed = false
    set((s) => {
      if (!s.gameState) return {}
      // Stage E：必须在武馆（马科所在）
      if (s.gameState.world.currentLocationId !== 'tianlong_martial_hall') return {}
      const questIndex = s.gameState.quests.findIndex((q) => q.questId === 'quest_north_broken_banner')
      if (questIndex < 0) return {}
      const quest = s.gameState.quests[questIndex]
      if (!quest) return {}
      if (quest.status !== 'in_progress') return {}
      // 必须先听取沈拓汇报（Stage D 完成才可回报）
      if (quest.flags.north_waystation_survivor_debriefed !== true) return {}
      const reported = quest.flags.north_broken_banner_reported
      if (typeof reported !== 'undefined' && typeof reported !== 'boolean') return {}
      if (reported === true) return {}
      changed = true
      // 原子：写 quest.flags.north_broken_banner_reported=true 且 status→completable（stage 保持 0；无金币/XP/物品副作用、不自动保存）
      // TM-P2-009-R1 §2.3：向马科汇报当场出现骑士试炼邀请（world.flags.knight_trial_invited + 活动事件；正式骑士试炼本体不实现）
      const nextQuests = [...s.gameState.quests]
      nextQuests[questIndex] = { ...quest, status: 'completable', flags: { ...quest.flags, north_broken_banner_reported: true } }
      return {
        gameState: {
          ...s.gameState,
          quests: nextQuests,
          world: {
            ...s.gameState.world,
            flags: { ...s.gameState.world.flags, knight_trial_invited: true, [MARTIAL_TRIAL_INVITED_FLAG]: true },
            completedEvents: [...s.gameState.world.completedEvents, KNIGHT_TRIAL_INVITED_EVENT_ID],
          },
        },
      }
    })
    return changed
  },

  acceptMartialTrial: () => {
    let changed = false
    set((s) => {
      const state = s.gameState
      if (!state || state.world.currentLocationId !== 'tianlong_martial_hall') return {}
      if (state.world.flags[MARTIAL_TRIAL_INVITED_FLAG] !== true && state.world.flags.knight_trial_invited !== true) return {}
      let next = state
      const existing = next.quests.find((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
      if (!existing) {
        const discovered = applyQuestDiscovery(next, MARTIAL_TRIAL_QUEST_ID)
        if (!discovered) return {}
        next = discovered
      }
      const quest = next.quests.find((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
      if (!quest || quest.status !== 'available') return {}
      const accepted = applyQuestTransition(next, MARTIAL_TRIAL_QUEST_ID, 'in_progress')
      if (!accepted) return {}
      const route = `route_${next.player.profession}`
      const index = accepted.quests.findIndex((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
      const acceptedQuest = accepted.quests[index]!
      const quests = [...accepted.quests]
      quests[index] = { ...acceptedQuest, flags: { ...acceptedQuest.flags, [route]: true } }
      changed = true
      return { gameState: { ...accepted, quests } }
    })
    return changed
  },

  registerMartialTrial: () => {
    let changed = false
    set((s) => {
      const state = s.gameState
      if (!state || state.world.currentLocationId !== 'tianlong_martial_hall') return {}
      const index = state.quests.findIndex((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
      const quest = state.quests[index]
      if (index < 0 || !quest || quest.status !== 'in_progress') return {}
      if (quest.flags.trial_registered === true || Object.values(quest.flags).some((v) => typeof v !== 'boolean')) return {}
      const quests = [...state.quests]
      quests[index] = { ...quest, flags: { ...quest.flags, trial_registered: true } }
      changed = true
      return { gameState: { ...state, quests } }
    })
    return changed
  },

  resolveMartialTrialObservation: (method, roll) => {
    let result: MartialTrialObservationResult = { ok: false, method }
    set((s) => {
      const state = s.gameState
      if (!state || state.world.currentLocationId !== MARTIAL_TRIAL_GROUND_ID) return {}
      const index = state.quests.findIndex((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
      const quest = state.quests[index]
      if (index < 0 || !quest || quest.status !== 'in_progress' || quest.flags.trial_registered !== true) return {}
      if (quest.flags.trial_observation_done !== undefined && typeof quest.flags.trial_observation_done !== 'boolean') return {}
      if (quest.flags.trial_observation_done === true) return {}
      const primary = (['warrior', 'knight', 'ranger', 'mage'] as const).find((p) => quest.flags[`route_${p}`] === true)
      const allowed: MartialTrialObservationMethod[] = primary === 'warrior' ? ['str', 'lck'] : primary === 'knight' ? ['con', 'lck'] : primary === 'ranger' ? ['agi', 'lck'] : primary === 'mage' ? ['mnd', 'lck'] : ['lck']
      if (!allowed.includes(method)) return {}
      let check: D20CheckResult
      try {
        check = roll === undefined
          ? performD20Check({ attributeScore: state.player.attributes[method], level: state.player.level, dc: CHECK_DC.moderate, proficient: false, situationalModifier: 0 })
          : resolveD20Check({ attributeScore: state.player.attributes[method], level: state.player.level, dc: CHECK_DC.moderate, proficient: false, situationalModifier: 0 }, roll)
      } catch { return {} }
      const quests = [...state.quests]
      quests[index] = { ...quest, stage: Math.max(quest.stage, 1), flags: { ...quest.flags, trial_observation_done: true, trial_observation_success: check.success, trial_observation_advantage: check.success } }
      const player = check.success
        ? { ...state.player, mp: Math.min(state.player.maxMp, state.player.mp + 2) }
        : state.player
      result = { ok: true, success: check.success, progressed: true, method }
      return { gameState: { ...state, player, quests } }
    })
    return result
  },

  reportMartialTrial: () => {
    let changed = false
    set((s) => {
      const state = s.gameState
      if (!state || state.world.currentLocationId !== 'tianlong_martial_hall') return {}
      const index = state.quests.findIndex((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
      const quest = state.quests[index]
      if (index < 0 || !quest || quest.status !== 'in_progress' || quest.flags.trial_combat_done !== true) return {}
      if (quest.flags.trial_review_done === true) return {}
      const quests = [...state.quests]
      quests[index] = { ...quest, status: 'completable', stage: Math.max(quest.stage, 3), flags: { ...quest.flags, trial_review_done: true } }
      changed = true
      return { gameState: { ...state, quests } }
    })
    return changed
  },

  completeMartialTrial: () => get().completeQuest(MARTIAL_TRIAL_QUEST_ID),

  // ---- TM-P2-004：Sakura 剧情 / 伙伴 / 关系 / 休整 ----

  startSakuraEncounter: () => {
    const s = get().gameState
    if (!s) return false
    if (!canTriggerSakuraEncounter(s)) return false
    let ok = false
    set((st) => {
      if (!st.gameState) return {}
      if (!canTriggerSakuraEncounter(st.gameState)) return {}
      const f = st.gameState.world.flags
      if (f[SAKURA_FLAGS.encounterStarted] === true) return {}
      // 原子：写 sakura_encounter_started + 《落樱越界》discover→in_progress（同一次 Store 更新）
      const flags = { ...f, [SAKURA_FLAGS.encounterStarted]: true }
      let gs: GameState = { ...st.gameState, world: { ...st.gameState.world, flags } }
      const discovered = applyQuestDiscovery(gs, 'quest_sakura_boundary')
      if (discovered) gs = discovered
      const accepted = applyQuestTransition(gs, 'quest_sakura_boundary', 'in_progress')
      if (accepted) gs = accepted
      ok = true
      return { gameState: gs }
    })
    return ok
  },

  enterSakuraDomain: () => {
    const s = get().gameState
    if (!s) return false
    if (!canEnterSakuraDomain(s)) return false
    let ok = false
    set((st) => {
      if (!st.gameState) return {}
      if (!canEnterSakuraDomain(st.gameState)) return {}
      ok = true
      return {
        gameState: {
          ...st.gameState,
          world: {
            ...st.gameState.world,
            currentLocationId: SAKURA_DOMAIN_LOCATION,
            flags: { ...st.gameState.world.flags, [SAKURA_FLAGS.domainEntered]: true },
          },
        },
      }
    })
    return ok
  },

  meetSakura: (choice) => {
    const s = get().gameState
    if (!s) return null
    if (!canMeetSakura(s)) return null
    let result: SakuraMeetResult = null
    set((st) => {
      if (!st.gameState) return {}
      if (!canMeetSakura(st.gameState)) return {}
      const def = getCompanion(SAKURA_COMPANION_ID)
      if (!def) return {}
      // 角色气质（TM-P2-004 第 35/37 节）：帮助/询问/反差玩笑；玩笑必须被 Sakura 明确拒绝其强制含义，但不永久断线
      let affectionDelta = 0
      let trustDelta = 0
      if (choice === 'help') {
        affectionDelta = 2
        trustDelta = 3
      } else if (choice === 'ask') {
        trustDelta = 1
      } else {
        affectionDelta = -2
        trustDelta = -4
      }
      const companion = createCompanionState(def, st.gameState.player.level, 'met')
      const rel = createInitialRelationship(SAKURA_COMPANION_ID)
      const relNext = applyRelationshipDelta(rel, { affection: affectionDelta, trust: trustDelta })
      result = { outcome: 'met', affectionDelta, trustDelta }
      return {
        gameState: {
          ...st.gameState,
          companions: { ...st.gameState.companions, [SAKURA_COMPANION_ID]: companion },
          relationships: { ...st.gameState.relationships, [SAKURA_COMPANION_ID]: relNext },
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, [SAKURA_FLAGS.met]: true },
          },
        },
      }
    })
    return result
  },

  sakuraProfessionTalk: () => {
    const s = get().gameState
    if (!s) return null
    if (s.world.flags.sakura_profession_talked === true) return null
    // 职业对话发生在初见之后、临时合作之前（met=true 且 guest 未开始）
    if (s.world.flags.sakura_met !== true || s.world.flags.sakura_guest === true) return null
    let result: SakuraTalkResult = null
    set((st) => {
      if (!st.gameState) return {}
      if (st.gameState.world.flags.sakura_profession_talked === true) return {}
      if (st.gameState.world.flags.sakura_met !== true || st.gameState.world.flags.sakura_guest === true) return {}
      const rel = st.gameState.relationships[SAKURA_COMPANION_ID]
      if (!rel) return {}
      // TM-P2-004 第 24 节：职业对话关系收益（职业选项不是自动最优；游侠/法师是情报向）
      let affectionDelta = 0
      let trustDelta = 0
      if (st.gameState.player.profession === 'warrior') trustDelta = 2
      else if (st.gameState.player.profession === 'knight') {
        trustDelta = 3
        affectionDelta = 1
      }
      const relNext = applyRelationshipDelta(rel, { affection: affectionDelta, trust: trustDelta })
      result = { outcome: 'talked', affectionDelta, trustDelta }
      return {
        gameState: {
          ...st.gameState,
          relationships: { ...st.gameState.relationships, [SAKURA_COMPANION_ID]: relNext },
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, sakura_profession_talked: true },
          },
        },
      }
    })
    return result
  },

  sakuraMndCheck: (roll) => {
    const s = get().gameState
    if (!s) return null
    if (!canMndCheckSakura(s)) return null
    const check = resolveD20Check(
      { attributeScore: s.player.attributes.mnd, level: s.player.level, dc: SAKURA_MND_DC },
      roll ?? rollD20(),
    )
    let result: SakuraSceneCheckResult | null = null
    set((st) => {
      if (!st.gameState) return {}
      if (!canMndCheckSakura(st.gameState)) return {}
      const flags = {
        ...st.gameState.world.flags,
        [SAKURA_FLAGS.mndAttempted]: true,
        [SAKURA_FLAGS.mndSucceeded]: check.success,
      }
      // 成功：获得更准确的信息 + trust+2（TM-P2-004 第 25 节）；失败不卡剧情（只记录）
      let relationships = st.gameState.relationships
      if (check.success) {
        const rel = relationships[SAKURA_COMPANION_ID]
        if (rel) {
          relationships = {
            ...relationships,
            [SAKURA_COMPANION_ID]: applyRelationshipDelta(rel, { trust: 2 }),
          }
        }
      }
      result = {
        outcome: check.success ? 'success' : 'failed',
        roll: check.roll,
        total: check.total,
        dc: check.dc,
      }
      return {
        gameState: {
          ...st.gameState,
          relationships,
          world: { ...st.gameState.world, flags },
        },
      }
    })
    return result
  },

  sakuraLuckRescue: (roll) => {
    const s = get().gameState
    if (!s) return null
    if (!canLuckRescueSakura(s)) return null
    const check = resolveLuckCheck(roll ?? rollD20(), s.player.attributes.lck, SAKURA_LUCK_DC)
    let result: SakuraSceneCheckResult | null = null
    set((st) => {
      if (!st.gameState) return {}
      if (!canLuckRescueSakura(st.gameState)) return {}
      const flags = { ...st.gameState.world.flags, [SAKURA_FLAGS.luckUsed]: true }
      // 成功：恢复部分信息 + trust+1；大成功额外 affection+1（TM-P2-004 第 26 节：绝不决定 Sakura 是否加入）
      let relationships = st.gameState.relationships
      if (check.success) {
        const rel = relationships[SAKURA_COMPANION_ID]
        if (rel) {
          const delta: { affection?: number; trust?: number } = { trust: 1 }
          if (check.outcome === 'critical_success') delta.affection = 1
          relationships = {
            ...relationships,
            [SAKURA_COMPANION_ID]: applyRelationshipDelta(rel, delta),
          }
        }
      }
      result = {
        outcome: check.success ? 'success' : 'failed',
        roll: check.roll,
        total: check.total,
        dc: check.dc,
        nat20: check.outcome === 'critical_success',
      }
      return {
        gameState: {
          ...st.gameState,
          relationships,
          world: { ...st.gameState.world, flags },
        },
      }
    })
    return result
  },

  offerSakuraGuest: () => {
    const s = get().gameState
    if (!s) return false
    if (!canOfferGuest(s)) return false
    let ok = false
    set((st) => {
      if (!st.gameState) return {}
      if (!canOfferGuest(st.gameState)) return {}
      const def = getCompanion(SAKURA_COMPANION_ID)
      if (!def) return {}
      const current = st.gameState.companions[SAKURA_COMPANION_ID]
      const companion = current
        ? { ...current, status: 'guest' as const }
        : createCompanionState(def, st.gameState.player.level, 'guest')
      const party = activateCompanion(st.gameState.party, SAKURA_COMPANION_ID) ?? st.gameState.party
      ok = true
      return {
        gameState: {
          ...st.gameState,
          companions: { ...st.gameState.companions, [SAKURA_COMPANION_ID]: companion },
          party,
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, [SAKURA_FLAGS.guest]: true },
          },
        },
      }
    })
    return ok
  },

  acceptSakuraContract: (choice) => {
    const s = get().gameState
    if (!s) return null
    if (!canAcceptContract(s)) return null
    let result: SakuraContractResult = null
    set((st) => {
      if (!st.gameState) return {}
      if (!canAcceptContract(st.gameState)) return {}
      const flags = st.gameState.world.flags
      if (flags[SAKURA_FLAGS.contractAccepted] === true) return {}
      // 自愿神契（TM-P2-004 第 78/79 节）：Sakura 提出「寄灵神契」，玩家选择；重复调用 no-op（防双入队）
      let affectionDelta = 0
      let trustDelta = 0
      if (choice === 'affirm') {
        affectionDelta = 2
        trustDelta = 5
      } else if (choice === 'try') {
        trustDelta = 2
      } else {
        // joke：她先纠正「神契宠物只是你们天梦大陆的分类，不是所有权」；前期关系尚可则轻微 +1
        const rel = st.gameState.relationships[SAKURA_COMPANION_ID]
        if (rel && rel.trust >= 10) affectionDelta = 1
      }
      const current = st.gameState.companions[SAKURA_COMPANION_ID]
      const companion = current
        ? { ...current, status: 'recruited' as const }
        : createCompanionState(getCompanion(SAKURA_COMPANION_ID)!, st.gameState.player.level, 'recruited')
      const party = activateCompanion(st.gameState.party, SAKURA_COMPANION_ID) ?? st.gameState.party
      // 关系：契约完成最多 acquaintance/trusted，绝不自动 romance（TM-P2-004 第 83 节）
      let relationships = st.gameState.relationships
      const rel = relationships[SAKURA_COMPANION_ID]
      if (rel) {
        relationships = {
          ...relationships,
          [SAKURA_COMPANION_ID]: {
            ...applyRelationshipDelta(rel, { affection: affectionDelta, trust: trustDelta }),
            // TM-P2-004 第 84 节：S1《落樱越界》完成 → personalQuestStage = 1（不开始 S2）
            personalQuestStage: 1,
          },
        }
      }
      // 《落樱越界》契约接受 → completed（TM-P2-004 第 118 节；状态机不允许 in_progress→completed 直跳，先 completable 再 completed）
      let gsWithQuest = applyQuestTransition(st.gameState, 'quest_sakura_boundary', 'completable') ?? st.gameState
      gsWithQuest = applyQuestTransition(gsWithQuest, 'quest_sakura_boundary', 'completed') ?? gsWithQuest
      // Sakura's boundary quest uses the same completion reward path as every
      // other quest.  If an already-completed legacy state reaches this action,
      // the reward is zero, so accepting the contract cannot duplicate XP.
      const boundaryWasCompleted = st.gameState.quests.find((q) => q.questId === 'quest_sakura_boundary')?.status === 'completed'
      const progression = applyAdventureXpReward(
        gsWithQuest.player,
        boundaryWasCompleted ? 0 : (getQuest('quest_sakura_boundary')?.adventureXpReward ?? 0),
      )
      if (!progression) return {}
      result = { outcome: 'recruited', affectionDelta, trustDelta }
      return {
        gameState: {
          ...gsWithQuest,
          player: progression.player,
          companions: { ...st.gameState.companions, [SAKURA_COMPANION_ID]: companion },
          relationships,
          party,
          world: {
            ...st.gameState.world,
            flags: {
              ...flags,
              [SAKURA_FLAGS.contractOffered]: true,
              [SAKURA_FLAGS.contractAccepted]: true,
            },
          },
        },
      }
    })
    return result
  },

  refuseSakuraContract: () => {
    const s = get().gameState
    if (!s) return false
    if (!canAcceptContract(s)) return false
    let ok = false
    set((st) => {
      if (!st.gameState) return {}
      if (!canAcceptContract(st.gameState)) return {}
      ok = true
      // 拒绝：不 recruited、任务保持 in_progress、未来可再谈（TM-P2-004 第 80/116 节）
      return {
        gameState: {
          ...st.gameState,
          world: {
            ...st.gameState.world,
            flags: {
              ...st.gameState.world.flags,
              [SAKURA_FLAGS.contractOffered]: true,
              [SAKURA_FLAGS.contractRejected]: true,
            },
          },
        },
      }
    })
    return ok
  },

  reofferSakuraContract: () => {
    const s = get().gameState
    if (!s) return false
    if (!canReofferContract(s)) return false
    let ok = false
    set((st) => {
      if (!st.gameState) return {}
      if (!canReofferContract(st.gameState)) return {}
      ok = true
      // 再次提议：contractOffered 重置为 true（rejected 保留供 UI 显示「曾拒绝」；接受仍走 acceptSakuraContract）
      return {
        gameState: {
          ...st.gameState,
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, [SAKURA_FLAGS.contractOffered]: true },
          },
        },
      }
    })
    return ok
  },

  talkToSakura: (topic) => {
    const s = get().gameState
    if (!s) return null
    const companion = s.companions[SAKURA_COMPANION_ID]
    if (!companion) return null
    let result: SakuraTalkResult = null
    set((st) => {
      if (!st.gameState) return {}
      const c = st.gameState.companions[SAKURA_COMPANION_ID]
      if (!c) return {}
      const rel = st.gameState.relationships[SAKURA_COMPANION_ID]
      if (!rel) return {}
      // 每休整周期前 TALKS_PER_REST_LIMIT 次正常收益（TM-P2-004 第 64 节）；之后仍可聊天但不刷分
      if (!canTalkGain(rel)) {
        result = { outcome: 'cycle_limited' }
        return {}
      }
      // 普通交谈 affection+1（TM-P2-004 第 63 节）；「询问伤势」在 MND 成功获知真相后特别契合 +2
      let gain = 1
      if (topic === 'wound' && st.gameState.world.flags[SAKURA_FLAGS.mndSucceeded] === true) gain = 2
      const relNext = markTalk(applyRelationshipDelta(rel, { affection: gain }))
      result = { outcome: 'talked', affectionDelta: gain, trustDelta: 0 }
      return {
        gameState: {
          ...st.gameState,
          relationships: { ...st.gameState.relationships, [SAKURA_COMPANION_ID]: relNext },
        },
      }
    })
    return result
  },

  sakuraFirstRestTalk: (choice) => {
    const s = get().gameState
    if (!s) return null
    if (!isFirstRestTalkReady(s)) return null
    let result: SakuraTalkResult = null
    set((st) => {
      if (!st.gameState) return {}
      if (!isFirstRestTalkReady(st.gameState)) return {}
      const rel = st.gameState.relationships[SAKURA_COMPANION_ID]
      if (!rel) return {}
      // 《第一夜：神与凡人的距离》（TM-P2-004 第 59-61 节）三选项
      let affectionDelta = 0
      let trustDelta = 0
      if (choice === 'respect') {
        trustDelta = 4
        affectionDelta = 2
      } else if (choice === 'joke') {
        // trust 足够可冷淡反击但略有好感；太低则 -1（不降信任）
        affectionDelta = rel.trust >= 15 ? 1 : -1
      } else {
        // pragmatic：不涨关系但提供技能信息（UI 据此展示）
      }
      const relNext = applyRelationshipDelta(rel, { affection: affectionDelta, trust: trustDelta })
      result = { outcome: 'talked', affectionDelta, trustDelta }
      return {
        gameState: {
          ...st.gameState,
          relationships: { ...st.gameState.relationships, [SAKURA_COMPANION_ID]: relNext },
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, [SAKURA_FLAGS.firstRestDone]: true },
          },
        },
      }
    })
    return result
  },

  sakuraBanter: (choice) => {
    const s = get().gameState
    if (!s) return null
    if (!canTriggerSakuraBanter(s)) return null
    let result: SakuraTalkResult = null
    set((st) => {
      if (!st.gameState) return {}
      if (!canTriggerSakuraBanter(st.gameState)) return {}
      const rel = st.gameState.relationships[SAKURA_COMPANION_ID]
      if (!rel) return {}
      // 天龙城同行 banter（TM-P2-004 第 88 节）：-1 / 0 / +1 轻量变化
      let affectionDelta = 0
      if (choice === 'habit') affectionDelta = -1
      else if (choice === 'will_like') affectionDelta = 1
      // 'not_mortal' → 0
      const relNext = applyRelationshipDelta(rel, { affection: affectionDelta })
      result = { outcome: 'talked', affectionDelta, trustDelta: 0 }
      return {
        gameState: {
          ...st.gameState,
          relationships: { ...st.gameState.relationships, [SAKURA_COMPANION_ID]: relNext },
          world: {
            ...st.gameState.world,
            flags: { ...st.gameState.world.flags, [SAKURA_FLAGS.banterSeen]: true },
          },
        },
      }
    })
    return result
  },

  giveGift: (npcId, itemId) => {
    const s = get().gameState
    if (!s) return null
    const rel = s.relationships[npcId]
    if (!rel) return { outcome: 'locked', affectionDelta: 0 }
    const item = getItem(itemId)
    if (!item) return { outcome: 'unknown_item', affectionDelta: 0 }
    if (item.type !== 'gift' && !item.giftTags) return { outcome: 'not_gift', affectionDelta: 0 }
    const owned = s.inventory.some((e) => e.itemId === itemId && e.quantity >= 1)
    if (!owned) return { outcome: 'not_owned', affectionDelta: 0 }
    if (hasGiftedThisRest(rel)) return { outcome: 'already_gifted', affectionDelta: 0 }
    let result: GiftResult = null
    set((st) => {
      if (!st.gameState) return {}
      const r = st.gameState.relationships[npcId]
      if (!r) return {}
      const inv = st.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === itemId)
      const entry = idx >= 0 ? inv[idx] : undefined
      if (!entry || entry.quantity < 1) return {}
      if (hasGiftedThisRest(r)) return {}
      // 同一次 Store transaction：inventory -1 + relationship delta（TM-P2-004 第 68 节）
      const gain = giftAffectionGain(getRelationshipProfile(npcId), { id: itemId, giftTags: item.giftTags })
      const nextInventory =
        entry.quantity - 1 > 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: entry.quantity - 1 } : e))
          : inv.filter((e) => e.itemId !== itemId)
      const relNext = markGifted(applyRelationshipDelta(r, { affection: gain }))
      result = { outcome: 'given', affectionDelta: gain }
      return {
        gameState: {
          ...st.gameState,
          inventory: nextInventory,
          relationships: { ...st.gameState.relationships, [npcId]: relNext },
        },
      }
    })
    return result
  },

  buyOsmanthusCake: () => {
    let ok = false
    set((s) => {
      if (!s.gameState) return {}
      if (s.gameState.world.currentLocationId !== 'tianlong_city') return {}
      const gold = s.gameState.player.gold
      if (!Number.isSafeInteger(gold) || gold < 8) return {}
      const inv = s.gameState.inventory
      const idx = inv.findIndex((e) => e.itemId === 'tianlong_osmanthus_cake')
      const nextInventory =
        idx >= 0
          ? inv.map((e, i) => (i === idx ? { ...e, quantity: (e.quantity ?? 0) + 1 } : e))
          : [...inv, { itemId: 'tianlong_osmanthus_cake', quantity: 1 }]
      ok = true
      return {
        gameState: {
          ...s.gameState,
          player: { ...s.gameState.player, gold: gold - 8 },
          inventory: nextInventory,
        },
      }
    })
    return ok
  },

  longRest: () => {
    const s = get().gameState
    if (!s) return false
    const next = applyLongRest(s)
    if (!next) return false
    let ok = false
    set((st) => {
      if (!st.gameState) return {}
      const applied = applyLongRest(st.gameState)
      if (!applied) return {}
      // 首次休整谈话就绪（TM-P2-004 第 59 节）：recruited 后第一次 Long Rest 解锁（幂等）
      let flags = applied.world.flags
      if (flags[SAKURA_FLAGS.contractAccepted] === true && flags[SAKURA_FLAGS.firstRestDone] !== true) {
        flags = { ...flags, [SAKURA_FLAGS.firstRestReady]: true }
      }
      ok = true
      return { gameState: { ...applied, world: { ...applied.world, flags } } }
    })
    return ok
  },

  setCompanionActive: (companionId, active) => {
    const s = get().gameState
    if (!s) return false
    let ok = false
    set((st) => {
      if (!st.gameState) return {}
      const companion = st.gameState.companions[companionId]
      if (!companion) return {}
      if (companion.status !== 'guest' && companion.status !== 'recruited') return {}
      if (active) {
        // 重新同行（TM-P2-004 第 151 节）：有槽位才可
        if (!canRejoinParty(st.gameState.companions, st.gameState.party, companionId)) return {}
        const party = activateCompanion(st.gameState.party, companionId)
        if (!party) return {}
        ok = true
        return { gameState: { ...st.gameState, party } }
      }
      // 暂不同行（TM-P2-004 第 149/150 节）：不降关系、recruited 不变
      const party = deactivateCompanion(st.gameState.party, companionId)
      ok = true
      return { gameState: { ...st.gameState, party } }
    })
    return ok
  },

  spendCompanionSkillMp: (companionId, skillId) => {
    const s = get().gameState
    if (!s) return false
    const companion = s.companions[companionId]
    if (!companion) return false
    if (companion.status !== 'guest' && companion.status !== 'recruited') return false
    const check = checkSkillUse(skillId, {
      learnedSkillIds: companion.learnedSkillIds,
      profession: undefined, // 伙伴无职业：通用技能（Sakura 三技能）合法
      mp: companion.mp,
      maxMp: companion.maxMp,
    })
    if (!check.allowed) return false
    const cost = check.mpCost ?? 0
    if (cost === 0) return true
    let spent = false
    set((st) => {
      if (!st.gameState) return {}
      const c = st.gameState.companions[companionId]
      if (!c) return {}
      if (c.status !== 'guest' && c.status !== 'recruited') return {}
      const recheck = checkSkillUse(skillId, {
        learnedSkillIds: c.learnedSkillIds,
        profession: undefined,
        mp: c.mp,
        maxMp: c.maxMp,
      })
      if (!recheck.allowed) return {}
      spent = true
      return {
        gameState: {
          ...st.gameState,
          companions: { ...st.gameState.companions, [companionId]: { ...c, mp: c.mp - cost } },
        },
      }
    })
    return spent
  },
}))

// ---- 五槽位摘要/最近槽位读取（Store 状态同步辅助；TM-P2-002 G）----

function loadIndexSummary(): SavesIndex['slots'] {
  return loadIndex().slots
}

function loadIndexLast(): SlotId | null {
  return loadIndex().lastSavedSlot
}

// ---- TM-P2-003 D/E/F：北门旧哨塔类型与常量 ----

/** MND 检定 DC（寻找备用机关） */
export const NORTH_TOWER_MND_DC = 12
/** 命运补救 / 宝箱追加 Luck 检定 DC */
export const NORTH_TOWER_LUCK_DC = 12
/** 宝箱基础金币（Luck 无关，必给） */
export const NORTH_TOWER_CACHE_BASE_GOLD = 20
/** 宝箱 Luck 成功追加金币 */
export const NORTH_TOWER_CACHE_LUCK_GOLD = 30

export type NorthTowerSkillResult =
  | { outcome: 'opened'; skillName: string; mpCost: number }
  | { outcome: 'no_skill' | 'no_mp' | 'wrong_tag' | 'already_opened' }
  | null

export type NorthTowerMndResult = { outcome: 'success' | 'failed' | 'locked'; check: D20CheckResult } | null

export type NorthTowerLuckResult = { outcome: 'rescued' | 'failed' | 'locked'; check: LuckCheckResult } | null

/** 旧货商机缘检定 DC */
export const OLD_TRADER_LUCK_DC = 12
/** 旧货商大成功小礼物（金币） */
export const OLD_TRADER_CRITICAL_GOLD = 15

export type OldTraderResult = {
  outcome: 'success' | 'failure' | 'critical_success'
  luckCheck: LuckCheckResult
  goldBonus: number
} | null

// ---- TM-P2-008：北郊余波主线（§20 多解检定 / §22 Sakura 插话）----

/** 北郊袭击现场调查 DC（MND / LCK 检定） */
export const NORTH_OUTSKIRTS_INVESTIGATE_DC = 12

/** TM-P2-009 §13：旧驿站屏障多解检定 DC（MND / LCK） */
export const WAYSTATION_BARRIER_DC = 12

export type WaystationBarrierResult =
  | { ok: true; method: 'combat'; clueAdded?: string }
  | { ok: true; method: 'mnd' | 'lck'; check: D20CheckResult; progressed: boolean; clueAdded?: string }
  | { ok: true; method: 'sakura'; present: true; progressed?: boolean; clueAdded?: string }
  | { ok: true; method: 'mount'; clueAdded?: string; alreadySearched?: boolean; progressed?: boolean }
  | { ok: false; reason: 'locked' | 'sakura_not_present' | 'mount_not_present' | 'already_done' | 'wolves_not_neutralized' }

export type NorthOutskirtsInvestigateResult =
  | { ok: true; method: 'mnd' | 'lck'; check: D20CheckResult; progressed: boolean; clueAdded?: string }
  | { ok: true; method: 'sakura'; present: true; clueAdded?: string }
  | { ok: true; method: 'mount'; clueAdded?: string; alreadySearched?: boolean }
  | { ok: false; reason: 'locked' | 'sakura_not_present' | 'mount_not_present' | 'already_done' }

export type NorthTowerClaimResult =
  | {
      outcome: 'claimed'
      items: { itemId: string; quantity: number }[]
      gold: number
      luckCheck: LuckCheckResult
    }
  | { outcome: 'locked' | 'already_claimed' }
  | null

// ---- TM-P2-004：Sakura 场景类型 ----

/** 初见三分支（TM-P2-004 第 37 节） */
export type SakuraMeetChoice = 'help' | 'ask' | 'pet_joke'
export type SakuraMeetResult =
  | { outcome: 'met'; affectionDelta: number; trustDelta: number }
  | { outcome: 'locked' }
  | null

/** MND / LUCK 检定结果（TM-P2-004 第 25/26 节；roll/total/dc 供 UI 展示） */
export type SakuraSceneCheckResult = {
  outcome: 'success' | 'failed'
  roll: number
  total: number
  dc: number
  nat20?: boolean
} | null

/** 神契三选择（TM-P2-004 第 79 节） */
export type SakuraContractChoice = 'affirm' | 'try' | 'joke'
export type SakuraContractResult =
  | { outcome: 'recruited'; affectionDelta: number; trustDelta: number }
  | { outcome: 'locked' | 'already' }
  | null

/** 常驻交谈话题（TM-P2-004 第 62 节） */
export type SakuraTalkTopic = 'continent' | 'wound' | 'past'
/** 《第一夜》三选择（TM-P2-004 第 59-61 节） */
export type SakuraFirstRestChoice = 'respect' | 'joke' | 'pragmatic'
/** 天龙城 banter 三回答（TM-P2-004 第 88 节） */
export type SakuraBanterChoice = 'habit' | 'not_mortal' | 'will_like'
export type SakuraTalkResult =
  | { outcome: 'talked'; affectionDelta: number; trustDelta: number }
  | { outcome: 'cycle_limited' }
  | null

/** 赠礼结果（TM-P2-004 第 68 节；generic） */
export type GiftResult =
  | { outcome: 'given'; affectionDelta: number }
  | { outcome: 'locked' | 'unknown_item' | 'not_gift' | 'not_owned' | 'already_gifted' }
  | null
