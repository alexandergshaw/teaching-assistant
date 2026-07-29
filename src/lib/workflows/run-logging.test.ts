import { describe, it, expect, vi } from "vitest";
import {
  createProgressCollector,
  summaryToLogText,
  safeStartWorkflowRun,
  logStepOutcome,
  MAX_PROGRESS_MESSAGES_PER_STEP,
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
});
