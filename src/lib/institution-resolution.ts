/**
 * Shared institution-acronym resolution ladder.
 *
 * A step (or any Canvas call) that needs an institution acronym should never
 * be blocked purely because nobody picked one in the header - the header is
 * one fallback among several, not a precondition. This is the single place
 * that encodes the precedence every call site should follow, most specific
 * first:
 *   1. an explicit institution value bound on the step itself;
 *   2. the institution of the course/tile the step is operating on;
 *   3. the header's active institution (helpers.activeInstitution - for an
 *      unattended run this is the schedule/trigger's own stored institution,
 *      which may be null; there is no header to read);
 *   4. the single configured institution, when exactly one is configured
 *      (unambiguous - nothing to pick between);
 *   5. failure, with a message naming every option above so the fix is obvious.
 *
 * Pure and framework-free (no server/client boundary, no imports) so it can
 * be called from Canvas-layer code (canvas-core.ts) and from workflow step
 * definitions alike, and is trivially unit-testable.
 */

export interface InstitutionLadderInput {
  /** An institution value bound directly on the step (e.g. values.institution). */
  bound?: string | null;
  /** The institution of the course/tile the step is operating on, if any. */
  tile?: string | null;
  /** The header's active institution (helpers.activeInstitution). Also carries
   * a schedule/trigger's stored institution for an unattended run. */
  active?: string | null;
  /** Every institution currently configured on the server (env-driven). Only
   * used as a fallback when it resolves unambiguously (exactly one entry). */
  configured?: string[] | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

/**
 * Resolve an institution acronym through the shared precedence ladder.
 * Returns "" when nothing resolves - callers that require an institution
 * should use requireInstitution below (or check the result themselves) so
 * the failure message stays consistent everywhere.
 */
export function resolveInstitution(input: InstitutionLadderInput): string {
  const bound = normalize(input.bound);
  if (bound) return bound;

  const tile = normalize(input.tile);
  if (tile) return tile;

  const active = normalize(input.active);
  if (active) return active;

  const configured = (input.configured ?? []).map((c) => normalize(c)).filter(Boolean);
  const uniqueConfigured = Array.from(new Set(configured));
  if (uniqueConfigured.length === 1) return uniqueConfigured[0];

  return "";
}

/** The failure message when no rung of the ladder resolves - names every
 * option so the fix is obvious, instead of a bare "acronym is required". */
export function describeInstitutionResolutionFailure(): string {
  return (
    "Could not determine which institution to use. Bind an institution on this step, " +
    "set one on the course tile, pick one in the header, or configure exactly one institution."
  );
}

/** Resolve an institution acronym through the ladder, or throw a message
 * naming every option when nothing resolves. */
export function requireInstitution(input: InstitutionLadderInput): string {
  const resolved = resolveInstitution(input);
  if (!resolved) {
    throw new Error(describeInstitutionResolutionFailure());
  }
  return resolved;
}
