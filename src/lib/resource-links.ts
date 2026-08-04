// Resolvers and renderers for the curated resource-link maps used by
// generated course documents (assignment instructions, class openers,
// module-objectives docs). Pure: no I/O, no fetch, no Date, no
// Math.random - deep-link rot is solved by ROOT-ONLY curation, not by a
// network check at generation time (a fetch per link would add latency,
// flakiness, and a failure mode inside an unattended run).
//
// THE RULE THAT MATTERS MOST (stated in full, verbatim, in
// ./resource-links/tool-tutorials.ts and ./resource-links/field-resources.ts,
// where the curated maps themselves now live - read it there before touching
// either map): every URL in TOOL_TUTORIAL_MAP and FIELD_RESOURCE_MAP MUST be
// the tool or organization's official help center, academy, guides, or docs
// ROOT - never the marketing homepage, and never a deep article link with a
// numeric ID or version path. A real generated course (MGT 422, run
// 512bbdbf) shipped 73 unique URLs; 37 (51%) were dead on a curl check,
// including 11 of 12 fabricated PMI deep links. This rule is restated with
// the maps themselves (not just here) precisely because a previous agent,
// editing a map without this reasoning in front of it, collapsed every URL
// to a bare marketing domain.
//
// The model is never trusted to author a URL (see
// generateAssignmentInstructionsForAssignment's "the model writes NO URLs"
// instruction, shared.ts) - it names a tool or resource in plain text, and
// every resolver/renderer below turns that name into a link by CODE, matched
// against the maps imported from ./resource-links/tool-tutorials.ts and
// ./resource-links/field-resources.ts. A name that matches nothing
// contributes NO link; nothing is ever guessed or constructed.

import { sanitizeResourceUrl } from "@/lib/urls";
import type { CourseKind } from "@/lib/course-kind";
import { TOOL_TUTORIAL_MAP, type ResourceLink } from "./resource-links/tool-tutorials";
import { FIELD_RESOURCE_MAP } from "./resource-links/field-resources";

// Re-exported so every pre-existing caller (this file's own resolvers below,
// resource-links.test.ts / resource-links.data.test.ts, and any other
// importer) keeps working unchanged - the maps and the ResourceLink type
// moved into ./resource-links/, but nothing importing them from
// "@/lib/resource-links" needs to know that.
export { TOOL_TUTORIAL_MAP, FIELD_RESOURCE_MAP };
export type { ResourceLink };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Find which key of `map` matches `candidate`, whole-word (so "css" never
 * matches inside "access") - the exact idiom CURATED_DOCS_MAP's own
 * matchDocsKeyword uses (src/lib/live-class/links.ts), copied here for tool
 * and field-resource names. Returns the literal key (not the ResourceLink) so
 * a caller can look up an alias-independent identity for `candidate` - e.g.
 * renderToolsYouWillUseSection's U3 intersection needs to know WHICH
 * TOOL_TUTORIAL_MAP key a committed tool name resolves to, so it can check
 * whether that same key (or an alias sharing its link) is separately
 * mentioned in a document's own body text. Returns null when nothing
 * matches. */
function findMatchingKey(candidate: string, map: Record<string, ResourceLink>): string | null {
  const normalized = (candidate ?? "").toLowerCase().trim();
  if (!normalized) return null;
  for (const key of Object.keys(map)) {
    const pattern = new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
    if (pattern.test(normalized)) return key;
  }
  return null;
}

/** Match `candidate` against `map`'s keys - see findMatchingKey above for the
 * exact matching rule. Returns the mapped ResourceLink verbatim (never a
 * constructed or guessed URL) or null when nothing matches. */
function matchKeyword(candidate: string, map: Record<string, ResourceLink>): ResourceLink | null {
  const key = findMatchingKey(candidate, map);
  return key ? map[key] : null;
}

/**
 * Resolve official tool-tutorial links for a set of tool names (e.g. the
 * course's committed toolset, or names pulled out of generated body text).
 * Whole-word, case-insensitive match against TOOL_TUTORIAL_MAP - reuses the
 * matchDocsKeyword idiom (matchKeyword above). A name that matches nothing
 * contributes NO link; never constructs or guesses a URL. Deduped by url,
 * order stable (input order).
 */
export function resolveToolTutorials(toolNames: string[]): ResourceLink[] {
  const results: ResourceLink[] = [];
  const seenUrls = new Set<string>();
  for (const name of Array.isArray(toolNames) ? toolNames : []) {
    const link = matchKeyword(name, TOOL_TUTORIAL_MAP);
    if (!link || seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    results.push(link);
  }
  return results;
}

/**
 * Resolve professional-body / open-courseware resources mentioned anywhere
 * in a blob of course/assignment text (course description + assignment
 * title + body, typically). Capped at `max` (default 4). Never constructs or
 * guesses a URL - only ever returns a literal value from the map.
 *
 * An entry matches on EITHER of two independent signals - the map's own key
 * (the organization's name/alias, whole-word, exactly as before) OR any of
 * the entry's own `subjectKeywords` (U6 fix): matching by name alone left a
 * field's governing body unresolved on assignments that never spell out the
 * body's name but reliably use its subject-matter vocabulary (a project-
 * management assignment saying "risk" or "stakeholder" but never "PMI").
 * Both checks run against the same whole-word, case-insensitive test.
 *
 * `kind`, when given, excludes any matched entry whose own `courseKind` is
 * set and disagrees with it - a coding course's resolved resources can never
 * include an applied-field professional body (PMI, SHRM, etc.), and vice
 * versa. Omitted (the default) applies NO filtering, so every pre-existing
 * caller (the embedded/deterministic scaffold, src/lib/embedded/docs.ts)
 * that has no course kind to give is completely unaffected.
 */
export function resolveFieldResources(text: string, max = 4, kind?: CourseKind): ResourceLink[] {
  const normalized = typeof text === "string" ? text : "";
  const results: ResourceLink[] = [];
  const seenUrls = new Set<string>();
  const cap = Number.isFinite(max) && max >= 0 ? Math.floor(max) : 4;
  if (!normalized.trim() || cap === 0) return results;

  const wholeWordMatch = (term: string) => new RegExp(`\\b${escapeRegExp(term)}\\b`, "i").test(normalized);

  for (const [key, link] of Object.entries(FIELD_RESOURCE_MAP)) {
    if (seenUrls.has(link.url)) continue;
    if (kind && link.courseKind && link.courseKind !== kind) continue;
    const nameMatches = wholeWordMatch(key);
    const subjectMatches = (link.subjectKeywords ?? []).some(wholeWordMatch);
    if (nameMatches || subjectMatches) {
      seenUrls.add(link.url);
      results.push(link);
      if (results.length >= cap) break;
    }
  }
  return results;
}

// RCA regression (docs/REGRESSION.md entries 137/141/142 - tool-churn
// prevention): a handful of TOOL_TUTORIAL_MAP keys are also ordinary English
// words - "word", "monday", "sheets", "excel", "slack", "zoom", "notion" -
// so a bare whole-word scan of generated prose matches them constantly and
// for the wrong reason. Reproduced verbatim against a Trello-committed
// course: "Write a 500-word summary" rendered Microsoft Word, "due Monday"
// rendered monday.com, "the sheets you produced" rendered Google Sheets, and
// "excel at communicating" rendered Microsoft Excel - none of which the
// course ever chose, which is exactly the churn entries 137/141/142 exist to
// stop. A map key that doubles as an ordinary English word cannot be matched
// bare in prose: it may ONLY be matched via a qualified form that actually
// names the product ("microsoft word", "monday.com", "google sheets",
// "microsoft excel", "slack channel"/"slack workspace", "zoom meeting"/
// "zoom call", "notion workspace"/"notion app") - every other
// TOOL_TUTORIAL_MAP key keeps matching bare, unchanged.
const AMBIGUOUS_TOOL_QUALIFIERS: Record<string, RegExp> = {
  word: /\bmicrosoft word\b/i,
  monday: /\bmonday\.com\b/i,
  sheets: /\bgoogle sheets\b/i,
  excel: /\bmicrosoft excel\b/i,
  slack: /\b(?:slack channel|slack workspace)\b/i,
  zoom: /\b(?:zoom meeting|zoom call)\b/i,
  notion: /\b(?:notion workspace|notion app)\b/i,
};

/** The pattern that counts as "this TOOL_TUTORIAL_MAP key is mentioned" -
 * the qualified-form regex for an ambiguous key (see AMBIGUOUS_TOOL_QUALIFIERS
 * above), or a plain whole-word match on the key itself. Shared by
 * toolKeysMentionedIn (below) and renderToolsYouWillUseSection's U3
 * intersection, so a committed tool is checked against a document's body text
 * by the EXACT same rule that decides whether a body-text-only mention
 * counts - an ambiguous key can never be "mentioned" via its bare word in
 * either path. */
function toolMentionPattern(key: string): RegExp {
  return AMBIGUOUS_TOOL_QUALIFIERS[key] ?? new RegExp(`\\b${escapeRegExp(key)}\\b`, "i");
}

/**
 * Which TOOL_TUTORIAL_MAP keys are named anywhere in a blob of free text
 * (typically a document's own generated body) - used both as the U3
 * intersection signal (see renderToolsYouWillUseSection below) and as the
 * fallback when there is no committed toolset to defer to at all: an applied
 * course whose `ensureCourseTools` found nothing, or a coding course, has no
 * other signal for which tool a document is telling students to use. Returns
 * the matched KEYS (not ResourceLinks, and not deduped against each other) in
 * TOOL_TUTORIAL_MAP's own iteration order; renderToolsYouWillUseSection below
 * is what turns keys into deduped, rendered links. An AMBIGUOUS_TOOL_QUALIFIERS
 * key only counts as mentioned when its qualified form appears - never the
 * bare word (see above).
 */
export function toolKeysMentionedIn(text: string): string[] {
  const normalized = typeof text === "string" ? text : "";
  if (!normalized.trim()) return [];
  const found: string[] = [];
  for (const key of Object.keys(TOOL_TUTORIAL_MAP)) {
    if (toolMentionPattern(key).test(normalized)) found.push(key);
  }
  return found;
}

/**
 * Every line (or sentence within a multi-sentence line) in `bodyText` that
 * mentions the tool identified by `pattern`, cleaned of a leading list marker
 * and trailing punctuation, capped at 220 chars - the candidate pool
 * extractToolContextSentence (below) chooses from. Deterministic and
 * code-owned: each candidate is always a literal excerpt of the artifact's
 * OWN generated text, never invented or paraphrased.
 */
function collectToolContextCandidates(pattern: RegExp, bodyText: string): string[] {
  const candidates: string[] = [];
  if (!bodyText) return candidates;
  for (const rawLine of bodyText.split(/\n+/)) {
    const line = rawLine.trim();
    if (!line || !pattern.test(line)) continue;
    const cleaned = line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").replace(/^#+\s+/, "");
    const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
    const target = sentences.find((s) => pattern.test(s)) ?? cleaned;
    const trimmed = target.trim().replace(/[.!?]+$/, "");
    if (trimmed) candidates.push(trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed);
  }
  return candidates;
}

/**
 * The best candidate sentence in `bodyText` describing THIS tool (`key`,
 * matched via `pattern`) alone - used to build the per-tool "specific
 * sentence" U3-AC2 requires (renderToolsYouWillUseSection below). Returns
 * null when no candidate names this tool alone (the caller falls back to a
 * generic usage sentence).
 *
 * Bug fix (captured against a Week 5 artifact naming Asana, Miro, and Google
 * Sheets in one combined sentence: "Map the approval chain in Miro, track
 * tasks in Asana, and calculate in Google Sheets."): the previous version
 * returned the first matching sentence unconditionally, so all three tools'
 * bullets quoted the exact same multi-tool sentence. That is the U3-AC2
 * boilerplate defect in a new form (identical text under every bullet), and
 * it is WORSE than boilerplate because it misattributes - the Asana bullet
 * led with "Map the approval chain in Miro", describing a different tool.
 * A generic-but-true sentence beats a specific-but-wrong one, so a candidate
 * naming another tool is never returned: among all candidates mentioning
 * `key`, this prefers one that names no OTHER TOOL_TUTORIAL_MAP tool (an
 * alias sharing this tool's own URL - e.g. "sheets"/"google sheets" - does
 * not count as "other"); if every candidate names another tool too, this
 * returns null rather than shipping a misattributed line, and the caller
 * falls back to the generic sentence instead.
 */
function extractToolContextSentence(key: string, pattern: RegExp, bodyText: string): string | null {
  const candidates = collectToolContextCandidates(pattern, bodyText);
  if (candidates.length === 0) return null;

  const thisUrl = TOOL_TUTORIAL_MAP[key]?.url;
  const namesOnlyThisTool = (sentence: string): boolean =>
    !toolKeysMentionedIn(sentence).some((otherKey) => TOOL_TUTORIAL_MAP[otherKey].url !== thisUrl);

  return candidates.find(namesOnlyThisTool) ?? null;
}

// A tool-name key from TOOL_TUTORIAL_MAP is lowercase (a match key, not a
// display string) - title-cased here only for the rendered bullet's label
// when the key itself is the only display name available (a committed-
// toolset name, e.g. "Trello (free plan)", already carries its own casing
// and is used as-is instead). Exported so a caller outside this file that
// also needs to display a bare TOOL_TUTORIAL_MAP key (e.g. steps.instructor-
// notes.ts's per-week SPECIALIST-tool detection, which mirrors this file's
// own CORE/SPECIALIST split in renderCourseToolPlanSection above) gets the
// SAME casing rule rather than a second, independent implementation.
export function titleCaseToolKey(key: string): string {
  return key
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();
      if (upper === "BI" || upper === "MS") return upper;
      return word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    })
    .join(" ");
}

/**
 * Render the "## Tools You Will Use" markdown block shared by every
 * generated document that can name a tool (assignment instructions, module
 * objectives, class openers - P1-AC3/AC4): one bullet per tool this artifact
 * actually directs the student to use, each rendered "- <Tool>: <label> -
 * <url>. <specific sentence>". Deterministic: the per-tool sentence is drawn
 * from the artifact's own text or a fixed fallback, never a further LLM call
 * - code owns not just the link but what surrounds it, so this block can
 * never fail or drift independently of the link it renders. Returns ""
 * (omit the whole section) when nothing resolves - a document naming no tool
 * gets no section, never an empty heading.
 *
 * RCA regression (docs/REGRESSION.md entries 137/141/142 - tool-churn
 * prevention): this used to UNION the committed toolset with any
 * TOOL_TUTORIAL_MAP key mentioned in `bodyText`, on the theory that "if the
 * document tells a student to use a tool, that tool gets a link, no
 * exceptions". That reintroduced exactly the drift 137/141/142 exist to stop
 * - a Trello-committed course's generated prose saying "due Monday" or "a
 * 500-word summary" rendered monday.com / Microsoft Word links for tools the
 * course never chose.
 *
 * U3 regression (the fix immediately before this one over-corrected): once
 * the union bug above was fixed, this rendered the WHOLE committed toolset
 * regardless of what the artifact's own text actually used - a Week 5
 * assignment that only used Asana and Google Sheets still got a Miro bullet,
 * with the identical boilerplate sentence repeated for all three. THE RIGHT
 * SET IS THE INTERSECTION: when a committed toolset exists, a tool renders
 * only when it is BOTH committed AND named somewhere in `bodyText` (checked
 * via toolKeysMentionedIn's exact ambiguous-qualified-form rule, so "a
 * 500-word summary" still never counts as naming Word). A committed tool
 * this artifact never mentions is omitted entirely - which also means an
 * artifact that names no tool at all (a deliberately paper/low-tech warm-up)
 * gets NO tools block, rather than one that contradicts its own text (U4).
 * With no committed toolset at all (an applied course whose
 * `ensureCourseTools` found nothing, or a coding course), the body-text scan
 * is the only signal available, unchanged from before.
 *
 * U3-AC2: each bullet's sentence is a literal excerpt of the artifact's own
 * text naming that tool alone (extractToolContextSentence above), not one
 * boilerplate line repeated per tool, and never a different tool's sentence
 * misattributed to this one - a combined sentence naming several tools at
 * once (e.g. "Map the approval chain in Miro, track tasks in Asana, and
 * calculate in Google Sheets.") falls back to the generic `usageContext`
 * sentence for every tool it names, rather than quoting that one combined
 * line under all of them.
 */
export function renderToolsYouWillUseSection(
  committedToolNames: string[],
  bodyText: string,
  usageContext = "this assignment's hands-on work"
): string {
  const committed = (Array.isArray(committedToolNames) ? committedToolNames : [])
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter(Boolean);
  const mentionedKeys = toolKeysMentionedIn(bodyText);
  const mentionedUrls = new Set(mentionedKeys.map((key) => TOOL_TUTORIAL_MAP[key].url));

  // With a committed toolset: only the tools ALSO mentioned in this
  // artifact's own text (the intersection - U3-AC1). With none: the only
  // signal is what's mentioned, title-cased from its map key (unchanged
  // fallback behavior).
  const candidates =
    committed.length > 0
      ? committed.filter((name) => {
          const key = findMatchingKey(name, TOOL_TUTORIAL_MAP);
          return key !== null && mentionedUrls.has(TOOL_TUTORIAL_MAP[key].url);
        })
      : mentionedKeys.map(titleCaseToolKey);

  const seenUrls = new Set<string>();
  const bullets: string[] = [];
  for (const candidate of candidates) {
    const key = findMatchingKey(candidate, TOOL_TUTORIAL_MAP);
    if (!key) continue;
    const link = TOOL_TUTORIAL_MAP[key];
    if (seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    const contextSentence = extractToolContextSentence(key, toolMentionPattern(key), bodyText);
    const sentence = contextSentence ? `${contextSentence}.` : `Use it for ${usageContext}.`;
    bullets.push(`- ${candidate}: ${link.label} - ${link.url}. ${sentence}`);
  }

  if (bullets.length === 0) return "";
  return `## Tools You Will Use\n${bullets.join("\n")}`;
}

/**
 * Render the course-WIDE "## Tools You Will Use" block for the Resources and
 * Tutorials guide (Y8-AC6, tiered toolset): unlike renderToolsYouWillUseSection
 * above (which INTERSECTS one artifact's committed set with that SAME
 * artifact's own text - the 137/141/142 anti-churn protection, which this
 * function must not weaken), this renders the whole-course CORE set
 * unconditionally - it is the term-long commitment, worth restating
 * regardless of any single document - labeled explicitly as CORE ("used
 * every week - keep your project data here"), plus, labeled separately as
 * SPECIALIST ("introduced for a specific week - produce your result in the
 * tool, then export it"), any OTHER TOOL_TUTORIAL_MAP-registered tool named
 * anywhere across the term's accumulated generated text (`allBodyText`,
 * typically every week's assignment instructions/objectives/opener pageText
 * concatenated).
 *
 * This is NOT the 137/141/142 bug reintroduced: that bug was ONE document
 * falsely claiming, in its OWN "Tools You Will Use" section, a tool it never
 * actually directed the student to use that week (misattribution WITHIN a
 * single artifact). This function makes a different, honest claim about a
 * WHOLE course - "here is what appeared as a specialist tool somewhere in
 * your 16-week term" - grounded in a literal scan of the term's own generated
 * text, exactly the same trust toolKeysMentionedIn's own "no committed
 * toolset" fallback already extends to a bare TOOL_TUTORIAL_MAP match.
 *
 * Returns "" when there is no committed CORE set at all (a coding course, or
 * an applied course whose ensureCourseTools found nothing) - a course-wide
 * guide restating a toolset that does not exist would be worse than omitting
 * the section, the same reasoning renderToolsYouWillUseSection already
 * applies to a single artifact.
 */
export function renderCourseToolPlanSection(coreToolNames: string[], allBodyText: string): string {
  const core = (Array.isArray(coreToolNames) ? coreToolNames : [])
    .map((name) => (typeof name === "string" ? name.trim() : ""))
    .filter(Boolean);
  if (core.length === 0) return "";

  const coreUrls = new Set<string>();
  const coreBullets: string[] = [];
  for (const name of core) {
    const key = findMatchingKey(name, TOOL_TUTORIAL_MAP);
    if (!key) continue;
    const link = TOOL_TUTORIAL_MAP[key];
    if (coreUrls.has(link.url)) continue;
    coreUrls.add(link.url);
    coreBullets.push(`- ${name}: ${link.label} - ${link.url}.`);
  }
  if (coreBullets.length === 0) return "";

  const specialistBullets: string[] = [];
  const seenSpecialistUrls = new Set<string>();
  for (const key of toolKeysMentionedIn(allBodyText)) {
    const link = TOOL_TUTORIAL_MAP[key];
    if (coreUrls.has(link.url) || seenSpecialistUrls.has(link.url)) continue;
    seenSpecialistUrls.add(link.url);
    specialistBullets.push(`- ${titleCaseToolKey(key)}: ${link.label} - ${link.url}.`);
  }

  const lines = [
    "## Tools You Will Use",
    "",
    "Core tools (used every week for the whole term - keep your ongoing project data here):",
    ...coreBullets,
  ];
  if (specialistBullets.length > 0) {
    lines.push(
      "",
      "Specialist tools (introduced for a specific week's task - produce your result in the tool, then export it as a file, screenshot, or link; your project data stays in the core tools above):",
      ...specialistBullets
    );
  }
  return lines.join("\n");
}

// A generic, always-applicable fallback pool for renderHelpfulFreeResources-
// Section below - open-courseware roots broad enough to be a reasonable
// "Helpful Free Resources" entry for ANY course kind or field, used only to
// pad up to the minimum when the field-keyword match finds too few (or
// none) - never invented, always a literal FIELD_RESOURCE_MAP value.
const GENERAL_FIELD_FALLBACK_KEYS = ["mit opencourseware", "openstax", "saylor"];

// D5 (deck-audit entry, docs/HANDOFF.md): even when resolveFieldResources
// correctly finds ZERO matches for a coding course (the real audited case -
// an OOP assignment whose own text never repeated a specific language name),
// the padding loop below used to reach for GENERAL_FIELD_FALLBACK_KEYS
// UNCONDITIONALLY - the exact same three general-education catalogs (MIT
// OCW, OpenStax, Saylor) regardless of whether `kind` was "coding" or
// "applied", even though `kind` was already sitting right there. That is not
// a matching-logic gap, it is the fallback pool itself being course-kind
// blind by construction - which is what actually shipped "three general
// course catalogs, nothing about OOP, nothing about Python" (the audit's own
// words) on a Python OOP assignment. Tried FIRST for `kind === "coding"`,
// before GENERAL_FIELD_FALLBACK_KEYS - freeCodeCamp and Microsoft Learn are
// real, well-known, language-agnostic programming resources, a far closer
// match for "nothing better exists" than a university course catalog. The
// neutral pool still runs afterward as the ultimate backstop (a coding course
// with both entries already matched, or `min` set above 2, still gets padded
// out of GENERAL_FIELD_FALLBACK_KEYS exactly as before) - this ADDS a
// preferred pool ahead of the existing one, it does not remove the backstop.
const CODING_FIELD_FALLBACK_KEYS = ["freecodecamp", "microsoft learn"];

/**
 * Render the "## Helpful Free Resources" markdown block CODE appends to
 * generated assignment instructions (P1-AC3): resolveFieldResources over
 * `text` (course description + assignment title + body, the caller's
 * concatenation), padded with a fallback pool - in order, skipping anything
 * already present - until at least `min` (default 3) entries are reached.
 * Every entry rendered "- <label> - <url>. <why it helps>" (U6 fix: the
 * per-resource sentence explaining relevance, present in the prompt-era
 * version of this section and lost when code took over authoring it - see
 * `whyItHelps` on ResourceLink). An entry with no `whyItHelps` set renders
 * the bare "- <label> - <url>" it always has. Never returns fewer than `min`
 * entries (the fallback pool alone covers that), and never constructs or
 * guesses a URL.
 *
 * `kind`, when given, is threaded into resolveFieldResources so a matched
 * entry outside that course kind is excluded (see resolveFieldResources's
 * own doc comment). It ALSO selects the fallback pool used to pad up to
 * `min` (D5 fix, docs/HANDOFF.md): `kind === "coding"` tries
 * CODING_FIELD_FALLBACK_KEYS first, then falls through to the neutral
 * GENERAL_FIELD_FALLBACK_KEYS pool if still short; any other kind (including
 * omitted/undefined, every pre-existing caller's behavior) uses
 * GENERAL_FIELD_FALLBACK_KEYS alone, byte-for-byte unchanged from before this
 * fix.
 */
export function renderHelpfulFreeResourcesSection(text: string, min = 3, kind?: CourseKind): string {
  const matched = resolveFieldResources(text, 6, kind);
  const seenUrls = new Set(matched.map((link) => link.url));
  const padded = [...matched];

  const fallbackKeys =
    kind === "coding" ? [...CODING_FIELD_FALLBACK_KEYS, ...GENERAL_FIELD_FALLBACK_KEYS] : GENERAL_FIELD_FALLBACK_KEYS;
  for (const key of fallbackKeys) {
    if (padded.length >= min) break;
    const link = FIELD_RESOURCE_MAP[key];
    if (!link || seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    padded.push(link);
  }

  if (padded.length === 0) return "";
  const bullets = padded.map((link) =>
    link.whyItHelps ? `- ${link.label} - ${link.url}. ${link.whyItHelps}` : `- ${link.label} - ${link.url}`
  );
  return `## Helpful Free Resources\n${bullets.join("\n")}`;
}

/**
 * Normalize a possibly-mangled resource URL against the curated maps above:
 * sanitizeResourceUrl (src/lib/urls.ts) first cleans trailing punctuation /
 * an unmatched trailing bracket; if the cleaned URL is not itself a value
 * already in either map, but shares an ORIGIN with a map entry, the map
 * entry's own url is returned instead (so
 * "https://www.pmi.org/learning/library/critical-path-method-analysis-6193"
 * collapses to the curated "https://www.pmi.org/" entry rather than
 * 404ing). Returns "" when nothing in either map shares that origin. Never
 * constructs a new URL - only ever returns "" or a literal map value.
 */
export function normalizeResourceUrl(raw: string): string {
  const sanitized = sanitizeResourceUrl(raw);
  if (!sanitized) return "";

  const allEntries = [...Object.values(TOOL_TUTORIAL_MAP), ...Object.values(FIELD_RESOURCE_MAP)];

  for (const entry of allEntries) {
    if (entry.url === sanitized) return sanitized;
  }

  let sanitizedOrigin: string;
  try {
    sanitizedOrigin = new URL(sanitized).origin;
  } catch {
    return "";
  }

  for (const entry of allEntries) {
    try {
      if (new URL(entry.url).origin === sanitizedOrigin) return entry.url;
    } catch {
      continue;
    }
  }

  return "";
}

// Re-exported so a caller that only needs resource-links.ts (the common
// case - shared.ts, docs.ts, steps.content-lectures.ts all render curated
// links) does not also need a separate import from src/lib/urls.ts.
export { sanitizeResourceUrl };
