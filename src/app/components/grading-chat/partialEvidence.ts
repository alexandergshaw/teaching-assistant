import type { IngestLedger } from "@/lib/grade/ndjson-ingest-parser";
import { noBatchAdmittedNotice } from "./partialBatchNotice";
import type { StudentSubmissionEntry } from "@/lib/grade/types";

export type PerStudentEvidence = readonly { readonly student: string; readonly omissions: readonly string[]; readonly staticOnly: boolean }[];

/** Bind reviewed provenance to exactly the intended student before grading. */
export function bindPartialEvidence(entries: StudentSubmissionEntry[], omissions: readonly string[] | undefined, staticOnly?: true, perStudent?: PerStudentEvidence): StudentSubmissionEntry[] | null {
  if (perStudent) {
    if (!Array.isArray(perStudent) || omissions?.length || entries.length !== perStudent.length || perStudent.length > 1000) return null;
    const key = (name: string) => name.normalize("NFKC").trim().toLocaleLowerCase();
    const byName = new Map<string, PerStudentEvidence[number]>();
    for (const item of perStudent) {
      if (!item || typeof item.student !== "string" || !Array.isArray(item.omissions)) return null;
      const name = key(item.student);
      if (!name || byName.has(name) || typeof item.staticOnly !== "boolean" || item.omissions.length > 1000 || item.omissions.some((path: unknown) => typeof path !== "string" || !path || path.length > 4096)) return null;
      byName.set(name, item);
    }
    const matched = new Set<string>(), result: StudentSubmissionEntry[] = [];
    for (const entry of entries) {
      if (typeof entry.student !== "string") return null;
      const name = key(entry.student), item = byName.get(name); if (!item || matched.has(name)) return null;
      matched.add(name); const copy = { ...entry }; delete copy.staticOnly; delete copy.evidenceOmissions;
      result.push({ ...copy, ...(item.omissions.length ? { evidenceOmissions: [...item.omissions] } : {}), ...(item.staticOnly ? { staticOnly: true as const } : {}) });
    }
    return result;
  }
  if (!omissions?.length && !staticOnly) return entries;
  if (entries.length !== 1 || (omissions && (omissions.length > 1000 || omissions.some((path) => !path || path.length > 4096)))) return null;
  return [{ ...entries[0], ...(omissions?.length ? { evidenceOmissions: [...omissions] } : {}), ...(staticOnly ? { staticOnly: true } : {}) }];
}

/** Preserve the storage route's explicit refusal before attempting evidence binding. */
export function skippedEvidenceIntake(entries: StudentSubmissionEntry[], skipped: IngestLedger["skipped"], ledger?: IngestLedger) {
  return entries.length || !skipped.length ? null : { ledger: { ...(ledger ?? { failedSupportedFiles: [] }), studentsFound: skipped.length, studentsEmitted: 0, skipped }, reason: noBatchAdmittedNotice(skipped) };
}
