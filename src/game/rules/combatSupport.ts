/**
 * 伙伴战斗支持效果纯规则（TM-P2-004-R1 A：樱花魔法盾即时减伤修复）。
 *  - 纯函数：不读 Store、不写 Store、无副作用。
 *  - 盾语义（正式）：敌人 V3 攻击 → 正常命中/护甲/暴击/擦伤结算 → 若本次 attack.hit === true
 *    → 最终 damage 再 -amount（最低 0）。
 *  - MISS：敌人立即反击 miss → 盾不得消耗，保持到下一次真实命中的敌人反击。
 *  - 本文件不修改 rules/combat.ts（Combat V3 冻结）。
 */
import type { AttackResult } from './combat'

export interface ShieldAbsorptionOutcome {
  /** 减伤后的攻击结果（未命中或未展开盾时与 raw 相同） */
  result: AttackResult
  /** 实际吸收量（= min(盾, raw damage)）；未命中或未展开盾时为 null */
  absorbed: number | null
  /** 本次反击后盾是否被消耗（仅真实命中时 true；miss 保留） */
  shieldConsumed: boolean
}

/**
 * 应用樱花魔法盾的敌人反击结算。
 * @param rawResult 敌人 V3 反击的原始结算结果（performAttack 输出）
 * @param activeShield 本次反击可用的盾剩余量（0 = 未展开/已耗尽）
 */
export function resolveEnemyCounterWithSupport(
  rawResult: AttackResult,
  activeShield: number,
): ShieldAbsorptionOutcome {
  if (rawResult.hit && activeShield > 0) {
    const absorbed = Math.min(activeShield, rawResult.damage)
    return {
      result: { ...rawResult, damage: Math.max(0, rawResult.damage - absorbed) },
      absorbed,
      shieldConsumed: true,
    }
  }
  return { result: rawResult, absorbed: null, shieldConsumed: false }
}
