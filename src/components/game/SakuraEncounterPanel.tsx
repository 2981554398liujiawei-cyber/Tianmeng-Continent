import { useState } from 'react'
import type { Character } from '../../game/types/character'
import Button from '../Button'
import { useGameStore, type SakuraMeetChoice, type SakuraContractChoice } from '../../game/state/gameStore'
import { getProfessionName } from '../../game/content/professions'
import {
  getSakuraSceneStage,
  canTriggerSakuraEncounter,
  canEnterSakuraDomain,
  canMeetSakura,
  canMndCheckSakura,
  canLuckRescueSakura,
  canOfferGuest,
  canOfferContract,
  canReofferContract,
  canAcceptContract,
  isAwaitingContract,
  SAKURA_MND_DC,
  SAKURA_LUCK_DC,
  type SakuraSceneStage,
} from '../../game/rules/sakura'

/**
 * 樱花优子剧情面板（TM-P2-004 第 33-43/78-85 节）。
 * 承载完整场景：反季樱雨 → 进入神域 → 初见 → 检定 → 临时合作 → 战斗 → 契约 → 入队。
 *  - 场景更宽、标题明显、地点氛围文字、对白/旁白视觉区分、D20·LUCK 结果明显；
 *  - 选项纵向；关系变化短提示（「樱花优子 好感 +2 信任 +3」）；
 *  - 选项文本不显示精确关系结果（禁【Sakura +5】）；D20/LUCK DC 可显示；
 *  - 无复杂动画（仅淡入/樱花符号/边框/渐变；禁 Three.js/粒子/WebGL/音频/视频）。
 */
interface SakuraEncounterPanelProps {
  /** 进入残灾战斗（App 入口校验；仅 guest 阶段使用） */
  onEngage: (enemyId: string) => void
  onLevelUp: (before: Character, after: Character) => void
}

const PROFESSION_LINES: Record<string, { label: string; text: string }> = {
  warrior: {
    label: '别再强撑神力，我替你挡住它。',
    text: '你按住剑柄，上前半步。她微微一怔，随即低声说：「……你的战意很干净。谢谢你。」',
  },
  knight: {
    label: '若需要契约，我可以先立誓：你的意志不会属于我。',
    text: '她凝神看了你许久：「骑士的誓言……在神域里也听说过。这句话，我记下了。」',
  },
  ranger: {
    label: '这些落樱的方向不对……裂隙正在移动。',
    text: '她顺着你指的方向望去，神色微变：「你观察得很准。这个裂隙确实在漂移——它快撑不住了。」',
  },
  mage: {
    label: '你的伤不是普通伤势，是神力锚点被撕裂了。',
    text: '她低头看着自己掌心的裂痕：「……你一眼就看穿了。连神域里的祭司都没这么快。」',
  },
}

const MEET_CHOICES: { choice: SakuraMeetChoice; label: string }[] = [
  { choice: 'help', label: '你伤得很重。我先帮你。' },
  { choice: 'ask', label: '先告诉我这里是什么地方。' },
  { choice: 'pet_joke', label: '如果救你，你就做我的宠物？' },
]

const CONTRACT_CHOICES: { choice: SakuraContractChoice; label: string }[] = [
  { choice: 'affirm', label: '可以，但契约必须由你自己决定。' },
  { choice: 'try', label: '只要能把你带出去，先试试。' },
  { choice: 'joke', label: '可以。不过这样你可真成我的宠物了。' },
]

export const SAKURA_CONTRACT_REWARD_NOTICE = {
  quest: '任务完成：《落樱越界》',
  xp: '冒险阅历 +100',
} as const

export default function SakuraEncounterPanel({ onEngage, onLevelUp }: SakuraEncounterPanelProps) {
  const gameState = useGameStore((s) => s.gameState)
  const startSakuraEncounter = useGameStore((s) => s.startSakuraEncounter)
  const enterSakuraDomain = useGameStore((s) => s.enterSakuraDomain)
  const meetSakura = useGameStore((s) => s.meetSakura)
  const sakuraProfessionTalk = useGameStore((s) => s.sakuraProfessionTalk)
  const sakuraMndCheck = useGameStore((s) => s.sakuraMndCheck)
  const sakuraLuckRescue = useGameStore((s) => s.sakuraLuckRescue)
  const offerSakuraGuest = useGameStore((s) => s.offerSakuraGuest)
  const acceptSakuraContract = useGameStore((s) => s.acceptSakuraContract)
  const refuseSakuraContract = useGameStore((s) => s.refuseSakuraContract)
  const reofferSakuraContract = useGameStore((s) => s.reofferSakuraContract)

  // 关系变化短提示（仅 UI 本地状态；不进入 GameState/存档）
  const [relationNote, setRelationNote] = useState<string | null>(null)
  // 仅由本次成功缔约触发；刷新、拒绝和重复调用均不会补显或重显。
  const [showContractReward, setShowContractReward] = useState(false)
  const [dismissedRain, setDismissedRain] = useState(false)
  const [dismissedContract, setDismissedContract] = useState(false)

  if (!gameState) return null

  const stage = getSakuraSceneStage(gameState)
  const flags = gameState.world.flags
  const mndAttempted = flags[SAKURA_MND_ATTEMPTED] === true
  const mndSucceeded = flags[SAKURA_MND_SUCCEEDED] === true
  const luckUsed = flags[SAKURA_LUCK_USED] === true
  const professionLine = PROFESSION_LINES[gameState.player.profession]

  /** 关系变化短提示（TM-P2-004 第 91 节：不显示具体数值路径，只显示结果） */
  const showRelationNote = (affectionDelta: number, trustDelta: number) => {
    if (affectionDelta === 0 && trustDelta === 0) {
      setRelationNote('樱花优子没有说话，只是静静地看着你。')
      return
    }
    const parts: string[] = []
    if (affectionDelta !== 0) parts.push(`好感 ${affectionDelta > 0 ? '+' : ''}${affectionDelta}`)
    if (trustDelta !== 0) parts.push(`信任 ${trustDelta > 0 ? '+' : ''}${trustDelta}`)
    setRelationNote(`樱花优子 ${parts.join('  ')}`)
  }

  const handleMeet = (choice: SakuraMeetChoice) => {
    const result = meetSakura(choice)
    if (result && result.outcome === 'met') {
      showRelationNote(result.affectionDelta, result.trustDelta)
    }
  }

  const handleProfessionTalk = () => {
    const result = sakuraProfessionTalk()
    if (result && result.outcome === 'talked') {
      showRelationNote(result.affectionDelta, result.trustDelta)
    }
  }

  const handleMndCheck = () => {
    const result = sakuraMndCheck()
    if (result) {
      setRelationNote(
        result.outcome === 'success'
          ? `D20 + 精神修正 = ${result.total} / DC ${result.dc} —— 你看清了她的旧伤与破裂的神印。`
          : `D20 + 精神修正 = ${result.total} / DC ${result.dc} —— 神印太紊乱，你没能看透。`,
      )
    }
  }

  const handleLuckRescue = () => {
    const result = sakuraLuckRescue()
    if (result) {
      setRelationNote(
        result.outcome === 'success'
          ? `LUCK 检定 ${result.total} / DC ${result.dc} —— 一片本不该落在那里的樱花，恰好贴在破裂的神纹上。`
          : `LUCK 检定 ${result.total} / DC ${result.dc} —— 命运没有眷顾这一次。`,
      )
    }
  }

  const handleContract = (choice: SakuraContractChoice) => {
    const before = useGameStore.getState().gameState?.player
    const result = acceptSakuraContract(choice)
    const after = useGameStore.getState().gameState?.player
    if (result && result.outcome === 'recruited' && before && after) onLevelUp(before, after)
    if (result && result.outcome === 'recruited') {
      const parts: string[] = []
      if (result.affectionDelta !== 0) parts.push(`好感 ${result.affectionDelta > 0 ? '+' : ''}${result.affectionDelta}`)
      if (result.trustDelta !== 0) parts.push(`信任 ${result.trustDelta > 0 ? '+' : ''}${result.trustDelta}`)
      setRelationNote(`神契已缔结。${parts.length ? ` 樱花优子 ${parts.join('  ')}` : ''}`)
      setShowContractReward(true)
      setDismissedContract(true)
    }
  }

  // ---- 阶段渲染 ----

  // 未触发：由 GamePage 显示「反季樱雨」入口按钮（本面板不渲染）
  if (stage === 'hidden') return null

  // 樱雨阶段：可进入神域 / 暂时不管（不永久错过，入口保持）
  if (stage === 'sakura_rain' && !dismissedRain) {
    return (
      <section className="mt-4 w-full rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5">
        <h3 className="text-lg font-bold tracking-wider text-sakura-200">反季樱雨</h3>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">
          不合时节的樱花漫天飘落。花瓣背后，一道空间裂隙正缓缓张开——似乎连接着一个正在崩塌的陌生神域。
        </p>
        <div className="mt-4 flex flex-col items-start gap-3">
          <Button variant="primary" onClick={() => enterSakuraDomain()}>
            踏入裂隙
          </Button>
          <Button variant="ghost" onClick={() => setDismissedRain(true)}>
            暂时不管
          </Button>
          <p className="text-xs text-bone-500">裂隙不会就此消失。你可以稍后再回来。</p>
        </div>
      </section>
    )
  }

  // 神域阶段
  if (stage === 'domain') {
    const met = flags[SAKURA_MET] === true
    return (
      <section className="mt-4 w-full rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5">
        <h3 className="text-lg font-bold tracking-wider text-sakura-200">樱华神域 · 破碎边界</h3>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">
          漂浮的石阶、残破神社、倒悬樱树与不断撕裂的天空。神域崩落的一角正缓慢坍缩，空气里弥漫着神力的余烬。
        </p>

        {!met ? (
          <>
            <p className="mt-4 text-sm text-bone-500">（旁白）一道身影倒在神社前——和服染血，额前碎发下，是一双疲惫却清澈的眼睛。</p>
            <p className="mt-2 text-sm font-bold text-sakura-200">樱花优子：「……凡人？你……怎么进来的……」</p>
            {relationNote && <p className="mt-2 text-xs text-sakura-300">{relationNote}</p>}
            <div className="mt-4 flex flex-col items-start gap-3">
              {MEET_CHOICES.map(({ choice, label }) => (
                <Button key={choice} variant="primary" onClick={() => handleMeet(choice)}>
                  {label}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-bone-300">
              {flags[SAKURA_GUEST] === true
                ? '她撑着身子站起来，神格受损的裂缝在衣襟下若隐若现。'
                : '她接受了你的靠近。神印的裂痕在衣襟下若隐若现——那便是她所说的「神力锚点被撕裂」。'}
            </p>
            {!professionLine && (
              <p className="mt-2 text-xs text-bone-500">你按了按腰间的武器，不知该从何说起。</p>
            )}
            {professionLine && flags[SAKURA_PROFESSION_TALKED] !== true && (
              <div className="mt-3 flex flex-col items-start gap-2">
                <Button variant="primary" onClick={handleProfessionTalk}>
                  {professionLine.label}
                </Button>
              </div>
            )}
            {professionLine && flags[SAKURA_PROFESSION_TALKED] === true && (
              <p className="mt-2 text-sm text-bone-300">{professionLine.text}</p>
            )}
            {relationNote && <p className="mt-2 text-xs text-sakura-300">{relationNote}</p>}

            {/* MND / LUCK 检定（TM-P2-004 第 25/26 节：一次性持久化，刷新/读档不重掷；LUCK 绝不决定她是否加入） */}
            <div className="mt-4 space-y-3">
              {!mndAttempted && (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-sm text-bone-300">你凑近观察她肩头的旧伤与那道破裂的神印（精神检定 DC {SAKURA_MND_DC}）。</p>
                  <Button variant="primary" onClick={handleMndCheck}>
                    凝神观察（精神）
                  </Button>
                </div>
              )}
              {mndAttempted && (
                <p className="text-sm text-bone-300">
                  {mndSucceeded
                    ? '你看清了：那不止是外伤，是神格锚点被撕裂后留下的痕迹。她需要某种「锚定」才能不消散。'
                    : '神印紊乱如雾，你没能看透更多。'}
                </p>
              )}
              {mndAttempted && !mndSucceeded && !luckUsed && canLuckRescueSakura(gameState) && (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-sm text-bone-300">「……没事。」她移开目光。也许命运会给你另一个机会（LUCK 检定 DC {SAKURA_LUCK_DC}）。</p>
                  <Button variant="primary" onClick={handleLuckRescue}>
                    留意落樱（幸运）
                  </Button>
                </div>
              )}
              {luckUsed && (
                <p className="text-sm text-bone-300">那片樱花落在神纹上的一瞬，你隐约读出了「寄灵」二字的轮廓。</p>
              )}
            </div>

            {/* 临时合作（TM-P2-004 第 39 节：残灾袭来 → guest） */}
            {flags[SAKURA_GUEST] !== true && canOfferGuest(gameState) && (
              <div className="mt-4 flex flex-col items-start gap-2">
                <p className="text-sm text-bone-300">地面骤然震颤——一道残灾之影从裂隙深处渗出，本能地撕扯着周围的一切。</p>
                <p className="text-sm text-sakura-200">樱花优子：「我的神力……撑不住第二次了。你愿意……和我并肩吗？」</p>
                <Button variant="primary" onClick={() => offerSakuraGuest()}>
                  与她并肩作战
                </Button>
              </div>
            )}
            {flags[SAKURA_GUEST] === true && (
              <p className="mt-4 text-sm text-bone-300">她站到你身侧。残灾之影在裂隙边缘咆哮——必须先解决它。</p>
            )}
          </>
        )}
      </section>
    )
  }

  // guest 阶段：迎战残灾
  if (stage === 'guest') {
    return (
      <section className="mt-4 w-full rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5">
        <h3 className="text-lg font-bold tracking-wider text-sakura-200">神域崩塌前兆</h3>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">
          残灾之影撕开裂隙冲了过来。樱花优子与你并肩而立，她的神力只剩下最后一缕。
        </p>
        <div className="mt-4 flex flex-col items-start gap-3">
          <Button variant="primary" onClick={() => onEngage('sakura_calamity_fragment')}>
            迎战残灾之影
          </Button>
        </div>
      </section>
    )
  }

  // 契约阶段（残灾击败 → 神域崩塌 → Sakura 主动提出寄灵神契；TM-P2-004 第 78 节）
  if (stage === 'combat_done' && !dismissedContract) {
    return (
      <section className="mt-4 w-full rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5">
        <h3 className="text-lg font-bold tracking-wider text-sakura-200">神域崩塌</h3>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">
          残灾化作飞灰。脚下的石阶开始成片崩落，天空像被撕开的纸。她的身影开始变得透明。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-sakura-200">
          樱花优子：「……神域撑不住了。没有锚点，我会跟着它一起消散。」她抬起眼，「凡人，听我说——」她深吸一口气，郑重地开口：
        </p>
        <p className="mt-2 text-sm font-bold text-bone-100">
          「寄灵神契。我自愿将我的神格锚定在你的生命之上，直到我能重建神域。这不是奴役，也不是收服——你愿意接受吗？」
        </p>
        {relationNote && <p className="mt-2 text-xs text-sakura-300">{relationNote}</p>}
        <div className="mt-4 flex flex-col items-start gap-3">
          {CONTRACT_CHOICES.map(({ choice, label }) => (
            <Button key={choice} variant="primary" onClick={() => handleContract(choice)}>
              {label}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => refuseSakuraContract()}>
            我现在不能答应。
          </Button>
        </div>
        <p className="mt-3 text-xs text-bone-500">她不会因为你的拒绝而消失。等你想好了，可以再和她谈。</p>
      </section>
    )
  }

  // 拒绝后等待再议（TM-P2-004 第 80/116 节：不 recruited、任务保持 in_progress、可再谈）
  if (isAwaitingContract(gameState)) {
    return (
      <section className="mt-4 w-full rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5">
        <h3 className="text-lg font-bold tracking-wider text-sakura-200">寄灵神契</h3>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">
          樱花优子以微弱的灵光悬浮在你身侧，安静地等待你的决定。神契的提议依然有效。
        </p>
        <div className="mt-4 flex flex-col items-start gap-3">
          <Button variant="primary" onClick={() => reofferSakuraContract()}>
            与她再次商谈
          </Button>
        </div>
      </section>
    )
  }

  // recruited：收尾提示（面板由 GamePage 隐藏，这里兜底）
  if (stage === 'recruited') {
    return (
      <section className="mt-4 w-full rounded border border-sakura-500/50 bg-gradient-to-b from-sakura-500/10 to-ink-900/40 p-5">
        <h3 className="text-lg font-bold tracking-wider text-sakura-200">神契已缔结</h3>
        <p className="mt-2 text-sm leading-relaxed text-bone-300">
          樱花优子以「神契宠物」的身份与你同行。她的神格暂时锚定于此界，等待神域重建的那一天。
        </p>
        {showContractReward && (
          <div className="mt-4 rounded border border-gold-500/60 bg-gold-900/30 p-4" role="status" aria-live="polite">
            <p className="font-bold text-gold-300">{SAKURA_CONTRACT_REWARD_NOTICE.quest}</p>
            <p className="mt-1 text-sm text-gold-200">{SAKURA_CONTRACT_REWARD_NOTICE.xp}</p>
            <Button className="mt-3" variant="primary" onClick={() => setShowContractReward(false)}>
              知道了
            </Button>
          </div>
        )}
      </section>
    )
  }

  return null
}

// ---- 场景 flag 常量（与 rules/sakura 的 SAKURA_FLAGS 对齐；面板本地引用）----
const SAKURA_MND_ATTEMPTED = 'sakura_mnd_attempted'
const SAKURA_MND_SUCCEEDED = 'sakura_mnd_succeeded'
const SAKURA_LUCK_USED = 'sakura_luck_used'
const SAKURA_MET = 'sakura_met'
const SAKURA_GUEST = 'sakura_guest'
const SAKURA_PROFESSION_TALKED = 'sakura_profession_talked'
