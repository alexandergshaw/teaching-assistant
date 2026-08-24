// docs/current-events-assignment-from-modules-acceptance-criteria.md, section
// 3b: generateCurrentEventsAssignmentForModule - shaped exactly like
// intro-discussion-generator.test.ts, whose mocking shape this file mirrors:
// callLlm is mocked as a whole module export, never a network call.
//
// The single most important property tested here is W7: the model is never
// told a due date or a point value at all (they are not fields on this
// context), and any date/points/length line it hallucinates anyway - or any
// angle bracket it emits - is stripped before the body is returned. That
// guarantee is what makes it safe for the caller (1E) to append its own
// authoritative deadline/points/length block without ever producing two
// drifting copies of the same fact.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { CURRENT_EVENTS_RECENCY_WINDOW } from "@/lib/current-events-assignment";
import {
  generateCurrentEventsAssignmentForModule,
  type CurrentEventsAssignmentContext,
} from "./current-events-assignment-generator";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

const okResponse = (text: string) => ({ ok: true, status: 200, body: "", text }) as never;

/** A minimal, valid context. Every field a test cares about is overridden
 *  explicitly; every other field is a plausible, realistic default so a test
 *  reads as "what changed", not "what the whole fixture looks like". */
function makeContext(
  overrides: Partial<CurrentEventsAssignmentContext> = {}
): CurrentEventsAssignmentContext {
  return {
    courseName: "Intro to Project Management",
    courseCode: "MGT 422",
    description: "A survey of project management fundamentals.",
    topicOutline: "Stakeholder analysis, scheduling, risk registers.",
    institution: "State University",
    moduleName: "Module 3: Scheduling",
    moduleTopic: "Critical path scheduling",
    itemTitles: ["Reading: Gantt charts", "Video: Critical path method"],
    recencyWindow: "in the last 30 days",
    lengthTarget: "3-4 paragraphs (roughly 300-500 words)",
    ...overrides,
  };
}

describe("generateCurrentEventsAssignmentForModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // provider "embedded": deterministic short-circuit, no model call at all.
  // Sabotage: removed the early `if (provider === "embedded") return ...`
  // branch - the test failed because callLlm was called (toHaveBeenCalled()
  // became true). Restored, green again.
  it("provider 'embedded' short-circuits deterministically with no model call", async () => {
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "embedded");
    expect(callLlm).not.toHaveBeenCalled();
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body.length).toBeGreaterThan(0);
    expect(result.body).toContain(context.moduleTopic);
  });

  // AC12/W10: the module's own name, topic, item titles, and the course's
  // institution all reach the prompt sent to the model - the whole point of
  // per-module grounding. Sabotage: replaced buildModuleContextBlock's
  // itemTitles line with a fixed "(omitted)" placeholder - the test failed
  // because "Reading: Gantt charts" / "Video: Critical path method" were no
  // longer in the prompt. Restored, green again. (moduleTopic itself is
  // interpolated in two places in the final prompt - the context block AND
  // the body's own "relates to this module's topic" sentence - so removing
  // only the context-block copy alone did not turn this test red; item
  // titles have exactly one call site, which is why that is the line pinned
  // here as the sabotage target.)
  it("grounds the prompt in this module's own name, topic, item titles, and institution", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("A fine assignment prompt."));
    const context = makeContext();
    await generateCurrentEventsAssignmentForModule(context, "gemini");
    const prompt = promptFromCall();
    expect(prompt).toContain(context.moduleName);
    expect(prompt).toContain(context.moduleTopic);
    expect(prompt).toContain("Reading: Gantt charts");
    expect(prompt).toContain("Video: Critical path method");
    expect(prompt).toContain(context.institution as string);
  });

  // AC10: recency is passed through from context.recencyWindow, never a
  // hardcoded literal. Sabotage: hardcoded the prompt's recency phrase to the
  // literal string "in the last 30 days" instead of interpolating
  // `context.recencyWindow` - the test failed when recencyWindow was
  // overridden to a different phrase and that phrase was absent from the
  // prompt. Restored, green again.
  it("uses the passed recencyWindow value, not a hardcoded literal", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("A fine assignment prompt."));
    const context = makeContext({ recencyWindow: "since the start of this term" });
    await generateCurrentEventsAssignmentForModule(context, "gemini");
    const prompt = promptFromCall();
    expect(prompt).toContain("since the start of this term");
    expect(prompt).not.toContain("in the last 30 days");
  });

  // Finding 1 (step 10c review): the embedded scaffold and the model prompt
  // both interpolate context.recencyWindow directly after "development" with
  // no preposition of their own, so grammar here depends entirely on the
  // CALLER supplying a value that already carries one - and the production
  // constant is the one value this test suite had never actually exercised
  // (every prior test here overrides recencyWindow with a hand-written,
  // already-grammatical fixture). Sabotage: temporarily set this test's
  // context to `recencyWindow: "the last 30 days"` (no leading "in", the
  // shape CURRENT_EVENTS_RECENCY_WINDOW itself shipped with before the
  // step-10c fix) - both assertions below failed because the rendered text
  // read "development the last 30 days that relates". Restored to the real
  // imported constant, green again.
  it("renders grammatically in the embedded scaffold using the real CURRENT_EVENTS_RECENCY_WINDOW constant, not a fixture", async () => {
    const context = makeContext({ recencyWindow: CURRENT_EVENTS_RECENCY_WINDOW });
    const result = await generateCurrentEventsAssignmentForModule(context, "embedded");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).toContain(`development ${CURRENT_EVENTS_RECENCY_WINDOW} that relates`);
  });

  it("renders grammatically in the model prompt using the real CURRENT_EVENTS_RECENCY_WINDOW constant, not a fixture", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("A fine assignment prompt."));
    const context = makeContext({ recencyWindow: CURRENT_EVENTS_RECENCY_WINDOW });
    await generateCurrentEventsAssignmentForModule(context, "gemini");
    const prompt = promptFromCall();
    expect(prompt).toContain(`development ${CURRENT_EVENTS_RECENCY_WINDOW} that relates`);
  });

  // W7 backstop: a model response that states a point value is stripped
  // before it reaches the returned body. Sabotage: commented out the
  // `looksLikeDateOrPointsStatement` check inside stripForbiddenRestatements'
  // filter (kept only the lengthNeedle check) - the test failed because the
  // points line survived into result.body. Restored, green again.
  it("strips a model-hallucinated point value from the response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(
        "Find a recent news item related to this module.\nThis assignment is worth 20 points.\nConnect it back to what we covered."
      )
    );
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).not.toMatch(/\bpoints?\b/i);
  });

  // Finding 2 (step 10c review), genuine-restatement direction: a due
  // sentence carrying an actual date signal (a weekday, here) alongside the
  // due-phrase word must still be stripped. Sabotage: reverted
  // looksLikeDateOrPointsStatement to unconditionally return true on
  // DUE_PHRASE_RE alone (dropping the hasDateSignal/CLOCK_TIME_RE
  // requirement) - this test still passed on its own (a superset regex
  // still catches genuine restatements), which is exactly why the
  // false-positive tests below are the ones that prove the fix; restored
  // regardless, green again.
  it("strips a model-hallucinated due date stated with a weekday and a clock time", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(
        "Find a recent news item related to this module.\nThis assignment is due Sunday, October 11 at 11:59 PM.\nConnect it back to what we covered."
      )
    );
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).not.toMatch(/is due sunday/i);
  });

  // Finding 2 (step 10c review), false-positive direction: the original,
  // broader DUE_PHRASE_RE and POINTS_STATEMENT_RE deleted these three lines
  // outright even though none of them restates a due date or a point value -
  // they are ordinary parts of the AC9 citation instructions and the
  // connect-back instructions this generator is asked to write. Sabotage:
  // reverted looksLikeDateOrPointsStatement's due-phrase branch to fire on
  // DUE_PHRASE_RE alone (no date-signal requirement) and POINTS_STATEMENT_RE
  // to drop its negative-lookahead preposition guard - all three assertions
  // below failed (each line was stripped from result.body). Restored, green
  // again.
  it("does NOT strip lines that merely mention 'date', 'submit' or 'points' in a non-grading sense", async () => {
    const survivingLines = [
      "Submit your response along with the date the article was published.",
      "Your submitted work should be based on an article published by a reputable outlet.",
      "Identify 3 points of connection between the news item and the module.",
    ];
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(["Find a recent news item related to this module.", ...survivingLines].join("\n"))
    );
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    for (const line of survivingLines) {
      expect(result.body).toContain(line);
    }
  });

  // W7 backstop: a model response that states a due date is stripped.
  // Sabotage: same filter disabled as above - the test failed because the
  // due-date line survived into result.body. Restored, green again.
  it("strips a model-hallucinated due date from the response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(
        "Find a recent news item related to this module.\nThis is due on Friday, October 10 at 11:59pm.\nConnect it back to what we covered."
      )
    );
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).not.toMatch(/due on friday/i);
  });

  // W7 backstop: a model response that restates the exact lengthTarget
  // string verbatim is stripped. Sabotage: removed the `lengthNeedle` branch
  // from stripForbiddenRestatements' filter - the test failed because the
  // length line survived into result.body. Restored, green again.
  it("strips a model line that restates the length target verbatim", async () => {
    const context = makeContext({ lengthTarget: "3-4 paragraphs (roughly 300-500 words)" });
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse(
        `Find a recent news item related to this module.\nWrite ${context.lengthTarget} in response.\nConnect it back to what we covered.`
      )
    );
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).not.toContain(context.lengthTarget);
  });

  // W5: a response containing angle brackets is cleaned, since
  // descriptionToHtml treats "<letter ... >" as a pass-through HTML branch
  // rather than escaping it. Sabotage: removed the `stripAngleBrackets` call
  // from the success path - the test failed because "<b>" survived into
  // result.body. Restored, green again.
  it("strips angle brackets from the model response", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse("Find a <b>recent</b> news item and connect it back to this module.")
    );
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).not.toContain("<");
    expect(result.body).not.toContain(">");
  });

  // A response that strips down to nothing is an ERROR, not an empty
  // success. Sabotage: changed the final `if (!strippedBody)` guard to
  // `if (false)` - the test failed because the call returned a body (empty
  // string) instead of an error. Restored, green again.
  it("returns an error, not an empty success, when the response is empty after stripping", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse("This is due on Friday, October 10 at 11:59pm.")
    );
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain(context.moduleName);
  });

  // AC15: every failure path names the module so a per-module failure never
  // collapses into an indistinguishable state. Sabotage: replaced
  // `context.moduleName` with a hardcoded string in the HTTP-error message -
  // the test failed because the module name was absent from result.error.
  // Restored, green again.
  it("names the module in an LLM HTTP error", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: false,
      status: 500,
      body: "server error",
      text: "",
    } as never);
    const context = makeContext({ moduleName: "Module 7: Ethics in AI" });
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain("Module 7: Ethics in AI");
  });

  // AC15: an empty model response is also named and never throws.
  it("names the module and returns an error for an empty model response, never throwing", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(okResponse("   "));
    const context = makeContext({ moduleName: "Module 9: Wrap-up" });
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain("Module 9: Wrap-up");
  });

  // The happy path: a clean model response survives intact and reaches the
  // caller unmodified apart from trimming.
  it("returns the model's body unmodified when it contains no forbidden content", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      okResponse("Find a recent news item related to critical path scheduling and connect it back to this module.")
    );
    const context = makeContext();
    const result = await generateCurrentEventsAssignmentForModule(context, "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.body).toContain("critical path scheduling");
  });
});
