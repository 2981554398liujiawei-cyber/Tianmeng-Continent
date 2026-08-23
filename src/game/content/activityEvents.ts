/**
 * 活动事件 → 用户可见文案映射（TM-P2-009 §6：Activity Log 禁止内部 ID 泄露）。
 * world.completedEvents 中只有在本注册表登记过的事件才会展示用户文案；
 * 未知事件宁可隐藏，绝不把内部 event id 泄漏到 Production UI。
 * 轻量注册表：不建 Event Sourcing / Event Bus / 事件数据库。
 */
export interface ActivityEventDefinition {
  id: string
  text: string
  /** 展示分组（仅元数据；Activity Feed 统一按『世界』呈现） */
  category?: '世界' | '剧情'
}

export const ACTIVITY_EVENTS: Record<string, ActivityEventDefinition> = {
  // TM-P2-006：村外异动完成后向村长汇报（当前正式流程唯一写入的 completedEvent，gameStore.ts）。
  village_elder_post_quest_response: {
    id: 'village_elder_post_quest_response',
    text: '你向村长表示，会继续追查村外的异常。',
    category: '世界',
  },
  // TM-P2-009 §14：北郊旧驿站救出沈拓。
  north_survivor_rescued: {
    id: 'north_survivor_rescued',
    text: '你在北郊旧驿站救出了失联巡逻骑士沈拓。',
    category: '剧情',
  },
  // TM-P2-009 §17：马科邀请正式骑士试炼。
  knight_trial_invited: {
    id: 'knight_trial_invited',
    text: '马科认可了你的北线表现，并准备安排正式骑士试炼。',
    category: '剧情',
  },
}

export function getActivityEvent(id: string): ActivityEventDefinition | undefined {
  return ACTIVITY_EVENTS[id]
}
