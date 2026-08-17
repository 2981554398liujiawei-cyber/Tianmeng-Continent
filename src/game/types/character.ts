/** 五项核心属性：力量/体质/敏捷/冥想/幸运 */
export type AttributeKey = 'str' | 'con' | 'agi' | 'mnd' | 'lck'

export type Attributes = Record<AttributeKey, number>

export type Gender = 'male' | 'female'

export type ProfessionId = 'warrior' | 'knight' | 'ranger' | 'mage'

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
