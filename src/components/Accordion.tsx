import { useState, type ReactNode } from 'react'

/**
 * 通用折叠面板（TM-P2-006）：完成/历史/次级信息默认折叠。
 * UI ephemeral state（useState），不进入 GameState / 存档。
 */
interface AccordionProps {
  /** 折叠标题（含计数等由调用方传入完整字符串） */
  title: ReactNode
  /** 默认展开（进行中/可提交默认展开，已完成默认折叠） */
  defaultOpen?: boolean
  children: ReactNode
  /** 折叠头部右侧附加（如计数徽章） */
  badge?: ReactNode
  className?: string
  /** 展开状态由外部控制（受控模式；未提供则内部 useState） */
  open?: boolean
  onToggle?: (open: boolean) => void
  /** 无障碍标签 */
  ariaLabel?: string
}

export default function Accordion({
  title,
  defaultOpen = false,
  children,
  badge,
  className = '',
  open: controlledOpen,
  onToggle,
  ariaLabel,
}: AccordionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const toggle = () => {
    const next = !open
    if (controlledOpen === undefined) setInternalOpen(next)
    onToggle?.(next)
  }

  return (
    <div className={`rounded border border-ink-600 bg-ink-800/50 ${className}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-bold tracking-wider text-bone-300 hover:bg-ink-700/40"
        onClick={toggle}
      >
        <span>{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <span aria-hidden className={`text-xs text-bone-500 transition-transform ${open ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </span>
      </button>
      {open && <div className="border-t border-ink-600 px-4 py-3 text-sm text-bone-300">{children}</div>}
    </div>
  )
}
