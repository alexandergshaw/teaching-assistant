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
