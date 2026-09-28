// A40 disclosure half (docs/a40-disclosure-test-notes.md). Covers R3 (the
// origin written is the scope the rubric ACTUALLY came from), R3g (the
// handleFileSelect callsite, read as SOURCE TEXT - nothing under vitest
// here renders a component), R4 (the no-rubric state renders and there is
// ONE humaniser), R4i (the disclosure adds no table column) and R5 (zero
// added interactions, RULING 100).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  resolveRubricOriginScope,
  describeDropRubricOrigin,
  FROZEN_NO_RUBRIC,
  FROZEN_RUBRIC_ORIGIN_UNKNOWN,
} from "./rubric-origin";

const PANEL_SOURCE = fs.readFileSync(
  path.join(process.cwd(), "src/app/components/CartridgeDropPanel.tsx"),
  "utf8"
);

const ORIGIN_MODULE_SOURCE = fs.readFileSync(path.join(__dirname, "rubric-origin.ts"), "utf8");

// ---------------------------------------------------------------------------
// R3: the 11-case oracle. C4 is labelled NON-DISCRIMINATING (section 3 of the
// notes): the restored scope and the current scope are identical strings, so
// every mutant that returns either one passes it.
// ---------------------------------------------------------------------------

type Case = {
  name: string;
  input: Parameters<typeof resolveRubricOriginScope>[0];
  expected: string | null;
};

const CASES: Case[] = [
  { name: "C1", input: { rubricText: null, currentScope: "cartridge:CS101|HW2", restored: null, sniffedRubric: null, archiveName: "hw2.zip" }, expected: null },
  { name: "C2", input: { rubricText: "", currentScope: "cartridge:CS101|HW2", restored: null, sniffedRubric: null, archiveName: "hw2.zip" }, expected: null },
  { name: "C3", input: { rubricText: "TYPED", currentScope: "cartridge:CS101|HW2", restored: null, sniffedRubric: null, archiveName: "hw2.zip" }, expected: "cartridge:CS101|HW2" },
  // C4: NON-DISCRIMINATING (restored scope === currentScope; every mutant
  // that returns either one passes). Kept as a regression anchor only.
  { name: "C4", input: { rubricText: "R", currentScope: "cartridge:CS101|HW2", restored: { rubric: "R", scope: "cartridge:CS101|HW2" }, sniffedRubric: null, archiveName: "hw2.zip" }, expected: "cartridge:CS101|HW2" },
  { name: "C5", input: { rubricText: "R", currentScope: "cartridge:CS101|HW2", restored: { rubric: "R", scope: "cartridge:CS101|HW1" }, sniffedRubric: null, archiveName: "hw2.zip" }, expected: "cartridge:CS101|HW1" },
  { name: "C6", input: { rubricText: "MINE", currentScope: "cartridge:CS101|HW2", restored: { rubric: "R", scope: "cartridge:CS101|HW1" }, sniffedRubric: null, archiveName: "hw2.zip" }, expected: "cartridge:CS101|HW2" },
  { name: "C7", input: { rubricText: "FROMZIP", currentScope: "cartridge:CS101|HW2", restored: null, sniffedRubric: "FROMZIP", archiveName: "hw2.zip" }, expected: "upload:hw2.zip" },
  { name: "C8", input: { rubricText: "R", currentScope: "cartridge:CS101|HW2", restored: { rubric: "R", scope: "cartridge:CS101|HW1" }, sniffedRubric: "FROMZIP", archiveName: "hw2.zip" }, expected: "cartridge:CS101|HW1" },
  { name: "C9", input: { rubricText: "TYPED", currentScope: "", restored: null, sniffedRubric: null, archiveName: "hw2.zip" }, expected: null },
  { name: "C10", input: { rubricText: null, currentScope: "cartridge:CS101|HW2", restored: { rubric: "R", scope: "cartridge:CS101|HW1" }, sniffedRubric: null, archiveName: "hw2.zip" }, expected: null },
  { name: "C11", input: { rubricText: "", currentScope: "cartridge:CS101|HW2", restored: { rubric: "R", scope: "cartridge:CS101|HW2" }, sniffedRubric: null, archiveName: "hw2.zip" }, expected: null },
];

describe("R3: resolveRubricOriginScope, 11-case oracle", () => {
  for (const c of CASES) {
    it(`${c.name} -> ${JSON.stringify(c.expected)}`, () => {
      expect(resolveRubricOriginScope(c.input)).toBe(c.expected);
    });
  }
});

// ---------------------------------------------------------------------------
// R3g: the handleFileSelect callsite, as SOURCE TEXT. Two positive identifier
// pins plus a uniqueness assertion - no denylist.
// ---------------------------------------------------------------------------

describe("R3g: the resolveRubricOriginScope callsite in CartridgeDropPanel.tsx", () => {
  const start = PANEL_SOURCE.indexOf("resolveRubricOriginScope(");
  const end = PANEL_SOURCE.indexOf("saveCartridgeDrop(", start);
  const block = start > -1 && end > start ? PANEL_SOURCE.slice(start, end) : "";

  it("R3g-1: both anchors resolve, in order (a check over -1 proves nothing)", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("R3g-2: the slice is a call, not most of the file", () => {
    expect(block.length).toBeGreaterThan(0);
    expect(block.length).toBeLessThan(2000);
  });

  it("R3g-3: there is exactly one restored: argument in the block", () => {
    expect((block.match(/\brestored:/g) ?? []).length).toBe(1);
  });

  it("R3g-4: the restored: argument is the retained ref", () => {
    expect(block).toMatch(/restored:\s*lastRestoredRubricRef\.current\s*,/);
  });

  it("R3g-5: the currentScope: argument is saveScope", () => {
    expect(block).toMatch(/currentScope:\s*saveScope\s*,/);
  });
});

describe("R3h: saveScope still reaches saveRubricMemory unchanged (regression canary, not TDD-red)", () => {
  const start = PANEL_SOURCE.indexOf("const saveScope = cartridgeRubricScope(");
  const end = PANEL_SOURCE.indexOf("saveCartridgeDrop(", start);
  const block = start > -1 && end > start ? PANEL_SOURCE.slice(start, end) : "";

  it("both anchors resolve, in order", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it("saveRubricMemory is still called with RUBRIC_MEMORY_STORAGE_KEY and saveScope", () => {
    expect(block).toMatch(/saveRubricMemory\(RUBRIC_MEMORY_STORAGE_KEY,\s*saveScope,/);
  });
});

// ---------------------------------------------------------------------------
// RULING 121 (BL1): the CONSUMER callsite, pinned the same way R3g pins the
// PRODUCER callsite - a block-anchored slice with a both-ends validity
// check, so the disclosure <p> cannot be deleted (with its import dropped
// to keep no-unused-vars quiet) while every other panel-reading clause in
// this item stays green. Anchored on the drops-table row's course/
// assignment cell ({drop.courseLabel}, unique in this file - verified by
// R-CONSUMER-1 below, not assumed), ending at that cell's own closing </td>.
// ---------------------------------------------------------------------------

describe("RULING 121 (BL1): the describeDropRubricOrigin consumer callsite in the drops table row", () => {
  const start = PANEL_SOURCE.indexOf("{drop.courseLabel}");
  const end = PANEL_SOURCE.indexOf("</td>", start);
  const block = start > -1 && end > start ? PANEL_SOURCE.slice(start, end) : "";

  it("R-CONSUMER-1: both anchors resolve, in order, and {drop.courseLabel} is unique in the file (a check over -1 proves nothing)", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(PANEL_SOURCE.indexOf("{drop.courseLabel}", start + 1)).toBe(-1);
  });

  it("R-CONSUMER-2: the slice is one table cell, not most of the file", () => {
    expect(block.length).toBeGreaterThan(0);
    expect(block.length).toBeLessThan(400);
  });

  it("R-CONSUMER-3: the slice calls describeDropRubricOrigin(drop.rubricOriginScope, ...) exactly once", () => {
    const matches = block.match(/describeDropRubricOrigin\(\s*drop\.rubricOriginScope\s*,/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it("R-CONSUMER-4: the render reads .text off that call, inside a rendered element (not merely referenced)", () => {
    expect(block).toMatch(/describeDropRubricOrigin\([\s\S]*?\)\.text/);
    expect(block).toMatch(/<p[^>]*>[\s\S]*describeDropRubricOrigin/);
  });
});

// ---------------------------------------------------------------------------
// R4: describeDropRubricOrigin - THREE states (RULING 120), not two: no
// rubric, rubric with a known origin, rubric with an unrecorded origin
// (every pre-migration row, plus the C9 path where the course/assignment
// labels are blank at upload time). rubricPresent is the second argument.
// ---------------------------------------------------------------------------

describe("R4: describeDropRubricOrigin", () => {
  it("R4a/R4b: no rubric text is the FROZEN no-rubric literal, and present is false (regardless of originScope)", () => {
    const result = describeDropRubricOrigin(null, false);
    expect(result.text).toBe(FROZEN_NO_RUBRIC);
    expect(result.present).toBe(false);
  });

  // RULING 120 state 3: rubric text present, origin not recorded. This is
  // the pre-migration shape and the C9 shape - the precondition for
  // FROZEN_NO_RUBRIC is now rubricPresent, not originScope, so this must NOT
  // collapse onto the no-rubric sentence.
  it("R4a2: rubric text present with no recorded origin is the FROZEN unknown-origin literal, and present is true", () => {
    const result = describeDropRubricOrigin(null, true);
    expect(result.text).toBe(FROZEN_RUBRIC_ORIGIN_UNKNOWN);
    expect(result.present).toBe(true);
    expect(result.text).not.toBe(FROZEN_NO_RUBRIC);
  });

  it("R4c: every scoped input, with rubric text present, is present", () => {
    for (const scope of ["cartridge:CS101|HW1", "cartridge:CS101|HW2", "upload:hw2.zip"]) {
      expect(describeDropRubricOrigin(scope, true).present).toBe(true);
    }
  });

  // R4d is NON-DISCRIMINATING on its own: with rubricPresent=true the
  // FROZEN_NO_RUBRIC branch is structurally unreachable (see the function's
  // own if/else), so no single-string-swap mutant on the scoped text can
  // make this fail without also failing R4e/R4j. Kept as the explicit
  // statement of "distinguishable", per MI4's labelling rule - unchanged by
  // RULING 120, since the three-state branch does not alter why this one is
  // non-discriminating.
  it("R4d (non-discriminating on its own; see R4e/R4j): no scoped output collapses onto the no-rubric sentence", () => {
    for (const scope of ["cartridge:CS101|HW1", "cartridge:CS101|HW2", "upload:hw2.zip"]) {
      expect(describeDropRubricOrigin(scope, true).text).not.toBe(FROZEN_NO_RUBRIC);
    }
  });

  // R4e: FROZEN LITERAL humanisations, written out here - never computed
  // with the implementation's own humaniser (that would make this a
  // tautology; MINOR-4's correction).
  it("R4e: each scope's text contains its frozen humanised rendering", () => {
    const frozen: Record<string, string> = {
      "cartridge:CS101|HW1": "CS101 / HW1",
      "cartridge:CS101|HW2": "CS101 / HW2",
      "upload:hw2.zip": 'your upload of "hw2.zip"',
    };
    for (const [scope, expectedSubstring] of Object.entries(frozen)) {
      expect(describeDropRubricOrigin(scope, true).text).toContain(expectedSubstring);
    }
  });

  // R4f: duplicate at the copy level - discriminates M-B only through R3e /
  // the R3 case table (C5, C8). Kept as an explicit statement, not banked as
  // an independent kill.
  it("R4f (non-discriminating at this level; see R3 C5/C8): the fallback names HW1, not HW2", () => {
    const text = describeDropRubricOrigin("cartridge:CS101|HW1", true).text;
    expect(text).toContain("HW1");
    expect(text).not.toContain("HW2");
  });

  // R4g: NON-DISCRIMINATING. Kept as a cheap anchor only - it is the
  // assertion that let MUT_P and MUT_Q through in round 1. Now five outputs:
  // the two rubric-absent/unrecorded-origin states plus the three scoped
  // ones.
  it("R4g (non-discriminating; kept as a cheap anchor): the five outputs are pairwise distinct", () => {
    const outputs = [
      describeDropRubricOrigin(null, false).text,
      describeDropRubricOrigin(null, true).text,
      describeDropRubricOrigin("cartridge:CS101|HW1", true).text,
      describeDropRubricOrigin("cartridge:CS101|HW2", true).text,
      describeDropRubricOrigin("upload:hw2.zip", true).text,
    ];
    expect(new Set(outputs).size).toBe(5);
  });

  // R4h: an IDENTITY, not a comparison (RULING 115) - a function cannot
  // disagree with itself. Its discriminating partner is R4j below.
  it("R4h (identity, not discriminating on its own): the origin module imports the humaniser from rubric-memory", () => {
    expect(ORIGIN_MODULE_SOURCE).toMatch(/from "\.\/rubric-memory"/);
    expect(ORIGIN_MODULE_SOURCE).toMatch(/\bdescribeRubricScope\b/);
  });

  // R4j: the discriminator. The real humaniser's cartridge branch is
  // greedy on the first group, so a course label containing "|" absorbs the
  // inner bar. A second, independent parse will not reproduce this quirk.
  it("R4j: a course label containing a bar renders via the greedy first group", () => {
    expect(describeDropRubricOrigin("cartridge:A|B|C", true).text).toContain("A|B / C");
  });
});

// ---------------------------------------------------------------------------
// R4i: the disclosure adds no table column - both <th> and <td> counts stay
// at 5, and the two counts stay equal.
// ---------------------------------------------------------------------------

describe("R4i: the drops table gains no column", () => {
  it("exactly 5 <th> and exactly 5 <td>, and the two counts are equal", () => {
    const thCount = (PANEL_SOURCE.match(/<th[>\s]/g) ?? []).length;
    const tdCount = (PANEL_SOURCE.match(/<td[>\s]/g) ?? []).length;
    expect(thCount).toBe(5);
    expect(tdCount).toBe(5);
    expect(thCount).toBe(tdCount);
  });
});

// ---------------------------------------------------------------------------
// R5 (RULING 100): zero added interactions. A source-text proxy, labelled as
// such - a click count is a rendered-UI property no test here can measure.
// ---------------------------------------------------------------------------

describe("R5: zero added interactions (source-text proxy; see A40-D1)", () => {
  const FROZEN_ON_HANDLERS: Record<string, number> = { onChange: 6, onClick: 4 };
  const FROZEN_STYLE_CLASS_COUNT = 14;

  // RULING 123 MA1: R5b's own framing claimed it catches "any NEW token, of
  // any kind ... rather than a list of banned things", but the shipped
  // instrument was a four-name enumeration - a native <details>/<summary>
  // disclosure (which adds a click, the exact thing RULING 100 forbids) is
  // outside that list and passes it. The fix is a KIND change: tally EVERY
  // "<Identifier" token in the source (the check's own suggested regex),
  // which also catches the file's few TS-generic angle-bracket tokens
  // (useState<CartridgeDrop[]>, useRef<HTMLInputElement>, etc.) and one
  // angle-bracket pair inside a comment (":34, "cartridge:<course>|
  // <assignment>") - that is over-inclusive relative to "JSX tag" in name
  // only; it makes the instrument MORE sensitive, never less, because any
  // one of those tokens changing also fails the test. A denylist can never
  // do that; a multiset of everything can.
  const FROZEN_ALL_ANGLE_TOKENS: Record<string, number> = {
    course: 1,
    assignment: 1,
    CartridgeDrop: 1,
    string: 5,
    WorkflowTrigger: 1,
    HTMLInputElement: 2,
    div: 16,
    h2: 1,
    p: 15,
    label: 6,
    TextField: 5,
    MenuItem: 4,
    input: 1,
    Button: 4,
    span: 2,
    table: 1,
    thead: 1,
    tr: 2,
    th: 5,
    tbody: 1,
    td: 5,
  };

  it("R5a: the exact multiset of on[A-Z]...= handlers matches the frozen set", () => {
    const found = PANEL_SOURCE.match(/\bon[A-Z][A-Za-z]*=/g) ?? [];
    const tally: Record<string, number> = {};
    for (const raw of found) {
      const name = raw.slice(0, -1);
      tally[name] = (tally[name] ?? 0) + 1;
    }
    expect(tally).toEqual(FROZEN_ON_HANDLERS);
  });

  it("R5b: the exact multiset of EVERY <Identifier token (JSX tags and TS generics alike) matches the frozen set - a new token of any kind, including <details>/<summary>, fails this", () => {
    const found = PANEL_SOURCE.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? [];
    const tally: Record<string, number> = {};
    for (const raw of found) {
      const name = raw.slice(1);
      tally[name] = (tally[name] ?? 0) + 1;
    }
    expect(tally).toEqual(FROZEN_ALL_ANGLE_TOKENS);
  });

  it("R5b-mutation-witness: adding a <details><summary> disclosure changes the tally (proof the instrument now sees it)", () => {
    const mutated = PANEL_SOURCE.replace(
      "{sniffHint && <p className={styles.fieldHint}>{sniffHint}</p>}",
      "{sniffHint && <details><summary>{sniffHint}</summary></details>}"
    );
    expect(mutated).not.toBe(PANEL_SOURCE);
    const found = mutated.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? [];
    const tally: Record<string, number> = {};
    for (const raw of found) {
      const name = raw.slice(1);
      tally[name] = (tally[name] ?? 0) + 1;
    }
    expect(tally).not.toEqual(FROZEN_ALL_ANGLE_TOKENS);
  });

  // Shipped as a cardinality check only (found.size === 14), which a
  // same-count swap (drop one class, add a different one) would pass. The
  // notes specify SET membership, not a count, so this asserts the actual
  // frozen 14 names, not merely their number.
  const FROZEN_STYLE_CLASSES = [
    "styles.card",
    "styles.courseScheduleTable",
    "styles.error",
    "styles.field",
    "styles.fieldHint",
    "styles.fileField",
    "styles.form",
    "styles.ghBadgeAccent",
    "styles.ghBadgeDanger",
    "styles.ghBadgeSuccess",
    "styles.ghBadgeWarning",
    "styles.loadingState",
    "styles.loadingTitle",
    "styles.spinner",
  ];

  it("R5c: the styles.* class names used are exactly the frozen set of 14 (set membership, not just a count)", () => {
    const found = new Set(PANEL_SOURCE.match(/styles\.[A-Za-z0-9_]*/g) ?? []);
    expect(found.size).toBe(FROZEN_STYLE_CLASS_COUNT);
    expect([...found].sort()).toEqual([...FROZEN_STYLE_CLASSES].sort());
  });
});
