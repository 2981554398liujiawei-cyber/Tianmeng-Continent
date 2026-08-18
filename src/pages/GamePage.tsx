import { useState } from 'react'
import Button from '../components/Button'
import { useGameStore, VILLAGE_ELDER_POST_QUEST_EVENT_ID } from '../game/state/gameStore'
import { getProfessionName, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../game/content/professions'
import { getEnemy, getItem, getLocation, getNpc, getQuest, NPCS, QUESTS } from '../game/content'
import { CHECK_DC, type D20CheckResult } from '../game/rules/d20'
import { LEVEL_2_MAX_HP_GAIN, LEVEL_2_MAX_MP_GAIN } from '../game/rules/character'
import type { QuestStatus } from '../game/types'

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

export default function GamePage({ onBackToMenu, onEngage }: GamePageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const saveGame = useGameStore((s) => s.saveGame)
  const travelToLocation = useGameStore((s) => s.travelToLocation)
  const discoverQuest = useGameStore((s) => s.discoverQuest)
  const acceptQuest = useGameStore((s) => s.acceptQuest)
  const completeQuest = useGameStore((s) => s.completeQuest)
  const useHealingPotion = useGameStore((s) => s.useHealingPotion)
  const equipWeapon = useGameStore((s) => s.equipWeapon)
  const unequipWeapon = useGameStore((s) => s.unequipWeapon)
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
  const [saveResult, setSaveResult] = useState<'saved' | 'failed' | null>(null)
  const [travelError, setTravelError] = useState(false)
  // TM-P0-015：活动对话 NPC（仅 UI 本地状态，不进入 GameState / 存档）
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null)
  // TM-P0-016：本次调查的即时检定结果（仅 UI 本地状态；离开矿洞清空）
  const [lastMineInvestigation, setLastMineInvestigation] = useState<D20CheckResult | null>(null)
  // TM-P1-012：Lv.2 里程碑升级提示（仅 UI 本地状态；只由「本次《草原狼影》提交成功」这一 UI 事件触发，不进入 GameState/存档，不按 level 自动判断）
  const [showLevelUpNotice, setShowLevelUpNotice] = useState(false)
  /** TM-P1-023：天龙城离村二次确认（UI 本地状态，不写 GameState；确认后才调用 Store action） */
  const [showTianlongDepartureConfirm, setShowTianlongDepartureConfirm] = useState(false)

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
    return true
  })
  // TM-P0-015：附近人物 = 常驻当前地点的注册 NPC（动态过滤，不硬编码列表）
  const localNpcs = Object.values(NPCS).filter((npc) => npc.locationId === world.currentLocationId)

  const handleSave = () => {
    const ok = saveGame()
    setSaveResult(ok ? 'saved' : 'failed')
    window.setTimeout(() => setSaveResult(null), 2500)
  }

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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between border-b border-ink-600 pb-4">
        <h2 className="text-xl font-bold tracking-widest text-gold-300">冒险日志</h2>
        <Button variant="ghost" onClick={onBackToMenu}>
          返回主菜单
        </Button>
      </header>

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

      {/* TM-P1-012：Lv.2 里程碑升级提示——只由《草原狼影》本次提交成功触发（UI 本地状态，不持久化；点击「知道了」关闭，不自动消失） */}
      {showLevelUpNotice && (
        <section className="rounded border border-gold-500/60 bg-gold-900/30 p-5 text-sm">
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

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
        <p className="mb-2 text-bone-500">当前位置</p>
        {location ? (
          <>
            <h3 className="text-lg font-bold text-bone-100">{location.name}</h3>
            <p className="mt-2 leading-relaxed">{location.description}</p>
            <p className="mt-2 text-xs text-bone-500">{location.id}</p>
            <div className="mt-4">
              <p className="mb-2 text-bone-500">可前往：</p>
              <div className="flex flex-wrap gap-4">
                {location.connections.map((targetId) => {
                  const target = getLocation(targetId)
                  if (!target) return null
                  const locked =
                    target.requiredFlag !== undefined && world.flags[target.requiredFlag] !== true
                  return (
                    <div key={targetId} className="flex flex-col items-start gap-1">
                      <Button
                        variant={locked ? 'ghost' : 'primary'}
                        disabled={locked}
                        onClick={() => handleTravel(targetId)}
                      >
                        {target.name}
                      </Button>
                      {locked && (
                        <span className="text-xs text-bone-500">尚未找到进入此地的方法</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        ) : (
          // TM-P0-005：未知当前位置安全边界——不崩溃、不提供移动按钮
          <p className="text-bone-300">未知地点（{world.currentLocationId}）</p>
        )}
        {travelError && <p className="mt-3 text-sm text-red-300">无法前往该地点。</p>}
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">装备</h3>
        {(() => {
          const weaponDef = gameState.equipment.weapon ? getItem(gameState.equipment.weapon) : undefined
          return (
            <p>
              武器：{' '}
              {weaponDef ? (
                <span className="text-bone-100">{weaponDef.name}</span>
              ) : gameState.equipment.weapon ? (
                <span className="text-bone-100">
                  未知武器 <span className="text-bone-500">（{gameState.equipment.weapon}）</span>
                </span>
              ) : (
                <span className="text-bone-500">未装备</span>
              )}
            </p>
          )
        })()}
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">背包</h3>
        {gameState.inventory.length === 0 ? (
          <p className="text-bone-500">背包空空如也。</p>
        ) : (
          <div className="flex flex-col gap-2">
            {gameState.inventory.map((entry) => {
              const def = getItem(entry.itemId)
              // TM-P0-010：只有治疗药水提供使用入口；满血 / HP 0 时禁用
              const isPotion = def?.id === 'healing_potion'
              const canUse = isPotion && player.hp > 0 && player.hp < player.maxHp
              // TM-P0-013：铁剑提供装备/卸下入口（装备不消耗 inventory）
              const isWeapon = def?.id === 'iron_sword'
              const isEquipped = gameState.equipment.weapon === 'iron_sword'
              return (
                <div
                  key={entry.itemId}
                  className="flex items-center justify-between gap-3 rounded border border-ink-600 bg-ink-900/40 p-3"
                >
                  <div>
                    <p className="font-bold text-bone-100">
                      {def?.name ?? '未知物品'} <span className="text-xs font-normal text-bone-500">×{entry.quantity}</span>
                    </p>
                    <p className="mt-1 text-xs text-bone-500">
                      {def ? def.description : `（缺失物品定义：${entry.itemId}）`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {isWeapon && (
                      <Button
                        variant="primary"
                        onClick={() => (isEquipped ? unequipWeapon() : equipWeapon(entry.itemId))}
                      >
                        {isEquipped ? '卸下' : '装备'}
                      </Button>
                    )}
                    {isPotion && (
                      <>
                        <Button variant="primary" disabled={!canUse} onClick={() => useHealingPotion()}>
                          使用
                        </Button>
                        {player.hp >= player.maxHp && <span className="text-xs text-bone-500">生命已满</span>}
                        {player.hp <= 0 && <span className="text-xs text-red-300">当前无法使用</span>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

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
                <p className="mt-1 text-bone-300">具体地点：【待补充】</p>
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

      {/* TM-P1-016：青石村阶段完成 —— 只读 world.flags.rabbit_path_reported===true（Store action 已保证该 flag 只能在正确前提下产生，不重算任务链）；持久剧情状态展示，非弹窗/toast；【待补充】为剧情边界，无新地点按钮 */}
      {world.flags.rabbit_path_reported === true && (
        <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
          <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">青石村阶段完成</h3>
          <p className="leading-relaxed text-bone-200">
            你已经处理了村外异动、矿洞威胁与草原狼影，并取得了《兔子的路径》。
          </p>
          <p className="mt-2 text-bone-300">下一步目的地：【待补充】</p>
        </section>
      )}

      {/* TM-P1-020：兔王巢穴地图复查 —— 第四任务 in_progress + 村内调查已复命 + 未复查时显示入口；成功后按钮消失并显示固定结果（不虚构路线/足迹/方向/坐标） */}
      {world.currentLocationId === 'rabbit_lair' && goldenSearchInProgress && goldenVillageInquiryReported && (
        goldenLairRechecked ? (
          <section className="rounded border border-gold-500/50 bg-gold-900/20 p-5 text-sm text-bone-300">
            <p className="text-bone-200">你重新比对了地图与巢穴周边，但仍没有找到足以确认下一处地点的线索。</p>
            <p className="mt-2 text-bone-300">下一步目的地：【待补充】</p>
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

      {/* TM-P1-021：村外草原采药区域调查 —— 支线 in_progress（未调查入口）或已查看（成功结果）时显示；成功后按钮消失并显示固定结果（无草药/采集物/危险值/随机结果） */}
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

      {/* TM-P1-023：离开青石村前往天龙城 —— 黄金主线收束后显示「新的旅程」入口；已接触未完成支线时只提示不提供按钮；二次确认后才调用 Store action（不可逆，单向离村） */}
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

      {/* TM-P0-022：村中休整 —— 仅青石村显示；免费恢复 HP/MP 至最大值（战败软锁出口） */}
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

      {/* TM-P0-015：附近人物 —— 仅当前地点存在注册 NPC 时显示 */}
      {localNpcs.length > 0 && (
        <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
          <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近人物</h3>
          {showDialog && activeNpc && (
            <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/60 p-4">
              <p className="mb-1 text-xs tracking-wider text-bone-500">与{activeNpc.name}交谈</p>
              <p className="font-bold text-bone-100">{activeNpc.name}</p>
              <p className="mb-2 text-xs text-bone-500">{activeNpc.role}</p>
              {/* TM-P1-004：已回应且关系合法时，后续关系反应替代原 greeting 正文位置（不重复显示旧文案）；否则回退原 greeting */}
              <p className="mb-3 text-bone-300">
                {elderReaction === 'respect'
                  ? '村长郑重地点了点头：“若你还要继续追查，务必小心。”'
                  : elderReaction === 'trust'
                    ? '村长舒展了眉头：“好，村里能安稳一些就好。”'
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
                  <p className="mt-1 text-bone-300">下一步目的地：【待补充】</p>
                </div>
              )}
              {/* TM-P1-019：向村长复命村内调查——第四任务 in_progress + 调查 2/2 + 未复命时显示入口（与 P1-016 地图汇报入口严格分开）；成功后按钮消失并显示固定文案 */}
              {activeNpc.id === 'village_elder' && goldenSearchInProgress && goldenInvestigationCount === 2 && (
                goldenVillageInquiryReported ? (
                  <div className="mb-3 rounded border border-gold-500/40 bg-ink-900/40 p-3">
                    <p className="text-bone-200">你已经把调查结果告诉了村长。</p>
                    <p className="mt-1 text-bone-300">村里目前没人能够确认地图上的标记。</p>
                    <p className="mt-1 text-bone-300">下一步目的地：【待补充】</p>
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
        <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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
        <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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

      {/* TM-P0-017：附近威胁 —— 仅当前地点配置了敌人时显示（青石村等无敌人地点整个区域隐藏） */}
      {(() => {
        const configuredEnemies = location?.enemyIds ?? []
        if (configuredEnemies.length === 0) return null
        // TM-P1-010/P1-014：先计算「实际可见」敌人（魔化狼仅任务 in_progress 可见；嘟嘟兔持有《兔子的路径》后清场不可见），
        // 可见敌人为空时整个「附近威胁」区域不渲染（避免兔王巢穴嘟嘟兔清场后残留空面板）
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
            return true
          })
        if (visibleEnemies.length === 0) return null
        return (
          <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
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
                          HP {threat.maxHp} · 防御 {threat.defense}
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
                      仔细调查
                    </Button>
                  </>
                )}
              </>
            )
          })()}
        </section>
      )}

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近委托</h3>        {localQuests.length === 0 ? (
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

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">任务日志</h3>
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
                      <p className="mt-1 text-bone-300">下一步目的地：【待补充】</p>
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
                  {/* TM-P1-024：第五主线《商人王财的麻烦》进度提示——接受后显示目标；向王财询问后显示已了解+新目标+黑石塔待开放（本卡不开放黑石塔、不完成任务） */}
                  {qs.questId === 'quest_wangcai_trouble' && qs.status === 'in_progress' && (
                    <div className="mt-1 text-xs text-bone-400">
                      {wangcaiBriefed ? (
                        <>
                          <p className="text-gold-300">已向王财了解情况。</p>
                          <p className="mt-1">当前目标：调查黑石塔附近的情况。</p>
                          <p className="mt-1">黑石塔：【待开放】</p>
                        </>
                      ) : (
                        <p>当前目标：返回天龙城，找到商人王财了解情况。</p>
                      )}
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

      <footer className="flex items-center gap-4">
        <Button variant="primary" onClick={handleSave}>
          保存游戏
        </Button>
        {saveResult === 'saved' && <span className="text-sm text-gold-300">✓ 已保存</span>}
        {saveResult === 'failed' && <span className="text-sm text-red-300">✗ 保存失败</span>}
      </footer>
    </div>
  )
}
