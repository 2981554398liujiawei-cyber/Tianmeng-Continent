import { describe, expect, it } from 'vitest'
import { getLevelFromXp, getXpIntoCurrentLevel, getXpRequiredForNextLevel, getXpThresholdForLevel } from './character'
import { applyAdventureXpReward } from './progression'
describe('TM-P2-005 冒险阅历', () => {
  it.each([[0, 1], [99, 1], [100, 2], [249, 2], [250, 3], [449, 3], [450, 4] as const])('XP %i -> Lv%i', (xp, level) => expect(getLevelFromXp(xp)).toBe(level))
  it('使用纯公式计算本级进度', () => { expect(getXpThresholdForLevel(4)).toBe(450); expect(getXpIntoCurrentLevel(500)).toBe(50); expect(getXpRequiredForNextLevel(4)).toBe(250) })
  it('统一任务奖励：100 XP 只升级一次并精确增加资源', () => {
    const player = { id: 'p', name: 'p', gender: 'male' as const, level: 1, adventureXp: 0, profession: 'knight' as const, attributes: { str: 8, con: 8, agi: 8, mnd: 8, lck: 8 }, hp: 10, maxHp: 10, mp: 4, maxMp: 4, gold: 0, learnedSkillIds: [] }
    const result = applyAdventureXpReward(player, 100)
    expect(result).toMatchObject({ xpReward: 100, levelGain: 1, maxHpGain: 2, maxMpGain: 1 })
    expect(result?.player).toMatchObject({ adventureXp: 100, level: 2, hp: 10, maxHp: 12, mp: 4, maxMp: 5 })
  })
})
