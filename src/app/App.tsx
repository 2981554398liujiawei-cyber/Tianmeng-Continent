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
