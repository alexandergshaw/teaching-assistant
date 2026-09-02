// THE PRIVACY BLOCKER (privacy-leak review, entry following 823c0d1): strips
// every derivable form of a discussion post's author name out of a text
// string before that text ever leaves the app as a third-party web search
// concept. A plain, dependency-free-of-React leaf - importable by BOTH a
// "use client" hook (useReplyResources.ts, the per-row targeted search) and
// a "use server" action (discussion-replies.ts's gatherReplyResourcesAction,
// the automatic bulk path) - neither side can host this function itself: a
// "use server" module may export only async functions and type-only exports
// (src/lib/use-server-exports.test.ts), and a "use client" hook file is not
// importable from server code. One implementation, two callers - this repo
// has shipped the same rule twice with the tested copy not being the live
// one at least five times (AGENTS.md/module-cache-lint-rule and siblings).
//
// Reuses deriveReplyAuthorName/greetingNameFromAuthor (person-name.ts) so
// this can never disagree with what the model was actually told to use as a
// greeting - the SAME leaf discussion-draft-loop.ts uses for that decision.
//
// FIX 1 - unicode word boundaries. A plain, non-unicode JS RegExp defines
// `\b` over `[A-Za-z0-9_]` only. `\bJose\b` against an accented "José," never
// matches: the boundary between the accented "é" and the following comma is
// NON-word on both sides (neither is in `[A-Za-z0-9_]`), so `\b` never fires
// there at all - every name beginning or ending in a non-ASCII letter, and
// every non-Latin-script name (Cyrillic, CJK, ...), was exempt outright.
// Fixed with the `u` flag plus explicit unicode-aware lookarounds -
// `(?<![\p{L}\p{N}_])` and `(?![\p{L}\p{N}_])` - which read "letter, number
// or underscore" against Unicode's own letter category, not ASCII's.
//
// FIX 2 - every TOKEN of the author string, not only the three joined forms
// (greeting / firstName / lastName). `deriveReplyAuthorName` puts
// EVERYTHING but the last token into `firstName` as one joined phrase - so a
// second surname ("Ana Maria Santos Silva": lastName "Silva", firstName "Ana
// Maria Santos" - the standalone word "Santos" is in neither exact form) or
// half a hyphenated one ("Lopez-Reyes, Maria": lastName "Lopez-Reyes" as one
// phrase - the standalone word "Reyes" is in neither exact form either)
// independently leaks through the post BODY, which can mention the author's
// name in forms the greeting/sort-key split was never built to catch.
// `authorTokens` below splits the raw author string on whitespace, hyphens
// AND apostrophes (in addition to treating a "Last, First" comma as a
// delimiter too), so every individual piece is its own strippable name.
//
// Names are applied LONGEST-FIRST (not token-first, not declaration order):
// this lets a full joined phrase ("Lopez-Reyes" or "O'Brien") get stripped as
// ONE clean unit when it appears together, leaving no stray hyphen/apostrophe
// artifact behind, while the shorter individual pieces ("Reyes" alone,
// "Brien" alone) still catch the cases where only a fragment of the name
// appears on its own.

import { deriveReplyAuthorName, greetingNameFromAuthor } from "./person-name";
import { deriveResourceConcept } from "./discussion-reply-prompt";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Every literal chunk of the raw author string that might independently
 * appear in a post's text on its own - see FIX 2 above. A comma ("Last,
 * First") is treated as a delimiter exactly like whitespace, hyphens and
 * apostrophes; empty pieces (consecutive delimiters, leading/trailing ones)
 * are dropped. Pure token splitting - no addressability judgment
 * (`isAddressableGreetingToken`'s rules are specific to what is safe to
 * GREET someone with, not to what must be kept out of a third-party search). */
function authorTokens(author: string): string[] {
  return author
    .replace(/,/g, " ")
    .split(/[\s'-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Strips every case-insensitive, unicode-aware, whole-word occurrence of
 * every derivable name form for `author` out of `text`: the greeting name
 * (`greetingNameFromAuthor`), the derived first/last name
 * (`deriveReplyAuthorName`), AND every individual token of the raw author
 * string (`authorTokens`, FIX 2) - not just the three joined forms. See this
 * file's own header for FIX 1 (the unicode boundary fix) and FIX 2 (the
 * per-token fix).
 *
 * "Maria" is stripped from "Maria, your point..." but a name that happens to
 * be a substring of an unrelated word (e.g. "Marian" when the author is
 * "Maria") is left alone - the lookaround boundaries require a non-letter,
 * non-digit, non-underscore character (or start/end of string) on both
 * sides, exactly like `\b` for ASCII text, but correctly for accented and
 * non-Latin script names too.
 *
 * Deliberately NOT grammar-preserving: this text is only ever a SEARCH
 * CONCEPT, immediately re-normalized (see `redactAuthorNameFromPost` below
 * and `resourceQueryForRow` in useReplyResources.ts). F5 fix (fixer pass):
 * despite the name, this is no longer true that the redacted text is never
 * shown to anyone - docs/reply-resource-concepts-acceptance-criteria.md RC6's
 * third explanatory line (DiscussionReplyResources.tsx, "Links below came
 * from a search for: ...") and RC7's "Resource search text" CSV/JSON column
 * (discussion-replies-log.ts) both display `resourceQuery`, which can be this
 * function's own redacted, re-normalized output. A leftover stray comma or
 * double space where a name used to sit is still harmless there - the one
 * guarantee that matters is that no derived name form survives, which is
 * exactly what this function's own test pins - but it is no longer
 * invisible, so a leftover artifact is now a (harmless) thing an instructor
 * can actually see.
 *
 * Pure; never throws; empty/whitespace author yields no names to strip and
 * returns `text` collapsed only by the trailing whitespace/punctuation
 * cleanup below.
 */
export function redactAuthorNameFromText(text: string, author: string): string {
  const { firstName, lastName } = deriveReplyAuthorName(author);
  const greeting = greetingNameFromAuthor(author);
  const names = Array.from(
    new Set([greeting, firstName, lastName, ...authorTokens(author)].filter((n) => n.length > 0))
  ).sort((a, b) => b.length - a.length); // longest first - see header

  let result = text;
  for (const name of names) {
    const escaped = escapeRegExp(name);
    // "g" removes every occurrence of this name in one pass, not just the
    // first; "i" + "u" together do full unicode case folding (JOSÉ / josé /
    // José all match the same stripped token).
    result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "giu"), "");
  }

  // Cosmetic cleanup only (never load-bearing for the privacy guarantee
  // above): a stripped leading greeting name usually leaves a leading ", "
  // or similar behind; collapse runs of whitespace left by a stripped
  // mid-sentence occurrence. Never re-introduces a name.
  return result
    .replace(/^[\s,.:;-]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * BLOCKER 3: the bulk path's own redact-then-normalize step, mirroring
 * `resourceQueryForRow`'s shape (useReplyResources.ts, RC4) but for the
 * bulk/automatic pass, which is handed only `{ id, text: r.post }` per row
 * (no reply half to combine - the bulk pass never drafts before searching).
 * `author` is optional because some callers historically had no author field
 * at all before this fix (mirrors `gatherReplyResourcesAction`'s own
 * pre-fix `{ id: string; text: string }` shape) - "" is treated the same as
 * an actually-empty author (no names to strip).
 */
export function redactAuthorNameFromPost(text: string, author: string | undefined): string {
  return deriveResourceConcept(redactAuthorNameFromText(text, author ?? ""));
}
