import Button from '../components/Button'

interface MainMenuProps {
  hasSave: boolean
  onNewGame: () => void
  onContinue: () => void
  /** TM-P2-002 G：读取存档（五槽位页面） */
  onOpenSaves: () => void
  onOpenDev: () => void
}

export default function MainMenu({ hasSave, onNewGame, onContinue, onOpenSaves, onOpenDev }: MainMenuProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 px-4">
      <header className="text-center">
        <h1 className="text-6xl font-bold tracking-[0.3em] text-gold-300 drop-shadow-[0_0_18px_rgba(201,162,94,0.35)]">
          天梦大陆
        </h1>
        <p className="mt-3 text-sm tracking-[0.5em] text-bone-500">TIANMENG CONTINENT</p>
        <p className="mt-6 text-base text-bone-300">文字叙事驱动的 D20 奇幻冒险</p>
      </header>

      <nav className="flex w-64 flex-col gap-3">
        <Button variant="primary" className="py-3 text-base" onClick={onNewGame}>
          新游戏
        </Button>
        <Button className="py-3 text-base" disabled={!hasSave} onClick={onContinue}>
          {hasSave ? '继续游戏' : '继续游戏（无存档）'}
        </Button>
        {/* TM-P2-002 G：读取存档 → 五槽位页面 */}
        <Button className="py-3 text-base" onClick={onOpenSaves}>
          读取存档
        </Button>
      </nav>

      {/* TM-P0-023：开发者控制台仅开发环境可见（import.meta.env.DEV 为唯一环境判断来源）；生产构建不渲染该入口 */}
      {import.meta.env.DEV && (
        <footer className="absolute bottom-4 right-4">
          <button
            type="button"
            className="text-xs text-bone-500/60 underline-offset-4 hover:text-bone-300 hover:underline"
            onClick={onOpenDev}
          >
            开发者控制台
          </button>
        </footer>
      )}
    </div>
  )
}
