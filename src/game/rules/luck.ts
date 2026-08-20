/**
 * 幸运（Luck）规则入口（TM-P2-002 J）。
 *
 * 本模块只建立「稳定入口」与「后续用途声明」，不实现任何假系统；
 * 不在旧 Phase 1/2 剧情里塞随机数来证明幸运「有用」。
 * 正式战利品 / 幸运整合将在 TM-P2-003 与技能系统一起实现。
 */
import { getAttributeModifier } from './d20'

/** 幸运属性键（与 Attributes 一致） */
export const LUCK_ATTRIBUTE_KEY = 'lck' as const

/** 幸运修正：复用 D20 属性修正公式 floor((score-10)/2) */
export function getLuckModifier(lck: number): number {
  return getAttributeModifier(lck)
}

/**
 * 幸运后续正式用途（TM-P2-002 J；供 README / 设计文档引用，后续卡片按此落地）：
 *   - 战利品质量（掉落品阶权重）
 *   - 战利品数量（掉落数量波动）
 *   - 宝箱（开箱检定 / 保底）
 *   - 幸运场景检定（D20 幸运检定）
 *   - 机缘型社交（偶遇 / 好感机缘）
 */
export const LUCK_APPLICATIONS = [
  '战利品质量',
  '战利品数量',
  '宝箱',
  '幸运场景检定',
  '机缘型社交',
] as const

export type LuckApplication = (typeof LUCK_APPLICATIONS)[number]

/**
 * 幸运应用说明（单一定义来源；TM-P2-003 起按此实现，本卡不消费）。
 */
export const LUCK_APPLICATION_NOTES: Record<LuckApplication, string> = {
  战利品质量: '击败敌人后掉落物品的品阶/权重按幸运修正调整（TM-P2-003 掉落系统）',
  战利品数量: '掉落数量在基础值上按幸运修正产生少量波动（TM-P2-003 掉落系统）',
  宝箱: '宝箱开启检定与保底规则使用幸运修正（后续内容卡）',
  幸运场景检定: 'D20 幸运检定（复用 getLuckModifier 作为属性修正）',
  机缘型社交: '偶遇事件 / 好感机缘按幸运修正加权（后续社交系统）',
}

/** 角色面板幸运展示：直接读 Attributes.lck（战斗与角色面板已正确展示幸运，本模块不重复渲染逻辑） */
export function displayLuck(lck: number): number {
  return lck
}
