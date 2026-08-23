// A5 (docs/intro-discussion-from-modules-acceptance-criteria.md, AC17-AC19c):
// generateIntroDiscussionForSelection - shaped exactly like
// generateLearningResourcesForSelection (learning-resources-generator.test.ts),
// whose mocking shape this file mirrors: callLlm is mocked as a whole module
// export, never a network call.
//
// The single most important property tested here is AC20: the two deadline
// sentences and the "reply to N classmates" requirement are APPENDED BY CODE
// after the model's prose, so they are present even when the model's own
// response mentions neither. That guarantee, and only that guarantee, is what
// makes the rest of this feature safe to ship - a model that forgets the
// dates costs nothing.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import {
  generateIntroDiscussionForSelection,
  type IntroDiscussionContext,
} from "./intro-discussion-generator";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const okResponse = (text: string) => ({ ok: true, status: 200, body: "", text }) as never;

/** A minimal, valid context. Every field a test cares about is overridden
 *  explicitly; every other field is a plausible, realistic default so a test
 *  reads as "what changed", not "what the whole fixture looks like". */
function makeContext(overrides: Partial<IntroDiscussionContext> = {}): IntroDiscussionContext {
  return {
    courseName: "Intro to Project Management",
    courseCode: "MGT 422",
    description: "A survey of project management fundamentals.",
    topicOutline: "Stakeholder analysis, scheduling, risk registers.",
    institution: "State University",
    targetModuleName: "Module 3: Scheduling",
    otherModuleNames: ["Module 1: Foundations", "Module 2: Stakeholders", "Module 4: Risk"],
    materialsText: "Assignment: Build a Gantt chart\nCreate a schedule for your project.",
    initialPostDeadlineText: "Thursday, October 9 at 11:59pm",
    repliesDeadlineText: "Sunday, October 12 at 11:59pm",
    requiredReplyCount: 2,
    pointsPossible: 20,
    ...overrides,
  };
}

describe("generateIntroDiscussionForSelection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // provider "embedded": deterministic short-circuit, no model call at all.
  // Sabotage: removed the early `if (provider === "embedded") return ...`
  // branch - the test failed because callLlm was called (toHaveBeenCalled()
  // became true) and the returned title stopped matching the scaffold's
  // fixed "Introduce Yourself: <module>" shape. Restored, green again.
  it("provider 'embedded' short-circuits deterministically with no model call", async () => {
    const context = makeContext();
    const result = await generateIntroDiscussionForSelection(context, "embedded");
    expect(callLlm).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.title).toContain(context.targetModuleName);
    expect(result.message.length).toBeGreaterThan(0);
  });

  // AC20, the load-bearing guarantee: the appended deadlines block is present
  // EVEN WHEN the model's own response omits every deadline and every
  // mention of points. Sabotage: deleted the
  // `[strippedMessage, buildDeadlinesBlock(context)].join("\n\n")` append on
  // the success return (returning `strippedMessage` alone) - the test failed
  // because the deadline/points text was absent from `result.message`.
  // Restored, green again.
  it("appends the deadlines block even when the model response omits every deadline", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(JSON.stringify({ title: "Say Hello!", message: "Tell us about yourself and your career goals." }))
    );
    const context = makeContext();
    const result = await generateIntroDiscussionForSelection(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.message).toContain(context.initialPostDeadlineText);
    expect(result.message).toContain(context.repliesDeadlineText);
    expect(result.message).toContain(`${context.requiredReplyCount}`);
    expect(result.message).toContain(`${context.pointsPossible} points`);
  });

  // Both deadline texts and the reply count appear verbatim in the message,
  // for the embedded path too (no model in the loop at all). Sabotage:
  // changed `context.requiredReplyCount` interpolation in
  // scaffoldIntroDiscussion's body to a hardcoded `2` - the test failed when
  // run with requiredReplyCount: 3 below (the literal "3" was absent from
  // the message). Restored, green again.
  it("both deadline texts and the reply count appear verbatim in the message (embedded)", async () => {
    const context = makeContext({ requiredReplyCount: 3 });
    const result = await generateIntroDiscussionForSelection(context, "embedded");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.message).toContain(context.initialPostDeadlineText);
    expect(result.message).toContain(context.repliesDeadlineText);
    expect(result.message).toContain("3 classmates");
  });

  // AC21: the fallback phrases flow through completely unchanged - this file
  // must never detect or special-case them. Sabotage: wrapped
  // `context.initialPostDeadlineText` in `.toUpperCase()` inside
  // buildDeadlinesBlock - the test failed because the exact-case fallback
  // string was no longer found verbatim. Restored, green again.
  it("the AC21 fallback phrases flow through unchanged", async () => {
    const context = makeContext({
      initialPostDeadlineText: "11:59pm Thursday of this module's week",
      repliesDeadlineText: "11:59pm Sunday of this module's week",
    });
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(JSON.stringify({ title: "Say Hello!", message: "Tell us about yourself." }))
    );
    const result = await generateIntroDiscussionForSelection(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.message).toContain("11:59pm Thursday of this module's week");
    expect(result.message).toContain("11:59pm Sunday of this module's week");
  });

  // An empty-after-stripping response returns {error}, not an empty success.
  // The model's entire "message" is a bare URL, which stripModelUrls removes
  // down to nothing. Sabotage: removed the `if (!strippedMessage) return
  // { error: ... }` guard - the test failed because the call resolved to a
  // success object with a message consisting only of the appended deadlines
  // block, never surfacing an error. Restored, green again.
  it("an empty-after-stripping response returns an error, not an empty success", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(JSON.stringify({ title: "Say Hello!", message: "https://example.com/totally-real-guide" }))
    );
    const context = makeContext();
    const result = await generateIntroDiscussionForSelection(context, "gemini");
    expect("error" in result).toBe(true);
  });

  // A response with no parseable JSON object at all is also an error, not a
  // crash and not an empty success.
  it("an unparseable model response returns an error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("Sure, here is an introduction discussion for you!"));
    const context = makeContext();
    const result = await generateIntroDiscussionForSelection(context, "gemini");
    expect("error" in result).toBe(true);
  });

  // A transport/HTTP failure surfaces as an error with the status code.
  it("an LLM transport failure surfaces as an error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "server exploded" } as never);
    const context = makeContext();
    const result = await generateIntroDiscussionForSelection(context, "gemini");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain("500");
  });

  // The module context (target module name, other module names) actually
  // reaches the prompt sent to the model - AC18. Sabotage: removed the
  // `buildModuleContextBlock(context)` interpolation from the prompt
  // template - the test failed because neither the target module name nor
  // the other module names appeared anywhere in the captured prompt text.
  // Restored, green again.
  it("sends the target module name and every other module name to the model", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(JSON.stringify({ title: "Say Hello!", message: "Tell us about yourself." }))
    );
    const context = makeContext();
    await generateIntroDiscussionForSelection(context, "gemini");
    const prompt = promptFromCall();
    expect(prompt).toContain(context.targetModuleName);
    for (const name of context.otherModuleNames) {
      expect(prompt).toContain(name);
    }
  });

  // The instructor-facing defect this guards against: the model restates a
  // deadline in its own prose IN ADDITION TO the code-appended, authoritative
  // sentence, so the preview (and then the posted discussion) shows the same
  // date twice in different wording - reading as a mistake and inviting the
  // two copies to drift apart under a hand-edit. Asserts on the COUNT of
  // occurrences of the deadline VALUE (a fact, supplied by the test fixture),
  // never on the appended block's own sentence spelling, per this repo's
  // "pin the fact and the ordering, never the spelling" rule.
  //
  // Sabotage: removed the `stripRestatedDeadlineLines` call (passed
  // `(parsed.message ?? "").trim()` straight to `stripModelUrls` as before
  // this fix) - the test failed because `initialPostDeadlineText` occurred
  // twice in `result.message` (once from the model's restated line, once
  // from the appended block) instead of once. Restored, green again.
  it("a model response that restates a deadline does not produce that deadline twice", async () => {
    const context = makeContext();
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(
        JSON.stringify({
          title: "Say Hello!",
          message: [
            "Welcome! Tell us about yourself and your career.",
            `Remember, your post is due ${context.initialPostDeadlineText} - don't be late!`,
          ].join("\n\n"),
        })
      )
    );
    const result = await generateIntroDiscussionForSelection(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const occurrences = (text: string, needle: string) => text.split(needle).length - 1;
    expect(occurrences(result.message, context.initialPostDeadlineText)).toBe(1);
    expect(occurrences(result.message, context.repliesDeadlineText)).toBe(1);
    // The welcome prose survives - only the restated-deadline line was cut.
    expect(result.message).toContain("Welcome! Tell us about yourself and your career.");
  });

  // The same module context reaches the embedded scaffold too, since it is
  // built from the same context object rather than a model prompt.
  it("the embedded scaffold's title and message reference the target module", async () => {
    const context = makeContext();
    const result = await generateIntroDiscussionForSelection(context, "embedded");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.title).toContain(context.targetModuleName);
  });

  // A course with no other modules (a single-module course, or a degraded
  // module-list fetch per W5) still generates successfully - otherModuleNames
  // being empty is a real, expected state, never a reason to fail.
  it("still generates when otherModuleNames is empty", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(JSON.stringify({ title: "Say Hello!", message: "Tell us about yourself." }))
    );
    const context = makeContext({ otherModuleNames: [] });
    const result = await generateIntroDiscussionForSelection(context, "gemini");
    expect("error" in result).toBe(false);
  });
});
