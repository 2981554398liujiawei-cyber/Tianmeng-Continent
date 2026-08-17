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
  profession: ProfessionId
  attributes: Attributes
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  gold: number
}
