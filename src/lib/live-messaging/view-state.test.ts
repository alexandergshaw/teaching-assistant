import { describe, expect, it } from "vitest";
import {
  DEFAULT_TABLE_CONTROLS,
  DEFAULT_TABLE_PAGE_SIZE,
  TABLE_VIEW_KEY,
  nextSort,
  parseTableControls,
  serializeTableControls,
  toggleFilterToken,
} from "./view-state";

describe("table control persistence", () => {
  it("uses a ta- key and defaults the pager to 200", () => {
    expect(TABLE_VIEW_KEY.startsWith("ta-")).toBe(true);
    expect(DEFAULT_TABLE_PAGE_SIZE).toBe(200);
    expect(DEFAULT_TABLE_CONTROLS.pageSize).toBe(200);
  });

  it("round-trips search, funnels, sort and page size", () => {
    const state = {
      search: "ada",
      filters: { course: ["Biology 101"], missing: ["0", "2"] },
      sort: { key: "grade" as const, direction: "desc" as const },
      pageSize: 50,
    };
    expect(parseTableControls(serializeTableControls(state))).toEqual(state);
  });

  it("falls back to defaults for malformed storage and coerces bad fields", () => {
    expect(parseTableControls(null)).toEqual(DEFAULT_TABLE_CONTROLS);
    expect(parseTableControls("{nope")).toEqual(DEFAULT_TABLE_CONTROLS);
    expect(parseTableControls(JSON.stringify({ v: 9 }))).toEqual(DEFAULT_TABLE_CONTROLS);
    const bad = parseTableControls(
      JSON.stringify({ v: 1, search: 7, filters: { nope: ["x"] }, sort: { key: "zzz", direction: "asc" }, pageSize: "big" })
    );
    expect(bad).toEqual(DEFAULT_TABLE_CONTROLS);
  });
});

describe("nextSort", () => {
  it("cycles none -> asc -> desc -> none on one key, and restarts on a new key", () => {
    const asc = nextSort(null, "name");
    expect(asc).toEqual({ key: "name", direction: "asc" });
    const desc = nextSort(asc, "name");
    expect(desc).toEqual({ key: "name", direction: "desc" });
    expect(nextSort(desc, "name")).toBeNull();
    expect(nextSort(desc, "course")).toEqual({ key: "course", direction: "asc" });
  });
});

describe("toggleFilterToken", () => {
  const options = ["A", "B", "C"];

  it("starts from all options: unchecking one leaves the other two", () => {
    expect(toggleFilterToken({}, "course", "B", options)).toEqual({ course: ["A", "C"] });
  });

  it("collapses back to no filter when every option is selected again", () => {
    const one = toggleFilterToken({}, "course", "B", options);
    expect(toggleFilterToken(one, "course", "B", options)).toEqual({});
  });

  it("collapses to no filter when the last selected option is removed", () => {
    expect(toggleFilterToken({ course: ["A"] }, "course", "A", options)).toEqual({});
  });

  it("does not touch other columns", () => {
    const out = toggleFilterToken({ term: ["Fall"] }, "course", "B", options);
    expect(out.term).toEqual(["Fall"]);
  });
});
