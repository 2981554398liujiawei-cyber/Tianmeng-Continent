import { useState } from 'react'
import Button from '../components/Button'
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, PROFESSIONS } from '../game/content/professions'
import { ATTRIBUTE_MAX, ATTRIBUTE_MIN, ATTRIBUTE_POINT_BUDGET, ATTRIBUTE_TOTAL, NAME_MAX_LENGTH } from '../game/content/initial'
import { getAttributeModifier } from '../game/rules/d20'
import { getStartingMaxHp, getStartingMaxMp } from '../game/rules/character'
import type { AttributeKey, Attributes, CharacterCreationInput, Gender, ProfessionId } from '../game/types'

interface CharacterCreationPageProps {
  onConfirm: (input: CharacterCreationInput) => void
  onBack: () => void
}

const GENDER_LABELS: Record<Gender, string> = { male: '男', female: '女' }

/** 默认预填（与默认开发角色一致，剩余点数 0） */
const DEFAULT_ATTRIBUTES: Attributes = { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 }

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

export default function CharacterCreationPage({ onConfirm, onBack }: CharacterCreationPageProps) {
  const [name, setName] = useState('石头城')
  const [gender, setGender] = useState<Gender>('male')
  const [profession, setProfession] = useState<ProfessionId>('knight')
  const [attributes, setAttributes] = useState<Attributes>({ ...DEFAULT_ATTRIBUTES })

  const pointsSpent = ATTRIBUTE_KEYS.reduce((sum, key) => sum + attributes[key], 0)
  const pointsLeft = ATTRIBUTE_TOTAL - pointsSpent

  const trimmedName = name.trim()
  const nameValid = trimmedName.length >= 1 && trimmedName.length <= NAME_MAX_LENGTH
  const canConfirm = nameValid && pointsLeft === 0

  const adjust = (key: AttributeKey, delta: 1 | -1) => {
    setAttributes((prev) => {
      const current = prev[key]
      if (delta === 1 && (current >= ATTRIBUTE_MAX || pointsLeft <= 0)) return prev
      if (delta === -1 && current <= ATTRIBUTE_MIN) return prev
      return { ...prev, [key]: current + delta }
    })
  }

  const maxHp = getStartingMaxHp(attributes.con)
  const maxMp = getStartingMaxMp(attributes.mnd)

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm({ name: trimmedName, gender, profession, attributes: { ...attributes } })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-gold-300">天梦大陆</h1>
        <p className="mt-1 text-sm tracking-[0.5em] text-bone-500">创建角色</p>
      </header>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5">
        <label className="mb-1 block text-xs text-bone-500">角色姓名（1–{NAME_MAX_LENGTH} 字符）</label>
        <input
          type="text"
          placeholder="输入角色姓名"
          maxLength={NAME_MAX_LENGTH + 8}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded border border-ink-600 bg-ink-700 px-3 py-2 text-sm text-bone-100 outline-none focus:border-gold-500/60"
        />
        {!nameValid && <p className="mt-1 text-xs text-red-300">姓名必须为 1–{NAME_MAX_LENGTH} 个字符</p>}

        <div className="mt-4 flex items-center gap-6">
          <span className="text-xs text-bone-500">性别</span>
          {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
            <label key={g} className="flex cursor-pointer items-center gap-2 text-sm text-bone-300">
              <input
                type="radio"
                name="gender"
                checked={gender === g}
                onChange={() => setGender(g)}
                className="accent-gold-400"
              />
              {GENDER_LABELS[g]}
            </label>
          ))}
        </div>

        <div className="mt-4">
          <span className="mb-2 block text-xs text-bone-500">初始职业</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.values(PROFESSIONS).map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-2 rounded border p-3 text-sm transition-colors ${
                  profession === p.id ? 'border-gold-500/60 bg-gold-500/10' : 'border-ink-600 bg-ink-700/50 hover:bg-ink-700'
                }`}
              >
                <input
                  type="radio"
                  name="profession"
                  checked={profession === p.id}
                  onChange={() => setProfession(p.id)}
                  className="mt-1 accent-gold-400"
                />
                <span>
                  <span className="block font-bold text-bone-100">{p.name}</span>
                  <span className="block text-xs leading-relaxed text-bone-500">{p.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wider text-bone-500">属性分配</h2>
          <span className="text-sm text-bone-300">
            剩余属性点：<span className="font-bold text-gold-300">{pointsLeft} / {ATTRIBUTE_POINT_BUDGET}</span>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {ATTRIBUTE_KEYS.map((key) => {
            const value = attributes[key]
            const mod = getAttributeModifier(value)
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-sm text-bone-300">{ATTRIBUTE_LABELS[key]}</span>
                <Button
                  className="!px-3 !py-1"
                  disabled={value <= ATTRIBUTE_MIN}
                  onClick={() => adjust(key, -1)}
                  aria-label={`降低${ATTRIBUTE_LABELS[key]}`}
                >
                  -
                </Button>
                <span className="w-10 text-center text-base font-bold tabular-nums text-bone-100">{value}</span>
                <Button
                  className="!px-3 !py-1"
                  disabled={value >= ATTRIBUTE_MAX || pointsLeft <= 0}
                  onClick={() => adjust(key, 1)}
                  aria-label={`提高${ATTRIBUTE_LABELS[key]}`}
                >
                  +
                </Button>
                <span className="w-14 text-sm tabular-nums text-bone-500">（{signed(mod)}）</span>
              </div>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-bone-500">
          可分配属性点 {ATTRIBUTE_POINT_BUDGET}，属性范围 {ATTRIBUTE_MIN}–{ATTRIBUTE_MAX}，最终五属性总和固定 {ATTRIBUTE_TOTAL}；
          初始生命 {10}+体质、初始灵力 max(0, 冥想−2)。
        </p>
      </section>

      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm leading-relaxed text-bone-300">
        <h2 className="mb-2 text-sm font-bold tracking-wider text-bone-500">角色摘要</h2>
        <p className="text-base font-bold text-bone-100">
          {trimmedName || '——'}
          <span className="ml-2 text-sm font-normal text-bone-500">
            {GENDER_LABELS[gender]} · {PROFESSIONS[profession].name} · Lv.1
          </span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
          {ATTRIBUTE_KEYS.map((key) => (
            <div key={key} className="flex justify-between">
              <span className="text-bone-500">{ATTRIBUTE_LABELS[key]}</span>
              <span className="tabular-nums">
                {attributes[key]}（{signed(getAttributeModifier(attributes[key]))}）
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2">
          生命 <span className="tabular-nums text-bone-100">{maxHp}</span> · 灵力{' '}
          <span className="tabular-nums text-bone-100">{maxMp}</span>
        </p>
      </section>

      <footer className="flex items-center justify-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          返回主菜单
        </Button>
        <Button variant="primary" disabled={!canConfirm} onClick={handleConfirm}>
          确认进入天梦大陆
        </Button>
      </footer>
    </div>
  )
}
