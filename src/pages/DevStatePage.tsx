import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'

interface DevStatePageProps {
  onBackToMenu: () => void
}

const TEST_ITEM_ID = 'test_artifact'
const LOCATION_A = 'qingshi_village'
const LOCATION_B = 'misty_ruins'

export default function DevStatePage({ onBackToMenu }: DevStatePageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const hasSave = useGameStore((s) => s.hasSave)
  const { newGame, loadGame, saveGame, deleteGame, addGold, removeGold, addItem, removeItem, setFlag, setCurrentLocation } =
    useGameStore()

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between border-b border-ink-600 pb-4">
        <h2 className="text-xl font-bold tracking-widest text-gold-300">开发者控制台</h2>
        <Button variant="ghost" onClick={onBackToMenu}>
          返回主菜单
        </Button>
      </header>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-4">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">状态操作验证（TM-P0-001-08）</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => newGame()}>
            新建游戏
          </Button>
          <Button variant="ghost" onClick={() => addGold(10)}>
            +10 金币
          </Button>
          <Button variant="ghost" onClick={() => removeGold(10)}>
            -10 金币
          </Button>
          <Button variant="ghost" onClick={() => addItem(TEST_ITEM_ID, 1)}>
            获得测试物品
          </Button>
          <Button variant="ghost" onClick={() => removeItem(TEST_ITEM_ID, 1)}>
            移除测试物品
          </Button>
          <Button variant="ghost" onClick={() => setFlag('test_flag', true)}>
            设置测试 Flag
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCurrentLocation(gameState?.world.currentLocationId === LOCATION_A ? LOCATION_B : LOCATION_A)}
          >
            切换测试地点
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-600 pt-3">
          <Button variant="primary" onClick={() => saveGame()}>
            保存存档
          </Button>
          <Button variant="ghost" onClick={() => loadGame()}>
            读取存档
          </Button>
          <Button variant="danger" onClick={() => deleteGame()}>
            删除存档
          </Button>
          <span className="self-center text-xs text-bone-500">当前存档状态：{hasSave ? '存在' : '无'}</span>
        </div>
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-4">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">GameState 实时视图</h3>
        {gameState ? (
          <pre className="max-h-[60vh] overflow-auto rounded bg-ink-950/70 p-4 text-xs leading-relaxed text-bone-300">
            {JSON.stringify(gameState, null, 2)}
          </pre>
        ) : (
          <p className="text-sm text-bone-500">尚未开始游戏，请先点击「新建游戏」。</p>
        )}
      </section>
    </div>
  )
}
