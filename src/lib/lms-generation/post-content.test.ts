// Direct, in-memory-fixture unit tests for post-content.ts's pure helpers -
// no vi.mock anywhere, matching commit-plan.test.ts's own style for this
// feature's other leaf module. lms-generation.test.ts still covers
// postGeneratedArtifactAction end-to-end (course resolution, DB re-read,
// Canvas writes, all mocked) - these tests instead pin the pure structural
// mapping buildPostContentForKind performs, and its two helpers, directly.
import { describe, it, expect } from "vitest";
import { buildPostContentForKind, parseKnowledgeCheckStructured, quizQuestionFromKnowledgeCheck } from "./post-content";
import type { GeneratedArtifact } from "@/lib/supabase/generated-artifacts";
import type { Json } from "@/lib/supabase/types";

function makeArtifact(overrides: Partial<GeneratedArtifact> = {}): GeneratedArtifact {
  return {
    id: "art-1",
    courseId: "course-1",
    kind: "module-objectives",
    version: 1,
    isCurrent: true,
    title: "Some Title",
    text: "Read chapter 3.",
    structured: null,
    prompt: "p",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const VALID_QUESTIONS: Json = [
  {
    prompt: "What is 2+2?",
    choices: [
      { text: "4", correct: true, explanation: "" },
      { text: "5", correct: false, explanation: "wrong" },
    ],
  },
  {
    prompt: "What color is the sky?",
    choices: [
      { text: "Blue", correct: true, explanation: "" },
      { text: "Green", correct: false, explanation: "wrong" },
    ],
  },
];

describe("buildPostContentForKind", () => {
  it("page: title plus markdownLiteToHtml(artifact.text) as body", () => {
    const artifact = makeArtifact({ text: "Read chapter 3." });
    const result = buildPostContentForKind("page", "Week 2 Objectives", artifact, false);
    expect(result).toEqual({ kind: "page", title: "Week 2 Objectives", body: "<p>Read chapter 3.</p>" });
  });

  it("assignment: fields built from title/artifact.text/publishedOnCreation, always online_text_entry with no due date or points", () => {
    const artifact = makeArtifact({ text: "Build a widget tracker." });
    const result = buildPostContentForKind("assignment", "Build a Widget Tracker", artifact, true);
    expect(result).toEqual({
      kind: "assignment",
      fields: {
        name: "Build a Widget Tracker",
        description: "<p>Build a widget tracker.</p>",
        pointsPossible: null,
        dueAt: "",
        submissionType: "online_text_entry",
        published: true,
      },
    });
  });

  it("assignment: publishedOnCreation threads through as false too, not hardcoded", () => {
    const artifact = makeArtifact();
    const result = buildPostContentForKind("assignment", "T", artifact, false);
    if ("error" in result) throw new Error("expected an assignment PostContent");
    if (result.kind !== "assignment") throw new Error("expected an assignment PostContent");
    expect(result.fields.published).toBe(false);
  });

  it("quiz: maps every saved question into a Canvas quiz question, in order", () => {
    const artifact = makeArtifact({ structured: VALID_QUESTIONS });
    const result = buildPostContentForKind("quiz", "Week 3 Knowledge Check", artifact, false);
    expect(result).toEqual({
      kind: "quiz",
      title: "Week 3 Knowledge Check",
      description: "Check your understanding of this module's material. Review the explanations for any question you miss.",
      questions: [
        {
          name: "What is 2+2?",
          text: "What is 2+2?",
          type: "multiple_choice_question",
          points: 1,
          answers: [
            { text: "4", correct: true },
            { text: "5", correct: false },
          ],
        },
        {
          name: "What color is the sky?",
          text: "What color is the sky?",
          type: "multiple_choice_question",
          points: 1,
          answers: [
            { text: "Blue", correct: true },
            { text: "Green", correct: false },
          ],
        },
      ],
    });
  });

  // SABOTAGE TARGET: this is the one branch that can itself fail - a version
  // with no usable saved questions must refuse to post, by name, rather than
  // posting an empty quiz.
  it("quiz: returns the named error when no questions parse from structured", () => {
    const artifact = makeArtifact({ structured: null });
    const result = buildPostContentForKind("quiz", "Week 3 Knowledge Check", artifact, false);
    expect(result).toEqual({ error: "This version has no quiz questions saved to post - regenerate it first." });
  });

  it("announcement: title plus the RAW artifact text as message - no HTML conversion", () => {
    const artifact = makeArtifact({ text: "Heads up, class is moved." });
    const result = buildPostContentForKind("announcement", "Heads up!", artifact, true);
    expect(result).toEqual({ kind: "announcement", title: "Heads up!", message: "Heads up, class is moved." });
  });

  describe("discussion", () => {
    // Frozen literals (docs/DEV_LOOP.md step 9), not re-imported from
    // intro-discussion-deadlines.ts's own constants - importing the same
    // constant the code under test uses would make this assertion a
    // tautology that can never fail when the constant itself is wrong.
    const EXPECTED_POINTS = 20;
    const EXPECTED_REQUIRED_REPLIES = 2;

    it("builds fields from title/artifact.text/deadlines, with the discussion's message run through markdownLiteToHtml", () => {
      const artifact = makeArtifact({ text: "Tell us about your career." });
      const result = buildPostContentForKind("discussion", "Introduce Yourself", artifact, false, {
        initialPostAt: "2026-09-04T03:59:00.000Z",
        repliesDueAt: "2026-09-07T03:59:00.000Z",
      });
      expect(result).toEqual({
        kind: "discussion",
        fields: {
          title: "Introduce Yourself",
          message: "<p>Tell us about your career.</p>",
          pointsPossible: EXPECTED_POINTS,
          initialPostAt: "2026-09-04T03:59:00.000Z",
          repliesDueAt: "2026-09-07T03:59:00.000Z",
          requiredReplyCount: EXPECTED_REQUIRED_REPLIES,
          published: false,
          // Frozen contract amendment: useCheckpoints defaults to false when
          // the sixth parameter is omitted; initialPostPoints/repliesPoints
          // are always computed (splitCheckpointPoints(20) = 10/10).
          useCheckpoints: false,
          initialPostPoints: 10,
          repliesPoints: 10,
        },
      });
    });

    // AC21: no start date (or no derivable module week) means null deadlines
    // from the AC8 leaf, which the caller represents by omitting the
    // `deadlines` argument entirely. The Canvas post must carry NO dates in
    // that case, not a fabricated one - "" is this codebase's own convention
    // for "no due date" (the assignment arm's own dueAt: "" above).
    it("AC21: with no deadlines argument, initialPostAt and repliesDueAt are both empty strings, never fabricated", () => {
      const artifact = makeArtifact({ text: "Tell us about your career." });
      const result = buildPostContentForKind("discussion", "Introduce Yourself", artifact, false);
      if ("error" in result) throw new Error("expected a discussion PostContent");
      if (result.kind !== "discussion") throw new Error("expected a discussion PostContent");
      expect(result.fields.initialPostAt).toBe("");
      expect(result.fields.repliesDueAt).toBe("");
    });

    it("publishedOnCreation threads through as true too, not hardcoded", () => {
      const artifact = makeArtifact();
      const result = buildPostContentForKind("discussion", "T", artifact, true);
      if ("error" in result) throw new Error("expected a discussion PostContent");
      if (result.kind !== "discussion") throw new Error("expected a discussion PostContent");
      expect(result.fields.published).toBe(true);
    });

    // SABOTAGE TARGET: pointsPossible/requiredReplyCount must be the fixed
    // constants regardless of what the generated artifact contains - the
    // model never supplies points (W1), and the reply count is a Canvas
    // requirement, not a model output.
    it("pointsPossible and requiredReplyCount are always the fixed constants, independent of the artifact", () => {
      const artifact = makeArtifact({ text: "anything" });
      const result = buildPostContentForKind("discussion", "T", artifact, false);
      if ("error" in result) throw new Error("expected a discussion PostContent");
      if (result.kind !== "discussion") throw new Error("expected a discussion PostContent");
      expect(result.fields.pointsPossible).toBe(EXPECTED_POINTS);
      expect(result.fields.requiredReplyCount).toBe(EXPECTED_REQUIRED_REPLIES);
    });

    // Frozen contract amendment (checkpoints are explicit opt-in, off by
    // default - Canvas's createDiscussionTopic mutation is not transactional
    // on a flag-off account). NewGradedDiscussion's `useCheckpoints`/
    // `initialPostPoints`/`repliesPoints` fields are read through an
    // intermediate cast in these three tests because the sibling-owned type
    // (src/lib/canvas-modules/graded-discussion.ts) may not have landed the
    // same three fields yet in a concurrent wave - see this chunk's own
    // report for the exact tsc state.
    it("useCheckpoints defaults to FALSE when the caller omits the sixth parameter - safe by default", () => {
      const artifact = makeArtifact({ text: "Tell us about your career." });
      const result = buildPostContentForKind("discussion", "Introduce Yourself", artifact, false, {
        initialPostAt: "2026-09-04T03:59:00.000Z",
        repliesDueAt: "2026-09-07T03:59:00.000Z",
      });
      if ("error" in result) throw new Error("expected a discussion PostContent");
      if (result.kind !== "discussion") throw new Error("expected a discussion PostContent");
      const fields = result.fields as unknown as Record<string, unknown>;
      expect(fields.useCheckpoints).toBe(false);
    });

    it("SABOTAGE TARGET: useCheckpoints threads through as true when the caller opts in", () => {
      const artifact = makeArtifact();
      const result = buildPostContentForKind("discussion", "T", artifact, false, undefined, true);
      if ("error" in result) throw new Error("expected a discussion PostContent");
      if (result.kind !== "discussion") throw new Error("expected a discussion PostContent");
      const fields = result.fields as unknown as Record<string, unknown>;
      expect(fields.useCheckpoints).toBe(true);
    });

    it("initialPostPoints and repliesPoints always sum EXACTLY to pointsPossible, regardless of useCheckpoints", () => {
      const artifact = makeArtifact();
      for (const useCheckpoints of [false, true]) {
        const result = buildPostContentForKind("discussion", "T", artifact, false, undefined, useCheckpoints);
        if ("error" in result) throw new Error("expected a discussion PostContent");
        if (result.kind !== "discussion") throw new Error("expected a discussion PostContent");
        const fields = result.fields as unknown as { initialPostPoints: number; repliesPoints: number; pointsPossible: number };
        expect(fields.initialPostPoints + fields.repliesPoints).toBe(fields.pointsPossible);
      }
    });
  });
});

// AC14b / the canary this chunk must not disturb: buildPostContentForKind's
// fifth (deadlines) parameter is OPTIONAL, so every one of the four
// PRE-EXISTING arms must still emit byte-identical PostContent when called
// with the old four-argument signature. This is what proves the discussion
// arm's addition was additive - the test above at "assignment: ... always
// online_text_entry with no due date or points" already pins the exact
// shape; this one pins that adding a fifth arm to the switch changed nothing
// about how the other four are reached (their branches never read
// `deadlines` at all).
describe("buildPostContentForKind - fifth parameter is additive only", () => {
  // Finding 11: this test used to be titled "page/quiz/announcement arms are
  // unaffected" but only ever called buildPostContentForKind with "page" -
  // the title asserted coverage the body never provided. Now genuinely
  // exercises all three named kinds.
  it("page/quiz/announcement arms are unaffected by an unrelated deadlines argument they never read", () => {
    const artifact = makeArtifact({ text: "Read chapter 3.", structured: VALID_QUESTIONS });
    const deadlines = { initialPostAt: "2026-01-01T00:00:00Z", repliesDueAt: "2026-01-04T00:00:00Z" };

    for (const kind of ["page", "quiz", "announcement"] as const) {
      const withoutDeadlines = buildPostContentForKind(kind, "T", artifact, false);
      const withDeadlines = buildPostContentForKind(kind, "T", artifact, false, deadlines);
      expect(withDeadlines).toEqual(withoutDeadlines);
    }
  });
});

describe("parseKnowledgeCheckStructured", () => {
  it("rejects a non-array", () => {
    expect(parseKnowledgeCheckStructured(null)).toEqual([]);
    expect(parseKnowledgeCheckStructured(undefined)).toEqual([]);
    expect(parseKnowledgeCheckStructured("not an array")).toEqual([]);
    expect(parseKnowledgeCheckStructured({ questions: [] })).toEqual([]);
    // A single object that individually has valid prompt/choices shape must
    // still be rejected when it is not itself wrapped in an array - guards
    // against a "wrap a bare value into a one-element array" fallback that
    // would otherwise slip a lone question-shaped object through.
    expect(parseKnowledgeCheckStructured({ prompt: "x", choices: [] })).toEqual([]);
  });

  it("rejects an array of non-objects", () => {
    expect(parseKnowledgeCheckStructured([1, 2, 3])).toEqual([]);
    expect(parseKnowledgeCheckStructured(["a", "b"])).toEqual([]);
    expect(parseKnowledgeCheckStructured([null, undefined])).toEqual([]);
  });

  it("drops entries missing prompt or choices (or with the wrong type), keeping only the valid ones", () => {
    const input = [
      { prompt: "Valid?", choices: [{ text: "Yes", correct: true, explanation: "" }] },
      { choices: [{ text: "Yes", correct: true, explanation: "" }] }, // missing prompt
      { prompt: "No choices" }, // missing choices
      { prompt: 42, choices: [] }, // prompt not a string
      { prompt: "choices not array", choices: "nope" }, // choices not an array
    ];
    expect(parseKnowledgeCheckStructured(input)).toEqual([
      { prompt: "Valid?", choices: [{ text: "Yes", correct: true, explanation: "" }] },
    ]);
  });

  it("accepts a valid set of questions unchanged", () => {
    const valid = [
      { prompt: "Q1", choices: [{ text: "A", correct: true, explanation: "" }] },
      { prompt: "Q2", choices: [{ text: "B", correct: false, explanation: "why" }] },
    ];
    expect(parseKnowledgeCheckStructured(valid)).toEqual(valid);
  });
});

describe("quizQuestionFromKnowledgeCheck", () => {
  it("maps prompt/choices into the Canvas quiz-question shape", () => {
    const q = {
      prompt: "What is the capital of France?",
      choices: [
        { text: "Paris", correct: true, explanation: "" },
        { text: "Lyon", correct: false, explanation: "wrong" },
      ],
    };
    expect(quizQuestionFromKnowledgeCheck(q)).toEqual({
      name: "What is the capital of France?",
      text: "What is the capital of France?",
      type: "multiple_choice_question",
      points: 1,
      answers: [
        { text: "Paris", correct: true },
        { text: "Lyon", correct: false },
      ],
    });
  });

  it("truncates a long prompt to 80 characters for the question's `name`, but keeps the full prompt in `text`", () => {
    const longPrompt = "A".repeat(120);
    const q = { prompt: longPrompt, choices: [{ text: "X", correct: true, explanation: "" }] };
    const result = quizQuestionFromKnowledgeCheck(q);
    expect(result.name).toBe("A".repeat(80));
    expect(result.name.length).toBe(80);
    expect(result.text).toBe(longPrompt);
  });
});
