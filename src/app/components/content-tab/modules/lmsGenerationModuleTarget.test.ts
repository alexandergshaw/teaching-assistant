// Wave 0B structural split (docs/bulk-bar-reorganization-acceptance-criteria.md
// section 3b/D5): useLmsGeneration.test.ts sat at exactly this repo's 1000-line
// ceiling, so the module-target describe blocks below - kindNeedsModuleTarget,
// resolvePostModuleTarget and postModuleOptionsFrom - moved here UNCHANGED,
// along existing describe-block boundaries. No assertion's meaning changed;
// this is a file split only. See useLmsGeneration.test.ts's own header
// comment for what this suite as a whole can and cannot reach (node-env
// vitest, no component ever rendered).
//
// Not to be confused with lmsGenerationModuleTarget.postSeed.test.ts, the
// sibling file that already covers defaultPostModuleChoiceFrom by importing
// directly from the lmsGenerationModuleTarget.ts leaf. Imports here stay from
// "./useLmsGeneration" (the barrel) instead, matching where this coverage
// already lived before this split.
import { describe, expect, it } from "vitest";
import type { CanvasModule } from "@/lib/canvas-modules";
import {
  NEW_MODULE_TARGET_VALUE,
  kindNeedsModuleTarget,
  postModuleOptionsFrom,
  resolvePostModuleTarget,
} from "./useLmsGeneration";

describe("kindNeedsModuleTarget (P5)", () => {
  it("module-item placement kinds need a module target", () => {
    expect(kindNeedsModuleTarget("objectives")).toBe(true);
    expect(kindNeedsModuleTarget("assignments")).toBe(true);
    expect(kindNeedsModuleTarget("knowledgeChecks")).toBe(true);
    // "resources" is module-item placement too (D2/A3 of docs/learning-
    // resources-page-acceptance-criteria.md) - absent before, finding 5.
    expect(kindNeedsModuleTarget("resources")).toBe(true);
  });

  it("SABOTAGE TARGET: a course-level kind (announcements) needs no module target - it has no module to choose", () => {
    expect(kindNeedsModuleTarget("announcements")).toBe(false);
  });

  it("a save-version kind (no commitMeta at all) also reports false, not a thrown error", () => {
    expect(kindNeedsModuleTarget("qa")).toBe(false);
    expect(kindNeedsModuleTarget("currentEvents")).toBe(false);
    expect(kindNeedsModuleTarget("decks")).toBe(false);
  });
});

describe("resolvePostModuleTarget (P5)", () => {
  it("resolves an existing-module choice to its numeric id", () => {
    const result = resolvePostModuleTarget("42", "");
    expect(result).toEqual({ ok: true, target: { kind: "existing", moduleId: 42 } });
  });

  it("resolves the new-module sentinel plus a trimmed name to a 'new' target", () => {
    const result = resolvePostModuleTarget(NEW_MODULE_TARGET_VALUE, "  Week 5  ");
    expect(result).toEqual({ ok: true, target: { kind: "new", name: "Week 5" } });
  });

  it("SABOTAGE TARGET: refuses a blank new-module name instead of creating a module named \"\"", () => {
    const result = resolvePostModuleTarget(NEW_MODULE_TARGET_VALUE, "   ");
    expect(result.ok).toBe(false);
  });

  it("refuses an empty/unselected choice", () => {
    expect(resolvePostModuleTarget("", "").ok).toBe(false);
  });

  it("refuses a non-numeric, non-sentinel choice rather than silently coercing it to NaN", () => {
    expect(resolvePostModuleTarget("not-a-module-id", "").ok).toBe(false);
  });
});

describe("postModuleOptionsFrom", () => {
  function module(overrides: Partial<CanvasModule>): CanvasModule {
    return { id: 1, name: "Week 1", position: 1, published: true, itemsCount: 0, items: [], ...overrides };
  }

  it("maps each module to its id/name pair only, in the same order", () => {
    const modules = [module({ id: 1, name: "Week 1" }), module({ id: 2, name: "Week 2" })];
    expect(postModuleOptionsFrom(modules)).toEqual([
      { id: 1, name: "Week 1" },
      { id: 2, name: "Week 2" },
    ]);
  });

  it("returns an empty array for an empty module list", () => {
    expect(postModuleOptionsFrom([])).toEqual([]);
  });
});
