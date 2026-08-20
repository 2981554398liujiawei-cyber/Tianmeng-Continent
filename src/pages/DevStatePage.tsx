import { useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { performD20Check, type D20CheckResult } from '../game/rules/d20'
import {
  getPlayerAgility,
  getPlayerArmor,
  getPlayerAttackPower,
  performAttack,
  type AttackResult,
} from '../game/rules/combat'
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS } from '../game/content/professions'
import { getEnemy, getItem, getQuest, ENEMIES } from '../game/content'
import type { AttributeKey, QuestStatus } from '../game/types'

interface DevStatePageProps {
  onBackToMenu: () => void
}

const TEST_ITEM_ID = 'test_artifact'
const LOCATION_A = 'qingshi_village'
const LOCATION_B = 'misty_ruins'
const TEST_QUEST_ID = 'quest_village_monsters'

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  undiscovered: '未发现',
  available: '可接受',
  in_progress: '进行中',
  completable: '可完成',
  completed: '已完成',
  failed: '失败',
}

const OUTCOME_LABELS: Record<D20CheckResult['outcome'], string> = {
  critical_success: '大成功',
  success: '成功',
  failure: '失败',
  critical_failure: '大失败',
}

const ATTACK_OUTCOME_LABELS: Record<AttackResult['outcome'], string> = {
  critical_hit: '暴击',
  hit: '命中',
  glancing_hit: '擦伤',
  critical_miss: '大失败',
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

export default function DevStatePage({ onBackToMenu }: DevStatePageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const hasSave = useGameStore((s) => s.hasSave)
  const { newGame, loadGame, saveGame, deleteGame, addGold, removeGold, addItem, removeItem, setFlag, setCurrentLocation } =
    useGameStore()
  const { discoverQuest, acceptQuest, markQuestCompletable, completeQuest, failQuest } = useGameStore()

  // 任务状态验证区（TM-P0-006）
  const questState = gameState?.quests.find((q) => q.questId === TEST_QUEST_ID)
  const questStatus = questState?.status ?? 'undiscovered'

  // 普通攻击规则测试区（TM-P0-007）
  const [selectedEnemyId, setSelectedEnemyId] = useState('corrupted_rabbit')
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null)
  const [attackError, setAttackError] = useState<string | null>(null)

  const handlePlayerAttack = () => {
    setAttackResult(null)
    setAttackError(null)
    if (!gameState) {
      setAttackError('尚未开始游戏，请先新建游戏。')
      return
    }
    const enemy = getEnemy(selectedEnemyId)
    if (!enemy) {
      setAttackError('敌人不存在。')
      return
    }
    try {
      // TM-P2-002：开发测试与正式战斗共用同一 V3 结算（敏捷命中 + 护甲减伤）
      const weaponId = gameState.equipment.weapon
      const weapon = weaponId ? getItem(weaponId) : undefined
      const bonus =
        weapon?.type === 'weapon' && Number.isInteger(weapon.weaponDamageBonus) ? (weapon.weaponDamageBonus ?? 0) : 0
      const raw = getPlayerAttackPower(gameState.player.attributes.str, bonus, gameState.player.level)
      setAttackResult(
        performAttack(
          getPlayerAgility(gameState.player.attributes.agi),
          enemy.agility,
          raw,
          enemy.armor,
        ),
      )
    } catch (err) {
      setAttackError(err instanceof Error ? err.message : '攻击结算失败')
    }
  }

  const handleEnemyAttack = () => {
    setAttackResult(null)
    setAttackError(null)
    if (!gameState) {
      setAttackError('尚未开始游戏，请先新建游戏。')
      return
    }
    const enemy = getEnemy(selectedEnemyId)
    if (!enemy) {
      setAttackError('敌人不存在。')
      return
    }
    try {
      // TM-P2-002：敌人攻击走同一 V3 结算（敏捷命中 + 玩家护甲减伤）
      setAttackResult(
        performAttack(
          enemy.agility,
          getPlayerAgility(gameState.player.attributes.agi),
          enemy.attackPower,
          getPlayerArmor(gameState.player.attributes.con),
        ),
      )
    } catch (err) {
      setAttackError(err instanceof Error ? err.message : '攻击结算失败')
    }
  }

  // D20 检定测试区状态（TM-P0-003）
  const [selectedAttr, setSelectedAttr] = useState<AttributeKey>('str')
  const [dcInput, setDcInput] = useState('12')
  const [proficient, setProficient] = useState(false)
  const [sitInput, setSitInput] = useState('0')
  const [checkResult, setCheckResult] = useState<D20CheckResult | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const handlePerformCheck = () => {
    setCheckResult(null)
    setCheckError(null)
    if (!gameState) {
      setCheckError('尚未开始游戏，请先新建游戏。')
      return
    }
    try {
      const result = performD20Check({
        attributeScore: gameState.player.attributes[selectedAttr],
        level: gameState.player.level,
        dc: Number(dcInput),
        proficient,
        situationalModifier: Number(sitInput),
      })
      setCheckResult(result)
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : '检定输入非法')
    }
  }

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
          <Button variant="ghost" onClick={() => setFlag('rabbit_lair_unlocked', true)}>
            解锁兔王巢穴
          </Button>
          <Button
            variant="ghost"
            onClick={() => setCurrentLocation(gameState?.world.currentLocationId === LOCATION_A ? LOCATION_B : LOCATION_A)}
          >
            切换测试地点
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 border-t border-ink-600 pt-3">
          <Button variant="primary" onClick={() => saveGame('slot1')}>
            保存存档（Slot 1）
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
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">D20 检定测试（TM-P0-003）</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-bone-500">
            属性（读取当前角色真实值）
            <select
              className="rounded border border-ink-600 bg-ink-700 px-2 py-1.5 text-sm text-bone-100"
              value={selectedAttr}
              onChange={(e) => setSelectedAttr(e.target.value as AttributeKey)}
            >
              {ATTRIBUTE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {ATTRIBUTE_LABELS[key]}（{gameState ? gameState.player.attributes[key] : '—'}）
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-bone-500">
            DC
            <input
              type="number"
              className="w-24 rounded border border-ink-600 bg-ink-700 px-2 py-1.5 text-sm text-bone-100"
              value={dcInput}
              onChange={(e) => setDcInput(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-bone-500">
            情境修正
            <input
              type="number"
              className="w-24 rounded border border-ink-600 bg-ink-700 px-2 py-1.5 text-sm text-bone-100"
              value={sitInput}
              onChange={(e) => setSitInput(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-xs text-bone-500">
            <input
              type="checkbox"
              className="accent-gold-400"
              checked={proficient}
              onChange={(e) => setProficient(e.target.checked)}
            />
            熟练
          </label>
          <Button variant="primary" onClick={handlePerformCheck}>
            执行检定
          </Button>
        </div>

        {checkError && <p className="mt-3 text-sm text-red-300">✗ {checkError}</p>}

        {checkResult && (
          <div className="mt-3 rounded bg-ink-950/70 p-4 text-sm leading-relaxed text-bone-300">
            <p>
              D20：<span className="text-bone-100">{checkResult.roll}</span>
            </p>
            <p>
              {ATTRIBUTE_LABELS[selectedAttr]}修正：
              <span className="text-bone-100">{signed(checkResult.attributeModifier)}</span>
            </p>
            <p>
              熟练：<span className="text-bone-100">{checkResult.proficiencyBonus > 0 ? signed(checkResult.proficiencyBonus) : '0'}</span>
            </p>
            <p>
              情境：<span className="text-bone-100">{signed(checkResult.situationalModifier)}</span>
            </p>
            <p>
              总值：<span className="text-bone-100">{checkResult.total}</span>
            </p>
            <p>
              DC：<span className="text-bone-100">{checkResult.dc}</span>
            </p>
            <p className="mt-1 border-t border-ink-600 pt-2 text-base font-bold text-gold-300">
              结果：{OUTCOME_LABELS[checkResult.outcome]}
            </p>
          </div>
        )}
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-4">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">任务状态验证（TM-P0-006）</h3>
        <p className="mb-2 text-xs text-bone-500">
          {getQuest(TEST_QUEST_ID)?.title}：当前：{QUEST_STATUS_LABELS[questStatus]}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => discoverQuest(TEST_QUEST_ID)}>
            发现任务
          </Button>
          <Button variant="ghost" onClick={() => acceptQuest(TEST_QUEST_ID)}>
            接受任务
          </Button>
          <Button variant="ghost" onClick={() => markQuestCompletable(TEST_QUEST_ID)}>
            标记可完成
          </Button>
          <Button variant="ghost" onClick={() => completeQuest(TEST_QUEST_ID)}>
            完成任务
          </Button>
          <Button variant="ghost" onClick={() => failQuest(TEST_QUEST_ID)}>
            任务失败
          </Button>
        </div>
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-4">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">普通攻击规则测试（TM-P0-007）</h3>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-bone-500">
            目标敌人（读取 ENEMIES 注册表）
            <select
              className="rounded border border-ink-600 bg-ink-700 px-2 py-1.5 text-sm text-bone-100"
              value={selectedEnemyId}
              onChange={(e) => setSelectedEnemyId(e.target.value)}
            >
              {Object.values(ENEMIES).map((enemy) => (
                <option key={enemy.id} value={enemy.id}>
                  {enemy.name}（Lv.{enemy.level} 护甲 {enemy.armor}）
                </option>
              ))}
            </select>
          </label>
          <Button variant="primary" onClick={handlePlayerAttack}>
            玩家攻击敌人
          </Button>
          <Button variant="ghost" onClick={handleEnemyAttack}>
            敌人攻击玩家
          </Button>
        </div>

        {attackError && <p className="mt-3 text-sm text-red-300">✗ {attackError}</p>}

        {attackResult && (
          <div className="mt-3 rounded bg-ink-950/70 p-4 text-sm leading-relaxed text-bone-300">
            <p>
              D20：<span className="text-bone-100">{attackResult.roll}</span>
            </p>
            <p>
              攻击者敏捷：<span className="text-bone-100">{attackResult.attackerAgility}</span>
            </p>
            <p>
              对方敏捷：<span className="text-bone-100">{attackResult.defenderAgility}</span>
            </p>
            <p>
              原始伤害：<span className="text-bone-100">{attackResult.rawDamage}</span>
            </p>
            <p>
              防守护甲：<span className="text-bone-100">{attackResult.armor}</span>
            </p>
            <p>
              承伤率：<span className="text-bone-100">{Math.round(attackResult.damageTakenRate * 100)}%</span>
            </p>
            <p>
              是否命中：<span className="text-bone-100">{attackResult.hit ? '是' : '否'}</span>
            </p>
            <p>
              造成伤害：<span className="text-bone-100">{attackResult.damage}</span>
            </p>
            <p className="mt-1 border-t border-ink-600 pt-2 text-base font-bold text-gold-300">
              结果：{ATTACK_OUTCOME_LABELS[attackResult.outcome]}
            </p>
          </div>
        )}
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
