import { useEffect, useRef, useState } from 'react'
import Button from '../../components/Button'
import Accordion from '../../components/Accordion'
import Drawer from '../../components/Drawer'
import RelationshipPanel from '../../components/game/RelationshipPanel'
import CompanionPanel from '../../components/game/CompanionPanel'
import { useGameStore } from '../../game/state/gameStore'
import { getClue, getQuest, getNpc, getItem, getActivityEvent, QUESTS } from '../../game/content'
import { getCurrentObjective, type CurrentObjective } from '../../game/rules/objective'
import { getDiscoveredClueIds } from '../../game/rules/clue'
import { isGoldenRabbitInvestigationComplete } from '../../game/rules/goldenRabbit'
import type { ClueCategory } from '../../game/types'
import type { GameState, QuestStatus } from '../../game/types'

/**
 * 右栏：冒险面板 V2（TM-P2-008 §5/§33-35）。
 * 结构：① 当前目标（固定顶部，仅一个）② Tab 切换（任务 / 线索 / 日志）。
 *   - 任务：进行中/可提交/附近委托/已完成折叠（原任务中心）
 *   - 线索：Clue Journal（getDiscoveredClueIds，UI 只显示 title/description/source，杜绝生产 ID 泄漏）
 *   - 日志：最近记录（Activity Feed + Drawer）+ 红颜录 + 伙伴
 * UI ephemeral state（useState）不进入 GameState。
 */
export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  undiscovered: '未发现',
  available: '可接受',
  in_progress: '进行中',
  completable: '可完成',
  completed: '已完成',
  failed: '失败',
}

/** 线索分类中文标签（UI 展示；缺省 fallback） */
const CLUE_CATEGORY_LABELS: Record<ClueCategory, string> = {
  map: '地图',
  north: '北郊',
  investigation: '调查',
  lore: '传闻',
}
const clueCategoryLabel = (category?: ClueCategory): string =>
  category ? CLUE_CATEGORY_LABELS[category] ?? '线索' : '线索'

/** Activity Feed 上限（TM-P2-009 §7）：右栏最近记录最多 5 条，消息中心 Drawer 最多 20 条 */
const RECENT_ACTIVITY_LIMIT = 5
const ACTIVITY_DRAWER_LIMIT = 20

type SidebarTab = 'quests' | 'clues' | 'log'

interface TaskActivitySidebarProps {
  /** 任务提交（GamePage 包装升级检测） */
  onCompleteQuest: (questId: string) => void
  /** 附近委托「查看」→ 跳转 NPC 交互面板（由 GamePage 处理） */
  onViewQuest: (questId: string) => void
  /** 接受/发现委托（默认走 store action；GamePage 可覆盖） */
  onAcceptQuest?: (questId: string) => void
}

/** 基于 GameState 推导最近记录（Activity Feed；UI 层轻量实现，不建 Event Sourcing） */
function deriveActivityItems(state: GameState): { id: string; category: '任务' | '战利品' | '成长' | '世界' | '系统'; text: string }[] {
  const items: { id: string; category: '任务' | '战利品' | '成长' | '世界' | '系统'; text: string }[] = []
  // 已完成任务（新完成在前）
  for (const qs of state.quests) {
    if (qs.status === 'completed') {
      const def = getQuest(qs.questId)
      items.push({ id: `quest-${qs.questId}`, category: '任务', text: `《${def?.title ?? '未知任务'}》已完成` })
    }
  }
  // 世界：青石村阶段完成（TM-P2-006 第 16 节：阶段播报移入 Activity Feed，不再常驻中央大卡）
  if (state.world.flags.rabbit_path_reported === true) {
    items.push({ id: 'world-qingshi-stage', category: '世界', text: '青石村阶段完成' })
  }
  // 剧情世界事件（TM-P2-009 §6：只展示已登记事件的用户文案；未知事件宁可隐藏，不泄露内部 event id）
  // 同一事件可多次触发（如每次完成任务都写入 village_elder_post_quest_response），
  // 用事件索引保证 React key 唯一，避免相同 eventId 触发重复 key 警告。
  for (let i = 0; i < state.world.completedEvents.length; i += 1) {
    const eventId = state.world.completedEvents[i]
    if (!eventId) continue
    const def = getActivityEvent(eventId)
    if (!def) continue
    items.push({ id: `event-${eventId}-${i}`, category: '世界', text: def.text })
  }
  // 关键道具（战利品/线索）
  const pathDef = getItem('rabbit_path')
  if (pathDef && state.inventory.some((e) => e.itemId === 'rabbit_path' && e.quantity >= 1)) {
    items.push({ id: 'loot-rabbit_path', category: '战利品', text: `获得《${pathDef.name}》` })
  }
  const necklaceDef = getItem('kuidong_necklace')
  if (necklaceDef && state.inventory.some((e) => e.itemId === 'kuidong_necklace' && e.quantity >= 1)) {
    items.push({ id: 'loot-kuidong_necklace', category: '战利品', text: `获得《${necklaceDef.name}》` })
  }
  // 成长（等级/阅历）
  if (state.player.level >= 2) {
    items.push({ id: 'growth-level', category: '成长', text: `达到 Lv.${state.player.level}` })
  }
  return items
}

export default function TaskActivitySidebar({ onCompleteQuest, onViewQuest, onAcceptQuest }: TaskActivitySidebarProps) {
  const gameState = useGameStore((s) => s.gameState)
  const acceptQuest = useGameStore((s) => s.acceptQuest)
  const discoverQuest = useGameStore((s) => s.discoverQuest)
  const [activeTab, setActiveTab] = useState<SidebarTab>('quests')
  const [activityOpen, setActivityOpen] = useState(false)
  // 已完成任务详情展开（仅 UI）
  const [completedDetail, setCompletedDetail] = useState<string | null>(null)
  // 附近委托详情展开（仅 UI）
  const [nearbyDetail, setNearbyDetail] = useState<string | null>(null)
  // ---- Clue 未读（TM-P2-009 §5：UI-only seenClueIds，不进 GameState / Save V6）----
  // 页面加载时存量线索视为已读；本次页面生命周期中新发现线索为未读；打开线索 Tab 后全部已读。
  const [seenClueIds, setSeenClueIds] = useState<string[]>([])
  const seenInitialized = useRef(false)
  useEffect(() => {
    if (!gameState || seenInitialized.current) return
    seenInitialized.current = true
    setSeenClueIds(getDiscoveredClueIds(gameState))
  }, [gameState])

  // TM-P2-009-R1 §2.2：停留在线索 Tab 时，新发现线索实时同步进 seenClueIds（切走任务 Tab 后不再变回未读）
  const seenClueKeyRef = useRef<string>('')
  useEffect(() => {
    if (activeTab !== 'clues' || !gameState) return
    const discovered = getDiscoveredClueIds(gameState)
    const key = discovered.join('|')
    if (key === seenClueKeyRef.current) return
    seenClueKeyRef.current = key
    setSeenClueIds(discovered)
  }, [activeTab, gameState])

  if (!gameState) return null
  const { player, world } = gameState

  const objective: CurrentObjective | null = getCurrentObjective(gameState)

  // ---- 任务分组 ----
  const inProgress = gameState.quests.filter((q) => q.status === 'in_progress')
  const completable = gameState.quests.filter((q) => q.status === 'completable')
  const completed = gameState.quests.filter((q) => q.status === 'completed')
  const failed = gameState.quests.filter((q) => q.status === 'failed')

  // 附近委托 = 给予者位于当前地点的注册任务（与 GamePage 原逻辑一致；不含已接/已完成）
  const nearbyQuests = Object.values(QUESTS)
    .filter((quest) => {
      const giver = getNpc(quest.giverNpcId)
      if (giver?.locationId !== world.currentLocationId) return false
      // UI 侧窄前置（与 Store discoverQuest 一致）
      if (quest.id === 'quest_mine_cleanup') {
        return gameState.quests.some((q) => q.questId === 'quest_village_monsters' && q.status === 'completed')
      }
      if (quest.id === 'quest_grassland_wolf') {
        return gameState.quests.some((q) => q.questId === 'quest_mine_cleanup' && q.status === 'completed')
      }
      if (quest.id === 'quest_golden_rabbit_search') {
        return world.flags.rabbit_path_reported === true
      }
      if (quest.id === 'quest_apothecary_herb_route') {
        return gameState.quests.some((q) => q.questId === 'quest_village_monsters' && q.status === 'completed')
      }
      if (quest.id === 'quest_blacksmith_mine_remnant') {
        return gameState.quests.some((q) => q.questId === 'quest_mine_cleanup' && q.status === 'completed')
      }
      if (quest.id === 'quest_north_gate_missing_patrol') {
        return gameState.quests.some((q) => q.questId === 'quest_wangcai_trouble' && q.status === 'completed')
      }
      if (quest.id === 'quest_north_outskirts') {
        return gameState.quests.some((q) => q.questId === 'quest_north_gate_missing_patrol' && q.status === 'completed')
      }
      if (quest.id === 'quest_north_broken_banner') {
        return gameState.quests.some((q) => q.questId === 'quest_north_outskirts' && q.status === 'completed')
      }
      if (quest.id === 'quest_sakura_boundary') return false
      return true
    })
    .map((quest) => {
      const qs = gameState.quests.find((q) => q.questId === quest.id)
      const status = qs?.status ?? 'undiscovered'
      if (status === 'in_progress' || status === 'completable' || status === 'completed') return null
      return { def: quest, status }
    })
    .filter((entry): entry is { def: (typeof QUESTS)[string]; status: 'undiscovered' | 'available' } => entry !== null)

  const activityItems = deriveActivityItems(gameState)

  // ---- 线索 Journal ----
  const discoveredClueIds = getDiscoveredClueIds(gameState)
  // 停留在线索 Tab 时新发现线索直接视为已读（玩家已在看该页面）
  const effectiveSeenClueIds = activeTab === 'clues' ? discoveredClueIds : seenClueIds
  const unreadClueIds = discoveredClueIds.filter((id) => !effectiveSeenClueIds.includes(id))

  const openCluesTab = () => {
    setActiveTab('clues')
    setSeenClueIds((prev) => Array.from(new Set([...prev, ...discoveredClueIds])))
  }

  const handleNearbyAction = (questId: string, status: 'undiscovered' | 'available') => {
    if (status === 'undiscovered') {
      discoverQuest(questId)
    } else if (onAcceptQuest) {
      onAcceptQuest(questId)
    } else {
      acceptQuest(questId)
    }
  }

  const tabButton = (key: SidebarTab, label: string, count?: number, onClickOverride?: () => void) => (
    <button
      type="button"
      role="tab"
      aria-selected={activeTab === key}
      data-active-tab={activeTab === key ? 'true' : 'false'}
      onClick={onClickOverride ?? (() => setActiveTab(key))}
      className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm transition-colors ${
        activeTab === key
          ? 'bg-gold-500/20 font-bold text-gold-200'
          : 'text-bone-500 hover:bg-ink-700/40 hover:text-bone-300'
      }`}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className="rounded-full bg-gold-500/30 px-1.5 text-xs text-gold-200">{count}</span>
      )}
    </button>
  )

  return (
    <div data-testid="quest-column" className="flex h-full flex-col gap-4">
      {/* ① 当前目标（固定顶部，只显示一个） */}
      <section className="rounded border border-gold-500/50 bg-gold-900/20 p-4 text-sm text-bone-300">
        <h3 className="mb-2 text-xs font-bold tracking-wider text-gold-300">当前目标</h3>
        {objective ? (
          <>
            <p className="font-bold text-bone-100">《{objective.title}》</p>
            <p className="mt-1 leading-relaxed text-bone-200">{objective.objective}</p>
            {objective.locationHint && <p className="mt-1 text-xs text-bone-500">地点提示：{objective.locationHint}</p>}
          </>
        ) : (
          <p className="text-bone-500">暂无当前目标。</p>
        )}
      </section>

      {/* ② Tab 切换（任务 / 线索 / 日志；TM-P2-008 §5） */}
      <div role="tablist" aria-label="冒险面板" className="flex gap-2 border-b border-ink-600 pb-2">
        {tabButton('quests', '任务')}
        {tabButton('clues', '线索', unreadClueIds.length, openCluesTab)}
        {tabButton('log', '日志')}
      </div>

      {/* ③ 任务 Tab */}
      {activeTab === 'quests' && (
        <div className="flex flex-col gap-3">
          {/* 进行中 */}
          {inProgress.length > 0 && (
            <Accordion title={`进行中（${inProgress.length}）`} defaultOpen ariaLabel="进行中的任务">
              <div className="flex flex-col gap-3">
                {inProgress.map((qs) => (
                  <QuestRow key={qs.questId} questId={qs.questId} gameState={gameState} compact />
                ))}
              </div>
            </Accordion>
          )}

          {/* 可提交 */}
          {completable.length > 0 && (
            <Accordion title={`可提交（${completable.length}）`} defaultOpen ariaLabel="可提交的任务">
              <div className="flex flex-col gap-3">
                {completable.map((qs) => {
                  const def = getQuest(qs.questId)
                  const giver = def ? getNpc(def.giverNpcId) : undefined
                  const canSubmit = giver?.locationId === world.currentLocationId
                  return (
                    <div key={qs.questId} className="rounded border border-gold-500/40 bg-ink-900/40 p-3">
                      <p className="font-bold text-bone-100">{def?.title ?? '未知任务'}</p>
                      <p className="mt-1 text-xs text-bone-500">{def?.summary ?? '异常任务（无法识别）'}</p>
                      {def?.goldReward !== undefined && (
                        <p className="mt-1 text-xs text-gold-300">奖励：{def.goldReward} 金币</p>
                      )}
                      {qs.questId === 'quest_north_gate_missing_patrol' && (
                        <p className="mt-1 text-xs text-gold-300">黑鬃魔狼已击败，找到了断裂的铜牌。返回武馆，将发现告诉马科。</p>
                      )}
                      {canSubmit ? (
                        <Button variant="primary" className="mt-2" onClick={() => onCompleteQuest(qs.questId)}>
                          提交任务
                        </Button>
                      ) : (
                        <p className="mt-2 text-xs text-bone-500">前往任务发布者处提交</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </Accordion>
          )}

          {/* 附近委托 */}
          {nearbyQuests.length > 0 && (
            <Accordion title={`附近委托（${nearbyQuests.length}）`} defaultOpen ariaLabel="附近委托">
              <div className="flex flex-col gap-2">
                {nearbyQuests.map(({ def, status }) => {
                  const giver = getNpc(def.giverNpcId)
                  const isDetail = nearbyDetail === def.id
                  return (
                    <div key={def.id} className="rounded border border-ink-600 bg-ink-900/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-bone-200">
                          {giver?.name ?? '异常人物'}：《{def.title}》
                        </p>
                        <Button variant="ghost" onClick={() => setNearbyDetail(isDetail ? null : def.id)}>
                          {isDetail ? '收起' : '查看'}
                        </Button>
                      </div>
                      {isDetail && (
                        <div className="mt-2 text-xs leading-relaxed text-bone-400">
                          <p>{def.summary}</p>
                          <div className="mt-2 flex gap-2">
                            {status === 'undiscovered' ? (
                              <Button variant="primary" onClick={() => handleNearbyAction(def.id, 'undiscovered')}>
                                查看委托
                              </Button>
                            ) : (
                              <Button variant="primary" onClick={() => handleNearbyAction(def.id, 'available')}>
                                接受任务
                              </Button>
                            )}
                            <Button variant="ghost" onClick={() => onViewQuest(def.id)}>
                              找到发布者
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Accordion>
          )}

          {/* 已完成（默认折叠） */}
          {completed.length > 0 && (
            <Accordion title={`已完成（${completed.length}）`} ariaLabel="已完成的任务">
              <div className="flex flex-col gap-1">
                {completed.map((qs) => {
                  const def = getQuest(qs.questId)
                  const isDetail = completedDetail === qs.questId
                  return (
                    <div key={qs.questId}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm text-bone-300 hover:bg-ink-700/40"
                        onClick={() => setCompletedDetail(isDetail ? null : qs.questId)}
                      >
                        <span>{def?.title ?? '未知任务'}</span>
                        <span className="shrink-0 text-xs text-bone-500">已完成</span>
                      </button>
                      {isDetail && (
                        <div className="mb-1 rounded border border-ink-600 bg-ink-900/40 px-3 py-2 text-xs leading-relaxed text-bone-400">
                          <p>{def?.summary ?? '异常任务（无法识别）'}</p>
                          {def?.goldReward !== undefined && <p className="mt-1 text-gold-300">奖励：{def.goldReward} 金币</p>}
                          {qs.questId === 'quest_wangcai_trouble' && qs.status === 'completed' && (
                            <p className="mt-1 text-bone-300">第一阶段主线已经告一段落。《追寻黄金兔子王》仍需等待新的线索。</p>
                          )}
                          {qs.questId === 'quest_north_gate_missing_patrol' && qs.status === 'completed' && (
                            <p className="mt-1 text-bone-300">北门失联 · 已完成</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {failed.length > 0 && (
                  <div className="mt-2 border-t border-ink-600 pt-2">
                    <p className="px-2 text-xs text-bone-500">失败（{failed.length}）</p>
                    {failed.map((qs) => (
                      <p key={qs.questId} className="px-2 py-1 text-sm text-bone-500">
                        {getQuest(qs.questId)?.title ?? '未知任务'}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </Accordion>
          )}
        </div>
      )}

      {/* ④ 线索 Tab（Clue Journal V2：默认折叠 + 未读标记；UI 只显示 title/description/source，杜绝生产 ID 泄漏） */}
      {activeTab === 'clues' && <ClueJournalList gameState={gameState} unreadClueIds={unreadClueIds} />}

      {/* ⑤ 日志 Tab（最近记录 Activity Feed） */}
      {activeTab === 'log' && (
        <div className="flex flex-col gap-4">
          <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
            <h3 className="mb-2 text-xs font-bold tracking-wider text-bone-500">最近记录</h3>
            {activityItems.length === 0 ? (
              <p className="text-bone-500">暂无记录。</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {activityItems.slice(0, RECENT_ACTIVITY_LIMIT).map((item) => (
                  <li key={item.id} className="flex items-start gap-2 text-xs text-bone-400">
                    <span className="shrink-0 text-bone-500">[{item.category}]</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            )}
            {activityItems.length > RECENT_ACTIVITY_LIMIT && (
              <Button variant="ghost" className="mt-2" onClick={() => setActivityOpen(true)}>
                查看全部
              </Button>
            )}
          </section>
        </div>
      )}

      {/* 红颜录 / 伙伴（TM-P2-008 §33-35：长期信息常驻右栏底部，不依赖 Tab 切换；兼容 P2-004 旧面板断言） */}
      <div className="mt-4 flex flex-col gap-4">
        <RelationshipPanel />
        <CompanionPanel />
      </div>

      {/* Activity Drawer（消息中心；TM-P2-009 §7 上限 20 条） */}
      <Drawer open={activityOpen} onClose={() => setActivityOpen(false)} title="消息中心" ariaLabel="消息中心">
        <div className="flex flex-col gap-2">
          {activityItems.slice(0, ACTIVITY_DRAWER_LIMIT).map((item) => (
            <div key={item.id} className="rounded border border-ink-600 bg-ink-900/40 px-3 py-2 text-sm text-bone-300">
              <span className="mr-2 text-xs text-gold-300">[{item.category}]</span>
              {item.text}
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  )
}

/** 线索 Journal 列表（TM-P2-009 §4：Clue Journal V2 默认折叠 + 未读标记）。
 *  每条 Clue Card 默认只显示标题/分类/未读标记（如有）/展开按钮；展开后显示 description/source。
 *  同一时间最多展开 1 条（expandedClueId 纯 UI state，不进 GameState / Save）。
 *  独立导出以便纯 SSR 组件测试（与 BackpackPanel 的导出纯函数模式一致）。 */
export function ClueJournalList({
  gameState,
  unreadClueIds = [],
}: {
  gameState: GameState
  unreadClueIds?: string[]
}) {
  const discoveredClueIds = getDiscoveredClueIds(gameState)
  const [expandedClueId, setExpandedClueId] = useState<string | null>(null)
  return (
    <section className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
      <h3 className="mb-2 text-xs font-bold tracking-wider text-gold-300">线索录</h3>
      {discoveredClueIds.length === 0 ? (
        <p className="text-bone-500">尚未发现任何线索。探索场景、与人交谈、调查现场，新发现会记录在这里。</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {discoveredClueIds.map((id) => {
            const def = getClue(id)
            if (!def) return null
            const isExpanded = expandedClueId === def.id
            const isUnread = unreadClueIds.includes(def.id)
            return (
              <li key={def.id} className="rounded border border-ink-600 bg-ink-900/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-bold text-bone-100">
                    {isUnread && (
                      <span aria-label="未读线索" className="shrink-0 text-gold-300">
                        ●
                      </span>
                    )}
                    {def.title}
                  </p>
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-gold-500/20 px-2 py-0.5 text-xs text-gold-300">
                      {clueCategoryLabel(def.category)}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-bone-400 hover:text-bone-200"
                      onClick={() => setExpandedClueId(isExpanded ? null : def.id)}
                    >
                      {isExpanded ? '收起' : '展开'}
                    </button>
                  </span>
                </div>
                {isExpanded && (
                  <>
                    <p className="mt-1 text-xs leading-relaxed text-bone-400">{def.description}</p>
                    {def.source && <p className="mt-1 text-xs text-bone-500">来源：{def.source}</p>}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** 进行中任务行（进度提示，从原「冒险日志」迁移） */
function QuestRow({ questId, gameState, compact }: { questId: string; gameState: GameState; compact?: boolean }) {
  const def = getQuest(questId)
  const qs = gameState.quests.find((q) => q.questId === questId)
  if (!qs) return null
  const world = gameState.world
  const goldenSearchQuest = gameState.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  const goldenAskedBlacksmith = goldenSearchQuest?.flags.asked_blacksmith === true
  const goldenAskedApothecary = goldenSearchQuest?.flags.asked_apothecary === true
  const goldenInvestigationCount = (goldenAskedBlacksmith ? 1 : 0) + (goldenAskedApothecary ? 1 : 0)
  const goldenVillageInquiryReported = goldenSearchQuest?.flags.village_inquiry_reported === true
  const goldenLairRechecked = goldenSearchQuest?.flags.rabbit_lair_rechecked === true
  // TM-P2-009-R1 §12：Golden Rabbit 四调查全部完成 → 派生「待续」（内部 status 仍 in_progress，零状态修改）
  const goldenRabbitInvestigationComplete = isGoldenRabbitInvestigationComplete(gameState)
  const northGateQuest = gameState.quests.find((q) => q.questId === 'quest_north_gate_missing_patrol')
  const northGateTrailChecked = northGateQuest?.flags.north_gate_trail_checked === true
  const northGateWolfDefeated = northGateQuest?.flags.north_gate_wolf_defeated === true
  const northOutskirtsQuest = gameState.quests.find((q) => q.questId === 'quest_north_outskirts')
  const northOutskirtsTrailTracked = northOutskirtsQuest?.flags.north_outskirts_trail_tracked === true
  const northOutskirtsAmbushFound = northOutskirtsQuest?.flags.north_outskirts_ambush_found === true
  const northOutskirtsAmbushInvestigated = northOutskirtsQuest?.flags.north_outskirts_ambush_investigated === true
  // TM-P2-009：《断旗余声》Stage A-F 进度读取
  const brokenBannerQuest = gameState.quests.find((q) => q.questId === 'quest_north_broken_banner')
  const brokenBannerBriefed = brokenBannerQuest?.flags.north_broken_banner_make_briefed === true
  const waystationSearched = brokenBannerQuest?.flags.north_waystation_searched === true
  const waystationBarrierResolved = brokenBannerQuest?.flags.north_waystation_barrier_resolved === true
  const waystationSurvivorRescued = brokenBannerQuest?.flags.north_waystation_survivor_rescued === true
  const waystationSurvivorDebriefed = brokenBannerQuest?.flags.north_waystation_survivor_debriefed === true
  const wangcaiQuest = gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
  const wangcaiBriefed = wangcaiQuest?.flags.wangcai_briefed === true
  const towerUnlocked = world.flags.black_stone_tower_unlocked === true
  const towerFloor2Unlocked = world.flags.black_stone_tower_floor2_unlocked === true
  const towerFloor3Unlocked = world.flags.black_stone_tower_floor3_unlocked === true
  const floor1SoldierDefeated = wangcaiQuest?.flags.floor1_soldier_defeated === true
  const floor1CaptainDefeated = wangcaiQuest?.flags.floor1_captain_defeated === true
  const floor2ZombieDefeated = wangcaiQuest?.flags.floor2_zombie_defeated === true
  const floor2BlackMageDefeated = wangcaiQuest?.flags.floor2_black_mage_defeated === true
  const floor2SkeletonWarriorDefeated = wangcaiQuest?.flags.floor2_skeleton_warrior_defeated === true
  const floor3SkeletonWitchDefeated = wangcaiQuest?.flags.floor3_skeleton_witch_defeated === true
  const kuidongNecklaceReturned = wangcaiQuest?.flags.kuidong_necklace_returned === true

  return (
    <div className="rounded border border-ink-600 bg-ink-900/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-bold text-bone-100">{def?.title ?? '未知任务'}</p>
        <span
          className={`shrink-0 text-xs ${goldenRabbitInvestigationComplete ? 'text-bone-500' : 'text-gold-300'}`}
        >
          {goldenRabbitInvestigationComplete ? '待续' : '进行中'}
        </span>
      </div>
      {!compact && <p className="mt-1 text-xs leading-relaxed text-bone-500">{def?.summary ?? '异常任务（无法识别）'}</p>}
      {/* 进度提示（保持与 P2-005 语义一致）；TM-P2-009-R1 §12：四调查完成时派生「待续」，不再显示「还有一步没做」 */}
      {questId === 'quest_golden_rabbit_search' && qs.status === 'in_progress' && (
        goldenRabbitInvestigationComplete ? (
          <div className="mt-2 rounded border border-bone-700/50 bg-ink-900/40 p-2 text-xs leading-relaxed">
            <p className="font-bold text-bone-100">现阶段线索已收集 · 待续</p>
            <p className="mt-1 text-bone-300">你已经完成目前可调查的内容。</p>
            <p className="mt-1 text-bone-300">下一步线索尚未开放。</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-bone-400">地图线索调查：{goldenInvestigationCount} / 2</p>
            {goldenInvestigationCount === 2 && (
              <div className="mt-2 rounded border border-gold-500/40 bg-ink-900/40 p-2 text-xs leading-relaxed text-bone-200">
                <p>你已经向铁匠和药师打听过，但仍无法确认地图指向的具体地点。</p>
                <p className="mt-1 text-bone-300">地图上的标记仍无法对应到任何已知地点。</p>
              </div>
            )}
            {goldenVillageInquiryReported && (
              <p className="mt-1 text-xs text-gold-300">村内调查已汇报。</p>
            )}
            {goldenVillageInquiryReported && !goldenLairRechecked && (
              <p className="mt-1 text-xs text-bone-400">当前目标：返回兔王巢穴重新比对地图。</p>
            )}
            {goldenLairRechecked && (
              <p className="mt-1 text-xs text-gold-300">巢穴复查完成。</p>
            )}
          </>
        )
      )}
      {questId === 'quest_apothecary_herb_route' && qs.status === 'in_progress' && (
        <p className="mt-1 text-xs text-bone-400">当前目标：前往村外草原查看采药区域。</p>
      )}
      {questId === 'quest_blacksmith_mine_remnant' && qs.status === 'in_progress' && (
        <p className="mt-1 text-xs text-bone-400">当前目标：前往废弃矿洞处理残余的魔化鼠。</p>
      )}
      {questId === 'quest_wangcai_trouble' && qs.status === 'in_progress' && (
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
      {questId === 'quest_north_gate_missing_patrol' && qs.status === 'in_progress' && (
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
      {questId === 'quest_north_gate_missing_patrol' && qs.status === 'completable' && (
        <div className="mt-1 text-xs text-bone-400">
          <p className="text-gold-300">黑鬃魔狼已击败，找到了断裂的铜牌。</p>
          <p className="mt-1">当前目标：返回武馆，将发现告诉马科。</p>
        </div>
      )}
      {northGateWolfDefeated && questId === 'quest_north_gate_missing_patrol' && (
        <p className="mt-1 text-xs text-bone-500">北门外的黑鬃魔狼已击败。</p>
      )}
      {questId === 'quest_north_outskirts' && qs.status === 'in_progress' && (
        <div className="mt-1 text-xs text-bone-400">
          {!northOutskirtsTrailTracked ? (
            <>
              <p>当前目标：返回天龙城北门，沿着巡逻队留下的足迹继续追踪。</p>
              <p className="mt-1 text-bone-300">失联巡逻队显然没有停在这里。</p>
            </>
          ) : !northOutskirtsAmbushFound ? (
            <>
              <p className="text-gold-300">足迹已发现，向北郊延伸。</p>
              <p className="mt-1">当前目标：前往北郊追踪足迹，找到袭击现场。</p>
            </>
          ) : !northOutskirtsAmbushInvestigated ? (
            <>
              <p className="text-gold-300">袭击现场已找到。</p>
              <p className="mt-1">当前目标：调查袭击现场，查明巡逻队的遭遇。</p>
            </>
          ) : (
            <>
              <p className="text-gold-300">袭击现场已调查。</p>
              <p className="mt-1">当前目标：返回北门或武馆，将发现告诉马科。</p>
            </>
          )}
        </div>
      )}
      {questId === 'quest_north_outskirts' && qs.status === 'completable' && (
        <div className="mt-1 text-xs text-bone-400">
          <p className="text-gold-300">北郊的发现已汇总。</p>
          <p className="mt-1">当前目标：返回武馆，向马科汇报。</p>
        </div>
      )}
      {questId === 'quest_north_broken_banner' && qs.status === 'in_progress' && (
        <div className="mt-1 text-xs text-bone-400">
          {!brokenBannerBriefed ? (
            <p>当前目标：返回武馆，听马科说明北郊驿站的异常。</p>
          ) : !waystationSearched ? (
            <>
              <p className="text-gold-300">已向马科了解情况，旧驿站的路线已确认。</p>
              <p className="mt-1">当前目标：前往北郊旧驿站搜索。</p>
            </>
          ) : !waystationBarrierResolved ? (
            <>
              <p className="text-gold-300">旧驿站已搜索，发现断裂的巡逻队战旗。</p>
              <p className="mt-1">当前目标：解开驿站的屏障。</p>
            </>
          ) : !waystationSurvivorRescued ? (
            <>
              <p className="text-gold-300">驿站屏障已解除。</p>
              <p className="mt-1">当前目标：搜救驿站中的幸存者。</p>
            </>
          ) : !waystationSurvivorDebriefed ? (
            <>
              <p className="text-gold-300">驿站中的幸存者已救出。</p>
              <p className="mt-1">当前目标：向幸存的骑士沈拓了解详情。</p>
            </>
          ) : (
            <>
              <p className="text-gold-300">沈拓的证词已听完。</p>
              <p className="mt-1">当前目标：返回武馆，向马科汇报。</p>
            </>
          )}
        </div>
      )}
      {questId === 'quest_north_broken_banner' && qs.status === 'completable' && (
        <div className="mt-1 text-xs text-bone-400">
          <p className="text-gold-300">北郊驿站的真相已查明。</p>
          <p className="mt-1">当前目标：返回武馆，向马科提交任务。</p>
        </div>
      )}
    </div>
  )
}
