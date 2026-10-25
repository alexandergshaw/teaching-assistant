import { expect, it, vi } from "vitest";
import { createPairDraftRunner } from "./pair-dispatch";
import { makeSlot, slotsReducer } from "./announcement-draft-slots";
import { recordWalkthroughDiagnostic } from "./walkthrough-diagnostics";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests, SESSION_DIAGNOSTIC_COVERAGE } from "@/lib/session-diagnostic-log";
it("production outcomes reach the existing log with closed safe keys and no private content or upstream error", async () => {
  resetSessionDiagnosticLogForTests("2026-01-01T00:00:00Z");
  const sentinel = "PRIVATE_FILENAME_EXAMPLE_MATERIAL_REVISION_OUTPUT_ERROR";
  let slots = [makeSlot("wta-slot-1", { kind: "none" }, "beginning-of-week")];
  const runner = createPairDraftRunner(() => slots, action => { slots = [...slotsReducer(slots, action)]; }, () => ({
    buildRequest: () => ({ courseLabel: sentinel, moduleLabel: sentinel, materialsText: sentinel, coverageBlock: sentinel, notes: sentinel, emojiOn: false, researchOn: false, provider: "gemini" }),
    resolveLive: () => ({ pastedOutline: null, mostRecent: null }), researchFingerprint: () => "fixed",
    fetchResources: async () => ({ kind: "off" }), draftOne: async () => { throw new Error(sentinel); },
  }), vi.fn());
  await runner.generate(); recordWalkthroughDiagnostic("preferences", "storage-unavailable", 0);
  const entries = readSessionDiagnosticLogState().entries;
  expect(entries.map(e => e.operation)).toEqual(["walkthrough_draft", "walkthrough_pair", "walkthrough_preferences"]);
  expect(entries[0]).toMatchObject({ code: "WTA_FAILED", detail: { role: "weekly", source: "live", count: 1 } });
  expect(entries[1]).toMatchObject({ code: "WTA_FAILED", outcome: "failure" });
  expect(Object.keys(entries[0].detail!).sort()).toEqual(["count", "role", "source"]);
  expect(JSON.stringify(entries)).not.toContain(sentinel);
  expect(SESSION_DIAGNOSTIC_COVERAGE.find(row => row.surface === "templates")?.covers).toContain("Walkthrough pair/draft");
});
