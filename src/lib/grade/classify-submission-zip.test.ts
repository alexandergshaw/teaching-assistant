// ZIP-CLASS-VS-SINGLE W1: the frozen oracle (docs/zip-class-vs-single-scope.md
// section 6). Fixtures match the shape extractSubmissions EMITS: submissions
// keyed by full archive path, zipParents keyed by the same path and ABSENT for a
// top-level file, inferredLookup an object that is always present in production
// but whose byRaw is empty for identity-less names. The expected table is
// hand-specified here, never produced by calling the classifier.
import { describe, expect, it } from "vitest";

import { classifySubmissionZip } from "./classify-submission-zip";
import type { InferredFileNameLookup, SubmissionZipKind } from "./types";
import { groupSubmissionsByStudent } from "./utils";

interface Fixture {
  readonly id: string;
  readonly paths: readonly string[];
  readonly zipParents?: Record<string, string[]>;
  readonly expected: { kind: SubmissionZipKind; studentCount: number; markerStudentCount: number };
}

function subs(paths: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of paths) out[p] = "content of " + p;
  return out;
}

const FIXTURES: readonly Fixture[] = [
  {
    id: "C1 canvas convention at root",
    paths: ["alvarezmaria_12_34_essay.docx", "chenwei_56_78_essay.docx"],
    expected: { kind: "class", studentCount: 2, markerStudentCount: 2 },
  },
  {
    id: "C2 per-student root folders",
    paths: ["AlvarezMaria/essay.docx", "ChenWei/report.docx"],
    expected: { kind: "class", studentCount: 2, markerStudentCount: 2 },
  },
  {
    id: "C3 nested per-student zips",
    paths: ["bulk/alvarezmaria_1_2_s.zip/main.py", "bulk/chenwei_3_4_s.zip/main.py"],
    zipParents: {
      "bulk/alvarezmaria_1_2_s.zip/main.py": ["alvarezmaria_1_2_s.zip"],
      "bulk/chenwei_3_4_s.zip/main.py": ["chenwei_3_4_s.zip"],
    },
    expected: { kind: "class", studentCount: 2, markerStudentCount: 2 },
  },
  {
    id: "C4 five foldered students, one also with a Canvas-named file",
    paths: [
      "Ada/a.docx",
      "Ben/a.docx",
      "Cho/a.docx",
      "Dee/a.docx",
      "Eli/a.docx",
      "Eli/eli_9_9_extra.docx",
    ],
    expected: { kind: "class", studentCount: 6, markerStudentCount: 6 },
  },
  {
    id: "S1 one root file",
    paths: ["essay.docx"],
    expected: { kind: "single", studentCount: 1, markerStudentCount: 0 },
  },
  {
    id: "S2 one student, two files sharing a Canvas prefix",
    paths: ["jordanlee_9_9_essay.docx", "jordanlee_9_9_refs.docx"],
    expected: { kind: "single", studentCount: 1, markerStudentCount: 1 },
  },
  {
    // The scope table (section 6) expected single/1/1 here, but the grouping
    // folds the file STEM into the key as well as the folder, so two files in
    // one folder are two groups (measured via groupSubmissionsByStudent). The
    // classifier must agree with the grouping (AC-3), so the engine-true
    // value is pinned and the disagreement is reported to the owner.
    id: "S3 one folder, two differently-named files (engine groups per stem)",
    paths: ["AlvarezMaria/essay.docx", "AlvarezMaria/refs.docx"],
    expected: { kind: "class", studentCount: 2, markerStudentCount: 2 },
  },
  {
    id: "U1 flat bare stems (the leverage removal fixture)",
    paths: ["main.py", "report.docx", "README.md"],
    expected: { kind: "unknown", studentCount: 3, markerStudentCount: 0 },
  },
  {
    id: "U2 empty",
    paths: [],
    expected: { kind: "unknown", studentCount: 0, markerStudentCount: 0 },
  },
  {
    id: "U3 one Canvas-named student plus two loose bare stems",
    paths: ["jordanlee_9_9_essay.docx", "main.py", "notes.txt"],
    expected: { kind: "unknown", studentCount: 3, markerStudentCount: 1 },
  },
];

// Production always passes an inferredLookup. For identity-less names byRaw is
// EMPTY (rubric.ts skips a file with no inferred studentDisplay), so the
// present-variant uses an empty byRaw for every fixture. U1 in particular MUST
// keep byRaw empty: populating it makes every file "roster" and flips U1 to
// class, which would silently defeat the removal test.
const EMPTY_LOOKUP: InferredFileNameLookup = { byRaw: new Map() };

describe("classifySubmissionZip - frozen oracle (C/S/U fixtures)", () => {
  for (const fx of FIXTURES) {
    for (const withLookup of [false, true]) {
      it(`${fx.id} (${withLookup ? "with" : "without"} inferredLookup)`, () => {
        const result = classifySubmissionZip(subs(fx.paths), withLookup ? EMPTY_LOOKUP : undefined, fx.zipParents);
        expect({
          kind: result.kind,
          studentCount: result.studentCount,
          markerStudentCount: result.markerStudentCount,
        }).toEqual(fx.expected);
      });
    }
  }

  it("AC-3: studentCount equals groupSubmissionsByStudent's entry count on every fixture", () => {
    for (const fx of FIXTURES) {
      const submissions = subs(fx.paths);
      const grouped = groupSubmissionsByStudent(submissions, EMPTY_LOOKUP, undefined, fx.zipParents);
      expect(classifySubmissionZip(submissions, EMPTY_LOOKUP, fx.zipParents).studentCount, fx.id).toBe(grouped.length);
    }
  });

  it("a model-inferred name is a roster marker (inferredLookup hit)", () => {
    const paths = ["a1.docx", "b2.docx"];
    const lookup: InferredFileNameLookup = {
      byRaw: new Map([
        ["a1.docx", { studentDisplay: "Maria Alvarez", citationFileName: "a1.docx" }],
        ["b2.docx", { studentDisplay: "Wei Chen", citationFileName: "b2.docx" }],
      ]),
    };
    const result = classifySubmissionZip(subs(paths), lookup);
    expect(result).toMatchObject({ kind: "class", studentCount: 2, markerStudentCount: 2, signal: "canvas-convention" });
  });

  it("a nested archive whose own name carries no convention is a structure marker", () => {
    const paths = ["bulk/alvarez.zip/main.py", "bulk/chen.zip/main.py"];
    const zipParents = { "bulk/alvarez.zip/main.py": ["alvarez.zip"], "bulk/chen.zip/main.py": ["chen.zip"] };
    expect(classifySubmissionZip(subs(paths), EMPTY_LOOKUP, zipParents)).toMatchObject({
      kind: "class",
      studentCount: 2,
      markerStudentCount: 2,
      signal: "nested-archives",
    });
  });

  it("signal names the dominant marker", () => {
    expect(classifySubmissionZip(subs(FIXTURES[1].paths)).signal).toBe("folders");
    expect(classifySubmissionZip(subs(FIXTURES[2].paths), undefined, FIXTURES[2].zipParents).signal).toBe("canvas-convention");
    expect(classifySubmissionZip(subs(FIXTURES[0].paths)).signal).toBe("canvas-convention");
    expect(classifySubmissionZip(subs(FIXTURES[4].paths)).signal).toBe("single-group");
    expect(classifySubmissionZip(subs(FIXTURES[7].paths)).signal).toBe("ambiguous");
    expect(classifySubmissionZip({}).signal).toBe("empty");
  });

  it("AC-5 removal test: U1 is unknown, while an entries.length-only classifier would call it class", () => {
    const u1 = subs(FIXTURES[7].paths);
    expect(classifySubmissionZip(u1, EMPTY_LOOKUP).kind).toBe("unknown");
    const lengthOnly = groupSubmissionsByStudent(u1, EMPTY_LOOKUP).length >= 2 ? "class" : "single";
    expect(lengthOnly).toBe("class");
  });
});
