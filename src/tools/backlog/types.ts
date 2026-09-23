// Shared shape for one backlog.yml row. See docs/backlog.yml's own header
// comment for the field-by-field contract; this file is the type authority
// the rest of src/tools/backlog/ imports from, so a schema change happens in
// exactly one place.
//
// state's four values come straight from backlog-automation.md section 3:
//   actionable   - worked by an agent; closes when `verify` exits 0
//   owner        - never the agent; needs a human decision
//   verification - never the agent; needs a live system or a real credential
//   unscoped     - lacks `owns`/`verify`; nobody works it until it is scoped
//
// `note` and `from` are extensions beyond the spec's worked example, added so
// migration (Ruling BA-7) can be LOSSLESS: docs/BACKLOG.md's "Why it is
// blocked" / "State" / "Trigger" / "Note" columns (whichever a given section
// used) and its "From" (commit) column both need a home that is not
// `instrument`, which spec section 3 defines narrowly as "how the claim in
// `title` was measured" - repurposing it for "why this is blocked" would
// misrepresent what the field means everywhere else it is read.
export type BacklogState = "actionable" | "owner" | "verification" | "unscoped";

// `kind` is the render's top-level axis (plan-v2.md "KIND is the top-level
// axis, not state"). It is REQUIRED - there is no null/"unclassified" value.
// An earlier draft made it nullable so an agent would never have to guess
// the row that is both a live defect and an open owner question; the owner
// answered that directly instead of leaving it to guesswork: a row that is
// BOTH a live defect and an open owner question reads as `kind: "bug"`
// (owner ruling, 2026-09-15). With the human answer in hand, a nullable
// field would just be dead capability plus an always-empty section, so
// `kind` takes exactly one of the three values below on every row.
export type BacklogKind = "bug" | "feature" | "chore";

export const BACKLOG_KINDS: readonly BacklogKind[] = ["bug", "feature", "chore"];

export function isBacklogKind(value: string): value is BacklogKind {
  return (BACKLOG_KINDS as readonly string[]).includes(value);
}

export interface BacklogItem {
  /** Globally unique, namespaced (Ruling BA-4 / Blocker B3). Never a bare number. */
  id: string;
  state: BacklogState;
  /** Bug, feature, or chore - the render's top-level axis. See BacklogKind's own comment for the owner ruling on the both-a-defect-and-an-open-question case. */
  kind: BacklogKind;
  /**
   * A registry slug from src/tools/backlog/areas.ts, never free text. The
   * registry is the single edit point for the cluster list AND its render
   * order (plan-v2.md "GROUP ORDER is the registry array's own order",
   * carried forward under the new name); a free-text area would let a typo
   * silently mint a new singleton cluster, so yaml-codec.ts throws on any
   * slug the registry does not recognise. Named "area", not "group":
   * docs/DEV_LOOP.md already uses "backlog group" for a PUSH AND REGRESSION
   * UNIT, a different thing than this topical tag - reusing the word would
   * make a future reader conflate the two.
   */
  area: string;
  /** What is owed, in the author's own words. */
  title: string;
  /** File globs: files edited PLUS the tests asserting the changed behaviour. */
  owns: string[];
  /** Closure command. `null` when none has been authored (and proven able to fail). */
  verify: string | null;
  /** Ids of items that must be gone (closed = deleted, Ruling BA-8) before this is ready. */
  blocked_by: string[];
  /** How the claim in `title` was measured. Empty string when the source gave none - never fabricated. */
  instrument: string;
  /** Commit hash or citation this entry traces to. Empty string when the source gave none. */
  from: string;
  /** Free-text queue note that does not fit any other field (a "why blocked" / "trigger" / "state" column from the pre-migration markdown). Empty string when none. */
  note: string;
  /**
   * A question waiting on the owner, in the owner's own terms - or, once
   * answered, the resolved question with its answer recorded (see
   * yaml-codec.ts's parse/serialize handling: absent or `null` both mean
   * "no question", so the ~55 rows filed before this field existed parse
   * unchanged). Added 2026-09-23 per the owner's request so a question lives
   * beside the row it belongs to instead of only in a chat transcript.
   * AGENTS.md, "Two rounds, then ask", is also the reason a row in `owner`
   * state should never carry an empty one - see
   * yaml-codec.ts's `ownerRowsMissingQuestion` / `assertOwnerRowsHaveQuestion`.
   * Optional (`?`) rather than required so every existing BacklogItem
   * literal across this codebase - test fixtures this task's write set does
   * not include - keeps compiling without being touched.
   */
  question?: string | null;
}

export const BACKLOG_STATES: readonly BacklogState[] = [
  "actionable",
  "owner",
  "verification",
  "unscoped",
];

export function isBacklogState(value: string): value is BacklogState {
  return (BACKLOG_STATES as readonly string[]).includes(value);
}

/** An item is scoped when it carries both a non-empty `owns` and a non-empty `verify` - the two fields an agent needs to work it and know when it is done. */
export function isScoped(item: BacklogItem): boolean {
  return item.owns.length > 0 && item.verify !== null && item.verify.trim().length > 0;
}
