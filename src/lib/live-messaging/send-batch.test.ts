import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertSingleInstitutionBatch,
  computeBatchDigest,
  computeDigest,
  runSendUnit,
  type LedgerOps,
  type SingleInstitutionDeps,
  type UnitDeps,
} from "./send-batch";
import { MAX_BATCH_RECIPIENTS } from "./send-constants";
import type { LedgerRow, SendOutcomeInput } from "./send-ledger";

const CRED_REQUIRED = new Error("credential required");

function deps(overrides: Partial<SingleInstitutionDeps> = {}): SingleInstitutionDeps {
  return {
    resolveByCode: async () => ({ baseUrl: "https://canvas.mccneb.edu" }),
    isCredentialRequired: (err) => err === CRED_REQUIRED,
    resolveForUrl: async () => ({ institution: { code: "MCC" } }),
    listCourseIds: async () => ["100", "101"],
    ...overrides,
  };
}

const target = (courseId: string, userId: string, subject = "Hi", body = "Hello there") => ({
  courseId,
  recipientUserId: userId,
  subject,
  body,
});

describe("computeDigest (I-BIND-3) against an independent sha256", () => {
  it("equals sha256 of code LF course LF user LF subject LF body", () => {
    const expected = createHash("sha256").update("MCC\n100\n200\nSubj\nBody text").digest("hex");
    expect(computeDigest("MCC", "100", "200", "Subj", "Body text")).toBe(expected);
  });

  it("changes when any one of the five inputs changes (including the subject)", () => {
    const base = computeDigest("MCC", "100", "200", "S", "B");
    expect(computeDigest("XYZ", "100", "200", "S", "B")).not.toBe(base);
    expect(computeDigest("MCC", "101", "200", "S", "B")).not.toBe(base);
    expect(computeDigest("MCC", "100", "201", "S", "B")).not.toBe(base);
    expect(computeDigest("MCC", "100", "200", "S2", "B")).not.toBe(base);
    expect(computeDigest("MCC", "100", "200", "S", "B2")).not.toBe(base);
  });

  it("the batch digest is order independent and body sensitive", () => {
    const a = target("100", "1");
    const b = target("100", "2", "Hi", "Other");
    expect(computeBatchDigest("MCC", [a, b])).toBe(computeBatchDigest("MCC", [b, a]));
    expect(computeBatchDigest("MCC", [a, b])).not.toBe(computeBatchDigest("MCC", [a, { ...b, body: "Changed" }]));
  });
});

describe("assertSingleInstitutionBatch - the one-institution runtime assertion", () => {
  it("accepts a clean single-institution batch and derives URLs itself", async () => {
    const resolveForUrl = vi.fn(async () => ({ institution: { code: "MCC" } }));
    const result = await assertSingleInstitutionBatch(
      { institutionCode: " mcc ", targets: [target("100", "1"), target("101", "2")] },
      deps({ resolveForUrl }),
      { checkCourseMembership: true }
    );
    expect("ok" in result).toBe(true);
    if ("ok" in result) expect(result.batch.code).toBe("MCC");
    expect(resolveForUrl.mock.calls.map((c) => (c as unknown as string[])[0])).toEqual([
      "https://canvas.mccneb.edu/courses/100",
      "https://canvas.mccneb.edu/courses/101",
    ]);
  });

  it("P1: a MIXED-institution batch is rejected whole (one course resolves elsewhere)", async () => {
    const result = await assertSingleInstitutionBatch(
      { institutionCode: "MCC", targets: [target("100", "1"), target("101", "2")] },
      deps({
        resolveForUrl: async (url) => ({ institution: { code: url.endsWith("/101") ? "XYZ" : "MCC" } }),
      }),
      { checkCourseMembership: true }
    );
    expect(result).toMatchObject({ status: "refused", kind: "institution-mismatch" });
  });

  it("a course host that is not registered is institution-not-sendable", async () => {
    const result = await assertSingleInstitutionBatch(
      { institutionCode: "MCC", targets: [target("100", "1")] },
      deps({
        resolveForUrl: async () => {
          throw CRED_REQUIRED;
        },
      }),
      { checkCourseMembership: true }
    );
    expect(result).toMatchObject({ status: "refused", kind: "institution-not-sendable" });
  });

  it("a course outside the owner's active courses is refused (step 7)", async () => {
    const result = await assertSingleInstitutionBatch(
      { institutionCode: "MCC", targets: [target("999", "1")] },
      deps(),
      { checkCourseMembership: true }
    );
    expect(result).toMatchObject({ status: "refused", kind: "course-not-in-institution" });
    const skipped = await assertSingleInstitutionBatch(
      { institutionCode: "MCC", targets: [target("999", "1")] },
      deps(),
      { checkCourseMembership: false }
    );
    expect("ok" in skipped).toBe(true);
  });

  it.each(["course_5", "1,2", "12abc", "", "9999999999999"])("P2: recipient %j is invalid-target with a count only", async (id) => {
    const result = await assertSingleInstitutionBatch(
      { institutionCode: "MCC", targets: [target("100", id), target("100", "2")] },
      deps(),
      { checkCourseMembership: true }
    );
    expect(result).toMatchObject({ status: "refused", kind: "invalid-target", count: 1 });
  });

  it("refuses an unresolved variable in subject or body, a blank body, and oversize text", async () => {
    for (const bad of [
      target("100", "1", "Hi {{first_name}}", "ok"),
      target("100", "1", "Hi", "Dear {{x}}"),
      target("100", "1", "Hi", "   "),
      target("100", "1", "Hi", "x".repeat(10001)),
      target("100", "1", "s".repeat(201), "ok"),
    ]) {
      const result = await assertSingleInstitutionBatch({ institutionCode: "MCC", targets: [bad] }, deps(), {
        checkCourseMembership: false,
      });
      expect(result).toMatchObject({ status: "refused", kind: "invalid-target" });
    }
  });

  it("refuses bad codes, empty and oversize batches, and duplicate targets", async () => {
    const run = (input: Parameters<typeof assertSingleInstitutionBatch>[0]) =>
      assertSingleInstitutionBatch(input, deps(), { checkCourseMembership: false });
    expect(await run({ institutionCode: "m c c!", targets: [target("100", "1")] })).toMatchObject({ kind: "invalid-institution" });
    expect(await run({ institutionCode: "MCC", targets: [] })).toMatchObject({ kind: "batch-size" });
    const many = Array.from({ length: MAX_BATCH_RECIPIENTS + 1 }, (_, i) => target("100", String(i + 1)));
    expect(await run({ institutionCode: "MCC", targets: many })).toMatchObject({ kind: "batch-size" });
    expect(await run({ institutionCode: "MCC", targets: [target("100", "1"), target("100", "1")] })).toMatchObject({
      kind: "duplicate-target",
    });
  });

  it("distinguishes not-connected from unavailable, and never echoes a host or id in the copy", async () => {
    const notConnected = await assertSingleInstitutionBatch(
      { institutionCode: "MCC", targets: [target("100", "1")] },
      deps({
        resolveByCode: async () => {
          throw CRED_REQUIRED;
        },
      }),
      { checkCourseMembership: false }
    );
    expect(notConnected).toMatchObject({ kind: "not-connected" });
    const unavailable = await assertSingleInstitutionBatch(
      { institutionCode: "MCC", targets: [target("100", "1")] },
      deps({
        resolveByCode: async () => {
          throw new Error("ECONNRESET canvas.mccneb.edu");
        },
      }),
      { checkCourseMembership: false }
    );
    expect(unavailable).toMatchObject({ kind: "unavailable" });
    for (const r of [notConnected, unavailable]) {
      if ("reason" in r) expect(r.reason).not.toMatch(/canvas\.|mccneb|100|ECONN/);
    }
  });
});

// ---------------------------------------------------------------------------
// The unit
// ---------------------------------------------------------------------------

const DIGEST = computeDigest("MCC", "100", "200", "Subj", "Body");

function ledgerRow(overrides: Partial<LedgerRow> = {}): LedgerRow {
  return {
    id: "row-1",
    batchId: "b1",
    institution: "MCC",
    courseId: "100",
    recipientId: "200",
    bodyDigest: DIGEST,
    status: "pending",
    code: null,
    httpStatus: null,
    attempt: 0,
    allowResend: false,
    createdAt: "2026-10-11T00:00:00Z",
    claimedAt: null,
    settledAt: null,
    ...overrides,
  };
}

interface Rig {
  unit: UnitDeps;
  send: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  settle: ReturnType<typeof vi.fn>;
}

function rig(opts: {
  row?: LedgerRow | null;
  readOk?: boolean;
  claim?: Awaited<ReturnType<LedgerOps["claimRow"]>> | "throw";
  settle?: Awaited<ReturnType<LedgerOps["settleRow"]>> | "throw";
  send?: SendOutcomeInput | "throw";
  base?: Partial<SingleInstitutionDeps>;
}): Rig {
  const row = opts.row === undefined ? ledgerRow() : opts.row;
  const claim = vi.fn(async () => {
    if (opts.claim === "throw") throw new Error("claim blew up");
    return opts.claim ?? { ok: true as const, row: row ? { ...row, status: "sending" as const } : null };
  });
  const settle = vi.fn(async () => {
    if (opts.settle === "throw") throw new Error("settle blew up");
    return opts.settle ?? { ok: true as const, settled: true };
  });
  const send = vi.fn(async () => {
    if (opts.send === "throw") throw new Error("send blew up");
    return opts.send ?? { status: "accepted" as const, code: "ok", httpStatus: 201 };
  });
  const unit: UnitDeps = {
    ...deps(opts.base),
    ledger: {
      readRowByKey: async () => (opts.readOk === false ? { ok: false } : { ok: true, row }),
      claimRow: claim as unknown as LedgerOps["claimRow"],
      settleRow: settle as unknown as LedgerOps["settleRow"],
    },
    send: send as unknown as UnitDeps["send"],
  };
  return { unit, send, claim, settle };
}

const INPUT = { batchId: "b1", recipientKey: "100:200", subject: "Subj", body: "Body" };

describe("runSendUnit - claim, POST, settle", () => {
  it("claims, sends to the URL derived from the LEDGER row, and settles", async () => {
    const r = rig({});
    const result = await runSendUnit(r.unit, INPUT);
    expect(result).toMatchObject({ key: "100:200", status: "accepted", code: "ok", httpStatus: 201, settled: true });
    expect(r.send).toHaveBeenCalledWith("https://canvas.mccneb.edu/courses/100", "200", "Body", "Subj");
    expect(r.claim).toHaveBeenCalledWith({ id: "row-1", digest: DIGEST });
    expect(r.settle).toHaveBeenCalledTimes(1);
  });

  it("P20: a body or subject that does not reproduce the ledger digest makes ZERO POSTs and no ledger write", async () => {
    for (const bad of [{ body: "Swapped body" }, { subject: "Other subject" }]) {
      const r = rig({});
      const result = await runSendUnit(r.unit, { ...INPUT, ...bad });
      expect(result).toMatchObject({ status: "refused", refusalKind: "digest-mismatch" });
      expect(r.send).not.toHaveBeenCalled();
      expect(r.claim).not.toHaveBeenCalled();
    }
  });

  it("P23: a ledger read or claim failure refuses ledger-unavailable with NO POST", async () => {
    const readFail = rig({ readOk: false });
    expect(await runSendUnit(readFail.unit, INPUT)).toMatchObject({ refusalKind: "ledger-unavailable" });
    expect(readFail.send).not.toHaveBeenCalled();
    const claimFail = rig({ claim: { ok: false } });
    expect(await runSendUnit(claimFail.unit, INPUT)).toMatchObject({ refusalKind: "ledger-unavailable" });
    expect(claimFail.send).not.toHaveBeenCalled();
  });

  it("a thrown claim propagates (the caller treats it as a lost response) and still POSTs nothing", async () => {
    const r = rig({ claim: "throw" });
    await expect(runSendUnit(r.unit, INPUT)).rejects.toThrow();
    expect(r.send).not.toHaveBeenCalled();
  });

  it("a zero-row claim is skipped with NO POST (P21 TS half)", async () => {
    const r = rig({ claim: { ok: true, row: null } });
    const result = await runSendUnit(r.unit, INPUT);
    expect(result).toMatchObject({ status: "skipped", current: "pending" });
    expect(r.send).not.toHaveBeenCalled();
  });

  it("a row that is not pending is skipped without even claiming", async () => {
    const r = rig({ row: ledgerRow({ status: "accepted", code: "ok", claimedAt: "x", settledAt: "y" }) });
    expect(await runSendUnit(r.unit, INPUT)).toMatchObject({ status: "skipped", current: "accepted" });
    expect(r.claim).not.toHaveBeenCalled();
    expect(r.send).not.toHaveBeenCalled();
  });

  it("fail closed: a failed settle still returns the real result, with settled false", async () => {
    const r = rig({ settle: { ok: false } });
    expect(await runSendUnit(r.unit, INPUT)).toMatchObject({ status: "accepted", settled: false });
    const threw = rig({ settle: "throw" });
    expect(await runSendUnit(threw.unit, INPUT)).toMatchObject({ status: "accepted", settled: false });
  });

  it("a sender that throws after the claim is unknown, never refused", async () => {
    const r = rig({ send: "throw" });
    expect(await runSendUnit(r.unit, INPUT)).toMatchObject({ status: "unknown", code: "unknown-no-response" });
  });

  it("settles a refused-rate-limited result as refused (429 stays retryable)", async () => {
    const r = rig({ send: { status: "refused", code: "refused-rate-limited", httpStatus: 429 } });
    const result = await runSendUnit(r.unit, INPUT);
    expect(result).toMatchObject({ status: "refused", code: "refused-rate-limited", httpStatus: 429 });
  });

  it("the unit holds itself to the one-institution assertion before claiming", async () => {
    const r = rig({ base: { resolveForUrl: async () => ({ institution: { code: "XYZ" } }) } });
    expect(await runSendUnit(r.unit, INPUT)).toMatchObject({ refusalKind: "institution-mismatch" });
    expect(r.claim).not.toHaveBeenCalled();
    expect(r.send).not.toHaveBeenCalled();
  });

  it("rejects a malformed recipient key and an unknown row without any write", async () => {
    const bad = rig({});
    expect(await runSendUnit(bad.unit, { ...INPUT, recipientKey: "course_1:200" })).toMatchObject({ refusalKind: "invalid-target" });
    const missing = rig({ row: null });
    expect(await runSendUnit(missing.unit, INPUT)).toMatchObject({ refusalKind: "invalid-target" });
    expect(bad.claim).not.toHaveBeenCalled();
    expect(missing.claim).not.toHaveBeenCalled();
  });
});
