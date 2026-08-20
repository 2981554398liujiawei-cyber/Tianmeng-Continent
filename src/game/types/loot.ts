/**
 * 掉落系统类型（TM-P2-003 C：基础掉落 + 幸运追加）。
 */
import type { ItemRarity } from '../content/items'

export type LuckTier = 'success' | 'critical_success'

/** 掉落条目（每个条目独立判定；guaranteed 与 luck 解耦） */
export interface LootEntry {
  /** 物品 id（与 gold 二选一） */
  itemId?: string
  /** 金币（与 itemId 二选一） */
  gold?: number
  quantity: number
  /** 剧情必掉（与 Luck 完全解耦；无论 LCK 多少都获得） */
  guaranteed: boolean
  /** 需要幸运成功/大成功才追加掉落 */
  luckTier?: LuckTier
}

/** 掉落表（当前只接入黑鬃魔狼；未来敌人按表扩展） */
export interface LootTable {
  id: string
  entries: LootEntry[]
}

/** 单次掉落结算结果（组件展示用） */
export interface LootGrant {
  /** 掉落物品（itemId + quantity） */
  items: { itemId: string; quantity: number }[]
  /** 掉落金币 */
  gold: number
  /** 幸运检定结果（若本表含 luckTier 条目；无则 null） */
  luckCheck?: { total: number; dc: number; success: boolean; criticalSuccess: boolean } | null
}

/** 品阶中文标签（掉落展示） */
export const RARITY_LABELS: Record<ItemRarity, string> = {
  common: '普通',
  uncommon: '精良',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说',
}
