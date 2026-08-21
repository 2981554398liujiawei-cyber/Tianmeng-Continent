/**
 * 云存档口令页（TM-P2-005 22/48/56 节）。
 *  - App 启动第一屏（不再直接显示主菜单）。
 *  - 口令 → 云存档空间（不存在“密码错误”，只有“这个口令目前没有云存档”）。
 *  - 未配置云端端点 → 「云存档服务尚未配置」+ 仅本机模式降级入口（不 crash）。
 *  - 云端无档 + 本机有档 → 「上传本机存档 / 创建空白云存档」迁移体验（15.1/16 节）。
 *  - passphrase 仅 runtime memory；绝不写 localStorage / 日志 / URL。
 */
import { useState } from 'react'
import Button from '../components/Button'
import { useCloudSession } from '../cloud/cloudSessionStore'
import { isCloudConfigured, normalizePassphrase, validatePassphrase } from '../cloud/cloudSaveApi'
import { hasAnySave } from '../game/utils/storage'
import { getLocation } from '../game/content'

interface CloudUnlockPageProps {
  /** 解锁成功（含仅本机模式）后进入主菜单 */
  onUnlocked: () => void
}

export default function CloudUnlockPage({ onUnlocked }: CloudUnlockPageProps) {
  const status = useCloudSession((s) => s.status)
  const revision = useCloudSession((s) => s.revision)
  const unlock = useCloudSession((s) => s.unlock)
  const enterLocalOnly = useCloudSession((s) => s.enterLocalOnly)
  const createEmptyVault = useCloudSession((s) => s.createEmptyVault)
  const uploadLocalAsVault = useCloudSession((s) => s.uploadLocalAsVault)
  const unlockConflict = useCloudSession((s) => s.unlockConflict)
  const resolveConflictByLoading = useCloudSession((s) => s.resolveConflictByLoading)
  const resolveConflictByOverwrite = useCloudSession((s) => s.resolveConflictByOverwrite)

  const [passphrase, setPassphrase] = useState('')
  const [showPassphrase, setShowPassphrase] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmLocalOverwrite, setConfirmLocalOverwrite] = useState(false)
  const [confirmEmptyCloud, setConfirmEmptyCloud] = useState(false)

  // 云端无档 + 本机有档 → 迁移选择（TM-P2-005 15.1/16 节）
  const cloudEmptyWithLocalSave = status === 'migration_choice' && revision === 0 && hasAnySave()

  const configured = isCloudConfigured()

  const handleSubmit = async () => {
    if (busy || status === 'loading') return
    const normalized = normalizePassphrase(passphrase)
    const invalid = validatePassphrase(normalized)
    if (invalid) {
      setInputError(invalid)
      return
    }
    setInputError(null)
    setServerError(null)
    setBusy(true)
    const result = await unlock(normalized)
    setBusy(false)
    if (result === 'invalid') {
      setInputError(validatePassphrase(normalized) ?? '口令无效。')
      return
    }
    if (result === 'error') {
      setServerError('云存档暂时无法连接。')
      return
    }
    // 云端无档 + 本机有档：留在口令页展示迁移面板（上传本机存档 / 创建空白云存档）
    const session = useCloudSession.getState()
    if (session.unlockConflict) return
    if (session.revision === 0 && hasAnySave()) return
    onUnlocked()
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-gold-300">天 梦 大 陆</h1>
        <p className="mt-2 text-sm text-bone-500">云存档口令 · 多设备继续冒险</p>
      </div>

      <section className="w-full rounded border border-ink-600 bg-ink-900/50 p-5">
        <label htmlFor="cloud-passphrase" className="mb-2 block text-sm text-bone-300">
          云存档口令
        </label>
        <div className="flex gap-2">
          <input
            id="cloud-passphrase"
            type={showPassphrase ? 'text' : 'password'}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit()
            }}
            placeholder="输入你的口令"
            autoComplete="off"
            className="min-w-0 flex-1 rounded border border-ink-600 bg-ink-950 px-3 py-2 text-bone-100 outline-none focus:border-gold-400"
          />
          <Button variant="ghost" onClick={() => setShowPassphrase((v) => !v)} className="shrink-0">
            {showPassphrase ? '隐藏' : '显示'}
          </Button>
        </div>
        {inputError && <p className="mt-2 text-xs text-red-300">{inputError}</p>}

        {status === 'loading' && <p className="mt-3 text-sm text-bone-400">正在读取云存档…</p>}
        {serverError && (
          <div className="mt-3">
            <p className="text-sm text-red-300">{serverError}</p>
            {/* TM-P2-005 24 节：服务器不可达的故障降级入口（明确提示不跨设备同步） */}
            <div className="mt-2 flex flex-col gap-2">
              <Button variant="ghost" onClick={() => enterLocalOnly()}>
                仅使用本机存档进入
              </Button>
              <p className="text-xs text-bone-500">当前不会跨设备同步。</p>
            </div>
          </div>
        )}

        <Button variant="primary" onClick={() => void handleSubmit()} disabled={busy || status === 'loading'} className="mt-4 w-full">
          进入天梦大陆
        </Button>
        <p className="mt-3 text-center text-xs text-bone-500">存档将同步到云端</p>
      </section>

      {unlockConflict && (
        <section className="w-full rounded border border-red-500/50 bg-red-950/20 p-5" aria-live="polite">
          <h2 className="text-lg font-bold text-red-200">本机/云端存档冲突</h2>
          <p className="mt-2 text-sm text-bone-300">两边的存档内容不同。请选择要保留的版本，本机存档不会被自动覆盖。</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SaveSummary title="本机最新存档" summary={unlockConflict.local} />
            <SaveSummary title="云端最新存档" summary={unlockConflict.cloud} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {!confirmLocalOverwrite ? (
              <>
                <Button variant="primary" disabled={busy} onClick={async () => {
                  setBusy(true)
                  const ok = await resolveConflictByLoading()
                  setBusy(false)
                  if (ok) onUnlocked()
                  else setServerError('云存档暂时无法连接。')
                }}>
                  使用云端存档
                </Button>
                <Button variant="danger" disabled={busy} onClick={() => setConfirmLocalOverwrite(true)}>
                  使用本机存档覆盖云端
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-red-200">确认后，云端现有进度将被本机存档替换。</p>
                <Button variant="danger" disabled={busy} onClick={async () => {
                  setBusy(true)
                  const ok = await resolveConflictByOverwrite()
                  setBusy(false)
                  if (ok) onUnlocked()
                  else setServerError('云存档暂时无法连接。')
                }}>
                  确认使用本机存档覆盖云端
                </Button>
                <Button variant="ghost" disabled={busy} onClick={() => setConfirmLocalOverwrite(false)}>取消</Button>
              </>
            )}
          </div>
        </section>
      )}

      {/* 云端无档 + 本机有档：迁移体验（TM-P2-005 15.1/16 节） */}
      {cloudEmptyWithLocalSave && (
        <section className="w-full rounded border border-gold-600/40 bg-gold-900/20 p-5">
          <p className="text-sm text-bone-300">检测到当前浏览器已有本地存档。</p>
          <p className="mt-1 text-xs text-bone-500">这个口令还没有云存档。你可以把本机存档作为云存档的初始版本，或从空白开始。</p>
          <div className="mt-3 flex flex-col gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setServerError(null)
                const result = await uploadLocalAsVault()
                setBusy(false)
                if (result === 'connected') onUnlocked()
                else if (result === 'error') setServerError('云存档暂时无法连接。')
              }}
            >
              使用本机存档创建云存档
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setConfirmEmptyCloud(true)}
            >
              创建空白云存档
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => { enterLocalOnly(); onUnlocked() }}>
              保留本机存档，仅在本机进入
            </Button>
            {confirmEmptyCloud && (
              <div className="rounded border border-red-500/50 bg-red-950/20 p-3" role="alertdialog" aria-label="确认创建空白云存档">
                <p className="text-sm text-red-200">云端将从空白开始，本机存档仍保留在当前浏览器。</p>
                <div className="mt-2 flex flex-col gap-2">
                  <Button variant="danger" disabled={busy} onClick={async () => {
                    setBusy(true)
                    setServerError(null)
                    const result = await createEmptyVault()
                    setBusy(false)
                    if (result === 'connected') onUnlocked()
                    else if (result === 'error') setServerError('云存档暂时无法连接。')
                  }}>
                    确认创建空白云存档
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmEmptyCloud(false)}>取消</Button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 未配置云端端点：降级入口（TM-P2-005 56 节：不 crash，明确提示不跨设备同步） */}
      {!configured && status === 'not_configured' && (
        <section className="w-full rounded border border-ink-600 bg-ink-900/50 p-5 text-center">
          <p className="text-sm text-bone-400">云存档服务尚未配置</p>
          <p className="mt-1 text-xs text-bone-500">当前不会跨设备同步。</p>
          <Button variant="ghost" className="mt-3" onClick={() => enterLocalOnly()}>
            仅本机模式
          </Button>
        </section>
      )}
    </div>
  )
}

function SaveSummary({ title, summary }: {
  title: string
  summary: { playerName: string; level: number; locationId: string; savedAt: string } | null
}) {
  return (
    <div className="rounded border border-ink-600 bg-ink-900/60 p-3 text-sm">
      <h3 className="font-semibold text-gold-300">{title}</h3>
      {summary ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-bone-300">
          <dt>角色</dt><dd>{summary.playerName}</dd>
          <dt>等级</dt><dd>{summary.level}</dd>
          <dt>地点</dt><dd>{getLocation(summary.locationId)?.name ?? '地点数据异常'}</dd>
          <dt>保存时间</dt><dd>{summary.savedAt}</dd>
        </dl>
      ) : <p className="mt-2 text-bone-500">无有效存档</p>}
    </div>
  )
}
