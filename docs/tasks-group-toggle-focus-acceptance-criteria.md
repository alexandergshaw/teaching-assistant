# Tasks grid: focus survives collapsing or expanding a group

Bug fix, not a feature. Extends REGRESSION #232 check 22 and #233 checks 12-14,
which pin the grid's roving-tabindex contract. #233 check 14 describes this very
defect and ends "Re-check this entry when it lands" - item 264 below discharges
that. Items numbered from 250 to leave the column sort/filter range (200-241)
alone.

## The defect

`src/app/components/tasks/TasksGrid.tsx` runs a roving tabindex over virtual
rows: body rows are 0+, row -1 holds the per-task column headers and a collapsed
group's rollup button, and row -2 holds an EXPANDED group's collapse toggle,
registered only at the FIRST column of its span.

Activating that band button collapses the group - and the slot the user is
standing on ceases to exist. The group becomes one rollup at row -1, so nothing
re-registers `(-2, firstColIndex)`. No cell or header in the grid is tabbable at
all; only the scroll region's own `tabIndex={0}` remains, until a click re-seeds
focus. Keyboard-only reproduction: tab into the grid, arrow up to an expanded
group's band button, press Enter, press Tab - focus leaves the grid and
Shift+Tab cannot get back to a cell.

Confirmed against the code, not just reproduced: with `focus = {row: -2, col:
firstColIndex}` the render-time clamp (`TasksGrid.tsx:220-222`) leaves it
untouched, and every `tabIndex` predicate in the file then evaluates false - the
corner headers (`:593`, `:614`), task headers (`:760`) and rollups (`:640`) all
require row -1; another group's band button requires its own distinct
`firstColIndex`; body cells require `focusRow === rowIndex >= 0`.

## The load-bearing fact, verified against the code

**A group's first column index does not depend on its own collapse state.**
`columns` (`TasksGrid.tsx:155-167`) walks `groups` in order and contributes, per
group: nothing when it has no visible tasks, exactly one rollup when collapsed,
otherwise one column per task. Toggling group G changes only G's own membership
in `collapsedGroups`, so every group BEFORE G contributes an identical column
count either way, and the index where G starts is invariant across the toggle.
Collapsing puts the rollup exactly where the first task column was; expanding
does the reverse.

Independently re-derived and checked against every edge: a group with zero
visible tasks (contributes nothing in both states, and renders no activation
point at all), the first group collapsed, several groups collapsed at once, a
zero-task group sitting between two others, and the Daily/Weekly sub-view.

**TWO SILENT PRECONDITIONS.** The invariant holds only because neither `tasks`
nor `rows` depends on collapse state - `visibleTasks` derives from
`visibleColumnIds`/`resolvedCatalog` (`TasksTab.tsx:183`), and `filteredRows`'
deps do not include `collapsedGroups` (`TasksTab.tsx:232-247`). The second is
what makes item 253's body-row pass-through safe: expanding cannot make body row
R disappear. If row filtering ever becomes collapse-aware, revisit item 253.

**A group's index DOES shift when a PRECEDING group toggles** (#233 check 14
says so). That is fine and is not what this fix depends on - the target is always
recomputed from the layout in hand.

## Acceptance criteria

### AC-A. The pure decision

250. A new pure module `src/app/components/tasks/gridFocus.ts` exports
     `groupToggleFocusSlot(columnGroupIds, groupId, activatedRow)`, returning
     the `{row, col}` the roving slot must hold after `groupId` is toggled, or
     `null` when that group contributes no columns. It never mutates its
     arguments; type `columnGroupIds` as `readonly TaskGroupId[]`.
251. `columnGroupIds` is the group each grid column belongs to, in column order -
     a rollup contributes its own group id, a task column its task's group.
     **Build it by reusing `groupIdOf`** (`TaskGridRow.tsx:253-255`), which
     already computes exactly that: export it and narrow its return type from
     `string` to `TaskGroupId`. Do not write a second copy.
     The module must not import a component, MUI, or a CSS module. The reason is
     NOT that vitest cannot load a `.tsx` - it transforms them fine. It is that
     `vitest.config.ts` only collects `src/**/*.test.ts`, and `environment:
     "node"` means anything rendered cannot be exercised; keeping the module
     import-free of UI is what lets its test stay a real test.
252. `col` is the index of the group's FIRST column, offset by 2 for the frozen
     identity and progress columns - the same `i + 2` arithmetic
     `colIndexByTaskId` and `colIndexByGroupId` already use
     (`TasksGrid.tsx:175-189`), and the same `+ 2` in `totalCols` (`:191`).
253. `row` is the row the user activated from, EXCEPT that row -2 becomes -1:
     the band button's row does not survive its own group collapsing, and the
     rollup that replaces it lives at row -1. Every other row - -1 (the header
     rollup) and any body row (a body rollup cell) - passes through unchanged,
     because those slots still exist after the toggle. The helper does NOT
     validate `activatedRow` against any row count; bounds are the caller's
     render-time clamp's job.

     A CONSEQUENCE, decided deliberately: expanding from row -1 lands on the
     first task's header button, which is a sort/filter menu trigger, NOT the
     group's collapse toggle (that moves to row -2). So keyboard Enter-Enter is
     not idempotent - collapse lands on the rollup, expand lands on a different
     kind of control. The alternative (map -1 to -2 on expand, for round-trip
     symmetry) was rejected: it would move focus to a control the user did not
     activate and that sits in a different header row, which is more surprising
     than landing where the activated control's own slot went. Do not "fix" this
     without reading this paragraph.
254. An unknown group id, or one contributing no columns, returns `null` and the
     caller does nothing. Never throws.

### AC-B. Wiring

255. All three activation points route through one handler: the band button
     (row -2, collapses), the header rollup button (row -1, expands), and a body
     row's rollup cell (row 0+, expands - `TaskGridRow.tsx:182, 192`). Each
     passes the row it was activated from.

     This REQUIRES a prop-signature change, which is not optional and not
     inferable: widen `TaskGridRow`'s `onToggleGroupCollapse` from
     `(groupId: TaskGroupId) => void` to
     `(groupId: TaskGroupId, activatedRow: number) => void` and pass `rowIndex`
     at both call sites. `TasksGrid` owns the wrapper;
     `TasksTab`'s own `toggleGroupCollapse(groupId)` stays unchanged and simply
     ignores the extra argument. **Never infer the activation row from
     `focus.row`** - it is wrong exactly when the roving slot has not caught up,
     which is the case item 258 exists for.
256. The handler sets the focus STATE synchronously, in the event handler.
     The obligation that actually matters is that the target survives the
     POST-toggle render-time clamp `clampedFocusCol = Math.min(focus.col,
     totalCols - 1)` (`TasksGrid.tsx:222`) - and it does, because the group still
     contributes at least one column after the toggle, so `firstColIndex <=
     totalCols - 1` in the new layout. (An earlier draft justified this by
     claiming the slot is valid "before and after" against an intermediate
     render; there is no such render - React batches the parent's collapse update
     and this setState into one.)
257. DOM focus moves to the replacement control after it mounts, via a
     `useLayoutEffect` with **NO dependency array**, guarded by a pending-target
     ref that only a group toggle ever sets:

     ```
     useLayoutEffect(() => {
       const target = pendingFocusRef.current;
       pendingFocusRef.current = null;   // cleared unconditionally, before any lookup
       if (!target) return;
       const el = refsRef.current.get(`${target.row}:${target.col}`);
       if (!el) return;
       keyboardScrollRef.current = true;
       el.focus();
     });
     ```

     **Do NOT key it on `columns.length`.** This file already has two effects
     keyed that way (`:282`, `:461`) and copying that idiom silently breaks the
     fix: collapsing a group whose only visible task is one column turns one
     column into one rollup, `columns.length` is UNCHANGED, the effect never
     re-runs, and focus is never restored - a no-op failure identical to the bug,
     invisible to lint and to every test. A bare `useLayoutEffect` cannot miss,
     and running before paint keeps the sticky-pane scroll from flashing.

     Do not call `focusCellAt` from the effect either - not for lint reasons (the
     rule's ref-controlled-block exemption means it would very likely pass, and
     this repo uses scoped disables elsewhere anyway) but because its
     `setFocusState` is redundant here: the focused button's own `onFocus`
     (`:671`, `:710`, `:763`) already syncs the slot, so calling it would cost an
     extra render. Mirror its first three steps inline.
258. The pending ref is cleared the moment the effect runs, before the element
     lookup, so an unrelated layout change never steals focus - and so a failed
     lookup cannot leave a stale target armed to fire later, which would rip
     focus out of an open column menu.
259. Only arm the pending target when the activating control actually holds DOM
     focus (`document.activeElement === e.currentTarget` at the call site).
     Safari on macOS does not focus a `<button>` on click, so without this guard
     a mouse user who never had focus in the grid has it yanked in, and the grid
     scrolls.

### AC-C. What must not change

260. The grid stays EXACTLY ONE tab stop. No new tabbable element, no second
     roving scheme.
261. **`TasksGrid.tsx:220-225` (the clamp) is FROZEN.** It is the attractive
     wrong place to "fix" an untabbable grid, and #233 check 14 records that an
     earlier version forcing `-1` unconditionally desynced the slot from row -2.
     Likewise leave `handleGridFocus` (`:354-370`) and `handleNavigate`
     (`:380-433`) strictly alone: arrows stop at edges, Home/End, Ctrl+Home/End,
     PageUp/PageDown, ArrowUp from body row 0 into row -1 and on to row -2,
     ArrowDown back.
262. `aria-sort` stays on exactly one header cell in every state, including the
     collapsed-group rollup (#233 check 12). The wiring edits land inside the
     same two JSX blocks that compute it - change only the `activate` closures
     and the `onClick`/`onKeyDown` that call them. Do not touch `sortedTask`,
     `rollupAriaLabel`, `isSorted`, `aria-sort`, or any accessible-name builder.
263. `TasksGrid.tsx` is at 872 lines against the 1000-line cap; the expected
     delta is roughly +25 (one memo, one ref, one layout effect, three
     activation-site edits), landing near 897.
     OUTCOME: it landed at 918 (+46). The prediction was low and the diagnostic
     that accompanied it ("materially more means the helper got inlined") was
     WRONG - the helper is a separate 55-line module imported at
     `TasksGrid.tsx:48`, and the extra lines are explanatory comments. Do not
     infer inlining from a line count; check the import.
264. On landing, rewrite #233 check 14's "KNOWN PRE-EXISTING DEFECT" paragraph
     to describe the fixed behavior, and append these criteria to
     `docs/REGRESSION.md` as their own entry.

## Reuse survey (verified by reading the code)

| Use | Where | Verified |
| --- | --- | --- |
| Rollup-or-task group id | `groupIdOf` - `TaskGridRow.tsx:253-255` | Read; already exactly item 251's derivation, module-private with a widened `string` return. Export and narrow it; do not write a second copy. |
| Ref map keyed `row:col` | `refsRef` / `registerRef` - `TasksGrid.tsx:141-148` | Read; every header and cell registers into it, and ref callbacks fire during commit, so the layout effect finds the replacement control already registered. |
| Keyboard-vs-click scroll behavior | `keyboardScrollRef` - `TasksGrid.tsx:337` | Read; consumed once by `handleGridFocus`, which picks `auto` vs `smooth`. Set it before `.focus()`. |
| Existing focus mover | `focusCellAt` - `TasksGrid.tsx:339-345` | Read. Ref lookup + flag + `.focus()` + `setFocusState`. Mirror the first three steps; skip the fourth - see item 257 for why (a redundant render, not a lint rule). |
| Column-index arithmetic | `colIndexByTaskId` / `colIndexByGroupId` - `TasksGrid.tsx:175-189` | Read; both `i + 2` over `columns`. Item 252 agrees with them. |
| Group-to-column mapping | `columns` memo - `TasksGrid.tsx:155-167` | Read; the source for `columnGroupIds`. Derive with `useMemo(() => columns.map(groupIdOf), [columns])` placed immediately after it, so it cannot drift from the array the two index maps use. Never rebuild the layout. |
| Body-row rollup activation | `TaskGridRow.tsx:182, 192` | Read; both click and Enter/Space call `onToggleGroupCollapse(col.groupId)`, and the component already has its own `rowIndex`. |

## Rejected alternative, recorded so it is not re-litigated

`flushSync(() => onToggleGroupCollapse(id))` followed by `focusCellAt(...)` would
remove the ref, the effect and item 258 entirely, and would reuse `focusCellAt`
as-is. It was rejected because `flushSync` appears NOWHERE in this repo (grep:
zero hits), so it would introduce a pattern with no local precedent and forces a
synchronous re-render of a large grid, for a guarantee the dependency-array-free
layout effect already provides.

## What cannot be verified here, and must be stated plainly

This repo's vitest runs `environment: "node"` and collects only
`src/**/*.test.ts`. The grid cannot be rendered, so NOTHING below the pure helper
is exercisable by a test: the effect, the ref lookup, the `.focus()` call, the
`document.activeElement` guard, and the resulting tab order are all verified by
reading. Say so in the report rather than implying coverage. The pure helper
carries the arithmetic precisely so the untestable part shrinks to "call it and
focus what it names".
