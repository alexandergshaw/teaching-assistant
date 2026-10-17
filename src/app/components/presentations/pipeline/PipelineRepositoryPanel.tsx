"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { getPresentationPublisherAction, publishPresentationRepositoryAction, startPresentationCopilotTaskAction } from "@/app/actions/presentation-repository";
import type { SnapshotInput } from "@/lib/presentations/repository-snapshot";
import type { RepositoryReceipt } from "@/lib/presentations/repository-publish";
import { recordRepositoryPublication as record, recordCopilotTask } from "./repository-diagnostic";
import { canReconcile, finishPackageReview, persistThenPublish, readReconciliationIntent, reviewIsCurrent, runSingleFlight, type PackageReview, type ReconciliationIntent, type ReviewScope } from "./repository-confirmation";

interface Props { input: SnapshotInput | null; disabled: boolean }
interface SavedReceipt { login: string; fingerprint: string; receipt: RepositoryReceipt }
const STORAGE = "ta-pres-private-repository-receipt";
const INTENT_STORAGE = "ta-pres-private-repository-intent";
const TASKS_STORAGE = "ta-pres-copilot-task-receipts";
const TASK_INTENT_STORAGE = "ta-pres-copilot-task-intent";
const UNAVAILABLE = "Copilot generation is unavailable: the adapter cannot prove the worker's immutable base commit. An owner-enabled integration test must verify checkout, package hashes and PR ancestry before either task can be enabled. No task has been dispatched.";
interface CopilotTaskRow { id: string; url: string; state: string; kind: "initial" | "followup"; repoUrl: string; snapshotId: string; baseCommit: string; promptFingerprint: string }
interface CopilotTaskIntent { kind: "initial" | "followup"; repoUrl: string; snapshotId: string; baseCommit: string; promptFingerprint: string }
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
  useEffect(() => {
    let active = true;
    void fingerprintHash(fingerprint).then(hash => { if (active) setHashed({ snapshotKey: fingerprint, hash }); }).catch(() => { if (active) setHashed({ snapshotKey: fingerprint, hash: "" }); });
    return () => { active = false; };
  }, [fingerprint]);
  const canPublish = !!request && !request.templateSelected && !disabled && !busy;
  async function review() {
    const captured = { ...scope };
    setBusy(true); setMessage("");
    try {
      const hash = await fingerprintHash(captured.snapshotKey);
      const result = await getPresentationPublisherAction();
      if ("error" in result) { setMessage(result.error); return; }
      const accepted = finishPackageReview(captured, latestScope.current, result.login, hash);
      if (!accepted) { setReviewed(null); setMessage("The package changed during account review. Review the current package again."); return; }
      setLogin(result.login); setCopilotEnabled(result.copilotTasksEnabled); setReviewed(accepted);
      try {
        const pendingTask: unknown = JSON.parse(localStorage.getItem(TASK_INTENT_STORAGE) ?? "null");
        if (pendingTask && typeof pendingTask === "object" && "repoUrl" in pendingTask && typeof pendingTask.repoUrl === "string" && pendingTask.repoUrl.startsWith(`https://github.com/${result.login}/`) && "snapshotId" in pendingTask && typeof pendingTask.snapshotId === "string" && /^[a-f0-9]{64}$/.test(pendingTask.snapshotId) && "baseCommit" in pendingTask && typeof pendingTask.baseCommit === "string" && /^[a-f0-9]{40,64}$/.test(pendingTask.baseCommit) && "promptFingerprint" in pendingTask && typeof pendingTask.promptFingerprint === "string" && /^[a-f0-9]{64}$/.test(pendingTask.promptFingerprint) && "kind" in pendingTask && (pendingTask.kind === "initial" || pendingTask.kind === "followup")) setTaskIntent(pendingTask as CopilotTaskIntent);
        const taskRows: unknown = JSON.parse(localStorage.getItem(TASKS_STORAGE) ?? "[]");
        if (Array.isArray(taskRows)) setTasks(taskRows.filter((row): row is CopilotTaskRow => !!row && typeof row === "object" && typeof row.id === "string" && typeof row.url === "string" && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+\/copilot\/tasks\//.test(row.url) && typeof row.state === "string" && (row.kind === "initial" || row.kind === "followup") && typeof row.repoUrl === "string" && /^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(row.repoUrl) && typeof row.snapshotId === "string" && /^[a-f0-9]{64}$/.test(row.snapshotId) && typeof row.baseCommit === "string" && /^[a-f0-9]{40,64}$/.test(row.baseCommit) && typeof row.promptFingerprint === "string" && /^[a-f0-9]{64}$/.test(row.promptFingerprint)));
        setIntent(readReconciliationIntent(localStorage.getItem(INTENT_STORAGE), result.login));
        const old: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "null");
        if (old && typeof old === "object" && "login" in old && old.login === result.login && "fingerprint" in old && typeof old.fingerprint === "string" && "receipt" in old) {
          // Stored receipts are display only: server re-authenticates and reconciles on every publish.
          const candidate = old as SavedReceipt;
          if (candidate.receipt && typeof candidate.receipt.repoUrl === "string" && new RegExp(`^https://github\\.com/${result.login}/[A-Za-z0-9][A-Za-z0-9._-]{0,79}$`).test(candidate.receipt.repoUrl) && typeof candidate.receipt.snapshot === "string" && /^[a-f0-9]{64}$/.test(candidate.receipt.snapshot) && ["ready", "uncertain"].includes(candidate.receipt.status) && ["create", "upload", "verify", "ready"].includes(candidate.receipt.phase)) setSaved(candidate);
        }
      } catch { /* A denied storage read does not block publication. */ }
    } catch { setMessage("Could not verify the publishing account. Retry account review."); }
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
      const result = await persistThenPublish(pending, text => { localStorage.setItem(INTENT_STORAGE, text); setIntent(pending); }, () => publishPresentationRepositoryAction(frozen, pending.name, login));
      if ("error" in result) { setMessage(result.error); record("failure", performance.now() - started, "REFUSED", 0, 0); return; }
      const next = { login, fingerprint: frozenFingerprint, receipt: result.receipt };
      setSaved(next);
      try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { setMessage("Keep the repository link: browser storage could not retain this receipt."); }
      record(result.receipt.status === "ready" ? "success" : "failure", performance.now() - started, result.receipt.status === "ready" ? "READY" : "UNCERTAIN", result.slides, result.bytes);
      setMessage(result.receipt.status === "ready" ? "Private snapshot verified. Publication did not start Copilot." : "Remote outcome is uncertain. Keep the link and retry the same repository name and unchanged snapshot to reconcile; do not create another repository.");
    } catch { setMessage("Publication did not settle. If browser storage refused the intent, no request was sent. Otherwise reconcile using the saved name and unchanged snapshot; do not assume the repository was not created."); record("failure", performance.now() - started, "UNCERTAIN", 0, 0); }
    finally { setBusy(false); }
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
        const pending: CopilotTaskIntent = { kind, repoUrl: saved.receipt.repoUrl, snapshotId: saved.receipt.snapshot, baseCommit: saved.receipt.commit, promptFingerprint: await fingerprintHash(userPrompt) };
        try { localStorage.setItem(TASK_INTENT_STORAGE, JSON.stringify(pending)); setTaskIntent(pending); }
        catch { setMessage("Browser storage could not record a safe task intent. No Copilot task was sent."); return; }
        setMessage("Submitting an explicit Copilot task. The requested base commit will be shown in the receipt; review the resulting pull request before use.");
        const result = await startPresentationCopilotTaskAction({ owner: repo[1], repo: repo[2], snapshotId: pending.snapshotId, snapshotCommit: pending.baseCommit, prompt: userPrompt, kind });
        if ("error" in result) { setMessage(`${result.error} The outcome may be uncertain; check GitHub before clearing the pending task.`); recordCopilotTask("failure", performance.now() - started, "FAILED", kind, userPrompt.length); return; }
        const row: CopilotTaskRow = { ...pending, id: result.task.id, url: result.task.url, state: result.task.state, baseCommit: result.task.baseCommit };
        const next = [...tasks, row].slice(-20);
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
    {input?.templateSelected && <Alert severity="warning">Template-backed repository publication is unavailable until the authorized template asset and renderer can be packaged reproducibly. Choose own layout to publish; normal template download remains available.</Alert>}
    <FormControlLabel control={<Checkbox checked={includeContext} disabled={busy} onChange={e => { setIncludeContext(e.target.checked); setReviewed(null); }} />} label="Include the displayed context and extracted source text in the private repository" />
    {includeContext && <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{JSON.stringify(input?.context, null, 2)}</pre>}
    <TextField label="New private repository name" value={name} slotProps={{ htmlInput: { maxLength: 80 } }} disabled={busy} onChange={e => { setName(e.target.value); setReviewed(null); }} />
    <Button onClick={review} disabled={!canPublish}>Review publishing account and package</Button>
    {isReviewed && <Alert severity="info">Confirm private creation under {login}/{name.trim()}. Review the slide preview and applied objectives above. This sends that frozen package to GitHub, including notes. No task or merge is authorized by this action.</Alert>}
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
    <Button disabled={!copilotEnabled || !saved || saved.receipt.status !== "ready" || !saved.receipt.commit || saved.fingerprint !== currentHash || !initial.trim() || !!taskIntent || busy} onClick={() => void startCopilot("initial")}>Start initial Copilot generation</Button>
    <TextField label="Follow-up regeneration prompt and context" value={followup} onChange={e => setFollowup(e.target.value)} slotProps={{ htmlInput: { maxLength: 20_000 } }} multiline />
    <Button disabled={!copilotEnabled || !saved || saved.receipt.status !== "ready" || !saved.receipt.commit || saved.fingerprint !== currentHash || !followup.trim() || !!taskIntent || busy} onClick={() => void startCopilot("followup")}>Submit follow-up regeneration task</Button>
    {!copilotEnabled && <Alert severity="info">{UNAVAILABLE} Dispatch is default-off. Enable it only after proving the task base commit, package hashes and PR ancestry with a private test repository.</Alert>}
    {taskIntent && <>
      <Alert severity="warning">A {taskIntent.kind} Copilot task submission may have reached GitHub. Check the task page/repository before retrying; the app will not automatically submit it again. Pending snapshot {taskIntent.snapshotId.slice(0, 12)} at {taskIntent.baseCommit.slice(0, 12)}.</Alert>
      <Button disabled={busy} onClick={() => { try { localStorage.removeItem(TASK_INTENT_STORAGE); setTaskIntent(null); setMessage("Pending task cleared at your direction. Check GitHub first to avoid duplicate work."); } catch { setMessage("Could not clear the pending task intent from browser storage."); } }}>I checked GitHub; clear pending task</Button>
    </>}
    {tasks.map(task => <div key={task.id}>
      <Typography variant="body2">{task.kind === "initial" ? "Initial generation" : "Follow-up regeneration"} task: {task.state}; requested base {task.baseCommit.slice(0, 12)}</Typography>
      <Button component="a" href={task.url} target="_blank" rel="noopener noreferrer">Open Copilot task</Button>
    </div>)}
  </section>;
}
