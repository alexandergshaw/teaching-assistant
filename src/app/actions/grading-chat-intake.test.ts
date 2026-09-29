import { describe, it, expect, vi, beforeEach } from "vitest";

// Same auth-mock shape as grading-incremental.test.ts. Both new actions must
// call requireAppOwner() (F1/R7), not requireUser().
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
  requireUser: vi.fn().mockRejectedValue(new Error("requireUser should never be called by this action")),
}));

// extraction.ts is fully mocked here (no `vi.importActual`) - the collision-
// refusal path (AC-9) and the Canvas pointsPossible path (BLOCKER-1) are both
// exercised by controlling exactly what these two functions return/throw,
// without needing a real zip fixture or a live Canvas fetch (network stays
// blocked - vitest.setup.ts throws on any real fetch).
vi.mock("@/lib/grade/extraction", () => ({
  extractStudentEntries: vi.fn(),
  extractCanvasEntries: vi.fn(),
}));

vi.mock("@/lib/grade/repo-content", () => ({
  fetchGradableRepoContent: vi.fn(),
}));

vi.mock("@/lib/canvas-url", () => ({
  detectCanvasUrlKind: vi.fn(),
}));

// F4 Gap 1 (docs/grading-chat-security.md SEC-GC-3): resolveChatRunHeaderAction
// must bound assignmentInstructions/rubric BEFORE resolveRunHeader ever spends
// a generateRubric model call. Mocking generateRubric (not callLlm) makes
// "was a model call attempted" directly observable, matching
// grading-incremental.test.ts's own reasoning for its rubric.ts mock.
vi.mock("@/lib/grade/rubric", async () => {
  const actual = await vi.importActual<typeof import("@/lib/grade/rubric")>("@/lib/grade/rubric");
  return { ...actual, generateRubric: vi.fn() };
});

import { requireAppOwner } from "@/lib/supabase/auth";
import { extractStudentEntries, extractCanvasEntries } from "@/lib/grade/extraction";
import { fetchGradableRepoContent } from "@/lib/grade/repo-content";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { generateRubric } from "@/lib/grade/rubric";
import { prepareChatSubmissionAction, resolveChatRunHeaderAction } from "./grading-chat-intake";
import type { StudentSubmissionEntry } from "@/lib/grade/types";

const mockRequireAppOwner = vi.mocked(requireAppOwner);
const mockExtractStudentEntries = vi.mocked(extractStudentEntries);
const mockExtractCanvasEntries = vi.mocked(extractCanvasEntries);
const mockFetchGradableRepoContent = vi.mocked(fetchGradableRepoContent);
const mockDetectCanvasUrlKind = vi.mocked(detectCanvasUrlKind);
const mockGenerateRubric = vi.mocked(generateRubric);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: a parseable rubric, so tests that do not care about rubric
  // synthesis (e.g. the requireAppOwner smoke test) do not crash inside the
  // real extractRubricCriteria on an unmocked-away undefined.
  mockGenerateRubric.mockResolvedValue("1. Correctness");
});

function textFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function fileFormData(file: File, extra: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("kind", "file");
  fd.set("file", file);
  for (const [key, value] of Object.entries(extra)) fd.set(key, value);
  return fd;
}

const canvasEntry: StudentSubmissionEntry = {
  student: "Ada Lovelace",
  content: "a discussion post",
  mergedFileCount: 1,
  submittedFiles: [],
};

describe("resolveChatRunHeaderAction", () => {
  it("calls requireAppOwner, not requireUser", async () => {
    await resolveChatRunHeaderAction("Grade the essay.", "", "gemini");
    expect(mockRequireAppOwner).toHaveBeenCalledTimes(1);
  });

  // RED (F4 Gap 1) if the bound is removed: generateRubric would be called
  // (blank rubric + non-blank instructions synthesizes one) before any
  // char-count check ever runs.
  it("refuses oversized assignmentInstructions BEFORE generateRubric is ever called", async () => {
    const oversized = "x".repeat(20_001);
    const result = await resolveChatRunHeaderAction(oversized, "", "gemini");
    expect(result.kind).toBe("refused");
    expect(mockGenerateRubric).not.toHaveBeenCalled();
  });

  it("refuses oversized rubric text", async () => {
    const oversized = "y".repeat(20_001);
    const result = await resolveChatRunHeaderAction("Grade the essay.", oversized, "gemini");
    expect(result.kind).toBe("refused");
  });

  it("synthesizes a rubric from instructions when the rubric is blank (R2 recommended reading)", async () => {
    mockGenerateRubric.mockResolvedValue("Criterion: Clarity");
    const result = await resolveChatRunHeaderAction("Grade the essay for clarity.", "", "gemini");
    expect(result.kind).toBe("ok");
    expect(mockGenerateRubric).toHaveBeenCalledTimes(1);
  });

  it("refuses blank instructions with the existing byte-identical string", async () => {
    const result = await resolveChatRunHeaderAction("   ", "some rubric", "gemini");
    expect(result.kind).toBe("refused");
    if (result.kind === "refused") {
      expect(result.error).toBe("Please provide assignment instructions.");
    }
  });
});

describe("prepareChatSubmissionAction - text", () => {
  it("calls requireAppOwner", async () => {
    await prepareChatSubmissionAction(textFormData({ kind: "text", content: "hello" }));
    expect(mockRequireAppOwner).toHaveBeenCalledTimes(1);
  });

  it("builds one entry from text content", async () => {
    const outcome = await prepareChatSubmissionAction(textFormData({ kind: "text", content: "hello", label: "Jane" }));
    expect(outcome.kind).toBe("entries");
    if (outcome.kind === "entries") {
      expect(outcome.entries).toHaveLength(1);
      expect(outcome.entries[0].student).toBe("Jane");
      expect(outcome.pointsPossible).toBeNull();
    }
  });
});

describe("prepareChatSubmissionAction - file", () => {
  it("refuses an unsupported file extension with a named reason, not a graded-as-empty entry", async () => {
    const file = new File(["binary"], "photo.xyz");
    const outcome = await prepareChatSubmissionAction(fileFormData(file));
    expect(outcome.kind).toBe("refused");
    if (outcome.kind === "refused") {
      expect(outcome.reason).toContain("isn't supported");
    }
  });

  it("builds one entry for a supported single file (real classify + build, no mock)", async () => {
    const file = new File(["hello world"], "essay.txt", { type: "text/plain" });
    const outcome = await prepareChatSubmissionAction(fileFormData(file));
    expect(outcome.kind).toBe("entries");
    if (outcome.kind === "entries") {
      expect(outcome.entries).toHaveLength(1);
      expect(outcome.entries[0].content).toContain("hello world");
    }
  });

  // AC-9: the collision refusal thrown from inside extractStudentEntries
  // must surface as a refusal, not a blended row. RED if the catch swallows
  // it into `mode: "whole-run"`-style fallback entries instead.
  it("surfaces extractStudentEntries' collision refusal for a zip upload", async () => {
    mockExtractStudentEntries.mockRejectedValue(new Error('Refused: 2 files resolve to the same student name "X".'));
    const file = new File(["zip bytes"], "submissions.zip", { type: "application/zip" });
    const outcome = await prepareChatSubmissionAction(fileFormData(file));
    expect(outcome.kind).toBe("refused");
    if (outcome.kind === "refused") {
      expect(outcome.reason).toContain("Refused:");
    }
  });

  it("dispatches a non-colliding zip to entries", async () => {
    mockExtractStudentEntries.mockResolvedValue([canvasEntry]);
    const file = new File(["zip bytes"], "submissions.zip", { type: "application/zip" });
    const outcome = await prepareChatSubmissionAction(fileFormData(file));
    expect(outcome.kind).toBe("entries");
    if (outcome.kind === "entries") {
      expect(outcome.entries).toEqual([canvasEntry]);
    }
  });
});

describe("prepareChatSubmissionAction - url", () => {
  // BLOCKER-1 (docs/grading-chat-waves.md section 5, requirement 1): the
  // Canvas branch must carry pointsPossible through to the intake outcome.
  // RED if the field is dropped (outcome.pointsPossible would be null/undefined
  // instead of the mocked 100).
  it("threads Canvas pointsPossible through the intake outcome", async () => {
    mockDetectCanvasUrlKind.mockReturnValue("assignment");
    mockExtractCanvasEntries.mockResolvedValue({ entries: [canvasEntry], pointsPossible: 100 });
    const outcome = await prepareChatSubmissionAction(textFormData({ kind: "url", url: "https://canvas.example.edu/courses/1/assignments/2" }));
    expect(outcome.kind).toBe("entries");
    if (outcome.kind === "entries") {
      expect(outcome.pointsPossible).toBe(100);
      expect(outcome.entries).toEqual([canvasEntry]);
    }
  });

  it("builds one entry from a GitHub repo URL", async () => {
    mockDetectCanvasUrlKind.mockReturnValue(null);
    mockFetchGradableRepoContent.mockResolvedValue({
      repo: "owner/repo",
      ref: "abc123",
      content: "File: a.ts\n\nconst x = 1;",
      fileCount: 1,
      truncated: false,
      files: [{ path: "a.ts", text: "const x = 1;", truncated: false }],
    });
    const outcome = await prepareChatSubmissionAction(textFormData({ kind: "url", url: "https://github.com/owner/repo" }));
    expect(outcome.kind).toBe("entries");
    if (outcome.kind === "entries") {
      expect(outcome.entries).toHaveLength(1);
      expect(outcome.entries[0].student).toBe("owner/repo");
      expect(outcome.entries[0].gradedRepo).toBe("owner/repo");
      expect(outcome.entries[0].gradedRef).toBe("abc123");
      expect(outcome.pointsPossible).toBeNull();
    }
  });

  it("refuses a GitHub URL fetch failure with a named reason", async () => {
    mockDetectCanvasUrlKind.mockReturnValue(null);
    mockFetchGradableRepoContent.mockResolvedValue({ error: "could not find it" });
    const outcome = await prepareChatSubmissionAction(textFormData({ kind: "url", url: "https://github.com/owner/repo" }));
    expect(outcome.kind).toBe("refused");
  });

  // AC-10: an arbitrary (non-Canvas, non-GitHub) URL is refused with a named
  // reason, never grabbed and sent to the model.
  it("refuses an arbitrary URL that is neither Canvas nor GitHub", async () => {
    mockDetectCanvasUrlKind.mockReturnValue(null);
    const outcome = await prepareChatSubmissionAction(textFormData({ kind: "url", url: "https://example.com/random-page" }));
    expect(outcome.kind).toBe("refused");
    if (outcome.kind === "refused") {
      expect(outcome.reason).toContain("Canvas");
      expect(outcome.reason).toContain("GitHub");
    }
    expect(mockFetchGradableRepoContent).not.toHaveBeenCalled();
  });
});
