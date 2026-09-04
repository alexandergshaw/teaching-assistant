// Unit tests for message-extraction-loop.ts: isAutoDraftEligible (pure) and
// runMessageExtractionLoop itself (an injected-dependency async function, no
// hook render needed - same discipline message-draft-loop.test.ts's own
// header documents).

import { describe, it, expect } from "vitest";
import { isAutoDraftEligible, runMessageExtractionLoop, type RunMessageExtractionLoopDeps, type ExtractMessagesAction } from "./message-extraction-loop";
import type { MessageThreadRow, ThreadMessage } from "./message-serialization";
import type { UseMessageRowsReturn } from "./useMessageRows";
import type { CapturedFrame } from "../recording/discussion-capture";

function makeMessage(overrides: Partial<ThreadMessage> & Pick<ThreadMessage, "text" | "fromMe">): ThreadMessage {
  return { sender: "", precision: "none", ...overrides };
}

function makeRow(overrides: Partial<MessageThreadRow> & Pick<MessageThreadRow, "id">): MessageThreadRow {
  return {
    subject: "",
    student: "",
    messages: [makeMessage({ text: "hi", fromMe: false })],
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

const FRAME = { base64: "x", sourceWidth: 100, sourceHeight: 100 } as unknown as CapturedFrame;

describe("isAutoDraftEligible", () => {
  it("excludes previewOnly and skipped rows regardless of skipAnswered", () => {
    expect(isAutoDraftEligible(makeRow({ id: "a", previewOnly: true }), false)).toBe(false);
    expect(isAutoDraftEligible(makeRow({ id: "a", skipped: true }), false)).toBe(false);
  });

  it("excludes an answered row only when skipAnswered is true", () => {
    const answered = makeRow({ id: "a", answered: true });
    expect(isAutoDraftEligible(answered, true)).toBe(false);
    expect(isAutoDraftEligible(answered, false)).toBe(true);
  });

  it("otherwise eligible", () => {
    expect(isAutoDraftEligible(makeRow({ id: "a" }), true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// runMessageExtractionLoop
// ---------------------------------------------------------------------------

interface Harness {
  recordedBatches: Array<{ framesInBatch: number; args: unknown }>;
  mergeCalls: number;
  enqueueCalls: Array<{ ids: string[]; force: boolean }>;
  mergedCalls: number;
  noticeCalls: string[];
  extractingHistory: boolean[];
}

async function runOneBatch(args: {
  rawRows?: MessageThreadRow[];
  tableEpoch?: number;
  epochChangesDuringRequest?: boolean;
  extractAction: ExtractMessagesAction;
  skipAnswered?: boolean;
}): Promise<Harness> {
  const harness: Harness = { recordedBatches: [], mergeCalls: 0, enqueueCalls: [], mergedCalls: 0, noticeCalls: [], extractingHistory: [] };

  const loopsActiveRef = { current: true };
  const loopEpochRef = { current: 0 };
  let taken = false;

  const captureRef = {
    current: {
      get pendingFrames() {
        return taken ? 0 : 1;
      },
      takeFrameBatch: () => {
        taken = true;
        return [FRAME];
      },
    },
  };

  const epoch = args.tableEpoch ?? 0;
  const tableEpochRef = { current: epoch };

  const rowsApiFake = {
    rawRows: args.rawRows ?? [],
    get tableEpochRef() {
      return tableEpochRef;
    },
    mergeIncoming: () => {
      harness.mergeCalls += 1;
      const addedIds = ["new-1"];
      const rows = [...(args.rawRows ?? []), makeRow({ id: "new-1" })];
      return { addedIds, capped: false, rows, changed: true };
    },
  } as unknown as UseMessageRowsReturn;

  const deps: RunMessageExtractionLoopDeps = {
    loopsActiveRef,
    loopEpochRef,
    captureRef,
    waitForWake: async () => {
      loopsActiveRef.current = false;
    },
    rowsApiRef: { current: rowsApiFake },
    courseNameRef: { current: "Intro to Testing" },
    instructorNameRef: { current: "Dr. Ruiz" },
    skipAnsweredRef: { current: args.skipAnswered ?? true },
    setExtracting: (updater) => {
      const next = typeof updater === "function" ? (updater as (p: boolean) => boolean)(false) : updater;
      harness.extractingHistory.push(next);
    },
    recordBatch: (framesInBatch, batchArgs) => {
      harness.recordedBatches.push({ framesInBatch, args: batchArgs });
    },
    enqueueDrafts: (ids, force) => {
      harness.enqueueCalls.push({ ids, force });
    },
    onMerged: () => {
      harness.mergedCalls += 1;
    },
    pushNotice: (text) => {
      harness.noticeCalls.push(text);
    },
    extractAction: async (...callArgs) => {
      if (args.epochChangesDuringRequest) tableEpochRef.current = epoch + 1;
      return args.extractAction(...callArgs);
    },
  };

  await runMessageExtractionLoop(0, deps);
  return harness;
}

describe("runMessageExtractionLoop", () => {
  it("merges extracted messages and enqueues eligible added rows", async () => {
    const h = await runOneBatch({
      extractAction: async () => ({ messages: [{ subject: "Q", sender: "Devon", text: "hi", pane: "thread" }] }),
    });
    expect(h.mergeCalls).toBe(1);
    expect(h.enqueueCalls).toEqual([{ ids: ["new-1"], force: false }]); // draftDispatchForce("auto") is false
    expect(h.mergedCalls).toBe(1); // merged.changed === true in the fake
    expect(h.recordedBatches[0].args).toMatchObject({ messagesExtracted: 1, messagesAdded: 1 });
  });

  it("records an error batch and pushes a notice, without merging", async () => {
    const h = await runOneBatch({ extractAction: async () => ({ error: "429" }) });
    expect(h.mergeCalls).toBe(0);
    expect(h.recordedBatches[0].args).toMatchObject({ error: "429" });
    expect(h.noticeCalls[0]).toContain("429");
  });

  it("records an empty batch with no merge when nothing was extracted", async () => {
    const h = await runOneBatch({ extractAction: async () => ({ messages: [] }) });
    expect(h.mergeCalls).toBe(0);
    expect(h.recordedBatches[0].args).toEqual({});
  });

  it("BLOCKER: discards the batch and skips the merge when the table epoch changed while the request was in flight", async () => {
    const h = await runOneBatch({
      epochChangesDuringRequest: true,
      extractAction: async () => ({ messages: [{ subject: "Q", sender: "Devon", text: "hi", pane: "thread" }] }),
    });
    expect(h.mergeCalls).toBe(0);
    expect(h.enqueueCalls).toEqual([]);
    expect(h.mergedCalls).toBe(0);
    expect(h.recordedBatches[0].args).toMatchObject({ messagesExtracted: 1, discarded: true });
  });
});
