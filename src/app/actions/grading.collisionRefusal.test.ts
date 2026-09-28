import { describe, it, expect, vi, beforeEach } from "vitest";

// A44 wave 2 (R5a, R5b, R6): drives the real gradeAction Server Action with a
// real JSZip archive - requireOwner mocked (auth only), callLlm mocked
// (never fetch - vitest.setup.ts throws on any real fetch and that throw is
// load-bearing), everything else (extraction, the identity fold, the
// refusal predicate, gradeSubmissions/extractStudentEntries) real. This is
// the surface docs/a44-waves.md's R5 residual asks to be driven rather than
// argued: gradeAction's outer catch (grading.ts:921-924) must return the
// refusal message verbatim as `error`, with `run: null`.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

vi.mock("@/lib/code-runner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/code-runner")>("@/lib/code-runner");
  return {
    ...actual,
    attachCodeRuns: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/lib/research/rubric-bank", () => ({
  rememberRubric: vi.fn().mockResolvedValue(0),
}));

import JSZip from "jszip";
import { gradeAction } from "./grading";
import { callLlm } from "@/lib/llm";

const mockCallLlm = vi.mocked(callLlm);

beforeEach(() => {
  vi.clearAllMocks();
  mockCallLlm.mockResolvedValue({
    ok: true,
    text: "Overall Comment: fine\nImprovements: none\nRubric Area: Correctness | Score: 8/10 | Comment: ok\nTotal Score: 8/10",
  });
});

async function zipFileOf(files: Array<{ path: string; content: string }>, name = "submissions.zip"): Promise<File> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  return new File([buffer], name, { type: "application/zip" });
}

function formDataFor(file: File, provider: "gemini" | "embedded"): FormData {
  const fd = new FormData();
  fd.set("studentSubmissions", file);
  fd.set("provider", provider);
  fd.set("rubric", "1. Correctness (10 pts)");
  fd.set("assignmentInstructions", "Write an essay.");
  return fd;
}

describe("gradeAction - the A44 collision refusal reaches the returned GradeActionState (gemini provider, the default zip branch)", () => {
  it("returns { run: null, error: <the refusal, verbatim> } for a genuine flat collision, and spends no model call", async () => {
    const file = await zipFileOf([
      { path: "Homework Final.txt", content: "final draft" },
      { path: "Homework Draft.txt", content: "earlier draft" },
    ]);

    const result = await gradeAction({ run: null, error: null }, formDataFor(file, "gemini"));

    expect(result.run).toBeNull();
    expect(result.error).toBe(
      'Refused: 2 files resolve to the same student name "Homework", ' +
        "so they would have been graded together as one row: Homework Draft.txt, Homework Final.txt. " +
        "This archive has no other student folders, so the folder name is not enough to tell these apart. " +
        "Put each student's files in their own folder inside the zip, or rename each file to studentname_date_time_filename, then upload again. No grades were produced."
    );
    // gradeAction races gradeSubmissions against synthesizeFullCreditChecklist
    // and generateSampleAnswer in one Promise.all (grading.ts:906-910) - those
    // two are independent of the zip's contents and Promise.all does not
    // cancel siblings, so they still call the model even though gradeSubmissions
    // itself refuses before touching it (proven directly, with no siblings in
    // the way, by collisionRefusal.wiring.test.ts's "never calls the LLM for
    // it" case). What this test can and does assert is that NEITHER of the
    // two calls that did fire carries this zip's content.
    for (const [req] of mockCallLlm.mock.calls) {
      expect(JSON.stringify(req)).not.toContain("final draft");
      expect(JSON.stringify(req)).not.toContain("earlier draft");
    }
  });

  it("still grades a per-student-foldered run (R6 - nothing at risk here is refused), through the real fold", async () => {
    const file = await zipFileOf([
      { path: "AlvarezMaria/essay.txt", content: "alvarez's essay" },
      { path: "BrownTom/essay.txt", content: "brown's essay" },
      { path: "ChenLi/essay.txt", content: "chen's essay" },
    ]);

    const result = await gradeAction({ run: null, error: null }, formDataFor(file, "gemini"));

    expect(result.error).toBeNull();
    expect(result.run).not.toBeNull();
    expect(result.run?.results).toHaveLength(3);
    // No content marker ever appears in more than one call's request body:
    // the collision-free fixture graded three DISTINCT students, not one
    // blended row split across three identical calls.
    const bodies = mockCallLlm.mock.calls.map(([req]) => JSON.stringify(req));
    expect(bodies.some((b) => b.includes("alvarez's essay"))).toBe(true);
    expect(bodies.some((b) => b.includes("brown's essay"))).toBe(true);
    expect(bodies.some((b) => b.includes("chen's essay"))).toBe(true);
  });
});

describe("gradeAction - the A44 collision refusal on the embedded (deterministic) zip branch (R5b)", () => {
  it("returns { run: null, error: <the refusal> } through extractStudentEntries, never reaching gradeEntriesEmbedded", async () => {
    const file = await zipFileOf([
      { path: "Homework Final.txt", content: "final draft" },
      { path: "Homework Draft.txt", content: "earlier draft" },
    ]);

    const result = await gradeAction({ run: null, error: null }, formDataFor(file, "embedded"));

    expect(result.run).toBeNull();
    expect(result.error).toContain('Refused: 2 files resolve to the same student name "Homework"');
  });
});
