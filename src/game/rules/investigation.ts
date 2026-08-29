/**
 * 调查检定纯规则（TM-P2-013 §7/§8）。
 *
 *  - 三条路径共用同一 DC：MND 分析 / LCK 碰运气 / 职业本职处理。
 *  - §8：职业路径按「职业主属性」判定——战士 STR / 骑士 CON / 游侠 AGI / 法师 MND，
 *    并给 +2 情境加值，代表本职业的独特处理方式。
 *  - §8 原则：职业只提供不同信息与便利，不提供「正确职业」；四职业均可完成本章。
 *  - 纯规则：不写状态、不随机、不读 Store。
 */
import type { AttributeKey, ProfessionId } from '../types'

/** §7 建议 DC（MND / LCK / 职业路径一致） */
export const INVESTIGATION_DC = 13

/** §8：职业调查路径的判定属性（职业主属性） */
export const PROFESSION_INVESTIGATION_ATTRIBUTE: Record<ProfessionId, AttributeKey> = {
  warrior: 'str',
  knight: 'con',
  ranger: 'agi',
  mage: 'mnd',
}

/** §7：职业身份提供独特处理方式 → 本职路径 +2 情境加值 */
export const PROFESSION_INVESTIGATION_BONUS = 2

export type InvestigationMethod = 'mnd' | 'lck' | 'profession'

export interface InvestigationCheckPlan {
  /** 本次检定使用的属性 */
  attribute: AttributeKey
  dc: number
  situationalModifier: number
}

/** 解析调查路径 → 检定参数（属性 / DC / 情境加值） */
export function resolveInvestigationCheck(
  method: InvestigationMethod,
  profession: ProfessionId,
  dc: number = INVESTIGATION_DC,
): InvestigationCheckPlan {
  if (method === 'lck') return { attribute: 'lck', dc, situationalModifier: 0 }
  if (method === 'profession') {
    return { attribute: PROFESSION_INVESTIGATION_ATTRIBUTE[profession] ?? 'mnd', dc, situationalModifier: PROFESSION_INVESTIGATION_BONUS }
  }
  return { attribute: 'mnd', dc, situationalModifier: 0 }
}
