// Pure logic for the "@institution" typeahead trigger in the chat composer
// (see docs handed down as AC2.md/SPEC-TYPEAHEAD.md for the feature this
// supports). Deliberately has NO React import, no "use client", no
// localStorage, and no DOM access of any kind - every function here takes
// the composer's current text/caret/list as plain arguments and returns
// plain data, so the caret-tracking, ARIA, and event-wiring concerns (all
// owned by the chat UI, not this module) can be unit-tested here without
// ever rendering a component (this repo's vitest suite is environment:
// "node" and renders nothing - see knowledge-context.ts's own header for
// the same split, pure logic in src/lib, wiring in the component/route).

/** The character that opens the typeahead. */
export const INSTITUTION_TRIGGER_CHAR = "@";

/**
 * Longest query the trigger will still recognize. An institution acronym is
 * short (MCC, MPCC, GCU, ...); once the run of characters after "@" grows
 * past this, the user is almost certainly typing prose that happens to
 * contain an "@" earlier in the line (an email address, "@" used as a
 * shorthand for "at"), not selecting from a short, fixed list of codes.
 * Kept well above any real acronym's length so it never clips a genuine,
 * still-being-typed query, and well below a typical word so it does not
 * linger open through an entire sentence.
 */
export const MAX_TRIGGER_QUERY_LEN = 12;

/** A recognized "@query" token in the composer, and where it starts. */
export interface InstitutionTriggerMatch {
  /** Index of the "@" character itself. */
  start: number;
  /** Text typed after "@", up to the caret. */
  query: string;
}

/**
 * Find the "@query" token, if any, that the caret currently sits inside of.
 *
 * Caret-relative, not "find the last @ in the string" - the user may be
 * editing earlier in a longer message (see the two-token test case, "hi
 * @MCC and @MPCC", where a caret sitting inside the FIRST token must resolve
 * to that one, never the second). Re-run from scratch on every keystroke
 * (the caller re-invokes this on change/keyup/click/select, never patches a
 * previous result), so there is no state here to get stale.
 *
 * THE WORD-BOUNDARY RULE (step 3 below) is what keeps ordinary prose safe.
 * Without it, `alexandergshaw@gmail.com` would trigger the moment the
 * caret sat anywhere inside "gmail" or "com", because scanning back from
 * the caret would walk right through the alphanumeric run and land on the
 * "@" - which is a perfectly normal character to have mid-word in an email
 * address, just never preceded by whitespace (or nothing, at the very start
 * of the message) the way a deliberate trigger always is.
 */
export function parseInstitutionTrigger(text: string, caret: number): InstitutionTriggerMatch | null {
  // 1. Scan back from just before the caret while characters are
  // alphanumeric - this is the run that would become `query`.
  let i = caret - 1;
  while (i >= 0 && /[A-Za-z0-9]/.test(text[i])) {
    i -= 1;
  }

  // 2. The scan stops the instant it hits a non-alphanumeric character (or
  // runs off the start of the string). For this to be a trigger, that
  // stopping character must BE "@" - anything else (a space, a hyphen, the
  // start of the string with no "@" at all) means there is no token here.
  if (i < 0 || text[i] !== INSTITUTION_TRIGGER_CHAR) return null;
  const start = i;

  // 3. THE WORD BOUNDARY. The character immediately before "@" must not
  // exist (the "@" opens the message) or must be whitespace. This is the
  // entire reason `user@domain.com` never triggers: the "@" there is always
  // preceded by another word character, never a space or the start of the
  // string.
  const before = text[start - 1];
  if (before !== undefined && !/\s/.test(before)) return null;

  // 4. The query is whatever sits between "@" and the caret. A query this
  // long is prose, not an acronym - see MAX_TRIGGER_QUERY_LEN's own doc.
  const query = text.slice(start + 1, caret);
  if (query.length > MAX_TRIGGER_QUERY_LEN) return null;

  return { start, query };
}

/**
 * Institutions whose code starts with `query`, case-insensitively.
 *
 * Deliberately `startsWith`, NOT `includes` - `includes` would surface MPCC
 * for a query of "P", which is not where "P" appears in any acronym a user
 * would actually type first, and would make the highlighted/first result
 * unpredictable (which of possibly several codes containing "P" wins?).
 * `startsWith` matches how someone actually types an acronym: left to
 * right, from its first letter.
 */
export function filterInstitutions(list: string[], query: string): string[] {
  const q = query.toLowerCase();
  return list.filter((code) => code.toLowerCase().startsWith(q));
}

/**
 * Registry order, except `active` (the institution currently set in
 * Settings - see readActiveInstitution in src/lib/institutions.ts) is
 * hoisted to index 0 so it is also the highlighted option when the popup
 * first opens. This makes the common case - "load the institution I'm
 * already working in" - exactly two keystrokes: "@" then Enter.
 *
 * `active` may be "" (no institution set yet) or a code not present in
 * `list` (stale localStorage vs. the current registry) - both leave the
 * order untouched rather than throwing or hoisting a phantom entry.
 */
export function orderInstitutions(list: string[], active: string): string[] {
  if (!active) return [...list];
  const idx = list.indexOf(active);
  if (idx <= 0) return [...list]; // not found, or already first: nothing to hoist
  const reordered = [...list];
  reordered.splice(idx, 1);
  reordered.unshift(active);
  return reordered;
}

/** The composer text and caret position after selecting an institution. */
export interface InstitutionSelectionResult {
  text: string;
  caret: number;
}

/**
 * Remove the "@query" token (the half-open range [start, caret)) from
 * `text`, leaving the caret exactly where the token used to start.
 *
 * The double-space collapse below exists because the token is deleted, not
 * replaced - "what does @MCC say" has a space before "@" AND a space right
 * after the token ends (before "say"). Deleting only [start, caret) leaves
 * BOTH of those spaces adjacent to each other ("what does  say"); this
 * collapses that pair down to one, but only when both sides really are
 * spaces - a token at the very start of the message, or one butted directly
 * against following punctuation, must not lose a character it never had.
 */
export function applyInstitutionSelection(text: string, start: number, caret: number): InstitutionSelectionResult {
  let result = text.slice(0, start) + text.slice(caret);
  if (result[start - 1] === " " && result[start] === " ") {
    result = result.slice(0, start) + result.slice(start + 1);
  }
  return { text: result, caret: start };
}

/**
 * The next highlighted option index after moving `delta` steps (+1/-1) from
 * `current`, wrapping around both ends of a list of `count` options - Down
 * from the last option lands on the first, Up from the first lands on the
 * last, matching every other listbox/menu in this app.
 *
 * `count <= 0` (zero matches) returns -1: there is nothing to highlight,
 * matching the "no <ul> in the DOM" rule for the zero-matches state - a
 * caller must never index into an empty list with whatever this returns.
 */
export function nextHighlightIndex(current: number, count: number, delta: number): number {
  if (count <= 0) return -1;
  return ((current + delta) % count + count) % count;
}
