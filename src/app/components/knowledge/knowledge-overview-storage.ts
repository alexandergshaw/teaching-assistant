// Pure, renderless support for the Knowledge overview panel (AI summary +
// Ask AI on a parent/institution-root page - see AC.md's AC1-AC11):
//
//   (1) Persisted UI control state (AC8) - the panel's open/closed state,
//       its history section's open/closed state, and the in-progress
//       question draft, each keyed per SCOPE (the whole institution, or one
//       page's subtree - scopeStorageKey in src/lib/knowledge-overview-scope.ts)
//       so switching between the institution root and a page's own overview
//       panel never clobbers the other scope's stored state. Split into pure
//       parse/serialize functions (unit-tested directly, taking the raw
//       localStorage string as a plain argument) and thin localStorage-
//       touching read/write wrappers around them - the same split
//       knowledge-helpers.ts uses for parseSelectedPageId/readSelectedPageId
//       - because vitest here runs environment "node" with no DOM: `window`/
//       `localStorage` do not exist in the test process, so only the pure
//       half is reachable from knowledge-overview-storage.test.ts.
//
//   (2) The one Markdown render path the panel/history use for model-authored
//       text (renderOverviewMarkdown) - kept here, not inlined at each JSX
//       call site, so this feature's own X1 regression test exercises the
//       EXACT function every render site calls without needing to render a
//       React component.
//
//   (3) A few pure copy builders and lookups (citation resolution, budget/
//       hard-cap/attachment omission notices, staleness wording) that are
//       worth pinning with a fast test rather than leaving as inline JSX
//       only this file's sibling .tsx components could exercise.
//
// THE BUG THIS FILE MUST NOT REPEAT (persisted-details-open-hydration):
// useKbAttachments.ts:31 seeds its one open/closed boolean straight out of a
// useState initializer - `useState<boolean>(() => readAttachmentsPanelOpen())`.
// That is safe there ONLY because that key is not scoped by anything that
// changes after mount. Ours is keyed by SCOPE, which changes every time the
// instructor selects a different page - a lazy initializer runs exactly once
// per component instance and would keep serving the FIRST scope's stored
// value (or the hard-coded default) forever after. useKnowledgeOverview.ts
// therefore never calls the read functions below from a useState initializer:
// it seeds plain defaults (true/false/"") and re-hydrates via an explicit
// mount effect keyed on scopeKey, gating every write-back effect on having
// actually hydrated that same scope first - see that file's own header
// comment for the full contract.

import { markdownToHtml } from "@/lib/markdown";

const KB_OVERVIEW_OPEN_KEY = "ta-kb-overview-open";
const KB_OVERVIEW_HISTORY_OPEN_KEY = "ta-kb-overview-history-open";
const KB_OVERVIEW_QUESTION_KEY = "ta-kb-overview-question";

function parseScopeMap(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pure parse/serialize (unit-tested directly - no localStorage involved).
// ---------------------------------------------------------------------------

/** Default open for a scope the instructor has never visited before (AC8) -
 *  a first look at a new scope should show the panel, not a collapsed
 *  placeholder for a feature they have not discovered yet. */
export function parseOverviewOpen(raw: string | null, scopeKey: string): boolean {
  const map = parseScopeMap(raw);
  if (!map) return true;
  const value = map[scopeKey];
  return typeof value === "boolean" ? value : true;
}

export function serializeOverviewOpen(raw: string | null, scopeKey: string, open: boolean): string {
  const map = parseScopeMap(raw) ?? {};
  map[scopeKey] = open;
  return JSON.stringify(map);
}

/** History defaults CLOSED for an unseen scope - it is the secondary,
 *  audit-trail section under the primary summary/ask controls. */
export function parseOverviewHistoryOpen(raw: string | null, scopeKey: string): boolean {
  const map = parseScopeMap(raw);
  if (!map) return false;
  const value = map[scopeKey];
  return typeof value === "boolean" ? value : false;
}

export function serializeOverviewHistoryOpen(raw: string | null, scopeKey: string, open: boolean): string {
  const map = parseScopeMap(raw) ?? {};
  map[scopeKey] = open;
  return JSON.stringify(map);
}

export function parseOverviewQuestion(raw: string | null, scopeKey: string): string {
  const map = parseScopeMap(raw);
  if (!map) return "";
  const value = map[scopeKey];
  return typeof value === "string" ? value : "";
}

/** Clears the stored entry for an empty question rather than persisting an
 *  empty string, mirroring writeSelectedPageId's null-clears convention. */
export function serializeOverviewQuestion(raw: string | null, scopeKey: string, question: string): string {
  const map = parseScopeMap(raw) ?? {};
  if (question) map[scopeKey] = question;
  else delete map[scopeKey];
  return JSON.stringify(map);
}

// ---------------------------------------------------------------------------
// localStorage-touching read/write wrappers (glue, not unit-tested here -
// same contract as knowledge-helpers.ts's readSelectedPageId/writeExpandedIds
// etc.: a no-op/default on the server, swallow storage write failures).
// ---------------------------------------------------------------------------

export function readOverviewOpen(scopeKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return parseOverviewOpen(localStorage.getItem(KB_OVERVIEW_OPEN_KEY), scopeKey);
  } catch {
    return true;
  }
}
export function writeOverviewOpen(scopeKey: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KB_OVERVIEW_OPEN_KEY, serializeOverviewOpen(localStorage.getItem(KB_OVERVIEW_OPEN_KEY), scopeKey, open));
  } catch {
    // ignore storage write failures
  }
}

export function readOverviewHistoryOpen(scopeKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return parseOverviewHistoryOpen(localStorage.getItem(KB_OVERVIEW_HISTORY_OPEN_KEY), scopeKey);
  } catch {
    return false;
  }
}
export function writeOverviewHistoryOpen(scopeKey: string, open: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KB_OVERVIEW_HISTORY_OPEN_KEY,
      serializeOverviewHistoryOpen(localStorage.getItem(KB_OVERVIEW_HISTORY_OPEN_KEY), scopeKey, open)
    );
  } catch {
    // ignore
  }
}

export function readOverviewQuestion(scopeKey: string): string {
  if (typeof window === "undefined") return "";
  try {
    return parseOverviewQuestion(localStorage.getItem(KB_OVERVIEW_QUESTION_KEY), scopeKey);
  } catch {
    return "";
  }
}
export function writeOverviewQuestion(scopeKey: string, question: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      KB_OVERVIEW_QUESTION_KEY,
      serializeOverviewQuestion(localStorage.getItem(KB_OVERVIEW_QUESTION_KEY), scopeKey, question)
    );
  } catch {
    // ignore
  }
}

/** One bundled read for useKnowledgeOverview's mount-hydration effect (AC8) -
 *  reads all three keys for one scope in a single pass, so the effect can
 *  setState all three together and record `hydratedScopeKey` in the same
 *  tick, rather than three independent reads that could interleave oddly
 *  under a fast scope switch. */
export interface OverviewUiState {
  open: boolean;
  historyOpen: boolean;
  question: string;
}
export function readOverviewUiState(scopeKey: string): OverviewUiState {
  return {
    open: readOverviewOpen(scopeKey),
    historyOpen: readOverviewHistoryOpen(scopeKey),
    question: readOverviewQuestion(scopeKey),
  };
}

// ---------------------------------------------------------------------------
// Markdown rendering (X1 - CORRECTIONS.md) - see the module comment above.
// ---------------------------------------------------------------------------

/**
 * Render the AI summary or an Ask AI answer's Markdown to HTML for
 * dangerouslySetInnerHTML - the exact function KnowledgeOverviewPanel and
 * KnowledgeOverviewHistory both call for every piece of model-authored text
 * they render (the summary, the current answer, and every history entry's
 * answer). markdownToHtml (src/lib/markdown.ts) now escapes the double quote
 * and allowlists link schemes (commit 094ef65, X0/X1), so this is safe to use
 * for MODEL output as well as instructor-authored text - unlike
 * markdownLiteToHtml, it supports the bold/italic/inline-code/ordered-list
 * syntax a policy summary organized for lookup is likely to use.
 *
 * Kept as its own export, rather than calling markdownToHtml directly at each
 * JSX call site, so knowledge-overview-storage.test.ts can pin - without
 * rendering any component - that a hostile Markdown link target can never
 * become a live href or an executable attribute through this panel's own
 * render path, independent of markdown.test.ts's own coverage of the
 * underlying function.
 */
export function renderOverviewMarkdown(markdown: string): string {
  return markdownToHtml(markdown);
}

// ---------------------------------------------------------------------------
// Citation resolution (AC4, spec item 10) - a citation's page id is resolved
// against the FULL page list (allPages), never the current scope, so a page
// moved OUT of scope after an answer was given still resolves and stays
// clickable. The chip's DISPLAYED title is always the citation's own
// persisted title (never looked up fresh from allPages), so a later rename
// never changes what the answer appears to have cited - callers must read
// `citation.title` for display, this helper only answers "does it still
// resolve to a real page".
// ---------------------------------------------------------------------------

/** Whether a citation's page id still exists in the full page list - the
 *  gate between a clickable citation button and a non-interactive
 *  "{title} (deleted)" span (spec item 10). */
export function citationPageExists(citationId: string, allPages: { id: string }[]): boolean {
  return allPages.some((p) => p.id === citationId);
}

// ---------------------------------------------------------------------------
// Omission copy (AC9, X8, X14) - pure string builders so the exact wording is
// unit-tested without rendering the panel.
//
// X8 asks for TWO distinct sentences - a hard-capped page (dropped before the
// model ever read it, by the id cap ahead of the fetch) versus a budget-
// omitted page (read, then dropped by the character budget) are different
// failures. describeHardCappedPages/describeSkippedAttachments below
// implement that distinction and are unit-tested, but as of this feature's
// initial build neither has a live call site: generateKnowledgeOverviewSummaryAction/
// askKnowledgeOverviewAction (src/app/actions/knowledge-overview.ts, outside
// this file set) compute the hard-capped list and the skipped-attachment
// count internally (via knowledge-scope-context.ts's ScopeContextResult) but
// never return either to the caller - only the persisted ScopeSummary/
// ScopeQuestion comes back, whose `sourcePages[].included` flag collapses
// hard-capped, tier-narrowed-out, and budget-omitted pages into one boolean
// with no way to tell them apart from this side. describeOmittedPages is the
// mechanism-neutral sentence the panel/history actually render today from
// that collapsed data; describeHardCappedPages/describeSkippedAttachments are
// kept ready for the moment that action is extended to forward its own
// ScopeContextResult fields, so wiring them up is then a one-line change
// here rather than a new function to design. Flagged in this feature's build
// report as a cross-group gap, not a defect in this file.
//
// Each returns null for "nothing to say" so a caller can render
// `{note && <p>{note}</p>}` without a separate emptiness check.
// ---------------------------------------------------------------------------

/** The sentence actually rendered today: pages a summary/answer's own
 *  persisted sourcePages marks `included: false`, with no claim about WHY
 *  (hard cap, a retrieval tier narrowing the set, or the character budget
 *  all collapse to the same flag - see the module comment above). */
export function describeOmittedPages(titles: string[]): string | null {
  if (titles.length === 0) return null;
  const noun = titles.length === 1 ? "page" : "pages";
  const verb = titles.length === 1 ? "was" : "were";
  return `${titles.length} ${noun} in this scope ${verb} not part of this: ${titles.join(", ")}.`;
}

/** X8(b): pages that WERE fetched but did not fit the character budget. Not
 *  currently called from the panel - see the module comment above. */
export function describeBudgetOmittedPages(titles: string[]): string | null {
  if (titles.length === 0) return null;
  const noun = titles.length === 1 ? "page" : "pages";
  return `${titles.length} ${noun} left out to stay within the context budget: ${titles.join(", ")}.`;
}

/** X8(a): pages in scope that were never fetched at all, because this scope
 *  has more pages than a single generation pass can look up. Distinct
 *  wording from describeBudgetOmittedPages on purpose - these pages were
 *  never read, not read-then-dropped. Not currently called from the panel -
 *  see the module comment above. */
export function describeHardCappedPages(titles: string[]): string | null {
  if (titles.length === 0) return null;
  const noun = titles.length === 1 ? "page" : "pages";
  const verb = titles.length === 1 ? "was" : "were";
  return `${titles.length} ${noun} in this scope ${verb} not looked at at all - this scope has more pages than a single request can check: ${titles.join(", ")}.`;
}

/** X14: buildKnowledgeContextBlock puts every in-scope PAGE before any
 *  attachment, so on overflow an attachment is always the first thing
 *  dropped - stated plainly rather than left for the instructor to notice
 *  attachment text just never shows up in an answer. Not currently called
 *  from the panel - see the module comment above. */
export function describeSkippedAttachments(count: number): string | null {
  if (count <= 0) return null;
  const noun = count === 1 ? "attachment" : "attachments";
  return `${count} ${noun} left out to stay within the context budget - page text is always sent first, so an attachment is the first thing dropped on overflow.`;
}

// ---------------------------------------------------------------------------
// Staleness copy (AC3/X4) - human wording over B1's pure fingerprint-set-diff
// result (src/lib/knowledge-overview-stale.ts). Never re-derives staleness
// itself here - this only describes an already-computed SummaryStaleness.
// ---------------------------------------------------------------------------

export interface StalenessLike {
  stale: boolean;
  changedTitles: string[];
  addedTitles: string[];
  removedTitles: string[];
}

/** null when not stale, so `{describeStaleness(s) && <Badge/>}` needs no
 *  separate `.stale` check at the call site. */
export function describeStaleness(staleness: StalenessLike): string | null {
  if (!staleness.stale) return null;
  const parts: string[] = [];
  if (staleness.changedTitles.length > 0) parts.push(`edited: ${staleness.changedTitles.join(", ")}`);
  if (staleness.addedTitles.length > 0) parts.push(`added: ${staleness.addedTitles.join(", ")}`);
  if (staleness.removedTitles.length > 0) parts.push(`removed: ${staleness.removedTitles.join(", ")}`);
  return parts.length > 0
    ? `Out of date since generation - ${parts.join("; ")}.`
    : "Out of date since generation.";
}
