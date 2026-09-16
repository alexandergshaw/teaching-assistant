import { describe, it, expect } from "vitest";
import {
  truncateSubmission,
  buildCodeExecutionNote,
  parseSubmissionFileName,
  groupSubmissionsByStudent,
} from "./utils";
import type { CodeRunResult } from "../code-runner";
import type { InferredFileNameLookup } from "./types";

// C1.2 / C2.7: truncateSubmission must (a) leave content exactly at the cap
// untouched, (b) cut anything over the cap and say so via `truncated`, not
// only via a note baked into the returned text - `truncated` is what
// engine.ts threads out to GradeResult.submissionTruncated so a UI can
// report it, rather than the instructor discovering it never happened.
describe("truncateSubmission", () => {
  it("returns content unchanged and truncated:false when exactly at the cap", () => {
    const content = "a".repeat(100);
    const result = truncateSubmission(content, 100);
    expect(result.text).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it("returns content unchanged and truncated:false when under the cap", () => {
    const content = "a".repeat(99);
    const result = truncateSubmission(content, 100);
    expect(result.text).toBe(content);
    expect(result.truncated).toBe(false);
  });

  it("cuts content down and reports truncated:true when exactly one character over the cap", () => {
    const content = "a".repeat(101);
    const result = truncateSubmission(content, 100);
    expect(result.truncated).toBe(true);
    expect(result.text.startsWith("a".repeat(100))).toBe(true);
    expect(result.text).not.toBe(content);
  });

  it("appends a note naming the omitted character count for the model, in addition to reporting truncated:true", () => {
    const content = "a".repeat(150);
    const result = truncateSubmission(content, 100);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("[Truncated 50 characters to stay within configured grading limits.]");
  });

  it("never reports truncated:true for empty content", () => {
    const result = truncateSubmission("", 100);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe("");
  });
});

function codeRun(overrides: Partial<CodeRunResult>): CodeRunResult {
  return { language: "c++", files: ["main.cpp"], ran: true, exitCode: 0, stdout: "", stderr: "", ...overrides };
}

// The C++ side of the stdin-EOF defect: cin >> x at empty stdin sets failbit
// and leaves x untouched, but the process still exits 0 - so ran stays true
// and this note WOULD present the resulting garbage stdout to the grading
// model as if it reflected real behavior. stdinReadSuspected (set by
// code-runner.ts's sourceLooksLikeItReadsStdin) is the caveat this function
// must add instead of silently trusting a clean exit code.
describe("buildCodeExecutionNote", () => {
  it("adds a caveat when stdinReadSuspected is set, without hiding the actual stdout", () => {
    const note = buildCodeExecutionNote(codeRun({ stdout: "0", stdinReadSuspected: true }));
    expect(note).toContain("Program output (stdout):\n0");
    expect(note).toMatch(/does not raise an error|Do not treat the output above as evidence/);
  });

  it("adds no stdin caveat for an ordinary run that never touched stdin", () => {
    const note = buildCodeExecutionNote(codeRun({ stdout: "hello", stdinReadSuspected: false }));
    expect(note).not.toMatch(/does not raise an error|Do not treat the output above as evidence/);
  });
});

// A14: a live, grade-affecting defect - a student's own zip loses the
// student identity (the leaf inside a per-student zip is a bare filename
// like "main.py", which does not carry the studentname_date_time_filename
// convention), and multiple students' files collapse onto one row keyed by
// a shared filename stem ("main", "report"). Fixed per the binding rulings
// in scratchpad/a14-rulings.md: leaf-first, then an outward-in scan of the
// WHOLE zip-crossing chain extraction.ts now threads through, ground truth
// (a crossing match) outranking a byBase guess, and the userId folded into
// the grouping key so sanitized-name collisions do not merge.
describe("parseSubmissionFileName - nested-zip identity via the crossing chain (A14)", () => {
  it("takes identity from the crossing chain's matching zip name, not the leaf, when the leaf itself doesn't match Canvas's convention (the filed bug's own shape)", () => {
    const parsed = parseSubmissionFileName(
      "janedoe_2024-01-01_120000_project.zip/main.py",
      undefined,
      ["janedoe_2024-01-01_120000_project.zip"]
    );
    expect(parsed.studentDisplay).toBe("janedoe");
    // citationFileName/extension must stay the bare leaf regardless of where
    // identity came from - code-run-selection.ts and prompts.ts both depend
    // on this never becoming a full/partial path.
    expect(parsed.citationFileName).toBe("main.py");
    expect(parsed.extension).toBe("py");
  });

  it("prefers the leaf's own convention match over any crossing, when the leaf itself matches (zip-of-the-bulk-download shape)", () => {
    const parsed = parseSubmissionFileName(
      "submissions_download.zip/janedoe_2024-01-01_120000_report.docx",
      undefined,
      ["submissions_download.zip"]
    );
    expect(parsed.studentDisplay).toBe("janedoe");
    expect(parsed.citationFileName).toBe("report.docx");
  });

  it("base-names a crossing before convention-matching it, so an instructor subfolder before the per-student zip is not read as part of the student's name", () => {
    const parsed = parseSubmissionFileName(
      "wrap/johndoe_2024-01-01_130000_project.zip/main.py",
      undefined,
      ["wrap/johndoe_2024-01-01_130000_project.zip"]
    );
    expect(parsed.studentDisplay).toBe("johndoe");
  });

  it("scans the whole chain outward-in through intermediate bulk wrappers to reach the per-student zip", () => {
    const parsed = parseSubmissionFileName(
      "wrapper.zip/bulk.zip/janedoe_2024-01-01_120000_project.zip/main.py",
      undefined,
      ["wrapper.zip", "bulk.zip", "janedoe_2024-01-01_120000_project.zip"]
    );
    expect(parsed.studentDisplay).toBe("janedoe");
  });

  it("matches today's exact leaf-stem output when the chain is empty (no zip crossing at all)", () => {
    const parsed = parseSubmissionFileName("src/main.py", undefined, []);
    expect(parsed.studentDisplay).toBe("main");
  });

  it("matches today's exact leaf-stem output when the chain argument is omitted entirely (an un-migrated caller)", () => {
    const parsed = parseSubmissionFileName("src/main.py");
    expect(parsed.studentDisplay).toBe("main");
  });
});

describe("parseSubmissionFileName - ground truth (the crossing chain) outranks byBase (A14 ruling M2)", () => {
  it("uses the crossing-derived identity over a byBase guess for the same file, when byRaw has no exact hit", () => {
    // Simulates a partial/degraded model inference: byRaw missed this exact
    // file (so it fell through to the deterministic path further down in
    // rubric.ts), and byBase's guess for this base name ("main.py") points at
    // the WRONG student. The crossing chain (ground truth, populated by
    // extraction.ts regardless of any model call) must win.
    const inferredLookup: InferredFileNameLookup = {
      byRaw: new Map(),
      byBase: new Map([["main.py", { studentDisplay: "WrongGuess", citationFileName: "main.py" }]]),
    };
    const parsed = parseSubmissionFileName(
      "janedoe_2024-01-01_120000_project.zip/main.py",
      inferredLookup,
      ["janedoe_2024-01-01_120000_project.zip"]
    );
    expect(parsed.studentDisplay).toBe("janedoe");
    expect(parsed.studentDisplay).not.toBe("WrongGuess");
  });
});

describe("groupSubmissionsByStudent - nested per-student zips, wired with the crossing chain (A14 filed bug)", () => {
  const submissions = {
    "janedoe_2024-01-01_120000_project.zip/main.py": "print('jane')",
    "janedoe_2024-01-01_120000_project.zip/report.docx": "Jane's report body",
    "johndoe_2024-01-01_130000_project.zip/main.py": "print('john')",
    "johndoe_2024-01-01_130000_project.zip/report.docx": "John's report body",
  };
  // Exactly what extraction.ts's collectFromZip would populate for this
  // fixture: every key crossed one zip boundary, at the per-student zip name.
  const zipParents = {
    "janedoe_2024-01-01_120000_project.zip/main.py": ["janedoe_2024-01-01_120000_project.zip"],
    "janedoe_2024-01-01_120000_project.zip/report.docx": ["janedoe_2024-01-01_120000_project.zip"],
    "johndoe_2024-01-01_130000_project.zip/main.py": ["johndoe_2024-01-01_130000_project.zip"],
    "johndoe_2024-01-01_130000_project.zip/report.docx": ["johndoe_2024-01-01_130000_project.zip"],
  };

  it("produces one group per student, not one group per filename stem", () => {
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(groups.map((g) => g.student).sort()).toEqual(["janedoe", "johndoe"]);
    expect(groups).toHaveLength(2);
  });

  it("never concatenates two different students' content into one row", () => {
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    const jane = groups.find((g) => g.student === "janedoe");
    const john = groups.find((g) => g.student === "johndoe");
    expect(jane?.content).toContain("print('jane')");
    expect(jane?.content).not.toContain("print('john')");
    expect(john?.content).toContain("print('john')");
    expect(john?.content).not.toContain("print('jane')");
  });

  it("keeps citationFileName as the bare leaf for every merged file (guards a naive parentPath-everywhere rewrite)", () => {
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    const jane = groups.find((g) => g.student === "janedoe");
    expect(jane?.submittedFiles.map((f) => f.name).sort()).toEqual(["main.py", "report.docx"]);
  });
});

describe("groupSubmissionsByStudent - Canvas-convention leaf under a wrapping folder, no zip crossing (A14 control)", () => {
  it("still keys on the leaf's own convention when there is no zip crossing, regardless of a wrapping folder", () => {
    const submissions = {
      "Homework1/janedoe_2024-01-01_120000_report.docx": "Jane's wrapped report",
      "Homework1/johndoe_2024-01-01_130000_report.docx": "John's wrapped report",
    };
    const groups = groupSubmissionsByStudent(submissions);
    expect(groups.map((g) => g.student).sort()).toEqual(["janedoe", "johndoe"]);
  });
});

describe("groupSubmissionsByStudent - zip-of-the-bulk-download wrapper, three flat Canvas-named leaves (A14 control - the shape that killed design v2)", () => {
  it("stays three separate students - the wrapper's own name passes the loose 4-part check too, but the leaf is consulted first", () => {
    const submissions = {
      "CS101_Fall_2026_submissions.zip/janedoe_2024-01-01_120000_report.docx": "Jane's report",
      "CS101_Fall_2026_submissions.zip/johndoe_2024-01-01_130000_report.docx": "John's report",
      "CS101_Fall_2026_submissions.zip/marysmith_2024-01-01_140000_report.docx": "Mary's report",
    };
    const zipParents = {
      "CS101_Fall_2026_submissions.zip/janedoe_2024-01-01_120000_report.docx": ["CS101_Fall_2026_submissions.zip"],
      "CS101_Fall_2026_submissions.zip/johndoe_2024-01-01_130000_report.docx": ["CS101_Fall_2026_submissions.zip"],
      "CS101_Fall_2026_submissions.zip/marysmith_2024-01-01_140000_report.docx": ["CS101_Fall_2026_submissions.zip"],
    };
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(groups.map((g) => g.student).sort()).toEqual(["janedoe", "johndoe", "marysmith"]);
    expect(groups).toHaveLength(3);
  });
});

describe("groupSubmissionsByStudent - a file crossing a zip boundary at all, no convention match anywhere (A14 required shape)", () => {
  it("still resolves to janedoe via submissions_download.zip/janedoe_..._report.docx", () => {
    const submissions = {
      "submissions_download.zip/janedoe_2024-01-01_120000_report.docx": "Jane's report",
    };
    const zipParents = {
      "submissions_download.zip/janedoe_2024-01-01_120000_report.docx": ["submissions_download.zip"],
    };
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(groups.map((g) => g.student)).toEqual(["janedoe"]);
  });

  it("still resolves to johndoe via wrap/johndoe_..._project.zip/main.py", () => {
    const submissions = {
      "wrap/johndoe_2024-01-01_130000_project.zip/main.py": "print('john')",
    };
    const zipParents = {
      "wrap/johndoe_2024-01-01_130000_project.zip/main.py": ["wrap/johndoe_2024-01-01_130000_project.zip"],
    };
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(groups.map((g) => g.student)).toEqual(["johndoe"]);
  });
});

// A14 rulings v2, CORRECTION 1: the crossing chain must be scanned NARROWEST
// FIRST (innermost to outermost), not outward-in. This shape - a wrapper zip
// whose own name ALSO passes the loose 4-part convention check
// ("CS101_Fall_2026_submissions.zip" splits into ["CS101","Fall","2026",
// "submissions.zip"]) - is the one case where direction matters, and it had
// ZERO coverage before this correction: outward-in matches the wrapper first
// and collapses every student under "CS101"; narrowest-first reaches the
// per-student zip first and keeps them separate.
describe("groupSubmissionsByStudent - TWO matching crossings in one chain: the narrowest one wins, not the widest (A14 rulings v2 CORRECTION 1)", () => {
  it("resolves to the real per-student names, not the wrapper zip's own convention-shaped name", () => {
    const submissions = {
      "CS101_Fall_2026_submissions.zip/janedoe_2024-01-01_120000_project.zip/main.py": "print('jane')",
      "CS101_Fall_2026_submissions.zip/johndoe_2024-01-01_130000_project.zip/main.py": "print('john')",
    };
    const zipParents = {
      "CS101_Fall_2026_submissions.zip/janedoe_2024-01-01_120000_project.zip/main.py": [
        "CS101_Fall_2026_submissions.zip",
        "CS101_Fall_2026_submissions.zip/janedoe_2024-01-01_120000_project.zip",
      ],
      "CS101_Fall_2026_submissions.zip/johndoe_2024-01-01_130000_project.zip/main.py": [
        "CS101_Fall_2026_submissions.zip",
        "CS101_Fall_2026_submissions.zip/johndoe_2024-01-01_130000_project.zip",
      ],
    };
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(groups.map((g) => g.student).sort()).toEqual(["janedoe", "johndoe"]);
    expect(groups).toHaveLength(2);
  });

  it("parseSubmissionFileName directly: the innermost matching crossing wins over the outer wrapper crossing", () => {
    const parsed = parseSubmissionFileName(
      "CS101_Fall_2026_submissions.zip/janedoe_2024-01-01_120000_project.zip/main.py",
      undefined,
      [
        "CS101_Fall_2026_submissions.zip",
        "CS101_Fall_2026_submissions.zip/janedoe_2024-01-01_120000_project.zip",
      ]
    );
    expect(parsed.studentDisplay).toBe("janedoe");
    expect(parsed.studentDisplay).not.toBe("CS101");
  });
});

describe("groupSubmissionsByStudent - multi-layer wrapper (wrapper.zip -> bulk.zip -> per-student zips) (A14 required shape)", () => {
  it("resolves to the real students, not a wrapper/bulk stem like 'submissions'", () => {
    const submissions = {
      "wrapper.zip/bulk.zip/janedoe_2024-01-01_120000_project.zip/main.py": "print('jane')",
      "wrapper.zip/bulk.zip/johndoe_2024-01-01_130000_project.zip/main.py": "print('john')",
    };
    const zipParents = {
      "wrapper.zip/bulk.zip/janedoe_2024-01-01_120000_project.zip/main.py": [
        "wrapper.zip",
        "wrapper.zip/bulk.zip",
        "wrapper.zip/bulk.zip/janedoe_2024-01-01_120000_project.zip",
      ],
      "wrapper.zip/bulk.zip/johndoe_2024-01-01_130000_project.zip/main.py": [
        "wrapper.zip",
        "wrapper.zip/bulk.zip",
        "wrapper.zip/bulk.zip/johndoe_2024-01-01_130000_project.zip",
      ],
    };
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    expect(groups.map((g) => g.student).sort()).toEqual(["janedoe", "johndoe"]);
  });
});

// A14 rulings v2, CORRECTION 2: M3's parts[1]/userId fold is withdrawn. A
// sanitized-name collision (two different students whose first
// underscore-separated part is identical) is a KNOWN-OPEN item again, not
// fixed - the two files merge into one row, same as before M3 ever existed.
// This replaces the withdrawn M3 test, which asserted the opposite
// (two separate rows) and would now fail.
describe("groupSubmissionsByStudent - sanitized-name collision is a known-open merge, not disambiguated (A14 rulings v2 CORRECTION 2)", () => {
  it("merges two different students' files into one row when their sanitized name is identical, regardless of the second underscore part", () => {
    const submissions = {
      "johnsmith_1001_0_report.docx": "John Smith #1's report",
      "johnsmith_1002_0_report.docx": "John Smith #2's report",
    };
    const groups = groupSubmissionsByStudent(submissions);
    expect(groups).toHaveLength(1);
    expect(groups[0].student).toBe("johnsmith");
    expect(groups[0].mergedFileCount).toBe(2);
  });

  it("does NOT split one student's own two date-prefixed submissions into two rows (the real Canvas convention puts a date, not a userId, in that position)", () => {
    // utils.ts:70's own comment: the real Canvas convention is
    // studentname_date_time_filename - so a second submission from the same
    // student naturally carries a different second part (a different date),
    // and must still land in the SAME row rather than splitting into two
    // UI-identical rows that would each carry their own (and thus
    // contradictory) grade.
    const submissions = {
      "janedoe_2024-01-01_120000_report.docx": "Jane's first submission",
      "janedoe_2024-01-15_090000_report.docx": "Jane's resubmission",
    };
    const groups = groupSubmissionsByStudent(submissions);
    expect(groups).toHaveLength(1);
    expect(groups[0].student).toBe("janedoe");
    expect(groups[0].mergedFileCount).toBe(2);
  });
});

// General regression guard: whatever the identity algorithm above does,
// groupSubmissionsByStudent's returned rows must never let two DIFFERENT
// keys collapse onto the same displayed `student` string - that would let
// two independently-graded rows look like duplicates of each other (or,
// worse, one silently overwrite the other in anything keyed on the display
// string, as GradingResults.tsx does per a14-rulings-v2.md CORRECTION 2).
describe("groupSubmissionsByStudent - no two returned rows ever share a `student` string", () => {
  it("keeps every row's student string unique across a mixed batch of flat, nested, and wrapped submissions", () => {
    const submissions = {
      "janedoe_2024-01-01_120000_report.docx": "Jane's flat report",
      "johndoe_2024-01-01_130000_project.zip/main.py": "print('john')",
      "wrap/marysmith_2024-01-01_140000_report.docx": "Mary's wrapped report",
      "src/otherfile.py": "an unmatched leaf",
    };
    const zipParents = {
      "johndoe_2024-01-01_130000_project.zip/main.py": ["johndoe_2024-01-01_130000_project.zip"],
    };
    const groups = groupSubmissionsByStudent(submissions, undefined, undefined, zipParents);
    const students = groups.map((g) => g.student);
    expect(new Set(students).size).toBe(students.length);
  });
});

describe("groupSubmissionsByStudent - flat Canvas download, unaffected (A14 control, unchanged from before this fix)", () => {
  it("still keys on the studentname_date_time_filename convention for a top-level entry", () => {
    const submissions = { "janedoe_2024-01-01_120000_report.docx": "Jane's flat report" };
    const groups = groupSubmissionsByStudent(submissions);
    expect(groups).toEqual([
      {
        student: "janedoe",
        content: "File: report.docx\n\nJane's flat report",
        mergedFileCount: 1,
        submittedFiles: [expect.objectContaining({ name: "report.docx", extension: "docx" })],
      },
    ]);
  });
});
