/**
 * L1 gating - which institutions the success-tracking switcher may offer
 * (LIVE-LMS-STUDENT-MESSAGING W1, docs/live-lms-student-messaging-scope.md
 * sections 3 and 10 FORK C).
 *
 * Pure: takes the institution codes from useInstitutionSelection() (or
 * CANVAS_INSTITUTIONS) plus a per-code LmsConnectionStatus the caller already
 * derived (courses-table-helpers.ts lmsConnectionStatusFor vocabulary), and
 * keeps only the institutions with a LIVE connection. "unknown" is NOT
 * connected: an institution that has never been checked must not be offered as
 * a send target (the same rule lmsConnectionStatusFor documents).
 *
 * The switcher is built generically over the result; a one-option (or empty)
 * result is valid, not an error.
 */

import type { LmsConnectionStatus } from "../courses-table-helpers";

/** Per-institution connection status keyed by institution code. */
export type InstitutionConnectionMap = Readonly<Record<string, LmsConnectionStatus | undefined>>;

/** True only for a live, successful connection. */
export function isLiveConnected(status: LmsConnectionStatus | undefined): boolean {
  return status?.kind === "connected";
}

/**
 * Keeps the codes with a live connection, in the input order, deduplicated
 * case-insensitively. A code absent from `statuses` is excluded. The returned
 * strings are the caller's own spellings.
 */
export function filterConnectedInstitutions(
  institutions: readonly string[],
  statuses: InstitutionConnectionMap
): string[] {
  const byUpper = new Map<string, LmsConnectionStatus | undefined>();
  for (const [code, status] of Object.entries(statuses)) byUpper.set(code.toUpperCase(), status);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const code of institutions) {
    const upper = code.toUpperCase();
    if (seen.has(upper)) continue;
    seen.add(upper);
    if (isLiveConnected(byUpper.get(upper))) out.push(code);
  }
  return out;
}

/**
 * The institution the switcher should show: the persisted `active` code when it
 * is still connected, else the first connected code, else "" (nothing live).
 */
export function resolveSwitcherSelection(active: string, connected: readonly string[]): string {
  const match = connected.find((c) => c.toUpperCase() === active.toUpperCase());
  return match ?? connected[0] ?? "";
}
