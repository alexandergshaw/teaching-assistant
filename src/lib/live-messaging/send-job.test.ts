import { describe, expect, it, vi } from "vitest";
import type { LiveUnitResult } from "./send-batch";
import { OUTCOME_LABELS, PAUSED_COPY, describeDuplicate } from "./send-copy";
import {
  buildSendPlan,
  canConfirmSend,
  codeSummary,
  confirmLabel,
  runPool,
  runSendJob,
  shouldPause,
  snapshotKey,
  tally,
  type ConfirmGateState,
  type JobItemResult,
  type RenderedRecipient,
  type SendJobArgs,
} from "./send-job";
import type { LiveBatchStatusResult } from "./send-results";
import { renderForStudents } from "./template-substitution";

const VALUES = { firstName: "Ada", lastName: "L", course: "ENG", section: "01", missingCount: 2, grade: 88 };

function recipient(userId: string, body = "Hi {{first_name}}", courseId = "100"): RenderedRecipient {
  const [rendered] = renderForStudents("Subj", body, [{ key: userId, values: VALUES }]);
  return { rowKey: `MCC:${courseId}:s:${userId}`, courseId, userId, rendered };
}

describe("buildSendPlan", () => {
  it("one target per (course, user); unsendable and duplicate rows are counted, not sent", () => {
    const plan = buildSendPlan([
      recipient("1"),
      recipient("1"),
      recipient("2", "Hi {{nope}}"),
      recipient("3", "Hi {{grade}}"),
    ]);
    expect(plan.targets.map((t) => t.recipientUserId)).toEqual(["1", "3"]);
    expect(plan.duplicateRows).toBe(1);
    expect(plan.unsendable).toBe(1);
    expect(plan.targets[0]).toMatchObject({ courseId: "100", subject: "Subj", body: "Hi Ada" });
  });

  it("a known variable with no value is excluded rather than sent blank", () => {
    const [rendered] = renderForStudents("S", "Grade {{grade}}", [{ key: "x", values: { ...VALUES, grade: null } }]);
    const plan = buildSendPlan([{ rowKey: "k", courseId: "100", userId: "9", rendered }]);
    expect(plan.targets).toEqual([]);
    expect(plan.unsendable).toBe(1);
  });
});

describe("canConfirmSend - the gate is the AND of every condition (2^6)", () => {
  const OPEN: ConfirmGateState = {
    preparedSnapshot: "snap",
    currentSnapshot: "snap",
    frozenInstitution: "MCC",
    activeInstitution: "MCC",
    count: 5,
    inFlight: false,
  };

  it("opens for the all-good state", () => {
    expect(canConfirmSend(OPEN)).toBe(true);
  });

  it("is closed for every state that is not all-good (enumerated, not sampled)", () => {
    const axes: Array<Partial<ConfirmGateState>> = [
      { preparedSnapshot: null },
      { currentSnapshot: "edited" },
      { frozenInstitution: null },
      { activeInstitution: "XYZ" },
      { count: 0 },
      { count: 251 },
      { inFlight: true },
    ];
    // every non-empty subset of the failing axes
    for (let mask = 1; mask < 1 << axes.length; mask += 1) {
      const state = axes.reduce<ConfirmGateState>((acc, axis, i) => (mask & (1 << i) ? { ...acc, ...axis } : acc), OPEN);
      expect(canConfirmSend(state), `mask ${mask}`).toBe(false);
    }
  });

  it("a snapshot change (template edit or selection change) between Preview and Confirm closes it", () => {
    const a = snapshotKey("MCC", "S", "B", ["1", "2"]);
    expect(canConfirmSend({ ...OPEN, preparedSnapshot: a, currentSnapshot: snapshotKey("MCC", "S", "B2", ["1", "2"]) })).toBe(false);
    expect(canConfirmSend({ ...OPEN, preparedSnapshot: a, currentSnapshot: snapshotKey("MCC", "S", "B", ["1"]) })).toBe(false);
    expect(canConfirmSend({ ...OPEN, preparedSnapshot: a, currentSnapshot: snapshotKey("MCC", "S", "B", ["2", "1"]) })).toBe(true);
  });

  it("the confirm label carries the count and the institution", () => {
    expect(confirmLabel(1, "MCC")).toBe("Send to 1 student at MCC");
    expect(confirmLabel(12, "MCC")).toBe("Send to 12 students at MCC");
  });
});

describe("runPool", () => {
  it("never exceeds the limit and returns positional results", async () => {
    let live = 0;
    let peak = 0;
    const out = await runPool(
      [1, 2, 3, 4, 5, 6, 7],
      3,
      async (n) => {
        live += 1;
        peak = Math.max(peak, live);
        await new Promise((r) => setTimeout(r, 2));
        live -= 1;
        return n * 2;
      },
      () => false
    );
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("P24: one rejecting worker among 57 loses only its own slot", async () => {
    const items = Array.from({ length: 57 }, (_, i) => i);
    const out = await runPool(
      items,
      3,
      async (n) => {
        if (n === 20) throw new Error("bug");
        return n;
      },
      () => false
    );
    expect(out.filter((r) => r !== undefined)).toHaveLength(56);
    expect(out[20]).toBeUndefined();
    expect(out[56]).toBe(56);
  });

  it("checks shouldStop before each dispatch", async () => {
    let started = 0;
    const out = await runPool(
      [1, 2, 3, 4, 5, 6],
      1,
      async (n) => {
        started += 1;
        return n;
      },
      () => started >= 2
    );
    expect(started).toBe(2);
    expect(out.filter((r) => r !== undefined)).toHaveLength(2);
  });
});

const res = (outcome: JobItemResult["outcome"], extra: Partial<JobItemResult> = {}): JobItemResult => ({
  key: "k",
  outcome,
  code: null,
  ...extra,
});

describe("shouldPause - the circuit breaker (P25)", () => {
  it("pauses when the last 3 completed results are all non-accepted", () => {
    expect(shouldPause([res("refused"), res("unknown"), res("refused")])).toBe(true);
    expect(shouldPause([res("accepted"), res("refused"), res("refused")])).toBe(false);
    expect(shouldPause([res("refused"), res("refused")])).toBe(false);
  });

  it("pauses at once on not-authorized or ledger-unavailable", () => {
    expect(shouldPause([res("not-attempted", { refusalKind: "not-authorized" })])).toBe(true);
    expect(shouldPause([res("accepted"), res("not-attempted", { refusalKind: "ledger-unavailable" })])).toBe(true);
    expect(shouldPause([res("not-attempted", { refusalKind: "digest-mismatch" })])).toBe(false);
  });
});

describe("tally and codeSummary (P26)", () => {
  it("accepted + refused + unknown + notAttempted = total always", () => {
    const results = [res("accepted"), res("refused"), res("unknown"), res("skipped"), res("not-attempted")];
    const t = tally(results, 9);
    expect(t).toEqual({ accepted: 1, refused: 1, unknown: 1, notAttempted: 6 });
    expect(t.accepted + t.refused + t.unknown + t.notAttempted).toBe(9);
  });

  it("summarises enumerated codes only", () => {
    const results = [
      res("refused", { code: "refused-http" }),
      res("refused", { code: "refused-http" }),
      res("refused", { code: "refused-rate-limited" }),
      res("unknown", { code: "unknown-no-response" }),
    ];
    expect(codeSummary(results, "refused")).toBe("2x refused-http, 1x refused-rate-limited");
    expect(codeSummary(results, "unknown")).toBe("1x unknown-no-response");
  });
});

// ---------------------------------------------------------------------------
// The job: fail closed
// ---------------------------------------------------------------------------

function unit(key: string, status: LiveUnitResult["status"], extra: Partial<LiveUnitResult> = {}): LiveUnitResult {
  return { key, status, code: status === "accepted" ? "ok" : null, httpStatus: null, ...extra };
}

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `100:${i + 1}`, subject: "S", body: `B${i + 1}` }));

describe("runSendJob", () => {
  it("sends each item exactly once, with ITS OWN body", async () => {
    const sendOne = vi.fn<SendJobArgs["sendOne"]>(async (_b, key) => unit(key, "accepted"));
    const summary = await runSendJob({
      batchId: "b",
      items: items(7),
      sendOne,
      pollBatch: async () => ({ status: "ok", rows: [] }),
      shouldStop: () => false,
    });
    expect(sendOne).toHaveBeenCalledTimes(7);
    expect(sendOne.mock.calls.map((c) => `${c[1]}=${c[3]}`).sort()).toEqual(items(7).map((i) => `${i.key}=${i.body}`).sort());
    expect(summary.counts).toEqual({ accepted: 7, refused: 0, unknown: 0, notAttempted: 0 });
    expect(summary.halted).toBe(false);
  });

  it("a lost response is reconciled from the LEDGER and never re-sent", async () => {
    const sendOne = vi.fn(async (_b: string, key: string): Promise<LiveUnitResult> => {
      if (key === "100:2") throw new Error("response lost");
      return unit(key, "accepted");
    });
    const poll = vi.fn(async (): Promise<LiveBatchStatusResult> => ({
      status: "ok",
      rows: [{ key: "100:2", status: "accepted", code: "ok", httpStatus: 201, attempt: 1 }],
    }));
    const summary = await runSendJob({ batchId: "b", items: items(3), sendOne, pollBatch: poll, shouldStop: () => false });
    expect(sendOne.mock.calls.filter((c) => c[1] === "100:2")).toHaveLength(1);
    expect(summary.results.find((r) => r.key === "100:2")?.outcome).toBe("accepted");
  });

  it("a lost response whose row is still sending, or an unreachable ledger, reads as UNKNOWN (never failed, never re-sent)", async () => {
    for (const poll of [
      async (): Promise<LiveBatchStatusResult> => ({
        status: "ok",
        rows: [{ key: "100:1", status: "sending", code: null, httpStatus: null, attempt: 1 }],
      }),
      async (): Promise<LiveBatchStatusResult> => {
        throw new Error("ledger down");
      },
      async (): Promise<LiveBatchStatusResult> => ({
        status: "refused",
        kind: "ledger-unavailable",
        reason: "x",
      }),
    ]) {
      const sendOne = vi.fn(async (): Promise<LiveUnitResult> => {
        throw new Error("lost");
      });
      const summary = await runSendJob({ batchId: "b", items: items(1), sendOne, pollBatch: poll, shouldStop: () => false });
      expect(sendOne).toHaveBeenCalledTimes(1);
      expect(summary.results[0].outcome).toBe("unknown");
    }
  });

  it("a thrown unit whose row is still pending was never claimed: not attempted", async () => {
    const summary = await runSendJob({
      batchId: "b",
      items: items(1),
      sendOne: async () => {
        throw new Error("mfa required");
      },
      pollBatch: async () => ({
        status: "ok",
        rows: [{ key: "100:1", status: "pending", code: null, httpStatus: null, attempt: 0 }],
      }),
      shouldStop: () => false,
    });
    expect(summary.results[0].outcome).toBe("not-attempted");
    expect(summary.counts.notAttempted).toBe(1);
  });

  it("the breaker halts dispatch after 3 consecutive non-accepted and keeps the identity", async () => {
    const sendOne = vi.fn(async (_b: string, key: string) => unit(key, "refused", { code: "refused-http" }));
    const summary = await runSendJob({
      batchId: "b",
      items: items(20),
      sendOne,
      pollBatch: async () => ({ status: "ok", rows: [] }),
      shouldStop: () => false,
      limit: 1,
    });
    expect(sendOne).toHaveBeenCalledTimes(3);
    expect(summary.halted).toBe(true);
    const c = summary.counts;
    expect(c.accepted + c.refused + c.unknown + c.notAttempted).toBe(20);
    expect(c.refused).toBe(3);
  });

  it("an external stop halts dispatch before the next item", async () => {
    let stop = false;
    const sendOne = vi.fn(async (_b: string, key: string) => {
      stop = true;
      return unit(key, "accepted");
    });
    const summary = await runSendJob({
      batchId: "b",
      items: items(5),
      sendOne,
      pollBatch: async () => ({ status: "ok", rows: [] }),
      shouldStop: () => stop,
      limit: 1,
    });
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(summary.halted).toBe(true);
  });

  it("a unit that refused before any POST is not-attempted but still trips the breaker for ledger-unavailable", async () => {
    const sendOne = vi.fn(async (_b: string, key: string) =>
      unit(key, "refused", { refusalKind: "ledger-unavailable" })
    );
    const summary = await runSendJob({
      batchId: "b",
      items: items(10),
      sendOne,
      pollBatch: async () => ({ status: "ok", rows: [] }),
      shouldStop: () => false,
      limit: 1,
    });
    expect(sendOne).toHaveBeenCalledTimes(1);
    expect(summary.counts.refused).toBe(0);
    expect(summary.counts.notAttempted).toBe(10);
  });
});

describe("owner-facing copy (P30): unconfirmed and refused are never worded as delivered", () => {
  const FORBIDDEN = /\b(delivered|received|emailed|sent)\b/i;
  it("scans every unknown, refused and duplicate string", () => {
    for (const text of [
      OUTCOME_LABELS.unknown,
      OUTCOME_LABELS.refused,
      OUTCOME_LABELS.skipped,
      PAUSED_COPY,
      describeDuplicate("unknown"),
      describeDuplicate("sending"),
      describeDuplicate("accepted"),
    ]) {
      expect(text).not.toMatch(FORBIDDEN);
    }
  });

  it("no copy contains an emoji or non-ASCII character", () => {
    for (const text of [...Object.values(OUTCOME_LABELS), PAUSED_COPY, describeDuplicate("accepted")]) {
      expect(text).toMatch(/^[\x20-\x7e]*$/);
    }
  });
});
