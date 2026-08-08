# Tasks grid: drag columns into a new order - acceptance criteria

Feature: let the instructor reorder the Tasks tab's task columns by dragging their
headers, with equivalent non-drag routes.

## Vetted existing code - reuse these, do not reinvent

Every citation verified against the tree at 60a254f.

- Column model: `GridColumn` at `src/app/components/tasks/TaskGridRow.tsx:37-39`;
  the `columns` array is built at `src/app/components/tasks/TasksGrid.tsx:156-168`.
- Stable ids exist. `TaskDefinition.id` (`src/lib/course-tasks.ts:51-62`) is the key
  every consumer already uses - sort carries `taskId`, filters are keyed by task id.
  Column positions are derived per render and never persisted. Reordering is
  therefore a permutation of ids, not a schema change.
- Order data model to copy: `parseColumnOrder` / `serializeColumnOrder` /
  `moveColumnInOrder` at `src/lib/courses-table-helpers.ts:219-290`. Note
  `moveColumnInOrder` swaps against the nearest VISIBLE neighbour so a command
  never appears to do nothing, and `parseColumnOrder` always returns a complete,
  duplicate-free ordering with unknown ids dropped and missing ids appended.
- Existing write path: `moveTask` at
  `src/app/components/tasks/ManageTasksDialog.tsx:196-222`, persisting through
  `saveDef` at `src/app/components/tasks/useCourseTasksData.ts:310-326`.
- Resolved order comes from `resolveTaskCatalog`, `src/lib/course-tasks-view.ts:169-233`,
  which sorts each group by `TaskCatalogOverride.position`.
- Focus math: `groupToggleFocusSlot`, `src/app/components/tasks/gridFocus.ts:43-55`.

## Structural constraints that decide the design

C1. GROUPS MUST STAY CONTIGUOUS. Contiguity is not enforced by a check - it is a
consequence of how `columns` is built (walk `groups`, append each group's tasks as a
block). `gridFocus.ts:48` locates a group by `indexOf`, i.e. the first index of its
run, and the header band uses `colSpan` over that run. Rebuilding `columns` as one
flat sorted list would break entry 232 check 15, entry 233 check 12 and entry 234 at
once. Keep the nested loop; reorder its INPUTS.

C2. Two orderings exist and must not be conflated: task order WITHIN a group
(persisted as `position`), and the order of the groups themselves (the `groups`
array). Term Setup has two groups (Dependent, 17 tasks; Independent, 23). Daily and
Weekly has two more. Reordering 40 columns within a group is the valuable case;
reordering two bands is marginal.

C3. `TasksGrid.tsx` is 918 lines against a 1000-line cap. Reorder logic goes in a
PURE `.ts` module beside `gridFocus.ts`, not inline in the component. This is also
the only way it gets tested: vitest runs `environment: "node"` and collects
`src/**/*.test.ts`, so nothing in a `.tsx` is ever rendered.

C4. The two frozen columns (identity, progress) are never reorderable and are never
valid drop targets. Excluding pinned columns is standard - MUI X does the same.

C5. THE REORDER MODULE IS NOT FED THE GRID'S `columns` ARRAY. `TasksTab.tsx:680`
passes `tasks={visibleTasks}`, so `TasksGrid`'s column array contains ONLY visible
tasks and can never carry a hidden one. A reorder driven from there would renumber
just the visible tasks; every hidden task would keep `position: null`, which
`resolveTaskCatalog` reads as `Number.POSITIVE_INFINITY`
(`src/lib/course-tasks-view.ts:191`) and sorts to the END of its group. Re-showing a
hidden column would then find it at the end rather than where the user left it -
exactly what AC8 item 39 forbids. The module's input is therefore built in
`TasksTab` from `resolvedCatalog` plus `visibleColumnIds`, carrying every task in the
group with a `visible` flag. Either hoist the handlers to `TasksTab` or pass the
richer list down as a new prop.

C6. A collapsed group renders as a single `kind: "rollup"` column
(`TaskGridRow.tsx:37-39`). The rollup is not a task and is never reorderable as one.
Renumbering a collapsed group from its rendered columns would collapse the whole
group onto one position and destroy its stored order - another consequence of C5,
and the reason the module works from the resolved catalog rather than the rendering.

## AC1 - Reordering within a group

1. Dragging a task column's header handle moves that column to a new position among
   the visible columns of its OWN group.
2. A drop outside the dragged column's group is rejected, not clamped silently: no
   reorder occurs and the drag ends in a visibly invalid state. Tasks cannot change
   group - entry 232 check 15 pins that a repositioned task never escapes its group.
3. Reordering is a permutation of task ids. No task id, label, group, cell value,
   filter or sort state changes as a result of a reorder.
4. Hidden columns are skipped when computing a move target, matching
   `moveColumnInOrder`'s nearest-visible-neighbour rule, so a move never appears to
   do nothing.
5. Order survives reload, and is per user, because it persists through the existing
   server-side `position` field rather than a new local key. There is exactly ONE
   source of column order; the drag and the Manage tasks dialog agree by construction.

## AC2 - Persistence must be bulk and atomic

6. A drop persists the affected group's new ordering in ONE write. The existing
   `moveTask` renumbers the entire group with one awaited save per task - 23 sequential
   round trips for a single move on the Independent group. That is unacceptable per
   drag and is not atomic: a failure partway leaves the group half-renumbered.
7. A new server action accepts an ARRAY of FULL `TaskCatalogOverride` rows and
   writes them in a single upsert, so a group can never land partially renumbered.
   The rows must be complete: `upsertCourseTaskDef`
   (`src/lib/supabase/course-tasks.ts:175-201`) writes every column on conflict, and
   `view_id`/`group_id` are NOT NULL
   (`supabase/migrations/20260924000000_course_tasks.sql:66-67`). Sending a bare
   `{taskId, position}` pair would either violate NOT NULL or blank the task's label,
   cadence and retired flag. The pure module returns position ASSIGNMENTS; the caller
   merges each onto the task's existing override first - the `baseOverrideFor` step
   `ManageTasksDialog.tsx:209` already performs - before the write.
8. `moveTask` is migrated onto the same bulk action, so the dialog and the drag share
   one write path rather than leaving two competing implementations.
9. The reorder is applied optimistically in local state on drop and rolled back as a
   unit if the write fails, with the failure surfaced. Partial application is a
   defect.

## AC3 - WCAG 2.5.7: a non-drag pointer route

10. Every reorder achievable by dragging is achievable by single-pointer clicks with
    no dragging. A keyboard path does NOT satisfy 2.5.7; it is a separate obligation.
    Drag-only reorder is failure F108.
11. The existing per-header column menu gains move commands: Move left, Move right,
    Move to start of group, Move to end of group.
12. A command that cannot apply (already at the visible edge of its group) is
    presented as unavailable rather than silently doing nothing.

## AC4 - Keyboard route

13. Shift+Left and Shift+Right move the focused column header within its group.
    Bare arrow keys keep their existing meaning - moving focus - because the grid is
    one tab stop under a roving tabindex and repurposing them would break entry 232
    check 22.
14. Enter and Space are NOT rebound; they already open the column menu.
15. Shift+Arrow at the visible edge of a group is a no-op, not a move into the
    neighbouring group.
16. `role="application"` is not used.
17. After a keyboard move, focus stays on the moved column's header, which is now at
    a new column index. The roving-tabindex slot follows it.

## AC5 - Screen reader announcement

18. An off-screen `aria-live="assertive"` region announces reorder activity.
    Assertive rather than polite: reorder is rapid and stale queued announcements
    would mislead.
19. Positional announcements are debounced by 100ms so a fast drag does not spam.
20. Announcements name the column and its position within its group, for example
    "Textbook Owned moved to position 4 of 17 in Dependent Upon Others." The pure
    module supplies the index and total only; the column label and the group label
    come from the caller, which already holds both. Do not push display strings into
    the pure layer.
21. `aria-grabbed` and `aria-dropeffect` are NOT used. Both were deprecated in ARIA
    1.1 and support was always poor.
22. The drag handle carries an accessible name and `aria-describedby` instructions
    naming the Shift+Arrow route.

## AC6 - Pointer mechanics

23. Drag is implemented with pointer events and `setPointerCapture`, not native
    HTML5 `draggable`. Native drag does not fire from touch input in any current
    browser, and this layout hits every native pitfall: spurious `dragleave` across
    child boundaries, a broken drag image when the cell contains a button,
    `getData` returning null during `dragover`, and no native auto-scroll inside a
    nested `overflow-x` container.
24. Drag starts only from a DEDICATED HANDLE inside the header cell, never from the
    whole cell. The cell already contains the sort/filter menu button, which must
    stay clickable; a shared hit area is what produces swallowed clicks.
25. A drag begins only after 8px of pointer movement, so a click on the handle is
    never misread as a drag.
26. The menu button remains fully operable by click and keyboard at all times.
27. Dragging near the horizontal edge of the scroll container auto-scrolls it. This
    must be hand-rolled from pointer coordinates - native drag provides no
    auto-scroll for a nested `overflow-x` container, and it is a known-hard case with
    open bugs in mature grids. VERIFIED BY READING, not by a test: pointer
    coordinates and scroll position cannot be exercised in a node environment. Same
    treatment REGRESSION entry 234 check 9 gives its own untestable half.
28. Escape during a drag cancels it, restoring the original order with nothing
    persisted.
29. Releasing outside any valid target cancels the drag rather than dropping at the
    nearest position.

## AC7 - Visual treatment

30. The dragged column's header dims to 0.4 opacity and stays in place.
31. Drop position is shown by a single 2px insertion line in the theme's existing
    selected/focus color, with a small terminal dot. No new drag-specific accent
    color is introduced.
32. Other columns do NOT reflow during the drag. The grid settles into its new order
    only after the drop.
33. After a successful drop the moved column briefly flashes the selected background,
    fading over roughly 700ms.
34. No rotated, bouncy, or oversized drag preview.

## Tests still owed at the post-verification unit-test pass

The TDD suite (`src/app/components/tasks/columnOrder.test.ts`) covers the pure
reorder layer and a round trip through `resolveTaskCatalog`. Items 13-18 and 21-34
concern markup, focus, ARIA and pointer behavior and are NOT testable here at all -
vitest runs `environment: "node"` and renders no component, so they are verified by
reading, exactly as REGRESSION entry 234 check 9 handles its own untestable half.

Node-testable but not yet covered:

- Item 19, the 100ms announcement debounce, if the debounce is extracted as a pure
  helper. If it is inlined in the component it becomes unverifiable - a reason to
  extract it.
- The bulk-write action's base-merge behavior from AC2 item 7: given an existing
  override carrying a renamed label and a cadence, a reorder must preserve both.
  This is the defect that a bare `{taskId, position}` payload would cause, so it
  deserves a direct test rather than only a prose warning.
- `moveTask`'s migration onto the bulk path (AC2 item 8): assert the dialog's move
  produces the same stored order as the equivalent drag.

## AC8 - Must not regress

35. Entry 232: groups stay contiguous; the grid stays a real `table role="grid"` with
    `th scope` semantics and the full APG roving-tabindex contract as one tab stop.
36. Entry 233: sort and filter are keyed by task id and are unaffected by column
    position. Exactly one header cell carries `aria-sort` after any reorder.
37. Entry 234: collapsing or expanding a group still lands focus on that group's
    first column, computed from the reordered layout in hand and never cached.
38. Reordering while a group is COLLAPSED (the group occupies a single rollup column)
    behaves sanely: the rollup is not itself reorderable as a task column, and
    expanding afterwards shows the group in its stored order.
39. Column visibility (`ta-tasks-<view>-columns`) and column order stay independent.
    Hiding then re-showing a column returns it to its stored position, not the end.
40. Both sub-views keep independent state; a reorder in Term Setup does not reorder
    Daily and Weekly.
