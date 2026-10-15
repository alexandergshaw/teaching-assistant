"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { ALL_COLUMN_IDS, moveColumnInOrder, type ColumnId } from "@/lib/courses-table-helpers";
import { CELL_COLUMN_LABELS } from "@/lib/courses-table-labels";
import { dropCourseColumn, loadCourseColumnOrder, saveCourseColumnOrder, type CourseColumnPreferenceEvent } from "@/lib/courses-column-reorder";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

interface Gesture {
  source: ColumnId;
  pointerId: number;
  startX: number;
  x: number;
  y: number;
  active: boolean;
  handle: HTMLButtonElement;
}
interface Indicator { target: ColumnId; side: "before" | "after" }
const storage = () => window.localStorage;
const recordPreference = (event: CourseColumnPreferenceEvent) => recordSessionDiagnosticEntry({
  ...event, at:new Date().toISOString(), surface:"courses",
  label:event.operation === "courses_column_order_load" ? "Load Courses column order" : "Save Courses column order",
  ...(event.outcome === "failure" ? {error:"COURSES_COLUMN_ORDER_STORAGE"} : {}),
});

export function useCourseColumnReorder(visibleColumns: ColumnId[]) {
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>([...ALL_COLUMN_IDS]);
  const [message, setMessage] = useState("");
  const [indicator, setIndicator] = useState<Indicator | null>(null);
  const order = useRef<ColumnId[]>([...ALL_COLUMN_IDS]);
  const visible = useRef(visibleColumns);
  const loaded = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const scrollFrame = useRef<number | null>(null);
  const focusFrame = useRef<number | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const instructionsId = useId();
  useEffect(() => { visible.current = visibleColumns; }, [visibleColumns]);
  useEffect(() => {
    let active = true;
    // An external preference read is one attempt, outside React updater
    // callbacks. The canceled Strict Mode setup never reads or logs twice.
    queueMicrotask(() => {
      if (!active || loaded.current) return;
      loaded.current = true;
      const result = loadCourseColumnOrder(storage,recordPreference);
      order.current = result.order; setColumnOrder(result.order); setMessage(result.notice);
    });
    return () => { active = false; };
  }, []);

  const focusHandle = useCallback((id: ColumnId) => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      tableRef.current?.querySelector<HTMLButtonElement>(`[data-course-column-handle="${id}"]`)?.focus({preventScroll:true});
    });
  }, []);
  const commit = useCallback((next: ColumnId[], id: ColumnId, restoreFocus: boolean) => {
    const result = saveCourseColumnOrder(order.current,next,storage,recordPreference);
    if (!result.changed) return;
    order.current = result.order; setColumnOrder(result.order);
    const shown = result.order.filter(column => visible.current.includes(column));
    const position = shown.indexOf(id) + 1;
    setMessage(`${CELL_COLUMN_LABELS[id]} moved to position ${position} of ${shown.length}. ${result.notice || "Column order saved for reload."}`);
    if (restoreFocus) focusHandle(id);
  }, [focusHandle]);
  const moveColumn = useCallback((id: ColumnId, direction: "up" | "down", restoreFocus = false) => {
    commit(moveColumnInOrder(order.current,visible.current,id,direction),id,restoreFocus);
  }, [commit]);
  const hitColumn = useCallback((x: number,y: number): ColumnId | null => {
    const table = tableRef.current, scroller = scrollRef.current;
    if (!table || !scroller) return null;
    const bounds = scroller.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
    const hit = document.elementFromPoint(x,y)?.closest<HTMLTableCellElement>("th[data-course-column]");
    if (!hit || hit.closest("table") !== table) return null;
    const id = hit.dataset.courseColumn as ColumnId;
    return visible.current.includes(id) && order.current.includes(id) ? id : null;
  }, []);
  const updateIndicator = useCallback((current: Gesture) => {
    const target = hitColumn(current.x,current.y);
    setIndicator(target && target !== current.source ? {target,side:order.current.indexOf(current.source) < order.current.indexOf(target) ? "after" : "before"} : null);
  }, [hitColumn]);
  const cancel = useCallback((notify = true) => {
    const current = gesture.current; gesture.current = null;
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    scrollFrame.current = null;
    if (current?.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    if (notify) setIndicator(null);
  }, []);
  const scrollTick = useCallback(function tick() {
    const current = gesture.current, scroller = scrollRef.current;
    if (!current?.active || !scroller) { scrollFrame.current = null; return; }
    if (!current.handle.isConnected) { cancel(); return; }
    const bounds = scroller.getBoundingClientRect();
    if (current.y >= bounds.top && current.y <= bounds.bottom && current.x >= bounds.left && current.x <= bounds.right) {
      if (current.x < bounds.left + 40) scroller.scrollLeft -= 14;
      else if (current.x > bounds.right - 40) scroller.scrollLeft += 14;
      updateIndicator(current);
    }
    scrollFrame.current = requestAnimationFrame(tick);
  }, [updateIndicator,cancel]);

  const pointerDown = (event: PointerEvent<HTMLButtonElement>,source: ColumnId) => {
    event.stopPropagation();
    if (gesture.current && !gesture.current.handle.isConnected) cancel();
    if (event.button !== 0 || gesture.current || !visible.current.includes(source)) return;
    event.preventDefault(); event.currentTarget.focus({preventScroll:true});
    try { event.currentTarget.setPointerCapture(event.pointerId); }
    catch { return; }
    gesture.current = {source,pointerId:event.pointerId,startX:event.clientX,x:event.clientX,y:event.clientY,active:false,handle:event.currentTarget};
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.stopPropagation(); current.x = event.clientX; current.y = event.clientY;
    if (!current.active && Math.abs(event.clientX-current.startX) < 8) return;
    current.active = true; event.preventDefault(); updateIndicator(current);
    if (scrollFrame.current === null) scrollFrame.current = requestAnimationFrame(scrollTick);
  };
  const pointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    // Re-hit-test the actual release, rather than trusting the last hover.
    const target = current.active ? hitColumn(event.clientX,event.clientY) : null;
    cancel();
    if (target) commit(dropCourseColumn(order.current,visible.current,current.source,target),current.source,true);
  };
  const pointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    if (gesture.current?.pointerId === event.pointerId) cancel();
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>,id: ColumnId) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft","ArrowRight"].includes(event.key)) return;
    event.preventDefault(); cancel(); moveColumn(id,event.key === "ArrowLeft" ? "up" : "down",true);
  };
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("keydown",escape,true);
    return () => {
      window.removeEventListener("keydown",escape,true); cancel(false);
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    };
  }, [cancel]);

  return {columnOrder,moveColumn,message,instructionsId,tableRef,scrollRef,
    dropSide:(id: ColumnId) => indicator?.target === id ? indicator.side : undefined,
    handleProps:(id: ColumnId) => ({
      "aria-label":`Move ${CELL_COLUMN_LABELS[id]} column`, "aria-describedby":instructionsId,
      "aria-keyshortcuts":"Alt+ArrowLeft Alt+ArrowRight", "data-course-column-handle":id,
      onPointerDown:(event: PointerEvent<HTMLButtonElement>) => pointerDown(event,id),
      onPointerMove:pointerMove,onPointerUp:pointerUp,onPointerCancel:pointerCancel,onLostPointerCapture:pointerCancel,
      onKeyDown:(event: KeyboardEvent<HTMLButtonElement>) => keyDown(event,id),
      onClick:(event: {preventDefault:() => void;stopPropagation:() => void}) => {event.preventDefault();event.stopPropagation();},
    }),
  };
}
