"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from "@mui/material";
import { buildRecoverableZip, planRecoverableZip, type RecoverableGroup } from "@/lib/grade/large-zip-subset";

/** Build a partial download only after reviewing the original member inventory. */
export function LargeZipRecovery({ onSubmit }: { onSubmit: (source: File, file: File, selected: readonly RecoverableGroup[], omitted: readonly RecoverableGroup[], mapping: Readonly<Record<string, string>>) => Promise<string | null> }) {
  const [open, setOpen] = useState(false), [file, setFile] = useState<File | null>(null);
  const [groups, setGroups] = useState<readonly RecoverableGroup[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [manifest, setManifest] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Record<string, boolean>>({});
  const [uncertain, setUncertain] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const close = () => { generation.current++; setOpen(false); setFile(null); setGroups([]); setSelected([]); setMapping({}); setAttempts({}); setConfirmed(false); setBusy(false); setError(""); setManifest(null); };
  const choose = async (next: File | undefined) => {
    const token = ++generation.current; setFile(next ?? null); setGroups([]); setSelected([]); setMapping({}); setAttempts({}); setConfirmed(false); setError(""); setManifest(null);
    if (!next) return;
    setBusy(true);
    try {
      const result = await planRecoverableZip(next); if (token !== generation.current) return;
      if (!result.ok) { setError(`Archive could not be reviewed: ${result.reason}.`); return; }
      setGroups(result.groups);
    } catch { if (token === generation.current) setError("Archive review failed. Try choosing the file again."); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const mappedNames = selected.map((label) => mapping[label]?.trim().normalize("NFKC").toLocaleLowerCase() ?? "");
  const mapped = selected.length > 0 && mappedNames.every(Boolean) && new Set(mappedNames).size === mappedNames.length;
  const attemptsReviewed = selected.every((label) => !/^\d+-\d+$/.test(label) || !!attempts[label]);
  const grade = async () => {
    if (!file || !confirmed || !mapped || !attemptsReviewed || busy || uncertain) return;
    const token = generation.current; setBusy(true); setError("");
    try {
      const result = await buildRecoverableZip(file, selected, true); if (token !== generation.current) return;
      if (!result.ok) { setError(`Partial archive could not be prepared: ${result.reason}.`); return; }
      setUncertain(true);
      const refusal = await onSubmit(file, new File([result.archive], "reviewed-partial-submissions.zip", { type: "application/zip" }), result.selected, result.omitted, mapping);
      if (token !== generation.current) return;
      if (refusal) setError(refusal); else { setUncertain(false); close(); }
    } catch { if (token === generation.current) setError("The handoff could not be confirmed. Check results before retrying."); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const build = async () => {
    if (!file || !confirmed || !selected.length || !attemptsReviewed || busy) return;
    const token = generation.current; setBusy(true); setError(""); setManifest(null);
    try {
      const result = await buildRecoverableZip(file, selected); if (token !== generation.current) return;
      if (!result.ok) { setError(`Partial archive could not be built: ${result.reason}.`); return; }
      const describe = (group: RecoverableGroup) => ({ label: group.label, sourceField: group.sourceIdentifier, files: group.members.map((member) => member.path), reason: group.reason ?? null });
      setManifest(JSON.stringify({ source: { name: file.name, bytes: file.size, lastModified: file.lastModified }, partialArchive: "reviewed-partial-submissions.zip", ownershipVerifiedBySoftware: false, instructorConfirmedOwnership: true, selected: result.selected.map(describe), omitted: result.omitted.map(describe), note: "Filename metadata does not prove ownership; this manifest is not cryptographically bound to the archive." }, null, 2));
      download(result.archive, "reviewed-partial-submissions.zip");
    } catch { if (token === generation.current) setError("Partial archive could not be downloaded. Try again."); }
    finally { if (token === generation.current) setBusy(false); }
  };
  const download = (blob: Blob, name: string) => { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; try { link.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); } };
  return <>
    <Button onClick={() => setOpen(true)}>Review oversized ZIP</Button>
    <Dialog open={open} onClose={() => { if (!busy) close(); }} fullWidth maxWidth="md" aria-labelledby="large-zip-title">
      <DialogTitle id="large-zip-title">Review oversized ZIP</DialogTitle>
      <DialogContent><Stack spacing={2}>
        <Alert severity="warning">Names and numeric fields come from filenames; they do not prove ownership. Check every listed file against the original class roster. Groups not selected are omitted. A record of names, files and omissions is saved in this browser before grading. Overlap checks cover only byte-identical source archives in this browser, not repackaged archives or other browsers. The review download contains a marker and cannot be graded directly.</Alert>
        <Button component="label" variant="outlined" disabled={busy}>Choose ZIP<input hidden type="file" accept=".zip,application/zip" onChange={(event) => void choose(event.target.files?.[0])} /></Button>
        {file && <Typography>{file.name}</Typography>}
        {busy && <Typography role="status">Reviewing archive...</Typography>}
        {error && <Alert severity="error">{error}</Alert>}
        {uncertain && <Alert severity="warning">Submission may have started. Check the results before attempting another submission.</Alert>}
        {groups.map((group) => <Stack key={group.label} spacing={0.5}>
          <FormControlLabel control={<Checkbox checked={selected.includes(group.label)} disabled={busy || !!group.reason} onChange={(_, checked) => { setSelected((previous) => checked ? [...previous, group.label] : previous.filter((label) => label !== group.label)); setAttempts((previous) => ({ ...previous, [group.label]: false })); setConfirmed(false); setManifest(null); }} />} label={`${group.label} (source field ${group.sourceIdentifier})${group.reason ? ` — excluded: ${group.reason}` : ""}`} />
          <Typography variant="body2">{group.members.map((member) => member.path).join(", ")}</Typography>
          {selected.includes(group.label) && /^\d+-\d+$/.test(group.label) && <FormControlLabel control={<Checkbox disabled={busy} checked={!!attempts[group.label]} onChange={(_, checked) => { setAttempts((previous) => ({ ...previous, [group.label]: checked })); setConfirmed(false); }} />} label="I checked the original submission and confirmed these files belong to the same attempt. Matching timestamps alone do not prove this." />}
          {selected.includes(group.label) && <TextField label={`Student for ${group.label}`} value={mapping[group.label] ?? ""} onChange={(event) => { setMapping((previous) => ({ ...previous, [group.label]: event.target.value })); setConfirmed(false); }} helperText="Enter the actual student name after checking all files against the source roster. Each selected group must have a distinct name." disabled={busy} />}
        </Stack>)}
        {!!groups.length && <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy || !selected.length} onChange={(_, checked) => setConfirmed(checked)} />} label="I checked ownership and all files in the selected groups against the original records." />}
        {manifest && <Alert severity="warning">Download the review manifest separately and keep it with the partial archive. The grader does not automatically read it; it records omitted groups and is not cryptographically bound to the ZIP. <Button onClick={() => { try { download(new Blob([manifest], { type: "application/json" }), "partial-submissions-review.json"); } catch { setError("Manifest download failed. Try again."); } }}>Download review manifest</Button></Alert>}
      </Stack></DialogContent>
      <DialogActions><Button disabled={busy} onClick={close}>Close</Button><Button disabled={busy || !confirmed || !mapped || !attemptsReviewed} onClick={() => void build()}>Download review copy</Button><Button variant="contained" disabled={busy || uncertain || !confirmed || !mapped || !attemptsReviewed} onClick={() => void grade()}>Grade selected groups</Button></DialogActions>
    </Dialog>
  </>;
}
