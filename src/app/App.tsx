import { useState } from 'react'
import MainMenu from '../pages/MainMenu'
import GamePage from '../pages/GamePage'
import DevStatePage from '../pages/DevStatePage'
import CharacterCreationPage from '../pages/CharacterCreationPage'
import CombatPage from '../pages/CombatPage'
import { useGameStore } from '../game/state/gameStore'
import { getEnemy, getLocation } from '../game/content'
import type { CharacterCreationInput } from '../game/types'

type Screen = 'main' | 'create' | 'game' | 'dev' | 'combat'

export default function App() {
  const [screen, setScreen] = useState<Screen>('main')
  const [combatEnemyId, setCombatEnemyId] = useState<string | null>(null)
  const hasSave = useGameStore((s) => s.hasSave)
  const newGame = useGameStore((s) => s.newGame)
  const loadGame = useGameStore((s) => s.loadGame)

  const handleContinue = () => {
    // TM-P0-001-R1：只有成功读到合法存档才进入游戏页
    const ok = loadGame()
    if (ok) setScreen('game')
  }

  const handleConfirmCreation = (input: CharacterCreationInput) => {
    // TM-P0-004：只有确认创建才调用 newGame(input) 生成 GameState
    newGame(input)
    setScreen('game')
  }

  const handleEngage = (enemyId: string) => {
    // TM-P0-008：正式战斗入口校验——敌人必须存在且属于当前地点 enemyIds
    const state = useGameStore.getState().gameState
    if (!state) return
    const enemy = getEnemy(enemyId)
    if (!enemy) return
    const location = getLocation(state.world.currentLocationId)
    if (!location?.enemyIds?.includes(enemyId)) return
    // TM-P1-010：魔化狼必须《草原狼影》进行中才可进入战斗（不只靠 UI 隐藏；非 in_progress 一律拒绝）
    if (enemyId === 'corrupted_wolf') {
      const wolfQuest = state.quests.find((q) => q.questId === 'quest_grassland_wolf')
      if (wolfQuest?.status !== 'in_progress') return
    }
    // TM-P1-014：嘟嘟兔一次性 Boss——已有《兔子的路径》时正式入口拒绝再开 Boss 战（即使 UI 出错也不进 CombatPage）
    if (enemyId === 'dudu_rabbit') {
      const hasPath = state.inventory.some((e) => e.itemId === 'rabbit_path')
      if (hasPath) return
    }
    // TM-P1-025：骷髅士兵正式战斗入口硬守（不只靠 UI）——当前位置黑石塔一层 + 第五主线 in_progress/stage 0 + wangcai_briefed===true + black_stone_tower_unlocked===true + floor1_soldier_defeated !== true（非 boolean 异常 flag 同样拒绝）
    if (enemyId === 'skeleton_soldier') {
      const towerQuest = state.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const defeated = towerQuest?.flags.floor1_soldier_defeated
      const defeatedOk =
        typeof defeated === 'undefined' || (typeof defeated === 'boolean' && defeated !== true)
      if (
        state.world.currentLocationId !== 'black_stone_tower_floor1' ||
        towerQuest?.status !== 'in_progress' ||
        towerQuest?.stage !== 0 ||
        towerQuest?.flags.wangcai_briefed !== true ||
        state.world.flags.black_stone_tower_unlocked !== true ||
        !defeatedOk
      ) {
        return
      }
    }
    // TM-P1-026：骷髅队长正式战斗入口硬守（不只靠 UI）——当前位置黑石塔一层 + 第五主线 in_progress/stage 0 + wangcai_briefed===true + black_stone_tower_unlocked===true + floor1_soldier_defeated===true + floor1_captain_defeated undefined/false（true/非 boolean 异常 flag 一律拒绝）
    if (enemyId === 'skeleton_captain') {
      const towerQuest = state.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const captainFlag = towerQuest?.flags.floor1_captain_defeated
      const captainOk =
        captainFlag !== true && (typeof captainFlag === 'undefined' || typeof captainFlag === 'boolean')
      if (
        state.world.currentLocationId !== 'black_stone_tower_floor1' ||
        towerQuest?.status !== 'in_progress' ||
        towerQuest?.stage !== 0 ||
        towerQuest?.flags.wangcai_briefed !== true ||
        state.world.flags.black_stone_tower_unlocked !== true ||
        towerQuest?.flags.floor1_soldier_defeated !== true ||
        !captainOk
      ) {
        return
      }
    }
    // TM-P1-027：二层僵尸正式战斗入口硬守——黑石塔二层 + 第五主线 in_progress/stage 0 + briefed===true + unlocked===true + floor2_unlocked===true + soldier===true + captain===true + floor2_zombie_defeated 非 true（true/非 boolean 拒绝）
    if (enemyId === 'tower_zombie') {
      const towerQuest = state.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const zombieFlag = towerQuest?.flags.floor2_zombie_defeated
      const zombieOk = zombieFlag !== true && (typeof zombieFlag === 'undefined' || typeof zombieFlag === 'boolean')
      if (
        state.world.currentLocationId !== 'black_stone_tower_floor2' ||
        towerQuest?.status !== 'in_progress' ||
        towerQuest?.stage !== 0 ||
        towerQuest?.flags.wangcai_briefed !== true ||
        state.world.flags.black_stone_tower_unlocked !== true ||
        state.world.flags.black_stone_tower_floor2_unlocked !== true ||
        towerQuest?.flags.floor1_soldier_defeated !== true ||
        towerQuest?.flags.floor1_captain_defeated !== true ||
        !zombieOk
      ) {
        return
      }
    }
    // TM-P1-027：二层黑法师正式战斗入口硬守——额外要求 floor2_zombie_defeated===true（僵尸未击败不得提前 engage 黑法师）+ floor2_black_mage_defeated 非 true
    if (enemyId === 'black_mage') {
      const towerQuest = state.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const mageFlag = towerQuest?.flags.floor2_black_mage_defeated
      const mageOk = mageFlag !== true && (typeof mageFlag === 'undefined' || typeof mageFlag === 'boolean')
      if (
        state.world.currentLocationId !== 'black_stone_tower_floor2' ||
        towerQuest?.status !== 'in_progress' ||
        towerQuest?.stage !== 0 ||
        towerQuest?.flags.wangcai_briefed !== true ||
        state.world.flags.black_stone_tower_unlocked !== true ||
        state.world.flags.black_stone_tower_floor2_unlocked !== true ||
        towerQuest?.flags.floor1_soldier_defeated !== true ||
        towerQuest?.flags.floor1_captain_defeated !== true ||
        towerQuest?.flags.floor2_zombie_defeated !== true ||
        !mageOk
      ) {
        return
      }
    }
    // TM-P1-028：二层骷髅战士正式战斗入口硬守——额外要求 floor2_zombie_defeated===true 且 floor2_black_mage_defeated===true（入口区两敌未全部击败不得提前 engage 骷髅战士）+ floor2_skeleton_warrior_defeated 非 true
    if (enemyId === 'skeleton_warrior') {
      const towerQuest = state.quests.find((q) => q.questId === 'quest_wangcai_trouble')
      const warriorFlag = towerQuest?.flags.floor2_skeleton_warrior_defeated
      const warriorOk = warriorFlag !== true && (typeof warriorFlag === 'undefined' || typeof warriorFlag === 'boolean')
      if (
        state.world.currentLocationId !== 'black_stone_tower_floor2' ||
        towerQuest?.status !== 'in_progress' ||
        towerQuest?.stage !== 0 ||
        towerQuest?.flags.wangcai_briefed !== true ||
        state.world.flags.black_stone_tower_unlocked !== true ||
        state.world.flags.black_stone_tower_floor2_unlocked !== true ||
        towerQuest?.flags.floor1_soldier_defeated !== true ||
        towerQuest?.flags.floor1_captain_defeated !== true ||
        towerQuest?.flags.floor2_zombie_defeated !== true ||
        towerQuest?.flags.floor2_black_mage_defeated !== true ||
        !warriorOk
      ) {
        return
      }
    }
    setCombatEnemyId(enemyId)
    setScreen('combat')
  }

  const handleVictory = () => {
    // TM-P0-009：战斗胜利先通过正式 Store action 提交到持久 GameState，再返回游戏页
    if (combatEnemyId) {
      useGameStore.getState().resolveCombatVictory(combatEnemyId)
    }
    setCombatEnemyId(null)
    setScreen('game')
  }

  const handleDefeat = () => {
    // TM-P0-022-R1：正常战败返回冒险页（保持 HP0 与原战斗地点，可回村休整恢复）；不复活、不自动读档、不自动传送
    setCombatEnemyId(null)
    setScreen('game')
  }

  // TM-P0-022-R2：防御性异常出口（无 GameState / 未知 enemyId）真正返回主菜单，与正常战败区分
  const handleExitToMenu = () => {
    setCombatEnemyId(null)
    setScreen('main')
  }

  if (screen === 'create') {
    return <CharacterCreationPage onConfirm={handleConfirmCreation} onBack={() => setScreen('main')} />
  }

  if (screen === 'combat' && combatEnemyId) {
    return (
      <CombatPage
        enemyId={combatEnemyId}
        onVictory={handleVictory}
        onDefeat={handleDefeat}
        onExitToMenu={handleExitToMenu}
      />
    )
  }

  if (screen === 'game') {
    return <GamePage onBackToMenu={() => setScreen('main')} onEngage={handleEngage} />
  }

  if (screen === 'dev') {
    return <DevStatePage onBackToMenu={() => setScreen('main')} />
  }

  return (
    <MainMenu
      hasSave={hasSave}
      onNewGame={() => setScreen('create')}
      onContinue={handleContinue}
      onOpenDev={() => setScreen('dev')}
    />
  )
}
