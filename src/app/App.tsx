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
    // 失败只返回主菜单；不复活、不自动读档、不自动传送
    setCombatEnemyId(null)
    setScreen('main')
  }

  if (screen === 'create') {
    return <CharacterCreationPage onConfirm={handleConfirmCreation} onBack={() => setScreen('main')} />
  }

  if (screen === 'combat' && combatEnemyId) {
    return <CombatPage enemyId={combatEnemyId} onVictory={handleVictory} onDefeat={handleDefeat} />
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
