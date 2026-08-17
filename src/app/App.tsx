import { useState } from 'react'
import MainMenu from '../pages/MainMenu'
import GamePage from '../pages/GamePage'
import DevStatePage from '../pages/DevStatePage'
import CharacterCreationPage from '../pages/CharacterCreationPage'
import { useGameStore } from '../game/state/gameStore'
import type { CharacterCreationInput } from '../game/types'

type Screen = 'main' | 'create' | 'game' | 'dev'

export default function App() {
  const [screen, setScreen] = useState<Screen>('main')
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

  if (screen === 'create') {
    return (
      <CharacterCreationPage
        onConfirm={handleConfirmCreation}
        onBack={() => setScreen('main')}
      />
    )
  }

  if (screen === 'game') {
    return <GamePage onBackToMenu={() => setScreen('main')} />
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
