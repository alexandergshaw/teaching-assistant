// N15a Wave 1 (docs/n15-one-upload-per-student-scope.md sections 1, 3): drives
// useOneUploadRun with the same no-render vi.mock("react", ...) harness
// useIncrementalGradingRun.lifecycle.test.ts uses (copied, not imported:
// no-cross-test-file-imports). Proves, to the extent node allows:
//  - two identically-named uploads reach /api/grade-run-item as DISTINCT
//    students ("scan" / "scan (2)") with distinct sourceIndex, including when
//    their builds resolve out of order;
//  - consecutive dispatches are at least the server's delay apart (fake clock);
//  - exactly one grade_item diagnostic per settled upload, with the right
//    outcome, carrying no student label.
// The real-browser concurrent-upload timing is RES-N15M-7 (owner walk).
import { beforeEach, describe, expect, it, vi } from "vitest";

const h0 = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = [];
  let cursor = 0;
  return {
    reset: () => {
      slots.length = 0;
      cursor = 0;
    },
    begin: () => {
      cursor = 0;
    },
    useState: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init };
      const s = slots[i];
      return [
        s.value,
        (next: unknown) => {
          s.value = typeof next === "function" ? (next as (prev: unknown) => unknown)(s.value) : next;
        },
      ];
    },
    useRef: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: { current: init } };
      return slots[i].value;
    },
  };
});

vi.mock("react", () => ({
  useState: h0.useState,
  useRef: h0.useRef,
  default: { useState: h0.useState, useRef: h0.useRef },
}));

const buildMock = vi.fn();
vi.mock("@/app/actions/grading-one-upload", () => ({
  gradingOneUploadAction: (...args: unknown[]) => buildMock(...args),
}));

const recordMock = vi.fn();
vi.mock("./gradingDiagnosticLog", () => ({
  recordGradingDiagnosticEntry: (...args: unknown[]) => recordMock(...args),
}));

import { useOneUploadRun } from "./useOneUploadRun";
import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";
import type { GradeRunItemRequestBody } from "./incrementalRunPlan";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function entryFor(student: string): StudentSubmissionEntry {
  return { student, content: "work", mergedFileCount: 1, submittedFiles: [] };
}

function gradedRow(student: string): GradeResult {
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

const CONTEXT = { assignmentInstructions: "Grade it.", rubric: "1. Correctness" };

let clock = 0;
let dispatchTimes: number[] = [];
let posted: GradeRunItemRequestBody[] = [];
let failNextPost = false;

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as GradeRunItemRequestBody;
      dispatchTimes.push(clock);
      posted.push(body);
      clock += 100;
      if (failNextPost) {
        failNextPost = false;
        return { ok: false, json: async () => ({ error: "boom" }) };
      }
      return { ok: true, json: async () => ({ sourceIndex: body.sourceIndex, result: gradedRow(body.entry.student) }) };
    })
  );
}

let rejections: Array<string | null> = [];

function useRender() {
  h0.begin();
  return useOneUploadRun({
    provider: "gemini",
    modeStorageKey: "ta-test-one-upload",
    onReject: (message) => {
      rejections.push(message);
    },
    now: () => clock,
    sleep: async (ms: number) => {
      clock += ms;
    },
  });
}

beforeEach(() => {
  h0.reset();
  clock = 1_000_000;
  dispatchTimes = [];
  posted = [];
  failNextPost = false;
  rejections = [];
  buildMock.mockReset();
  recordMock.mockReset();
  installFetch();
});

describe("useOneUploadRun - identity", () => {
  it("grades two identically-named uploads as distinct students", async () => {
    buildMock.mockResolvedValue({ ok: true, entry: entryFor("scan"), interRequestDelayMs: 0 });
    const hook = useRender();
    await hook.enqueueUpload(new File(["a"], "scan.jpg"), CONTEXT);
    await hook.enqueueUpload(new File(["b"], "scan.jpg"), CONTEXT);
    await flush();

    expect(posted.map((p) => p.entry.student)).toEqual(["scan", "scan (2)"]);
    expect(posted.map((p) => p.sourceIndex)).toEqual([0, 1]);
    const run = useRender().run;
    expect(run?.results.map((r) => r.student)).toEqual(["scan", "scan (2)"]);
  });

  it("keeps displays distinct when two builds resolve back to back, out of order", async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    buildMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const hook = useRender();
    const a = hook.enqueueUpload(new File(["a"], "scan.jpg"), CONTEXT);
    const b = hook.enqueueUpload(new File(["b"], "scan.jpg"), CONTEXT);
    second.resolve({ ok: true, entry: entryFor("scan"), interRequestDelayMs: 0 });
    first.resolve({ ok: true, entry: entryFor("scan"), interRequestDelayMs: 0 });
    await Promise.all([a, b]);
    await flush();

    expect(new Set(posted.map((p) => p.entry.student)).size).toBe(2);
    expect(new Set(posted.map((p) => p.sourceIndex)).size).toBe(2);
  });
});

describe("useOneUploadRun - label override", () => {
  it("sends the typed label with the build request and consumes it on pick", async () => {
    buildMock.mockResolvedValue({ ok: true, entry: entryFor("Ada"), interRequestDelayMs: 0 });
    const hook = useRender();
    hook.setLabel("Ada");
    expect(useRender().label).toBe("Ada");
    hook.pick({ files: [new File(["1"], "a.txt")], value: "a.txt" }, CONTEXT);
    await flush();

    const sent = buildMock.mock.calls[0][0] as FormData;
    expect(sent.get("label")).toBe("Ada");
    expect(useRender().label).toBe("");
    useRender().pick({ files: [new File(["2"], "b.txt")], value: "b.txt" }, CONTEXT);
    await flush();
    expect((buildMock.mock.calls[1][0] as FormData).has("label")).toBe(false);
  });

  it("keeps the typed label when the pick is refused by preflight", () => {
    const hook = useRender();
    hook.setLabel("Ada");
    hook.pick({ files: [new File([new Uint8Array(3_000_000)], "big.jpg")], value: "big.jpg" }, CONTEXT);
    expect(useRender().label).toBe("Ada");
  });

  it("cannot collide two identical overrides, or an override and an inferred name, into one row", async () => {
    buildMock
      .mockResolvedValueOnce({ ok: true, entry: entryFor("Ada"), interRequestDelayMs: 0 })
      .mockResolvedValueOnce({ ok: true, entry: entryFor("Ada"), interRequestDelayMs: 0 })
      .mockResolvedValueOnce({ ok: true, entry: entryFor("Ada"), interRequestDelayMs: 0 });
    const hook = useRender();
    await hook.enqueueUpload(new File(["a"], "x.txt"), { ...CONTEXT, label: "Ada" });
    await hook.enqueueUpload(new File(["b"], "y.txt"), { ...CONTEXT, label: "Ada" });
    await hook.enqueueUpload(new File(["c"], "Ada.txt"), CONTEXT);
    await flush();

    expect(posted.map((p) => p.entry.student)).toEqual(["Ada", "Ada (2)", "Ada (3)"]);
    expect(posted.map((p) => p.sourceIndex)).toEqual([0, 1, 2]);
  });
});

describe("useOneUploadRun - pacing", () => {
  it("spaces consecutive dispatches at least the server delay apart", async () => {
    buildMock.mockImplementation(async () => ({ ok: true, entry: entryFor("Ada"), interRequestDelayMs: 4000 }));
    const hook = useRender();
    await hook.enqueueUpload(new File(["1"], "a.txt"), CONTEXT);
    await hook.enqueueUpload(new File(["2"], "b.txt"), CONTEXT);
    await hook.enqueueUpload(new File(["3"], "c.txt"), CONTEXT);
    await flush();

    expect(dispatchTimes).toHaveLength(3);
    for (let i = 1; i < dispatchTimes.length; i += 1) {
      expect(dispatchTimes[i] - dispatchTimes[i - 1]).toBeGreaterThanOrEqual(4000);
    }
  });
});

describe("useOneUploadRun - diagnostic", () => {
  it("records exactly one grade_item entry per settled upload with the right outcome and no label", async () => {
    buildMock.mockImplementation(async () => ({ ok: true, entry: entryFor("Grace Hopper"), interRequestDelayMs: 0 }));
    const hook = useRender();
    await hook.enqueueUpload(new File(["1"], "a.txt"), CONTEXT);
    await flush();
    failNextPost = true;
    await hook.enqueueUpload(new File(["2"], "b.txt"), CONTEXT);
    await flush();

    expect(recordMock).toHaveBeenCalledTimes(2);
    const calls = recordMock.mock.calls.map((c) => c[0] as Record<string, unknown>);
    expect(calls.map((c) => c.operation)).toEqual(["grade_item", "grade_item"]);
    expect(calls.map((c) => c.outcome)).toEqual(["success", "failure"]);
    expect(calls[1].error).toBe("boom");
    for (const c of calls) {
      expect(typeof c.durationMs).toBe("number");
      expect(JSON.stringify(c)).not.toContain("Grace");
    }
  });

  it("a refused build records nothing, posts nothing, and surfaces the reason", async () => {
    buildMock.mockResolvedValue({ ok: false, reason: "Please provide assignment instructions." });
    const hook = useRender();
    await hook.enqueueUpload(new File(["1"], "a.txt"), CONTEXT);
    await flush();

    expect(posted).toHaveLength(0);
    expect(recordMock).not.toHaveBeenCalled();
    expect(rejections.filter((r) => r !== null)).toEqual(["Please provide assignment instructions."]);
    expect(useRender().inFlight).toBe(0);
  });
});

describe("useOneUploadRun - pick", () => {
  it("preflights, clears the input, and enqueues a valid pick", async () => {
    buildMock.mockResolvedValue({ ok: true, entry: entryFor("Ada"), interRequestDelayMs: 0 });
    const input = { files: [new File(["1"], "a.txt")], value: "a.txt" };
    useRender().pick(input, CONTEXT);
    await flush();

    expect(input.value).toBe("");
    expect(posted).toHaveLength(1);
  });

  it("rejects an over-budget pick through onReject without building or posting", () => {
    const input = { files: [new File([new Uint8Array(3_000_000)], "big.jpg")], value: "big.jpg" };
    useRender().pick(input, CONTEXT);

    expect(input.value).toBe("");
    expect(buildMock).not.toHaveBeenCalled();
    expect(posted).toHaveLength(0);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]).toContain("Nothing was uploaded");
  });

  it("ignores an empty pick", () => {
    useRender().pick({ files: [], value: "" }, CONTEXT);
    expect(buildMock).not.toHaveBeenCalled();
  });
});
