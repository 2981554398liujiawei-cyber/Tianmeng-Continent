import { useState } from 'react'
import MainMenu from '../pages/MainMenu'
import GamePage from '../pages/GamePage'
import DevStatePage from '../pages/DevStatePage'
import CharacterCreationPage from '../pages/CharacterCreationPage'
import CombatPage from '../pages/CombatPage'
import SaveSlotsPage from '../pages/SaveSlotsPage'
import CloudUnlockPage from '../pages/CloudUnlockPage'
import { useGameStore } from '../game/state/gameStore'
import { useCloudSession } from '../cloud/cloudSessionStore'
import { checkEnemyEncounter } from '../game/rules/encounter'
import type { CharacterCreationInput } from '../game/types'

type Screen = 'main' | 'create' | 'game' | 'dev' | 'combat' | 'saves'
type SavesMode = 'save' | 'load'

export default function App() {
  // TM-P2-005 22 节：启动第一屏是云口令页，解锁（或仅本机模式）后才显示主菜单
  const cloudUnlocked = useCloudSession((s) => s.status === 'connected')
  const [screen, setScreen] = useState<Screen>('main')
  const [savesMode, setSavesMode] = useState<SavesMode>('save')
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
    // TM-P2-003-R3 D：正式战斗入口唯一 authoritative gate 收敛在 rules/encounter.ts
    // （敌人存在 / 属于当前地点 / 各特殊敌人剧情前置），App 不再承载任何敌人业务规则
    const state = useGameStore.getState().gameState
    if (!state) return

    const result = checkEnemyEncounter(state, enemyId)
    if (!result.allowed) return

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

  // TM-P2-006 第 33 节：逃跑成功 → 直接结束战斗返回冒险（不 resolveCombatVictory：无 defeated / XP / loot / 金币 / kill flag）
  const handleEscape = () => {
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
        onEscape={handleEscape}
        onExitToMenu={handleExitToMenu}
      />
    )
  }

  if (screen === 'game') {
    return (
      <GamePage
        onBackToMenu={() => setScreen('main')}
        onEngage={handleEngage}
        onOpenSaves={() => {
          setSavesMode('save')
          setScreen('saves')
        }}
      />
    )
  }

  if (screen === 'saves') {
    return (
      <SaveSlotsPage
        mode={savesMode}
        onBack={() => setScreen(savesMode === 'save' ? 'game' : 'main')}
        onSaved={() => setScreen('game')}
        onLoaded={() => setScreen('game')}
      />
    )
  }

  if (screen === 'dev') {
    return <DevStatePage onBackToMenu={() => setScreen('main')} />
  }

  if (!cloudUnlocked) {
    return <CloudUnlockPage onUnlocked={() => setScreen('main')} />
  }

  return (
    <MainMenu
      hasSave={hasSave}
      onNewGame={() => setScreen('create')}
      onContinue={handleContinue}
      onOpenSaves={() => {
        setSavesMode('load')
        setScreen('saves')
      }}
      onOpenDev={() => setScreen('dev')}
    />
  )
}
