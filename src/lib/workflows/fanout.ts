// Institution fan-out: when a workflow's scope targets every institution
// (institution === "*"), the engine runs the workflow body once per configured
// institution, pinning the scope + active-institution to a concrete acronym each
// iteration. Server-safe (no "use client", no window): resolveFanoutInstitutions
// calls the same owner-scoped server action the app uses everywhere else.

import { listConfiguredInstitutionsAction } from "@/app/actions";
import type { WorkflowScope } from "@/lib/workflows/types";

/** True when the workflow targets every institution (institution === "*"). */
export function isInstitutionFanout(scope: WorkflowScope | undefined): boolean {
  return (scope?.institution ?? "").trim() === "*";
}

/** Pin a fan-out scope to one concrete institution for a single iteration.
 * Every downstream resolver then behaves exactly as for a single-institution
 * scope. Other scope families (course tiles, Canvas courses, orgs) pass through. */
export function scopeForInstitution(scope: WorkflowScope, acronym: string): WorkflowScope {
  return { ...scope, institution: acronym };
}

/** The institutions a fan-out expands to, or an explicit error (so an
 * enumeration failure is surfaced, never silently treated as "none"). */
export async function resolveFanoutInstitutions(): Promise<{ list: string[] } | { error: string }> {
  const r = await listConfiguredInstitutionsAction();
  if ("error" in r) return { error: r.error };
  return { list: r.acronyms };
}
