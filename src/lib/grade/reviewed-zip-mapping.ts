import { parseSubmissionFileName } from "./utils";

/** Bound and validate an untrusted reviewed ZIP mapping before extraction. */
export function parseReviewedZipMapping(value: unknown): Readonly<Record<string, string>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length || entries.length > 1000) return null;
  const out: Record<string, string> = Object.create(null);
  for (const [path, student] of entries) {
    if (!path || path.length > 4096 || typeof student !== "string" || !student.trim() || student.length > 200) return null;
    out[path] = student.trim();
  }
  return out;
}

export function reviewedZipLookup(submissions: Record<string, string>, mapping: Readonly<Record<string, string>>, zipParents: Record<string, string[]>) {
  const paths = Object.keys(submissions);
  if (Object.keys(mapping).length !== paths.length || paths.some((path) => !Object.hasOwn(mapping, path))) throw new Error("Reviewed file mapping does not match the extracted archive. Nothing was queued.");
  const byRaw = new Map<string, { studentDisplay: string; citationFileName: string }>();
  const mappedBySource = new Map<string, string>(), sourceByMapped = new Map<string, string>();
  for (const path of paths) {
    const expected = mapping[path]?.trim();
    if (!expected) throw new Error("Reviewed student mapping is incomplete. Nothing was queued.");
    const parsed = parseSubmissionFileName(path, undefined, zipParents[path]);
    const normalized = expected.normalize("NFKC").toLocaleLowerCase();
    if ((mappedBySource.has(parsed.studentKey) && mappedBySource.get(parsed.studentKey) !== expected) || (sourceByMapped.has(normalized) && sourceByMapped.get(normalized) !== parsed.studentKey)) throw new Error("Reviewed student mapping would split or merge archive groups. Nothing was queued.");
    mappedBySource.set(parsed.studentKey, expected); sourceByMapped.set(normalized, parsed.studentKey);
    byRaw.set(path, { studentDisplay: expected, citationFileName: parsed.citationFileName });
  }
  return { byRaw };
}
