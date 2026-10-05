import { describe, it, expect, vi, beforeEach } from "vitest";

// RES-FILL-3 W1: the frozen student-attribution ORACLE (docs/res-fill-3-w1-test-
// notes.md). It freezes the CURRENT attribution output of BOTH ingestion paths -
// gradeSubmissions (engine.ts) and extractStudentEntries (extraction.ts) -
// against hand-written literals. Each path is compared to a literal, NEVER to the
// other path: after the W2 consolidation a path-vs-path assertion would compare
// one function with itself. This file adds no export (a legal "no caller"
// exception: it is a test leaf). W2 may edit NO literal here.
//
// GREEN at HEAD by construction: it characterizes present behaviour, known
// defects included. A RED row means a literal disagrees with reality - stop and
// report, never edit the literal to fit.

const gradeState = vi.hoisted(() => ({ maxSubmissions: 50 }));

vi.mock("@/lib/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini");
  return {
    ...actual,
    getGeminiInterRequestDelayMs: () => 0,
    getGeminiMaxSubmissions: () => gradeState.maxSubmissions,
  };
});

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

// The engine runs runnable submitted code before the model call; the real runner
// reaches the network. This oracle tests attribution, never code execution.
vi.mock("@/lib/code-runner", () => ({
  runSubmittedCode: vi.fn(async () => null),
}));

import JSZip from "jszip";
import { callLlm } from "@/lib/llm";
import { extractStudentEntries } from "./extraction";
import { gradeSubmissions } from "./engine";
import type { GradeResult, StudentSubmissionEntry } from "./types";

const mockCallLlm = vi.mocked(callLlm);

// ---------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------

const GRADING_JSON = JSON.stringify({
  overallComment: "Solid work overall.",
  rubricResults: [{ area: "Overall", score: "8/10" }],
  totalScore: "8/10",
});

// The routing string is the stable inference-prompt sentinel (prompts.ts).
const INFERENCE_SENTINEL = "identifying filename naming conventions";

/** [rawFileName, studentName, assignmentFileName]; null = inference unavailable. */
type Reply = ReadonlyArray<readonly [string, string, string]> | null;

let currentReply: Reply = null;

function promptText(call: Parameters<typeof callLlm>): string {
  const part = call[0].contents[0].parts[0];
  if (!("text" in part)) throw new Error("expected a text part");
  return part.text;
}

function installModel(reply: Reply): void {
  currentReply = reply;
  mockCallLlm.mockImplementation(async (request) => {
    const part = request.contents[0].parts[0];
    const text = "text" in part ? part.text : "";
    if (text.includes(INFERENCE_SENTINEL)) {
      if (currentReply === null) {
        return { ok: false as const, status: 500, body: "inference unavailable" };
      }
      return {
        ok: true as const,
        text: JSON.stringify({
          items: currentReply.map(([rawFileName, studentName, assignmentFileName]) => ({
            rawFileName,
            studentName,
            assignmentFileName,
          })),
        }),
      };
    }
    return { ok: true as const, text: GRADING_JSON };
  });
}

interface FxFile {
  readonly path: string;
  readonly sentinel?: string;
  /** A nested archive: path is the inner zip's own entry name. */
  readonly inner?: ReadonlyArray<{ readonly path: string; readonly sentinel: string }>;
}

async function buildZip(files: ReadonlyArray<FxFile>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const f of files) {
    if (f.inner) {
      const innerZip = new JSZip();
      for (const g of f.inner) {
        innerZip.file(g.path, `${g.sentinel} body text`);
      }
      const bytes = await innerZip.generateAsync({ type: "uint8array" });
      zip.file(f.path, bytes);
    } else {
      zip.file(f.path, `${f.sentinel ?? "S_NONE"} body text`);
    }
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

interface Row {
  readonly student: string;
  readonly files: readonly string[];
}

interface RowSource {
  readonly student: string;
  readonly submittedFiles: ReadonlyArray<{ readonly name: string }>;
}

function rowsOf(sources: ReadonlyArray<RowSource>, relaxed: boolean): Row[] {
  return sources.map((s) => ({
    student: relaxed ? s.student.toLowerCase() : s.student,
    files: s.submittedFiles.map((f) => f.name).sort(),
  }));
}

function sentinelsByStudent(relaxed: boolean): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const call of mockCallLlm.mock.calls) {
    const text = promptText(call);
    if (text.includes(INFERENCE_SENTINEL)) continue;
    const nameMatch = /\n\nStudent: ([^\n]*)\n/.exec(text);
    if (!nameMatch) throw new Error("grading prompt carried no Student line");
    const name = relaxed ? nameMatch[1].toLowerCase() : nameMatch[1];
    const marker = "\n\nSubmission:\n";
    const body = text.slice(text.indexOf(marker) + marker.length);
    const found = body.match(/S_[A-Z0-9]+(?:_[A-Z0-9]+)*/g) ?? [];
    out[name] = [...(out[name] ?? []), ...found].sort();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures F1-F15. Every literal is hand-written and frozen.
// ---------------------------------------------------------------------------

interface Fixture {
  readonly id: string;
  readonly label: string;
  readonly files: ReadonlyArray<FxFile>;
  readonly reply: Reply;
  /** L: engine-with-inference and extraction-with-inference rows (P1 = P3). */
  readonly L: ReadonlyArray<Row>;
  /** P2 literal: per-student sentinel set the model prompt must carry. */
  readonly sentinels: Readonly<Record<string, readonly string[]>>;
  /** N: no-option extraction student list (P4); absent = no P4 on this row. */
  readonly N?: ReadonlyArray<string>;
  /** Surviving display is first-seen/order-dependent (R-3): compare lower-cased. */
  readonly relaxed?: boolean;
  readonly maxSubmissions?: number;
  /** Students whose engine row must be ungraded kind "not-attempted". */
  readonly notAttempted?: ReadonlyArray<string>;
}

const F1_FILES: ReadonlyArray<FxFile> = [
  { path: "Ada Lovelace_2024-01-01_120000_essay.txt", sentinel: "S_ADA_1" },
  { path: "Ada Lovelace_2024-01-01_120500_notes.txt", sentinel: "S_ADA_2" },
  { path: "Grace Hopper_2024-01-02_130000_essay.txt", sentinel: "S_GRACE_1" },
  { path: "Bo_2024-01-03_140000_essay.txt", sentinel: "S_BO_1" },
  { path: "Adam_2024-01-03_140000_essay.txt", sentinel: "S_ADAM_1" },
];

const TWO_STUDENT_FILES: ReadonlyArray<FxFile> = [
  { path: "essay1-AdaL.txt", sentinel: "S_ADA_1" },
  { path: "code1-AdaL.txt", sentinel: "S_ADA_2" },
  { path: "essay2-GraceH.txt", sentinel: "S_GRACE_1" },
  { path: "code2-GraceH.txt", sentinel: "S_GRACE_2" },
];

const FIXTURES: ReadonlyArray<Fixture> = [
  {
    // KEY order (12:ada lovelace, 12:grace hopper, 2:bo, 4:adam) differs from
    // DISPLAY order (Ada Lovelace, Adam, Bo, Grace Hopper): keep that mismatch,
    // or the localeCompare sort stops being exercised.
    id: "F1",
    label: "convention names, key order differs from display order",
    files: F1_FILES,
    reply: null,
    L: [
      { student: "Ada Lovelace", files: ["essay.txt", "notes.txt"] },
      { student: "Adam", files: ["essay.txt"] },
      { student: "Bo", files: ["essay.txt"] },
      { student: "Grace Hopper", files: ["essay.txt"] },
    ],
    sentinels: {
      "Ada Lovelace": ["S_ADA_1", "S_ADA_2"],
      Adam: ["S_ADAM_1"],
      Bo: ["S_BO_1"],
      "Grace Hopper": ["S_GRACE_1"],
    },
  },
  {
    id: "F2",
    label: "name-vs-username with dirty whitespace",
    files: TWO_STUDENT_FILES,
    reply: [
      ["essay1-AdaL.txt", "  Ada   Lovelace ", "essay1.txt"],
      ["code1-AdaL.txt", "Ada Lovelace", "code1.txt"],
      ["essay2-GraceH.txt", "Grace  Hopper", "essay2.txt"],
      ["code2-GraceH.txt", "Grace Hopper", "code2.txt"],
    ],
    L: [
      { student: "Ada Lovelace", files: ["code1.txt", "essay1.txt"] },
      { student: "Grace Hopper", files: ["code2.txt", "essay2.txt"] },
    ],
    sentinels: {
      "Ada Lovelace": ["S_ADA_1", "S_ADA_2"],
      "Grace Hopper": ["S_GRACE_1", "S_GRACE_2"],
    },
    N: ["code1", "code2", "essay1", "essay2"],
  },
  {
    // Blank and absent inference fall back per file, so one student splits
    // across rows. Frozen as-is.
    id: "F3",
    label: "missing name (blank and absent) falls back per file",
    files: [
      { path: "essay1-AdaL.txt", sentinel: "S_ADA_1" },
      { path: "code1-AdaL.txt", sentinel: "S_ADA_2" },
      { path: "essay2-GraceH.txt", sentinel: "S_GRACE_1" },
    ],
    reply: [
      ["essay1-AdaL.txt", "Ada Lovelace", "essay1.txt"],
      ["code1-AdaL.txt", "   ", "code1.txt"],
    ],
    L: [
      { student: "Ada Lovelace", files: ["essay1.txt"] },
      { student: "code1", files: ["code1-AdaL.txt"] },
      { student: "essay2", files: ["essay2-GraceH.txt"] },
    ],
    sentinels: {
      "Ada Lovelace": ["S_ADA_1"],
      code1: ["S_ADA_2"],
      essay2: ["S_GRACE_1"],
    },
    N: ["code1", "essay1", "essay2"],
  },
  {
    id: "F4",
    label: "inference unavailable, both paths degrade identically",
    files: TWO_STUDENT_FILES,
    reply: null,
    L: [
      { student: "code1", files: ["code1-AdaL.txt"] },
      { student: "code2", files: ["code2-GraceH.txt"] },
      { student: "essay1", files: ["essay1-AdaL.txt"] },
      { student: "essay2", files: ["essay2-GraceH.txt"] },
    ],
    sentinels: {
      code1: ["S_ADA_2"],
      code2: ["S_GRACE_2"],
      essay1: ["S_ADA_1"],
      essay2: ["S_GRACE_1"],
    },
  },
  {
    // Terminal unique-label pass: two distinct keys, one raw display.
    id: "F5",
    label: "duplicate display across two keys gets a unique label",
    files: [
      { path: "JaneDoe.zip", inner: [{ path: "src/deep.txt", sentinel: "S_NESTED" }] },
      { path: "JaneDoe/src.txt", sentinel: "S_FLAT" },
    ],
    reply: null,
    L: [
      { student: "JaneDoe/src", files: ["deep.txt"] },
      { student: "JaneDoe/src (2)", files: ["src.txt"] },
    ],
    sentinels: {
      "JaneDoe/src": ["S_NESTED"],
      "JaneDoe/src (2)": ["S_FLAT"],
    },
  },
  {
    id: "F6",
    label: "foldered students sharing a file name",
    files: [
      { path: "AlvarezMaria/essay.txt", sentinel: "S_ALV" },
      { path: "BrownTom/essay.txt", sentinel: "S_BRO" },
      { path: "ChenLi/essay.txt", sentinel: "S_CHEN" },
    ],
    reply: null,
    L: [
      { student: "AlvarezMaria/essay", files: ["essay.txt"] },
      { student: "BrownTom/essay", files: ["essay.txt"] },
      { student: "ChenLi/essay", files: ["essay.txt"] },
    ],
    sentinels: {
      "AlvarezMaria/essay": ["S_ALV"],
      "BrownTom/essay": ["S_BRO"],
      "ChenLi/essay": ["S_CHEN"],
    },
  },
  {
    id: "F7",
    label: "nested per-student zips with convention names",
    files: [
      {
        path: "janedoe_2024-01-01_120000_project.zip",
        inner: [{ path: "main.py", sentinel: "S_JANE" }],
      },
      {
        path: "johndoe_2024-01-01_130000_project.zip",
        inner: [{ path: "main.py", sentinel: "S_JOHN" }],
      },
    ],
    reply: null,
    L: [
      { student: "janedoe", files: ["main.py"] },
      { student: "johndoe", files: ["main.py"] },
    ],
    sentinels: {
      janedoe: ["S_JANE"],
      johndoe: ["S_JOHN"],
    },
  },
  {
    id: "F8",
    label: "nested zips with no convention, innermost-crossing stem",
    files: [
      { path: "bulk.zip", inner: [{ path: "main.py", sentinel: "S_B1" }] },
      { path: "bulk2.zip", inner: [{ path: "main.py", sentinel: "S_B2" }] },
    ],
    reply: null,
    L: [
      { student: "bulk", files: ["main.py"] },
      { student: "bulk2", files: ["main.py"] },
    ],
    sentinels: {
      bulk: ["S_B1"],
      bulk2: ["S_B2"],
    },
  },
  {
    // UNLINKED submission: no name signal, attributed to the filename stem.
    id: "F9",
    label: "unlinked submission attributed to the filename stem",
    files: [{ path: "essay.txt", sentinel: "S_ONLY" }],
    reply: null,
    L: [{ student: "essay", files: ["essay.txt"] }],
    sentinels: { essay: ["S_ONLY"] },
  },
  {
    // ACCEPTED MODEL-TRUST BOUNDARY (GRADE-INFER-MERGE, residual R-1): the
    // model gave two distinct submitters (AdaL, AdaM) the SAME name for both
    // files. That is byRaw-identical to the legitimate single-student F2, so
    // the code has no ground-truth signal to tell them apart and this is not
    // deterministically fixable. The literals below stay frozen; the row is
    // relabelled from a defect to the boundary it is.
    id: "F10",
    label: "accepted-model-trust-boundary: duplicate model name merges two submitters (R-1)",
    files: [
      { path: "essay1-AdaL.txt", sentinel: "S_X" },
      { path: "code1-AdaM.txt", sentinel: "S_Y" },
    ],
    reply: [
      ["essay1-AdaL.txt", "Ada Lovelace", "essay1.txt"],
      ["code1-AdaM.txt", "Ada Lovelace", "code1.txt"],
    ],
    L: [{ student: "Ada Lovelace", files: ["code1.txt", "essay1.txt"] }],
    sentinels: { "Ada Lovelace": ["S_X", "S_Y"] },
    N: ["code1", "essay1"],
  },
  {
    id: "F11",
    label: "not-attempted tail keeps attribution and order",
    files: [
      { path: "Ada Lovelace_2024-01-01_120000_essay.txt", sentinel: "S_ADA_1" },
      { path: "Grace Hopper_2024-01-02_130000_essay.txt", sentinel: "S_GRACE_1" },
      { path: "Bo_2024-01-03_140000_essay.txt", sentinel: "S_BO_1" },
    ],
    reply: null,
    L: [
      { student: "Ada Lovelace", files: ["essay.txt"] },
      { student: "Bo", files: ["essay.txt"] },
      { student: "Grace Hopper", files: ["essay.txt"] },
    ],
    sentinels: {
      "Ada Lovelace": ["S_ADA_1"],
      Bo: ["S_BO_1"],
    },
    maxSubmissions: 2,
    notAttempted: ["Grace Hopper"],
  },
  {
    // characterization of INTENDED behaviour (not R-4): ONE student whose model
    // byRaw name outranks a ground-truth convention match (utils.ts:255-262, the
    // step-1 byRaw-priority read against step-2).
    id: "F12",
    label: "characterization of INTENDED behaviour: model byRaw outranks convention",
    files: [{ path: "Ada Lovelace_2024-01-01_120000_essay.txt", sentinel: "S_ADA_1" }],
    reply: [["Ada Lovelace_2024-01-01_120000_essay.txt", "Someone Else", "e.txt"]],
    L: [{ student: "Someone Else", files: ["e.txt"] }],
    sentinels: { "Someone Else": ["S_ADA_1"] },
    N: ["Ada Lovelace"],
  },
  {
    // Case-fold merge of inferred names. RELAXED: the surviving display is
    // first-seen and order-dependent (R-3), so row COUNT and lower-cased value.
    id: "F13",
    label: "inferred names case-fold into one row (relaxed)",
    files: [
      { path: "essay1-AdaL.txt", sentinel: "S_X" },
      { path: "code1-AdaL.txt", sentinel: "S_Y" },
    ],
    reply: [
      ["essay1-AdaL.txt", "Ada Lovelace", "e.txt"],
      ["code1-AdaL.txt", "ada lovelace", "c.txt"],
    ],
    L: [{ student: "ada lovelace", files: ["c.txt", "e.txt"] }],
    sentinels: { "ada lovelace": ["S_X", "S_Y"] },
    relaxed: true,
  },
  {
    // Case-fold merge of convention names. RELAXED as F13.
    id: "F14",
    label: "convention names case-fold into one row (relaxed)",
    files: [
      { path: "Ada_2024-01-01_1_e.txt", sentinel: "S_X" },
      { path: "ada_2024-01-02_1_f.txt", sentinel: "S_Y" },
    ],
    reply: null,
    L: [{ student: "ada", files: ["e.txt", "f.txt"] }],
    sentinels: { ada: ["S_X", "S_Y"] },
    relaxed: true,
  },
  {
    // FIXED (GRADE-INFER-MERGE): the step-4 byBase rung is deleted, so
    // BrownTom's file the model did not name no longer inherits the one named
    // student's name. It falls to the folder-folded stem and stays its own row.
    // The literal below is the post-fix output (the deliberate flip of the
    // frozen before-state).
    id: "F15",
    label: "folder-distinct submitter the model did not name stays its own row (R-4 closed)",
    files: [
      { path: "AlvarezMaria/essay.txt", sentinel: "S_ALV" },
      { path: "BrownTom/essay.txt", sentinel: "S_BRO" },
    ],
    reply: [["AlvarezMaria/essay.txt", "Maria Alvarez", "essay.txt"]],
    L: [
      { student: "BrownTom/essay", files: ["essay.txt"] },
      { student: "Maria Alvarez", files: ["essay.txt"] },
    ],
    sentinels: { "BrownTom/essay": ["S_BRO"], "Maria Alvarez": ["S_ALV"] },
    N: ["AlvarezMaria/essay", "BrownTom/essay"],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  gradeState.maxSubmissions = 50;
  installModel(null);
});

const RUBRIC = "1. Correctness (10 pts)";

describe.each(FIXTURES.map((fx) => [`${fx.id} ${fx.label}`, fx] as const))(
  "attribution oracle - %s",
  (_name, fx) => {
    const relaxed = fx.relaxed === true;
    const lowerKeyed = (names: ReadonlyArray<string>) =>
      relaxed ? names.map((n) => n.toLowerCase()) : [...names];

    it("P1 gradeSubmissions rows equal the frozen literal L, and graded rows are really graded", async () => {
      installModel(fx.reply);
      gradeState.maxSubmissions = fx.maxSubmissions ?? 50;
      const zip = await buildZip(fx.files);

      const run = await gradeSubmissions(zip, "Write an essay.", RUBRIC, "gemini");

      expect(rowsOf(run.results, relaxed)).toEqual(fx.L);
      const notAttempted = new Set(fx.notAttempted ?? []);
      expect(run.results).toHaveLength(fx.L.length);
      for (const r of run.results as GradeResult[]) {
        if (notAttempted.has(r.student)) {
          expect(r.ungraded?.kind).toBe("not-attempted");
        } else {
          expect(r.ungraded).toBeUndefined();
        }
      }
    });

    it("P2 content sentinels reach the right student name in the model prompt", async () => {
      installModel(fx.reply);
      gradeState.maxSubmissions = fx.maxSubmissions ?? 50;
      const zip = await buildZip(fx.files);

      await gradeSubmissions(zip, "Write an essay.", RUBRIC, "gemini");

      const expected: Record<string, string[]> = {};
      for (const [name, tokens] of Object.entries(fx.sentinels)) {
        expected[relaxed ? name.toLowerCase() : name] = [...tokens].sort();
      }
      expect(sentinelsByStudent(relaxed)).toEqual(expected);
    });

    it("P3 extractStudentEntries with inference equals the SAME literal L", async () => {
      installModel(fx.reply);
      const zip = await buildZip(fx.files);

      const entries: StudentSubmissionEntry[] = await extractStudentEntries(zip, {
        inferFileNamesWith: "gemini",
      });

      expect(rowsOf(entries, relaxed)).toEqual(fx.L);
    });

    if (fx.N) {
      const noOption = fx.N;
      it("P4 extractStudentEntries with no option equals N and makes no model call", async () => {
        installModel(fx.reply);
        const zip = await buildZip(fx.files);

        const entries = await extractStudentEntries(zip);

        expect(entries.map((e) => e.student)).toEqual(lowerKeyed(noOption));
        expect(mockCallLlm).not.toHaveBeenCalled();
      });
    }
  }
);

// ---------------------------------------------------------------------------
// P5: zero-entry outcomes (engine D2 policy) and the extraction counterpart.
// ---------------------------------------------------------------------------

describe("attribution oracle - P5 zero-entry outcomes", () => {
  it("Z1 broken.docx: the engine throws the could-not-extract message naming the file, extraction returns [], no model call", async () => {
    const make = async () => {
      const zip = new JSZip();
      zip.file("broken.docx", "this is not a real docx");
      return zip.generateAsync({ type: "arraybuffer" });
    };

    let message = "";
    try {
      await gradeSubmissions(await make(), "Write an essay.", RUBRIC, "gemini");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message.startsWith("Found supported files, but could not extract text from them.")).toBe(true);
    expect(message).toContain("broken.docx");

    expect(await extractStudentEntries(await make())).toEqual([]);
    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("Z2 notes.bin only: the engine resolves an empty run, extraction returns [], no model call", async () => {
    const make = async () => {
      const zip = new JSZip();
      zip.file("notes.bin", "unsupported extension");
      return zip.generateAsync({ type: "arraybuffer" });
    };

    const run = await gradeSubmissions(await make(), "Write an essay.", RUBRIC, "gemini");
    expect(run.results).toEqual([]);
    expect(await extractStudentEntries(await make())).toEqual([]);
    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("Z3 empty archive: the engine resolves an empty run, extraction returns [], no model call", async () => {
    const make = async () => new JSZip().generateAsync({ type: "arraybuffer" });

    const run = await gradeSubmissions(await make(), "Write an essay.", RUBRIC, "gemini");
    expect(run.results).toEqual([]);
    expect(await extractStudentEntries(await make())).toEqual([]);
    expect(mockCallLlm).not.toHaveBeenCalled();
  });
});
