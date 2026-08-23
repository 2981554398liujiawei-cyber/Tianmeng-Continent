import { useEffect } from 'react'

/**
 * 轻量提示（TM-P2-008 §13/§32）。
 * 固定顶部中央，2.5s 自动消失；UI ephemeral（useState 控制），不进入 GameState / 存档。
 * 用途：获得新线索、任务状态推进等瞬时反馈（长期信息迁右栏 Clue Journal，中间区不常驻）。
 */
interface ToastProps {
  /** 提示文本；null 时不渲染 */
  message: string | null
  /** 自动消失/手动关闭时回调（由调用方清空 state） */
  onDone: () => void
}

export default function Toast({ message, onDone }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDone, 2500)
    return () => clearTimeout(timer)
  }, [message, onDone])

  if (!message) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 top-16 z-[60] -translate-x-1/2"
    >
      <div className="rounded border border-gold-500/50 bg-ink-900 px-4 py-2 text-sm text-gold-200 shadow-xl">
        {message}
      </div>
    </div>
  )
}
