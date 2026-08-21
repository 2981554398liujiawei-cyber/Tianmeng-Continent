import { describe, expect, it } from 'vitest'
import { SAKURA_CONTRACT_REWARD_NOTICE } from './SakuraEncounterPanel'

describe('Sakura 神契奖励用户可见反馈', () => {
  it('包含任务完成与固定冒险阅历文案', () => {
    expect(SAKURA_CONTRACT_REWARD_NOTICE.quest).toBe('任务完成：《落樱越界》')
    expect(SAKURA_CONTRACT_REWARD_NOTICE.xp).toBe('冒险阅历 +100')
  })
})
