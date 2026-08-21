// Pure matching rule for "which saved course row does this Canvas URL belong
// to" - AC S1 in docs/lms-tab-syllabus-buttons-acceptance-criteria.md. Matches
// on parseCanvasCourseId(url) AND host, never raw string equality, so a
// trailing slash, a query string, or an http/https mismatch on either side
// does not defeat the match. The local course row stays authoritative (AC
// decision 2) - this only decides WHICH row to use, never invents one. Pure -
// no I/O, so it is unit-testable without a Supabase or Canvas fixture.
//
// findCourseForCanvasUrl is this file's ONLY production entry point. An
// earlier revision also exported `canvasUrlMatchesCourse` as a lower-level
// pairwise comparator; it had zero production callers (only its own test)
// and its host-less path never consulted `institution` at all - the OLD,
// pre-institution-aware rule findCourseForCanvasUrl no longer uses. That is
// exactly a public trap: the next person who reached for the
// obviously-named helper would get behaviour this file otherwise removed on
// purpose. It has been deleted rather than patched, since it cannot
// implement the same rule as findCourseForCanvasUrl without also taking an
// `institution` parameter - at which point it is just a worse-typed
// duplicate of the real function. Do not re-add a second public matcher
// unless it genuinely shares one implementation with the one below.
//
// A NOTE ON THIS COMMENT BLOCK'S OWN HISTORY. Earlier revisions of this file
// narrated a sequence of numbered findings ("M11", "M12", "M14", "FIX WAVE
// 7", "FIX WAVE 9") and, in several places, claimed specific verification
// against `git show HEAD:...` or a `git stash`'d prior version. Those
// sourcing claims did not hold up under an adversarial review that actually
// ran `git log --follow` on this path: there is exactly ONE commit for this
// file, the one that created it, so there is no earlier committed revision
// to diff against - and `git stash` is forbidden in this repo regardless
// (it reverts every concurrently-editing agent's files, not just this one).
// The REASONING in each numbered finding below is still real and is still
// the WHY for the current rule, so it is kept; every place that claimed a
// specific git-sourced verification has been corrected to say what was
// actually checked instead - typically a throwaway script reimplementing
// the OLD algorithm being described and running the same inputs through it,
// never a diff against real history.
//
// THE RULE, TOP TO BOTTOM: course id must match on both sides; then host,
// when both sides carry one; then, only when host cannot decide (the
// host-less `/courses/<id>` shape CoursePicker.tsx and LmsCell.tsx actually
// emit), fall back to the `institution` column. `institution` is FREE TEXT -
// AddCourseForm.tsx's Institution field is a `freeSolo` MUI Autocomplete
// (src/app/components/courses/AddCourseForm.tsx:276-284) and CourseRow.tsx's
// own cell is a plain editable text field
// (src/app/components/courses/CourseRow.tsx:185) - never validated against
// the registered acronym list (src/lib/institutions.ts's `readInstitutions`).
// That registry is itself CLIENT-ONLY: it lives in localStorage behind a
// `typeof window === "undefined"` guard and has no server-side counterpart,
// so this file - which also runs inside Route Handlers - cannot read it
// directly. findCourseForCanvasUrl therefore accepts an OPTIONAL
// `knownAcronyms` list so a caller that DOES have the real registry (a
// client component, or a server caller some future change threads it
// through to) can supply it. As of this fix, no caller does - the sole
// production call site (src/app/actions/lms-syllabus-buttons.ts:119) calls
// `findCourseForCanvasUrl(hub.courses, canvasUrl, acronym)`, three
// arguments. The honest, currently-true consequence: a free-text
// `institution` value is NEVER, today, treated as evidence of a different
// school, because this file has no way to tell "unstructured text that
// happens to differ" apart from "a real, different, registered acronym".
// Only a value confirmed against `knownAcronyms` counts as the latter. See
// findCourseForCanvasUrl's own doc comment for the precise rule this
// produces, and its closing section for exactly which cross-institution
// scenarios remain open as a result - open by necessity, not oversight.
import { parseCanvasCourseId } from "./canvas-url";

/**
 * Lowercased host of a Canvas URL. Tolerant of a schemeless FULL url (e.g.
 * "school.instructure.com/courses/123" - retried with "https://" prepended,
 * since `new URL` throws without a scheme) so a course row saved before
 * validation existed still matches; null when neither parse succeeds, or when
 * the input has no host to find at all.
 *
 * M11 fix: the retry used to run unconditionally on ANY parse failure,
 * including a bare PATH like "/courses/10287" - the shape CoursePicker.tsx
 * and LmsCell.tsx actually emit. `new URL("/courses/10287")` throws (no
 * scheme, no host), so the retry built `new URL("https:///courses/10287")` -
 * three slashes. The WHATWG URL parser's "special authority ignore slashes"
 * state treats that extra slash as noise and reads a host up to the NEXT
 * slash, so this returned the literal string "courses" as though it were a
 * real host - reproduced directly (not sourced from git history - see this
 * file's header comment) with a throwaway script running the pre-fix
 * algorithm against `/courses/10287`: it does return the host "courses",
 * and a resolver built on it does collapse two different institutions'
 * courses sharing a numeric id onto whichever row happens to come first.
 * Every host-less URL collapsed to that same pseudo-host, so two different
 * courses at two different institutions sharing a numeric id were already
 * indistinguishable - the guard this file exists for was silently defeated.
 * Excluding a leading "/" from the retry is the entire fix: a path-only
 * input has no host, full stop, and this now says so.
 *
 * DEFECT (M14 review, still accurate): the exclusion above is
 * `startsWith("/")` only, so a SCHEMELESS RELATIVE path with no leading
 * slash - e.g. "courses/123" - would still fall through to the
 * `https://courses/123` retry and yield the same "courses" pseudo-host bug
 * the leading-slash fix above closed. This is unreachable TODAY only because
 * of a guard in a DIFFERENT file: `parseCanvasCourseId` (./canvas-url.ts)
 * matches `/\/courses\/(\d+)/` - a LEADING slash is baked into that regex -
 * so `parseCanvasCourseId("courses/123")` is null, and findCourseForCanvasUrl
 * (this module's only caller) checks the parsed id FIRST and bails before
 * `hostOf` is ever asked about a string in this shape. That cross-file
 * dependency is load-bearing and easy to break silently (e.g. a future
 * caller that calls `hostOf` directly, or a `parseCanvasCourseId` rewrite
 * that widens the regex) - noted here so the next person touching either
 * file sees it.
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    if (url.startsWith("/")) return null;
    try {
      return new URL(`https://${url}`).host.toLowerCase();
    } catch {
      return null;
    }
  }
}

/**
 * Normalize a caller-supplied scope key - the `acronym` argument below, a
 * course row's own `institution` column, or a `knownAcronyms` entry - all of
 * which are compared through this SAME function so trimming/case-folding can
 * never drift between the sides of a comparison. Trims, then treats pure
 * whitespace (or an absent/null/undefined value) as "no key at all" - never a
 * value that can itself equal another blank/whitespace value.
 *
 * DEFECT (M14 review, still accurate): `acronym` reaches
 * findCourseForCanvasUrl from UNVALIDATED JSON at two Route Handlers
 * (deck/route.ts's `body.acronym`, lms-export/selection/route.ts's
 * `body.acronym`), so a literal `"   "` string is a realistic client input,
 * not just a defensive triviality. Without normalizing BOTH sides through
 * this one function, a whitespace acronym (truthy, so it would have passed a
 * bare `!!acronym` check) could silently act as a wildcard against any row
 * whose free-text `institution` column also happens to be blank/whitespace.
 */
function normalizeScopeKey(value?: string | null): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

/**
 * Public boundary version of normalizeScopeKey above, for callers that read
 * `acronym` from UNVALIDATED input before it ever reaches
 * findCourseForCanvasUrl - deck/route.ts's and lms-export/selection/route.ts's
 * own `body.acronym` (raw JSON), specifically. Case is preserved here (unlike
 * the internal comparison helper, which lower-cases for matching) since these
 * callers may still want to display or forward the value; only
 * whitespace-only/absent collapses to `undefined`. Not required for
 * correctness - findCourseForCanvasUrl normalizes internally regardless of
 * what it is handed - but normalizing at the boundary keeps a route's own
 * branching (e.g. `body.acronym ? ... : ...`) from treating a whitespace
 * string as "present" when the matching rule itself treats it as absent.
 */
export function normalizeCanvasAcronymInput(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
}

/**
 * Find the saved course row whose canvasUrl matches the LMS tab's current
 * course (AC S1). Returns null when no row matches - the caller reports this
 * as a specific, actionable "course not linked" message naming the URL (AC
 * S2), never a generic failure or a silent no-op.
 *
 * `acronym` is the CURRENTLY ACTIVE institution (ContentTab's
 * `activeInstitution` / ModulesView's `acronym` prop - already threaded to
 * every caller of this function for other reasons).
 *
 * `knownAcronyms` is an OPTIONAL list of REGISTERED institution acronyms
 * (e.g. `readInstitutions()`, src/lib/institutions.ts). See this file's
 * header comment for why this file cannot read that registry itself (it is
 * client-only, and this file also runs in Route Handlers) and why, as of
 * this fix, NO current caller supplies it. Its only effect is narrowing
 * branch (a) below; omitting it never disables any other step of the rule,
 * it only means branch (a) has no way to tell free text apart from a real
 * acronym and treats every non-blank institution as absent evidence.
 *
 * The matching rule, in priority order:
 *
 *   1. COURSE ID must match on both sides (parseCanvasCourseId), full stop.
 *      A row whose id does not match the tab's is never a candidate, no
 *      matter what its host or institution say.
 *
 *   2. HOST, when decidable. When a candidate row's canvasUrl AND the tab's
 *      canvasUrl BOTH carry a real host (`hostOf` returns non-null for
 *      both), that comparison alone decides it - equal hosts win
 *      immediately, and institution/acronym is never even consulted. A host
 *      MISMATCH here is a decisive rejection: it proves the row is a
 *      DIFFERENT course, and that row is never reconsidered by step 3 below
 *      no matter how the id/institution turn out.
 *
 *   3. Otherwise - HOST-INCONCLUSIVE (at least one side is the host-less
 *      `/courses/<id>` shape LmsCell.tsx/CoursePicker.tsx actually emit, and
 *      the row was not already rejected by step 2's host mismatch) - id
 *      alone cannot tell two such rows apart, so look at how MANY saved rows
 *      are in this situation for this same id:
 *
 *        a. Exactly ONE such row: uniqueness proves there is no OTHER row to
 *           confuse it with - but that only settles the question when this
 *           row's own `institution` is not POSITIVE evidence of a different
 *           school. Three sub-cases:
 *
 *             - BLANK/NULL institution (LmsCell.tsx never writes
 *               `institution` at all, so this is the COMMON case for every
 *               row it links): absent information, not evidence of
 *               anything - irrelevant, and uniqueness alone resolves it.
 *
 *             - institution SET, differs from the acronym, but is NOT a
 *               member of `knownAcronyms` (including when `knownAcronyms`
 *               was not supplied at all - today's actual state for every
 *               caller): unstructured free text that merely differs is not
 *               evidence either, and is treated EXACTLY like blank -
 *               uniqueness resolves it. Rejecting here unconditionally,
 *               the way an earlier revision of this rule did, made every row
 *               whose free-text Institution field did not happen to spell
 *               the acronym exactly permanently unmatchable - a real
 *               regression this fix reverts, not a narrowing.
 *
 *             - institution SET, differs from the acronym, AND IS a member
 *               of `knownAcronyms`: this is POSITIVE evidence the row
 *               belongs to a DIFFERENT, REGISTERED institution's course - a
 *               saved row cannot belong to two schools at once - so it is a
 *               decisive rejection, exactly like a host mismatch in step 2
 *               above. Being the only row that happens to share this
 *               numeric id does NOT make it the SAME course; uniqueness
 *               never rescues this row - the result is null, not a guess.
 *
 *           Either way, still requires SOME acronym to be supplied - a
 *           caller with zero institution context of its own can never
 *           resolve a host-less URL at all.
 *
 *        b. TWO OR MORE such rows: host could not disambiguate them, and
 *           neither can uniqueness - two institutions' courses sharing a
 *           numeric id. The ONLY remaining signal is institution: a row wins
 *           ONLY when its own `institution`, trimmed and case-folded, equals
 *           the caller's acronym (also trimmed/case-folded), AND it is the
 *           ONLY row in the pool whose institution does. Two (or more) rows
 *           sharing the SAME institution value is exactly as unresolvable as
 *           no match at all - `.find` used to silently return whichever
 *           came first; this now returns null instead, same as zero matches.
 *           A null/blank institution NEVER wins this branch, even though it
 *           would win branch (a) above - it is indistinguishable from every
 *           OTHER blank row in this same pool, and guessing between them is
 *           exactly what this whole rule exists to avoid. This ambiguity
 *           count is taken over the ORIGINAL host-inconclusive pool, never a
 *           pool pre-filtered by institution first - pre-filtering would let
 *           a co-resident BLANK row win branch (a) by uniqueness for an
 *           acronym that was never actually its own (see the "mixed pool"
 *           test for the concrete case this guards).
 *
 * WHAT THIS CLOSES, AND WHAT REMAINS OPEN (read this before assuming a
 * cross-institution collision cannot happen):
 *
 *   CLOSED: two saved rows sharing a numeric id where BOTH sides carry a
 *   real, differing host (step 2); a host-inconclusive row that is NOT the
 *   caller's own, when its institution is a REGISTERED, differing acronym
 *   (branch a's third sub-case); and the classic two-different-institutions-
 *   both-linked-via-LmsCell case, when both rows' institutions are known and
 *   supplied via `knownAcronyms`... except that LmsCell never writes
 *   `institution` at all (see below), so in practice this last case is
 *   closed only when at least one row's institution was set by some OTHER
 *   path (e.g. edited by hand in CourseRow.tsx, or entered via AddCourseForm)
 *   and matches branch (b)'s pool.
 *
 *   OPEN, BY NECESSITY, NOT BY OVERSIGHT: a row with a BLANK institution and
 *   a UNIQUE host-inconclusive id matches ANY acronym - branch (a)'s first
 *   sub-case. `institution` is null for every row LmsCell.tsx has ever
 *   linked (its commit() saves only `{canvasUrl}`), so this is the COMMON
 *   case, not an edge case. Closing it would mean rejecting a unique
 *   blank-institution row whenever the caller's acronym does not already
 *   happen to match it - which un-links EVERY course a single-institution
 *   user (this app's original, still-common user) has ever linked through
 *   the LMS tab, exactly the regression an earlier revision of this rule
 *   introduced and this fix reverts. It can only be closed by either (a)
 *   backfilling `institution` on every existing and future saved row, so
 *   blank stops being the common case, or (b) accepting that
 *   single-institution use breaks. Neither is this fix's call to make.
 *
 *   ALSO OPEN: two rows sharing a numeric id where NEITHER side's host is
 *   comparable to the tab's (e.g. one row has a full https:// URL, the other
 *   is host-less, and the TAB itself is host-less - the row's real host has
 *   nothing on the tab side to compare against) AND both institutions are
 *   blank. This lands in branch (b) with a pool of 2, matches nothing, and
 *   returns null - deliberately the SAME outcome as two fully host-less
 *   blank rows sharing an id, because from this rule's point of view the two
 *   scenarios carry identical information: two candidates, neither host- nor
 *   institution-distinguished. Resolving it anyway would mean assuming they
 *   are the same physical course rather than two different courses that
 *   happen to coincide on a numeric id - exactly the guess this file exists
 *   to refuse.
 */
export function findCourseForCanvasUrl<
  T extends { canvasUrl: string | null; institution?: string | null },
>(
  courses: T[],
  tabCanvasUrl: string,
  acronym?: string,
  knownAcronyms?: readonly string[]
): T | null {
  const tabId = parseCanvasCourseId(tabCanvasUrl);
  if (!tabId) return null;
  const tabHost = hostOf(tabCanvasUrl);
  const normalizedAcronym = normalizeScopeKey(acronym);
  // The set of institution values that count as POSITIVE evidence of a
  // different school - i.e. REGISTERED acronyms, not any old free text.
  // Empty (the default - no caller supplies `knownAcronyms` yet) means no
  // institution value can ever count as evidence, which is the honest
  // behaviour when this file has no registry signal at all (see the header
  // comment and findCourseForCanvasUrl's own doc comment above).
  const knownAcronymSet = new Set(
    (knownAcronyms ?? [])
      .map((a) => normalizeScopeKey(a))
      .filter((a): a is string => !!a)
  );

  // Step 1: every row whose OWN course id matches the tab's - the only rows
  // that could possibly be this course, independent of host or institution.
  // A blank/null canvasUrl (never a valid id) is never a candidate.
  const idMatches = courses.filter((c) => {
    const stored = (c.canvasUrl ?? "").trim();
    return !!stored && parseCanvasCourseId(stored) === tabId;
  });

  // Step 2: HOST, when decidable - see this function's own doc comment.
  // Equal hosts win immediately; a real-host row that does NOT equal
  // `tabHost` is proven a different course and is excluded from step 3's
  // pool below (never rescued by id/institution once host has spoken).
  if (tabHost) {
    const hostMatch = idMatches.find((c) => {
      const storedHost = hostOf((c.canvasUrl ?? "").trim());
      return !!storedHost && storedHost === tabHost;
    });
    if (hostMatch) return hostMatch;
  }

  // Step 3: everything left is host-inconclusive - id matches, but host
  // could not settle it (at least one side host-less), AND (when tabHost is
  // real) it did not lose the decisive host comparison above.
  const inconclusive = idMatches.filter((c) => {
    const storedHost = hostOf((c.canvasUrl ?? "").trim());
    return !(storedHost && tabHost);
  });
  if (inconclusive.length === 0) return null;

  if (inconclusive.length === 1) {
    // Branch (a): unique - see this function's own doc comment. A blank/null
    // institution, or free text that is not itself a registered acronym, is
    // irrelevant (absent information); only an institution CONFIRMED as a
    // different registered acronym (via `knownAcronyms`) is a decisive
    // rejection, never rescued by uniqueness alone.
    if (!normalizedAcronym) return null;
    const candidate = inconclusive[0];
    const candidateInstitution = normalizeScopeKey(candidate.institution);
    if (
      candidateInstitution &&
      candidateInstitution !== normalizedAcronym &&
      knownAcronymSet.has(candidateInstitution)
    ) {
      return null;
    }
    return candidate;
  }

  // Branch (b): ambiguous - two or more host-inconclusive rows share this
  // id. Institution is the only remaining signal: a row wins only when its
  // own institution equals the acronym AND it is the sole row in the pool
  // that does. Two rows sharing the same institution value is exactly as
  // unresolvable as no match at all - never guess between them.
  if (!normalizedAcronym) return null;
  const matches = inconclusive.filter((c) => normalizeScopeKey(c.institution) === normalizedAcronym);
  return matches.length === 1 ? matches[0] : null;
}
