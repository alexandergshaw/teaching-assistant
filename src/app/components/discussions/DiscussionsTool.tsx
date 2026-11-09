"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { generateDiscussionTemplateAction } from "@/app/actions/discussions-tool";
import { listDiscussionRostersAction } from "@/app/actions/discussion-rosters";
import { discussionRosterNames } from "@/lib/discussion-rosters";
import { defaultDiscussionPrompt, detectDiscussionRosterExport, discussionDraftKey, discussionRosterProblem, discussionRosterWarnings, discussionTemplateProblem, parseDiscussionRoster, personalizeDiscussionReply, readDiscussionDraft, writeDiscussionDraft } from "@/lib/discussions-tool";
import { writeClipboardText } from "../ui/clipboard";
import { useSupabase } from "@/context/SupabaseProvider";
import DiscussionClassFilters from "./DiscussionClassFilters";

type ReplyRow = { name: string; reply: string; key: string };
type ClassRoster = { id: string; name: string; roster: string | null; courseCode: string | null; term: string | null; institution: string | null };
const courseDescription = (course: ClassRoster) => [course.name, course.courseCode, course.term, course.institution].filter(Boolean).join(" - ");

export default function DiscussionsTool() {
  const { user, loading } = useSupabase();
  if (loading) return <Alert severity="info" role="status">Loading your session...</Alert>;
  return <DiscussionsSession key={user?.id ?? "signed-out"} userId={user?.id ?? null} />;
}

function DiscussionsSession({ userId }: { userId: string | null }) {
  const [courses, setCourses] = useState<ClassRoster[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(Boolean(userId));
  const [coursesError, setCoursesError] = useState("");
  const [responseCourse, setResponseCourse] = useState("");
  const [responseSource, setResponseSource] = useState<string | null>(null);
  const [pendingUse, setPendingUse] = useState<{ course: ClassRoster; revision: number } | null>(null);
  const [discussion, setDiscussion] = useState("");
  const [roster, setRoster] = useState("");
  const [promptOverride, setPromptOverride] = useState<string | null>(null);
  const [overrideDiscussion, setOverrideDiscussion] = useState("");
  const [template, setTemplate] = useState("");
  const [generatedFromDiscussion, setGeneratedFromDiscussion] = useState<string | null>(null);
  const [rows, setRows] = useState<ReplyRow[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileReading, setFileReading] = useState(false);
  const [templateReviewed, setTemplateReviewed] = useState(false);
  const [rosterReviewed, setRosterReviewed] = useState(false);
  const [copyStatus, setCopyStatus] = useState<{ key: string; reply: string; text: string } | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const [confirmReplacement, setConfirmReplacement] = useState(false);
  const lock = useRef(false);
  const courseDataRevision = useRef(0);
  const rosterRevision = useRef(0);
  const fileReadLock = useRef(false);
  const draftKey = discussionDraftKey(userId);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void listDiscussionRostersAction().then((result) => {
      if (!active) return;
      if ("error" in result) setCoursesError(result.error);
      else setCourses(result.rosters);
    }).catch(() => { if (active) setCoursesError("Could not load class rosters."); })
      .finally(() => { if (active) setCoursesLoading(false); });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const d = readDiscussionDraft(localStorage, userId);
        if (d) { setDiscussion(d.discussion); setRoster(d.roster); setPromptOverride(d.promptOverride); setOverrideDiscussion(d.overrideDiscussion); setTemplate(d.template); setGeneratedFromDiscussion(d.generatedFromDiscussion); }
      } catch { setStorageFailed(true); }
      setDraftReady(true);
    });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!draftReady || !draftKey || storageFailed) return;
    try { writeDiscussionDraft(localStorage, userId, { discussion, roster, promptOverride, overrideDiscussion, template, generatedFromDiscussion }); }
    catch { queueMicrotask(() => setStorageFailed(true)); }
  }, [draftReady, draftKey, userId, storageFailed, discussion, roster, promptOverride, overrideDiscussion, template, generatedFromDiscussion]);
  const prompt = promptOverride ?? defaultDiscussionPrompt(discussion);
  const promptStale = promptOverride !== null && overrideDiscussion !== discussion;
  const names = useMemo(() => parseDiscussionRoster(roster), [roster]);
  const rosterWarnings = useMemo(() => discussionRosterWarnings(names), [names]);
  const rosterExport = useMemo(() => detectDiscussionRosterExport(roster), [roster]);
  const templateProblem = template.trim() ? discussionTemplateProblem(template) : null;
  const visible = useMemo(() => rows.filter((row) => `${row.name}\n${row.reply}`.toLowerCase().includes(search.trim().toLowerCase())), [rows, search]);
  const courseLabel = (course: ClassRoster) => {
    const description = courseDescription(course);
    return courses.some((other) => other.id !== course.id && courseDescription(other) === description) ? `${description} (${course.id})` : description;
  };
  const generateTemplate = async (): Promise<string | null> => {
    if (promptStale) { setError("The discussion prompt changed. Update or reset the model prompt before generating a template."); return null; }
    if (!discussion.trim() || !prompt.trim()) { setError("Enter the discussion prompt and model prompt first."); return null; }
    const result = await generateDiscussionTemplateAction(prompt);
    if ("error" in result) { setError(result.error); return null; }
    setTemplate(result.template); setGeneratedFromDiscussion(discussion); setRows([]); setTemplateReviewed(false);
    return result.template;
  };
  const run = async (onlyTemplate: boolean) => {
    if (lock.current) return;
    if (fileReadLock.current) { setError("Wait for the roster file to finish loading."); return; }
    if (!discussion.trim()) { setError("Enter the discussion prompt."); return; }
    if (!onlyTemplate && generatedFromDiscussion !== null && generatedFromDiscussion !== discussion) { setError("The discussion prompt changed. Regenerate or edit the reply template first."); return; }
    const rosterProblem = onlyTemplate ? null : discussionRosterProblem(roster, rosterReviewed);
    if (rosterProblem) { setError(rosterProblem); return; }
    if (!onlyTemplate && template.trim()) {
      if (templateProblem) { setError(templateProblem); return; }
      if (!templateReviewed) { setError("Review and confirm the reply template first."); return; }
    }
    rosterRevision.current++; lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const source = onlyTemplate || !template.trim() ? await generateTemplate() : template;
      if (!source) return;
      if (!onlyTemplate && !template.trim()) { setNotice("Review the generated template before creating replies."); return; }
      if (!onlyTemplate) { setRows(names.map((name, index) => ({ name, reply: personalizeDiscussionReply(source, name), key: `${index}` }))); setSearch(""); }
    } catch { setError("Could not generate replies. Try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  const copy = async (row: ReplyRow) => {
    try { await writeClipboardText(row.reply); setCopyStatus({ key: row.key, reply: row.reply, text: "Copied" }); }
    catch { setCopyStatus({ key: row.key, reply: row.reply, text: "Copy failed. Select and copy the reply." }); }
  };
  const applyCourse = (course: ClassRoster) => {
    const parsed = discussionRosterNames(course.roster);
    if ("error" in parsed) { setError(parsed.error); return; }
    rosterRevision.current++; setRoster(parsed.names.join("\n")); setResponseCourse(course.id); setResponseSource(course.roster); setRows([]); setRosterReviewed(false); setError("");
  };
  const retryCourses = async () => {
    const revision = rosterRevision.current;
    const courseRevision = ++courseDataRevision.current;
    setCoursesLoading(true); setCoursesError("");
    try {
      const result = await listDiscussionRostersAction();
      if (courseRevision !== courseDataRevision.current) return;
      if ("error" in result) setCoursesError(result.error);
      else {
        setCourses(result.rosters);
        if (revision === rosterRevision.current && responseCourse && result.rosters.find((course) => course.id === responseCourse)?.roster !== responseSource) {
          setResponseCourse(""); setNotice("The class roster changed. Your current names and replies are unchanged; select the class again to use the updated names.");
        }
      }
    } catch { if (courseRevision === courseDataRevision.current) setCoursesError("Could not load class rosters."); }
    finally { if (courseRevision === courseDataRevision.current) setCoursesLoading(false); }
  };
  if (!draftReady) return <Alert severity="info" role="status">Loading your discussion draft...</Alert>;
  return <Stack spacing={2}>
    <Box><Typography variant="h5" component="h1">Discussions</Typography><Typography>Make one generic reply for each student. The reply uses their name but does not assume what they posted.</Typography></Box>
    {coursesError && <Alert severity="error" onClose={() => setCoursesError("")}>{coursesError} <Button size="small" onClick={() => void retryCourses()} disabled={coursesLoading}>Retry loading classes</Button></Alert>}
    <Typography variant="body2">{draftKey ? "Draft inputs are saved on this browser for your account. Generated replies and review confirmations are not saved." : "Sign in to save your draft on this browser."} Changing an input clears the generated replies; you can generate them again.</Typography>
    {storageFailed && <Alert severity="warning">Draft storage is unavailable. Your inputs may be lost if you leave this page.</Alert>}
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}
    <TextField label="Discussion prompt" multiline minRows={5} fullWidth value={discussion} disabled={busy} onChange={(event) => { setDiscussion(event.target.value); setRows([]); }} />
    {!userId && <Alert severity="info">Sign in to use your saved class rosters.</Alert>}
    {coursesLoading && <Typography role="status">Loading class rosters...</Typography>}
    {userId && !coursesLoading && !coursesError && courses.length === 0 && <Alert severity="info">No classes found. Add a class in Courses first.</Alert>}
    {userId && <Button size="small" onClick={() => void retryCourses()} disabled={busy || coursesLoading} sx={{ alignSelf: "flex-start" }}>Refresh classes</Button>}
    {courses.length > 0 && <Box><Typography>Use a class roster</Typography><DiscussionClassFilters courses={courses} selectedId={responseCourse} disabled={busy || fileReading} onSelect={(id) => { if (fileReadLock.current) return; const course = courses.find((item) => item.id === id); if (!course || responseCourse === id) return; if (roster.trim()) setPendingUse({ course, revision: rosterRevision.current }); else applyCourse(course); }} />{responseCourse && courses.find((course) => course.id === responseCourse) && <Typography variant="body2">Selected: {courseLabel(courses.find((course) => course.id === responseCourse)!)}</Typography>}</Box>}
    <TextField label="Class roster" helperText="Paste one student name per line or a labeled CSV/TSV roster. Names stay in your browser." multiline minRows={4} fullWidth value={roster} disabled={busy} onChange={(event) => { rosterRevision.current++; setRoster(event.target.value); setResponseCourse(""); setRows([]); setRosterReviewed(false); }} />
    <Button component="label" variant="outlined" disabled={busy || fileReading} sx={{ alignSelf: "flex-start" }}>Choose roster file<input type="file" accept=".txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values" hidden disabled={busy || fileReading} onChange={async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file || fileReadLock.current) return; const revision = ++rosterRevision.current; if (file.size > 1024 * 1024) { setError("Choose a roster file no larger than 1 MB."); return; } fileReadLock.current = true; setFileReading(true); try { const text = await file.text(); if (revision !== rosterRevision.current) return; rosterRevision.current++; setRoster(text); setResponseCourse(""); setRows([]); setRosterReviewed(false); setError(""); } catch { if (revision === rosterRevision.current) setError("Could not read the roster file."); } finally { fileReadLock.current = false; setFileReading(false); } }} /></Button>
    {fileReading && <Typography role="status">Reading roster file...</Typography>}
    {rosterExport && <Alert severity="info"><Typography>Detected {rosterExport.length} names. Review them before using this import:</Typography><Typography sx={{ whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto" }}>{rosterExport.join("\n")}</Typography><Button onClick={() => { rosterRevision.current++; setRoster(rosterExport.join("\n")); setResponseCourse(""); setRows([]); setRosterReviewed(false); }} disabled={busy}>Use these names</Button></Alert>}
    {rosterWarnings.length > 0 && <Alert severity="warning">{rosterWarnings.map((warning) => <div key={warning}>{warning}</div>)}<FormControlLabel control={<Checkbox checked={rosterReviewed} onChange={(event) => { setRosterReviewed(event.target.checked); if (!event.target.checked) setRows([]); }} disabled={busy} />} label="I checked the roster lines and duplicates" /></Alert>}
    <Accordion><AccordionSummary expandIcon={<span aria-hidden="true">+</span>}><Typography>Model prompt {promptOverride !== null ? "(edited)" : ""}</Typography></AccordionSummary><AccordionDetails><Stack spacing={1}><TextField label="Prompt sent to the model" helperText="Edit this prompt when generating a template. The roster is not included." multiline minRows={5} fullWidth value={prompt} disabled={busy} onChange={(event) => { setPromptOverride(event.target.value); setOverrideDiscussion(discussion); setRows([]); }} /><Button size="small" onClick={() => { setPromptOverride(null); setRows([]); }} disabled={busy || promptOverride === null}>Reset model prompt</Button></Stack></AccordionDetails></Accordion>
    {promptStale && <Alert severity="warning">The discussion prompt changed. Open and update or reset the model prompt before generating a template.</Alert>}
    <TextField label="Reply template" helperText="Paste a generic reply or generate one. Use {{name}} where the student name belongs." multiline minRows={4} fullWidth value={template} disabled={busy} onChange={(event) => { setTemplate(event.target.value); setGeneratedFromDiscussion(null); setRows([]); setTemplateReviewed(false); }} />
    {templateProblem && <Alert severity="warning">{templateProblem}</Alert>}
    {template.trim() && !templateProblem && <Box><Typography variant="subtitle2">Reply preview for {names[0] || "Student"}</Typography><Typography sx={{ whiteSpace: "pre-wrap" }}>{personalizeDiscussionReply(template, names[0] || "Student")}</Typography><FormControlLabel control={<Checkbox checked={templateReviewed} onChange={(event) => { setTemplateReviewed(event.target.checked); if (!event.target.checked) setRows([]); }} disabled={busy} />} label="I checked the template is generic and contains no other student's name" /></Box>}
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}><Button variant="outlined" onClick={() => { if (template.trim()) setConfirmReplacement(true); else void run(true); }} disabled={busy || fileReading}>Generate template</Button><Button variant="contained" onClick={() => void run(false)} disabled={busy || fileReading}>{busy ? "Generating..." : "Generate replies"}</Button></Stack>
    <Dialog open={confirmReplacement} onClose={() => setConfirmReplacement(false)} aria-labelledby="replace-template-title"><DialogTitle id="replace-template-title">Replace the reply template?</DialogTitle><DialogContent>A new template will replace the current text and clear any generated replies. Your current template stays if generation fails.</DialogContent><DialogActions><Button onClick={() => setConfirmReplacement(false)}>Cancel</Button><Button onClick={() => { setConfirmReplacement(false); void run(true); }} variant="contained">Generate replacement</Button></DialogActions></Dialog>
    {rows.length > 0 && <Box><TextField label="Search replies" fullWidth size="small" value={search} onChange={(event) => setSearch(event.target.value)} /><TableContainer component={Paper} sx={{ mt: 1 }}><Table size="small"><TableHead><TableRow><TableCell>Student</TableCell><TableCell>Reply</TableCell><TableCell>Copy</TableCell></TableRow></TableHead><TableBody>{visible.map((row) => <TableRow key={row.key}><TableCell>{row.name}</TableCell><TableCell sx={{ whiteSpace: "pre-wrap" }}>{row.reply}</TableCell><TableCell><Button onClick={() => void copy(row)} aria-label={`Copy reply for ${row.name}`}>Copy</Button>{copyStatus?.key === row.key && copyStatus.reply === row.reply && <Typography role="status" variant="caption">{copyStatus.text}</Typography>}</TableCell></TableRow>)}</TableBody></Table></TableContainer><Typography role="status">{visible.length} of {rows.length} replies shown</Typography></Box>}
    <Dialog open={Boolean(pendingUse)} onClose={() => setPendingUse(null)} aria-labelledby="replace-response-roster-title"><DialogTitle id="replace-response-roster-title">Replace the current response roster?</DialogTitle><DialogContent>The current names and generated replies will be replaced by the selected class roster.</DialogContent><DialogActions><Button onClick={() => setPendingUse(null)}>Cancel</Button><Button variant="contained" onClick={() => { if (pendingUse) { const current = courses.find((course) => course.id === pendingUse.course.id); if (pendingUse.revision !== rosterRevision.current) setError("Your roster changed. Select the class again to review the replacement."); else if (!current || current.roster !== pendingUse.course.roster) setError("The class roster changed. Select it again to review the updated names."); else applyCourse(current); } setPendingUse(null); }}>Use class roster</Button></DialogActions></Dialog>

  </Stack>;
}
