import type { AttributeKey, Character, CharacterCreationInput, GameState } from '../types'
import { PROFESSION_IDS } from '../types/character'
import { getStartingMaxHp, getStartingMaxMp } from '../rules/character'
import { defaultSkillsForProfession } from './skills'

/** 初始地点（V1 开发用） */
export const START_LOCATION_ID = 'qingshi_village'

/** 属性分配约束（TM-P0-004 / R1） */
export const ATTRIBUTE_MIN = 8 // 单项最低值
export const ATTRIBUTE_MAX = 16 // 单项最高值
export const ATTRIBUTE_POINT_BUDGET = 14 // 可自由分配点数（5×8 + 14 = 54）
export const ATTRIBUTE_TOTAL = 54 // 最终五属性总和
export const NAME_MAX_LENGTH = 16

const ATTRIBUTE_KEYS: AttributeKey[] = ['str', 'con', 'agi', 'mnd', 'lck']

/** 校验角色创建输入（TM-P0-004：GameState 创建函数自身必须校验，不能只信任 UI） */
export function validateCreationInput(input: CharacterCreationInput): void {
  const name = input.name.trim()
  if (!name || name.length > NAME_MAX_LENGTH) {
    throw new RangeError(`姓名必须为 1–${NAME_MAX_LENGTH} 个字符`)
  }
  if (input.gender !== 'male' && input.gender !== 'female') {
    throw new RangeError('无效性别')
  }
  if (!(PROFESSION_IDS as readonly string[]).includes(input.profession)) {
    throw new RangeError('无效职业')
  }
  let sum = 0
  for (const key of ATTRIBUTE_KEYS) {
    const value = input.attributes[key]
    if (!Number.isInteger(value) || value < ATTRIBUTE_MIN || value > ATTRIBUTE_MAX) {
      throw new RangeError(`属性 ${key} 必须为 ${ATTRIBUTE_MIN}–${ATTRIBUTE_MAX} 的整数`)
    }
    sum += value
  }
  if (sum !== ATTRIBUTE_TOTAL) {
    throw new RangeError(`属性总和必须为 ${ATTRIBUTE_TOTAL}`)
  }
}

/** 默认开发角色（TM-P0-004：无 input 时保持与旧基线一致） */
const DEFAULT_PLAYER: Character = {
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
  learnedSkillIds: ['knight_power_strike'],
}

function buildPlayer(input?: CharacterCreationInput): Character {
  if (!input) {
    return { ...DEFAULT_PLAYER, attributes: { ...DEFAULT_PLAYER.attributes } }
  }
  validateCreationInput(input)
  const attributes = { ...input.attributes }
  const maxHp = getStartingMaxHp(attributes.con)
  const maxMp = getStartingMaxMp(attributes.mnd)
  return {
    id: 'player-hero',
    name: input.name.trim(),
    gender: input.gender,
    level: 1,
    profession: input.profession,
    attributes,
    hp: maxHp,
    maxHp,
    mp: maxMp,
    maxMp,
    gold: 50,
    learnedSkillIds: defaultSkillsForProfession(input.profession),
  }
}

/**
 * 创建新游戏状态（TM-P0-004）。
 * 传入创建输入则按玩家数据生成角色；不传则生成默认开发角色。
 */
export function createInitialGameState(input?: CharacterCreationInput): GameState {
  return {
    player: buildPlayer(input),
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
