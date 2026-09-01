// AM11 follow-up: PencilIcon, CrossIcon and GrabDotsIcon below have zero
// import sites anywhere in src/ (verified by grep) - dead code, not wired
// into any surface. AM11 sizing is picked from where an icon actually
// renders; with no render site to read, sizing these three would be a
// guess, not a read, so their old ad hoc 11/13px boxes are left exactly as
// they were rather than invented into a tier. Reported, not fixed - see
// this wave's own report for the full note.
export function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="m5.433 13.917 1.262-3.155A4 4 0 0 1 7.58 9.42l6.92-6.918a2.121 2.121 0 0 1 3 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 0 1-.65-.65Z" />
      <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0 0 10 3H4.75A2.75 2.75 0 0 0 2 5.75v9.5A2.75 2.75 0 0 0 4.75 18h9.5A2.75 2.75 0 0 0 17 15.25V10a.75.75 0 0 0-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5Z" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" width="11" height="11" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4.22 4.22a.75.75 0 0 1 1.06 0L10 8.94l4.72-4.72a.75.75 0 1 1 1.06 1.06L11.06 10l4.72 4.72a.75.75 0 1 1-1.06 1.06L10 11.06l-4.72 4.72a.75.75 0 0 1-1.06-1.06L8.94 10 4.22 5.28a.75.75 0 0 1 0-1.06Z" />
    </svg>
  );
}

export function GrabDotsIcon() {
  return (
    <svg viewBox="0 0 10 16" width="8" height="12" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="7" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="7" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" />
      <circle cx="7" cy="13" r="1.4" />
    </svg>
  );
}

// F3/F4: the per-cell / per-column-header "Actions" menu trigger
// (CellMenu.tsx) - three horizontal lines, same shape/props as the icons
// above (@mui/icons-material is not a dependency in this repo).
//
// AM11 icon-size pin: both real render sites are dense-grid row triggers -
// CellMenu.tsx's own per-cell/per-column-header trigger (this table's body
// cells and header cells are both part of the same dense grid, not a
// toolbar or a page header) and TaskCell.tsx's per-cell trigger, which its
// own comment says is modelled directly on this file's `.cellMenu` reveal
// pattern. Neither is a toolbar/button-cluster or a page/panel header, so
// this is the 16px "dense table rows" tier, not 20px or 24px. viewBox and
// path data are unchanged (AM11 follow-up's own constraint) - only the
// rendered box grew from the old ad hoc 13px to the pinned 16px. No stroke
// attribute exists on this icon (solid `fill`, not an outline/stroke
// glyph), so AM11's "stroke weight 1.5" has nothing to apply to here.
export function HamburgerIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="3" y="5" width="14" height="1.6" rx="0.8" />
      <rect x="3" y="9.2" width="14" height="1.6" rx="0.8" />
      <rect x="3" y="13.4" width="14" height="1.6" rx="0.8" />
    </svg>
  );
}
