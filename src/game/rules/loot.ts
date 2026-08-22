/**
 * 掉落结算规则（Loot V2 / TM-P2-007 §5）。
 *
 * 三类条目：
 *  - guaranteed：100% 掉落，与 Luck 完全解耦（剧情必需道具走剧情逻辑，不进入本表）。
 *  - random：有效概率 = clamp(baseChance + luckModifier*0.02, 0.02, 0.95)。
 *  - lucky：D20 + luckModifier >= dc（天然 20 必成 / 天然 1 必败，沿用 luck.ts 语义）。
 *
 * 全部随机来源可注入 rng（返回 [0,1) 均匀随机）；本模块不依赖全局 Math.random
 * （运行时入口 rollDropTable / rollLoot 才注入 Math.random）。
 */
import { getLuckModifier, resolveLuckCheck } from './luck'
import { getDropTable } from '../content/lootTables'
import type { DropTable, DropEntry, LootGrant } from '../types/loot'

/** 黑鬃魔狼幸运掉落检定 DC（任务卡 §5.5 迁移后唯一 lucky 表 DC；规则层常量） */
export const LOOT_LUCK_DC = 12

/** random 概率下限（保底） */
export const LOOT_CHANCE_MIN = 0.02
/** random 概率上限（封顶） */
export const LOOT_CHANCE_MAX = 0.95

/** 有效掉落概率：clamp(baseChance + luckModifier*0.02, 0.02, 0.95)（任务卡 §5.2） */
export function effectiveDropChance(baseChance: number, luckModifier: number): number {
  const raw = baseChance + luckModifier * 0.02
  return Math.min(LOOT_CHANCE_MAX, Math.max(LOOT_CHANCE_MIN, raw))
}

/** 在 [min,max] 区间内由 rng 决定掉落数量（min + floor(rng()*(max-min+1))） */
export function rollQuantity(quantity: [number, number], rng: () => number): number {
  const [min, max] = quantity
  if (min === max) return min
  return min + Math.floor(rng() * (max - min + 1))
}

/**
 * 结算掉落表（Loot V2 核心入口，纯函数）。
 * rng 可注入（[0,1) 均匀随机）；lucky 骰面由 rng 派生：1 + floor(rng()*20)。
 * 消费顺序固定：guaranteed → random（判定 + 命中后数量）→ lucky（骰面 + 成功后数量）。
 */
export function resolveDropTable(table: DropTable, luck: number, rng: () => number): LootGrant {
  const luckModifier = getLuckModifier(luck)
  const grant: LootGrant = { items: [], gold: 0, luckCheck: null }

  // guaranteed：必掉，不受 Luck 影响
  for (const entry of table.guaranteed ?? []) {
    applyEntry(grant, entry, rollQuantity(entry.quantity, rng))
  }

  // random：按有效概率判定
  for (const entry of table.random ?? []) {
    const p = effectiveDropChance(entry.baseChance, luckModifier)
    if (rng() < p) {
      applyEntry(grant, entry, rollQuantity(entry.quantity, rng))
    }
  }

  // lucky：D20 + luckModifier >= dc
  for (const entry of table.lucky ?? []) {
    const dice = 1 + Math.floor(rng() * 20)
    const check = resolveLuckCheck(dice, luck, entry.dc)
    if (grant.luckCheck == null) grant.luckCheck = check
    if (check.success) {
      applyEntry(grant, entry, rollQuantity(entry.quantity, rng))
    }
  }

  return grant
}

/** 运行时掉落结算：注入 Math.random 的入口 */
export function rollDropTable(table: DropTable, luck: number): LootGrant {
  return resolveDropTable(table, luck, () => Math.random())
}

/**
 * 确定性结算（兼容层，TM-P2-003 C 签名不变；内部走新 DropTable）。
 *  - roll 即幸运检定骰面（1–20），与旧语义一致，lucky 条目按该骰面结算；
 *  - random 条目：判定 rng 值取 (1 - roll/20)——roll 越高越容易命中（好运连好运）；
 *    天然 20（roll=20）必然命中所有 random，天然 1（roll=1）几乎不命中；
 *  - guaranteed 条目恒掉，数量取区间最小值（确定性）。
 * 无掉落表 → null。
 */
export function resolveLoot(enemyId: string, luck: number, roll: number): LootGrant | null {
  const table = getDropTable(enemyId)
  if (!table) return null
  const luckModifier = getLuckModifier(luck)
  const grant: LootGrant = { items: [], gold: 0, luckCheck: null }
  const randomHit = (1 - roll / 20)

  for (const entry of table.guaranteed ?? []) {
    applyEntry(grant, entry, entry.quantity[0])
  }
  for (const entry of table.random ?? []) {
    const p = effectiveDropChance(entry.baseChance, luckModifier)
    if (randomHit < p) {
      applyEntry(grant, entry, entry.quantity[0])
    }
  }
  for (const entry of table.lucky ?? []) {
    const check = resolveLuckCheck(roll, luck, entry.dc)
    if (grant.luckCheck == null) grant.luckCheck = check
    if (check.success) {
      applyEntry(grant, entry, entry.quantity[0])
    }
  }
  return grant
}

/** 运行时掉落结算（复用 rollDropTable；gameStore 兼容入口，签名不变） */
export function rollLoot(enemyId: string, luck: number): LootGrant | null {
  const table = getDropTable(enemyId)
  if (!table) return null
  return rollDropTable(table, luck)
}

function applyEntry(grant: LootGrant, entry: DropEntry, quantity: number): void {
  if (entry.itemId) {
    grant.items.push({ itemId: entry.itemId, quantity })
  } else if (entry.gold) {
    grant.gold += entry.gold * quantity
  }
}
