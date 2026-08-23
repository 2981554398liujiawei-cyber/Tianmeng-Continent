/**
 * 移动端底部固定导航（TM-P2-008 §14）。
 * <768（md）：左右栏隐藏后，通过底部 tab 打开对应 Drawer。
 *   [角色] → PlayerSidebar、[冒险] → AdventureSidebar、[背包] → BackpackPanel。
 * 保持 data-testid 在 DOM（CSS hidden md:hidden 而非条件渲染）。
 */
interface MobileNavProps {
  onOpenRole: () => void
  onOpenAdventure: () => void
  onOpenBackpack: () => void
}

export default function MobileNav({ onOpenRole, onOpenAdventure, onOpenBackpack }: MobileNavProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-600 bg-ink-900/95 backdrop-blur md:hidden"
      aria-label="移动端导航"
    >
      <div className="grid grid-cols-3">
        <button
          type="button"
          data-testid="mobile-nav-role"
          onClick={onOpenRole}
          className="py-3 text-sm text-bone-300 transition-colors hover:bg-ink-800"
        >
          角色
        </button>
        <button
          type="button"
          data-testid="mobile-nav-adventure"
          onClick={onOpenAdventure}
          className="py-3 text-sm text-bone-300 transition-colors hover:bg-ink-800"
        >
          冒险
        </button>
        <button
          type="button"
          data-testid="mobile-nav-backpack"
          onClick={onOpenBackpack}
          className="py-3 text-sm text-bone-300 transition-colors hover:bg-ink-800"
        >
          背包
        </button>
      </div>
    </nav>
  )
}
