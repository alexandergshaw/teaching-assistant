import type { StudentSubmissionEntry } from "@/lib/grade/types";

/** Bind a reviewed partial intake to its one resulting row before grading. */
export function bindPartialEvidence(entries: StudentSubmissionEntry[], omissions: readonly string[] | undefined, staticOnly?: true): StudentSubmissionEntry[] | null {
  if (!omissions?.length && !staticOnly) return entries;
  if (entries.length !== 1 || (omissions && (omissions.length > 1000 || omissions.some((path) => !path || path.length > 4096)))) return null;
  return [{ ...entries[0], ...(omissions?.length ? { evidenceOmissions: [...omissions] } : {}), ...(staticOnly ? { staticOnly: true } : {}) }];
}
