// slotProps for any MUI TextField-select rendered INSIDE one of the app's
// floating windows (the live-class window and the chat window, both
// styles.selectionChatWindow).
//
// MUI renders a Select's dropdown in a portal attached to <body>, at its
// theme z-index for modals - 1300 by default. The floating windows sit far
// above that (.selectionChatWindow is z-index 9998, and the FAB itself is
// 9999, see page.module.css), so a select inside one of those windows opens
// its menu BEHIND the window that owns it: the list is rendered, but
// invisible and unclickable.
//
// Raising the menu above both fixes it. This is deliberately a shared
// constant rather than a magic number repeated per select, because the
// failure is invisible in code review - the markup looks correct, and the bug
// only appears when the window happens to overlap its own menu.
//
// Note the nesting: TextField forwards to Select via `slotProps.select`, so
// the menu's own props are `slotProps.select.MenuProps`. A top-level
// `MenuProps` on TextField is not a valid prop in this MUI version and fails
// to typecheck.
export const FLOATING_WINDOW_MENU_Z_INDEX = 10000;

export const floatingWindowSelectSlotProps = {
  select: {
    MenuProps: { sx: { zIndex: FLOATING_WINDOW_MENU_Z_INDEX } },
  },
} as const;
