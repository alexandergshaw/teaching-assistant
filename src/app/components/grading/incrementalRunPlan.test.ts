import { describe, it, expect } from "vitest";
import {
  INCREMENTAL_CONCURRENCY,
  INCREMENTAL_ROUTE_ENABLED,
  ITEM_REQUEST_BYTE_BUDGET,
  routeGradingRun,
  buildRunItemRequests,
  mergeArrivedResults,
  classifyItemFailure,
  estimateEntryWireBytes,
  isTerminal,
  canonicalColumns,
  buildIncrementalRun,
  selectDisplayRun,
  selectRunKey,
  type IncrementalRunPlan,
  type IncrementalPhase,
  type ArrivedItemResult,
} from "./incrementalRunPlan";
import { UPLOAD_WIRE_BUDGET_BYTES, wireBytesForFile } from "@/lib/upload-budget";
import type { GradeResult, GradingRun, GradingRunHeader, StudentSubmissionEntry } from "@/lib/grade/types";

function entry(overrides: Partial<StudentSubmissionEntry> = {}): StudentSubmissionEntry {
  return { student: "Student", content: "content", mergedFileCount: 1, submittedFiles: [], ...overrides };
}

function fd(fields: Record<string, string | File>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

// ---------------------------------------------------------------------------
// W4-12 clause 3 - the per-item budget is compared against
// UPLOAD_WIRE_BUDGET_BYTES by IMPORTING the constant, never a copied number.
// ---------------------------------------------------------------------------
describe("ITEM_REQUEST_BYTE_BUDGET (W4-12 clause 3)", () => {
  it("is UPLOAD_WIRE_BUDGET_BYTES itself (imported, not a re-typed literal)", () => {
    expect(ITEM_REQUEST_BYTE_BUDGET).toBe(UPLOAD_WIRE_BUDGET_BYTES);
  });
});

// ---------------------------------------------------------------------------
// W4-11 - concurrency floor, a pure-predicate claim.
// ---------------------------------------------------------------------------
describe("INCREMENTAL_CONCURRENCY (W4-11)", () => {
  it("matches BULK_GRADE_CONCURRENCY's own value (3) - the shipped production precedent this wave reuses", () => {
    expect(INCREMENTAL_CONCURRENCY).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// W4-12 clause 1 - routeGradingRun by WIRE size and provider, pure/sync.
// ---------------------------------------------------------------------------
describe("routeGradingRun (W4-12 clause 1, S4 step 2: PURE and SYNCHRONOUS)", () => {
  // RULING 116: the incremental route is a thinner surface than whole-run
  // (no RubricProvenance mount, no rubric auto-generation, no
  // blank-instructions refusal) and stays unreachable by default until the
  // owner settles that shape question. Flipping INCREMENTAL_ROUTE_ENABLED on
  // is the only thing that changes these two cases back to "incremental".
  it("RULING 116: INCREMENTAL_ROUTE_ENABLED is off - turning it on must be a deliberate, visible, test-breaking act", () => {
    expect(INCREMENTAL_ROUTE_ENABLED).toBe(false);
  });

  it("RULING 116: with the flag off, a gemini request with a picked file under the wire budget routes to 'whole-run', not 'incremental'", () => {
    const file = new File(["short content"], "a.txt", { type: "text/plain" });
    expect(routeGradingRun(fd({ studentSubmissions: file }), "gemini")).toBe("whole-run");
  });

  it("routes a picked file whose WIRE size exceeds the budget to 'whole-run'", () => {
    // File bytes chosen so wireBytesForFile(fileBytes) > ITEM_REQUEST_BYTE_BUDGET.
    const oversizedBytes = Math.ceil(ITEM_REQUEST_BYTE_BUDGET / (4 / 3)) + 1024;
    const file = new File([new Uint8Array(oversizedBytes)], "big.zip", { type: "application/zip" });
    expect(wireBytesForFile(file.size)).toBeGreaterThan(ITEM_REQUEST_BYTE_BUDGET);
    expect(routeGradingRun(fd({ studentSubmissions: file }), "gemini")).toBe("whole-run");
  });

  it("routes ANY non-gemini provider to 'whole-run', regardless of file size", () => {
    const file = new File(["tiny"], "a.txt", { type: "text/plain" });
    expect(routeGradingRun(fd({ studentSubmissions: file }), "other")).toBe("whole-run");
    expect(routeGradingRun(fd({ studentSubmissions: file }), "embedded")).toBe("whole-run");
  });

  it("RULING 116: with the flag off, a gemini request with a Canvas URL (no file) routes to 'whole-run', not 'incremental'", () => {
    expect(routeGradingRun(fd({ canvasUrl: "https://example.instructure.com/courses/1/assignments/2" }), "gemini")).toBe(
      "whole-run"
    );
  });

  it("routes a form with no file and no canvasUrl to 'whole-run' (lets the existing refusal fire there)", () => {
    expect(routeGradingRun(fd({}), "gemini")).toBe("whole-run");
  });
});

// ---------------------------------------------------------------------------
// W4-3 / W4-5 - buildRunItemRequests / mergeArrivedResults ordering.
// ---------------------------------------------------------------------------
describe("buildRunItemRequests (W4-3)", () => {
  it("builds one request per ticket, carrying the shared plan fields onto every one", () => {
    const plan: IncrementalRunPlan = {
      tickets: [
        { sourceIndex: 0, entry: entry({ student: "Alice" }) },
        { sourceIndex: 1, entry: entry({ student: "Bob" }) },
      ],
      assignmentInstructions: "Write an essay.",
      rubric: "1. Correctness",
      provider: "gemini",
      pointsPossible: null,
    };
    const requests = buildRunItemRequests(plan);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({
      sourceIndex: 0,
      entry: entry({ student: "Alice" }),
      assignmentInstructions: "Write an essay.",
      rubric: "1. Correctness",
      provider: "gemini",
      pointsPossible: null,
    });
    expect(requests[1].sourceIndex).toBe(1);
  });

  // toEqual ignores undefined-valued keys, so the full-object assertion above
  // cannot see an accidental `harshness: undefined`; the `in` check can.
  it("leaves the optional commentSplit and harshness keys unset, so the default wire is unchanged", () => {
    const plan: IncrementalRunPlan = {
      tickets: [{ sourceIndex: 0, entry: entry({ student: "Alice" }) }],
      assignmentInstructions: "Write an essay.",
      rubric: "1. Correctness",
      provider: "gemini",
      pointsPossible: null,
    };
    const requests = buildRunItemRequests(plan);
    expect("harshness" in requests[0]).toBe(false);
    expect("commentSplit" in requests[0]).toBe(false);
    expect("feedbackWordTarget" in requests[0]).toBe(false);
  });
});

describe("mergeArrivedResults (W4-5, RULING 30: a row never moves, it only appears)", () => {
  function graded(student: string): GradeResult {
    return {
      student,
      overallComment: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      rubricAreas: [],
      totalScore: "",
      feedback: "",
      mergedFileCount: 1,
      submittedFiles: [],
    };
  }

  it("returns arrived rows in ASCENDING sourceIndex order, regardless of arrival order", () => {
    const merged = mergeArrivedResults(3, [
      { sourceIndex: 2, result: graded("Chen") },
      { sourceIndex: 0, result: graded("Alice") },
    ]);
    expect(merged.map((r) => r.student)).toEqual(["Alice", "Chen"]);
  });

  it("a pending (not-yet-arrived) index produces NO ROW AT ALL - never a placeholder", () => {
    const merged = mergeArrivedResults(3, [{ sourceIndex: 0, result: graded("Alice") }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].student).toBe("Alice");
  });

  it("WATCHED: an implementation keyed on ARRIVAL ORDER instead of sourceIndex would put Chen before Alice here - this test would go RED against that mutation", () => {
    const arrivedInThisOrder = [
      { sourceIndex: 2, result: graded("Chen") },
      { sourceIndex: 0, result: graded("Alice") },
    ];
    const byArrivalOrder = arrivedInThisOrder.map((a) => a.result.student);
    const bySourceIndex = mergeArrivedResults(3, arrivedInThisOrder).map((r) => r.student);
    expect(bySourceIndex).not.toEqual(byArrivalOrder);
  });

  it("returns an empty array when nothing has arrived yet", () => {
    expect(mergeArrivedResults(5, [])).toEqual([]);
  });

  // F22 (docs/a39-fill-waves.md W5): round 1's F14 required merged.length ===
  // arrived.length AND a duplicate case, which cannot both hold - this file
  // states the two clauses separately instead.
  it("F22(a): an arrived index AT OR ABOVE totalTicketCount is kept, not dropped", () => {
    const merged = mergeArrivedResults(2, [
      { sourceIndex: 0, result: graded("Alice") },
      { sourceIndex: 5, result: graded("OutOfRange") },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((r) => r.student)).toEqual(["Alice", "OutOfRange"]);
  });

  it("F22(b): two arrived rows sharing a sourceIndex - LAST-WINS, by identity", () => {
    const first = graded("First");
    const second = graded("Second");
    const merged = mergeArrivedResults(3, [
      { sourceIndex: 0, result: first },
      { sourceIndex: 0, result: second },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(second);
  });

  it("WATCHED: a first-wins implementation (`if (!has) set`) would keep `first` here - this test goes RED against that mutation", () => {
    const first = graded("First");
    const second = graded("Second");
    const merged = mergeArrivedResults(3, [
      { sourceIndex: 0, result: first },
      { sourceIndex: 0, result: second },
    ]);
    expect(merged[0]).not.toBe(first);
  });
});

describe("classifyItemFailure (per-item isolation: one transport failure is one ordinary ungraded row)", () => {
  function failingEntry(overrides: Partial<StudentSubmissionEntry> = {}): StudentSubmissionEntry {
    return { student: "Dana", content: "x", mergedFileCount: 1, submittedFiles: [], ...overrides };
  }

  it("maps an Error to a grading-failed row carrying GRADING_FAILURE_PREFIX and the sourceIndex", () => {
    const row = classifyItemFailure(3, failingEntry({ student: "Dana" }), new Error("network timeout"));
    expect(row.ungraded).toEqual({
      kind: "grading-failed",
      sourceIndex: 3,
      student: "Dana",
      message: "This submission could not be graded: network timeout",
    });
    expect(row.student).toBe("Dana");
  });

  it("falls back to a generic message for a non-Error rejection", () => {
    const row = classifyItemFailure(0, failingEntry({ student: "Alice" }), "not an Error instance");
    expect(row.ungraded?.message).toBe("This submission could not be graded: The grading service did not respond.");
  });

  // F19's M4 clause (docs/a39-fill-waves.md W5): a failure row must not empty
  // the ticket's own file list.
  it("M4: the failure row carries the TICKET's own mergedFileCount and submittedFiles, not a hardcoded 0/[]", () => {
    const row = classifyItemFailure(
      0,
      failingEntry({
        student: "Dana",
        mergedFileCount: 2,
        submittedFiles: [{ name: "a.png", extension: "png", previewContent: "", previewTruncated: false }],
      }),
      new Error("timeout")
    );
    expect(row.mergedFileCount).toBe(2);
    expect(row.submittedFiles).toEqual([{ name: "a.png", extension: "png", previewContent: "", previewTruncated: false }]);
  });

  it("WATCHED: hardcoding mergedFileCount: 0 / submittedFiles: [] would fail the M4 assertion above", () => {
    const row = classifyItemFailure(0, failingEntry({ mergedFileCount: 4, submittedFiles: [] }), new Error("x"));
    expect(row.mergedFileCount).not.toBe(0);
  });
});

describe("estimateEntryWireBytes", () => {
  it("counts content length plus every attached file's rawBase64 length", () => {
    const bytes = estimateEntryWireBytes(
      entry({
        content: "12345",
        submittedFiles: [
          { name: "a.png", extension: "png", previewContent: "", previewTruncated: false, rawBase64: "abcd" },
          { name: "b.png", extension: "png", previewContent: "", previewTruncated: false },
        ],
      })
    );
    expect(bytes).toBe(5 + 4);
  });
});

// ---------------------------------------------------------------------------
// A39 incremental-fill W5 (docs/a39-fill-waves.md; docs/a39-incremental-fill-
// architecture.md section 5.3, 6.2, 6.3, 7.2): the phase machine and the
// run-assembly leaf.
// ---------------------------------------------------------------------------

const ALL_PHASES: IncrementalPhase[] = ["idle", "running", "stopping", "stopped", "complete", "refused"];

function okHeader(overrides: Partial<Extract<GradingRunHeader, { kind: "ok" }>> = {}): Extract<
  GradingRunHeader,
  { kind: "ok" }
> {
  return {
    kind: "ok",
    effectiveRubric: "",
    generatedRubric: undefined,
    criteriaNames: [],
    rubricUsed: "",
    rubricFingerprint: "",
    ...overrides,
  };
}

function areaRow(sourceIndex: number, student: string, areas: string[]): ArrivedItemResult {
  return {
    sourceIndex,
    result: {
      student,
      overallComment: "",
      strengths: "",
      improvements: "",
      resubmitNotice: "",
      rubricAreas: areas.map((area) => ({ area, score: "8/10", comment: "" })),
      totalScore: "",
      feedback: "",
      mergedFileCount: 1,
      submittedFiles: [],
    },
  };
}

function stubRun(tag: string): GradingRun {
  return { results: [], rubricAreaNames: [tag], fullCreditChecklist: [] };
}

describe("isTerminal", () => {
  it("is true for exactly complete and stopped, over all six phases", () => {
    const expected: Record<IncrementalPhase, boolean> = {
      idle: false,
      running: false,
      stopping: false,
      stopped: true,
      complete: true,
      refused: false,
    };
    for (const phase of ALL_PHASES) expect(isTerminal(phase)).toBe(expected[phase]);
  });
});

describe("selectDisplayRun (F7): total over all six phases x (incremental null/non-null) x (whole null/non-null)", () => {
  const incRun = stubRun("incremental");
  const wholeRun = stubRun("whole");

  it("returns wholeRun for idle and incrementalRun for every other phase - all 24 combinations", () => {
    for (const phase of ALL_PHASES) {
      for (const inc of [incRun, null]) {
        for (const whole of [wholeRun, null]) {
          const expected = phase === "idle" ? whole : inc;
          expect(selectDisplayRun(phase, inc, whole)).toBe(expected);
        }
      }
    }
  });

  it("WATCHED: `incrementalRun ?? wholeRun` would show a stale incremental run while idle - RED against that mutation", () => {
    expect(selectDisplayRun("idle", incRun, wholeRun)).not.toBe(incRun);
  });

  it("WATCHED: a default branch returning wholeRun would break the refused row", () => {
    expect(selectDisplayRun("refused", incRun, wholeRun)).not.toBe(wholeRun);
  });
});

describe("selectRunKey (F8): undefined for exactly idle, stable in runId", () => {
  it("is undefined only for idle; every other phase returns 'incremental-<runId>'", () => {
    for (const phase of ALL_PHASES) {
      const key = selectRunKey(phase, 7);
      if (phase === "idle") expect(key).toBeUndefined();
      else expect(key).toBe("incremental-7");
    }
  });

  it("is stable across a phase change within the SAME runId, and changes when runId changes", () => {
    expect(selectRunKey("running", 7)).toBe(selectRunKey("complete", 7));
    expect(selectRunKey("running", 7)).not.toBe(selectRunKey("running", 8));
  });

  it("WATCHED: returning a key for idle too would break the whole-run path's reference comparison (5.7 obligation 1)", () => {
    expect(selectRunKey("idle", 7)).not.toBe("incremental-7");
  });
});

// describeRunProgress and shouldShowEmptyState (F12) moved to
// runProgressCopy.test.ts (RES-P-4: incrementalRunPlan.ts exceeded its -le
// 300 bound, and the design names this exact extraction for that case).

describe("canonicalColumns / buildIncrementalRun (F20, RULING 132): prefix stability during the run, determinism at the end", () => {
  const header = okHeader();
  const rowClarity = areaRow(0, "Alice", ["Clarity"]);
  const rowStructure = areaRow(1, "Bob", ["Structure"]);
  const rowGrammar = areaRow(2, "Chen", ["Grammar"]);

  function build(arrived: ArrivedItemResult[], phase: IncrementalPhase): GradingRun {
    return buildIncrementalRun({ header, speedGraderUrl: null, totalTicketCount: 3, arrived, phase, tier2: null });
  }

  it("branch 1: non-empty criteriaNames is returned verbatim, frozen for the whole run, regardless of phase or arrivals", () => {
    const withCriteria = okHeader({ criteriaNames: ["Alpha", "Beta"] });
    expect(canonicalColumns(withCriteria, [], [], "running")).toEqual(["Alpha", "Beta"]);
    expect(canonicalColumns(withCriteria, [rowClarity], [], "complete")).toEqual(["Alpha", "Beta"]);
  });

  it("(a) the TERMINAL rubricAreaNames is deep-equal across two different arrival orders", () => {
    const orderA = [rowClarity, rowStructure, rowGrammar];
    const orderB = [rowGrammar, rowClarity, rowStructure];
    const terminalA = build(orderA, "complete").rubricAreaNames;
    const terminalB = build(orderB, "complete").rubricAreaNames;
    expect(terminalA).toEqual(terminalB);
    expect(terminalA).toEqual(["Clarity", "Structure", "Grammar"]); // dense, ascending sourceIndex
  });

  it("(b) within EACH order, every intermediate rubricAreaNames is a PREFIX of the next", () => {
    const order = [rowStructure, rowGrammar, rowClarity]; // arrival order != sourceIndex order
    let soFar: ArrivedItemResult[] = [];
    let previous: string[] = [];
    for (const item of order) {
      soFar = [...soFar, item];
      const current = build(soFar, "running").rubricAreaNames;
      expect(current.slice(0, previous.length)).toEqual(previous);
      previous = current;
    }
    expect(previous).toEqual(["Structure", "Grammar", "Clarity"]);
  });

  it("WATCHED (a): dropping the terminal normalisation (arrival order survives to completion) makes the two orders disagree", () => {
    const orderA = [rowClarity, rowStructure, rowGrammar];
    const orderB = [rowGrammar, rowClarity, rowStructure];
    const nonTerminalA = build(orderA, "running").rubricAreaNames;
    const nonTerminalB = build(orderB, "running").rubricAreaNames;
    expect(nonTerminalA).not.toEqual(nonTerminalB);
  });

  it("WATCHED (b): sorting by ascending sourceIndex DURING the run lets a later-arriving lower index jump ahead of an already-read column", () => {
    const afterTwo = build([rowStructure, rowGrammar], "running").rubricAreaNames;
    expect(afterTwo).toEqual(["Structure", "Grammar"]);
    // Alice (sourceIndex 0) arrives LAST. Prefix-stable (arrival order): the
    // already-read Structure/Grammar prefix must not move.
    const aliceArrivesLast = build([rowStructure, rowGrammar, rowClarity], "running").rubricAreaNames;
    expect(aliceArrivesLast.slice(0, 2)).toEqual(afterTwo);
    // A sourceIndex-sorted implementation would instead put Clarity FIRST.
    expect(aliceArrivesLast).not.toEqual(["Clarity", "Structure", "Grammar"]);
  });
});

// Freezes IN PLACE and returns the SAME reference with its original static
// type - unlike Object.freeze's own `Readonly<T>` return type, which would
// force every nested array in the fixture below to widen to `readonly`.
function deepFreeze<T>(value: T): T {
  Object.freeze(value);
  return value;
}

describe("buildIncrementalRun (F21): never consumes its own reconciled output; arrived stays raw for the life of the run", () => {
  const header = okHeader();
  const rowClarity = areaRow(0, "Alice", ["Clarity"]);
  const rowStructure = areaRow(1, "Bob", ["Structure"]);

  it("accepts a deep-frozen arrived array and rows without throwing (it never writes back into them)", () => {
    const frozenResult = deepFreeze({ ...rowClarity.result, rubricAreas: deepFreeze([...rowClarity.result.rubricAreas]) });
    const frozenArrived = deepFreeze([deepFreeze({ sourceIndex: 0, result: frozenResult })]);
    expect(() =>
      buildIncrementalRun({ header, speedGraderUrl: null, totalTicketCount: 1, arrived: frozenArrived, phase: "running", tier2: null })
    ).not.toThrow();
  });

  it("two successive calls with a GROWING canonical set produce the same output as two INDEPENDENT first calls over the same raw rows", () => {
    const grown = [rowClarity, rowStructure];
    const first = buildIncrementalRun({ header, speedGraderUrl: null, totalTicketCount: 2, arrived: [rowClarity], phase: "running", tier2: null });
    expect(first.rubricAreaNames).toEqual(["Clarity"]);

    const second = buildIncrementalRun({ header, speedGraderUrl: null, totalTicketCount: 2, arrived: grown, phase: "running", tier2: null });
    const independentFirst = buildIncrementalRun({ header, speedGraderUrl: null, totalTicketCount: 2, arrived: grown, phase: "running", tier2: null });

    expect(second).toEqual(independentFirst);
    // WATCHED: if `second` had consumed `first`'s own (already-reconciled)
    // output as its raw input, Bob's Structure score would have been folded
    // into a stray comment on Alice's row instead of appearing as its own
    // column (6.3's true mechanism) - this equality would then fail.
    expect(second.rubricAreaNames).toEqual(["Clarity", "Structure"]);
  });
});
