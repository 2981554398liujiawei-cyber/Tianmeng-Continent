/**
 * 掉落表注册（TM-P2-003 C：第一套「基础掉落 + 幸运追加」）。
 * 当前只接入黑鬃魔狼；剧情必掉（断裂骑士团铜牌等）绝不进入本表——
 * 剧情道具无论 LCK 多少都必须由剧情逻辑正常获得（resolveCombatVictory 负责）。
 */
import type { LootTable } from '../types/loot'

export const LOOT_TABLES: Record<string, LootTable> = {
  // TM-P2-003 C：黑鬃魔狼
  black_mane_wolf: {
    id: 'black_mane_wolf',
    entries: [
      // 基础掉落（guaranteed：与 Luck 完全解耦）
      { itemId: 'black_fang', quantity: 1, guaranteed: true },
      // 幸运成功：额外狼牙 ×1
      { itemId: 'black_fang', quantity: 1, guaranteed: false, luckTier: 'success' },
      // 幸运大成功：uncommon 材料
      { itemId: 'black_mane_pelt', quantity: 1, guaranteed: false, luckTier: 'critical_success' },
    ],
  },
}

/** 查询掉落表；无表返回 undefined */
export function getLootTable(enemyId: string): LootTable | undefined {
  return LOOT_TABLES[enemyId]
}
