"use client";

// Pointer-driven column drag mechanics for the Tasks grid
// (docs/tasks-column-reorder-acceptance-criteria.md AC6/AC7) - pulled out
// of TasksGrid.tsx (which sits at a 1000-line hard cap) so that file has
// real headroom rather than a squeeze. This is a clean seam: every line
// here is NEW code introduced by the column-reorder feature, so extracting
// it disturbs nothing pinned by an existing regression entry - unlike the
// roving-tabindex keyboard model (Shift+Left/Right, Tab order, the header
// menu's Enter/Space activation), which REGRESSION entries 232/233/234 pin
// and which stays in TasksGrid.tsx untouched by this split.
//
// Untestable here, same rationale as the file it was pulled out of and the
// same treatment REGRESSION entry 234 check 9 gives its own untestable
// half: this repo's vitest runs `environment: "node"`, so pointer events,
// `document.elementFromPoint`, real DOM hit-testing and scroll-position
// auto-scroll cannot be exercised by a test. AC6 item 27 is explicit that
// this is "VERIFIED BY READING, not by a test". The one piece of this
// feature that COULD be pulled out and tested - the post-reorder focus
// decision AC4 item 17 needs - lives in columnOrder.ts as
// `focusSlotForTask`, precisely because it does not need a real pointer or a
// real DOM to reason about. (It replaced an earlier `resyncFocusSlot` that
// searched for wherever the DOM reported focus; see that function's own
// comment for why a search cannot work here.)
import { createElement, useEffect, useState, type ReactElement, type RefObject } from "react";
import type React from "react";
import type { TaskGroupId } from "@/lib/course-tasks";
import type { GridColumn } from "./TaskGridRow";
import dragStyles from "./columnDrag.module.css";

/** One in-progress pointer drag: the dragged column's id and group (AC1
 * item 2 - a drop outside the group is rejected, so the group is captured
 * once at pointerdown rather than re-derived every pointermove), the
 * pointer that owns it (so a second, unrelated pointer can never hijack an
 * in-progress drag), where it started (for the 8px threshold), whether it
 * has crossed that threshold yet, and which visible header (if any) it is
 * currently over. */
export interface ColumnDragState {
  id: string;
  group: TaskGroupId;
  pointerId: number;
  startX: number;
  active: boolean;
  overId: string | null;
}

export interface UseColumnDragReturn {
  /** Null when no drag is in progress. */
  drag: ColumnDragState | null;
  /** AC7 item 33: the task id whose header should briefly flash to confirm
   * a drop just landed - null once the ~700ms flash has elapsed. */
  flashId: string | null;
  dragPointerDown: (e: React.PointerEvent<HTMLButtonElement>, taskId: string, group: TaskGroupId) => void;
  dragPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  dragPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

/**
 * AC6 items 23-29: pointer events with `setPointerCapture` (item 23 -
 * never native HTML5 `draggable`, which does not fire from touch input in
 * any current browser and hits every native drag pitfall this layout has:
 * spurious `dragleave` across child boundaries, a broken drag image when
 * the cell contains a button, `getData` returning null during `dragover`,
 * no native auto-scroll inside a nested `overflow-x` container), an 8px
 * movement threshold before a press counts as a drag (item 25, so a click
 * on the handle is never misread as one), and a literal hit-test against
 * whichever header the pointer is ACTUALLY over (item 29) - not merely
 * nearest, so releasing outside every header cancels the drag rather than
 * silently snapping to whatever column happens to be closest. Escape
 * cancels a drag in progress (item 28); AC7 item 33's brief post-drop
 * flash is armed here too, since `dragPointerUp` is the one place that
 * knows a drop actually committed rather than being cancelled.
 *
 * `columns` drives the hit-test - `GridColumn[]` exactly as TasksGrid.tsx
 * already builds it, which only ever contains RENDERED (visible) task/
 * rollup columns, so a hidden column can never become a drop target
 * without an extra check here. `onDrop` is the caller's actual reorder +
 * persist (owned by TasksTab.tsx per structural constraint C5 in the AC
 * document - this hook never decides WHERE a column lands, only WHETHER a
 * valid drop happened and onto which visible header).
 */
export function useColumnDrag(
  columns: GridColumn[],
  scrollRef: RefObject<HTMLDivElement | null>,
  onDrop: (draggedTaskId: string, targetTaskId: string) => void
): UseColumnDragReturn {
  const [drag, setDrag] = useState<ColumnDragState | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const dragPointerDown = (e: React.PointerEvent<HTMLButtonElement>, taskId: string, group: TaskGroupId) => {
    // AC24: this handler only ever fires from the dedicated drag handle,
    // never the header cell itself - stopPropagation keeps a pointerdown
    // here from also being read as a click on the sort/filter/menu button
    // that sits beside it.
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: taskId, group, pointerId: e.pointerId, startX: e.clientX, active: false, overId: null });
  };

  const dragPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;

    // item 25: ignore small jitters between pointerdown and the real drag -
    // a click on the handle must never be misread as a drag.
    if (!drag.active && Math.abs(e.clientX - drag.startX) < 8) return;

    // item 29: the header LITERALLY under the pointer, not the nearest one.
    // A nearest-by-distance hit-test would let a release far from any
    // header still "snap" to whatever was closest, which is exactly the
    // silent-nearest behaviour item 29 forbids. `elementFromPoint` plus
    // `closest('[data-row="-1"]')` finds whichever header button (if any)
    // the pointer is actually over, unaffected by which element currently
    // holds pointer capture - capture only routes EVENTS, it does not
    // change what `elementFromPoint` reports for a given coordinate.
    // `columns[dataCol - 2]` converts that DOM column index back to the
    // GridColumn it represents: the two frozen columns (identity,
    // progress) occupy columns 0 and 1, hence the `- 2` - and since those
    // two headers also carry `data-row="-1"`, hitting one of them resolves
    // to `columns[-2]`/`columns[-1]` (`undefined` for a negative array
    // index), which the check below correctly treats as "not a valid
    // target" rather than crashing.
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row="-1"]');
    const overCol = hit ? columns[Number(hit.dataset.col) - 2] : undefined;
    // AC1 item 2 / C4: only another VISIBLE task header in the SAME group
    // counts - never a rollup (C6: a collapsed group is not itself
    // reorderable as a task) and never the dragged column onto itself.
    const overId =
      overCol?.kind === "task" && overCol.task.group === drag.group && overCol.task.id !== drag.id
        ? overCol.task.id
        : null;

    // item 27: hand-rolled auto-scroll - native drag provides none for a
    // nested `overflow-x` container, and this is a known-hard case with
    // open bugs in mature grids. VERIFIED BY READING, not by a test:
    // pointer coordinates and scroll position cannot be exercised in a
    // node environment - the same treatment REGRESSION entry 234 check 9
    // gives its own untestable half.
    const container = scrollRef.current;
    if (container) {
      const cr = container.getBoundingClientRect();
      if (e.clientX < cr.left + 40) container.scrollLeft -= 14;
      else if (e.clientX > cr.right - 40) container.scrollLeft += 14;
    }

    setDrag({ ...drag, active: true, overId });
  };

  const dragPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.active && drag.overId) {
      // AC1 item 1 / AC6: the actual reorder + persist is the caller's job
      // (TasksTab.tsx, per C5) - this hook only reports that a valid drop
      // happened and onto which column.
      onDrop(drag.id, drag.overId);
      // AC7 item 33: briefly flash the moved column's header to confirm
      // the drop landed, fading over roughly 700ms (TasksGrid.module.css's
      // flash keyframes own the actual fade timing) - cleared here, or
      // instantly superseded if another drag's own drop re-arms it first.
      setFlashId(drag.id);
      window.setTimeout(() => setFlashId(null), 700);
    }
    // item 29 (the other half): a drag that never crossed the 8px
    // threshold, or that ends with no valid `overId`, is simply
    // discarded here - nothing was ever applied to the rendered column
    // order during the drag (AC7 item 32), so there is nothing to undo.
    setDrag(null);
  };

  // item 28: Escape cancels a drag in progress - a document-level listener,
  // since pointer capture keeps move/up routed to the handle regardless of
  // where keyboard focus sits, which never moved for a pointer-only drag.
  const isDragging = drag !== null;
  useEffect(() => {
    if (!isDragging) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDragging]);

  return { drag, flashId, dragPointerDown, dragPointerMove, dragPointerUp };
}

/**
 * AC7's drag visual treatment, as a composable className suffix (a leading
 * space plus zero or more of columnDrag.module.css's classes, or "" when
 * none apply) - kept beside the hook that owns `drag`/`flashId` rather than
 * recomputed inline at every header's render site in TasksGrid.tsx. CSS
 * Modules scope class names per file, so these classes are meant to be
 * composed onto TasksGrid.module.css's own `.taskHeaderCell` rather than
 * written as attribute-selector rules there - see columnDrag.module.css's
 * own header comment for why.
 *
 * Item 30: the DRAGGED column dims in place. Item 31: the HOVERED drop
 * target gets a 2px insertion line on whichever edge the drag is
 * approaching from - `colIndexByTaskId` (TasksGrid.tsx's own lookup, passed
 * in rather than recomputed here) decides which side. Item 33: `flashId`
 * (armed by `dragPointerUp` above, cleared ~700ms later) briefly flashes
 * the column a drop just landed on.
 */
export function dragHeaderClassName(
  drag: ColumnDragState | null,
  flashId: string | null,
  colIndexByTaskId: ReadonlyMap<string, number>,
  taskId: string,
  colIndex: number
): string {
  const classes: string[] = [];
  if (drag?.active && drag.id === taskId) classes.push(dragStyles.dragging);
  if (drag?.active && drag.overId === taskId) {
    const draggedColIndex = colIndexByTaskId.get(drag.id) ?? colIndex;
    classes.push(draggedColIndex < colIndex ? dragStyles.dropAfter : dragStyles.dropBefore);
  }
  if (flashId === taskId) classes.push(dragStyles.flash);
  return classes.length > 0 ? ` ${classes.join(" ")}` : "";
}

/**
 * AC6 item 24: the DEDICATED drag handle - never the whole header cell -
 * built with `createElement` rather than JSX so this file can stay a
 * `.ts` module beside `columnOrder.ts` and `gridFocus.ts` instead of a
 * `.tsx` one; it renders no more markup than a plain `<button>` needs.
 * `tabIndex={-1}` keeps it OUT of the Tab order and the roving-tabindex
 * scheme TasksGrid.tsx's header buttons participate in - it is reachable
 * by pointer only. The grip glyph itself is pure CSS (columnDrag.module.
 * css's `.dragHandle::before`), so no icon markup is needed here either.
 *
 * `aria-hidden="true"` - NOT an accessible name of its own, and this is a
 * correction, not the original design: the task `<th scope="col">` has no
 * `aria-label`/`aria-labelledby` of its own, so its accessible name is
 * computed FROM CONTENT, which recurses into every descendant's own
 * accessible name. An earlier version of this handle carried
 * `aria-label="Drag to reorder <label>"`, which a screen reader therefore
 * PREPENDED to every column header's own name - in a `role="grid"`,
 * announced on every column change, on every row. Hiding the handle from
 * the accessibility tree is correct, not a loss: it is a pointer-only
 * affordance (tabIndex={-1}, unreachable by keyboard), every function it
 * offers is available via Shift+Arrow and the column menu, and the
 * keyboard hint (`hintId` in TasksGrid.tsx) now lives on the header button
 * itself, where a keyboard user actually lands.
 */
export function DragHandle({
  task,
  onDown,
  onMove,
  onUp,
}: {
  task: { id: string; label: string; group: TaskGroupId };
  onDown: (e: React.PointerEvent<HTMLButtonElement>, taskId: string, group: TaskGroupId) => void;
  onMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
}): ReactElement {
  return createElement("button", {
    type: "button",
    tabIndex: -1,
    className: dragStyles.dragHandle,
    "aria-hidden": "true",
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => onDown(e, task.id, task.group),
    onPointerMove: onMove,
    onPointerUp: onUp,
  });
}
