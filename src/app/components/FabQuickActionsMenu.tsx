"use client";

// The FAB's trigger button plus its quick-actions menu, extracted out of
// AiChatFab.tsx (which was approaching this pass's 950-line cap) and
// rebuilt from a MUI `SpeedDial` into a MUI `Menu` anchored to a plain
// `Fab` trigger - the F3/F6 fix.
//
// WHY A MENU, NOT staticTooltipLabel ON EVERY SpeedDialAction (F3):
//   - `SpeedDial`/`SpeedDialAction` keeps every action mounted in the DOM at
//     all times (only `opacity`/`transform`/`pointer-events` toggle it
//     invisible), so a screen reader's virtual cursor meets seven
//     `menuitem`s on every route whether or not the dial is open - the F6
//     "closed actions are never aria-hidden" bug. A MUI `Menu`, by
//     contrast, does not render its `MenuItem`s into the DOM at all while
//     closed (the default `keepMounted={false}` below is load-bearing -
//     see the sabotage-checked test in FabQuickActionsMenu.wiring.test.ts
//     that guards against a future `keepMounted` creeping back in). That
//     single component swap fixes F6's AT-exposure bug as a side effect of
//     fixing F3, rather than needing a second, independent fix.
//   - `MenuList` gives roving `tabIndex`, typeahead, Escape-to-close with
//     focus restored to the anchor, and click-away, all for free - the
//     exact list of things the F3 acceptance criteria asked a Menu-based
//     redesign to buy.
//   - The visible label IS the accessible name (MenuItem's own text
//     content), not a `title` attribute a screen reader happens to read as
//     `aria-label` - so there is no separate "does the tooltip branch even
//     render" failure mode left to have on touch (`enterTouchDelay`
//     doesn't apply here at all: there is no tooltip in the activation
//     path).
//
// KEYBOARD-OPEN (F6): a native `<button>`'s Enter/Space already fire
// `onClick` (which opens the menu) with no extra wiring. Only ArrowUp/
// ArrowDown need an explicit handler, because - unlike SpeedDial, which
// tried to open on FOCUS and had to rejected every reason but "toggle" - a
// plain button never opens anything on focus alone. Preserve item 7 (open
// on click, never hover) holds structurally: MUI Menu has no hover-open
// behavior to begin with.
//
// ANCHORING (preserve item 5): anchorOrigin "top/right" + transformOrigin
// "bottom/right" opens the menu ABOVE and right-aligned to the Fab, the
// same "expands upward" shape the old SpeedDial had - so
// computeLiveBadgePosition's "beside, not above" placement for the live
// badge stays correct without any change to that function.
//
// F4: five entries, not seven - AI Chatbot, Live Class, Checklist Overview
// and Check screen legibility stay top-level; the three former recording-
// variant entries (Discussions/Announcement/Grading) are merged into one
// "Recording tools" entry that navigates to the Recording tab's base
// "record" view, where all eight of its views are already reachable from
// its own labelled tab strip - see AiChatFab.tsx's own comment on
// handleOpenRecordingTools for why a plain navigate was chosen over a
// nested submenu.
import { useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import Fab from "@mui/material/Fab";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import { ChatIcon, LegibilityProbeIcon, RecordingToolsIcon, MenuTriggerIcon } from "./fab-icons";
import { LiveClassIcon } from "./live-class/LiveClassWindow";
import { ChecklistIcon } from "./courses/WeeklyChecklistOverviewModal";

const MENU_ID = "fab-quick-actions-menu";

export interface FabQuickActionsMenuProps {
  bottom: number;
  right: number;
  onOpenChat: () => void;
  onOpenLiveClass: () => void;
  onOpenChecklist: () => void;
  onOpenLegibilityProbe: () => void;
  onOpenRecordingTools: () => void;
  /** Present (a human-readable reason) disables the Live Class entry;
   * absent/undefined leaves it enabled. Computed by the caller from
   * fab-menu-logic.ts's supportsMicrophone - gating a control BEFORE the
   * click rather than only after (F6). */
  liveClassDisabledReason?: string;
  /** Same shape as liveClassDisabledReason, for the Legibility probe entry
   * (supportsGetDisplayMedia). */
  legibilityProbeDisabledReason?: string;
}

interface QuickAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabledReason?: string;
}

export default function FabQuickActionsMenu({
  bottom,
  right,
  onOpenChat,
  onOpenLiveClass,
  onOpenChecklist,
  onOpenLegibilityProbe,
  onOpenRecordingTools,
  liveClassDisabledReason,
  legibilityProbeDisabledReason,
}: FabQuickActionsMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  const closeMenu = () => setAnchorEl(null);

  const runAction = (action: () => void) => {
    closeMenu();
    action();
  };

  const handleTriggerClick = (e: MouseEvent<HTMLButtonElement>) => {
    setAnchorEl((current) => (current ? null : e.currentTarget));
  };

  // F6: ArrowUp/ArrowDown on the (closed) trigger opens the menu explicitly,
  // rather than relying on any "open on focus" behavior - there is none
  // here for this to accidentally trip, which is the point.
  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setAnchorEl(e.currentTarget);
    }
  };

  // F2: every entry OPENS its destination; it never toggles one that is
  // already open closed. Closing is the window's own header "x" control's
  // job, never the menu's - see AiChatFab.tsx's handleOpen* callbacks,
  // which this component only ever calls, never a setXOpen(!xOpen) toggle.
  const actions: QuickAction[] = [
    { key: "chat", label: "AI Chatbot", icon: <ChatIcon />, onClick: onOpenChat },
    {
      key: "live-class",
      label: "Live Class",
      icon: <LiveClassIcon />,
      onClick: onOpenLiveClass,
      disabledReason: liveClassDisabledReason,
    },
    { key: "checklist", label: "Checklist Overview", icon: <ChecklistIcon />, onClick: onOpenChecklist },
    {
      key: "legibility",
      label: "Check screen legibility",
      icon: <LegibilityProbeIcon />,
      onClick: onOpenLegibilityProbe,
      disabledReason: legibilityProbeDisabledReason,
    },
    {
      key: "recording-tools",
      label: "Recording tools",
      icon: <RecordingToolsIcon />,
      onClick: onOpenRecordingTools,
    },
  ];

  return (
    <>
      <Fab
        aria-label="Quick actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? MENU_ID : undefined}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        sx={{
          position: "fixed",
          bottom,
          right,
          zIndex: 9999,
          background: "var(--accent)",
          color: "var(--text-on-accent)",
          // A permanently-floating trigger gets the strongest elevation
          // tier (docs/aesthetics-pass-acceptance-criteria.md's shadow
          // scale reserves --shadow-lg for "floating windows" - the FAB is
          // the entry point for exactly those).
          boxShadow: "var(--shadow-lg)",
          "&:hover": { background: "var(--accent-hover)" },
        }}
      >
        <MenuTriggerIcon />
      </Fab>
      {/* keepMounted deliberately left unset - see this file's own header
          for why the default (false) is load-bearing; do not add it. */}
      <Menu
        id={MENU_ID}
        anchorEl={anchorEl}
        open={open}
        onClose={closeMenu}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        slotProps={{ list: { "aria-label": "Quick actions" } }}
      >
        {actions.map((action) => {
          const menuItem = (
            <MenuItem
              key={action.disabledReason ? undefined : action.key}
              onClick={() => runAction(action.onClick)}
              disabled={Boolean(action.disabledReason)}
              sx={{
                // AM11's disabled rule: opacity 0.5 + cursor not-allowed,
                // never a colour swap - overrides MUI's own default
                // disabled-opacity token so this matches every other
                // disabled control in the app exactly.
                "&.Mui-disabled": { opacity: 0.5, cursor: "not-allowed" },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>{action.icon}</ListItemIcon>
              <ListItemText>{action.label}</ListItemText>
            </MenuItem>
          );
          if (!action.disabledReason) {
            // The common case: MenuItem is Menu's direct child, exactly as
            // MenuList (roving tabIndex, typeahead, arrow-key navigation)
            // expects.
            return menuItem;
          }
          // A DISABLED element fires no mouse events, so Tooltip needs a
          // plain wrapping span to still see hover/focus and show the
          // reason - MUI's own documented workaround, deliberately applied
          // ONLY to disabled entries: wrapping every entry this way would
          // hand MenuList a <span> instead of a MenuItem as its direct
          // child and silently break roving-tabIndex/typeahead for the
          // four entries that are never disabled.
          return (
            <Tooltip key={action.key} title={action.disabledReason}>
              <span>{menuItem}</span>
            </Tooltip>
          );
        })}
      </Menu>
    </>
  );
}
