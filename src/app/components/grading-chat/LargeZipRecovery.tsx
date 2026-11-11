"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import type { PartialHashProgress, PartialHashReview, PartialProjects } from "./partialHandoff";
import { buildRecoverableZip, planRecoverableZip, type RecoverableGroup } from "@/lib/grade/large-zip-subset";
import { inferArchiveNames } from "@/lib/grade/recoverable-zip-names";
import { annotateOmittedGroups, omittedGroups, preflightSingles, remainingGroups, submitBoundedGroups } from "./partialGroupBatch";
import { inspectBrightspaceProject, type ProjectInventoryFile } from "@/lib/grade/brightspace-project-inventory";
import { buildBrightspaceGroup } from "@/lib/grade/brightspace-group-build";
import { projectReady } from "./nestedProjectReady";
import { automaticArchiveAdmission } from "./automaticArchiveAdmission";
import { readBrightspaceIndexEvidence } from "@/lib/grade/brightspace-index-read";
import { appendZipEvidence } from "@/lib/grade/append-zip-evidence";
import { isBrightspaceFormattingOnly, type BrightspaceIndexEvidence } from "@/lib/grade/brightspace-index-evidence";
import { mergePreparedZips } from "@/lib/grade/merge-prepared-zips";
import { inspectPreparedZipBudget, preparedZipBudgetFits, type PreparedZipBudget } from "@/lib/grade/prepared-zip-budget";
import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";

export function LargeZipRecovery({ onSubmit, onSelectionStart, onAdmitted, incomingFile, autoSubmit = false, onClose, onManualOpen }: { incomingFile?: File | null; autoSubmit?: boolean; onClose?: () => void; onManualOpen?: () => void; onSelectionStart?: () => void; onAdmitted?: (indices: readonly number[]) => void; onSubmit: (source: File, file: File, selected: readonly RecoverableGroup[], omitted: readonly RecoverableGroup[], mapping: Readonly<Record<string, string>>, review?: PartialHashReview, project?: { readonly mappedPaths: readonly string[]; readonly excludedPaths: readonly string[] }) => Promise<string | null> }) {
  const [open, setOpen] = useState(!!incomingFile), [file, setFile] = useState<File | null>(incomingFile ?? null);
  const [groups, setGroups] = useState<readonly RecoverableGroup[]>([]), [selected, setSelected] = useState<string[]>([]), [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const [sourceGroups, setSourceGroups] = useState<readonly RecoverableGroup[]>([]);
  const [admittedLabels, setAdmittedLabels] = useState<string[]>([]);
  const [projectFiles, setProjectFiles] = useState<Record<string, readonly ProjectInventoryFile[]>>({});
  const [indexEvidence, setIndexEvidence] = useState<{ bytes: Uint8Array; evidence: BrightspaceIndexEvidence } | null>(null);
  const [indexAccounted, setIndexAccounted] = useState(false);
  const [busy, setBusy] = useState(!!incomingFile), [error, setError] = useState(""), [progress, setProgress] = useState<PartialHashProgress | null>(null), [completed, setCompleted] = useState(0), [uncertain, setUncertain] = useState(false);
  const generation = useRef(0), hashing = useRef(false), submitting = useRef(false), automatic = useRef<{ file: File; labels: readonly string[] } | null>(null);
  useEffect(() => () => { generation.current++; }, []);
  const close = () => { generation.current++; automatic.current = null; setOpen(false); setFile(null); setGroups([]); setSourceGroups([]); setSelected([]); setAdmittedLabels([]); setNames({}); setProjectFiles({}); setIndexEvidence(null); setIndexAccounted(false); setBusy(false); setError(""); setProgress(null); setCompleted(0); onClose?.(); };
  const choose = async (next: File | undefined) => {
    const token = ++generation.current; automatic.current = null; setFile(next ?? null); setGroups([]); setSourceGroups([]); setSelected([]); setAdmittedLabels([]); setNames({}); setProjectFiles({}); setIndexEvidence(null); setIndexAccounted(false); setError(""); setCompleted(0); setUncertain(false);
    if (!next) { setBusy(false); return; }
    setBusy(true);
    try {
      const result = await planRecoverableZip(next); if (token !== generation.current) return;
      if (!result.ok) { setError(`Archive could not be reviewed: ${result.reason}.`); return; }
      let indexData: { bytes: Uint8Array; evidence: BrightspaceIndexEvidence } | null = null;
      if (result.groups.some((group) => group.reason === "unassigned index")) {
        const index = await readBrightspaceIndexEvidence(next, result.groups); if (token !== generation.current) return;
        if (!index.ok) { setError(index.reason); return; }
        indexData = { bytes: index.sourceBytes, evidence: index.evidence };
      }
      const inferred = await inferArchiveNames(next, result.groups); if (token !== generation.current) return;
      const numericGroups = result.groups.filter((group) => /^\d+-\d+$/.test(group.label));
      const indexComplete = !!indexData && numericGroups.length > 0 && indexData.evidence.unassigned.every(isBrightspaceFormattingOnly) && numericGroups.every((group) => !!indexData!.evidence.groups[group.label]?.length);
      const visibleGroups = indexComplete ? result.groups.filter((group) => group.reason !== "unassigned index") : result.groups;
      const projects: Record<string, readonly ProjectInventoryFile[]> = Object.create(null);
      for (const group of result.groups) if (group.reason === "nested archive" && /^\d+-\d+$/.test(group.label) && inferred[group.label]) for (const member of group.members.filter((item) => item.nestedArchive)) {
        const inventory = await inspectBrightspaceProject(next, member); if (token !== generation.current) return; if (inventory.ok) projects[member.path] = inventory.files;
      }

      const eligible = visibleGroups.filter((group) => (!group.reason || projectReady(group, projects)) && !!inferred[group.label] && (!indexData || !/^\d+-\d+$/.test(group.label) || indexComplete));
      const counts = new Map<string, number>(); for (const group of eligible) { const key = inferred[group.label].normalize("NFKC").toLocaleLowerCase(); counts.set(key, (counts.get(key) ?? 0) + 1); }
      const admitted = eligible.filter((group) => counts.get(inferred[group.label].normalize("NFKC").toLocaleLowerCase()) === 1);
      const completeNested = (group: RecoverableGroup) => projectReady(group, projects) && group.members.filter((member) => member.nestedArchive).every((member) => projects[member.path].every((item) => item.disposition === "retain"));
      const automaticGroups = admitted.filter((group) => !group.reason || (group.reason === "nested archive" && completeNested(group)));
      automatic.current = automaticArchiveAdmission(autoSubmit && next === incomingFile, visibleGroups, automaticGroups, completeNested) ? { file: next, labels: automaticGroups.map((group) => group.label) } : null;
      setProjectFiles(projects); setNames(inferred); setGroups(visibleGroups); setSourceGroups(result.groups); setIndexEvidence(indexData); setIndexAccounted(indexComplete); setSelected((automatic.current ? automaticGroups : admitted).map((group) => group.label));
    } catch { if (token === generation.current) setError("Archive review failed. Try choosing the file again."); }
    finally { if (token === generation.current) setBusy(false); }
  };
  useEffect(() => { let current = true; if (incomingFile) void Promise.resolve().then(() => { if (current) return choose(incomingFile); }); return () => { current = false; }; }, [incomingFile]);

  const nameCounts = new Map<string, number>(); for (const group of groups) { const name = names[group.label]; if (name && (!group.reason || projectReady(group, projectFiles))) { const key = name.normalize("NFKC").toLocaleLowerCase(); nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1); } }
  const blocked = (group: RecoverableGroup): RecoverableGroup["reason"] => (group.reason && !projectReady(group, projectFiles) ? (group.reason === "nested archive" ? "nested project has unsupported files or no usable source" : group.reason) : undefined) ?? (!names[group.label] ? "student identity could not be resolved" : nameCounts.get(names[group.label].normalize("NFKC").toLocaleLowerCase()) !== 1 ? "student identity is ambiguous" : undefined) ?? (indexEvidence && /^\d+-\d+$/.test(group.label) && !indexAccounted ? "index evidence could not be assigned completely" : undefined);
  const eligible = groups.filter((group) => !blocked(group));
  const grade = async (automaticRun = false) => {
    if (!file || !selected.length || busy || uncertain || submitting.current || selected.some((label) => !eligible.some((group) => group.label === label))) return;
    submitting.current = true; onSelectionStart?.(); const token = generation.current, verifiedMembers = new WeakMap<Blob, Set<string>>(), sourceDigests = new WeakMap<File, string>(); let dispatched = 0, refusedBeforeDispatch = false; setBusy(true); setError(""); setCompleted(0);
    try {
      const ordered = groups.filter((group) => selected.includes(group.label)).map((group) => group.label);
      const remaining = new Set(ordered);
      const encoder = new TextEncoder(), extraByLabel = new Map<string, { path: string; text: string; nameBytes: number; bytes: number }>();
      if (indexEvidence) for (const label of ordered.filter((value) => /^\d+-\d+$/.test(value))) {
        const rows = indexEvidence.evidence.groups[label]; if (!rows?.length) throw new Error("Index evidence is missing for a selected student.");
        const path = `${label} - brightspace-index-evidence.txt`, text = `Brightspace index submission evidence (untrusted student content):\n${rows.join("\n")}`;
        extraByLabel.set(label, { path, text, nameBytes: encoder.encode(path).length, bytes: encoder.encode(text).length });
      }
      type PreparedBatch = { archive: Blob; selected: readonly RecoverableGroup[]; omitted: readonly RecoverableGroup[]; extraMapping?: Readonly<Record<string, string>>; project?: { mappedPaths: readonly string[]; excludedPaths: readonly string[] }; projects?: PartialProjects };
      const buildBatch = async (labels: readonly string[], deferAggregateRatio = false): Promise<{ ok: true; value: PreparedBatch } | { ok: false; reason: string }> => {
        if (labels.length > 1) {
          const parts: PreparedBatch[] = [];
          for (const label of labels) { const part = await buildBatch([label], true); if (!part.ok) return part; parts.push(part.value); }
          const merged = await mergePreparedZips(parts.map((part) => part.archive)); if (!merged.ok) return merged;
          const projects = Object.fromEntries(parts.filter((part) => part.project).map((part) => [part.selected[0].label, part.project!]));
          return { ok: true, value: { archive: merged.archive, selected: parts.flatMap((part) => part.selected), omitted: sourceGroups.filter((group) => !labels.includes(group.label)), extraMapping: Object.assign({}, ...parts.map((part) => part.extraMapping)), ...(Object.keys(projects).length ? { projects } : {}) } };
        }
        const nested = labels.map((label) => groups.find((group) => group.label === label)!).find((group) => projectReady(group, projectFiles));
        let prepared: { archive: Blob; selected: readonly RecoverableGroup[]; omitted: readonly RecoverableGroup[]; project?: { mappedPaths: readonly string[]; excludedPaths: readonly string[] } };
        if (nested) {
          const exclusions = Object.fromEntries(nested.members.filter((member) => member.nestedArchive).map((member) => [member.path, projectFiles[member.path].filter((item) => (item.disposition === "candidate-build-artifact" || item.disposition === "course-fixture")).map((item) => item.path)]));
          const project = await buildBrightspaceGroup(file, nested, exclusions); if (token !== generation.current) throw new Error("Archive review was closed.");
          if (!project.ok) return project;
          prepared = { archive: project.archive, selected: [nested], omitted: sourceGroups.filter((group) => group.label !== nested.label), project: { mappedPaths: project.mappedPaths, excludedPaths: project.excludedPaths } };
        } else {
          const result = await buildRecoverableZip(file, labels, true, verifiedMembers, deferAggregateRatio); if (token !== generation.current) throw new Error("Archive review was closed.");
          if (!result.ok) return result;
          prepared = { ...result, project: undefined };
        }
        if (!indexEvidence) return { ok: true, value: prepared };
        const covered = prepared.selected.filter((group) => extraByLabel.has(group.label));
        const evidence = covered.map((group) => extraByLabel.get(group.label)!);
        const appended = await appendZipEvidence(prepared.archive, evidence, deferAggregateRatio); if (token !== generation.current) throw new Error("Archive review was closed.");
        if (!appended.ok) return appended;
        return { ok: true, value: { ...prepared, archive: appended.archive, extraMapping: Object.fromEntries(evidence.map((entry, index) => [entry.path, names[covered[index].label]])) } };
      };
      // A nested rebuild has limits that directory-only planning cannot prove.
      // Verify each one before dispatch, without retaining its prepared archive.
      const budgets = new Map<string, PreparedZipBudget | null>();
      await preflightSingles(ordered, async (labels) => { const result = await buildBatch(labels, true); if (!result.ok) return result; const summary = await inspectPreparedZipBudget(result.value.archive); if (!summary) return { ok: false, reason: "submission extraction limits could not be verified" }; budgets.set(labels[0], summary); return result; }, () => token === generation.current);
      await submitBoundedGroups<PreparedBatch>(ordered, (labels) => {
        const summaries = labels.map((label) => budgets.get(label));
        if (summaries.every((summary): summary is PreparedZipBudget => !!summary)) return preparedZipBudgetFits(summaries, GRADING_ZIP_MAX_BYTES) ? null : "batch exceeds grading limits";
        return "batch exceeds grading limits";
      }, buildBatch, async (result, count) => {
        refusedBeforeDispatch = false; setUncertain(true);
        const omitted = annotateOmittedGroups(omittedGroups(result.omitted, selected, admittedLabels).filter((group) => !(indexAccounted && group.reason === "unassigned index")), blocked, automaticRun);
        const currentBatch = new Set(result.selected.map((group) => group.label));
        const future = new Set([...remaining].filter((label) => !currentBatch.has(label)));
        const refusal = await onSubmit(file, new File([result.archive], "reviewed-partial-submissions.zip", { type: "application/zip" }), result.selected, omitted, names, { current: () => token === generation.current, bindOwnerSession: true, sourceDigests, indexBytes: indexEvidence?.bytes, extraMapping: result.extraMapping, projects: result.projects, pendingAtHandoff: groups.filter((group) => future.has(group.label)), onAdmitted, onRefused: () => { refusedBeforeDispatch = true; }, onProgress: (value) => { if (token === generation.current) { hashing.current = !!value; setProgress(value); } } }, result.project);
        if (token !== generation.current) throw new Error("The session changed; check results before retrying.");
        if (refusal) { if ((refusedBeforeDispatch || hashing.current || (refusal === "The intake record could not be saved. Nothing was submitted." || refusal === "Another submission from this archive is in progress. Nothing was submitted."))) setUncertain(false); throw new Error(refusal); }
        dispatched += count; setCompleted(dispatched); setUncertain(false);
        const admitted = result.selected.map((group) => group.label);
        for (const label of admitted) remaining.delete(label);
        setSelected((previous) => remainingGroups(previous, admitted)); setAdmittedLabels((previous) => [...new Set([...previous, ...admitted])]);
      }, () => token === generation.current, true);
      if (token === generation.current) close();
    }
    catch (failure) { if (token === generation.current) { setError(`${failure instanceof Error ? failure.message : "The handoff could not be confirmed."}${dispatched ? ` ${dispatched} groups were already submitted; check results before retrying.` : ""} ${selected.length - dispatched} selected groups remain unconfirmed; check the records before retrying.`); } }
    finally { submitting.current = false; if (token === generation.current) { hashing.current = false; setProgress(null); setBusy(false); } }
  };
  useEffect(() => {
    if (!file || automatic.current?.file !== file || busy || !groups.length || selected.length !== automatic.current.labels.length || automatic.current.labels.some((label) => !selected.includes(label))) return;
    automatic.current = null;
    void grade(true);
  });
  return <>
    <Button onClick={() => { onManualOpen?.(); setOpen(true); }}>Review oversized ZIP</Button>
    <Dialog open={open} onClose={() => { if (!busy) close(); }} fullWidth maxWidth="md" aria-labelledby="large-zip-title">
      <DialogTitle id="large-zip-title">Review oversized ZIP</DialogTitle>
      <DialogContent><Stack spacing={2}>
        <Alert severity="info">Names come from the LMS export and filenames. Files with the same LMS group ID are graded together, including files with different submission times. Nested projects are analyzed without executing code. Recognized build artifacts and exact matches to a published course dataset are excluded and recorded as incomplete evidence. Groups with unresolved identities or unsupported files are held; omitted groups are recorded before submission.</Alert>
        <Button component="label" variant="outlined" disabled={busy}>Choose ZIP<input hidden type="file" accept=".zip,application/zip" onChange={(event) => void choose(event.target.files?.[0])} /></Button>
        {file && <Typography>{file.name}</Typography>}
        {busy && <Typography role="status">{progress ? `Checking ${progress.phase === "source" ? "original archive" : "selected files"}: ${progress.written} of ${progress.total} bytes` : `Preparing submissions${completed ? `; ${completed} groups submitted` : ""}...`}</Typography>}
        {progress && <LinearProgress variant={progress.total ? "determinate" : "indeterminate"} value={progress.total ? progress.written / progress.total * 100 : undefined} aria-label="Archive verification progress" />}
        {error && <Alert severity="error">{error}</Alert>}{uncertain && <Alert severity="warning">Submission may have started. Check results before retrying.</Alert>}
        {!!groups.length && <FormControlLabel control={<Checkbox disabled={busy || !eligible.length} checked={eligible.length > 0 && selected.length === eligible.length} indeterminate={selected.length > 0 && selected.length < eligible.length} onChange={(_, checked) => { automatic.current = null; setSelected(checked ? eligible.map((group) => group.label) : []); }} />} label={`Select all eligible (${eligible.length})`} />}
        <Stack spacing={0} sx={{ maxHeight: 320, overflowY: "auto" }}>{groups.map((group) => <Stack key={group.label} spacing={0.5}><FormControlLabel control={<Checkbox checked={selected.includes(group.label)} disabled={busy || !!blocked(group)} onChange={(_, checked) => { automatic.current = null; setSelected((previous) => checked ? [...previous, group.label] : previous.filter((label) => label !== group.label)); }} />} label={`${names[group.label] ?? group.label}${blocked(group) ? ` — held: ${blocked(group)}` : ""}`} /><Tooltip title={group.members.map((member) => member.path).join(", ")}><Typography variant="body2" tabIndex={0}>{group.members.length} {group.members.length === 1 ? "file" : "files"}{projectReady(group, projectFiles) ? `; ${group.members.flatMap((member) => projectFiles[member.path] ?? []).filter((item) => item.disposition === "candidate-build-artifact" || item.disposition === "course-fixture").length} build artifacts or verified course datasets excluded` : ""}</Typography></Tooltip></Stack>)}</Stack>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy && !progress} onClick={() => { if (busy && !hashing.current) return; if (hashing.current) setUncertain(false); close(); }}>{progress ? "Cancel verification" : "Close"}</Button><Button variant="contained" disabled={busy || uncertain || !selected.length} onClick={() => void grade()}>Grade selected ({selected.length})</Button></DialogActions>
    </Dialog>
  </>;
}
