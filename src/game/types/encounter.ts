import type { ProfessionId } from './character'

/**
 * Encounter V2 数据结构（TM-P2-007 §7）。
 *  - 玩家面对的入口是 Encounter，不再是单个 enemyId。
 *  - 一个 Encounter 含 1–4 名敌人（sum(count) <= 4）。
 *  - fixedMembers 与 variants 只能二选一。
 *  - 纯数据：不包含任何规则 / RNG / 状态。
 */

/** 单种敌人的出现数量 */
export interface EncounterMember {
  enemyId: string
  /** 该敌人数量（count >= 1；整场遭遇成员总数 sum(count) <= 4） */
  count: number
}

/** 加权阵容的单个变体 */
export interface EncounterVariant {
  id: string
  members: EncounterMember[]
  /** 选择权重（越大越可能被首次选中；weight 必须 > 0） */
  weight: number
}

/**
 * 一个遭遇的完整定义。
 *  - fixedMembers：固定阵容（剧情 / Boss / 任务怪主要使用；与 variants 二选一）。
 *  - variants：带权重阵容（首次生成 / 看见时 roll 一次，写入 world.encounterVariants 后不可 reroll）。
 *  - canEscape：是否可逃跑（false = 强制剧情战 / Boss / 封闭空间）。
 *  - encounterDefeatFlag：胜利后写入的 defeated flag（defeated 门用）。
 *    单敌遭遇的 defeated 门多位于 quest.flags（由 rules/encounter.ts 委托现有 checkEnemyEncounter 守卫处理），
 *    该字段记录对应 defeated flag 名作为迁移元数据；多敌 / 可选遭遇未设置则无 defeated 门。
 */
export interface EncounterDefinition {
  id: string
  name: string
  locationId: string
  fixedMembers?: EncounterMember[]
  variants?: EncounterVariant[]
  canEscape: boolean
  /** V7 展示分类：story=剧情/正式试炼，optional=区域历练，training=可重复训练。 */
  activityType?: 'story' | 'optional' | 'training'
  /** 正式职业试炼专属路线；存在时入口和胜利结算必须与玩家职业严格匹配。 */
  trialProfession?: ProfessionId
  encounterDefeatFlag?: string
  /** TM-P2-009-R1 §11：威胁等级（UI 区分；纯展示元数据，不改战斗公式） */
  difficulty?: 'low' | 'standard' | 'dangerous'
  /** TM-P2-009-R1 §11：推荐挑战等级区间（展示用；Min 缺省则不显示推荐等级） */
  recommendedLevelMin?: number
  recommendedLevelMax?: number
  /** TM-P2-009-R1 §11：可重复刷的 optional 遭遇（首次击败仍走 first-kill XP；此后每次胜利给 repeatAdventureXpReward） */
  repeatable?: boolean
  /** TM-P2-009-R1 §11：重复胜利的低额冒险阅历（必须明显低于首次奖励；仅 repeatable=true 生效） */
  repeatAdventureXpReward?: number
}
