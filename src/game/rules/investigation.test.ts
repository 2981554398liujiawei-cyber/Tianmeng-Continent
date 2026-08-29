import { describe, expect, it } from 'vitest'
import { INVESTIGATION_DC, PROFESSION_INVESTIGATION_ATTRIBUTE, PROFESSION_INVESTIGATION_BONUS, resolveInvestigationCheck } from './investigation'

describe('TM-P2-013 §7/§8：调查检定纯规则（四职业主属性差异化）', () => {
  it('§8 职业路径按职业主属性判定：战士 STR / 骑士 CON / 游侠 AGI / 法师 MND', () => {
    expect(PROFESSION_INVESTIGATION_ATTRIBUTE).toEqual({ warrior: 'str', knight: 'con', ranger: 'agi', mage: 'mnd' })
    expect(resolveInvestigationCheck('profession', 'warrior')).toEqual({ attribute: 'str', dc: INVESTIGATION_DC, situationalModifier: PROFESSION_INVESTIGATION_BONUS })
    expect(resolveInvestigationCheck('profession', 'knight')).toEqual({ attribute: 'con', dc: INVESTIGATION_DC, situationalModifier: PROFESSION_INVESTIGATION_BONUS })
    expect(resolveInvestigationCheck('profession', 'ranger')).toEqual({ attribute: 'agi', dc: INVESTIGATION_DC, situationalModifier: PROFESSION_INVESTIGATION_BONUS })
    expect(resolveInvestigationCheck('profession', 'mage')).toEqual({ attribute: 'mnd', dc: INVESTIGATION_DC, situationalModifier: PROFESSION_INVESTIGATION_BONUS })
  })

  it('§7 MND / LUCK 路径不享受职业加值；三条路径 DC 统一为 13', () => {
    expect(resolveInvestigationCheck('mnd', 'warrior')).toEqual({ attribute: 'mnd', dc: 13, situationalModifier: 0 })
    expect(resolveInvestigationCheck('lck', 'mage')).toEqual({ attribute: 'lck', dc: 13, situationalModifier: 0 })
    for (const profession of ['warrior', 'knight', 'ranger', 'mage'] as const) {
      for (const method of ['mnd', 'lck', 'profession'] as const) {
        expect(resolveInvestigationCheck(method, profession).dc).toBe(13)
      }
    }
  })

  it('§8 不提供「正确职业」：四职业路径的 DC 与加值完全一致，只有判定属性不同', () => {
    const plans = (['warrior', 'knight', 'ranger', 'mage'] as const).map((p) => resolveInvestigationCheck('profession', p))
    expect(new Set(plans.map((plan) => plan.dc)).size).toBe(1)
    expect(new Set(plans.map((plan) => plan.situationalModifier)).size).toBe(1)
    expect(new Set(plans.map((plan) => plan.attribute)).size).toBe(4)
  })
})
