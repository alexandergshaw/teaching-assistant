import { describe, it, expect } from "vitest";
import { buildInitialPromptState } from "./run-input-prompt-state";

describe("buildInitialPromptState", () => {
  it("returns every field at its empty default when there is no prompt", () => {
    expect(buildInitialPromptState(null)).toEqual({
      text: "",
      choice: "",
      files: [],
      rows: [],
      checked: [],
      busy: false,
      error: null,
      details: {},
      search: "",
      sort: null,
      frozenOrder: null,
    });
  });

  it("seeds text from initialValue for a text prompt", () => {
    const state = buildInitialPromptState({ kind: "text", initialValue: "hello" });
    expect(state.text).toBe("hello");
  });

  it("defaults text to an empty string for a text prompt with no initialValue", () => {
    const state = buildInitialPromptState({ kind: "text" });
    expect(state.text).toBe("");
  });

  // Every OTHER kind must clear text to "" - this is what makes the reset
  // trustworthy across kind changes: a previous "text" prompt's leftover
  // value must never leak into the next prompt just because initialValue
  // happens to still be set on the new one.
  it("never seeds text for a non-text prompt, even when initialValue is set", () => {
    const state = buildInitialPromptState({ kind: "choice", initialValue: "hello" });
    expect(state.text).toBe("");
  });

  it("seeds rows from the prompt's rows and checks every one by default", () => {
    const rows = [{ name: "Alice" }, { name: "Bob" }];
    const state = buildInitialPromptState({ kind: "table", rows });
    expect(state.rows).toBe(rows);
    expect(state.checked).toEqual([true, true]);
  });

  it("defaults rows and checked to empty arrays for a table prompt with no rows", () => {
    const state = buildInitialPromptState({ kind: "table" });
    expect(state.rows).toEqual([]);
    expect(state.checked).toEqual([]);
  });

  it("always clears choice, files, busy, error, details, search, sort, and frozenOrder", () => {
    const state = buildInitialPromptState({ kind: "table", rows: [{ a: "1" }] });
    expect(state.choice).toBe("");
    expect(state.files).toEqual([]);
    expect(state.busy).toBe(false);
    expect(state.error).toBeNull();
    expect(state.details).toEqual({});
    expect(state.search).toBe("");
    expect(state.sort).toBeNull();
    expect(state.frozenOrder).toBeNull();
  });
});
