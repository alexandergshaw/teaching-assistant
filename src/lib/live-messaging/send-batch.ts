/**
 * Server-side logic of the live student send (LIVE-LMS-STUDENT-MESSAGING W4):
 * the one-institution runtime assertion, the digests, and the per-recipient
 * unit (read, digest check, claim, POST, settle). A plain leaf with every
 * external dependency INJECTED, so it is tested without Canvas or Supabase and
 * the owner-gated action file stays a thin binder.
 *
 * This file imports NOTHING from the Canvas inbox module: the sender is handed
 * in. The action file is the only place that names it.
 *
 * Boundary rules: no console, no fetch, no model call, no service-role client.
 * Nothing here ever logs or returns a name, a subject or a body.
 */

import { createHash } from "node:crypto";
import { BODY_MAX_CHARS, MAX_BATCH_RECIPIENTS, SUBJECT_MAX_CHARS } from "./send-constants";
import {
  ledgerOutcomeFor,
  type LedgerOutcome,
  type LedgerRow,
  type LedgerStatus,
  type SendOutcomeInput,
} from "./send-ledger";

export type LiveSendRefusalKind =
  | "not-authorized"
  | "invalid-institution"
  | "not-connected"
  | "unavailable"
  | "institution-not-sendable"
  | "institution-mismatch"
  | "course-not-in-institution"
  | "invalid-target"
  | "duplicate-target"
  | "batch-size"
  | "digest-mismatch"
  | "ledger-unavailable";

export interface LiveSendRefusal {
  status: "refused";
  kind: LiveSendRefusalKind;
  reason: string;
  /** An offender count and nothing else. */
  count?: number;
}

// Fixed copy. It never echoes a host, a URL, an id or a Canvas string.
const REFUSAL_COPY = {
  "not-authorized": "Your session needs to be re-verified before sending. Nothing was sent.",
  "invalid-institution": "That institution code is not valid. Nothing was sent.",
  "not-connected": "This institution is not connected to a Canvas account. Nothing was sent.",
  unavailable: "Canvas could not be reached right now. Nothing was sent.",
  "institution-not-sendable": "Sending is not available for this institution yet. Nothing was sent.",
  "institution-mismatch": "A selected course does not belong to this institution. Nothing was sent.",
  "course-not-in-institution": "A selected course is not one of your active courses here. Nothing was sent.",
  "invalid-target": "Some messages are not valid to send. Nothing was sent.",
  "duplicate-target": "A student appears more than once in this batch. Nothing was sent.",
  "batch-size": "This batch is empty or larger than the allowed size. Nothing was sent.",
  "digest-mismatch": "The messages changed after they were previewed. Preview them again. Nothing was sent.",
  "ledger-unavailable": "The send record could not be reached, so nothing was sent.",
} satisfies Record<LiveSendRefusalKind, string>;

export function refusal(kind: LiveSendRefusalKind, count?: number): LiveSendRefusal {
  return count === undefined
    ? { status: "refused", kind, reason: REFUSAL_COPY[kind] }
    : { status: "refused", kind, reason: REFUSAL_COPY[kind], count };
}

export const INSTITUTION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,15}$/;
export const NUMERIC_ID_PATTERN = /^\d{1,12}$/;
const UNRESOLVED_TOKEN = /\{\{[^{}]*\}\}/;

export interface BatchTargetInput {
  courseId: string;
  recipientUserId: string;
  subject: string;
  body: string;
  /** The owner's explicit per-recipient Resend-anyway decision (Start only). */
  allowResend?: boolean;
}

export interface BatchInput {
  institutionCode: string;
  targets: BatchTargetInput[];
}

/** sha256 hex of: code LF courseId LF userId LF subject LF body. */
export function computeDigest(
  code: string,
  courseId: string,
  userId: string,
  subject: string,
  body: string
): string {
  return createHash("sha256").update([code, courseId, userId, subject, body].join("\n")).digest("hex");
}

export function targetKey(courseId: string, userId: string): string {
  return `${courseId}:${userId}`;
}

/** Order-independent digest of the whole batch, over the per-recipient digests. */
export function computeBatchDigest(
  code: string,
  targets: ReadonlyArray<Pick<BatchTargetInput, "courseId" | "recipientUserId" | "subject" | "body">>
): string {
  const lines = targets
    .map((t) => `${targetKey(t.courseId, t.recipientUserId)}:${computeDigest(code, t.courseId, t.recipientUserId, t.subject, t.body)}`)
    .sort();
  return createHash("sha256").update([code, ...lines].join("\n")).digest("hex");
}

export interface SingleInstitutionDeps {
  /** Resolve the credential for a code; throws on failure. */
  resolveByCode(code: string): Promise<{ baseUrl: string }>;
  /** True for the one indistinguishable credential-required failure. */
  isCredentialRequired(err: unknown): boolean;
  /** Resolve a course URL through the host registry; throws when not registered. */
  resolveForUrl(url: string): Promise<{ institution: { code: string } }>;
  /** The owner's active teacher course ids for a code (step 7). */
  listCourseIds(code: string): Promise<string[]>;
}

export interface ValidatedBatch {
  readonly code: string;
  readonly baseUrl: string;
  readonly targets: ReadonlyArray<BatchTargetInput>;
}

/**
 * The runtime assertion behind the one-institution guarantee. Order is fixed;
 * any failure refuses the WHOLE batch. The wire type carries no URL and no
 * host: every course URL is derived here from the credential of the ONE code.
 */
export async function assertSingleInstitutionBatch(
  input: BatchInput,
  deps: SingleInstitutionDeps,
  options: { checkCourseMembership: boolean }
): Promise<{ ok: true; batch: ValidatedBatch } | LiveSendRefusal> {
  // 1. the code is untrusted input
  const code = typeof input.institutionCode === "string" ? input.institutionCode.trim().toUpperCase() : "";
  if (!INSTITUTION_CODE_PATTERN.test(code)) return refusal("invalid-institution");

  // 2. size
  const targets = Array.isArray(input.targets) ? input.targets : [];
  if (targets.length < 1 || targets.length > MAX_BATCH_RECIPIENTS) return refusal("batch-size");

  // 3. per-target shape; an offender COUNT only
  let offenders = 0;
  for (const t of targets) {
    const ok =
      t !== null &&
      typeof t === "object" &&
      typeof t.courseId === "string" &&
      NUMERIC_ID_PATTERN.test(t.courseId) &&
      typeof t.recipientUserId === "string" &&
      NUMERIC_ID_PATTERN.test(t.recipientUserId) &&
      typeof t.body === "string" &&
      t.body.trim().length > 0 &&
      t.body.length <= BODY_MAX_CHARS &&
      typeof t.subject === "string" &&
      t.subject.length <= SUBJECT_MAX_CHARS &&
      !UNRESOLVED_TOKEN.test(t.subject) &&
      !UNRESOLVED_TOKEN.test(t.body);
    if (!ok) offenders += 1;
  }
  if (offenders > 0) return refusal("invalid-target", offenders);

  // 4. unique (courseId, recipientUserId)
  const seen = new Set<string>();
  for (const t of targets) {
    const key = targetKey(t.courseId, t.recipientUserId);
    if (seen.has(key)) return refusal("duplicate-target");
    seen.add(key);
  }

  // 5. ONE credential by code
  let baseUrl: string;
  try {
    baseUrl = (await deps.resolveByCode(code)).baseUrl;
  } catch (err) {
    return refusal(deps.isCredentialRequired(err) ? "not-connected" : "unavailable");
  }
  if (typeof baseUrl !== "string" || !baseUrl) return refusal("unavailable");
  const base = baseUrl.replace(/\/+$/, "");

  // 6. every distinct course URL resolves to the SAME institution as the code
  const courseIds = Array.from(new Set(targets.map((t) => t.courseId)));
  for (const courseId of courseIds) {
    let resolvedCode: string;
    try {
      resolvedCode = (await deps.resolveForUrl(`${base}/courses/${courseId}`)).institution.code;
    } catch {
      return refusal("institution-not-sendable");
    }
    if (resolvedCode !== code) return refusal("institution-mismatch");
  }

  // 7. numeric ids are instance-scoped: each course must be one of the owner's
  if (options.checkCourseMembership) {
    let active: Set<string>;
    try {
      active = new Set(await deps.listCourseIds(code));
    } catch {
      return refusal("unavailable");
    }
    for (const courseId of courseIds) {
      if (!active.has(courseId)) return refusal("course-not-in-institution");
    }
  }

  return { ok: true, batch: { code, baseUrl: base, targets } };
}

// ---------------------------------------------------------------------------
// The per-recipient unit
// ---------------------------------------------------------------------------

export interface LedgerOps {
  readRowByKey(input: {
    batchId: string;
    courseId: string;
    recipientId: string;
  }): Promise<{ ok: true; row: LedgerRow | null } | { ok: false }>;
  claimRow(input: { id: string; digest: string }): Promise<{ ok: true; row: LedgerRow | null } | { ok: false }>;
  settleRow(input: { id: string; outcome: LedgerOutcome }): Promise<{ ok: true; settled: boolean } | { ok: false }>;
}

export interface UnitDeps extends SingleInstitutionDeps {
  ledger: LedgerOps;
  /** The typed per-student sender. Must never throw. */
  send(courseUrl: string, recipientUserId: string, body: string, subject?: string): Promise<SendOutcomeInput>;
}

/** One recipient's result. No names, no subject, no body. */
export interface LiveUnitResult {
  key: string;
  /** What the unit did: a POST outcome, or skipped / refused with no POST. */
  status: "accepted" | "refused" | "unknown" | "skipped";
  code: string | null;
  httpStatus: number | null;
  /** Set when the unit refused BEFORE any POST. */
  refusalKind?: LiveSendRefusalKind;
  /** For a skipped unit: what the ledger says the row is. */
  current?: LedgerStatus;
  /** Whether the settle write landed (false means the row reconciles to unknown). */
  settled?: boolean;
}

function preSend(key: string, kind: LiveSendRefusalKind): LiveUnitResult {
  return { key, status: "refused", code: null, httpStatus: null, refusalKind: kind };
}

/**
 * Claim, POST, settle ONE recipient. code, courseId and userId come from the
 * claimed LEDGER row, never from the client; only subject and body are
 * arguments, and they must reproduce the row's digest. A lost or failed ledger
 * step never leads to a POST, and a failed settle never changes what is
 * returned: the row then reconciles to unknown, which blocks a resend.
 */
export async function runSendUnit(
  deps: UnitDeps,
  input: { batchId: string; recipientKey: string; subject: string; body: string }
): Promise<LiveUnitResult> {
  const key = input.recipientKey;
  const match = /^(\d{1,12}):(\d{1,12})$/.exec(key);
  if (!match) return preSend(key, "invalid-target");
  const [, courseId, recipientId] = match;

  const read = await deps.ledger.readRowByKey({ batchId: input.batchId, courseId, recipientId });
  if (!read.ok) return preSend(key, "ledger-unavailable");
  const row = read.row;
  if (!row) return preSend(key, "invalid-target");
  if (row.status !== "pending") return { key, status: "skipped", code: null, httpStatus: null, current: row.status };

  const digest = computeDigest(row.institution, row.courseId, row.recipientId, input.subject, input.body);
  if (digest !== row.bodyDigest) return preSend(key, "digest-mismatch");

  const checked = await assertSingleInstitutionBatch(
    {
      institutionCode: row.institution,
      targets: [{ courseId: row.courseId, recipientUserId: row.recipientId, subject: input.subject, body: input.body }],
    },
    deps,
    { checkCourseMembership: false }
  );
  if (!("ok" in checked)) return preSend(key, checked.kind);
  const { batch } = checked;

  const claim = await deps.ledger.claimRow({ id: row.id, digest });
  if (!claim.ok) return preSend(key, "ledger-unavailable");
  if (!claim.row) {
    // Zero rows: someone else holds it, it is terminal, or the duplicate guard
    // blocked it. A row still pending afterwards can only mean the guard.
    const again = await deps.ledger.readRowByKey({ batchId: input.batchId, courseId, recipientId });
    const current: LedgerStatus = again.ok && again.row ? again.row.status : row.status;
    return { key, status: "skipped", code: null, httpStatus: null, current };
  }

  // Past this line a POST is about to happen: nothing below may reclassify a
  // failure as "refused".
  let result: SendOutcomeInput;
  try {
    result = await deps.send(`${batch.baseUrl}/courses/${courseId}`, recipientId, input.body, input.subject);
  } catch {
    result = { status: "unknown", code: "unknown-no-response" };
  }
  const outcome = ledgerOutcomeFor(result);

  let settled = false;
  try {
    const s = await deps.ledger.settleRow({ id: claim.row.id, outcome });
    settled = s.ok && s.settled;
  } catch {
    settled = false;
  }
  return { key, status: outcome.status, code: outcome.code, httpStatus: outcome.httpStatus, settled };
}
