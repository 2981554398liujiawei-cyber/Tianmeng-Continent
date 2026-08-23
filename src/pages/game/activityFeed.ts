import { getItem, getQuest } from '../../game/content'
import type { GameState } from '../../game/types'

/**
 * 阶段播报 / 系统通知（TM-P2-006）：不再常驻中央大卡。
 * 由 GameState 推导的阶段记录 → 右栏「最近记录」+ 消息中心 Drawer。
 * 轻量实现：不建 Event Sourcing / 永久日志。
 */
export interface ActivityItem {
  id: string
  category: '任务' | '战利品' | '成长' | '世界' | '系统'
  text: string
}

/** 从 GameState 推导关键阶段记录（UI 层；最新在前） */
export function deriveActivityItems(state: GameState): ActivityItem[] {
  const items: ActivityItem[] = []
  const { player, world, quests, inventory } = state

  // 任务：已完成
  for (const qs of quests) {
    if (qs.status === 'completed') {
      const def = getQuest(qs.questId)
      items.push({ id: `quest-done-${qs.questId}`, category: '任务', text: `《${def?.title ?? '未知任务'}》已完成` })
    }
  }
  // 世界：青石村阶段完成
  if (world.flags.rabbit_path_reported === true) {
    items.push({ id: 'world-qingshi-stage', category: '世界', text: '青石村阶段完成' })
  }
  // 战利品：关键线索/项链
  const path = getItem('rabbit_path')
  if (path && inventory.some((e) => e.itemId === 'rabbit_path' && e.quantity >= 1)) {
    items.push({ id: 'loot-rabbit_path', category: '战利品', text: `获得《${path.name}》` })
  }
  const necklace = getItem('kuidong_necklace')
  if (necklace && inventory.some((e) => e.itemId === 'kuidong_necklace' && e.quantity >= 1)) {
    items.push({ id: 'loot-kuidong_necklace', category: '战利品', text: `获得《${necklace.name}》` })
  }
  // 成长：升级
  if (player.level >= 2) {
    items.push({ id: 'growth-level', category: '成长', text: `达到 Lv.${player.level}` })
  }
  // 世界：Sakura 契约
  if (world.flags.sakura_contract_bound === true) {
    items.push({ id: 'world-sakura-contract', category: '世界', text: '与樱花优子立下神契' })
  }
  return items
}
