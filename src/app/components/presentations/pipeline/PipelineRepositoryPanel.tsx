"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Button, Checkbox, FormControlLabel, TextField, Typography } from "@mui/material";
import { getPresentationPublisherAction, publishPresentationRepositoryAction } from "@/app/actions/presentation-repository";
import type { SnapshotInput } from "@/lib/presentations/repository-snapshot";
import type { RepositoryReceipt } from "@/lib/presentations/repository-publish";
import { recordRepositoryPublication as record } from "./repository-diagnostic";
import { canReconcile, finishPackageReview, persistThenPublish, readReconciliationIntent, reviewIsCurrent, type PackageReview, type ReconciliationIntent, type ReviewScope } from "./repository-confirmation";

interface Props { input: SnapshotInput | null; disabled: boolean }
interface SavedReceipt { login: string; fingerprint: string; receipt: RepositoryReceipt }
const STORAGE = "ta-pres-private-repository-receipt";
const INTENT_STORAGE = "ta-pres-private-repository-intent";
const UNAVAILABLE = "Copilot generation is unavailable: the adapter cannot prove the worker's immutable base commit. An owner-enabled integration test must verify checkout, package hashes and PR ancestry before either task can be enabled. No task has been dispatched.";
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
  const [initial, setInitial] = useState("");
  const [followup, setFollowup] = useState("");
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
      setLogin(result.login); setReviewed(accepted);
      try {
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
    <Button disabled>Start initial Copilot generation (unavailable)</Button>
    <TextField label="Follow-up slide regeneration instructions and context" value={followup} onChange={e => setFollowup(e.target.value)} slotProps={{ htmlInput: { maxLength: 20_000 } }} multiline />
    <Button disabled>Dispatch follow-up regeneration (unavailable)</Button>
    <Alert severity="info">{UNAVAILABLE} Task status: not started. PR status: none reported. Review any future task output in GitHub; no automatic merge or Pipeline import.</Alert>
  </section>;
}
