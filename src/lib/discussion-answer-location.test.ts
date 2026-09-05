import { describe, expect, it } from "vitest";
import { MIN_LOCATABLE_ANSWER_CHARS, replyContainsAnswer } from "./discussion-answer-location";

// docs/answers-in-the-reply-acceptance-criteria.md A1 / section 6.
//
// The property under test is narrow on purpose: a TRUE result must mean the
// reply literally says those words, in that order, allowing only for the
// transforms the pipeline itself applies (whitespace collapse, the
// truncation marker) and the typographic swaps a model makes freely. Several
// cases below are written specifically so that reverting the implementation
// to a raw `reply.includes(answer)` turns them red - without those, the
// whole leaf could be deleted and every other gate would stay green.

const REPLY = [
  "Your read on the second source is sharper than mine was at that point.",
  "The loop runs twice because the outer iterator is re-entered before the",
  "inner one drains, which is easy to miss when the log only prints once.",
  "",
  "What would you expect to see if you logged the counter on each pass?",
].join("\n");

describe("replyContainsAnswer", () => {
  it("matches an answer copied verbatim out of the reply", () => {
    expect(
      replyContainsAnswer(REPLY, "Your read on the second source is sharper than mine was at that point.")
    ).toBe(true);
  });

  it("matches a mid-flow answer that does not start a sentence of its own", () => {
    // The shape the new prompt actually produces: the answering words are
    // spliced into the reply's own argument, so `answer` frequently begins
    // lowercase and mid-clause. Nothing in the predicate may assume a
    // sentence boundary.
    expect(replyContainsAnswer(REPLY, "the outer iterator is re-entered before the inner one drains")).toBe(
      true
    );
  });

  it("matches across a soft line break in the reply", () => {
    // THE CASE A RAW `includes` FAILS. `normalizePostQuestionAnswer`
    // (discussion-reply-prompt.ts:188-197) has already collapsed the
    // answer's own whitespace to single spaces, so an answer spanning two
    // lines of the reply is never a raw substring of it.
    const answer =
      "The loop runs twice because the outer iterator is re-entered before the inner one drains, which is easy to miss when the log only prints once.";
    expect(REPLY.includes(answer)).toBe(false);
    expect(replyContainsAnswer(REPLY, answer)).toBe(true);
  });

  it("matches across the blank line normalizePostQuestionAnswer rejoins with", () => {
    const reply = "The estimate moves for one reason.\n\nIt is the sampling window, not the model.";
    const answer = "The estimate moves for one reason.\n\nIt is the sampling window, not the model.";
    expect(replyContainsAnswer(reply, answer)).toBe(true);
  });

  it("matches when the reply uses curly quotes and the answer uses straight ones", () => {
    // SABOTAGE CASE: this one exists so that reverting the delegation to a
    // raw containment test cannot pass. Do not delete it.
    const reply = "You called it a “hard” constraint, and that is the part I would push on.";
    const answer = 'You called it a "hard" constraint, and that is the part I would push on.';
    expect(reply.includes(answer)).toBe(false);
    expect(replyContainsAnswer(reply, answer)).toBe(true);
  });

  it("matches across apostrophe, dash and ellipsis variants", () => {
    const reply =
      "That is the reader’s problem — not the writer’s … and it is worth separating them.";
    const answer = "That is the reader's problem - not the writer's ... and it is worth separating them.";
    expect(replyContainsAnswer(reply, answer)).toBe(true);
  });

  it("ignores case differences", () => {
    expect(replyContainsAnswer(REPLY, "THE LOOP RUNS TWICE BECAUSE THE OUTER ITERATOR")).toBe(true);
  });

  it("matches a truncated answer against the reply it was cut from", () => {
    // MAX_ANSWER_CHARS truncation appends a literal three-period marker at a
    // word boundary (truncateWithMarker, discussion-reply-prompt.ts:394-400).
    // The marker is never in the reply, so exact containment alone fails.
    const answer = "The loop runs twice because the outer iterator is re-entered...";
    expect(replyContainsAnswer(REPLY, answer)).toBe(true);
  });

  it("does not match a truncated answer whose surviving prefix is absent", () => {
    expect(replyContainsAnswer(REPLY, "The loop runs three times because the queue drains...")).toBe(false);
  });

  it("does not match a reply that merely discusses the same subject", () => {
    // The failure mode a fuzzy or bag-of-words matcher would produce, and
    // the reason there is no similarity fallback in the implementation.
    expect(
      replyContainsAnswer(
        REPLY,
        "The loop executes a second time as a result of the outer iterator being re-entered too early."
      )
    ).toBe(false);
  });

  it("does not match when only the opening words survive an edit", () => {
    // Deliberate: an n-word-prefix fallback would call this a match, and the
    // badge would then claim the reply says something it does not.
    expect(
      replyContainsAnswer(
        REPLY,
        "The loop runs twice because the queue is drained by a second consumer entirely."
      )
    ).toBe(false);
  });

  it("matches an answer whose sentences the reply separates", () => {
    // The measured case (data pass, section 4): the model answers one
    // question in two places in the reply and quotes both sentences back as
    // one answer. Every word is literally in the reply, in order, so the
    // badge may honestly say so.
    const answer =
      "Your read on the second source is sharper than mine was at that point. What would you expect to see if you logged the counter on each pass?";
    expect(replyContainsAnswer(REPLY, answer)).toBe(true);
  });

  it("matches an answer that elides its own middle", () => {
    const answer = "The loop runs twice because the outer iterator is re-entered... which is easy to miss when the log only prints once.";
    expect(replyContainsAnswer(REPLY, answer)).toBe(true);
  });

  it("does not match two unrelated fragments lying far apart in a long reply", () => {
    // VERIFY PASS: the sentence-by-sentence path (attempt 3) would otherwise
    // accept any two sentences that both happen to appear in order, however
    // little they have to do with each other or with the question.
    const longReply = [
      "First, the rubric is unchanged.",
      "The reading list moved a week later, which is why the schedule looks odd,",
      "and the group sign-up sheet is the same one from the first week.",
      "None of that affects how the second source is weighted in the argument.",
      "That is the part I would push on, honestly.",
    ].join(" ");
    const answer = "First, the rubric is unchanged. That is the part I would push on, honestly.";
    expect(replyContainsAnswer(longReply, answer)).toBe(false);
  });

  it("still matches two sentences separated by a normal amount of reply", () => {
    // The spread bound must not break the case attempt 3 exists for - a
    // model answering one question in two places a clause or two apart.
    const reply =
      "The loop runs twice for one reason. It is worth saying plainly, because the log hides it. The outer iterator is re-entered before the inner one drains.";
    const answer = "The loop runs twice for one reason. The outer iterator is re-entered before the inner one drains.";
    expect(replyContainsAnswer(reply, answer)).toBe(true);
  });

  it("does not match when only some of the answer's sentences are in the reply", () => {
    const answer =
      "Your read on the second source is sharper than mine was at that point. The profiler will show you the same thing from the other side.";
    expect(replyContainsAnswer(REPLY, answer)).toBe(false);
  });

  it("does not match when the answer's sentences appear in the reply out of order", () => {
    const answer =
      "What would you expect to see if you logged the counter on each pass? Your read on the second source is sharper than mine was at that point.";
    expect(replyContainsAnswer(REPLY, answer)).toBe(false);
  });

  it("does not treat one question's answer as another's", () => {
    expect(replyContainsAnswer(REPLY, "What would you expect to see if you logged the counter")).toBe(true);
    expect(replyContainsAnswer(REPLY, "What would you expect the profiler to report on each pass")).toBe(
      false
    );
  });

  it("is false for an empty or whitespace-only answer", () => {
    expect(replyContainsAnswer(REPLY, "")).toBe(false);
    expect(replyContainsAnswer(REPLY, "   \n\n  ")).toBe(false);
  });

  it("is false for an empty reply", () => {
    expect(replyContainsAnswer("", "The loop runs twice because the outer iterator")).toBe(false);
  });

  it("is false for an answer below the locatable floor, even when literally present", () => {
    const shortAnswer = "It does.";
    expect(shortAnswer.length).toBeLessThan(MIN_LOCATABLE_ANSWER_CHARS);
    expect(replyContainsAnswer("It does. That is the whole of it.", shortAnswer)).toBe(false);
  });

  it("is false when the answer is longer than the reply", () => {
    expect(replyContainsAnswer("The loop runs twice.", REPLY)).toBe(false);
  });
});
