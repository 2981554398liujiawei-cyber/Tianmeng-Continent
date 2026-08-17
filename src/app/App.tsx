import { useState } from 'react'
import MainMenu from '../pages/MainMenu'
import GamePage from '../pages/GamePage'
import DevStatePage from '../pages/DevStatePage'
import { useGameStore } from '../game/state/gameStore'

type Screen = 'main' | 'game' | 'dev'

export default function App() {
  const [screen, setScreen] = useState<Screen>('main')
  const hasSave = useGameStore((s) => s.hasSave)
  const newGame = useGameStore((s) => s.newGame)
  const loadGame = useGameStore((s) => s.loadGame)

  const handleNewGame = () => {
    newGame()
    setScreen('game')
  }

  const handleContinue = () => {
    loadGame()
    setScreen('game')
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
      onNewGame={handleNewGame}
      onContinue={handleContinue}
      onOpenDev={() => setScreen('dev')}
    />
  )
}
