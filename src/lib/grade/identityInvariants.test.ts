import { describe, it, expect } from "vitest";
import { parseSubmissionFileName, groupSubmissionsByStudent, getBaseFileName } from "./utils";

/**
 * A44 wave 1 - the identity-key oracle (R13), the frozen fixture oracle
 * (R1), display uniqueness (R15/INVARIANT D) and the terminal pass's walk
 * order (R16), plus INVARIANT M (R14) over generated input.
 *
 * Per docs/a44-test-notes.md: "NO test in this repository asserts a grade
 * identity key" before this file, and a PARTIAL encoding (folding the
 * container-relative directory at the two stem-fallback sites only, leaving
 * steps 1-4 raw) changes NO display and NO row count on any of the 27
 * fixtures below - it is caught only by the KEY column (R13) and by
 * INVARIANT M over generated input (R14). Never derive a key assertion from
 * a display; the whole point of this file is that the two can diverge.
 *
 * Never import this file's fixture table from another *.test.ts, and this
 * file must not import fixtures from another *.test.ts either -
 * docs/loop/traps-tests.md: importing a helper from another test file
 * re-runs that file's own describe blocks under the wrong setup.
 */

// ---------------------------------------------------------------------------
// Section 1: the 27 frozen fixtures (docs/a44-test-notes.md section 1.3).
// Every key/display/rowsAfter/SPLIT/MERGE literal below is copied verbatim
// from that section's table - this file does not re-derive them, it checks
// the real code against them.
// ---------------------------------------------------------------------------

interface FixtureFile {
  path: string;
  owner: string;
  zipChain?: string[];
}

interface Fixture {
  id: string;
  files: FixtureFile[];
  expectedKeys: string[];
  expectedDisplays: string[];
  expectedRowsAfter: number;
  expectedSplit: number;
  expectedMerge: number;
}

const FIXTURES: Fixture[] = [
  {
    id: "F1",
    files: [
      { path: "johnsmith_1001_0_report.docx", owner: "SmithA" },
      { path: "johnsmith_1002_0_report.docx", owner: "SmithB" },
    ],
    expectedKeys: ["9:johnsmith", "9:johnsmith"],
    expectedDisplays: ["johnsmith"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "F2",
    files: [
      { path: "janedoe_2024-01-01_120000_report.docx", owner: "JaneDoe" },
      { path: "janedoe_2024-01-02_120000_report.docx", owner: "JaneDoe" },
    ],
    expectedKeys: ["7:janedoe", "7:janedoe"],
    expectedDisplays: ["janedoe"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 1,
  },
  {
    id: "F3",
    files: [
      { path: "AlvarezMaria/essay.txt", owner: "AlvarezMaria" },
      { path: "BrownTom/essay.txt", owner: "BrownTom" },
      { path: "ChenLi/essay.txt", owner: "ChenLi" },
    ],
    expectedKeys: ["12:alvarezmaria5:essay", "8:browntom5:essay", "6:chenli5:essay"],
    expectedDisplays: ["AlvarezMaria/essay", "BrownTom/essay", "ChenLi/essay"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "F4",
    files: [
      { path: "Homework Final.docx", owner: "A" },
      { path: "Homework Draft.docx", owner: "B" },
    ],
    expectedKeys: ["8:homework", "8:homework"],
    expectedDisplays: ["Homework"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "F5",
    files: [
      { path: "alvarezmaria_2024-01-01_120000_essay.docx", owner: "AlvarezMaria" },
      { path: "browntom_2024-01-01_120000_essay.docx", owner: "BrownTom" },
      { path: "README.txt", owner: "Readme" },
    ],
    expectedKeys: ["12:alvarezmaria", "8:browntom", "6:readme"],
    expectedDisplays: ["alvarezmaria", "browntom", "README"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "F6",
    files: [
      { path: "AlvarezMaria/Homework Final.docx", owner: "AlvarezMaria" },
      { path: "AlvarezMaria/Homework Draft.docx", owner: "AlvarezMaria" },
    ],
    expectedKeys: ["12:alvarezmaria8:homework", "12:alvarezmaria8:homework"],
    expectedDisplays: ["AlvarezMaria/Homework"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 1,
  },
  {
    id: "F7",
    files: [
      {
        path: "janedoe_2024-01-01_120000_project.zip/main.py",
        owner: "JaneDoe",
        zipChain: ["janedoe_2024-01-01_120000_project.zip"],
      },
      {
        path: "johndoe_2024-01-01_130000_project.zip/main.py",
        owner: "JohnDoe",
        zipChain: ["johndoe_2024-01-01_130000_project.zip"],
      },
    ],
    expectedKeys: ["7:janedoe", "7:johndoe"],
    expectedDisplays: ["janedoe", "johndoe"],
    expectedRowsAfter: 2,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "F8",
    files: [
      { path: "alvarezmaria_2024-01-01_120000_essay.docx", owner: "AlvarezMaria" },
      { path: "browntom_2024-01-01_120000_essay.docx", owner: "BrownTom" },
      { path: "ChenLi/reflection.docx", owner: "ChenLi" },
      { path: "DavisAnn/reflection.docx", owner: "DavisAnn" },
    ],
    expectedKeys: [
      "12:alvarezmaria",
      "8:browntom",
      "6:chenli10:reflection",
      "8:davisann10:reflection",
    ],
    expectedDisplays: [
      "alvarezmaria",
      "browntom",
      "ChenLi/reflection",
      "DavisAnn/reflection",
    ],
    expectedRowsAfter: 4,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "F9",
    files: [
      { path: "Essay.docx", owner: "A" },
      { path: "essay.docx", owner: "B" },
    ],
    expectedKeys: ["5:essay", "5:essay"],
    expectedDisplays: ["Essay"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "F10",
    files: [{ path: "essay.docx", owner: "A" }],
    expectedKeys: ["5:essay"],
    expectedDisplays: ["essay"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G1",
    files: [
      { path: "bulk.zip/AlvarezMaria/essay.txt", owner: "AlvarezMaria", zipChain: ["bulk.zip"] },
      { path: "bulk.zip/BrownTom/essay.txt", owner: "BrownTom", zipChain: ["bulk.zip"] },
      { path: "bulk.zip/ChenLi/essay.txt", owner: "ChenLi", zipChain: ["bulk.zip"] },
    ],
    expectedKeys: ["12:alvarezmaria4:bulk", "8:browntom4:bulk", "6:chenli4:bulk"],
    expectedDisplays: ["bulk/AlvarezMaria", "bulk/BrownTom", "bulk/ChenLi"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G2",
    files: [
      { path: "bulk.zip/AlvarezMaria/aessay.txt", owner: "AlvarezMaria", zipChain: ["bulk.zip"] },
      { path: "bulk.zip/BrownTom/bessay.txt", owner: "BrownTom", zipChain: ["bulk.zip"] },
    ],
    expectedKeys: ["12:alvarezmaria4:bulk", "8:browntom4:bulk"],
    expectedDisplays: ["bulk/AlvarezMaria", "bulk/BrownTom"],
    expectedRowsAfter: 2,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G3",
    files: [
      { path: "backend/config.py", owner: "Owner" },
      { path: "frontend/config.py", owner: "Owner" },
    ],
    expectedKeys: ["7:backend6:config", "8:frontend6:config"],
    expectedDisplays: ["backend/config", "frontend/config"],
    expectedRowsAfter: 2,
    expectedSplit: 1,
    expectedMerge: 0,
  },
  {
    id: "G4",
    files: [
      { path: "Submissions/essay.docx", owner: "A" },
      { path: "Submissions/essay.pdf", owner: "B" },
    ],
    expectedKeys: ["11:submissions5:essay", "11:submissions5:essay"],
    expectedDisplays: ["Submissions/essay"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G5",
    files: [
      { path: "AlvarezMaria/homework.txt", owner: "A" },
      { path: "BrownTom/homework.txt", owner: "B" },
      { path: "Shared/essay.docx", owner: "C" },
      { path: "Shared/essay.pdf", owner: "D" },
    ],
    expectedKeys: [
      "12:alvarezmaria8:homework",
      "8:browntom8:homework",
      "6:shared5:essay",
      "6:shared5:essay",
    ],
    expectedDisplays: ["AlvarezMaria/homework", "BrownTom/homework", "Shared/essay"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G6",
    files: [
      { path: "JohnSmith/report.docx", owner: "SmithA" },
      { path: "JohnSmith/report.pdf", owner: "SmithB" },
      { path: "AlvarezMaria/essay.txt", owner: "C" },
    ],
    expectedKeys: ["9:johnsmith6:report", "9:johnsmith6:report", "12:alvarezmaria5:essay"],
    expectedDisplays: ["AlvarezMaria/essay", "JohnSmith/report"],
    expectedRowsAfter: 2,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G7",
    files: [{ path: "src/otherfile.py", owner: "A" }],
    expectedKeys: ["3:src9:otherfile"],
    expectedDisplays: ["src/otherfile"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G8",
    files: [
      { path: "Submissions/AlvarezMaria/essay.txt", owner: "AlvarezMaria" },
      { path: "Submissions/BrownTom/essay.txt", owner: "BrownTom" },
    ],
    expectedKeys: ["24:submissions/alvarezmaria5:essay", "20:submissions/browntom5:essay"],
    expectedDisplays: ["Submissions/AlvarezMaria/essay", "Submissions/BrownTom/essay"],
    expectedRowsAfter: 2,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G9",
    files: [
      { path: "essay.txt", owner: "A" },
      { path: "essay.pdf", owner: "B" },
    ],
    expectedKeys: ["5:essay", "5:essay"],
    expectedDisplays: ["essay"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G10",
    files: [
      { path: "wrapA/janedoe_2024-01-01_120000_report.docx", owner: "JaneDoe" },
      { path: "wrapB/janedoe_2024-01-01_120000_report.docx", owner: "JaneDoe" },
    ],
    expectedKeys: ["7:janedoe", "7:janedoe"],
    expectedDisplays: ["janedoe"],
    expectedRowsAfter: 1,
    expectedSplit: 0,
    expectedMerge: 1,
  },
  {
    id: "G11",
    files: [
      { path: "Submissions/essay1.txt", owner: "A" },
      { path: "Submissions/essay2.txt", owner: "B" },
      { path: "Submissions/essay3.txt", owner: "C" },
    ],
    expectedKeys: [
      "11:submissions6:essay1",
      "11:submissions6:essay2",
      "11:submissions6:essay3",
    ],
    expectedDisplays: ["Submissions/essay1", "Submissions/essay2", "Submissions/essay3"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G12",
    files: [
      { path: "AlvarezMaria/homework.txt", owner: "A" },
      { path: "BrownTom/homework.txt", owner: "B" },
      { path: "essay.docx", owner: "C" },
      { path: "essay.pdf", owner: "D" },
    ],
    expectedKeys: ["12:alvarezmaria8:homework", "8:browntom8:homework", "5:essay", "5:essay"],
    expectedDisplays: ["AlvarezMaria/homework", "BrownTom/homework", "essay"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "G13",
    files: [
      { path: "x/_a::b.docx", owner: "A" },
      { path: "x::_a/b.docx", owner: "B" },
    ],
    expectedKeys: ["1:x5:_a::b", "5:x::_a1:b"],
    expectedDisplays: ["x::_a/b", "x/_a::b"],
    expectedRowsAfter: 2,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "K1",
    files: [
      { path: "AlvarezMaria/essay.docx", owner: "AlvarezMaria" },
      { path: " 12:alvarezmariaessay.docx", owner: "ForgerA" },
      { path: " 12:alvarezmaria5:essay.docx", owner: "ForgerB" },
      { path: "12:alvarezmaria5:essay_2026-09-01_120000_x.docx", owner: "ForgerC" },
    ],
    expectedKeys: [
      "12:alvarezmaria5:essay",
      "20:12:alvarezmariaessay",
      "22:12:alvarezmaria5:essay",
      "22:12:alvarezmaria5:essay",
    ],
    expectedDisplays: ["12:alvarezmaria5:essay", "12:alvarezmariaessay", "AlvarezMaria/essay"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "K2",
    files: [
      { path: "Submissions/AlvarezMaria/src/main.py", owner: "AlvarezMaria" },
      { path: "Submissions/AlvarezMaria/docs/r.txt", owner: "AlvarezMaria" },
      { path: "Submissions/BrownTom/src/main.py", owner: "BrownTom" },
      { path: "Submissions/BrownTom/docs/r.txt", owner: "BrownTom" },
    ],
    expectedKeys: [
      "28:submissions/alvarezmaria/src4:main",
      "29:submissions/alvarezmaria/docs1:r",
      "24:submissions/browntom/src4:main",
      "25:submissions/browntom/docs1:r",
    ],
    expectedDisplays: [
      "Submissions/AlvarezMaria/docs/r",
      "Submissions/AlvarezMaria/src/main",
      "Submissions/BrownTom/docs/r",
      "Submissions/BrownTom/src/main",
    ],
    expectedRowsAfter: 4,
    expectedSplit: 2,
    expectedMerge: 0,
  },
  {
    id: "K3",
    files: [
      { path: "JaneDoe.zip/src/deep/main.py", owner: "JaneDoeJ", zipChain: ["JaneDoe.zip"] },
      { path: "JaneDoe/src/deep.txt", owner: "OtherO" },
    ],
    expectedKeys: ["8:src/deep7:janedoe", "11:janedoe/src4:deep"],
    expectedDisplays: ["JaneDoe/src/deep", "JaneDoe/src/deep (2)"],
    expectedRowsAfter: 2,
    expectedSplit: 0,
    expectedMerge: 0,
  },
  {
    id: "K4",
    files: [
      { path: "JaneDoe.zip/src/deep/main.py", owner: "JaneDoeJ", zipChain: ["JaneDoe.zip"] },
      { path: "JaneDoe/src/deep.txt", owner: "OtherO" },
      { path: "JaneDoe/src/ deep (2).txt", owner: "ThirdT" },
    ],
    expectedKeys: ["8:src/deep7:janedoe", "11:janedoe/src4:deep", "11:janedoe/src8:deep (2)"],
    expectedDisplays: ["JaneDoe/src/deep", "JaneDoe/src/deep (2)", "JaneDoe/src/deep (3)"],
    expectedRowsAfter: 3,
    expectedSplit: 0,
    expectedMerge: 0,
  },
];

function buildRun(fixture: Fixture): {
  submissions: Record<string, string>;
  zipParents: Record<string, string[]>;
} {
  const submissions: Record<string, string> = {};
  const zipParents: Record<string, string[]> = {};
  for (const file of fixture.files) {
    // The content marker is the path itself - unique per file within a
    // fixture - so a row can be traced back to the paths it merged without
    // ever recovering by file NAME (two files here can share a bare leaf
    // name, e.g. G4's two "essay" files).
    submissions[file.path] = file.path;
    if (file.zipChain && file.zipChain.length > 0) {
      zipParents[file.path] = file.zipChain;
    }
  }
  return { submissions, zipParents };
}

function rowForPath(rows: ReturnType<typeof groupSubmissionsByStudent>, path: string) {
  const row = rows.find((r) => r.content.includes(path));
  if (!row) throw new Error(`path not found in any returned row: ${path}`);
  return row;
}

/** SPLIT: a declared owner whose files land in 2+ distinct rows. MERGE: a
 * declared owner with 2+ files whose files land in exactly one row. Computed
 * from the declared owner map alone, never from any implementation of the
 * parser - docs/a44-test-notes.md section 1.2. */
function splitAndMerge(
  fixture: Fixture,
  rows: ReturnType<typeof groupSubmissionsByStudent>
): { split: number; merge: number } {
  const rowsByOwner = new Map<string, Set<string>>();
  for (const file of fixture.files) {
    const row = rowForPath(rows, file.path);
    const set = rowsByOwner.get(file.owner) ?? new Set<string>();
    set.add(row.student);
    rowsByOwner.set(file.owner, set);
  }
  let split = 0;
  let merge = 0;
  for (const [owner, rowSet] of rowsByOwner) {
    const ownerFileCount = fixture.files.filter((f) => f.owner === owner).length;
    if (rowSet.size >= 2) split += 1;
    else if (ownerFileCount >= 2 && rowSet.size === 1) merge += 1;
  }
  return { split, merge };
}

describe("A44 identity-key oracle (R13) - the 27 frozen fixtures", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: parseSubmissionFileName's studentKey matches the frozen key array, in fixture order`, () => {
      const keys = fixture.files.map(
        (f) => parseSubmissionFileName(f.path, undefined, f.zipChain ?? []).studentKey
      );
      expect(keys).toEqual(fixture.expectedKeys);
    });
  }

  it("every step-1-4 key is length-prefixed - never a raw, unencoded key (what makes the encoding TOTAL, not partial)", () => {
    // F2, F5, F7, F8, G10 and K1 all have a step-1..4 resolution somewhere.
    // A partial encoding (steps 5/6 only) would leave these raw, e.g.
    // "janedoe" instead of "7:janedoe" - unchanged row count, unchanged
    // display, and this is the only assertion that would catch it.
    const raw = parseSubmissionFileName("janedoe_2024-01-01_120000_report.docx");
    expect(raw.studentKey).toBe("7:janedoe");
    expect(raw.studentKey).not.toBe("janedoe");
  });
});

describe("A44 frozen fixture oracle (R1) - rows, displays, SPLIT, MERGE", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: rowsAfter, the display array (in returned order), and displaysUnique`, () => {
      const { submissions, zipParents } = buildRun(fixture);
      const rows = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
      expect(rows).toHaveLength(fixture.expectedRowsAfter);
      const displays = rows.map((r) => r.student);
      expect(displays).toEqual(fixture.expectedDisplays);
      // INVARIANT D (R15): no two returned rows ever share a display.
      expect(new Set(displays).size).toBe(displays.length);
    });

    it(`${fixture.id}: SPLIT and MERGE against the declared-owner ground truth`, () => {
      const { submissions, zipParents } = buildRun(fixture);
      const rows = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
      const { split, merge } = splitAndMerge(fixture, rows);
      expect(split).toBe(fixture.expectedSplit);
      expect(merge).toBe(fixture.expectedMerge);
    });
  }
});

describe("A44 INVARIANT D (R15) - the terminal pass searches for the first UNCLAIMED label, not a counted suffix", () => {
  it("K4: a raw label that already looks like a counted suffix ('deep (2)') does not collide with a counting pass's own output", () => {
    const { submissions, zipParents } = buildRun(FIXTURES.find((f) => f.id === "K4")!);
    const rows = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(rows.map((r) => r.student)).toEqual([
      "JaneDoe/src/deep",
      "JaneDoe/src/deep (2)",
      "JaneDoe/src/deep (3)",
    ]);
  });

  it("K3: two distinct keys folding to the identical raw display are disambiguated by the terminal pass", () => {
    const { submissions, zipParents } = buildRun(FIXTURES.find((f) => f.id === "K3")!);
    const rows = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(rows.map((r) => r.student)).toEqual(["JaneDoe/src/deep", "JaneDoe/src/deep (2)"]);
  });
});

describe("A44 R16 - the terminal pass's walk order is identity-KEY order, not insertion order", () => {
  it("K3's two files get the same labels regardless of which one is inserted first", () => {
    const fixture = FIXTURES.find((f) => f.id === "K3")!;
    const forward = buildRun(fixture);
    const reversed = buildRun({ ...fixture, files: [...fixture.files].reverse() });

    const rowsForward = groupSubmissionsByStudent(
      forward.submissions,
      undefined,
      undefined,
      forward.zipParents
    );
    const rowsReversed = groupSubmissionsByStudent(
      reversed.submissions,
      undefined,
      undefined,
      reversed.zipParents
    );

    const labelForwardByPath = new Map(
      fixture.files.map((f) => [f.path, rowForPath(rowsForward, f.path).student])
    );
    const labelReversedByPath = new Map(
      fixture.files.map((f) => [f.path, rowForPath(rowsReversed, f.path).student])
    );

    for (const file of fixture.files) {
      expect(labelReversedByPath.get(file.path)).toBe(labelForwardByPath.get(file.path));
    }
  });
});

// ---------------------------------------------------------------------------
// Section 2: the generated sweep (docs/a44-test-notes.md section 1.4 / 0.8b),
// republished here in full so INVARIANT M and INVARIANT D are checked
// against generated input, not just the 27 hand-written fixtures - in
// particular the three FORGERY shapes, which are the only generated
// instrument that catches a partial encoding (docs/a44-waves.md section 8,
// "NEW, SILENT-GREEN 1").
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return function rnd() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STUDENTS = [
  "AlvarezMaria", "BrownTom", "ChenLi", "DavisAnn", "EvansJo", "FordKim",
  "GarciaLuz", "HallSam", "IvanovNik", "JonesPat", "KimDae", "LopezAna",
  "MurphyDev", "NguyenAn", "OkaforChi",
];
const STEMS = [
  "essay", "Essay Final", "Essay Draft", "Homework Final", "Homework Draft",
  "homework", "reflection", "Reflection Final", "report", "Report Draft",
  "paper", "Paper Final", "lab", "Lab Report", "midterm",
];
const EXTS = ["docx", "txt", "pdf", "md"];
const COMPONENTS = ["backend", "frontend", "docs", "src", "tests", "api", "web", "lib"];
const SEED = 20260927;

/** The 17 sweep shapes, docs/a44-test-notes.md section 1.4. Asserted as a
 * frozen set with its exact length below (the headless.test.ts idiom) so
 * dropping a shape is a visible test change, not a silent loss of coverage. */
const SWEEP_SHAPES = [
  "flat",
  "folder",
  "folder-resubmit",
  "convention",
  "convention-resubmit",
  "folder-distinct-stems",
  "shared-wrapper-folder",
  "single-student-multi-folder-shared-filename",
  "nested-bulk-perstudent-folders",
  "mixed-perstudent-plus-shared-dropbox",
  "duplicate-folder-name",
  "nested-perstudent-subdirs",
  "nested-shared-dropbox-subdirs",
  "flat-forgery",
  "flat-forgery-perpart",
  "conv-forgery",
  "crossstep-ambiguity",
];

/** Derives the crafted (forged) filename's base key exactly the way
 * docs/a44-test-notes.md section 0.8b specifies: `leafStemFallback`'s own
 * `/^([A-Za-z0-9]+)/`-then-`.trim()` logic, lowercased. This mirrors that
 * tiny regex ONLY to craft an adversarial input for the generator - the
 * actual identity computation under test is still the real, unmodified
 * `parseSubmissionFileName`. */
function deriveForgeryBaseKey(stem: string): string {
  const match = stem.match(/^([A-Za-z0-9]+)/);
  const base = (match?.[1] ?? stem).trim() || "unknown";
  return base.toLowerCase();
}

interface GeneratedFile {
  path: string;
  zipChain: string[];
}

function pathForShape(
  shape: string,
  i: number,
  owner: string,
  owners: string[],
  stem: string,
  ext: string,
  comp: string,
  prev: GeneratedFile | null
): GeneratedFile {
  switch (shape) {
    case "flat":
      return { path: `${stem}.${ext}`, zipChain: [] };
    case "folder":
    case "folder-resubmit":
      return { path: `${owner}/${stem}.${ext}`, zipChain: [] };
    case "convention":
    case "convention-resubmit":
      return {
        path: `${owner.toLowerCase()}_2026-09-0${(i % 9) + 1}_120${i}00_${stem}.${ext}`,
        zipChain: [],
      };
    case "folder-distinct-stems":
      return { path: `${owner}/${owner}-work.${ext}`, zipChain: [] };
    case "shared-wrapper-folder":
      return { path: `Submissions/${stem}.${ext}`, zipChain: [] };
    case "single-student-multi-folder-shared-filename":
      return { path: `${comp}/config.${ext}`, zipChain: [] };
    case "nested-bulk-perstudent-folders":
      return { path: `bulk.zip/${owner}/${stem}.${ext}`, zipChain: ["bulk.zip"] };
    case "mixed-perstudent-plus-shared-dropbox":
      return { path: `${i < 2 ? "Shared" : owner}/${stem}.${ext}`, zipChain: [] };
    case "duplicate-folder-name":
      return { path: `${i < 2 ? "JohnSmith" : owner}/${stem}.${ext}`, zipChain: [] };
    case "nested-perstudent-subdirs":
      return { path: `Submissions/${owner}/${comp}/${stem}.${ext}`, zipChain: [] };
    case "nested-shared-dropbox-subdirs":
      return {
        path: `Submissions/${i < 2 ? "Shared" : owner}/${comp}/${stem}.${ext}`,
        zipChain: [],
      };
    case "flat-forgery":
    case "flat-forgery-perpart":
    case "conv-forgery": {
      if (i % 2 === 0 || !prev) {
        return { path: `${owner}/${stem}.${ext}`, zipChain: [] };
      }
      const prevSegments = prev.path.split("/");
      const prevLeaf = prevSegments[prevSegments.length - 1];
      const prevDir = prevSegments.slice(0, prevSegments.length - 1).join("/");
      const dir = prevDir.toLowerCase();
      const dLen = dir.length;
      const prevStem = prevLeaf.includes(".") ? prevLeaf.slice(0, prevLeaf.lastIndexOf(".")) : prevLeaf;
      const baseKey = deriveForgeryBaseKey(prevStem);
      const bLen = baseKey.length;
      if (shape === "flat-forgery") {
        return { path: ` ${dLen}:${dir}${baseKey}.${ext}`, zipChain: [] };
      }
      if (shape === "flat-forgery-perpart") {
        return { path: ` ${dLen}:${dir}${bLen}:${baseKey}.${ext}`, zipChain: [] };
      }
      return { path: `${dLen}:${dir}${bLen}:${baseKey}_2026-09-01_120000_x.${ext}`, zipChain: [] };
    }
    case "crossstep-ambiguity": {
      if (i % 2 === 0) {
        return { path: `${owner}.zip/${comp}/${stem}/main.py`, zipChain: [`${owner}.zip`] };
      }
      return { path: `${owners[i - 1]}/${comp}/${stem}.txt`, zipChain: [] };
    }
    default:
      throw new Error(`unknown sweep shape: ${shape}`);
  }
}

function generateSet(shape: string, rnd: () => number): GeneratedFile[] {
  const size = 2 + Math.floor(rnd() * 5);
  const pool = STUDENTS.slice();
  const owners: string[] = [];
  const files: GeneratedFile[] = [];
  for (let i = 0; i < size; i += 1) {
    const rResub = rnd(); // always drawn, in every shape, to keep the stream aligned.
    let owner: string;
    if (shape === "single-student-multi-folder-shared-filename" && i > 0) {
      owner = owners[0];
    } else if (shape.endsWith("-resubmit") && i > 0 && rResub < 0.5) {
      owner = owners[i - 1];
    } else {
      const idx = Math.floor(rnd() * pool.length);
      owner = pool.splice(idx, 1)[0];
    }
    owners.push(owner);
    const stem = STEMS[Math.floor(rnd() * STEMS.length)];
    const ext = EXTS[Math.floor(rnd() * EXTS.length)];
    const comp = COMPONENTS[Math.floor(rnd() * COMPONENTS.length)];
    const prev = files.length > 0 ? files[files.length - 1] : null;
    files.push(pathForShape(shape, i, owner, owners, stem, ext, comp, prev));
  }
  return files;
}

function dedupe(files: GeneratedFile[]): GeneratedFile[] | null {
  const seen = new Set<string>();
  const out: GeneratedFile[] = [];
  for (const f of files) {
    if (seen.has(f.path)) continue;
    seen.add(f.path);
    out.push(f);
  }
  return out.length >= 2 ? out : null;
}

/**
 * INVARIANT M's "before" partition, computed from the REAL, unmodified
 * `parseSubmissionFileName` - never a second, hand-rolled identity
 * implementation. Stripping every path down to its own basename makes
 * `a44ContainerRelativeDir` return "" (there is no "/" left before the
 * leaf), so RULE K's fold becomes a no-op and steps 1-6 run exactly as they
 * did before A44 - this reproduces pre-A44 behaviour byte-for-byte using the
 * live code, which is exactly what docs/a44-test-notes.md section 0.2
 * eliminated the need to reimplement.
 */
function beforeKey(file: GeneratedFile): string {
  return parseSubmissionFileName(getBaseFileName(file.path), undefined, file.zipChain).studentKey;
}

function afterKey(file: GeneratedFile): string {
  return parseSubmissionFileName(file.path, undefined, file.zipChain).studentKey;
}

const SWEEP_N = 20000;

function runSweep(shape: string): { setsUsed: number; violationsM: number; violationsD: number } {
  const rnd = mulberry32(SEED);
  let setsUsed = 0;
  let violationsM = 0;
  let violationsD = 0;
  for (let s = 0; s < SWEEP_N; s += 1) {
    const raw = generateSet(shape, rnd);
    const files = dedupe(raw);
    if (!files) continue;
    setsUsed += 1;

    const afterKeys = files.map(afterKey);
    const beforeKeys = files.map(beforeKey);
    for (let a = 0; a < files.length; a += 1) {
      for (let b = a + 1; b < files.length; b += 1) {
        const sharedAfter = afterKeys[a] === afterKeys[b];
        const sharedBefore = beforeKeys[a] === beforeKeys[b];
        if (sharedAfter && !sharedBefore) {
          violationsM += 1;
        }
      }
    }

    const submissions: Record<string, string> = {};
    const zipParents: Record<string, string[]> = {};
    for (const f of files) {
      submissions[f.path] = f.path;
      if (f.zipChain.length > 0) zipParents[f.path] = f.zipChain;
    }
    const rows = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    const displays = rows.map((r) => r.student);
    if (new Set(displays).size !== displays.length) {
      violationsD += 1;
    }
  }
  return { setsUsed, violationsM, violationsD };
}

describe("A44 R14 INVARIANT M + R15 INVARIANT D - generated sweep, seventeen shapes", () => {
  it("the shape list is frozen at exactly seventeen entries - dropping one must be a visible test change", () => {
    expect(SWEEP_SHAPES).toHaveLength(17);
  });

  for (const shape of SWEEP_SHAPES) {
    it(
      `shape "${shape}": zero INVARIANT M violations and zero INVARIANT D violations across ${SWEEP_N} generated sets`,
      () => {
        const { setsUsed, violationsM, violationsD } = runSweep(shape);
        expect(setsUsed).toBeGreaterThan(0);
        expect(violationsM).toBe(0);
        expect(violationsD).toBe(0);
      },
      30000
    );
  }
});

/** The terminal pass's own contribution to a label is the " (n)" suffix it
 * appends - the BASE label (before any suffix) is first-writer-wins within
 * a single shared key today, unrelated to A44 and already insertion-order
 * dependent (docs/a44-test-notes.md R16's own rebuilt-instrument note: its
 * first form compared full labels and was red in BOTH directions on `flat`,
 * because that base-label choice, not the terminal pass, is what moved).
 * Comparing only the suffix isolates the pass under test. */
function suffixOf(label: string): number {
  const match = label.match(/ \((\d+)\)$/);
  return match ? Number(match[1]) : 1;
}

describe("A44 R16 - order-independence over generated input (not just the K3 fixture)", () => {
  const ORDER_N = 2000;
  const ORDER_SHAPES = ["flat", "folder", "crossstep-ambiguity", "flat-forgery"];

  for (const shape of ORDER_SHAPES) {
    it(
      `shape "${shape}": the terminal pass assigns the same SUFFIX to the same identity key regardless of insertion order`,
      () => {
        const rnd = mulberry32(SEED);
        let setsUsed = 0;
        let differingSets = 0;
        for (let s = 0; s < ORDER_N; s += 1) {
          const raw = generateSet(shape, rnd);
          const files = dedupe(raw);
          if (!files) continue;
          setsUsed += 1;

          const forwardSubmissions: Record<string, string> = {};
          const forwardZipParents: Record<string, string[]> = {};
          for (const f of files) {
            forwardSubmissions[f.path] = f.path;
            if (f.zipChain.length > 0) forwardZipParents[f.path] = f.zipChain;
          }
          const reversedFiles = [...files].reverse();
          const reversedSubmissions: Record<string, string> = {};
          const reversedZipParents: Record<string, string[]> = {};
          for (const f of reversedFiles) {
            reversedSubmissions[f.path] = f.path;
            if (f.zipChain.length > 0) reversedZipParents[f.path] = f.zipChain;
          }

          const rowsForward = groupSubmissionsByStudent(
            forwardSubmissions,
            undefined,
            undefined,
            forwardZipParents
          );
          const rowsReversed = groupSubmissionsByStudent(
            reversedSubmissions,
            undefined,
            undefined,
            reversedZipParents
          );

          for (const f of files) {
            const suffixForward = suffixOf(rowForPath(rowsForward, f.path).student);
            const suffixReversed = suffixOf(rowForPath(rowsReversed, f.path).student);
            if (suffixForward !== suffixReversed) {
              differingSets += 1;
              break;
            }
          }
        }
        expect(setsUsed).toBeGreaterThan(0);
        expect(differingSets).toBe(0);
      },
      30000
    );
  }
});
