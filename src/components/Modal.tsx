import { useEffect, useRef, type ReactNode } from 'react'
import Button from './Button'

/**
 * 通用模态框（TM-P2-006）：NPC Interaction Panel / 胜利结算等二级 UI。
 * UI ephemeral（useState 控制），不进入 GameState。
 * 无障碍：role dialog、ESC 关闭、初始 focus 可达。
 */
interface ModalProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  ariaLabel?: string
  /** 关闭按钮文案（默认「关闭」） */
  closeLabel?: string
}

export default function Modal({ open, onClose, title, children, ariaLabel, closeLabel = '关闭' }: ModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-ink-950/70" aria-hidden onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
        className="relative z-10 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded border border-ink-600 bg-ink-900 shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-ink-600 px-5 py-3">
          <h3 className="text-base font-bold tracking-widest text-gold-300">{title}</h3>
          <Button ref={closeButtonRef} variant="ghost" onClick={onClose} aria-label={closeLabel}>
            {closeLabel}
          </Button>
        </header>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
