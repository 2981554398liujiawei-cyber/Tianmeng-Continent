/**
 * 战斗阅历（Combat XP）规则（TM-P2-006 第 38–44 节）。
 *
 * 核心语义（第 38 节）：
 *   - 当前 authored persistent enemies：只在「第一次正式击败」时给予战斗阅历；
 *   - 重复遭遇（再次击败同一敌人）默认 0 XP。
 *
 * 防重复策略（第 40/91 节）：优先复用现有 defeated flags / 任务状态机，
 * 不新增世界级奖励台账（Save V5 不 bump）。每种敌人的「已击败」判定：
 *   - corrupted_rabbit   → quest_village_monsters 已推进（非 in_progress）
 *   - corrupted_rat      → quest_mine_cleanup 已推进（矿洞余患属重复遭遇 → 0 XP）
 *   - corrupted_wolf     → quest_grassland_wolf 已推进
 *   - dudu_rabbit        → 背包已持有 rabbit_path（一次性 Boss 清场）
 *   - skeleton_* / black_mage / tower_zombie / black_mane_wolf → 对应 quest flag === true
 *   - sakura_calamity_fragment → world.flags.sakura_calamity_defeated === true
 *
 * 纯函数：不修改 GameState、无随机、无副作用。
 */
import { getEnemy } from '../content'
import type { GameState } from '../types/game'

/** 敌人对应 defeated 判定：返回该敌人是否「尚未首次正式击败」（true = 本次胜利可给 XP） */
function isFirstKillPending(gameState: GameState, enemyId: string): boolean {
  switch (enemyId) {
    case 'corrupted_rabbit': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_village_monsters')
      // 首次 = 任务尚在进行（未推进到 completable/completed）；推进后重复击败 → 0 XP
      return q?.status === 'in_progress'
    }
    case 'corrupted_rat': {
      // 首次 = 主线《矿洞清理》尚在进行；矿洞余患（quest_blacksmith_mine_remnant）属重复遭遇 → 0 XP
      const main = gameState.quests.find((quest) => quest.questId === 'quest_mine_cleanup')
      return main?.status === 'in_progress'
    }
    case 'corrupted_wolf': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_grassland_wolf')
      return q?.status === 'in_progress'
    }
    case 'dudu_rabbit': {
      const hasPath = gameState.inventory.some((e) => e.itemId === 'rabbit_path')
      return !hasPath
    }
    case 'skeleton_soldier': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_wangcai_trouble')
      return q?.flags.floor1_soldier_defeated !== true
    }
    case 'skeleton_captain': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_wangcai_trouble')
      return q?.flags.floor1_captain_defeated !== true
    }
    case 'tower_zombie': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_wangcai_trouble')
      return q?.flags.floor2_zombie_defeated !== true
    }
    case 'black_mage': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_wangcai_trouble')
      return q?.flags.floor2_black_mage_defeated !== true
    }
    case 'skeleton_warrior': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_wangcai_trouble')
      return q?.flags.floor2_skeleton_warrior_defeated !== true
    }
    case 'skeleton_witch': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_wangcai_trouble')
      return q?.flags.floor3_skeleton_witch_defeated !== true
    }
    case 'black_mane_wolf': {
      const q = gameState.quests.find((quest) => quest.questId === 'quest_north_gate_missing_patrol')
      return q?.flags.north_gate_wolf_defeated !== true
    }
    case 'sakura_calamity_fragment': {
      return gameState.world.flags.sakura_calamity_defeated !== true
    }
    default:
      return false
  }
}

/**
 * 本次胜利应授予的战斗阅历：
 *   - 敌人未定义 adventureXpReward → 0（无 XP 系统）
 *   - 首次正式击败 → adventureXpReward
 *   - 重复遭遇 → 0
 */
export function getEnemyFirstKillXp(gameState: GameState, enemyId: string): number {
  const enemy = getEnemy(enemyId)
  const reward = enemy?.adventureXpReward
  if (!reward || !Number.isInteger(reward) || reward <= 0) return 0
  if (!isFirstKillPending(gameState, enemyId)) return 0
  return reward
}
