// Shared className strings for rows inside a KebabMenu dropdown, so every action
// menu (campaign header/cards, employee directory, team) stays visually consistent.
export const MENU_ITEM = 'w-full text-start px-3 py-2.5 rounded-[10px] text-sm font-medium text-zinc-900 hover:bg-zinc-100 transition-colors'
// Terracotta, not error-red: per the design system, red is reserved for true
// errors — destructive-but-routine actions (like deleting a draft) use the
// secondary/terracotta color instead.
export const MENU_ITEM_DANGER = 'w-full text-start px-3 py-2.5 rounded-[10px] text-sm font-medium text-[var(--color-secondary)] hover:bg-[var(--color-status-closed-bg)] transition-colors'
export const MENU_ITEM_DISABLED = 'w-full text-start px-3 py-2.5 rounded-[10px] text-sm font-medium text-zinc-300 cursor-not-allowed'
