/**
 * 幸运（Luck）正式规则（TM-P2-002 J 声明 → TM-P2-003 B 落地）。
 *
 *  幸运修正 = floor((LCK - 10) / 2)（复用 D20 属性修正）
 *  幸运检定 = D20 + 幸运修正 + 情境修正 vs DC
 *  沿用 D20 天然 1（大失败）/ 天然 20（大成功）。
 *
 * 本卡 4 处可见应用：怪物掉落 / 宝箱 / 命运补救 / NPC 机缘型社交。
 * 玩家必须能看到完整计算过程（如「D20 14 + 幸运修正 2 = 16；DC 12；幸运检定：成功」），
 * 不做后台偷偷加概率。
 */
import { getAttributeModifier, rollD20 } from './d20'

/** 幸运属性键（与 Attributes 一致） */
export const LUCK_ATTRIBUTE_KEY = 'lck' as const

/** 幸运修正：复用 D20 属性修正公式 floor((score-10)/2) */
export function getLuckModifier(lck: number): number {
  return getAttributeModifier(lck)
}

export type LuckOutcome = 'success' | 'failure' | 'critical_success' | 'critical_failure'

export interface LuckCheckResult {
  /** 骰面（1–20） */
  roll: number
  /** 幸运修正（LUCK 属性派生） */
  modifier: number
  /** 情境修正（场景提供；默认 0） */
  situational: number
  /** 总值 = roll + modifier + situational */
  total: number
  /** 目标值 */
  dc: number
  outcome: LuckOutcome
  success: boolean
}

/** 幸运检定结果中文标签 */
export const LUCK_OUTCOME_LABELS: Record<LuckOutcome, string> = {
  success: '成功',
  failure: '失败',
  critical_success: '大成功',
  critical_failure: '大失败',
}

/** 天然 1 的幸运检定无论如何失败；天然 20 无论如何成功（沿用 D20 语义） */
function resolveLuckOutcome(total: number, dc: number, roll: number): LuckOutcome {
  if (roll === 1) return 'critical_failure'
  if (roll === 20) return 'critical_success'
  return total >= dc ? 'success' : 'failure'
}

/**
 * 幸运检定（确定性；测试入口）：骰面必须为 1–20 整数。
 * 返回完整计算过程（roll / modifier / situational / total / dc / outcome）。
 */
export function resolveLuckCheck(
  roll: number,
  luck: number,
  dc: number,
  situational = 0,
): LuckCheckResult {
  if (!Number.isInteger(roll) || roll < 1 || roll > 20) {
    throw new RangeError('骰面必须是 1–20 之间的整数')
  }
  if (!Number.isInteger(luck) || luck < 0) {
    throw new RangeError('幸运属性必须是非负整数')
  }
  if (!Number.isInteger(dc) || dc < 1) {
    throw new RangeError('DC 必须为正整数')
  }
  if (!Number.isInteger(situational) || !Number.isFinite(situational)) {
    throw new RangeError('情境修正必须是有限整数')
  }
  const modifier = getLuckModifier(luck)
  const total = roll + modifier + situational
  const outcome = resolveLuckOutcome(total, dc, roll)
  return {
    roll,
    modifier,
    situational,
    total,
    dc,
    outcome,
    success: outcome === 'success' || outcome === 'critical_success',
  }
}

/** 运行时幸运检定（复用 rollD20） */
export function rollLuckCheck(luck: number, dc: number, situational = 0): LuckCheckResult {
  return resolveLuckCheck(rollD20(), luck, dc, situational)
}

/** 幸运检定日志行（TM-P2-003 B：玩家可见完整计算，不做后台概率） */
export function formatLuckCheckLog(result: LuckCheckResult): string[] {
  const situationText = result.situational !== 0 ? ` + 情境修正 ${result.situational > 0 ? '+' : ''}${result.situational}` : ''
  return [
    `D20 ${result.roll} + 幸运修正 ${result.modifier}${situationText} = ${result.total}`,
    `DC ${result.dc}`,
    `幸运检定：${LUCK_OUTCOME_LABELS[result.outcome]}`,
  ]
}

/**
 * 幸运后续用途声明（TM-P2-002 J；本卡起 4 处正式落地）。
 */
export const LUCK_APPLICATIONS = [
  '战利品质量',
  '战利品数量',
  '宝箱',
  '幸运场景检定',
  '机缘型社交',
] as const

export type LuckApplication = (typeof LUCK_APPLICATIONS)[number]

export const LUCK_APPLICATION_NOTES: Record<LuckApplication, string> = {
  战利品质量: '击败敌人后掉落物品的品阶/权重按幸运修正调整（TM-P2-003 C 掉落系统）',
  战利品数量: '掉落数量在基础值上按幸运修正产生少量波动（TM-P2-003 C 掉落系统）',
  宝箱: '宝箱开启检定与保底规则使用幸运修正（TM-P2-003 F 补给匣宝箱）',
  幸运场景检定: 'D20 幸运检定（命运补救；TM-P2-003 E）',
  机缘型社交: '偶遇事件 / 好感机缘按幸运修正加权（TM-P2-003 G 旧货商）',
}

/** 角色面板幸运展示：直接读 Attributes.lck（战斗与角色面板已正确展示幸运，本模块不重复渲染逻辑） */
export function displayLuck(lck: number): number {
  return lck
}
