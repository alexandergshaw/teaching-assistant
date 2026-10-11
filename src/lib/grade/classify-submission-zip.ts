// ZIP-CLASS-VS-SINGLE W1 (docs/zip-class-vs-single-scope.md section 2): decide
// whether an extracted submission zip is a whole-class bundle or a single
// person. Pure: it reads the same three maps the grouping consumes and runs
// them through the grouping's own exported parser, so studentCount always
// equals groupSubmissionsByStudent's entry count. It never re-opens the zip
// and never re-implements the Canvas filename convention.
//
// "class" needs a positive student-SEPARATING marker (Canvas convention,
// model inference, a per-student folder, or a nested per-student archive) on at
// least two students. A flat zip of one person's bare-named files splits into
// several stem groups with no marker, so it is "unknown", not "class".

import type {
  InferredFileNameLookup,
  SubmissionZipClassification,
} from "./types";
import { a44ContainerRelativeDir, inferStudentPrefix, parseSubmissionFileName } from "./utils";

type Basis = "roster" | "structure" | "stem";

const RANK: Record<Basis, number> = { roster: 2, structure: 1, stem: 0 };

interface GroupInfo {
  basis: Basis;
  nested: boolean;
}

function fileBasis(
  filePath: string,
  inferredLookup: InferredFileNameLookup | undefined,
  chain: string[]
): { basis: Basis; nested: boolean } {
  const parsed = parseSubmissionFileName(filePath, inferredLookup, chain);
  if (!parsed.reachedStemFallback) return { basis: "roster", nested: false };
  if (chain.length > 0) return { basis: "structure", nested: true };
  if (a44ContainerRelativeDir(filePath, chain) !== "") return { basis: "structure", nested: false };
  return { basis: "stem", nested: false };
}

export function classifySubmissionZip(
  submissions: Record<string, string>,
  inferredLookup?: InferredFileNameLookup,
  zipParents?: Record<string, string[]>
): SubmissionZipClassification {
  const groups = new Map<string, GroupInfo>();
  for (const filePath of Object.keys(submissions)) {
    const chain = zipParents?.[filePath] ?? [];
    const key = inferStudentPrefix(filePath, inferredLookup, chain).key;
    const next = fileBasis(filePath, inferredLookup, chain);
    const existing = groups.get(key);
    if (!existing || RANK[next.basis] > RANK[existing.basis]) {
      groups.set(key, next);
    }
  }

  const studentCount = groups.size;
  let rosterGroups = 0;
  let folderGroups = 0;
  let nestedGroups = 0;
  for (const info of groups.values()) {
    if (info.basis === "roster") rosterGroups += 1;
    else if (info.basis === "structure") {
      if (info.nested) nestedGroups += 1;
      else folderGroups += 1;
    }
  }
  const markerStudentCount = rosterGroups + folderGroups + nestedGroups;

  if (studentCount === 0) {
    return { kind: "unknown", studentCount, markerStudentCount, signal: "empty" };
  }
  if (markerStudentCount >= 2) {
    // The dominant marker among the deciding groups; ties favour the more
    // authoritative basis (convention, then nested archives, then folders).
    let signal: SubmissionZipClassification["signal"] = "canvas-convention";
    if (rosterGroups < nestedGroups && nestedGroups >= folderGroups) signal = "nested-archives";
    else if (rosterGroups < folderGroups && folderGroups > nestedGroups) signal = "folders";
    return { kind: "class", studentCount, markerStudentCount, signal };
  }
  if (studentCount === 1) {
    return { kind: "single", studentCount, markerStudentCount, signal: "single-group" };
  }
  return { kind: "unknown", studentCount, markerStudentCount, signal: "ambiguous" };
}
