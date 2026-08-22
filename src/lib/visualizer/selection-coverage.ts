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
 * single call (BLOCKER 2). Deliberately much smaller than
 * VISUALIZER_LINK_MAX_ITEMS above, because the two actions have wildly
 * different per-item cost: linking is one createModuleItemAction call per
 * concept; creating is createVisualizerConceptAction per concept, which is a
 * topic-pick LLM call, a component-authoring LLM call (up to 4096 output
 * tokens, plus one full retry if validation fails - see
 * src/app/actions/visualizer.ts:95-255), two GitHub file reads, and THREE
 * sequential putFile commits.
 *
 * The math this cap is chosen against: budgeting a generous ~5s per LLM call
 * and ~1.5s per GitHub API call (read or write), one page costs roughly
 * 2 x 5s (topic pick + component gen) + 5 x 1.5s (2 reads + 3 commits) =
 * ~17.5s with no retry, or ~22.5s with the one validation retry
 * createVisualizerConceptAction allows. This app runs on Vercel Hobby, whose
 * maxDuration is a HARD ceiling the platform enforces by killing the
 * function outright - not a graceful timeout a caller can react to (see
 * generateFromSelectionAction's identical constraint,
 * src/app/actions/lms-generation.ts:329-342: "Next only honours maxDuration
 * at the page level and src/app/page.tsx (a client component) sets none, so
 * a Server Action reachable from it is capped by the platform default" - the
 * default being 60s). Two pages, EVEN if both hit the worst case (one retry
 * each), cost about 2 x 22.5s = 45s, leaving roughly 15s of margin under the
 * 60s ceiling for requireOwner/loadVisualizerIndexAction overhead and normal
 * latency variance - three pages at that same worst case would already be
 * at ~67.5s, past the ceiling. 2 is therefore the largest count that keeps a
 * realistic worst case comfortably inside the platform's hard limit; any gap
 * concept beyond this count is reported as `notAttempted` rather than
 * silently dropped, so the instructor knows to re-run for the rest.
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
