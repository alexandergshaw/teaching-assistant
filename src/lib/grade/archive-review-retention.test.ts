import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { beginArchiveReviewDeletion, reconcileArchiveReviewDeletion, type ReviewRetentionState } from "./archive-review-retention";

const OWNER = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const TOKEN = "44444444-4444-4444-8444-444444444444";
const path = `${OWNER}/grading-review-uploads/${REVIEW}/${SOURCE}.zip`;
const active: ReviewRetentionState = { phase: "active", ownerId: OWNER, reviewId: REVIEW, sourceId: SOURCE, sourcePath: path, expiresAtMs: 100 };
const fenced = { activeReaders: 0, allWritersPermanentlyFenced: true };

describe("archive review retention decisions", () => {
  it("never begins deletion before expiry, while a reader is active, or while any writer may exist", () => {
    expect(beginArchiveReviewDeletion(active, fenced, 99, TOKEN)).toBeNull();
    expect(beginArchiveReviewDeletion(active, { ...fenced, activeReaders: 1 }, 100, TOKEN)).toBeNull();
    expect(beginArchiveReviewDeletion(active, { ...fenced, activeReaders: 0.5 }, 100, TOKEN)).toBeNull();
    expect(beginArchiveReviewDeletion(active, { ...fenced, allWritersPermanentlyFenced: false }, 100, TOKEN)).toBeNull();
    expect(beginArchiveReviewDeletion({ ...active, sourcePath: `${OWNER}/grading-uploads/${SOURCE}.zip` }, fenced, 100, TOKEN)).toBeNull();
    expect(beginArchiveReviewDeletion(active, fenced, 100, "invalid")).toBeNull();
  });

  it("keeps a non-expiring tombstone for uncertain, empty, partial and stale delete results", () => {
    const deleting = beginArchiveReviewDeletion(active, fenced, 100, TOKEN)!;
    expect(deleting.phase).toBe("deleting");
    expect(beginArchiveReviewDeletion(deleting, fenced, Number.MAX_SAFE_INTEGER, TOKEN)).toBeNull();
    expect(reconcileArchiveReviewDeletion(deleting, TOKEN, null)).toEqual(deleting);
    expect(reconcileArchiveReviewDeletion(deleting, TOKEN, { error: "timeout", removedPaths: [path] })).toEqual(deleting);
    expect(reconcileArchiveReviewDeletion(deleting, TOKEN, { error: null, removedPaths: [] })).toEqual(deleting);
    expect(reconcileArchiveReviewDeletion(deleting, TOKEN, { error: null, removedPaths: [`${SOURCE}.zip`] })).toEqual(deleting);
    expect(reconcileArchiveReviewDeletion(deleting, REVIEW, { error: null, removedPaths: [path] })).toBeNull();
  });

  it("marks only the explicitly removed full path as deleted without reactivating it", () => {
    const deleting = beginArchiveReviewDeletion(active, fenced, 100, TOKEN)!;
    const deleted = reconcileArchiveReviewDeletion(deleting, TOKEN, { error: null, removedPaths: [path] })!;
    expect(deleted.phase).toBe("deleted");
    expect(beginArchiveReviewDeletion(deleted, fenced, 200, TOKEN)).toBeNull();
    expect(reconcileArchiveReviewDeletion(deleted, TOKEN, { error: null, removedPaths: [path] })).toBeNull();
    expect(active.phase).toBe("active");
  });
});
