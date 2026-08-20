import { describe, expect, it } from 'vitest'
import { resolveLoot, LOOT_LUCK_DC } from './loot'
import { formatLuckCheckLog } from './luck'
import { getLootTable } from '../content/lootTables'

describe('TM-P2-003 C：LootSystem（基础掉落 + 幸运追加）', () => {
  it('无掉落表的敌人 → null（不产生任何奖励）', () => {
    expect(resolveLoot('corrupted_rabbit', 10, 14)).toBeNull()
    expect(getLootTable('corrupted_rabbit')).toBeUndefined()
  })

  it('黑鬃魔狼：基础掉落（黑鬃狼牙 ×1）与 Luck 完全解耦——幸运失败也必掉', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 1) // 天然1 大失败
    expect(grant).not.toBeNull()
    expect(grant!.items.some((i) => i.itemId === 'black_fang' && i.quantity === 1)).toBe(true)
    expect(grant!.luckCheck?.success).toBe(false)
  })

  it('幸运成功 → 额外黑鬃狼牙 ×1', () => {
    const grant = resolveLoot('black_mane_wolf', 14, 12) // 12+2=14 >= 12 成功
    const fangs = grant!.items.filter((i) => i.itemId === 'black_fang').reduce((n, i) => n + i.quantity, 0)
    expect(fangs).toBe(2)
  })

  it('幸运大成功 → 额外一件 uncommon 材料（黑鬃狼皮）', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 20)
    expect(grant!.items.some((i) => i.itemId === 'black_mane_pelt' && i.quantity === 1)).toBe(true)
    expect(grant!.luckCheck?.outcome).toBe('critical_success')
  })

  it('幸运成功但不含大成功 → 无 uncommon 材料', () => {
    const grant = resolveLoot('black_mane_wolf', 14, 12)
    expect(grant!.items.some((i) => i.itemId === 'black_mane_pelt')).toBe(false)
  })

  it('检定结果可见（total/dc/success/criticalSuccess）', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 14)
    expect(grant!.luckCheck).toMatchObject({ roll: 14, total: 14, dc: LOOT_LUCK_DC, success: true, outcome: 'success' })
  })
})

describe('TM-P2-003-R1 E：Loot 展示完整真实 Luck 计算', () => {
  it('⑧ LCK14 + roll14 → luckCheck 保留 roll=14/modifier=2/total=16（D20 14 + 幸运修正 2 = 16）', () => {
    const grant = resolveLoot('black_mane_wolf', 14, 14)
    expect(grant?.luckCheck).toMatchObject({ roll: 14, modifier: 2, total: 16, dc: LOOT_LUCK_DC, success: true })
    const lines = formatLuckCheckLog(grant!.luckCheck!)
    expect(lines[0]).toBe('D20 14 + 幸运修正 2 = 16')
  })
})
