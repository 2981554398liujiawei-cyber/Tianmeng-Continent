import { useEffect, useRef, type ReactNode } from 'react'

/**
 * 通用右侧抽屉（TM-P2-006）：任务/记录、战斗详细日志、活动记录等二级 UI。
 * UI ephemeral（useState 控制），不进入 GameState。
 * 无障碍：role dialog、ESC 关闭、初始 focus 可达。
 */
interface DrawerProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** 抽屉宽度（Tailwind 类） */
  widthClass?: string
  ariaLabel?: string
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
  widthClass = 'w-[min(92vw,420px)]',
  ariaLabel,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // ESC 关闭 + focus 管理（打开时聚焦关闭按钮，关闭时释放）
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    closeButtonRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-ink-950/60"
        aria-hidden
        onClick={onClose}
      />
      {/* 面板 */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        className={`relative z-10 flex h-full flex-col border-l border-ink-600 bg-ink-900 shadow-2xl ${widthClass}`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-ink-600 px-4 py-3">
          <h3 className="text-base font-bold tracking-widest text-gold-300">{title}</h3>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭"
            className="rounded border border-ink-600 bg-ink-800/60 px-3 py-1 text-sm text-bone-300 hover:bg-ink-700"
            onClick={onClose}
          >
            关闭
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  )
}
