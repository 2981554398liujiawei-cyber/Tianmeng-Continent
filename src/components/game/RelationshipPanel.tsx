import { useState } from 'react'
import Button from '../Button'
import { useGameStore, type SakuraTalkTopic } from '../../game/state/gameStore'
import { getCompanion, getItem, getNpc } from '../../game/content'
import { isRomanceableNpc, getRelationshipProfile } from '../../game/content/relationships'
import { getUsableSkills } from '../../game/rules/skill'

const STAGE_LABELS: Record<string, string> = {
  stranger: '陌生',
  acquaintance: '相识',
  trusted: '信任',
  close: '亲近',
  romance: '恋慕',
  committed: '相守',
}

const TALK_TOPICS: { topic: SakuraTalkTopic; label: string }[] = [
  { topic: 'continent', label: '聊一聊天梦大陆' },
  { topic: 'wound', label: '询问她的伤势' },
  { topic: 'past', label: '询问她的过去' },
]

/**
 * 红颜录（TM-P2-004 第 73-77 节）。
 * 第一次真正见面后（即使未缔约）Sakura 进红颜录；展示姓名/身份/阶段/好感/信任/是否同行/简介。
 * 与伙伴面板分开：已相识未 recruited → 红颜录存在 + 伙伴列表不存在；recruited → 两边都在。
 * 提供：常驻交谈（每休整周期前 2 次基础收益）与赠礼入口。
 */
export default function RelationshipPanel() {
  const gameState = useGameStore((s) => s.gameState)
  const talkToSakura = useGameStore((s) => s.talkToSakura)
  const giveGift = useGameStore((s) => s.giveGift)
  const [note, setNote] = useState<string | null>(null)
  const [talkedTopics, setTalkedTopics] = useState<Record<string, boolean>>({})
  const [lastGiftId, setLastGiftId] = useState<string | null>(null)

  if (!gameState) return null

  const relationships = Object.values(gameState.relationships).filter((rel) => isRomanceableNpc(rel.npcId))
  if (relationships.length === 0) return null

  const activeCompanionIds = gameState.party?.activeCompanionIds ?? []
  const giftItems = gameState.inventory
    .map((entry) => ({ entry, def: getItem(entry.itemId) }))
    .filter(({ entry, def }) => def && (def.type === 'gift' || def.giftTags) && Number.isSafeInteger(entry.quantity) && entry.quantity >= 1)

  const handleTalk = (npcId: string, topic: SakuraTalkTopic) => {
    const result = talkToSakura(topic)
    if (!result) return
    if (result.outcome === 'talked') {
      const parts: string[] = []
      if (result.affectionDelta !== 0) parts.push(`好感 ${result.affectionDelta > 0 ? '+' : ''}${result.affectionDelta}`)
      if (result.trustDelta !== 0) parts.push(`信任 ${result.trustDelta > 0 ? '+' : ''}${result.trustDelta}`)
      setNote(parts.length ? `交谈：${parts.join('  ')}` : '你们聊了一会儿。')
      setTalkedTopics((prev) => ({ ...prev, [`${npcId}:${topic}`]: true }))
    } else if (result.outcome === 'cycle_limited') {
      setNote('你们聊了一会儿。她看起来心情平静——（本休整周期内已没有更多收获）')
    }
  }

  const handleGift = (npcId: string, itemId: string) => {
    const result = giveGift(npcId, itemId)
    if (!result) return
    if (result.outcome === 'given') {
      const def = getItem(itemId)
      setNote(`赠礼：${def?.name ?? '物品数据异常'} 好感 +${result.affectionDelta}`)
      setLastGiftId(itemId)
    } else if (result.outcome === 'already_gifted') {
      setNote('她今天已经收过你的礼物了。')
    } else if (result.outcome === 'not_owned') {
      setNote('你身上没有这样东西。')
    } else {
      setNote('她婉拒了这份礼物。')
    }
  }

  return (
    <section className="rounded border border-ink-600 bg-ink-800/40 p-4">
      <h3 className="text-base font-bold tracking-wider text-bone-100">
        红颜录
        <span className="ml-2 text-xs font-normal text-bone-500">已相识的角色</span>
      </h3>
      <div className="mt-3 space-y-3">
        {relationships.map((rel) => {
          const npc = getNpc(rel.npcId)
          const companion = gameState.companions[rel.npcId]
          const def = companion ? getCompanion(companion.companionId) : undefined
          const profile = getRelationshipProfile(rel.npcId)
          const isActive = activeCompanionIds.includes(rel.npcId)
          const skills = companion ? getUsableSkills(companion.learnedSkillIds, undefined) : []
          return (
            <div key={rel.npcId} className="rounded border border-sakura-500/40 bg-ink-900/50 p-3 text-sm text-bone-300">
              <p className="font-bold text-bone-100">
                {npc?.name ?? def?.name ?? rel.npcId}
                <span className="ml-2 text-xs font-normal text-bone-500">
                  {def?.classification === 'divine_contract_pet' ? '樱花女神 · 神契宠物' : (profile?.romanceable ? '可攻略' : '')}
                </span>
              </p>
              <p className="mt-1 text-xs text-bone-500">
                阶段：{STAGE_LABELS[rel.stage] ?? rel.stage} · 好感 {rel.affection}/100 · 信任 {rel.trust}/100 ·{' '}
                {companion ? (isActive ? '同行中' : '未同行') : '尚未缔约'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-bone-500">
                {def?.summary ?? npc?.summary ?? ''}
              </p>
              {companion && skills.length > 0 && (
                <p className="mt-1 text-xs text-bone-500">
                  技能：{skills.map((skill) => skill.name).join('、')}
                </p>
              )}
              {note && <p className="mt-2 text-xs text-sakura-300">{note}</p>}
              {/* 常驻交谈（TM-P2-004 第 62/63 节） */}
              <div className="mt-2 flex flex-col items-start gap-1.5">
                {TALK_TOPICS.map(({ topic, label }) => (
                  <Button key={topic} variant="primary" onClick={() => handleTalk(rel.npcId, topic)}>
                    {label}
                  </Button>
                ))}
              </div>
              {/* 赠礼（TM-P2-004 第 68/69 节） */}
              {giftItems.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-bone-500">赠礼：</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {giftItems.map(({ entry, def }) => (
                      <Button
                        key={entry.itemId}
                        variant="ghost"
                        onClick={() => handleGift(rel.npcId, entry.itemId)}
                      >
                        {def?.name} ×{entry.quantity}
                      </Button>
                    ))}
                  </div>
                  {lastGiftId && <p className="mt-1 text-xs text-bone-500">（同一休整周期内她只收一份礼物）</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
