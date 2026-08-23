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
  | 'divine'

/**
 * 伤害结算 resolver 类型（TM-P2-003-R2 B1：rules/skill 只识别 resolver 类型，
 * 不再按具体 skillId 分发——未来新增技能只需在注册表声明 resolver + bonus）。
 */
export type DamageResolverType = 'magic_spell' | 'attack_power' | 'agility_power'

/** 非伤害型支持效果（TM-P2-004 第 48/49 节：伙伴技能用；窄实现，不建通用 Effect Engine） */
export type SupportEffect =
  /** 下一次敌人实际反击最终伤害 -amount（最低 0；V3 命中/护甲/擦伤/暴击先正常算，这是最终伤害后的额外防护） */
  | { type: 'reduce_next_enemy_damage'; amount: number }
  /** 取消下一次敌人反击（本轮敌人不反击） */
  | { type: 'cancel_next_enemy_counter' }

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
    /** TM-P2-009-R1 §6/§9：行动消耗类型——action=主行动 / bonus_action=附赠行动；缺省 action */
    actionType?: 'action' | 'bonus_action'
    /** TM-P2-009-R1 §9：技能冷却回合数——使用后 N 个自身回合内不可用（0/缺省 = 无冷却） */
    cooldownTurns?: number
    /** TM-P2-009-R1 §9：显式目标模式（缺省由 skillTargetMode 按 supportEffect/标签推导） */
    targetMode?: 'enemy' | 'friendly' | 'self'
    /** 伤害结算元数据（TM-P2-003-R2 B1：rules 按 type 分发；缺省 = 无法结算，拒绝执行） */
    damageResolver?: {
      type: DamageResolverType
      /** attack_power / agility_power 类 resolver 的固定加成（骑士重击 +2、压制 +1、迅捷 +2） */
      bonus?: number
    }
    /** 每场战斗仅一次（迅捷突袭/樱花魔法盾/樱花轻舞；按 skillId 独立追踪） */
    oncePerCombat?: boolean
    /** 正常命中/暴击阻止本次敌人反击（压制猛击；擦伤不阻止） */
    suppressCounterOnFullHit?: boolean
    /** 非伤害型支持效果（TM-P2-004 第 48/49 节；樱花魔法盾/樱花轻舞） */
    supportEffect?: SupportEffect
  }
}
