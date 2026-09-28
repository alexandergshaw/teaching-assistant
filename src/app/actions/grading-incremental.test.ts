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

// A39 wave 4 (F24): extractCanvasEntries and getSpeedGraderUrl are mocked
// only for the Canvas-fixture describe block below - every other case in
// this file keeps the REAL extractStudentEntries (item #9's own inference
// call site) and the real extractCanvasEntries where it is not overridden
// per test.
vi.mock("@/lib/grade/extraction", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/extraction")>("@/lib/grade/extraction");
  return { ...actual, extractCanvasEntries: vi.fn() };
});
vi.mock("@/lib/canvas", async () => {
  const actual = await vi.importActual<typeof import("@/lib/canvas")>("@/lib/canvas");
  return { ...actual, getSpeedGraderUrl: vi.fn() };
});
// W6: completeGradingRunHeaderAction's own two calls, mocked directly rather
// than through callLlm - synthesizeFullCreditChecklist/generateSampleAnswer
// already degrade internally on any LLM failure (rubric.ts's own doc
// comments), so mocking callLlm here would only prove their existing
// degrade-on-failure behaviour, not this action's own wiring.
vi.mock("@/lib/grade/rubric", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/rubric")>("@/lib/grade/rubric");
  return { ...actual, synthesizeFullCreditChecklist: vi.fn(), generateSampleAnswer: vi.fn() };
});

import JSZip from "jszip";
import { requireAppOwner, requireUser } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { extractCanvasEntries } from "@/lib/grade/extraction";
import { getSpeedGraderUrl } from "@/lib/canvas";
import { prepareGradingRunAction, completeGradingRunHeaderAction } from "./grading-incremental";
import { estimateEntryWireBytes, ITEM_REQUEST_BYTE_BUDGET } from "../components/grading/incrementalRunPlan";
import { synthesizeFullCreditChecklist, generateSampleAnswer } from "@/lib/grade/rubric";

const mockRequireAppOwner = vi.mocked(requireAppOwner);
const mockRequireUser = vi.mocked(requireUser);
const mockCallLlm = vi.mocked(callLlm);
const mockExtractCanvasEntries = vi.mocked(extractCanvasEntries);
const mockGetSpeedGraderUrl = vi.mocked(getSpeedGraderUrl);
const mockSynthesizeFullCreditChecklist = vi.mocked(synthesizeFullCreditChecklist);
const mockGenerateSampleAnswer = vi.mocked(generateSampleAnswer);

// The item #9 fixture (docs/a39-inference-instrument-notes.md section 4.1),
// duplicated rather than imported from extraction.inference.test.ts
// (docs/loop/no-cross-test-file-imports.md - importing a helper from
// another *.test.ts re-runs its describe blocks).
const INFERENCE_FIXTURE_FILES: ReadonlyArray<readonly [string, string]> = [
  ["essay1-AdaL.txt", "an essay about sorting"],
  ["code1-AdaL.txt", "def sort(x): pass"],
  ["essay2-GraceH.txt", "an essay about compilers"],
  ["code2-GraceH.txt", "def compile(x): pass"],
];
const INFERENCE_FENCED_RESPONSE =
  "```json\n" +
  '{"items":[\n' +
  ' {"rawFileName":"essay1-AdaL.txt","studentName":"  Ada   Lovelace ","assignmentFileName":"essay1.txt"},\n' +
  ' {"rawFileName":"code1-AdaL.txt","studentName":"Ada Lovelace","assignmentFileName":"code1.txt"},\n' +
  ' {"rawFileName":"essay2-GraceH.txt","studentName":"Grace  Hopper","assignmentFileName":"essay2.txt"},\n' +
  ' {"rawFileName":"code2-GraceH.txt","studentName":"Grace Hopper","assignmentFileName":"code2.txt"}\n' +
  "]}\n" +
  "```";

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
  // NOTE (RULING 118, updated for item #9): this module NOW has a model-call
  // site - extractStudentEntries's filename inference, reached from :91
  // below - so asserting mockCallLlm was never called here is sufficient and
  // load-bearing for the first time: it is the only instrument that catches
  // the inference firing BEFORE the collision refusal instead of after
  // (instrument notes M4). A colliding zip must still pay nothing. The
  // no-collision and oversized-entry cases below DO reach the inference and
  // now assert `toHaveBeenCalledTimes(1)` instead. The separate claim - that
  // a refusal never reaches the whole-run gradeAction's paying seam - is
  // still proven in useIncrementalGradingRun.lifecycle.test.ts, the only
  // place that spend is observable.
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
    // Item #9 (instrument notes R4): a non-colliding zip now reaches the
    // filename inference exactly once - this action still never GRADES
    // anyone, but it is no longer model-call-free. A bare vi.fn() resolving
    // undefined is caught by inferFileNameConvention's own try/catch and
    // falls back to the deterministic names unchanged, so this repair does
    // not need a mocked response to stay green.
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
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
    // A39 wave 4: extractCanvasEntries is now mocked at module scope (for
    // F24, below), so this case can no longer rely on vitest.setup.ts's
    // real-fetch block to produce its ordinary error - an explicit rejection
    // stands in for it. The claim is unchanged: this is the negative case
    // that proves the "Refused: " prefix check discriminates in both
    // directions, not just the collision direction the test above covers.
    mockExtractCanvasEntries.mockRejectedValue(new Error("simulated Canvas fetch failure"));
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
    // MEASURED FINDING, correcting docs/a39-fill-waves.md's R4 table
    // (which predicted this repairs to toHaveBeenCalledTimes(1) "because the
    // budget loop runs AFTER extractStudentEntries"): this fixture's oversized
    // content also inflates the OUTER zip past checkFileWireBudget's own
    // UPLOAD_WIRE_BUDGET_BYTES threshold - the same constant
    // ITEM_REQUEST_BYTE_BUDGET is derived from (incrementalRunPlan.ts) -
    // because zipFileOf's JSZip defaults to STORE (no compression). So the
    // zip-level budget check at grading-incremental.ts:79-82 returns
    // whole-run BEFORE extractStudentEntries is ever called, and the model
    // seam is never reached for THIS fixture. Kept as `not.toHaveBeenCalled()`.
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

describe("prepareGradingRunAction - filename inference reaches the incremental route (item #9, I3)", () => {
  it("derives student names from the mocked filename-convention response through the real server action, not the deterministic fallback", async () => {
    const file = await zipFileOf(
      INFERENCE_FIXTURE_FILES.map(([path, content]) => ({ path, content }))
    );
    // Instrument notes section 9/11 item 2: dispatch on whether the prompt
    // carries the fixture's OWN raw filenames, never on wording from
    // buildFileNameConventionPrompt - a later wave adds a second model call
    // (resolveRunHeader's rubric synthesis) and a wording-based mock would
    // misroute it. This fixture's rubric is non-blank, so resolveRunHeader
    // never calls callLlm at all; the dispatch is defensive rather than
    // load-bearing today (notes section 11 item 2).
    mockCallLlm.mockImplementation(async (request) => {
      const promptText = JSON.stringify(request);
      if (promptText.includes("essay1-AdaL.txt")) {
        return { ok: true, text: INFERENCE_FENCED_RESPONSE };
      }
      return { ok: false, status: 500, body: "unexpected prompt" };
    });

    const result = await prepareGradingRunAction(formDataFor(file));

    expect(result.mode).toBe("incremental");
    if (result.mode !== "incremental") return;
    const names = result.plan.tickets.map((t) => t.entry.student).sort();
    expect(names).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
  });
});

describe("prepareGradingRunAction - Tier 1 step 6 swallows a getSpeedGraderUrl failure (F24)", () => {
  it("a rejecting getSpeedGraderUrl must not demote an otherwise-gradable Canvas run to whole-run", async () => {
    mockExtractCanvasEntries.mockResolvedValue({
      entries: [{ student: "Ada Lovelace", content: "an essay", mergedFileCount: 1, submittedFiles: [] }],
      pointsPossible: 10,
    });
    mockGetSpeedGraderUrl.mockRejectedValue(new Error("Canvas is unreachable"));

    const fd = new FormData();
    fd.set("canvasUrl", "https://canvas.example.edu/courses/1/assignments/2");
    fd.set("provider", "gemini");
    fd.set("rubric", "1. Correctness (10 pts)");
    fd.set("assignmentInstructions", "Write an essay.");

    const result = await prepareGradingRunAction(fd);

    // WATCHED FAILURE (design 4.4): without the `.catch(() => null)` on
    // getSpeedGraderUrl, this rejection lands at grading-incremental.ts's
    // catch block, fails the "Refused: " prefix test and returns
    // `mode: "whole-run"` instead - the one defect in the design whose
    // symptom is total silence, since startReview never reads
    // prepared.reason on that branch.
    expect(result.mode).toBe("incremental");
    if (result.mode === "incremental") {
      expect(result.speedGraderUrl).toBeNull();
    }
  });
});

describe("completeGradingRunHeaderAction (W6, design 4.3 TIER 2)", () => {
  it("returns the resolved checklist and sample answer from its own two calls", async () => {
    mockSynthesizeFullCreditChecklist.mockResolvedValueOnce(["Cite two sources", "State a thesis"]);
    mockGenerateSampleAnswer.mockResolvedValueOnce("A model answer.");

    const result = await completeGradingRunHeaderAction("Write an essay.", "1. Correctness", "gemini");

    expect(result).toEqual({
      fullCreditChecklist: ["Cite two sources", "State a thesis"],
      sampleAnswer: "A model answer.",
    });
    expect(mockSynthesizeFullCreditChecklist).toHaveBeenCalledWith("Write an essay.", "1. Correctness", "gemini");
    expect(mockGenerateSampleAnswer).toHaveBeenCalledWith("Write an essay.", "1. Correctness", "gemini");
  });

  it("is guarded by the OWNER-ONLY requireAppOwner, never the permissive requireUser", async () => {
    mockSynthesizeFullCreditChecklist.mockResolvedValueOnce([]);
    mockGenerateSampleAnswer.mockResolvedValueOnce("");

    await completeGradingRunHeaderAction("Write an essay.", "1. Correctness", "gemini");

    // DIRECTION OF FAILURE: RED if the guard call is removed from this
    // action's body - see the sabotage note below for the verified mutation.
    expect(mockRequireAppOwner).toHaveBeenCalledTimes(1);
    expect(mockRequireUser).not.toHaveBeenCalled();
    // SABOTAGE PROOF (verified manually, cp-backup outside the repo, restore
    // verified by diff): commenting out this action's own
    // `await requireAppOwner();` made the assertion above fail with
    // "expected mockRequireAppOwner to have been called 1 times, but it was
    // called 0 times" - the RED output this test exists to guard against.
  });

  it("propagates a rejection from either call rather than swallowing it - the hook's own .catch (F18) is what makes it non-fatal, not this action", async () => {
    mockSynthesizeFullCreditChecklist.mockRejectedValueOnce(new Error("checklist synthesis exploded"));
    mockGenerateSampleAnswer.mockResolvedValueOnce("A model answer.");

    await expect(completeGradingRunHeaderAction("Write an essay.", "1. Correctness", "gemini")).rejects.toThrow(
      "checklist synthesis exploded"
    );
  });
});
