import type { GameState } from '../types'

/** 初始地点（V1 开发用） */
export const START_LOCATION_ID = 'qingshi_village'

/**
 * 创建默认新游戏状态（TM-P0-001-05）。
 * 仅用于开发验证；正式角色创建流程在后续任务卡实现。
 */
export function createInitialGameState(): GameState {
  return {
    player: {
      id: 'player-hero',
      name: '石头城',
      gender: 'male',
      level: 1,
      profession: 'knight',
      attributes: {
        str: 14,
        con: 12,
        agi: 10,
        mnd: 8,
        lck: 10,
      },
      hp: 22,
      maxHp: 22,
      mp: 6,
      maxMp: 6,
      gold: 50,
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
    ],
    equipment: {
      weapon: null,
      armor: null,
      accessory: null,
    },
    quests: [],
    world: {
      currentLocationId: START_LOCATION_ID,
      flags: {},
      completedEvents: [],
      npcStates: {},
    },
  }
}
