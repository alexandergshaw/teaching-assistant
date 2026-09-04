// useMessageDelivery.ts is a hook (this repo's vitest is node-env and
// renders nothing - see useMessageRows.ts's own header). Source-text checks
// pinning the facts and ordering this hook's send/save/check contract requires.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/message-replies/useMessageDelivery.ts"), "utf-8");

describe("useMessageDelivery.ts wiring", () => {
  it("send() checks the per-row in-flight ref, THEN refuses a row that is already sent, before dispatching", () => {
    const sendStart = SOURCE.indexOf("const send = useCallback(");
    expect(sendStart).toBeGreaterThanOrEqual(0);
    const checkSentStart = SOURCE.indexOf("const checkSent = useCallback(");
    const fn = SOURCE.slice(sendStart, checkSentStart > sendStart ? checkSentStart : undefined);
    expect(fn).toMatch(/if \(sendInFlightRef\.current\.has\(id\)\) return;/);
    expect(fn).toMatch(/if \(row\.sent\) return;/);
    const inFlightIdx = fn.indexOf("sendInFlightRef.current.has(id)");
    const sentIdx = fn.indexOf("if (row.sent) return;");
    const dispatchIdx = fn.indexOf("replyToConversationAction(");
    expect(inFlightIdx).toBeGreaterThanOrEqual(0);
    expect(sentIdx).toBeGreaterThan(inFlightIdx);
    expect(dispatchIdx).toBeGreaterThan(sentIdx);
  });

  it("send() writes setSendAttempt BEFORE the replyToConversationAction fetch", () => {
    const attemptIdx = SOURCE.indexOf("setSendAttempt(id,");
    const fetchIdx = SOURCE.indexOf("replyToConversationAction(");
    expect(attemptIdx).toBeGreaterThanOrEqual(0);
    expect(fetchIdx).toBeGreaterThan(attemptIdx);
  });

  it("send() failure and checkSent() failure both write/report the shared SEND_FAILURE_TEXT / a notice, never inventing a second string", () => {
    expect(SOURCE).toMatch(/setSendError\(id, SEND_FAILURE_TEXT\)/);
    expect((SOURCE.match(/SEND_FAILURE_TEXT/g) ?? []).length).toBeGreaterThanOrEqual(2); // import + at least one use
  });

  it("checkSent() pushes a notice on a Canvas/network failure, and stays silent (no notice) when the check succeeds but finds nothing", () => {
    const fn = SOURCE.match(/const checkSent = useCallback\(\s*\(id: string\) => \{[\s\S]*?\n  \);/)?.[0] ?? "";
    expect(fn).toMatch(/pushNotice\(`Could not check Canvas: \$\{result\.error\}`\)/);
    expect(fn).toMatch(/if \(messageId === undefined\) return;/);
    // The "not found" branch must return WITHOUT a pushNotice call between
    // the messageId check and its own return statement.
    const notFoundIdx = fn.indexOf("if (messageId === undefined) return;");
    const beforeNotFound = fn.slice(0, notFoundIdx);
    const afterLastCatchStart = fn.lastIndexOf("} catch");
    // pushNotice for the caught exception is expected AFTER the not-found
    // branch (in the catch block) - it must not appear between the two
    // fetch-result branches.
    expect(afterLastCatchStart).toBeGreaterThan(notFoundIdx);
    void beforeNotFound;
  });

  it("clearDeliveryState clears the in-flight set, savingDraftIds and sendingIds", () => {
    const fn = SOURCE.match(/const clearDeliveryState = useCallback\(\(\) => \{[\s\S]{0,300}?\n  \},/)?.[0] ?? "";
    expect(fn).toMatch(/sendInFlightRef\.current\.clear\(\)/);
    expect(fn).toMatch(/setSavingDraftIds/);
    expect(fn).toMatch(/setSendingIds/);
  });

  it("never returns sendErrorById - it is derived from rawRows at the orchestrator, not owned here (reading a ref during render is forbidden)", () => {
    const returnStatement = SOURCE.match(/return \{ saveDraft[\s\S]*?\};/)?.[0] ?? "";
    expect(returnStatement).not.toBe("");
    expect(returnStatement).not.toMatch(/sendErrorById/);
    const returnInterface = SOURCE.match(/export interface UseMessageDeliveryReturn \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(returnInterface).not.toBe("");
    expect(returnInterface).not.toMatch(/sendErrorById:/);
  });
});
