"use client";

import { useMemo, useRef, useState } from "react";
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { generateDiscussionTemplateAction } from "@/app/actions/discussions-tool";
import { defaultDiscussionPrompt, parseDiscussionRoster, personalizeDiscussionReply } from "@/lib/discussions-tool";
import { writeClipboardText } from "../ui/clipboard";
import { useSupabase } from "@/context/SupabaseProvider";

type ReplyRow = { name: string; reply: string; key: string };

export default function DiscussionsTool() {
  const { user, loading } = useSupabase();
  return <DiscussionsSession key={loading ? "loading" : user?.id ?? "signed-out"} />;
}

function DiscussionsSession() {
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
  const lock = useRef(false);
  const prompt = promptOverride ?? defaultDiscussionPrompt(discussion);
  const promptStale = promptOverride !== null && overrideDiscussion !== discussion;
  const visible = useMemo(() => rows.filter((row) => `${row.name}\n${row.reply}`.toLowerCase().includes(search.trim().toLowerCase())), [rows, search]);
  const generateTemplate = async (): Promise<string | null> => {
    if (promptStale) { setError("The discussion prompt changed. Update or reset the model prompt before generating a template."); return null; }
    if (!discussion.trim() || !prompt.trim()) { setError("Enter the discussion prompt and model prompt first."); return null; }
    const result = await generateDiscussionTemplateAction(prompt);
    if ("error" in result) { setError(result.error); return null; }
    setTemplate(result.template); setGeneratedFromDiscussion(discussion); setRows([]);
    return result.template;
  };
  const run = async (onlyTemplate: boolean) => {
    if (lock.current) return;
    const names = parseDiscussionRoster(roster);
    if (!discussion.trim()) { setError("Enter the discussion prompt."); return; }
    if (!onlyTemplate && generatedFromDiscussion !== null && generatedFromDiscussion !== discussion) { setError("The discussion prompt changed. Regenerate or edit the reply template first."); return; }
    if (!onlyTemplate && names.length === 0) { setError("Add at least one student to the roster."); return; }
    if (names.length > 1000) { setError("Use at most 1,000 roster lines per run."); return; }
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const source = onlyTemplate || !template.trim() ? await generateTemplate() : template;
      if (!source) return;
      if (!onlyTemplate) { setRows(names.map((name, index) => ({ name, reply: personalizeDiscussionReply(source, name), key: `${index}` }))); setSearch(""); }
    } catch { setError("Could not generate replies. Try again."); }
    finally { lock.current = false; setBusy(false); }
  };
  const copy = async (row: ReplyRow) => {
    try { await writeClipboardText(row.reply); setNotice(`Copied reply for ${row.name}.`); }
    catch { setError("Could not copy. Select the reply text and copy it manually."); }
  };
  return <Stack spacing={2}>
    <Box><Typography variant="h5" component="h1">Discussions</Typography><Typography>Make one generic reply for each student. The reply uses their name but does not assume what they posted.</Typography></Box>
    {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
    {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}
    <TextField label="Discussion prompt" multiline minRows={7} fullWidth value={discussion} disabled={busy} onChange={(event) => { setDiscussion(event.target.value); setRows([]); }} />
    <TextField label="Class roster" helperText="Paste one student name per line. Names stay in your browser." multiline minRows={6} fullWidth value={roster} disabled={busy} onChange={(event) => { setRoster(event.target.value); setRows([]); }} />
    <TextField label="Prompt sent to the model" helperText="Edit this prompt when generating a template. The roster is not included." multiline minRows={6} fullWidth value={prompt} disabled={busy} onChange={(event) => { setPromptOverride(event.target.value); setOverrideDiscussion(discussion); setRows([]); }} />
    {promptStale && <Alert severity="warning">The discussion prompt changed. Update or reset the model prompt before generating a template.</Alert>}
    <Button size="small" onClick={() => { setPromptOverride(null); setRows([]); }} disabled={busy || promptOverride === null}>Reset model prompt</Button>
    <TextField label="Reply template" helperText="Paste a generic reply or generate one. Use {{name}} where the student name belongs." multiline minRows={6} fullWidth value={template} disabled={busy} onChange={(event) => { setTemplate(event.target.value); setGeneratedFromDiscussion(null); setRows([]); }} />
    <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}><Button variant="outlined" onClick={() => void run(true)} disabled={busy}>Generate template</Button><Button variant="contained" onClick={() => void run(false)} disabled={busy}>{busy ? "Generating..." : "Generate replies"}</Button></Stack>
    {rows.length > 0 && <Box><TextField label="Search replies" fullWidth size="small" value={search} onChange={(event) => setSearch(event.target.value)} /><TableContainer component={Paper} sx={{ mt: 1 }}><Table size="small"><TableHead><TableRow><TableCell>Student</TableCell><TableCell>Reply</TableCell><TableCell>Copy</TableCell></TableRow></TableHead><TableBody>{visible.map((row) => <TableRow key={row.key}><TableCell>{row.name}</TableCell><TableCell sx={{ whiteSpace: "pre-wrap" }}>{row.reply}</TableCell><TableCell><Button onClick={() => void copy(row)} aria-label={`Copy reply for ${row.name}`}>Copy</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer><Typography role="status">{visible.length} of {rows.length} replies shown</Typography></Box>}
  </Stack>;
}
