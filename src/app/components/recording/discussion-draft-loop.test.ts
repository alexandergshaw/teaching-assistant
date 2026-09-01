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
  coerceReplyComposition,
  type DraftDiscussionRepliesAction,
  type DraftQueueItem,
  type RunDraftLoopDeps,
} from "./discussion-draft-loop";
import { mergeCapturedPosts, type ReplyRow } from "./discussion-capture";
import type { UseReplyRowsReturn } from "./useReplyRows";
import type { UseReplyResourcesReturn } from "./useReplyResources";
import { DEFAULT_REPLY_COMPOSITION, type ReplyCompositionSettings } from "@/lib/discussion-reply-prompt";
import type { RecordingKnowledgeContext } from "@/lib/recording-launch";

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
  /** The exact `composition` argument `draftAction` was called with, or
   *  `null` if it was never called. */
  composition: ReplyCompositionSettings | null;
  /** docs/reply-composition-controls-acceptance-criteria.md C2b (SHOULD 1
   *  fixer pass): every argument `enqueueResources` was called with, in
   *  call order - empty when it was never called at all, which is exactly
   *  what the "resources" ingredient NOT selected must produce. */
  enqueueResourcesCalls: string[][];
  /** "Activate this recording from the Knowledge base": the exact
   *  `knowledgeContext` argument (the 6th, trailing positional arg)
   *  `draftAction` was called with, or `undefined` if it was never called or
   *  nothing was carried. */
  knowledgeContext: string | undefined;
}

async function dispatchOneBatch(args: {
  rawRows: ReplyRow[];
  /** Defaults to `rawRows` when omitted. Set to a DIFFERENT array to test
   *  that resolution reads `rawRows`, never this filtered array. */
  filteredRows?: ReplyRow[];
  queue: DraftQueueItem[];
  /** docs/reply-composition-controls-acceptance-criteria.md C5/JOB1:
   *  defaults to DEFAULT_REPLY_COMPOSITION when omitted - set to a DIFFERENT
   *  value to prove `compositionRef.current` (not a stale default) is what
   *  actually reaches `draftAction`. */
  composition?: ReplyCompositionSettings;
  /** "Activate this recording from the Knowledge base": defaults to `null`
   *  (no context held) when omitted - the same "held for the life of the
   *  table" ref the real hook writes once, at Start. */
  knowledgeContext?: RecordingKnowledgeContext | null;
}): Promise<DispatchResult> {
  let capturedPosts: Parameters<DraftDiscussionRepliesAction>[0] | null = null;
  let capturedComposition: ReplyCompositionSettings | null = null;
  let capturedKnowledgeContext: string | undefined = undefined;
  const enqueueResourcesCalls: string[][] = [];

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
    enqueueResources: (ids: string[]) => {
      enqueueResourcesCalls.push(ids);
    },
  } as unknown as UseReplyResourcesReturn;
  const resourcesApiRef = { current: resourcesApiFake };

  const audienceRef = { current: "students" as const };
  const courseNameRef = { current: "Intro to Testing" };
  const compositionRef = { current: args.composition ?? DEFAULT_REPLY_COMPOSITION };
  const knowledgeContextRef = { current: args.knowledgeContext ?? null };

  const draftAction: DraftDiscussionRepliesAction = async (posts, _audience, _courseName, composition, _provider, knowledgeContext) => {
    capturedPosts = posts;
    capturedComposition = composition;
    capturedKnowledgeContext = knowledgeContext;
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
    compositionRef,
    knowledgeContextRef,
    pushNotice: () => {},
    draftAction,
  };

  await runDraftLoop(0, deps);

  return { posts: capturedPosts, composition: capturedComposition, enqueueResourcesCalls, knowledgeContext: capturedKnowledgeContext };
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
    // implementation. `greetingName` is present here too (docs/reply-
    // composition-controls-acceptance-criteria.md C1b-ii: derived per-post,
    // independently of `parent`) - "Jordan Lee" is a two-token, no-comma
    // author, so the first token is unambiguous.
    expect(posts![0]).toEqual({
      id: "c1",
      author: "Jordan Lee",
      text: "Replying to that.",
      parent: {
        author: "Sam Osei",
        text: "The original point about photosynthesis.",
      },
      greetingName: "Jordan",
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
      greetingName: "Taylor",
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
// docs/reply-composition-controls-acceptance-criteria.md JOB3: composition
// and greetingName wiring into the live drafting path - the same
// "verify-reachability" shape as FIX 1 above (T6's `parent` had zero
// production callers before that fix landed).
// ---------------------------------------------------------------------------

describe("runDraftLoop / JOB3 - composition and greetingName wiring", () => {
  it("`composition` (compositionRef.current at dispatch time, not a stale default) reaches draftAction", async () => {
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const composition: ReplyCompositionSettings = {
      ingredients: ["insight", "correction"],
      addressByName: false,
      formality: "formal",
    };

    const { composition: received } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
      composition,
    });

    expect(received).toEqual(composition);
  });

  it("the DEFAULT composition reaches draftAction when nothing has customised it", async () => {
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const { composition: received } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
    });
    expect(received).toEqual(DEFAULT_REPLY_COMPOSITION);
  });

  it("`greetingName` is present on the dispatched post, derived from the row's own author", async () => {
    // "Jordan Lee" - two tokens, no comma - the first token is unambiguous
    // under C1b-i's own rule, so this is a frozen literal, never re-derived
    // by calling greetingNameFromAuthor itself (that would only prove this
    // file calls the function, not that threading it through is correct).
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const { posts } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
    });

    expect(posts![0]).toEqual({ id: "c1", author: "Jordan Lee", text: "A post.", greetingName: "Jordan" });
  });

  it("`greetingName` is ABSENT on the CONTEXT ONLY parent block - the parent object carries only author and text", async () => {
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

    const attached = posts![0] as { parent?: { author: string; text: string; greetingName?: string } };
    expect(attached.parent).toBeDefined();
    // "in", not toBeUndefined() - a present key set to undefined would also
    // pass toBeUndefined(), the assertion-of-absence trap this repo's own
    // dev loop calls out (see the FIX 1 describe block above for the same
    // discipline applied to `parent` itself).
    expect("greetingName" in attached.parent!).toBe(false);
    expect(Object.keys(attached.parent!).sort()).toEqual(["author", "text"]);
  });

  it("`greetingName` is omitted (not set to `undefined`) for a single-token author that degrades to no greeting", async () => {
    // person-name.ts's own C1c degrade case: greetingNameFromAuthor returns
    // "" for input that reads as a handle rather than a name, and this file
    // must turn that "" into an OMITTED key, never `greetingName: ""` or
    // `greetingName: undefined`, on the same "never reaches the model as an
    // instruction to open with nothing" reasoning as this file's own header
    // comment on the dispatch call site.
    const child = makeRow({ id: "c1", author: "", post: "A post with no readable author." });
    const { posts } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
    });

    expect(posts).not.toBeNull();
    expect("greetingName" in posts![0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// docs/reply-composition-controls-acceptance-criteria.md C2b - SHOULD 1
// fixer pass: selecting "resources" gates the existing resource pass;
// deselecting it must prevent the dispatch entirely (a real token saving).
// Before this fix `enqueueResources` was called unconditionally and nothing
// in the codebase ever read `ingredients` to decide whether to call it -
// the entry-372 shape ("looks tested, is not wired"), since a prior test
// here asserted only a no-invented-URL prompt string and never actually
// drove a call through runDraftLoop to check the dispatch itself.
// ---------------------------------------------------------------------------

describe("runDraftLoop / SHOULD 1 - the 'resources' ingredient gates the resource-search dispatch (C2b)", () => {
  it("dispatches a resource search for a landed reply when 'resources' IS selected", async () => {
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const { enqueueResourcesCalls } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
      composition: { ingredients: ["resources"], addressByName: false, formality: "balanced" },
    });
    expect(enqueueResourcesCalls).toEqual([["c1"]]);
  });

  it("does NOT dispatch a resource search when 'resources' is NOT selected - the real token saving C2b requires", async () => {
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const { enqueueResourcesCalls } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
      composition: { ingredients: ["compliment"], addressByName: false, formality: "balanced" },
    });
    expect(enqueueResourcesCalls).toEqual([]);
  });

  it("zero ingredients selected also suppresses the resource dispatch", async () => {
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const { enqueueResourcesCalls } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
      composition: { ingredients: [], addressByName: false, formality: "balanced" },
    });
    expect(enqueueResourcesCalls).toEqual([]);
  });

  it("with 'resources' selected AND multiple rows in the batch, every landed reply's id is dispatched", async () => {
    const a = makeRow({ id: "a1", author: "Jordan Lee", post: "Post A." });
    const b = makeRow({ id: "a2", author: "Priya Shah", post: "Post B." });
    const { enqueueResourcesCalls } = await dispatchOneBatch({
      rawRows: [a, b],
      queue: [
        { id: "a1", force: false },
        { id: "a2", force: false },
      ],
      composition: { ingredients: ["resources"], addressByName: false, formality: "balanced" },
    });
    expect(enqueueResourcesCalls).toEqual([["a1"], ["a2"]]);
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

// ---------------------------------------------------------------------------
// "Activate this recording from the Knowledge base" - the owner ask closed
// by this wave: instructor-selected Knowledge Base pages reach the drafting
// prompt as context. Before this fix, takeRecordingKnowledgeContext()
// (src/lib/recording-launch.ts) had zero production callers - the exact
// entry-372/373 shape ("looks tested, is not wired") this file's own header
// comment calls out. Sabotage-checked: removing the `knowledgeContextRef`
// read (or the `knowledgeContextNow` argument at the draftAction call site)
// from discussion-draft-loop.ts reproduces every failure below - confirmed
// red, restored, confirmed green.
// ---------------------------------------------------------------------------

describe("runDraftLoop / 'Activate this recording from the Knowledge base' wiring", () => {
  it("threads knowledgeContextRef.current.text through to draftAction on a real dispatch", async () => {
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const { knowledgeContext } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
      knowledgeContext: { text: "Selected page: Policy\nLate work loses 10% per day.", label: "1 Knowledge Base page" },
    });
    expect(knowledgeContext).toBe("Selected page: Policy\nLate work loses 10% per day.");
  });

  it("passes undefined (never null, never the empty string) to draftAction when no context was ever taken", async () => {
    const child = makeRow({ id: "c1", author: "Jordan Lee", post: "A post." });
    const { knowledgeContext } = await dispatchOneBatch({
      rawRows: [child],
      queue: [{ id: "c1", force: false }],
      // knowledgeContext omitted - the default (no launch, or a launch with
      // no usable pages), matching most drafting runs.
    });
    expect(knowledgeContext).toBeUndefined();
  });

  it("ONE-SHOT held for the life of the table, not re-taken per batch: TWO batches in the SAME loop run both carry the SAME context", async () => {
    // Six rows -> two batches of DRAFT_BATCH_SIZE (5) then 1. If this loop
    // ever called takeRecordingKnowledgeContext() again per batch (instead
    // of reading the SAME already-taken ref useDiscussionReplies.ts's
    // `start()` populated once), the second batch would see it as drained -
    // this is exactly the failure mode the "decisions already made" section
    // rules out, reproduced here as a real two-batch run rather than
    // asserted only against the one-shot module's own test file.
    const rows = Array.from({ length: 6 }, (_, i) => makeRow({ id: `c${i}`, author: `Author ${i}`, post: `Post ${i}.` }));
    const queue: DraftQueueItem[] = rows.map((r) => ({ id: r.id, force: false }));

    const capturedPerBatch: Array<string | undefined> = [];
    const loopsActiveRef = { current: true };
    const loopEpochRef = { current: 0 };
    const draftQueueRef = { current: [...queue] };
    const rowsApiFake = {
      rawRows: rows,
      rows,
      markDrafting: () => {},
      snapshotEditSeq: (ids: string[]) => new Map(ids.map((id) => [id, 0])),
      isUnchangedSince: () => true,
      applyReply: () => {},
      markFailed: () => {},
    } as unknown as UseReplyRowsReturn;
    const rowsApiRef = { current: rowsApiFake };
    const resourcesApiRef = { current: { enqueueResources: () => {} } as unknown as UseReplyResourcesReturn };
    const audienceRef = { current: "students" as const };
    const courseNameRef = { current: "Intro to Testing" };
    const compositionRef = { current: DEFAULT_REPLY_COMPOSITION };
    // Populated ONCE, exactly the way useDiscussionReplies.ts's `start()`
    // populates it exactly once per table - this test never re-assigns it
    // between batches, proving the loop itself never needs a second take to
    // see the same context on batch 2.
    const knowledgeContextRef = { current: { text: "Selected page: Policy\nSome policy text.", label: "1 page" } };

    let batchCount = 0;
    const draftAction: DraftDiscussionRepliesAction = async (posts, _audience, _courseName, _composition, _provider, knowledgeContext) => {
      batchCount += 1;
      capturedPerBatch.push(knowledgeContext);
      return { replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text." })) };
    };

    const deps: RunDraftLoopDeps = {
      loopsActiveRef,
      loopEpochRef,
      draftQueueRef,
      setDraftQueueSize: () => {},
      setDrafting: () => {},
      // Lets the loop run through BOTH batches before stopping: stays alive
      // through the first two wakes (batch 1, then batch 2), then ends the
      // loop on the third - after which the queue is empty anyway.
      waitForWake: async () => {
        if (batchCount >= 2) loopsActiveRef.current = false;
      },
      rowsApiRef,
      resourcesApiRef,
      audienceRef,
      courseNameRef,
      compositionRef,
      knowledgeContextRef,
      pushNotice: () => {},
      draftAction,
    };

    await runDraftLoop(0, deps);

    expect(batchCount).toBe(2);
    expect(capturedPerBatch).toHaveLength(2);
    // Both batches carry the EXACT SAME text - not re-taken, not drained to
    // undefined on the second call the way a real one-shot take would if
    // this loop mistakenly called takeRecordingKnowledgeContext() itself.
    expect(capturedPerBatch[0]).toBe("Selected page: Policy\nSome policy text.");
    expect(capturedPerBatch[1]).toBe("Selected page: Policy\nSome policy text.");
  });
});

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

// ---------------------------------------------------------------------------
// docs/reply-composition-controls-acceptance-criteria.md C5a: coerceReplyComposition
// - a plain exported function (never inline in a useState initializer,
// which would have no test surface in this node-env, no-hook-rendered
// suite). Every case below is a value that could plausibly sit in
// localStorage - written by an older/newer build, hand-edited in devtools,
// or truncated by a quota failure - and must resolve to a sane
// ReplyCompositionSettings rather than throwing or reaching the prompt
// unvalidated.
// ---------------------------------------------------------------------------

describe("coerceReplyComposition (C5a)", () => {
  it("returns DEFAULT_REPLY_COMPOSITION when all three raw values are null (first run, nothing persisted yet)", () => {
    expect(coerceReplyComposition(null, null, null)).toEqual(DEFAULT_REPLY_COMPOSITION);
  });

  it("round-trips a valid, fully custom stored value", () => {
    const result = coerceReplyComposition('["insight","resources"]', "0", "formal");
    expect(result).toEqual({ ingredients: ["insight", "resources"], addressByName: false, formality: "formal" });
  });

  it("C2c: zero ingredients selected is legal and is NOT replaced with the default", () => {
    expect(coerceReplyComposition("[]", "1", "balanced").ingredients).toEqual([]);
  });

  it("malformed JSON for ingredients falls back to the default set, and never throws", () => {
    expect(() => coerceReplyComposition("not json at all", null, null)).not.toThrow();
    expect(coerceReplyComposition("not json at all", null, null).ingredients).toEqual(
      DEFAULT_REPLY_COMPOSITION.ingredients
    );
  });

  it("a non-array ingredients blob (a JSON object) falls back to the default set", () => {
    expect(coerceReplyComposition('{"a":1}', null, null).ingredients).toEqual(DEFAULT_REPLY_COMPOSITION.ingredients);
  });

  it("a non-array JSON scalar (a bare JSON string) falls back to the default set", () => {
    expect(coerceReplyComposition('"hello"', null, null).ingredients).toEqual(DEFAULT_REPLY_COMPOSITION.ingredients);
  });

  it("an ingredient string outside the enum is dropped, not the whole selection reset to default", () => {
    expect(coerceReplyComposition('["compliment","not-a-real-ingredient"]', null, null).ingredients).toEqual([
      "compliment",
    ]);
  });

  it("a duplicate ingredient collapses to one entry", () => {
    expect(coerceReplyComposition('["compliment","compliment","insight"]', null, null).ingredients).toEqual([
      "compliment",
      "insight",
    ]);
  });

  it("an unrecognised formality falls back to the default rather than reaching the prompt", () => {
    expect(coerceReplyComposition(null, null, "extremely-formal").formality).toBe(DEFAULT_REPLY_COMPOSITION.formality);
  });

  it("addressByName: null falls back to the default (ON)", () => {
    expect(coerceReplyComposition(null, null, null).addressByName).toBe(true);
  });

  it('addressByName: "0" coerces to false', () => {
    expect(coerceReplyComposition(null, "0", null).addressByName).toBe(false);
  });

  it('addressByName: "1" coerces to true', () => {
    expect(coerceReplyComposition(null, "1", null).addressByName).toBe(true);
  });

  it("addressByName: an unrecognised value falls back to the default rather than silently becoming OFF", () => {
    expect(coerceReplyComposition(null, "yes please", null).addressByName).toBe(true);
  });

  it("SABOTAGE CHECK: never throws across every bad-input case in this describe block, run together", () => {
    const bad: Array<[string | null, string | null, string | null]> = [
      ["not json at all", null, null],
      ['{"a":1}', null, null],
      ['"hello"', null, null],
      ['["compliment","not-a-real-ingredient"]', null, null],
      ['["compliment","compliment"]', null, null],
      [null, null, "extremely-formal"],
      [null, "garbage", null],
    ];
    for (const [ing, addr, form] of bad) {
      expect(() => coerceReplyComposition(ing, addr, form)).not.toThrow();
    }
  });
});
