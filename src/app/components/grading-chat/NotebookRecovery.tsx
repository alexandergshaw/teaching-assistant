"use client";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Stack } from "@mui/material";
import type { SupabaseAuthObserver } from "@/context/supabase-auth-observer";
import type { GradeRunItemRequestBody } from "@/app/components/grading/incrementalRunPlan";
import { createSingleZipBrowserAuthority } from "@/lib/grade/single-zip-browser-authority";
import { confirmNotebookRecovery, listNotebookJobs, restoreNotebookRequest, type RecoverableNotebookJob } from "./notebookJobClient";

/** Explicit recovery keeps restored rows separate from any existing work. */
export function NotebookRecovery({ observer, available, recover }: { observer: SupabaseAuthObserver; available: boolean; recover: (body: GradeRunItemRequestBody, current: () => boolean) => Promise<boolean> }) {
  const [jobs, setJobs] = useState<RecoverableNotebookJob[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { let live = true; void fetch("/api/notebook-execution", { cache: "no-store", credentials: "same-origin" }).then(r => r.ok ? r.json() : null).then(value => { if (live) setEnabled(value?.enabled === true); }).catch(() => {}); return () => { live = false; }; }, []);
  async function open() {
    const turn = ++generation.current; setBusy(true); setMessage("");
    const authority = createSingleZipBrowserAuthority(observer);
    try {
      const lease = await authority.admit(); const session = lease && authority.identity(lease);
      if (!session || !lease || turn !== generation.current) throw new Error();
      const rows = await listNotebookJobs(session, lease.signal);
      if (turn !== generation.current || lease.signal.aborted) return;
      const recoverable = rows.filter(row => ["reserved", "dispatching", "running", "unknown", "recovering", "cancelling", "retryable", "failed", "cancelled", "succeeded"].includes(row.status));
      setJobs(recoverable);
      if (!recoverable.length) setMessage("No notebook work is available to recover.");
    } catch { if (turn === generation.current) setMessage("Notebook work could not be loaded."); }
    finally { authority.close(); if (turn === generation.current) setBusy(false); }
  }
  async function select(job: RecoverableNotebookJob) {
    const turn = ++generation.current; setBusy(true); setMessage("");
    const authority = createSingleZipBrowserAuthority(observer);
    try {
      const lease = await authority.admit(); const session = lease && authority.identity(lease);
      if (!session || !lease || turn !== generation.current) throw new Error();
      const request = await restoreNotebookRequest(session, job, lease.signal);
      const current = () => turn === generation.current && !lease.signal.aborted;
      if (!current() || !await confirmNotebookRecovery(session, job, lease.signal)) throw new Error();
      if (!request || !current() || !await recover(request, current)) throw new Error();
      setJobs([]); setMessage("Notebook grading resumed.");
    } catch { if (turn === generation.current) setMessage("This notebook could not be recovered. Your current work was preserved."); }
    finally { authority.close(); if (turn === generation.current) setBusy(false); }
  }
  if (!available || !enabled) return null;
  return <Stack spacing={1}>
    <Button size="small" disabled={busy} onClick={() => void open()}>Recover notebook grading</Button>
    {busy && <span role="status">Checking notebook grading...</span>}
    {message && <Alert severity="info">{message}</Alert>}
    {jobs.map(job => <Button key={job.attempt_id} size="small" disabled={busy} onClick={() => void select(job)}>{job.source_url} ({job.status})</Button>)}
  </Stack>;
}
