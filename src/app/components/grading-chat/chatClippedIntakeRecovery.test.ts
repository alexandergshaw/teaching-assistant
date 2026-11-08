import { describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = []; let cursor = 0;
  return {
    begin: () => { cursor = 0; },
    useState: (init: unknown) => { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init }; const slot = slots[i]; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (value: unknown) => unknown)(slot.value) : next; }]; },
    useRef: (init: unknown) => { const i = cursor++; if (!slots[i]) slots[i] = { value: { current: init } }; return slots[i].value; },
  };
});
vi.mock("react", () => ({ useState: hook.useState, useRef: hook.useRef }));
vi.mock("@/app/actions/grading-chat-intake", () => ({
  resolveChatRunHeaderAction: vi.fn().mockResolvedValue({ kind: "ok", effectiveRubric: "Rubric", criteriaNames: [], rubricUsed: "", rubricFingerprint: "" }),
  prepareChatSubmissionAction: vi.fn(), prepareCompositeSubmissionAction: vi.fn(),
}));
vi.mock("@/lib/grade/constants", async () => ({ ...(await vi.importActual<typeof import("@/lib/grade/constants")>("@/lib/grade/constants")), VIDEO_GRADING_ENABLED: false }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn().mockResolvedValue({ id: "user-1", email: "owner@example.com" }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ storage: { from: () => ({ list: vi.fn().mockResolvedValue({ data: [{ name: "a.zip", metadata: { size: 1024 } }], error: null }) }) } }) }));
vi.mock("@/lib/supabase/storage", () => ({ downloadFile: vi.fn().mockResolvedValue({ data: new Blob([new Uint8Array(1024)]), error: null }), removeFiles: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/grade/extraction", () => ({ ingestZipEntries: vi.fn().mockResolvedValue({ entries: [{ student: "Ada", content: "x".repeat(4_000_000), mergedFileCount: 1, submittedFiles: [] }, { student: "Lin", content: "x".repeat(4_000_000), mergedFileCount: 1, submittedFiles: [] }], attemptedSupportedFiles: 2, failedSupportedFiles: [] }) }));
import { useContinuousGradingRun } from "./useContinuousGradingRun";
import { noBatchAdmittedNotice, partialBatchNotice } from "./partialBatchNotice";
import { ingestStoragedZip } from "@/lib/grade/ndjson-ingest-parser";
import { POST } from "@/app/api/grade-submission-zip/route";
import type { NextRequest } from "next/server";

describe("clipped intake recovery", () => {
  it("bounds the refusal notice while directing the instructor to the full list", () => {
    const notice = noBatchAdmittedNotice(Array.from({ length: 12 }, (_, index) => ({ student: `Student ${index + 1}`, reason: "too large" })));
    expect(notice).toContain("Student 10"); expect(notice).toContain("2 more"); expect(notice).not.toContain("Student 11");
  });
  it("bounds partial-admission notices while directing the instructor to the complete submission list", () => {
    const omitted = Array.from({ length: 100 }, (_, index) => ({ student: `Student ${index + 1}`, reason: "session limit reached" }));
    const notice = partialBatchNotice(5, 105, 5, [], omitted);
    expect(notice).toContain("Queued the first 5 of 105");
    expect(notice).toContain("Student 10"); expect(notice).not.toContain("Student 11");
    expect(notice).toContain("90 more (see the submission list)");
    expect(notice).toContain("Do not resubmit the entire batch");
  });
  it("refuses an entirely oversized stored ZIP without dispatch and retains the named omissions", async () => {
    const dispatch = vi.fn();
    const ingest: Parameters<typeof useContinuousGradingRun>[0]["ingestZip"] = (path, provider, onEntry) => ingestStoragedZip(path, provider, onEntry, async (_url, init) => POST(new Request("https://example.test/api/grade-submission-zip", init) as NextRequest));
    const invoke = useContinuousGradingRun;
    const driver = () => { hook.begin(); return invoke({ provider: "gemini", dispatchItem: dispatch, ingestZip: ingest }); };
    await driver().beginSession({ assignmentInstructions: "Instructions", rubric: "Rubric" });
    const outcome = await driver().submit({ kind: "storaged-zip", storagePath: "user-1/grading-uploads/a.zip", name: "class.zip" });
    expect(outcome.kind).toBe("refused");
    if (outcome.kind === "refused") { expect(outcome.reason).toContain("No submissions were queued"); expect(outcome.reason).toContain("Ada"); expect(outcome.reason).toContain("retry the batch"); }
    expect(dispatch).not.toHaveBeenCalled();
    expect(driver().ingestLedger).toMatchObject({ studentsFound: 2, studentsEmitted: 0, skipped: [{ student: "Ada (item 1)" }, { student: "Lin (item 2)" }] });
  });
});
