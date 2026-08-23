import { useState } from 'react'
import Button from '../components/Button'
import SakuraEncounterPanel from '../components/game/SakuraEncounterPanel'
import MountStablePanel from '../components/game/MountStablePanel'
import BackpackPanel from '../components/game/BackpackPanel'
import Drawer from '../components/Drawer'
import Toast from '../components/Toast'
import MobileNav from '../components/MobileNav'
import { useGameStore, VILLAGE_ELDER_POST_QUEST_EVENT_ID } from '../game/state/gameStore'
import { getClue, getEnemy, getEncounter, getItem, getLocation, getNpc, allEncounterMembers, NPCS, QUESTS } from '../game/content'
import { CHECK_DC, type D20CheckResult } from '../game/rules/d20'
import { checkEncounter, singleEnemyIdOf } from '../game/rules/encounter'
import type { EncounterDefinition } from '../game/types/encounter'
import type { Character } from '../game/types/character'
import { formatLuckCheckLog } from '../game/rules/luck'
import { getUsableSkills } from '../game/rules/skill'
import {
  canTriggerSakuraEncounter,
  getSakuraSceneStage,
  isSakuraTriggerLocation,
  canTriggerSakuraBanter,
  isFirstRestTalkReady,
  isSakuraPresent,
} from '../game/rules/sakura'
import type {
  NorthTowerClaimResult,
  NorthTowerLuckResult,
  NorthTowerMndResult,
  NorthTowerSkillResult,
  OldTraderResult,
  SakuraBanterChoice,
  SakuraFirstRestChoice,
  NorthOutskirtsInvestigateResult,
  WaystationBarrierResult,
} from '../game/state/gameStore'
import PlayerSidebar from './game/PlayerSidebar'
import TaskActivitySidebar from './game/TaskActivitySidebar'
import NpcInteractionPanel, { type NearbyQuestInfo, type NpcShopExtras } from './game/NpcInteractionPanel'
import { canExploreMountTrail, canSearchNorthOutskirtsByMount, canSearchWaystationByMount, MOUNT_TRAIL_REWARD_GOLD } from '../game/rules/mount'
import { useCloudSession } from '../cloud/cloudSessionStore'
import Modal from '../components/Modal'
import { getQuest as getQuestDef } from '../game/content'

/** D20 检定结果中文（TM-P0-016） */
const CHECK_OUTCOME_LABELS: Record<D20CheckResult['outcome'], string> = {
  critical_success: '大成功',
  success: '成功',
  failure: '失败',
  critical_failure: '大失败',
}

/** 遭遇成员摘要（TM-P2-007 §17：威胁入口卡片显示成员构成；variants 用「或」分隔；不泄露内部 ID） */
function encounterMembersSummary(def: EncounterDefinition): string {
  if (def.fixedMembers) {
    return def.fixedMembers
      .map((m) => `${getEnemy(m.enemyId)?.name ?? m.enemyId}${m.count > 1 ? `×${m.count}` : ''}`)
      .join('、')
  }
  return (def.variants ?? [])
    .map((v) => v.members.map((m) => `${getEnemy(m.enemyId)?.name ?? m.enemyId}${m.count > 1 ? `×${m.count}` : ''}`).join('+'))
    .join(' 或 ')
}

interface GamePageProps {
  onBackToMenu: () => void
  /** TM-P0-008：进入战斗（App/Store 负责正式入口校验；TM-P2-007 改为 Encounter 入口） */
  onEngage: (encounterId: string) => void
  /** TM-P2-002 G：打开五槽位保存页面 */
  onOpenSaves: () => void
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
  const travelToLocation = useGameStore((s) => s.travelToLocation)
  const completeQuest = useGameStore((s) => s.completeQuest)
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
  const restAtVillage = useGameStore((s) => s.restAtVillage)
  // TM-P2-006：商店收拢至 NPC 交互面板（MerchantPanel 弹层）——保留原 store 动作接线
  const buyHealingPotion = useGameStore((s) => s.buyHealingPotion)
  const buyMerchantItem = useGameStore((s) => s.buyMerchantItem)
  const sellIronOre = useGameStore((s) => s.sellIronOre)
  const buyOsmanthusCake = useGameStore((s) => s.buyOsmanthusCake)
  const respondToVillageElderAfterQuest = useGameStore((s) => s.respondToVillageElderAfterQuest)
  const investigateAbandonedMine = useGameStore((s) => s.investigateAbandonedMine)
  const reportRabbitPathToVillageElder = useGameStore((s) => s.reportRabbitPathToVillageElder)
  const consultGoldenRabbitSearchNpc = useGameStore((s) => s.consultGoldenRabbitSearchNpc)
  const reportGoldenRabbitVillageInvestigation = useGameStore((s) => s.reportGoldenRabbitVillageInvestigation)
  const recheckGoldenRabbitMapAtLair = useGameStore((s) => s.recheckGoldenRabbitMapAtLair)
  const inspectRabbitPath = useGameStore((s) => s.inspectRabbitPath)
  const inspectApothecaryHerbRoute = useGameStore((s) => s.inspectApothecaryHerbRoute)
  const departQingshiVillageToTianlongCity = useGameStore((s) => s.departQingshiVillageToTianlongCity)
  const askWangcaiAboutTrouble = useGameStore((s) => s.askWangcaiAboutTrouble)
  const unlockBlackStoneTowerInvestigation = useGameStore((s) => s.unlockBlackStoneTowerInvestigation)
  const unlockBlackStoneTowerFloor2 = useGameStore((s) => s.unlockBlackStoneTowerFloor2)
  const unlockBlackStoneTowerFloor3 = useGameStore((s) => s.unlockBlackStoneTowerFloor3)
  const returnKuidongNecklaceToWangcai = useGameStore((s) => s.returnKuidongNecklaceToWangcai)
  const restAtTianlongMartialHall = useGameStore((s) => s.restAtTianlongMartialHall)
  // TM-P2-007 §19：坐骑购买/装备/卸下 actions
  const buyMount = useGameStore((s) => s.buyMount)
  const equipMount = useGameStore((s) => s.equipMount)
  const unequipMount = useGameStore((s) => s.unequipMount)
  // TM-P2-007 §21：城郊古驿道 optional 检定 action
  const exploreMountTrail = useGameStore((s) => s.exploreMountTrail)
  const investigateNorthGateTrail = useGameStore((s) => s.investigateNorthGateTrail)
  // TM-P2-008：北郊余波主线（《北郊追踪》Stage A-D）actions
  const discoverQuest = useGameStore((s) => s.discoverQuest)
  const acceptQuest = useGameStore((s) => s.acceptQuest)
  const trackNorthOutskirtsTrail = useGameStore((s) => s.trackNorthOutskirtsTrail)
  const searchNorthOutskirtsAmbush = useGameStore((s) => s.searchNorthOutskirtsAmbush)
  const investigateNorthOutskirtsAmbush = useGameStore((s) => s.investigateNorthOutskirtsAmbush)
  const reportNorthOutskirts = useGameStore((s) => s.reportNorthOutskirts)
  // TM-P2-009：《断旗余声》Stage A-F actions
  const startNorthBrokenBanner = useGameStore((s) => s.startNorthBrokenBanner)
  const searchNorthAbandonedWaystation = useGameStore((s) => s.searchNorthAbandonedWaystation)
  const resolveWaystationBarrier = useGameStore((s) => s.resolveWaystationBarrier)
  const rescueWaystationSurvivor = useGameStore((s) => s.rescueWaystationSurvivor)
  const debriefWaystationSurvivor = useGameStore((s) => s.debriefWaystationSurvivor)
  const reportNorthBrokenBanner = useGameStore((s) => s.reportNorthBrokenBanner)
  // 背包（移动端底部 [背包] Drawer / BackpackPanel 复用）
  const useHealingPotion = useGameStore((s) => s.useHealingPotion)
  // TM-P2-004：Sakura / 伙伴 / 关系 / 休整 actions
  const startSakuraEncounter = useGameStore((s) => s.startSakuraEncounter)
  const sakuraBanter = useGameStore((s) => s.sakuraBanter)
  const sakuraFirstRestTalk = useGameStore((s) => s.sakuraFirstRestTalk)
  const [banterDone, setBanterDone] = useState(false)
  const [banterNote, setBanterNote] = useState<string | null>(null)
  const [firstRestNote, setFirstRestNote] = useState<string | null>(null)
  const [firstRestResult, setFirstRestResult] = useState<SakuraFirstRestChoice | null>(null)
  const [travelError, setTravelError] = useState(false)
  // TM-P0-015：活动对话 NPC（仅 UI 本地状态，不进入 GameState / 存档）
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null)
  // TM-P0-016：本次调查的即时检定结果（仅 UI 本地状态；离开矿洞清空）
  const [lastMineInvestigation, setLastMineInvestigation] = useState<D20CheckResult | null>(null)
  // TM-P1-012：Lv.2 里程碑升级提示（仅 UI 本地状态）
  const [showLevelUpNotice, setShowLevelUpNotice] = useState<{ from: number; to: number; maxHpGain: number; maxMpGain: number } | null>(null)
  /** TM-P1-023：天龙城离村二次确认（UI 本地状态，不写 GameState） */
  const [showTianlongDepartureConfirm, setShowTianlongDepartureConfirm] = useState(false)
  // TM-P2-006：任务完成奖励反馈（金币 / 冒险阅历；仅 UI 本地状态）
  const [questRewardNotice, setQuestRewardNotice] = useState<{ questTitle: string; gold: number; xp: number } | null>(null)
  // TM-P2-007 §19：天龙城马厩面板（仅 UI 本地状态）
  const [mountStableOpen, setMountStableOpen] = useState(false)
  // TM-P2-007 §21：城郊古驿道 optional 检定结果（仅 UI 本地状态；一次性，flag 固化）
  const [lastMountTrail, setLastMountTrail] = useState<D20CheckResult | null>(null)
  // TM-P2-008 §13/§32：轻量提示（获得新线索 / 任务推进；UI ephemeral，不进 GameState）
  const [toast, setToast] = useState<string | null>(null)
  // TM-P2-008 §14：移动端底部 tab 打开的抽屉面板（<768；UI ephemeral）
  const [mobilePanel, setMobilePanel] = useState<'role' | 'adventure' | null>(null)
  // TM-P2-008 §15：768–1279 右栏 → Drawer（「冒险」按钮打开 AdventureSidebar）
  const [adventureDrawerOpen, setAdventureDrawerOpen] = useState(false)
  // TM-P2-008 §14：移动端底部 [背包] tab（BackpackPanel 全屏抽屉）
  const [backpackOpen, setBackpackOpen] = useState(false)
  // TM-P2-008 §20/§22/§50：北郊袭击现场多解调查结果（仅 UI 本地状态）
  const [northInvestigation, setNorthInvestigation] = useState<NorthOutskirtsInvestigateResult | null>(null)
  // TM-P2-009 §13：北郊旧驿站屏障多解结果（仅 UI 本地状态；战斗/MND/LCK 推进，Sakura/Mount 只补线索）
  const [waystationBarrier, setWaystationBarrier] = useState<WaystationBarrierResult | null>(null)
  // 云同步状态（顶部薄系统栏轻量信息）
  const cloudStatus = useCloudSession((s) => s.status)
  const cloudSyncStatus = useCloudSession((s) => s.syncStatus)

  const handleProgression = (before: Character, after: Character) => {
    if (after.level > before.level) {
      setShowLevelUpNotice({ from: before.level, to: after.level, maxHpGain: after.maxHp - before.maxHp, maxMpGain: after.maxMp - before.maxMp })
    }
  }

  /** TM-P2-006 第 44 节：任务提交统一反馈（金币 + 冒险阅历 + 升级提示） */
  const handleCompleteQuest = (questId: string) => {
    const before = useGameStore.getState().gameState?.player
    const completed = completeQuest(questId)
    const after = useGameStore.getState().gameState?.player
    if (completed && before && after) {
      handleProgression(before, after)
      const def = getQuestDef(questId)
      const gold = after.gold - before.gold
      const xp = after.adventureXp - before.adventureXp
      setQuestRewardNotice({ questTitle: def?.title ?? '未知任务', gold, xp })
    }
  }

  /** 附近委托「查看」→ 跳到对应 NPC 交互面板 */
  const handleViewQuest = (questId: string) => {
    const def = getQuestDef(questId)
    const giver = def ? getNpc(def.giverNpcId) : undefined
    if (giver) setActiveNpcId(giver.id)
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
  const goldenSearchQuest = gameState.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const goldenSearchInProgress = goldenSearchQuest?.status === 'in_progress'
  const goldenAskedBlacksmith = goldenSearchQuest?.flags.asked_blacksmith === true
  const goldenAskedApothecary = goldenSearchQuest?.flags.asked_apothecary === true
  const goldenInvestigationCount = (goldenAskedBlacksmith ? 1 : 0) + (goldenAskedApothecary ? 1 : 0)
  const goldenVillageInquiryReported = goldenSearchQuest?.flags.village_inquiry_reported === true
  const goldenLairRechecked = goldenSearchQuest?.flags.rabbit_lair_rechecked === true
  const herbQuest = gameState.quests.find((q) => q.questId === 'quest_apothecary_herb_route')
  const herbInProgress = herbQuest?.status === 'in_progress'
  const herbGrasslandChecked = herbQuest?.flags.grassland_checked === true
  const rabbitPathEntry = gameState.inventory.find((e) => e.itemId === 'rabbit_path')
  const hasValidRabbitPath =
    rabbitPathEntry !== undefined &&
    Number.isSafeInteger(rabbitPathEntry.quantity) &&
    rabbitPathEntry.quantity >= 1
  const rabbitPathReadyForDeparture =
    hasValidRabbitPath && world.flags.rabbit_path_examined === true && world.flags.rabbit_path_reported === true
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
  const wangcaiQuest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
  const wangcaiBriefed = wangcaiQuest?.flags.wangcai_briefed === true
  const towerUnlocked = world.flags.black_stone_tower_unlocked === true
  const towerQuestInProgress = wangcaiQuest?.status === 'in_progress' && wangcaiQuest?.stage === 0
  const floor1SoldierDefeated = wangcaiQuest?.flags.floor1_soldier_defeated === true
  const floor1CaptainDefeated = wangcaiQuest?.flags.floor1_captain_defeated === true
  const towerUnlockFlag = world.flags.black_stone_tower_unlocked
  const towerUnlockPending = towerUnlockFlag === undefined || towerUnlockFlag === false
  const towerFloor2Unlocked = world.flags.black_stone_tower_floor2_unlocked === true
  const towerFloor2UnlockFlag = world.flags.black_stone_tower_floor2_unlocked
  const towerFloor2UnlockPending = towerFloor2UnlockFlag === undefined || towerFloor2UnlockFlag === false
  const floor2ZombieDefeated = wangcaiQuest?.flags.floor2_zombie_defeated === true
  const floor2BlackMageDefeated = wangcaiQuest?.flags.floor2_black_mage_defeated === true
  const floor2SkeletonWarriorDefeated = wangcaiQuest?.flags.floor2_skeleton_warrior_defeated === true
  const towerFloor3Unlocked = world.flags.black_stone_tower_floor3_unlocked === true
  const towerFloor3UnlockFlag = world.flags.black_stone_tower_floor3_unlocked
  const towerFloor3UnlockPending = towerFloor3UnlockFlag === undefined || towerFloor3UnlockFlag === false
  const floor3SkeletonWitchDefeated = wangcaiQuest?.flags.floor3_skeleton_witch_defeated === true
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
  const kuidongNecklaceReturned = wangcaiQuest?.flags.kuidong_necklace_returned === true
  const kuidongNecklaceReturnPending = wangcaiQuest?.flags.kuidong_necklace_returned === undefined || wangcaiQuest?.flags.kuidong_necklace_returned === false
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
  const northGateQuest = gameState.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
  const northGateQuestInProgress = northGateQuest?.status === 'in_progress' && northGateQuest?.stage === 0
  const northGateTrailChecked = northGateQuest?.flags.north_gate_trail_checked === true
  const northGateWolfDefeated = northGateQuest?.flags.north_gate_wolf_defeated === true
  const northGateTrailFlag = northGateQuest?.flags.north_gate_trail_checked
  const northGateTrailPending = northGateTrailFlag === undefined || northGateTrailFlag === false
  const northGateInvestigateVisible =
    world.currentLocationId === 'tianlong_north_gate' && northGateQuestInProgress && northGateTrailPending

  // TM-P2-008：《北郊追踪》任务状态（北门失联 completed 后由马科发布）
  const northOutskirtsQuest = gameState.quests.find((q) => q.questId === 'quest_north_outskirts')
  // TM-P2-009 §10：《断旗余声》任务状态（北郊追踪 completed 后由马科发布）
  const northBrokenBannerQuest = gameState.quests.find((q) => q.questId === 'quest_north_broken_banner')

  // TM-P0-015：附近人物 = 常驻当前地点的注册 NPC（动态过滤；樱花优子不走普通对话系统，从列表排除）
  // TM-P2-009 §12：沈拓（shen_tuo）是纯剧情人物，不走普通对话系统（NpcInteractionPanel），从列表排除
  const localNpcs = Object.values(NPCS).filter(
    (npc) => npc.locationId === world.currentLocationId && npc.id !== 'sakura_yuko' && npc.id !== 'shen_tuo',
  )

  const handleTravel = (targetId: string) => {
    const ok = travelToLocation(targetId)
    if (ok) setActiveNpcId(null)
    if (ok) setLastMineInvestigation(null)
    setTravelError(!ok)
  }

  const handleInvestigateMine = () => {
    const result = investigateAbandonedMine()
    if (result) setLastMineInvestigation(result)
  }

  /** TM-P2-007 §21：城郊古驿道 optional 检定（store action 负责合法性；UI 只展示结果） */
  const handleExploreMountTrail = () => {
    const result = exploreMountTrail()
    if (result) setLastMountTrail(result)
  }

  /** TM-P2-008：接受北郊任务（undiscovered→available→in_progress 全链；store 负责窄前置） */
  const handleAcceptNorthOutskirts = () => {
    const status = northOutskirtsQuest?.status
    if (status === 'undiscovered' || status === undefined) {
      if (!discoverQuest('quest_north_outskirts')) return
    }
    const after = useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_north_outskirts')
    if (after?.status === 'available' && acceptQuest('quest_north_outskirts')) {
      setToast('接受任务：北郊追踪')
    }
  }

  /** TM-P2-008 Stage A：追踪足迹（北门）——guaranteed 线索「拖行痕迹」 */
  const handleTrackNorthOutskirtsTrail = () => {
    if (trackNorthOutskirtsTrail()) setToast('获得新线索：拖行痕迹')
  }

  /** TM-P2-008 Stage B：搜索袭击现场（北郊） */
  const handleSearchNorthOutskirtsAmbush = () => {
    if (searchNorthOutskirtsAmbush()) setToast('你找到了北郊的袭击现场')
  }

  /** TM-P2-008 Stage C：多解调查（MND / LCK / Sakura / Mount）——结果 UI ephemeral，展示在行动块内 */
  const handleNorthOutskirtsInvestigate = (method: 'mnd' | 'lck' | 'sakura' | 'mount') => {
    const result = investigateNorthOutskirtsAmbush(method)
    if (!result || !result.ok) return
    setNorthInvestigation(result)
    if (result.clueAdded) {
      setToast(`获得新线索：${getClue(result.clueAdded)?.title ?? '未知线索'}`)
    } else if ((result.method === 'mnd' || result.method === 'lck') && result.progressed) {
      setToast('你查明了北郊袭击现场的真相')
    }
  }

  /** TM-P2-008 Stage D：回报发现（武馆/北门） */
  const handleReportNorthOutskirts = () => {
    if (reportNorthOutskirts()) setToast('任务更新：北郊追踪')
  }

  /** TM-P2-009 §10：接受《断旗余声》（undiscovered→available→in_progress 全链；store 负责窄前置——要求北郊追踪 completed） */
  const handleAcceptNorthBrokenBanner = () => {
    const status = northBrokenBannerQuest?.status
    if (status === 'undiscovered' || status === undefined) {
      if (!discoverQuest('quest_north_broken_banner')) return
    }
    const after = useGameStore.getState().gameState?.quests.find((q) => q.questId === 'quest_north_broken_banner')
    if (after?.status === 'available' && acceptQuest('quest_north_broken_banner')) {
      setToast('接受任务：断旗余声')
    }
  }

  /** TM-P2-009 Stage A：听取马科简报（武馆）——写 make_briefed + 解锁旧驿站 */
  const handleStartNorthBrokenBannerBriefing = () => {
    if (startNorthBrokenBanner()) setToast('任务更新：前往北郊旧驿站')
  }

  /** TM-P2-009 Stage B：搜索旧驿站（写 searched + 线索「断裂队旗」） */
  const handleSearchWaystation = () => {
    if (searchNorthAbandonedWaystation()) setToast('获得新线索：断裂队旗')
  }

  /** TM-P2-009 Stage C：多解解屏障（战斗 / MND / LCK / Sakura / Mount）——结果 UI ephemeral，展示在行动块内 */
  const handleResolveWaystationBarrier = (method: 'combat' | 'mnd' | 'lck' | 'sakura' | 'mount') => {
    const result = resolveWaystationBarrier(method)
    if (!result || !result.ok) return
    setWaystationBarrier(result)
    // TM-P2-009-R1 §2.1：Sakura/Mount 成功 = 威胁被绕开/引走 → 反馈文案「找到安全路线」「骑马引开狼群后从另一侧进入」
    if (result.method === 'sakura') {
      setToast('樱花优子找到了绕过狼群的安全路线')
    } else if (result.method === 'mount') {
      setToast('你骑马引开狼群后从另一侧进入了后院')
    } else if (result.clueAdded) {
      setToast(`获得新线索：${getClue(result.clueAdded)?.title ?? '未知线索'}`)
    } else if ((result.method === 'mnd' || result.method === 'lck') && result.progressed) {
      setToast('你解开了驿站的屏障')
    }
  }

  /** TM-P2-009 Stage D：搜救幸存者（写 rescued + 事件 north_survivor_rescued + 线索「黑篷车辙」） */
  const handleRescueSurvivor = () => {
    if (rescueWaystationSurvivor()) setToast('你救出了一名幸存的巡逻骑士')
  }

  /** TM-P2-009 Stage E：向沈拓了解详情（写 debriefed + 线索「魔化诱饵」） */
  const handleDebriefSurvivor = () => {
    if (debriefWaystationSurvivor()) setToast('获得新线索：魔化诱饵')
  }

  /** TM-P2-009 Stage F：回报马科（写 reported + status→completable） */
  const handleReportNorthBrokenBanner = () => {
    if (reportNorthBrokenBanner()) setToast('任务更新：断旗余声')
  }

  const activeNpc = activeNpcId ? getNpc(activeNpcId) : undefined
  const showDialog = activeNpc !== undefined && activeNpc.locationId === world.currentLocationId

  /** TM-P2-006：NPC 散装商品/服务（铁匠收购、药师药水）——经 NpcInteractionPanel → MerchantPanel 展示 */
  const shopExtras: NpcShopExtras = (() => {
    const items: NpcShopExtras['items'] = []
    const services: NpcShopExtras['services'] = []
    if (activeNpc?.id === 'apothecary') {
      const potion = getItem('healing_potion')
      if (potion) items.push({ itemId: 'healing_potion', price: potion.value, buy: buyHealingPotion })
    }
    if (activeNpc?.id === 'blacksmith') {
      const ore = getItem('iron_ore')
      const held = ore ? (gameState.inventory.find((e) => e.itemId === 'iron_ore')?.quantity ?? 0) : 0
      const canSell = held >= 1
      services.push({
        label: '铁矿石收购',
        note: ore ? `${ore.description} 收购价：${ore.value} 金币 ｜ 持有：${held}` : '收购铁矿石',
        buttonLabel: '出售 1 个',
        disabled: !canSell,
        disabledReason: canSell ? undefined : '没有可出售的铁矿石',
        onAction: sellIronOre,
      })
    }
    return { items, services }
  })()

  const elderReaction: 'respect' | 'trust' | null = (() => {
    if (activeNpc?.id !== 'village_elder') return null
    if (!world.completedEvents.includes(VILLAGE_ELDER_POST_QUEST_EVENT_ID)) return null
    const elderState = world.npcStates.village_elder
    if (!elderState) return null
    const respect = elderState.relationship.respect
    const trust = elderState.relationship.trust
    if (!Number.isFinite(respect) || !Number.isFinite(trust)) return null
    if (respect >= 1) return 'respect'
    if (trust >= 2) return 'trust'
    return null
  })()

  const travelTargets =
    location?.connections
      .map((targetId) => ({ targetId, target: getLocation(targetId) }))
      .filter((entry): entry is { targetId: string; target: NonNullable<ReturnType<typeof getLocation>> } => entry.target !== undefined) ?? []

  // 该 NPC 当前地点的相关委托（供 NpcInteractionPanel 展示）
  const nearbyQuestsForNpc = (() => {
    if (!activeNpc) return []
    const list: NearbyQuestInfo[] = []
    for (const quest of Object.values(QUESTS)) {
      if (quest.giverNpcId !== activeNpc.id) continue
      const qs = gameState.quests.find((q) => q.questId === quest.id)
      if (qs?.status === 'in_progress' || qs?.status === 'completable' || qs?.status === 'completed') continue
      if (quest.id === 'quest_sakura_boundary') continue
      // 与 Store discoverQuest 一致的 UI 侧窄前置
      if (quest.id === 'quest_mine_cleanup' && !gameState.quests.some((q) => q.questId === 'quest_village_monsters' && q.status === 'completed')) continue
      if (quest.id === 'quest_grassland_wolf' && !gameState.quests.some((q) => q.questId === 'quest_mine_cleanup' && q.status === 'completed')) continue
      if (quest.id === 'quest_golden_rabbit_search' && world.flags.rabbit_path_reported !== true) continue
      if (quest.id === 'quest_apothecary_herb_route' && !gameState.quests.some((q) => q.questId === 'quest_village_monsters' && q.status === 'completed')) continue
      if (quest.id === 'quest_blacksmith_mine_remnant' && !gameState.quests.some((q) => q.questId === 'quest_mine_cleanup' && q.status === 'completed')) continue
      if (quest.id === 'quest_north_gate_missing_patrol' && !gameState.quests.some((q) => q.questId === 'quest_wangcai_trouble' && q.status === 'completed')) continue
      // TM-P2-008 §16：北郊追踪（与 Store discoverQuest 窄前置一致——要求北门失联 completed）
      if (quest.id === 'quest_north_outskirts' && !gameState.quests.some((q) => q.questId === 'quest_north_gate_missing_patrol' && q.status === 'completed')) continue
      // TM-P2-009 §10：《断旗余声》（与 Store discoverQuest 窄前置一致——要求北郊追踪 completed）
      if (quest.id === 'quest_north_broken_banner' && !gameState.quests.some((q) => q.questId === 'quest_north_outskirts' && q.status === 'completed')) continue
      list.push({ questId: quest.id, title: quest.title, status: qs?.status === 'available' ? 'available' : 'undiscovered' })
    }
    return list
  })()

  return (
    <div className="game-page mx-auto flex h-full w-full max-w-[1600px] flex-col px-4 pt-3 pb-16 md:pb-3">
      {/* 顶部薄系统栏（TM-P2-006：删除大 Logo/地点块） */}
      <header className="mb-3 flex items-center justify-between gap-3 border-b border-ink-600 pb-2">
        <p className="text-xs tracking-widest text-bone-500">
          天梦大陆
          {cloudStatus === 'connected' && <span className="ml-3 text-bone-500">云：{cloudSyncStatus === 'conflict' ? '有冲突' : cloudSyncStatus === 'syncing' ? '同步中' : cloudSyncStatus === 'offline' ? '仅本机' : '已同步'}</span>}
          {cloudStatus === 'not_configured' && <span className="ml-3 text-bone-500">云：仅本机</span>}
        </p>
        <div className="flex items-center gap-2">
          {/* TM-P2-008 §15：768–1279 右栏由「冒险」按钮打开 Drawer（≥1280 右栏常驻，隐藏按钮） */}
          <Button
            variant="ghost"
            className="hidden md:inline-flex xl:hidden"
            data-testid="open-adventure-drawer"
            onClick={() => setAdventureDrawerOpen(true)}
          >
            冒险
          </Button>
          <Button variant="primary" onClick={onOpenSaves}>
            保存游戏
          </Button>
          <Button variant="ghost" onClick={onBackToMenu}>
            返回主菜单
          </Button>
        </div>
      </header>

      {/* 轻量提示（TM-P2-008 §13/§32：获得新线索 / 任务推进瞬时反馈） */}
      <Toast message={toast} onDone={() => setToast(null)} />

      {showLevelUpNotice && (
        <section className="mb-3 rounded border border-gold-500/60 bg-gold-900/30 p-4 text-sm">
          <h3 className="text-lg font-bold text-gold-300">等级提升！</h3>
          <p className="mt-2 text-bone-200">你的等级从 Lv.{showLevelUpNotice.from} 提升至 Lv.{showLevelUpNotice.to}。</p>
          <p className="mt-1 text-bone-300">
            最大生命 +{showLevelUpNotice.maxHpGain}，最大灵力 +{showLevelUpNotice.maxMpGain}。
          </p>
          <Button className="mt-3" variant="primary" onClick={() => setShowLevelUpNotice(null)}>
            知道了
          </Button>
        </section>
      )}

      {/* 任务完成奖励反馈（TM-P2-006 第 44 节） */}
      {questRewardNotice && (
        <Modal open onClose={() => setQuestRewardNotice(null)} title="任务完成" ariaLabel="任务完成">
          <div className="text-sm text-bone-300">
            <p className="font-bold text-gold-300">《{questRewardNotice.questTitle}》</p>
            {questRewardNotice.gold > 0 && <p className="mt-2 text-bone-200">金币 +{questRewardNotice.gold}</p>}
            {questRewardNotice.xp > 0 && <p className="mt-1 text-bone-200">冒险阅历 +{questRewardNotice.xp}</p>}
            {questRewardNotice.gold === 0 && questRewardNotice.xp === 0 && (
              <p className="mt-2 text-bone-500">任务已完成。</p>
            )}
          </div>
          <Button variant="primary" className="mt-4" onClick={() => setQuestRewardNotice(null)}>
            知道了
          </Button>
        </Modal>
      )}

      {/* 三栏布局（TM-P2-008 §14/§15）：<768 底部 tab（左右栏隐藏，Drawer 承载）；768–1279 左 compact + 中 main（右栏 Drawer）；≥1280 三列全展示 */}
      <div className="game-grid grid flex-1 grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        {/* 左栏：玩家（<768 隐藏，由底部 [角色] Drawer 承载；data-testid 保持在 DOM） */}
        <div className="game-col order-2 hidden min-h-0 md:order-1 md:col-start-1 md:block xl:col-start-1 xl:col-span-1">
          <PlayerSidebar />
        </div>

        {/* 中栏：当前场景（CURRENT SCENE） */}
        <section data-testid="main-column" className="game-col order-1 min-h-0 md:order-2 md:col-start-2 md:row-span-2 xl:col-start-2">
          <div className="flex h-full flex-col gap-4">
            {/* 当前场景（地点名称为中央标题） */}
            <section
              data-current-location-id={world.currentLocationId}
              className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300"
            >
              {location ? (
                <>
                  <h2 className="text-xl font-bold tracking-widest text-gold-300">{location.name}</h2>
                  <p className="mt-2 leading-relaxed text-bone-200">{location.description}</p>
                </>
              ) : (
                <p className="text-bone-300">地点数据异常</p>
              )}
            </section>

            {/* 地图 / 移动 */}
            {location && location.connections.length > 0 && (
              <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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

            {/* ---- 剧情与行动块（保留全部剧情逻辑） ---- */}

            {/* 反季樱雨入口 */}
            {isSakuraTriggerLocation(world.currentLocationId) &&
              getSakuraSceneStage(gameState) === 'hidden' &&
              canTriggerSakuraEncounter(gameState) && (
                <section className="rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5 text-sm text-bone-300">
                  <h3 className="mb-2 text-sm font-bold tracking-wider text-sakura-200">反季樱雨</h3>
                  <p className="leading-relaxed text-bone-200">不合时节的樱花正从天空飘落——你能感到花瓣背后有什么在松动。</p>
                  <Button className="mt-3" variant="primary" onClick={() => startSakuraEncounter()}>
                    查看异象
                  </Button>
                </section>
              )}

            {/* Sakura 剧情面板 */}
            {getSakuraSceneStage(gameState) !== 'hidden' && (
              <SakuraEncounterPanel onEngage={onEngage} onLevelUp={handleProgression} />
            )}

            {/* 天龙城同行 banter */}
            {canTriggerSakuraBanter(gameState) && !banterDone && (
              <section className="rounded border border-sakura-500/40 bg-ink-900/50 p-5 text-sm text-bone-300">
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
            {canTriggerSakuraBanter(gameState) === false && banterDone && banterNote && (
              <p className="text-xs text-sakura-300">{banterNote}</p>
            )}

            {/* 首次休整谈话 */}
            {isFirstRestTalkReady(gameState) && !firstRestResult && (
              <section className="rounded border border-sakura-500/40 bg-ink-900/50 p-5 text-sm text-bone-300">
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
              <section className="rounded border border-sakura-500/40 bg-ink-900/50 p-5 text-sm text-bone-300">
                <p className="leading-relaxed text-bone-200">
                  {firstRestResult === 'respect' && '她沉默了很久，最后轻轻点头：「……谢谢你。这句话，比任何契约都重。」'}
                  {firstRestResult === 'joke' && '她愣了一下，随即别过头去：「……神契宠物只是你们天梦大陆的分类，不代表所有权。」'}
                  {firstRestResult === 'pragmatic' && '她认真地想了想：「樱花飞斩、魔法盾与轻舞还能用。完整封印术……还差很远。」'}
                </p>
                {firstRestNote && <p className="mt-2 text-xs text-sakura-300">{firstRestNote}</p>}
              </section>
            )}

            {/* 北门调查入口 */}
            {world.currentLocationId === 'tianlong_north_gate' && northGateQuestInProgress && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
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

            {/* 北门胜利剧情 */}
            {world.currentLocationId === 'tianlong_north_gate' && northGateWolfDefeated && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
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

            {/* 北门旧哨塔补给匣 */}
            {world.currentLocationId === 'tianlong_north_gate' && northGateWolfDefeated && (() => {
              const towerOpened = world.flags.north_tower_opened === true
              const towerClaimed = world.flags.north_tower_cache_claimed === true
              const towerMndFailed = world.flags.north_tower_mnd_failed === true
              const towerLuckUsed = world.flags.north_tower_luck_used === true
              const towerSkills = getUsableSkills(
                gameState.player.learnedSkillIds,
                gameState.player.profession,
              ).filter((s) => s.tags.some((t) => t === 'force' || t === 'movement' || t === 'magic'))
              if (towerClaimed) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门旧哨塔</h3>
                    <p className="leading-relaxed text-bone-200">
                      补给匣已经打开，里面的东西被你在荒草间逐一收起。倒塌的哨塔结构重新归于沉寂。
                    </p>
                    {towerClaimResult?.outcome === 'claimed' && (
                      <div className="mt-3 rounded bg-ink-950/60 p-3">
                        <p className="text-bone-200">你当时获得了：</p>
                        {towerClaimResult.items.map((it, index) => {
                          const def = getItem(it.itemId)
                          return (
                            <p key={rewardItemKey(it.itemId, index)} className="mt-1">
                              {def?.name ?? '物品数据异常'} ×{it.quantity}
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
                  <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门旧哨塔的巡逻补给匣</h3>
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
                        {towerClaimResult.items.map((it, index) => {
                          const def = getItem(it.itemId)
                          return (
                            <p key={rewardItemKey(it.itemId, index)} className="mt-1">
                              {def?.name ?? '异常物品（无法识别）'} ×{it.quantity}
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
              return (
                <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门旧哨塔的巡逻补给匣</h3>
                  <p className="leading-relaxed text-bone-200">
                    倒塌的哨塔结构压住了一只巡逻补给匣。你可以试着用不同的方式移开阻碍。
                  </p>
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

            {/* 兔王巢穴地图复查 */}
            {world.currentLocationId === 'rabbit_lair' && goldenSearchInProgress && goldenVillageInquiryReported && (
              goldenLairRechecked ? (
                <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <p className="text-bone-200">你重新比对了地图与巢穴周边，但仍没有找到足以确认下一处地点的线索。</p>
                  <p className="mt-2 text-bone-300">现有线索还不足以确认黄金兔子王的最终去向。</p>
                </section>
              ) : (
                <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                  <p className="mb-3 text-bone-300">你带着《兔子的路径》返回兔王巢穴，准备重新比对地图上的标记。</p>
                  <Button variant="primary" onClick={() => recheckGoldenRabbitMapAtLair()}>
                    重新比对地图
                  </Button>
                </section>
              )
            )}

            {/* TM-P2-008：兔子的路径——中间区只保留「展开地图」行动；地图信息迁右栏 Clue Journal（clue_rabbit_path），不再常驻信息卡（§2-6/§8；不改 Golden Rabbit 剧情状态） */}
            {(() => {
              const pathDef = getItem('rabbit_path')
              const hasPath =
                pathDef !== undefined && gameState.inventory.some((e) => e.itemId === 'rabbit_path' && e.quantity >= 1)
              if (!hasPath) return null
              if (world.flags.rabbit_path_examined === true) return null
              return (
                <section className="rounded border border-gold-500/40 bg-gold-500/5 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">兔子的路径</h3>
                  <p className="leading-relaxed text-bone-300">{pathDef.description}</p>
                  <div className="mt-3">
                    <Button variant="primary" onClick={() => inspectRabbitPath()}>
                      展开地图
                    </Button>
                  </div>
                </section>
              )
            })()}

            {/* 村外草原采药区域调查 */}
            {world.currentLocationId === 'village_grassland' && (herbInProgress || herbGrasslandChecked) && (
              herbGrasslandChecked ? (
                <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <p className="text-bone-200">你检查了附近的采药区域，确认魔化野兽的活动确实影响了这里。</p>
                  <p className="mt-2 text-bone-300">可以回青石村向药师复命了。</p>
                </section>
              ) : (
                <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                  <p className="mb-3 text-bone-300">药师常来这一带采药。附近魔化野兽的活动让这里变得不再安全。</p>
                  <Button variant="primary" onClick={() => inspectApothecaryHerbRoute()}>
                    查看采药区域
                  </Button>
                </section>
              )
            )}

            {/* 离开青石村前往天龙城 */}
            {goldenDepartureReady && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
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

            {/* 黑石塔调查入口 */}
            {world.currentLocationId === 'tianlong_city' && towerQuestInProgress && wangcaiBriefed && towerUnlockPending && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">黑石塔调查</h3>
                <p className="leading-relaxed text-bone-200">王财提供的情况已经足够，你可以动身前往黑石塔调查。</p>
                <Button variant="primary" onClick={() => unlockBlackStoneTowerInvestigation()}>
                  动身调查黑石塔
                </Button>
              </section>
            )}

            {/* 黑石塔一层剧情 */}
            {world.currentLocationId === 'black_stone_tower_floor1' && floor1SoldierDefeated && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
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

            {/* 村中休整 */}
            {world.currentLocationId === 'qingshi_village' && (
              <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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

            {/* 武馆休整 */}
            {world.currentLocationId === 'tianlong_martial_hall' && (
              <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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

            {/* 马厩（TM-P2-007 §19：天龙城购买/管理坐骑） */}
            {world.currentLocationId === 'tianlong_city' && (
              <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">马厩</h3>
                <p className="mb-3 text-bone-300">天龙城的马厩里饲养着骏马。买下一匹可提升能力，并加快旅途。</p>
                <Button variant="primary" data-testid="open-mount-stable-entry" onClick={() => setMountStableOpen(true)}>
                  造访马厩
                </Button>
              </section>
            )}

            {/* 城郊古驿道（TM-P2-007 §21：fast_travel 坐骑才出现的 optional 检定；不影响主线，未连接 Golden Rabbit） */}
            {world.currentLocationId === 'tianlong_city' &&
              (canExploreMountTrail(gameState) || world.flags.mount_trail_explored !== undefined) && (
                <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">城郊古驿道</h3>
                  {(() => {
                    const done = world.flags.mount_trail_explored
                    return (
                      <>
                        {lastMountTrail && (
                          <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/60 p-3">
                            <p className="text-bone-300">
                              D20 {lastMountTrail.roll} + 敏捷修正 {lastMountTrail.attributeModifier} ={' '}
                              {lastMountTrail.total}
                            </p>
                            <p className="text-bone-500">DC {lastMountTrail.dc}</p>
                            <p className="font-bold text-gold-300">结果：{CHECK_OUTCOME_LABELS[lastMountTrail.outcome]}</p>
                            <p className="mt-1 text-bone-300">
                              {lastMountTrail.success
                                ? `你在驿站的旧柜里找到一笔酬金，收获 ${MOUNT_TRAIL_REWARD_GOLD} 金。`
                                : '小路尽头空无一人，你原路折返。'}
                            </p>
                          </div>
                        )}
                        {done === 'found' && <p className="text-xs text-bone-500">探索已完成</p>}
                        {done === 'nothing' && <p className="text-xs text-bone-500">探索已完成</p>}
                        {done === undefined && (
                          <>
                            <p className="mb-2 text-bone-300">你骑上快马，沿着城郊古驿道疾驰，发现一条通往废弃驿站的小路。</p>
                            <p className="mb-3 text-xs text-bone-500">
                              敏捷检定 · DC {CHECK_DC.moderate}（当前敏捷 {player.attributes.agi}）
                            </p>
                            <Button variant="primary" data-testid="explore-mount-trail" onClick={handleExploreMountTrail}>
                              策马探索
                            </Button>
                          </>
                        )}
                      </>
                    )
                  })()}
                </section>
              )}

            {/* 黑石塔二层解锁入口 */}
            {world.currentLocationId === 'black_stone_tower_floor1' &&
              towerQuestInProgress &&
              wangcaiBriefed &&
              towerUnlocked &&
              floor1SoldierDefeated &&
              floor1CaptainDefeated &&
              towerFloor2UnlockPending && (
                <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">继续深入</h3>
                  <p className="leading-relaxed text-bone-200">一层大厅已经清空，通往黑石塔二层的阶梯就在更深处。</p>
                  <Button variant="primary" onClick={() => unlockBlackStoneTowerFloor2()}>
                    深入黑石塔二层
                  </Button>
                </section>
              )}

            {/* 黑石塔二层入口区清场剧情 */}
            {world.currentLocationId === 'black_stone_tower_floor2' &&
              floor2ZombieDefeated &&
              floor2BlackMageDefeated &&
              !floor2SkeletonWarriorDefeated && (
                <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">二层前段</h3>
                  <p className="leading-relaxed text-bone-200">二层前段的僵尸与黑法师已经被清理。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">
                    曲折的通道继续向深处延伸，前方小厅中出现了更强的骷髅战士，挡住继续深入的道路。
                  </p>
                </section>
              )}

            {/* 骷髅战士击败后固定剧情 */}
            {world.currentLocationId === 'black_stone_tower_floor2' && floor2SkeletonWarriorDefeated && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
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

            {/* 黑石塔三层剧情 */}
            {world.currentLocationId === 'black_stone_tower_floor3' && floor3SkeletonWitchDefeated && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">三层厅堂</h3>
                <p className="leading-relaxed text-bone-200">骷髅女妖倒在破碎的石柱之间。</p>
                <p className="mt-1 leading-relaxed text-bone-200">你在厅堂深处搜索时，发现了一条被灰尘覆盖的项链。</p>
                <p className="mt-1 leading-relaxed text-bone-200">这正是王财所说的夔峒项链。</p>
                <p className="mt-2 text-gold-300">夔峒项链 ×1 已获得。</p>
                <p className="mt-1">当前目标：返回天龙城，将夔峒项链交还王财。</p>
              </section>
            )}

            {/* TM-P2-008：北门失联完成——马科发布《北郊追踪》行动块（原常驻完成大卡改造；completed 长期信息迁右栏已完成详情 + 活动流，§2-6/§31） */}
            {northGateQuest?.status === 'completed' && (() => {
              const status = northOutskirtsQuest?.status
              if (status === 'completable' || status === 'completed') return null
              return (
                <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北门失联 · 调查终结</h3>
                  <p className="leading-relaxed text-bone-200">马科接过断裂的铜牌，脸色沉了下来。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">“这是北门第三巡逻队的东西。”</p>
                  <p className="mt-1 leading-relaxed text-bone-200">“看来黑石塔之外，北面的情况也不对劲。”</p>
                  <p className="mt-1 leading-relaxed text-bone-200">“我会先派人封锁消息。下一步，我们得沿着他们留下的路线继续查。”</p>
                  {status === 'in_progress' ? (
                    <p className="mt-3 text-gold-300">当前目标：沿着巡逻队留下的足迹继续追踪。</p>
                  ) : (
                    <div className="mt-3">
                      <Button
                        variant="primary"
                        data-testid="accept-north-outskirts"
                        onClick={handleAcceptNorthOutskirts}
                      >
                        接受任务：前往北郊继续追查
                      </Button>
                    </div>
                  )}
                </section>
              )
            })()}

            {/* TM-P2-009 §10：北郊追踪完成——马科发布《断旗余声》行动块（武馆；北郊 completed 后出现，§10/§31） */}
            {northOutskirtsQuest?.status === 'completed' && (() => {
              const status = northBrokenBannerQuest?.status
              if (status === 'completable' || status === 'completed') return null
              return (
                <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北郊驿站的传闻</h3>
                  <p className="leading-relaxed text-bone-200">听完你的汇报，马科在沙盘前沉默了很久。</p>
                  <p className="mt-1 leading-relaxed text-bone-200">“北郊官道岔口，有一座荒废多年的旧驿站。”</p>
                  <p className="mt-1 leading-relaxed text-bone-200">“第三巡逻队最后一次传回消息，说是在那里歇脚。”</p>
                  <p className="mt-1 leading-relaxed text-bone-200">“三天没有回音了。沈拓那小子——他是队里最稳当的一个。”</p>
                  <p className="mt-1 leading-relaxed text-bone-200">“你替我走一趟，看看驿站到底发生了什么。”</p>
                  {status === 'in_progress' ? (
                    <p className="mt-3 text-gold-300">当前目标：前往北郊旧驿站查明巡逻队的下落。</p>
                  ) : (
                    <div className="mt-3">
                      <Button
                        variant="primary"
                        data-testid="accept-north-broken-banner"
                        onClick={handleAcceptNorthBrokenBanner}
                      >
                        接受任务：断旗余声
                      </Button>
                    </div>
                  )}
                </section>
              )
            })()}

            {/* TM-P2-008 §18-20/§26：北郊追踪——中间区只保留当前场景可执行行动（Stage A 追踪 / Stage B 搜索 / Stage C 多解调查 / Stage D 回报） */}
            {(() => {
              const nq = northOutskirtsQuest
              if (nq?.status !== 'in_progress') return null
              const trailTracked = nq.flags.north_outskirts_trail_tracked === true
              const ambushFound = nq.flags.north_outskirts_ambush_found === true
              const investigated = nq.flags.north_outskirts_ambush_investigated === true
              const reported = nq.flags.north_outskirts_reported === true
              const atNorthGate = world.currentLocationId === 'tianlong_north_gate'
              const atOutskirts = world.currentLocationId === 'tianlong_north_outskirts'
              const atMartialHall = world.currentLocationId === 'tianlong_martial_hall'
              const mountSearchable = canSearchNorthOutskirtsByMount(gameState)
              const sakuraHere = isSakuraPresent(gameState)

              // Stage A：北门——沿着足迹继续追踪（写 trail_tracked + 解锁北郊 + 线索「拖行痕迹」）
              if (!trailTracked && atNorthGate) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北郊追踪</h3>
                    <p className="leading-relaxed text-bone-200">
                      失联巡逻队的足迹没有停在北门——荒草间被拖拽的痕迹一路向北延伸。
                    </p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="track-north-trail"
                      onClick={handleTrackNorthOutskirtsTrail}
                    >
                      沿着足迹继续追踪
                    </Button>
                  </section>
                )
              }

              // Stage B：北郊——搜索袭击现场（写 ambush_found）
              if (trailTracked && !ambushFound && atOutskirts) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北郊追踪</h3>
                    <p className="leading-relaxed text-bone-200">
                      痕迹把你引向荒原深处一处被翻乱的袭击现场，草丛里散落着断裂的箭杆与碎甲片。
                    </p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="search-north-ambush"
                      onClick={handleSearchNorthOutskirtsAmbush}
                    >
                      搜索袭击现场
                    </Button>
                  </section>
                )
              }

              // Stage C：北郊——多解调查（MND / LCK / Sakura / Mount；任一成功推进；Sakura/Mount 只补充线索不自动解决）
              if (ambushFound && !investigated && atOutskirts) {
                const checkFailed =
                  northInvestigation?.ok === true &&
                  (northInvestigation.method === 'mnd' || northInvestigation.method === 'lck') &&
                  !northInvestigation.progressed
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北郊追踪 · 袭击现场</h3>
                    <p className="leading-relaxed text-bone-200">现场一片狼藉。你可以用不同的方式找出这里发生了什么。</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        data-testid="investigate-mnd"
                        onClick={() => handleNorthOutskirtsInvestigate('mnd')}
                      >
                        [MND 检定] 辨认拖拽方向
                      </Button>
                      <Button
                        variant="primary"
                        data-testid="investigate-lck"
                        onClick={() => handleNorthOutskirtsInvestigate('lck')}
                      >
                        [LCK 检定] 搜索周边遗物
                      </Button>
                      {sakuraHere && (
                        <Button
                          variant="ghost"
                          data-testid="investigate-sakura"
                          onClick={() => handleNorthOutskirtsInvestigate('sakura')}
                        >
                          请樱花优子观察
                        </Button>
                      )}
                      {mountSearchable && (
                        <Button
                          variant="ghost"
                          data-testid="investigate-mount"
                          onClick={() => handleNorthOutskirtsInvestigate('mount')}
                        >
                          沿官道快速搜索（坐骑）
                        </Button>
                      )}
                    </div>
                    {checkFailed && (
                      <p className="mt-3 text-sm text-bone-400">你没有找到足够的线索，但可以再试一次。</p>
                    )}
                  </section>
                )
              }

              // Stage D：武馆/北门——向马科汇报（写 reported + status→completable）
              if (investigated && !reported && (atMartialHall || atNorthGate)) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">北郊追踪</h3>
                    <p className="leading-relaxed text-bone-200">你已查明北郊袭击现场的真相，是时候把发现告诉马科。</p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="report-north-outskirts"
                      onClick={handleReportNorthOutskirts}
                    >
                      向马科汇报发现
                    </Button>
                  </section>
                )
              }

              return null
            })()}

            {/* TM-P2-009 §11-17：断旗余声——中间区只保留当前场景可执行行动（Stage A 简报 / Stage B 搜索 / Stage C 多解解屏障 / Stage D 搜救 / Stage E 问沈拓 / Stage F 回报） */}
            {(() => {
              const bq = northBrokenBannerQuest
              if (bq?.status !== 'in_progress') return null
              const makeBriefed = bq.flags.north_broken_banner_make_briefed === true
              const waystationSearched = bq.flags.north_waystation_searched === true
              const barrierResolved = bq.flags.north_waystation_barrier_resolved === true
              const survivorRescued = bq.flags.north_waystation_survivor_rescued === true
              const survivorDebriefed = bq.flags.north_waystation_survivor_debriefed === true
              const reported = bq.flags.north_broken_banner_reported === true
              const atMartialHall = world.currentLocationId === 'tianlong_martial_hall'
              const atWaystation = world.currentLocationId === 'tianlong_north_abandoned_waystation'
              const mountSearchable = canSearchWaystationByMount(gameState)
              const sakuraHere = isSakuraPresent(gameState)

              // Stage A：武馆——听取马科简报（写 make_briefed + 解锁旧驿站）
              if (!makeBriefed && atMartialHall) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">断旗余声</h3>
                    <p className="leading-relaxed text-bone-200">
                      马科递给你一张泛黄的驿道图，指着北郊官道岔口的一处标记。
                    </p>
                    <p className="mt-1 leading-relaxed text-bone-200">
                      “旧驿站。第三巡逻队最后传回的消息是从那里发出来的。”
                    </p>
                    <p className="mt-1 leading-relaxed text-bone-200">
                      “去驿站看看，注意安全。如果遇到狼群，不要硬拼——它们最近疯了似的往北边跑。”
                    </p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="brief-north-broken-banner"
                      onClick={handleStartNorthBrokenBannerBriefing}
                    >
                      听马科说明驿站情况
                    </Button>
                  </section>
                )
              }

              // Stage B：旧驿站——搜索驿站（写 searched + 线索「断裂队旗」）
              if (makeBriefed && !waystationSearched && atWaystation) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">断旗余声</h3>
                    <p className="leading-relaxed text-bone-200">
                      半塌的驿站安静得反常。院门半掩，风从门缝里漏进来，吹得一块垂挂的旗帜轻轻摆动。
                    </p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="search-waystation"
                      onClick={handleSearchWaystation}
                    >
                      搜索驿站
                    </Button>
                  </section>
                )
              }

              // Stage C：旧驿站——多解解屏障（战斗 / MND / LCK / Sakura / Mount；五种路线成功都真正解决屏障并写 neutralized，非战斗路线不授予击杀 XP）
              if (waystationSearched && !barrierResolved && atWaystation) {
                const wolvesNeutralized = world.flags.waystation_wolf_pack_neutralized === true
                const checkFailed =
                  waystationBarrier?.ok === true &&
                  (waystationBarrier.method === 'mnd' || waystationBarrier.method === 'lck') &&
                  !waystationBarrier.progressed
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">断旗余声 · 驿站狼群</h3>
                    <p className="leading-relaxed text-bone-200">
                      驿站后院被狼群堵死了——三只毛发杂乱的野狼在断墙前低吼，其中一只双眼泛着不正常的紫光。你要穿过它们才能进到后院的储藏室。
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        data-testid="barrier-combat"
                        onClick={() => handleResolveWaystationBarrier('combat')}
                      >
                        {wolvesNeutralized ? '战斗已完成，进入后院' : '击败狼群，突破屏障'}
                      </Button>
                      <Button
                        variant="primary"
                        data-testid="barrier-mnd"
                        onClick={() => handleResolveWaystationBarrier('mnd')}
                      >
                        [MND 检定] 观察狼群的领地行为
                      </Button>
                      <Button
                        variant="primary"
                        data-testid="barrier-lck"
                        onClick={() => handleResolveWaystationBarrier('lck')}
                      >
                        [LCK 检定] 寻找绕开狼群的小路
                      </Button>
                      {sakuraHere && (
                        <Button
                          variant="ghost"
                          data-testid="barrier-sakura"
                          onClick={() => handleResolveWaystationBarrier('sakura')}
                        >
                          请樱花优子寻找安全路线
                        </Button>
                      )}
                      {mountSearchable && (
                        <Button
                          variant="ghost"
                          data-testid="barrier-mount"
                          onClick={() => handleResolveWaystationBarrier('mount')}
                        >
                          骑马引开狼群后从另一侧进入
                        </Button>
                      )}
                    </div>
                    {checkFailed && (
                      <p className="mt-3 text-sm text-bone-400">狼群没有散开，但你可以再试一次。</p>
                    )}
                    {waystationBarrier?.ok === true && waystationBarrier.method === 'mount' && (
                      <p className="mt-3 text-sm text-bone-400">你骑马引开狼群后从另一侧进入了后院。</p>
                    )}
                    {waystationBarrier?.ok === true && waystationBarrier.method === 'sakura' && (
                      <p className="mt-3 text-sm text-bone-400">樱花优子找到了绕过狼群的安全路线。</p>
                    )}
                  </section>
                )
              }

              // Stage D：旧驿站——搜救幸存者（写 rescued + 事件 north_survivor_rescued + 线索「黑篷车辙」）
              if (barrierResolved && !survivorRescued && atWaystation) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">断旗余声 · 搜救</h3>
                    <p className="leading-relaxed text-bone-200">
                      你穿过狼群盘踞的后院，推开储藏室的门，发现一名骑士倒在墙角的干草堆里，胸口还护着一面卷起来的旗帜。
                    </p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="rescue-survivor"
                      onClick={handleRescueSurvivor}
                    >
                      救出骑士
                    </Button>
                  </section>
                )
              }

              // Stage E：旧驿站——问沈拓详情（写 debriefed + 线索「魔化诱饵」）
              if (survivorRescued && !survivorDebriefed && atWaystation) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">断旗余声 · 沈拓</h3>
                    <p className="leading-relaxed text-bone-200">
                      骑士咳了几声，撑着墙壁坐起来，报上名字：“第三巡逻队，沈拓。”
                    </p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="debrief-survivor"
                      onClick={handleDebriefSurvivor}
                    >
                      询问驿站发生了什么
                    </Button>
                  </section>
                )
              }

              // Stage F：武馆——向马科回报（写 reported + status→completable）
              if (survivorDebriefed && !reported && atMartialHall) {
                return (
                  <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                    <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">断旗余声</h3>
                    <p className="leading-relaxed text-bone-200">你已查明驿站发生的一切，是时候把沈拓的证词交给马科。</p>
                    <Button
                      variant="primary"
                      className="mt-3"
                      data-testid="report-north-broken-banner"
                      onClick={handleReportNorthBrokenBanner}
                    >
                      向马科汇报
                    </Button>
                  </section>
                )
              }

              return null
            })()}

            {/* TM-P2-009 §17：断旗余声完成——马科预告正式骑士试炼（只引出下一阶段，试炼本体不实现） */}
            {world.currentLocationId === 'tianlong_martial_hall' && world.flags.knight_trial_invited === true && (
              <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">骑士试炼的预告</h3>
                <p className="leading-relaxed text-bone-200">马科听完沈拓的证词，久久没有说话。</p>
                <p className="mt-1 leading-relaxed text-bone-200">“黑篷车、魔化诱饵……有人在故意引狼群去驿站。”</p>
                <p className="mt-1 leading-relaxed text-bone-200">“你救回沈拓，立了大功。”</p>
                <p className="mt-1 leading-relaxed text-bone-200">“等我把城防的事处理完，会有一场正式的骑士试炼等着你。”</p>
                <p className="mt-2 text-gold-300">（试炼内容尚待展开）</p>
              </section>
            )}

            {/* 机缘型社交：路边旧货商 */}
            {world.currentLocationId === 'tianlong_city' && (() => {
              const talked = world.flags.old_trader_talked === true
              const outcome = world.flags.old_trader_outcome
              return (
                <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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

            {/* 附近人物（紧凑列表；交谈打开 NpcInteractionPanel） */}
            {localNpcs.length > 0 && (
              <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近人物</h3>
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

            {/* TM-P2-004 第 66/67 节：天龙城桂花糕铺（第一种真实礼物——樱花优子 liked：sweet/refined；TM-P2-006 保留为中央场景块） */}
            {world.currentLocationId === 'tianlong_city' &&
              (() => {
                const cake = getItem('tianlong_osmanthus_cake')
                if (!cake) return null
                const price = cake.value
                const canAfford = Number.isSafeInteger(player.gold) && player.gold >= price
                return (
                  <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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

            {/* 附近威胁 */}
            {(() => {
              const configuredEncounters = location?.encounters ?? []
              if (configuredEncounters.length === 0) return null
              // TM-P2-007 §7.4：可见性直接委托 checkEncounter 权威守卫（注册 / 地点挂载 / 前置 / defeated），
              // 不再复制敌人专属过滤分支，与战斗入口校验 100% 一致。
              const visibleEncounters = configuredEncounters
                .map((encounterId) => getEncounter(encounterId))
                .filter((def): def is NonNullable<typeof def> => (def ? checkEncounter(gameState, def.id).allowed : false))
              if (visibleEncounters.length === 0) return null
              return (
                <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
                  <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近威胁</h3>
                  <div className="flex flex-col gap-3">
                    {visibleEncounters.map((def) => {
                      const cannotFight = player.hp <= 0
                      const singleEnemyId = singleEnemyIdOf(def)
                      const singleEnemy = singleEnemyId ? getEnemy(singleEnemyId) : undefined
                      return (
                        <div key={def.id} className="rounded border border-ink-600 bg-ink-900/40 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-bold text-bone-100">
                                {def.name}
                                {singleEnemy && (
                                  <span className="text-xs font-normal text-bone-500"> · Lv.{singleEnemy.level}</span>
                                )}
                              </p>
                              {singleEnemy ? (
                                <p className="mt-1 text-xs text-bone-500">
                                  HP {singleEnemy.maxHp} · 护甲 {singleEnemy.armor}
                                </p>
                              ) : (
                                <p className="mt-1 text-xs text-bone-500">{encounterMembersSummary(def)}</p>
                              )}
                            </div>
                            <Button variant="primary" disabled={cannotFight} onClick={() => onEngage(def.id)}>
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

            {/* 废弃矿洞调查 */}
            {world.currentLocationId === 'abandoned_mine' && (
              <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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
                            调查痕迹
                          </Button>
                        </>
                      )}
                    </>
                  )
                })()}
              </section>
            )}
          </div>
        </section>

        {/* 右栏：任务与记录中心（TM-P2-008 §15：<1280 隐藏，由「冒险」Drawer 承载；data-testid 保持在 DOM） */}
        <div className="game-col order-3 hidden min-h-0 xl:col-start-3 xl:row-start-1 xl:block">
          <TaskActivitySidebar onCompleteQuest={handleCompleteQuest} onViewQuest={handleViewQuest} />
        </div>
      </div>

      {/* NPC 交互面板（TM-P2-006：交谈→二级面板；商店不常驻中央） */}
      {showDialog && activeNpc && (
        <NpcInteractionPanel
          npc={activeNpc}
          onClose={() => setActiveNpcId(null)}
          nearbyQuests={nearbyQuestsForNpc}
          shopExtras={shopExtras}
          dialogContent={
            <div>
              {/* TM-P1-004：村长关系反应替代原 greeting；王财/马科按阶段替换 */}
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
              {/* TM-P1-002/003：村长对话显示信任+尊敬 */}
              {activeNpc.id === 'village_elder' && (
                <p className="mb-3 text-xs text-bone-500">
                  信任：{world.npcStates[activeNpc.id]?.relationship.trust ?? 0}
                  {'　'}尊敬：{world.npcStates[activeNpc.id]?.relationship.respect ?? 0}
                </p>
              )}
              {/* TM-P1-003：村长一次性回应选择 */}
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
              {/* TM-P1-016：向村长汇报《兔子的路径》 */}
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
              {/* TM-P1-016：已汇报固定文案 */}
              {activeNpc.id === 'village_elder' && world.flags.rabbit_path_reported === true && (
                <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                  <p className="text-bone-200">你已经把《兔子的路径》展示给村长。</p>
                  <p className="mt-1 text-bone-300">地图仍指向黄金兔子王所在之地。</p>
                  <p className="mt-1 text-bone-300">地图上的标记仍无法对应到任何已知地点。</p>
                </div>
              )}
              {/* TM-P1-019：向村长复命村内调查 */}
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
              {/* TM-P1-018：向铁匠打听地图 */}
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
              {/* TM-P1-018：向药师打听地图 */}
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
              {/* TM-P1-024：向王财询问黑石塔附近的遭遇 */}
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
              {/* TM-P1-030：将夔峒项链交还王财 */}
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
            </div>
          }
        />
      )}

      {/* 马厩面板（TM-P2-007 §19：购买/装备/卸下） */}
      <MountStablePanel
        open={mountStableOpen}
        onClose={() => setMountStableOpen(false)}
        ownedMountIds={gameState.ownedMountIds}
        equippedMountId={gameState.equippedMountId}
        gold={player.gold}
        locationId={world.currentLocationId}
        onBuy={buyMount}
        onEquip={equipMount}
        onUnequip={unequipMount}
      />

      {/* TM-P2-008 §14：移动端底部 tab（<768；左右栏隐藏后通过 Drawer 访问） */}
      <MobileNav
        onOpenRole={() => setMobilePanel('role')}
        onOpenAdventure={() => setMobilePanel('adventure')}
        onOpenBackpack={() => setBackpackOpen(true)}
      />

      {/* TM-P2-008 §14：移动端 <768 Drawer（[角色] → PlayerSidebar / [冒险] → AdventureSidebar） */}
      <Drawer
        open={mobilePanel !== null}
        onClose={() => setMobilePanel(null)}
        title={mobilePanel === 'role' ? '角色' : '冒险'}
        ariaLabel={mobilePanel === 'role' ? '角色' : '冒险'}
      >
        {mobilePanel === 'role' ? (
          <PlayerSidebar />
        ) : mobilePanel === 'adventure' ? (
          <TaskActivitySidebar onCompleteQuest={handleCompleteQuest} onViewQuest={handleViewQuest} />
        ) : null}
      </Drawer>

      {/* TM-P2-008 §15：768–1279 右栏 → Drawer（「冒险」按钮打开 AdventureSidebar） */}
      <Drawer open={adventureDrawerOpen} onClose={() => setAdventureDrawerOpen(false)} title="冒险" ariaLabel="冒险">
        <TaskActivitySidebar onCompleteQuest={handleCompleteQuest} onViewQuest={handleViewQuest} />
      </Drawer>

      {/* TM-P2-008 §14：移动端 [背包] tab → BackpackPanel（全屏 Drawer；复用桌面绑定模式） */}
      <BackpackPanel
        open={backpackOpen}
        onClose={() => setBackpackOpen(false)}
        inventory={gameState.inventory}
        equipment={gameState.equipment}
        playerHp={player.hp}
        playerMaxHp={player.maxHp}
        profession={player.profession}
        onEquipItem={(itemId) => useGameStore.getState().equipItem(itemId)}
        onUnequipSlot={(slot) => useGameStore.getState().unequipSlot(slot)}
        onUseItem={(itemId) => (itemId === 'healing_potion' ? useHealingPotion() : false)}
      />
    </div>
  )
}

/** React-only identity for reward rows; duplicate loot entries remain separate and visible. */
export function rewardItemKey(itemId: string, index: number): string {
  return `${itemId}-${index}`
}
