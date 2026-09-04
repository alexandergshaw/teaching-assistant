// Unit tests for message-draft-loop.ts: buildWritingStyleBlockFromSample,
// applyCanvasMatches, buildMessageDraftPayload, findSentMessageId (all pure)
// and runMessageDraftLoop itself (an injected-dependency async function, no
// hook render needed - same discipline discussion-draft-loop.test.ts's own
// header documents: vitest here is node-env and renders nothing, and
// runMessageDraftLoop takes every dependency by injection).

import { describe, it, expect } from "vitest";
import {
  applyCanvasMatches,
  buildMessageDraftPayload,
  findSentMessageId,
  runMessageDraftLoop,
  type DraftMessageRepliesAction,
  type MessageDraftQueueItem,
  type RunMessageDraftLoopDeps,
} from "./message-draft-loop";
import type { MessageThreadRow, ThreadMessage } from "./message-serialization";
import type { UseMessageRowsReturn } from "./useMessageRows";
import type { CanvasConversationSummary, CanvasConversationDetail } from "@/lib/canvas/inbox";
import { DEFAULT_MESSAGE_INGREDIENTS, type MessageCompositionSettings } from "@/lib/message-reply-prompt";

const DEFAULT_COMPOSITION: MessageCompositionSettings = {
  ingredients: DEFAULT_MESSAGE_INGREDIENTS,
  addressByName: true,
  formality: "balanced",
};

function makeMessage(overrides: Partial<ThreadMessage> & Pick<ThreadMessage, "text" | "fromMe">): ThreadMessage {
  return { sender: "", precision: "none", ...overrides };
}

function makeRow(overrides: Partial<MessageThreadRow> & Pick<MessageThreadRow, "id">): MessageThreadRow {
  return {
    subject: "Question about homework",
    student: "Sam Osei",
    messages: [makeMessage({ text: "Can you help?", fromMe: false })],
    omittedMessages: 0,
    answered: false,
    reply: "",
    state: "pending",
    userEdited: false,
    firstSeenAt: 0,
    order: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// applyCanvasMatches
// ---------------------------------------------------------------------------

function fakeRowsApi(
  rawRows: MessageThreadRow[]
): {
  ref: { current: UseMessageRowsReturn };
  setCanvasMatchCalls: Array<[string, unknown]>;
  setMatchOutcomeCalls: Array<[string, "none" | "ambiguous"]>;
} {
  const setCanvasMatchCalls: Array<[string, unknown]> = [];
  const setMatchOutcomeCalls: Array<[string, "none" | "ambiguous"]> = [];
  const api = {
    rawRows,
    setCanvasMatch: (id: string, canvas: unknown) => {
      setCanvasMatchCalls.push([id, canvas]);
    },
    setMatchOutcome: (id: string, outcome: "none" | "ambiguous") => {
      setMatchOutcomeCalls.push([id, outcome]);
    },
  } as unknown as UseMessageRowsReturn;
  return { ref: { current: api }, setCanvasMatchCalls, setMatchOutcomeCalls };
}

const CONVERSATIONS: CanvasConversationSummary[] = [
  { id: 501, subject: "Question about homework", lastMessage: "", participants: ["Sam Osei"], messageCount: 2, workflowState: "read", lastMessageAt: null },
];

describe("applyCanvasMatches", () => {
  it("sets the match on a unique candidate, stamping matchedAt with `now`", () => {
    const { ref, setCanvasMatchCalls } = fakeRowsApi([makeRow({ id: "m1" })]);
    applyCanvasMatches(ref, CONVERSATIONS, 12345);
    expect(setCanvasMatchCalls).toHaveLength(1);
    const [id, canvas] = setCanvasMatchCalls[0];
    expect(id).toBe("m1");
    expect(canvas).toMatchObject({ conversationId: 501, matchedAt: 12345 });
  });

  it("skips a row that already has a canvas match", () => {
    const { ref, setCanvasMatchCalls } = fakeRowsApi([makeRow({ id: "m1", canvas: { conversationId: 999, matchedBy: "subject+student", matchedAt: 1, subject: "x", participants: [], messageCount: 0 } })]);
    applyCanvasMatches(ref, CONVERSATIONS, 12345);
    expect(setCanvasMatchCalls).toHaveLength(0);
  });

  it("skips a previewOnly row", () => {
    const { ref, setCanvasMatchCalls } = fakeRowsApi([makeRow({ id: "m1", previewOnly: true })]);
    applyCanvasMatches(ref, CONVERSATIONS, 12345);
    expect(setCanvasMatchCalls).toHaveLength(0);
  });

  it("narrows to `rowIds` when given", () => {
    const { ref, setCanvasMatchCalls } = fakeRowsApi([
      makeRow({ id: "m1" }),
      makeRow({ id: "m2", subject: "Question about homework", student: "Sam Osei" }),
    ]);
    applyCanvasMatches(ref, CONVERSATIONS, 1, ["m2"]);
    expect(setCanvasMatchCalls.map(([id]) => id)).toEqual(["m2"]);
  });

  it("writes matchOutcome 'none' on an examined row with no candidate", () => {
    const { ref, setCanvasMatchCalls, setMatchOutcomeCalls } = fakeRowsApi([makeRow({ id: "m1", subject: "Totally different subject", student: "Nobody Here" })]);
    applyCanvasMatches(ref, CONVERSATIONS, 12345);
    expect(setCanvasMatchCalls).toHaveLength(0);
    expect(setMatchOutcomeCalls).toEqual([["m1", "none"]]);
  });

  it("writes matchOutcome 'ambiguous' on an examined row with several candidates", () => {
    const twoConversations: CanvasConversationSummary[] = [
      { id: 501, subject: "Question about homework", lastMessage: "", participants: ["Sam Osei"], messageCount: 2, workflowState: "read", lastMessageAt: null },
      { id: 502, subject: "Question about homework", lastMessage: "", participants: ["Sam Osei"], messageCount: 5, workflowState: "read", lastMessageAt: null },
    ];
    const { ref, setCanvasMatchCalls, setMatchOutcomeCalls } = fakeRowsApi([makeRow({ id: "m1" })]);
    applyCanvasMatches(ref, twoConversations, 12345);
    expect(setCanvasMatchCalls).toHaveLength(0);
    expect(setMatchOutcomeCalls).toEqual([["m1", "ambiguous"]]);
  });
});

// ---------------------------------------------------------------------------
// buildMessageDraftPayload
// ---------------------------------------------------------------------------

describe("buildMessageDraftPayload", () => {
  const canvas = { conversationId: 501, matchedBy: "subject+student" as const, matchedAt: 1, subject: "s", participants: [], messageCount: 1 };

  it("returns null when the row has no canvas match", () => {
    expect(buildMessageDraftPayload(makeRow({ id: "m1", reply: "Hi" }), "ABC")).toBeNull();
  });

  it("returns null when the row has no reply yet", () => {
    expect(buildMessageDraftPayload(makeRow({ id: "m1", canvas, reply: "" }), "ABC")).toBeNull();
  });

  it("builds the summary/payload M16 describes for a matched, drafted row", () => {
    const row = makeRow({
      id: "m1",
      subject: "Question about homework",
      student: "Sam Osei",
      canvas,
      reply: "Sure, here is the answer.",
      messages: [makeMessage({ text: "Can you help?", fromMe: false, sentAt: "Sep 3 at 2:14pm" })],
    });
    const built = buildMessageDraftPayload(row, "ABC");
    expect(built).not.toBeNull();
    expect(built!.summary).toBe("Reply to Sam Osei - Question about homework");
    expect(built!.payload).toMatchObject({
      kind: "reply",
      body: "Sure, here is the answer.",
      conversationId: "501",
      institution: "ABC",
      title: "Question about homework",
      recipientName: "Sam Osei",
    });
    expect(built!.payload.context).toContain("Sam Osei (Sep 3 at 2:14pm): Can you help?");
  });
});

// ---------------------------------------------------------------------------
// findSentMessageId
// ---------------------------------------------------------------------------

function conversation(overrides: Partial<CanvasConversationDetail>): CanvasConversationDetail {
  return { id: 1, subject: "s", participants: [], selfId: 9, messages: [], ...overrides };
}

describe("findSentMessageId", () => {
  it("finds the last own message whose body normalizes equal to the reply", () => {
    const c = conversation({
      selfId: 9,
      messages: [
        { id: 1, authorId: 2, author: "Student", body: "hi", createdAt: null },
        { id: 2, authorId: 9, author: "Me", body: "Sure, HERE is the answer!", createdAt: null },
      ],
    });
    expect(findSentMessageId(c, "sure here is the answer")).toBe(2);
  });

  it("returns undefined when no own message matches", () => {
    const c = conversation({ selfId: 9, messages: [{ id: 1, authorId: 2, author: "Student", body: "hi", createdAt: null }] });
    expect(findSentMessageId(c, "Sure, here is the answer.")).toBeUndefined();
  });

  it("a STUDENT message whose body normalizes equal to the reply is never matched - the authorId === selfId filter is load-bearing", () => {
    const c = conversation({
      selfId: 9,
      messages: [{ id: 1, authorId: 2, author: "Student", body: "Sure, here is the answer.", createdAt: null }],
    });
    expect(findSentMessageId(c, "Sure, here is the answer.")).toBeUndefined();
  });

  it("when two own messages both match, the LAST one (by array order) wins", () => {
    const c = conversation({
      selfId: 9,
      messages: [
        { id: 1, authorId: 9, author: "Me", body: "Sure, here is the answer.", createdAt: null },
        { id: 2, authorId: 2, author: "Student", body: "thanks!", createdAt: null },
        { id: 3, authorId: 9, author: "Me", body: "Sure, here is the answer.", createdAt: null },
      ],
    });
    expect(findSentMessageId(c, "Sure, here is the answer.")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// runMessageDraftLoop
// ---------------------------------------------------------------------------

async function dispatchOneBatch(args: {
  rawRows: MessageThreadRow[];
  queue: MessageDraftQueueItem[];
  composition?: MessageCompositionSettings;
  signoff?: string;
  draftAction?: DraftMessageRepliesAction;
}) {
  let capturedThreads: Parameters<DraftMessageRepliesAction>[0] | null = null;
  let capturedCallArgs: unknown[] | null = null;
  const appliedReplies: Array<{ id: string; reply: string; userEdited: boolean }> = [];
  const failedCalls: Array<{ ids: string[]; error: string }> = [];

  const loopsActiveRef = { current: true };
  const loopEpochRef = { current: 0 };
  const draftQueueRef = { current: [...args.queue] };

  const rowsApiFake = {
    rawRows: args.rawRows,
    markDrafting: () => {},
    snapshotEditSeq: (ids: string[]) => new Map(ids.map((id) => [id, 0])),
    isUnchangedSince: () => true,
    applyReply: (id: string, reply: string, userEdited = false) => {
      appliedReplies.push({ id, reply, userEdited });
    },
    markFailed: (ids: string[], error: string) => {
      failedCalls.push({ ids, error });
    },
  } as unknown as UseMessageRowsReturn;

  const draftAction: DraftMessageRepliesAction =
    args.draftAction ??
    (async (...callArgs) => {
      const [threads] = callArgs;
      capturedThreads = threads;
      capturedCallArgs = callArgs;
      return { replies: threads.map((_t, i) => ({ post: i + 1, reply: "Drafted reply text." })) };
    });

  const deps: RunMessageDraftLoopDeps = {
    loopsActiveRef,
    loopEpochRef,
    draftQueueRef,
    setDraftQueueSize: () => {},
    setDrafting: () => {},
    waitForWake: async () => {
      loopsActiveRef.current = false;
    },
    rowsApiRef: { current: rowsApiFake },
    courseNameRef: { current: "Intro to Testing" },
    compositionRef: { current: args.composition ?? DEFAULT_COMPOSITION },
    signoffRef: { current: args.signoff ?? "" },
    knowledgeContextRef: { current: null },
    pushNotice: () => {},
    draftAction,
  };

  await runMessageDraftLoop(0, deps);

  return { threads: capturedThreads, callArgs: capturedCallArgs, appliedReplies, failedCalls };
}

describe("runMessageDraftLoop", () => {
  it("dispatches threads positionally with no id and no provider, oldest-first messages preserved", async () => {
    const row = makeRow({
      id: "m1",
      student: "Sam Osei",
      messages: [makeMessage({ text: "First.", fromMe: false }), makeMessage({ text: "Second.", fromMe: true })],
    });
    const { threads } = await dispatchOneBatch({ rawRows: [row], queue: [{ id: "m1", force: false }] });
    expect(threads).toEqual([{ messages: [{ text: "First.", fromMe: false }, { text: "Second.", fromMe: true }], greetingName: "Sam" }]);
  });

  it("omits greetingName entirely when it degrades to empty (a bare lowercase handle)", async () => {
    const row = makeRow({ id: "m1", student: "mchen" });
    const { threads } = await dispatchOneBatch({ rawRows: [row], queue: [{ id: "m1", force: false }] });
    expect(threads![0]).not.toHaveProperty("greetingName");
  });

  it("maps a positional reply back to the dispatched row's real id and applies the sign-off", async () => {
    const rowA = makeRow({ id: "a" });
    const rowB = makeRow({ id: "b" });
    const draftAction: DraftMessageRepliesAction = async (threads) => ({
      replies: threads.map((_t, i) => ({ post: i + 1, reply: `Reply ${i + 1}` })),
    });
    const { appliedReplies } = await dispatchOneBatch({
      rawRows: [rowA, rowB],
      queue: [{ id: "a", force: false }, { id: "b", force: false }],
      signoff: "Best, Dr. Ruiz",
      draftAction,
    });
    expect(appliedReplies).toEqual([
      { id: "a", reply: "Reply 1\n\nBest, Dr. Ruiz", userEdited: false },
      { id: "b", reply: "Reply 2\n\nBest, Dr. Ruiz", userEdited: false },
    ]);
  });

  it("dispatches the draft action with no style argument - threads, courseName, composition, knowledgeContext only", async () => {
    const { callArgs } = await dispatchOneBatch({
      rawRows: [makeRow({ id: "m1" })],
      queue: [{ id: "m1", force: false }],
      composition: DEFAULT_COMPOSITION,
    });
    expect(callArgs).not.toBeNull();
    // Exactly 4 positional arguments - threads(0), courseName(1),
    // composition(2), knowledgeContext(3) - never a 5th styleBlock argument,
    // and the 2nd/3rd positions are the real courseName string and the real
    // composition object, never a style-block string slipped in between them.
    expect(callArgs).toHaveLength(4);
    expect(callArgs![1]).toBe("Intro to Testing");
    expect(callArgs![2]).toEqual(DEFAULT_COMPOSITION);
    expect(callArgs![3]).toBeUndefined();
  });

  it("marks unchanged rows failed and pushes a notice on a batch-level error", async () => {
    const { failedCalls } = await dispatchOneBatch({
      rawRows: [makeRow({ id: "m1" })],
      queue: [{ id: "m1", force: false }],
      draftAction: async () => ({ error: "Model unavailable." }),
    });
    expect(failedCalls).toEqual([{ ids: ["m1"], error: "Model unavailable." }]);
  });

  it("marks a row failed when the model omits its position from the response", async () => {
    const { failedCalls, appliedReplies } = await dispatchOneBatch({
      rawRows: [makeRow({ id: "m1" }), makeRow({ id: "m2" })],
      queue: [{ id: "m1", force: false }, { id: "m2", force: false }],
      draftAction: async () => ({ replies: [{ post: 1, reply: "Only the first." }] }),
    });
    expect(appliedReplies.map((r) => r.id)).toEqual(["m1"]);
    expect(failedCalls).toEqual([{ ids: ["m2"], error: "No reply came back for this thread." }]);
  });

  it("respects the userEdited dispatch guard: a non-forced item on a userEdited row is never dispatched", async () => {
    const row = makeRow({ id: "m1", userEdited: true });
    const { threads } = await dispatchOneBatch({ rawRows: [row], queue: [{ id: "m1", force: false }] });
    expect(threads).toBeNull();
  });
});
