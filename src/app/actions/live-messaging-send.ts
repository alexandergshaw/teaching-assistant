"use server";

// LIVE-LMS-STUDENT-MESSAGING W4: the SEND side. Five owner-only actions the
// browser drives, one call per recipient (a Server Action here has the
// platform's unconfigured duration, so the loop lives in the client and this
// file never loops over recipients to POST):
//
//   A4 prepare  - assertion, ledger reconcile + duplicate lookup, returns a digest; sends nothing
//   A5 start    - verifies the digest, creates the pending ledger rows
//   A6 send     - ONE recipient: claim, POST, settle
//   A7 get      - reconcile stale sending rows, then the batch's statuses
//   A8 requeue  - refused rows back to pending (bounded attempts)
//
// The ONLY send primitive named from the Canvas inbox module is the typed
// per-student sender. The module also exports a course-wide broadcast; it is
// never imported here, and a source-text test pins that.
//
// A "use server" file exports only async functions, so every result type lives
// in @/lib/live-messaging/send-results and send-batch.

import { requireAppOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveInstitution, resolveInstitutionByCode } from "@/lib/canvas-core";
import { CANVAS_CREDENTIAL_REQUIRED_MESSAGE } from "@/lib/canvas-credential-message";
import { sendStudentConversation } from "@/lib/canvas/inbox";
import { buildLiveEnrollmentReaders } from "@/lib/live-messaging/enrollment-readers";
import {
  assertSingleInstitutionBatch,
  computeBatchDigest,
  computeDigest,
  refusal,
  runSendUnit,
  targetKey,
  type BatchInput,
  type LiveUnitResult,
  type SingleInstitutionDeps,
} from "@/lib/live-messaging/send-batch";
import {
  claimRow,
  ledgerKey,
  lookupDuplicates,
  pruneOld,
  readBatchRows,
  readRowByKey,
  reconcileStale,
  requeueRefused,
  settleRow,
  startBatch,
  type LedgerStatus,
} from "@/lib/live-messaging/send-ledger";
import type {
  ExcludedRecipient,
  LiveBatchStatusResult,
  LivePrepareResult,
  LiveRequeueResult,
  LiveStartResult,
} from "@/lib/live-messaging/send-results";

const BATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;

function assertionDeps(): SingleInstitutionDeps {
  return {
    resolveByCode: (code) => resolveInstitutionByCode(code),
    isCredentialRequired: (err) => err instanceof Error && err.message === CANVAS_CREDENTIAL_REQUIRED_MESSAGE,
    resolveForUrl: (url) => resolveInstitution(url),
    listCourseIds: async (code) => (await buildLiveEnrollmentReaders().listCourses(code)).map((c) => c.id),
  };
}

// sending outranks unknown outranks accepted when a recipient has several rows.
const DUP_RANK: Record<string, number> = { sending: 0, unknown: 1, accepted: 2 };

function worstDup(rows: ReadonlyArray<{ status: LedgerStatus }>): LedgerStatus {
  return [...rows].sort((a, b) => (DUP_RANK[a.status] ?? 3) - (DUP_RANK[b.status] ?? 3))[0].status;
}

/** A4: dry-run. Writes only the stale reconcile (inside the lookup) and a best-effort prune. */
export async function prepareLiveMessageBatchAction(input: BatchInput): Promise<LivePrepareResult> {
  await requireAppOwner();
  const checked = await assertSingleInstitutionBatch(input, assertionDeps(), { checkCourseMembership: true });
  if (!("ok" in checked)) return checked;
  const { batch } = checked;

  const supabase = await createClient();
  const found = await lookupDuplicates(supabase, {
    institution: batch.code,
    targets: batch.targets.map((t) => ({
      courseId: t.courseId,
      recipientId: t.recipientUserId,
      digest: computeDigest(batch.code, t.courseId, t.recipientUserId, t.subject, t.body),
    })),
  });
  if (!found.ok) return refusal("ledger-unavailable");

  const byKey = new Map<string, { status: LedgerStatus }[]>();
  for (const row of found.rows) {
    const k = ledgerKey(row);
    byKey.set(k, [...(byKey.get(k) ?? []), row]);
  }
  const excluded: ExcludedRecipient[] = [];
  for (const t of batch.targets) {
    const hits = byKey.get(targetKey(t.courseId, t.recipientUserId));
    if (hits && hits.length > 0) excluded.push({ key: targetKey(t.courseId, t.recipientUserId), dupStatus: worstDup(hits) });
  }

  // Best-effort retention prune: its failure is ignored (it is not safety-critical).
  try {
    await pruneOld(supabase);
  } catch {
    // ignored
  }

  return {
    status: "ready",
    institution: batch.code,
    count: batch.targets.length,
    digest: computeBatchDigest(batch.code, batch.targets),
    excluded,
  };
}

/** A5: re-verifies everything and creates one pending ledger row per recipient. */
export async function startLiveMessageBatchAction(input: BatchInput, expectedDigest: string): Promise<LiveStartResult> {
  await requireAppOwner();
  const checked = await assertSingleInstitutionBatch(input, assertionDeps(), { checkCourseMembership: true });
  if (!("ok" in checked)) return checked;
  const { batch } = checked;

  if (typeof expectedDigest !== "string" || !DIGEST.test(expectedDigest)) return refusal("digest-mismatch");
  if (computeBatchDigest(batch.code, batch.targets) !== expectedDigest) return refusal("digest-mismatch");

  const supabase = await createClient();
  const started = await startBatch(supabase, {
    institution: batch.code,
    targets: batch.targets.map((t) => ({
      courseId: t.courseId,
      recipientId: t.recipientUserId,
      digest: computeDigest(batch.code, t.courseId, t.recipientUserId, t.subject, t.body),
      allowResend: t.allowResend === true,
    })),
  });
  if (!started.ok) return refusal("ledger-unavailable");
  return {
    status: "started",
    batchId: started.batchId,
    recipients: started.recipients.map((r) => ({
      key: targetKey(r.courseId, r.recipientId),
      outcome: r.outcome,
      dupStatus: r.dupStatus,
    })),
  };
}

/** A6: ONE recipient. code, course and user are read from the claimed ledger row. */
export async function sendLiveMessageAction(
  batchId: string,
  recipientKey: string,
  subject: string,
  body: string
): Promise<LiveUnitResult> {
  await requireAppOwner();
  if (typeof batchId !== "string" || !BATCH_ID.test(batchId) || typeof recipientKey !== "string") {
    return { key: String(recipientKey), status: "refused", code: null, httpStatus: null, refusalKind: "invalid-target" };
  }
  const supabase = await createClient();
  return runSendUnit(
    {
      ...assertionDeps(),
      ledger: {
        readRowByKey: (i) => readRowByKey(supabase, i),
        claimRow: (i) => claimRow(supabase, i),
        settleRow: (i) => settleRow(supabase, i),
      },
      send: sendStudentConversation,
    },
    { batchId, recipientKey, subject: String(subject ?? ""), body: String(body ?? "") }
  );
}

/** A7: reconcile stale sending rows, then report the batch's statuses by key. */
export async function getLiveMessageBatchAction(batchId: string): Promise<LiveBatchStatusResult> {
  await requireAppOwner();
  if (typeof batchId !== "string" || !BATCH_ID.test(batchId)) return refusal("invalid-target");
  const supabase = await createClient();
  const reconciled = await reconcileStale(supabase);
  if (!reconciled.ok) return refusal("ledger-unavailable");
  const read = await readBatchRows(supabase, batchId);
  if (!read.ok) return refusal("ledger-unavailable");
  return {
    status: "ok",
    rows: read.rows.map((r) => ({
      key: ledgerKey(r),
      status: r.status,
      code: r.code,
      httpStatus: r.httpStatus,
      attempt: r.attempt,
    })),
  };
}

/** A8: refused rows back to pending, bounded by MAX_ATTEMPTS. Sends nothing itself. */
export async function requeueRefusedLiveMessagesAction(batchId: string): Promise<LiveRequeueResult> {
  await requireAppOwner();
  if (typeof batchId !== "string" || !BATCH_ID.test(batchId)) return refusal("invalid-target");
  const supabase = await createClient();
  const result = await requeueRefused(supabase, batchId);
  if (!result.ok) return refusal("ledger-unavailable");
  return { status: "requeued", count: result.count };
}
