import { describe, it, expect } from "vitest";
import {
  buildReplyDraftingPrompt,
  parsePostQuestions,
  truncateWithMarker,
  postQuestionKey,
  MAX_POST_QUESTIONS,
  MAX_QUESTION_CHARS,
  MAX_ANSWER_CHARS,
  DEFAULT_REPLY_COMPOSITION,
  type ReplyCompositionSettings,
} from "./discussion-reply-prompt";

// docs/post-questions-acceptance-criteria.md - every new parser/prompt/
// helper test for the "questions the post asks, each with an answer"
// feature lives HERE (this repo's own split rule: discussion-reply-
// prompt.test.ts is 842 lines and gets fixture edits only, no new tests).
// Per the repo's "source-text tests over-specify" lesson, these tests pin
// the FACT and the ORDERING, never the exact spelling of prompt prose.

const LEGACY_COMPOSITION: ReplyCompositionSettings = {
  ingredients: [],
  addressByName: false,
  formality: "balanced",
  answerQuestions: false,
};

const ON_COMPOSITION: ReplyCompositionSettings = {
  ...LEGACY_COMPOSITION,
  answerQuestions: true,
};

const posts = [
  { id: "a", author: "Priya", text: "First post text." },
  { id: "b", author: "Marcus", text: "Second post text." },
  { id: "c", author: "Devon", text: "Third post text." },
];

// The frozen OFF-path baseline, captured from this repo's own
// discussion-reply-prompt.test.ts BASELINE_STUDENTS_PROMPT (same posts
// fixture, audience "students", courseName "", styleBlock ""). Reused here
// rather than retyped so a future wording change only needs updating in one
// place; if it ever drifts, the "OFF is byte-identical" test below is the
// canary that catches it.
const BASELINE_STUDENTS_PROMPT =
  "You are the instructor, replying to a student's post on your course discussion board. Be warm, specific and encouraging. Open by naming something the student actually said - quote or paraphrase their own words, not a generic compliment. Add one substantive thing: an idea they did not raise, a correction if something is wrong, or a concrete example from the field. End with a question that invites them to take it further. Never grade the post, never give or imply a score or a mark, never say whether it meets a requirement, and never promise or hint at a deadline change.\n\nWrite one reply to each post below.\n\nEVERY REPLY, BOTH REGISTERS\n\n- Write in the first person, as yourself.\n\n- 3 to 6 sentences. Plain prose.\n\n- No markdown, no headings, no bullet lists, no bold.\n\n- No greeting line and no sign-off. Do not open with the person's name. The reply is pasted into a box that already shows who is speaking and who is being answered.\n\n- No emoji.\n\n- Never state a fact about the course - a date, a policy, a reading, an assignment, a grade - that is not written in the posts shown to you here. If you need one, write around it.\n\n- Reply only to what that post says. Do not refer to the other posts below.\n\nTHE POSTS\n\nPOST 1\nWritten by: Priya\nFirst post text.\n\n---\n\nPOST 2\nWritten by: Marcus\nSecond post text.\n\n---\n\nPOST 3\nWritten by: Devon\nThird post text.\n\nOUTPUT\n\nReturn ONLY a JSON array with exactly 3 elements, and nothing else.\n\nEach element is {\"post\": <the POST number>, \"reply\": \"...\", \"concepts\": [\"...\", \"...\"]} - the number, not the name.\n\nInclude every post number from 1 to 3, in order.\n\n\"concepts\" is one to three short noun phrases (2 to 5 words each) naming the ideas that reply discusses, copied from the reply's own wording. Never a person's name, never an idea the reply does not mention. It does not count toward the element count above.\n\nWrite the reply as plain text. If it runs longer than about 60 words, break it into at least two paragraphs, separated by a blank line (\"\\n\\n\"). No backticks.\n\nNo prose before or after the array. No code fences.";

describe("Q1: ReplyCompositionSettings.answerQuestions / DEFAULT_REPLY_COMPOSITION", () => {
  it("defaults to true - not inert, the first capture after this ships produces the new output with no action taken", () => {
    expect(DEFAULT_REPLY_COMPOSITION.answerQuestions).toBe(true);
  });
});

describe("Q1: truncateWithMarker", () => {
  it("returns text unchanged when it is already at or under max", () => {
    expect(truncateWithMarker("hello world", 11)).toBe("hello world");
    expect(truncateWithMarker("hello world", 50)).toBe("hello world");
  });

  it("truncates and appends the marker when text is over max", () => {
    const result = truncateWithMarker("hello world foo", 8);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBeLessThan("hello world foo".length);
  });

  it("cuts back to the last space rather than mid-word", () => {
    // "hello world foo" sliced to 10 chars is "hello worl" - cutting back
    // to the last space lands on "hello" (word-boundary rule), never on a
    // partial "worl".
    const result = truncateWithMarker("hello world foo", 10);
    expect(result).toBe("hello...");
  });

  it("uses a custom marker when one is given", () => {
    const result = truncateWithMarker("hello world foo", 10, "[cut]");
    expect(result).toBe("hello[cut]");
  });

  it("never emits U+2026 - three ASCII periods only, even with the default marker", () => {
    const result = truncateWithMarker("a".repeat(20), 5);
    expect(result).not.toContain("…");
    expect(result.endsWith("...")).toBe(true);
  });

  it("falls back to a hard cut with no word boundary before index 0 (no space in range)", () => {
    // SABOTAGE-PROVABLE: break by removing the `lastSpace > 0 ?` guard and
    // this would return "" + marker instead of the hard-cut prefix.
    const result = truncateWithMarker("nospaceshereatall", 5);
    expect(result).toBe("nospa...");
  });
});

describe("Q1: postQuestionKey", () => {
  it("the AC's own worked example: a quoted question, a bare lowercase question and a doubly-quoted question share one key", () => {
    const a = postQuestionKey('"Why does the loop run twice?"');
    const b = postQuestionKey("why does the loop run twice");
    const c = postQuestionKey('""Why does the loop run twice?""');
    expect(a).toBe(b);
    expect(c).toBe(b);
  });

  it("lowercases", () => {
    expect(postQuestionKey("WHY DOES THE LOOP RUN TWICE")).toBe("why does the loop run twice");
  });

  it("collapses internal whitespace to single spaces", () => {
    expect(postQuestionKey("why   does the\tloop\nrun twice")).toBe("why does the loop run twice");
  });

  it("trims leading and trailing whitespace", () => {
    expect(postQuestionKey("   why does it run twice   ")).toBe("why does it run twice");
  });

  it("strips surrounding curly double quotes as well as straight ones", () => {
    expect(postQuestionKey("“why does it run twice”")).toBe("why does it run twice");
  });

  it("strips trailing question marks, periods and exclamation points", () => {
    expect(postQuestionKey("why does it run twice?")).toBe("why does it run twice");
    expect(postQuestionKey("it always runs twice.")).toBe("it always runs twice");
    expect(postQuestionKey("it always runs twice!")).toBe("it always runs twice");
  });

  it("a question with no quotes and no trailing punctuation is unchanged (modulo case/whitespace)", () => {
    expect(postQuestionKey("why does it run twice")).toBe("why does it run twice");
  });

  it("does not strip a single quote (only double quotes are named by the rule)", () => {
    // SABOTAGE-PROVABLE: widening the quote set to include "'" would make
    // this collapse to the same key as the unquoted form, which it must not.
    const withSingleQuote = postQuestionKey("'why does it run twice'");
    const bare = postQuestionKey("why does it run twice");
    expect(withSingleQuote).not.toBe(bare);
  });
});

describe("Q3: parsePostQuestions", () => {
  it("returns [] for null, a number, a string, a boolean and a nested array", () => {
    expect(parsePostQuestions(null)).toEqual([]);
    expect(parsePostQuestions(undefined)).toEqual([]);
    expect(parsePostQuestions(42)).toEqual([]);
    expect(parsePostQuestions("not an array")).toEqual([]);
    expect(parsePostQuestions(true)).toEqual([]);
    expect(parsePostQuestions([["nested"]])).toEqual([]);
  });

  it("wraps a lone object as a single-item array", () => {
    expect(
      parsePostQuestions({ question: "Why does the loop run twice?", implied: false, answer: "Because it re-checks." })
    ).toEqual([{ question: "Why does the loop run twice?", implied: false, answer: "Because it re-checks." }]);
  });

  it("drops an array element that is not a plain object (a string, a number, an array)", () => {
    expect(
      parsePostQuestions([
        "not an object",
        42,
        ["nested"],
        { question: "Real question?", implied: false, answer: "Real answer." },
      ])
    ).toEqual([{ question: "Real question?", implied: false, answer: "Real answer." }]);
  });

  describe("key aliases", () => {
    it("question | q | text, in that order, only when the canonical key is not a string", () => {
      expect(parsePostQuestions([{ q: "Aliased via q?", implied: false, answer: "A." }])).toEqual([
        { question: "Aliased via q?", implied: false, answer: "A." },
      ]);
      expect(parsePostQuestions([{ text: "Aliased via text?", implied: false, answer: "A." }])).toEqual([
        { question: "Aliased via text?", implied: false, answer: "A." },
      ]);
      // question present as a non-string falls through to q.
      expect(parsePostQuestions([{ question: 42, q: "Fallback via q?", implied: false, answer: "A." }])).toEqual([
        { question: "Fallback via q?", implied: false, answer: "A." },
      ]);
    });

    it("answer | a | response, in that order", () => {
      expect(parsePostQuestions([{ question: "Q?", implied: false, a: "Aliased via a." }])).toEqual([
        { question: "Q?", implied: false, answer: "Aliased via a." },
      ]);
      expect(parsePostQuestions([{ question: "Q?", implied: false, response: "Aliased via response." }])).toEqual([
        { question: "Q?", implied: false, answer: "Aliased via response." },
      ]);
    });

    it("needsYou | needs_you | needsInstructor, in that order", () => {
      expect(
        parsePostQuestions([{ question: "Q?", implied: false, answer: "", needs_you: "The due date." }])
      ).toEqual([{ question: "Q?", implied: false, answer: "", needsYou: "The due date." }]);
      expect(
        parsePostQuestions([{ question: "Q?", implied: false, answer: "", needsInstructor: "The due date." }])
      ).toEqual([{ question: "Q?", implied: false, answer: "", needsYou: "The due date." }]);
    });
  });

  describe("implied", () => {
    it("true for boolean true", () => {
      const [item] = parsePostQuestions([{ question: "Q?", implied: true, answer: "A." }]);
      expect(item.implied).toBe(true);
    });

    it("true for the strings 'true', 'implicit', 'implied' (case-insensitive)", () => {
      for (const value of ["true", "TRUE", "implicit", "Implicit", "implied", "IMPLIED"]) {
        const [item] = parsePostQuestions([{ question: "Q?", implied: value, answer: "A." }]);
        expect(item.implied, `expected implied:"${value}" to parse true`).toBe(true);
      }
    });

    it("true when kind or type equals 'implicit'/'implied'", () => {
      expect(parsePostQuestions([{ question: "Q?", kind: "implicit", answer: "A." }])[0].implied).toBe(true);
      expect(parsePostQuestions([{ question: "Q?", type: "implied", answer: "A." }])[0].implied).toBe(true);
    });

    it("true when explicit === false", () => {
      expect(parsePostQuestions([{ question: "Q?", explicit: false, answer: "A." }])[0].implied).toBe(true);
    });

    it("false (never absent) for anything else, including a missing field entirely", () => {
      expect(parsePostQuestions([{ question: "Q?", answer: "A." }])[0].implied).toBe(false);
      expect(parsePostQuestions([{ question: "Q?", implied: "sort of", answer: "A." }])[0].implied).toBe(false);
      expect(parsePostQuestions([{ question: "Q?", implied: 1, answer: "A." }])[0].implied).toBe(false);
    });
  });

  describe("placeholder values", () => {
    it("a question matching the placeholder pattern is treated as absent - the item is dropped", () => {
      for (const placeholder of ["N/A", "n/a", "None", "null", "nil", "-", "No", "Not applicable", "n/a."]) {
        expect(
          parsePostQuestions([{ question: placeholder, implied: false, answer: "A." }]),
          `expected question:"${placeholder}" to drop the item`
        ).toEqual([]);
      }
    });

    it("an answer matching the placeholder pattern is treated as absent, dropping the item when no needsYou is given", () => {
      expect(parsePostQuestions([{ question: "Q?", implied: false, answer: "N/A" }])).toEqual([]);
    });

    it("an answer matching the placeholder pattern with a needsYou present survives as answer-empty", () => {
      expect(
        parsePostQuestions([{ question: "Q?", implied: false, answer: "None", needsYou: "The grading rubric." }])
      ).toEqual([{ question: "Q?", implied: false, answer: "", needsYou: "The grading rubric." }]);
    });

    it("a needsYou matching the placeholder pattern is treated as absent (key omitted, never present)", () => {
      const [item] = parsePostQuestions([{ question: "Q?", implied: false, answer: "A.", needsYou: "None" }]);
      expect("needsYou" in item).toBe(false);
    });
  });

  describe("question: collapse, trim, drop-if-empty, truncate-not-drop", () => {
    it("collapses internal whitespace and trims", () => {
      const [item] = parsePostQuestions([{ question: "  why   does\tit run\ntwice?  ", implied: false, answer: "A." }]);
      expect(item.question).toBe("why does it run twice?");
    });

    it("an empty (or whitespace-only) question drops the item", () => {
      expect(parsePostQuestions([{ question: "", implied: false, answer: "A." }])).toEqual([]);
      expect(parsePostQuestions([{ question: "   ", implied: false, answer: "A." }])).toEqual([]);
    });

    it("a missing question field (no alias resolves to a string) drops the item", () => {
      expect(parsePostQuestions([{ implied: false, answer: "A." }])).toEqual([]);
    });

    it("a question over MAX_QUESTION_CHARS is truncated with a marker, NOT dropped", () => {
      const longQuestion = `${"word ".repeat(80)}end?`;
      expect(longQuestion.length).toBeGreaterThan(MAX_QUESTION_CHARS);
      const [item] = parsePostQuestions([{ question: longQuestion, implied: false, answer: "A." }]);
      expect(item).toBeDefined();
      expect(item.question.length).toBeLessThanOrEqual(MAX_QUESTION_CHARS + 3);
      expect(item.question.endsWith("...")).toBe(true);
    });
  });

  describe("answer: paragraph normalisation, array join, non-string, truncate", () => {
    it("collapses whitespace within a paragraph and trims", () => {
      const [item] = parsePostQuestions([
        { question: "Q?", implied: false, answer: "  This   has\textra\nspaces.  " },
      ]);
      expect(item.answer).toBe("This has extra spaces.");
    });

    it("splits on a blank line, drops empty paragraphs, rejoins with a single blank line", () => {
      const [item] = parsePostQuestions([
        { question: "Q?", implied: false, answer: "First paragraph.\n\n\n\nSecond paragraph." },
      ]);
      expect(item.answer).toBe("First paragraph.\n\nSecond paragraph.");
    });

    it("accepts an array of strings, joined with a blank line before normalisation", () => {
      const [item] = parsePostQuestions([
        { question: "Q?", implied: false, answer: ["First paragraph.", "Second paragraph."] },
      ]);
      expect(item.answer).toBe("First paragraph.\n\nSecond paragraph.");
    });

    it("a non-string, non-array-of-strings answer becomes '' (then the item is dropped, absent a needsYou)", () => {
      expect(parsePostQuestions([{ question: "Q?", implied: false, answer: 42 }])).toEqual([]);
      expect(parsePostQuestions([{ question: "Q?", implied: false, answer: { not: "a string" } }])).toEqual([]);
    });

    it("an answer over MAX_ANSWER_CHARS is truncated with a marker, NOT dropped", () => {
      const longAnswer = `${"word ".repeat(300)}end.`;
      expect(longAnswer.length).toBeGreaterThan(MAX_ANSWER_CHARS);
      const [item] = parsePostQuestions([{ question: "Q?", implied: false, answer: longAnswer }]);
      expect(item).toBeDefined();
      expect(item.answer.length).toBeLessThanOrEqual(MAX_ANSWER_CHARS + 3);
      expect(item.answer.endsWith("...")).toBe(true);
    });
  });

  describe("needsYou: collapse, trim, absent-not-empty, truncate", () => {
    it("collapses whitespace and trims", () => {
      const [item] = parsePostQuestions([
        { question: "Q?", implied: false, answer: "", needsYou: "  The   due date.  " },
      ]);
      expect(item.needsYou).toBe("The due date.");
    });

    it("an empty or non-string needsYou is ABSENT (key omitted), never an empty string", () => {
      const withEmpty = parsePostQuestions([{ question: "Q?", implied: false, answer: "A.", needsYou: "" }]);
      expect("needsYou" in withEmpty[0]).toBe(false);
      const withNumber = parsePostQuestions([{ question: "Q?", implied: false, answer: "A.", needsYou: 42 }]);
      expect("needsYou" in withNumber[0]).toBe(false);
    });

    it("a needsYou over MAX_QUESTION_CHARS is truncated with a marker, NOT dropped", () => {
      const longNeedsYou = `${"word ".repeat(80)}end.`;
      expect(longNeedsYou.length).toBeGreaterThan(MAX_QUESTION_CHARS);
      const [item] = parsePostQuestions([{ question: "Q?", implied: false, answer: "", needsYou: longNeedsYou }]);
      expect(item.needsYou).toBeDefined();
      expect((item.needsYou as string).length).toBeLessThanOrEqual(MAX_QUESTION_CHARS + 3);
      expect((item.needsYou as string).endsWith("...")).toBe(true);
    });
  });

  describe("the Q1 invariant: answer !== '' || (needsYou !== undefined && needsYou !== '')", () => {
    it("an item with neither answer nor needsYou is dropped", () => {
      expect(parsePostQuestions([{ question: "Q?", implied: false, answer: "" }])).toEqual([]);
      expect(parsePostQuestions([{ question: "Q?", implied: false }])).toEqual([]);
    });

    it("an item with only an answer is kept, no needsYou key", () => {
      const [item] = parsePostQuestions([{ question: "Q?", implied: false, answer: "A." }]);
      expect(item.answer).toBe("A.");
      expect("needsYou" in item).toBe(false);
    });

    it("an item with only needsYou is kept, answer is exactly ''", () => {
      const [item] = parsePostQuestions([{ question: "Q?", implied: false, answer: "", needsYou: "A fact." }]);
      expect(item.answer).toBe("");
      expect(item.needsYou).toBe("A fact.");
    });

    it("an item with both an answer and needsYou is legal and keeps both", () => {
      const [item] = parsePostQuestions([
        { question: "Q?", implied: false, answer: "Partial answer.", needsYou: "The rest depends on this." },
      ]);
      expect(item.answer).toBe("Partial answer.");
      expect(item.needsYou).toBe("The rest depends on this.");
    });
  });

  describe("dedupe on postQuestionKey, first kept", () => {
    it("two items whose keys match after normalisation collapse to the first one seen", () => {
      const result = parsePostQuestions([
        { question: "Why does the loop run twice?", implied: false, answer: "First answer." },
        { question: '"why does the loop run twice"', implied: true, answer: "Second answer, should be dropped." },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].answer).toBe("First answer.");
      expect(result[0].implied).toBe(false);
    });

    it("distinct questions are not deduped", () => {
      const result = parsePostQuestions([
        { question: "Why does the loop run twice?", implied: false, answer: "A." },
        { question: "Why is the second run skipped?", implied: false, answer: "B." },
      ]);
      expect(result).toHaveLength(2);
    });
  });

  describe("max applied LAST", () => {
    it("caps the result at MAX_POST_QUESTIONS (3) by default", () => {
      const result = parsePostQuestions([
        { question: "Q1?", implied: false, answer: "A1." },
        { question: "Q2?", implied: false, answer: "A2." },
        { question: "Q3?", implied: false, answer: "A3." },
        { question: "Q4?", implied: false, answer: "A4." },
      ]);
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.question)).toEqual(["Q1?", "Q2?", "Q3?"]);
    });

    // VERIFIER FINDING 4: both assertions above used to be written in terms
    // of the imported MAX_POST_QUESTIONS, which made them tautologies -
    // raising the constant to 4 kept them green (4 in, 4 kept,
    // `slice(0, 4)` = all four). They are literals now, and the constant
    // gets its own pin, because the PROMPT states the cap to the model in
    // words: the two can desync with a fully green suite otherwise, leaving
    // the model told one number and the server enforcing another.
    it("MAX_POST_QUESTIONS is 3, the number the prompt states to the model", () => {
      expect(MAX_POST_QUESTIONS).toBe(3);
      const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
      expect(prompt).toContain(`at most ${MAX_POST_QUESTIONS} per post`);
    });

    it("dedupe happens BEFORE the cap - a duplicate does not steal a slot from a real distinct question", () => {
      // SABOTAGE-PROVABLE: applying max before dedupe would leave only
      // ["Q1?", "Q1?" dup, "Q2?"] -> capped to the dup instead of Q3.
      const result = parsePostQuestions([
        { question: "Q1?", implied: false, answer: "A1." },
        { question: "Q1?", implied: false, answer: "A1 dup, dropped." },
        { question: "Q2?", implied: false, answer: "A2." },
        { question: "Q3?", implied: false, answer: "A3." },
      ]);
      expect(result.map((r) => r.question)).toEqual(["Q1?", "Q2?", "Q3?"]);
    });

    it("a custom max is honoured", () => {
      const result = parsePostQuestions(
        [
          { question: "Q1?", implied: false, answer: "A1." },
          { question: "Q2?", implied: false, answer: "A2." },
        ],
        1
      );
      expect(result).toHaveLength(1);
      expect(result[0].question).toBe("Q1?");
    });
  });

  // The data pass's oracle shapes (AC section 1/4): explicit, implied,
  // needsYou-only, both-answer-and-needsYou, empty, and a placeholder-laden
  // post - each round-trips to the expected PostQuestion[] identity.
  describe("oracle shapes", () => {
    it("explicit question, plain answer", () => {
      const raw = [{ question: "Why did the second commit fail?", implied: false, answer: "The second commit failed because the linter caught an unused import." }];
      expect(parsePostQuestions(raw)).toEqual([
        {
          question: "Why did the second commit fail?",
          implied: false,
          answer: "The second commit failed because the linter caught an unused import.",
        },
      ]);
    });

    it("implied question, phrased by the model, plain answer", () => {
      const raw = [
        {
          question: "Why does the loop run twice instead of once?",
          implied: true,
          answer: "The loop re-checks its condition after each pass, so a condition that is still true after the first pass runs a second time.",
        },
      ];
      expect(parsePostQuestions(raw)).toEqual([
        {
          question: "Why does the loop run twice instead of once?",
          implied: true,
          answer: "The loop re-checks its condition after each pass, so a condition that is still true after the first pass runs a second time.",
        },
      ]);
    });

    it("needsYou-only (answer withheld for a course fact)", () => {
      const raw = [
        { question: "Is the late policy the same for this assignment?", implied: false, answer: "", needsYou: "Whether the standard late policy applies to this assignment." },
      ];
      expect(parsePostQuestions(raw)).toEqual([
        {
          question: "Is the late policy the same for this assignment?",
          implied: false,
          answer: "",
          needsYou: "Whether the standard late policy applies to this assignment.",
        },
      ]);
    });

    it("both an answer and a needsYou (partial answer, gap named)", () => {
      const raw = [
        {
          question: "Can I argue against the textbook's framing?",
          implied: false,
          answer: "In a history essay you are always free to argue against a source, as long as you engage its evidence and give your own.",
          needsYou: "Whether this essay requires the textbook's court-packing framing.",
        },
      ];
      expect(parsePostQuestions(raw)).toEqual([
        {
          question: "Can I argue against the textbook's framing?",
          implied: false,
          answer: "In a history essay you are always free to argue against a source, as long as you engage its evidence and give your own.",
          needsYou: "Whether this essay requires the textbook's court-packing framing.",
        },
      ]);
    });

    it("empty (a post that asks nothing) - an empty array in, an empty array out", () => {
      expect(parsePostQuestions([])).toEqual([]);
    });

    it("placeholders throughout - every field is a placeholder string, item is dropped", () => {
      const raw = [{ question: "N/A", implied: false, answer: "None", needsYou: "null" }];
      expect(parsePostQuestions(raw)).toEqual([]);
    });
  });
});

describe("Q2: buildReplyDraftingPrompt - QUESTIONS IN THE POST block and OUTPUT changes", () => {
  it("OFF: the prompt is byte-identical to the frozen pre-feature baseline", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", LEGACY_COMPOSITION);
    expect(prompt).toBe(BASELINE_STUDENTS_PROMPT);
  });

  it("OFF: no QUESTIONS IN THE POST block, no \"questions\" key anywhere in the OUTPUT section", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", LEGACY_COMPOSITION);
    expect(prompt).not.toContain("QUESTIONS IN THE POST");
    expect(prompt).not.toContain('"questions"');
  });

  it("ON: the QUESTIONS IN THE POST block is present, between GREETING NAMES/ingredients and THE POSTS", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    expect(prompt).toContain("QUESTIONS IN THE POST");
    const questionsIdx = prompt.indexOf("QUESTIONS IN THE POST");
    const postsIdx = prompt.indexOf("THE POSTS");
    expect(questionsIdx).toBeGreaterThanOrEqual(0);
    expect(postsIdx).toBeGreaterThan(questionsIdx);
  });

  it("ON: the element-shape line gains a \"questions\" key, after \"concepts\"", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const elementShapeIdx = prompt.indexOf("Each element is");
    const conceptsIdx = prompt.indexOf('"concepts"', elementShapeIdx);
    const questionsInShapeIdx = prompt.indexOf('"questions"', elementShapeIdx);
    expect(elementShapeIdx).toBeGreaterThanOrEqual(0);
    expect(conceptsIdx).toBeGreaterThan(elementShapeIdx);
    expect(questionsInShapeIdx).toBeGreaterThan(conceptsIdx);
    // Same line, not a second element-shape sentence.
    const restOfLine = prompt.slice(elementShapeIdx, prompt.indexOf("\n", elementShapeIdx));
    expect(restOfLine).toContain('"questions"');
  });

  it("ON: the questions output-contract sentence immediately follows the concepts sentence (element order reply, concepts, questions is load-bearing for truncation recovery)", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const conceptsSentenceIdx = prompt.indexOf('"concepts" is one to three');
    const questionsSentenceIdx = prompt.indexOf('"questions" is an array');
    expect(conceptsSentenceIdx).toBeGreaterThanOrEqual(0);
    expect(questionsSentenceIdx).toBeGreaterThan(conceptsSentenceIdx);
    // "Immediately follows" - only a blank-line join sits between the two
    // sentences, nothing else in between.
    const between = prompt.slice(conceptsSentenceIdx, questionsSentenceIdx);
    expect(between.split("\n\n")).toHaveLength(2);
  });

  it("ON: RC1's own adjacency pin still holds - the concepts sentence still immediately follows the post-number-range line", () => {
    // Guards against a sabotage that inserts the new questions material
    // BEFORE the concepts sentence instead of after it, which would break
    // this pre-existing pin (owned by discussion-reply-prompt.test.ts, not
    // duplicated verbatim here - just re-verified under the ON composition
    // since that file only exercises it under LEGACY_COMPOSITION/OFF).
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const includeLineIdx = prompt.indexOf("Include every post number");
    const conceptsSentenceIdx = prompt.indexOf('"concepts" is one to three', includeLineIdx);
    expect(includeLineIdx).toBeGreaterThanOrEqual(0);
    expect(conceptsSentenceIdx).toBeGreaterThan(includeLineIdx);
    const between = prompt.slice(includeLineIdx, conceptsSentenceIdx);
    expect(between.split("\n\n")).toHaveLength(2);
  });

  it("ON: mentions needsYou and the never-invent-a-course-fact rule inside the QUESTIONS block", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const questionsIdx = prompt.indexOf("QUESTIONS IN THE POST");
    const nextSectionIdx = prompt.indexOf("THE POSTS");
    const block = prompt.slice(questionsIdx, nextSectionIdx).toLowerCase();
    expect(block).toContain("needsyou");
    expect(block).toContain("due date");
  });

  // docs/answers-in-the-reply-acceptance-criteria.md A2 (section 0/1): the
  // feature reverses docs/post-questions-acceptance-criteria.md's own rule
  // that the reply "must not reproduce an answer written in questions" -
  // the reply now answers in its own flow instead, so this assertion goes
  // RED under the new prompt and is replaced (not deleted) by its inverse:
  // the integration rule is present, and the old separation phrase is gone.
  it("ON: the reply-answers-in-its-own-flow rule is present, and the old separation phrase is gone", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const questionsIdx = prompt.indexOf("QUESTIONS IN THE POST");
    const nextSectionIdx = prompt.indexOf("THE POSTS");
    const block = prompt.slice(questionsIdx, nextSectionIdx).toLowerCase();
    // The fact, not the exact spelling: the reply itself answers each
    // question, and what goes in "answer" must be reply text.
    expect(block).toContain("answers each question");
    expect(block).toContain("must be text that actually appears in the reply");
    expect(block).not.toContain("must not reproduce");
  });

  it("ON: keeps the no-forward-promise clause - never appended at the end, never a label, and never says whether/where/by whom a question will be answered", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const questionsIdx = prompt.indexOf("QUESTIONS IN THE POST");
    const nextSectionIdx = prompt.indexOf("THE POSTS");
    const block = prompt.slice(questionsIdx, nextSectionIdx).toLowerCase();
    expect(block).toContain("never appended at the end");
    expect(block).toContain("never labelled");
    expect(block).toContain("where or by whom it will be answered");
  });

  it("ON: register-compatible wording, with no audience branch inside the block (structural, not audience-scoped)", () => {
    const studentsPrompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const peersPrompt = buildReplyDraftingPrompt(posts, "peers", "", "", ON_COMPOSITION);
    const studentsBlock = studentsPrompt.slice(
      studentsPrompt.indexOf("QUESTIONS IN THE POST"),
      studentsPrompt.indexOf("THE POSTS")
    );
    const peersBlock = peersPrompt.slice(
      peersPrompt.indexOf("QUESTIONS IN THE POST"),
      peersPrompt.indexOf("THE POSTS")
    );
    // Byte-identical: the block never reads `audience` at all.
    expect(studentsBlock).toBe(peersBlock);
    expect(studentsBlock.toLowerCase()).toContain("rather than a tutorial");
  });

  it("ON: the needsYou rule still tells the reply to write around a fact it cannot know, not answer, invent or promise to check", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    const questionsIdx = prompt.indexOf("QUESTIONS IN THE POST");
    const nextSectionIdx = prompt.indexOf("THE POSTS");
    const block = prompt.slice(questionsIdx, nextSectionIdx).toLowerCase();
    expect(block).toContain("writes around it");
    expect(block).toContain("invent the fact");
    expect(block).toContain("promise to check");
  });

  it("ON: the listing bullet no longer tells the model to keep answers separate from the reply", () => {
    // VERIFY PASS. "Separately from the reply, list the questions ..." was
    // written when the answers lived outside the reply as well. Only the
    // LIST is separate now, and that phrase sitting one bullet above "the
    // reply itself answers each question" is a direct instruction to do the
    // thing this feature reverses.
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION).toLowerCase();
    expect(prompt).toContain("alongside the reply, list the questions each post asks");
    expect(prompt).not.toContain("separately from the reply");
  });

  it("ON: the listing rule (asked/implied) and the skip rule are byte-unchanged from the pre-existing prompt", () => {
    const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    expect(prompt).toContain(
      "Include every question the post asks outright, and any question it only implies - a stated confusion, a wrong assumption stated as fact, or something the writer says they could not work out."
    );
    expect(prompt).toContain(
      "Do not list a question the post itself goes on to answer, a question it repeats from the discussion prompt in order to answer it, or a rhetorical question. A post with no questions gets an empty array."
    );
  });

  // docs/answers-in-the-reply-acceptance-criteria.md A2: "the sentence rule
  // is ONE line, made conditional - not restated in the questions block."
  describe("the sentence-count line", () => {
    it("OFF arm is byte-identical to the frozen pre-feature string", () => {
      const prompt = buildReplyDraftingPrompt(posts, "students", "", "", LEGACY_COMPOSITION);
      expect(prompt).toContain("- 3 to 6 sentences. Plain prose.");
    });

    it("ON arm widens the ceiling to 10 and states which rule wins, in EVERY REPLY, not inside QUESTIONS IN THE POST", () => {
      const prompt = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
      const everyReplyIdx = prompt.indexOf("EVERY REPLY, BOTH REGISTERS");
      const questionsIdx = prompt.indexOf("QUESTIONS IN THE POST");
      const sentenceLineIdx = prompt.indexOf("up to 10");
      expect(sentenceLineIdx).toBeGreaterThan(everyReplyIdx);
      expect(sentenceLineIdx).toBeLessThan(questionsIdx);
      // Only ONE sentence-count statement in the ON prompt - never restated
      // inside the questions block itself. (The needsYou bullet legitimately
      // says "sentence fragment", unrelated to a count, so this checks for
      // the count phrasing specifically rather than the bare word.)
      const block = prompt.slice(questionsIdx, prompt.indexOf("THE POSTS")).toLowerCase();
      expect(block).not.toContain("3 to 6");
      expect(block).not.toContain("up to 10");
    });

    it("the OFF byte-identity oracle still passes with the ternary in place", () => {
      const prompt = buildReplyDraftingPrompt(posts, "students", "", "", LEGACY_COMPOSITION);
      expect(prompt).toBe(BASELINE_STUDENTS_PROMPT);
    });
  });

  it("block order is unchanged: GREETING NAMES/ingredients, then QUESTIONS IN THE POST, then THE POSTS", () => {
    const prompt = buildReplyDraftingPrompt(
      [{ ...posts[0], greetingName: "Priya" }, posts[1], posts[2]],
      "students",
      "",
      "",
      { ...ON_COMPOSITION, addressByName: true, ingredients: ["compliment"] }
    );
    const ingredientsIdx = prompt.indexOf("EACH REPLY SHOULD INCLUDE");
    const greetingIdx = prompt.indexOf("GREETING NAMES");
    const questionsIdx = prompt.indexOf("QUESTIONS IN THE POST");
    const postsIdx = prompt.indexOf("THE POSTS");
    expect(ingredientsIdx).toBeGreaterThanOrEqual(0);
    expect(greetingIdx).toBeGreaterThan(ingredientsIdx);
    expect(questionsIdx).toBeGreaterThan(greetingIdx);
    expect(postsIdx).toBeGreaterThan(questionsIdx);
  });

  it("toggling answerQuestions is the ONLY difference between two otherwise-identical calls", () => {
    const off = buildReplyDraftingPrompt(posts, "students", "", "", LEGACY_COMPOSITION);
    const on = buildReplyDraftingPrompt(posts, "students", "", "", ON_COMPOSITION);
    expect(off).not.toBe(on);
    // Every other structural section is present in both.
    for (const prompt of [off, on]) {
      expect(prompt).toContain("THE POSTS");
      expect(prompt).toContain("OUTPUT");
      expect(prompt).toContain("Return ONLY a JSON array with exactly 3 elements");
    }
  });

  it("works for the peers audience too - structural, not audience-scoped", () => {
    const prompt = buildReplyDraftingPrompt(posts, "peers", "", "", ON_COMPOSITION);
    expect(prompt).toContain("QUESTIONS IN THE POST");
    expect(prompt).toContain('"questions"');
  });
});
