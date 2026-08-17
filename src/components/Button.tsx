import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'border-gold-500/60 bg-gold-500/10 text-gold-300 hover:bg-gold-500/20 hover:border-gold-400 active:bg-gold-500/30',
  ghost:
    'border-ink-600 bg-ink-800/60 text-bone-300 hover:bg-ink-700 hover:text-bone-100 active:bg-ink-600',
  danger:
    'border-red-900/70 bg-red-950/30 text-red-300 hover:bg-red-900/40 active:bg-red-900/50',
}

export default function Button({ variant = 'ghost', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded border px-4 py-2 text-sm tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    />
  )
}
