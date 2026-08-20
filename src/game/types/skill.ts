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

/**
 * 伤害结算 resolver 类型（TM-P2-003-R2 B1：rules/skill 只识别 resolver 类型，
 * 不再按具体 skillId 分发——未来新增技能只需在注册表声明 resolver + bonus）。
 */
export type DamageResolverType = 'magic_spell' | 'attack_power' | 'agility_power'

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
    /** 伤害结算元数据（TM-P2-003-R2 B1：rules 按 type 分发；缺省 = 无法结算，拒绝执行） */
    damageResolver?: {
      type: DamageResolverType
      /** attack_power / agility_power 类 resolver 的固定加成（骑士重击 +2、压制 +1、迅捷 +2） */
      bonus?: number
    }
    /** 每场战斗仅一次（迅捷突袭；按 skillId 独立追踪） */
    oncePerCombat?: boolean
    /** 正常命中/暴击阻止本次敌人反击（压制猛击；擦伤不阻止） */
    suppressCounterOnFullHit?: boolean
  }
}
