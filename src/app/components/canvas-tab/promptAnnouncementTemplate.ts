// A21 (docs/a21-scope.md sections 4.4-4.7, docs/a21-instrument-notes.md
// section 8.3): the pure, testable half of the Announcements panel's
// template-picker and persistence logic. No React, no "use server" - logic
// that needs testing must live in a plain .ts leaf, never inline in a
// .tsx, or it cannot be tested at all (docs/loop/this-repo.md section 2).

import {
  makeSlot,
  optionsForSlot,
  receiptLabel,
  type ResolvedTemplate,
  type TemplateChoice,
  type TemplateOption,
  type TemplateOptionSource,
} from "@/app/components/walkthrough-announcement/announcement-draft-slots";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { PROMPT_ANNOUNCEMENT_MAX_CHARS } from "@/lib/prompt-announcement-prompt";

/**
 * Reuses `optionsForSlot` VERBATIM rather than duplicating the frozen "the
 * option list always contains the current choice" invariant
 * (announcement-draft-slots.ts:236-265). The slot built here is a throwaway:
 * that function reads only `slot.choice` (announcement-draft-slots.ts:283,
 * 285,293), so the id and the timing passed to `makeSlot` are inert
 * (AC-4b proves this rather than asserting it).
 */
export function optionsForChoice(choice: TemplateChoice, src: TemplateOptionSource): readonly TemplateOption[] {
  return optionsForSlot(makeSlot("a21-prompt", choice, "beginning-of-week"), src);
}

type PosterKey = ResolvedTemplate["kind"] | "null";

/** AC-11: the key union is DERIVED from `ResolvedTemplate["kind"] | "null"`,
 * never hand-typed - a hand-typed union does not go TS2741 when upstream
 * gains a fourth kind (measured, docs/a21-instrument-notes.md section 5). */
const POSTER_FOR_KIND: Record<PosterKey, "markdown" | "plaintext"> = {
  none: "plaintext",
  pasted: "markdown",
  saved: "markdown",
  null: "plaintext",
};

/**
 * AC-11/AC-20: the poster is chosen by PROVENANCE, so today's plain-text
 * behaviour is byte-unchanged for `none`/`null`, and a template-matched
 * draft's Markdown structure posts as Markdown. `null` covers a
 * deterministic (Embedded) draft, which carries `templateApplied: false` -
 * `scaffoldAnnouncement` emits no Markdown, so it must never go through the
 * Markdown poster (docs/a21-scope.md section 4.6 point 3).
 */
export function posterFor(resolved: ResolvedTemplate | null): "markdown" | "plaintext" {
  const key: PosterKey = resolved === null ? "null" : resolved.kind;
  return POSTER_FOR_KIND[key];
}

/**
 * AC-19/AC-10(c): distinguishes a deterministic draft (Embedded ignored the
 * chosen template) from a real template-applied one, at every resolved
 * kind. Deliberately built from `receiptLabel` (reused, unmodified) rather
 * than a second, hand-rolled label set - and deliberately not tested by
 * freezing its own output string, which would pin `receiptLabel`'s spelling
 * (a file A21 does not own); the criterion binds only that the value CHANGES
 * with `templateApplied`.
 */
export function promptDraftReceipt(resolved: ResolvedTemplate | null, templateApplied: boolean): string {
  if (!templateApplied) {
    return "Drafted without applying a saved format.";
  }
  if (resolved === null) {
    return "Drafted using the chosen template.";
  }
  return receiptLabel(resolved);
}

/**
 * AC-12: the identity join between this panel's Canvas course URL and the
 * exemplar library's app Course row id. Institution-scoped (two
 * institutions can both have /courses/123) and REFUSES ambiguity - returns
 * null rather than guessing, per the same "refuses to guess" posture
 * announcement-module-content.test.ts already establishes. `canvasUrl: null`
 * rows are skipped rather than throwing.
 */
export function resolveHubCourseIdForCanvasUrl(
  courses: readonly { id: string; canvasUrl: string | null; institution: string | null }[],
  courseUrl: string,
  activeInstitution: string
): string | null {
  const targetId = parseCanvasCourseId(courseUrl);
  if (!targetId) return null;

  const matches = courses.filter((c) => {
    if (c.canvasUrl === null) return false;
    return parseCanvasCourseId(c.canvasUrl) === targetId && c.institution === activeInstitution;
  });

  return matches.length === 1 ? matches[0].id : null;
}

// ── Persisted prompt (docs/a21-instrument-notes.md section 8.3) ────────────
//
// AC-14: the free-text brief persists across reloads under a new `ta-` key.
// A TEXT field uses the house initializer idiom (not a mount effect - a
// controlled input's `value` is a property React reconciles, unlike the
// `<details open>` boolean ATTRIBUTE the mount-effect rule exists for).
// Moved into this leaf, rather than inlined in announcements-panel.tsx,
// because the house idiom there (courseUrl's own `useState` initializer) is
// not itself parseable by a source-text test - see this file's own docs for
// why AC-14(b)/(c) as originally specified were withdrawn and rebuilt here.

export const STORAGE_KEY_PROMPT = "ta-canvas-ann-prompt";

/** A thunk, not a `Storage` value - in a blocked-storage browser the throw
 * can come from the PROPERTY ACCESS itself, not just from `setItem`. A
 * thunk puts that access inside the caller's own `try` too. */
export function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function readStoredPrompt(getStorage: () => Storage | null): string {
  try {
    return (getStorage()?.getItem(STORAGE_KEY_PROMPT) ?? "").slice(0, PROMPT_ANNOUNCEMENT_MAX_CHARS);
  } catch {
    return "";
  }
}

export function writeStoredPrompt(getStorage: () => Storage | null, value: string): void {
  try {
    getStorage()?.setItem(STORAGE_KEY_PROMPT, value.slice(0, PROMPT_ANNOUNCEMENT_MAX_CHARS));
  } catch {
    // Best-effort: a blocked-storage throw must not white-screen the app
    // (REGRESSION 382, cited at SourceDevicesPanel.tsx:55-56).
  }
}
