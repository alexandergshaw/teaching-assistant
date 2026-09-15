import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// generateAssignmentAction only calls callLlm (no auth, no DB) for a
// non-embedded provider, so only callLlm needs mocking to exercise the real
// prompt-building logic - same pattern as shared.test.ts.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateAssignmentAction, askAboutCourseAction } from "./llm-content";
import { courseKindContract, APPLIED_REAL_TOOL_RULE } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { ASK_AI_CLOSED_LIST_QUESTIONS, SCHEDULE_ANSWER_MARKER, normalizeAskAiQuestion } from "@/lib/week-numbering";
import fs from "node:fs";
import path from "node:path";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const VALID_ASSIGNMENT_JSON = JSON.stringify({
  title: "Assignment",
  overview: "Overview",
  steps: [{ stepTitle: "Step 1", description: "Do the thing" }],
  tools: ["Tool"],
  deliverables: ["Deliverable"],
});

describe("generateAssignmentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: VALID_ASSIGNMENT_JSON,
    } as never);
  });

  // AC1: the applied branch used to be a pure negative ("do not list
  // programming languages...") plus category hints ("boards, planners") -
  // never a requirement to actually NAME a product. It now reuses the deck's
  // "REAL PROFESSIONAL TOOLS" rule verbatim via APPLIED_REAL_TOOL_RULE.
  describe("applied tool rule (AC1)", () => {
    it("requires a named real tool and the free-access statement", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      const prompt = promptFromCall();
      expect(prompt).toContain(APPLIED_REAL_TOOL_RULE);
      expect(prompt).toContain("name a REAL, widely used tool");
      expect(prompt).toContain("never invent a product");
      expect(prompt.toLowerCase()).toContain("free tier");
      expect(prompt.toLowerCase()).toContain("free trial");
      expect(prompt.toLowerCase()).toContain("community edition");
      expect(prompt.toLowerCase()).toContain("spreadsheet equivalent");
    });

    it("keeps the no-code prohibition intact", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      const prompt = promptFromCall();
      expect(prompt).toContain("Do not list programming languages, IDEs, or developer platforms.");
    });

    it("never lets an applied course fall back to the coding tool examples", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      const prompt = promptFromCall();
      expect(prompt).not.toContain("Google Colab");
      expect(prompt).not.toContain("Replit");
    });
  });

  // AC2: an optional pre-selected tool hint, mirroring
  // generateAssignmentInstructionsForAssignment's requiredTools parameter
  // (shared.ts).
  describe("requiredTools hint (AC2)", () => {
    it("an absent hint (the default) still produces a valid applied prompt with no tool-lock sentence", async () => {
      const result = await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied");

      expect("error" in result).toBe(false);
      const prompt = promptFromCall();
      expect(prompt).not.toContain("already decided");
    });

    it("a supplied hint appears in the prompt and instructs the model to build on it", async () => {
      await generateAssignmentAction("Objectives", "Context", [], "gemini", "applied", "Trello (free plan)");

      const prompt = promptFromCall();
      expect(prompt).toContain("already decided");
      expect(prompt).toContain("Trello (free plan)");
      expect(prompt).toContain("Default to using ONLY these committed tool(s)");
    });
  });

  // AC4: the coding branch must be completely unaffected by this feature -
  // same text as before, and a requiredTools hint must never reach it.
  describe("coding course is unaffected (AC4)", () => {
    // Reconstructed from the SAME building blocks the function itself
    // composes with (courseKindContract, PLAIN_LANGUAGE_CONTRACT) rather than
    // a hand-typed duplicate, so this pins the coding TEMPLATE shape - the
    // thing AC1/AC2 touched only on the applied side - without also pinning
    // unrelated constants that are free to change for their own reasons.
    function expectedCodingPrompt(moduleObjectives: string, contextText: string): string {
      return `You are an expert educator designing a hands-on, industry-simulating assignment.

${courseKindContract("coding")}

MODULE OBJECTIVES:
${moduleObjectives}

CONTEXT:
${contextText}

Design a practical assignment that simulates real industry workflows and that students can complete entirely for free. Return ONLY valid JSON:
{
  "title": "...",
  "overview": "...",
  "steps": [
    { "stepTitle": "...", "description": "..." }
  ],
  "tools": ["..."],
  "deliverables": ["..."]
}

Requirements:
- Simulate authentic challenges students will face on the job.
- Every tool listed must be free and accessible, and must be a tool practitioners in THIS field actually use. For a programming course that means things like Python, VS Code, Google Colab, GitHub, or Replit.
- 4–8 concrete, sequential steps that a student can complete working alone.
- Tie every step clearly to the module objectives.
- Deliverables should be specific and assessable.
- ${PLAIN_LANGUAGE_CONTRACT}
- Do not include any text outside the JSON object.`;
    }

    it("the prompt is byte-identical to the pre-existing template with no hint", async () => {
      await generateAssignmentAction("Objectives here", "Context here", [], "gemini", "coding");

      const prompt = promptFromCall();
      expect(prompt).toBe(expectedCodingPrompt("Objectives here", "Context here"));
    });

    it("a requiredTools hint has zero effect on the coding prompt", async () => {
      await generateAssignmentAction(
        "Objectives here",
        "Context here",
        [],
        "gemini",
        "coding",
        "Trello (free plan)"
      );

      const prompt = promptFromCall();
      expect(prompt).toBe(expectedCodingPrompt("Objectives here", "Context here"));
      expect(prompt).not.toContain("Trello");
      expect(prompt).not.toContain("already decided");
    });

    it("defaults to coding when courseKind is omitted, unaffected by this feature", async () => {
      await generateAssignmentAction("Objectives here", "Context here", []);

      const prompt = promptFromCall();
      expect(prompt).toBe(expectedCodingPrompt("Objectives here", "Context here"));
    });
  });
});

// askAboutCourseAction: a closed list of schedule-arithmetic questions is
// answered from a value computed in TypeScript from the course's own
// startDate/endDate/weeks, with NO model call - the leverage class is
// GUARANTEED (docs/loop/leverage.md): the property holds regardless of what
// the model would have returned. Per Ruling A2-2, the closed list below is
// written out as LITERAL array elements, never imported from and iterated
// over the production list - an emptied or renamed production list would
// otherwise make the loop run zero times and report green while asserting
// nothing.
describe("askAboutCourseAction", () => {
  const validDates = { startDate: "2026-08-24", endDate: "2026-12-15", weeks: 15 };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      text: "a model-generated answer",
    });
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-LEV-1, the removal test. Object under comparison: callLlm's mock call
  // count across two calls - one matched-shape, one unmatched. BOTH arms are
  // required, not just the matched one: a fixture that accidentally passed
  // provider "embedded" would make BOTH arms report 0 (the embedded branch
  // returns before callLlm is ever reached, for any question), so only the
  // unmatched arm's assertion of exactly 1 catches that confound. Do not
  // "simplify" this to a single assertion - the pairing is load-bearing.
  it("AC-LEV-1: calls callLlm zero times for a matched-shape question, exactly once for an unmatched one", async () => {
    await askAboutCourseAction("facts", "What week are we in?", validDates, "gemini");
    expect(vi.mocked(callLlm).mock.calls.length).toBe(0);

    await askAboutCourseAction(
      "facts",
      "Suggest three assessments that fit this schedule.",
      validDates,
      "gemini"
    );
    expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
  });

  // AC-ORDER-2. The deterministic match must run BEFORE the provider === "embedded"
  // dispatch (llm-content.ts), because that branch's "No model is configured, so
  // this question was not answered" text would be a FALSE statement for a
  // matched-shape question the app can answer with no model at all.
  it("AC-ORDER-2: a matched-shape question under the embedded provider returns the computed answer, not the 'not answered' echo", async () => {
    const now = Date.parse("2026-08-24") + 20 * 86_400_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    let result: Awaited<ReturnType<typeof askAboutCourseAction>>;
    try {
      result = await askAboutCourseAction(
        "facts",
        "What week are we in?",
        { startDate: "2026-08-24", endDate: "2026-12-15", weeks: 15 },
        "embedded"
      );
    } finally {
      vi.useRealTimers();
    }
    expect("answer" in result).toBe(true);
    if ("answer" in result) {
      expect(result.answer).not.toContain("not answered");
      expect(result.answer).toContain("3");
    }
    expect(vi.mocked(callLlm).mock.calls.length).toBe(0);
  });

  describe("AC-SHAPE-1: closed-list membership, exact match only", () => {
    const CLOSED_LIST_LITERAL = [
      "what week are we in",
      "what week is it",
      "what week is this",
      "what week of the course are we in",
      "how many days until the term ends",
      "how many days until the course ends",
      "how many days are left in the term",
      "how many days are left in the course",
      "how many weeks are left",
      "how many weeks are left in the course",
      "how many weeks are left in the term",
      "when does the term end",
      "when does the course end",
      "is the course over",
      "has the course ended",
      "has the term ended",
    ];
    const NEAR_MISSES = [
      "what week should I move the midterm to",
      "how many students are left in the course",
    ];

    it.each(CLOSED_LIST_LITERAL)("matches closed-list question %j with zero callLlm calls", async (question) => {
      const now = Date.parse("2026-08-24") + 20 * 86_400_000;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      try {
        await askAboutCourseAction("facts", question, validDates, "gemini");
      } finally {
        vi.useRealTimers();
      }
      expect(vi.mocked(callLlm).mock.calls.length).toBe(0);
    });

    it.each(NEAR_MISSES)("falls through to the model for near-miss %j", async (question) => {
      await askAboutCourseAction("facts", question, validDates, "gemini");
      expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
    });
  });

  // AC-VALUE-1..4: hand-computed frozen literals, reusing the exact boundary
  // fixtures week-numbering.test.ts already asserts for currentCourseWeek.
  // AC-SHAPE-1 alone would let an answer reading "week 0" pass every gate
  // while being wrong - these pin the actual computed value.
  describe("AC-VALUE: the computed value is correct, not just present", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("AC-VALUE-1: in-progress week 3 (day 20 of a 15-week course)", async () => {
      const now = Date.parse("2026-08-24") + 20 * 86_400_000;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const result = await askAboutCourseAction(
        "facts",
        "What week are we in?",
        { startDate: "2026-08-24", endDate: null, weeks: 15 },
        "gemini"
      );
      expect("answer" in result && result.answer).toContain("week 3");
    });

    it("AC-VALUE-2: not-started (day -1) never reads 'week 0'", async () => {
      const now = Date.parse("2026-08-24") - 1 * 86_400_000;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const result = await askAboutCourseAction(
        "facts",
        "What week are we in?",
        { startDate: "2026-08-24", endDate: null, weeks: 15 },
        "gemini"
      );
      const answer = "answer" in result ? result.answer : "";
      expect(answer).not.toContain("week 0");
      expect(answer.toLowerCase()).toContain("not started");
    });

    it("AC-VALUE-3: complete (raw week 21 of a 3-week course) never states week 21", async () => {
      const now = Date.parse("2026-08-24") + 7 * 20 * 86_400_000;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const result = await askAboutCourseAction(
        "facts",
        "What week are we in?",
        { startDate: "2026-08-24", endDate: null, weeks: 3 },
        "gemini"
      );
      const answer = "answer" in result ? result.answer : "";
      expect(answer).not.toContain("week 21");
    });

    it("AC-VALUE-4: term-end days-left = 10, Date.parse/epoch-ms/Math.floor convention", async () => {
      const now = Date.parse("2026-12-05");
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const result = await askAboutCourseAction(
        "facts",
        "How many days until the term ends?",
        { startDate: null, endDate: "2026-12-15", weeks: null },
        "gemini"
      );
      expect("answer" in result && result.answer).toContain("10");
    });
  });

  // AC-SHAPE-2, extended per Ruling A2-2 to the three states revision 1
  // missed: missing, unparseable, and internally inconsistent (end before
  // start) dates. A matched-shape question must fall through to the model
  // in every one of these states, never render "week null" or "NaN days".
  describe("AC-SHAPE-2: data-missing and data-inconsistent fallback", () => {
    it("(a) startDate null on a current-week question falls through", async () => {
      await askAboutCourseAction(
        "facts",
        "What week are we in?",
        { startDate: null, endDate: "2026-12-15", weeks: 15 },
        "gemini"
      );
      expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
    });

    it("(b) unparseable startDate on a current-week question falls through", async () => {
      await askAboutCourseAction(
        "facts",
        "What week are we in?",
        { startDate: "not-a-date", endDate: "2026-12-15", weeks: 15 },
        "gemini"
      );
      expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
    });

    it("(c) endDate null on a term-end question falls through", async () => {
      await askAboutCourseAction(
        "facts",
        "How many days until the term ends?",
        { startDate: "2026-08-24", endDate: null, weeks: 15 },
        "gemini"
      );
      expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
    });

    it("(d) unparseable endDate on a term-end question falls through", async () => {
      await askAboutCourseAction(
        "facts",
        "How many days until the term ends?",
        { startDate: "2026-08-24", endDate: "not-a-date", weeks: 15 },
        "gemini"
      );
      expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
    });

    it("(e) end before start (inconsistent record) on a term-end question falls through", async () => {
      await askAboutCourseAction(
        "facts",
        "How many days until the term ends?",
        { startDate: "2026-08-24", endDate: "2026-08-01", weeks: 15 },
        "gemini"
      );
      expect(vi.mocked(callLlm).mock.calls.length).toBe(1);
    });
  });

  // AC-UX-1. The marker is the SAME literal on the production and test side
  // (imported here, never an internal-only placeholder), present on the
  // computed arm and absent from the model-generated arm.
  it("AC-UX-1: the marker distinguishes a computed answer from a model-generated one", async () => {
    const computed = await askAboutCourseAction("facts", "What week are we in?", validDates, "gemini");
    expect("answer" in computed && computed.answer).toContain(SCHEDULE_ANSWER_MARKER);

    const modelAnswered = await askAboutCourseAction(
      "facts",
      "Suggest three assessments that fit this schedule.",
      validDates,
      "gemini"
    );
    expect("answer" in modelAnswered && modelAnswered.answer).not.toContain(SCHEDULE_ANSWER_MARKER);
  });

  // AC-REACH-1. Without this, the deterministic branch ships and nobody ever
  // triggers it from the real UI - the same class of defect this repo has
  // now recorded three times (Ruling A1-9, A2-3). This imports the REAL
  // production closed list (unlike AC-SHAPE-1's literal table above) so it
  // fails loudly, not vacuously, if the production list is ever emptied or
  // the chip string drifts from it.
  it("AC-REACH-1: one AskAiModal suggestion chip normalizes into the real closed list", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "..", "components", "courses", "AskAiModal.tsx"),
      "utf8"
    );
    const suggestionsBlock = source.match(/const SUGGESTIONS = \[([\s\S]*?)\];/);
    expect(suggestionsBlock).not.toBeNull();
    const chipStrings = Array.from(
      (suggestionsBlock as RegExpMatchArray)[1].matchAll(/"([^"]+)"/g)
    ).map((m) => m[1]);
    expect(chipStrings.length).toBeGreaterThan(0);

    const normalizedChips = chipStrings.map(normalizeAskAiQuestion);
    const reachable = normalizedChips.some((c) => ASK_AI_CLOSED_LIST_QUESTIONS.includes(c));
    expect(reachable).toBe(true);
  });
});
