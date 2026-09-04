// useMessageReplies.ts is the orchestrator hook (never rendered by this
// repo's node-env vitest - see useDiscussionReplies.wiring.test.ts's own
// header for the same discipline). Source-text checks pinning facts and
// ordering no render could otherwise prove.
//
// The file is split three ways (useMessagePersistedControls.ts,
// message-extraction-loop.ts, useMessageDelivery.ts) - what is pinned here
// is only what still lives in the orchestrator itself: session wiring
// (start/stop/clear), the M15 match-pass orchestration (shared between the
// extraction loop and `stop()`), the draft queue, and
// isDraftAllPendingEligible. Everything else moved to, and is pinned by, the
// wiring test of the file it moved to.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/message-replies/useMessageReplies.ts"), "utf-8");

describe("useMessageReplies.ts wiring", () => {
  it("no longer persists M5's nine simple controls directly - useMessagePersistedControls.ts owns them now", () => {
    for (const key of [
      "ta-rec-msg-course",
      "ta-rec-msg-instructor-name",
      "ta-rec-msg-ingredients",
      "ta-rec-msg-formality",
      "ta-rec-msg-address-name",
      "ta-rec-msg-signoff",
      "ta-rec-msg-skip-answered",
      "ta-rec-msg-thread-expand",
      "ta-rec-msg-save-video",
    ]) {
      expect(SOURCE, `did not expect the literal "${key}" in useMessageReplies.ts anymore`).not.toContain(`"${key}"`);
    }
    expect(SOURCE).toMatch(/const controls = useMessagePersistedControls\(\);/);
  });

  it("still writes the kb-context-label key useMessageKnowledgeContext.ts reads", () => {
    expect(SOURCE).toContain('"ta-rec-msg-kb-context-label"');
  });

  it("dispatches draftMessageRepliesAction with no provider argument (the action's surface omits it)", () => {
    expect(SOURCE).toMatch(/draftAction: draftMessageRepliesAction as DraftMessageRepliesAction/);
  });

  it("isDraftAllPendingEligible requires a real latest-incoming message - a thread of only [you] lines is never bulk-drafted", () => {
    const fn = SOURCE.match(/function isDraftAllPendingEligible\([\s\S]{0,400}?\n\}/)?.[0] ?? "";
    expect(fn).toMatch(/latestIncoming\(row\) !== undefined/);
    expect(fn).not.toMatch(/skipAnswered/); // deliberately NOT gated on skipAnswered - see the function's own doc comment
  });

  it("hasFetchedCourseUrlsRef is reset on a genuine fetch failure AND in the effect's own cleanup (StrictMode/cancelled-before-landed), never left permanently latched", () => {
    const effectFn = SOURCE.match(/useEffect\(\(\) => \{\s*if \(!active \|\| hasFetchedCourseUrlsRef\.current\) return;[\s\S]*?\n  \}, \[active\]\);/)?.[0] ?? "";
    expect(effectFn).not.toBe("");
    // The reset must sit in the failure path itself (the `catch` and the
    // error branch), not only in the cleanup - pinned on the code, never on
    // a comment's wording.
    const catchIdx = effectFn.indexOf("catch");
    expect(catchIdx).toBeGreaterThan(-1);
    const failurePath = effectFn.slice(catchIdx, effectFn.indexOf("return () => {"));
    expect(failurePath).toMatch(/hasFetchedCourseUrlsRef\.current = false;/);
    expect(effectFn).toMatch(/if \(!cancelled\) hasFetchedCourseUrlsRef\.current = false;/);
    const cleanupIdx = effectFn.indexOf("return () => {");
    const cleanup = effectFn.slice(cleanupIdx);
    expect(cleanup).toMatch(/cancelled = true;/);
    expect(cleanup).toMatch(/hasFetchedCourseUrlsRef\.current = false;/);
  });

  it("runMatchPass: a merge-triggered pass (no forceRefetch) never calls listConversationsAction - only the cached-conversations branch runs", () => {
    const fn = SOURCE.match(/const runMatchPass = useCallback\(\s*async \(opts:[\s\S]*?\n    \},\s*\n    \[courseId, pushNotice\]\s*\n  \);/)?.[0] ?? "";
    expect(fn).not.toBe("");
    const noRefetchBranch = fn.match(/if \(!opts\.forceRefetch\) \{[\s\S]*?\n      \}/)?.[0] ?? "";
    expect(noRefetchBranch).not.toMatch(/listConversationsAction/);
    expect(noRefetchBranch).toMatch(/applyCanvasMatches/);
  });

  it("a manual call arriving while a refetch is already in flight pushes a notice instead of silently no-opping; a background (stop's) call queues one more pass", () => {
    const fn = SOURCE.match(/if \(matchInFlightRef\.current\) \{[\s\S]{0,300}?\n      \}/)?.[0] ?? "";
    expect(fn).toMatch(/pushNotice\("Already checking Canvas - try again in a moment\."\)/);
    expect(fn).toMatch(/queuedMatchPassRef\.current = true;/);
  });

  it("stop() always force-refetches; extraction-loop merges never do", () => {
    expect(SOURCE).toMatch(/captureRef\.current\.stop\(\);\s*\/\/ M15: auto-match runs "on capture stop" - always a real refetch\.\s*void runMatchPass\(\{ manual: false, forceRefetch: true \}\);/);
    expect(SOURCE).toMatch(/onMerged: \(\) => void runMatchPass\(\{ manual: false \}\),/);
  });

  it("matchUnmatched dispatches a manual, force-refetching match pass; unmatchedCount excludes matched and previewOnly rows", () => {
    expect(SOURCE).toMatch(/void runMatchPass\(\{ manual: true, forceRefetch: true \}\);/);
    expect(SOURCE).toMatch(/rowsApi\.rawRows\.filter\(\(r\) => !r\.canvas && !r\.previewOnly\)\.length/);
  });

  it("clearTable drains the draft queue and the delivery hook's own in-flight state", () => {
    const fn = SOURCE.match(/const clearTable = useCallback\(\(\) => \{[\s\S]*?\n  \}, \[setKnowledgeContextState, delivery\]\);/)?.[0] ?? "";
    expect(fn).not.toBe("");
    expect(fn).toMatch(/draftQueueRef\.current = \[\];/);
    expect(fn).toMatch(/setDraftQueueSize\(0\);/);
    expect(fn).toMatch(/delivery\.clearDeliveryState\(\);/);
  });

  it("sendErrorById is derived from rawRows via useMemo, never its own useState", () => {
    expect(SOURCE).toMatch(/const sendErrorById = useMemo\(\(\) => \{/);
    expect(SOURCE).not.toMatch(/useState<Record<string, string>>/); // no local sendErrorById state left behind
  });

  it("mirrors every dispatch-time value into a plain useRef, kept current by its own useEffect", () => {
    expect(SOURCE).toMatch(/const captureRef = useRef\(capture\);\s*\n\s*useEffect\(\(\) => \{\s*\n\s*captureRef\.current = capture;/);
    expect(SOURCE).toMatch(/const rowsApiRef = useRef\(rowsApi\);\s*\n\s*useEffect\(\(\) => \{\s*\n\s*rowsApiRef\.current = rowsApi;/);
    expect(SOURCE).toMatch(/const compositionRef = useRef\(composition\);\s*\n\s*useEffect\(\(\) => \{\s*\n\s*compositionRef\.current = composition;/);
  });

  it("computes courseName as a plain reactive value (never a ref read) for the render-time run-log call - react-hooks/refs forbids reading .current during render", () => {
    expect(SOURCE).toMatch(/const courseName = courses\?\.find\(\(c\) => c\.id === courseId\)\?\.name \?\? "";/);
    expect(SOURCE).toMatch(/courseName,\s*\n\s*composition,\s*\n\s*signoffSet:/);
  });

  it("never imports the resource-search or audience surface this feature has none of", () => {
    expect(SOURCE).not.toMatch(/useReplyResources/);
    expect(SOURCE).not.toMatch(/DiscussionAudience/);
  });

  // The instructor's writing-style block is resolved entirely server-side by
  // draftMessageRepliesAction itself (getWritingStyleBlock(user.id), mirroring
  // draftDiscussionRepliesAction's own) - this hook must never fetch or hold
  // the raw writing-style sample on the client, and "@/app/actions/media-voice"
  // (an existing, unrelated feature's action module) must not be imported
  // here just to reach it.
  it("does not import media-voice, and never references getWritingStyleBlock or a client-side writing-sample ref", () => {
    expect(SOURCE).not.toMatch(/media-voice/);
    expect(SOURCE).not.toMatch(/getUserStyleAction/);
    expect(SOURCE).not.toMatch(/getWritingStyleBlock/);
    expect(SOURCE).not.toMatch(/writingSampleRef/);
  });
});
