import { describe, it, expect } from "vitest";
import { resolveDeckTemplateId } from "./deck";

// The behavioural half of the AC9 fix that made the deck template picker
// persist (docs/bulk-bar-reorganization-acceptance-criteria.md section 3b,
// D2's row on AC9). useLmsGeneration.test.ts pins that the persistence is
// WIRED by reading source text - vitest here is node-env and renders no
// component, so the hook's effects are unreachable. This file pins what the
// reconciliation actually DOES, which is executable.
//
// Fixtures use the `{ id }` shape the caller really passes (DECK_PRESETS
// entries and deck_templates rows both carry `id`), not an invented one.

const PRESETS = [{ id: "preset-clean" }, { id: "preset-bold" }];
const WITH_USER_ROWS = [...PRESETS, { id: "row-abc123" }];

describe("resolveDeckTemplateId", () => {
  it("keeps a remembered id that is still on offer", () => {
    expect(resolveDeckTemplateId("preset-bold", PRESETS)).toBe("preset-bold");
  });

  it("keeps a remembered id naming one of the instructor's OWN saved rows, once those have loaded", () => {
    // The case that forced reconciliation to happen after the load rather
    // than at seed time: at seed time this id is not in DECK_PRESETS and
    // would have been discarded.
    expect(resolveDeckTemplateId("row-abc123", WITH_USER_ROWS)).toBe("row-abc123");
  });

  it("falls back to the first template when the remembered id is no longer offered - a deleted deck_templates row", () => {
    expect(resolveDeckTemplateId("row-deleted", WITH_USER_ROWS)).toBe("preset-clean");
  });

  it("falls back for a blank, whitespace-only, null or undefined stored value", () => {
    expect(resolveDeckTemplateId("", PRESETS)).toBe("preset-clean");
    expect(resolveDeckTemplateId("   ", PRESETS)).toBe("preset-clean");
    expect(resolveDeckTemplateId(null, PRESETS)).toBe("preset-clean");
    expect(resolveDeckTemplateId(undefined, PRESETS)).toBe("preset-clean");
  });

  it("trims a stored value before matching, so a hand-edited key with stray whitespace still resolves", () => {
    expect(resolveDeckTemplateId("  preset-bold  ", PRESETS)).toBe("preset-bold");
  });

  it("returns an empty string rather than throwing when nothing is on offer at all", () => {
    // Unreachable in production (DECK_PRESETS is non-empty) but the function
    // must not throw on an empty list - resolveDeckTemplateSelection is the
    // layer that refuses a blank id, with a user-facing reason.
    expect(resolveDeckTemplateId("anything", [])).toBe("");
  });

  it("never returns an id that is not in the offered list", () => {
    // The invariant the whole function exists for, stated directly: whatever
    // comes out is either offered or empty. Asserted over every fixture case
    // rather than trusting the branches above to be exhaustive.
    for (const stored of ["preset-bold", "row-abc123", "row-deleted", "", "   ", null, undefined]) {
      const resolved = resolveDeckTemplateId(stored, WITH_USER_ROWS);
      if (resolved !== "") {
        expect(WITH_USER_ROWS.some((t) => t.id === resolved)).toBe(true);
      }
    }
  });
});
