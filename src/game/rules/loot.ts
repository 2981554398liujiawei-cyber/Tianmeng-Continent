/**
 * 掉落结算规则（TM-P2-003 C：基础掉落 + 幸运追加；不是「所有掉率 × Luck%」）。
 *  - guaranteed 条目：无论 LCK 多少必掉（与幸运完全解耦；剧情必需道具走剧情逻辑，不在此表）。
 *  - luckTier 条目：按幸运检定结果追加（success → 成功即掉；critical_success → 大成功才掉）。
 * 幸运检定玩家可见（D20 + 幸运修正 vs DC），不做后台偷偷加概率。
 */
import { resolveLuckCheck, rollLuckCheck } from './luck'
import { getLootTable } from '../content/lootTables'
import type { LootGrant, LootEntry } from '../types/loot'

/** 黑鬃魔狼掉落幸运检定 DC（本卡唯一掉落表检定值；规则层常量） */
export const LOOT_LUCK_DC = 12

/** 结算掉落：确定性入口（骰面 1–20）。无掉落表 → null。 */
export function resolveLoot(enemyId: string, luck: number, roll: number): LootGrant | null {
  const table = getLootTable(enemyId)
  if (!table) return null
  const check = resolveLuckCheck(roll, luck, LOOT_LUCK_DC)
  return buildGrant(table.entries, check)
}

/** 运行时掉落结算（复用 rollD20） */
export function rollLoot(enemyId: string, luck: number): LootGrant | null {
  const table = getLootTable(enemyId)
  if (!table) return null
  const check = rollLuckCheck(luck, LOOT_LUCK_DC)
  return buildGrant(table.entries, check)
}

function buildGrant(
  entries: readonly LootEntry[],
  check: { total: number; dc: number; success: boolean; outcome: string },
): LootGrant {
  const grant: LootGrant = { items: [], gold: 0, luckCheck: null }
  const hasLuckEntries = entries.some((e) => e.luckTier !== undefined)
  if (hasLuckEntries) {
    grant.luckCheck = {
      total: check.total,
      dc: check.dc,
      success: check.success,
      criticalSuccess: check.outcome === 'critical_success',
    }
  }
  for (const entry of entries) {
    if (entry.guaranteed) {
      applyEntry(grant, entry)
      continue
    }
    if (entry.luckTier === 'success' && check.success) {
      applyEntry(grant, entry)
    } else if (entry.luckTier === 'critical_success' && check.outcome === 'critical_success') {
      applyEntry(grant, entry)
    }
  }
  return grant
}

function applyEntry(grant: LootGrant, entry: { itemId?: string; gold?: number; quantity: number }): void {
  if (entry.itemId) {
    grant.items.push({ itemId: entry.itemId, quantity: entry.quantity })
  } else if (entry.gold) {
    grant.gold += entry.gold * entry.quantity
  }
}
