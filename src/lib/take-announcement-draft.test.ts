import { describe, it, expect } from "vitest";
import {
  finalizeTakeDraft,
  EMBEDDED_DRAFT_REFUSAL,
  BLANK_DRAFT_ERROR,
  type FinalizeResult,
} from "./take-announcement-draft";
import { buildTakeAnnouncementInstruction, type TakeAnnouncementContext } from "./take-announcement";
import { scaffoldAnnouncement } from "./embedded/communication";

// Frozen copy literals: the spelling IS the fact for these.
const LEAD = "Write a short announcement for students about this recording";
const TRANSCRIPT_MARKER = "TRANSCRIPT:";
const CTX: TakeAnnouncementContext = { takeName: "Take 1", durationSec: 90 };
const KEPT_URL = "https://canvas.example.edu/courses/5/assignments/9";
const INVENTED_URL = "https://totally-invented.example/handout";
const T_WITH_URL = `Today we covered loops. The lab is at ${KEPT_URL} due Friday.`;

function run(
  raw: Parameters<typeof finalizeTakeDraft>[0],
  provider: "gemini" | "other" | "embedded" = "gemini"
): FinalizeResult {
  return finalizeTakeDraft(raw, { provider, transcript: T_WITH_URL, context: CTX });
}

describe("ARC-D2: the embedded draft is never the prompt", () => {
  // INFO-B: the gemini/other arm of this requirement has no buildable
  // instrument here - the model does not deterministically emit the prompt,
  // and mocking Gemini to do so would be a tautology. Only the measured
  // embedded defect is instrumented.
  const input = scaffoldAnnouncement(buildTakeAnnouncementInstruction(T_WITH_URL, CTX));

  it("precondition: the real embedded scaffold really carries the prompt (keeps the mutant alive)", () => {
    expect(input.title).toContain(LEAD);
    expect(input.message).toContain(TRANSCRIPT_MARKER);
  });

  it("refuses the embedded scaffold with the embedded refusal", () => {
    const result = finalizeTakeDraft(input, { provider: "embedded", transcript: T_WITH_URL, context: CTX });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(EMBEDDED_DRAFT_REFUSAL);
  });

  it("if a draft were ever ok, it must not contain the prompt text", () => {
    const result = finalizeTakeDraft(input, { provider: "embedded", transcript: T_WITH_URL, context: CTX });
    if (result.ok) {
      expect(result.title).not.toContain(LEAD);
      expect(result.message).not.toContain(LEAD);
      expect(result.title).not.toContain(TRANSCRIPT_MARKER);
      expect(result.message).not.toContain(TRANSCRIPT_MARKER);
    }
  });
});

describe("ARC-D1: a blank model result never reaches review", () => {
  const values: ReadonlyArray<{ label: string; value: string; blank: boolean }> = [
    { label: "empty", value: "", blank: true },
    { label: "whitespace", value: " \n\t ", blank: true },
    { label: "present", value: "Hello class", blank: false },
  ];
  for (const t of values) {
    for (const m of values) {
      it(`title ${t.label} x message ${m.label}`, () => {
        const result = run({ title: t.value, message: m.value }, "gemini");
        if (t.blank || m.blank) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error).toBe(BLANK_DRAFT_ERROR);
        } else {
          expect(result.ok).toBe(true);
        }
      });
    }
  }

  it("the blank error matches the walkthrough drafter's copy byte for byte", () => {
    expect(BLANK_DRAFT_ERROR).toBe("Generated announcement is empty. Try again.");
  });
});

describe("ARC-D3 + ARC-L1: invented URL stripped, transcript URL kept", () => {
  const raw = {
    title: "Lab reminder",
    message: `Please see ${KEPT_URL} and also ${INVENTED_URL} before Friday.`,
  };

  it("strips the invented URL", () => {
    const result = run(raw, "gemini");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).not.toContain(INVENTED_URL);
  });

  it("keeps the transcript URL byte for byte", () => {
    const result = run(raw, "gemini");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toContain(KEPT_URL);
  });
});

describe("error passthrough", () => {
  it("passes the action's own error through unchanged", () => {
    const result = run({ error: "Draft failed: HTTP 500" }, "gemini");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("Draft failed: HTTP 500");
  });
});
