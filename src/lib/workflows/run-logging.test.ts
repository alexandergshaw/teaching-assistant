import { describe, it, expect, vi } from "vitest";
import {
  createProgressCollector,
  summaryToLogText,
  safeStartWorkflowRun,
  logStepOutcome,
  MAX_PROGRESS_MESSAGES_PER_STEP,
  PARTIAL_FAILURE_OUTPUT_KEY,
  readPartialFailureDetail,
  SAVED_ZIP_OUTPUT_KEY,
  readSavedZipRef,
  collectSavedZipRefs,
  type RunLogContext,
} from "./run-logging";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Hand-rolled fake Supabase client, following the inline-fake approach used
// in workflow-runs.test.ts: each test builds exactly the chain the function
// under test calls, and records the insert payload.

interface RecordedInsert {
  table: string;
  row: Record<string, unknown>;
}

function makeSupabase(opts?: { rejectInsert?: boolean; errorOnInsert?: string }) {
  const inserts: RecordedInsert[] = [];
  const client = {
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        if (opts?.rejectInsert) throw new Error("insert rejected");
        if (opts?.errorOnInsert) return { error: { message: opts.errorOnInsert } };
        return { error: null };
      },
      upsert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        if (opts?.rejectInsert) throw new Error("upsert rejected");
        if (opts?.errorOnInsert) return { error: { message: opts.errorOnInsert } };
        return { error: null };
      },
    }),
  };
  return { client: client as unknown as SupabaseClient<Database>, inserts };
}

describe("createProgressCollector", () => {
  it("collects messages in order", () => {
    const collector = createProgressCollector();
    collector.onProgress("a");
    collector.onProgress("b");
    collector.onProgress("c");
    expect(collector.messages).toEqual(["a", "b", "c"]);
  });

  it("caps at MAX_PROGRESS_MESSAGES_PER_STEP, silently dropping the rest", () => {
    const collector = createProgressCollector();
    for (let i = 0; i < MAX_PROGRESS_MESSAGES_PER_STEP + 50; i++) {
      collector.onProgress(`msg-${i}`);
    }
    expect(collector.messages).toHaveLength(MAX_PROGRESS_MESSAGES_PER_STEP);
    expect(collector.messages[0]).toBe("msg-0");
    expect(collector.messages[MAX_PROGRESS_MESSAGES_PER_STEP - 1]).toBe(`msg-${MAX_PROGRESS_MESSAGES_PER_STEP - 1}`);
  });

  it("a fresh collector starts empty", () => {
    expect(createProgressCollector().messages).toEqual([]);
  });
});

describe("summaryToLogText", () => {
  it("returns null for a null/undefined summary", () => {
    expect(summaryToLogText(null)).toBeNull();
    expect(summaryToLogText(undefined)).toBeNull();
  });

  it("trims a text summary, and returns null for an empty/whitespace one", () => {
    expect(summaryToLogText({ kind: "text", text: "  hello  " })).toBe("hello");
    expect(summaryToLogText({ kind: "text", text: "   " })).toBeNull();
  });

  it("renders a list summary with its label and one bulleted item per line (not comma-joined), and null for an empty list", () => {
    // One item per line, not comma-joined (regression: a batch step's list
    // summary - e.g. one entry per graded repo - used to collapse into a
    // single unscannable run-on line in the downloadable log).
    expect(summaryToLogText({ kind: "list", label: "Items", items: ["a", "b"] })).toBe("Items:\n- a\n- b");
    expect(summaryToLogText({ kind: "list", label: "Items", items: [] })).toBeNull();
  });

  it("renders a link summary", () => {
    expect(summaryToLogText({ kind: "link", label: "Open", url: "https://x.test" })).toBe("Open: https://x.test");
  });

  it("renders a schedule summary from its course title", () => {
    expect(summaryToLogText({ kind: "schedule", courseTitle: "CS 101", schedule: [], csv: "" })).toBe(
      "Schedule generated for CS 101"
    );
    expect(summaryToLogText({ kind: "schedule", courseTitle: "", schedule: [], csv: "" })).toBe("Schedule generated");
  });
});

// U7-AC2: PARTIAL_FAILURE_OUTPUT_KEY/readPartialFailureDetail are the
// convention a step's `outputs` bag uses to say "I completed, but some of my
// own units of work failed" - a plain key on the already-untyped
// `Record<string, unknown>` outputs bag, not a new field on StepRunResult or
// WorkflowRunStepStatus. server-runner.ts reads this into a step's LOGGED
// `error` while its `status` stays "done" (RCA19 - graceful degradation is
// unaffected).
describe("readPartialFailureDetail", () => {
  it("reads a non-empty string value at PARTIAL_FAILURE_OUTPUT_KEY", () => {
    expect(readPartialFailureDetail({ [PARTIAL_FAILURE_OUTPUT_KEY]: "15 of 16 failed." })).toBe("15 of 16 failed.");
  });

  it("returns null when the key is absent (the ordinary, fully-successful case)", () => {
    expect(readPartialFailureDetail({ files: [], announcementCount: 3 })).toBeNull();
  });

  it("returns null for a non-string value at the key, rather than throwing", () => {
    expect(readPartialFailureDetail({ [PARTIAL_FAILURE_OUTPUT_KEY]: 42 as unknown as string })).toBeNull();
    expect(readPartialFailureDetail({ [PARTIAL_FAILURE_OUTPUT_KEY]: null as unknown as string })).toBeNull();
  });

  it("returns null for an all-whitespace string, rather than logging a blank error line", () => {
    expect(readPartialFailureDetail({ [PARTIAL_FAILURE_OUTPUT_KEY]: "   " })).toBeNull();
  });

  it("is defensive about null/undefined outputs", () => {
    expect(readPartialFailureDetail(null)).toBeNull();
    expect(readPartialFailureDetail(undefined)).toBeNull();
  });

  // SABOTAGE CHECK: confirmed by hand that inlining `outputs?.[key] ?? null`
  // (dropping the `typeof value === "string" && value.trim()` guard) makes
  // the "non-string value" and "all-whitespace" tests above fail - a raw 42
  // or an all-whitespace string would pass straight through instead of
  // being treated as "no partial failure".
  it("SABOTAGE-checked: a non-string/whitespace-only value is rejected, not merely passed through", () => {
    expect(readPartialFailureDetail({ [PARTIAL_FAILURE_OUTPUT_KEY]: 0 as unknown as string })).toBeNull();
  });
});

// U9-AC1: SAVED_ZIP_OUTPUT_KEY/readSavedZipRef are the same private-
// output-key convention as PARTIAL_FAILURE_OUTPUT_KEY above -
// "save-zip-to-course" (steps.course-setup.storage.ts) publishes exactly
// which course id + file name it saved, so the post-run completion stage
// (server-runner.ts, and a server action for the attended path) can find
// that EXACT file rather than guessing at the naming convention.
describe("readSavedZipRef", () => {
  it("reads a well-formed {courseId, fileName} value at SAVED_ZIP_OUTPUT_KEY", () => {
    expect(
      readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: { courseId: "course-1", fileName: "MGT 422 Course Materials.zip" } })
    ).toEqual({ courseId: "course-1", fileName: "MGT 422 Course Materials.zip" });
  });

  it("returns null when the key is absent (nothing was saved, e.g. the 'no files to bundle' path)", () => {
    expect(readSavedZipRef({})).toBeNull();
  });

  it("is defensive about null/undefined outputs", () => {
    expect(readSavedZipRef(null)).toBeNull();
    expect(readSavedZipRef(undefined)).toBeNull();
  });

  it("returns null for a malformed value - not an object, or missing/empty courseId or fileName", () => {
    expect(readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: "course-1" })).toBeNull();
    expect(readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: null })).toBeNull();
    expect(readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: { courseId: "", fileName: "a.zip" } })).toBeNull();
    expect(readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: { courseId: "course-1", fileName: "" } })).toBeNull();
    expect(readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: { courseId: "course-1" } })).toBeNull();
    expect(readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: { courseId: 42, fileName: "a.zip" } })).toBeNull();
  });

  // SABOTAGE CHECK: confirmed by hand that replacing the courseId/fileName
  // type+non-empty guards with a bare `value as SavedCourseZipRef` cast makes
  // the "malformed value" test above fail - a string, null, or a
  // partial/wrong-typed object would pass straight through as if it were a
  // valid reference instead of being rejected.
  it("SABOTAGE-checked: a malformed value is rejected, not merely cast through", () => {
    expect(readSavedZipRef({ [SAVED_ZIP_OUTPUT_KEY]: [] })).toBeNull();
  });
});

describe("collectSavedZipRefs", () => {
  it("collects the savedZip of every DONE outcome that carries one", () => {
    const refs = collectSavedZipRefs([
      { status: "done", savedZip: { courseId: "c1", fileName: "a.zip" } },
      { status: "done" },
      { status: "error", savedZip: { courseId: "c2", fileName: "b.zip" } },
    ]);
    expect(refs).toEqual([{ courseId: "c1", fileName: "a.zip" }]);
  });

  it("ignores a savedZip on a non-done outcome (disabled/skipped/error/needs-interaction never actually saved)", () => {
    expect(
      collectSavedZipRefs([
        { status: "disabled", savedZip: { courseId: "c1", fileName: "a.zip" } },
        { status: "skipped", savedZip: { courseId: "c2", fileName: "b.zip" } },
        { status: "needs-interaction", savedZip: { courseId: "c3", fileName: "c.zip" } },
      ])
    ).toEqual([]);
  });

  it("returns an empty list for no outcomes and for outcomes with no savedZip at all", () => {
    expect(collectSavedZipRefs([])).toEqual([]);
    expect(collectSavedZipRefs([{ status: "done" }, { status: "error" }])).toEqual([]);
  });

  it("deduplicates by (courseId, fileName) - a fan-out that saved the same zip twice yields one entry", () => {
    const refs = collectSavedZipRefs([
      { status: "done", savedZip: { courseId: "c1", fileName: "a.zip" } },
      { status: "done", savedZip: { courseId: "c1", fileName: "a.zip" } },
    ]);
    expect(refs).toEqual([{ courseId: "c1", fileName: "a.zip" }]);
  });

  it("keeps two distinct saves from a multi-course fan-out as separate entries", () => {
    const refs = collectSavedZipRefs([
      { status: "done", savedZip: { courseId: "c1", fileName: "a.zip" } },
      { status: "done", savedZip: { courseId: "c2", fileName: "b.zip" } },
    ]);
    expect(refs).toEqual([
      { courseId: "c1", fileName: "a.zip" },
      { courseId: "c2", fileName: "b.zip" },
    ]);
  });

  // SABOTAGE CHECK: confirmed by hand that dropping the `o.status !== "done"`
  // filter (collecting a savedZip regardless of the outcome's own status)
  // makes the "ignores a savedZip on a non-done outcome" test above fail -
  // three refs would be collected instead of zero.
  it("SABOTAGE-checked: status filtering is load-bearing, not incidental", () => {
    expect(collectSavedZipRefs([{ status: "error", savedZip: { courseId: "c1", fileName: "a.zip" } }])).toEqual([]);
  });
});

describe("safeStartWorkflowRun", () => {
  it("upserts a running row via startWorkflowRun", async () => {
    const { client, inserts } = makeSupabase();
    await safeStartWorkflowRun(client, "u1", {
      id: "run-1", workflowId: "wf-1", workflowName: "Weekly Announcement", triggerSource: "manual",
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row).toMatchObject({ id: "run-1", user_id: "u1", workflow_id: "wf-1", status: "running" });
  });

  it("swallows a rejection from startWorkflowRun instead of throwing (R6)", async () => {
    const { client } = makeSupabase({ rejectInsert: true });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      safeStartWorkflowRun(client, "u1", { id: "run-1", workflowId: "wf-1", workflowName: "W", triggerSource: "schedule" })
    ).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("swallows an error-object response from startWorkflowRun (it throws internally on {error}) instead of rejecting", async () => {
    const { client } = makeSupabase({ errorOnInsert: "boom" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      safeStartWorkflowRun(client, "u1", { id: "run-1", workflowId: "wf-1", workflowName: "W", triggerSource: "trigger" })
    ).resolves.toBeUndefined();
    consoleSpy.mockRestore();
  });

  it("redacts fieldValues BEFORE the upsert - a raw credential-shaped value never reaches the write (AC2/AC3)", async () => {
    const { client, inserts } = makeSupabase();
    await safeStartWorkflowRun(client, "u1", {
      id: "run-1", workflowId: "wf-1", workflowName: "W", triggerSource: "schedule",
      fieldValues: { institution: "MIT", canvasApiToken: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" },
    });
    const written = inserts[0].row.field_values as Record<string, string>;
    expect(written.institution).toBe("MIT");
    expect(written.canvasApiToken).toBe("[REDACTED]");
    expect(JSON.stringify(written)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("renders an empty field value visibly rather than omitting it - this is what makes 'Institution: None' diagnosable", async () => {
    const { client, inserts } = makeSupabase();
    await safeStartWorkflowRun(client, "u1", {
      id: "run-1", workflowId: "wf-1", workflowName: "W", triggerSource: "schedule",
      fieldValues: { institution: "" },
    });
    const written = inserts[0].row.field_values as Record<string, string>;
    expect(written.institution).toBe("(empty)");
  });

  it("writes field_values: null when no fieldValues are given", async () => {
    const { client, inserts } = makeSupabase();
    await safeStartWorkflowRun(client, "u1", { id: "run-1", workflowId: "wf-1", workflowName: "W", triggerSource: "manual" });
    expect(inserts[0].row.field_values).toBeNull();
  });
});

describe("logStepOutcome", () => {
  const timing = { startedAt: "2026-07-27T10:00:00.000Z", finishedAt: "2026-07-27T10:00:01.000Z" };

  it("is a no-op (never calls the client) when runLog is undefined", async () => {
    await expect(
      logStepOutcome(undefined, { index: 0, type: "x", status: "done", error: null, summary: null }, timing, [])
    ).resolves.toBeUndefined();
    // Nothing to assert on a client since none was ever constructed - the
    // function must simply return without touching anything.
  });

  it("inserts a step row with the rendered summary, timing, and progress", async () => {
    const { client, inserts } = makeSupabase();
    const runLog: RunLogContext = { supabase: client, userId: "u1", runId: "run-1" };
    await logStepOutcome(
      runLog,
      { index: 2, type: "post-announcement", status: "done", error: null, summary: { kind: "text", text: "Posted" }, institution: "AAA", courseId: "c1" },
      timing,
      ["step one", "step two"]
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row).toMatchObject({
      run_id: "run-1",
      user_id: "u1",
      step_index: 2,
      step_type: "post-announcement",
      status: "done",
      summary: "Posted",
      progress: ["step one", "step two"],
      started_at: timing.startedAt,
      finished_at: timing.finishedAt,
      institution: "AAA",
      course_id: "c1",
    });
  });

  it("passes courseName through to the step row's course_name column", async () => {
    const { client, inserts } = makeSupabase();
    const runLog: RunLogContext = { supabase: client, userId: "u1", runId: "run-1" };
    await logStepOutcome(
      runLog,
      { index: 0, type: "grade-repo", status: "done", error: null, summary: null, courseId: "c1", courseName: "Prescriptive AI" },
      timing,
      []
    );
    expect(inserts[0].row).toMatchObject({ course_id: "c1", course_name: "Prescriptive AI" });
  });

  it("passes the FULL error text through untruncated", async () => {
    const { client, inserts } = makeSupabase();
    const runLog: RunLogContext = { supabase: client, userId: "u1", runId: "run-1" };
    const longError = "x".repeat(2000);
    await logStepOutcome(runLog, { index: 0, type: "t", status: "error", error: longError, summary: null }, timing, []);
    expect((inserts[0].row.error as string).length).toBe(2000);
  });

  it("never rejects even when the underlying write rejects (R6)", async () => {
    const { client } = makeSupabase({ rejectInsert: true });
    const runLog: RunLogContext = { supabase: client, userId: "u1", runId: "run-1" };
    await expect(
      logStepOutcome(runLog, { index: 0, type: "t", status: "error", error: "boom", summary: null }, timing, [])
    ).resolves.toBeUndefined();
  });

  it("redacts the resolved inputs BEFORE the insert - a raw credential-shaped value never reaches the write (AC2)", async () => {
    const { client, inserts } = makeSupabase();
    const runLog: RunLogContext = { supabase: client, userId: "u1", runId: "run-1" };
    await logStepOutcome(
      runLog,
      { index: 0, type: "grade-repo", status: "done", error: null, summary: null },
      timing,
      [],
      { repo: "org/repo", apiToken: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" }
    );
    const written = inserts[0].row.inputs as Record<string, string>;
    expect(written.repo).toBe("org/repo");
    expect(written.apiToken).toBe("[REDACTED]");
    expect(JSON.stringify(written)).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("renders a resolved-to-empty input visibly rather than omitting it - the diagnostic this feature exists for", async () => {
    const { client, inserts } = makeSupabase();
    const runLog: RunLogContext = { supabase: client, userId: "u1", runId: "run-1" };
    await logStepOutcome(
      runLog,
      { index: 0, type: "grade-repo", status: "error", error: "Repository resolved to empty", summary: null },
      timing,
      [],
      { repo: "" }
    );
    const written = inserts[0].row.inputs as Record<string, string>;
    expect(written.repo).toBe("(empty)");
  });

  it("writes inputs: null when rawInputs is omitted (a disabled/skipped step that never resolved anything)", async () => {
    const { client, inserts } = makeSupabase();
    const runLog: RunLogContext = { supabase: client, userId: "u1", runId: "run-1" };
    await logStepOutcome(runLog, { index: 0, type: "t", status: "disabled", error: null, summary: null }, timing, []);
    expect(inserts[0].row.inputs).toBeNull();
  });
});
