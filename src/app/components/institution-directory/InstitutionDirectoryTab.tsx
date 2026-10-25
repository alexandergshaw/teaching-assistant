"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField } from "@mui/material";
import {
  listInstitutionDirectoryAction,
  removeInstitutionDirectoryColumnAction,
  removeInstitutionDirectoryProfileAction,
  saveInstitutionDirectoryColumnAction,
  saveInstitutionDirectoryProfileAction,
  saveInstitutionDirectoryValueAction,
} from "@/app/actions/institution-directory";
import {
  resolveInstitutionLmsAction,
  validateInstitutionDestination,
  type DirectoryColumnType,
  type InstitutionDirectoryRecord,
  type InstitutionDirectoryState,
} from "@/lib/institution-directory";
import { institutionDirectoryDiagnosticReason, recordInstitutionDirectoryDiagnostic, type InstitutionDirectoryTarget } from "@/lib/institution-directory-diagnostics";
import {
  runInstitutionDirectoryClearValue,
  runInstitutionDirectoryCreateColumn,
  runInstitutionDirectoryCreateProfile,
  runInstitutionDirectoryRemoveColumn,
  runInstitutionDirectoryRemoveProfile,
  runInstitutionDirectoryRenameColumn,
  runInstitutionDirectorySaveValue,
  runInstitutionDirectoryUpdateProfile,
} from "./institution-directory-handlers";
import ProfileEditor, { type DirectoryProfileInput } from "./ProfileEditor";
import { DIRECTORY_LOAD_TIMEOUT_MS, directoryLoaderForAccount, selectDirectoryAccount } from "./directory-loader";
import { createClient } from "@/lib/supabase/client";
import { useDraftNavigation } from "./useDraftNavigation";

const EMPTY_STATE: InstitutionDirectoryState = { records: [], columns: [] };
const EMPTY_SNAPSHOT = { data: null, loading: false, error: null };
const emptySnapshot = () => EMPTY_SNAPSHOT;
const emptySubscribe = () => () => {};
function monotonicNow(): number { return globalThis.performance.now(); }

function labelForError(code: string): string {
  const labels: Record<string, string> = {
    "load-failed": "Could not load institutions. Try again.",
    unauthenticated: "Sign in to view and edit your institutions.",
    "refresh-failed": "Could not refresh institutions. Your last saved rows are still shown; try again.",
    "save-failed": "Could not save that change. Your saved information is still available.",
    "remove-failed": "Could not remove that item. It is still available.",
    "directory-read-failed": "Could not load institutions. Try again.",
    "directory-save-failed": "Could not save that institution. Try again.",
    "directory-remove-failed": "Could not remove that institution. Try again.",
    "directory-column-save-failed": "Could not save that column. Try again.",
    "directory-column-remove-failed": "Could not remove that column. Try again.",
    "directory-value-save-failed": "Could not save that value. Try again.",
    "invalid-acronym": "Enter an acronym using letters, numbers, hyphens or underscores.",
    "duplicate-acronym": "That institution is already in your directory. Open its row to edit it.",
    "invalid-email": "Enter one valid email address.",
    "invalid-emailUrl": "Use a valid HTTPS email web address without a query or fragment.",
    "invalid-lmsUrl": "Use a valid HTTPS LMS address without a query or fragment.",
    "invalid-facultyPortalUrl": "Use a valid HTTPS faculty portal address.",
    "invalid-websiteUrl": "Use a valid HTTPS website address.",
    "duplicate-label": "That column name is already in use or reserved.",
    "credential-label": "Store credentials in Bitwarden, not in a custom column.",
    "invalid-label": "Enter a column name up to 48 characters.",
    "invalid-type": "Choose text, date or HTTPS link.",
    "invalid-date": "Enter a real date in YYYY-MM-DD format.",
    "target-not-found": "That institution or column is no longer available. Refresh and try again.",
    "invalid-value": "That value is not supported.",
  };
  return labels[code] ?? "Could not complete that operation. Try again.";
}

function Destination({ href, label, target }: { href: string; label: string; target: InstitutionDirectoryTarget }) {
  const result = validateInstitutionDestination(href);
  return result.ok ? <a href={result.value} target="_blank" rel="noopener noreferrer" onClick={() => recordInstitutionDirectoryDiagnostic("external-open", "success", target)}>{label}</a> : <span>Not set</span>;
}

function CustomValue({
  record, column, disabled, onSave,
}: {
  record: InstitutionDirectoryRecord;
  column: InstitutionDirectoryState["columns"][number];
  disabled: boolean;
  onSave: (record: InstitutionDirectoryRecord, columnId: string, value: string) => void;
}) {
  const value = record.values[column.id] ?? "";
  const link = column.type === "https" && value ? validateInstitutionDestination(value) : null;
  return <div style={{ display: "grid", gap: 4 }}><TextField
    key={`${column.id}:${value}`}
    size="small"
    type={column.type === "date" ? "date" : column.type === "https" ? "url" : "text"}
    label={column.label}
    defaultValue={value}
    disabled={disabled}
    slotProps={{ htmlInput: column.type === "date" ? { maxLength: 10 } : { maxLength: column.type === "text" ? 1000 : 2048 } }}
    onBlur={(event) => { if (event.currentTarget.value !== value) onSave(record, column.id, event.currentTarget.value); }}
    onKeyDown={(event) => { if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur(); }}
  />{link?.ok && <a href={link.value} target="_blank" rel="noopener noreferrer" onClick={() => recordInstitutionDirectoryDiagnostic("external-open", "success", "custom-column-link")}>Open link</a>}</div>;
}

// This listener survives tab navigation so sign-out also erases an unmounted directory.
let observingAccount = false;
function observeDirectoryAccount() {
  if (observingAccount) return;
  observingAccount = true;
  createClient().auth.onAuthStateChange((_event, session) => {
    selectDirectoryAccount(session?.user.id ?? null);
  });
}

export default function InstitutionDirectoryTab() {
  const [account, setAccount] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  const [authAttempt, setAuthAttempt] = useState(0);
  useEffect(() => {
    observeDirectoryAccount();
    const client = createClient();
    const timer = setTimeout(() => setAuthFailed(true), DIRECTORY_LOAD_TIMEOUT_MS);
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timer);
      setAuthFailed(false);
      selectDirectoryAccount(session?.user.id ?? null);
      setAccount(session?.user.id ?? "signed-out");
    });
    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  }, [authAttempt]);
  return <InstitutionDirectoryPanel key={account ?? "auth"} account={account} authFailed={authFailed} retryAuth={() => { setAuthFailed(false); setAuthAttempt((attempt) => attempt + 1); }} />;
}

function InstitutionDirectoryPanel({ account, authFailed, retryAuth }: { account: string | null; authFailed: boolean; retryAuth: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const draftNavigation = useDraftNavigation(sectionRef);
  const [loader] = useState(() => account && account !== "signed-out" ? directoryLoaderForAccount(account, listInstitutionDirectoryAction) : null);
  const snapshot = useSyncExternalStore(loader?.subscribe ?? emptySubscribe, loader?.getSnapshot ?? emptySnapshot, emptySnapshot);
  const state = snapshot.data ?? EMPTY_STATE;
  const authenticated = !!account && account !== "signed-out";
  const [editor, setEditor] = useState<InstitutionDirectoryRecord | null | undefined>(undefined);
  const [editorVersion, setEditorVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columnForm, setColumnForm] = useState(false);
  const [columnLabel, setColumnLabel] = useState("");
  const [columnType, setColumnType] = useState<DirectoryColumnType>("text");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameLabel, setRenameLabel] = useState("");

  function openEditor(record: InstitutionDirectoryRecord | null) {
    draftNavigation.requestLeave(() => {
      draftNavigation.setDirty(false);
      setError(null);
      setEditor(record);
      setEditorVersion((version) => version + 1);
    });
  }

  const load = useCallback(async (force = false) => { await loader?.load(force); }, [loader]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return load(); });
    return () => { active = false; };
  }, [load]);

  async function saveProfile(profile: DirectoryProfileInput) {
    const started = monotonicNow();
    setBusy(true); setError(null);
    const mode = editor === null ? "create" : "update";
    const operation = mode === "create" ? "create-profile" : "update-profile";
    const runProfileRequest = mode === "create" ? runInstitutionDirectoryCreateProfile : runInstitutionDirectoryUpdateProfile;
    const request = await runProfileRequest({ startedAt: started, request: () => saveInstitutionDirectoryProfileAction(profile, mode), setError, setBusy });
    if (request.kind === "unavailable") return;
    const result = request.value;
    if (!result.ok) { recordInstitutionDirectoryDiagnostic(operation, "failure", "profile", institutionDirectoryDiagnosticReason(result.code), { durationMs: monotonicNow() - started }); setError(labelForError(result.code)); setBusy(false); return; }
    recordInstitutionDirectoryDiagnostic(operation, "success", "profile", undefined, { durationMs: monotonicNow() - started });
    setEditor(undefined); await load(true); setBusy(false); draftNavigation.finishLeave();
  }

  async function removeProfile(record: InstitutionDirectoryRecord) {
    if (!window.confirm(`Remove ${record.profile.acronym} from this directory? Courses and saved LMS settings will remain.`)) return;
    const started = monotonicNow();
    setBusy(true); setError(null);
    const request = await runInstitutionDirectoryRemoveProfile({ startedAt: started, request: () => removeInstitutionDirectoryProfileAction(record.profile.acronym), setError, setBusy });
    if (request.kind === "unavailable") return;
    const result = request.value;
    if (!result.ok) { recordInstitutionDirectoryDiagnostic("remove-profile", "failure", "profile", institutionDirectoryDiagnosticReason(result.code), { durationMs: monotonicNow() - started }); setError(labelForError(result.code)); } else { recordInstitutionDirectoryDiagnostic("remove-profile", "success", "profile", undefined, { durationMs: monotonicNow() - started }); await load(true); }
    setBusy(false);
  }

  async function saveColumn(id?: string) {
    const started = monotonicNow();
    setBusy(true); setError(null);
    const operation = id ? "rename-column" : "create-column";
    const runColumnRequest = id ? runInstitutionDirectoryRenameColumn : runInstitutionDirectoryCreateColumn;
    const request = await runColumnRequest({ startedAt: started, request: () => saveInstitutionDirectoryColumnAction({ ...(id ? { id } : {}), label: id ? renameLabel : columnLabel, type: id ? state.columns.find((column) => column.id === id)?.type : columnType }), setError, setBusy });
    if (request.kind === "unavailable") return;
    const result = request.value;
    if (!result.ok) { recordInstitutionDirectoryDiagnostic(operation, "failure", "column", institutionDirectoryDiagnosticReason(result.code), { durationMs: monotonicNow() - started }); setError(labelForError(result.code)); setBusy(false); return; }
    recordInstitutionDirectoryDiagnostic(operation, "success", "column", undefined, { durationMs: monotonicNow() - started });
    setColumnForm(false); setRenameId(null); setColumnLabel(""); await load(true); setBusy(false);
  }

  async function removeColumn(id: string, label: string) {
    if (!window.confirm(`Remove “${label}” and all its values from your institution rows? This cannot be undone.`)) return;
    const started = monotonicNow();
    setBusy(true); setError(null);
    const request = await runInstitutionDirectoryRemoveColumn({ startedAt: started, request: () => removeInstitutionDirectoryColumnAction(id), setError, setBusy });
    if (request.kind === "unavailable") return;
    const result = request.value;
    if (!result.ok) { recordInstitutionDirectoryDiagnostic("remove-column", "failure", "column", institutionDirectoryDiagnosticReason(result.code), { durationMs: monotonicNow() - started }); setError(labelForError(result.code)); } else { recordInstitutionDirectoryDiagnostic("remove-column", "success", "column", undefined, { durationMs: monotonicNow() - started }); await load(true); }
    setBusy(false);
  }

  async function saveValue(record: InstitutionDirectoryRecord, columnId: string, value: string) {
    const started = monotonicNow();
    setBusy(true); setError(null);
    const operation = value.trim() ? "save-value" : "clear-value";
    const runValueRequest = operation === "save-value" ? runInstitutionDirectorySaveValue : runInstitutionDirectoryClearValue;
    const request = await runValueRequest({ startedAt: started, request: () => saveInstitutionDirectoryValueAction({ acronym: record.profile.acronym, columnId, value }), setError, setBusy });
    if (request.kind === "unavailable") return;
    const result = request.value;
    if (!result.ok) { recordInstitutionDirectoryDiagnostic(operation, "failure", "value", institutionDirectoryDiagnosticReason(result.code), { durationMs: monotonicNow() - started }); setError(labelForError(result.code)); } else { recordInstitutionDirectoryDiagnostic(operation, "success", "value", undefined, { durationMs: monotonicNow() - started }); await load(true); }
    setBusy(false);
  }

  return (
    <section ref={sectionRef} aria-labelledby="institution-directory-title" style={{ padding: "var(--space-4)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}>
        <div><h1 id="institution-directory-title">Institutions</h1><p className="field-hint">Keep institution contacts and links together. Passwords belong in Bitwarden; this directory never stores them.</p></div>
        <Button variant="contained" disabled={busy || !authenticated} onClick={() => openEditor(null)}>Add institution</Button>
      </header>
      {error && <p role="alert">{error}</p>}
      {account === "signed-out" && <p role="alert">Sign in to view and edit your institutions.</p>}
      {!account && !authFailed && <p role="status">Checking your session…</p>}
      {!account && authFailed && <div><p role="alert">Checking your session took too long.</p><Button onClick={retryAuth}>Try again</Button></div>}
      {authenticated && (snapshot.loading || (!snapshot.data && !snapshot.error)) && <p role="status">{snapshot.data ? "Refreshing institutions; your last saved rows are shown." : "Loading institutions…"}</p>}
      {snapshot.error && <p role="alert">{snapshot.error}</p>}
      {authenticated && <Button disabled={snapshot.loading} onClick={() => void load()}>{snapshot.error ? "Try again" : "Refresh"}</Button>}
      {editor !== undefined && <ProfileEditor key={`${editor?.profile.acronym ?? "new"}:${editorVersion}`} record={editor ?? undefined} onDirtyChange={draftNavigation.setDirty} onSave={(profile) => void saveProfile(profile)} onCancel={() => draftNavigation.requestLeave(() => setEditor(undefined))} busy={busy} error={error} />}
      <Dialog data-institution-draft-dialog open={draftNavigation.confirming} onClose={draftNavigation.stay} aria-labelledby="institution-unsaved-title">
        <DialogTitle id="institution-unsaved-title">Unsaved institution changes</DialogTitle>
        <DialogContent>Save your profile before leaving, discard your changes, or stay in the editor.</DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={draftNavigation.stay}>Stay</Button>
          <Button disabled={busy} onClick={draftNavigation.finishLeave}>Discard changes</Button>
          <Button disabled={busy} onClick={() => { (document.getElementById("institution-profile-editor") as HTMLFormElement | null)?.requestSubmit(); }}>Save and continue</Button>
        </DialogActions>
      </Dialog>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap", marginBlock: "var(--space-3)" }}>
        <Button variant="outlined" onClick={() => { setColumnForm(true); setError(null); }} disabled={busy || !authenticated}>Add column</Button>
        {columnForm && <>
          <TextField size="small" label="Column name" value={columnLabel} onChange={(e) => setColumnLabel(e.target.value)} disabled={busy} />
          <TextField select size="small" label="Column type" value={columnType} onChange={(e) => setColumnType(e.target.value as DirectoryColumnType)} disabled={busy}>
            <MenuItem value="text">Text</MenuItem><MenuItem value="date">Date</MenuItem><MenuItem value="https">HTTPS link</MenuItem>
          </TextField>
          <Button onClick={() => void saveColumn()} disabled={busy}>Save column</Button>
          <Button onClick={() => { setColumnForm(false); setColumnLabel(""); }} disabled={busy}>Cancel</Button>
        </>}
      </div>
      {snapshot.data && state.records.length === 0 && <p>No institutions yet. Add an institution to start your directory.</p>}
        <TableContainer sx={{ maxHeight: "70vh" }}>
          <Table size="small" stickyHeader aria-label="Institution directory">
            <TableHead><TableRow>
              {["Institution", "Email", "Email client", "LMS", "Faculty portal", "Website", "Department"].map((label) => <TableCell key={label}>{label}</TableCell>)}
              {state.columns.map((column) => <TableCell key={column.id}>
                {renameId === column.id ? <span style={{ display: "flex", gap: 4 }}><TextField size="small" label={`Rename ${column.label}`} value={renameLabel} onChange={(e) => setRenameLabel(e.target.value)} /><Button onClick={() => void saveColumn(column.id)} disabled={busy}>Save</Button><Button onClick={() => setRenameId(null)} disabled={busy}>Cancel</Button></span> : <>{column.label} <Button size="small" onClick={() => { setRenameId(column.id); setRenameLabel(column.label); }}>Rename</Button><Button size="small" color="error" onClick={() => void removeColumn(column.id, column.label)} disabled={busy}>Remove</Button></>}
              </TableCell>)}
              <TableCell>Actions</TableCell>
            </TableRow></TableHead>
            <TableBody>{state.records.map((record) => {
              const lms = resolveInstitutionLmsAction(record);
              return <TableRow key={record.profile.acronym}>
                <TableCell><strong>{record.profile.acronym}</strong>{record.profile.fullName && <div>{record.profile.fullName}</div>}<div style={{ display: "flex", gap: 4 }}><Button size="small" disabled={busy} onClick={() => openEditor(record)}>Edit</Button><Button size="small" color="error" onClick={() => void removeProfile(record)} disabled={busy}>Remove</Button></div></TableCell>
                <TableCell>{record.commonValues.email || "Not set"}<div><Destination href={record.commonValues.outlookUrl} label="Open email" target="email" /></div></TableCell>
                <TableCell>{record.profile.emailClient === "other" ? record.profile.emailClientOtherName : record.profile.emailClient || "Not set"}</TableCell>
                <TableCell>{record.commonValues.lmsType === "other" ? record.profile.lmsOtherName : record.commonValues.lmsType || "Not set"}<div>{lms.kind === "open" ? <a href={lms.href} target="_blank" rel="noopener noreferrer" onClick={() => recordInstitutionDirectoryDiagnostic("external-open", "success", "lms")}>Open LMS</a> : lms.kind === "not-set" ? <span>LMS link not set</span> : <span>LMS link unavailable; edit this row to correct it.</span>}</div></TableCell>
                <TableCell><Destination href={record.profile.facultyPortalUrl} label="Open faculty portal" target="faculty-portal" /></TableCell>
                <TableCell><Destination href={record.profile.websiteUrl} label="Open website" target="institution-website" /></TableCell>
                <TableCell>{record.profile.department || "Not set"}</TableCell>
                {state.columns.map((column) => <TableCell key={column.id}><CustomValue record={record} column={column} disabled={busy} onSave={saveValue} /></TableCell>)}
                <TableCell><Button size="small" disabled={busy} onClick={() => openEditor(record)}>Edit profile</Button></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </TableContainer>
      {state.records.length > 0 && <p className="field-hint">Email client: {state.records.map((record) => `${record.profile.acronym}: ${record.profile.emailClient || "not set"}`).join(" · ")}</p>}
    </section>
  );
}
