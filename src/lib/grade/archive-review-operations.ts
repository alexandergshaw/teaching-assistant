import "server-only";
import { validReviewId } from "./archive-review-principal";
import { isArchiveReviewSourcePath } from "./archive-review-source";
import { beginArchiveReviewDeletion, type ReviewRetentionState } from "./archive-review-retention";

type OperationKind = "read" | "write";
export interface ArchiveReviewOperation { readonly id: string; readonly kind: OperationKind; readonly state: "active" | "ended" }
export interface ArchiveOperationLedger {
  readonly phase: "active" | "deleting" | "deleted";
  readonly ownerId: string;
  readonly reviewId: string;
  readonly sourceId: string;
  readonly sourcePath: string;
  readonly expiresAtMs: number;
  /** Trusted policy attestation: no direct client or signed/resumable writes. */
  readonly writerBoundary: "server-only-fenced" | "unknown";
  /** Any issued or uncertain external upload capability requires a different protocol. */
  readonly uploadCapabilities: "never-issued" | "unknown";
  readonly sourceSha256: string | null;
  readonly operations: readonly ArchiveReviewOperation[];
}

const MAX_OPERATIONS = 1000;
const SHA256 = /^[a-f0-9]{64}$/;

/** Untrusted or incomplete state is never eligible for operations or deletion. */
function validLedger(ledger: ArchiveOperationLedger): boolean {
  if (!ledger || !["active", "deleting", "deleted"].includes(ledger.phase) || !validReviewId(ledger.ownerId) || !validReviewId(ledger.reviewId) || !validReviewId(ledger.sourceId) || typeof ledger.sourcePath !== "string" || !isArchiveReviewSourcePath(ledger.ownerId, ledger.reviewId, ledger.sourcePath) || !ledger.sourcePath.endsWith(`/${ledger.sourceId}.zip`) || !Number.isSafeInteger(ledger.expiresAtMs) || ledger.expiresAtMs < 0 || (ledger.writerBoundary !== "unknown" && ledger.writerBoundary !== "server-only-fenced") || (ledger.uploadCapabilities !== "unknown" && ledger.uploadCapabilities !== "never-issued") || (ledger.sourceSha256 !== null && (typeof ledger.sourceSha256 !== "string" || !SHA256.test(ledger.sourceSha256))) || !Array.isArray(ledger.operations) || ledger.operations.length > MAX_OPERATIONS) return false;
  const ids = new Set<string>();
  for (const operation of ledger.operations) {
    if (!operation || !validReviewId(operation.id) || ids.has(operation.id.toLowerCase()) || !["read", "write"].includes(operation.kind) || !["active", "ended"].includes(operation.state)) return false;
    ids.add(operation.id.toLowerCase());
  }
  const active = ledger.operations.filter((operation) => operation.state === "active");
  if (active.some((operation) => operation.kind === "write") && active.length !== 1) return false;
  if (ledger.sourceSha256 === null && active.some((operation) => operation.kind === "read")) return false;
  if (ledger.sourceSha256 !== null && active.some((operation) => operation.kind === "write")) return false;
  return true;
}

/**
 * Invoke and persist under one exclusive owner-scoped DB transaction. Never
 * reissue an operation ID, including after a successful completion.
 */
export function startArchiveOperation(ledger: ArchiveOperationLedger, kind: OperationKind, operationId: string, nowMs: number): ArchiveOperationLedger | null {
  if (!validLedger(ledger) || ledger.phase !== "active" || ledger.writerBoundary !== "server-only-fenced" || ledger.uploadCapabilities !== "never-issued" || !validReviewId(operationId) || !Number.isSafeInteger(nowMs) || nowMs < 0 || nowMs >= ledger.expiresAtMs || ledger.operations.length >= MAX_OPERATIONS || ledger.operations.some((operation) => operation.id.toLowerCase() === operationId.toLowerCase())) return null;
  const active = ledger.operations.filter((operation) => operation.state === "active");
  if (kind === "write") {
    if (ledger.sourceSha256 !== null || active.length) return null;
  } else if (kind === "read") {
    if (ledger.sourceSha256 === null || active.some((operation) => operation.kind === "write")) return null;
  } else return null;
  return { ...ledger, operations: [...ledger.operations, { id: operationId, kind, state: "active" }] };
}

/**
 * Only the operation owner may finish after proving its external work is
 * quiescent. A lost response, timeout or merely expired lease is not proof.
 * For writes, verified-stored requires an independently verified source hash;
 * verified-absent requires proof no upload can later complete.
 */
export function finishArchiveOperation(
  ledger: ArchiveOperationLedger,
  operationId: string,
  outcome: { readonly kind: "read-quiesced" } | { readonly kind: "write-verified-stored"; readonly sourceSha256: string } | { readonly kind: "write-verified-absent" },
): ArchiveOperationLedger | null {
  if (!validLedger(ledger) || ledger.phase !== "active" || !validReviewId(operationId) || !outcome) return null;
  const operation = ledger.operations.find((item) => item.id === operationId && item.state === "active");
  if (!operation) return null;
  let sourceSha256 = ledger.sourceSha256;
  if (operation.kind === "read") {
    if (outcome.kind !== "read-quiesced") return null;
  } else if (outcome.kind === "write-verified-stored") {
    if (typeof outcome.sourceSha256 !== "string" || !SHA256.test(outcome.sourceSha256) || sourceSha256 !== null) return null;
    sourceSha256 = outcome.sourceSha256;
  } else if (outcome.kind !== "write-verified-absent") return null;
  return { ...ledger, sourceSha256, operations: ledger.operations.map((item) => item.id === operationId ? { ...item, state: "ended" } : item) };
}

/**
 * Caller must atomically persist this tombstone while holding the same DB lock
 * used by start/finish operations. A policy attestation cannot be derived from
 * the present broad course-files RLS or from an expiring upload capability.
 */
export function retireArchiveSource(ledger: ArchiveOperationLedger, nowMs: number, deleteToken: string): ReviewRetentionState | null {
  if (!validLedger(ledger) || ledger.phase !== "active" || ledger.writerBoundary !== "server-only-fenced" || ledger.uploadCapabilities !== "never-issued" || ledger.operations.some((operation) => operation.state === "active")) return null;
  return beginArchiveReviewDeletion({ phase: "active", ownerId: ledger.ownerId, reviewId: ledger.reviewId, sourceId: ledger.sourceId, sourcePath: ledger.sourcePath, expiresAtMs: ledger.expiresAtMs }, { activeReaders: 0, allWritersPermanentlyFenced: true }, nowMs, deleteToken);
}
