import { useState } from 'react'
import Button from '../components/Button'
import { useGameStore } from '../game/state/gameStore'
import { getLocation, getProfessionName } from '../game/content'
import type { ProfessionId } from '../game/types'
import { SLOT_IDS, type SlotId } from '../game/utils/storage'

interface SaveSlotsPageProps {
  /** save：游戏内保存（点击槽位保存后返回）；load：主菜单读取（点击槽位读取后进入游戏） */
  mode: 'save' | 'load'
  onBack: () => void
  /** 保存成功后回调（返回游戏页） */
  onSaved: () => void
  /** 读取成功后回调（进入游戏页） */
  onLoaded: () => void
}

const SLOT_LABELS: Record<SlotId, string> = {
  slot1: '存档位 1',
  slot2: '存档位 2',
  slot3: '存档位 3',
  slot4: '存档位 4',
  slot5: '存档位 5',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function SaveSlotsPage({ mode, onBack, onSaved, onLoaded }: SaveSlotsPageProps) {
  const gameState = useGameStore((s) => s.gameState)
  const slots = useGameStore((s) => s.slots)
  const saveGame = useGameStore((s) => s.saveGame)
  const loadSlot = useGameStore((s) => s.loadSlot)
  const deleteSlot = useGameStore((s) => s.deleteSlot)
  const exportSaves = useGameStore((s) => s.exportSaves)
  const importSaves = useGameStore((s) => s.importSaves)

  /** 等待覆盖确认的槽位（save 模式已有存档时） */
  const [pendingOverwrite, setPendingOverwrite] = useState<SlotId | null>(null)
  /** 等待删除确认的槽位 */
  const [pendingDelete, setPendingDelete] = useState<SlotId | null>(null)
  /** 导入/导出弹窗状态 */
  const [exportText, setExportText] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<'ok' | 'fail' | null>(null)
  const [copyResult, setCopyResult] = useState<boolean | null>(null)

  const handleSlotClick = (slotId: SlotId) => {
    const hasData = slots[slotId] !== null
    if (mode === 'save') {
      if (hasData && pendingOverwrite !== slotId) {
        setPendingOverwrite(slotId)
        return
      }
      setPendingOverwrite(null)
      const ok = saveGame(slotId)
      if (ok) onSaved()
      return
    }
    // load 模式：仅有效槽可读取
    if (hasData) {
      const ok = loadSlot(slotId)
      if (ok) onLoaded()
    }
  }

  const handleDelete = (slotId: SlotId) => {
    if (pendingDelete !== slotId) {
      setPendingDelete(slotId)
      return
    }
    setPendingDelete(null)
    deleteSlot(slotId)
  }

  const handleExport = () => {
    setExportText(exportSaves())
    setCopyResult(null)
  }

  const handleCopy = async () => {
    if (exportText === null) return
    try {
      await navigator.clipboard.writeText(exportText)
      setCopyResult(true)
    } catch {
      // headless / 无剪贴板权限：回退 textarea 手动选择
      setCopyResult(false)
    }
  }

  const handleDownload = () => {
    if (exportText === null) return
    try {
      const blob = new Blob([exportText], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `tianmeng-saves-v${2}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // 忽略下载失败（headless 环境）
    }
  }

  const handleImport = () => {
    setImportResult(null)
    const ok = importSaves(importText.trim())
    setImportResult(ok ? 'ok' : 'fail')
    if (ok) setImportText('')
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-gold-300">天梦大陆</h1>
        <p className="mt-1 text-sm tracking-[0.5em] text-bone-500">{mode === 'save' ? '保存游戏' : '读取存档'}</p>
      </header>

      <div className="flex flex-col gap-3">
        {SLOT_IDS.map((slotId, index) => {
          const summary = slots[slotId]
          const isEmpty = summary === null
          const locationName = summary ? (getLocation(summary.locationId)?.name ?? summary.locationId) : ''
          return (
            <div
              key={slotId}
              className="flex items-center justify-between gap-4 rounded border border-ink-600 bg-ink-800/50 p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-xs text-bone-500">Slot {index + 1}</span>
                  {isEmpty ? (
                    <span className="text-bone-500">空存档</span>
                  ) : (
                    <span className="font-bold text-bone-100">{summary.playerName}</span>
                  )}
                </div>
                {!isEmpty && summary && (
                  <p className="mt-1 truncate text-xs text-bone-500">
                    Lv.{summary.level} · {getProfessionName(summary.profession as ProfessionId)} · {locationName}
                  </p>
                )}
                {!isEmpty && summary && (
                  <p className="mt-0.5 text-xs text-bone-500">{formatTime(summary.savedAt)}</p>
                )}
                {mode === 'save' && pendingOverwrite === slotId && !isEmpty && (
                  <p className="mt-2 text-xs text-red-300">此槽已有存档，再次点击确认覆盖。</p>
                )}
                {mode === 'load' && pendingDelete === slotId && !isEmpty && (
                  <p className="mt-2 text-xs text-red-300">再次点击删除此存档。</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {mode === 'save' ? (
                  <Button variant="primary" onClick={() => handleSlotClick(slotId)}>
                    {isEmpty ? '保存到此槽' : pendingOverwrite === slotId ? '确认覆盖' : '覆盖保存'}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="primary" disabled={isEmpty} onClick={() => handleSlotClick(slotId)}>
                      读取
                    </Button>
                    {!isEmpty && (
                      <Button variant="danger" onClick={() => handleDelete(slotId)}>
                        {pendingDelete === slotId ? '确认删除' : '删除'}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* TM-P2-002 I：导入 / 导出 */}
      <section className="rounded border border-ink-600 bg-ink-800/50 p-5 text-sm text-bone-300">
        <h3 className="mb-3 text-sm font-bold tracking-wider text-bone-500">存档备份</h3>
        <p className="mb-3 text-xs text-bone-500">换端口 / 换浏览器 / 换部署地址 / 清数据前，导出五槽位 JSON 即可备份恢复。</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={handleExport}>
            导出存档
          </Button>
          <Button variant="ghost" onClick={() => setImportText('')}>
            导入存档
          </Button>
        </div>
        {exportText !== null && (
          <div className="mt-3 rounded border border-gold-500/40 bg-ink-900/50 p-3">
            <p className="mb-2 text-xs text-bone-500">导出 JSON（含全部槽位）：</p>
            <textarea
              readOnly
              value={exportText}
              rows={6}
              className="w-full rounded border border-ink-600 bg-ink-950/70 p-2 font-mono text-xs text-bone-300 outline-none"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="primary" onClick={handleCopy}>
                复制
              </Button>
              <Button variant="ghost" onClick={handleDownload}>
                下载文件
              </Button>
              <Button variant="ghost" onClick={() => setExportText(null)}>
                关闭
              </Button>
              {copyResult === true && <span className="text-xs text-gold-300">已复制</span>}
              {copyResult === false && <span className="text-xs text-bone-500">请手动全选复制</span>}
            </div>
          </div>
        )}
        <div className="mt-3">
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="粘贴导出的存档 JSON（完整校验版本与结构；非法内容不会覆盖现有存档）"
            rows={4}
            className="w-full rounded border border-ink-600 bg-ink-950/70 p-2 font-mono text-xs text-bone-300 outline-none focus:border-gold-500/60"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button variant="primary" disabled={importText.trim() === ''} onClick={handleImport}>
              导入并覆盖五槽位
            </Button>
            {importResult === 'ok' && <span className="text-xs text-gold-300">导入成功</span>}
            {importResult === 'fail' && <span className="text-xs text-red-300">导入失败：版本或结构不合法，未覆盖现有存档</span>}
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-center gap-4">
        <Button variant="ghost" onClick={onBack}>
          返回
        </Button>
      </footer>
    </div>
  )
}
