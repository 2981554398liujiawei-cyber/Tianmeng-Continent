import type { AttributeKey, ProfessionId } from '../types'

export const ATTRIBUTE_KEYS: AttributeKey[] = ['str', 'con', 'agi', 'mnd', 'lck']

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  str: '力量',
  con: '体质',
  agi: '敏捷',
  mnd: '冥想',
  lck: '幸运',
}

export interface ProfessionInfo {
  id: ProfessionId
  name: string
  description: string
}

/** V1 初始职业 */
export const PROFESSIONS: Record<ProfessionId, ProfessionInfo> = {
  warrior: {
    id: 'warrior',
    name: '战士',
    description: '以蛮勇与战技立足的斗士，擅长正面搏杀。',
  },
  knight: {
    id: 'knight',
    name: '骑士',
    description: '身披重甲的守护者，攻守兼备，意志坚定。',
  },
  ranger: {
    id: 'ranger',
    name: '游侠',
    description: '行走于荒野的猎手，眼明手快，熟悉草木。',
  },
  mage: {
    id: 'mage',
    name: '法师',
    description: '研习冥想之力的施法者，以咒术扭转局势。',
  },
}

export function getProfessionName(id: ProfessionId): string {
  return PROFESSIONS[id]?.name ?? id
}
