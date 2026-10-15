import { describe, expect, it, vi } from "vitest";
import { ALL_COLUMN_IDS, CURRENT_COLUMNS_VERSION, moveColumnInOrder, parseColumnOrder, serializeColumnOrder, type ColumnId } from "./courses-table-helpers";
import { COURSE_COLUMN_ORDER_KEY, dropCourseColumn, loadCourseColumnOrder, saveCourseColumnOrder } from "./courses-column-reorder";

const order: ColumnId[] = ["email","institution","modality","startDate"];
const visible: ColumnId[] = ["email","modality","startDate"];
function storageFixture(failure?: "read" | "write") {
  const values = new Map<string,string>([["ta-courses-sort","sort remains readable"]]);
  const getItem = vi.fn((key: string) => {
    if (failure === "read" && key === COURSE_COLUMN_ORDER_KEY) throw new Error("private raw storage content");
    return values.get(key) ?? null;
  });
  const setItem = vi.fn((key: string,value: string) => {
    if (failure === "write" && key === COURSE_COLUMN_ORDER_KEY) throw new Error("private exception content");
    values.set(key,value);
  });
  return {values,getItem,setItem,access:() => ({getItem,setItem})};
}

describe("Courses drop order", () => {
  it("moves right after the target and left before it across hidden gaps", () => {
    expect(dropCourseColumn(order,visible,"email","startDate")).toEqual(["institution","modality","startDate","email"]);
    expect(dropCourseColumn(order,visible,"startDate","email")).toEqual(["startDate","email","institution","modality"]);
    expect(dropCourseColumn(order,visible,"email","modality")).toEqual(["institution","modality","email","startDate"]);
    expect(dropCourseColumn(order,visible,"modality","email")).toEqual(["modality","email","institution","startDate"]);
    expect(order).toEqual(["email","institution","modality","startDate"]);
  });
  it("retains all IDs and hidden positions relative to other untouched IDs on reveal", () => {
    const complete = [...ALL_COLUMN_IDS], before = [...complete];
    const moved = dropCourseColumn(complete,visible,"email","startDate");
    expect(moved.slice(0,4)).toEqual(["institution","modality","startDate","email"]);
    expect(moved.filter(id => visible.includes(id))).toEqual(["modality","startDate","email"]);
    expect(moved.filter(id => [...visible,"institution"].includes(id))).toEqual(["institution","modality","startDate","email"]);
    expect(moved.filter(id => id !== "email")).toEqual(before.filter(id => id !== "email"));
    expect(new Set(moved).size).toBe(ALL_COLUMN_IDS.length); expect(complete).toEqual(before);
  });
  it("returns the same order for invalid, hidden, structural, duplicate and stale IDs", () => {
    for (const [source,target] of [["email","email"],["email","institution"],["institution","email"],["name","email"],["email","actions"],["unknown","email"],["email","unknown"]]) {
      expect(dropCourseColumn(order,visible,source,target)).toBe(order);
    }
    expect(dropCourseColumn(order,[],"email","startDate")).toBe(order);
    expect(dropCourseColumn(order,["email"],"email","startDate")).toBe(order);
    expect(dropCourseColumn(order,["email","email","startDate"],"email","startDate")).toBe(order);
    const duplicate: ColumnId[] = ["email","email","startDate"];
    expect(dropCourseColumn(duplicate,visible,"email","startDate")).toBe(duplicate);
    expect(dropCourseColumn(["email","modality"],["email","startDate"],"email","startDate")).toEqual(["email","modality"]);
  });
  it("preserves the existing nearest-visible menu step and edge no-op semantics", () => {
    expect(moveColumnInOrder(order,visible,"email","down")).toEqual(["institution","modality","email","startDate"]);
    expect(moveColumnInOrder(order,visible,"startDate","up")).toEqual(["email","institution","startDate","modality"]);
    expect(moveColumnInOrder(order,visible,"email","up")).toBe(order);
  });
});

describe("Courses order-key persistence boundary", () => {
  it("writes/logs once per successful drop, shortcut or menu move and reloads the complete current version", () => {
    for (const next of [dropCourseColumn([...ALL_COLUMN_IDS],visible,"email","startDate"),moveColumnInOrder([...ALL_COLUMN_IDS],visible,"email","down")]) {
      const storage = storageFixture(), record = vi.fn();
      const result = saveCourseColumnOrder([...ALL_COLUMN_IDS],next,storage.access,record,() => 20);
      expect(result).toMatchObject({changed:true,saved:true,notice:""});
      expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(COURSE_COLUMN_ORDER_KEY,serializeColumnOrder(next));
      expect(JSON.parse(storage.values.get(COURSE_COLUMN_ORDER_KEY)!)).toEqual({v:CURRENT_COLUMNS_VERSION,order:next});
      expect(record).toHaveBeenCalledExactlyOnceWith({operation:"courses_column_order_save",outcome:"success",durationMs:0});
      const loaded = loadCourseColumnOrder(storage.access,record,() => 20);
      expect(loaded.order).toEqual(next); expect(record).toHaveBeenCalledTimes(2);
    }
  });
  it("never writes/logs a no-op, canceled move or invalid order", () => {
    const storage = storageFixture(), record = vi.fn();
    const invalid: ColumnId[] = ["email","email","modality","startDate"];
    for (const next of [order,[...order],dropCourseColumn(order,visible,"email","email"),moveColumnInOrder(order,visible,"email","up"),invalid,order.slice(1)]) {
      expect(saveCourseColumnOrder(order,next,storage.access,record).changed).toBe(false);
    }
    expect(storage.setItem).not.toHaveBeenCalled(); expect(record).not.toHaveBeenCalled();
  });
  it("uses existing default and migration parsing without changing unrelated keys", () => {
    const storage = storageFixture(), record = vi.fn();
    expect(loadCourseColumnOrder(storage.access,record).order).toEqual([...ALL_COLUMN_IDS]);
    storage.values.set(COURSE_COLUMN_ORDER_KEY,JSON.stringify(["modality","email","institution"]));
    expect(loadCourseColumnOrder(storage.access,record).order.slice(0,3)).toEqual(["email","modality","institution"]);
    storage.values.set(COURSE_COLUMN_ORDER_KEY,"malformed");
    expect(loadCourseColumnOrder(storage.access,record).order).toEqual(parseColumnOrder(null));
    expect(storage.getItem("ta-courses-sort")).toBe("sort remains readable");
  });
  it("contains key-specific read/write failure, keeps the in-memory move, and emits only fixed private-safe outcomes", () => {
    const reader = storageFixture("read"), loadLog = vi.fn(); let time = 10;
    const loaded = loadCourseColumnOrder(reader.access,loadLog,() => time++);
    expect(loaded.order).toEqual([...ALL_COLUMN_IDS]); expect(loaded.notice).toContain("could not be loaded");
    expect(reader.getItem("ta-courses-sort")).toBe("sort remains readable");
    expect(loadLog).toHaveBeenCalledExactlyOnceWith({operation:"courses_column_order_load",outcome:"failure",durationMs:1,code:"COURSES_COLUMN_ORDER_STORAGE"});
    const writer = storageFixture("write"), saveLog = vi.fn(), next = dropCourseColumn(order,visible,"email","startDate");
    const saved = saveCourseColumnOrder(order,next,writer.access,saveLog,() => time++);
    expect(saved).toMatchObject({order:["institution","modality","startDate","email"],changed:true,saved:false});
    expect(saved.notice).toContain("not saved for reload");
    expect(saveLog).toHaveBeenCalledExactlyOnceWith({operation:"courses_column_order_save",outcome:"failure",durationMs:1,code:"COURSES_COLUMN_ORDER_STORAGE"});
    expect(JSON.stringify([loadLog.mock.calls,saveLog.mock.calls,loaded.notice,saved.notice])).not.toContain("private");
    expect(writer.getItem("ta-courses-sort")).toBe("sort remains readable");
  });
});
