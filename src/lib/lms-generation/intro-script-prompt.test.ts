// TDD-style pinning for composeModuleIntroScriptPrompt (docs/module-intro-
// video-script-acceptance-criteria.md, M6/M7/M8). This is the seam that
// makes the module-intro re-gear testable at all: vitest here is node-env
// and collects only src/**/*.test.ts, so no component ever renders, and a
// prompt built inside a "use server" action (generateModuleIntroScriptAction,
// src/app/actions/media.ts) is unreachable from any test. This function is
// pure precisely so that seam exists.
//
// Per this repo's own history (two prior source-text assertions that
// over-specified and forced contorted implementations), these tests pin the
// FACT and the ORDERING - never the exact spelling of a sentence - with two
// deliberate exceptions: the "Target length" sentence and the numbered-list
// markers are themselves the facts under test (see the comments at each), so
// pinning enough of their literal text to be sensitive to deletion is the
// point, not over-specification.
import { describe, it, expect, vi } from "vitest";
import { composeModuleIntroScriptPrompt, type ModuleIntroScriptPromptInput } from "./intro-script-prompt";

const baseInput: ModuleIntroScriptPromptInput = {
  courseName: "Introduction to Cybersecurity",
  moduleLabel: "Week 2: Historical Cyber Attacks",
  materialsText:
    "Assignment 1: Historical Cyber Attacks - analyze a past breach and its impact.\n" +
    "Quiz 1: The Growing Threat - 10 questions on the week's readings.\n" +
    "Unit 2 Chapter: Historical Cyber Attacks - covers the Morris Worm, ILOVEYOU, and Stuxnet.",
  minutes: 2,
  styleBlock: "",
};

describe("composeModuleIntroScriptPrompt", () => {
  it("states the video introduces the module rather than teaching it", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/introduc/); // "introduction" / "introduces"
    // The prompt must explicitly refuse in-depth teaching, not merely omit
    // encouraging it - "does not teach" (or equivalent) has to be present.
    expect(lower).toMatch(/does not teach|not teach|refuses to teach/);
  });

  it("forbids inventing anything not present in the supplied material", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    expect(prompt.toLowerCase()).toMatch(/invent/);
  });

  it("never contains a [PAUSE] marker, unlike the full lecture-script prompt", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    // Case-insensitive on purpose: this single check subsumes an
    // exact-case-only check (any prompt that fails case-insensitively also
    // fails case-sensitively, but not vice versa), so a separate
    // toContain("[PAUSE]") assertion next to this one would be pure
    // redundancy - the prior version of this test had both.
    expect(prompt.toUpperCase()).not.toContain("[PAUSE]");
  });

  it("does not leave a dangling separator when the style block is empty", () => {
    const prompt = composeModuleIntroScriptPrompt({ ...baseInput, styleBlock: "" });
    expect(prompt.trimEnd()).not.toMatch(/\n\n\s*$/);
    // The prompt should simply end with the materials text, not a trailing
    // blank section.
    expect(prompt.endsWith(baseInput.materialsText)).toBe(true);
  });

  it("appends a non-empty style block last, after the materials", () => {
    const styleBlock = "\n\nMATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE:\nSample sentence.";
    const prompt = composeModuleIntroScriptPrompt({ ...baseInput, styleBlock });
    expect(prompt.endsWith(styleBlock)).toBe(true);
    const materialsIndex = prompt.indexOf(baseInput.materialsText);
    const styleIndex = prompt.indexOf("MATCH THE INSTRUCTOR'S PERSONAL WRITING STYLE");
    expect(materialsIndex).toBeGreaterThan(-1);
    expect(styleIndex).toBeGreaterThan(materialsIndex);
  });

  it("carries both the module label and the course name", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    expect(prompt).toContain(baseInput.courseName);
    expect(prompt).toContain(baseInput.moduleLabel);
  });

  it("includes the materials text verbatim", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    expect(prompt).toContain(baseInput.materialsText);
  });

  it("states the target word count and minute length together", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    // FROZEN LITERAL ORACLE: 2 minutes * 140 words/minute = 280. Computed by
    // hand, not by calling lectureScriptWordTarget (the implementation calls
    // that same function, so a prior version of this test that also called
    // it would move in lockstep with a bug in that function and never catch
    // one). This also used to be `expect(prompt).toContain(String(minutes))`,
    // which passed even with the entire "Target length" line deleted from
    // the implementation - "2" already occurs in the fixture ("Week 2",
    // "Unit 2 Chapter") and in "2. Name two to four things" in the
    // structure block. Requiring "Target length", "280", and "2" to
    // co-occur in this specific template is what makes the assertion
    // actually depend on that line existing.
    expect(prompt).toContain("Target length: about 280 words (2 minutes at a natural speaking pace).");
  });

  it("still works with no course name", () => {
    const prompt = composeModuleIntroScriptPrompt({ ...baseInput, courseName: "" });
    expect(prompt).toContain(baseInput.moduleLabel);
    expect(prompt.toLowerCase()).not.toContain("undefined");
    expect(prompt.toLowerCase()).not.toContain("null");
  });

  it("presents the four structure beats in numeric order", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    // Pins the ORDERING fact (1 before 2 before 3 before 4), not the prose
    // of each beat - looks for the numbered-list markers as they appear in
    // the joined structure block ("\n1. ", "\n2. ", ...).
    const positions = ["1.", "2.", "3.", "4."].map((marker) => prompt.indexOf(`\n${marker} `));
    expect(positions.every((position) => position > -1)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  // ── DEFECT 1: graded-work / "open first" escape hatches ──────────────────
  // A module with no graded work (an orientation, a reading-only week, a
  // review week) previously got an unconditional order to name graded work
  // by title AND an unconditional prohibition on inventing one - a direct
  // contradiction reachable from an ordinary selection. Same problem for
  // "the single thing to open first" against materialsText, which is an
  // unordered flat selection with no "first" recoverable from it.

  it("tells the model to skip the graded-work beat when the material has none, without weakening the anti-invention rule", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/no graded work/);
    expect(lower).toMatch(/skip this beat/);
    // The anti-invention rule must still be there, unconditionally - the
    // escape hatch is permission to OMIT the beat, never to invent content
    // to fill it.
    expect(lower).toMatch(/never invent/);
  });

  it("tells the model to fall back to a general invitation when no opening priority is determinable", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/no such priority is determinable/);
    expect(lower).toMatch(/never guess at an ordering/);
  });

  // ── DEFECT 2: length must scale the structure ─────────────────────────────
  // The four mandated beats (one of which expands to 2-4 items, another to
  // one clause per graded item) over-subscribe the 1-minute/~140-word
  // option. The fix is to tell the model which beats compress and that the
  // length target outranks completeness, not to change the length options
  // themselves (a different file owns those).

  it("tells the model the target length outranks covering everything, and what to compress first", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/target length wins over covering everything/);
    expect(lower).toMatch(/at the shortest lengths/);
  });

  // ── DEFECT 3: generic module label degradation ────────────────────────────
  // src/app/actions/lms-generation.ts falls back to the literal moduleLabel
  // "the selected material" when the caller has no module context. Handed
  // straight through, instruction 1 ("name the module") combined with that
  // literal text produces a script that opens by saying "the selected
  // material" out loud.

  it("degrades gracefully when the module label is the generic caller fallback", () => {
    const generic = composeModuleIntroScriptPrompt({ ...baseInput, moduleLabel: "the selected material" });
    // The composed "Course - Module" join must not read
    // "<course> - the selected material" - that phrase, handed to the model
    // as the thing to preview, is what produces the literal echo.
    expect(generic).not.toContain(`${baseInput.courseName} - the selected material`);
    // The model must be told explicitly that no real module title was
    // supplied, so it draws the opening from the material instead of
    // repeating the placeholder.
    expect(generic.toLowerCase()).toMatch(/no specific module title was provided/);
  });

  it("does not add the generic-label guidance when a real module label is given", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    expect(prompt.toLowerCase()).not.toMatch(/no specific module title was provided/);
  });

  it("is case-insensitive and whitespace-tolerant when detecting the generic module label", () => {
    // Guards the isGenericModuleLabel comparison itself: a caller-side
    // fallback string wrapped in stray whitespace or a different case should
    // still be recognized as generic, not treated as a real title.
    const prompt = composeModuleIntroScriptPrompt({ ...baseInput, moduleLabel: "  THE SELECTED MATERIAL  " });
    expect(prompt.toLowerCase()).toMatch(/no specific module title was provided/);
  });

  // ── WAVE 11B DEFECT 1: beat 2 (outcomes) must not contradict the
  // anti-invention rule ─────────────────────────────────────────────────────
  // Beat 2 used to be an unconditional "name two to four things students
  // will be able to do", with no acknowledgement that a capability-phrased
  // outcome almost never appears verbatim in the source material - reachable
  // by EVERY module, unlike beats 3/4's escape hatches. The fix makes
  // explicit that summarising in the model's own words is allowed, while a
  // capability the material does not support is not.

  it("tells the outcomes beat to summarize in its own words, grounded in what the material supports", () => {
    const prompt = composeModuleIntroScriptPrompt(baseInput);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/in your own words/);
    expect(lower).toMatch(/does not support/);
    // The unconditional anti-invention rule must still be present and
    // untouched by this beat's wording.
    expect(lower).toMatch(/never invent/);
  });

  // ── WAVE 11B DEFECT 2: the generic-label guidance must never put the
  // literal placeholder text in the prompt ──────────────────────────────────
  // The header comment says [PAUSE] is never mentioned, "not even as 'don't
  // use them'", because a negative mention still leaves the literal
  // substring in the prompt. Beat 1 used to violate that same rule for the
  // generic module label by name; the fix removes the negative mention and,
  // separately, stops the `subject` fallback from landing the raw
  // placeholder text in the prompt when neither the course name nor the
  // module label is real.

  it("never puts the literal generic placeholder text in the prompt, even with no course name either", () => {
    const prompt = composeModuleIntroScriptPrompt({
      ...baseInput,
      courseName: "",
      moduleLabel: "the selected material",
    });
    expect(prompt.toLowerCase()).not.toContain("the selected material");
    // Still tells the model no specific title was supplied, just without
    // naming the placeholder text itself.
    expect(prompt.toLowerCase()).toMatch(/no specific module title was provided/);
  });

  // ── WAVE 11B DEFECT 4: GENERIC_MODULE_LABELS must normalize on both sides
  // ───────────────────────────────────────────────────────────────────────
  // isGenericModuleLabel lower-cases the incoming label before comparing it
  // against GENERIC_MODULE_LABELS. That set used to store DEFAULT_MODULE_
  // LABEL raw, matching today only because the constant happens to already
  // be lowercase. This test mocks the constant to a capitalized value so the
  // comparison can only pass if the Set-building side is ALSO normalized -
  // sabotage-checked: reverting the `.toLowerCase()` call on the Set (see
  // GENERIC_MODULE_LABELS above) makes this test fail, because the Set would
  // then contain "the selected material" (mocked, capitalized) verbatim, an
  // exact-cased query and would never match the lower-cased incoming label.

  it("normalizes the generic-label Set itself, not just the incoming label, so a differently-cased constant still matches (defect 4 - asymmetric normalization)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/lms-generation/default-module-label", () => ({
      // Capitalized on purpose - see the test description above for why.
      DEFAULT_MODULE_LABEL: "The Selected Material",
    }));
    const { composeModuleIntroScriptPrompt: composeWithCapitalizedConstant } = await import("./intro-script-prompt");
    const prompt = composeWithCapitalizedConstant({
      ...baseInput,
      moduleLabel: "the selected material", // lower-case incoming label
    });
    expect(prompt.toLowerCase()).toMatch(/no specific module title was provided/);
    vi.doUnmock("@/lib/lms-generation/default-module-label");
    vi.resetModules();
  });
});
