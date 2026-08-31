// Thread-structure helpers, split out of discussion-capture.ts.
// docs/discussion-thread-structure-acceptance-criteria.md (T2, T4a, T6, T6c).
//
// FIX 2 of this pass: discussion-capture.ts reached 963 of its hard 1000-line
// ceiling in this same group. `VALID_THREAD_POSITIONS`, `reconcileThreadPosition`,
// `reconcileReplyingToAuthor` and `resolveDraftParent` move here; `ReplyRow` and
// `mergeCapturedPosts` stay in discussion-capture.ts per that file's own
// ownership (T2c/T6c).
//
// Import direction: discussion-capture.ts imports FROM this file, never the
// reverse - a cycle here is the exact shape this repo's
// split-constants-into-the-leaf lesson records as silently yielding
// `undefined` past `tsc`. That direction means this file must not import
// `ReplyRow` back from discussion-capture.ts, so the functions below take
// only the narrow structural shape they need (see `ThreadRow` below) rather
// than the full row type.
//
// `authorsMatch` also stays in discussion-capture.ts: it is a general-purpose
// author matcher used throughout that file's dedupe logic (`isSamePost`,
// `postSimilarityDistance`'s neighbours), not something specific to
// threading, so moving it here would widen this leaf's scope well past T2/
// T4a/T6 for no benefit. Rather than import it back (which would recreate
// the cycle the import direction above exists to avoid), every function here
// that needs author-equivalence takes it as a parameter instead.
// discussion-capture.ts's own exported `resolveDraftParent` is a thin
// wrapper that supplies its own `authorsMatch`, so no existing importer's
// two-argument call site changes.

export type ThreadPosition = "root" | "reply" | "unknown";

// T2b: the three-member set `deserializeReplyTable` validates a persisted
// `threadPosition` string against. See discussion-capture.ts's own
// deserializeReplyTable comment for the full absent-stays-absent discipline
// this set participates in.
export const VALID_THREAD_POSITIONS = new Set<string>(["root", "reply", "unknown"]);

// ---------------------------------------------------------------------------
// T4a: thread-field reconciliation, pulled out as two named helpers rather
// than inlined in mergeCapturedPosts, so each rule (T4a's three bullets) has
// its own small, independently-readable body. Both run on EVERY match, not
// only inside a longer-text branch - see mergeCapturedPosts' own comment
// (discussion-capture.ts) for the live trap this replaces (a `"reply"`
// reading arriving in a SHORTER re-read used to be silently discarded,
// leaving the row on `"unknown"` forever).
//
// `undefined` is treated as equivalent to `"unknown"` on read (T1a: absence
// and `"unknown"` render identically), so a row minted before its first
// thread-position reading behaves the same as one explicitly marked
// `"unknown"` once a real reading arrives.
// ---------------------------------------------------------------------------

export function reconcileThreadPosition(existing: ThreadPosition | undefined, incoming: ThreadPosition | undefined): ThreadPosition | undefined {
  if (incoming === undefined) return existing; // no new information this match
  if (existing === undefined || existing === "unknown") return incoming; // unknown loses, either direction
  if (incoming === "unknown") return existing;
  return existing === incoming ? existing : "unknown"; // root vs reply contradiction downgrades
}

// FIX 1: a name conflict used to be decided by EXACT string equality, which
// is wrong for this input - the source is a vision model reading a name off
// a screen twice, and two correct readings of the same board that differ
// only in case, spacing or a missing middle initial ("Diego Chen" vs "diego
// chen") used to register as a genuine CONFLICT and clear the field,
// silently losing information that was actually read correctly twice. This
// is precisely the noisy-name case `authorsMatch` (discussion-capture.ts)
// already exists to handle, so equivalence is now decided by `authorsMatch`
// rather than `===`. `authorsMatch` decides EQUIVALENCE only - it does not
// normalise what gets stored. When two equivalent-but-differently-spelled
// values meet, the LONGER one is kept (more of the name was visible in that
// frame); an equal-length pair keeps `existing`, the same "equal-or-shorter
// loses" convention this file's sibling AC54 tie-break already uses
// elsewhere, so the outcome is deterministic rather than accidentally
// order-dependent. Only a genuine disagreement under `authorsMatch` (two
// different people) still clears the field.
export function reconcileReplyingToAuthor(
  existing: string | undefined,
  incoming: string | undefined,
  authorsMatch: (a: string, b: string) => boolean
): string | undefined {
  if (incoming === undefined) return existing; // fills when absent...
  if (existing === undefined) return incoming;
  if (!authorsMatch(existing, incoming)) return undefined; // genuine disagreement clears it
  return incoming.length > existing.length ? incoming : existing; // longer read wins; ties keep existing
}

// ---------------------------------------------------------------------------
// T6 / T6c: parent resolution for the drafting prompt. Gated on ALL THREE,
// per T6: `threadPosition === "reply"`, a non-empty `replyingToAuthor`, and
// EXACTLY ONE other row whose author matches it under the caller-supplied
// `authorsMatch`. Zero matches or two-plus matches return `undefined` - T6 is
// explicit that ambiguity means no parent context, never a best guess, which
// is why this counts matches rather than taking the first one.
//
// Deliberately does NOT match `row` against itself: `row` is never its own
// parent, and excluding it means a row whose OWN author happens to equal its
// own `replyingToAuthor` (a misread, or a student replying to their own
// earlier post) is judged only against the OTHER rows in the table.
//
// Generic over `T extends ThreadRow` rather than typed against `ReplyRow`
// directly - see this file's header for why: the import direction forbids
// pulling `ReplyRow` in from discussion-capture.ts, and `ThreadRow` below is
// the narrow structural slice this function actually reads.
// ---------------------------------------------------------------------------

interface ThreadRow {
  id: string;
  author: string;
  threadPosition?: ThreadPosition;
  replyingToAuthor?: string;
}

export function resolveDraftParent<T extends ThreadRow>(row: T, rows: ReadonlyArray<T>, authorsMatch: (a: string, b: string) => boolean): T | undefined {
  if (row.threadPosition !== "reply") return undefined;
  const name = row.replyingToAuthor;
  if (!name || !name.trim()) return undefined;

  const matches = rows.filter((r) => r.id !== row.id && authorsMatch(r.author, name));
  return matches.length === 1 ? matches[0] : undefined;
}
