// AC6 (docs/bulk-bar-reorganization-acceptance-criteria.md, section 3b/D2):
// page.module.css carried 148 lines styling a raw-<button> bulk bar that was
// fully migrated to MUI - nine classes (.bulkClear, .bulkBtn, .bulkBtnPrimary,
// .bulkBtnDanger, .bulkInput, .bulkSelect, .ccBarBtn, .ccBarSelect,
// .ccBarCheck) with zero remaining references anywhere in the app, verified
// by grep before removal. This test is that grep, kept live after the
// deletion so the classes cannot silently come back - a copy-pasted old
// snippet, a class name typo'd back in from muscle memory - and it also pins
// the survivors (the classes still-live wiring depends on, plus the group
// primitives this same chunk adds) so a future cleanup pass cannot mistake
// one of those for more dead code.
//
// Deliberately scoped to src/**, not docs/**: docs/bulk-bar-reorganization-
// acceptance-criteria.md itself quotes every one of these class names in
// prose while recording that they used to exist, and a scan across docs/
// would fail on its own history immediately. Test files are excluded from
// the scanned set for the mirror-image reason: this file's own
// DELETED_CLASSES/SURVIVING_CLASSES arrays are source text that name every
// class being asserted present or absent, and a naive scan including *.test.
// ts files would trip on its own literals.
//
// Mirrors page-module-css-classes.test.ts's structure (extraction canary
// before the real scan is trusted) and no-emojis.test.ts's file-walker shape.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CSS_PATH = path.resolve(process.cwd(), "src/app/page.module.css");
const SRC_ROOT = path.resolve(process.cwd(), "src");

// The nine classes AC6/D2 named for removal - styling a raw-<button> +
// CSS-module bulk bar that AC5 forbids reintroducing (the bar is 100 percent
// MUI controls now).
const DELETED_CLASSES = [
  "bulkClear",
  "bulkBtn",
  "bulkBtnPrimary",
  "bulkBtnDanger",
  "bulkInput",
  "bulkSelect",
  "ccBarBtn",
  "ccBarSelect",
  "ccBarCheck",
] as const;

// Classes that must still be defined in page.module.css after the deletion:
// the pre-existing bulk-bar primitives still consumed by BulkItemsSection.tsx,
// BulkModulesSection.tsx, GenerateFromSelectionSection.tsx,
// DownloadSelectionSection.tsx, AskAiSelectionSection.tsx,
// VisualizerCoverageSection.tsx and ModulesView.tsx, plus the new group
// primitives (job 2/3) and the error class (job 5) this same chunk adds.
const SURVIVING_CLASSES = [
  // Pre-existing, still consumed by the six bulk-bar section files.
  "bulkBarHead",
  "bulkBar",
  "bulkRow",
  "bulkLabel",
  "bulkField",
  "bulkFieldLabel",
  "bulkHint",
  "bulkCount",
  // New in this chunk: AC4's height ceiling.
  "bulkBarBody",
  // New in this chunk: the group model's CSS (AC2/AC3, section 3b/D1),
  // consumed by BulkBarGroup.tsx.
  "bulkGroup",
  "bulkGroupBody",
  "bulkGroupStatic",
  "bulkGroupHeading",
  "bulkGroupTag",
  "bulkGroupFanOut",
  "bulkGroupDanger",
  // New in this chunk: job 5's fix for GenerateFromSelectionSection.tsx's
  // generationError sharing styles.bulkHint with a purely informational hint.
  "bulkError",
  // New in this chunk: chunk C's AC1 / this doc's AC7 - groups the module
  // checkbox with "Select items" as one selection cluster inside .ccHead.
  // Sibling 1D's ModuleCard.tsx and RepoFoldersSection.tsx already reference
  // styles.ccSelectGroup (1D's brief told it to use the name and report it,
  // not add the CSS) - this is the other half of that contract.
  "ccSelectGroup",
] as const;

/**
 * True if `text` contains the class name as a CSS selector (`.bulkBtn {`) or
 * a property access on ANY local binding (`styles.bulkBtn`, `tableStyles.
 * bulkBtn`, ...) - a literal dot immediately followed by the class name and
 * NOT followed by another identifier character or hyphen, so `.bulkBtn` does
 * not also match inside a longer name like `.bulkBtnPrimary`. Deliberately
 * not scoped to one local binding name (unlike page-module-css-classes.test.
 * ts's extractReferences) - this test's job is "does this string occur
 * anywhere at all", not "does it resolve through a specific import".
 */
function hasClassReference(text: string, className: string): boolean {
  const pattern = new RegExp(`\\.${className}(?![\\w-])`);
  return pattern.test(text);
}

function walkSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSourceFiles(full));
      continue;
    }
    if (!/\.(tsx?|jsx?|css)$/.test(entry.name)) continue;
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) continue;
    out.push(full);
  }
  return out;
}

describe("bulk bar dead-CSS grep and survivor pin (AC6)", () => {
  const files = walkSourceFiles(SRC_ROOT);
  const fileContents = new Map<string, string>(files.map((file) => [file, fs.readFileSync(file, "utf-8")]));
  const cssText = fs.readFileSync(CSS_PATH, "utf-8");

  describe("canary: hasClassReference actually detects, and does not over-match (a broken regex must not silently report clean)", () => {
    it("finds every surviving/new class in page.module.css", () => {
      for (const cls of SURVIVING_CLASSES) {
        expect(hasClassReference(cssText, cls), `expected ".${cls}" to be found in page.module.css`).toBe(true);
      }
    });

    it("does not spuriously report a class name that has never existed", () => {
      expect(hasClassReference(cssText, "thisClassNameHasNeverExisted")).toBe(false);
    });

    it("does not cross-match a shorter class name against a longer one sharing its prefix", () => {
      const fixture = ".bulkBtnPrimary { color: red; }";
      expect(hasClassReference(fixture, "bulkBtn")).toBe(false);
      expect(hasClassReference(fixture, "bulkBtnPrimary")).toBe(true);
    });

    it("detects a property-access reference regardless of the local binding name", () => {
      const fixture = 'const x = <span className={weirdLocalBindingName.bulkClear} />;';
      expect(hasClassReference(fixture, "bulkClear")).toBe(true);
    });

    it("walks a plausible number of source files (floor set well below the real count so this does not churn as files come and go, but a walker that silently returns [] still fails loudly)", () => {
      expect(files.length).toBeGreaterThan(500);
    });
  });

  describe("the nine dead classes have zero references anywhere in src/** (AC6)", () => {
    it.each(DELETED_CLASSES)("no source file references .%s", (className) => {
      const failures: string[] = [];
      for (const [file, content] of fileContents) {
        if (hasClassReference(content, className)) {
          failures.push(path.relative(process.cwd(), file));
        }
      }
      expect(
        failures,
        `Found live reference(s) to deleted class ".${className}" in: ${failures.join(", ")}. ` +
          `AC6 requires this class stay deleted from page.module.css - if a new use case genuinely needs a raw-` +
          `<button> bulk control, AC5 requires MUI instead, not resurrecting this class.`
      ).toEqual([]);
    });

    it("page.module.css itself no longer defines any of the nine classes", () => {
      const failures = DELETED_CLASSES.filter((cls) => hasClassReference(cssText, cls));
      expect(failures).toEqual([]);
    });
  });

  describe("the surviving and newly-added classes are still defined in page.module.css", () => {
    it.each(SURVIVING_CLASSES)(".%s is defined", (className) => {
      expect(hasClassReference(cssText, className), `expected ".${className}" to be defined in page.module.css`).toBe(
        true
      );
    });
  });

  it("keeps .bulkBarHead's --focus-ring-color override intact (focusRing.wiring.test.ts:543-549 pins this exact selector's contrast against --navy; .bulkBarHead sits between the two largest deletion ranges in this file and must survive both)", () => {
    const match = cssText.match(/\.bulkBarHead\s*\{[^}]*\}/);
    expect(match, ".bulkBarHead block not found in page.module.css").toBeTruthy();
    expect(match![0]).toContain("--focus-ring-color");
    expect(match![0]).toContain("--focus-ring-on-navy");
  });
});
