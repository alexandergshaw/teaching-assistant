"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { reviewPresentationRepositoryAction, publishPresentationRepositoryAction, refreshPresentationCopilotTaskAction, startPresentationCopilotTaskAction } from "@/app/actions/presentation-repository";
import type { SnapshotInput } from "@/lib/presentations/repository-snapshot";
import type { RepositoryReceipt } from "@/lib/presentations/repository-publish";
import { recordRepositoryPublication as record, recordCopilotTask, measureCopilotTaskRefresh } from "./repository-diagnostic";
import { copilotTaskState } from "./copilot-task-state";
import { canReconcile, finishPackageReview, persistThenPublish, readReconciliationIntent, reviewIsCurrent, runSingleFlight, type PackageReview, type ReconciliationIntent, type ReviewScope } from "./repository-confirmation";

interface Props { input: SnapshotInput | null; disabled: boolean }
interface SavedReceipt { login: string; fingerprint: string; receipt: RepositoryReceipt }
const STORAGE = "ta-pres-private-repository-receipt";
const INTENT_STORAGE = "ta-pres-private-repository-intent";
const TASKS_STORAGE = "ta-pres-copilot-task-receipts";
const TASK_INTENT_STORAGE = "ta-pres-copilot-task-intent";
const UNAVAILABLE = "Copilot generation is disabled for this deployment. An owner must configure the verified GitHub integration and explicitly enable task dispatch. Publishing a snapshot does not start a task.";
interface CopilotTaskRow { id: string; url: string; state: string; kind: "initial" | "followup"; repoUrl: string; snapshotId: string; baseCommit: string; promptFingerprint: string }
interface CopilotTaskIntent { kind: "initial" | "followup"; repoUrl: string; snapshotId: string; baseCommit: string; promptFingerprint: string; previousTaskId?: string }
async function fingerprintHash(value: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}

export default function PipelineRepositoryPanel({ input, disabled }: Props) {
  const [login, setLogin] = useState("");
  const [name, setName] = useState("");
  const [includeContext, setIncludeContext] = useState(false);
  const [reviewed, setReviewed] = useState<PackageReview | null>(null);
  const [intent, setIntent] = useState<ReconciliationIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const [copilotEnabled, setCopilotEnabled] = useState(false);
  const [tasks, setTasks] = useState<CopilotTaskRow[]>([]);
  const [taskIntent, setTaskIntent] = useState<CopilotTaskIntent | null>(null);
  const [initial, setInitial] = useState("");
  const [followup, setFollowup] = useState("");
  const taskSubmissionLock = useRef(false);
  const request = input ? { ...input, includeContext } : null;
  const fingerprint = JSON.stringify(request);
  const scope: ReviewScope = { snapshotKey: fingerprint, name: name.trim() };
  const latestScope = useRef(scope);
  useLayoutEffect(() => { latestScope.current = { snapshotKey: fingerprint, name: name.trim() }; }, [fingerprint, name]);
  const isReviewed = reviewIsCurrent(reviewed, scope);
  const [hashed, setHashed] = useState({ snapshotKey: "", hash: "" });
  const currentHash = hashed.snapshotKey === fingerprint ? hashed.hash : "";
  const latestTask = [...tasks].reverse().find(task => !!saved && task.repoUrl === saved.receipt.repoUrl && task.snapshotId === saved.receipt.snapshot && task.baseCommit === saved.receipt.commit);
  const { running: taskRunning, canFollowup } = copilotTaskState(latestTask?.state);
  useEffect(() => {
    let active = true;
    void fingerprintHash(fingerprint).then(hash => { if (active) setHashed({ snapshotKey: fingerprint, hash }); }).catch(() => { if (active) setHashed({ snapshotKey: fingerprint, hash: "" }); });
    return () => { active = false; };
  }, [fingerprint]);
  const canPublish = !!request && !disabled && !busy;
  async function review() {
    const captured = { ...scope };
    const reviewStarted = performance.now();
    setBusy(true); setMessage("");
    try {
      const hash = await fingerprintHash(captured.snapshotKey);
      const result = await reviewPresentationRepositoryAction(request);
      if ("error" in result) { setMessage(result.error); record("failure", performance.now() - reviewStarted, "REFUSED", 0, 0); return; }
      const accepted = finishPackageReview(captured, latestScope.current, result.login, hash);
      if (!accepted) { setReviewed(null); setMessage("The package changed during account review. Review the current package again."); return; }
      setLogin(result.login); setCopilotEnabled(result.copilotTasksEnabled); setReviewed({ ...accepted, snapshotId: result.snapshotId, templateDigest: result.templateDigest });
      try {
        const pendingTask: unknown = JSON.parse(localStorage.getItem(TASK_INTENT_STORAGE) ?? "null");
        if (pendingTask && typeof pendingTask === "object" && "repoUrl" in pendingTask && typeof pendingTask.repoUrl === "string" && pendingTask.repoUrl.startsWith(`https://github.com/${result.login}/`) && "snapshotId" in pendingTask && typeof pendingTask.snapshotId === "string" && /^[a-f0-9]{64}$/.test(pendingTask.snapshotId) && "baseCommit" in pendingTask && typeof pendingTask.baseCommit === "string" && /^[a-f0-9]{40,64}$/.test(pendingTask.baseCommit) && "promptFingerprint" in pendingTask && typeof pendingTask.promptFingerprint === "string" && /^[a-f0-9]{64}$/.test(pendingTask.promptFingerprint) && "kind" in pendingTask && (pendingTask.kind === "initial" || pendingTask.kind === "followup")) setTaskIntent(pendingTask as CopilotTaskIntent);
        const taskRows: unknown = JSON.parse(localStorage.getItem(TASKS_STORAGE) ?? "[]");
        if (Array.isArray(taskRows)) setTasks(taskRows.filter((row): row is CopilotTaskRow => !!row && typeof row === "object" && typeof row.id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(row.id) && typeof row.url === "string" && typeof row.repoUrl === "string" && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(row.repoUrl) && (row.url === `${row.repoUrl}/tasks/${row.id}` || row.url === `${row.repoUrl}/copilot/tasks/${row.id}`) && typeof row.state === "string" && (row.kind === "initial" || row.kind === "followup") && typeof row.snapshotId === "string" && /^[a-f0-9]{64}$/.test(row.snapshotId) && typeof row.baseCommit === "string" && /^[a-f0-9]{40,64}$/.test(row.baseCommit) && typeof row.promptFingerprint === "string" && /^[a-f0-9]{64}$/.test(row.promptFingerprint)));
        setIntent(readReconciliationIntent(localStorage.getItem(INTENT_STORAGE), result.login));
        const old: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
        if (old && typeof old === "object" && "login" in old && old.login === result.login && "fingerprint" in old && typeof old.fingerprint === "string" && "receipt" in old) {
          // Stored receipts are display only: server re-authenticates and reconciles on every publish.
          const candidate = old as SavedReceipt;
          if (candidate.receipt && typeof candidate.receipt.repoUrl === "string" && new RegExp(`^https://github\\.com/${result.login}/[A-Za-z0-9][A-Za-z0-9._-]{0,79}$`).test(candidate.receipt.repoUrl) && typeof candidate.receipt.snapshot === "string" && /^[a-f0-9]{64}$/.test(candidate.receipt.snapshot) && ["ready", "uncertain"].includes(candidate.receipt.status) && ["create", "upload", "verify", "ready"].includes(candidate.receipt.phase)) setSaved(candidate);
        }
      } catch { /* A denied storage read does not block publication. */ }
    } catch { setMessage("Could not verify the publishing account. Retry account review."); record("failure", performance.now() - reviewStarted, "REFUSED", 0, 0); }
    finally { setBusy(false); }
  }
  async function publish() {
    if (!canPublish || !request || !reviewed || !reviewIsCurrent(reviewed, latestScope.current)) return;
    if (intent && !canReconcile(intent, login, reviewed.fingerprint, name.trim())) { setMessage("This is not the pending snapshot/name. Reconcile the unchanged snapshot or explicitly start a new publication."); return; }
    const frozen = structuredClone(request);
    const started = performance.now();
    setBusy(true); setMessage("Publishing a frozen snapshot. No Copilot task will start.");
    try {
      const frozenFingerprint = reviewed.fingerprint;
      const pending = { login, name: name.trim(), fingerprint: frozenFingerprint };
      const result = await persistThenPublish(pending, text => { localStorage.setItem(INTENT_STORAGE, text); setIntent(pending); }, () => publishPresentationRepositoryAction(frozen, pending.name, login, reviewed.snapshotId));
      if ("error" in result) { setMessage(result.error); record("failure", performance.now() - started, "REFUSED", 0, 0); return; }
      const next = { login, fingerprint: frozenFingerprint, receipt: result.receipt };
      setSaved(next);
      try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { setMessage("Keep the repository link: browser storage could not retain this receipt."); }
      record(result.receipt.status === "ready" ? "success" : "failure", performance.now() - started, result.receipt.status === "ready" ? "READY" : "UNCERTAIN", result.slides, result.bytes);
      setMessage(result.receipt.status === "ready" ? "Private snapshot verified. Publication did not start Copilot." : "Remote outcome is uncertain. Keep the link and retry the same repository name and unchanged snapshot to reconcile; do not create another repository.");
    } catch { setMessage("Publication did not settle. If browser storage refused the intent, no request was sent. Otherwise reconcile using the saved name and unchanged snapshot; do not assume the repository was not created."); record("failure", performance.now() - started, "UNCERTAIN", 0, 0); }
    finally { setBusy(false); }
  }
  async function fetchTaskStatus(row: CopilotTaskRow): Promise<CopilotTaskRow | null> {
    const repo = row.repoUrl.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})$/);
    if (!repo) { setMessage("The saved task repository is invalid."); return null; }
    const result = await measureCopilotTaskRefresh(() => refreshPresentationCopilotTaskAction({ owner: repo[1], repo: repo[2], snapshotId: row.snapshotId, snapshotCommit: row.baseCommit, taskId: row.id }));
    if ("error" in result) { setMessage(result.error); return null; }
    const updated = { ...row, ...result.task };
    const next = tasks.map(task => task.id === row.id && task.repoUrl === row.repoUrl ? updated : task);
    setTasks(next);
    try { localStorage.setItem(TASKS_STORAGE, JSON.stringify(next)); }
    catch { setMessage("Task status refreshed, but this browser could not save the updated receipt."); }
    return updated;
  }
  async function refreshTaskStatus(row: CopilotTaskRow) {
    await runSingleFlight(taskSubmissionLock, async () => {
      setBusy(true); setMessage("");
      try { const updated = await fetchTaskStatus(row); if (updated) setMessage(`Copilot task status: ${updated.state}.`); }
      catch { setMessage("Could not refresh Copilot task status. No task was submitted."); }
      finally { setBusy(false); }
    });
  }
  async function startCopilot(kind: "initial" | "followup") {
    await runSingleFlight(taskSubmissionLock, async () => {
      const userPrompt = (kind === "initial" ? initial : followup).trim();
      if (!copilotEnabled || !saved || saved.receipt.status !== "ready" || !saved.receipt.commit || saved.fingerprint !== currentHash || !userPrompt || taskIntent) return;
      const repo = saved.receipt.repoUrl.match(/^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})$/);
      if (!repo) { setMessage("The saved repository link is invalid. Review publication again."); return; }
      setBusy(true);
      const started = performance.now();
      try {
        let previousTask: CopilotTaskRow | null = null;
        if (latestTask) {
          previousTask = await fetchTaskStatus(latestTask);
          if (!previousTask) return;
          if (copilotTaskState(previousTask.state).running) { setMessage("The latest task is still active. Refresh its status before submitting another task."); return; }
        }
        if (kind === "followup" && !copilotTaskState(previousTask?.state).canFollowup) { setMessage("A completed or idle task for this snapshot is required for follow-up regeneration."); return; }
        const pending: CopilotTaskIntent = { kind, repoUrl: saved.receipt.repoUrl, snapshotId: saved.receipt.snapshot, baseCommit: saved.receipt.commit, promptFingerprint: await fingerprintHash(userPrompt), ...(kind === "followup" ? { previousTaskId: previousTask!.id } : {}) };
        try { localStorage.setItem(TASK_INTENT_STORAGE, JSON.stringify(pending)); setTaskIntent(pending); }
        catch { setMessage("Browser storage could not record a safe task intent. No Copilot task was sent."); return; }
        setMessage("Submitting an explicit Copilot task. The requested base commit will be shown in the receipt; review the resulting pull request before use.");
        const result = await startPresentationCopilotTaskAction({ owner: repo[1], repo: repo[2], snapshotId: pending.snapshotId, snapshotCommit: pending.baseCommit, prompt: userPrompt, kind, ...(pending.previousTaskId ? { previousTaskId: pending.previousTaskId } : {}) });
        if ("error" in result) { setMessage(`${result.error} The outcome may be uncertain; check GitHub before clearing the pending task.`); recordCopilotTask("failure", performance.now() - started, "FAILED", kind, userPrompt.length); return; }
        const row: CopilotTaskRow = { ...pending, id: result.task.id, url: result.task.url, state: result.task.state, baseCommit: result.task.baseCommit };
        const next = [...tasks.map(task => previousTask && task.id === previousTask.id && task.repoUrl === previousTask.repoUrl ? previousTask : task), row].slice(-20);
        setTasks(next);
        try { localStorage.setItem(TASKS_STORAGE, JSON.stringify(next)); localStorage.removeItem(TASK_INTENT_STORAGE); setTaskIntent(null); }
        catch { setMessage("Copilot task was created, but this browser could not save its receipt. Keep the task URL and inspect it in GitHub."); recordCopilotTask("success", performance.now() - started, "QUEUED", kind, userPrompt.length); return; }
        recordCopilotTask("success", performance.now() - started, "QUEUED", kind, userPrompt.length);
        setMessage(`Copilot task ${result.task.id} was created from ${result.task.baseCommit}. Review its pull request in GitHub; the app does not merge or import its output.`);
      } catch { setMessage("Copilot task submission is uncertain. Check GitHub task history before clearing this pending intent or submitting again."); recordCopilotTask("failure", performance.now() - started, "UNCERTAIN", kind, userPrompt.length); }
      finally { setBusy(false); }
    });
  }
  return <section aria-label="Private deck repository" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <Typography variant="h6">Private deck repository</Typography>
    <Typography variant="body2">Publish committed slide content, notes, code, graphics, applied objectives, PPTX, manifest and a standalone renderer. Unsaved edits and regeneration candidates are excluded. Optional source text is excluded by default. Maximum package: 8 MiB.</Typography>
    {input?.templateSelected && <Alert severity="warning">This package discloses the complete original template to GitHub, including notes, hidden or unused slides, layouts, themes, images and embedded assets. The frozen renderer applies the same title/bullet paragraph fill as Download .pptx; generated notes, code and graphics remain in deck.json and are not added to the template slides.</Alert>}
    <FormControlLabel control={<Checkbox checked={includeContext} disabled={busy} onChange={e => { setIncludeContext(e.target.checked); setReviewed(null); }} />} label="Include the displayed context and extracted source text in the private repository" />
    {includeContext && <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{JSON.stringify(input?.context, null, 2)}</pre>}
    <TextField label="New private repository name" value={name} slotProps={{ htmlInput: { maxLength: 80 } }} disabled={busy} onChange={e => { setName(e.target.value); setReviewed(null); }} />
    <Button onClick={review} disabled={!canPublish}>Review publishing account and package</Button>
    {isReviewed && <Alert severity="info">Confirm private creation under {login}/{name.trim()}. Review the slide preview and applied objectives above. This sends that frozen package to GitHub, including notes and the complete original template when selected. Original template digest: {reviewed?.templateDigest ?? "none"}. No task or merge is authorized by this action.</Alert>}
    {intent && <>
      <Alert severity={intent.fingerprint === currentHash ? "info" : "warning"}>Pending publication: {intent.name}. {intent.fingerprint === currentHash ? "The recomputed snapshot matches; only this same name can be reconciled." : "The snapshot differs. This pending intent is stale; restore the unchanged deck or explicitly begin a new publication."}</Alert>
      <Button disabled={busy || intent.fingerprint !== currentHash} onClick={() => { setName(intent.name); setReviewed(null); }}>Use pending name for reconciliation</Button>
      <Button disabled={busy} onClick={() => { try { localStorage.removeItem(INTENT_STORAGE); setIntent(null); setReviewed(null); setName(""); setMessage("New publication selected explicitly. The prior repository is unchanged; choose a new name and review again."); } catch { setMessage("Could not clear the pending intent. Browser storage must be available before a new publication."); } }}>Explicitly start a new publication</Button>
    </>}
    <Button variant="contained" disabled={!canPublish || !isReviewed || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name.trim()) || !!intent && (!reviewed || !canReconcile(intent, login, reviewed.fingerprint, name.trim()))} onClick={publish}>Confirm: create or reconcile private snapshot</Button>
    {message && <Alert severity="info" role="status">{message}</Alert>}
    {saved && <>
      <Typography>Snapshot {saved.receipt.snapshot.slice(0, 12)}: {saved.receipt.status}; phase {saved.receipt.phase}</Typography>
      {saved.fingerprint !== currentHash && <Alert severity="warning">The current deck or context differs from this published snapshot. This link still refers to the earlier snapshot. Review a new publication explicitly.</Alert>}
      <Button component="a" href={saved.receipt.repoUrl} target="_blank" rel="noopener noreferrer">Open private repository</Button>
      {saved.receipt.commit && <Typography variant="caption">Verified commit: {saved.receipt.commit}</Typography>}
    </>}
    <TextField label="Initial Copilot generation instructions" value={initial} onChange={e => setInitial(e.target.value)} slotProps={{ htmlInput: { maxLength: 20_000 } }} multiline />
    <Button disabled={!copilotEnabled || !saved || saved.receipt.status !== "ready" || !saved.receipt.commit || saved.fingerprint !== currentHash || !initial.trim() || !!taskIntent || taskRunning || busy} onClick={() => void startCopilot("initial")}>Start initial Copilot generation</Button>
    <TextField label="Follow-up regeneration prompt and context" value={followup} onChange={e => setFollowup(e.target.value)} slotProps={{ htmlInput: { maxLength: 20_000 } }} multiline />
    <Button disabled={!copilotEnabled || !saved || saved.receipt.status !== "ready" || !saved.receipt.commit || saved.fingerprint !== currentHash || !followup.trim() || !!taskIntent || !canFollowup || taskRunning || busy} onClick={() => void startCopilot("followup")}>Submit follow-up regeneration task</Button>
    {latestTask && <Typography variant="body2">Latest task for this snapshot: {latestTask.state}. Refresh status before continuing its generated branch; no merge is required.</Typography>}
    {!copilotEnabled && <Alert severity="info">{UNAVAILABLE} Dispatch is default-off. Enable it only after proving the task base commit, package hashes and PR ancestry with a private test repository.</Alert>}
    {taskIntent && <>
      <Alert severity="warning">A {taskIntent.kind} Copilot task submission may have reached GitHub. Check the task page/repository before retrying; the app will not automatically submit it again. Pending snapshot {taskIntent.snapshotId.slice(0, 12)} at {taskIntent.baseCommit.slice(0, 12)}.</Alert>
      <Button disabled={busy} onClick={() => { try { localStorage.removeItem(TASK_INTENT_STORAGE); setTaskIntent(null); setMessage("Pending task cleared at your direction. Check GitHub first to avoid duplicate work."); } catch { setMessage("Could not clear the pending task intent from browser storage."); } }}>I checked GitHub; clear pending task</Button>
    </>}
    {tasks.map(task => <div key={task.id}>
      <Typography variant="body2">{task.kind === "initial" ? "Initial generation" : "Follow-up regeneration"} task: {task.state}; requested base {task.baseCommit.slice(0, 12)}</Typography>
      <Button component="a" href={task.url} target="_blank" rel="noopener noreferrer">Open Copilot task</Button>
      <Button disabled={busy} onClick={() => void refreshTaskStatus(task)}>Refresh task status</Button>
    </div>)}
  </section>;
}
