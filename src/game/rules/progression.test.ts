import { describe, expect, it } from 'vitest'
import { getLevelFromXp, getXpIntoCurrentLevel, getXpRequiredForNextLevel, getXpThresholdForLevel } from './character'
describe('TM-P2-005 冒险阅历', () => {
  it.each([[0, 1], [99, 1], [100, 2], [249, 2], [250, 3], [449, 3], [450, 4] as const])('XP %i -> Lv%i', (xp, level) => expect(getLevelFromXp(xp)).toBe(level))
  it('使用纯公式计算本级进度', () => { expect(getXpThresholdForLevel(4)).toBe(450); expect(getXpIntoCurrentLevel(500)).toBe(50); expect(getXpRequiredForNextLevel(4)).toBe(250) })
})
