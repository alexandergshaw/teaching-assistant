import "server-only";
import { ARCHIVE_REVIEW_MAX_BYTES, type ArchiveReviewSnapshot } from "./archive-review-snapshot";
import { planValidatedArchive } from "./archive-review-validation";
import { validReviewId, type ArchiveReviewPrincipal } from "./archive-review-principal";
import { isArchiveReviewSourcePath } from "./archive-review-source";
import type { ArchiveReviewPlan, ReviewArchiveAssignment } from "./archive-omission-review";

/** Supplied by an owner-scoped server store, never directly by a client. */
export interface StoredArchiveReview {
  readonly reviewId: string;
  readonly ownerId: string;
  readonly authSessionId: string;
  readonly gradingSessionId: string;
  readonly storagePath: string;
  readonly snapshot: ArchiveReviewSnapshot;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export interface ArchiveReviewDependencies {
  /** Must verify owner and session on every call using server auth. */
  readonly authenticate: () => Promise<ArchiveReviewPrincipal>;
  /** Must query server-controlled records scoped by both owner and review ID. */
  readonly readOwnedReview: (ownerId: string, reviewId: string) => Promise<StoredArchiveReview | null>;
  /** Must use owner-authorized private storage and enforce a pre-download cap. */
  readonly readPrivateSource: (path: string, maxBytes: number) => Promise<Uint8Array | null>;
  readonly now: () => number;
}

const MAX_LIFETIME_MS = 60 * 60 * 1000;
const UNAVAILABLE = "The archive review is unavailable or expired. Upload the archive again.";

/** Copies only bounded fields from a server-store result before awaiting. */
function copySnapshot(snapshot: ArchiveReviewSnapshot): ArchiveReviewSnapshot | null {
  if (typeof snapshot?.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(snapshot.sourceSha256) || !Array.isArray(snapshot.members) || snapshot.members.length > 1000) return null;
  const members: Array<ArchiveReviewSnapshot["members"][number]> = [];
  for (const member of snapshot.members) {
    if (typeof member?.id !== "string" || !/^(0|[1-9][0-9]{0,3})$/.test(member.id) || typeof member.path !== "string" || !member.path || member.path.length > 4096 || !Number.isSafeInteger(member.crc32) || member.crc32 < 0 || member.crc32 > 0xffffffff || !Number.isSafeInteger(member.uncompressedSize) || member.uncompressedSize < 0 || member.uncompressedSize > 0xffffffff) return null;
    members.push({ id: member.id, path: member.path, crc32: member.crc32, uncompressedSize: member.uncompressedSize });
  }
  return { sourceSha256: snapshot.sourceSha256, members };
}

/**
 * Revalidates retained source and reviewed assignments for the same signed-in
 * owner, auth session and server-created grading session. This returns a
 * candidate plan only: no storage deletion, paid dispatch or retry occurs.
 * A production caller still needs a trusted persistent record, source-retention
 * lease and atomic one-time dispatch fencing; this module does not provide them.
 */
export async function planOwnedArchiveReview(
  input: { readonly reviewId: string; readonly gradingSessionId: string; readonly assignments: readonly ReviewArchiveAssignment[] },
  deps: ArchiveReviewDependencies,
): Promise<{ readonly ok: true; readonly plan: ArchiveReviewPlan } | { readonly ok: false; readonly reason: string }> {
  try {
    if (!validReviewId(input?.reviewId) || !validReviewId(input.gradingSessionId) || !Array.isArray(input.assignments) || input.assignments.length > 1000) return { ok: false, reason: UNAVAILABLE };
    const { reviewId, gradingSessionId } = input;
    const assignments = input.assignments.map((item) => ({ memberId: item?.memberId, studentKey: item?.studentKey, studentLabel: item?.studentLabel }));
    if (assignments.some((item) => typeof item.memberId !== "string" || item.memberId.length > 4 || typeof item.studentKey !== "string" || item.studentKey.length > 500 || typeof item.studentLabel !== "string" || item.studentLabel.length > 500)) return { ok: false, reason: UNAVAILABLE };
    const first = await deps.authenticate();
    if (!validReviewId(first.ownerId) || !validReviewId(first.authSessionId)) return { ok: false, reason: UNAVAILABLE };
    const authenticatedOwner = first.ownerId, authenticatedSession = first.authSessionId;
    const found = await deps.readOwnedReview(authenticatedOwner, reviewId);
    if (!found) return { ok: false, reason: UNAVAILABLE };
    const { ownerId, authSessionId, storagePath, createdAtMs, expiresAtMs } = found;
    const snapshot = copySnapshot(found.snapshot);
    const now = deps.now();
    if (found.reviewId !== reviewId || ownerId !== authenticatedOwner || authSessionId !== authenticatedSession || found.gradingSessionId !== gradingSessionId || !snapshot || typeof storagePath !== "string" || !isArchiveReviewSourcePath(authenticatedOwner, reviewId, storagePath) || !Number.isSafeInteger(now) || !Number.isSafeInteger(createdAtMs) || !Number.isSafeInteger(expiresAtMs) || createdAtMs > now || expiresAtMs <= now || expiresAtMs - createdAtMs > MAX_LIFETIME_MS) return { ok: false, reason: UNAVAILABLE };
    const source = await deps.readPrivateSource(storagePath, ARCHIVE_REVIEW_MAX_BYTES);
    if (!(source instanceof Uint8Array) || source.byteLength > ARCHIVE_REVIEW_MAX_BYTES) return { ok: false, reason: UNAVAILABLE };
    const plan = await planValidatedArchive(source, snapshot, assignments);
    const last = await deps.authenticate();
    const finishedAt = deps.now();
    if (last.ownerId !== authenticatedOwner || last.authSessionId !== authenticatedSession || !Number.isSafeInteger(finishedAt) || finishedAt < now || finishedAt >= expiresAtMs) return { ok: false, reason: UNAVAILABLE };
    return { ok: true, plan };
  } catch { return { ok: false, reason: UNAVAILABLE }; }
}
