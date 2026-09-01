import { describe, it, expect } from "vitest";
import {
  truncateTranscriptForPrompt,
  buildTakeAnnouncementInstruction,
  TAKE_ANNOUNCEMENT_INSTRUCTION,
  TRANSCRIPT_PROMPT_CAP,
  ANNOUNCEMENT_INGREDIENTS,
  ANNOUNCEMENT_INGREDIENT_LABELS,
  DEFAULT_ANNOUNCEMENT_COMPOSITION,
  type AnnouncementCompositionSettings,
} from "./take-announcement";

describe("truncateTranscriptForPrompt", () => {
  it("returns a transcript at or under the cap completely unchanged", () => {
    const short = "This is a short transcript.";
    expect(truncateTranscriptForPrompt(short, 8000)).toBe(short);
    const exact = "x".repeat(100);
    expect(truncateTranscriptForPrompt(exact, 100)).toBe(exact);
  });

  it("cuts a transcript over the cap at a word boundary and appends the marker", () => {
    const words = "alpha bravo charlie delta echo foxtrot golf hotel india juliet ".repeat(20);
    const cap = 100;
    const result = truncateTranscriptForPrompt(words, cap);
    expect(result.length).toBeLessThanOrEqual(cap);
    expect(result.endsWith("[transcript truncated]")).toBe(true);
    // The text before the marker must not end mid-word: strip the marker and
    // confirm what's left ends exactly where the original had a space, i.e.
    // it is a prefix of a whitespace-joined sequence of whole words.
    const beforeMarker = result.slice(0, result.indexOf(" [transcript truncated]"));
    expect(words.startsWith(beforeMarker)).toBe(true);
    if (beforeMarker.length < words.length) {
      // the character right after the kept text in the source was a space,
      // i.e. we cut between words, not inside one.
      expect(words[beforeMarker.length]).toBe(" ");
    }
  });

  it("never exceeds the cap even accounting for the marker", () => {
    const long = "word ".repeat(5000);
    const result = truncateTranscriptForPrompt(long, TRANSCRIPT_PROMPT_CAP);
    expect(result.length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_CAP);
  });

  it("defaults to TRANSCRIPT_PROMPT_CAP (8000)", () => {
    expect(TRANSCRIPT_PROMPT_CAP).toBe(8000);
    const long = "x".repeat(TRANSCRIPT_PROMPT_CAP * 2);
    expect(truncateTranscriptForPrompt(long).length).toBeLessThanOrEqual(TRANSCRIPT_PROMPT_CAP);
  });
});

describe("buildTakeAnnouncementInstruction", () => {
  const baseContext = { takeName: "Take 3", durationSec: 615 };

  it("includes the standing instruction verbatim, at the start", () => {
    const out = buildTakeAnnouncementInstruction("some transcript text", baseContext);
    expect(out.startsWith(TAKE_ANNOUNCEMENT_INSTRUCTION)).toBe(true);
  });

  it("places the standing instruction before the transcript (ordering, not prose)", () => {
    const out = buildTakeAnnouncementInstruction("UNIQUE_TRANSCRIPT_MARKER_TEXT", baseContext);
    const instructionIdx = out.indexOf(TAKE_ANNOUNCEMENT_INSTRUCTION);
    const transcriptIdx = out.indexOf("UNIQUE_TRANSCRIPT_MARKER_TEXT");
    expect(instructionIdx).toBeGreaterThanOrEqual(0);
    expect(transcriptIdx).toBeGreaterThan(instructionIdx);
  });

  it("includes the take name and the transcript text", () => {
    const out = buildTakeAnnouncementInstruction("hello world", baseContext);
    expect(out).toContain("Take 3");
    expect(out).toContain("hello world");
  });

  it("includes optional context fields when provided", () => {
    const out = buildTakeAnnouncementInstruction("t", {
      ...baseContext,
      topic: "Recursion",
      objectives: "Understand base cases",
      cardTitle: "Week 4",
      cardSubtitle: "Recursion basics",
    });
    expect(out).toContain("Recursion");
    expect(out).toContain("Understand base cases");
    expect(out).toContain("Week 4");
    expect(out).toContain("Recursion basics");
  });

  it("omits optional context fields when absent, rather than printing empty labels", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext);
    expect(out).not.toContain("Course topic:");
    expect(out).not.toContain("Learning objectives:");
    expect(out).not.toContain("Recording title card:");
    expect(out).not.toContain("Recording subtitle card:");
  });

  it("truncates an over-cap transcript before including it", () => {
    const longTranscript = "word ".repeat(5000);
    const out = buildTakeAnnouncementInstruction(longTranscript, baseContext);
    expect(out).toContain("[transcript truncated]");
  });
});

// docs/reply-composition-controls-acceptance-criteria.md C0-1 (this group,
// implementer C2): the announcement half of the reply-composition controls.
// Frozen-literal oracles throughout, not values re-derived from the
// implementation - the point is to pin the exact string a person (and the
// model) reads.
describe("buildTakeAnnouncementInstruction - composition (this group's own C-2)", () => {
  const baseContext = { takeName: "Take 3", durationSec: 615 };
  const inert: AnnouncementCompositionSettings = { ingredients: [], formality: "balanced" };

  const PARAGRAPH_REQUIREMENT =
    'If the announcement runs longer than about 60 words, break it into at least two paragraphs, separated by a blank line ("\\n\\n"). Never write it as one unbroken block.';

  it("includes the paragraph requirement unconditionally, even with an inert composition (C0-2/C3)", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, inert);
    expect(out).toContain(PARAGRAPH_REQUIREMENT);
  });

  it("omitting composition entirely is byte-identical to passing the inert default explicitly", () => {
    const withDefault = buildTakeAnnouncementInstruction("some transcript", baseContext);
    const withExplicitInert = buildTakeAnnouncementInstruction("some transcript", baseContext, inert);
    expect(withDefault).toBe(withExplicitInert);
  });

  it("zero ingredients selected omits the ingredients block entirely (C2c, transferred)", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, inert);
    expect(out).not.toContain("IN ADDITION, WHERE IT FITS");
  });

  it("'balanced' formality contributes NO extra text at all - full frozen-literal output", () => {
    // A prior version of this test compared two calls that both defaulted to
    // "balanced" formality - a tautology, since both sides are identical no
    // matter what the code does, even a regression that adds a stray clause
    // to the balanced branch itself. This pins the exact, complete string
    // instead, so any unexpected addition fails loudly here.
    const out = buildTakeAnnouncementInstruction("hello world", { takeName: "Take X", durationSec: 90 });
    const expected = [
      TAKE_ANNOUNCEMENT_INSTRUCTION,
      "",
      PARAGRAPH_REQUIREMENT,
      "",
      'This is a transcript of a screen recording titled "Take X" (1 minute 30 seconds long), made by an instructor for their students. Draft the announcement from this transcript - it is source material, not the announcement itself.',
      "",
      "TRANSCRIPT:",
      "hello world",
    ].join("\n");
    expect(out).toBe(expected);
  });

  it("'casual' formality adds its own clause, verbatim", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, { ingredients: [], formality: "casual" });
    expect(out).toContain(
      "Lean casual in how you write this: contractions are fine, favor shorter sentences and everyday word choices - without abandoning the warmth and clarity already asked for above."
    );
    expect(out).not.toContain("Lean formal in how you write this");
  });

  it("'formal' formality adds its own clause, verbatim", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, { ingredients: [], formality: "formal" });
    expect(out).toContain(
      "Lean formal in how you write this: avoid contractions, favor fuller sentences and more precise, exact word choices - without abandoning the warmth and clarity already asked for above."
    );
    expect(out).not.toContain("Lean casual in how you write this");
  });

  it("selecting 'insight' adds its clause and nothing about resources", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, { ingredients: ["insight"], formality: "balanced" });
    expect(out).toContain(
      "Where it fits naturally, add one relevant insight or connection beyond what the transcript explicitly says"
    );
    expect(out).not.toContain("If the transcript names any specific resource");
  });

  it("selecting 'resources' adds its clause and nothing about insight, and never invites an invented link", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, { ingredients: ["resources"], formality: "balanced" });
    expect(out).toContain("If the transcript names any specific resource, reading, tool or link, remind students of it");
    expect(out).toContain("Do not invent or write any resource, reading or link that is not already named");
    expect(out).not.toContain("Where it fits naturally, add one relevant insight");
  });

  it("omitting BOTH ingredients selected still emits every clause for every selected ingredient (order matches selection order)", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, {
      ingredients: ["insight", "resources"],
      formality: "balanced",
    });
    const insightIdx = out.indexOf("Where it fits naturally, add one relevant insight");
    const resourcesIdx = out.indexOf("If the transcript names any specific resource");
    expect(insightIdx).toBeGreaterThan(-1);
    expect(resourcesIdx).toBeGreaterThan(insightIdx);
  });

  it("'compliment', 'deeper-question' and 'correction' are not reachable ingredient values here (type-level omission, exercised at the constants)", () => {
    expect(ANNOUNCEMENT_INGREDIENTS).toEqual(["insight", "resources"]);
    expect(Object.keys(ANNOUNCEMENT_INGREDIENT_LABELS).sort()).toEqual(["insight", "resources"]);
  });

  it("DEFAULT_ANNOUNCEMENT_COMPOSITION is not inert (C4b-i, transferred): both ingredients pre-selected, formality balanced", () => {
    expect(DEFAULT_ANNOUNCEMENT_COMPOSITION).toEqual({ ingredients: ["insight", "resources"], formality: "balanced" });
  });

  it("a real composition produces a materially different instruction than the inert default", () => {
    const out = buildTakeAnnouncementInstruction("t", baseContext, DEFAULT_ANNOUNCEMENT_COMPOSITION);
    expect(out).not.toBe(buildTakeAnnouncementInstruction("t", baseContext, inert));
  });
});
