"use client";

// F3/F4: the one hamburger-menu component used by BOTH body cells (per-cell
// "Copy information to other cells", AC22-AC24) and column headers
// (per-column "Copy all", AC35/AC37) - same icon-only trigger, same MUI
// `Menu` idiom CoursesTable.tsx's existing Columns dropdown already uses
// (anchorEl/open/onClose over `@mui/material` only - `@mui/icons-material`
// is not a dependency here).
//
// The trigger sits inside a click-to-edit `<td>` (body cells) or a
// sort-triggering `<th>` (headers), so every event that could otherwise
// bubble up into either of those handlers is stopped at the button itself
// (AC23/AC36) - click, mousedown, AND keydown, not click alone.
//
// Escape-closes-and-returns-focus-to-trigger (AC34) falls out of MUI's own
// Menu behavior without any code here: Menu is built on Popover -> Modal
// (Menu.js -> Popover.js -> Modal.js), and Modal always wraps its content in
// Unstable_TrapFocus (Modal.js) with `disableRestoreFocus` defaulting to
// `false` - so FocusTrap's own cleanup (Unstable_TrapFocus/FocusTrap.js)
// refocuses the trigger on any close, Escape included.
//
// CORRECTION 7: a `disabled` MenuItem does NOT just "not fire onClick" - that
// was true but incomplete, and hid the actual defect (A7). MenuList's own
// `disabledItemsFocusable` prop defaults to `false` (MenuList.js), so its
// roving tabindex SKIPS every disabled item outright rather than merely
// declining to activate it; when EVERY item in a menu is disabled (true here
// whenever a column is not copyable, or whenever only one course is in
// view), a keyboard user opens the menu, finds nothing focusable inside it,
// and never hears the disabled reason at all. `disabledItemsFocusable: true`
// below (passed through Menu's `slotProps.list`, verified against
// Menu.js/Menu.d.ts for 9.0.1) fixes that: MenuItem/ButtonBase then keep the
// item in the roving tabindex and mark it `aria-disabled` instead of
// removing it from focus (useFocusableWhenDisabled.js) - it still does not
// fire onClick (useButtonBase.js's handleClick returns before calling
// through when `disabled` is set), but it is now actually reachable, and its
// reason is wired below as the item's accessible description (A7).
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import { HamburgerIcon } from "./icons";

export interface CellMenuItem {
  key: string;
  label: string;
  /** Shown under the label for every item (copyable or not) when present. */
  helperText?: string;
  disabled?: boolean;
  /** Shown under the label INSTEAD of helperText when `disabled` is true -
   * AC26/AC29's "disabled with an explanatory reason", never a hidden item.
   * Wired below as the item's accessible DESCRIPTION (aria-describedby onto
   * this same visible text, via ListItemText's `secondary` slot id) rather
   * than left to fold into the item's accessible NAME as incidental subtree
   * text (A7) - a screen reader user who lands on a disabled item hears the
   * label, then the reason, as two distinct pieces rather than one run-on
   * string. */
  disabledReason?: string;
  onSelect: () => void;
}

export interface CellMenuProps {
  /** The column's own label (e.g. "Institution", "Name") - used to build the
   * trigger's accessible name (AC22), never a bare "menu". */
  label: string;
  items: CellMenuItem[];
  /** B1: disambiguates the trigger's accessible name when many identical
   * triggers are in the same AT control list. A body cell passes the course
   * name, producing "Actions for Institution, CS 101"; omitted (header use)
   * produces "Actions for Institution column". */
  context?: string;
}

export default function CellMenu({ label, items, context }: CellMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const accessibleName = context ? `Actions for ${label}, ${context}` : `Actions for ${label} column`;
  // CORRECTION 4: a stable id (React's useId, never re-generated across
  // re-renders) linking the trigger's aria-controls to the Menu's own list -
  // without it a screen reader announces the trigger as a plain button, with
  // no indication a menu will open or whether it currently is.
  const menuListId = useId();
  const reasonIdBase = useId();

  const stopBubble = (e: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
  };

  const closeMenu = () => setAnchorEl(null);

  return (
    <>
      <IconButton
        size="small"
        aria-label={accessibleName}
        // B5: "menu" is the correct token for a trigger that opens a
        // role="menu" popup - "true" is only for popups whose role isn't one
        // of the specific ARIA popup roles (menu/listbox/tree/grid/dialog).
        aria-haspopup="menu"
        aria-expanded={open}
        // B5: MUI's Menu defaults to `keepMounted: false` (Modal.js), so the
        // list element this id points to does not exist in the DOM while
        // closed - pointing aria-controls at it then would dangle. Only set
        // it once the list is actually mounted.
        aria-controls={open ? menuListId : undefined}
        // B6: CellMenu's own open/closed state, read by CoursesTable.module.css
        // via :has() so the wrapping .cellMenu reveal survives focus moving
        // into the (portaled) menu - see that file's comment for why.
        data-cell-menu-open={open ? "true" : undefined}
        sx={{ padding: "3px" }}
        onClick={(e) => {
          e.stopPropagation();
          setAnchorEl(e.currentTarget);
        }}
        onMouseDown={stopBubble}
        onKeyDown={stopBubble}
      >
        <HamburgerIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={closeMenu}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Escape still reaches MUI's own Menu (which closes it and
          // restores focus to the trigger) - only the bubble to the
          // surrounding td/th is stopped here, never the key itself.
          e.stopPropagation();
        }}
        slotProps={{
          list: {
            "aria-label": accessibleName,
            id: menuListId,
            // A7: see the file-header CORRECTION 7 note above.
            disabledItemsFocusable: true,
          },
        }}
      >
        {items.map((item, index) => {
          const reasonId = item.disabled && item.disabledReason ? `${reasonIdBase}-${index}` : undefined;
          return (
            <MenuItem
              key={item.key}
              disabled={item.disabled}
              aria-describedby={reasonId}
              onClick={() => {
                closeMenu();
                item.onSelect();
              }}
            >
              <ListItemText
                primary={item.label}
                secondary={item.disabled ? item.disabledReason : item.helperText}
                slotProps={reasonId ? { secondary: { id: reasonId } } : undefined}
              />
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
