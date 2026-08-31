// Unit tests for discussion-draft-loop.ts's runDraftLoop (AC25-AC28, AC52),
// plus the FIX 1 / FIX 2 dead-feature closure
// (docs/discussion-thread-structure-acceptance-criteria.md section 6/T6-T6c).
//
// runDraftLoop takes every dependency by injection (RunDraftLoopDeps), so it
// is driven here with fake refs and a fake `draftAction` that captures its
// argument - no hook render, no component render. vitest in this repo is
// node-env and collects only src/**/*.test.ts; nothing is ever rendered (see
// this file's sibling useReplyResources.test.ts for the same discipline).
//
// FIX 1 (the blocker): before this fix, `resolveDraftParent` (exported from
// discussion-capture.ts) had zero production callers, so the CONTEXT ONLY
// block T6/T6a describe never reached the drafting prompt. The tests below
// assert the object handed to `draftAction` carries `parent` for a row whose
// three-condition gate passes, has NO `parent` key at all for one whose gate
// fails, resolves against `rawRows` (never the filtered `rows`), and caps the
// parent's text at 600 characters (T6a's own budget figure) by truncating,
// not dropping.
//
// FIX 2: covered in the last describe block below - see its own header.
//
// Every test is sabotage-checked against the report handed back to the
// dispatcher: broken, confirmed red, restored, confirmed green, diffed.

import { describe, it, expect } from "vitest";
import {
  runDraftLoop,
  type DraftDiscussionRepliesAction,
  type DraftQueueItem,
  type RunDraftLoopDeps,
} from "./discussion-draft-loop";
import { mergeCapturedPosts, type ReplyRow } from "./discussion-capture";
import type { UseReplyRowsReturn } from "./useReplyRows";
import type { UseReplyResourcesReturn } from "./useReplyResources";

// ---------------------------------------------------------------------------
// Test harness: a minimal fake of every RunDraftLoopDeps field, driving
// runDraftLoop through exactly one batch (the fake `waitForWake` flips
// `loopsActiveRef` false and resolves, so the loop's next `shouldLoopContinue`
// check ends it - no real timers, no hanging promise).
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ReplyRow> & Pick<ReplyRow, "id" | "author" | "post">): ReplyRow {
  return {
    reply: "",
    userEdited: false,
    state: "pending",
    error: null,
    firstSeenAt: 0,
    order: 0,
    ...overrides,
  };
}

interface DispatchResult {
  /** The exact argument `draftAction` was called with, or `null` if it was
   *  never called (e.g. every queued item failed the dispatchable guard). */
  posts: Parameters<DraftDiscussionRepliesAction>[0] | null;
}

async function dispatchOneBatch(args: {
  rawRows: ReplyRow[];
  /** Defaults to `rawRows` when omitted. Set to a DIFFERENT array to test
   *  that resolution reads `rawRows`, never this filtered array. */
  filteredRows?: ReplyRow[];
  queue: DraftQueueItem[];
}): Promise<DispatchResult> {
  let capturedPosts: Parameters<DraftDiscussionRepliesAction>[0] | null = null;

  const loopsActiveRef = { current: true };
  const loopEpochRef = { current: 0 };
  const draftQueueRef = { current: [...args.queue] };

  const rowsApiFake = {
    rawRows: args.rawRows,
    rows: args.filteredRows ?? args.rawRows,
    markDrafting: () => {},
    snapshotEditSeq: (ids: string[]) => new Map(ids.map((id) => [id, 0])),
    isUnchangedSince: () => true,
    applyReply: () => {},
    markFailed: () => {},
  } as unknown as UseReplyRowsReturn;
  const rowsApiRef = { current: rowsApiFake };

  const resourcesApiFake = {
    enqueueResources: () => {},
  } as unknown as UseReplyResourcesReturn;
  const resourcesApiRef = { current: resourcesApiFake };

  const audienceRef = { current: "students" as const };
  const courseNameRef = { current: "Intro to Testing" };

  const draftAction: DraftDiscussionRepliesAction = async (posts) => {
    capturedPosts = posts;
    return { replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text." })) };
  };

  const deps: RunDraftLoopDeps = {
    loopsActiveRef,
    loopEpochRef,
    draftQueueRef,
    setDraftQueueSize: () => {},
    setDrafting: () => {},
    waitForWake: async () => {
      loopsActiveRef.current = false;
    },
    rowsApiRef,
    resourcesApiRef,
    audienceRef,
    courseNameRef,
    pushNotice: () => {},
    draftAction,
  };

  await runDraftLoop(0, deps);

  return { posts: capturedPosts };
}

// ---------------------------------------------------------------------------
// FIX 1: parent context wiring.
// ---------------------------------------------------------------------------

describe("runDraftLoop / FIX 1 - resolveDraftParent wiring into the live drafting path", () => {
  it("attaches `parent` for a row whose gate passes: threadPosition 'reply', a printed replyingToAuthor, exactly one matching author", async () => {
    const parent = makeRow({
      id: "p1",
      author: "Sam Osei",
      post: "The original point about photosynthesis.",
      threadPosition: "root",
    });
    const child = makeRow({
      id: "c1",
      author: "Jordan Lee",
      post: "Replying to that.",
      threadPosition: "reply",
      replyingToAuthor: "Sam Osei",
    });

    const { posts } = await dispatchOneBatch({
      rawRows: [parent, child],
      queue: [{ id: "c1", force: false }],
    });

    expect(posts).not.toBeNull();
    expect(posts).toHaveLength(1);
    // Frozen literal oracle - the exact shape, not derived from the
    // implementation.
    expect(posts![0]).toEqual({
      id: "c1",
      author: "Jordan Lee",
      text: "Replying to that.",
      parent: {
        author: "Sam Osei",
        text: "The original point about photosynthesis.",
      },
    });
  });

  it("omits the `parent` key ENTIRELY (not `parent: undefined`) for a row whose gate fails - no printed replyingToAuthor", async () => {
    const child = makeRow({
      id: "c2",
      author: "Taylor Kim",
      post: "Another reply, no thread info captured.",
      threadPosition: "unknown",
    });

    const { posts } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c2", force: false }],
    });

    expect(posts).not.toBeNull();
    expect(posts).toHaveLength(1);
    // "in" - not toBeUndefined() - the assertion-of-absence trap this repo's
    // own dev loop calls out: toBeUndefined() would also pass if the key
    // were present and explicitly set to undefined.
    expect("parent" in posts![0]).toBe(false);
    // And the object is byte-identical (same keys, same values) to what a
    // no-parent batch produced before this fix - a frozen literal oracle.
    expect(posts![0]).toEqual({
      id: "c2",
      author: "Taylor Kim",
      text: "Another reply, no thread info captured.",
    });
  });

  it("resolves the parent against `rawRows`, not the filtered `rows` - a search-box keystroke must not change which parent a draft sees", async () => {
    const parent = makeRow({
      id: "p1",
      author: "Sam Osei",
      post: "The original point.",
      threadPosition: "root",
    });
    const child = makeRow({
      id: "c1",
      author: "Jordan Lee",
      post: "Replying to that.",
      threadPosition: "reply",
      replyingToAuthor: "Sam Osei",
    });

    const { posts } = await dispatchOneBatch({
      rawRows: [parent, child], // the whole table
      filteredRows: [child], // the search box currently hides the parent
      queue: [{ id: "c1", force: false }],
    });

    // If the implementation ever regressed to reading `.rows` (the filtered
    // array) instead of `.rawRows`, the parent would not be found here and
    // this assertion would fail - `.rows` in this test genuinely excludes it.
    expect(posts![0]).toMatchObject({
      parent: { author: "Sam Osei", text: "The original point." },
    });
  });

  it("caps the parent's text at 600 characters (T6a's own budget figure) by TRUNCATING, never dropping the parent", async () => {
    const longText = "x".repeat(650);
    const parent = makeRow({ id: "p1", author: "Sam Osei", post: longText, threadPosition: "root" });
    const child = makeRow({
      id: "c1",
      author: "Jordan Lee",
      post: "Replying to that.",
      threadPosition: "reply",
      replyingToAuthor: "Sam Osei",
    });

    const { posts } = await dispatchOneBatch({
      rawRows: [parent, child],
      queue: [{ id: "c1", force: false }],
    });

    const attached = posts![0] as { parent?: { author: string; text: string } };
    expect(attached.parent).toBeDefined();
    expect(attached.parent!.text).toHaveLength(600);
    expect(attached.parent!.text).toBe(longText.slice(0, 600));
    expect(attached.parent!.text).not.toBe(longText);
  });

  it("does NOT truncate a parent's text that is already under the 600-character cap", async () => {
    const shortText = "A short original post.";
    const parent = makeRow({ id: "p1", author: "Sam Osei", post: shortText, threadPosition: "root" });
    const child = makeRow({
      id: "c1",
      author: "Jordan Lee",
      post: "Replying to that.",
      threadPosition: "reply",
      replyingToAuthor: "Sam Osei",
    });

    const { posts } = await dispatchOneBatch({
      rawRows: [parent, child],
      queue: [{ id: "c1", force: false }],
    });

    const attached = posts![0] as { parent?: { author: string; text: string } };
    expect(attached.parent!.text).toBe(shortText);
  });
});

// ---------------------------------------------------------------------------
// FIX 2: mergeIncoming's declared contract vs. what mergeCapturedPosts
// actually accepts (useReplyRows.ts:209-224 sealed interface, :481-499
// implementation).
//
// mergeIncoming is a `useCallback` closure inside the useReplyRows hook, and
// this repo's vitest never renders a hook (see useReplyResources.test.ts's
// own header) - so there is no way to invoke the real closure directly. What
// IS directly testable, and is exactly where the defect lived, is the
// DECLARED TYPE: before the fix, `UseReplyRowsReturn["mergeIncoming"]`'s
// parameter type did not declare `threadPosition`/`replyingToAuthor`, so an
// object literal carrying them (typed AS that declared parameter type, not
// as a loose variable) failed `tsc`'s excess-property check - which is
// exactly the class of caller the accidental narrow type would have wrongly
// rejected, or that a future "fix" trusting the type as ground truth would
// have silently stripped. The `Parameters<...>` line below only compiles
// once the interface is widened; reverting FIX 2 in useReplyRows.ts turns it
// back into a `tsc` error at this exact line (see the report for the
// sabotage-check run against `npx tsc --noEmit`).
//
// The runtime assertion alongside it closes the other half of the boundary:
// a value shaped exactly like what the widened contract now promises really
// does carry its thread fields onto the merged row via `mergeCapturedPosts`
// (discussion-capture.ts) - the same function `mergeIncoming`'s
// implementation forwards its argument to, unrebuilt.
// ---------------------------------------------------------------------------

describe("FIX 2 - mergeIncoming's declared contract matches what mergeCapturedPosts accepts", () => {
  it("a literal typed as mergeIncoming's own declared parameter may carry threadPosition and replyingToAuthor, and both land on the merged row", () => {
    const incoming: Parameters<UseReplyRowsReturn["mergeIncoming"]>[0] = [
      {
        author: "Jamie Lee",
        text: "I agree with the reading, and here is why.",
        threadPosition: "reply",
        replyingToAuthor: "Sam Osei",
      },
    ];

    const result = mergeCapturedPosts([], incoming, 1000);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].threadPosition).toBe("reply");
    expect(result.rows[0].replyingToAuthor).toBe("Sam Osei");
  });
});
