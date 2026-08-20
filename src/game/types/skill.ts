import type { ProfessionId } from './character'

/**
 * 技能标签（TM-P2-003 A：场景解法按 Tag 判断，而不是识别具体技能 ID）。
 * 未来樱花飞斩 / 伙伴技能 / 召唤物技能 / 新职业技能只要标签合适即可参与世界互动。
 */
export type SkillTag =
  | 'physical'
  | 'magic'
  | 'force'
  | 'movement'
  | 'control'
  | 'nature'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'healing'
  | 'illusion'
  | 'summon'

/** 技能定义（Skill Registry 条目；TM-P2-003 A） */
export interface SkillDefinition {
  id: string
  name: string
  description: string
  /** 所属职业（无职业 = 通用；本卡四职业技能均有职业） */
  profession?: ProfessionId
  /** 灵力消耗（迅捷突袭 MP 0） */
  mpCost: number
  tags: readonly SkillTag[]
  combat?: {
    /** 伤害公式说明（描述性；实际结算走 combat.ts V3，不在此执行） */
    damageFormula: string
    /** 每场战斗仅一次（迅捷突袭） */
    oncePerCombat?: boolean
    /** 正常命中/暴击阻止本次敌人反击（压制猛击；擦伤不阻止） */
    suppressCounterOnFullHit?: boolean
  }
}
