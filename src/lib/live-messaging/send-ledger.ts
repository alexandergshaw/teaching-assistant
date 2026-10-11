/**
 * The durable send ledger, TypeScript side (LIVE-LMS-STUDENT-MESSAGING W4).
 * The table and the seven RPCs it calls are defined in
 * supabase/migrations/20261029000000_create_live_message_sends.sql; the design
 * is docs/live-lms-student-messaging-ledger.md.
 *
 * This module is handed the COOKIE-SESSION client and nothing else. It never
 * references the service-role client: the RPCs derive the owner from auth.uid(),
 * so a call with no user JWT raises and nothing can be sent from an unattended
 * path.
 *
 * FAIL CLOSED. Every wrapper returns `{ ok: true, ... } | { ok: false }`; `ok:
 * false` covers an RPC error object, a thrown rejection AND the client-side
 * timeout. A caller must never treat `ok: false` as "no rows".
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  DUP_WINDOW_MS,
  LEDGER_RETENTION_DAYS,
  LEDGER_RPC_TIMEOUT_MS,
  MAX_ATTEMPTS,
  MAX_BATCH_RECIPIENTS,
  PRUNE_BATCH_LIMIT,
  SENDING_STALE_MS,
} from "./send-constants";

export type LedgerStatus = "pending" | "sending" | "accepted" | "refused" | "unknown";
export type LedgerCode =
  | "ok"
  | "refused-pre-send"
  | "refused-http"
  | "refused-rate-limited"
  | "unknown-http"
  | "unknown-no-response"
  | "unknown-stale-claim";

export interface LedgerRow {
  id: string;
  batchId: string;
  institution: string;
  courseId: string;
  recipientId: string;
  bodyDigest: string;
  status: LedgerStatus;
  code: LedgerCode | null;
  httpStatus: number | null;
  attempt: number;
  allowResend: boolean;
  createdAt: string;
  claimedAt: string | null;
  settledAt: string | null;
}

const STATUSES: ReadonlySet<string> = new Set(["pending", "sending", "accepted", "refused", "unknown"]);
const CODES: ReadonlySet<string> = new Set([
  "ok",
  "refused-pre-send",
  "refused-http",
  "refused-rate-limited",
  "unknown-http",
  "unknown-no-response",
  "unknown-stale-claim",
]);

function optionalString(raw: unknown): string | null {
  return raw === null || raw === undefined ? null : String(raw);
}

/**
 * Field by field, never a spread. An unrecognised status maps to "unknown", the
 * never-resend state (a ledger that guards against double sends must fail toward
 * "possibly sent"), never to "pending" and never throws. An unrecognised code
 * maps to null. `user_id` is deliberately not carried.
 */
export function mapLedgerRow(row: Record<string, unknown>): LedgerRow {
  const status = typeof row.status === "string" && STATUSES.has(row.status) ? (row.status as LedgerStatus) : "unknown";
  const code = typeof row.code === "string" && CODES.has(row.code) ? (row.code as LedgerCode) : null;
  const http = row.http_status === null || row.http_status === undefined ? null : Number(row.http_status);
  return {
    id: String(row.id ?? ""),
    batchId: String(row.batch_id ?? ""),
    institution: String(row.institution ?? ""),
    courseId: String(row.course_id ?? ""),
    recipientId: String(row.recipient_id ?? ""),
    bodyDigest: String(row.body_digest ?? ""),
    status,
    code,
    httpStatus: http !== null && Number.isFinite(http) ? http : null,
    attempt: Number(row.attempt ?? 0) || 0,
    allowResend: Boolean(row.allow_resend),
    createdAt: String(row.created_at ?? ""),
    claimedAt: optionalString(row.claimed_at),
    settledAt: optionalString(row.settled_at),
  };
}

/** The opaque per-recipient key the client and server share. */
export function ledgerKey(row: { courseId: string; recipientId: string }): string {
  return `${row.courseId}:${row.recipientId}`;
}

/**
 * Display-only: a sending row older than SENDING_STALE_MS reads as unknown. The
 * same SENDING_STALE_MS is what the reconcile RPC is passed, so display and
 * persistence cannot disagree.
 */
export function effectiveStatus(row: Pick<LedgerRow, "status" | "claimedAt">, nowMs: number): LedgerStatus {
  if (row.status !== "sending") return row.status;
  const claimed = row.claimedAt ? Date.parse(row.claimedAt) : NaN;
  if (!Number.isFinite(claimed)) return "unknown";
  return nowMs - claimed > SENDING_STALE_MS ? "unknown" : "sending";
}

/** Structural input: the sender's result, without importing the sender module. */
export interface SendOutcomeInput {
  status: "accepted" | "refused" | "unknown";
  code: string;
  httpStatus?: number;
}

export interface LedgerOutcome {
  status: "accepted" | "refused" | "unknown";
  code: LedgerCode;
  httpStatus: number | null;
}

/**
 * Total mapping from a send result to a (status, code, httpStatus) triple that
 * satisfies live_message_sends_state_shape. An incoherent pair is unrepresentable:
 * an unrecognised code falls back to the conservative unknown/unknown-http.
 */
export function ledgerOutcomeFor(result: SendOutcomeInput): LedgerOutcome {
  const httpStatus = typeof result.httpStatus === "number" ? result.httpStatus : null;
  if (result.status === "accepted") return { status: "accepted", code: "ok", httpStatus };
  if (result.status === "refused") {
    const code: LedgerCode =
      result.code === "refused-http" || result.code === "refused-rate-limited" ? result.code : "refused-pre-send";
    return { status: "refused", code, httpStatus };
  }
  const code: LedgerCode = result.code === "unknown-no-response" ? "unknown-no-response" : "unknown-http";
  return { status: "unknown", code, httpStatus };
}

// ---------------------------------------------------------------------------
// RPC layer
// ---------------------------------------------------------------------------

type LedgerRpcName =
  | "live_message_reconcile"
  | "live_message_dup_lookup"
  | "live_message_start_batch"
  | "live_message_claim"
  | "live_message_settle"
  | "live_message_requeue_refused"
  | "live_message_prune";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ledgerClient(supabase: SupabaseClient<Database>): any {
  // The generated Database type does not know this table or these functions (a
  // typed call would collapse to `never`). The `any` cast is confined to this
  // one function; callers get explicitly typed shapes back through mapLedgerRow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

async function withTimeout<T>(work: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("ledger timeout")), LEDGER_RPC_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve(work), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function callLedgerRpc(
  supabase: SupabaseClient<Database>,
  name: LedgerRpcName,
  args: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false }> {
  try {
    const result = (await withTimeout(ledgerClient(supabase).rpc(name, args))) as {
      data: unknown;
      error: unknown;
    };
    if (!result || result.error) return { ok: false };
    return { ok: true, data: result.data };
  } catch {
    return { ok: false };
  }
}

function asRecords(data: unknown): Record<string, unknown>[] {
  return Array.isArray(data) ? (data.filter((r) => r && typeof r === "object") as Record<string, unknown>[]) : [];
}

export type LedgerFail = { ok: false };

export async function reconcileStale(
  supabase: SupabaseClient<Database>
): Promise<{ ok: true; reconciled: number; dbNow: string | null } | LedgerFail> {
  const r = await callLedgerRpc(supabase, "live_message_reconcile", { p_stale_ms: SENDING_STALE_MS });
  if (!r.ok) return { ok: false };
  const first = asRecords(r.data)[0];
  return {
    ok: true,
    reconciled: first ? Number(first.reconciled ?? 0) || 0 : 0,
    dbNow: first ? optionalString(first.db_now) : null,
  };
}

export interface LedgerTargetKey {
  courseId: string;
  recipientId: string;
}

export async function lookupDuplicates(
  supabase: SupabaseClient<Database>,
  input: { institution: string; targets: ReadonlyArray<LedgerTargetKey & { digest: string }> }
): Promise<{ ok: true; rows: LedgerRow[] } | LedgerFail> {
  const r = await callLedgerRpc(supabase, "live_message_dup_lookup", {
    p_institution: input.institution,
    p_course_ids: input.targets.map((t) => t.courseId),
    p_recipient_ids: input.targets.map((t) => t.recipientId),
    p_digests: input.targets.map((t) => t.digest),
    p_window_ms: DUP_WINDOW_MS,
    p_stale_ms: SENDING_STALE_MS,
  });
  if (!r.ok) return { ok: false };
  return { ok: true, rows: asRecords(r.data).map(mapLedgerRow) };
}

export interface StartedRecipient {
  courseId: string;
  recipientId: string;
  outcome: "inserted" | "duplicate";
  dupStatus: LedgerStatus | null;
}

export async function startBatch(
  supabase: SupabaseClient<Database>,
  input: {
    institution: string;
    targets: ReadonlyArray<LedgerTargetKey & { digest: string; allowResend: boolean }>;
  }
): Promise<{ ok: true; batchId: string; recipients: StartedRecipient[] } | LedgerFail> {
  const r = await callLedgerRpc(supabase, "live_message_start_batch", {
    p_institution: input.institution,
    p_course_ids: input.targets.map((t) => t.courseId),
    p_recipient_ids: input.targets.map((t) => t.recipientId),
    p_digests: input.targets.map((t) => t.digest),
    p_allow_resend: input.targets.map((t) => t.allowResend),
    p_window_ms: DUP_WINDOW_MS,
    p_stale_ms: SENDING_STALE_MS,
    p_max_recipients: MAX_BATCH_RECIPIENTS,
  });
  if (!r.ok) return { ok: false };
  const rows = asRecords(r.data);
  if (rows.length === 0) return { ok: false };
  const batchId = String(rows[0].o_batch_id ?? "");
  if (!batchId) return { ok: false };
  return {
    ok: true,
    batchId,
    recipients: rows.map((row) => ({
      courseId: String(row.o_course_id ?? ""),
      recipientId: String(row.o_recipient_id ?? ""),
      outcome: row.o_outcome === "inserted" ? "inserted" : "duplicate",
      dupStatus:
        typeof row.o_dup_status === "string" && STATUSES.has(row.o_dup_status)
          ? (row.o_dup_status as LedgerStatus)
          : null,
    })),
  };
}

/** Zero rows back means SKIPPED (no POST): guard hit, not pending, wrong digest, or not ours. */
export async function claimRow(
  supabase: SupabaseClient<Database>,
  input: { id: string; digest: string }
): Promise<{ ok: true; row: LedgerRow | null } | LedgerFail> {
  const r = await callLedgerRpc(supabase, "live_message_claim", {
    p_id: input.id,
    p_digest: input.digest,
    p_window_ms: DUP_WINDOW_MS,
    p_stale_ms: SENDING_STALE_MS,
  });
  if (!r.ok) return { ok: false };
  const first = asRecords(r.data)[0];
  return { ok: true, row: first ? mapLedgerRow(first) : null };
}

export async function settleRow(
  supabase: SupabaseClient<Database>,
  input: { id: string; outcome: LedgerOutcome }
): Promise<{ ok: true; settled: boolean } | LedgerFail> {
  const r = await callLedgerRpc(supabase, "live_message_settle", {
    p_id: input.id,
    p_status: input.outcome.status,
    p_code: input.outcome.code,
    p_http_status: input.outcome.httpStatus,
  });
  if (!r.ok) return { ok: false };
  return { ok: true, settled: r.data === true };
}

export async function requeueRefused(
  supabase: SupabaseClient<Database>,
  batchId: string
): Promise<{ ok: true; count: number } | LedgerFail> {
  const r = await callLedgerRpc(supabase, "live_message_requeue_refused", {
    p_batch_id: batchId,
    p_max_attempts: MAX_ATTEMPTS,
  });
  if (!r.ok) return { ok: false };
  return { ok: true, count: Number(r.data ?? 0) || 0 };
}

export async function pruneOld(supabase: SupabaseClient<Database>): Promise<{ ok: true; count: number } | LedgerFail> {
  const r = await callLedgerRpc(supabase, "live_message_prune", {
    p_retention_days: LEDGER_RETENTION_DAYS,
    p_limit: PRUNE_BATCH_LIMIT,
  });
  if (!r.ok) return { ok: false };
  return { ok: true, count: Number(r.data ?? 0) || 0 };
}

// ---------------------------------------------------------------------------
// Plain reads through the SELECT policy
// ---------------------------------------------------------------------------

export async function readRowByKey(
  supabase: SupabaseClient<Database>,
  input: { batchId: string; courseId: string; recipientId: string }
): Promise<{ ok: true; row: LedgerRow | null } | LedgerFail> {
  try {
    const result = (await withTimeout(
      ledgerClient(supabase)
        .from("live_message_sends")
        .select("*")
        .eq("batch_id", input.batchId)
        .eq("course_id", input.courseId)
        .eq("recipient_id", input.recipientId)
        .limit(1)
    )) as { data: unknown; error: unknown };
    if (!result || result.error) return { ok: false };
    const first = asRecords(result.data)[0];
    return { ok: true, row: first ? mapLedgerRow(first) : null };
  } catch {
    return { ok: false };
  }
}

export async function readBatchRows(
  supabase: SupabaseClient<Database>,
  batchId: string
): Promise<{ ok: true; rows: LedgerRow[] } | LedgerFail> {
  try {
    const result = (await withTimeout(
      ledgerClient(supabase).from("live_message_sends").select("*").eq("batch_id", batchId).limit(1000)
    )) as { data: unknown; error: unknown };
    if (!result || result.error) return { ok: false };
    return { ok: true, rows: asRecords(result.data).map(mapLedgerRow) };
  } catch {
    return { ok: false };
  }
}
