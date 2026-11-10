import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import type { DirectFileOutcome } from "./chatDirectFileIntake";
import { claimIntake, releaseIntake, type IntakeFence } from "./intakeFence";
import { listPartialHandoffs, reservePartialHandoff, settlePartialHandoff, type PartialHandoffRecord } from "./partialHandoffLedger";
import { partialArchiveDigest } from "./partialArchiveDigest";

export function createPartialHandoffHandler(args: {
  getEpoch: () => number; account?: string; capture: () => number; owns: (account: string | undefined, token: number) => boolean;
  latch: IntakeFence; onRecords: (records: PartialHandoffRecord[]) => void; onOmissions: (groups: readonly RecoverableGroup[]) => void;
  submit: (file: File, mapping: Readonly<Record<string, string>>) => Promise<DirectFileOutcome[]>;
}) {
  return (source: File, file: File, selected: readonly RecoverableGroup[], omitted: readonly RecoverableGroup[], ownerMapping: Readonly<Record<string, string>>) => {
    const epoch = args.getEpoch(), accountToken = args.capture();
    return partialHandoff({ source, file, selected, omitted, ownerMapping, latch: args.latch, account: args.account,
      current: () => args.getEpoch() === epoch && args.owns(args.account, accountToken), onRecords: args.onRecords, onOmissions: args.onOmissions, submit: args.submit });
  };
}

export async function partialHandoff(args: {
  source: File; file: File; selected: readonly RecoverableGroup[]; omitted: readonly RecoverableGroup[]; ownerMapping: Readonly<Record<string, string>>;
  latch: IntakeFence; account?: string; current: () => boolean;
  onRecords: (records: PartialHandoffRecord[]) => void; onOmissions: (groups: readonly RecoverableGroup[]) => void;
  submit: (file: File, mapping: Readonly<Record<string, string>>) => Promise<DirectFileOutcome[]>;
}): Promise<string | null> {
  const token = claimIntake(args.latch); if (token === null) return "Wait for the current submission to finish.";
  const { account, selected, omitted, ownerMapping } = args;
  try {
    if (!account || !navigator.locks || !crypto.subtle) return "This browser cannot safely record and lock this partial intake.";
    const sourceDigest = await partialArchiveDigest(args.source, crypto.subtle), subsetDigest = await partialArchiveDigest(args.file, crypto.subtle);
    if (!args.current()) return "The session changed before submission.";
    return await navigator.locks.request(`partial-intake:${account}:${sourceDigest}`, async () => {
      if (!args.current()) return "The session changed before submission.";
      const record = { account, sourceDigest, subsetDigest, status: "pending" as const,
        selected: selected.map((group) => ({ student: ownerMapping[group.label], files: group.members.map((member) => member.path) })),
        omitted: omitted.map((group) => ({ student: group.label, files: group.members.map((member) => member.path), reason: group.reason ?? "not selected" })) };
      if (!reservePartialHandoff(localStorage, record)) return "These files overlap a prior partial intake or its record cannot be checked. Check earlier results before retrying.";
      args.onRecords(listPartialHandoffs(localStorage, account)); args.onOmissions(omitted);
      try {
        const mapping = Object.fromEntries(selected.flatMap((group) => group.members.map((member) => [member.path, ownerMapping[group.label]])));
        const outcomes = await args.submit(args.file, mapping), accepted = outcomes.length === 1 && outcomes[0].kind === "accepted";
        settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, accepted ? "accepted" : "unknown");
        if (args.current()) args.onRecords(listPartialHandoffs(localStorage, account));
        if (!args.current()) return "The session changed; check results before retrying.";
        return accepted ? null : "Submission could not be confirmed. Check results before retrying.";
      } catch { settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, "unknown"); return "Submission could not be confirmed. Check results before retrying."; }
    });
  } catch { return "The partial intake record could not be saved. Check earlier results before retrying."; }
  finally { releaseIntake(args.latch, token); }
}
