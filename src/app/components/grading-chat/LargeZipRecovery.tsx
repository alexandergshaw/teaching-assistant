"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import type { PartialHashProgress, PartialHashReview } from "./partialHandoff";
import { buildRecoverableZip, planRecoverableZip, type RecoverableGroup } from "@/lib/grade/large-zip-subset";
import { inferArchiveNames } from "@/lib/grade/recoverable-zip-names";
import { submitBoundedGroups } from "./partialGroupBatch";
import { inspectBrightspaceProject, type ProjectInventoryFile } from "@/lib/grade/brightspace-project-inventory";
import { buildBrightspaceGroup } from "@/lib/grade/brightspace-group-build";
import { projectReady } from "./nestedProjectReady";

export function LargeZipRecovery({ onSubmit, onSelectionStart, onAdmitted, incomingFile, onClose }: { incomingFile?: File | null; onClose?: () => void; onSelectionStart?: () => void; onAdmitted?: (indices: readonly number[]) => void; onSubmit: (source: File, file: File, selected: readonly RecoverableGroup[], omitted: readonly RecoverableGroup[], mapping: Readonly<Record<string, string>>, review?: PartialHashReview, project?: { readonly mappedPaths: readonly string[]; readonly excludedPaths: readonly string[] }) => Promise<string | null> }) {
  const [open, setOpen] = useState(!!incomingFile), [file, setFile] = useState<File | null>(incomingFile ?? null);
  const [groups, setGroups] = useState<readonly RecoverableGroup[]>([]), [selected, setSelected] = useState<string[]>([]), [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const [projectFiles, setProjectFiles] = useState<Record<string, readonly ProjectInventoryFile[]>>({});
  const [busy, setBusy] = useState(!!incomingFile), [error, setError] = useState(""), [progress, setProgress] = useState<PartialHashProgress | null>(null), [completed, setCompleted] = useState(0), [uncertain, setUncertain] = useState(false);
  const generation = useRef(0), hashing = useRef(false), submitting = useRef(false);
  useEffect(() => () => { generation.current++; }, []);
  const close = () => { generation.current++; setOpen(false); setFile(null); setGroups([]); setSelected([]); setNames({}); setProjectFiles({}); setBusy(false); setError(""); setProgress(null); setCompleted(0); onClose?.(); };
  const choose = async (next: File | undefined) => {
    const token = ++generation.current; setFile(next ?? null); setGroups([]); setSelected([]); setNames({}); setProjectFiles({}); setError(""); setCompleted(0); setUncertain(false);
    if (!next) { setBusy(false); return; }
    setBusy(true);
    try {
      const result = await planRecoverableZip(next); if (token !== generation.current) return;
      if (!result.ok) { setError(`Archive could not be reviewed: ${result.reason}.`); return; }
      const inferred = await inferArchiveNames(next, result.groups); if (token !== generation.current) return;
      const projects: Record<string, readonly ProjectInventoryFile[]> = Object.create(null);
      for (const group of result.groups) if (group.reason === "nested archive" && /^\d+-\d+$/.test(group.label) && inferred[group.label]) for (const member of group.members.filter((item) => item.nestedArchive)) {
        const inventory = await inspectBrightspaceProject(next, member); if (token !== generation.current) return; if (inventory.ok) projects[member.path] = inventory.files;
      }

      const eligible = result.groups.filter((group) => (!group.reason || projectReady(group, projects)) && !!inferred[group.label]);
      const counts = new Map<string, number>(); for (const group of eligible) { const key = inferred[group.label].normalize("NFKC").toLocaleLowerCase(); counts.set(key, (counts.get(key) ?? 0) + 1); }
      setProjectFiles(projects); setNames(inferred); setGroups(result.groups); setSelected(eligible.filter((group) => counts.get(inferred[group.label].normalize("NFKC").toLocaleLowerCase()) === 1).map((group) => group.label));
    } catch { if (token === generation.current) setError("Archive review failed. Try choosing the file again."); }
    finally { if (token === generation.current) setBusy(false); }
  };
  useEffect(() => { let current = true; if (incomingFile) void Promise.resolve().then(() => { if (current) return choose(incomingFile); }); return () => { current = false; }; }, [incomingFile]);

  const nameCounts = new Map<string, number>(); for (const group of groups) { const name = names[group.label]; if (name && (!group.reason || projectReady(group, projectFiles))) { const key = name.normalize("NFKC").toLocaleLowerCase(); nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1); } }
  const blocked = (group: RecoverableGroup) => (group.reason && !projectReady(group, projectFiles) ? group.reason : undefined) ?? (!names[group.label] ? "student identity could not be resolved" : nameCounts.get(names[group.label].normalize("NFKC").toLocaleLowerCase()) !== 1 ? "student identity is ambiguous" : undefined);
  const eligible = groups.filter((group) => !blocked(group));
  const grade = async () => {
    if (!file || !selected.length || busy || uncertain || submitting.current || selected.some((label) => !eligible.some((group) => group.label === label))) return;
    submitting.current = true; onSelectionStart?.(); const token = generation.current; let dispatched = 0, refusedBeforeDispatch = false; setBusy(true); setError(""); setCompleted(0);
    try {
      await submitBoundedGroups<{ archive: Blob; selected: readonly RecoverableGroup[]; omitted: readonly RecoverableGroup[]; project?: { mappedPaths: readonly string[]; excludedPaths: readonly string[] } }>(selected, async (labels) => {
        const nested = labels.map((label) => groups.find((group) => group.label === label)!).find((group) => projectReady(group, projectFiles));
        if (nested && labels.length > 1) return { ok: false, reason: "batch exceeds grading limits" };
        if (nested) {
          const exclusions = Object.fromEntries(nested.members.filter((member) => member.nestedArchive).map((member) => [member.path, projectFiles[member.path].filter((item) => (item.disposition === "candidate-build-artifact" || item.disposition === "course-fixture")).map((item) => item.path)]));
          const project = await buildBrightspaceGroup(file, nested, exclusions); if (token !== generation.current) throw new Error("Archive review was closed.");
          return project.ok ? { ok: true, value: { archive: project.archive, selected: [nested], omitted: groups.filter((group) => group.label !== nested.label), project: { mappedPaths: project.mappedPaths, excludedPaths: project.excludedPaths } } } : project;
        }
        const result = await buildRecoverableZip(file, labels, true); if (token !== generation.current) throw new Error("Archive review was closed.");
        return result.ok ? { ok: true, value: { ...result, project: undefined } } : result;
      }, async (result, count) => {
        refusedBeforeDispatch = false; setUncertain(true);
        const refusal = await onSubmit(file, new File([result.archive], "reviewed-partial-submissions.zip", { type: "application/zip" }), result.selected, result.omitted, names, { current: () => token === generation.current, onAdmitted, onRefused: () => { refusedBeforeDispatch = true; }, onProgress: (value) => { if (token === generation.current) { hashing.current = !!value; setProgress(value); } } }, result.project);
        if (token !== generation.current) throw new Error("The session changed; check results before retrying.");
        if (refusal) { if ((refusedBeforeDispatch || hashing.current || (refusal === "The intake record could not be saved. Nothing was submitted." || refusal === "Another submission from this archive is in progress. Nothing was submitted."))) setUncertain(false); throw new Error(refusal); }
        dispatched += count; setCompleted(dispatched); setUncertain(false);
      });
      if (token === generation.current) close();
    }
    catch (failure) { if (token === generation.current) { setError(`${failure instanceof Error ? failure.message : "The handoff could not be confirmed."}${dispatched ? ` ${dispatched} groups were already submitted; check results before retrying.` : ""}`); } }
    finally { submitting.current = false; if (token === generation.current) { hashing.current = false; setProgress(null); setBusy(false); } }
  };
  return <>
    <Button onClick={() => setOpen(true)}>Review oversized ZIP</Button>
    <Dialog open={open} onClose={() => { if (!busy) close(); }} fullWidth maxWidth="md" aria-labelledby="large-zip-title">
      <DialogTitle id="large-zip-title">Review oversized ZIP</DialogTitle>
      <DialogContent><Stack spacing={2}>
        <Alert severity="info">Names come from the LMS export and filenames. Files with the same LMS group ID are graded together, including files with different submission times. Nested projects are analyzed without executing code. Recognized build artifacts and exact matches to a published course dataset are excluded and recorded as incomplete evidence. Groups with unresolved identities or unsupported files are held; omitted groups are recorded before submission.</Alert>
        <Button component="label" variant="outlined" disabled={busy}>Choose ZIP<input hidden type="file" accept=".zip,application/zip" onChange={(event) => void choose(event.target.files?.[0])} /></Button>
        {file && <Typography>{file.name}</Typography>}
        {busy && <Typography role="status">{progress ? `Checking ${progress.phase === "source" ? "original archive" : "selected files"}: ${progress.written} of ${progress.total} bytes` : `Preparing submissions${completed ? `; ${completed} groups submitted` : ""}...`}</Typography>}
        {progress && <LinearProgress variant={progress.total ? "determinate" : "indeterminate"} value={progress.total ? progress.written / progress.total * 100 : undefined} aria-label="Archive verification progress" />}
        {error && <Alert severity="error">{error}</Alert>}{uncertain && <Alert severity="warning">Submission may have started. Check results before retrying.</Alert>}
        {!!groups.length && <FormControlLabel control={<Checkbox disabled={busy || !eligible.length} checked={eligible.length > 0 && selected.length === eligible.length} indeterminate={selected.length > 0 && selected.length < eligible.length} onChange={(_, checked) => setSelected(checked ? eligible.map((group) => group.label) : [])} />} label={`Select all eligible (${eligible.length})`} />}
        <Stack spacing={0} sx={{ maxHeight: 320, overflowY: "auto" }}>{groups.map((group) => <Stack key={group.label} spacing={0.5}><FormControlLabel control={<Checkbox checked={selected.includes(group.label)} disabled={busy || !!blocked(group)} onChange={(_, checked) => setSelected((previous) => checked ? [...previous, group.label] : previous.filter((label) => label !== group.label))} />} label={`${names[group.label] ?? group.label}${blocked(group) ? ` — held: ${blocked(group)}` : ""}`} /><Tooltip title={group.members.map((member) => member.path).join(", ")}><Typography variant="body2" tabIndex={0}>{group.members.length} {group.members.length === 1 ? "file" : "files"}{projectReady(group, projectFiles) ? `; ${group.members.flatMap((member) => projectFiles[member.path] ?? []).filter((item) => item.disposition === "candidate-build-artifact" || item.disposition === "course-fixture").length} build artifacts or verified course datasets excluded` : ""}</Typography></Tooltip></Stack>)}</Stack>
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy && !progress} onClick={() => { if (busy && !hashing.current) return; if (hashing.current) setUncertain(false); close(); }}>{progress ? "Cancel verification" : "Close"}</Button><Button variant="contained" disabled={busy || uncertain || !selected.length} onClick={() => void grade()}>Grade selected ({selected.length})</Button></DialogActions>
    </Dialog>
  </>;
}
