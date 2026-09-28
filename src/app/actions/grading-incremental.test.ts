import { describe, it, expect, vi, beforeEach } from "vitest";

// A39 wave 4c / W-A46-1 (docs/a46-scope.md section 7): the collision refusal
// must fire BEFORE any ticket is built, EXECUTED rather than argued. Mocks
// the model seam (callLlm), never `fetch` - vitest.setup.ts throws on any
// real fetch and that throw is load-bearing (docs/loop/tests-are-network-
// blocked.md). Same auth-mock shape as grading.collisionRefusal.test.ts.
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
  requireUser: vi.fn().mockRejectedValue(new Error("requireUser should never be called by this action")),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import JSZip from "jszip";
import { requireAppOwner, requireUser } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { prepareGradingRunAction } from "./grading-incremental";
import { estimateEntryWireBytes, ITEM_REQUEST_BYTE_BUDGET } from "../components/grading/incrementalRunPlan";

const mockRequireAppOwner = vi.mocked(requireAppOwner);
const mockRequireUser = vi.mocked(requireUser);
const mockCallLlm = vi.mocked(callLlm);

beforeEach(() => {
  vi.clearAllMocks();
});

async function zipFileOf(files: Array<{ path: string; content: string }>): Promise<File> {
  const zip = new JSZip();
  for (const f of files) zip.file(f.path, f.content);
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return new File([buffer], "submissions.zip", { type: "application/zip" });
}

function formDataFor(file: File): FormData {
  const fd = new FormData();
  fd.set("studentSubmissions", file);
  fd.set("provider", "gemini");
  fd.set("rubric", "1. Correctness (10 pts)");
  fd.set("assignmentInstructions", "Write an essay.");
  return fd;
}

describe("prepareGradingRunAction - the refusal fires before any ticket exists (W-A46-1)", () => {
  // NOTE (RULING 118): asserting mockCallLlm was never called here is
  // NECESSARY AND NOT SUFFICIENT - this module has no model-call site at all
  // (grep 'callLlm|gradeEntries|gradeSubmissions|generateRubric|
  // generateSampleAnswer|synthesizeFullCredit' src/app/actions/grading-
  // incremental.ts returns one hit, a comment), so the assertion is true by
  // construction and proves nothing about what happens to a refusal AFTER
  // this action returns. The real claim - that a refusal never reaches the
  // whole-run gradeAction's paying seam - is proven in
  // useIncrementalGradingRun.lifecycle.test.ts, the only place that spend is
  // observable.
  it("returns mode:'refused' (RULING 118) for a genuine flat collision, and NEVER calls the model seam", async () => {
    const file = await zipFileOf([
      { path: "Homework Final.txt", content: "final draft" },
      { path: "Homework Draft.txt", content: "earlier draft" },
    ]);

    const result = await prepareGradingRunAction(formDataFor(file));

    expect(result.mode).toBe("refused");
    if (result.mode === "refused") {
      expect(result.reason).toContain('Refused: 2 files resolve to the same student name "Homework"');
    }
    // THE OBJECT of W-A46-1: zero model-seam invocations. A refusal that
    // fires after the spend still costs the instructor the wait and the
    // quota - this is what proves it fired before, not merely that it
    // returned the right message.
    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("WATCHED FAILURE direction: a run with no collision reaches the ticket-building step and DOES build tickets (anti-vacuity for the test above)", async () => {
    const file = await zipFileOf([
      { path: "AlvarezMaria/essay.txt", content: "alvarez's essay" },
      { path: "BrownTom/essay.txt", content: "brown's essay" },
    ]);

    const result = await prepareGradingRunAction(formDataFor(file));

    expect(result.mode).toBe("incremental");
    if (result.mode === "incremental") {
      expect(result.plan.tickets).toHaveLength(2);
    }
    // Still zero model calls - this action never grades, collision or not.
    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("auth is checked via the OWNER-ONLY guard (requireAppOwner), never the permissive requireUser, before returning any result", async () => {
    const file = await zipFileOf([{ path: "AlvarezMaria/essay.txt", content: "x" }]);
    await prepareGradingRunAction(formDataFor(file));
    // This action reaches the repo owner's GitHub PAT at runtime (via
    // extractCanvasEntries -> fetchGradableRepoContent), so it is owner-only
    // by intent. Asserting the owner-only guard ran AND the permissive
    // any-signed-in-user guard did NOT is what makes reverting the
    // production guard to requireUser() turn this test red - a bare
    // "was some auth function called" assertion would stay green either way.
    expect(mockRequireAppOwner).toHaveBeenCalledTimes(1);
    expect(mockRequireUser).not.toHaveBeenCalled();
  });
});

describe("prepareGradingRunAction - RULING 118: an ORDINARY (non-refusal) thrown error still falls back to whole-run", () => {
  it("a caught error whose message does not start with the collision refusal's 'Refused: ' prefix returns mode:'whole-run', not mode:'refused'", async () => {
    // No file, no canvasUrl mock: extractCanvasEntries's own fetch is blocked
    // by vitest.setup.ts (docs/loop/tests-are-network-blocked.md), which
    // throws an ordinary Error unrelated to the collision refusal - this is
    // the negative case that proves the "Refused: " prefix check discriminates
    // in both directions, not just the collision direction the test above
    // covers.
    const fd = new FormData();
    fd.set("canvasUrl", "https://canvas.example.edu/courses/1/assignments/2");
    fd.set("provider", "gemini");
    fd.set("rubric", "1. Correctness (10 pts)");
    fd.set("assignmentInstructions", "Write an essay.");

    const result = await prepareGradingRunAction(fd);

    expect(result.mode).toBe("whole-run");
    if (result.mode === "whole-run") {
      expect(result.reason.startsWith("Refused: ")).toBe(false);
    }
    expect(mockCallLlm).not.toHaveBeenCalled();
  });
});

describe("prepareGradingRunAction - ticket ordering (A44's sourceIndex identity constraint)", () => {
  it("assigns sourceIndex in the SAME order groupSubmissionsByStudent returned the entries, never re-sorted", async () => {
    const file = await zipFileOf([
      { path: "AlvarezMaria/essay.txt", content: "alvarez's essay" },
      { path: "BrownTom/essay.txt", content: "brown's essay" },
      { path: "ChenLi/essay.txt", content: "chen's essay" },
    ]);

    const result = await prepareGradingRunAction(formDataFor(file));
    expect(result.mode).toBe("incremental");
    if (result.mode !== "incremental") return;

    const indices = result.plan.tickets.map((t) => t.sourceIndex);
    expect(indices).toEqual([0, 1, 2]);
    // Dense and strictly ascending, matching each ticket's own array
    // position - the fixed-at-build-time key mergeArrivedResults relies on.
    result.plan.tickets.forEach((ticket, i) => expect(ticket.sourceIndex).toBe(i));
  });
});

describe("prepareGradingRunAction - W4-12 clause 2: any single entry over the per-item wire budget", () => {
  it("routes the WHOLE run to whole-run, never a partial incremental run", async () => {
    // One entry's content alone exceeds ITEM_REQUEST_BYTE_BUDGET.
    const oversizedContent = "x".repeat(ITEM_REQUEST_BYTE_BUDGET + 1024);
    const file = await zipFileOf([
      { path: "AlvarezMaria/essay.txt", content: oversizedContent },
      { path: "BrownTom/essay.txt", content: "brown's essay" },
    ]);

    const result = await prepareGradingRunAction(formDataFor(file));
    expect(result.mode).toBe("whole-run");
    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("WATCHED FAILURE: a fixture under budget must NOT be routed to whole-run for this reason (anti-vacuity)", async () => {
    const file = await zipFileOf([{ path: "AlvarezMaria/essay.txt", content: "a short essay" }]);
    const result = await prepareGradingRunAction(formDataFor(file));
    expect(result.mode).toBe("incremental");
  });
});

describe("estimateEntryWireBytes (canary: the instrument this wave gates on actually measures something)", () => {
  it("grows with content length and with attached base64 files", () => {
    const bare = estimateEntryWireBytes({
      student: "A",
      content: "short",
      mergedFileCount: 1,
      submittedFiles: [],
    });
    const withFile = estimateEntryWireBytes({
      student: "A",
      content: "short",
      mergedFileCount: 1,
      submittedFiles: [{ name: "a.png", extension: "png", previewContent: "", previewTruncated: false, rawBase64: "a".repeat(1000) }],
    });
    expect(withFile).toBeGreaterThan(bare);
  });
});
