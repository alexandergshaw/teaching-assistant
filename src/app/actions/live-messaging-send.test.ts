// LIVE-LMS-STUDENT-MESSAGING W4: the owner-gated send actions, driven end to end
// against a fake Supabase client and a mocked sender. This file mocks
// @/lib/supabase/auth WHOLESALE (it is in the frozen wholesale-auth list); the
// guard ITSELF is pinned textually in LiveSend.wiring.test.ts, and here the
// guard mock proves ORDER: a rejecting guard stops every action before any
// downstream work.
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAppOwner = vi.fn();
const createClient = vi.fn();
const resolveInstitution = vi.fn();
const resolveInstitutionByCode = vi.fn();
const sendStudentConversation = vi.fn();
const listCourses = vi.fn();

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: () => requireAppOwner() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
vi.mock("@/lib/canvas-core", () => ({
  resolveInstitution: (url: string) => resolveInstitution(url),
  resolveInstitutionByCode: (code: string) => resolveInstitutionByCode(code),
}));
vi.mock("@/lib/canvas/inbox", () => ({
  sendStudentConversation: (...args: unknown[]) => sendStudentConversation(...args),
}));
vi.mock("@/lib/live-messaging/enrollment-readers", () => ({
  buildLiveEnrollmentReaders: () => ({ listCourses: (code: string) => listCourses(code) }),
}));

import {
  getLiveMessageBatchAction,
  prepareLiveMessageBatchAction,
  requeueRefusedLiveMessagesAction,
  sendLiveMessageAction,
  startLiveMessageBatchAction,
} from "./live-messaging-send";
import { computeBatchDigest, computeDigest } from "@/lib/live-messaging/send-batch";

const BATCH = "33333333-3333-3333-3333-333333333333";
const TARGET = { courseId: "100", recipientUserId: "200", subject: "Subj", body: "Body" };
const INPUT = { institutionCode: "MCC", targets: [TARGET] };
const DIGEST = computeDigest("MCC", "100", "200", "Subj", "Body");

interface Rpc {
  name: string;
  args: Record<string, unknown>;
}

function ledgerRow(over: Record<string, unknown> = {}) {
  return {
    id: "row-1",
    batch_id: BATCH,
    institution: "MCC",
    course_id: "100",
    recipient_id: "200",
    body_digest: DIGEST,
    status: "pending",
    code: null,
    http_status: null,
    attempt: 0,
    allow_resend: false,
    created_at: "2026-10-11T10:00:00Z",
    claimed_at: null,
    settled_at: null,
    ...over,
  };
}

function setupClient(responder: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown }) {
  const rpcs: Rpc[] = [];
  const reads: string[] = [];
  const chain = (data: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit"]) c[m] = () => c;
    c.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(data).then(resolve, reject);
    return c;
  };
  createClient.mockResolvedValue({
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      return Promise.resolve(responder(name, args));
    },
    from: (table: string) => {
      reads.push(table);
      return chain(responder(`from:${table}`, {}));
    },
  });
  return { rpcs, reads };
}

beforeEach(() => {
  for (const m of [requireAppOwner, createClient, resolveInstitution, resolveInstitutionByCode, sendStudentConversation, listCourses]) m.mockReset();
  requireAppOwner.mockResolvedValue({ id: "owner" });
  resolveInstitutionByCode.mockResolvedValue({ baseUrl: "https://canvas.mccneb.edu" });
  resolveInstitution.mockResolvedValue({ institution: { code: "MCC" } });
  listCourses.mockResolvedValue([{ id: "100", name: "ENG" }]);
});

describe("the guard runs first in every action", () => {
  it("a rejecting requireAppOwner stops all five before any downstream work", async () => {
    requireAppOwner.mockRejectedValue(new Error("not owner"));
    await expect(prepareLiveMessageBatchAction(INPUT)).rejects.toThrow("not owner");
    await expect(startLiveMessageBatchAction(INPUT, DIGEST)).rejects.toThrow("not owner");
    await expect(sendLiveMessageAction(BATCH, "100:200", "Subj", "Body")).rejects.toThrow("not owner");
    await expect(getLiveMessageBatchAction(BATCH)).rejects.toThrow("not owner");
    await expect(requeueRefusedLiveMessagesAction(BATCH)).rejects.toThrow("not owner");
    expect(createClient).not.toHaveBeenCalled();
    expect(resolveInstitutionByCode).not.toHaveBeenCalled();
    expect(sendStudentConversation).not.toHaveBeenCalled();
  });
});

describe("A4 prepare", () => {
  it("excludes a recipient with an accepted identical message and returns a batch digest; sends nothing", async () => {
    const { rpcs } = setupClient((name) => {
      if (name === "live_message_dup_lookup") return { data: [ledgerRow({ status: "accepted", code: "ok", claimed_at: "x", settled_at: "y" })], error: null };
      return { data: 0, error: null };
    });
    const result = await prepareLiveMessageBatchAction(INPUT);
    expect(result).toEqual({
      status: "ready",
      institution: "MCC",
      count: 1,
      digest: computeBatchDigest("MCC", [TARGET]),
      excluded: [{ key: "100:200", dupStatus: "accepted" }],
    });
    expect(rpcs.map((r) => r.name)).toEqual(["live_message_dup_lookup", "live_message_prune"]);
    expect(sendStudentConversation).not.toHaveBeenCalled();
  });

  it("a failed lookup is ledger-unavailable (fail closed), a failed prune is ignored", async () => {
    setupClient(() => ({ data: null, error: { message: "down" } }));
    expect(await prepareLiveMessageBatchAction(INPUT)).toMatchObject({ status: "refused", kind: "ledger-unavailable" });
    setupClient((name) => (name === "live_message_prune" ? { data: null, error: { message: "x" } } : { data: [], error: null }));
    expect(await prepareLiveMessageBatchAction(INPUT)).toMatchObject({ status: "ready", excluded: [] });
  });

  it("P1: a mixed-institution batch is rejected whole with zero ledger or Canvas writes", async () => {
    const { rpcs } = setupClient(() => ({ data: [], error: null }));
    resolveInstitution.mockResolvedValue({ institution: { code: "XYZ" } });
    expect(await prepareLiveMessageBatchAction(INPUT)).toMatchObject({ status: "refused", kind: "institution-mismatch" });
    expect(rpcs).toEqual([]);
    expect(sendStudentConversation).not.toHaveBeenCalled();
  });

  it("a course that is not one of the owner's active courses is refused", async () => {
    setupClient(() => ({ data: [], error: null }));
    listCourses.mockResolvedValue([{ id: "999", name: "Other" }]);
    expect(await prepareLiveMessageBatchAction(INPUT)).toMatchObject({ kind: "course-not-in-institution" });
  });
});

describe("A5 start", () => {
  it("refuses a digest that does not match the payload; creates no rows", async () => {
    const { rpcs } = setupClient(() => ({ data: [], error: null }));
    expect(await startLiveMessageBatchAction(INPUT, "0".repeat(64))).toMatchObject({ kind: "digest-mismatch" });
    expect(await startLiveMessageBatchAction(INPUT, "not-a-digest")).toMatchObject({ kind: "digest-mismatch" });
    expect(await startLiveMessageBatchAction({ ...INPUT, targets: [{ ...TARGET, body: "Edited" }] }, computeBatchDigest("MCC", [TARGET]))).toMatchObject({
      kind: "digest-mismatch",
    });
    expect(rpcs).toEqual([]);
  });

  it("passes the per-recipient digest and the explicit Resend-anyway flag to start_batch", async () => {
    const { rpcs } = setupClient(() => ({
      data: [{ o_batch_id: BATCH, o_course_id: "100", o_recipient_id: "200", o_outcome: "inserted", o_dup_status: "accepted" }],
      error: null,
    }));
    const result = await startLiveMessageBatchAction({ ...INPUT, targets: [{ ...TARGET, allowResend: true }] }, computeBatchDigest("MCC", [TARGET]));
    expect(result).toEqual({
      status: "started",
      batchId: BATCH,
      recipients: [{ key: "100:200", outcome: "inserted", dupStatus: "accepted" }],
    });
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].name).toBe("live_message_start_batch");
    expect(rpcs[0].args).toMatchObject({ p_institution: "MCC", p_digests: [DIGEST], p_allow_resend: [true] });
  });

  it("an absent override defaults to false (never a default resend)", async () => {
    const { rpcs } = setupClient(() => ({
      data: [{ o_batch_id: BATCH, o_course_id: "100", o_recipient_id: "200", o_outcome: "duplicate", o_dup_status: "sending" }],
      error: null,
    }));
    await startLiveMessageBatchAction(INPUT, computeBatchDigest("MCC", [TARGET]));
    expect(rpcs[0].args.p_allow_resend).toEqual([false]);
  });
});

describe("A6 send: one recipient, claim then POST then settle", () => {
  function sendRig(over: { claim?: { data: unknown; error: unknown }; row?: Record<string, unknown> | null } = {}) {
    return setupClient((name) => {
      if (name === "from:live_message_sends") return { data: over.row === null ? [] : [over.row ?? ledgerRow()], error: null };
      if (name === "live_message_claim") return over.claim ?? { data: [ledgerRow({ status: "sending", attempt: 1, claimed_at: "x" })], error: null };
      if (name === "live_message_settle") return { data: true, error: null };
      return { data: null, error: null };
    });
  }

  it("claims before the POST and settles after, POSTing to the URL derived from the ledger row", async () => {
    sendStudentConversation.mockResolvedValue({ status: "accepted", code: "ok", httpStatus: 201 });
    const { rpcs } = sendRig();
    const result = await sendLiveMessageAction(BATCH, "100:200", "Subj", "Body");
    expect(result).toMatchObject({ key: "100:200", status: "accepted", settled: true });
    expect(sendStudentConversation).toHaveBeenCalledTimes(1);
    expect(sendStudentConversation).toHaveBeenCalledWith("https://canvas.mccneb.edu/courses/100", "200", "Body", "Subj");
    expect(rpcs.map((r) => r.name)).toEqual(["live_message_claim", "live_message_settle"]);
    expect(rpcs[1].args).toMatchObject({ p_status: "accepted", p_code: "ok", p_http_status: 201 });
  });

  it("a claim the ledger refuses (error) POSTs nothing", async () => {
    sendRig({ claim: { data: null, error: { message: "lock timeout" } } });
    expect(await sendLiveMessageAction(BATCH, "100:200", "Subj", "Body")).toMatchObject({ refusalKind: "ledger-unavailable" });
    expect(sendStudentConversation).not.toHaveBeenCalled();
  });

  it("a zero-row claim (duplicate guard, another tab) POSTs nothing", async () => {
    sendRig({ claim: { data: [], error: null } });
    expect(await sendLiveMessageAction(BATCH, "100:200", "Subj", "Body")).toMatchObject({ status: "skipped" });
    expect(sendStudentConversation).not.toHaveBeenCalled();
  });

  it("a body that is not the one digested at Start POSTs nothing and writes nothing", async () => {
    const { rpcs } = sendRig();
    expect(await sendLiveMessageAction(BATCH, "100:200", "Subj", "Swapped")).toMatchObject({ refusalKind: "digest-mismatch" });
    expect(sendStudentConversation).not.toHaveBeenCalled();
    expect(rpcs).toEqual([]);
  });

  it("rejects a malformed batch id or recipient key without touching the ledger", async () => {
    const { rpcs, reads } = sendRig();
    expect(await sendLiveMessageAction("not-a-uuid", "100:200", "Subj", "Body")).toMatchObject({ refusalKind: "invalid-target" });
    expect(await sendLiveMessageAction(BATCH, "course_5:200", "Subj", "Body")).toMatchObject({ refusalKind: "invalid-target" });
    expect(rpcs).toEqual([]);
    expect(reads).toEqual([]);
  });
});

describe("A7 and A8", () => {
  it("A7 reconciles first, then returns keyed statuses with no names", async () => {
    const { rpcs } = setupClient((name) => {
      if (name === "live_message_reconcile") return { data: [{ reconciled: 0, db_now: "t" }], error: null };
      return { data: [ledgerRow({ status: "refused", code: "refused-http", http_status: 403, attempt: 1 })], error: null };
    });
    const result = await getLiveMessageBatchAction(BATCH);
    expect(rpcs.map((r) => r.name)).toEqual(["live_message_reconcile"]);
    expect(result).toEqual({
      status: "ok",
      rows: [{ key: "100:200", status: "refused", code: "refused-http", httpStatus: 403, attempt: 1 }],
    });
  });

  it("A7 fails closed when the reconcile fails", async () => {
    setupClient(() => ({ data: null, error: { message: "down" } }));
    expect(await getLiveMessageBatchAction(BATCH)).toMatchObject({ kind: "ledger-unavailable" });
  });

  it("A8 requeues with the bounded attempt cap and sends nothing", async () => {
    const { rpcs } = setupClient(() => ({ data: 2, error: null }));
    expect(await requeueRefusedLiveMessagesAction(BATCH)).toEqual({ status: "requeued", count: 2 });
    expect(rpcs[0]).toEqual({ name: "live_message_requeue_refused", args: { p_batch_id: BATCH, p_max_attempts: 3 } });
    expect(sendStudentConversation).not.toHaveBeenCalled();
    expect(await requeueRefusedLiveMessagesAction("nope")).toMatchObject({ kind: "invalid-target" });
  });
});
