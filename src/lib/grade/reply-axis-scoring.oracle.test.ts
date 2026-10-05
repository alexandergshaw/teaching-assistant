import { describe, it, expect, vi, beforeEach } from "vitest";

// A8 Wave B oracles (docs/a8-scoring-architecture.md 3.5, 4.3, 6.2, 7;
// docs/a8-scoring-waves.md section 2). Every assertion here is on what the
// model RECEIVES (the composed request text) or on the code-composed result,
// never on model obedience (AC-R8, an owner residual).
//
// Sabotage that turns each oracle red (each was run, watched red, restored):
//  - AC-R2b: use initialAxisPrompt instead of singleAxisPrompt for the
//    `discussionAxes === undefined` branch in engine.ts.
//  - AC-R2c: pass an axisScope other than "all" (or drop the commentSplit
//    pair) on the singleAxisPrompt build.
//  - cross-route NO-OP: gate the disclosure on `replyAxisPrompt === null`
//    alone (rubric shape) instead of on discussionAxes being present.
//  - code-held exclusion sentinel: send axes.replyContent (or entry.content)
//    to the initial-axis scoreAxis call.
//  - two-axis merge: trust the model total instead of deriveTotalScore("").

vi.mock("../gemini", () => ({
  getGeminiInterRequestDelayMs: () => 0,
  getGeminiMaxCharsPerSubmission: () => 100000,
  getGeminiMaxOutputTokens: () => 700,
  getGeminiMaxSubmissions: () => 5,
}));

vi.mock("../llm", () => ({
  callLlm: vi.fn(),
}));

vi.mock("../code-runner", () => ({
  runSubmittedCode: vi.fn(async () => null),
}));

vi.mock("./repo-content", () => ({
  fetchGradableRepoContent: vi.fn(),
}));

import { callLlm } from "../llm";
import { gradeEntries } from "./engine";
import { canvasWorkToEntry } from "./extraction";
import { buildSystemPrompt, composeReplyExclusionDisclosure } from "./prompts";
import { extractRubricCriteria } from "./rubric";
import type { CanvasStudentWork, DiscussionPost } from "../canvas/discussions";
import type { StudentSubmissionEntry } from "./types";

const mockCallLlm = vi.mocked(callLlm);

const INSTRUCTIONS = "Post once and reply to two classmates.";
const MARKER_RUBRIC = [
  "Thesis (20 pts): clear",
  "Reply section:",
  "Engagement (10 pts): replies engage classmates",
].join("\n");
const PLAIN_RUBRIC = "Thesis (20 pts): clear\nStyle (10 pts): readable";

const INITIAL_SENTINEL = "INITIALPOSTSENTINEL";
const REPLY_SENTINEL = "ZQXREPLYONLYSENTINEL";

function post(text: string): DiscussionPost {
  return { text, createdAt: null, isReply: false, parentUserId: null };
}
function reply(text: string): DiscussionPost {
  return { text, createdAt: null, isReply: true, parentUserId: 1, parentName: "Pat" };
}

async function discussionEntry(replyCount: number): Promise<StudentSubmissionEntry> {
  const replies = Array.from({ length: replyCount }, (_, i) => reply(`${REPLY_SENTINEL} number ${i + 1}`));
  const work: CanvasStudentWork = {
    student: "Disc Student",
    userId: 7,
    text: "flat",
    files: [],
    contributionCount: 1 + replyCount,
    discussion: { initialPosts: [post(`${INITIAL_SENTINEL} my thesis`)], replies },
  };
  return canvasWorkToEntry(work);
}

function zipEntry(): StudentSubmissionEntry {
  return {
    student: "Zip Student",
    content: `plain submission ${REPLY_SENTINEL}`,
    mergedFileCount: 1,
    submittedFiles: [],
  };
}

function requestText(callIndex: number): string {
  const arg = mockCallLlm.mock.calls[callIndex][0];
  const first = arg.contents[0].parts[0];
  return "text" in first ? first.text : "";
}

function respond(area: string, score: string): string {
  return JSON.stringify({
    overallComment: "Solid.",
    rubricResults: [{ area, score }],
    totalScore: "99/99",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCallLlm.mockImplementation(async (req) => {
    const first = req.contents[0].parts[0];
    const text = "text" in first ? first.text : "";
    if (text.includes("SCOPE OF THIS EVALUATION (replies only)")) {
      return { ok: true, text: respond("Engagement", "7/10") };
    }
    return { ok: true, text: respond("Thesis", "15/20") };
  });
});

describe("AC-R2b - a non-discussion entry scores ALL criteria even against a reply-section rubric", () => {
  it("uses the single-axis prompt: reply criterion listed, no scope-out directive", async () => {
    await gradeEntries([zipEntry()], INSTRUCTIONS, MARKER_RUBRIC, "gemini");
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
    const text = requestText(0);
    expect(text).toContain("- Thesis (out of 20)");
    expect(text).toContain("- Engagement (out of 10)");
    expect(text).not.toContain("SCOPE OF THIS EVALUATION");
    // The full content (here containing the sentinel) is scored as one axis.
    expect(text).toContain(REPLY_SENTINEL);
  });
});

describe("AC-R2c - the single-axis prompt is byte-identical to the pre-feature call", () => {
  it("matches buildSystemPrompt over ALL criteria for commentSplit false", async () => {
    await gradeEntries([zipEntry()], INSTRUCTIONS, MARKER_RUBRIC, "gemini");
    const expected = buildSystemPrompt(INSTRUCTIONS, MARKER_RUBRIC, extractRubricCriteria(MARKER_RUBRIC));
    expect(requestText(0).startsWith(`${expected}\n\nStudent: Zip Student`)).toBe(true);
  });

  it("matches the separate-strengths call for commentSplit true", async () => {
    await gradeEntries([zipEntry()], INSTRUCTIONS, MARKER_RUBRIC, "gemini", null, { commentSplit: true });
    const expected = buildSystemPrompt(
      INSTRUCTIONS,
      MARKER_RUBRIC,
      extractRubricCriteria(MARKER_RUBRIC),
      "some",
      "separate-strengths"
    );
    expect(requestText(0).startsWith(`${expected}\n\nStudent: Zip Student`)).toBe(true);
  });

  it("axisScope 'all' is byte-identical to omitting it, and non-'all' appends a directive", () => {
    const criteria = extractRubricCriteria(MARKER_RUBRIC);
    const omitted = buildSystemPrompt(INSTRUCTIONS, MARKER_RUBRIC, criteria);
    expect(buildSystemPrompt(INSTRUCTIONS, MARKER_RUBRIC, criteria, "some", "in-overall-comment", "all")).toBe(omitted);
    expect(omitted).not.toContain("SCOPE OF THIS EVALUATION");
    const initialOnly = buildSystemPrompt(INSTRUCTIONS, MARKER_RUBRIC, criteria, "some", "in-overall-comment", "initial-post-only");
    expect(initialOnly.startsWith(omitted)).toBe(true);
    expect(initialOnly).toContain("SCOPE OF THIS EVALUATION (initial post only)");
    expect(initialOnly).toContain("Do not require, expect, or deduct for replies to classmates");
    const replyOnly = buildSystemPrompt(INSTRUCTIONS, MARKER_RUBRIC, criteria, "some", "in-overall-comment", "reply-only");
    expect(replyOnly).toContain("SCOPE OF THIS EVALUATION (replies only)");
  });
});

describe("cross-route NO-OP - no disclosure without structured replies (NOTE C)", () => {
  it.each([
    ["a plain rubric", PLAIN_RUBRIC],
    ["a reply-section rubric", MARKER_RUBRIC],
  ])("a zip-shaped entry against %s carries no replies-excluded disclosure", async (_label, rubric) => {
    const run = await gradeEntries([zipEntry()], INSTRUCTIONS, rubric, "gemini");
    const row = run.results[0];
    expect(row.ungraded).toBeUndefined();
    expect(row.feedback).not.toContain("not scored because the rubric has no reply section");
    expect(row.overallComment).not.toContain("classmates, which");
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
  });
});

describe("disclosure wording is a frozen literal", () => {
  it("composes from the integer count only", () => {
    expect(composeReplyExclusionDisclosure(1)).toBe(
      "Note: this student also posted 1 reply to classmates, which was not scored because the rubric has no reply section."
    );
    expect(composeReplyExclusionDisclosure(3)).toBe(
      "Note: this student also posted 3 replies to classmates, which were not scored because the rubric has no reply section."
    );
  });
});

describe("code-held exclusion - discussion entry, rubric with NO reply section", () => {
  it("never sends reply prose to the model, scopes the prompt, and discloses the exclusion", async () => {
    const entry = await discussionEntry(2);
    const run = await gradeEntries([entry], INSTRUCTIONS, PLAIN_RUBRIC, "gemini");
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
    const text = requestText(0);
    // The sentinel planted ONLY in reply text must be absent from the request.
    expect(text).not.toContain(REPLY_SENTINEL);
    expect(text).toContain(INITIAL_SENTINEL);
    expect(text).toContain("SCOPE OF THIS EVALUATION (initial post only)");
    const row = run.results[0];
    expect(row.overallComment).toContain(composeReplyExclusionDisclosure(2));
    expect(row.feedback).toContain(composeReplyExclusionDisclosure(2));
  });

  it("a discussion entry with zero replies is not given a disclosure", async () => {
    const entry = await discussionEntry(0);
    const run = await gradeEntries([entry], INSTRUCTIONS, PLAIN_RUBRIC, "gemini");
    expect(run.results[0].overallComment).not.toContain("not scored because");
  });
});

describe("two-axis scoring - discussion entry, rubric WITH a reply section", () => {
  it("scores initial and reply axes in separate requests and sums the areas by code", async () => {
    const entry = await discussionEntry(2);
    const run = await gradeEntries([entry], INSTRUCTIONS, MARKER_RUBRIC, "gemini");
    expect(mockCallLlm).toHaveBeenCalledTimes(2);

    const initialReq = requestText(0);
    expect(initialReq).toContain("- Thesis (out of 20)");
    expect(initialReq).not.toContain("- Engagement (out of 10)");
    expect(initialReq).not.toContain(REPLY_SENTINEL);
    expect(initialReq).toContain(INITIAL_SENTINEL);

    const replyReq = requestText(1);
    expect(replyReq).toContain("- Engagement (out of 10)");
    expect(replyReq).not.toContain("- Thesis (out of 20)");
    expect(replyReq).toContain(REPLY_SENTINEL);
    expect(replyReq).not.toContain(INITIAL_SENTINEL);

    const row = run.results[0];
    expect(row.ungraded).toBeUndefined();
    expect(row.rubricAreas.map((a) => a.area).sort()).toEqual(["Engagement", "Thesis"]);
    // The model's own "99/99" total is overridden by the code sum 15+7 / 20+10.
    expect(row.totalScore).toBe("22/30");
    expect(row.overallComment).not.toContain("not scored because");
  });

  it("with a reply section but zero replies, makes no reply call and posts a code-composed zero", async () => {
    const entry = await discussionEntry(0);
    const run = await gradeEntries([entry], INSTRUCTIONS, MARKER_RUBRIC, "gemini");
    expect(mockCallLlm).toHaveBeenCalledTimes(1);
    const row = run.results[0];
    const engagement = row.rubricAreas.find((a) => a.area === "Engagement");
    expect(engagement?.score).toBe("0/10");
    expect(row.totalScore).toBe("15/30");
  });

  it("a failed reply pass fails the whole student, not a half grade (RS-2)", async () => {
    mockCallLlm.mockReset();
    mockCallLlm
      .mockResolvedValueOnce({ ok: true, text: respond("Thesis", "15/20") })
      .mockResolvedValueOnce({ ok: false, status: 500, body: "boom" });
    const entry = await discussionEntry(1);
    const run = await gradeEntries([entry], INSTRUCTIONS, MARKER_RUBRIC, "gemini");
    expect(run.results[0].ungraded?.kind).toBe("grading-failed");
  });
});

describe("canvasWorkToEntry - discussionAxes population", () => {
  it("fills the per-axis slices and leaves content untouched", async () => {
    const entry = await discussionEntry(2);
    const axes = entry.discussionAxes;
    expect(axes).toBeDefined();
    expect(axes?.replyCount).toBe(2);
    expect(axes?.initialPostContent).toContain(INITIAL_SENTINEL);
    expect(axes?.initialPostContent).not.toContain(REPLY_SENTINEL);
    expect(axes?.replyContent).toContain(REPLY_SENTINEL);
    expect(entry.content).toContain("=== INITIAL POST ===");
    expect(entry.content).toContain("=== REPLIES TO CLASSMATES ===");
  });

  it("leaves replyContent empty when there are no replies", async () => {
    const entry = await discussionEntry(0);
    expect(entry.discussionAxes?.replyContent).toBe("");
    expect(entry.discussionAxes?.replyCount).toBe(0);
  });
});
