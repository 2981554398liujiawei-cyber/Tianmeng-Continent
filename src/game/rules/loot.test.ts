import { describe, expect, it } from 'vitest'
import {
  resolveLoot,
  rollLoot,
  resolveDropTable,
  rollDropTable,
  effectiveDropChance,
  LOOT_LUCK_DC,
  LOOT_CHANCE_MIN,
  LOOT_CHANCE_MAX,
} from './loot'
import { formatLuckCheckLog } from './luck'
import { DROP_TABLES, getDropTable, getLootTable } from '../content/lootTables'
import { ENEMIES } from '../content/enemies'
import type { DropTable } from '../types/loot'

/** 可重复消费的确定性 rng（返回 [0,1) 值序列；耗尽后稳定返回最后一个值） */
function makeRng(values: number[]): () => number {
  const seq = [...values]
  let i = 0
  return () => {
    if (i < seq.length) return seq[i++]!
    return seq[seq.length - 1]!
  }
}

const singleGuaranteed: DropTable = {
  id: 'single_guaranteed',
  guaranteed: [{ itemId: 'x', quantity: [1, 1] }],
}

describe('Loot V2 规则层（TM-P2-007 §5）', () => {
  it('L1 guaranteed：luck 0 也必掉，不受幸运与 rng 影响', () => {
    const grant = resolveDropTable(singleGuaranteed, 0, () => 0.999)
    expect(grant.items.some((i) => i.itemId === 'x' && i.quantity === 1)).toBe(true)
    // 天然 1 大失败的确定性结算同样必掉 guaranteed
    const grant2 = resolveLoot('black_mane_wolf', 0, 1)
    expect(grant2?.items.some((i) => i.itemId === 'black_fang')).toBe(true)
  })

  it('L2 random：按 baseChance 判定，命中与否由 rng 决定', () => {
    const table: DropTable = {
      id: 't',
      random: [{ itemId: 'x', quantity: [1, 1], baseChance: 0.5 }],
    }
    // rng < 0.5 → 掉落
    expect(resolveDropTable(table, 10, () => 0.49).items.some((i) => i.itemId === 'x')).toBe(true)
    // rng >= 0.5 → 不掉落（0.5 < 0.5 为 false）
    expect(resolveDropTable(table, 10, () => 0.5).items.some((i) => i.itemId === 'x')).toBe(false)
  })

  it('L3 luck 提升随机掉落概率（正幸运修正加 0.02/点）', () => {
    const table: DropTable = {
      id: 't',
      random: [{ itemId: 'x', quantity: [1, 1], baseChance: 0.5 }],
    }
    // luck 18 → 修正 +4 → p = 0.5 + 0.08 = 0.58
    expect(resolveDropTable(table, 18, () => 0.55).items.some((i) => i.itemId === 'x')).toBe(true)
    // luck 10 → 修正 0 → p = 0.5，同 rng 0.55 不掉落
    expect(resolveDropTable(table, 10, () => 0.55).items.some((i) => i.itemId === 'x')).toBe(false)
  })

  it('L4 低 luck 降低随机掉落概率', () => {
    const table: DropTable = {
      id: 't',
      random: [{ itemId: 'x', quantity: [1, 1], baseChance: 0.5 }],
    }
    // luck 6 → 修正 -2 → p = 0.5 - 0.04 = 0.46
    expect(resolveDropTable(table, 6, () => 0.48).items.some((i) => i.itemId === 'x')).toBe(false)
    // luck 10 → p = 0.5，同 rng 0.48 掉落
    expect(resolveDropTable(table, 10, () => 0.48).items.some((i) => i.itemId === 'x')).toBe(true)
  })

  it('L5 概率 clamp 到 [0.02, 0.95]', () => {
    expect(effectiveDropChance(0.01, 0)).toBe(LOOT_CHANCE_MIN)
    expect(effectiveDropChance(0.99, 0)).toBe(LOOT_CHANCE_MAX)
    // 极高 luck（修正 +30）封顶 0.95
    expect(effectiveDropChance(0.5, 30)).toBe(LOOT_CHANCE_MAX)
    // 极低 luck（修正 -40）保底 0.02
    expect(effectiveDropChance(0.5, -40)).toBe(LOOT_CHANCE_MIN)
    // 边界：p = 0.02 时 rng=0.02 打平不掉，rng=0.019 掉落
    const table: DropTable = { id: 't', random: [{ itemId: 'x', quantity: [1, 1], baseChance: 0.01 }] }
    expect(resolveDropTable(table, 10, () => 0.02).items.some((i) => i.itemId === 'x')).toBe(false)
    expect(resolveDropTable(table, 10, () => 0.019).items.some((i) => i.itemId === 'x')).toBe(true)
  })

  it('L6 lucky：D20 + 幸运修正 >= dc 才掉落（天然 20 必成 / 天然 1 必败）', () => {
    const table: DropTable = {
      id: 't',
      lucky: [{ itemId: 'x', quantity: [1, 1], dc: 12 }],
    }
    // 骰面 20（rng >= 0.95）→ 大成功必成
    expect(resolveDropTable(table, 10, () => 0.99).items.some((i) => i.itemId === 'x')).toBe(true)
    // 骰面 1（rng < 0.05）→ 大失败必败
    expect(resolveDropTable(table, 10, () => 0.0).items.some((i) => i.itemId === 'x')).toBe(false)
    // 骰面 12 + 幸运修正 0 = 12 >= 12 → 成功
    expect(resolveDropTable(table, 10, () => 0.58).items.some((i) => i.itemId === 'x')).toBe(true)
    // 骰面 11 + 幸运修正 0 = 11 < 12 → 失败
    expect(resolveDropTable(table, 10, () => 0.52).items.some((i) => i.itemId === 'x')).toBe(false)
    // 检定的完整计算可见
    const grant = resolveDropTable(table, 14, () => 0.58)
    expect(grant.luckCheck).toMatchObject({ roll: 12, modifier: 2, total: 14, dc: 12, success: true })
  })

  it('L7 掉落数量在 [min, max] 区间内由 rng 决定', () => {
    const fixed: DropTable = { id: 't', guaranteed: [{ itemId: 'x', quantity: [2, 2] }] }
    expect(resolveDropTable(fixed, 10, () => 0.5).items[0]?.quantity).toBe(2)

    const ranged: DropTable = { id: 't', guaranteed: [{ itemId: 'x', quantity: [1, 3] }] }
    expect(resolveDropTable(ranged, 10, () => 0.0).items[0]?.quantity).toBe(1)
    expect(resolveDropTable(ranged, 10, () => 0.49).items[0]?.quantity).toBe(2)
    expect(resolveDropTable(ranged, 10, () => 0.999).items[0]?.quantity).toBe(3)
  })

  it('L8 同一 rng 序列结算结果稳定（注入 RNG 确定性）', () => {
    const table: DropTable = {
      id: 'deterministic',
      guaranteed: [{ itemId: 'g', quantity: [1, 2] }],
      random: [{ itemId: 'r', quantity: [1, 2], baseChance: 0.5 }],
      lucky: [{ itemId: 'l', quantity: [1, 1], dc: 12 }],
    }
    const seq = [0.99, 0.1, 0.49, 0.8, 0.5]
    const g1 = resolveDropTable(table, 10, makeRng(seq))
    const g2 = resolveDropTable(table, 10, makeRng(seq))
    expect(g1).toEqual(g2)
    // 同一 rng 源不应引入全局状态
    const g3 = resolveDropTable(table, 10, makeRng(seq))
    expect(g3).toEqual(g1)
  })

  it('L9 无掉落表敌人：安全返回空/不抛错（兼容 getLootTable 别名）', () => {
    expect(getDropTable('ghost_enemy')).toBeUndefined()
    expect(getLootTable('ghost_enemy')).toBeUndefined()
    expect(resolveLoot('ghost_enemy', 10, 14)).toBeNull()
    expect(rollLoot('ghost_enemy', 10)).toBeNull()
    // 空表结算不抛错
    const grant = resolveDropTable({ id: 'empty' }, 10, () => 0.5)
    expect(grant).toEqual({ items: [], gold: 0, luckCheck: null })
  })

  it('L10 黑鬃魔狼回归：狼牙 guaranteed、狼皮 random、lucky 检定 DC 12', () => {
    const table = getDropTable('black_mane_wolf')!
    // guaranteed 狼牙在任意 rng 下必掉
    expect(resolveDropTable(table, 0, () => 0.999).items.some((i) => i.itemId === 'black_fang')).toBe(true)
    // random 狼皮：判定 rng < 0.5 命中（[1,1] 数量的 guaranteed 不消费 rng，首值即 random 判定）
    const hit = resolveDropTable(table, 10, makeRng([0.1]))
    expect(hit.items.some((i) => i.itemId === 'black_mane_pelt')).toBe(true)
    const miss = resolveDropTable(table, 10, makeRng([0.99]))
    expect(miss.items.some((i) => i.itemId === 'black_mane_pelt')).toBe(false)
    // lucky 检定 DC = 12
    const grant = resolveDropTable(table, 10, () => 0.99)
    expect(grant.luckCheck?.dc).toBe(LOOT_LUCK_DC)
  })

  it('正式敌人均有掉落表；武备训练单位明确无普通掉落', () => {
    const trainingEnemyIds = new Set(['trial_soldier', 'trial_duelist', 'trial_scout', 'trial_apprentice_mage'])
    const enemyIds = Object.keys(ENEMIES)
    expect(enemyIds.length).toBeGreaterThanOrEqual(11)
    for (const id of enemyIds) {
      const table = getDropTable(id)
      if (trainingEnemyIds.has(id)) {
        expect(table, `${id} 训练单位不得有普通掉落表`).toBeUndefined()
        continue
      }
      expect(table, `${id} 应有掉落表`).toBeDefined()
      expect(table?.guaranteed?.length).toBeGreaterThan(0)
      // 任务关键物（rabbit_path / kuidong_necklace 等）绝不出现在掉落表中
      for (const entry of [...(table?.guaranteed ?? []), ...(table?.random ?? []), ...(table?.lucky ?? [])]) {
        expect(['rabbit_path', 'kuidong_necklace']).not.toContain(entry.itemId)
      }
    }
  })
})

describe('TM-P2-003 C：兼容语义保持（resolveLoot / rollLoot 签名不变）', () => {
  it('无掉落表的敌人 → null', () => {
    expect(resolveLoot('ghost_enemy', 10, 14)).toBeNull()
  })

  it('黑鬃魔狼：基础掉落（黑鬃狼牙 ×1）与 Luck 完全解耦——天然 1 大失败也必掉', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 1)
    expect(grant).not.toBeNull()
    expect(grant!.items.some((i) => i.itemId === 'black_fang' && i.quantity === 1)).toBe(true)
    expect(grant!.gold).toBe(0)
    expect(grant!.luckCheck?.success).toBe(false)
  })

  it('基础掉落仍存在（guaranteed black_fang 在任何检定下都在）', () => {
    for (const roll of [1, 10, 20]) {
      const grant = resolveLoot('black_mane_wolf', 10, roll)
      expect(grant?.items.some((i) => i.itemId === 'black_fang')).toBe(true)
    }
  })

  it('Luck success bonus 仍存在（大成功追加狼牙，同时 random 狼皮判定命中）', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 20)
    const fangCount = grant?.items.filter((i) => i.itemId === 'black_fang').reduce((n, i) => n + i.quantity, 0) ?? 0
    expect(fangCount).toBe(2) // guaranteed 1 + 大成功追加 1
    expect(grant?.items.some((i) => i.itemId === 'black_mane_pelt')).toBe(true)
  })

  it('幸运成功但不含大成功 → 追加狼牙；低 roll 时 random 狼皮不判定命中', () => {
    const grant = resolveLoot('black_mane_wolf', 14, 12) // 12 + 2 = 14 >= 12 成功
    const fangs = grant!.items.filter((i) => i.itemId === 'black_fang').reduce((n, i) => n + i.quantity, 0)
    expect(fangs).toBe(2)
    expect(grant!.luckCheck?.outcome).toBe('success')
    // 天然 1（roll=1）：random 判定值 0.95 > 0.5 → 狼皮不掉
    const grantFail = resolveLoot('black_mane_wolf', 10, 1)
    expect(grantFail!.items.some((i) => i.itemId === 'black_mane_pelt')).toBe(false)
  })

  it('检定结果可见（roll/modifier/total/dc/success/outcome 完整展示）', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 14)
    expect(grant!.luckCheck).toMatchObject({
      roll: 14, modifier: 0, total: 14, dc: LOOT_LUCK_DC, success: true, outcome: 'success',
    })
  })

  it('LCK14 + roll14 → luckCheck 保留 roll=14/modifier=2/total=16（D20 14 + 幸运修正 2 = 16）', () => {
    const grant = resolveLoot('black_mane_wolf', 14, 14)
    expect(grant?.luckCheck).toMatchObject({ roll: 14, modifier: 2, total: 16, dc: LOOT_LUCK_DC, success: true })
    const lines = formatLuckCheckLog(grant!.luckCheck!)
    expect(lines[0]).toBe('D20 14 + 幸运修正 2 = 16')
  })

  it('rollLoot 运行时入口：guaranteed 必掉、无表返回 null', () => {
    const grant = rollLoot('black_mane_wolf', 10)
    expect(grant).not.toBeNull()
    expect(grant!.items.some((i) => i.itemId === 'black_fang')).toBe(true)
    expect(rollLoot('ghost_enemy', 10)).toBeNull()
  })

  it('rollDropTable 与 resolveDropTable 使用同一套表数据（迁移无第二套掉落路径）', () => {
    expect(DROP_TABLES).toBeDefined()
    const id = 'black_mane_wolf'
    expect(DROP_TABLES[id]).toBe(getDropTable(id))
  })
})
