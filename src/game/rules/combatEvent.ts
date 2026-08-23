/**
 * Combat V4 事件数据结构（TM-P2-006 第 20–25 节）。
 *
 * summary / detail 分离：
 *   - summary：简洁战斗播报（中央主战报区，一行一句，快速传达「发生了什么」）
 *   - detail：详细战斗日志（右侧滚动区，含完整公式：命中值 / 承伤率 / 倍率等，按回合分组）
 *
 * 纯类型模块：无随机、无副作用、不读 Store。
 */

export type CombatEventActor = 'player' | 'enemy' | 'companion' | 'system'

export type CombatEventKind =
  | 'player_attack'
  | 'player_skill'
  | 'potion'
  | 'companion_attack'
  | 'companion_support'
  | 'companion_skip'
  | 'enemy_attack'
  | 'shield'
  | 'escape_success'
  | 'escape_failure'
  | 'initiative'
  | 'system'

export interface CombatEvent {
  /** 唯一 id（页面本地自增；仅作 React key） */
  id: string
  /** 所属回合（1 起；先手/系统事件可归 0） */
  round: number
  actor: CombatEventActor
  kind: CombatEventKind
  /** 简洁播报（中央战报一行） */
  summary: string
  /** 详细日志（右侧详细区；可为空数组） */
  detail: string[]
  /** 播报前缀里的具名单位（companion 事件 = 施术伙伴名；缺省 UI 回退「伙伴」） */
  actorName?: string
}

/** 生成事件 id（页面本地：序号即可，无需全局唯一性） */
export function combatEventId(seq: number): string {
  return `ce-${seq}`
}
