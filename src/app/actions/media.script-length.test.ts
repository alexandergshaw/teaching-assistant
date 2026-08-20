import { describe, it, expect, vi, beforeEach } from "vitest";

// Coverage for generateLectureScriptAction's length handling
// (src/app/actions/media.ts), fixing a defect that shipped:
//
// The action resolved its argument as
//   Number.isFinite(x) && x >= 1 && x <= 30 ? Math.round(x) : 5
// so an out-of-range value did NOT clamp to the nearest bound - it fell
// through to the DEFAULT of 5. steps.media.ts's "generate-lecture-script"
// step passed 50, so that step produced ~700-word, 5-minute scripts while its
// own run form said "Default 50". Nothing reported the substitution.
//
// The fix has two halves, and this file pins both, because fixing only the
// first would move the silent mismatch rather than remove it:
//   1. out of range is an ERROR, never a substitution
//   2. maxOutputTokens FOLLOWS the requested length - the old fixed 4096
//      truncated anything past roughly 22 minutes even when the minutes
//      themselves were accepted
//
// The pure bounds logic is tested directly in
// src/lib/lecture-script-bounds.test.ts; this file tests that the ACTION
// actually honours it, and that the refusal happens BEFORE the LLM call so a
// bad length costs nothing.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/lib/office-edit", () => ({
  parseOfficeParagraphs: vi.fn(),
}));

vi.mock("./shared", () => ({
  extractTextbookInfoFromImages: vi.fn(),
  getWritingStyleBlock: vi.fn(),
  jsonObjectSlice: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  callLlm: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./shared";
import { callLlm } from "@/lib/llm";
import {
  LECTURE_SCRIPT_MAX_MINUTES,
  LECTURE_SCRIPT_MIN_MINUTES,
  lectureScriptMaxOutputTokens,
  lectureScriptWordTarget,
} from "@/lib/lecture-script-bounds";
import { generateLectureScriptAction } from "./media";

const OWNER = { id: "owner-1", email: "owner@example.com" };

const TOPIC = "Recursion";
const OBJECTIVES = "Base cases, the call stack, and when to prefer iteration.";

function mockScriptResponse(text = "Here is the script.") {
  vi.mocked(callLlm).mockResolvedValue({ ok: true, status: 200, text } as never);
}

/** The generationConfig the action sent on its most recent LLM call. */
function lastGenerationConfig() {
  const calls = vi.mocked(callLlm).mock.calls;
  return calls[calls.length - 1]?.[0].generationConfig;
}

/** The single prompt string the action sent on its most recent LLM call. */
function lastPromptText(): string {
  const calls = vi.mocked(callLlm).mock.calls;
  const parts = calls[calls.length - 1]?.[0].contents[0]?.parts ?? [];
  return parts.map((p) => ("text" in p ? p.text : "")).join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.mocked(getWritingStyleBlock).mockResolvedValue("" as never);
  mockScriptResponse();
});

describe("generateLectureScriptAction - out-of-range length", () => {
  it("REFUSES the 50 the workflow step used to pass, instead of silently writing 5 minutes", async () => {
    const result = await generateLectureScriptAction(TOPIC, OBJECTIVES, 50);

    expect(result).toHaveProperty("error");
    if (!("error" in result)) throw new Error("expected a refusal");
    expect(result.error).toContain("50");
    expect(result.error).toContain(String(LECTURE_SCRIPT_MAX_MINUTES));
  });

  it("refuses BEFORE spending an LLM call, so a bad length costs nothing", async () => {
    await generateLectureScriptAction(TOPIC, OBJECTIVES, 50);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("refuses every out-of-range length rather than substituting one", async () => {
    for (const minutes of [0, -5, 31, 45, 120, Number.NaN, Number.POSITIVE_INFINITY]) {
      vi.clearAllMocks();
      vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
      vi.mocked(getWritingStyleBlock).mockResolvedValue("" as never);
      mockScriptResponse();

      const result = await generateLectureScriptAction(TOPIC, OBJECTIVES, minutes);
      expect(result, `${minutes} minutes`).toHaveProperty("error");
      expect(callLlm, `${minutes} minutes`).not.toHaveBeenCalled();
    }
  });

  it("still refuses an empty topic first, unchanged", async () => {
    const result = await generateLectureScriptAction("   ", OBJECTIVES, 10);
    expect(result).toHaveProperty("error");
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("generateLectureScriptAction - accepted length", () => {
  it("asks the model for the word count the CALLER requested, not a default", async () => {
    await generateLectureScriptAction(TOPIC, OBJECTIVES, 20);

    const prompt = lastPromptText();
    // 20 minutes -> 2800 words. The old code would have produced 700 here.
    expect(prompt).toContain(String(lectureScriptWordTarget(20)));
    expect(prompt).toContain("20 minutes");
    expect(prompt).not.toContain(String(lectureScriptWordTarget(5)));
  });

  it("accepts both bounds", async () => {
    for (const minutes of [LECTURE_SCRIPT_MIN_MINUTES, LECTURE_SCRIPT_MAX_MINUTES]) {
      vi.clearAllMocks();
      vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
      vi.mocked(getWritingStyleBlock).mockResolvedValue("" as never);
      mockScriptResponse();

      const result = await generateLectureScriptAction(TOPIC, OBJECTIVES, minutes);
      expect(result, `${minutes} minutes`).toHaveProperty("script");
      expect(lastPromptText(), `${minutes} minutes`).toContain(String(lectureScriptWordTarget(minutes)));
    }
  });

  it("passes the objectives through to the prompt", async () => {
    await generateLectureScriptAction(TOPIC, OBJECTIVES, 10);
    expect(lastPromptText()).toContain(OBJECTIVES);
    expect(lastPromptText()).toContain(TOPIC);
  });
});

describe("generateLectureScriptAction - token budget", () => {
  it("SIZES THE BUDGET TO THE LENGTH, so a long script is not truncated at 4096", async () => {
    await generateLectureScriptAction(TOPIC, OBJECTIVES, LECTURE_SCRIPT_MAX_MINUTES);

    const config = lastGenerationConfig();
    expect(config?.maxOutputTokens).toBe(lectureScriptMaxOutputTokens(LECTURE_SCRIPT_MAX_MINUTES));
    // The regression guard: the old fixed value cannot render this length.
    expect(config?.maxOutputTokens).toBeGreaterThan(4096);
  });

  it("gives a longer script a larger budget than a shorter one", async () => {
    await generateLectureScriptAction(TOPIC, OBJECTIVES, 5);
    const short = lastGenerationConfig()?.maxOutputTokens ?? 0;

    await generateLectureScriptAction(TOPIC, OBJECTIVES, 30);
    const long = lastGenerationConfig()?.maxOutputTokens ?? 0;

    expect(long).toBeGreaterThan(short);
  });

  it("leaves temperature alone", async () => {
    await generateLectureScriptAction(TOPIC, OBJECTIVES, 10);
    expect(lastGenerationConfig()?.temperature).toBe(0.6);
  });
});

describe("generateLectureScriptAction - unchanged behaviour", () => {
  it("returns the trimmed script on success", async () => {
    mockScriptResponse("  A script with surrounding whitespace.  ");
    const result = await generateLectureScriptAction(TOPIC, OBJECTIVES, 10);
    expect(result).toEqual({ script: "A script with surrounding whitespace." });
  });

  it("errors when the model returns nothing usable", async () => {
    mockScriptResponse("   ");
    const result = await generateLectureScriptAction(TOPIC, OBJECTIVES, 10);
    expect(result).toHaveProperty("error");
  });
});
