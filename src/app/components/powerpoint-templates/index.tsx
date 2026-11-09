"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Pagination, TextField } from "@mui/material";
import { uploadPowerPointTemplateAction, analyzePowerPointTemplateAction, listPowerPointTemplateLibrariesAction,
  getPowerPointTemplateLibraryAction, savePowerPointTemplateLibraryAction, reusePowerPointTemplateLibraryAction,
  downloadPowerPointTemplateLibraryAction } from "@/app/actions/powerpoint-template-library";
import { SLIDE_ROLES, absentRoles, failure, type LibraryDefinition, type LibraryMeta, type TemplateFailure } from "@/lib/powerpoint-template-library/types";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { recordPowerPointDiagnostic as diagnostic, templateOperationStartedAt, handoffTemplate, readTemplateFile, downloadTemplate, filterLibraryPage, libraryDisplayName, filterTemplateSlides, sourceSlidePage, allowPowerPointRouteChange } from "./panel-logic";
import { registerRecordingRouteGuard } from "@/lib/recording-route-guard";
import { ownerMarkerFor, readSweepOwnerMarker } from "@/lib/client-state-sweep";
import { applyRecoveredRoles, parseRecovery, recoveryKey, recoverySnapshot } from "./recovery";
import TabHeader from "../TabHeader";
import styles from "../template-tools.module.css";
import { useSupabase } from "@/context/SupabaseProvider";

export default function PowerPointTemplates({ onUseInSlideDeckCreation, active = true }: { onUseInSlideDeckCreation?: () => void; active?: boolean }) {
  const { user, loading } = useSupabase();
  if (loading) return <Alert severity="info" role="status">Loading your session...</Alert>;
  if (!user) return <Alert severity="info">Sign in to manage PowerPoint templates.</Alert>;
  return <PowerPointTemplatesSession key={user.id} userId={user.id} active={active} onUseInSlideDeckCreation={onUseInSlideDeckCreation} />;
}

function PowerPointTemplatesSession({ onUseInSlideDeckCreation, active, userId }: { onUseInSlideDeckCreation?: () => void; active: boolean; userId: string }) {
  const [libraries, setLibraries] = useState<LibraryMeta[]>([]);
  const [librariesTruncated, setLibrariesTruncated] = useState(false);
  const [librariesSnapshotUncertain, setLibrariesSnapshotUncertain] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryPage, setLibraryPage] = useState(1);
  const libraryResults = filterLibraryPage(libraries, libraryQuery, libraryPage);
  const [librariesLoading, setLibrariesLoading] = useState(true);
  const [librariesLoaded, setLibrariesLoaded] = useState(false);
  const [librariesError, setLibrariesError] = useState("");
  const [slidePage, setSlidePage] = useState(1);
  const [slideQuery, setSlideQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [sourceDigest, setSourceDigest] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [definition, setDefinition] = useState<LibraryDefinition | null>(null);
  const [manualReview, setManualReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TemplateFailure | null>(null);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryWriteFailed, setRecoveryWriteFailed] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [pending, setPending] = useState<{ kind: "file"; file: File } | { kind: "open"; id: string } | { kind: "analyze"; mode: "auto" | "manual" } | null>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const listGeneration = useRef(0);
  const locked = useRef(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      let saved;
      try {
        if (readSweepOwnerMarker() !== ownerMarkerFor(userId)) throw new Error("owner");
        const raw = localStorage.getItem(recoveryKey(userId));
        saved = raw ? parseRecovery(raw) : null;
        if (raw && !saved) throw new Error("invalid");
      } catch { if (active) { setRecoveryBlocked(true); setRecoveryMessage("Draft recovery could not be read. The existing record will not be overwritten."); setRecoveryReady(true); } return; }
      if (!saved) { if (active) setRecoveryReady(true); return; }
      if (!saved.sourceId) {
        if (active) { setName(saved.name); setDirty(true); setRecoveryMessage(saved.needsFile ? "Recovered the template name. The source file was not saved in this browser; choose it again." : "Recovered the unsaved template name."); setRecoveryReady(true); }
        return;
      }
      try {
        const result = await analyzePowerPointTemplateAction(saved.sourceId, "manual");
        if (!active || readSweepOwnerMarker() !== ownerMarkerFor(userId)) return;
        if ("error" in result) throw new Error("unavailable");
        if (result.sourceDigest !== saved.sourceDigest) throw new Error("changed");
        const restored = applyRecoveredRoles(result.definition, saved.roles);
        if (!restored) throw new Error("changed");
        setName(saved.name); setSourceId(saved.sourceId); setSourceDigest(saved.sourceDigest); setSavedId(null); setDefinition(restored); setDirty(true); setManualReview(true);
        setRecoveryMessage("Recovered unsaved classifications for this account. Review them before saving as a new library; the existing library will not be overwritten."); setRecoveryReady(true);
      } catch { if (active) { setRecoveryBlocked(true); setRecoveryMessage("Could not restore the draft source. Your recovery record was kept; reload to try again."); setRecoveryReady(true); } }
    })();
    return () => { active = false; };
  }, [userId]);
  useLayoutEffect(() => {
    if (!recoveryReady || recoveryBlocked || readSweepOwnerMarker() !== ownerMarkerFor(userId)) return;
    let active = true;
    try {
      if (dirty) localStorage.setItem(recoveryKey(userId), JSON.stringify(recoverySnapshot(name, sourceDigest ? sourceId : "", sourceDigest, sourceDigest ? savedId : null, sourceDigest ? definition : null, Boolean(file && !sourceDigest))));
      else localStorage.removeItem(recoveryKey(userId));
    } catch { queueMicrotask(() => { if (active) setRecoveryWriteFailed(true); }); }
    return () => { active = false; };
  }, [recoveryReady, recoveryBlocked, userId, dirty, name, sourceId, sourceDigest, savedId, definition, file]);
  const visibleSlides = useMemo(() => filterTemplateSlides(definition?.slides ?? [], slideQuery), [definition, slideQuery]);
  const effectiveSlidePage = Math.min(slidePage, Math.max(1, Math.ceil(visibleSlides.length / 6)));
  async function handleOperation(operation: "load" | "analyze" | "save" | "reuse" | "download", job: (current: () => boolean) => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    const ticket = ++generation.current;
    const current = () => alive.current && generation.current === ticket;
    const started = templateOperationStartedAt();
    setBusy(true); setError(null);
    try { await job(current); }
    catch (caught) {
      const result = caught && typeof caught === "object" && "code" in caught && typeof caught.code === "string" && "error" in caught && typeof caught.error === "string"
        ? caught as TemplateFailure : failure(null, operation === "download" ? "PPT_DOWNLOAD" : "PPT_STORAGE");
      diagnostic(operation, started, result);
      if (current()) setError(result);
    } finally {
      if (current()) { setBusy(false); locked.current = false; }
    }
  }
  useEffect(() => {
    alive.current = true;
    const operationCounter = generation, listCounter = listGeneration;
    return () => { alive.current = false; operationCounter.current++; listCounter.current++; };
  }, []);
  async function refreshLibraries() {
    const ticket = ++listGeneration.current;
    const started = templateOperationStartedAt();
    setLibrariesLoading(true); setLibrariesError("");
    try {
      const result = await listPowerPointTemplateLibrariesAction();
      diagnostic("load", started, "error" in result ? result : null);
      if (!alive.current || ticket !== listGeneration.current) return;
      if ("error" in result) setLibrariesError(result.error);
      else { setLibraries(result.libraries); setLibrariesTruncated(result.truncated); setLibrariesSnapshotUncertain(result.snapshotUncertain); setLibrariesLoaded(true); }
    } catch {
      const result = failure(null, "PPT_STORAGE");
      diagnostic("load", started, result);
      if (alive.current && ticket === listGeneration.current) setLibrariesError(result.error);
    } finally { if (alive.current && ticket === listGeneration.current) setLibrariesLoading(false); }
  }
  useEffect(() => {
    let cancelled = false;
    const listCounter = listGeneration;
    if (active) queueMicrotask(() => { if (!cancelled) void refreshLibraries(); });
    return () => { cancelled = true; listCounter.current++; };
  // A newly entered view refreshes; the session is keyed to the authenticated user.
  }, [active]);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  // The existing registry is used by the app's pathname-changing links.
  // Its synchronous contract matches the established recording draft guard.
  useLayoutEffect(() => registerRecordingRouteGuard(() => allowPowerPointRouteChange(
    dirty,
    busy || locked.current,
    () => window.confirm("This PowerPoint template has unsaved changes. Leave without saving?"),
    () => window.alert("Wait for the PowerPoint template operation to finish before leaving."),
  )), [dirty, busy]);
  function requireSuccess<T extends object>(result: T): Exclude<T, TemplateFailure> {
    if ("error" in result) throw result;
    return result as Exclude<T, TemplateFailure>;
  }
  async function analyze(mode: "auto" | "manual" = "auto") {
    await handleOperation("analyze", async current => {
      const started = templateOperationStartedAt();
      let id = sourceId;
      if (!id) {
        if (!file || !confirmed) throw failure(null, "PPT_INVALID");
        const budget = checkFileWireBudget(file.size, "That template");
        if (!budget.ok) throw failure(null, "PPT_LIMIT");
        const base64 = await readTemplateFile(file);
        if (!current()) return;
        const upload = requireSuccess(await uploadPowerPointTemplateAction(name, file.name, base64, confirmed));
        id = upload.sourceFileId;
        if (!current()) return;
        setSourceId(id);
      }
      const result = requireSuccess(await analyzePowerPointTemplateAction(id, mode));
      diagnostic("analyze", started);
      if (!current()) return;
      setDefinition(result.definition); setSourceDigest(result.sourceDigest); setManualReview(result.manual); setSlidePage(1); setSlideQuery(""); setDirty(true); setStatus(result.manual ? `${mode === "auto" ? "Automatic classification was unavailable. " : ""}Manual review: all slides start as other. Assign roles, then save. Textless slides have no image preview and cannot be filled by the positional writer.` : "Review the source slides and classifications, then save.");
    });
  }
  async function open(id: string) {
    await handleOperation("load", async current => {
      const started = templateOperationStartedAt();
      const result = requireSuccess(await getPowerPointTemplateLibraryAction(id));
      diagnostic("load", started);
      if (!current()) return;
      setSavedId(result.library.id); setSourceId(result.library.sourceFileId);
      setName(result.library.name); setDefinition(result.library.definition); setSourceDigest(result.sourceDigest); setManualReview(false); setSlidePage(1); setSlideQuery("");
      setFile(null); setConfirmed(false); setDirty(false); setStatus("Saved library reopened.");
    });
  }
  async function save() {
    if (!definition) return;
    await handleOperation("save", async current => {
      const started = templateOperationStartedAt();
      const result = requireSuccess(await savePowerPointTemplateLibraryAction(savedId, sourceId, name, definition));
      diagnostic("save", started);
      if (!current()) return;
      setSavedId(result.library.id);
      listGeneration.current++; setLibrariesLoading(false); setLibrariesLoaded(true); setLibrariesError("");
      setLibraries(previous => [result.library, ...previous.filter(item => item.id !== result.library.id)]);
      setDefinition(result.library.definition); setDirty(false); setStatus("Classifications saved.");
    });
  }
  async function reuse() {
    if (!savedId || !onUseInSlideDeckCreation) return;
    await handleOperation("reuse", async current => {
      const started = templateOperationStartedAt();
      const result = requireSuccess(await reusePowerPointTemplateLibraryAction(savedId));
      if (!current()) return;
      let handed;
      try { handed = handoffTemplate(result.sourceFileId, window.localStorage, onUseInSlideDeckCreation, savedId); }
      catch { throw failure(null, "PPT_SELECTION"); }
      if ("error" in handed) throw handed;
      diagnostic("reuse", started);
    });
  }
  async function download(kind: "original" | "manifest") {
    if (!savedId) return;
    await handleOperation("download", async current => {
      const started = templateOperationStartedAt();
      const result = requireSuccess(await downloadPowerPointTemplateLibraryAction(savedId, kind));
      if (!current()) return;
      downloadTemplate(result.base64, result.mimeType, result.fileName);
      diagnostic("download", started); setStatus("Download prepared.");
    });
  }
  function selectFile(next: File) {
    const preserveName = !file && !sourceId && !definition && name.trim();
    generation.current++; setFile(next); setConfirmed(false); setSourceId(""); setSourceDigest(""); setSavedId(null);
    setDefinition(null); setManualReview(false); setError(null); setStatus(""); setDirty(true);
    if (!preserveName) setName(next.name.replace(/\.pptx$/i, "").slice(0, 160));
  }
  if (!recoveryReady) return <Alert severity="info" role="status">Checking for an unsaved PowerPoint draft...</Alert>;
  return <div className={styles.page}>
    <TabHeader eyebrow="Presentations" title="PowerPoint Templates" subtitle="Review extracted slide text and save classifications. Standard download fills the original deck by position; choose Match slides by role in Slide Deck Creation to use your classifications. Slides need editable text, and slide and bullet capacity limits apply. Image previews are not available." />
    <p className={styles.helperText}>Unsaved names and classifications can be recovered in this browser for this account. Recovery is cleared on sign-out. Source files and slide text are not saved here.</p>
    {recoveryMessage && <Alert severity="info">{recoveryMessage}</Alert>}
    {recoveryBlocked && <Alert severity="warning">New edits cannot be recovered until the previous recovery record is resolved. <Button size="small" onClick={() => { try { localStorage.removeItem(recoveryKey(userId)); setRecoveryBlocked(false); setRecoveryMessage(""); } catch { setRecoveryWriteFailed(true); } }}>Discard old recovery record</Button></Alert>}
    {recoveryWriteFailed && <Alert severity="warning">Draft recovery could not be saved in this browser. Keep this page open until your changes are saved.</Alert>}
    <div className={styles.workspace}>
      <section className={styles.panel} aria-labelledby="ppt-template-heading">
        <header className={styles.panelHeader}>
          <div><h2 id="ppt-template-heading" className={styles.panelTitle}>Add a presentation</h2><p className={styles.panelDescription}>Upload a deck, then classify the extracted slides.</p></div>
        </header>
        <div className={styles.formStack}>
          <TextField label={savedId ? "Library name" : "Template name"} value={name} slotProps={{ htmlInput: { maxLength: 160, "aria-describedby": busy ? "ppt-template-status" : undefined } }} disabled={busy} onChange={event => { setName(event.target.value); setDirty(true); }} />
          <Button component="label" variant="outlined" disabled={busy} aria-describedby={busy ? "ppt-template-status" : undefined}>Choose PowerPoint source (.pptx)<input type="file" accept=".pptx" hidden disabled={busy} onChange={event => {
            const next = event.target.files?.[0]; event.target.value = "";
            if (next) { if (dirty && (file || sourceId || definition)) setPending({ kind: "file", file: next }); else selectFile(next); }
          }} /></Button>
          {file && <p className={styles.helperText}>Selected: {file.name}</p>}
          {file && <FormControlLabel control={<Checkbox checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />} label="Use this upload as a template" />}
          {savedId && !file && <p className={styles.helperText}>Using the source saved with this library. Choose a file to start a different template.</p>}
          <Button variant={definition ? "outlined" : "contained"} type="button" disabled={busy || (!sourceId && (!file || !confirmed)) || !name.trim()} aria-describedby={busy ? "ppt-template-status" : "ppt-analyze-reason"} onClick={() => { if (definition && dirty) setPending({ kind: "analyze", mode: "auto" }); else void analyze(); }}>
            {savedId ? "Reanalyze saved source" : sourceId ? "Retry analysis" : "Upload and analyze"}
          </Button>
          <Button variant="outlined" type="button" disabled={busy || (!sourceId && (!file || !confirmed)) || !name.trim()} onClick={() => { if (definition && dirty) setPending({ kind: "analyze", mode: "manual" }); else void analyze("manual"); }}>Classify manually</Button>
          <p id="ppt-analyze-reason" className={styles.helperText}>{sourceId ? "Reanalysis uses the existing source and replaces the current classifications." : "To analyze, choose a .pptx file, confirm it as a template, and enter a name."}</p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="ppt-library-heading">
        <header className={styles.panelHeader}>
          <div><h2 id="ppt-library-heading" className={styles.panelTitle}>Saved libraries</h2><p className={styles.panelDescription}>Reopen a deck’s saved slide classifications.</p></div>
          <Button variant="outlined" type="button" disabled={busy || librariesLoading} aria-describedby={busy ? "ppt-template-status" : undefined} onClick={() => void refreshLibraries()}>Reload saved libraries</Button>
        </header>
        {librariesLoading && <p className={styles.helperText} role="status">Loading saved libraries...</p>}
        {librariesError && <Alert severity="error">{librariesError}</Alert>}
        {librariesTruncated && <Alert severity="warning">Only the most recently updated 5,000 library records are loaded. Search covers this partial list; older libraries may be missing.</Alert>}
        {librariesSnapshotUncertain && <Alert severity="info">Libraries were loaded in batches. Changes made while loading may not appear; reload if a library is missing.</Alert>}
        {!librariesLoading && librariesLoaded && !libraries.length && <p className={styles.emptyState}>No saved libraries yet.</p>}
        {!!libraries.length && <TextField label="Search saved libraries" value={libraryQuery} onChange={(event) => { setLibraryQuery(event.target.value); setLibraryPage(1); }} size="small" fullWidth />}
        {!!libraries.length && <p className={styles.helperText} role="status">{libraryResults.matches} matching {libraryResults.matches === 1 ? "library" : "libraries"}.</p>}
        {!!libraries.length && libraryResults.matches === 0 && <p className={styles.emptyState}>No libraries match this search.</p>}
        {!!libraryResults.items.length && <ul className={styles.libraryList}>{libraryResults.items.map(library => <li key={library.id}>
          <Button variant="text" fullWidth type="button" disabled={busy} aria-describedby={busy ? "ppt-template-status" : undefined} onClick={() => { if (dirty) setPending({ kind: "open", id: library.id }); else void open(library.id); }}>{libraryDisplayName(library, libraries)} - Open</Button>
        </li>)}</ul>}
        {libraryResults.pages > 1 && <Pagination count={libraryResults.pages} page={libraryResults.current} onChange={(_, page) => setLibraryPage(page)} disabled={busy} aria-label="Saved library pages" />}
      </section>

      {definition && <section className={`${styles.panel} ${styles.reviewPanel}`} aria-labelledby="ppt-review-heading">
        <header className={styles.panelHeader}>
          <div><h2 id="ppt-review-heading" className={styles.panelTitle}>Review source slides</h2><p className={styles.panelDescription}>Assign a role to each slide. Saving updates the library; the manifest download creates a local JSON copy.</p></div>
          <p className={styles.roleSummary}>Absent roles: {absentRoles(definition).join(", ") || "none"}.</p>
        </header>
        {manualReview && <Alert severity="info">All slides started as other for manual review. Assign the roles you want before saving.</Alert>}
        <TextField label="Search source slides" helperText="Search slide number or extracted text." size="small" fullWidth value={slideQuery} onChange={event => { setSlideQuery(event.target.value); setSlidePage(1); }} />
        <p className={styles.helperText} role="status">{visibleSlides.length ? `Showing ${((effectiveSlidePage - 1) * 6) + 1}-${Math.min(effectiveSlidePage * 6, visibleSlides.length)} of ${visibleSlides.length} matching slides.` : "No slides match this search."}</p>
        <div className={styles.slideGrid}>{sourceSlidePage(visibleSlides, effectiveSlidePage).map(slide => <article className={styles.slideCard} key={slide.id}>
          <div className={styles.slideHeading}><h3>Source slide {slide.ordinal}</h3><small>{slide.id}</small></div>
          <pre className={styles.slideText}>{slide.text || "No extracted text. Visual content has not been classified."}</pre>
          <TextField select fullWidth label={`Role for source slide ${slide.ordinal}`} slotProps={{ select: { "aria-describedby": busy ? "ppt-template-status" : !slide.text.trim() ? `ppt-role-reason-${slide.ordinal}` : undefined } }} disabled={busy} value={slide.role} onChange={event => {
            setDefinition(previous => previous && ({ ...previous, slides: previous.slides.map(item => item.id === slide.id ? { ...item, role: event.target.value as typeof item.role } : item) })); setDirty(true);
          }}>{SLIDE_ROLES.map(role => <MenuItem key={role} value={role}>{role}</MenuItem>)}</TextField>
          {!slide.text.trim() && <p id={`ppt-role-reason-${slide.ordinal}`} className={styles.helperText}>No text or image preview is available. You may assign a role, but this slide cannot be filled by the positional writer.</p>}
        </article>)}</div>
        {visibleSlides.length > 6 && <Pagination count={Math.ceil(visibleSlides.length / 6)} page={effectiveSlidePage} onChange={(_, page) => setSlidePage(page)} disabled={busy} aria-label="Source slide pages" />}
        <div className={styles.actionRow}>
          <button className={savedId ? styles.secondaryButton : styles.primaryButton} type="button" disabled={busy || !name.trim()} aria-describedby={busy ? "ppt-template-status" : !name.trim() ? "ppt-save-reason" : undefined} onClick={() => void save()}>Save classifications</button>
          <button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "ppt-template-status" : undefined} onClick={() => {
            const started = templateOperationStartedAt();
            try { downloadTemplate(btoa(unescape(encodeURIComponent(JSON.stringify(definition, null, 2)))), "application/json", "reviewed-classifications.json"); diagnostic("download", started); }
            catch { const result = failure(null, "PPT_DOWNLOAD"); setError(result); diagnostic("download", started, result); }
          }}>Download reviewed manifest</button>
        </div>
        {!name.trim() && <p id="ppt-save-reason" className={styles.helperText}>Enter a template name before saving classifications.</p>}
      </section>}

      {savedId && <section className={`${styles.panel} ${styles.reviewPanel}`} aria-label="Saved template actions">
        <header className={styles.panelHeader}><div><h2 className={styles.panelTitle}>Use or download this template</h2><p className={styles.panelDescription}>Reuse sends the original deck to Slide Deck Creation. Downloads save a local copy or manifest.</p></div></header>
        <div className={styles.actionRow}>
          <Button variant="contained" type="button" disabled={busy || dirty || !onUseInSlideDeckCreation} aria-describedby={busy ? "ppt-template-status" : dirty || !onUseInSlideDeckCreation ? "ppt-reuse-reason" : undefined} onClick={() => void reuse()}>Use in Slide Deck Creation</Button>
          <button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "ppt-template-status" : undefined} onClick={() => void download("original")}>Download original .pptx</button>
          <button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "ppt-template-status" : undefined} onClick={() => void download("manifest")}>Download saved manifest</button>
        </div>
        {(dirty || !onUseInSlideDeckCreation) && <p id="ppt-reuse-reason" className={styles.helperText}>{dirty ? "Save your changes before using this template." : "Slide Deck Creation is unavailable from this view."}</p>}
      </section>}
    </div>
    <p id="ppt-template-status" className={styles.status} role="status" aria-live="polite">{busy ? "Working..." : status}</p>
    {error && <p className={styles.error} role="alert">{error.error} ({error.code})</p>}
    <Dialog open={Boolean(pending)} onClose={() => setPending(null)} aria-labelledby="ppt-discard-title"><DialogTitle id="ppt-discard-title">Discard unsaved changes?</DialogTitle><DialogContent>The current template name and slide classifications have unsaved changes.</DialogContent><DialogActions><Button onClick={() => setPending(null)}>Cancel</Button><Button variant="contained" onClick={() => { const next = pending; setPending(null); if (!next) return; if (next.kind === "file") selectFile(next.file); else if (next.kind === "open") void open(next.id); else void analyze(next.mode); }}>Discard changes</Button></DialogActions></Dialog>
  </div>;
}
