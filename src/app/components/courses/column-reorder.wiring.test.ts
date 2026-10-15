import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import * as columnHelpers from "@/lib/courses-table-helpers";
import * as preferences from "@/lib/courses-column-reorder";
import { CELL_COLUMN_LABELS } from "@/lib/courses-table-labels";
const {ModuleKind,ScriptTarget,transpileModule,createSourceFile,ScriptKind,forEachChild,isVariableDeclaration} = createRequire(import.meta.url)("typescript") as typeof import("typescript");

// Source guards supplement the pure tests. No component/DOM is rendered here.
const table = readFileSync("src/app/components/courses/CoursesTable.tsx","utf8");
const hook = readFileSync("src/app/components/courses/useCourseColumnReorder.ts","utf8");
const css = readFileSync("src/app/components/courses/CourseColumnReorder.module.css","utf8");
const cellMenu = readFileSync("src/app/components/courses/CellMenu.tsx","utf8");
function pairedIds(source: string) {
  return source.includes("const orderedVisibleColumns = columnOrder.filter((id) => visibleColumns.includes(id))")
    && source.includes("{orderedVisibleColumns.map((id) => (")
    && source.includes("visibleColumns={orderedVisibleColumns}");
}

/** Execute the real hook's handlers with isolated lifecycle/DOM primitives.
 * This models focused-event propagation; it is not a React/browser render. */
function actualMenuStopBubble() {
  const source = createSourceFile("CellMenu.tsx",cellMenu,ScriptTarget.Latest,true,ScriptKind.TSX);
  let handler: string | undefined;
  const visit = (node: import("typescript").Node) => {
    if (isVariableDeclaration(node) && node.name.getText(source) === "stopBubble") handler = node.initializer?.getText(source);
    forEachChild(node,visit);
  };
  visit(source);
  expect(handler).toBeDefined(); expect(cellMenu).toContain("onKeyDown={stopBubble}");
  const exports: {stopBubble?: (event: unknown) => void} = {};
  runInNewContext(transpileModule(`exports.stopBubble = ${handler};`,{compilerOptions:{target:ScriptTarget.ES2022}}).outputText,{exports});
  return exports.stopBubble!;
}
function runFocusedGesture(cancelWithEscape: boolean, escapeOnMenu = false) {
  const frames = new Map<number, () => void>();
  const keys: {name:string;callback:(event: unknown) => void;capture:boolean}[] = [];
  const removed: typeof keys = [];
  const cleanups: (() => void)[] = [];
  const removeListener = vi.fn((name: string,callback: (event: unknown) => void,capture = false) => removed.push({name,callback,capture}));
  const microtasks: (() => void)[] = [];
  const writes = vi.fn(), log = vi.fn(), cancelFrame = vi.fn((id: number) => frames.delete(id));
  const scroller = {scrollLeft:0,getBoundingClientRect:() => ({left:0,right:100,top:0,bottom:50})};
  const table = {};
  const target = {dataset:{courseColumn:"modality"},closest:() => table};
  let captured = false, nextFrame = 0;
  const handle = {isConnected:true,focus:vi.fn(),setPointerCapture:() => {captured=true;},hasPointerCapture:() => captured,releasePointerCapture:() => {captured=false;}};
  const react = {
    useState:(value: unknown) => [value,vi.fn()], useRef:(current: unknown) => ({current}),
    useId:() => "instructions", useCallback:(callback: unknown) => callback,
    useEffect:(effect: () => unknown) => {const cleanup = effect();if (typeof cleanup === "function") cleanups.push(cleanup as () => void);},
  };
  const exports: {useCourseColumnReorder?: typeof import("./useCourseColumnReorder").useCourseColumnReorder} = {};
  const javascript = transpileModule(hook,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
  runInNewContext(javascript,{
    exports,require:(name: string) => {
      if (name === "react") return react;
      if (name === "@/lib/courses-table-helpers") return columnHelpers;
      if (name === "@/lib/courses-table-labels") return {CELL_COLUMN_LABELS};
      if (name === "@/lib/courses-column-reorder") return preferences;
      if (name === "@/lib/session-diagnostic-log") return {recordSessionDiagnosticEntry:log};
      throw new Error(`Unexpected hook dependency ${name}`);
    },
    window:{localStorage:{getItem:() => null,setItem:writes},addEventListener:(name: string,callback: (event: unknown) => void,capture = false) => keys.push({name,callback,capture}),removeEventListener:removeListener},
    document:{elementFromPoint:() => ({closest:() => target})},
    queueMicrotask:(callback: () => void) => microtasks.push(callback),
    requestAnimationFrame:(callback: () => void) => {const id=++nextFrame;frames.set(id,callback);return id;},cancelAnimationFrame:cancelFrame,
  });
  const result = exports.useCourseColumnReorder!(["email","modality","startDate"]);
  // Ref attachments are deliberately minimal; real layout/capture are not claimed.
  Object.assign(result.tableRef,{current:table}); Object.assign(result.scrollRef,{current:scroller});
  microtasks.forEach(callback => callback()); log.mockClear();
  const props = result.handleProps("email");
  const pointer = (x: number) => ({button:0,pointerId:7,clientX:x,clientY:20,currentTarget:handle,preventDefault:vi.fn(),stopPropagation:vi.fn()});
  props.onPointerDown(pointer(10) as never); props.onPointerMove(pointer(95) as never);
  expect(frames.size).toBe(1);
  let framesAfterEscape: number | undefined;
  if (cancelWithEscape) {
    const dispatchKey = (key: string,localHandler: (event: never) => void) => {
      let stopped = false;
      const event = {key,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,preventDefault:vi.fn(),stopPropagation:() => {stopped=true;}};
      // Native capture precedes descendant/synthetic bubbling; descendant
      // stopPropagation cannot revoke a capture listener already invoked.
      keys.filter(listener => listener.capture).forEach(listener => listener.callback(event));
      localHandler(event as never);
      if (!stopped) keys.filter(listener => !listener.capture).forEach(listener => listener.callback(event));
      return {event,stopped};
    };
    if (escapeOnMenu) {
      const tab = dispatchKey("Tab",props.onKeyDown);
      expect(tab.event.preventDefault).not.toHaveBeenCalled();
      // Model the default native Tab focus advance to the adjacent menu.
      // Its actual stopBubble function is extracted from the unchanged source.
      expect(dispatchKey("Escape",actualMenuStopBubble()).stopped).toBe(true);
    } else {
      expect(dispatchKey("Escape",props.onKeyDown).stopped).toBe(true);
    }
    framesAfterEscape = frames.size;
  }
  props.onPointerUp(pointer(95) as never);
  cleanups.forEach(cleanup => cleanup());
  for (const listener of keys) expect(removed).toContainEqual(listener);
  expect(frames.size).toBe(0);
  return {framesAfterEscape,writes,log,cancelFrame,captured,keys};
}

describe("Courses column reorder source contracts", () => {
  it("Tab to actual CellMenu then Escape cancels capture/scroll and prevents the later release from saving", () => {
    const canceled = runFocusedGesture(true,true);
    expect(canceled.framesAfterEscape).toBe(0); expect(canceled.captured).toBe(false);
    expect(canceled.cancelFrame).toHaveBeenCalledWith(1);
    expect(canceled.writes).not.toHaveBeenCalled(); expect(canceled.log).not.toHaveBeenCalled();
    expect(canceled.keys).toHaveLength(1); expect(canceled.keys[0].capture).toBe(true);
  });
  it("focused-handle Escape cancels the scroll frame and fences the following release from saving/logging", () => {
    const canceled = runFocusedGesture(true);
    expect(canceled.framesAfterEscape).toBe(0); expect(canceled.cancelFrame).toHaveBeenCalledWith(1);
    expect(canceled.captured).toBe(false); expect(canceled.writes).not.toHaveBeenCalled(); expect(canceled.log).not.toHaveBeenCalled();
    // Positive control proves the same actual release route can commit and log.
    const committed = runFocusedGesture(false);
    expect(committed.writes).toHaveBeenCalledTimes(1); expect(committed.log).toHaveBeenCalledTimes(1);
  });
  it("pairs headers and all row cells by the same ordered IDs and detects an original-array row mutant", () => {
    expect(pairedIds(table)).toBe(true);
    expect(pairedIds(table.replace("visibleColumns={orderedVisibleColumns}","visibleColumns={visibleColumns}"))).toBe(false);
    expect(table).toContain("key={c.id}"); expect(table).toContain("course={c}");
    expect(table).toContain("const sorted = sortCourses(courses, sort, sortCtx)");
    expect(table).toContain("const [visibleColumns, setVisibleColumns]");
    expect(table).toContain("const [sort, setSort]");
    const row = readFileSync("src/app/components/courses/CourseRow.tsx","utf8");
    expect(row).toContain("visibleColumns.map");
    expect(table).toContain("<th style={{ minWidth: COLUMN_MIN_WIDTHS.actions }}>Actions</th>");
    expect(table).toContain('onClick={() => applySort("name")}');
  });
  it("adds optional-only distinct handles beside ordinary sort and menu controls", () => {
    expect(table).toContain("data-course-column={id}");
    expect(table).toContain("{...handleProps(id)}");
    expect(table).toContain("onClick={() => applySort(id)}");
    expect(table).toContain("items={headerMenuItems(id)}");
    expect(hook).toContain('"aria-label":`Move ${CELL_COLUMN_LABELS[id]} column`');
    expect(hook).toContain("event.preventDefault();event.stopPropagation()");
    expect(table).not.toContain("draggable="); expect(table).not.toContain('role="grid"');
    expect(hook).not.toContain("onSearchChange"); expect(hook).not.toContain("onSearchColumnChange");
  });
  it("owns one pointer, uses the exact threshold and actual scoped release hit, and cancels without committing", () => {
    expect(hook).toContain("event.button !== 0 || gesture.current");
    expect(hook).toContain("setPointerCapture(event.pointerId)");
    expect(hook).toContain("current.pointerId !== event.pointerId");
    expect(hook).toContain("Math.abs(event.clientX-current.startX) < 8");
    expect(hook).toContain("document.elementFromPoint(x,y)");
    expect(hook).toContain('hit.closest("table") !== table');
    expect(hook).toContain("current.active ? hitColumn(event.clientX,event.clientY) : null");
    expect(hook).toContain("dropCourseColumn(order.current,visible.current,current.source,target)");
    expect(hook).toContain("onPointerCancel:pointerCancel,onLostPointerCapture:pointerCancel");
    expect(hook).toContain('event.key === "Escape"');
    const cancel = hook.slice(hook.indexOf("const cancel ="),hook.indexOf("const scrollTick ="));
    expect(cancel).toContain("cancelAnimationFrame"); expect(cancel).not.toContain("commit(");
    expect(hook).toContain("cancel(false)");
    expect(hook).toContain("scroller.scrollLeft += 14"); expect(hook).not.toContain("scrollTop");
    expect(css).toContain("touch-action: none"); expect(css).not.toContain("animation:");
  });
  it("keeps keyboard/menu moves on the same one-save boundary with persistent status and explicit instructions", () => {
    expect(hook).toContain("!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey");
    expect(hook).toContain('"aria-keyshortcuts":"Alt+ArrowLeft Alt+ArrowRight"');
    expect(hook).toContain("moveColumnInOrder(order.current,visible.current,id,direction)");
    expect(hook).toContain("focus({preventScroll:true})");
    expect(hook).toContain("saveCourseColumnOrder(order.current,next,storage,recordPreference)");
    expect(hook).not.toContain("setColumnOrder(("); expect(hook).not.toContain("localStorage.setItem");
    expect(table).toContain('moveColumn(id, "up")'); expect(table).toContain('moveColumn(id, "down")');
    expect(table).toContain('role="status" aria-live="polite" aria-atomic="true">{columnOrderMessage}');
    expect(table).toContain("Alt+Left and Alt+Right");
    expect(hook).toContain("loaded.current"); expect(hook).toContain("queueMicrotask");
    expect(hook).toContain('surface:"courses"'); expect(hook).toContain("recordSessionDiagnosticEntry");
    expect(hook).toContain('error:"COURSES_COLUMN_ORDER_STORAGE"');
  });
});
