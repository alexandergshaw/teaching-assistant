import { describe, expect, it } from "vitest";
import { updateScheduleRunOutcome, updateTriggerRunOutcome } from "./workflow-run-status";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

/**
 * `last_run_detail` is a SECOND durable path for the same raw error text the
 * downloadable run log carries, and it is the one that is easy to miss.
 *
 * The run log is scrubbed at `logStepOutcome` (./workflows/run-logging.ts).
 * These two functions are a DIFFERENT write path with different callers, and
 * what they store is rendered straight to the operator in the Automate panel
 * (AutomationRow.tsx). So a token embedded in an upstream error message would
 * reach a screen and persist in the row without ever passing through the run
 * log's chokepoint.
 *
 * These tests exist because that path was found open after the run-log leak
 * was closed - closing one write site is not closing the leak.
 */

const CANVAS_TOKEN = "70000000012345~abcdefghijklmnopqrstuvwxyz0123456789";

interface Captured {
  patch: Record<string, unknown> | null;
}

/**
 * Minimal fake: captures the patch object and swallows the rest of the
 * builder chain. Deliberately hand-rolled here rather than imported from
 * another test file - importing across test files re-runs that file's own
 * describe blocks (repo rule).
 */
function makeFakeClient(): { client: SupabaseClient<Database>; captured: Captured } {
  const captured: Captured = { patch: null };
  const chain = {
    update(patch: Record<string, unknown>) {
      captured.patch = patch;
      return {
        eq() {
          return {
            eq() {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  const client = { from: () => chain } as unknown as SupabaseClient<Database>;
  return { client, captured };
}

describe("last_run_detail never carries a secret to the Automate panel", () => {
  it("scrubs a token embedded in a schedule's failure detail", async () => {
    const { client, captured } = makeFakeClient();

    await updateScheduleRunOutcome(
      client,
      "user-1",
      "schedule-1",
      "error",
      `Canvas rejected ${CANVAS_TOKEN}: 401 Unauthorized`
    );

    const detail = String(captured.patch?.last_run_detail ?? "");
    expect(detail).not.toContain(CANVAS_TOKEN);
    // The DIAGNOSIS must survive - an operator who is told only that
    // "something failed" cannot act, and destroying the outcome class is the
    // same harm as leaking the value.
    expect(detail).toContain("Canvas rejected");
    expect(detail).toContain("401 Unauthorized");
  });

  it("scrubs a token embedded in a trigger's failure detail", async () => {
    const { client, captured } = makeFakeClient();

    await updateTriggerRunOutcome(
      client,
      "user-1",
      "trigger-1",
      "error",
      `Canvas rejected ${CANVAS_TOKEN}: 401 Unauthorized`
    );

    const detail = String(captured.patch?.last_run_detail ?? "");
    expect(detail).not.toContain(CANVAS_TOKEN);
    expect(detail).toContain("401 Unauthorized");
  });

  it("scrubs BEFORE the 500-character cap, so a cut cannot leave a fragment", async () => {
    // Order is load-bearing, and asserting the absence of the WHOLE token
    // proves nothing here: a 500-character cut removes the tail on its own, so
    // that assertion passes under EITHER order. This test was written that way
    // first and stayed green under sabotage - the exact "test that cannot
    // fail" trap.
    //
    // What actually survives a slice-first implementation is the token's
    // LEADING segment, and for a Canvas token that is the numeric Canvas user
    // id - the part that identifies whose account it is. The opaque tail
    // going missing is not the win; the id going missing is.
    const { client, captured } = makeFakeClient();
    const lead = "x".repeat(480);
    const canvasUserId = CANVAS_TOKEN.split("~")[0];

    await updateScheduleRunOutcome(client, "user-1", "s", "error", `${lead}${CANVAS_TOKEN}`);

    const detail = String(captured.patch?.last_run_detail ?? "");
    expect(detail).not.toContain(CANVAS_TOKEN);
    expect(detail, "the Canvas user id survived a mid-token cut").not.toContain(canvasUserId);
    expect(detail.length).toBeLessThanOrEqual(500);
  });

  it("leaves an ordinary failure message completely untouched", async () => {
    const { client, captured } = makeFakeClient();
    const plain = "Step 3 failed: the course has no published modules.";

    await updateScheduleRunOutcome(client, "user-1", "s", "error", plain);

    expect(captured.patch?.last_run_detail).toBe(plain);
  });

  it("still caps at 500 characters", async () => {
    const { client, captured } = makeFakeClient();

    await updateScheduleRunOutcome(client, "user-1", "s", "error", "y".repeat(2000));

    expect(String(captured.patch?.last_run_detail ?? "")).toHaveLength(500);
  });
});
