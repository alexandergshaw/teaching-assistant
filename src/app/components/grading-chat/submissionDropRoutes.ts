import { oversizedReviewCandidate } from "./oversizedReviewCandidate";
import type { CompositePartInput } from "./chatSubmissionIntake";
import type { DirectFileOutcome } from "./chatDirectFileIntake";
import type { SubmitOutcome } from "./useContinuousGradingRun";
import { checkFileWireBudget } from "@/lib/upload-budget";

type FileGroup = { readonly indexes: number[]; readonly name?: string; readonly archive?: boolean };

/** Filenames alone cannot prove a student identity or submission boundary.
 * Hold ordinary files for explicit assignment; archives use existing intake. */
export function groupMultipleFiles(files: readonly File[]): { groups: FileGroup[]; ambiguous: number[] } {
  const groups: FileGroup[] = [], ambiguous: number[] = [];
  files.forEach((file, index) => {
    if (/\.zip$/i.test(file.name)) groups.push({ indexes: [index], archive: true });
    else ambiguous.push(index);
  });
  return { groups, ambiguous };
}
/** Suggestions are unverified filename groupings, never an automatic identity. */
export function suggestFileGroups(files: readonly File[]): string[] {
  return files.map((file) => {
    const timestamp = /^(.+?)_(\d{4}-\d{2}-\d{2}_\d{6})_(.+)$/.exec(file.name);
    if (timestamp && timestamp[1].trim() && timestamp[3].trim()) return `${timestamp[1].trim()} (${timestamp[2]})`;
    const numbered = /^(.+?)_(\d+)_(\d+)_(.+)$/.exec(file.name);
    return numbered && numbered[1].trim() && numbered[4].trim() ? `${numbered[1].trim()} (${numbered[2]})` : "";
  });
}
/** Keep single-file inference and large/video transports; composite checks ZIP cardinality. */
export async function submitOneFileGroup(
  name: string,
  files: File[],
  submitFiles: (files: File[], label?: string) => Promise<DirectFileOutcome[]>,
  submitComposite: (student: string, parts: CompositePartInput[]) => Promise<SubmitOutcome>,
): Promise<DirectFileOutcome> {
  if (oversizedReviewCandidate(files)) return (await submitFiles(files))[0] ?? { kind: "unknown", reason: "The upload status could not be confirmed." };
  if (files.length === 1 && !/\.zip$/i.test(files[0].name)) {
    return (await submitFiles(files, name || undefined))[0] ?? { kind: "unknown", reason: "The upload status could not be confirmed." };
  }
  if (files.length > 1 && files.some((file) => /\.(mp4|m4v|mov|webm)$/i.test(file.name))) {
    return { kind: "refused", reason: "Grading multiple files together does not yet support video. Keep these files and submit the video separately." };
  }
  if (!checkFileWireBudget(files.reduce((total, file) => total + file.size, 0), "This group").ok) {
    return { kind: "refused", reason: "These files are too large to grade together. Keep them and choose a smaller group; a class ZIP can be uploaded under Multiple students." };
  }
  return submitComposite(name, files.map((file) => ({ kind: "file", file })));
}

/** Results from a cleared session cannot be presented as current grades. */
export function markSessionChanged(outcome: DirectFileOutcome): DirectFileOutcome {
  return outcome.kind === "refused" || outcome.kind === "identity" ? outcome : {
    kind: "unknown", reason: "The session changed while this file was being submitted. Check the previous results before retrying.",
  };
}
/** A lost response is not a refusal and must never trigger an automatic retry. */
export async function submitDropBatch(
  mode: "one" | "many",
  name: string,
  files: File[],
  submitOne: (name: string, files: File[]) => Promise<DirectFileOutcome>,
  submitMany: (files: File[]) => Promise<DirectFileOutcome[]>,
  isCurrent: () => boolean = () => true,
): Promise<DirectFileOutcome[]> {
  const unknown: DirectFileOutcome = { kind: "unknown", reason: "The submission status could not be confirmed. Check results before retrying." };
  try {
    if (mode === "one") {
      const result = await submitOne(name.trim(), files);
      return files.map(() => isCurrent() ? result : markSessionChanged(result));
    }
    const plan = groupMultipleFiles(files);
    const results: DirectFileOutcome[] = files.map(() => ({ kind: "identity", reason: "Assign a student before grading this file." }));
    for (const group of plan.groups) {
      if (!isCurrent()) { group.indexes.forEach((index) => { results[index] = { kind: "refused", reason: "Session changed before this group was submitted." }; }); continue; }
      const selected = group.indexes.map((index) => files[index]);
      try {
        const outcome = group.archive ? (await submitMany(selected))[0] ?? unknown : await submitOne(group.name ?? "", selected);
        group.indexes.forEach((index) => { results[index] = isCurrent() ? outcome : markSessionChanged(outcome); });
      } catch { group.indexes.forEach((index) => { results[index] = unknown; }); }
    }
    return results;
  } catch {
    return files.map(() => unknown);
  }
}

/** Names entered by the instructor are an explicit grouping, not a filename guess. */
export async function submitAssignedFiles(
  files: File[], names: string[],
  submitOne: (name: string, files: File[]) => Promise<DirectFileOutcome>,
  isCurrent: () => boolean = () => true,
): Promise<DirectFileOutcome[]> {
  const results: DirectFileOutcome[] = files.map(() => ({ kind: "identity", reason: "Assign a student before grading this file." }));
  const groups = new Map<string, number[]>();
  files.forEach((_, index) => { const name = names[index]?.trim(); if (name) groups.set(name, [...(groups.get(name) ?? []), index]); });
  for (const [name, indexes] of groups) {
    if (!isCurrent()) { indexes.forEach((index) => { results[index] = { kind: "refused", reason: "Session changed before this group was submitted." }; }); continue; }
    let outcome: DirectFileOutcome;
    try { outcome = await submitOne(name, indexes.map((index) => files[index])); }
    catch { outcome = { kind: "unknown", reason: "The submission status could not be confirmed. Check results before retrying." }; }
    indexes.forEach((index) => { results[index] = isCurrent() ? outcome : markSessionChanged(outcome); });
  }
  return results;
}
