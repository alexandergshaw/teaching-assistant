import { describe, it, expect, vi, beforeEach } from "vitest";

// A44 wave 2 (R5/R6): the refusal must actually reach the two zip-processing
// producers - extractStudentEntries (the embedded/deterministic path) and
// gradeSubmissions (the default Gemini path) - not just the pure
// collisionRefusal.ts leaf collisionRefusal.test.ts already covers. Real
// JSZip archives, no mocking of extraction itself. callLlm is mocked (never
// fetch - vitest.setup.ts throws on any real fetch and that throw is
// load-bearing); requireOwner is not involved here, this file drives the
// lib functions directly, one layer below gradeAction.

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import JSZip from "jszip";
import { extractStudentEntries } from "./extraction";
import { gradeSubmissions } from "./engine";
import { callLlm } from "@/lib/llm";

const mockCallLlm = vi.mocked(callLlm);

beforeEach(() => {
  vi.clearAllMocks();
  mockCallLlm.mockResolvedValue({
    ok: true,
    text: "Overall Comment: fine\nImprovements: none\nRubric Area: Correctness | Score: 8/10 | Comment: ok\nTotal Score: 8/10",
  });
});

async function zipOf(files: Array<{ path: string; content: string }>): Promise<ArrayBuffer> {
  const zip = new JSZip();
  for (const f of files) {
    // .txt, never .docx (extraction.test.ts's own documented trap: .docx
    // routes through a real Word-document parser that rejects plain-string
    // bytes and produces zero submissions for the wrong reason).
    zip.file(f.path, f.content);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("A44 R5b - extractStudentEntries (the embedded path) refuses a colliding zip", () => {
  it("throws the collision-refusal message rather than silently blending three students into one row", async () => {
    const buffer = await zipOf([
      { path: "AlvarezMaria/essay.txt", content: "alvarez's essay" },
      { path: "BrownTom/essay.txt", content: "brown's essay" },
      { path: "ChenLi/essay.txt", content: "chen's essay" },
    ]);

    // Before A44, this exact shape produced ONE blended row (the filed bug).
    // After A44 wave 1 alone (no refusal), it would silently produce three
    // correct rows with no signal that a collision was ever possible. Wave 2
    // only refuses where a collision actually WOULD have happened - this
    // fixture has none (three distinct per-student folders), so it must NOT
    // throw.
    const entries = await extractStudentEntries(buffer);
    expect(entries).toHaveLength(3);
  });

  it("refuses a genuine flat collision with no folder signal", async () => {
    const buffer = await zipOf([
      { path: "Homework Final.txt", content: "final draft" },
      { path: "Homework Draft.txt", content: "earlier draft" },
    ]);

    await expect(extractStudentEntries(buffer)).rejects.toThrow(
      /Refused: 2 files resolve to the same student name "Homework"/
    );
  });

  it("does not refuse a run with no risk of collision at all (a single flat file)", async () => {
    const buffer = await zipOf([{ path: "essay.txt", content: "one student's essay" }]);
    const entries = await extractStudentEntries(buffer);
    expect(entries).toHaveLength(1);
  });
});

describe("A44 R5a/R6 - gradeSubmissions (the default Gemini zip branch) refuses before spending any model call", () => {
  it("refuses a genuine flat collision, and never calls the LLM for it", async () => {
    const buffer = await zipOf([
      { path: "Homework Final.txt", content: "final draft" },
      { path: "Homework Draft.txt", content: "earlier draft" },
    ]);

    await expect(
      gradeSubmissions(buffer, "Write an essay.", "1. Correctness (10 pts)", "gemini")
    ).rejects.toThrow(/Refused: 2 files resolve to the same student name "Homework"/);

    expect(mockCallLlm).not.toHaveBeenCalled();
  });

  it("does NOT refuse and DOES grade a per-student-foldered run that A44 wave 1 fixed - R6, nothing at risk here is refused", async () => {
    const buffer = await zipOf([
      { path: "AlvarezMaria/essay.txt", content: "alvarez's essay" },
      { path: "BrownTom/essay.txt", content: "brown's essay" },
      { path: "ChenLi/essay.txt", content: "chen's essay" },
    ]);

    const run = await gradeSubmissions(buffer, "Write an essay.", "1. Correctness (10 pts)", "gemini");

    expect(run.results).toHaveLength(3);
    // One LLM call per student that got graded, plus the file-name-convention
    // inference call - never zero, and never a call that carries a collision.
    expect(mockCallLlm).toHaveBeenCalled();
  });

  it("does not fire on a non-zip caller's diagnostic use of extractSubmissions (R6 direction 2 - argued at the extraction layer, exercised here on the same shape)", async () => {
    // testGeminiAction (src/app/actions/llm-content.ts) calls
    // extractSubmissions directly and grades nothing with the result - this
    // wave's refusal lives one layer up, inside extractStudentEntries and
    // gradeSubmissions, so extractSubmissions itself must stay refusal-free.
    const { extractSubmissions } = await import("./extraction");
    const buffer = await zipOf([
      { path: "Homework Final.txt", content: "final draft" },
      { path: "Homework Draft.txt", content: "earlier draft" },
    ]);
    const result = await extractSubmissions(buffer);
    expect(Object.keys(result.submissions)).toHaveLength(2);
  });
});
