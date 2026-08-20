import Button from '../Button'
import { useGameStore } from '../../game/state/gameStore'
import { getCompanion, SAKURA_COMPANION_ID, SAKURA_SEALED_SKILLS } from '../../game/content'
import { getUsableSkills } from '../../game/rules/skill'

/**
 * 同行伙伴面板（TM-P2-004 第 85-87 节）。
 * 与红颜录（RelationshipPanel）分开：已相识未缔约 → 红颜录存在、伙伴列表不存在；缔约后两边都在。
 *  - 展示名称/身份/等级/MP/可用技能/封印技能/当前状态；
 *  - 支持「暂不同行 / 重新同行」（不降低关系、recruited 不变）。
 */
export default function CompanionPanel() {
  const gameState = useGameStore((s) => s.gameState)
  const setCompanionActive = useGameStore((s) => s.setCompanionActive)

  if (!gameState) return null

  const activeCompanionIds = gameState.party?.activeCompanionIds ?? []
  const companions = Object.values(gameState.companions).filter(
    (c) => c.status === 'guest' || c.status === 'recruited',
  )
  if (companions.length === 0) return null

  return (
    <section className="rounded border border-sakura-500/40 bg-ink-800/40 p-4">
      <h3 className="text-base font-bold tracking-wider text-sakura-200">同行伙伴</h3>
      <div className="mt-3 space-y-3">
        {companions.map((companion) => {
          const def = getCompanion(companion.companionId)
          if (!def) return null
          const isActive = activeCompanionIds.includes(companion.companionId)
          const skills = getUsableSkills(companion.learnedSkillIds, undefined)
          return (
            <div key={companion.companionId} className="rounded border border-ink-600 bg-ink-900/50 p-3 text-sm text-bone-300">
              <p className="font-bold text-bone-100">
                {def.name}
                <span className="ml-2 text-xs font-normal text-bone-500">
                  {def.classification === 'divine_contract_pet' ? '神契宠物' : def.title}
                </span>
              </p>
              <p className="mt-1 text-xs text-bone-500">
                Lv.{companion.level} · 灵力 {companion.mp}/{companion.maxMp} ·{' '}
                {isActive ? '同行中' : '暂未同行'}
              </p>
              {companion.companionId === SAKURA_COMPANION_ID && (
                <>
                  <p className="mt-2 text-xs text-bone-500">可用技能：</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {skills.map((skill) => (
                      <span key={skill.id} className="rounded border border-sakura-500/30 bg-ink-800/60 px-1.5 py-0.5 text-xs text-sakura-200">
                        {skill.name}
                        {skill.mpCost > 0 ? `（${skill.mpCost}）` : ''}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-bone-500">封印技能（尚未恢复）：</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {SAKURA_SEALED_SKILLS.map((sealed) => (
                      <span key={sealed.skillId} className="rounded border border-ink-700 bg-ink-900/40 px-1.5 py-0.5 text-xs text-bone-600">
                        {sealed.name}（封印）
                      </span>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-2 flex flex-col items-start gap-2">
                {isActive ? (
                  <Button variant="secondary" onClick={() => setCompanionActive(companion.companionId, false)}>
                    暂不同行
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => setCompanionActive(companion.companionId, true)}>
                    重新同行
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
