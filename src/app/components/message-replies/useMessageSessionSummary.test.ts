// Unit tests for useMessageSessionSummary.ts's two pure exports -
// stoppedMessageSummarySentence and outstandingWorkHint (M18's own frozen
// "N threads still need you ..." formula). The hook itself is never rendered
// (this repo's vitest is node-env) - these two functions are what actually
// need a test surface.

import { describe, it, expect } from "vitest";
import { stoppedMessageSummarySentence, outstandingWorkHint } from "./useMessageSessionSummary";
import type { MessageThreadRow, ThreadMessage } from "./message-serialization";

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

describe("stoppedMessageSummarySentence", () => {
  it("renders the no-failures sentence", () => {
    expect(stoppedMessageSummarySentence({ elapsedAtStop: 65, found: 3, drafted: 2, failed: 0 })).toBe(
      "Capture stopped after 1:05. Found 3 threads, drafted 2 replies."
    );
  });

  it("appends the failure clause and singularizes thread/reply at 1", () => {
    expect(stoppedMessageSummarySentence({ elapsedAtStop: 5, found: 1, drafted: 1, failed: 1 })).toBe(
      "Capture stopped after 0:05. Found 1 thread, drafted 1 reply. 1 reply failed - use Redraft on that thread."
    );
  });
});

describe("outstandingWorkHint (M18)", () => {
  it("is '' (hidden) when nothing is outstanding", () => {
    expect(outstandingWorkHint([])).toBe("");
    expect(outstandingWorkHint([makeRow({ id: "a", answered: true, state: "pending" })])).toBe("");
  });

  it("counts drafted-and-not-sent: state ready, non-empty reply, not sent, not skipped", () => {
    const eligible = makeRow({ id: "a", state: "ready", reply: "Hi" });
    const sent = makeRow({ id: "b", state: "ready", reply: "Hi", sent: { at: 1, conversationId: 1, messageCount: 1 } });
    const skipped = makeRow({ id: "c", state: "ready", reply: "Hi", skipped: true });
    const noReply = makeRow({ id: "d", state: "ready", reply: "" });
    expect(outstandingWorkHint([eligible, sent, skipped, noReply])).toBe("1 thread still needs you - 1 drafted and not sent, 0 waiting to draft.");
  });

  it("counts waiting: state pending, not answered, not previewOnly, not skipped", () => {
    const waiting = makeRow({ id: "a", state: "pending" });
    const answered = makeRow({ id: "b", state: "pending", answered: true });
    const preview = makeRow({ id: "c", state: "pending", previewOnly: true });
    const skipped = makeRow({ id: "d", state: "pending", skipped: true });
    expect(outstandingWorkHint([waiting, answered, preview, skipped])).toBe("1 thread still needs you - 0 drafted and not sent, 1 waiting to draft.");
  });

  it("pluralizes at totals > 1", () => {
    const a = makeRow({ id: "a", state: "ready", reply: "Hi" });
    const b = makeRow({ id: "b", state: "pending" });
    expect(outstandingWorkHint([a, b])).toBe("2 threads still need you - 1 drafted and not sent, 1 waiting to draft.");
  });
});
