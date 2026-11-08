"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { DirectFileOutcome } from "./chatDirectFileIntake";
import type { SubmitOutcome } from "./useContinuousGradingRun";
import { ROLE_FILE_LIMIT } from "./chatFileRoles";
import { markSessionChanged, submitAssignedFiles, submitDropBatch, suggestFileGroups } from "./submissionDropRoutes";
import { claimIntake, releaseIntake, resetIntake, type IntakeFence } from "./intakeFence";

type State = "ready" | "refused" | "identity" | "queued" | "staged" | "uncertain";
interface Row { id: number; file: File; state: State; reason?: string; assigned?: string }

export function reconcileRowAfterReset(row: Row): Row {
  if (row.state !== "queued" && row.state !== "staged") return row;
  return { ...row, state: "uncertain", reason: "The session changed. Check the previous results before retrying." };
}
/** File intake stays visible while text, URL, and composite tools remain available. */
export function SubmissionDrop({ disabled, sharedLatch, reviewFiles = false, getSessionEpoch, sessionEpoch, onOne, onMany, onText }: {
  disabled: boolean;
  sharedLatch?: IntakeFence;
  reviewFiles?: boolean;
  getSessionEpoch?: () => number;
  sessionEpoch?: number;
  onOne: (student: string, files: File[]) => Promise<DirectFileOutcome>;
  onMany: (files: File[]) => Promise<DirectFileOutcome[]>;
  onText: (student: string, content: string) => Promise<SubmitOutcome>;
}) {
  const [mode, setMode] = useState<"one" | "many">("one");
  const [student, setStudent] = useState("");
  const [textStudent, setTextStudent] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [textUncertain, setTextUncertain] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const picker = useRef<HTMLInputElement | null>(null);
  const nextId = useRef(0), alive = useRef(true);
  const activeRows = useRef<ReadonlySet<number> | null>(null);
  const textPending = useRef(false);
  const [localLatch] = useState<IntakeFence>(() => ({ busy: false, generation: 0 }));
  const latch = sharedLatch ?? localLatch;
  const previousEpoch = useRef(sessionEpoch);
  useEffect(() => {
    if (previousEpoch.current === sessionEpoch) return;
    previousEpoch.current = sessionEpoch;
    if (!sharedLatch) resetIntake(localLatch);
    if (textPending.current) setTextUncertain(true);
    const attempted = activeRows.current;
    activeRows.current = null; textPending.current = false;
    setPending(false);
    setRows((previous) => previous.map((row) => attempted?.has(row.id) ? { ...row, state: "uncertain", reason: "The session changed. Check the previous results before retrying." } : reconcileRowAfterReset(row)));
  }, [sessionEpoch, sharedLatch, localLatch, pending, submissionText]);  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!pending && !submissionText && !rows.some((row) => row.state === "ready" || row.state === "refused" || row.state === "identity" || row.state === "uncertain")) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending, rows, submissionText]);
  const busy = disabled || pending;
  const ready = rows.filter((row) => row.state === "ready" || row.state === "refused");
  const assigned = rows.filter((row) => row.state === "identity" && row.assigned?.trim());
  const suggestedRows = rows.filter((row) => row.state === "identity" && !row.assigned?.trim());
  const suggestions = suggestFileGroups(suggestedRows.map((row) => row.file));
  const suggestedGroups = [...new Set(suggestions.filter(Boolean))].map((name) => ({
    name, files: suggestedRows.filter((_, index) => suggestions[index] === name),
  }));
  const unresolved = rows.some((row) => row.state === "uncertain");
  const queuedRows = rows.filter((row) => row.state === "queued");
  const attentionRows = rows.filter((row) => row.state !== "queued");

  async function gradeText() {
    if (busy || latch.busy || textUncertain || !submissionText.trim() || (mode === "many" && !textStudent.trim())) return;
    const token = claimIntake(latch); if (token === null) return; textPending.current = true; setPending(true); setError(null);
    const epoch = getSessionEpoch?.();
    try {
      const outcome = await onText(mode === "one" ? student.trim() : textStudent.trim(), submissionText);
      if (!alive.current || latch.generation !== token) return;
      if (getSessionEpoch?.() !== epoch || outcome.kind === "partial" || (outcome.kind === "accepted" && outcome.entryCount !== 1)) {
        setTextUncertain(true);
        setError("The text submission status could not be confirmed. Check the previous results before retrying.");
      } else if (outcome.kind === "refused") setError(outcome.reason);
      else { setSubmissionText(""); if (mode === "many") setTextStudent(""); }
    } catch {
      if (alive.current && latch.generation === token) { setTextUncertain(true); setError("The text submission status could not be confirmed. Check the results before retrying."); }
    } finally { if (releaseIntake(latch, token) && alive.current) { textPending.current = false; setPending(false); } }
  }

  function addFiles(files: File[]) {
    if (busy || latch.busy) { setError("Wait for the current upload to finish, then choose these files again."); return; }
    if (files.length === 0) return;
    if (rows.length + files.length > ROLE_FILE_LIMIT) { setError(`Choose up to ${ROLE_FILE_LIMIT} files at a time. Your current list is unchanged.`); return; }
    const added = files.map((file) => ({ id: nextId.current++, file, state: "ready" as const }));
    setRows((previous) => [...previous, ...added]);
    setError(null);
    if (!reviewFiles && mode === "one" && (files.length > 12 || unresolved)) {
      setError(files.length > 12 ? "One student's submission can contain up to 12 files. Clear the list and choose fewer files." : "Check the earlier unconfirmed submission before adding another for one student.");
      return;
    }
    void grade(added, mode, student);
  }

  function pick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    addFiles(files);
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (busy || latch.busy) { setError("Wait for the current upload to finish, then drop these files again."); return; }
    const entries = Array.from(event.dataTransfer.items ?? []).filter((item) => item.kind === "file");
    if (entries.some((item) => item.webkitGetAsEntry?.()?.isDirectory || !item.getAsFile())) {
      setError("Folders cannot be dropped here. Choose files, or put the folder in a ZIP archive.");
      return;
    }
    addFiles(Array.from(event.dataTransfer.files));
  }

  async function grade(batch: Row[], selectedMode: "one" | "many", selectedStudent: string) {
    if (busy || latch.busy || batch.length === 0 || (!reviewFiles && selectedMode === "one" && (unresolved || batch.length > 12))) return;
    const token = claimIntake(latch); if (token === null) return; activeRows.current = new Set(batch.map((row) => row.id));
    setPending(true);
    setError(null);
    const epoch = getSessionEpoch?.();
    try {
      const outcomes = reviewFiles ? await onMany(batch.map((row) => row.file)) : await submitDropBatch(selectedMode, selectedStudent, batch.map((row) => row.file), onOne, onMany, () => alive.current && getSessionEpoch?.() === epoch);
      if (!alive.current || latch.generation !== token) return;
      const byId = new Map(batch.map((row, index) => { const outcome = outcomes[index] ?? { kind: "unknown" as const, reason: "The upload status could not be confirmed. Check results before retrying." }; return [row.id, getSessionEpoch?.() === epoch ? outcome : markSessionChanged(outcome)] as const; }));
      setRows((previous) => previous.map((row) => {
        const outcome = byId.get(row.id);
        if (!outcome) return row;
        if (outcome.kind === "accepted") return outcome.entryCount === 0 ? { ...row, state: "staged", reason: "Review the recording before grading." } : { ...row, state: "queued", reason: undefined };
        if (outcome.kind === "staged") return { ...row, state: "staged", reason: undefined };
        if (outcome.kind === "identity") return { ...row, state: "identity", reason: outcome.reason };
        if (outcome.kind === "refused") return { ...row, state: "refused", reason: outcome.reason };
        return { ...row, state: "uncertain", reason: outcome.reason };
      }));
    } catch {
      if (alive.current && latch.generation === token) setRows((previous) => previous.map((row) => batch.some((entry) => entry.id === row.id)
        ? { ...row, state: "uncertain", reason: "The submission status could not be confirmed. Check results before retrying." }
        : row));
    } finally { if (releaseIntake(latch, token) && alive.current) { activeRows.current = null; setPending(false); } }
  }

  async function gradeAssigned(batch: Row[] = assigned) {
    if (busy || latch.busy || batch.length === 0) return;
    const token = claimIntake(latch); if (token === null) return; activeRows.current = new Set(batch.map((row) => row.id)); setPending(true); setError(null);
    const epoch = getSessionEpoch?.();
    try {
      const outcomes = reviewFiles ? await onMany(batch.map((row) => row.file)) : await submitAssignedFiles(batch.map((row) => row.file), batch.map((row) => row.assigned ?? ""), onOne, () => alive.current && getSessionEpoch?.() === epoch);
      if (!alive.current || latch.generation !== token) return;
      const byId = new Map(batch.map((row, index) => { const outcome = outcomes[index] ?? { kind: "unknown" as const, reason: "The upload status could not be confirmed. Check results before retrying." }; return [row.id, getSessionEpoch?.() === epoch ? outcome : markSessionChanged(outcome)] as const; }));
      setRows((previous) => previous.map((row) => {
        const outcome = byId.get(row.id);
        if (!outcome) return row;
        if (outcome.kind === "accepted") return outcome.entryCount === 0 ? { ...row, state: "staged", reason: "Review the recording before grading." } : { ...row, state: "queued", reason: undefined };
        if (outcome.kind === "staged") return { ...row, state: "staged", reason: undefined };
        if (outcome.kind === "refused" || outcome.kind === "identity") return { ...row, state: "identity", reason: outcome.reason };
        return { ...row, state: "uncertain", reason: outcome.reason };
      }));
    } catch {
      if (alive.current && latch.generation === token) setRows((previous) => previous.map((row) => batch.some((entry) => entry.id === row.id)
        ? { ...row, state: "uncertain", reason: "The submission status could not be confirmed. Check results before retrying." }
        : row));
    } finally { if (releaseIntake(latch, token) && alive.current) { activeRows.current = null; setPending(false); } }
  }

  return (
    <Box component="section" aria-label="Add submissions" sx={{ border: "1px solid var(--field-border)", borderRadius: "var(--radius-md)", p: 2, display: "grid", gap: 1 }}>
      <Typography variant="subtitle1">Add submissions</Typography>
      <FormControl disabled={busy}>
        <FormLabel id="submission-file-mode">Who is the work for?</FormLabel>
        <RadioGroup row aria-labelledby="submission-file-mode" value={mode} onChange={(_, value) => setMode(value as "one" | "many")}>
          <FormControlLabel value="one" control={<Radio size="small" />} label="One student" />
          <FormControlLabel value="many" control={<Radio size="small" />} label="Multiple students" />
        </RadioGroup>
      </FormControl>
      {mode === "one" ? <TextField size="small" label="Student name (optional)" value={student} disabled={busy} onChange={(event) => setStudent(event.target.value)} /> :
        <Typography variant="body2">Assign files to students before grading. A ZIP can contain several students.</Typography>}
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" }, gap: 1 }}>
        <Box onDragOver={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); event.stopPropagation(); }} onDrop={drop}
          sx={{ border: "1px dashed var(--field-border)", borderRadius: "var(--radius-sm)", p: 1.5 }}>
          <Typography variant="body2">Drop files here, or choose files. Preparation starts immediately.</Typography>
          <input ref={picker} type="file" multiple hidden onChange={pick} disabled={busy} />
          <Button size="small" variant="outlined" disabled={busy} onClick={() => picker.current?.click()}>Choose files</Button>
        </Box>
        <Box sx={{ display: "grid", gap: 1, alignContent: "start" }}>
          <TextField label="Submission text" placeholder="Paste a student's submission" multiline minRows={3} fullWidth value={submissionText} disabled={busy} onChange={(event) => setSubmissionText(event.target.value)} />
          {mode === "many" && <TextField size="small" label="Student for this text" value={textStudent} disabled={busy} onChange={(event) => setTextStudent(event.target.value)} helperText="Submit each student's text separately." />}
          <Box><Button size="small" variant="outlined" disabled={busy || textUncertain || !submissionText.trim() || (mode === "many" && !textStudent.trim())} onClick={() => void gradeText()}>Grade text</Button></Box>
        </Box>
      </Box>
      <Typography variant="body2">Text and files are graded separately. To combine them, open More submission options and choose Combine parts.</Typography>
      {textUncertain && <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => setTextUncertain(false)}>I checked results</Button>}>Check the previous results before retrying this text.</Alert>}
      {error && <Alert severity="warning">{error}</Alert>}
      {rows.some((row) => row.state === "identity") && <Alert severity="info">Assign students to files from any drop. All assigned files with the same name will be graded together when you select Grade assigned files; submit students with identical names separately.</Alert>}
      {suggestions.some(Boolean) && <Alert severity="info">Suggested groups are based on filenames and may combine different students or split one submission. Review the files in each group. To correct a group, enter student names below and use Grade assigned files.</Alert>}
      {suggestedGroups.length > 0 && <Button variant="outlined" disabled={busy} onClick={() => void gradeAssigned(suggestedGroups.flatMap((group) => group.files.map((row) => ({ ...row, assigned: group.name }))))}>Accept and grade all reviewed groups</Button>}
      {suggestedGroups.map((group) => <Box key={group.name} sx={{ border: "1px solid var(--field-border)", borderRadius: "var(--radius-sm)", p: 1 }}><Typography variant="body2">Suggested: {group.name}</Typography><Typography variant="body2">{group.files.map((row) => row.file.name).join(", ")}</Typography><Button size="small" disabled={busy} onClick={() => void gradeAssigned(group.files.map((row) => ({ ...row, assigned: group.name })))}>Accept and grade this group</Button></Box>)}
      {queuedRows.length > 0 && <Accordion disableGutters elevation={0}>
        <AccordionSummary expandIcon={<span aria-hidden="true">+</span>}>{`Queued: ${queuedRows.length} ${queuedRows.length === 1 ? "file" : "files"}`}</AccordionSummary>
        <AccordionDetails><Box component="ul" sx={{ m: 0, pl: 3 }}>{queuedRows.map((row) => <li key={row.id}><Typography variant="body2">{row.file.name}</Typography></li>)}</Box></AccordionDetails>
      </Accordion>}
      {attentionRows.length > 0 && <Box component="ul" sx={{ m: 0, pl: 3 }}>
        {attentionRows.map((row) => <li key={row.id}><Typography component="span" variant="body2">{`${row.file.name}: ${row.state === "ready" ? "Ready" : row.state === "staged" ? "Awaiting review" : row.state === "refused" ? "Not submitted" : row.state === "identity" ? "Student needed" : "Needs review"}${row.reason ? ` - ${row.reason}` : ""}`}</Typography>
          {row.state === "identity" && suggestions[suggestedRows.findIndex((entry) => entry.id === row.id)] && <Typography variant="body2">Suggested student: {suggestions[suggestedRows.findIndex((entry) => entry.id === row.id)]}</Typography>}
          {row.state === "identity" && <TextField size="small" label={`Student for ${row.file.name}`} value={row.assigned ?? ""} disabled={busy} onChange={(event) => { const value = event.target.value; setRows((previous) => previous.map((item) => item.id === row.id ? { ...item, assigned: value } : item)); }} />}</li>)}
      </Box>}
      {unresolved && <Alert severity="warning">Some uploads were partly queued or could not be confirmed. Check the results before resubmitting them.</Alert>}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {pending && <Typography role="status" variant="body2">Preparing submission...</Typography>}
        {assigned.length > 0 && <Button variant="outlined" disabled={busy} onClick={() => void gradeAssigned()}>Grade assigned files</Button>}
        {!pending && ready.length > 0 && <Button variant="outlined" disabled={busy || (!reviewFiles && mode === "one" && (unresolved || ready.length > 12))} onClick={() => void grade(ready, mode, student)}>Retry unsubmitted files</Button>}
        {rows.length > 0 && <Button disabled={busy} onClick={() => setClearing(true)}>Clear list</Button>}
      </Box>
      <Dialog open={clearing} onClose={() => setClearing(false)} aria-labelledby="clear-submission-files-title">
        <DialogTitle id="clear-submission-files-title">Clear this file list?</DialogTitle>
        <DialogContent>Files that were not submitted or could not be confirmed will be removed from this list. Check results before submitting them again.</DialogContent>
        <DialogActions><Button onClick={() => setClearing(false)}>Keep files</Button><Button color="warning" onClick={() => { setRows([]); setStudent(""); setError(null); setClearing(false); }}>Clear list</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
