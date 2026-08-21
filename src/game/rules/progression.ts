import type { Character } from '../types/character'
import { getLevelFromXp } from './character'

export interface AdventureXpRewardResult {
  player: Character
  xpReward: number
  levelGain: number
  maxHpGain: number
  maxMpGain: number
}

/**
 * 统一任务完成 XP 结算。
 * XP 是唯一进度来源；升级只增加资源上限，当前 HP/MP 不自动治疗。
 * 非法/溢出输入返回 null，调用方可将整次业务操作原子拒绝。
 */
export function applyAdventureXpReward(player: Character, xpReward: number): AdventureXpRewardResult | null {
  if (!Number.isSafeInteger(xpReward) || xpReward < 0) return null
  if (!Number.isSafeInteger(player.adventureXp) || player.adventureXp < 0) return null
  if (!Number.isSafeInteger(player.level) || player.level < 1) return null
  if (!Number.isSafeInteger(player.hp) || player.hp < 0 || !Number.isSafeInteger(player.maxHp) || player.maxHp < 0 || player.hp > player.maxHp) return null
  if (!Number.isSafeInteger(player.mp) || player.mp < 0 || !Number.isSafeInteger(player.maxMp) || player.maxMp < 0 || player.mp > player.maxMp) return null
  const adventureXp = player.adventureXp + xpReward
  if (!Number.isSafeInteger(adventureXp)) return null
  const level = Math.max(player.level, getLevelFromXp(adventureXp))
  const levelGain = level - player.level
  const maxHpGain = levelGain * 2
  const maxMpGain = levelGain
  const nextPlayer: Character = {
    ...player,
    adventureXp,
    level,
    maxHp: player.maxHp + maxHpGain,
    maxMp: player.maxMp + maxMpGain,
    hp: player.hp,
    mp: player.mp,
  }
  if (![nextPlayer.hp, nextPlayer.maxHp, nextPlayer.mp, nextPlayer.maxMp].every(Number.isSafeInteger)) return null
  return { player: nextPlayer, xpReward, levelGain, maxHpGain, maxMpGain }
}
