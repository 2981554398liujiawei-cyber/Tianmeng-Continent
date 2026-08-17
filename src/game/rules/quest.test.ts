import { describe, expect, it } from 'vitest'
import { canTransitionQuestStatus } from './quest'
import type { QuestStatus } from '../types'

describe('TM-P0-006：合法状态转换', () => {
  it.each([
    ['undiscovered', 'available'],
    ['available', 'in_progress'],
    ['in_progress', 'completable'],
    ['completable', 'completed'],
    ['in_progress', 'failed'],
    ['completable', 'failed'],
  ] as const)('%s → %s 合法', (from, to) => {
    expect(canTransitionQuestStatus(from, to)).toBe(true)
  })
})

describe('TM-P0-006：非法状态转换', () => {
  it.each([
    ['available', 'completed'],
    ['in_progress', 'completed'],
    ['completed', 'in_progress'],
    ['failed', 'in_progress'],
    ['completed', 'failed'],
    ['failed', 'completed'],
    ['undiscovered', 'in_progress'],
    ['undiscovered', 'completed'],
    ['available', 'completable'],
    ['completed', 'available'],
    ['failed', 'available'],
    ['completed', 'completable'],
  ] as const)('%s → %s 非法', (from, to) => {
    expect(canTransitionQuestStatus(from, to)).toBe(false)
  })
})

describe('TM-P0-006：终态', () => {
  it('completed / failed 不可再转换', () => {
    const terminal: QuestStatus[] = ['completed', 'failed']
    const all: QuestStatus[] = ['undiscovered', 'available', 'in_progress', 'completable', 'completed', 'failed']
    for (const from of terminal) {
      for (const to of all) {
        expect(canTransitionQuestStatus(from, to)).toBe(false)
      }
    }
  })
})
