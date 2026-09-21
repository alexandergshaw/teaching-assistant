import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPromptDraftRequest, applyPromptDraftResult } from "./promptAnnouncementDraft";
import {
  type LiveDefaults,
  type ResolvedTemplate,
  type TemplateChoice,
} from "@/app/components/walkthrough-announcement/announcement-draft-slots";
import { EMPTY_ANNOUNCEMENT_OUTLINE, type AnnouncementOutline } from "@/lib/announcement-outline-types";
import type { PromptDraftUiState, PromptAnnouncementDraftResult } from "@/lib/prompt-announcement-types";
import { PROMPT_ANNOUNCEMENT_MAX_CHARS } from "@/lib/prompt-announcement-prompt";

// ── AC-1(d): the leaf routes through the shared vocabulary. ─────────────────

describe("AC-1(d): the leaf calls resolveChoice and promptDraftReceipt", () => {
  it("source text contains both calls, plus buildPromptDraftRequest as an anchor", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/components/canvas-tab/promptAnnouncementDraft.ts"),
      "utf8"
    );
    const stripped = source.replace(/\/\*[^]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    expect(stripped).toContain("buildPromptDraftRequest");
    expect(stripped).toContain("resolveChoice(");
    expect(stripped).toContain("promptDraftReceipt(");
  });
});

// ── AC-18: the chosen template reaches the request. Frozen table, 16 rows. ──

const PASTED_OUTLINE: AnnouncementOutline = {
  sections: [{ index: 1, heading: "Pasted section", break: "heading", listKind: null, sentenceRange: [1, 2] }],
  hasGreeting: false,
  hasSignOff: false,
  dueDateSectionIndex: null,
  todoSectionIndex: null,
  hasLinks: false,
};
const RECENT_OUTLINE: AnnouncementOutline = {
  sections: [{ index: 1, heading: "Recent section", break: "heading", listKind: null, sentenceRange: [1, 2] }],
  hasGreeting: false,
  hasSignOff: false,
  dueDateSectionIndex: null,
  todoSectionIndex: null,
  hasLinks: false,
};
const CHOICE_OUTLINE: AnnouncementOutline = {
  sections: [{ index: 1, heading: "Chosen section", break: "heading", listKind: null, sentenceRange: [1, 2] }],
  hasGreeting: false,
  hasSignOff: false,
  dueDateSectionIndex: null,
  todoSectionIndex: null,
  hasLinks: false,
};

function baseUiState(choice: TemplateChoice, live: LiveDefaults): PromptDraftUiState {
  return {
    promptText: "brief text",
    courseLabel: "PSYC 101",
    choice,
    live,
    provider: "gemini",
    title: "",
    message: "",
    lastResolved: null,
    receipt: "",
    error: null,
  };
}

describe("AC-18: the chosen template and its outline reach the request", () => {
  const CHOICES: Record<TemplateChoice["kind"], TemplateChoice> = {
    default: { kind: "default" },
    pasted: { kind: "pasted" },
    saved: { kind: "saved", exemplarId: "ex-chosen", label: "Midterm note", outline: CHOICE_OUTLINE },
    none: { kind: "none" },
  };
  const LIVES: Record<string, LiveDefaults> = {
    both: { pastedOutline: PASTED_OUTLINE, mostRecent: { id: "ex-recent", label: "Week 3 note", outline: RECENT_OUTLINE } },
    pastedOnly: { pastedOutline: PASTED_OUTLINE, mostRecent: null },
    recentOnly: { pastedOutline: null, mostRecent: { id: "ex-recent", label: "Week 3 note", outline: RECENT_OUTLINE } },
    neither: { pastedOutline: null, mostRecent: null },
  };

  const rows: { choice: TemplateChoice["kind"]; live: string; expectedTemplate: ResolvedTemplate; expectedOutline: AnnouncementOutline }[] = [
    { choice: "default", live: "both", expectedTemplate: { kind: "pasted" }, expectedOutline: PASTED_OUTLINE },
    { choice: "default", live: "pastedOnly", expectedTemplate: { kind: "pasted" }, expectedOutline: PASTED_OUTLINE },
    { choice: "default", live: "recentOnly", expectedTemplate: { kind: "saved", exemplarId: "ex-recent", label: "Week 3 note" }, expectedOutline: RECENT_OUTLINE },
    { choice: "default", live: "neither", expectedTemplate: { kind: "none" }, expectedOutline: EMPTY_ANNOUNCEMENT_OUTLINE },
    { choice: "pasted", live: "both", expectedTemplate: { kind: "pasted" }, expectedOutline: PASTED_OUTLINE },
    { choice: "pasted", live: "pastedOnly", expectedTemplate: { kind: "pasted" }, expectedOutline: PASTED_OUTLINE },
    { choice: "pasted", live: "recentOnly", expectedTemplate: { kind: "pasted" }, expectedOutline: EMPTY_ANNOUNCEMENT_OUTLINE },
    { choice: "pasted", live: "neither", expectedTemplate: { kind: "pasted" }, expectedOutline: EMPTY_ANNOUNCEMENT_OUTLINE },
    { choice: "saved", live: "both", expectedTemplate: { kind: "saved", exemplarId: "ex-chosen", label: "Midterm note" }, expectedOutline: CHOICE_OUTLINE },
    { choice: "saved", live: "pastedOnly", expectedTemplate: { kind: "saved", exemplarId: "ex-chosen", label: "Midterm note" }, expectedOutline: CHOICE_OUTLINE },
    { choice: "saved", live: "recentOnly", expectedTemplate: { kind: "saved", exemplarId: "ex-chosen", label: "Midterm note" }, expectedOutline: CHOICE_OUTLINE },
    { choice: "saved", live: "neither", expectedTemplate: { kind: "saved", exemplarId: "ex-chosen", label: "Midterm note" }, expectedOutline: CHOICE_OUTLINE },
    { choice: "none", live: "both", expectedTemplate: { kind: "none" }, expectedOutline: EMPTY_ANNOUNCEMENT_OUTLINE },
    { choice: "none", live: "pastedOnly", expectedTemplate: { kind: "none" }, expectedOutline: EMPTY_ANNOUNCEMENT_OUTLINE },
    { choice: "none", live: "recentOnly", expectedTemplate: { kind: "none" }, expectedOutline: EMPTY_ANNOUNCEMENT_OUTLINE },
    { choice: "none", live: "neither", expectedTemplate: { kind: "none" }, expectedOutline: EMPTY_ANNOUNCEMENT_OUTLINE },
  ];

  it("has exactly 16 rows (4 choice kinds x 4 live states)", () => {
    expect(rows.length).toBe(16);
  });

  it.each(rows)("choice=$choice live=$live", ({ choice, live, expectedTemplate, expectedOutline }) => {
    const state = baseUiState(CHOICES[choice], LIVES[live]);
    const req = buildPromptDraftRequest(state);
    expect(req.resolvedTemplate).toEqual(expectedTemplate);
    expect(req.outline).toBe(expectedOutline);
    expect(req.promptText).toBe("brief text");
    expect(req.provider).toBe("gemini");
    expect(req.courseLabel).toBe("PSYC 101");
  });

  it("an always-none implementation would mismatch on at least 11 of the 16 rows (control)", () => {
    let mismatches = 0;
    for (const { choice, live, expectedTemplate, expectedOutline } of rows) {
      const state = baseUiState(CHOICES[choice], LIVES[live]);
      const req = buildPromptDraftRequest(state);
      const alwaysNone = { template: { kind: "none" } as ResolvedTemplate, outline: EMPTY_ANNOUNCEMENT_OUTLINE };
      const templateMismatch = JSON.stringify(alwaysNone.template) !== JSON.stringify(expectedTemplate);
      const outlineMismatch = alwaysNone.outline !== expectedOutline;
      if (templateMismatch || outlineMismatch) mismatches += 1;
      // sanity: the real implementation must NOT mismatch against its own expectation
      expect(JSON.stringify(req.resolvedTemplate)).toBe(JSON.stringify(expectedTemplate));
    }
    expect(mismatches).toBeGreaterThanOrEqual(11);
  });
});

// ── AC-21: cap-then-trim, applied on the way out of the panel. ─────────────

describe("AC-21: the cap is applied cap-then-trim, in that order", () => {
  it("(i) an over-cap value with no edge whitespace is cut to exactly the cap", () => {
    const state = baseUiState({ kind: "none" }, { pastedOutline: null, mostRecent: null });
    const over = "x".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS + 500);
    const req = buildPromptDraftRequest({ ...state, promptText: over });
    expect(req.promptText.length).toBe(PROMPT_ANNOUNCEMENT_MAX_CHARS);
  });

  it("(ii) a value at CAP-1 with no edge whitespace is byte-identical", () => {
    const state = baseUiState({ kind: "none" }, { pastedOutline: null, mostRecent: null });
    const exact = "x".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS - 1);
    const req = buildPromptDraftRequest({ ...state, promptText: exact });
    expect(req.promptText).toBe(exact);
  });

  it("(iii) a value with trailing whitespace at the cap boundary is trimmed shorter (does NOT by itself distinguish cap-then-trim from trim-then-cap - see row (iv); both orders produce the identical result here, since the whole string already fits within the cap)", () => {
    const state = baseUiState({ kind: "none" }, { pastedOutline: null, mostRecent: null });
    const withTrailingWs = "x".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS - 2) + "  ";
    const req = buildPromptDraftRequest({ ...state, promptText: withTrailingWs });
    expect(req.promptText.length).toBeLessThan(PROMPT_ANNOUNCEMENT_MAX_CHARS - 1);
  });

  it("(iv) the discriminating row: whitespace landing exactly at the cap CUT POINT of an over-cap string tells cap-then-trim apart from trim-then-cap", () => {
    // The string is far longer than the cap, so it is never trimmed as a
    // whole by a leading/trailing trim - only the boundary the cap itself
    // introduces can expose which operation ran first. Position CAP-1 (the
    // last character kept by slice(0, CAP)) is a space; everything after
    // it is more non-whitespace text.
    const state = baseUiState({ kind: "none" }, { pastedOutline: null, mostRecent: null });
    const overCapWithSpaceAtCutPoint =
      "x".repeat(PROMPT_ANNOUNCEMENT_MAX_CHARS - 1) + " " + "more text that runs well past the cap boundary";
    const req = buildPromptDraftRequest({ ...state, promptText: overCapWithSpaceAtCutPoint });

    // cap-then-trim (shipped): slice(0, CAP) keeps "x"*(CAP-1) + " ", then
    // .trim() removes the trailing space -> length CAP-1, no trailing space.
    // trim-then-cap (the wrong order): trimming the full string first is a
    // no-op (it has no leading/trailing whitespace at all), so the cap then
    // cuts to "x"*(CAP-1) + " " -> length CAP, WITH a trailing space.
    expect(req.promptText.length).toBe(PROMPT_ANNOUNCEMENT_MAX_CHARS - 1);
    expect(req.promptText.endsWith(" ")).toBe(false);
  });
});

// ── AC-20: templateApplied reaches lastResolved/posterFor. ─────────────────

describe("AC-20: applyPromptDraftResult sets lastResolved to null when templateApplied is false", () => {
  const state = baseUiState({ kind: "saved", exemplarId: "e", label: "L", outline: CHOICE_OUTLINE }, { pastedOutline: null, mostRecent: null });

  it("templateApplied: false resets lastResolved to null regardless of carried kind", () => {
    const result: PromptAnnouncementDraftResult = {
      ok: true,
      title: "T",
      message: "M",
      templateApplied: false,
      resolvedTemplate: { kind: "saved", exemplarId: "e", label: "L" },
    };
    const next = applyPromptDraftResult(state, result);
    expect(next.lastResolved).toBeNull();
  });

  it("templateApplied: true echoes the resolved template", () => {
    const result: PromptAnnouncementDraftResult = {
      ok: true,
      title: "T",
      message: "M",
      templateApplied: true,
      resolvedTemplate: { kind: "pasted" },
    };
    const next = applyPromptDraftResult(state, result);
    expect(next.lastResolved).toEqual({ kind: "pasted" });
  });

  it("a failed result leaves lastResolved alone", () => {
    const seeded = { ...state, lastResolved: { kind: "pasted" as const } };
    const next = applyPromptDraftResult(seeded, { ok: false, error: "boom" });
    expect(next.lastResolved).toEqual({ kind: "pasted" });
    expect(next.error).toBe("boom");
  });
});
