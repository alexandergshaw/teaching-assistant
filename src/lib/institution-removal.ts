// Shared institution-REMOVAL logic ("I need the ability to delete
// institutions too" - see docs/REGRESSION.md #133 for why removal was
// originally held back to only the Settings dropdown with no warning at all,
// and the entry appended for this feature for how that deferral is resolved).
//
// Institutions are a client-side registry (src/lib/institutions.ts) whose
// acronym is just a text key that institution_pages, course_hub, and a few
// other tables happen to store (there is no institutions table - see
// knowledge-base.ts's module comment). Removing the acronym from the
// registry can only ever HIDE those rows - it must never become a trigger
// for deleting them (AC3). This module is the one place both entry points
// (TopBar.tsx's Settings dropdown and KnowledgeTab.tsx's own picker) call
// into for the confirm-and-remove flow, mirroring how validateNewInstitutionAcronym
// in institutions.ts is the one shared "add" rule for both of them.
//
// Deliberately has NO import of any server action or Supabase code: the real
// database counts are fetched by whatever the caller passes as `fetchImpact`
// (see ConfirmAndRemoveInstitutionOptions below), so this module stays a
// plain, hermetically-testable client/lib module - no mocking required to
// unit-test it (see institution-removal.test.ts).

import { writeInstitutions } from "./institutions";

export interface InstitutionDeletionImpact {
  /** Knowledge base pages (institution_pages) filed under this acronym. */
  pageCount: number;
  /** Course tiles (course_hub) filed under this acronym. */
  tileCount: number;
}

/**
 * The next registry list after removing `code` - a pure, case-insensitive
 * filter. `existing` is not guaranteed pre-normalized by every caller, so
 * both sides are normalized before comparing, mirroring
 * validateNewInstitutionAcronym's own both-sides normalization in
 * institutions.ts.
 */
export function nextInstitutionsAfterRemoval(code: string, existing: string[]): string[] {
  const target = code.trim().toUpperCase();
  return existing.filter((c) => c.trim().toUpperCase() !== target);
}

/**
 * The confirmation copy for removing an institution (AC1/AC2 of the
 * "delete institutions" feature). States the real count of knowledge base
 * pages and course tiles filed under this acronym - the whole reason removal
 * was held back in regression #133 - and is explicit that removing it only
 * HIDES those rows rather than deleting them: they are keyed by the acronym
 * TEXT, not by this local list, so re-adding the same acronym makes them
 * visible again exactly as they were. An instructor who walks away believing
 * either "I deleted that data" or "I permanently lost that data" has been
 * misled either way (AC2), so both the "still there" and the "not
 * destructive" halves are stated plainly rather than left implied.
 */
export function describeInstitutionRemoval(code: string, impact: InstitutionDeletionImpact): string {
  const { pageCount, tileCount } = impact;
  const parts: string[] = [];
  if (pageCount > 0) parts.push(`${pageCount} knowledge base page${pageCount === 1 ? "" : "s"}`);
  if (tileCount > 0) parts.push(`${tileCount} course tile${tileCount === 1 ? "" : "s"}`);

  const blastRadius =
    parts.length > 0
      ? `${code} has ${parts.join(" and ")} filed under it.`
      : `${code} has no knowledge base pages or course tiles filed under it right now.`;

  return (
    `${blastRadius}\n\n` +
    `Removing "${code}" only takes it off this list - it does NOT delete anything from the database. ` +
    `Pages and course tiles are stored under the text "${code}", not by this list, so they will simply ` +
    `stop showing up. Re-adding "${code}" later makes them visible again exactly as they were.\n\n` +
    `Remove ${code} from this list?`
  );
}

export type RemoveInstitutionResult =
  | { removed: true }
  | { removed: false; reason: "not-found" }
  | { removed: false; reason: "cancelled" }
  | { removed: false; reason: "error"; message: string };

export interface ConfirmAndRemoveInstitutionOptions {
  /**
   * Reads (never writes) the real database counts for `code`. Required and
   * explicit (no default import of a server action) so this module never
   * pulls in Supabase/server-only code - callers pass
   * getInstitutionDeletionImpactAction from src/app/actions.
   */
  fetchImpact: (code: string) => Promise<{ impact: InstitutionDeletionImpact } | { error: string }>;
  /**
   * Runs first, synchronously, before any network round trip. Lets a caller
   * abort the whole removal when it would silently discard unsaved state -
   * currently only the Knowledge tab's own open-page edit session (AC6).
   * Returning false cancels; omit when the caller has nothing to guard.
   */
  guardUnsavedEdits?: () => boolean;
  /** Overridable for tests; defaults to window.confirm. */
  confirm?: (message: string) => boolean;
  /**
   * Overridable for tests; defaults to writeInstitutions. This is the ONLY
   * write this function is capable of performing (AC3) - there is no
   * delete-a-database-row parameter anywhere in this signature.
   */
  write?: (list: string[]) => void;
}

/**
 * The single "remove an institution" flow shared by TopBar.tsx's Settings
 * dropdown and KnowledgeTab.tsx's own picker (AC4) - mirrors how both call
 * validateNewInstitutionAcronym for adding.
 *
 * Order: the unsaved-edits guard runs first (cheap and synchronous - no
 * point fetching database counts if the caller is about to cancel anyway),
 * then the real counts are fetched, then the blast-radius confirmation
 * (AC1/AC2) is shown, and only on acceptance does this touch the registry -
 * by calling `write` (writeInstitutions). Nothing else is ever called, which
 * is what guarantees a registry removal can never cascade into a database
 * delete (AC3): the only I/O this function performs is one read
 * (fetchImpact) and, conditionally, one local-storage write.
 */
export async function confirmAndRemoveInstitution(
  code: string,
  existing: string[],
  options: ConfirmAndRemoveInstitutionOptions
): Promise<RemoveInstitutionResult> {
  const normalizedCode = code.trim().toUpperCase();
  if (!existing.some((c) => c.trim().toUpperCase() === normalizedCode)) {
    return { removed: false, reason: "not-found" };
  }

  if (options.guardUnsavedEdits && !options.guardUnsavedEdits()) {
    return { removed: false, reason: "cancelled" };
  }

  const confirmFn = options.confirm ?? ((message: string) => window.confirm(message));
  const write = options.write ?? writeInstitutions;

  const result = await options.fetchImpact(code);
  if ("error" in result) {
    return { removed: false, reason: "error", message: result.error };
  }

  if (!confirmFn(describeInstitutionRemoval(code, result.impact))) {
    return { removed: false, reason: "cancelled" };
  }

  write(nextInstitutionsAfterRemoval(code, existing));
  return { removed: true };
}
