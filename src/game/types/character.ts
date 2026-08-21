/** 五项核心属性：力量/体质/敏捷/冥想/幸运 */
export type AttributeKey = 'str' | 'con' | 'agi' | 'mnd' | 'lck'

export type Attributes = Record<AttributeKey, number>

export type Gender = 'male' | 'female'

/** 职业白名单（const tuple，类型由此派生——单一来源） */
export const PROFESSION_IDS = ['warrior', 'knight', 'ranger', 'mage'] as const

export type ProfessionId = (typeof PROFESSION_IDS)[number]

export interface Character {
  id: string
  name: string
  gender: Gender
  level: number
  adventureXp: number
  profession: ProfessionId
  attributes: Attributes
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  gold: number
  /** 已学习技能 ID 列表（TM-P2-003 A：新角色按职业自动获得；存档 schema 2→3 迁移字段） */
  learnedSkillIds: string[]
}

/** 角色创建输入（TM-P0-004） */
export interface CharacterCreationInput {
  name: string
  gender: Gender
  profession: ProfessionId
  attributes: Attributes
}
