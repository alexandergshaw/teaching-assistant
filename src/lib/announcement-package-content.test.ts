// TDD suite for packageModuleContentForWeeks - the package-source twin of
// fetchModuleContentForWeeks (src/lib/canvas-modules/module-content.ts)
// (docs/weekly-announcement-package-io-acceptance-criteria.md AC1 items 7/8,
// "Tests written BEFORE implementation" item 3).
//
// Pure and synchronous throughout - unlike module-content.test.ts, there is
// no fetch to stub. Fixtures below intentionally reuse the SAME module names
// module-content.test.ts and announcement-module-content.test.ts use, so the
// "matches the live path" assertions are checking the same week-to-module
// resolution, not merely a plausible one.
import { describe, it, expect } from "vitest";
import { packageModuleContentForWeeks } from "./announcement-package-content";
import { MODULE_MATERIALS_CAP } from "./announcement-module-content";
import type { CartridgeModule, CartridgeModuleItem } from "@/lib/cartridge-import";

function cmItem(overrides: Partial<CartridgeModuleItem> & { title: string; type: string }): CartridgeModuleItem {
  return { ...overrides };
}

function cmModule(name: string, position: number, items: CartridgeModuleItem[] = []): CartridgeModule {
  return { name, position, items };
}

describe("packageModuleContentForWeeks: week-to-module resolution matches the live path", () => {
  it("matches a numbered course by NAME, exactly like selectModuleForWeek over live ModuleContent[]", () => {
    // Same fixture shape as announcement-module-content.test.ts's "REFUSES to
    // guess" tests: a leading unnumbered entry ahead of a numbered run. If
    // this file re-implemented matching instead of reusing
    // selectModuleForWeek, this is exactly the case that would silently
    // regress to a positional guess.
    const modules = [
      cmModule("Start Here", 1),
      cmModule("Module 01: Intro", 2),
      cmModule("Module 02: Loops", 3),
      cmModule("Module 03: Functions", 4),
    ];

    const result = packageModuleContentForWeeks(modules, [2], 15);

    expect(result.get(2)?.moduleName).toBe("Module 02: Loops");
    expect(result.get(2)?.matchedBy).toBe("name");
  });

  it("numbered-module name matching wins over position, even when position would land on a plausible module", () => {
    // Position 1 in this list is "Module 05" (week 5's own module, by
    // coincidence) - but the course is numbered, so name matching must be
    // used exclusively, landing week 1 on "no match" rather than reusing
    // Module 05's content under week 1.
    const modules = [cmModule("Module 05: Recursion", 1), cmModule("Module 06: Trees", 2)];

    const result = packageModuleContentForWeeks(modules, [1], 15);

    expect(result.get(1)?.matchedBy).toBe("none");
    expect(result.get(1)?.moduleName).toBeNull();
  });

  it("uses the unnumbered positional fallback ONLY when module count equals week count", () => {
    const modules = [cmModule("Unit A", 1), cmModule("Unit B", 2), cmModule("Unit C", 3)];

    const matched = packageModuleContentForWeeks(modules, [2], 3);
    expect(matched.get(2)?.matchedBy).toBe("position");
    expect(matched.get(2)?.moduleName).toBe("Unit B");

    // Same modules, but the course runs 5 weeks - the counts disagree, so the
    // positional fallback must be refused, matching selectModuleForWeek's own
    // "REFUSES position when...counts disagree" rule.
    const mismatched = packageModuleContentForWeeks(modules, [2], 5);
    expect(mismatched.get(2)?.matchedBy).toBe("none");
    expect(mismatched.get(2)?.moduleName).toBeNull();
  });

  it("yields matchedBy 'none' and blank materials for a week with no matching module, with the live path's exact note wording", () => {
    const modules = [cmModule("Module 01", 1)];

    const result = packageModuleContentForWeeks(modules, [9], 15);
    const week = result.get(9)!;

    expect(week.matchedBy).toBe("none");
    expect(week.moduleName).toBeNull();
    expect(week.materials).toBe("");
    expect(week.truncated).toBe(false);
    expect(week.notes).toEqual(["No module matched week 9 - reported no content rather than guessing one."]);
  });
});

describe("packageModuleContentForWeeks: item mapping (AC1 item 8)", () => {
  it("carries a matched module's item titles and bodies into materials, with no due-date/points suffix", () => {
    // Deliberately unnumbered ("Sorting Unit", not "Module 04: Sorting") so
    // this exercises the positional match path, not name matching.
    const modules = [
      cmModule("Sorting Unit", 1, [
        cmItem({ title: "Sorting notes", type: "Page", body: "Bubble sort is O(n^2)." }),
        cmItem({ title: "Lab 4", type: "Assignment", body: "Implement quicksort." }),
      ]),
    ];

    const result = packageModuleContentForWeeks(modules, [1], 1);
    const week = result.get(1)!;

    expect(week.moduleName).toBe("Sorting Unit");
    expect(week.matchedBy).toBe("position");
    expect(week.materials).toContain("Page: Sorting notes");
    expect(week.materials).toContain("Bubble sort is O(n^2).");
    expect(week.materials).toContain("Assignment: Lab 4");
    // No CartridgeModuleItem ever carries a due date or points, so the
    // "(N points, due Mon D)" suffix formatModuleMaterials renders for a live
    // item must never appear here.
    expect(week.materials).not.toMatch(/\(\d+ points?/);
    expect(week.materials).not.toMatch(/due [A-Z][a-z]{2} \d/);
  });

  it("DEFECT 3 fix: leaves `notes` EMPTY for a matched module with real content - notes is PROBLEMS ONLY, matching the live path's contract, never provenance", () => {
    const modules = [cmModule("Module 01", 1, [cmItem({ title: "Item", type: "Page", body: "text" })])];

    const result = packageModuleContentForWeeks(modules, [1], 1);

    expect(result.get(1)?.notes).toEqual([]);
  });

  it("DEFECT 3 fix: also leaves `notes` EMPTY for a matched module with ZERO items - an empty match is not a problem this function can observe, so it must not be confused with one", () => {
    const modules = [cmModule("Module 03: Review", 1, [])];

    const result = packageModuleContentForWeeks(modules, [3], 15);
    const week = result.get(3)!;

    expect(week.moduleName).toBe("Module 03: Review");
    expect(week.materials).toBe("");
    expect(week.notes).toEqual([]);
  });

  it("maps an item with no resolved body (undefined) to an empty-string body, not to 'undefined' text", () => {
    const modules = [cmModule("Module 01", 1, [cmItem({ title: "file.pdf", type: "File" })])];

    const result = packageModuleContentForWeeks(modules, [1], 1);

    expect(result.get(1)?.materials).toBe("File: file.pdf");
    expect(result.get(1)?.materials).not.toMatch(/undefined/);
  });
});

describe("packageModuleContentForWeeks: the 3000-char item cap and the 8000-char aggregate cap", () => {
  it("passes a long (but under-cap) item body through untruncated", () => {
    // MAX_CARTRIDGE_ITEM_BODY_CHARS (cartridge-import-shared.ts) is 3000 -
    // this is the size resolveCartridgeItemBodies would itself produce for an
    // oversized source page, arriving here as an ordinary item body.
    const body = "x".repeat(3000);
    const modules = [cmModule("Module 01", 1, [cmItem({ title: "Big page", type: "Page", body })])];

    const result = packageModuleContentForWeeks(modules, [1], 1);
    const week = result.get(1)!;

    expect(week.materials).toContain(body);
    expect(week.truncated).toBe(false);
  });

  it("caps the AGGREGATE materials at MODULE_MATERIALS_CAP across multiple 3000-char items, and marks the cut", () => {
    const items = Array.from({ length: 4 }, (_, i) =>
      cmItem({ title: `Item ${i}`, type: "Page", body: "x".repeat(3000) })
    );
    const modules = [cmModule("Module 01", 1, items)];

    const result = packageModuleContentForWeeks(modules, [1], 1);
    const week = result.get(1)!;

    expect(MODULE_MATERIALS_CAP).toBe(8000);
    expect(week.materials.length).toBeLessThanOrEqual(MODULE_MATERIALS_CAP);
    expect(week.truncated).toBe(true);
    expect(week.materials).toContain("[truncated]");
  });
});

describe("packageModuleContentForWeeks: no-work and empty-input short circuits", () => {
  it("does zero work and returns an empty Map when weeks is empty", () => {
    const modules = [cmModule("Module 01", 1, [cmItem({ title: "Item", type: "Page", body: "text" })])];

    const result = packageModuleContentForWeeks(modules, [], 15);

    expect(result.size).toBe(0);
  });

  it("resolves every requested week to 'none' for a module list with zero modules", () => {
    const result = packageModuleContentForWeeks([], [1, 2, 3], 3);

    expect(result.size).toBe(3);
    for (const week of [1, 2, 3]) {
      expect(result.get(week)?.matchedBy).toBe("none");
      expect(result.get(week)?.moduleName).toBeNull();
      expect(result.get(week)?.materials).toBe("");
    }
  });
});
