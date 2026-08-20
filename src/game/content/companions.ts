import type { CompanionDefinition } from '../types/companion'

/**
 * 伙伴注册表（TM-P2-004 第 9/10 节）。
 * 本卡只有一名伙伴：樱花优子（sakura_yuko，神契宠物）。
 */
export const COMPANIONS: Record<string, CompanionDefinition> = {
  sakura_yuko: {
    id: 'sakura_yuko',
    name: '樱花优子',
    title: '樱花女神',
    classification: 'divine_contract_pet',
    summary:
      '来自大日岛樱花神宫的女神，千年前大战后神格受损。以「寄灵神契」暂时锚定于天梦大陆的生命之上，才得以在此界维持存在。',
    // TM-P2-004 第 11 节：当前封印属性（固定）
    attributes: {
      str: 8,
      con: 12,
      agi: 16,
      mnd: 16,
      lck: 12,
    },
    // TM-P2-004 第 12 节：maxMp = 6
    maxMp: 6,
    skillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'],
    tags: ['divine', 'sakura', 'divine_contract_pet'],
  },
}

/** 樱花优子伙伴定义（唯一实例便捷读取） */
export const SAKURA_COMPANION_ID = 'sakura_yuko'

/** 查询伙伴定义；未知 ID 返回 undefined */
export function getCompanion(id: string): CompanionDefinition | undefined {
  return COMPANIONS[id]
}

/** 樱花优子入 guest/recruited 时使用的初始技能（来自注册表；不写死名字） */
export function sakuraDefaultSkillIds(): string[] {
  const sakura = COMPANIONS.sakura_yuko
  return sakura ? [...sakura.skillIds] : []
}

/** 樱花优子封印技能展示（TM-P2-004 第 87 节：只展示不进 learnedSkillIds） */
export const SAKURA_SEALED_SKILLS = [
  { skillId: 'sakura_tenka_mai', name: '樱花天神舞', state: 'sealed' as const, note: '封印' },
  { skillId: 'sakura_bunshin', name: '分身', state: 'sealed' as const, note: '封印' },
  { skillId: 'sakura_stealth', name: '隐身', state: 'sealed' as const, note: '封印' },
  { skillId: 'sakura_full_seal', name: '完整封印术', state: 'sealed' as const, note: '封印' },
]
