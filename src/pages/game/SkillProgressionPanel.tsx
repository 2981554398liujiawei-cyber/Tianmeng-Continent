import { useState } from 'react'
import Button from '../../components/Button'
import { SKILLS } from '../../game/content/skills'
import { getProfessionName } from '../../game/content/professions'
import type { ProfessionId } from '../../game/types'

type SkillProgressionPanelProps = {
  profession: ProfessionId
  learnedSkillIds: string[]
  trialComplete?: boolean
}

const TIER_ONE: Record<ProfessionId, string> = {
  warrior: 'warrior_suppress_strike',
  knight: 'knight_power_strike',
  ranger: 'ranger_swift_strike',
  mage: 'mage_spell',
}

const TIER_TWO: Record<ProfessionId, string> = {
  warrior: 'warrior_breaking_slash',
  knight: 'knight_oath_guard',
  ranger: 'ranger_windstep_strike',
  mage: 'mage_flame_lance',
}

function SkillCard({ id, learned, tier }: { id: string; learned: boolean; tier: string }) {
  const skill = SKILLS[id]
  if (!skill) return null
  const cooldown = skill.combat?.cooldownTurns
  const action = skill.combat?.actionType === 'bonus_action' ? '附赠行动' : '行动'
  return (
    <div
      data-testid={`skill-node-${tier.toLowerCase().replace(/\s+/g, '-')}`}
      className={`rounded border p-3 ${learned ? 'border-gold-500/50 bg-gold-900/20' : 'border-ink-600 bg-ink-900/40'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-bone-100">{skill.name}</span>
        <span className={`text-xs ${learned ? 'text-gold-300' : 'text-bone-500'}`}>{learned ? '已掌握' : '未解锁'}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-bone-400">{skill.description}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-bone-500">
        <span>灵力 {skill.mpCost}</span><span>{action}</span>
        {cooldown ? <span>冷却 {cooldown} 回合</span> : null}
      </div>
    </div>
  )
}

export default function SkillProgressionPanel({ profession, learnedSkillIds, trialComplete = false }: SkillProgressionPanelProps) {
  const [open, setOpen] = useState(false)
  const tierOne = TIER_ONE[profession]
  const tierTwo = TIER_TWO[profession]
  const learned = new Set(learnedSkillIds)
  return (
    <section data-testid="skill-progression-panel" className="rounded border border-ink-600 bg-ink-800/50 p-4 text-sm text-bone-300">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-bone-500">技能</h3>
          <p className="mt-1 text-xs text-bone-400">{getProfessionName(profession)} · 职业修炼</p>
        </div>
        <Button variant="ghost" data-testid="open-skill-progression" onClick={() => setOpen((value) => !value)}>
          {open ? '收起' : '查看技能'}
        </Button>
      </div>
      {open && (
        <div data-testid="skill-tree" className="mt-3 flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-wider text-gold-300">Tier I · 已掌握</p>
          <SkillCard id={tierOne} learned={learned.has(tierOne)} tier="tier-i" />
          <div className="self-center text-gold-500" aria-hidden="true">↓</div>
          <p className="text-[11px] font-bold tracking-wider text-gold-300">Tier II · {trialComplete ? '已解锁' : '试炼解锁'}</p>
          <SkillCard id={tierTwo} learned={learned.has(tierTwo)} tier="tier-ii" />
          {!trialComplete && <p className="text-xs text-bone-500">完成天龙武备试炼后解锁</p>}
          <p className="pt-1 text-center text-[11px] text-bone-600">更高阶修炼尚未开放</p>
        </div>
      )}
    </section>
  )
}
