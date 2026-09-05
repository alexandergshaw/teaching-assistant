// docs/post-questions-acceptance-criteria.md Q5/Q6/Q9: unit tests for the
// post-questions feature's own additions to discussion-draft-loop.ts -
// `coerceReplyComposition`'s fourth trailing argument, `applyReply`'s fifth
// argument (gated on `answerQuestions`), the MAX_TOKENS missing-row failure
// message, and `pushDraftEvent`.
//
// Split out of discussion-draft-loop.test.ts (NOT folded in) purely to stay
// under recording-split.structure.test.ts's 1000-line ceiling on this
// directory (that file counts every *.ts/*.tsx file, test files included) -
// see that sibling file's own header for the tests this feature ADDED to
// existing describe blocks there (answerQuestions fixture edits) instead of
// here. Fixture helpers (`makeRow`, the harness shape) are DUPLICATED rather
// than imported from the sibling *.test.ts - importing a helper from another
// *.test.ts file re-runs that file's own describe/it blocks a second time
// under this file's run, a recorded trap in this repo.
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
import type { ReplyRow } from "./discussion-capture";
import type { UseReplyRowsReturn } from "./useReplyRows";
import type { UseReplyResourcesReturn } from "./useReplyResources";
import { DEFAULT_REPLY_COMPOSITION, type ReplyCompositionSettings, type PostQuestion } from "@/lib/discussion-reply-prompt";
import type { DiscussionRepliesLogDraft } from "./discussion-replies-log";

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

// ---------------------------------------------------------------------------
// Q8: coerceReplyComposition's fourth trailing parameter.
// ---------------------------------------------------------------------------

describe("coerceReplyComposition - answerQuestions (Q8)", () => {
  it('"0" coerces to false', () => {
    expect(coerceReplyComposition(null, null, null, "0").answerQuestions).toBe(false);
  });

  it('"1" coerces to true', () => {
    expect(coerceReplyComposition(null, null, null, "1").answerQuestions).toBe(true);
  });

  it('an unrecognised value ("garbage") falls back to the default (ON), not OFF', () => {
    expect(coerceReplyComposition(null, null, null, "garbage").answerQuestions).toBe(true);
  });

  it("null (never persisted) falls back to the default (ON)", () => {
    expect(coerceReplyComposition(null, null, null, null).answerQuestions).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Q5/Q6: applyReply's FIFTH argument (questions), gated on
// compositionNow.answerQuestions. A dedicated harness - the shared
// dispatchOneBatch-shaped fake below (used for the MAX_TOKENS/pushDraftEvent
// blocks) discards applyReply's arguments entirely, so this feature needs
// its own capturing fake.
// ---------------------------------------------------------------------------

type ApplyReplyCall = [string, string, boolean | undefined, readonly string[] | undefined, readonly PostQuestion[] | undefined];

async function dispatchCapturingApplyReply(args: {
  rows: ReplyRow[];
  queue: DraftQueueItem[];
  composition?: ReplyCompositionSettings;
  draftActionOverride?: DraftDiscussionRepliesAction;
  /** Ids that should report `isUnchangedSince === false` - the "edited
   *  during dispatch" discard path. */
  editedDuringDispatchIds?: string[];
}): Promise<ApplyReplyCall[]> {
  const applyReplyCalls: ApplyReplyCall[] = [];
  const loopsActiveRef = { current: true };
  const editedSet = new Set(args.editedDuringDispatchIds ?? []);

  const rowsApiFake = {
    rawRows: args.rows,
    rows: args.rows,
    markDrafting: () => {},
    snapshotEditSeq: (ids: string[]) => new Map(ids.map((id) => [id, 0])),
    isUnchangedSince: (id: string) => !editedSet.has(id),
    applyReply: (
      id: string,
      reply: string,
      userEdited?: boolean,
      concepts?: readonly string[],
      questions?: readonly PostQuestion[]
    ) => {
      applyReplyCalls.push([id, reply, userEdited, concepts, questions]);
    },
    markFailed: () => {},
  } as unknown as UseReplyRowsReturn;

  const draftAction =
    args.draftActionOverride ??
    (async (posts) => ({ replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text." })) }));

  const deps: RunDraftLoopDeps = {
    loopsActiveRef,
    loopEpochRef: { current: 0 },
    draftQueueRef: { current: [...args.queue] },
    setDraftQueueSize: () => {},
    setDrafting: () => {},
    waitForWake: async () => {
      loopsActiveRef.current = false;
    },
    rowsApiRef: { current: rowsApiFake },
    resourcesApiRef: { current: { enqueueResources: () => {} } as unknown as UseReplyResourcesReturn },
    audienceRef: { current: "students" as const },
    courseNameRef: { current: "Intro to Testing" },
    compositionRef: { current: args.composition ?? DEFAULT_REPLY_COMPOSITION },
    knowledgeContextRef: { current: null },
    pushNotice: () => {},
    draftAction,
    pushDraftEvent: () => {},
  };

  await runDraftLoop(0, deps);
  return applyReplyCalls;
}

describe("runDraftLoop / Q5-Q6 - applyReply's fifth argument mirrors the reply's questions, gated by answerQuestions (A7: OFF now clears rather than leaves alone)", () => {
  it("ON + the model returned questions -> the array reaches applyReply's fifth argument", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const question: PostQuestion = { question: "Why does the loop run twice?", implied: false, answer: "Because it does." };

    const applyReplyCalls = await dispatchCapturingApplyReply({
      rows: [a],
      queue: [{ id: "a", force: false }],
      composition: { ...DEFAULT_REPLY_COMPOSITION, answerQuestions: true },
      draftActionOverride: async (posts) => ({
        replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text.", questions: [question] })),
      }),
    });

    expect(applyReplyCalls[0]?.[4]).toEqual([question]);
  });

  it("ON + the model returned no questions -> [] reaches applyReply's fifth argument (clear, not leave-alone)", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });

    const applyReplyCalls = await dispatchCapturingApplyReply({
      rows: [a],
      queue: [{ id: "a", force: false }],
      composition: { ...DEFAULT_REPLY_COMPOSITION, answerQuestions: true },
      draftActionOverride: async (posts) => ({
        replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text." })),
      }),
    });

    expect(applyReplyCalls[0]?.[4]).toEqual([]);
  });

  it("OFF -> [] reaches applyReply's fifth argument, EVEN IF the model volunteered questions anyway - a redraft with the setting off still CLEARS the row's questions rather than keeping them", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const question: PostQuestion = { question: "Why does the loop run twice?", implied: false, answer: "Because it does." };

    const applyReplyCalls = await dispatchCapturingApplyReply({
      rows: [a],
      queue: [{ id: "a", force: false }],
      composition: { ...DEFAULT_REPLY_COMPOSITION, answerQuestions: false },
      draftActionOverride: async (posts) => ({
        replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text.", questions: [question] })),
      }),
    });

    // docs/answers-in-the-reply-acceptance-criteria.md A7: this reverses the
    // old Q5 behaviour (`undefined`, "leave alone"). `answer` now quotes one
    // particular draft (D4), so a redraft that replaces `reply` - even with
    // the setting off - must not leave the OLD row's questions standing
    // against a reply that no longer contains what they quote.
    expect(applyReplyCalls[0]?.[4]).toEqual([]);
  });

  it("the discard path (edited during dispatch) leaves concepts untouched but CLEARS questions (A7): applyReply's fourth argument is undefined, the fifth is []", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A.", reply: "Hand-typed reply.", userEdited: true });

    const applyReplyCalls = await dispatchCapturingApplyReply({
      rows: [a],
      // force: true - a userEdited row is NOT dispatchable without it
      // (isDispatchableDraftItem, AC52), so with force:false the loop would
      // skip the row entirely and this discard path would never be reached.
      // Retry/Redraft are exactly the real dispatch sites that force past
      // that guard, which is what makes this the reachable shape.
      queue: [{ id: "a", force: true }],
      composition: { ...DEFAULT_REPLY_COMPOSITION, answerQuestions: true },
      editedDuringDispatchIds: ["a"],
      draftActionOverride: async (posts) => ({
        replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text." })),
      }),
    });

    expect(applyReplyCalls).toHaveLength(1);
    const call = applyReplyCalls[0]!;
    expect(call[0]).toBe("a");
    expect(call[1]).toBe("Hand-typed reply.");
    expect(call[2]).toBe(true);
    // VERIFY PASS: BOTH the fourth (`concepts`) and fifth (`questions`)
    // arguments stay `undefined` - untouched. This path replaces nothing:
    // it writes the row's own hand-typed text back over itself because the
    // model's reply is being discarded, so the questions the row is holding
    // still belong to the text that is still in the box. An earlier revision
    // passed `[]` here, which deleted the row's whole question list - and the
    // only copy of any answer not located in the reply - merely because the
    // instructor typed while a redraft was in flight.
    expect(call[3]).toBeUndefined();
    expect(call[4]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Q5/Q9: a shared harness for the MAX_TOKENS message and pushDraftEvent
// tests - both need markFailed calls and/or pushDraftEvent events captured,
// and a controllable draftAction response.
// ---------------------------------------------------------------------------

interface DispatchResult {
  draftEvents: DiscussionRepliesLogDraft[];
  markFailedCalls: Array<[string[], string]>;
}

async function dispatchOneBatch(args: {
  rawRows: ReplyRow[];
  queue: DraftQueueItem[];
  composition?: ReplyCompositionSettings;
  draftActionOverride: DraftDiscussionRepliesAction;
}): Promise<DispatchResult> {
  const draftEvents: DiscussionRepliesLogDraft[] = [];
  const markFailedCalls: Array<[string[], string]> = [];
  const loopsActiveRef = { current: true };

  const rowsApiFake = {
    rawRows: args.rawRows,
    rows: args.rawRows,
    markDrafting: () => {},
    snapshotEditSeq: (ids: string[]) => new Map(ids.map((id) => [id, 0])),
    isUnchangedSince: () => true,
    applyReply: () => {},
    markFailed: (ids: string[], error: string) => {
      markFailedCalls.push([ids, error]);
    },
  } as unknown as UseReplyRowsReturn;

  const deps: RunDraftLoopDeps = {
    loopsActiveRef,
    loopEpochRef: { current: 0 },
    draftQueueRef: { current: [...args.queue] },
    setDraftQueueSize: () => {},
    setDrafting: () => {},
    waitForWake: async () => {
      loopsActiveRef.current = false;
    },
    rowsApiRef: { current: rowsApiFake },
    resourcesApiRef: { current: { enqueueResources: () => {} } as unknown as UseReplyResourcesReturn },
    audienceRef: { current: "students" as const },
    courseNameRef: { current: "Intro to Testing" },
    compositionRef: { current: args.composition ?? DEFAULT_REPLY_COMPOSITION },
    knowledgeContextRef: { current: null },
    pushNotice: () => {},
    draftAction: args.draftActionOverride,
    pushDraftEvent: (event) => {
      draftEvents.push(event);
    },
  };

  await runDraftLoop(0, deps);
  return { draftEvents, markFailedCalls };
}

// ---------------------------------------------------------------------------
// Q5: the MAX_TOKENS missing-row failure message.
// ---------------------------------------------------------------------------

describe("runDraftLoop / Q5 - the MAX_TOKENS missing-row failure message", () => {
  it("names the length limit when a row is missing AND result.finishReason === 'MAX_TOKENS'", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    // The model returns NO replies at all (the row is missing), and the
    // batch's own finishReason says why.
    const { markFailedCalls } = await dispatchOneBatch({
      rawRows: [a],
      queue: [{ id: "a", force: false }],
      draftActionOverride: async () => ({ replies: [], finishReason: "MAX_TOKENS" }),
    });

    expect(markFailedCalls).toEqual([
      [["a"], "No reply came back for this post - the model's output hit its length limit. Retry usually lands."],
    ]);
  });

  it("keeps today's plain message when a row is missing for any OTHER reason (finishReason absent or something else)", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const { markFailedCalls } = await dispatchOneBatch({
      rawRows: [a],
      queue: [{ id: "a", force: false }],
      draftActionOverride: async () => ({ replies: [] }),
    });

    expect(markFailedCalls).toEqual([[["a"], "No reply came back for this post."]]);
  });

  // VERIFIER FINDING 1: the two tests above cover the PARTIAL-recovery path
  // (the array parsed, some rows are missing). The commonest truncation
  // outcome is the OTHER one: parseLenientJsonArray returns null and the
  // action returns { error }. That path used to lose the reason entirely -
  // the instructor saw "Could not read the drafted replies from the model
  // output." with nothing about length, and the draft log recorded
  // finishReason "" for exactly the calls that hit the limit.
  it("names the length limit on the BATCH-ERROR path too, keeping the provider's own reason alongside it", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const { markFailedCalls } = await dispatchOneBatch({
      rawRows: [a],
      queue: [{ id: "a", force: false }],
      draftActionOverride: async () => ({
        error: "Could not read the drafted replies from the model output.",
        finishReason: "MAX_TOKENS",
      }),
    });

    expect(markFailedCalls).toHaveLength(1);
    const [ids, message] = markFailedCalls[0]!;
    expect(ids).toEqual(["a"]);
    // The real reason SURVIVES - it is not replaced by the friendlier one.
    expect(message).toContain("Could not read the drafted replies from the model output.");
    expect(message).toContain("hit its length limit");
  });

  it("leaves a batch error with no finishReason exactly as the action worded it", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const { markFailedCalls } = await dispatchOneBatch({
      rawRows: [a],
      queue: [{ id: "a", force: false }],
      draftActionOverride: async () => ({ error: "Drafting replies failed: 503 from the provider." }),
    });

    expect(markFailedCalls).toEqual([[["a"], "Drafting replies failed: 503 from the provider."]]);
  });

  it("the error-path draft event carries the failure's finishReason and timing, not hardcoded blanks", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const { draftEvents } = await dispatchOneBatch({
      rawRows: [a],
      queue: [{ id: "a", force: false }],
      draftActionOverride: async () => ({
        error: "Could not read the drafted replies from the model output.",
        finishReason: "MAX_TOKENS",
        usage: { candidatesTokenCount: 8192 },
        elapsedMs: 9123,
      }),
    });

    expect(draftEvents).toHaveLength(1);
    expect(draftEvents[0]!.outcome).toBe("error");
    expect(draftEvents[0]!.finishReason).toBe("MAX_TOKENS");
    expect(draftEvents[0]!.candidatesTokenCount).toBe(8192);
    expect(draftEvents[0]!.elapsedMs).toBe(9123);
  });
});

// ---------------------------------------------------------------------------
// Q5/Q9: pushDraftEvent - exactly once per draftAction call, on both the ok
// and error paths, built from the DISPATCH-TIME composition/audience (never
// a fresh ref re-read).
// ---------------------------------------------------------------------------

describe("runDraftLoop / Q5-Q9 - pushDraftEvent", () => {
  it("pushes exactly one 'ok' event per dispatch, carrying the dispatch-time composition and the right counts", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const question: PostQuestion = { question: "Why?", implied: false, answer: "Because." };
    const questionNeedingYou: PostQuestion = { question: "What's the due date?", implied: true, answer: "", needsYou: "The due date." };
    const composition: ReplyCompositionSettings = {
      ingredients: ["compliment", "resources"],
      addressByName: false,
      formality: "formal",
      answerQuestions: true,
    };

    const { draftEvents } = await dispatchOneBatch({
      rawRows: [a],
      queue: [{ id: "a", force: false }],
      composition,
      draftActionOverride: async (posts) => ({
        replies: posts.map((p) => ({ id: p.id, reply: "Drafted reply text.", questions: [question, questionNeedingYou], questionsDropped: 1 })),
        finishReason: "STOP",
        usage: { candidatesTokenCount: 512 },
        elapsedMs: 1234,
      }),
    });

    expect(draftEvents).toHaveLength(1);
    const event = draftEvents[0]!;
    expect(event.rowIds).toEqual(["a"]);
    expect(event.audience).toBe("students");
    expect(event.ingredients).toEqual(["compliment", "resources"]);
    expect(event.addressByName).toBe(false);
    expect(event.formality).toBe("formal");
    expect(event.answerQuestions).toBe(true);
    expect(event.outcome).toBe("ok");
    expect(event.error).toBe("");
    expect(event.repliesReturned).toBe(1);
    expect(event.rowsMissing).toBe(0);
    expect(event.questionsReturned).toBe(2);
    // "Because." is 8 normalised characters - under
    // MIN_LOCATABLE_ANSWER_CHARS (12), so replyContainsAnswer never even
    // reaches a containment check; questionNeedingYou's answer is "" and is
    // never checked at all. Both land in "not located".
    expect(event.questionsAnsweredInReply).toBe(0);
    expect(event.questionsNeedingYou).toBe(1);
    expect(event.questionsDropped).toBe(1);
    expect(event.finishReason).toBe("STOP");
    expect(event.candidatesTokenCount).toBe(512);
    expect(event.elapsedMs).toBe(1234);
  });

  it("pushes exactly one 'error' event per dispatch, with the verbatim error text and every count zeroed", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });

    const { draftEvents } = await dispatchOneBatch({
      rawRows: [a],
      queue: [{ id: "a", force: false }],
      draftActionOverride: async () => ({ error: "429 Too Many Requests" }),
    });

    expect(draftEvents).toHaveLength(1);
    const event = draftEvents[0]!;
    expect(event.outcome).toBe("error");
    expect(event.error).toBe("429 Too Many Requests");
    expect(event.repliesReturned).toBe(0);
    expect(event.rowsMissing).toBe(1);
    expect(event.questionsReturned).toBe(0);
    expect(event.questionsAnsweredInReply).toBe(0);
    expect(event.questionsNeedingYou).toBe(0);
    expect(event.questionsDropped).toBe(0);
    expect(event.finishReason).toBe("");
    expect(event.candidatesTokenCount).toBeNull();
    expect(event.elapsedMs).toBeNull();
  });

  // docs/answers-in-the-reply-acceptance-criteria.md A7: questionsAnsweredInReply
  // - a fixture pair, one answer really is in its own reply's text, one is
  // not, and a needs-you-only item (no answer at all) is never checked -
  // summed across every reply landing in the same batch.
  it("A7: questionsAnsweredInReply counts only the questions whose answer replyContainsAnswer locates in THAT reply, summed across the batch", async () => {
    const a = makeRow({ id: "a", author: "Jordan Lee", post: "Post A." });
    const b = makeRow({ id: "b", author: "Sam Rivera", post: "Post B." });

    const inReplyAnswer = "The outer loop is re-entered before the inner one drains its own buffer.";
    const notInReplyAnswer = "The deadline moves to the following Monday at noon.";
    const qLocated: PostQuestion = { question: "Why does it loop twice?", implied: false, answer: inReplyAnswer };
    const qNotLocated: PostQuestion = { question: "When is the makeup deadline?", implied: true, answer: notInReplyAnswer };
    // No answer at all - a needs-you-only item. Never counted: `answer !==
    // ""` gates the check before replyContainsAnswer is ever called.
    const qNeedsYouOnly: PostQuestion = { question: "Which rubric applies?", implied: false, answer: "", needsYou: "The grading rubric." };

    const { draftEvents } = await dispatchOneBatch({
      rawRows: [a, b],
      queue: [
        { id: "a", force: false },
        { id: "b", force: false },
      ],
      draftActionOverride: async (posts) => ({
        replies: posts.map((p) =>
          p.id === "a"
            ? { id: p.id, reply: `${inReplyAnswer} That is the whole story.`, questions: [qLocated, qNotLocated] }
            : { id: p.id, reply: "A short reply with nothing quoted from any answer.", questions: [qNeedsYouOnly] }
        ),
      }),
    });

    expect(draftEvents).toHaveLength(1);
    expect(draftEvents[0]!.questionsReturned).toBe(3);
    // 1 from row a's qLocated; row a's qNotLocated and row b's
    // qNeedsYouOnly both land in "not located".
    expect(draftEvents[0]!.questionsAnsweredInReply).toBe(1);
  });
});
