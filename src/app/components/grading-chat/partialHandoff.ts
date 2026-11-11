import type { RecoverableGroup } from "@/lib/grade/large-zip-subset";
import type { DirectFileOutcome } from "./chatDirectFileIntake";
import { claimIntake, releaseIntake, type IntakeFence } from "./intakeFence";
import { listPartialHandoffs, reservePartialHandoff, settlePartialHandoff, type PartialHandoffRecord } from "./partialHandoffLedger";
import { partialArchiveDigest } from "./partialArchiveDigest";
import { preserveBrightspaceIndex } from "@/lib/grade/brightspace-index-store";
import type { BundleLease, createBundleAuthority } from "@/lib/grade/single-zip-authority";
import type { PerStudentEvidence } from "./partialEvidence";
import type { ExpectedOwnerSession } from "@/lib/grade/owner-session-binding";

export type PartialHashProgress = { readonly phase: "source" | "subset"; readonly written: number; readonly total: number };
export type PartialProjects = Readonly<Record<string, { readonly mappedPaths: readonly string[]; readonly excludedPaths: readonly string[] }>>;
export type PartialHashReview = { readonly current: () => boolean; readonly onProgress: (progress: PartialHashProgress | null) => void; readonly onAdmitted?: (indices: readonly number[]) => void; readonly onRefused?: () => void; readonly sourceDigests?: WeakMap<File, string>; readonly pendingAtHandoff?: readonly RecoverableGroup[]; readonly indexBytes?: Uint8Array; readonly extraMapping?: Readonly<Record<string, string>>; readonly bindOwnerSession?: true; readonly projects?: PartialProjects };

export function createPartialHandoffHandler(args: {
  getEpoch: () => number; account?: string; capture: () => number; owns: (account: string | undefined, token: number) => boolean;
  latch: IntakeFence; onRecords: (records: PartialHandoffRecord[]) => void; onOmissions: (groups: readonly RecoverableGroup[]) => void;
  indexAuthority?: () => ReturnType<typeof createBundleAuthority>;
  submit: (file: File, mapping: Readonly<Record<string, string>>, evidenceOmissions?: readonly string[], staticOnly?: true, perStudentEvidence?: PerStudentEvidence, ownerSession?: ExpectedOwnerSession) => Promise<DirectFileOutcome[]>;
}) {
  return (source: File, file: File, selected: readonly RecoverableGroup[], omitted: readonly RecoverableGroup[], ownerMapping: Readonly<Record<string, string>>, review?: PartialHashReview, project?: { readonly mappedPaths: readonly string[]; readonly excludedPaths: readonly string[] }) => {
    const epoch = args.getEpoch(), accountToken = args.capture();
    return partialHandoff({ source, file, selected, omitted, ownerMapping, project, latch: args.latch, account: args.account,
      current: () => args.getEpoch() === epoch && args.owns(args.account, accountToken) && (review?.current() ?? true), onHashProgress: review?.onProgress, onAdmitted: review?.onAdmitted, onRefused: review?.onRefused, sourceDigests: review?.sourceDigests, pendingAtHandoff: review?.pendingAtHandoff, indexBytes: review?.indexBytes, extraMapping: review?.extraMapping, bindOwnerSession: review?.bindOwnerSession, projects: review?.projects, indexAuthority: args.indexAuthority, onRecords: args.onRecords, onOmissions: args.onOmissions, submit: args.submit });
  };
}

export async function partialHandoff(args: {
  source: File; file: File; selected: readonly RecoverableGroup[]; omitted: readonly RecoverableGroup[]; ownerMapping: Readonly<Record<string, string>>; project?: { readonly mappedPaths: readonly string[]; readonly excludedPaths: readonly string[] };
  latch: IntakeFence; account?: string; current: () => boolean;
  onHashProgress?: (progress: PartialHashProgress | null) => void; onAdmitted?: (indices: readonly number[]) => void; onRefused?: () => void;
  sourceDigests?: WeakMap<File, string>;
  pendingAtHandoff?: readonly RecoverableGroup[];
  indexBytes?: Uint8Array; extraMapping?: Readonly<Record<string, string>>; projects?: PartialProjects;
  bindOwnerSession?: true;
  indexAuthority?: () => ReturnType<typeof createBundleAuthority>;
  onRecords: (records: PartialHandoffRecord[]) => void; onOmissions: (groups: readonly RecoverableGroup[]) => void;
  submit: (file: File, mapping: Readonly<Record<string, string>>, evidenceOmissions?: readonly string[], staticOnly?: true, perStudentEvidence?: PerStudentEvidence, ownerSession?: ExpectedOwnerSession) => Promise<DirectFileOutcome[]>;
}): Promise<string | null> {
  const token = claimIntake(args.latch); if (token === null) return "Wait for the current submission to finish.";
  const { account, selected, omitted, ownerMapping } = args; let verified = false;
  let indexAuthority: ReturnType<typeof createBundleAuthority> | undefined, indexLease: BundleLease | null = null;
  const indexCurrent = () => !indexAuthority || (!!indexLease && indexAuthority.resolve(indexLease) === account);
  const refuseBeforeDispatch = (message: string) => { if (args.current()) { try { args.onRefused?.(); } catch { /* Display state cannot change admission. */ } } return message; };
  try {
    if (args.project && (selected.length !== 1 || !args.project.mappedPaths.length || new Set(args.project.mappedPaths).size !== args.project.mappedPaths.length)) return "The project mapping is invalid. Nothing was queued.";
    if (args.projects) {
      const labels = new Set(selected.map((group) => group.label));
      const paths = selected.flatMap((group) => args.projects?.[group.label]?.mappedPaths ?? group.members.map((member) => member.path));
      const owns = (group: RecoverableGroup, path: string) => group.members.some((member) => path === member.path || (member.nestedArchive && path.startsWith(`${member.path}/`)));
      if (args.project || Object.keys(args.projects).some((label) => !labels.has(label)) || selected.some((group) => { const project = args.projects?.[group.label]; return project && (!project.mappedPaths.length || [...project.mappedPaths, ...project.excludedPaths].some((path) => !owns(group, path))); }) || new Set(paths.map((path) => path.normalize("NFKC").toLowerCase())).size !== paths.length) return "The project mapping is invalid. Nothing was queued.";
    }
    if (!account || !navigator.locks || !crypto.subtle) return "This browser cannot safely record and lock this partial intake.";
    if (!args.current()) return "The session changed before submission.";
    let sourceDigest = args.sourceDigests?.get(args.source);
    if (!sourceDigest) {
      args.onHashProgress?.({ phase: "source", written: 0, total: args.source.size });
      sourceDigest = await partialArchiveDigest(args.source, crypto.subtle, args.current, (written, total) => args.onHashProgress?.({ phase: "source", written, total }));
      if (!args.current()) return "The session changed before submission.";
      args.sourceDigests?.set(args.source, sourceDigest);
    }
    args.onHashProgress?.({ phase: "subset", written: 0, total: args.file.size });
    const subsetDigest = await partialArchiveDigest(args.file, crypto.subtle, args.current, (written, total) => args.onHashProgress?.({ phase: "subset", written, total }));
    verified = true; args.onHashProgress?.(null);
    if (!args.current()) return "The session changed before submission.";
    return await navigator.locks.request(`partial-intake:${account}:${sourceDigest}`, { ifAvailable: true }, async (lock) => {
      if (!lock) return "Another submission from this archive is in progress. Nothing was submitted.";
      if (!args.current()) return "The session changed before submission.";
      const extraMapping = args.extraMapping ?? {}, selectedNames = new Set(selected.map((group) => ownerMapping[group.label]));
      if (Object.keys(extraMapping).length && !args.indexBytes) return refuseBeforeDispatch("The original index is missing. Nothing was queued.");
      if (Object.values(extraMapping).some((name) => !selectedNames.has(name))) return refuseBeforeDispatch("The index evidence mapping is invalid. Nothing was queued.");
      const originalPaths = new Set(args.project ? args.project.mappedPaths : selected.flatMap((group) => args.projects?.[group.label]?.mappedPaths ?? group.members.map((member) => member.path)));
      if (Object.keys(extraMapping).some((path) => originalPaths.has(path))) return refuseBeforeDispatch("The index evidence mapping conflicts with a submission. Nothing was queued.");
      let indexDigest: string | undefined;
      if (args.bindOwnerSession || args.indexBytes) { try { indexAuthority = args.indexAuthority?.(); indexLease = await indexAuthority?.admit() ?? null; if (!indexAuthority || !indexLease || indexAuthority.resolve(indexLease) !== account) throw new Error("Owner session could not be verified."); if (args.indexBytes) indexDigest = await preserveBrightspaceIndex({ authority: indexAuthority, lease: indexLease }, sourceDigest, args.indexBytes, () => args.current() && indexCurrent()); } catch { return refuseBeforeDispatch("The owner session or original index could not be safely verified. Nothing was submitted."); } }
      if (!args.current() || !indexCurrent()) return "The session changed before submission.";
      const attemptId = crypto.randomUUID();
      const record = { account, sourceDigest, subsetDigest, attemptId, status: "pending" as const,
        selected: selected.map((group) => ({ student: ownerMapping[group.label], files: [...group.members.map((member) => member.path), ...Object.entries(extraMapping).filter(([, name]) => name === ownerMapping[group.label]).map(([path]) => path)] })), pendingAtHandoff: (args.pendingAtHandoff ?? []).map((group) => ({ student: ownerMapping[group.label] ?? group.label, files: group.members.map((member) => member.path) })), ...(indexDigest ? { indexDigest } : {}),
        omitted: [...omitted.map((group) => ({ student: group.label, files: group.members.map((member) => member.path), reason: group.reason ?? "not selected" })), ...(args.project?.excludedPaths.length ? [{ student: selected[0].label, files: [...args.project.excludedPaths], reason: "build artifact or verified course dataset excluded from grading" }] : []), ...Object.entries(args.projects ?? {}).filter(([, project]) => project.excludedPaths.length).map(([label, project]) => ({ student: label, files: [...project.excludedPaths], reason: "build artifact or verified course dataset excluded from grading" }))] };
      if (!reservePartialHandoff(localStorage, record)) return "The intake record could not be saved. Nothing was submitted.";
      args.onRecords(listPartialHandoffs(localStorage, account)); args.onOmissions(omitted);
      try {
        if (!args.current() || !indexCurrent()) { settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, "refused", attemptId); return "The session changed before submission."; }
        const mapping = args.project ? Object.fromEntries(args.project.mappedPaths.map((path) => [path, ownerMapping[selected[0].label]])) : Object.fromEntries(selected.flatMap((group) => (args.projects?.[group.label]?.mappedPaths ?? group.members.map((member) => member.path)).map((path) => [path, ownerMapping[group.label]])));
        Object.assign(mapping, extraMapping);
        const ownerSession = indexAuthority && indexLease ? indexAuthority.identity(indexLease) ?? undefined : undefined;
        if ((args.bindOwnerSession || args.indexBytes) && !ownerSession) { settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, "refused", attemptId); return refuseBeforeDispatch("The owner session changed. Nothing was submitted."); }
        const perStudentEvidence = args.projects ? selected.map((group) => ({ student: ownerMapping[group.label], omissions: args.projects?.[group.label]?.excludedPaths ?? [], staticOnly: !!args.projects?.[group.label] })) : undefined;
        const outcomes = await args.submit(args.file, mapping, args.project?.excludedPaths, args.project ? true : undefined, perStudentEvidence, ownerSession), accepted = outcomes.length === 1 && outcomes[0].kind === "accepted";
        if (outcomes.length === 1 && (outcomes[0].kind === "accepted" || outcomes[0].kind === "partial") && outcomes[0].sourceIndices && args.current()) { try { args.onAdmitted?.(outcomes[0].sourceIndices); } catch { /* Display priority cannot change admission. */ } }
        const refused = outcomes.length === 1 && outcomes[0].kind === "refused";
        settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, !indexCurrent() ? "unknown" : accepted ? "accepted" : refused ? "refused" : "unknown", attemptId);
        if (refused && args.current()) { try { args.onRefused?.(); } catch { /* Display state cannot change admission. */ } }
        if (args.current()) args.onRecords(listPartialHandoffs(localStorage, account));
        if (!args.current() || !indexCurrent()) return "The session changed; check results before retrying.";
        return accepted ? null : outcomes[0]?.kind === "refused" ? outcomes[0].reason : "Submission could not be confirmed. Check results before retrying.";
      } catch { settlePartialHandoff(localStorage, account, sourceDigest, subsetDigest, "unknown", attemptId); return "Submission could not be confirmed. Check results before retrying."; }
    });
  } catch { return !args.current() ? "The session changed before submission." : verified ? "The intake record could not be saved. Nothing was submitted." : "Archive verification failed. Nothing was submitted."; }
  finally { indexAuthority?.close(); releaseIntake(args.latch, token); }
}
