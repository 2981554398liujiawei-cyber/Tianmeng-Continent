/**
 * 掉落系统类型（Loot V2 / TM-P2-007 §5）。
 * 统一敌人掉落入口：三类条目 guaranteed / random / lucky。
 */
import type { ItemRarity } from '../content/items'
import type { LuckCheckResult } from '../rules/luck'

/** 掉落条目基础：itemId 与 gold 二选一；quantity 为掉落数量区间 [min, max]（含端点） */
export interface DropEntry {
  /** 物品 id（与 gold 二选一） */
  itemId?: string
  /** 金币（与 itemId 二选一） */
  gold?: number
  /** 掉落数量区间 [min, max] */
  quantity: [number, number]
}

/** 普通随机掉落：按 baseChance + 幸运修正 计算有效概率 */
export interface RandomDropEntry extends DropEntry {
  /** 基础概率（受幸运修正影响，clamp 到 [0.02, 0.95]） */
  baseChance: number
}

/** 幸运检定掉落：D20 + 幸运修正 >= dc 才掉落 */
export interface LuckyDropEntry extends DropEntry {
  /** 幸运检定 DC */
  dc: number
}

/** 统一敌人掉落表（Loot V2）：guaranteed 必掉、random 按概率、lucky 按检定 */
export interface DropTable {
  id: string
  /** 必掉条目（100% 获得，与 Luck 完全解耦） */
  guaranteed?: DropEntry[]
  /** 随机条目（概率 = clamp(baseChance + luckModifier*0.02, 0.02, 0.95)） */
  random?: RandomDropEntry[]
  /** 幸运检定条目（D20 + luckModifier >= dc） */
  lucky?: LuckyDropEntry[]
}

/** 单次掉落结算结果（组件展示用） */
export interface LootGrant {
  /** 掉落物品（itemId + quantity） */
  items: { itemId: string; quantity: number }[]
  /** 掉落金币 */
  gold: number
  /** 幸运检定完整结果（保留 roll/modifier/total/dc/outcome，展示完整计算） */
  luckCheck?: LuckCheckResult | null
}

/** 品阶中文标签（掉落展示） */
export const RARITY_LABELS: Record<ItemRarity, string> = {
  common: '普通',
  uncommon: '精良',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}
