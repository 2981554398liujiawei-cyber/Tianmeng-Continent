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
import type { CharacterCreationInput } from '../game/types'

type Screen = 'main' | 'create' | 'game' | 'dev' | 'combat' | 'saves'
type SavesMode = 'save' | 'load'

export default function App() {
  // TM-P2-005 22 节：启动第一屏是云口令页，解锁（或仅本机模式）后才显示主菜单
  const cloudUnlocked = useCloudSession((s) => s.status === 'connected')
  const [screen, setScreen] = useState<Screen>('main')
  const [savesMode, setSavesMode] = useState<SavesMode>('save')
  const [combatEncounterId, setCombatEncounterId] = useState<string | null>(null)
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

  const handleEngage = (encounterId: string) => {
    // TM-P2-007 §7.4：Encounter 战斗入口唯一 authoritative gate 收敛在 rules/encounter.ts + Store
    // （checkEncounter 注册/地点/前置校验 + weighted variant 首次固化），App 不再承载任何敌人业务规则
    const ok = useGameStore.getState().startEncounter(encounterId)
    if (!ok) return

    setCombatEncounterId(encounterId)
    setScreen('combat')
  }

  const handleVictory = () => {
    // TM-P2-007 §6：Encounter 整体胜利结算事务（XP sum + loot 聚合 + quest/flag 推进）已由 CombatPage
    // 在胜利瞬间通过 resolveEncounterVictory 一次性完成；此处按钮仅关闭结算面板并返回冒险（不重复结算）。
    setCombatEncounterId(null)
    setScreen('game')
  }

  // TM-P2-006 第 33 节：逃跑成功 → 直接结束战斗返回冒险（不 resolveCombatVictory：无 defeated / XP / loot / 金币 / kill flag）
  const handleEscape = () => {
    setCombatEncounterId(null)
    setScreen('game')
  }

  const handleDefeat = () => {
    // TM-P0-022-R1：正常战败返回冒险页（保持 HP0 与原战斗地点，可回村休整恢复）；不复活、不自动读档、不自动传送
    setCombatEncounterId(null)
    setScreen('game')
  }

  // TM-P0-022-R2：防御性异常出口（无 GameState / 未知 encounterId）真正返回主菜单，与正常战败区分
  const handleExitToMenu = () => {
    setCombatEncounterId(null)
    setScreen('main')
  }

  if (screen === 'create') {
    return <CharacterCreationPage onConfirm={handleConfirmCreation} onBack={() => setScreen('main')} />
  }

  if (screen === 'combat' && combatEncounterId) {
    return (
      <CombatPage
        encounterId={combatEncounterId}
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
