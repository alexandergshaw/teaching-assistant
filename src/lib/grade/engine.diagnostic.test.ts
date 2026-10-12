import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Chat-grading diagnostics WA (docs/chat-grading-detailed-diagnostics-scope.md
// AC-1, AC-2, P3). The model seam is mocked at callLlm; the REAL
// normalizeGeminiError and classifyChatSeamFailure run, so the byte-identical
// message claim is checked against the production text classifier too.

vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 100000,
  getGeminiMaxOutputTokens: () => 700,
  getGeminiMaxSubmissions: () => 5,
}));
vi.mock("../llm", () => ({ callLlm: vi.fn() }));
vi.mock("../code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
vi.mock("./repo-content", () => ({ fetchGradableRepoContent: vi.fn() }));

import { callLlm } from "../llm";
import { gradeEntries } from "./engine";
import { canvasWorkToEntry } from "./extraction";
import { createGradeCallSink } from "./grade-item-diagnostic";
import { GRADE_FAILURE_CLASSES, GradeCallError, type GradeFailureClass } from "./grade-failure";
import { GRADING_FAILURE_PREFIX, type StudentSubmissionEntry } from "./types";
import { classifyChatSeamFailure } from "../../app/components/grading-chat/chatSeamDiagnostic";
import type { CanvasStudentWork, DiscussionPost } from "../canvas/discussions";

const mockCallLlm = vi.mocked(callLlm);

const RUBRIC = "Clarity (10 pts): is the writing clear?";
const VALID_JSON = JSON.stringify({
  overallComment: "Solid.",
  rubricResults: [{ area: "Clarity", score: "8/10" }],
  totalScore: "8/10",
});

function entry(): StudentSubmissionEntry {
  return { student: "Student", content: "some submission text", mergedFileCount: 1, submittedFiles: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

type Outcome = Awaited<ReturnType<typeof callLlm>>;

// FROZEN LITERAL table: the expected message and class come from here, never
// from the generator under test.
const TABLE: ReadonlyArray<{ name: string; llm: Outcome; message: string; failureClass: GradeFailureClass }> = [
  {
    name: "400",
    llm: { ok: false, status: 400, body: "not json" },
    message:
      'Gemini rejected the request (400). This usually means instructions, rubric, or submission text are too long or contain unsupported content. Gemini said: "not json"',
    failureClass: "model rejected request",
  },
  {
    name: "429",
    llm: { ok: false, status: 429, body: "" },
    message:
      "Gemini quota exceeded for this project. Reduce run size, wait for quota reset, enable billing, or switch providers (for example Groq).",
    failureClass: "model quota",
  },
  {
    name: "404",
    llm: { ok: false, status: 404, body: "this model is no longer available" },
    message:
      "The configured Gemini model is not available for this account. Set GEMINI_MODEL to a current model such as gemini-3.1-flash-lite and try again.",
    failureClass: "model unavailable",
  },
  {
    name: "503",
    llm: { ok: false, status: 503, body: JSON.stringify({ error: { message: "overloaded" } }) },
    message: "Gemini request failed (503): overloaded",
    failureClass: "model service error",
  },
  {
    name: "status 0",
    llm: { ok: false, status: 0, body: JSON.stringify({ error: { message: "fetch failed" } }) },
    message: "Gemini request failed (0): fetch failed",
    failureClass: "model unreachable",
  },
  {
    name: "MAX_TOKENS",
    llm: { ok: true, text: VALID_JSON, finishReason: "MAX_TOKENS" },
    message: "The model's response was cut off or blocked before it finished (MAX_TOKENS), so it was not graded.",
    failureClass: "model cut off",
  },
  {
    name: "SAFETY",
    llm: { ok: true, text: VALID_JSON, finishReason: "SAFETY" },
    message: "The model's response was cut off or blocked before it finished (SAFETY), so it was not graded.",
    failureClass: "model stopped early",
  },
  {
    name: "not json",
    llm: { ok: true, text: "not json", finishReason: "STOP" },
    message: "The model's response was not valid grading JSON, so it was not graded.",
    failureClass: "model unparseable",
  },
];

describe("AC-1 typed failure at the throw site, messages byte-identical", () => {
  for (const row of TABLE) {
    it(`${row.name}: message and class`, async () => {
      mockCallLlm.mockResolvedValueOnce(row.llm);
      const sink = createGradeCallSink();
      const run = await gradeEntries([entry()], "do it", RUBRIC, "gemini", null, { callSink: sink });
      const ungraded = run.results[0].ungraded;
      expect(ungraded?.kind).toBe("grading-failed");
      expect(ungraded?.message).toBe(`${GRADING_FAILURE_PREFIX}${row.message}`);
      expect(sink.failure).toBe(row.failureClass);
      // The prose classifier still classifies the same text the typed error carries.
      // classifyChatSeamFailure reads message text only, so the typed error and
      // a plain Error with the same text classify identically.
      expect(classifyChatSeamFailure(new GradeCallError(row.message, row.failureClass))).toBe(
        classifyChatSeamFailure(new Error(row.message))
      );
      expect(classifyChatSeamFailure(new Error(ungraded?.message ?? ""))).toBe(classifyChatSeamFailure(new Error(`${GRADING_FAILURE_PREFIX}${row.message}`)));
    });
  }

  it("the classes in the table are distinct members, none unclassified", () => {
    const classes = TABLE.map((r) => r.failureClass);
    expect(new Set(classes).size).toBe(classes.length);
    expect(classes).not.toContain("unclassified");
    for (const c of classes) expect(GRADE_FAILURE_CLASSES).toContain(c);
  });

  it("a plain Error from inside the grade path is unclassified", async () => {
    mockCallLlm.mockRejectedValueOnce(new Error("boom"));
    const sink = createGradeCallSink();
    await gradeEntries([entry()], "do it", RUBRIC, "gemini", null, { callSink: sink });
    expect(sink.failure).toBe("unclassified");
  });

  it("a successful grade leaves the failure unset", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: VALID_JSON });
    const sink = createGradeCallSink();
    const run = await gradeEntries([entry()], "do it", RUBRIC, "gemini", null, { callSink: sink });
    expect(run.results[0].ungraded).toBeUndefined();
    expect(sink.failure).toBeUndefined();
  });

  it("the typed error carries its class and the literal messages remain in engine.ts (P3)", () => {
    const err = new GradeCallError("m", "model quota");
    expect(err.failureClass).toBe("model quota");
    expect(err).toBeInstanceOf(Error);
    const src = readFileSync(join(process.cwd(), "src/lib/grade/engine.ts"), "utf8");
    expect(src).toContain("cut off or blocked before it finished");
    expect(src).toContain("not valid grading JSON");
  });

  it("a run without a sink is unchanged", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: false, status: 429, body: "" });
    const run = await gradeEntries([entry()], "do it", RUBRIC, "gemini", null, {});
    expect(run.results[0].ungraded?.kind).toBe("grading-failed");
  });
});

describe("AC-2 usage and timing captured", () => {
  it("records exactly the reported numbers for one call", async () => {
    mockCallLlm.mockResolvedValueOnce({
      ok: true,
      text: VALID_JSON,
      usage: { promptTokenCount: 1200, candidatesTokenCount: 340, totalTokenCount: 1540 },
      elapsedMs: 2100,
      finishReason: "STOP",
    });
    const sink = createGradeCallSink();
    await gradeEntries([entry()], "do it", RUBRIC, "gemini", null, { callSink: sink });
    expect(sink.calls).toEqual([{ finishReason: "STOP", promptTokens: 1200, outputTokens: 340, elapsedMs: 2100 }]);
  });

  it("absent usage stays absent (not 0)", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: VALID_JSON });
    const sink = createGradeCallSink();
    await gradeEntries([entry()], "do it", RUBRIC, "gemini", null, { callSink: sink });
    expect(sink.calls).toHaveLength(1);
    expect(sink.calls[0].promptTokens).toBeUndefined();
    expect(sink.calls[0].outputTokens).toBeUndefined();
  });

  it("a failed call is recorded with its status", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: false, status: 429, body: "" });
    const sink = createGradeCallSink();
    await gradeEntries([entry()], "do it", RUBRIC, "gemini", null, { callSink: sink });
    expect(sink.calls).toEqual([{ status: 429 }]);
  });
});

// Two-axis discussion fixtures (duplicated from the oracle test setup, not imported).
const MARKER_RUBRIC = ["Thesis (20 pts): clear", "Reply section:", "Engagement (10 pts): replies engage classmates"].join("\n");

function post(text: string): DiscussionPost {
  return { text, createdAt: null, isReply: false, parentUserId: null };
}
function reply(text: string): DiscussionPost {
  return { text, createdAt: null, isReply: true, parentUserId: 1, parentName: "Pat" };
}
async function discussionEntry(replyCount: number): Promise<StudentSubmissionEntry> {
  const work: CanvasStudentWork = {
    student: "Disc Student",
    userId: 7,
    text: "flat",
    files: [],
    contributionCount: 1 + replyCount,
    discussion: {
      initialPosts: [post("my thesis")],
      replies: Array.from({ length: replyCount }, (_, i) => reply(`reply ${i + 1}`)),
    },
  };
  return canvasWorkToEntry(work);
}
function axisJson(area: string, score: string): string {
  return JSON.stringify({ overallComment: "Solid.", rubricResults: [{ area, score }], totalScore: "99/99" });
}

describe("AC-2 two passes and the no-model-call path", () => {
  it("a discussion with a reply section makes 2 calls and sums tokens", async () => {
    mockCallLlm
      .mockResolvedValueOnce({ ok: true, text: axisJson("Thesis", "15/20"), usage: { promptTokenCount: 100, candidatesTokenCount: 10 }, elapsedMs: 1000 })
      .mockResolvedValueOnce({ ok: true, text: axisJson("Engagement", "7/10"), usage: { promptTokenCount: 50, candidatesTokenCount: 5 }, elapsedMs: 500 });
    const sink = createGradeCallSink();
    await gradeEntries([await discussionEntry(2)], "do it", MARKER_RUBRIC, "gemini", null, { callSink: sink });
    expect(sink.calls).toHaveLength(2);
    expect(sink.calls.reduce((n, c) => n + (c.promptTokens ?? 0), 0)).toBe(150);
    expect(sink.calls.reduce((n, c) => n + (c.outputTokens ?? 0), 0)).toBe(15);
  });

  it("a reply section with zero replies makes 1 call, not 2", async () => {
    mockCallLlm.mockResolvedValueOnce({ ok: true, text: axisJson("Thesis", "15/20"), elapsedMs: 10 });
    const sink = createGradeCallSink();
    await gradeEntries([await discussionEntry(0)], "do it", MARKER_RUBRIC, "gemini", null, { callSink: sink });
    expect(sink.calls).toHaveLength(1);
  });
});
