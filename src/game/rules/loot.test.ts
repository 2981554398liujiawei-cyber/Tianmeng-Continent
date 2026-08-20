import { describe, expect, it } from 'vitest'
import { resolveLoot, LOOT_LUCK_DC } from './loot'
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
    expect(grant!.luckCheck?.criticalSuccess).toBe(true)
  })

  it('幸运成功但不含大成功 → 无 uncommon 材料', () => {
    const grant = resolveLoot('black_mane_wolf', 14, 12)
    expect(grant!.items.some((i) => i.itemId === 'black_mane_pelt')).toBe(false)
  })

  it('检定结果可见（total/dc/success/criticalSuccess）', () => {
    const grant = resolveLoot('black_mane_wolf', 10, 14)
    expect(grant!.luckCheck).toMatchObject({ total: 14, dc: LOOT_LUCK_DC, success: true })
  })
})
