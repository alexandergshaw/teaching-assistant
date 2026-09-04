// useMessageRows.ts is a hook (this repo's vitest is node-env and renders
// nothing - see useMessageRows.ts's own header). These are source-text checks
// pinning facts and ordering the AC requires but no render can prove.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/message-replies/useMessageRows.ts"), "utf-8");

describe("useMessageRows.ts wiring", () => {
  it("persists exactly the three table-view keys M5 assigns this file, as whole string literals", () => {
    expect(SOURCE).toMatch(/const STORAGE_KEY_TABLE = "ta-rec-msg-table";/);
    expect(SOURCE).toMatch(/const STORAGE_KEY_SORT = "ta-rec-msg-sort";/);
    expect(SOURCE).toMatch(/const STORAGE_KEY_FILTER = "ta-rec-msg-filter";/);
  });

  it("every mutator commits through rowsRef.current before scheduling a save - the single-writer invariant", () => {
    // Every `commitRows(` call site reads from a value derived off
    // `rowsRef.current` (never a `rawRows` state closure) within the same
    // function body - spot-check via the two most edit-guard-sensitive
    // mutators, applyReply and markFailed.
    expect(SOURCE).toMatch(/const applyReply = useCallback\(\s*\(id: string, reply: string, userEdited: boolean = false\) => \{\s*const raw = rowsRef\.current;/);
    expect(SOURCE).toMatch(/const markFailed = useCallback\(\s*\(ids: string\[\], error: string\) => \{\s*if \(ids\.length === 0\) return;\s*const idSet = new Set\(ids\);\s*let changed = false;\s*const next = rowsRef\.current\.map/);
  });

  it("mergeIncoming returns the post-merge rows and a changed flag alongside addedIds/capped, for the orchestrator's auto-eligibility and auto-match triggers", () => {
    expect(SOURCE).toMatch(/return \{ addedIds: merged\.addedIds, capped: merged\.capped, rows: finalRows, changed \};/);
  });

  it("setCanvasMatch is a no-op when the row already carries the identical conversationId (idempotent against a repeated auto-match pass)", () => {
    expect(SOURCE).toMatch(/if \(row\.canvas\?\.conversationId === canvas\.conversationId\) return;/);
  });

  it("setSent writes `sent`, `handledAt`, AND clears sendAttempt/sendError in the SAME commit (M17: never observable apart after a reload)", () => {
    expect(SOURCE).toMatch(
      /const setSent = useCallback\(\s*\(id: string, sent: NonNullable<MessageThreadRow\["sent"\]>, handledAt: number\) => \{[\s\S]{0,300}\{ \.\.\.r, sent, handledAt, sendAttempt: undefined, sendError: undefined \}/
    );
  });

  it("setCanvasMatch clears matchOutcome in the same commit it sets canvas (a matched row never also carries a stale outcome)", () => {
    expect(SOURCE).toMatch(/\{ \.\.\.r, canvas, matchOutcome: undefined \}/);
  });

  it("never imports the resource-mutator machinery this table drops (section 0: no resource lane) - only the header comment names why not", () => {
    expect(SOURCE).not.toMatch(/^import.*useReplyRowResourceMutators/m);
    expect(SOURCE).not.toMatch(/const resourceSeqRef/);
  });
});
