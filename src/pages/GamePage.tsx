import { useState } from 'react'
import Button from '../components/Button'
import InventoryPanel from '../components/game/InventoryPanel'
import SakuraEncounterPanel from '../components/game/SakuraEncounterPanel'
import CompanionPanel from '../components/game/CompanionPanel'
import RelationshipPanel from '../components/game/RelationshipPanel'
import { useGameStore, VILLAGE_ELDER_POST_QUEST_EVENT_ID } from '../game/state/gameStore'
import { getProfessionName, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../game/content/professions'
import { getEnemy, getItem, getLocation, getNpc, getQuest, NPCS, QUESTS } from '../game/content'
import { CHECK_DC, type D20CheckResult } from '../game/rules/d20'
import { LEVEL_2_MAX_HP_GAIN, LEVEL_2_MAX_MP_GAIN } from '../game/rules/character'
import { formatLuckCheckLog, LUCK_OUTCOME_LABELS } from '../game/rules/luck'
import { getUsableSkills } from '../game/rules/skill'
import {
  canTriggerSakuraEncounter,
  getSakuraSceneStage,
  isSakuraTriggerLocation,
  canTriggerSakuraBanter,
  isFirstRestTalkReady,
} from '../game/rules/sakura'
import type {
  NorthTowerClaimResult,
  NorthTowerLuckResult,
  NorthTowerMndResult,
  NorthTowerSkillResult,
  OldTraderResult,
  SakuraBanterChoice,
  SakuraFirstRestChoice,
} from '../game/state/gameStore'
import type { QuestStatus } from '../game/types'
import { getCurrentObjective } from '../game/rules/objective'
import { getPlayerArmor } from '../game/rules/combat'

/** D20 检定结果中文（TM-P0-016） */
const CHECK_OUTCOME_LABELS: Record<D20CheckResult['outcome'], string> = {
  critical_success: '大成功',
  success: '成功',
  failure: '失败',
  critical_failure: '大失败',
}

interface GamePageProps {
  onBackToMenu: () => void
  /** TM-P0-008：进入战斗（App 负责正式入口校验） */
  onEngage: (enemyId: string) => void
  /** TM-P2-002 G：打开五槽位保存页面 */
  onOpenSaves: () => void
}

/** 任务状态中文（TM-P0-006） */
const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  undiscovered: '未发现',
  available: '可接受',
  in_progress: '进行中',
  completable: '可完成',
  completed: '已完成',
  failed: '失败',
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const ratio = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 text-sm text-bone-500">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded border border-ink-600 bg-ink-800">
        <div className="h-full bg-gold-500/70 transition-all" style={{ width: `${ratio}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-bone-300">
        {value} / {max}
      </span>
    </div>
  )
}

export default function GamePage({ onBackToMenu, onEngage, onOpenSaves }: GamePageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const saveGame = useGameStore((s) => s.saveGame)
  const travelToLocation = useGameStore((s) => s.travelToLocation)
  const discoverQuest = useGameStore((s) => s.discoverQuest)
  const acceptQuest = useGameStore((s) => s.acceptQuest)
  const completeQuest = useGameStore((s) => s.completeQuest)
  const useHealingPotion = useGameStore((s) => s.useHealingPotion)
  const equipWeapon = useGameStore((s) => s.equipWeapon)
  const unequipWeapon = useGameStore((s) => s.unequipWeapon)
  // TM-P2-003 D/E/F：北门旧哨塔
  const openNorthTowerWithSkill = useGameStore((s) => s.openNorthTowerWithSkill)
  const northTowerMndCheck = useGameStore((s) => s.northTowerMndCheck)
  const northTowerLuckRescue = useGameStore((s) => s.northTowerLuckRescue)
  const claimNorthTowerCache = useGameStore((s) => s.claimNorthTowerCache)
  const oldTraderTalk = useGameStore((s) => s.oldTraderTalk)
  const [towerSkillResult, setTowerSkillResult] = useState<NorthTowerSkillResult>(null)
  const [towerMndResult, setTowerMndResult] = useState<NorthTowerMndResult>(null)
  const [towerLuckResult, setTowerLuckResult] = useState<NorthTowerLuckResult>(null)
  const [towerClaimResult, setTowerClaimResult] = useState<NorthTowerClaimResult>(null)
  const [traderResult, setTraderResult] = useState<OldTraderResult>(null)
  const buyHealingPotion = useGameStore((s) => s.buyHealingPotion)
  const sellIronOre = useGameStore((s) => s.sellIronOre)
  const restAtVillage = useGameStore((s) => s.restAtVillage)
  const respondToVillageElderAfterQuest = useGameStore((s) => s.respondToVillageElderAfterQuest)
  const investigateAbandonedMine = useGameStore((s) => s.investigateAbandonedMine)
  const inspectRabbitPath = useGameStore((s) => s.inspectRabbitPath)
  const reportRabbitPathToVillageElder = useGameStore((s) => s.reportRabbitPathToVillageElder)
  const consultGoldenRabbitSearchNpc = useGameStore((s) => s.consultGoldenRabbitSearchNpc)
  const reportGoldenRabbitVillageInvestigation = useGameStore((s) => s.reportGoldenRabbitVillageInvestigation)
  const recheckGoldenRabbitMapAtLair = useGameStore((s) => s.recheckGoldenRabbitMapAtLair)
  const inspectApothecaryHerbRoute = useGameStore((s) => s.inspectApothecaryHerbRoute)
  const departQingshiVillageToTianlongCity = useGameStore((s) => s.departQingshiVillageToTianlongCity)
  const askWangcaiAboutTrouble = useGameStore((s) => s.askWangcaiAboutTrouble)
  const unlockBlackStoneTowerInvestigation = useGameStore((s) => s.unlockBlackStoneTowerInvestigation)
  const unlockBlackStoneTowerFloor2 = useGameStore((s) => s.unlockBlackStoneTowerFloor2)
  const unlockBlackStoneTowerFloor3 = useGameStore((s) => s.unlockBlackStoneTowerFloor3)
  const returnKuidongNecklaceToWangcai = useGameStore((s) => s.returnKuidongNecklaceToWangcai)
  const restAtTianlongMartialHall = useGameStore((s) => s.restAtTianlongMartialHall)
  // TM-P2-001 D3：北门痕迹调查 action
  const investigateNorthGateTrail = useGameStore((s) => s.investigateNorthGateTrail)
  // TM-P2-004：Sakura / 伙伴 / 关系 / 休整 actions
  const startSakuraEncounter = useGameStore((s) => s.startSakuraEncounter)
  const sakuraBanter = useGameStore((s) => s.sakuraBanter)
  const sakuraFirstRestTalk = useGameStore((s) => s.sakuraFirstRestTalk)
  const buyOsmanthusCake = useGameStore((s) => s.buyOsmanthusCake)
  const [banterDone, setBanterDone] = useState(false)
  const [banterNote, setBanterNote] = useState<string | null>(null)
  const [firstRestNote, setFirstRestNote] = useState<string | null>(null)
  const [firstRestResult, setFirstRestResult] = useState<SakuraFirstRestChoice | null>(null)
  const [travelError, setTravelError] = useState(false)
  // TM-P0-015：活动对话 NPC（仅 UI 本地状态，不进入 GameState / 存档）
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null)
  // TM-P0-016：本次调查的即时检定结果（仅 UI 本地状态；离开矿洞清空）
  const [lastMineInvestigation, setLastMineInvestigation] = useState<D20CheckResult | null>(null)
  // TM-P1-012：Lv.2 里程碑升级提示（仅 UI 本地状态；只由「本次《草原狼影》提交成功」这一 UI 事件触发，不进入 GameState/存档，不按 level 自动判断）
  const [showLevelUpNotice, setShowLevelUpNotice] = useState(false)
  /** TM-P1-023：天龙城离村二次确认（UI 本地状态，不写 GameState；确认后才调用 Store action） */
  const [showTianlongDepartureConfirm, setShowTianlongDepartureConfirm] = useState(false)
  /** TM-P2-001 B3：手机角色详情展开（仅 UI 本地状态；桌面端始终完整显示） */
  const [showCharacterDetails, setShowCharacterDetails] = useState(false)

  /** TM-P1-012：任务提交 handler——completeQuest 成功且为《草原狼影》时显示升级提示（最小局部逻辑，不建通知系统） */
  const handleCompleteQuest = (questId: string) => {
    const completed = completeQuest(questId)
    if (completed && questId === 'quest_grassland_wolf') {
      setShowLevelUpNotice(true)
    }
  }

  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">当前没有进行中的游戏。</p>
        <Button onClick={onBackToMenu}>返回主菜单</Button>
      </div>
    )
  }

  const { player, world } = gameState
  const location = getLocation(world.currentLocationId)
  // TM-P1-018：第四任务 QuestState（只读；调查进度/询问 flag 均从其 flags 读取）
  const goldenSearchQuest = gameState.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const goldenSearchInProgress = goldenSearchQuest?.status === 'in_progress'
  const goldenAskedBlacksmith = goldenSearchQuest?.flags.asked_blacksmith === true
  const goldenAskedApothecary = goldenSearchQuest?.flags.asked_apothecary === true
  const goldenInvestigationCount = (goldenAskedBlacksmith ? 1 : 0) + (goldenAskedApothecary ? 1 : 0)
  /** TM-P1-019：村内调查是否已向村长复命（只读 QuestState.flags；复命后任务日志显示阶段提示） */
  const goldenVillageInquiryReported = goldenSearchQuest?.flags.village_inquiry_reported === true
  /** TM-P1-020：兔王巢穴是否已复查《兔子的路径》（只读 QuestState.flags） */
  const goldenLairRechecked = goldenSearchQuest?.flags.rabbit_lair_rechecked === true
  /** TM-P1-021：支线《采药受阻》QuestState（只读；草原调查状态从 flags 读取） */
  const herbQuest = gameState.quests.find((q) => q.questId === 'quest_apothecary_herb_route')
  const herbInProgress = herbQuest?.status === 'in_progress'
  const herbGrasslandChecked = herbQuest?.flags.grassland_checked === true
  // TM-P1-023-R1：合法持有《兔子的路径》（与 Store departQingshiVillageToTianlongCity 同款校验的展示侧）——缺失/quantity 非法（0/-1/1.5/NaN/Infinity）/examined 非 true/reported 非 true 时一律不显示离村入口（避免 UI 允许但 Store 拒绝的死入口）
  const rabbitPathEntry = gameState.inventory.find((e) => e.itemId === 'rabbit_path')
  const hasValidRabbitPath =
    rabbitPathEntry !== undefined &&
    Number.isSafeInteger(rabbitPathEntry.quantity) &&
    rabbitPathEntry.quantity >= 1
  const rabbitPathReadyForDeparture =
    hasValidRabbitPath && world.flags.rabbit_path_examined === true && world.flags.rabbit_path_reported === true
  /** TM-P1-023：离村前置（只读 Store 同款校验的展示侧）——青石村 + 黄金主线收束 + 地图持有/汇报（R1 补齐 rabbit_path 三项）+ 已接触未完成支线阻止 */
  const goldenDepartureReady =
    world.currentLocationId === 'qingshi_village' &&
    rabbitPathReadyForDeparture &&
    goldenSearchQuest?.status === 'in_progress' &&
    goldenSearchQuest?.stage === 0 &&
    goldenAskedBlacksmith &&
    goldenAskedApothecary &&
    goldenVillageInquiryReported &&
    goldenLairRechecked
  const herbQuestBlocking =
    herbQuest?.status === 'available' || herbQuest?.status === 'in_progress' || herbQuest?.status === 'completable'
  const mineRemnantQuest = gameState.quests.find((q) => q.questId === 'quest_blacksmith_mine_remnant')
  const mineRemnantBlocking =
    mineRemnantQuest?.status === 'available' || mineRemnantQuest?.status === 'in_progress' || mineRemnantQuest?.status === 'completable'
  const sideQuestsBlocking = herbQuestBlocking || mineRemnantBlocking
  /** TM-P1-024：第五主线《商人王财的麻烦》QuestState（只读；王财对话剧情从 flags.wangcai_briefed 驱动） */
  const wangcaiQuest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
  const wangcaiBriefed = wangcaiQuest?.flags.wangcai_briefed === true
  /** TM-P1-025：黑石塔路线（只读）——unlocked flag 驱动移动按钮与骷髅士兵可见性；floor1_soldier_defeated 驱动清场剧情 */
  const towerUnlocked = world.flags.black_stone_tower_unlocked === true
  const towerQuestInProgress = wangcaiQuest?.status === 'in_progress' && wangcaiQuest?.stage === 0
  const floor1SoldierDefeated = wangcaiQuest?.flags.floor1_soldier_defeated === true
  /** TM-P1-026：一层骷髅队长清场（只读）——驱动 Boss 可见性与 Boss 后剧情 */
  const floor1CaptainDefeated = wangcaiQuest?.flags.floor1_captain_defeated === true
  // TM-P1-025-R1：解锁入口窄守卫——unlock flag 只允许 undefined/false 视为「待解锁」（异常非 boolean 与已 true 一律不显示行动按钮，避免 UI 允许但 Store 拒绝的死按钮）
  const towerUnlockFlag = world.flags.black_stone_tower_unlocked
  const towerUnlockPending = towerUnlockFlag === undefined || towerUnlockFlag === false
  /** TM-P1-027：黑石塔二层路线（只读）——floor2_unlocked 驱动移动按钮与二层敌人可见性；floor2 flag 驱动固定顺序战斗与清场剧情 */
  const towerFloor2Unlocked = world.flags.black_stone_tower_floor2_unlocked === true
  // 二层解锁入口窄守卫：target flag 只允许 undefined/false 视为「待解锁」（已 true/异常非 boolean 不显示行动按钮）
  const towerFloor2UnlockFlag = world.flags.black_stone_tower_floor2_unlocked
  const towerFloor2UnlockPending = towerFloor2UnlockFlag === undefined || towerFloor2UnlockFlag === false
  const floor2ZombieDefeated = wangcaiQuest?.flags.floor2_zombie_defeated === true
  const floor2BlackMageDefeated = wangcaiQuest?.flags.floor2_black_mage_defeated === true
  /** TM-P1-028：二层深处骷髅战士清场（只读）——驱动骷髅战士可见性与三层预告剧情 */
  const floor2SkeletonWarriorDefeated = wangcaiQuest?.flags.floor2_skeleton_warrior_defeated === true
  /** TM-P1-029：黑石塔三层路线（只读）——floor3_unlocked 驱动移动按钮与三层敌人可见性 */
  const towerFloor3Unlocked = world.flags.black_stone_tower_floor3_unlocked === true
  // 三层解锁入口窄守卫：target flag 只允许 undefined/false 视为「待解锁」（已 true/异常非 boolean 不显示行动按钮）
  const towerFloor3UnlockFlag = world.flags.black_stone_tower_floor3_unlocked
  const towerFloor3UnlockPending = towerFloor3UnlockFlag === undefined || towerFloor3UnlockFlag === false
  const floor3SkeletonWitchDefeated = wangcaiQuest?.flags.floor3_skeleton_witch_defeated === true
  /** TM-P1-029-R1：三层「继续向上」入口窄守卫——与 Store unlockBlackStoneTowerFloor3 前置完全一致（含一层两敌/二层三敌/briefed/unlocked/floor2_unlocked），避免 dead button（UI 与 Store guard 不一致）；target flag 只允许 undefined/false 视为「待解锁」（已 true/异常非 boolean 不显示入口） */
  const canUnlockTowerFloor3 =
    world.currentLocationId === 'black_stone_tower_floor2' &&
    towerQuestInProgress &&
    wangcaiBriefed &&
    towerUnlocked &&
    towerFloor2Unlocked &&
    floor1SoldierDefeated === true &&
    floor1CaptainDefeated === true &&
    floor2ZombieDefeated === true &&
    floor2BlackMageDefeated === true &&
    floor2SkeletonWarriorDefeated === true &&
    towerFloor3UnlockPending
  /** TM-P1-030：将夔峒项链交还王财 窄守卫——与 Store returnKuidongNecklaceToWangcai 前置完全一致（天龙城 + 任务 in_progress/stage 0 + briefed + 一二三层全解锁 + 一层两敌/二层三敌/三层女妖全击败 + 背包唯一持有项链 + flag 非 true/非 malformed）；只读 */
  const kuidongNecklaceReturned = wangcaiQuest?.flags.kuidong_necklace_returned === true
  const kuidongNecklaceReturnPending = wangcaiQuest?.flags.kuidong_necklace_returned === undefined || wangcaiQuest?.flags.kuidong_necklace_returned === false
  // TM-P1-030-R1：交还资格必须与 Store 一致——背包唯一一条项链且 quantity===1（quantity=2 或两条 entry 均非法，不显示交还按钮，避免 dead button）
  const kuidongNecklaceEntries = gameState.inventory.filter((i) => i.itemId === 'kuidong_necklace')
  const hasValidKuidongNecklace = kuidongNecklaceEntries.length === 1 && kuidongNecklaceEntries[0]?.quantity === 1
  const canReturnNecklaceToWangcai =
    world.currentLocationId === 'tianlong_city' &&
    wangcaiQuest?.status === 'in_progress' &&
    wangcaiQuest?.stage === 0 &&
    wangcaiBriefed &&
    towerUnlocked &&
    towerFloor2Unlocked &&
    towerFloor3Unlocked &&
    floor1SoldierDefeated === true &&
    floor1CaptainDefeated === true &&
    floor2ZombieDefeated === true &&
    floor2BlackMageDefeated === true &&
    floor2SkeletonWarriorDefeated === true &&
    floor3SkeletonWitchDefeated === true &&
    hasValidKuidongNecklace &&
    kuidongNecklaceReturnPending
  // TM-P2-001 D2/D3/D5：北门任务 QuestState（只读）——trail_checked 驱动调查入口与剧情；wolf_defeated 驱动敌人可见性与胜利剧情
  const northGateQuest = gameState.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
  const northGateQuestInProgress = northGateQuest?.status === 'in_progress' && northGateQuest?.stage === 0
  const northGateTrailChecked = northGateQuest?.flags.north_gate_trail_checked === true
  const northGateWolfDefeated = northGateQuest?.flags.north_gate_wolf_defeated === true
  // 调查入口窄守卫（与 Store investigateNorthGateTrail 一致）：flag 只允许 undefined/false 视为「待调查」
  const northGateTrailFlag = northGateQuest?.flags.north_gate_trail_checked
  const northGateTrailPending = northGateTrailFlag === undefined || northGateTrailFlag === false
  // 黑鬃魔狼可见性窄守卫（与 Store resolveCombatVictory/App handleEngage 一致）：狼击败 flag 非 true（undefined/false 才显示）
  const northGateWolfFlag = northGateQuest?.flags.north_gate_wolf_defeated
  const northGateWolfOk = northGateWolfFlag !== true && (typeof northGateWolfFlag === 'undefined' || typeof northGateWolfFlag === 'boolean')
  const northGateWolfVisible =
    world.currentLocationId === 'tianlong_north_gate' &&
    northGateQuestInProgress &&
    northGateTrailChecked &&
    northGateWolfOk
  // 北门调查入口（只读 Store 同款前置）
  const northGateInvestigateVisible =
    world.currentLocationId === 'tianlong_north_gate' && northGateQuestInProgress && northGateTrailPending
  // TM-P0-006：附近委托 = 给予者位于当前地点的注册任务（不写死地点 ID）
  const localQuests = Object.values(QUESTS).filter((quest) => {
    const giver = getNpc(quest.giverNpcId)
    if (giver?.locationId !== world.currentLocationId) return false
    // TM-P1-005：UI 侧窄前置（与 Store discoverQuest 一致）——《矿洞清理》仅在第一任务完成后可见
    if (quest.id === 'quest_mine_cleanup') {
      return gameState.quests.some((q) => q.questId === 'quest_village_monsters' && q.status === 'completed')
    }
    // TM-P1-010：UI 侧窄前置（与 Store discoverQuest 一致）——《草原狼影》仅在《矿洞清理》完成后可见
    if (quest.id === 'quest_grassland_wolf') {
      return gameState.quests.some((q) => q.questId === 'quest_mine_cleanup' && q.status === 'completed')
    }
    // TM-P1-017：UI 侧窄前置（与 Store discoverQuest 一致）——《追寻黄金兔子王》仅在向村长汇报《兔子的路径》后可见
    if (quest.id === 'quest_golden_rabbit_search') {
      return world.flags.rabbit_path_reported === true
    }
    // TM-P1-021：UI 侧窄前置（与 Store discoverQuest 一致）——《采药受阻》支线仅在《村外异动》completed 后可见
    if (quest.id === 'quest_apothecary_herb_route') {
      return gameState.quests.some((q) => q.questId === 'quest_village_monsters' && q.status === 'completed')
    }
    // TM-P1-022：UI 侧窄前置（与 Store discoverQuest 一致）——《矿洞余患》支线仅在《矿洞清理》completed 后可见
    if (quest.id === 'quest_blacksmith_mine_remnant') {
      return gameState.quests.some((q) => q.questId === 'quest_mine_cleanup' && q.status === 'completed')
    }
    // TM-P2-001 D2：UI 侧窄前置（与 Store discoverQuest 一致）——《北门失联》仅在《商人王财的麻烦》completed 后可见
    if (quest.id === 'quest_north_gate_missing_patrol') {
      return gameState.quests.some((q) => q.questId === 'quest_wangcai_trouble' && q.status === 'completed')
    }
    // TM-P2-004 第 34 节：《落樱越界》不由委托板发放——由反季樱雨事件 discover（排除，避免绕过剧情入口）
    if (quest.id === 'quest_sakura_boundary') {
      return false
    }
    return true
  })
  // TM-P0-015：附近人物 = 常驻当前地点的注册 NPC（动态过滤，不硬编码列表）；TM-P2-004：樱花优子不走普通对话系统（专属面板），从列表排除
  const localNpcs = Object.values(NPCS).filter(
    (npc) => npc.locationId === world.currentLocationId && npc.id !== 'sakura_yuko',
  )

  // 当前装备武器（左栏手机概览 + 装备区共用）
  const equippedWeaponDef = gameState.equipment.weapon ? getItem(gameState.equipment.weapon) : undefined
  const equippedWeaponName = gameState.equipment.weapon
    ? (equippedWeaponDef?.name ?? '物品数据异常')
    : '未装备'
  const equippedArmorDef = gameState.equipment.armor ? getItem(gameState.equipment.armor) : undefined
  const equippedArmorName = gameState.equipment.armor ? (equippedArmorDef?.name ?? '物品数据异常') : '未装备'
  const playerArmor = getPlayerArmor(player.attributes.con, equippedArmorDef?.type === 'armor' ? equippedArmorDef.armorDefenseBonus ?? 0 : 0)
  const objective = getCurrentObjective(gameState)

  const handleTravel = (targetId: string) => {
    // TM-P0-005：正式游戏移动只走 travelToLocation（Store 内部校验）
    const ok = travelToLocation(targetId)
    // TM-P0-015：成功移动后关闭活动对话；移动失败无需清空
    if (ok) setActiveNpcId(null)
    // TM-P0-016：离开地点后清除即时调查结果
    if (ok) setLastMineInvestigation(null)
    setTravelError(!ok)
  }

  const handleInvestigateMine = () => {
    const result = investigateAbandonedMine()
    if (result) setLastMineInvestigation(result)
  }

  // TM-P0-015：活动对话前重新校验 NPC 存在且仍在当前位置；异常视为无活动对话（不崩溃）
  const activeNpc = activeNpcId ? getNpc(activeNpcId) : undefined
  const showDialog = activeNpc !== undefined && activeNpc.locationId === world.currentLocationId

  // TM-P1-004：村长对 P1-003 一次性回应的关系反应（只读 UI，不写任何状态）
  // 前置：村长 + 事件已完成 + NpcState 存在；respect>=1（尊敬反应）优先于 trust>=2（信任反应）；异常/不满足 → 无反应（回退原 greeting）
  const elderReaction: 'respect' | 'trust' | null = (() => {
    if (activeNpc?.id !== 'village_elder') return null
    if (!world.completedEvents.includes(VILLAGE_ELDER_POST_QUEST_EVENT_ID)) return null
    const elderState = world.npcStates.village_elder
    if (!elderState) return null
    const respect = elderState.relationship.respect
    const trust = elderState.relationship.trust
    // TM-P1-004-R1：任一关系维度非 finite → 整体回退（不因另一维度合法而猜测分支、不修复非法值）
    if (!Number.isFinite(respect) || !Number.isFinite(trust)) return null
    // 确定性顺序：respect>=1（尊敬反应）优先，否则 trust>=2（信任反应）
    if (respect >= 1) return 'respect'
    if (trust >= 2) return 'trust'
    return null
  })()

  // 移动目标列表（中栏「地图/移动」块；位置在手机排到最后）
  const travelTargets =
    location?.connections
      .map((targetId) => ({ targetId, target: getLocation(targetId) }))
      .filter((entry): entry is { targetId: string; target: NonNullable<ReturnType<typeof getLocation>> } => entry.target !== undefined) ?? []

  return (
    <div className="game-page mx-auto min-h-screen w-full max-w-[1600px] px-4 py-6">
      {/* 顶栏：天梦大陆 / 当前地点 + 保存 / 主菜单 */}
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink-600 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-widest text-gold-300">天梦大陆</h2>
          <p className="text-sm text-bone-500">当前地点：{location?.name ?? '未知地点'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={onOpenSaves}>
            保存游戏
          </Button>
          <Button variant="ghost" onClick={onBackToMenu}>
            返回主菜单
          </Button>
        </div>
      </header>

      {showLevelUpNotice && (
        <section className="mb-6 rounded border border-gold-500/60 bg-gold-900/30 p-5 text-sm">
          <h3 className="text-lg font-bold text-gold-300">等级提升！</h3>
          <p className="mt-2 text-bone-200">你已达到 Lv.2。</p>
          <p className="mt-1 text-bone-300">
            最大生命 +{LEVEL_2_MAX_HP_GAIN}，最大灵力 +{LEVEL_2_MAX_MP_GAIN}。
          </p>
          <Button className="mt-3" variant="primary" onClick={() => setShowLevelUpNotice(false)}>
            知道了
          </Button>
        </section>
      )}

      {/* TM-P2-001 B1/B2/B3：三栏 / 两栏 / 单栏响应式骨架 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] xl:grid-cols-[280px_minmax(0,1fr)_340px] xl:grid-rows-1">
        {/* ============ 左栏：角色（手机仅概览，可展开完整详情） ============ */}
        <section
          data-testid="player-column"
          className="order-1 flex flex-col gap-6 md:col-start-2 md:row-start-2 xl:col-start-1 xl:row-start-1"
        >
          {/* 手机角色概览（桌面隐藏）：姓名 / Lv·职业 / HP / MP / 当前武器 + 查看角色详情 */}
          <section className="rounded border border-ink-600 bg-ink-800/50 p-5 md:hidden">
            <h3 className="text-lg font-bold text-bone-100">
              {player.name}
              <span className="ml-3 text-sm font-normal text-bone-500">
                Lv.{player.level} · {getProfessionName(player.profession)}
              </span>
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              <Bar label="生命" value={player.hp} max={player.maxHp} />
              <Bar label="灵力" value={player.mp} max={player.maxMp} />
            </div>
            <p className="mt-2 text-sm text-bone-300">
              当前武器：<span className="text-bone-100">{equippedWeaponName}</span>
            </p>
            <Button className="mt-3" variant="primary" onClick={() => setShowCharacterDetails((v) => !v)}>
              {showCharacterDetails ? '收起角色详情' : '查看角色详情'}
            </Button>
          </section>

          {/* 完整角色区：手机由「查看角色详情」展开（TM-P2-002：data-testid 供 display 断言，不用 textContent 判定）；md+ 始终显示 */}
          <div
            data-testid="mobile-character-details"
            className={`flex flex-col gap-6 ${showCharacterDetails ? 'flex' : 'hidden'} md:flex`}
          >
            <section className="rounded border border-ink-600 bg-ink-800/50 p-5">
              <h3 className="mb-4 text-lg font-bold text-bone-100">
                {player.name}
                <span className="ml-3 text-sm font-normal text-bone-500">
                  Lv.{player.level} · {getProfessionName(player.profession)}
                </span>
              </h3>
              <div className="mb-4 flex flex-col gap-2">
                <Bar label="生命" value={player.hp} max={player.maxHp} />
                <Bar label="灵力" value={player.mp} max={player.maxMp} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {ATTRIBUTE_KEYS.map((key) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-bone-500">{ATTRIBUTE_LABELS[key]}</span>
                    <span className="tabular-nums text-bone-300">{player.attributes[key]}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm">
                  <span className="text-bone-500">金币</span>
                  <span className="tabular-nums text-gold-300">{player.gold}</span>
                </div>
              </div>
            </section>

            <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">装备</h3>
              <p>
                武器：{' '}
                {equippedWeaponDef ? (
                  <span className="text-bone-100">{equippedWeaponDef.name}</span>
                ) : gameState.equipment.weapon ? (
                  <span className="text-bone-100">
                    物品数据异常
                  </span>
                ) : (
                  <span className="text-bone-500">未装备</span>
                )}
              </p>
              <p className="mt-1">防具：<span className="text-bone-100">{equippedArmorName}</span></p>
              <p className="mt-1">护甲等级：<span className="text-bone-100">{playerArmor}</span></p>
            </section>

            {/* TM-P2-003-R3 B：背包从 GamePage 抽到 InventoryPanel（数据驱动武器入口，不再 hardcode iron_sword） */}
            <InventoryPanel
              inventory={gameState.inventory}
              equippedWeaponId={gameState.equipment.weapon}
              playerHp={player.hp}
              playerMaxHp={player.maxHp}
              onEquipWeapon={(itemId) => equipWeapon(itemId)}
              onUnequipWeapon={() => unequipWeapon()}
              onUseHealingPotion={() => useHealingPotion()}
              equippedArmorId={gameState.equipment.armor}
              onEquipItem={(itemId) => useGameStore.getState().equipItem(itemId)}
              onUnequipArmor={() => useGameStore.getState().unequipSlot('armor')}
              profession={player.profession}
            />
          </div>
        </section>

        {/* ============ 中栏：主玩法区（地点/剧情/NPC/敌人/调查/委托/移动） ============ */}
        <section
          data-testid="main-column"
          className="order-3 flex flex-col gap-6 md:col-start-1 md:row-start-1 md:row-span-2 xl:col-start-2 xl:row-start-1"
        >
          {/* 当前区域（地点描述；手机第 3 位） */}
          <section className="order-1 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
            <p className="mb-2 text-bone-500">当前位置</p>
            {location ? (
              <>
                <h3 className="text-lg font-bold text-bone-100">{location.name}</h3>
                <p className="mt-2 leading-relaxed">{location.description}</p>
              </>
            ) : (
              // TM-P0-005：未知当前位置安全边界——不崩溃、不提供移动按钮
              <p className="text-bone-300">地点数据异常</p>
            )}
          </section>

          {/* 地图 / 移动（手机排到最后；桌面紧跟地点描述之后） */}
          {location && location.connections.length > 0 && (
            <section className="order-2 max-md:order-last rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <p className="mb-2 text-bone-500">可前往：</p>
              <div className="flex flex-wrap gap-4">
                {travelTargets.map(({ targetId, target }) => {
                  const locked = target.requiredFlag !== undefined && world.flags[target.requiredFlag] !== true
                  return (
                    <div key={targetId} className="flex flex-col items-start gap-1">
                      <Button
                        variant={locked ? 'ghost' : 'primary'}
                        disabled={locked}
                        onClick={() => handleTravel(targetId)}
                      >
                        {target.name}
                      </Button>
                      {locked && <span className="text-xs text-bone-500">尚未找到进入此地的方法</span>}
                    </div>
                  )
                })}
              </div>
              {travelError && <p className="mt-3 text-sm text-red-300">无法前往该地点。</p>}
            </section>
          )}

          {/* ---- 剧情与行动块（中栏中部；手机在描述之后、移动之前） ---- */}

          {/* TM-P2-004 第 31/32 节：反季樱雨入口 —— 触发条件满足时在天龙城/武馆出现（不点不消失，不永久错过） */}
          {isSakuraTriggerLocation(world.currentLocationId) &&
            getSakuraSceneStage(gameState) === 'hidden' &&
            canTriggerSakuraEncounter(gameState) && (
              <section className="order-2 rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5 text-sm text-bone-300">
                <h3 className="mb-2 text-sm font-bold tracking-wider text-sakura-200">反季樱雨</h3>
                <p className="leading-relaxed text-bone-200">不合时节的樱花正从天空飘落——你能感到花瓣背后有什么在松动。</p>
                <Button className="mt-3" variant="primary" onClick={() => startSakuraEncounter()}>
                  查看异象
                </Button>
              </section>
            )}

          {/* TM-P2-004：Sakura 剧情面板（樱雨→神域→初见→检定→合作→战斗→契约→入队；一次性持久化，刷新/读档不重掷） */}
          {getSakuraSceneStage(gameState) !== 'hidden' && (
            <div className="order-2">
              <SakuraEncounterPanel onEngage={onEngage} />
            </div>
          )}

          {/* TM-P2-004 第 88 节：天龙城同行 banter（recruited 后首次返回天龙城触发一次） */}
          {canTriggerSakuraBanter(gameState) && !banterDone && (
            <section className="order-2 rounded border border-sakura-500/40 bg-ink-900/50 p-5 text-sm text-bone-300">
              <p className="leading-relaxed text-bone-200">樱花优子望着街道上往来的人群，轻声说：</p>
              <p className="mt-1 leading-relaxed text-sakura-200">
                「这里的灵脉比神域混乱得多……可这些凡人似乎完全感觉不到。」
              </p>
              <div className="mt-3 flex flex-col items-start gap-2">
                {(
                  [
                    { choice: 'habit' as SakuraBanterChoice, label: '习惯就好。' },
                    { choice: 'not_mortal' as SakuraBanterChoice, label: '别把所有人都叫凡人。' },
                    { choice: 'will_like' as SakuraBanterChoice, label: '你也会慢慢喜欢这里。' },
                  ]
                ).map(({ choice, label }) => (
                  <Button
                    key={choice}
                    variant="primary"
                    onClick={() => {
                      const result = sakuraBanter(choice)
                      setBanterDone(true)
                      if (result && result.outcome === 'talked') {
                        const parts: string[] = []
                        if (result.affectionDelta !== 0) parts.push(`好感 ${result.affectionDelta > 0 ? '+' : ''}${result.affectionDelta}`)
                        if (result.trustDelta !== 0) parts.push(`信任 ${result.trustDelta > 0 ? '+' : ''}${result.trustDelta}`)
                        setBanterNote(parts.length ? `樱花优子 ${parts.join('  ')}` : '她轻轻笑了笑。')
                      }
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {banterNote && <p className="mt-2 text-xs text-sakura-300">{banterNote}</p>}
            </section>
          )}
          {/* banter 完成后的关系提示（面板隐藏后仍显示一次） */}
          {canTriggerSakuraBanter(gameState) === false && banterDone && banterNote && (
            <p className="order-2 text-xs text-sakura-300">{banterNote}</p>
          )}

          {/* TM-P2-004 第 59-61 节：首次休整谈话《第一夜：神与凡人的距离》（Long Rest 后就绪；三选项） */}
          {isFirstRestTalkReady(gameState) && !firstRestResult && (
            <section className="order-2 rounded border border-sakura-500/40 bg-ink-900/50 p-5 text-sm text-bone-300">
              <h3 className="mb-2 text-sm font-bold tracking-wider text-sakura-200">第一夜：神与凡人的距离</h3>
              <p className="leading-relaxed text-bone-200">
                夜里，樱花优子坐在屋檐下，望着你：「……神契只是让我留在这里。接下来，我们怎么相处？」
              </p>
              <div className="mt-3 flex flex-col items-start gap-2">
                {(
                  [
                    { choice: 'respect' as SakuraFirstRestChoice, label: '神契只是让你留在这里，不代表你属于我。' },
                    { choice: 'joke' as SakuraFirstRestChoice, label: '那我是不是该叫你“我的宠物女神”？' },
                    { choice: 'pragmatic' as SakuraFirstRestChoice, label: '所以你现在还能发挥多少战力？' },
                  ]
                ).map(({ choice, label }) => (
                  <Button
                    key={choice}
                    variant="primary"
                    onClick={() => {
                      const result = sakuraFirstRestTalk(choice)
                      setFirstRestResult(choice)
                      if (result && result.outcome === 'talked') {
                        const parts: string[] = []
                        if (result.affectionDelta !== 0) parts.push(`好感 ${result.affectionDelta > 0 ? '+' : ''}${result.affectionDelta}`)
                        if (result.trustDelta !== 0) parts.push(`信任 ${result.trustDelta > 0 ? '+' : ''}${result.trustDelta}`)
                        setFirstRestNote(parts.length ? `樱花优子 ${parts.join('  ')}` : '她认真地回答了你的问题。')
                      }
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </section>
          )}
          {firstRestResult && (
            <section className="order-2 rounded border border-sakura-500/40 bg-ink-900/50 p-5 text-sm text-bone-300">
              <p className="leading-relaxed text-bone-200">
                {firstRestResult === 'respect' && '她沉默了很久，最后轻轻点头：「……谢谢你。这句话，比任何契约都重。」'}
                {firstRestResult === 'joke' && '她愣了一下，随即别过头去：「……神契宠物只是你们天梦大陆的分类，不代表所有权。」'}
                {firstRestResult === 'pragmatic' && '她认真地想了想：「樱花飞斩、魔法盾与轻舞还能用。完整封印术……还差很远。」'}
              </p>
              {firstRestNote && <p className="mt-2 text-xs text-sakura-300">{firstRestNote}</p>}
            </section>
          )}

          {/* TM-P2-001 D3：北门调查入口 / 痕迹剧情 —— 天龙城北门 + 北门任务 in_progress + 未调查时显示入口；调查后显示固定剧情（黑鬃魔狼由附近威胁区在正确状态出现） */}
          {world.currentLocationId === 'tianlong_north_gate' && northGateQuestInProgress && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              {northGateTrailChecked ? (
                <>
                  <p className="leading-relaxed text-bone-200">城门外侧的泥地上散落着凌乱马蹄印。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">其中一串痕迹突然偏离官道，消失在北面的荒草间。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">草叶间还残留着明显的魔化气息。</p>
                </>
              ) : (
                <>
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门调查</h3>
                  <p className="leading-relaxed text-bone-200">城门外的泥地上似乎留有巡逻队经过的痕迹。</p>
                  {northGateTrailPending && (
                    <Button className="mt-3" variant="primary" onClick={() => investigateNorthGateTrail()}>
                      查看巡逻队留下的痕迹
                    </Button>
                  )}
                </>
              )}
            </section>
          )}

          {/* TM-P2-001 D5：北门胜利剧情 —— 黑鬃魔狼击败后固定文案；「当前目标」行仅在任务 completable 时显示（TM-P2-002：completed 后保留剧情、清除旧目标，不清 wolf flag、狼不复活） */}
          {world.currentLocationId === 'tianlong_north_gate' && northGateWolfDefeated && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">荒草之间</h3>
              <p className="leading-relaxed text-bone-200">黑鬃魔狼倒在荒草之间。</p>
              <p className="mt-1 leading-relaxed text-bone-200">你在附近找到了一块刻着骑士团纹章的断裂铜牌。</p>
              <p className="mt-1 leading-relaxed text-bone-200">马蹄印和拖拽痕迹仍然继续向北延伸。</p>
              <p className="mt-1 leading-relaxed text-bone-200">失联巡逻队显然没有停在这里。</p>
              {northGateQuest?.status === 'completable' && (
                <p className="mt-2 text-gold-300">当前目标：返回武馆，将发现告诉马科。</p>
              )}
            </section>
          )}


          {/* TM-P2-003 D/E/F：北门旧哨塔补给匣（黑鬃魔狼击败后可选的完全独立小场景；不推进北门主线/不解锁北方地图） */}
          {world.currentLocationId === 'tianlong_north_gate' && northGateWolfDefeated && (() => {
            const towerOpened = world.flags.north_tower_opened === true
            const towerClaimed = world.flags.north_tower_cache_claimed === true
            const towerMndFailed = world.flags.north_tower_mnd_failed === true
            const towerLuckUsed = world.flags.north_tower_luck_used === true
            // 场景技能路线：统一解析（learnedSkillIds → getUsableSkills：未知忽略/重复去重/通用技能可用）→ 按 Tag 过滤（force/movement/magic）
            const towerSkills = getUsableSkills(
              gameState.player.learnedSkillIds,
              gameState.player.profession,
            ).filter((s) => s.tags.some((t) => t === 'force' || t === 'movement' || t === 'magic'))
            if (towerClaimed) {
              return (
                <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门旧哨塔</h3>
                  <p className="leading-relaxed text-bone-200">
                    补给匣已经打开，里面的东西被你在荒草间逐一收起。倒塌的哨塔结构重新归于沉寂。
                  </p>
                  {towerClaimResult?.outcome === 'claimed' && (
                    <div className="mt-3 rounded bg-ink-950/60 p-3">
                      <p className="text-bone-200">你当时获得了：</p>
                      {towerClaimResult.items.map((it) => {
                        const def = getItem(it.itemId)
                        return (
                          <p key={it.itemId} className="mt-1">
                            {def?.name ?? it.itemId} ×{it.quantity}
                          </p>
                        )
                      })}
                      {towerClaimResult.gold > 0 && <p className="mt-1">金币 +{towerClaimResult.gold}</p>}
                      {towerClaimResult.luckCheck && (
                        <div className="mt-2 text-xs text-bone-400">
                          {formatLuckCheckLog(towerClaimResult.luckCheck).map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            }
            if (towerOpened) {
              return (
                <section className="order-3 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门旧哨塔的巡逻补给匣</h3>
                  {/* 开启方式（结果进存档后仍保留可见，刷新后通过 flags 复原，不再重掷） */}
                  {towerSkillResult?.outcome === 'opened' && (
                    <p className="leading-relaxed text-bone-200">你用{towerSkillResult.skillName}移开了阻碍（消耗 {towerSkillResult.mpCost} 灵力）。</p>
                  )}
                  {towerMndResult?.outcome === 'success' && (
                    <div>
                      <p className="leading-relaxed text-bone-200">你发现了备用机关，沉重的阻碍缓缓移开。</p>
                      <div className="mt-2 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                        <p>D20 {towerMndResult.check.roll} + 冥想修正 {towerMndResult.check.attributeModifier} = {towerMndResult.check.total}</p>
                        <p>DC {towerMndResult.check.dc}</p>
                        <p>检定：{CHECK_OUTCOME_LABELS[towerMndResult.check.outcome]}</p>
                      </div>
                    </div>
                  )}
                  {towerLuckResult?.outcome === 'rescued' && (
                    <div>
                      <p className="leading-relaxed text-bone-200">
                        你无意碰到一块松动石片，石片后的旧拉索竟然还连着补给匣的备用锁舌。阻碍松动了。
                      </p>
                      <div className="mt-2 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                        {formatLuckCheckLog(towerLuckResult.check).map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="leading-relaxed text-bone-200">阻碍被移开后，一只斑驳的铁匣出现在你面前。你伸手打开了它。</p>
                  {towerClaimResult?.outcome === 'claimed' ? (
                    <div className="mt-3">
                      <p className="text-bone-200">你获得了：</p>
                      {towerClaimResult.items.map((it) => {
                        const def = getItem(it.itemId)
                        return (
                          <p key={it.itemId} className="mt-1">
                            {def?.name ?? it.itemId} ×{it.quantity}
                          </p>
                        )
                      })}
                      {towerClaimResult.gold > 0 && <p className="mt-1">金币 +{towerClaimResult.gold}</p>}
                      {towerClaimResult.luckCheck && (
                        <div className="mt-2 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                          {formatLuckCheckLog(towerClaimResult.luckCheck).map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button variant="primary" className="mt-3" onClick={() => setTowerClaimResult(claimNorthTowerCache())}>
                      打开补给匣
                    </Button>
                  )}
                </section>
              )
            }
            // 未开启：倒塌结构 + 路线选择
            return (
              <section className="order-3 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门旧哨塔的巡逻补给匣</h3>
                <p className="leading-relaxed text-bone-200">
                  倒塌的哨塔结构压住了一只巡逻补给匣。你可以试着用不同的方式移开阻碍。
                </p>
                {/* 技能路线（按 Tag） */}
                {towerSkills.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {towerSkills.map((skill) => (
                      <Button
                        key={skill.id}
                        variant="ghost"
                        disabled={gameState.player.mp < skill.mpCost}
                        onClick={() => {
                          setTowerSkillResult(openNorthTowerWithSkill(skill.id))
                          setTowerMndResult(null)
                          setTowerLuckResult(null)
                        }}
                      >
                        {skill.name}
                        {skill.mpCost > 0 ? `（${skill.mpCost} 灵力）` : ''}
                      </Button>
                    ))}
                  </div>
                )}
                {/* 普通属性路线（TM-P2-003-R1 A：失败后一次性锁定，只留命运补救；Store 亦拒绝重掷） */}
                {!towerMndFailed && (
                  <Button
                    variant="ghost"
                    className="mt-2"
                    onClick={() => {
                      setTowerMndResult(northTowerMndCheck())
                      setTowerSkillResult(null)
                    }}
                  >
                    [MND 检定] 寻找备用机关
                  </Button>
                )}
                {/* 检定结果展示 */}
                {towerSkillResult?.outcome === 'opened' && (
                  <p className="mt-3 text-gold-300">你用{towerSkillResult.skillName}移开了阻碍（消耗 {towerSkillResult.mpCost} 灵力）。</p>
                )}
                {towerSkillResult?.outcome === 'no_mp' && <p className="mt-3 text-red-300">灵力不足。</p>}
                {towerMndResult?.outcome === 'success' && (
                  <div className="mt-3">
                    <p className="text-gold-300">你发现了备用机关，沉重的阻碍缓缓移开。</p>
                    <div className="mt-2 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                      <p>D20 {towerMndResult.check.roll} + 冥想修正 {towerMndResult.check.attributeModifier} = {towerMndResult.check.total}</p>
                      <p>DC {towerMndResult.check.dc}</p>
                      <p>检定：{CHECK_OUTCOME_LABELS[towerMndResult.check.outcome]}</p>
                    </div>
                  </div>
                )}
                {towerMndResult?.outcome === 'failed' && (
                  <div className="mt-3">
                    <p className="text-bone-200">你在砖石间摸索良久，没能找到任何机关。</p>
                    <div className="mt-2 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                      <p>D20 {towerMndResult.check.roll} + 冥想修正 {towerMndResult.check.attributeModifier} = {towerMndResult.check.total}</p>
                      <p>DC {towerMndResult.check.dc}</p>
                      <p>检定：{CHECK_OUTCOME_LABELS[towerMndResult.check.outcome]}</p>
                    </div>
                  </div>
                )}
                {/* 命运补救（每节点最多一次） */}
                {towerMndFailed && !towerLuckUsed && !towerOpened && (
                  <div className="mt-3 rounded border border-gold-500/40 bg-gold-900/20 p-3">
                    <p className="text-bone-200">命运似乎还没有放弃你……</p>
                    <Button
                      variant="primary"
                      className="mt-2"
                      onClick={() => {
                        setTowerLuckResult(northTowerLuckRescue())
                        setTowerMndResult(null)
                      }}
                    >
                      [幸运检定] 寻求一线转机
                    </Button>
                  </div>
                )}
                {towerLuckResult?.outcome === 'rescued' && (
                  <div className="mt-3">
                    <p className="text-gold-300">
                      你无意碰到一块松动石片，石片后的旧拉索竟然还连着补给匣的备用锁舌。阻碍松动了。
                    </p>
                    <div className="mt-2 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                      {formatLuckCheckLog(towerLuckResult.check).map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                )}
                {towerLuckResult?.outcome === 'failed' && (
                  <div className="mt-3">
                    <p className="text-bone-200">拉索在最后一刻崩断了，命运这一次没有站在你这边。</p>
                    <div className="mt-2 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                      {formatLuckCheckLog(towerLuckResult.check).map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )
          })()}

          {/* TM-P1-016：青石村阶段完成 —— 只读 world.flags.rabbit_path_reported===true（Store action 已保证该 flag 只能在正确前提下产生，不重算任务链）；持久剧情状态展示，非弹窗/toast；【待补充】为剧情边界，无新地点按钮 */}
          {world.flags.rabbit_path_reported === true && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">青石村阶段完成</h3>
              <p className="leading-relaxed text-bone-200">
                你已经处理了村外异动、矿洞威胁与草原狼影，并取得了《兔子的路径》。
              </p>
              <p className="mt-2 text-bone-300">现有线索还不足以确认黄金兔子王的最终去向。</p>
            </section>
          )}

          {/* TM-P1-020：兔王巢穴地图复查 —— 第四任务 in_progress + 村内调查已复命 + 未复查时显示入口；成功后按钮消失并显示固定结果（不虚构路线/足迹/方向/坐标） */}
          {world.currentLocationId === 'rabbit_lair' && goldenSearchInProgress && goldenVillageInquiryReported && (
            goldenLairRechecked ? (
              <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                <p className="text-bone-200">你重新比对了地图与巢穴周边，但仍没有找到足以确认下一处地点的线索。</p>
                <p className="mt-2 text-bone-300">现有线索还不足以确认黄金兔子王的最终去向。</p>
              </section>
            ) : (
              <section className="order-3 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <p className="mb-3 text-bone-300">你带着《兔子的路径》返回兔王巢穴，准备重新比对地图上的标记。</p>
                <Button variant="primary" onClick={() => recheckGoldenRabbitMapAtLair()}>
                  重新比对地图
                </Button>
              </section>
            )
          )}

          {/* TM-P1-021：村外草原采药区域调查 —— 支线 in_progress（未调查入口）或已查看（成功结果）时显示；成功后按钮消失并显示固定结果（无草药/采集物/危险值/随机结果） */}
          {world.currentLocationId === 'village_grassland' && (herbInProgress || herbGrasslandChecked) && (
            herbGrasslandChecked ? (
              <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                <p className="text-bone-200">你检查了附近的采药区域，确认魔化野兽的活动确实影响了这里。</p>
                <p className="mt-2 text-bone-300">可以回青石村向药师复命了。</p>
              </section>
            ) : (
              <section className="order-3 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <p className="mb-3 text-bone-300">药师常来这一带采药。附近魔化野兽的活动让这里变得不再安全。</p>
                <Button variant="primary" onClick={() => inspectApothecaryHerbRoute()}>
                  查看采药区域
                </Button>
              </section>
            )
          )}

          {/* TM-P1-023：离开青石村前往天龙城 —— 黄金主线收束后显示「新的旅程」入口；已接触未完成支线时只提示不提供按钮；二次确认后才调用 Store action（不可逆，单向离村） */}
          {goldenDepartureReady && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">新的旅程</h3>
              {sideQuestsBlocking ? (
                <p className="leading-relaxed text-bone-200">你还有已经接触但尚未结束的村内委托，处理完再离开。</p>
              ) : (
                <>
                  <p className="leading-relaxed text-bone-200">青石村的事情暂时告一段落。你已经可以前往天龙城继续旅程。</p>
                  {!showTianlongDepartureConfirm ? (
                    <Button variant="primary" onClick={() => setShowTianlongDepartureConfirm(true)}>
                      准备前往天龙城
                    </Button>
                  ) : (
                    <div className="mt-3 rounded border border-red-400/40 bg-ink-900/40 p-3">
                      <p className="text-bone-200">离开青石村后将无法返回。</p>
                      <p className="mt-1 text-bone-300">尚未发现的村内委托将被留在这里。</p>
                      <div className="mt-3 flex flex-wrap gap-3">
                        <Button variant="primary" onClick={() => departQingshiVillageToTianlongCity()}>
                          前往天龙城
                        </Button>
                        <Button variant="ghost" onClick={() => setShowTianlongDepartureConfirm(false)}>
                          暂不离开
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* TM-P1-025：黑石塔调查入口 —— 天龙城 + 第五主线 in_progress/stage 0 + 已向王财了解情况 + unlock flag undefined/false（待解锁）时显示；只调用 Store action（不直接写 world flag）；stage!=0 或 unlock flag 异常非 boolean/已 true 一律不显示，避免死按钮 */}
          {world.currentLocationId === 'tianlong_city' && towerQuestInProgress && wangcaiBriefed && towerUnlockPending && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">黑石塔调查</h3>
              <p className="leading-relaxed text-bone-200">王财提供的情况已经足够，你可以动身前往黑石塔调查。</p>
              <Button variant="primary" onClick={() => unlockBlackStoneTowerInvestigation()}>
                动身调查黑石塔
              </Button>
            </section>
          )}

          {/* TM-P1-025/P1-026：黑石塔一层剧情 —— 骷髅士兵击败后显示前两句（无【待开放】；此时附近威胁正式出现骷髅队长）；骷髅队长击败后显示 Boss 战后固定文案（无按钮；二层本卡不开放） */}
          {world.currentLocationId === 'black_stone_tower_floor1' && floor1SoldierDefeated && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">大厅深处</h3>
              {!floor1CaptainDefeated ? (
                <>
                  <p className="leading-relaxed text-bone-200">大厅中的骷髅士兵已经被击败。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">
                    更深处传来沉重的骨骼碰撞声，一名身材高大的骷髅队长守在前方。
                  </p>
                </>
              ) : (
                <>
                  <p className="leading-relaxed text-bone-200">骷髅队长已经倒下。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">你检查了骷髅队长与周围，没有发现夔峒项链。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">通往黑石塔更深处的道路仍需继续调查。</p>
                  <p className="mt-2 text-gold-300">黑石塔上层尚未开启。</p>
                </>
              )}
            </section>
          )}

          {/* TM-P0-022：村中休整 —— 仅青石村显示；免费恢复 HP/MP 至最大值（战败软锁出口） */}
          {world.currentLocationId === 'qingshi_village' && (
            <section className="order-3 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">村中休整</h3>
              <p className="mb-3 text-bone-300">在村里稍作休息，可以恢复生命与灵力。</p>
              {(() => {
                const needsRest = player.hp < player.maxHp || player.mp < player.maxMp
                return (
                  <div className="flex flex-col items-start gap-1">
                    <Button variant="primary" disabled={!needsRest} onClick={() => restAtVillage()}>
                      休整
                    </Button>
                    {!needsRest && <span className="text-xs text-bone-500">状态良好，无需休整</span>}
                  </div>
                )
              })()}
            </section>
          )}

          {/* TM-P1-027：武馆休整 —— 仅天龙城武馆显示；免费恢复 HP/MP 至最大值（离开青石村后的 HP=0 软锁出口）；只调 Store action */}
          {world.currentLocationId === 'tianlong_martial_hall' && (
            <section className="order-3 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">武馆休整</h3>
              <p className="mb-3 text-bone-300">武馆里有专供休整的静室，可以恢复生命与灵力。</p>
              {(() => {
                const needsRest = player.hp < player.maxHp || player.mp < player.maxMp
                return (
                  <div className="flex flex-col items-start gap-1">
                    <Button variant="primary" disabled={!needsRest} onClick={() => restAtTianlongMartialHall()}>
                      休整
                    </Button>
                    {!needsRest && <span className="text-xs text-bone-500">状态良好，无需休整</span>}
                  </div>
                )
              })()}
            </section>
          )}

          {/* TM-P1-027：黑石塔二层解锁入口 —— 黑石塔一层 + 士兵与队长均已击败 + floor2 flag undefined/false（待解锁）时显示；只调用 Store action（不直接写 world flag） */}
          {world.currentLocationId === 'black_stone_tower_floor1' &&
            towerQuestInProgress &&
            wangcaiBriefed &&
            towerUnlocked &&
            floor1SoldierDefeated &&
            floor1CaptainDefeated &&
            towerFloor2UnlockPending && (
              <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">继续深入</h3>
                <p className="leading-relaxed text-bone-200">一层大厅已经清空，通往黑石塔二层的阶梯就在更深处。</p>
                <Button variant="primary" onClick={() => unlockBlackStoneTowerFloor2()}>
                  深入黑石塔二层
                </Button>
              </section>
            )}

          {/* TM-P1-027/P1-028：黑石塔二层入口区清场剧情 —— 僵尸与黑法师均击败后显示固定文案（骷髅战士只作为剧情文本预告，直到本卡击败前仍镇守深处） */}
          {world.currentLocationId === 'black_stone_tower_floor2' &&
            floor2ZombieDefeated &&
            floor2BlackMageDefeated &&
            !floor2SkeletonWarriorDefeated && (
              <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">二层前段</h3>
                <p className="leading-relaxed text-bone-200">二层前段的僵尸与黑法师已经被清理。</p>
                <p className="mt-1 leading-relaxed text-bone-200">
                  曲折的通道继续向深处延伸，前方小厅中出现了更强的骷髅战士，挡住继续深入的道路。
                </p>
              </section>
            )}

          {/* TM-P1-028：骷髅战士击败后固定剧情（找项链主线推进）——三层未解锁时显示「继续向上」入口（仅调 Store action）；已解锁则入口隐藏、经移动按钮前往三层 */}
          {world.currentLocationId === 'black_stone_tower_floor2' && floor2SkeletonWarriorDefeated && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">二层深处</h3>
              <p className="leading-relaxed text-bone-200">小厅中的骷髅战士已经倒下。</p>
              <p className="mt-1 leading-relaxed text-bone-200">你仔细搜索了周围，依然没有发现王财遗失的夔峒项链。</p>
              <p className="mt-1 leading-relaxed text-bone-200">小厅后方，一道向上的石阶通往黑石塔更高处。</p>
              {canUnlockTowerFloor3 && (
                <div className="mt-3">
                  <Button variant="primary" onClick={() => unlockBlackStoneTowerFloor3()}>
                    继续向上
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* TM-P1-029：黑石塔三层——骷髅女妖击败后固定剧情（找到夔峒项链 ×1；不交还王财、不完成任务） */}
          {world.currentLocationId === 'black_stone_tower_floor3' && floor3SkeletonWitchDefeated && (
            <section className="order-3 rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">三层厅堂</h3>
              <p className="leading-relaxed text-bone-200">骷髅女妖倒在破碎的石柱之间。</p>
              <p className="mt-1 leading-relaxed text-bone-200">你在厅堂深处搜索时，发现了一条被灰尘覆盖的项链。</p>
              <p className="mt-1 leading-relaxed text-bone-200">这正是王财所说的夔峒项链。</p>
              <p className="mt-2 text-gold-300">夔峒项链 ×1 已获得。</p>
              <p className="mt-1">当前目标：返回天龙城，将夔峒项链交还王财。</p>
            </section>
          )}

          {/* TM-P2-003 G：机缘型社交 —— 路边旧货商（天龙城；首次交流自动幸运检定；结果进存档，刷新/反复交谈不重刷） */}
          {world.currentLocationId === 'tianlong_city' && (() => {
            const talked = world.flags.old_trader_talked === true
            const outcome = world.flags.old_trader_outcome
            return (
              <section className="order-4 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">路边旧货商</h3>
                {!talked ? (
                  <div>
                    <p className="leading-relaxed text-bone-200">
                      一个胡子花白的旧货商蹲在城墙根下，摊前堆着些看不出年代的杂物。见你走近，他眯起眼睛打量了你一番。
                    </p>
                    <Button
                      variant="ghost"
                      className="mt-3"
                      onClick={() => setTraderResult(oldTraderTalk())}
                    >
                      上前搭话
                    </Button>
                  </div>
                ) : (
                  <div>
                    {outcome === 'critical_success' ? (
                      <>
                        <p className="leading-relaxed text-bone-200">
                          旧货商越看你越觉得面善，咧嘴一笑：“小兄弟，咱爷俩有缘。这北门老哨塔前些日子夜里总是有动静，你要是有胆子，去那儿翻翻，兴许能翻出点好东西。”
                        </p>
                        <p className="mt-2 text-gold-300">他摸出几枚铜钱塞进你手里。</p>
                      </>
                    ) : outcome === 'success' ? (
                      <p className="leading-relaxed text-bone-200">
                        旧货商絮絮叨叨说了几句北门的传闻：“北门外那座旧哨塔啊，荒了有些年头了。听说以前巡逻的骑士会在那儿歇脚。”
                      </p>
                    ) : (
                      <p className="leading-relaxed text-bone-200">
                        旧货商上下打量你一番，不咸不淡地说了句“随便看看”，便继续摆弄他的杂物去了。
                      </p>
                    )}
                  </div>
                )}
                {traderResult && (
                  <div className="mt-3 rounded bg-ink-950/60 p-2 text-xs text-bone-400">
                    {formatLuckCheckLog(traderResult.luckCheck).map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                    {traderResult.goldBonus > 0 && <p className="mt-1 text-gold-300">金币 +{traderResult.goldBonus}</p>}
                  </div>
                )}
              </section>
            )
          })()}

          {/* TM-P0-015：附近人物 —— 仅当前地点存在注册 NPC 时显示 */}
          {localNpcs.length > 0 && (
            <section className="order-4 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近人物</h3>
              {showDialog && activeNpc && (
                <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/60 p-4">
                  <p className="mb-1 text-xs tracking-wider text-bone-500">与{activeNpc.name}交谈</p>
                  <p className="font-bold text-bone-100">{activeNpc.name}</p>
                  <p className="mb-2 text-xs text-bone-500">{activeNpc.role}</p>
                  {/* TM-P1-004：已回应且关系合法时，后续关系反应替代原 greeting 正文位置（不重复显示旧文案）；否则回退原 greeting */}
                  {/* TM-P1-031/031-R1：修复 NPC 失忆——王财已取回项链后、马科按第五主线阶段（in_progress/completable/completed）分别替换 greeting（不建 DialogueSystem）；available/未接继续用原 greeting */}
                  {/* TM-P2-001 D2/D6：马科新增《北门失联》阶段 greeting（王财主线 completed 后生效） */}
                  <p className="mb-3 text-bone-300">
                    {elderReaction === 'respect'
                      ? '村长郑重地点了点头：“若你还要继续追查，务必小心。”'
                      : elderReaction === 'trust'
                        ? '村长舒展了眉头：“好，村里能安稳一些就好。”'
                        : activeNpc.id === 'knight_captain_make'
                          ? northGateQuest?.status === 'in_progress'
                            ? '北门那边有消息了吗？发现什么痕迹一定要告诉我。'
                            : northGateQuest?.status === 'completable'
                              ? '北门外找到什么了？'
                              : northGateQuest?.status === 'completed'
                                ? '北面的情况我已经记下了。你先休整一下。'
                                : wangcaiQuest?.status === 'in_progress'
                                  ? '王财的事情有进展了吗？黑石塔那边不要大意。'
                                  : wangcaiQuest?.status === 'completable'
                                    ? '王财那边已经处理好了？把黑石塔里的情况告诉我。'
                                    : wangcaiQuest?.status === 'completed'
                                      ? '黑石塔的情况我已经记下了。你先休整一下。'
                                      : activeNpc.greeting
                          : activeNpc.id === 'merchant_wangcai' && kuidongNecklaceReturned
                            ? '王财把项链小心收好，见到你时郑重地点了点头。'
                            : activeNpc.greeting}
                  </p>
                  {/* TM-P1-002/003：村长对话显示信任+尊敬（读 NpcState；未建立状态时 UI fallback 0，打开对话不创建状态） */}
                  {activeNpc.id === 'village_elder' && (
                    <p className="mb-3 text-xs text-bone-500">
                      信任：{world.npcStates[activeNpc.id]?.relationship.trust ?? 0}
                      {'　'}尊敬：{world.npcStates[activeNpc.id]?.relationship.respect ?? 0}
                    </p>
                  )}
                  {/* TM-P1-003：《村外异动》完成后村长一次性回应选择（复用 completedEvents 记录，仅未回应时显示） */}
                  {activeNpc.id === 'village_elder' &&
                    (gameState.quests.some((q) => q.questId === 'quest_village_monsters' && q.status === 'completed')) &&
                    !world.completedEvents.includes(VILLAGE_ELDER_POST_QUEST_EVENT_ID) && (
                      <div className="mb-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                        <p className="mb-2 text-xs text-bone-300">村长看着你，神色比之前放松了一些。</p>
                        <div className="flex flex-col items-start gap-2">
                          <Button variant="primary" onClick={() => respondToVillageElderAfterQuest('reassure')}>
                            村子平安就好。
                          </Button>
                          <Button variant="primary" onClick={() => respondToVillageElderAfterQuest('resolve')}>
                            我会继续追查这些异动。
                          </Button>
                        </div>
                      </div>
                    )}
                  {/* TM-P1-016：向村长汇报《兔子的路径》——青石村阶段收束入口（不依赖 P1-003 回应选择/关系值；Store flag 是唯一真源） */}
                  {activeNpc.id === 'village_elder' &&
                    gameState.inventory.some((e) => e.itemId === 'rabbit_path' && Number.isSafeInteger(e.quantity) && e.quantity >= 1) &&
                    world.flags.rabbit_path_examined === true &&
                    gameState.quests.some((q) => q.questId === 'quest_grassland_wolf' && q.status === 'completed') &&
                    world.flags.rabbit_path_reported !== true && (
                      <div className="mb-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                        <p className="mb-2 text-xs text-bone-300">你带回了一张指向黄金兔子王所在之地的地图。</p>
                        <Button variant="primary" onClick={() => reportRabbitPathToVillageElder()}>
                          向村长展示《兔子的路径》
                        </Button>
                      </div>
                    )}
                  {/* TM-P1-016：已汇报固定文案（汇报后按钮消失；地图仍指向【待补充】） */}
                  {activeNpc.id === 'village_elder' && world.flags.rabbit_path_reported === true && (
                    <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                      <p className="text-bone-200">你已经把《兔子的路径》展示给村长。</p>
                      <p className="mt-1 text-bone-300">地图仍指向黄金兔子王所在之地。</p>
                      <p className="mt-1 text-bone-300">地图上的标记仍无法对应到任何已知地点。</p>
                    </div>
                  )}
                  {/* TM-P1-019：向村长复命村内调查——第四任务 in_progress + 调查 2/2 + 未复命时显示入口（与 P1-016 地图汇报入口严格分开）；成功后按钮消失并显示固定文案 */}
                  {activeNpc.id === 'village_elder' && goldenSearchInProgress && goldenInvestigationCount === 2 && (
                    goldenVillageInquiryReported ? (
                      <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                        <p className="text-bone-200">你已经把调查结果告诉了村长。</p>
                        <p className="mt-1 text-bone-300">村里目前没人能够确认地图上的标记。</p>
                        <p className="mt-1 text-bone-300">现有线索还不足以确认黄金兔子王的最终去向。</p>
                      </div>
                    ) : (
                      <div className="mb-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                        <p className="mb-2 text-xs text-bone-300">你已经问过铁匠和药师，但两人都无法辨认地图上的标记。</p>
                        <Button variant="primary" onClick={() => reportGoldenRabbitVillageInvestigation()}>
                          向村长汇报调查结果
                        </Button>
                      </div>
                    )
                  )}
                  {/* TM-P1-018：向铁匠打听地图——第四任务 in_progress 且未询问时显示入口；成功后隐藏按钮并显示固定回复（剧情块在 greeting 之后，不修改 npcs.ts） */}
                  {activeNpc.id === 'blacksmith' && goldenSearchInProgress && (
                    goldenAskedBlacksmith ? (
                      <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                        <p className="text-bone-200">铁匠看了看地图，摇了摇头：“这上面的路线，我认不出来。”</p>
                      </div>
                    ) : (
                      <div className="mb-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                        <p className="mb-2 text-xs text-bone-300">你把《兔子的路径》拿给铁匠辨认。</p>
                        <Button variant="primary" onClick={() => consultGoldenRabbitSearchNpc('blacksmith')}>
                          向铁匠打听地图
                        </Button>
                      </div>
                    )
                  )}
                  {/* TM-P1-018：向药师打听地图——同上 */}
                  {activeNpc.id === 'apothecary' && goldenSearchInProgress && (
                    goldenAskedApothecary ? (
                      <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                        <p className="text-bone-200">药师仔细辨认了一会儿：“我也没见过这处标记。”</p>
                      </div>
                    ) : (
                      <div className="mb-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                        <p className="mb-2 text-xs text-bone-300">你请药师看看《兔子的路径》上的标记。</p>
                        <Button variant="primary" onClick={() => consultGoldenRabbitSearchNpc('apothecary')}>
                          向药师打听地图
                        </Button>
                      </div>
                    )
                  )}
                  {/* TM-P1-024：向王财询问黑石塔附近的遭遇——第五主线 in_progress 且未说明时显示入口（仅剧情标记驱动，不依赖 npcs.ts 改动）；成功后按钮消失并显示固定说明（黑石塔仍不开放） */}
                  {activeNpc.id === 'merchant_wangcai' && wangcaiQuest?.status === 'in_progress' && (
                    wangcaiBriefed ? (
                      <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                        <p className="text-bone-200">王财告诉你，几天前他在黑石塔附近遭到魔物袭击，混乱中遗失了妻子的夔峒项链。</p>
                        <p className="mt-1 text-bone-300">他希望你能前去调查，并设法找回项链。</p>
                      </div>
                    ) : (
                      <div className="mb-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                        <p className="mb-2 text-xs text-bone-300">马科让你来了解王财最近遇到的麻烦。</p>
                        <Button variant="primary" onClick={() => askWangcaiAboutTrouble()}>
                          询问黑石塔附近的遭遇
                        </Button>
                      </div>
                    )
                  )}
                  {/* TM-P1-030：将夔峒项链交还王财——天龙城 + 全前置 + 背包持有项链 + flag 非 true 时显示入口（与 Store 前置一致，避免 dead button）；成功后显示固定剧情并移除按钮 */}
                  {activeNpc.id === 'merchant_wangcai' && canReturnNecklaceToWangcai && (
                    <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                      <p className="mb-2 text-bone-200">你取出了黑石塔三层找到的夔峒项链。</p>
                      <Button variant="primary" onClick={() => returnKuidongNecklaceToWangcai()}>
                        将夔峒项链交还王财
                      </Button>
                    </div>
                  )}
                  {activeNpc.id === 'merchant_wangcai' && kuidongNecklaceReturned && (
                    <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                      <p className="text-bone-200">王财接过项链，久久没有说话。</p>
                      <p className="mt-1 text-bone-200">“没错……就是它。这是我妻子留下的东西。”</p>
                      <p className="mt-1 text-bone-200">“谢谢你。若不是你，我恐怕再也找不回来了。”</p>
                      <p className="mt-1 text-bone-300">王财收好项链，又向你郑重道谢。</p>
                      <p className="mt-1 text-bone-300">“黑石塔里的情况，也请你告诉马科队长。”</p>
                    </div>
                  )}
                  <Button variant="ghost" onClick={() => setActiveNpcId(null)}>
                    结束交谈
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-2">
                {localNpcs.map((npc) => (
                  <div
                    key={npc.id}
                    className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3"
                  >
                    <div>
                      <p className="font-bold text-bone-100">
                        {npc.name} <span className="text-xs font-normal text-bone-500">{npc.role}</span>
                      </p>
                      <p className="mt-1 text-xs text-bone-500">{npc.summary}</p>
                    </div>
                    <Button variant="primary" onClick={() => setActiveNpcId(npc.id)}>
                      交谈
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* TM-P0-014：药师商店 —— 仅当前地点存在药师时显示（读 NPC 注册表） */}
          {getNpc('apothecary')?.locationId === world.currentLocationId && (
            <section className="order-4 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">药师的小铺</h3>
              {(() => {
                const potion = getItem('healing_potion')
                if (!potion) return <p className="text-bone-500">货架空空如也。</p>
                const price = potion.value
                const canAfford = player.gold >= price
                return (
                  <div className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                    <div>
                      <p className="font-bold text-bone-100">{potion.name}</p>
                      <p className="mt-1 text-xs text-bone-500">
                        {potion.description}
                        {potion.healAmount !== undefined && <span> 恢复生命：{potion.healAmount}</span>}
                        <span> 价格：{price} 金币</span>
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button variant="primary" disabled={!canAfford} onClick={() => buyHealingPotion()}>
                        购买
                      </Button>
                      {!canAfford && <span className="text-xs text-red-300">金币不足</span>}
                    </div>
                  </div>
                )
              })()}
            </section>
          )}

          {/* TM-P0-021：铁匠收购 —— 仅当前地点存在铁匠时显示（读 NPC 注册表） */}
          {getNpc('blacksmith')?.locationId === world.currentLocationId && (
            <section className="order-4 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">铁匠的收购</h3>
              {(() => {
                const ore = getItem('iron_ore')
                if (!ore) return <p className="text-bone-500">货架空空如也。</p>
                const price = ore.value
                const held = gameState.inventory.find((e) => e.itemId === 'iron_ore')?.quantity ?? 0
                const canSell = held >= 1
                return (
                  <div className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                    <div>
                      <p className="font-bold text-bone-100">{ore.name}</p>
                      <p className="mt-1 text-xs text-bone-500">
                        {ore.description} 收购价：{price} 金币
                      </p>
                      <p className="mt-1 text-xs text-bone-500">持有：{held}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button variant="primary" disabled={!canSell} onClick={() => sellIronOre()}>
                        出售 1 个
                      </Button>
                      {!canSell && <span className="text-xs text-red-300">没有可出售的铁矿石</span>}
                    </div>
                  </div>
                )
              })()}
            </section>
          )}

          {/* TM-P2-004 第 66/67 节：天龙城桂花糕铺（第一种真实礼物——樱花优子 liked：sweet/refined） */}
          {world.currentLocationId === 'tianlong_city' && (() => {
            const cake = getItem('tianlong_osmanthus_cake')
            if (!cake) return null
            const price = cake.value
            const canAfford = player.gold >= price
            return (
              <section className="order-4 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">桂花糕铺</h3>
                <div className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3">
                  <div>
                    <p className="font-bold text-bone-100">{cake.name}</p>
                    <p className="mt-1 text-xs text-bone-500">
                      {cake.description} 价格：{price} 金币
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button variant="primary" disabled={!canAfford} onClick={() => buyOsmanthusCake()}>
                      购买
                    </Button>
                    {!canAfford && <span className="text-xs text-red-300">金币不足</span>}
                  </div>
                </div>
              </section>
            )
          })()}

          {/* TM-P0-017：附近威胁 —— 仅当前地点配置了敌人时显示（青石村等无敌人地点整个区域隐藏） */}
          {(() => {
            const configuredEnemies = location?.enemyIds ?? []
            if (configuredEnemies.length === 0) return null
            // TM-P1-010/P1-014：先计算「实际可见」敌人（魔化狼仅任务 in_progress 可见；嘟嘟兔持有《兔子的路径》后清场不可见），
            // 可见敌人为空时整个「附近威胁」区域不渲染（避免兔王巢穴嘟嘟兔清场后残留空面板）
            // TM-P2-001 D4：黑鬃魔狼仅任务 in_progress + 已调查痕迹 + 未击败时可见
            const visibleEnemies = configuredEnemies
              .map((enemyId) => getEnemy(enemyId))
              .filter((threat): threat is NonNullable<typeof threat> => {
                if (!threat) return false
                if (threat.id === 'corrupted_wolf') {
                  const wolfQuest = gameState.quests.find((q) => q.questId === 'quest_grassland_wolf')
                  if (wolfQuest?.status !== 'in_progress') return false
                }
                if (threat.id === 'dudu_rabbit') {
                  const hasPath = gameState.inventory.some((e) => e.itemId === 'rabbit_path')
                  if (hasPath) return false
                }
                // TM-P1-025：骷髅士兵可见性窄条件——当前位置黑石塔一层 + 第五主线 in_progress/stage 0 + wangcai_briefed===true + black_stone_tower_unlocked===true + floor1_soldier_defeated 非 true（已击败/异常非 boolean 一律不显示）
                if (threat.id === 'skeleton_soldier') {
                  const defeated = wangcaiQuest?.flags.floor1_soldier_defeated
                  const defeatedOk = defeated !== true && (typeof defeated === 'undefined' || typeof defeated === 'boolean')
                  if (!towerQuestInProgress || !wangcaiBriefed || !towerUnlocked || !defeatedOk) return false
                }
                // TM-P1-026：骷髅队长可见性窄条件——士兵已击败（floor1_soldier_defeated===true）+ floor1_captain_defeated 非 true（undefined/false 才显示；异常非 boolean 不显示）
                if (threat.id === 'skeleton_captain') {
                  const captainFlag = wangcaiQuest?.flags.floor1_captain_defeated
                  const captainOk = captainFlag !== true && (typeof captainFlag === 'undefined' || typeof captainFlag === 'boolean')
                  if (!towerQuestInProgress || !wangcaiBriefed || !towerUnlocked || floor1SoldierDefeated !== true || !captainOk) return false
                }
                // TM-P1-027：二层僵尸可见性窄条件（严格 boolean）——二层 + 任务 in_progress/stage 0 + briefed===true + unlocked===true + floor2_unlocked===true + soldier===true + captain===true + floor2_zombie_defeated 非 true
                if (threat.id === 'tower_zombie') {
                  const zombieFlag = wangcaiQuest?.flags.floor2_zombie_defeated
                  const zombieOk = zombieFlag !== true && (typeof zombieFlag === 'undefined' || typeof zombieFlag === 'boolean')
                  if (
                    !towerQuestInProgress ||
                    !wangcaiBriefed ||
                    !towerUnlocked ||
                    !towerFloor2Unlocked ||
                    floor1SoldierDefeated !== true ||
                    floor1CaptainDefeated !== true ||
                    !zombieOk
                  ) {
                    return false
                  }
                }
                // TM-P1-027：二层黑法师可见性窄条件（严格 boolean）——额外要求 floor2_zombie_defeated===true（僵尸未击败不显示黑法师）+ floor2_black_mage_defeated 非 true
                if (threat.id === 'black_mage') {
                  const mageFlag = wangcaiQuest?.flags.floor2_black_mage_defeated
                  const mageOk = mageFlag !== true && (typeof mageFlag === 'undefined' || typeof mageFlag === 'boolean')
                  if (
                    !towerQuestInProgress ||
                    !wangcaiBriefed ||
                    !towerUnlocked ||
                    !towerFloor2Unlocked ||
                    floor1SoldierDefeated !== true ||
                    floor1CaptainDefeated !== true ||
                    floor2ZombieDefeated !== true ||
                    !mageOk
                  ) {
                    return false
                  }
                }
                // TM-P1-028：二层骷髅战士可见性窄条件（严格 boolean）——额外要求 floor2_zombie_defeated===true 且 floor2_black_mage_defeated===true（入口区两敌未全部击败不显示骷髅战士）+ floor2_skeleton_warrior_defeated 非 true
                if (threat.id === 'skeleton_warrior') {
                  const warriorFlag = wangcaiQuest?.flags.floor2_skeleton_warrior_defeated
                  const warriorOk = warriorFlag !== true && (typeof warriorFlag === 'undefined' || typeof warriorFlag === 'boolean')
                  if (
                    !towerQuestInProgress ||
                    !wangcaiBriefed ||
                    !towerUnlocked ||
                    !towerFloor2Unlocked ||
                    floor1SoldierDefeated !== true ||
                    floor1CaptainDefeated !== true ||
                    floor2ZombieDefeated !== true ||
                    floor2BlackMageDefeated !== true ||
                    !warriorOk
                  ) {
                    return false
                  }
                }
                // TM-P1-029：三层骷髅女妖可见性窄条件（严格 boolean）——必须在三层 + 全部前序严格 true + floor3_skeleton_witch_defeated 非 true
                if (threat.id === 'skeleton_witch') {
                  const witchFlag = wangcaiQuest?.flags.floor3_skeleton_witch_defeated
                  const witchOk = witchFlag !== true && (typeof witchFlag === 'undefined' || typeof witchFlag === 'boolean')
                  if (
                    !towerQuestInProgress ||
                    !wangcaiBriefed ||
                    !towerUnlocked ||
                    !towerFloor2Unlocked ||
                    !towerFloor3Unlocked ||
                    floor1SoldierDefeated !== true ||
                    floor1CaptainDefeated !== true ||
                    floor2ZombieDefeated !== true ||
                    floor2BlackMageDefeated !== true ||
                    floor2SkeletonWarriorDefeated !== true ||
                    !witchOk
                  ) {
                    return false
                  }
                }
                // TM-P2-001 D4：黑鬃魔狼可见性窄条件（严格 boolean）——北门 + 北门任务 in_progress/stage 0 + trail_checked===true + wolf_defeated 非 true（未调查/已击败/异常非 boolean 一律不显示）
                if (threat.id === 'black_mane_wolf') {
                  if (!northGateWolfVisible) return false
                }
                // TM-P2-004 第 40 节：残灾之影可见性——仅 guest 状态 + 神域 + 未击败（sakura.ts 规则一致）
                if (threat.id === 'sakura_calamity_fragment') {
                  if (world.flags.sakura_guest !== true) return false
                  if (world.flags.sakura_calamity_defeated === true) return false
                  if (world.currentLocationId !== 'sakura_domain_fragment') return false
                }
                return true
              })
            if (visibleEnemies.length === 0) return null
            return (
              <section className="order-4 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近威胁</h3>
                <div className="flex flex-col gap-3">
                  {visibleEnemies.map((threat) => {
                    const cannotFight = player.hp <= 0
                    return (
                      <div key={threat.id} className="rounded border border-ink-600 bg-ink-900/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-bold text-bone-100">
                              {threat.name} <span className="text-xs font-normal text-bone-500">· Lv.{threat.level}</span>
                            </p>
                            <p className="mt-1 text-xs text-bone-500">
                              HP {threat.maxHp} · 护甲 {threat.armor}
                            </p>
                          </div>
                          <Button variant="primary" disabled={cannotFight} onClick={() => onEngage(threat.id)}>
                            迎战
                          </Button>
                        </div>
                        {cannotFight && <p className="mt-2 text-xs text-red-300">当前状态无法战斗</p>}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {/* TM-P0-016：废弃矿洞调查 —— 仅废弃矿洞显示；DC 来自 CHECK_DC.moderate，不复制常量 */}
          {world.currentLocationId === 'abandoned_mine' && (
            <section className="order-4 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
              <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">调查矿洞</h3>
              {(() => {
                const done = world.flags.abandoned_mine_investigation
                return (
                  <>
                    {lastMineInvestigation && (
                      <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/60 p-3">
                        <p className="text-bone-300">
                          D20 {lastMineInvestigation.roll} + 心智修正 {lastMineInvestigation.attributeModifier} ={' '}
                          {lastMineInvestigation.total}
                        </p>
                        <p className="text-bone-500">DC {lastMineInvestigation.dc}</p>
                        <p className="font-bold text-gold-300">结果：{CHECK_OUTCOME_LABELS[lastMineInvestigation.outcome]}</p>
                      </div>
                    )}
                    {done === 'success' && (
                      <>
                        <p className="mb-2 text-bone-300">你在洞口附近发现了被利爪抓乱的泥痕，痕迹延伸向矿洞深处。</p>
                        <p className="text-xs text-bone-500">调查已完成</p>
                      </>
                    )}
                    {done === 'failure' && (
                      <>
                        <p className="mb-2 text-bone-300">昏暗与杂乱遮掩了细节，你没能判断这些痕迹的来源。</p>
                        <p className="text-xs text-bone-500">调查已完成</p>
                      </>
                    )}
                    {done === undefined && (
                      <>
                        <p className="mb-2 text-bone-300">矿洞入口一带残留着杂乱痕迹，也许能从中看出些什么。</p>
                        <p className="mb-3 text-xs text-bone-500">
                          心智检定 · DC {CHECK_DC.moderate}（当前心智 {player.attributes.mnd}）
                        </p>
                        <Button variant="primary" onClick={handleInvestigateMine}>
                          仔细调查
                        </Button>
                      </>
                    )}
                  </>
                )
              })()}
            </section>
          )}

          {/* 附近委托（接任务入口；中栏底部） */}
          <section className="order-5 rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
            <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近委托</h3>
            {localQuests.length === 0 ? (
              <p className="text-bone-500">这里暂时没有可接的委托。</p>
            ) : (
              localQuests.map((quest) => {
                const qs = gameState.quests.find((q) => q.questId === quest.id)
                const status = qs?.status ?? 'undiscovered'
                const giver = getNpc(quest.giverNpcId)
                if (status === 'undiscovered') {
                  return (
                    <div key={quest.id} className="flex items-center justify-between gap-4">
                      <p>{giver?.name ?? quest.giverNpcId}似乎有事相托。</p>
                      <Button variant="ghost" onClick={() => discoverQuest(quest.id)}>
                        查看委托
                      </Button>
                    </div>
                  )
                }
                if (status === 'available') {
                  return (
                    <div key={quest.id}>
                      <p className="font-bold text-bone-100">{quest.title}</p>
                      <p className="mt-1 leading-relaxed">{quest.summary}</p>
                      <p className="mt-1 text-xs text-bone-500">发布者：{giver?.name ?? quest.giverNpcId}</p>
                      <div className="mt-2">
                        <Button variant="primary" onClick={() => acceptQuest(quest.id)}>
                          接受任务
                        </Button>
                      </div>
                    </div>
                  )
                }
                return null // 已接/已完成：委托入口不重复显示
              })
            )}
          </section>
        </section>

        {/* ============ 右栏：当前目标 / 新线索 / 任务日志 / 冒险日志 ============ */}
        <section
          data-testid="quest-column"
          className="order-2 flex flex-col gap-6 md:col-start-2 md:row-start-1 xl:col-start-3 xl:row-start-1"
        >
          {/* 当前目标（主线/支线摘要；手机第 2 位） */}
          {(() => {
            if (objective) {
              return (
                <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">当前目标</h3>
                  <p className="font-bold text-bone-100">《{objective.title}》</p>
                  <p className="mt-2 text-bone-200">{objective.objective}</p>
                  {objective.locationHint && <p className="mt-1 text-xs text-bone-500">地点提示：{objective.locationHint}</p>}
                </section>
              )
            }
            const activeQuests = gameState.quests.filter(
              (q) => q.status === 'in_progress' || q.status === 'completable',
            )
            if (activeQuests.length === 0) return null
            return (
              <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">当前目标</h3>
                <div className="flex flex-col gap-2">
                  {activeQuests.map((qs) => {
                    const def = getQuest(qs.questId)
                    const statusLabel = qs.status === 'completable' ? '可完成' : '进行中'
                    return (
                      <div key={qs.questId} className="rounded border border-ink-600 bg-ink-900/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-bold text-bone-100">{def?.title ?? '未知任务'}</p>
                          <span className="shrink-0 text-xs text-gold-300">{statusLabel}</span>
                        </div>
                        {/* TM-P2-001 D5：北门任务关键目标行 */}
                        {qs.questId === 'quest_north_gate_missing_patrol' && qs.status === 'completable' && (
                          <p className="mt-1 text-xs text-bone-400">返回武馆，将发现告诉马科。</p>
                        )}
                        {qs.questId === 'quest_north_gate_missing_patrol' &&
                          qs.status === 'in_progress' &&
                          !northGateTrailChecked && (
                            <p className="mt-1 text-xs text-bone-400">前往天龙城北门，寻找巡逻队留下的踪迹。</p>
                          )}
                        {qs.questId === 'quest_north_gate_missing_patrol' &&
                          qs.status === 'in_progress' &&
                          northGateTrailChecked &&
                          !northGateWolfDefeated && (
                            <p className="mt-1 text-xs text-bone-400">调查北门外的异常痕迹。</p>
                          )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {/* TM-P0-019：新的线索 —— 仅当背包实际拥有 rabbit_path（quantity>=1）且注册表定义存在时显示；名称/描述全部读 getItem，不复制静态文案 */}
          {(() => {
            const pathDef = getItem('rabbit_path')
            const hasPath =
              pathDef !== undefined && gameState.inventory.some((e) => e.itemId === 'rabbit_path' && e.quantity >= 1)
            if (!hasPath) return null
            // TM-P1-013：已查看状态以 Store 为唯一真实状态来源（不增加 UI local flag）
            const examined = world.flags.rabbit_path_examined === true
            return (
              <section className="rounded border border-gold-500/40 bg-gold-500/5 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">新的线索</h3>
                <p className="font-bold text-bone-100">{pathDef.name}</p>
                <p className="mt-1 leading-relaxed text-bone-300">{pathDef.description}</p>
                {examined ? (
                  <>
                    {/* TM-P1-013：已查看固定文案（【待补充】为占位，未虚构地点） */}
                    <p className="mt-3 border-t border-gold-500/20 pt-3 text-bone-200">
                      地图上的路线最终指向黄金兔子王所在之地。
                    </p>
                    <p className="mt-1 text-bone-300">地图上的标记仍无法对应到任何已知地点。</p>
                  </>
                ) : (
                  <div className="mt-3">
                    {/* TM-P1-013：未查看时显示展开地图（inspectRabbitPath 返回 true 后 Store 状态驱动切换） */}
                    <Button variant="primary" onClick={() => inspectRabbitPath()}>
                      展开地图
                    </Button>
                  </div>
                )}
              </section>
            )
          })()}

          {/* TM-P2-004 第 74/85 节：红颜录 + 同行伙伴面板（已相识未缔约 → 红颜录存在；缔约后两边都在；与中栏场景面板分离） */}
          <RelationshipPanel />
          <CompanionPanel />

          {/* 冒险日志（含任务卡与完成剧情；手机第 6 位附近） */}
          <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
            <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">冒险日志</h3>
            {gameState.quests.length === 0 ? (
              <p className="text-bone-500">日志为空。</p>
            ) : (
              <div className="flex flex-col gap-3">
                {gameState.quests.map((qs) => {
                  const def = getQuest(qs.questId)
                  const giver = def ? getNpc(def.giverNpcId) : undefined
                  const canSubmit = qs.status === 'completable' && giver?.locationId === world.currentLocationId
                  return (
                    <div key={qs.questId} className="rounded border border-ink-600 bg-ink-900/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-bold text-bone-100">{def?.title ?? '未知任务'}</p>
                        <span className="shrink-0 text-xs text-gold-300">{QUEST_STATUS_LABELS[qs.status]}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-bone-500">
                        {def?.summary ?? `${qs.questId}（缺失任务定义）`}
                      </p>
                      {/* TM-P0-018：任务固定金币奖励（读 QuestDefinition.goldReward，不复制常量） */}
                      {def?.goldReward !== undefined && (
                        <p className="mt-1 text-xs text-gold-300">奖励：{def.goldReward} 金币</p>
                      )}
                      {/* TM-P1-018：第四任务调查进度——严格从 QuestState.flags 读取；2/2 时额外显示调查结果固定文案（本卡结尾，不虚构下一地点） */}
                      {qs.questId === 'quest_golden_rabbit_search' && qs.status === 'in_progress' && (
                        <p className="mt-1 text-xs text-bone-400">
                          地图线索调查：{goldenInvestigationCount} / 2
                        </p>
                      )}
                      {qs.questId === 'quest_golden_rabbit_search' && goldenInvestigationCount === 2 && (
                        <div className="mt-2 rounded border border-gold-500/40 bg-ink-900/40 p-2 text-xs leading-relaxed text-bone-200">
                          <p>你已经向铁匠和药师打听过，但仍无法确认地图指向的具体地点。</p>
                          <p className="mt-1 text-bone-300">地图上的标记仍无法对应到任何已知地点。</p>
                        </div>
                      )}
                      {/* TM-P1-019：复命后阶段提示——保留 2/2 调查结果，额外显示已汇报（不覆盖历史进度） */}
                      {qs.questId === 'quest_golden_rabbit_search' && goldenVillageInquiryReported && (
                        <p className="mt-1 text-xs text-gold-300">村内调查已汇报。</p>
                      )}
                      {/* TM-P1-020：已复命未复查时显示行动目标；复查后目标消失并显示复查完成（不新增 lore） */}
                      {qs.questId === 'quest_golden_rabbit_search' && goldenVillageInquiryReported && !goldenLairRechecked && (
                        <p className="mt-1 text-xs text-bone-400">当前目标：返回兔王巢穴重新比对地图。</p>
                      )}
                      {qs.questId === 'quest_golden_rabbit_search' && goldenLairRechecked && (
                        <p className="mt-1 text-xs text-gold-300">巢穴复查完成。</p>
                      )}
                      {/* TM-P1-021：支线《采药受阻》进度提示——接受后显示目标；调查成功后显示已查看+新目标（调查后任务即 completable，任务卡下方出现提交任务按钮走 generic 奖励） */}
                      {qs.questId === 'quest_apothecary_herb_route' && qs.status === 'in_progress' && (
                        <p className="mt-1 text-xs text-bone-400">当前目标：前往村外草原查看采药区域。</p>
                      )}
                      {qs.questId === 'quest_apothecary_herb_route' && herbGrasslandChecked && qs.status === 'completable' && (
                        <div className="mt-1 text-xs text-bone-400">
                          <p className="text-gold-300">采药区域已查看。</p>
                          <p className="mt-1">当前目标：返回青石村向药师复命。</p>
                        </div>
                      )}
                      {/* TM-P1-022：支线《矿洞余患》进度提示——接受后显示目标；魔化鼠胜利推进 completable 后显示已确认+新目标（无专属 flag，Quest status 表达状态） */}
                      {qs.questId === 'quest_blacksmith_mine_remnant' && qs.status === 'in_progress' && (
                        <p className="mt-1 text-xs text-bone-400">当前目标：前往废弃矿洞处理残余的魔化鼠。</p>
                      )}
                      {qs.questId === 'quest_blacksmith_mine_remnant' && qs.status === 'completable' && (
                        <div className="mt-1 text-xs text-bone-400">
                          <p className="text-gold-300">矿洞余患已确认。</p>
                          <p className="mt-1">当前目标：返回青石村向铁匠复命。</p>
                        </div>
                      )}
                      {/* TM-P1-024/P1-025/P1-026：第五主线《商人王财的麻烦》进度提示——五态（未询问/已询问未解锁/已解锁未清士兵/士兵清场未清队长/队长清场；黑石塔：【待开放】与黑石塔二层：【待开放】为实现状态，非 lore）；TM-P1-030 起在 completable（交还项链后）也显示日志「已交还/回武馆复命」，completed 不显示（由完成剧情块接管） */}
                      {qs.questId === 'quest_wangcai_trouble' && (qs.status === 'in_progress' || qs.status === 'completable') && (
                        <div className="mt-1 text-xs text-bone-400">
                          {!wangcaiBriefed ? (
                            <p>当前目标：返回天龙城，找到商人王财了解情况。</p>
                          ) : !towerUnlocked ? (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1">当前目标：调查黑石塔附近的情况。</p>
                              <p className="mt-1">黑石塔的调查尚未开始。</p>
                            </>
                          ) : !floor1SoldierDefeated ? (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1 text-gold-300">黑石塔路线已确认。</p>
                              <p className="mt-1">当前目标：前往黑石塔一层调查。</p>
                            </>
                          ) : !floor1CaptainDefeated ? (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1 text-gold-300">黑石塔路线已确认。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：已击败骷髅士兵。</p>
                              <p className="mt-1">当前目标：击败骷髅队长。</p>
                            </>
                          ) : !floor2ZombieDefeated || !floor2BlackMageDefeated ? (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1 text-gold-300">黑石塔路线已确认。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：已击败骷髅士兵。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：骷髅队长已击败，未发现夔峒项链。</p>
                              <p className="mt-1">当前目标：继续深入黑石塔。</p>
                              <p className="mt-1">黑石塔上层尚未开启。</p>
                            </>
                          ) : !floor2SkeletonWarriorDefeated ? (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1 text-gold-300">黑石塔路线已确认。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：已击败骷髅士兵。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：骷髅队长已击败，未发现夔峒项链。</p>
                              <p className="mt-1 text-gold-300">黑石塔二层：入口区域已清理。</p>
                              <p className="mt-1">当前目标：击败骷髅战士。</p>
                            </>
                          ) : !floor3SkeletonWitchDefeated ? (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1 text-gold-300">黑石塔路线已确认。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：已击败骷髅士兵。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：骷髅队长已击败，未发现夔峒项链。</p>
                              <p className="mt-1 text-gold-300">黑石塔二层：入口区域已清理。</p>
                              <p className="mt-1 text-gold-300">黑石塔二层深处：骷髅战士已击败，仍未发现夔峒项链。</p>
                              <p className="mt-1">当前目标：击败骷髅女妖。</p>
                            </>
                          ) : kuidongNecklaceReturned ? (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1 text-gold-300">黑石塔路线已确认。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：已击败骷髅士兵。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：骷髅队长已击败，未发现夔峒项链。</p>
                              <p className="mt-1 text-gold-300">黑石塔二层：入口区域已清理。</p>
                              <p className="mt-1 text-gold-300">黑石塔二层深处：骷髅战士已击败，仍未发现夔峒项链。</p>
                              <p className="mt-1 text-gold-300">黑石塔三层：骷髅女妖已击败。</p>
                              <p className="mt-1 text-gold-300">黑石塔三层：已找到夔峒项链。</p>
                              <p className="mt-1 text-gold-300">夔峒项链：已交还王财。</p>
                              <p className="mt-1">当前目标：返回武馆，向马科复命。</p>
                            </>
                          ) : (
                            <>
                              <p className="text-gold-300">已向王财了解情况。</p>
                              <p className="mt-1 text-gold-300">黑石塔路线已确认。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：已击败骷髅士兵。</p>
                              <p className="mt-1 text-gold-300">黑石塔一层：骷髅队长已击败，未发现夔峒项链。</p>
                              <p className="mt-1 text-gold-300">黑石塔二层：入口区域已清理。</p>
                              <p className="mt-1 text-gold-300">黑石塔二层深处：骷髅战士已击败，仍未发现夔峒项链。</p>
                              <p className="mt-1 text-gold-300">黑石塔三层：骷髅女妖已击败。</p>
                              <p className="mt-1 text-gold-300">黑石塔三层：已找到夔峒项链。</p>
                              <p className="mt-1">当前目标：返回天龙城，将夔峒项链交还王财。</p>
                            </>
                          )}
                        </div>
                      )}
                      {/* TM-P1-030：王财任务完成（向马科复命成功后）——马科短剧情 + 第一阶段完成提示；黄金兔子长期线不 completed/failed、不改 flag/stage/兔子的路径（冻结保留） */}
                      {qs.questId === 'quest_wangcai_trouble' && qs.status === 'completed' && (
                        <div className="mt-2 rounded border border-gold-500/40 bg-ink-900/40 p-2 text-xs leading-relaxed text-bone-200">
                          <p>马科听完黑石塔里的经过，神情明显严肃起来。</p>
                          <p className="mt-1">“看来最近的魔物异动并不是偶然。”</p>
                          <p className="mt-1">“这件事我会向上面汇报。你先休息一下。”</p>
                          <p className="mt-1 text-bone-300">黑石塔的调查暂时告一段落。</p>
                          <div className="mt-2 rounded border border-gold-500/40 bg-ink-900/40 p-2">
                            <p className="text-gold-300">第一阶段完成</p>
                            {/* TM-P2-002：稳定文案，不随后续阶段内容过期 */}
                            <p className="mt-1">第一阶段主线已经告一段落。</p>
                            <p>《追寻黄金兔子王》仍需等待新的线索。</p>
                          </div>
                        </div>
                      )}
                      {/* TM-P2-001 D2：北门任务进度提示（in_progress：未调查/已调查；completable：已击败狼，回武馆复命） */}
                      {qs.questId === 'quest_north_gate_missing_patrol' && qs.status === 'in_progress' && (
                        <div className="mt-1 text-xs text-bone-400">
                          {!northGateTrailChecked ? (
                            <>
                              <p>当前目标：前往天龙城北门，寻找巡逻队留下的踪迹。</p>
                              <p className="mt-1 text-bone-300">巡逻队离开前最后的路线是经过北门。</p>
                            </>
                          ) : (
                            <>
                              <p className="text-gold-300">北门外的痕迹已发现。</p>
                              <p className="mt-1">当前目标：调查北门外的异常痕迹。</p>
                            </>
                          )}
                        </div>
                      )}
                      {qs.questId === 'quest_north_gate_missing_patrol' && qs.status === 'completable' && (
                        <div className="mt-1 text-xs text-bone-400">
                          <p className="text-gold-300">黑鬃魔狼已击败，找到了断裂的铜牌。</p>
                          <p className="mt-1">当前目标：返回武馆，将发现告诉马科。</p>
                        </div>
                      )}
                      {/* TM-P2-001 D6：北门任务完成（向马科提交成功后）——马科固定剧情；Phase 2 只是第一段开场，不解决失踪小队 */}
                      {qs.questId === 'quest_north_gate_missing_patrol' && qs.status === 'completed' && (
                        <div className="mt-2 rounded border border-gold-500/40 bg-ink-900/40 p-2 text-xs leading-relaxed text-bone-200">
                          <p>马科接过断裂的铜牌，脸色沉了下来。</p>
                          <p className="mt-1">“这是北门第三巡逻队的东西。”</p>
                          <p className="mt-1">“看来黑石塔之外，北面的情况也不对劲。”</p>
                          <p className="mt-1">“我会先派人封锁消息。下一步，我们得沿着他们留下的路线继续查。”</p>
                          <p className="mt-1 text-gold-300">北门失联 · 已完成</p>
                        </div>
                      )}
                      {canSubmit && (
                        <div className="mt-2">
                          {/* TM-P1-012：提交成功（仅《草原狼影》）触发升级提示 */}
                          <Button variant="primary" onClick={() => handleCompleteQuest(qs.questId)}>
                            提交任务
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </section>
      </div>
    </div>
  )
}
