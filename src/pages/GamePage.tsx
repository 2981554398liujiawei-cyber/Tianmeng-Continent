import { useState } from 'react'
import Button from '../components/Button'
import { useGameStore, VILLAGE_ELDER_POST_QUEST_EVENT_ID } from '../game/state/gameStore'
import { getProfessionName, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../game/content/professions'
import { getEnemy, getItem, getLocation, getNpc, getQuest, NPCS, QUESTS } from '../game/content'
import { CHECK_DC, type D20CheckResult } from '../game/rules/d20'
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
  const [saveResult, setSaveResult] = useState<'saved' | 'failed' | null>(null)
  const [travelError, setTravelError] = useState(false)
  // TM-P0-015：活动对话 NPC（仅 UI 本地状态，不进入 GameState / 存档）
  const [activeNpcId, setActiveNpcId] = useState<string | null>(null)
  // TM-P0-016：本次调查的即时检定结果（仅 UI 本地状态；离开矿洞清空）
  const [lastMineInvestigation, setLastMineInvestigation] = useState<D20CheckResult | null>(null)

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
  // TM-P0-006：附近委托 = 给予者位于当前地点的注册任务（不写死地点 ID）
  const localQuests = Object.values(QUESTS).filter((quest) => {
    const giver = getNpc(quest.giverNpcId)
    return giver?.locationId === world.currentLocationId
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
    if (Number.isFinite(respect) && respect >= 1) return 'respect'
    if (Number.isFinite(trust) && trust >= 2) return 'trust'
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
        return (
          <section className="rounded border border-gold-500/40 bg-gold-500/5 p-5 text-sm text-bone-300">
            <h3 className="mb-3 text-sm font-bold tracking-wider text-gold-300">新的线索</h3>
            <p className="font-bold text-bone-100">{pathDef.name}</p>
            <p className="mt-1 leading-relaxed text-bone-300">{pathDef.description}</p>
          </section>
        )
      })()}

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
      {(location?.enemyIds?.length ?? 0) > 0 && (
        <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
          <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">附近威胁</h3>
          <div className="flex flex-col gap-3">
            {location!.enemyIds!.map((enemyId) => {
              const threat = getEnemy(enemyId)
              if (!threat) return null
              const cannotFight = player.hp <= 0
              return (
                <div key={enemyId} className="rounded border border-ink-600 bg-ink-900/40 p-3">
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
      )}

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
                  {canSubmit && (
                    <div className="mt-2">
                      <Button variant="primary" onClick={() => completeQuest(qs.questId)}>
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
