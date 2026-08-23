import type { GameState } from '../types'
import { getQuest } from '../content'
export interface CurrentObjective { questId: string; title: string; objective: string; locationHint?: string }

const MAIN_QUEST_PRIORITY = [
  'quest_north_outskirts',
  'quest_north_gate_missing_patrol',
  'quest_wangcai_trouble',
  'quest_golden_rabbit_search',
  'quest_grassland_wolf',
  'quest_mine_cleanup',
  'quest_village_monsters',
] as const

export function getCurrentObjective(state: GameState): CurrentObjective | null {
  const active = state.quests.filter((x) => x.status === 'completable' || x.status === 'in_progress')
  const q = MAIN_QUEST_PRIORITY.map((id) => active.find((x) => x.questId === id)).find(Boolean)
    ?? active.find((x) => x.status === 'completable')
    ?? active[0]
  if (!q) return null
  const title = getQuest(q.questId)?.title ?? '当前任务'
  if (q.questId === 'quest_north_gate_missing_patrol') {
    if (q.status === 'completable') return { questId: q.questId, title, objective: '返回武馆向马科汇报', locationHint: '天龙城武馆' }
    if (q.flags.north_gate_trail_checked !== true) return { questId: q.questId, title, objective: '调查天龙城北门外巡逻队留下的痕迹', locationHint: '天龙城北门' }
    return { questId: q.questId, title, objective: '追踪北门外荒草间的魔化气息', locationHint: '天龙城北门' }
  }
  // TM-P2-008 §20：北郊各阶段当前目标（flags 表达 Stage A-D；completable 单独）
  if (q.questId === 'quest_north_outskirts') {
    if (q.status === 'completable') {
      return { questId: q.questId, title, objective: '返回武馆向马科汇报北郊的发现', locationHint: '天龙城武馆' }
    }
    if (q.flags.north_outskirts_trail_tracked !== true) {
      return { questId: q.questId, title, objective: '沿着巡逻队留下的足迹继续追踪', locationHint: '天龙城北门' }
    }
    if (q.flags.north_outskirts_ambush_found !== true) {
      return { questId: q.questId, title, objective: '前往北郊追踪足迹，找到袭击现场', locationHint: '天龙城北郊' }
    }
    if (q.flags.north_outskirts_ambush_investigated !== true) {
      return { questId: q.questId, title, objective: '调查袭击现场，查明巡逻队的遭遇', locationHint: '天龙城北郊' }
    }
    return { questId: q.questId, title, objective: '返回北门或武馆，将发现告诉马科', locationHint: '天龙城北门' }
  }
  if (q.questId === 'quest_wangcai_trouble') return { questId: q.questId, title, objective: q.flags.wangcai_briefed === true ? '调查黑石塔并找回夔峒项链' : '向商人王财询问黑石塔附近的遭遇', locationHint: '天龙城' }
  if (q.questId === 'quest_golden_rabbit_search') return { questId: q.questId, title, objective: '继续调查《兔子的路径》上的线索', locationHint: '青石村与兔王巢穴' }
  return { questId: q.questId, title, objective: q.status === 'completable' ? '返回任务发布者处提交任务' : (getQuest(q.questId)?.summary ?? '完成当前任务') }
}
