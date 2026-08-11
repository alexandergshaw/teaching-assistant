// Pure-logic coverage for the Course Content tab's persisted source
// selection (docs/REGRESSION.md entry 263's Limits: "the picker...lands
// next" - this is that picker's persistence layer). vitest is node-env and
// renders no component, so this is the only coverage that can exist for it -
// see courses-table-helpers.ts's own versioned-parse idiom (parseColumnSet)
// this module's parse function follows.

import { describe, it, expect } from "vitest";
import {
  parseContentSelection,
  serializeContentSelection,
  contentSelectionKey,
  EMPTY_CONTENT_SELECTION,
  type ContentSelection,
} from "./content-selection";

describe("parseContentSelection", () => {
  it("returns the empty selection for a missing/null/undefined/empty value", () => {
    expect(parseContentSelection(null)).toEqual(EMPTY_CONTENT_SELECTION);
    expect(parseContentSelection(undefined)).toEqual(EMPTY_CONTENT_SELECTION);
    expect(parseContentSelection("")).toEqual(EMPTY_CONTENT_SELECTION);
  });

  // The legacy path: every version of ContentTab before source selection
  // existed wrote localStorage.setItem(CONTENT_URL_KEY, url) - a BARE,
  // un-JSON-encoded Canvas URL/path, never quoted. That string is essentially
  // never valid JSON, so JSON.parse throws and the raw value is migrated to
  // a live selection wholesale.
  it("migrates a legacy bare Canvas URL path to a live selection", () => {
    expect(parseContentSelection("/courses/12345")).toEqual({ source: "live", courseUrl: "/courses/12345" });
  });

  it("migrates a legacy absolute Canvas URL (the saved-course pill shape) to a live selection", () => {
    const url = "https://school.instructure.com/courses/999";
    expect(parseContentSelection(url)).toEqual({ source: "live", courseUrl: url });
  });

  it("never throws on malformed JSON, migrating the raw text as a legacy live selection", () => {
    expect(() => parseContentSelection("{not json")).not.toThrow();
    expect(parseContentSelection("{not json")).toEqual({ source: "live", courseUrl: "{not json" });
  });

  it("round-trips a live selection through serialize/parse", () => {
    const sel: ContentSelection = { source: "live", courseUrl: "/courses/42" };
    expect(parseContentSelection(serializeContentSelection(sel))).toEqual(sel);
  });

  it("round-trips an export selection through serialize/parse", () => {
    const sel: ContentSelection = { source: "export", courseId: "course-hub-id-1" };
    expect(parseContentSelection(serializeContentSelection(sel))).toEqual(sel);
  });

  it("falls back to the empty selection for well-formed JSON that isn't a recognized selection", () => {
    expect(parseContentSelection(JSON.stringify({ v: 1, selection: { source: "bogus" } }))).toEqual(
      EMPTY_CONTENT_SELECTION
    );
    expect(parseContentSelection(JSON.stringify({ v: 1, selection: { source: "export", courseId: "" } }))).toEqual(
      EMPTY_CONTENT_SELECTION
    );
    expect(parseContentSelection(JSON.stringify({ v: 1 }))).toEqual(EMPTY_CONTENT_SELECTION);
    expect(parseContentSelection(JSON.stringify([1, 2, 3]))).toEqual(EMPTY_CONTENT_SELECTION);
    expect(parseContentSelection(JSON.stringify(42))).toEqual(EMPTY_CONTENT_SELECTION);
  });
});

describe("contentSelectionKey", () => {
  it("distinguishes two DIFFERENT export-only courses, whose courseUrl would both collapse to empty", () => {
    const a: ContentSelection = { source: "export", courseId: "course-a" };
    const b: ContentSelection = { source: "export", courseId: "course-b" };
    expect(contentSelectionKey(a)).not.toBe(contentSelectionKey(b));
  });

  it("is stable for the same export selection", () => {
    const a: ContentSelection = { source: "export", courseId: "course-a" };
    expect(contentSelectionKey(a)).toBe(contentSelectionKey({ source: "export", courseId: "course-a" }));
  });

  it("distinguishes a live selection from an export selection even when the identifiers are the same string", () => {
    const live: ContentSelection = { source: "live", courseUrl: "course-a" };
    const exp: ContentSelection = { source: "export", courseId: "course-a" };
    expect(contentSelectionKey(live)).not.toBe(contentSelectionKey(exp));
  });

  it("distinguishes two different live courses", () => {
    const a: ContentSelection = { source: "live", courseUrl: "/courses/1" };
    const b: ContentSelection = { source: "live", courseUrl: "/courses/2" };
    expect(contentSelectionKey(a)).not.toBe(contentSelectionKey(b));
  });
});
