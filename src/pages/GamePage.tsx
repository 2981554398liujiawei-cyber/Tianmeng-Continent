import { useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getProfessionName, ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../game/content/professions'
import { getLocation } from '../game/content'

interface GamePageProps {
  onBackToMenu: () => void
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const ratio = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 shrink-0 text-sm text-bone-500">{label}</span>
      <div className="h-3 flex-1 overflow-hidden rounded border border-ink-600 bg-ink-800">
        <div className="h-full bg-gold-500/70 transition-all" style={{ width: `${ratio}%` }} />
      </div>
      <span className="w-20 shrink-0 text-right text-sm tabular-nums text-bone-300">
        {value} / {max}
      </span>
    </div>
  )
}

export default function GamePage({ onBackToMenu }: GamePageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const saveGame = useGameStore((s) => s.saveGame)
  const [saveResult, setSaveResult] = useState<'saved' | 'failed' | null>(null)

  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6">
        <p className="text-bone-300">当前没有进行中的游戏。</p>
        <Button onClick={onBackToMenu}>返回主菜单</Button>
      </div>
    )
  }

  const { player, world } = gameState

  const handleSave = () => {
    const ok = saveGame()
    setSaveResult(ok ? 'saved' : 'failed')
    window.setTimeout(() => setSaveResult(null), 2500)
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between border-b border-ink-600 pb-4">
        <h2 className="text-xl font-bold tracking-widest text-gold-300">冒险日志</h2>
        <Button variant="ghost" onClick={onBackToMenu}>
          返回主菜单
        </Button>
      </header>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5">
        <h3 className="mb-4 text-lg font-bold text-bone-100">
          {player.name}
          <span className="ml-3 text-sm font-normal text-bone-500">
            Lv.{player.level} · {getProfessionName(player.profession)}
          </span>
        </h3>

        <div className="mb-4 flex flex-col gap-2">
          <Bar label="生命" value={player.hp} max={player.maxHp} />
          <Bar label="灵力" value={player.mp} max={player.maxMp} />
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {ATTRIBUTE_KEYS.map((key) => (
            <div key={key} className="flex justify-between text-sm">
              <span className="text-bone-500">{ATTRIBUTE_LABELS[key]}</span>
              <span className="tabular-nums text-bone-300">{player.attributes[key]}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm">
            <span className="text-bone-500">金币</span>
            <span className="tabular-nums text-gold-300">{player.gold}</span>
          </div>
        </div>
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
        <p className="mb-1 text-bone-500">当前位置</p>
        <p>{getLocation(world.currentLocationId)?.name ?? world.currentLocationId}</p>
        <p className="text-xs text-bone-500">{world.currentLocationId}</p>
        <p className="mt-3 text-xs text-bone-500">
          （此页面为开发基线展示，场景探索将在后续任务卡实现。）
        </p>
      </section>

      <footer className="flex items-center gap-4">
        <Button variant="primary" onClick={handleSave}>
          保存游戏
        </Button>
        {saveResult === 'saved' && <span className="text-sm text-gold-300">✓ 已保存</span>}
        {saveResult === 'failed' && <span className="text-sm text-red-300">✗ 保存失败</span>}
      </footer>
    </div>
  )
}
