// Pure classification/formatting helpers for the "visualizer coverage for
// the selection" bulk-bar row (docs/visualizer-coverage-from-selection-
// acceptance-criteria.md - this file is Contract 1). No React, no DOM, no
// "@/app/actions", no network - importable from a plain unit test AND from
// the server actions (Contract 3, set B) AND from the hook (Contract 4, set
// C) that both build on it. Mirrors src/lib/workflows/visualizer-gap-audit.ts's
// own reason for staying a pure module: the DECISION logic here (which half a
// resolved concept lands in, what its stable link title is, which covered
// concepts are already linked) is exactly what this feature is judged on, and
// keeping it network-free is what makes it cheaply and directly testable.
//
// VisualizerCreateInput/VisualizerCreateSuccess below are the wire contract
// for POST /api/visualizer/create (src/app/api/visualizer/create/route.ts) -
// declared HERE, in this pure leaf, rather than in the route file itself, so
// both the route (server) and useVisualizerCoverage.ts (client) import the
// same shape without either importing a route module. Mirrors
// src/lib/lms-generation/deck.ts's own DeckGenerationRequest/
// DeckGenerationSuccess/DeckGenerationFailure, which exist for the identical
// reason for that sibling Route Handler.
import type { LlmProvider } from "@/lib/llm";

/** Bound on how many concepts one scan will carry through the pipeline -
 * matches clampDeckConcepts' own ceiling (src/lib/workflows/deck-concepts.ts),
 * since the extractor (Contract 2) clamps to that same range. */
export const VISUALIZER_SCAN_MAX_CONCEPTS = 20;

/** Bound on how many covered concepts one "link into a module" run will
 * attempt to insert in a single call - a safety cap distinct from the scan's
 * own concept cap (a module can carry links from several scans over time). */
export const VISUALIZER_LINK_MAX_ITEMS = 40;

/**
 * Bound on how many GAP concepts one "create pages" run will attempt in a
 * single call (BLOCKER 2, and its follow-up: the create action moved off a
 * Server Action and onto a Route Handler with an explicit `maxDuration` -
 * src/app/api/visualizer/create/route.ts - see that file's own header
 * comment). Deliberately much smaller than VISUALIZER_LINK_MAX_ITEMS above,
 * because the two actions have wildly different per-item cost: linking is
 * one createModuleItemAction call per concept; creating is
 * createVisualizerConceptAction per concept, which is a topic-pick LLM call,
 * a component-authoring LLM call (up to 4096 output tokens, plus one full
 * retry if validation fails - see src/app/actions/visualizer.ts:95-255), two
 * GitHub file reads, and THREE sequential putFile commits.
 *
 * WHAT THE MOVE TO A ROUTE HANDLER DOES AND DOES NOT CHANGE. It does NOT, by
 * itself, buy extra wall-clock budget: this app's real deployment target,
 * Vercel Hobby, hard-caps every function's ACTUAL grant at 60s regardless of
 * what `maxDuration` a route requests (this repo's own deployment notes
 * record that ceiling, and the deck route's own header comment -
 * src/app/api/lms-generation/deck/route.ts - states the identical fact about
 * its own requested 300s). What it DOES change is confidence in that number:
 * a Server Action reachable from src/app/page.tsx (a client component that
 * sets no `maxDuration`) got whatever the platform's un-configured default
 * happened to grant - never independently verified for this feature (the
 * previous version of this comment inherited that 60s figure from
 * generateFromSelectionAction's own comment without checking it, and
 * docs/REGRESSION.md entry 323's own Limits said so plainly: "this pass did
 * not verify what ceiling Vercel Hobby actually grants such a handler"). An
 * explicit `maxDuration` on a Route Handler is a CONFIRMED grant of up to
 * Hobby's real 60s ceiling, not an inherited assumption.
 *
 * THE CAP STAYS AT 2. A prior revision of this comment tried to spend the
 * confirmed-ceiling margin above on raising this to 3, and got the reasoning
 * half right: it re-derived the RETRY assumption (budgeting for at most one
 * retry across the batch, rather than every page retrying) but left the
 * BASE per-op estimates - ~5s per LLM call, ~1.5s per GitHub call - exactly
 * as they always were: guesses, never measured against a real end-to-end
 * page creation. At N=2 those guesses had roughly 15s (25%) of slack to
 * absorb their own uncertainty; spending the whole confirmed-ceiling gain on
 * N=3 instead left them under a second (0.8%) of slack. The base estimate is
 * the fragile number here, not the retry rate - a component-authoring call
 * at up to 4096 output tokens routinely runs longer than 5s, and a single
 * page at even a 12s component-gen call already costs more than the 60s
 * ceiling at N=3. This file cannot measure a real page creation against the
 * clock (no credentials, no external repo, from where these tests run), so
 * the honest move is to revert to 2 - the value with real margin against
 * unmeasured estimates - and say so plainly, rather than publish an N=3
 * arithmetic that reads as rigorous but is still built on the same guesses
 * it never re-examined. Raising this again requires an ACTUAL measured
 * per-page wall-clock time written into this comment in place of the
 * ~5s/~1.5s guesses above - not a re-derivation of the retry assumption
 * alone.
 *
 * THE PER-PAGE COST MODEL, unchanged from before: budgeting ~5s per LLM call
 * and ~1.5s per GitHub API call (read or write), one page costs roughly
 * 2 x 5s (topic pick + component gen) + 5 x 1.5s (2 reads + 3 commits) =
 * ~17.5s with no retry, or ~22.5s with the one validation retry
 * createVisualizerConceptAction allows. For N=2, budgeting pessimistically
 * for BOTH pages needing their one retry: 2 x 22.5s + ~2s of pre-loop
 * overhead (requireOwner, well under a second; one loadVisualizerIndexAction
 * GitHub read, ~1.5s) = 47s, leaving roughly 13s (22%) of margin inside the
 * confirmed 60s ceiling even under that pessimistic assumption - real margin
 * to absorb the base estimates' own uncertainty, not the sub-1s margin a
 * cap of 3 would leave. Any gap concept beyond this count is reported as
 * `notAttempted` rather than silently dropped, so the instructor knows to
 * re-run for the rest.
 *
 * THE PARTIAL-COMMIT / ORPHAN HAZARD (recorded here, and in the route's own
 * header comment - src/app/api/visualizer/create/route.ts - since neither
 * this cap nor the Route Handler's `maxDuration` prevents it, only makes it
 * rarer). A platform kill mid-run cannot be intercepted from inside the
 * handler (A5, docs/visualizer-coverage-from-selection-acceptance-criteria.md):
 * no response reaches the client, so the instructor gets a bare timeout with
 * no list of what this run actually created. Worse, createVisualizerConceptAction
 * commits three files per concept and commits navItems.ts LAST (src/app/
 * actions/visualizer.ts) - a kill between the topic-page commit and the
 * navItems.ts commit leaves an orphaned component + topic-page case with NO
 * nav entry. That orphan is not self-healing: this route's own fresh-index
 * re-check (B4) reads navItems.ts, so it will NOT find the orphaned concept
 * and will NOT skip it on re-run - the instructor re-runs and a second
 * component gets authored over the same half-written page. This cap is what
 * keeps that case UNCOMMON, not what prevents it; it remains the actual
 * defense against ever getting close to a platform kill in the first place.
 */
export const VISUALIZER_CREATE_MAX_PAGES = 2;

/** One concept the extractor found, with the material that justified it. */
export interface ScannedConcept {
  concept: string;
  evidence: string;
}

/**
 * A concept resolved against the visualizer index - the raw input to
 * classification. `url`/`topicKey`/`label` are null when nothing matched.
 * `creatable` is whether the MATCHED topic (when one was matched) is one of
 * creatableTopics() (src/lib/visualizer.ts) - it has no meaning when nothing
 * matched, and callers should leave it false in that case.
 */
export interface ConceptResolution {
  concept: string;
  evidence: string;
  url: string | null;
  topicKey: string | null;
  label: string | null;
  /** Whether the matched topic can receive a new concept (creatableTopics). */
  creatable: boolean;
}

export interface CoveredConcept {
  concept: string;
  url: string;
  topicKey: string;
  label: string;
}

export interface GapConcept {
  concept: string;
  evidence: string;
  reason: "no-match" | "topic-not-creatable";
}

export interface SelectionCoverage {
  covered: CoveredConcept[];
  gaps: GapConcept[];
}

/** The wire contract's own request shape (POST /api/visualizer/create) - see
 * this file's header comment for why it lives here rather than in the route
 * file. `concepts` is NEVER trusted as pre-filtered: the route re-applies the
 * "topic-not-creatable can never reach creation" rule itself, even against a
 * hand-crafted payload that skips the client's own filtering. */
export interface VisualizerCreateInput {
  concepts: GapConcept[];
  provider?: LlmProvider;
}

/** The wire contract's own response shape (POST /api/visualizer/create). */
export interface VisualizerCreateSuccess {
  created: Array<{ concept: string; url: string }>;
  skipped: string[];
  failed: Array<{ concept: string; error: string }>;
  /** BLOCKER 2: gap concepts this run did not even attempt - either because
   *  VISUALIZER_CREATE_MAX_PAGES was reached, or (defensively) because the
   *  run stopped before reaching them. NEVER silently dropped: a re-run on
   *  exactly this list is how the instructor gets the rest created, rather
   *  than believing every gap was handled. Optional (rather than required)
   *  so this addition stays backward-compatible with any caller/fixture
   *  built against the pre-existing three-field shape - the route itself
   *  always populates it (see its own POST handler), so a real caller never
   *  actually gets `undefined` here; the flexibility is for type
   *  compatibility only. */
  notAttempted?: string[];
}

/**
 * Pure split. A resolution with a url is covered; one without is a gap,
 * tagged with WHY (nothing matched at all, vs matched a nav entry whose topic
 * cannot receive a new page - A4 requires these be distinguishable, and the
 * "topic-not-creatable" reason exists specifically so a caller can refuse to
 * offer it for creation: routing a new concept to a non-creatable topic would
 * be exactly as broken as the dead link resolveVisualizerLinks already
 * refuses to build for one).
 *
 * The gap reason is decided from `r.creatable` directly (SHOULD-FIX 5), not
 * merely inferred from `topicKey`'s presence: a matched topic (`topicKey` set)
 * that IS creatable is treated as "no-match" rather than "topic-not-creatable"
 * - it did not actually clear the covered bar above (missing url/label is an
 * inconsistency in the caller's resolution, not this function's problem to
 * diagnose), but calling it "topic-not-creatable" would be actively wrong and
 * would wrongly exclude it from the create action's own eligibility filter
 * (concepts.filter((c) => c.reason !== "topic-not-creatable"),
 * src/app/actions/visualizer-selection.ts). Only a matched topic that is
 * genuinely NOT creatable earns the "topic-not-creatable" reason. This makes
 * `creatable` load-bearing rather than a computed-and-ignored field - see
 * this file's own test suite for the case that pins it.
 *
 * The covered check itself treats `label` as present via a null check, not
 * truthiness (NIT 12) - parseNavItems (src/lib/visualizer.ts:310) can emit
 * `label: ""` for a real nav entry, and an empty label is still a genuinely
 * linkable concept, not a reason to route it into gaps as
 * "topic-not-creatable".
 *
 * Never throws - defensive against non-array/malformed input the same way
 * checkConceptsAgainstIndex (visualizer-gap-audit.ts) is.
 */
export function classifySelectionCoverage(resolutions: ConceptResolution[]): SelectionCoverage {
  const covered: CoveredConcept[] = [];
  const gaps: GapConcept[] = [];

  for (const r of Array.isArray(resolutions) ? resolutions : []) {
    if (!r) continue;
    const concept = (r.concept ?? "").trim();
    if (!concept) continue;

    if (r.url && r.topicKey && r.label !== null && r.label !== undefined) {
      covered.push({ concept, url: r.url, topicKey: r.topicKey, label: r.label });
      continue;
    }

    // No covered match. A matched topic (topicKey set) that is genuinely NOT
    // creatable is "topic-not-creatable"; everything else - nothing matched
    // at all, OR a matched-and-creatable topic that still failed the covered
    // check above for some other reason (missing url/label) - is "no-match",
    // so it stays eligible for the create action rather than being wrongly
    // excluded.
    const reason: GapConcept["reason"] = r.topicKey && !r.creatable ? "topic-not-creatable" : "no-match";
    gaps.push({ concept, evidence: (r.evidence ?? "").trim(), reason });
  }

  return { covered, gaps };
}

/**
 * The Canvas module-item title for a covered concept. STABLE for a given
 * concept (C4) - deterministic string transform only (trim + a fixed
 * prefix), no timestamp, no random suffix, no counter - so a re-run of the
 * same scan against the same concept always produces the byte-identical
 * title, which is exactly what C5's "already linked" url-based dedup
 * (unlinkedConcepts, below) depends on staying meaningful: if the title
 * drifted between runs, an instructor could not visually confirm two module
 * items were "the same link" by title alone, even though C5 already
 * guarantees they are never duplicated by url.
 */
export function visualizerLinkTitle(concept: string): string {
  const trimmed = (concept ?? "").trim();
  return `Interactive visual: ${trimmed}`;
}

/**
 * Normalize a visualizer URL for comparison (C5). A module item's stored
 * `external_url` can come back from Canvas differing from the url this
 * feature just built in two harmless ways: a trailing slash on the path, and
 * a differently-cased host (Canvas has been observed to round-trip a
 * lower-cased host on some external-tool integrations). Both are normalized
 * away before comparing; nothing else is touched - in particular the query
 * string (`?concept=<slug>`, see conceptUrl in src/lib/visualizer.ts) is left
 * exactly as it is, including its case, since two different concept slugs
 * that only differ by case ARE two different concepts and must not collapse
 * to the same key. A url that fails to parse (never expected in practice, but
 * defensive) falls back to a trimmed lowercase compare rather than throwing.
 */
function normalizeVisualizerLinkUrl(url: string): string {
  const trimmed = (url ?? "").trim();
  try {
    const parsed = new URL(trimmed);
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname;
    return `${parsed.protocol}//${host}${pathname}${parsed.search}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

/**
 * Covered concepts whose url is not already among the module's existing
 * external-url items (C5). Compared on NORMALIZED url (normalizeVisualizerLinkUrl
 * above), not on title - two different titles pointing at the same
 * normalized url still count as "already linked", since it is the Canvas
 * destination that must not be duplicated, not the label a re-run happens to
 * generate for it (which is stable anyway, per visualizerLinkTitle above, but
 * this function does not rely on that).
 */
export function unlinkedConcepts(
  covered: CoveredConcept[],
  existingExternalUrls: readonly string[]
): CoveredConcept[] {
  const existing = new Set(
    (Array.isArray(existingExternalUrls) ? existingExternalUrls : []).map((u) => normalizeVisualizerLinkUrl(u))
  );
  return (Array.isArray(covered) ? covered : []).filter((c) => !existing.has(normalizeVisualizerLinkUrl(c.url)));
}

/**
 * Split `concepts` into those whose (normalized) url is unique within the
 * list and those that repeat an EARLIER entry's url (NIT 13). `unlinkedConcepts`
 * above only compares a concept's url against the module's EXISTING items -
 * it says nothing about two concepts extracted in the SAME scan that resolve
 * to the same visualizer page (e.g. "For Loops" and "for loops" both matching
 * the same nav entry). Without this dedupe, linkVisualizerPagesIntoModuleAction
 * would call createModuleItemAction twice for the identical url in one run.
 * The first occurrence (by input order) wins and lands in `unique`; every
 * later entry with the same normalized url lands in `duplicates` instead -
 * compared with the same normalizeVisualizerLinkUrl rules unlinkedConcepts
 * itself uses, so "already linked" and "duplicate within this run" mean the
 * same thing about a url. Never throws - defensive against non-array input.
 */
export function dedupeConceptsByUrl(
  concepts: CoveredConcept[]
): { unique: CoveredConcept[]; duplicates: CoveredConcept[] } {
  const seen = new Set<string>();
  const unique: CoveredConcept[] = [];
  const duplicates: CoveredConcept[] = [];

  for (const c of Array.isArray(concepts) ? concepts : []) {
    const key = normalizeVisualizerLinkUrl(c.url);
    if (seen.has(key)) {
      duplicates.push(c);
      continue;
    }
    seen.add(key);
    unique.push(c);
  }

  return { unique, duplicates };
}

/**
 * The scan's own summary line (A5): how many concepts, how many covered, how
 * many missing. "Missing" here is every gap regardless of reason (no-match or
 * topic-not-creatable) - both are, from the instructor's point of view at
 * scan time, "not something I can point a student at yet".
 */
export function coverageSummaryNote(coverage: SelectionCoverage): string {
  const covered = Array.isArray(coverage?.covered) ? coverage.covered : [];
  const gaps = Array.isArray(coverage?.gaps) ? coverage.gaps : [];
  const total = covered.length + gaps.length;

  if (total === 0) {
    return "No visualization-worthy concepts were found in this selection.";
  }

  const conceptWord = total === 1 ? "concept" : "concepts";
  return (
    `Found ${total} ${conceptWord}: ${covered.length} already on the visualizer, ` +
    `${gaps.length} missing a page.`
  );
}
