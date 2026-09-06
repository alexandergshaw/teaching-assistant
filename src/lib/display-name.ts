/**
 * Bounds and normalises `app_users.display_name` - a SELF-ASSERTED, UNVERIFIED
 * value this app cannot fully control, rendered next to the email address an
 * owner uses to decide whether to approve an account (docs/multi-user-login-
 * acceptance-criteria.md, B1).
 *
 * Deliberately NOT `import "server-only"`, unlike ./signup-rules.ts. This
 * module has to run in two different places:
 *   1. `validateSignup` (./signup-rules.ts), at write time, on the server; and
 *   2. a later admin-list render, which needs the SAME clamp applied to a
 *      value that may never have passed through our form at all (see
 *      `nameFromAuthMetadata` in ./supabase/app-users.ts: `user_metadata`
 *      is writable straight from the browser with the public anon key, so a
 *      malicious value can reach `display_name` without ever calling
 *      `validateSignup`). A `server-only` guard on a module a render path
 *      needs would make that render path fail to build the moment anyone
 *      wired it up - the opposite of what this module exists to enable.
 *
 * WHAT THIS DEFENDS AGAINST: not XSS (React escapes, and this app's document
 * writers XML-escape independently of this module) but IMPERSONATION and
 * LAYOUT. A right-to-left override embedded in a name changes what an owner
 * READS beside the email in an approval list, so they approve the wrong row;
 * an unbounded name breaks whatever surface it is rendered in.
 *
 * THIS CLAMP IS NOT THE ONLY DEFENCE. The account can rewrite `user_metadata`
 * again at any time AFTER this clamp has run once, including after the row
 * has been filled in (see the note on write-once semantics on
 * `clampDisplayName` below) - so any later surface that displays a *live*
 * (not stored) metadata value, or any code path that re-reads
 * `user_metadata` directly instead of the stored, already-clamped
 * `display_name`, must independently bound length and strip
 * bidi/control/zero-width characters at render time too. This module gives
 * callers the one function to call for that; it does not, by existing,
 * guarantee every future caller calls it.
 *
 * The stripped/whitespace code points below are identified purely by
 * NUMERIC range, never by embedding the literal character in this source
 * file - the same reasoning `safeNextPath` (src/lib/access.ts) gives for
 * scanning code points explicitly rather than relying on a character class
 * that would have to contain the very characters this file exists to keep
 * out.
 */

/**
 * The maximum length, in Unicode code points, a display name is allowed to
 * reach. Large enough that a real, long human name is never mistaken for
 * abuse (the acceptance criterion this exists for is a bound, not a name
 * policy), small enough to keep an approval list and any document that
 * embeds this value from being broken by it.
 */
export const DISPLAY_NAME_MAX_LENGTH = 120;

/**
 * True for a code point that must be removed outright (never merely
 * collapsed):
 *   - 0x0000-0x0008, 0x000E-0x001F, 0x007F-0x009F: the C0 and C1 control
 *     characters, EXCLUDING tab (0x0009), LF (0x000A), VT (0x000B),
 *     FF (0x000C) and CR (0x000D) - those five are left for
 *     `isCollapsibleWhitespace` below to fold into a single ordinary space,
 *     rather than vanishing with no trace at all.
 *   - 0x061C (Arabic Letter Mark) and 0x200E-0x200F (LTR/RTL marks):
 *     invisible direction hints with no visible glyph of their own.
 *   - 0x200B-0x200D (zero-width space/non-joiner/joiner): can make two
 *     visually distinct names compare as different strings, or fuse two
 *     tokens together with no visible trace.
 *   - 0x202A-0x202E (LRE/RLE/PDF/LRO/RLO) and 0x2066-0x2069
 *     (LRI/RLI/FSI/PDI): the bidi embedding/override/isolate controls.
 *     0x202E (RLO) in particular can make a name RENDER as a different
 *     person entirely next to the email an owner is deciding whether to
 *     trust.
 *   - 0xFEFF (byte-order mark / zero-width no-break space): invisible, and
 *     otherwise a stray artifact of whatever produced the input.
 */
function isStrippableCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0000 && codePoint <= 0x0008) ||
    (codePoint >= 0x000e && codePoint <= 0x001f) ||
    (codePoint >= 0x007f && codePoint <= 0x009f) ||
    codePoint === 0x061c ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2066 && codePoint <= 0x2069) ||
    codePoint === 0xfeff
  );
}

/**
 * True for a code point that counts as whitespace to be COLLAPSED (runs of
 * one or more fold to a single ordinary space, and leading/trailing runs
 * disappear entirely) rather than stripped with no trace. Covers the five
 * ASCII control-whitespace characters excluded from `isStrippableCodePoint`
 * above, plus the common Unicode space separators - deliberately the same
 * set JavaScript's own `\s` regex class matches, reimplemented as numeric
 * comparisons rather than a character class so none of it has to be written
 * as a literal character in this file.
 */
function isCollapsibleWhitespace(codePoint: number): boolean {
  switch (codePoint) {
    case 0x0009: // tab
    case 0x000a: // line feed
    case 0x000b: // vertical tab
    case 0x000c: // form feed
    case 0x000d: // carriage return
    case 0x0020: // space
    case 0x00a0: // no-break space
    case 0x1680: // ogham space mark
    case 0x2028: // line separator
    case 0x2029: // paragraph separator
    case 0x202f: // narrow no-break space
    case 0x205f: // medium mathematical space
    case 0x3000: // ideographic space
      return true;
    default:
      return codePoint >= 0x2000 && codePoint <= 0x200a; // en quad .. hair space
  }
}

/**
 * Clamps a self-asserted display name for safe storage and safe rendering:
 * total (never throws, coerces anything that is not a non-empty, meaningful
 * string to `""`), stripped of the control/bidi/invisible/zero-width code
 * points identified above, whitespace-collapsed, and bounded to
 * `DISPLAY_NAME_MAX_LENGTH` Unicode code points without splitting a surrogate
 * pair (a name built from characters outside the Basic Multilingual Plane -
 * many emoji, some rarer scripts - is stored as two UTF-16 code units for one
 * visible character; a unit-indexed cut can land inside that pair and leave
 * a lone surrogate behind, which renders as a replacement glyph and can
 * break a JSON round-trip). Iterating with `Array.from` rather than indexing
 * the raw string is what keeps every step - stripping, collapsing, and the
 * final bound - working in whole code points throughout.
 *
 * IDEMPOTENT: calling this again on its own output changes nothing. That
 * matters beyond tidiness - `nameFromAuthMetadata` (./supabase/app-users.ts)
 * only fills `app_users.display_name` when the stored value is currently
 * empty (`displayNameFillNeeded`) and never overwrites it again afterward, so
 * whatever this function returns at INSERT time is what stays in that
 * column, permanently, regardless of any `user_metadata` edit the account
 * makes later. A clamp applied once at write time therefore pins the stored
 * name against every subsequent metadata rewrite - a useful property this
 * module relies on, not an accident of how it happens to be called.
 */
export function clampDisplayName(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }

  const kept: string[] = [];
  let pendingSpace = false;

  for (const ch of raw) {
    const codePoint = ch.codePointAt(0) ?? 0;

    if (isStrippableCodePoint(codePoint)) {
      continue;
    }

    if (isCollapsibleWhitespace(codePoint)) {
      if (kept.length > 0) {
        pendingSpace = true;
      }
      continue;
    }

    if (pendingSpace) {
      kept.push(" ");
      pendingSpace = false;
    }
    kept.push(ch);
  }

  const bounded = kept.length > DISPLAY_NAME_MAX_LENGTH ? kept.slice(0, DISPLAY_NAME_MAX_LENGTH) : kept;

  // A truncation cut can land right after a space that was only ever meant
  // to separate `bounded` from a word that got cut away with it - drop any
  // such trailing space rather than store or render a name with one.
  while (bounded.length > 0 && bounded[bounded.length - 1] === " ") {
    bounded.pop();
  }

  return bounded.join("");
}
