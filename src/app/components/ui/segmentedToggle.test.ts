// docs/recording-controls-ux-acceptance-criteria.md CC4/section 6. Nothing
// renders in this repo (vitest is node-env and collects only
// src/**/*.test.ts), so `optionLabel` is pinned as a pure function and the
// component's accessibility contract is pinned as source text - the same
// idiom knowledgeBulkBar.wiring.test.ts and AddKnowledgePages.test.ts use
// (stripComments, indexOf-bounded slices, "SABOTAGE TARGET" labels on
// anything worth deliberately breaking to prove the test is live).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { optionLabel, nextEnabledIndex, type SegmentedToggleOption } from "./SegmentedToggle";

describe("optionLabel", () => {
  it("renders the bare label when count is undefined", () => {
    expect(optionLabel({ value: "a", label: "All" })).toBe("All");
  });

  it("renders \" (N)\" when count is a number, including 0", () => {
    expect(optionLabel({ value: "a", label: "All", count: 0 })).toBe("All (0)");
    expect(optionLabel({ value: "a", label: "Pending", count: 12 })).toBe("Pending (12)");
  });
});

describe("nextEnabledIndex - the pure walk behind arrow keys and Home/End", () => {
  const opt = (value: string, disabled = false): SegmentedToggleOption<string> => ({ value, label: value, disabled });

  it("ArrowRight steps to the very next option when it is enabled", () => {
    const options = [opt("a"), opt("b"), opt("c")];
    expect(nextEnabledIndex(options, 0, 1)).toBe(1);
  });

  it("ArrowLeft steps to the previous option when it is enabled", () => {
    const options = [opt("a"), opt("b"), opt("c")];
    expect(nextEnabledIndex(options, 2, -1)).toBe(1);
  });

  it("SABOTAGE TARGET: ArrowRight skips over a disabled option instead of dead-ending on it", () => {
    const options = [opt("a"), opt("b", true), opt("c")];
    expect(nextEnabledIndex(options, 0, 1)).toBe(2);
  });

  it("SABOTAGE TARGET: ArrowLeft skips over a disabled option instead of dead-ending on it", () => {
    const options = [opt("a"), opt("b", true), opt("c")];
    expect(nextEnabledIndex(options, 2, -1)).toBe(0);
  });

  it("ArrowRight wraps past the end to the first enabled option", () => {
    const options = [opt("a"), opt("b"), opt("c")];
    expect(nextEnabledIndex(options, 2, 1)).toBe(0);
  });

  it("ArrowLeft wraps past the start to the last enabled option", () => {
    const options = [opt("a"), opt("b"), opt("c")];
    expect(nextEnabledIndex(options, 0, -1)).toBe(2);
  });

  it("wrapping still skips a disabled option at the wrap boundary", () => {
    const options = [opt("a", true), opt("b"), opt("c")];
    expect(nextEnabledIndex(options, 2, 1)).toBe(1);
  });

  it("Home (from -1, delta 1) lands on the first enabled option, skipping a disabled leading option", () => {
    const options = [opt("a", true), opt("b"), opt("c")];
    expect(nextEnabledIndex(options, -1, 1)).toBe(1);
  });

  it("End (from options.length, delta -1) lands on the last enabled option, skipping a disabled trailing option", () => {
    const options = [opt("a"), opt("b"), opt("c", true)];
    expect(nextEnabledIndex(options, options.length, -1)).toBe(1);
  });

  it("SABOTAGE TARGET: every option disabled returns -1 rather than dead-ending on an arbitrary index", () => {
    const options = [opt("a", true), opt("b", true)];
    expect(nextEnabledIndex(options, 0, 1)).toBe(-1);
    expect(nextEnabledIndex(options, -1, 1)).toBe(-1);
    expect(nextEnabledIndex(options, options.length, -1)).toBe(-1);
  });

  it("an empty options array returns -1", () => {
    expect(nextEnabledIndex([], 0, 1)).toBe(-1);
  });

  it("a single enabled option returns itself when everything else is disabled around it", () => {
    const options = [opt("a", true), opt("b"), opt("c", true)];
    expect(nextEnabledIndex(options, 1, 1)).toBe(1);
    expect(nextEnabledIndex(options, 1, -1)).toBe(1);
  });
});

const SOURCE_PATH = join(process.cwd(), "src/app/components/ui/SegmentedToggle.tsx");
const source = readFileSync(SOURCE_PATH, "utf8");

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("stripComments (canary first)", () => {
  it("removes a // comment but leaves real code alone", () => {
    const fixture = ["// aria-pressed used to live here", "const x = <button aria-pressed />;"].join("\n");
    const stripped = stripComments(fixture);
    expect(stripped).not.toContain("used to live here");
    expect(stripped).toContain("<button aria-pressed />");
  });
});

describe("SegmentedToggle.tsx - CC4's accessibility contract, pinned as source text", () => {
  const stripped = stripComments(source);

  it("SABOTAGE TARGET: renders native <button type=\"button\"> segments, never a MUI Button, inside a role=\"group\" wrapper", () => {
    expect(stripped).toMatch(/<button[\s\S]*?type="button"/);
    expect(stripped).not.toMatch(/<Button/);
    expect(stripped).toMatch(/role="group"/);
  });

  it("every segment carries aria-pressed keyed to the selected option", () => {
    expect(stripped).toMatch(/aria-pressed=\{selected\}/);
  });

  it("the group uses aria-labelledby when showLabel is true, and aria-label otherwise (never both unconditionally)", () => {
    expect(stripped).toMatch(/aria-labelledby=\{showLabel \? labelId : undefined\}/);
    expect(stripped).toMatch(/aria-label=\{showLabel \? undefined : label\}/);
  });

  it("showLabel renders a visible label via the page.module.css .ghMeta class, with an id the group points at", () => {
    expect(stripped).toMatch(/styles\.ghMeta/);
    expect(stripped).toMatch(/id=\{labelId\}/);
  });

  it("SABOTAGE TARGET: exactly one segment is tabIndex 0 - computed from the selected option, or the first enabled one if none is selected - never a static 0 on every segment", () => {
    expect(stripped).toMatch(/tabbableIndex = selectedIndex !== -1 \? selectedIndex : firstEnabledIndex/);
    expect(stripped).toMatch(/tabIndex=\{index === tabbableIndex \? 0 : -1\}/);
    expect(stripped).not.toMatch(/tabIndex=\{0\}\s*\n?\s*(disabled|aria-pressed)/);
  });

  it("ArrowLeft/ArrowRight/Home/End all move focus AND select (not just move)", () => {
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      expect(stripped).toContain(`"${key}"`);
    }
    // The same handler that computes nextIndex for every key ends in a call
    // that both focuses AND calls onChange - selectAndFocus does both, so
    // pinning that one call is reached from the keydown handler is enough
    // to prove selection (not just focus movement) happens on arrow keys.
    expect(stripped).toMatch(/selectAndFocus\(nextIndex\)/);
    expect(stripped).toMatch(/buttonRefs\.current\[index\]\?\.focus\(\)/);
    expect(stripped).toMatch(/onChange\(option\.value\)/);
  });

  it("V is generic over string | number (SPEED_RATES is numeric)", () => {
    expect(stripped).toMatch(/V extends string \| number/);
  });
});
