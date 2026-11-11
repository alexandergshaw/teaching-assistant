import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import type { DirectFileOutcome } from "./chatDirectFileIntake";
import { claimIntake, releaseIntake, type IntakeFence } from "./intakeFence";
import { listPartialHandoffs, reservePartialHandoff, settlePartialHandoff, type PartialHandoffRecord } from "./partialHandoffLedger";
import { partialArchiveDigest } from "./partialArchiveDigest";

export type PartialHashProgress = { readonly phase: "source" | "subset"; readonly written: number; readonly total: number };
export type PartialHashReview = { readonly current: () => boolean; readonly onProgress: (progress: PartialHashProgress | null) => void; readonly onAdmitted?: (indices: readonly number[]) => void };

export function createPartialHandoffHandler(args: {
  getEpoch: () => number; account?: string; capture: () => number; owns: (account: string | undefined, token: number) => boolean;
  latch: IntakeFence; onRecords: (records: PartialHandoffRecord[]) => void; onOmissions: (groups: readonly RecoverableGroup[]) => void;
  submit: (file: File, mapping: Readonly<Record<string, string>>, evidenceOmissions?: readonly string[], staticOnly?: true) => Promise<DirectFileOutcome[]>;
}) {
  return (source: File, file: File, selected: readonly RecoverableGroup[], omitted: readonly RecoverableGroup[], ownerMapping: Readonly<Record<string, string>>, review?: PartialHashReview, project?: { readonly mappedPaths: readonly string[]; readonly excludedPaths: readonly string[] }) => {
    const epoch = args.getEpoch(), accountToken = args.capture();
    return partialHandoff({ source, file, selected, omitted, ownerMapping, project, latch: args.latch, account: args.account,
      current: () => args.getEpoch() === epoch && args.owns(args.account, accountToken) && (review?.current() ?? true), onHashProgress: review?.onProgress, onAdmitted: review?.onAdmitted, onRecords: args.onRecords, onOmissions: args.onOmissions, submit: args.submit });
  };
}

export async function partialHandoff(args: {
  source: File; file: File; selected: readonly RecoverableGroup[]; omitted: readonly RecoverableGroup[]; ownerMapping: Readonly<Record<string, string>>; project?: { readonly mappedPaths: readonly string[]; readonly excludedPaths: readonly string[] };
  latch: IntakeFence; account?: string; current: () => boolean;
  onHashProgress?: (progress: PartialHashProgress | null) => void; onAdmitted?: (indices: readonly number[]) => void;
  onRecords: (records: PartialHandoffRecord[]) => void; onOmissions: (groups: readonly RecoverableGroup[]) => void;
  submit: (file: File, mapping: Readonly<Record<string, string>>, evidenceOmissions?: readonly string[], staticOnly?: true) => Promise<DirectFileOutcome[]>;
}): Promise<string | null> {
  const token = claimIntake(args.latch); if (token === null) return "Wait for the current submission to finish.";
  const { account, selected, omitted, ownerMapping } = args; let verified = false;
  try {
    if (args.project && (selected.length !== 1 || !args.project.mappedPaths.length || new Set(args.project.mappedPaths).size !== args.project.mappedPaths.length)) return "The project mapping is invalid. Nothing was queued.";
    if (!account || !navigator.locks || !crypto.subtle) return "This browser cannot safely record and lock this partial intake.";
    args.onHashProgress?.({ phase: "source", written: 0, total: args.source.size });
    const sourceDigest = await partialArchiveDigest(args.source, crypto.subtle, args.current, (written, total) => args.onHashProgress?.({ phase: "source", written, total }));
    args.onHashProgress?.({ phase: "subset", written: 0, total: args.file.size });
    const subsetDigest = await partialArchiveDigest(args.file, crypto.subtle, args.current, (written, total) => args.onHashProgress?.({ phase: "subset", written, total }));
    verified = true; args.onHashProgress?.(null);
    if (!args.current()) return "The session changed before submission.";
    return await navigator.locks.request(`partial-intake:${account}:${sourceDigest}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return "Another submission from this archive is in progress. Nothing was submitted.";
      if (!args.current()) return "The session changed before submission.";
      const attemptId = crypto.randomUUID();
      const record = { account, sourceDigest, subsetDigest, attemptId, status: "pending" as const,
        selected: selected.map((group) => ({ student: ownerMapping[group.label], files: group.members.map((member) => member.path) })),
        omitted: [...omitted.map((group) => ({ student: group.label, files: group.members.map((member) => member.path), reason: group.reason ?? "not selected" })), ...(args.project?.excludedPaths.length ? [{ student: selected[0].label, files: [...args.project.excludedPaths], reason: "recognized build artifact excluded from grading" }] : [])] };
      if (!reservePartialHandoff(localStorage, record)) return "The intake record could not be saved. Nothing was submitted.";
      args.onRecords(listPartialHandoffs(localStorage, account)); args.onOmissions(omitted);
      try {
        const mapping = args.project ? Object.fromEntries(args.project.mappedPaths.map((path) => [path, ownerMapping[selected[0].label]])) : Object.fromEntries(selected.flatMap((group) => group.members.map((member) => [member.path, ownerMapping[group.label]])));
        const outcomes = await args.submit(args.file, mapping, args.project?.excludedPaths, args.project ? true : undefined), accepted = outcomes.length === 1 && outcomes[0].kind === "accepted";
        if (outcomes.length === 1 && (outcomes[0].kind === "accepted" || outcomes[0].kind === "partial") && outcomes[0].sourceIndices && args.current()) { try { args.onAdmitted?.(outcomes[0].sourceIndices); } catch { /* Display priority cannot change admission. */ } }
        settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, accepted ? "accepted" : "unknown", attemptId);
        if (args.current()) args.onRecords(listPartialHandoffs(localStorage, account));
        if (!args.current()) return "The session changed; check results before retrying.";
        return accepted ? null : "Submission could not be confirmed. Check results before retrying.";
      } catch { settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, "unknown", attemptId); return "Submission could not be confirmed. Check results before retrying."; }
    });
  } catch { return !args.current() ? "The session changed before submission." : verified ? "The intake record could not be saved. Nothing was submitted." : "Archive verification failed. Nothing was submitted."; }
  finally { releaseIntake(args.latch, token); }
}
