import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { cleanArchiveReviewSource, type ArchiveReviewCleanupStore } from "./archive-review-cleanup";
import { beginArchiveReviewDeletion, type ReviewRetentionState } from "./archive-review-retention";

const OWNER = "11111111-1111-4111-8111-111111111111";
const REVIEW = "22222222-2222-4222-8222-222222222222";
const SOURCE = "33333333-3333-4333-8333-333333333333";
const PATH = `${OWNER}/grading-review-uploads/${REVIEW}/${SOURCE}.zip`;
const key = { ownerId: OWNER, reviewId: REVIEW, sourceId: SOURCE };

function storeFixture() {
  let current: ReviewRetentionState = { phase: "active", ...key, sourcePath: PATH, expiresAtMs: 100 };
  const store: ArchiveReviewCleanupStore = {
    acquireTombstone: vi.fn(async ({ proposedToken }) => {
      if (current.phase === "deleting") return current;
      const next = beginArchiveReviewDeletion(current, { activeReaders: 0, allWritersPermanentlyFenced: true }, 100, proposedToken);
      if (!next || next.phase !== "deleting") return null;
      current = next;
      return next;
    }),
    markDeleted: vi.fn(async (state) => {
      if (current.phase !== "deleting" || current.deleteToken !== state.deleteToken) return false;
      current = { ...current, phase: "deleted" };
      return true;
    }),
  };
  return { store, current: () => current };
}

describe("dark archive cleanup coordinator", () => {
  it("requires the durable tombstone before removing and conditionally settling the exact path", async () => {
    const fixture = storeFixture();
    const remove = vi.fn(async (path: string) => {
      expect(fixture.current().phase).toBe("deleting");
      return { error: null, removedPaths: [path] };
    });
    expect(await cleanArchiveReviewSource(key, fixture.store, { remove }, new AbortController().signal)).toBe("deleted");
    expect(remove).toHaveBeenCalledOnce();
    expect(fixture.current().phase).toBe("deleted");
  });

  it("never removes for a blocked or wrong-owner tombstone", async () => {
    const fixture = storeFixture();
    const remove = vi.fn();
    vi.mocked(fixture.store.acquireTombstone).mockResolvedValueOnce(null);
    expect(await cleanArchiveReviewSource(key, fixture.store, { remove }, new AbortController().signal)).toBe("blocked");
    const bad = beginArchiveReviewDeletion({ phase: "active", ...key, sourcePath: PATH, expiresAtMs: 100 }, { activeReaders: 0, allWritersPermanentlyFenced: true }, 100, REVIEW)!;
    vi.mocked(fixture.store.acquireTombstone).mockResolvedValueOnce({ ...bad, ownerId: REVIEW } as Extract<ReviewRetentionState, { phase: "deleting" }>);
    expect(await cleanArchiveReviewSource(key, fixture.store, { remove }, new AbortController().signal)).toBe("pending");
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps the same tombstone after unknown deletion or a lost commit and retries safely", async () => {
    const fixture = storeFixture();
    const remove = vi.fn().mockResolvedValueOnce({ error: null, removedPaths: [] }).mockResolvedValue({ error: null, removedPaths: [PATH] });
    expect(await cleanArchiveReviewSource(key, fixture.store, { remove }, new AbortController().signal)).toBe("pending");
    expect(fixture.current().phase).toBe("deleting");
    vi.mocked(fixture.store.markDeleted).mockResolvedValueOnce(false);
    expect(await cleanArchiveReviewSource(key, fixture.store, { remove }, new AbortController().signal)).toBe("pending");
    expect(fixture.current().phase).toBe("deleting");
    expect(await cleanArchiveReviewSource(key, fixture.store, { remove }, new AbortController().signal)).toBe("deleted");
  });

  it("leaves the tombstone when cancellation beats a slow Storage delete", async () => {
    const fixture = storeFixture();
    let release!: (value: { error: null; removedPaths: string[] }) => void;
    const remove = vi.fn().mockReturnValue(new Promise((resolve) => { release = resolve; }));
    const abort = new AbortController();
    const pending = cleanArchiveReviewSource(key, fixture.store, { remove }, abort.signal);
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    abort.abort();
    expect(await pending).toBe("pending");
    release({ error: null, removedPaths: [PATH] });
    await Promise.resolve();
    expect(fixture.current().phase).toBe("deleting");
    expect(fixture.store.markDeleted).not.toHaveBeenCalled();
  });

  it("never calls Storage when cancellation wins a slow tombstone acquisition", async () => {
    const fixture = storeFixture();
    let release!: (value: null) => void;
    vi.mocked(fixture.store.acquireTombstone).mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const remove = vi.fn();
    const abort = new AbortController();
    const pending = cleanArchiveReviewSource(key, fixture.store, { remove }, abort.signal);
    await vi.waitFor(() => expect(fixture.store.acquireTombstone).toHaveBeenCalled());
    abort.abort();
    expect(await pending).toBe("pending");
    release(null);
    expect(remove).not.toHaveBeenCalled();
  });
});
