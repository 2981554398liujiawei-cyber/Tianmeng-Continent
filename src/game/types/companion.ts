import type { Attributes } from './character'

/**
 * 伙伴状态机（TM-P2-004）：met（已相识）→ guest（临时合作）→ recruited（正式神契入队）。
 * 注意：met 只解锁红颜录；guest/recruited 才进入 activeCompanionIds（可战斗/可同行）。
 */
export type CompanionStatus = 'met' | 'guest' | 'recruited'

/** 伙伴持久状态（TM-P2-004 第 6 节）。本卡伙伴不需要装备槽/独立背包/XP/死亡状态/AI 配置。 */
export interface CompanionState {
  companionId: string
  status: CompanionStatus
  level: number
  mp: number
  maxMp: number
  learnedSkillIds: string[]
  flags: Record<string, boolean | number | string>
}

/** 队伍状态（TM-P2-004 第 6 节）：active 伙伴 ID 列表（去重、最多 3，含 guest） */
export interface PartyState {
  activeCompanionIds: string[]
}

/** 伙伴静态定义（TM-P2-004 第 9 节） */
export interface CompanionDefinition {
  id: string
  name: string
  /** 身份称号（如「樱花女神」） */
  title: string
  classification: 'companion' | 'pet' | 'divine_contract_pet'
  summary: string
  attributes: Attributes
  maxMp: number
  skillIds: string[]
  tags: string[]
}

/** 伙伴展示用锁定技能（封印中，仅展示不进 learnedSkillIds；TM-P2-004 第 87 节） */
export interface SealedSkillInfo {
  skillId: string
  name: string
  state: 'sealed'
  note: string
}
