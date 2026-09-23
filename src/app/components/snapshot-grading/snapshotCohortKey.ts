// A24 (docs/a24-scope.md section 3; DECISION 4, docs/owner-decisions-2026-09-23.md):
// the disclosure line may say "this table spans more than one assignment" but
// may NAME none of them. That needs distinctness over assignment text, not
// the text itself - a non-reversible digest supplies exactly that, storing
// nothing an instructor typed or pasted (U10).
//
// "" (empty string) is deliberately its own distinct cohort value, not a
// degenerate case folded into whatever a real hash of "" happens to produce -
// a row graded with no assignment text pasted at all is honestly different
// from one graded against real text, and this function keeps that
// distinction unrepresentable-as-equal.
//
// DECISION 4's own "honest qualification": this is NOT intended to resist
// someone who already holds a candidate assignment text and wants to CONFIRM
// a match against the stored digest - only to make the stored value
// non-reversible for RECOVERING the source text, which a one-way hash already
// provides. Nothing here needs to be cryptographically strong for that.

/**
 * FNV-1a, a fast, deterministic, non-cryptographic one-way hash, over
 * `assignmentText.trim()`. Returns "" for blank/whitespace-only input (its
 * own distinct cohort, never conflated with a real digest), and an 8-hex-
 * character digest otherwise - a hex string can never collide with "".
 */
export function computeAssignmentCohortKey(assignmentText: string): string {
  const trimmed = assignmentText.trim();
  if (trimmed === "") return "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
