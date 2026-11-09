"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Alert from "@mui/material/Alert";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
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
import { hasSubmissionContent, isPastedDiscussionListing, parsePastedSubmissions } from "./pastedSubmissions";
import { hasDiscussionResponseContent } from "./discussionListing";
import { CHAT_LABEL_MAX_CHARS } from "./chatSubmissionIntake";
import { buildReviewedDiscussionGroups } from "@/lib/grade/reviewed-discussion-groups";
import type { ReviewedPastedDiscussion } from "@/lib/grade/reviewed-pasted-discussion";
import { getGeminiMaxCharsPerSubmission } from "@/lib/gemini";

type State = "ready" | "refused" | "identity" | "queued" | "staged" | "uncertain";
interface Row { id: number; file: File; state: State; reason?: string; assigned?: string }
interface TextRow { student: string; content: string; state: "ready" | "queued" | "refused" | "uncertain"; reason?: string; reviewed?: boolean; group?: string; role?: "initial" | "reply" | "unassigned" }

export function reconcileRowAfterReset(row: Row): Row {
  if (row.state !== "queued" && row.state !== "staged") return row;
  return { ...row, state: "uncertain", reason: "The session changed. Check the previous results before retrying." };
}
/** File intake stays visible while text, URL, and composite tools remain available. */
export function SubmissionDrop({ disabled, sharedLatch, reviewFiles = false, getSessionEpoch, sessionEpoch, onOne, onMany, onText, onReviewed }: {
  disabled: boolean;
  sharedLatch?: IntakeFence;
  reviewFiles?: boolean;
  getSessionEpoch?: () => number;
  sessionEpoch?: number;
  onOne: (student: string, files: File[]) => Promise<DirectFileOutcome>;
  onMany: (files: File[]) => Promise<DirectFileOutcome[]>;
  onText: (student: string, content: string) => Promise<SubmitOutcome>;
  onReviewed?: (student: string, content: string, discussion: ReviewedPastedDiscussion) => Promise<SubmitOutcome>;
}) {
  const [mode, setMode] = useState<"one" | "many">("one");
  const [student, setStudent] = useState("");
  const [textStudent, setTextStudent] = useState("");
  const [submissionText, setSubmissionText] = useState("");
  const [textRows, setTextRows] = useState<TextRow[]>([]);
  const [textRowsEdited, setTextRowsEdited] = useState(false);
  const [axesMode, setAxesMode] = useState(false);
  const [groupingConfirmed, setGroupingConfirmed] = useState(false);
  const [sourceComplete, setSourceComplete] = useState(false);
  const [attachmentsAccounted, setAttachmentsAccounted] = useState(false);
  const textRowsEditedRef = useRef(false);
  const activeTextRow = useRef<number | null>(null);
  const activeTextGroup = useRef<string | null>(null);
  const [textUncertain, setTextUncertain] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearingText, setClearingText] = useState(false);
  const [combineName, setCombineName] = useState<string | null>(null);
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
    invalidateDiscussionReview();
    if (!sharedLatch) resetIntake(localLatch);
    if (textPending.current) setTextUncertain(true);
    const textIndex = activeTextRow.current;
    const textGroup = activeTextGroup.current;
    setTextRows((previous) => previous.map((row, i) => i === textIndex || (textGroup !== null && row.group?.trim() === textGroup) || row.state === "queued" ? { ...row, state: "uncertain", reason: "The session changed. Check results before retrying." } : row));
    activeTextRow.current = null;
    activeTextGroup.current = null;
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
  const isDiscussionListing = mode === "many" && isPastedDiscussionListing(submissionText);
  const duplicateNames = textRows.filter((row, index) => row.student.trim() && textRows.findIndex((other) => other.student.trim().normalize("NFKC").toLocaleLowerCase() === row.student.trim().normalize("NFKC").toLocaleLowerCase()) !== index).map((row) => row.student.trim());

  function invalidateDiscussionReview() { setGroupingConfirmed(false); setSourceComplete(false); setAttachmentsAccounted(false); }

  function changeText(value: string) {
    invalidateDiscussionReview();
    setSubmissionText(value);
    setTextRows(mode === "many" ? parsePastedSubmissions(value).map((row) => ({ ...row, state: "ready" })) : []);
  }

  async function gradeTextRows() {
    if (busy || latch.busy || textRows.some((row) => row.state === "uncertain") || !textRows.some((row) => row.state === "ready" || row.state === "refused")) return;
    if (textRows.some((row) => (row.state === "ready" || row.state === "refused") && (!row.student.trim() || !hasSubmissionContent(row.content)))) { setError("Add a student name and submission text beyond the heading for every entry before grading."); return; }
    if (isDiscussionListing && textRows.some((row) => (row.state === "ready" || row.state === "refused") && (!row.reviewed || !hasDiscussionResponseContent(row.content)))) { setError("Confirm each author and response, remove page controls, and include response text beyond the dated header before grading."); return; }
    if (textRows.some((row) => row.student.trim().length > CHAT_LABEL_MAX_CHARS)) { setError(`Student names must be at most ${CHAT_LABEL_MAX_CHARS} characters. Shorten the name before grading.`); return; }
    const names = textRows.map((row) => row.student.trim().normalize("NFKC").toLocaleLowerCase());
    if (new Set(names).size !== names.length) { setError("Use a distinct student name for each submission before grading."); return; }
    const token = claimIntake(latch); if (token === null) return; textRowsEditedRef.current = true; setTextRowsEdited(true);
    const epoch = getSessionEpoch?.(); setPending(true); setError(null);
    try {
      for (let index = 0; index < textRows.length; index++) {
        const row = textRows[index];
        if (row.state !== "ready" && row.state !== "refused") continue;
        activeTextRow.current = index;
        let outcome: SubmitOutcome;
        try { outcome = await onText(row.student.trim(), row.content); }
        catch { outcome = { kind: "partial", dispatchedCount: 0, refusedCount: 1, reason: "The submission status could not be confirmed." }; }
        if (!alive.current || latch.generation !== token) return;
        const changed = getSessionEpoch?.() !== epoch;
        const accepted = !changed && outcome.kind === "accepted" && outcome.entryCount === 1;
        const refused = !changed && outcome.kind === "refused";
        setTextRows((previous) => previous.map((item, i) => i === index ? { ...item, state: accepted ? "queued" : refused ? "refused" : "uncertain", reason: accepted ? undefined : refused && "reason" in outcome ? outcome.reason : "Check results before retrying." } : item));
        activeTextRow.current = null;
        if (!accepted) break;
      }
    } finally { if (releaseIntake(latch, token) && alive.current) { activeTextRow.current = null; setPending(false); } }
  }

  async function gradeDiscussionGroups() {
    if (!onReviewed || busy || latch.busy || textRows.some((row) => row.state === "uncertain")) return;
    const pendingRows = textRows.filter((row) => row.state === "ready" || row.state === "refused");
    const groupNames = [...new Set(pendingRows.map((row) => row.group?.trim() ?? ""))];
    const queuedGroups = new Set(textRows.filter((row) => row.state === "queued").map((row) => (row.group ?? "").trim().normalize("NFKC").toLocaleLowerCase()));
    if (groupNames.some((name) => queuedGroups.has(name.normalize("NFKC").toLocaleLowerCase()))) { setError("A group with this student name was already submitted. Check results before submitting more entries for that student."); return; }
    const built = buildReviewedDiscussionGroups(pendingRows.map((row) => ({ content: row.content, group: row.group?.trim() ?? "", role: row.role ?? "unassigned", authorConfirmed: row.reviewed === true })), groupNames.map((name) => ({ id: name, student: name, samePersonConfirmed: groupingConfirmed, sourceCompleteConfirmed: sourceComplete, attachmentsAccountedFor: attachmentsAccounted })), getGeminiMaxCharsPerSubmission());
    if (!built.ok || groupNames.some((name) => name.length > CHAT_LABEL_MAX_CHARS)) { setError("Confirm every author, classify and group every entry, confirm completeness and attachments, and include an initial post within the grading limit for each student."); return; }
    const token = claimIntake(latch); if (token === null) return;
    textRowsEditedRef.current = true; setTextRowsEdited(true); setPending(true); setError(null);
    const epoch = getSessionEpoch?.();
    try {
      for (const entry of built.entries) {
        activeTextGroup.current = entry.student;
        let outcome: SubmitOutcome;
        try { outcome = await onReviewed(entry.student, entry.content, entry.reviewedDiscussion); }
        catch { outcome = { kind: "partial", dispatchedCount: 0, refusedCount: 1, reason: "The submission status could not be confirmed." }; }
        if (!alive.current || latch.generation !== token) return;
        const changed = getSessionEpoch?.() !== epoch;
        const accepted = !changed && outcome.kind === "accepted" && outcome.entryCount === 1;
        const refused = !changed && outcome.kind === "refused";
        setTextRows((previous) => previous.map((row) => row.group?.trim() === entry.student && (row.state === "ready" || row.state === "refused") ? { ...row, state: accepted ? "queued" : refused ? "refused" : "uncertain", reason: accepted ? undefined : refused && "reason" in outcome ? outcome.reason : "Check results before retrying." } : row));
        activeTextGroup.current = null;
        if (!accepted) break;
      }
    } finally { if (releaseIntake(latch, token) && alive.current) { activeTextGroup.current = null; setPending(false); } }
  }

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
      <FormControl disabled={busy || textRowsEdited || textRows.some((row) => row.state === "queued" || row.state === "uncertain")}>
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
          <TextField label="Submission text" placeholder={mode === "many" ? "Paste a discussion listing or submissions with Student: names" : "Paste a student's submission"} multiline minRows={mode === "many" ? 6 : 3} fullWidth value={submissionText} disabled={busy || textRowsEdited || textRows.some((row) => row.state === "queued" || row.state === "uncertain")} onChange={(event) => { if (!textRowsEditedRef.current) changeText(event.target.value); }} helperText={textRowsEdited ? "The original paste is locked to preserve your review edits. Clear the text list to start over." : undefined} />
          {isDiscussionListing && <Alert severity="warning">Review the inferred author and complete text for every entry, including any unassigned text. Remove page controls only after checking them. Attachments, hidden or unloaded replies are not included by a text paste. {axesMode ? "Classify and group every entry to grade initial posts and replies separately. Oversized discussions are refused." : "Pasted text is graded as one submission per student; initial posts and replies are not scored as separate discussion axes. Grading length limits may truncate long submissions."}</Alert>}
          {mode === "many" && textRows.length === 0 && <TextField size="small" label="Student for this text" value={textStudent} disabled={busy} onChange={(event) => setTextStudent(event.target.value)} helperText="For multiple students, start each submission with Student: and a name, or separate submissions with --- on its own line." />}
          {mode === "many" && textRows.length > 0 ? <>
            <Alert severity="info">Review each name and submission before grading. Headings are inferred from the pasted text.{isDiscussionListing && " Remove page controls and confirm every author and boundary; quoted lines can resemble a new post."}</Alert>
            {isDiscussionListing && onReviewed && <FormControlLabel control={<Checkbox checked={axesMode} disabled={busy} onChange={(_, checked) => setAxesMode(checked)} />} label="Classify initial posts and replies for separate grading" />}
            {textRows.map((row, index) => <Box key={index} sx={{ display: "grid", gap: 1 }}>
              <TextField size="small" label={`Student ${index + 1}`} value={row.student} disabled={busy || row.state === "queued" || row.state === "uncertain"} onChange={(event) => { if (latch.busy) return; invalidateDiscussionReview(); const value = event.target.value; textRowsEditedRef.current = true; setTextRowsEdited(true); setTextRows((previous) => previous.map((item, i) => i === index && (item.state === "ready" || item.state === "refused") ? { ...item, student: value, reviewed: false } : item)); }} />
              <TextField multiline size="small" label={`Submission ${index + 1}`} value={row.content} disabled={busy || row.state === "queued" || row.state === "uncertain"} onChange={(event) => { if (latch.busy) return; invalidateDiscussionReview(); const value = event.target.value; textRowsEditedRef.current = true; setTextRowsEdited(true); setTextRows((previous) => previous.map((item, i) => i === index && (item.state === "ready" || item.state === "refused") ? { ...item, content: value, reviewed: false } : item)); }} />
              {isDiscussionListing && (row.state === "ready" || row.state === "refused") && <FormControlLabel control={<Checkbox checked={row.reviewed === true} disabled={busy} onChange={(_, checked) => setTextRows((previous) => previous.map((item, i) => i === index ? { ...item, reviewed: checked } : item))} />} label={`I checked author and response ${index + 1}`} />}
              {axesMode && (row.state === "ready" || row.state === "refused") && <><TextField size="small" label={`Student group for entry ${index + 1}`} value={row.group ?? ""} disabled={busy} helperText="Type the same student name only for entries you have verified belong to the same person." onChange={(event) => { invalidateDiscussionReview(); setTextRowsEdited(true); textRowsEditedRef.current = true; const group = event.target.value; setTextRows((previous) => previous.map((item, i) => i === index ? { ...item, group } : item)); }} /><FormControl><FormLabel>{`Entry ${index + 1} type`}</FormLabel><RadioGroup row value={row.role ?? "unassigned"} onChange={(event) => { invalidateDiscussionReview(); setTextRowsEdited(true); textRowsEditedRef.current = true; const role = event.target.value as "initial" | "reply" | "unassigned"; setTextRows((previous) => previous.map((item, i) => i === index ? { ...item, role } : item)); }}><FormControlLabel value="unassigned" control={<Radio />} label="Unassigned" /><FormControlLabel value="initial" control={<Radio />} label="Initial post" /><FormControlLabel value="reply" control={<Radio />} label="Reply" /></RadioGroup></FormControl></>}
              <Typography variant="body2">{row.state === "queued" ? "Queued" : row.state === "uncertain" ? "Needs review" : row.state === "refused" ? "Not submitted" : "Ready"}{row.reason ? ` - ${row.reason}` : ""}</Typography>
              {(row.state === "ready" || row.state === "refused") && <Button size="small" disabled={busy} onClick={() => { if (latch.busy) return; invalidateDiscussionReview(); textRowsEditedRef.current = textRows.length !== 1; if (textRows.length === 1) { setSubmissionText(""); setTextRowsEdited(false); } else setTextRowsEdited(true); setTextRows((previous) => previous.filter((_, i) => i !== index)); }}>Remove this entry</Button>}
              {row.state === "uncertain" && <Button size="small" disabled={busy} onClick={() => setTextRows((previous) => previous.map((item, i) => i === index ? { ...item, state: "refused", reason: undefined } : item))}>I checked results; allow retry</Button>}
            </Box>)}
            {duplicateNames.length > 0 && <Alert severity="warning">Some entries have the same name. Confirm they are the same person and combine them, or correct their names before grading. <Button color="inherit" disabled={busy || textRows.some((row) => row.state === "queued" || row.state === "uncertain")} onClick={() => setCombineName(duplicateNames[0])}>Combine entries</Button></Alert>}
            {axesMode && <><FormControlLabel control={<Checkbox checked={groupingConfirmed} disabled={busy} onChange={(_, checked) => setGroupingConfirmed(checked)} />} label="I verified entries assigned to each group belong to the same person" /><FormControlLabel control={<Checkbox checked={sourceComplete} disabled={busy} onChange={(_, checked) => setSourceComplete(checked)} />} label="I verified all initial posts and replies for these students are included" /><FormControlLabel control={<Checkbox checked={attachmentsAccounted} disabled={busy} onChange={(_, checked) => setAttachmentsAccounted(checked)} />} label="I accounted for any attachments" /></>}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}><Button size="small" variant="outlined" disabled={busy || textRows.some((row) => row.state === "uncertain") || !textRows.some((row) => row.state === "ready" || row.state === "refused")} onClick={() => void (axesMode ? gradeDiscussionGroups() : gradeTextRows())}>Grade reviewed submissions</Button><Button size="small" disabled={busy} onClick={() => setClearingText(true)}>Clear text list</Button></Box>
          </> : <Box><Button size="small" variant="outlined" disabled={busy || textUncertain || !submissionText.trim() || (mode === "many" && !textStudent.trim())} onClick={() => void gradeText()}>Grade text</Button></Box>}
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
      <Dialog open={clearingText} onClose={() => setClearingText(false)} aria-labelledby="clear-text-list-title">
        <DialogTitle id="clear-text-list-title">Clear this text list?</DialogTitle>
        <DialogContent>Check queued and uncertain submissions in the results before submitting them again. Unsubmitted text will be removed.</DialogContent>
        <DialogActions><Button onClick={() => setClearingText(false)}>Keep text</Button><Button color="warning" onClick={() => { invalidateDiscussionReview(); textRowsEditedRef.current = false; setTextRows([]); setTextRowsEdited(false); setSubmissionText(""); setError(null); setClearingText(false); }}>Clear list</Button></DialogActions>
      </Dialog>
      <Dialog open={combineName !== null} onClose={() => setCombineName(null)} aria-labelledby="combine-student-entries-title">
        <DialogTitle id="combine-student-entries-title">Combine entries for {combineName}?</DialogTitle>
        <DialogContent>Only combine these entries if they belong to the same student. The text of every entry will be retained in order. Different students with the same name need distinct labels.</DialogContent>
        <DialogActions><Button onClick={() => setCombineName(null)}>Cancel</Button><Button onClick={() => { if (!combineName || latch.busy) return; invalidateDiscussionReview(); const key = combineName.trim().normalize("NFKC").toLocaleLowerCase(); setTextRows((previous) => { const matches = previous.filter((row) => row.student.trim().normalize("NFKC").toLocaleLowerCase() === key); if (matches.length < 2 || matches.some((row) => row.state !== "ready" && row.state !== "refused")) return previous; let inserted = false; return previous.flatMap((row) => { if (row.student.trim().normalize("NFKC").toLocaleLowerCase() !== key) return [row]; if (inserted) return []; inserted = true; return [{ student: row.student, content: matches.map((item) => item.content).join("\n\n---\n\n"), state: "ready" as const }]; }); }); textRowsEditedRef.current = true; setTextRowsEdited(true); setCombineName(null); }}>Combine</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
