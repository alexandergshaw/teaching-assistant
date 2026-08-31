// Discussion reply sort/filter - F1a/F2/F3 (docs/discussion-reply-sort-filter-
// acceptance-criteria.md, section 3). A dependency-free leaf: it imports
// nothing from this feature (or any other) so that `discussion-table-view.ts`
// (sorting) and `discussion-reply-prompt.ts` (the address line, a later
// group) can both import it without ever importing each other. That avoids a
// module cycle through `discussion-capture.ts`, which this repo has recorded
// as silently yielding `undefined` past `tsc`.
//
// The split rules are adopted verbatim from
// docs/repo-grades-name-columns-and-sorting-acceptance-criteria.md (REGRESSION
// entry 361) and its shipped implementation, `deriveRepoGradeStudentName`
// (src/app/components/repo-grades/repoGradeStudentName.ts) - read for the
// rules, NOT imported: that function's second parameter is Canvas's own
// `sortableName`, which a vision-read discussion author string can never
// have, and it lives in another feature's component folder.
//
// Pure, no I/O, no React.

/**
 * Where a name's first/last split came from.
 *   - "explicit": the string already contained "Last, First" - the comma is
 *     the correction channel an instructor (or upstream source) can use.
 *   - "derived": no comma, two or more tokens - the last-word rule guessed
 *     the split. Never silent: callers must show the correction hint.
 *   - "single": exactly one token. The surname is UNKNOWN, not empty-as-a-
 *     first-name - see `lastName` below.
 *   - "none": nothing at all after trimming.
 */
export type NameSource = "explicit" | "derived" | "single" | "none";

export interface ReplyAuthorName {
  firstName: string;
  /** "" when unknown (sources "single" and "none") - deliberately NOT a
   * display marker. F3: the sort key must treat an unknown surname as
   * blank-sorts-last, never as a punctuation mark. Rendering the em dash is
   * the caller's job (the table cell), not this function's. */
  lastName: string;
  source: NameSource;
  /** Present only when source === "derived" - the last-word guess needs a
   * visible correction hint; every other source is either confirmed
   * ("explicit") or has nothing to guess ("single"/"none"). */
  correctionHint?: string;
}

function splitTokens(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

/**
 * Derives a first/last name split from a raw display string (F2/F3).
 *
 * Rule order (adopted from entry 361, applied to the raw author string):
 *   1. A comma is the correction channel: "Smith, John" -> lastName "Smith",
 *      firstName "John", source "explicit".
 *   2. No comma, two or more tokens: the last token is the surname, the rest
 *      is the given name, source "derived", with a correctionHint.
 *   3. One token: firstName is that token, lastName "" (UNKNOWN, not an
 *      empty surname), source "single".
 *   4. Empty after trim: source "none", both fields "".
 */
export function deriveReplyAuthorName(author: string): ReplyAuthorName {
  const trimmed = (author ?? "").trim();

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex !== -1) {
    const lastName = trimmed.slice(0, commaIndex).trim();
    const firstName = trimmed.slice(commaIndex + 1).trim();
    return { firstName, lastName, source: "explicit" };
  }

  const tokens = splitTokens(trimmed);
  if (tokens.length >= 2) {
    const lastName = tokens[tokens.length - 1];
    const firstName = tokens.slice(0, -1).join(" ");
    return {
      firstName,
      lastName,
      source: "derived",
      correctionHint:
        `Guessed by treating the last word of "${trimmed}" as the surname - if that is wrong ` +
        `(for example, a multi-part surname), correct it as "${lastName}, ${firstName}".`,
    };
  }

  if (tokens.length === 1) {
    return { firstName: tokens[0], lastName: "", source: "single" };
  }

  return { firstName: "", lastName: "", source: "none" };
}

// docs/reply-composition-controls-acceptance-criteria.md BLOCKER 1 (fixer
// pass): whether a candidate greeting token is safe to address a real person
// with, or reads as a handle/artifact that must degrade to "". This was
// PREVIOUSLY split across two layers with neither actually implementing it -
// this leaf tokenized and said "the caller judges", and the caller
// (discussion-draft-loop.ts) only checked for "" - so `greetingNameFromAuthor`
// itself now owns the judgment and a caller cannot forget it.
//
// `isOnlyToken` is true ONLY for a bare, comma-free, single-token author
// string (e.g. "mchen") - never for the token taken from after a comma in
// "Last, First" form, even when that token is itself one word. A comma-form
// author has already supplied TWO components (a surname and a given name),
// which is direct evidence of a real name, so rule 3 below does not apply to
// it.
function isAddressableGreetingToken(token: string, isOnlyToken: boolean): boolean {
  // Rule 1: no letters at all - a punctuation-only or digit-only token
  // (an OCR artifact such as "..." or a stray number) has nothing to
  // address anyone by.
  if (!/[A-Za-z]/.test(token)) return false;
  // Rule 2: anything outside letters, hyphen, apostrophe and period is not a
  // name character in this context - digits, underscores, "@", "/" and
  // similar mark a username/handle/artifact rather than a name. Hyphens
  // ("Anne-Marie"), apostrophes ("O'Brien") and periods ("J.R.") are kept.
  if (!/^[A-Za-z.'-]+$/.test(token)) return false;
  // Rule 3: a SINGLE-token author (no comma, nothing else in the string)
  // that is entirely lowercase is overwhelmingly a username, not a name -
  // LMS display names are proper-cased, so "mchen" degrades. This rule is
  // deliberately narrow: it applies ONLY to single-token authors, so a
  // capitalised mononym ("Maria") is never degraded. Erasing a real, if
  // unusual, name is its own harm - the asymmetry here is intentional: a
  // wrong degrade only costs a missing greeting (now visibly marked, see
  // C1c-i), while a wrong greeting addresses a student by their username in
  // the instructor's own voice.
  if (isOnlyToken && !/[A-Z]/.test(token)) return false;
  return true;
}

/**
 * First-token greeting name for addressing a post's author directly.
 * docs/reply-composition-controls-acceptance-criteria.md C1b-i: this is
 * DELIBERATELY separate from `deriveReplyAuthorName(...).firstName`, which is
 * a SORT KEY (everything except the LAST token, so a table column can order
 * "Maria de la Cruz" under "Cruz"). Reusing that field for a greeting would
 * produce "Maria de la, your point ..." - wrong, and the exact defect this
 * export exists to avoid. This function always returns the FIRST token only
 * (or "" when that token is not safe to address someone by - see BLOCKER 1
 * below).
 *
 * Rules:
 *   - comma form "Last, First ...": the first token AFTER the comma.
 *     A comma with nothing usable after it - a trailing-comma artifact such
 *     as "Smith," - has no given name to report. This is treated the same as
 *     an empty input: it returns "". The caller (which threads this per post,
 *     per C1b-ii) must read "" as "no greeting available for this row", not
 *     fall back to the surname before the comma - the surname is not a
 *     greeting name and a vision-read board can produce a bare trailing comma
 *     as an OCR artifact with no given name ever having been printed.
 *   - no comma, one or more tokens: the FIRST token, taken whole - UNLESS
 *     `isAddressableGreetingToken` judges it unaddressable, in which case
 *     this returns "" instead. C1c/BLOCKER 1: a single lowercase token
 *     (e.g. "mchen") degrades because it reads as a handle, not a name; a
 *     capitalised single token (e.g. "Maria") does NOT degrade - it is a
 *     legitimate mononym. A token that is punctuation-only, contains a digit,
 *     or contains any character outside letters/hyphen/apostrophe/period
 *     also degrades, regardless of token count.
 *   - empty or whitespace-only input: "".
 *
 * Pure; never throws; never invents a name the input did not contain; never
 * silently hands a handle or artifact to the model as a person's name (see
 * DiscussionReplyRow.tsx's degrade marker, C1c-i, for how this is surfaced
 * to the instructor rather than left invisible).
 */
export function greetingNameFromAuthor(author: string): string {
  const trimmed = (author ?? "").trim();
  if (trimmed === "") return "";

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex !== -1) {
    const afterComma = splitTokens(trimmed.slice(commaIndex + 1));
    if (afterComma.length === 0) return "";
    const candidate = afterComma[0];
    return isAddressableGreetingToken(candidate, false) ? candidate : "";
  }

  const tokens = splitTokens(trimmed);
  if (tokens.length === 0) return "";
  const candidate = tokens[0];
  const isOnlyToken = tokens.length === 1;
  return isAddressableGreetingToken(candidate, isOnlyToken) ? candidate : "";
}

/**
 * docs/reply-composition-controls-acceptance-criteria.md C1c-i (BLOCKER 2,
 * fixer pass): the row-level degrade marker's visibility condition, pulled
 * out into a plain exported function so it has a test surface in this
 * repo's node-env vitest (which renders no component - see
 * DiscussionReplyRow.tsx's own header). `DiscussionReplyRow.tsx` calls this
 * directly rather than inlining `addressByName && greetingNameFromAuthor(...)
 * === ""` itself, so the marker's condition and this function's test oracle
 * can never drift apart.
 *
 * True only when the address-by-name toggle is ON AND this author's own
 * greeting name comes back empty - i.e. exactly the state where a reply
 * will silently open with no greeting despite the toggle being on. Never
 * true while the toggle is OFF: there is no greeting decision to report in
 * that state at all.
 */
export function isGreetingDegradedForAuthor(addressByName: boolean, author: string): boolean {
  return addressByName && greetingNameFromAuthor(author) === "";
}
