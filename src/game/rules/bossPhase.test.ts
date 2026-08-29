import { describe, expect, it } from 'vitest'
import { buildEnemyCombatant } from './partyCombat'
import { resolveBossPhaseTransition, resolveBossPhaseContext } from './bossPhase'
import { getEnemy } from '../content'

function bossAtHp(currentHp: number) {
  return buildEnemyCombatant({ instanceId: 'enemy-black_bear_qialala-1', enemyId: 'black_bear_qialala', currentHp, maxHp: 48 })
}

describe('TM-P2-012 §73：Boss Phase V1（BP1-BP12）', () => {
  it('BP1 阈值之上（HP>50%）→ 不触发', () => {
    expect(resolveBossPhaseTransition(bossAtHp(48), undefined)).toBeNull()
    expect(resolveBossPhaseTransition(bossAtHp(25), undefined)).toBeNull()
  })

  it('BP2 HP<=50% → 触发一次转阶段', () => {
    const result = resolveBossPhaseTransition(bossAtHp(24), undefined)
    expect(result).not.toBeNull()
    expect(result!.runtime.phaseId).toBe('golden')
    expect(result!.runtime.transitioned).toBe(true)
  })

  it('BP3 只触发一次（transitioned 后再不触发）', () => {
    const first = resolveBossPhaseTransition(bossAtHp(24), undefined)!
    expect(resolveBossPhaseTransition(first.combatant, first.runtime)).toBeNull()
  })

  it('BP4 名称变化：黑熊恰拉拉 → 黄金战熊·恰拉拉', () => {
    const result = resolveBossPhaseTransition(bossAtHp(24), undefined)!
    expect(result.combatant.name).toBe('黄金战熊·恰拉拉')
  })

  it('BP5 数值变化：攻击 +3 / 护甲 +1（旧伤 AGI -1 单独传入）', () => {
    const boss = bossAtHp(24)
    const result = resolveBossPhaseTransition(boss, undefined, false, 1)!
    expect(result.combatant.attack).toBe(boss.attack + 3)
    expect(result.combatant.armor).toBe(boss.armor + 1)
    expect(result.combatant.agility).toBe(boss.agility - 1)
    const noPenalty = resolveBossPhaseTransition(boss, undefined)!
    expect(noPenalty.combatant.agility).toBe(boss.agility)
  })

  it('BP6 技能组变化：Phase 2 技能与 Phase 1 完全不同', () => {
    const def = getEnemy('black_bear_qialala')!
    if (!def.bossPhases || !def.skillIds) throw new Error('boss def missing')
    const baseSkillIds = def.skillIds
    const phase = def.bossPhases[0]!
    expect(baseSkillIds).toEqual(['enemy_bear_rending_claw'])
    expect(phase.skillIds).toEqual(['enemy_golden_ground_slam', 'enemy_golden_rage_charge'])
    expect(phase.skillIds.some((id) => baseSkillIds.includes(id))).toBe(false)
  })

  it('BP7/BP8 不触碰先手与行动状态：instanceId/来源身份保持，HP 治疗不越上限', () => {
    const boss = bossAtHp(24)
    const result = resolveBossPhaseTransition(boss, undefined)!
    expect(result.combatant.instanceId).toBe(boss.instanceId)
    expect(result.combatant.sourceId).toBe(boss.sourceId)
    expect(result.combatant.sourceType).toBe(boss.sourceType)
    expect(result.combatant.currentHp).toBe(30)
    expect(result.combatant.currentHp).toBeLessThanOrEqual(48)
    // 转阶段只改 name/attack/armor/agility/currentHp，其余字段原样
    expect({ ...result.combatant, name: boss.name, attack: boss.attack, armor: boss.armor, currentHp: boss.currentHp }).toEqual(boss)
  })

  it('BP9 HP=0 → 死亡优先，不转阶段不复活', () => {
    expect(resolveBossPhaseTransition(bossAtHp(0), undefined)).toBeNull()
  })

  it('BP10 驱熊香（suppressHeal）→ Phase 2 治疗为 0', () => {
    const result = resolveBossPhaseTransition(bossAtHp(24), undefined, true)!
    expect(result.combatant.currentHp).toBe(24)
  })

  it('BP11 无驱熊香 → 转阶段恢复少量 HP（+6，不回满）', () => {
    const result = resolveBossPhaseTransition(bossAtHp(24), undefined)!
    expect(result.combatant.currentHp).toBe(24 + 6)
    expect(result.logText).toContain('金色光芒')
  })

  it('BP12 runtime-only：无模块级状态，两次独立战斗都从 Phase 1 开始', () => {
    expect(resolveBossPhaseTransition(bossAtHp(24), undefined)).not.toBeNull()
    expect(resolveBossPhaseTransition(bossAtHp(24), undefined)).not.toBeNull()
    expect(resolveBossPhaseTransition(bossAtHp(24), { phaseId: 'golden', transitioned: false })).not.toBeNull()
  })
})

describe('TM-P2-012-R1 P1-04：Boss prep 作用域隔离（resolveBossPhaseContext）', () => {
  const flags = (prep: string) => ({ world: { flags: { spirit_spring_preparation: prep } } })

  it('恰拉拉 encounter：incense → suppressHeal / old_injury → agi-1 / none → 无效果', () => {
    expect(resolveBossPhaseContext(flags('incense'), 'encounter_black_bear_qialala')).toEqual({ suppressHeal: true, agilityPenalty: 0 })
    expect(resolveBossPhaseContext(flags('old_injury'), 'encounter_black_bear_qialala')).toEqual({ suppressHeal: false, agilityPenalty: 1 })
    expect(resolveBossPhaseContext(flags('none'), 'encounter_black_bear_qialala')).toEqual({ suppressHeal: false, agilityPenalty: 0 })
  })

  it('无关 encounter/Boss：即使 spirit_spring_preparation 残留也不受影响', () => {
    expect(resolveBossPhaseContext(flags('incense'), 'encounter_skeleton_captain')).toEqual({ suppressHeal: false, agilityPenalty: 0 })
    expect(resolveBossPhaseContext(flags('old_injury'), 'encounter_waystation_wolf_pack')).toEqual({ suppressHeal: false, agilityPenalty: 0 })
    expect(resolveBossPhaseContext(flags('incense'), '')).toEqual({ suppressHeal: false, agilityPenalty: 0 })
  })
})
