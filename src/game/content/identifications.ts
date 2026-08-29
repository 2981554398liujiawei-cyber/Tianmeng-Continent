/**
 * 鉴定内容注册表（TM-P2-013 §13）：Identification Definition 是「鉴定是什么」的静态资料。
 *  - 确定性 authored identification：同一遗物按当前 profession 确定性解析（无随机词条/品质/失败率）。
 *  - 结果装备必须已在 ITEMS 注册；费用/地点前置由纯规则 checkIdentification 校验。
 *  - 纯数据注册表：不写状态、不随机。
 */
export interface IdentificationDefinition {
  id: string
  sourceItemId: string
  goldCost: number
  /** 展示名（UI 提示用） */
  name: string
  /** 按正式 profession 确定性映射结果装备 */
  resultsByProfession: Record<string, string>
}

export const IDENTIFICATIONS: Record<string, IdentificationDefinition> = {
  identification_blackstone_relic: {
    id: 'identification_blackstone_relic',
    name: '鉴定未鉴定的黑石遗物',
    sourceItemId: 'unidentified_blackstone_relic',
    goldCost: 20,
    resultsByProfession: {
      warrior: 'blackstone_warblade',
      knight: 'blackstone_guard_armor',
      ranger: 'blackstone_hunter_bow',
      mage: 'blackstone_resonance_staff',
    },
  },
}

export function getIdentification(id: string): IdentificationDefinition | undefined {
  return IDENTIFICATIONS[id]
}
