import { ALL_COLUMN_IDS, parseColumnOrder, serializeColumnOrder, type ColumnId } from "./courses-table-helpers";

export const COURSE_COLUMN_ORDER_KEY = "ta-courses-column-order";
export const COURSE_COLUMN_ORDER_STORAGE_CODE = "COURSES_COLUMN_ORDER_STORAGE";
const ids = new Set<string>(ALL_COLUMN_IDS);

/** Move only the source, preserving every other visible or hidden ID's order. */
export function dropCourseColumn(order: ColumnId[], visible: ColumnId[], source: string, target: string): ColumnId[] {
  if (source === target || !ids.has(source) || !ids.has(target) || new Set(order).size !== order.length || order.some(id => !ids.has(id)) || new Set(visible).size !== visible.length || visible.some(id => !order.includes(id))) return order;
  if (!visible.includes(source as ColumnId) || !visible.includes(target as ColumnId)) return order;
  const from = order.indexOf(source as ColumnId), to = order.indexOf(target as ColumnId);
  if (from < 0 || to < 0) return order;
  const next = [...order]; next.splice(from, 1); next.splice(to, 0, source as ColumnId);
  return next;
}

type StorageAccess = () => Pick<Storage, "getItem" | "setItem">;
export interface CourseColumnPreferenceEvent {
  operation: "courses_column_order_load" | "courses_column_order_save";
  outcome: "success" | "failure";
  durationMs: number;
  code?: typeof COURSE_COLUMN_ORDER_STORAGE_CODE;
}
type RecordPreference = (event: CourseColumnPreferenceEvent) => void;

export function loadCourseColumnOrder(storage: StorageAccess, record: RecordPreference, now = Date.now) {
  const started = now();
  let order: ColumnId[], failed = false;
  try { order = parseColumnOrder(storage().getItem(COURSE_COLUMN_ORDER_KEY)); }
  catch { order = parseColumnOrder(null); failed = true; }
  record({operation:"courses_column_order_load",outcome:failed ? "failure" : "success",durationMs:Math.max(0,now()-started),...(failed ? {code:COURSE_COLUMN_ORDER_STORAGE_CODE} : {})});
  return {order,notice:failed ? "Saved column order could not be loaded. Using the default order." : ""};
}

/** One side-effect boundary shared by drag, shortcut and existing menu movement. */
export function saveCourseColumnOrder(current: ColumnId[], next: ColumnId[], storage: StorageAccess, record: RecordPreference, now = Date.now) {
  const unchanged = current.length === next.length && current.every((id,index) => id === next[index]);
  const valid = current.length === next.length && new Set(next).size === next.length && next.every(id => ids.has(id) && current.includes(id));
  if (unchanged || !valid) return {order:current,changed:false,saved:false,notice:""};
  const started = now(); let failed = false;
  try { storage().setItem(COURSE_COLUMN_ORDER_KEY,serializeColumnOrder(next)); }
  catch { failed = true; }
  record({operation:"courses_column_order_save",outcome:failed ? "failure" : "success",durationMs:Math.max(0,now()-started),...(failed ? {code:COURSE_COLUMN_ORDER_STORAGE_CODE} : {})});
  return {order:next,changed:true,saved:!failed,notice:failed ? "Column order changed for this view, but was not saved for reload." : ""};
}
