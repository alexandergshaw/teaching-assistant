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

export interface BacklogItem {
  /** Globally unique, namespaced (Ruling BA-4 / Blocker B3). Never a bare number. */
  id: string;
  state: BacklogState;
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
