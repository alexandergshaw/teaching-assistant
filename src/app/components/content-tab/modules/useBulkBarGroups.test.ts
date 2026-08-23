// useBulkBarGroups.ts + BulkBarGroup.tsx
// (docs/bulk-bar-reorganization-acceptance-criteria.md, AC2/AC3, section
// 3b/D1-D3).
//
// vitest here is node-environment and collects only src/**/*.test.ts
// (vitest.config.ts) - NO component is ever rendered. This file cannot
// exercise BulkBarGroup.tsx's JSX, mount a <details>, click a <summary>, or
// observe a real DOM's accessibility tree. It tests two things instead:
//
// 1. What IS reachable in a node environment: bulkBarGroupsKey (a pure
//    string function) and resolveBulkBarGroupsStored (a pure parser that
//    never touches `window`) - the read-on-init/write-on-change EFFECT
//    itself is unexercisable here for the same reason scriptMinutesKey's own
//    doc comment gives for its sibling (useLmsGeneration.ts): no `window` in
//    this test environment.
// 2. BulkBarGroup.tsx as TEXT - the same source-text idiom
//    ModulesHeaderBar.wiring.test.ts and bulkItemsSection.rubricSource.wiring.test.ts
//    use for a component this suite cannot render. Comments are stripped
//    first (this file's own header comments legitimately discuss the exact
//    patterns being pinned - `{open &&`, `title=`, `role="group"` - and must
//    never satisfy an assertion meant to be about real code), and a canary
//    test proves the stripping actually removes something, so a silently
//    broken strip cannot make every other assertion pass vacuously.
//
// Every assertion below pins a FACT and, where order matters, an ORDERING -
// never exact wording - per docs/DEV_LOOP.md section 9's rule, re-stated in
// the acceptance criteria's own testing-reality section: this repo has been
// bitten twice by over-specified source-text tests, most recently in this
// same feature area.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { bulkBarGroupsKey, resolveBulkBarGroupsStored } from "./useBulkBarGroups";

describe("bulkBarGroupsKey", () => {
  it("is namespaced per course - two different courseUrls never share a key", () => {
    const a = bulkBarGroupsKey("https://canvas.example.edu/courses/1");
    const b = bulkBarGroupsKey("https://canvas.example.edu/courses/2");
    expect(a).not.toBe(b);
  });

  it("is a single ta- prefixed key, not one per group (AC3/D2: ONE key, not thirteen)", () => {
    const key = bulkBarGroupsKey("https://canvas.example.edu/courses/1");
    expect(key.startsWith("ta-")).toBe(true);
    expect(key).toBe("ta-modules-bulkbar-groups-https://canvas.example.edu/courses/1");
  });
});

describe("resolveBulkBarGroupsStored - the tolerant resolver (resolveScriptMinutes precedent)", () => {
  it("nothing stored (null) resolves to an empty map - the same as a genuinely first visit", () => {
    expect(resolveBulkBarGroupsStored(null)).toEqual({});
  });

  it("the empty string resolves to an empty map", () => {
    expect(resolveBulkBarGroupsStored("")).toEqual({});
  });

  it("a whitespace-only string resolves to an empty map", () => {
    expect(resolveBulkBarGroupsStored("   ")).toEqual({});
  });

  it("SABOTAGE TARGET: malformed JSON degrades to an empty map rather than throwing", () => {
    expect(() => resolveBulkBarGroupsStored("{not valid json")).not.toThrow();
    expect(resolveBulkBarGroupsStored("{not valid json")).toEqual({});
  });

  it("a JSON array (valid JSON, wrong shape) degrades to an empty map", () => {
    expect(resolveBulkBarGroupsStored("[true, false]")).toEqual({});
  });

  it("a bare JSON string (valid JSON, wrong shape) degrades to an empty map", () => {
    expect(resolveBulkBarGroupsStored('"items"')).toEqual({});
  });

  it("a bare JSON number (valid JSON, wrong shape) degrades to an empty map", () => {
    expect(resolveBulkBarGroupsStored("42")).toEqual({});
  });

  it("the JSON literal null degrades to an empty map", () => {
    expect(resolveBulkBarGroupsStored("null")).toEqual({});
  });

  it("an object with unknown ids is kept - an unrecognised key is inert, never read by isOpen, so there is nothing to protect against by dropping it", () => {
    expect(resolveBulkBarGroupsStored('{"notARealGroupId": true}')).toEqual({ notARealGroupId: true });
  });

  it("an object with non-boolean values drops only the offending entries, keeping any genuine boolean siblings", () => {
    expect(
      resolveBulkBarGroupsStored('{"items": "true", "content": 1, "grading": null, "modules": true}')
    ).toEqual({ modules: true });
  });

  it("round-trips a genuine id-to-boolean map unchanged", () => {
    const stored = JSON.stringify({ items: true, download: false, askAi: false });
    expect(resolveBulkBarGroupsStored(stored)).toEqual({ items: true, download: false, askAi: false });
  });
});

// ---------------------------------------------------------------------------
// BulkBarGroup.tsx as source text - see this file's own header for why.

const GROUP_PATH = join(process.cwd(), "src/app/components/content-tab/modules/BulkBarGroup.tsx");
const rawSource = readFileSync(GROUP_PATH, "utf8");

/** Block comments first, then whole-line `//` comments - the same two-step
 * strip ModulesHeaderBar.wiring.test.ts uses, and for the same reason: this
 * component's own header comments discuss `{open &&`, `title=` and
 * `role="group"` at length (as the things NOT to do / TO do), and none of
 * that prose may satisfy an assertion meant to be about real code. */
const code = rawSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("BulkBarGroup.tsx source-text canary", () => {
  it("comment-stripping actually removes something - proves the strip is not silently a no-op", () => {
    // The header comment block alone is longer than the whole stripped file
    // would be if stripping did nothing; a broken regex that failed to
    // strip anything would make `code` identical to `rawSource`.
    expect(code.length).toBeLessThan(rawSource.length);
    expect(rawSource).toMatch(/HARD RULE/);
    expect(code).not.toMatch(/HARD RULE/);
  });
});

describe("BulkBarGroup.tsx never gates its body on `open` (section 3b/D3 hard rule)", () => {
  it("SABOTAGE TARGET: no `{open &&` conditional anywhere in the real source", () => {
    expect(code).not.toMatch(/\{\s*open\s*&&/);
  });

  it("children are rendered unconditionally, not behind an `open &&` (or any `&&`) guard", () => {
    const occurrences = [...code.matchAll(/\{children\}/g)];
    expect(occurrences.length, "children is never referenced at all").toBeGreaterThan(0);
    for (const match of occurrences) {
      const before = code.slice(Math.max(0, (match.index ?? 0) - 30), match.index);
      expect(before).not.toMatch(/&&\s*$/);
    }
    // Independent of the exact `{children}` shape above: catches the same
    // defect even if it were written `{open && children}` (no closing
    // guard right before the literal substring `{children}` in that case,
    // since the substring itself becomes `open && children` without its own
    // leading brace).
    expect(code).not.toMatch(/open\s*&&\s*children/);
  });
});

describe("BulkBarGroup.tsx satisfies AC2 - a real accessible group, not a visual-only label", () => {
  // Step-10 finding 5 (fixer round): this used to branch between a
  // <details> and a plain <section> depending on `collapsible` - two
  // DIFFERENT element types, so a group whose tier could change at runtime
  // (visualizerCoverage: read-only before a scan, destructive after) had
  // React unmount and remount its whole subtree the instant `mayCollapse`
  // flipped, dropping focus. The fix unifies both cases onto ONE <details>
  // element (BulkBarGroup.tsx's own header comment has the full rationale),
  // so there is now exactly one `role="group"`/`aria-labelledby` pair in the
  // source, not one per branch - these two assertions are updated to match
  // that corrected, single-element architecture rather than the two-branch
  // shape that caused the bug.
  it('SABOTAGE TARGET: renders role="group" on its one, unified <details> element', () => {
    const matches = code.match(/role="group"/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("SABOTAGE TARGET: renders aria-labelledby, pointing at the group's own heading", () => {
    const labelledByMatches = code.match(/aria-labelledby=\{headingId\}/g) ?? [];
    expect(labelledByMatches.length).toBe(1);
    // The same id is actually assigned to an element, not just referenced -
    // otherwise aria-labelledby points at nothing.
    expect(code).toMatch(/id=\{headingId\}/);
  });

  it("SABOTAGE TARGET: renders exactly one host element (<details>), never a second <section>/<details> branch for the non-collapsible case", () => {
    const detailsOpenTags = [...code.matchAll(/<details\b/g)];
    const sectionOpenTags = [...code.matchAll(/<section\b/g)];
    expect(detailsOpenTags.length, "expected exactly one <details> element").toBe(1);
    expect(sectionOpenTags.length, "a <section> branch would reintroduce finding 5's element-type-switch bug").toBe(0);
  });
});

describe("BulkBarGroup.tsx surfaces an in-flight operation to assistive tech", () => {
  it("SABOTAGE TARGET: a colocated role=status aria-live=polite region when runtime.busy", () => {
    expect(code).toMatch(/runtime\.busy/);
    expect(code).toMatch(/role="status"/);
    expect(code).toMatch(/aria-live="polite"/);
  });
});

describe("BulkBarGroup.tsx renders consequenceTag as always-visible content (E3), never a title tooltip", () => {
  it("SABOTAGE TARGET: consequenceTag is referenced at all", () => {
    expect(code).toMatch(/consequenceTag/);
  });

  it("SABOTAGE TARGET: consequenceTag never appears inside a title attribute", () => {
    expect(code).not.toMatch(/title=(\{[^}]*consequenceTag[^}]*\}|"[^"]*consequenceTag[^"]*")/);
  });
});
