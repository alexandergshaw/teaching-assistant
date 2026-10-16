"use client";

import { useEffect, useRef, useState } from "react";
import { uploadPowerPointTemplateAction, analyzePowerPointTemplateAction, listPowerPointTemplateLibrariesAction,
  getPowerPointTemplateLibraryAction, savePowerPointTemplateLibraryAction, reusePowerPointTemplateLibraryAction,
  downloadPowerPointTemplateLibraryAction } from "@/app/actions/powerpoint-template-library";
import { SLIDE_ROLES, absentRoles, failure, type LibraryDefinition, type LibraryMeta, type TemplateFailure } from "@/lib/powerpoint-template-library/types";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { recordPowerPointDiagnostic as diagnostic, templateOperationStartedAt, handoffTemplate, readTemplateFile, downloadTemplate } from "./panel-logic";
import TabHeader from "../TabHeader";
import styles from "../template-tools.module.css";

export default function PowerPointTemplates({ onUseInSlideDeckCreation }: { onUseInSlideDeckCreation?: () => void }) {
  const [libraries, setLibraries] = useState<LibraryMeta[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [name, setName] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [definition, setDefinition] = useState<LibraryDefinition | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TemplateFailure | null>(null);
  const [status, setStatus] = useState("");
  const alive = useRef(true);
  const generation = useRef(0);
  const locked = useRef(false);
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
    let cancelled = false;
    const initialGeneration = generation.current;
    const started = templateOperationStartedAt();
    void listPowerPointTemplateLibrariesAction().then(result => {
      diagnostic("load", started, "error" in result ? result : null);
      if (cancelled || generation.current !== initialGeneration) return;
      if ("error" in result) setError(result); else setLibraries(result.libraries);
    }).catch(() => {
      const result = failure(null, "PPT_STORAGE");
      diagnostic("load", started, result);
      if (!cancelled && generation.current === initialGeneration) setError(result);
    });
    return () => { cancelled = true; alive.current = false; generation.current = initialGeneration + 1; };
  }, []);
  function requireSuccess<T extends object>(result: T): Exclude<T, TemplateFailure> {
    if ("error" in result) throw result;
    return result as Exclude<T, TemplateFailure>;
  }
  async function analyze() {
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
      const result = requireSuccess(await analyzePowerPointTemplateAction(id));
      diagnostic("analyze", started);
      if (!current()) return;
      setDefinition(result.definition); setStatus("Review the source slides and classifications, then save.");
    });
  }
  async function open(id: string) {
    await handleOperation("load", async current => {
      const started = templateOperationStartedAt();
      const result = requireSuccess(await getPowerPointTemplateLibraryAction(id));
      diagnostic("load", started);
      if (!current()) return;
      setSavedId(result.library.id); setSourceId(result.library.sourceFileId);
      setName(result.library.name); setDefinition(result.library.definition);
      setFile(null); setConfirmed(false); setStatus("Saved library reopened.");
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
      setLibraries(previous => [result.library, ...previous.filter(item => item.id !== result.library.id)]);
      setDefinition(result.library.definition); setStatus("Classifications saved.");
    });
  }
  async function reuse() {
    if (!savedId || !onUseInSlideDeckCreation) return;
    await handleOperation("reuse", async current => {
      const started = templateOperationStartedAt();
      const result = requireSuccess(await reusePowerPointTemplateLibraryAction(savedId));
      if (!current()) return;
      let handed;
      try { handed = handoffTemplate(result.sourceFileId, window.localStorage, onUseInSlideDeckCreation); }
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
  return <div className={styles.page}>
    <TabHeader eyebrow="Presentations" title="PowerPoint Templates" subtitle="Save source slide examples and correct their roles. Examples show extracted text, without image previews. Reuse selects the original file for positional fill in Slide Deck Creation; slide count and fit limits still apply." />
    <div className={styles.workspace}>
      <section className={styles.panel} aria-labelledby="ppt-template-heading">
        <header className={styles.panelHeader}>
          <div><h2 id="ppt-template-heading" className={styles.panelTitle}>Add a presentation</h2><p className={styles.panelDescription}>Upload a deck, then classify the extracted slides.</p></div>
        </header>
        <div className={styles.formStack}>
          <label className={styles.field}>Template name<input className={styles.input} value={name} maxLength={160} disabled={busy} onChange={event => setName(event.target.value)} /></label>
          <label className={styles.field}>PowerPoint source (.pptx)<input className={styles.input} type="file" accept=".pptx" disabled={busy} onChange={event => {
            generation.current++; setFile(event.target.files?.[0] ?? null); setConfirmed(false); setSourceId(""); setSavedId(null);
            setDefinition(null); setError(null); setStatus("");
            if (event.target.files?.[0]) setName(event.target.files[0].name.replace(/\.pptx$/i, "").slice(0, 160));
          }} /></label>
          <label className={styles.checkField}><input type="checkbox" checked={confirmed} disabled={busy || !file} aria-describedby={busy ? "ppt-template-status" : !file ? "ppt-confirm-reason" : undefined} onChange={event => setConfirmed(event.target.checked)} /> <span>Use this upload as a template</span></label>
          {!file && <p id="ppt-confirm-reason" className={styles.helperText}>Choose a PowerPoint file before confirming it as a template.</p>}
          <button className={definition ? styles.secondaryButton : styles.primaryButton} type="button" disabled={busy || (!sourceId && (!file || !confirmed)) || !name.trim()} aria-describedby={busy ? "ppt-template-status" : "ppt-analyze-reason"} onClick={() => void analyze()}>
            {sourceId ? "Retry analysis" : "Upload and analyze"}
          </button>
          <p id="ppt-analyze-reason" className={styles.helperText}>To analyze, choose a .pptx file, confirm it as a template, and enter a name.</p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="ppt-library-heading">
        <header className={styles.panelHeader}>
          <div><h2 id="ppt-library-heading" className={styles.panelTitle}>Saved libraries</h2><p className={styles.panelDescription}>Reopen a deck’s saved slide classifications.</p></div>
          <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => void handleOperation("load", async current => {
            const started = templateOperationStartedAt();
            const result = requireSuccess(await listPowerPointTemplateLibrariesAction());
            diagnostic("load", started);
            if (current()) { setLibraries(result.libraries); setStatus("Library list reloaded."); }
          })}>Reload saved libraries</button>
        </header>
        {!libraries.length && <p className={styles.emptyState}>No saved libraries loaded.</p>}
        {!!libraries.length && <ul className={styles.libraryList}>{libraries.map(library => <li key={library.id}>
          <button className={styles.libraryButton} type="button" disabled={busy} onClick={() => void open(library.id)}>{library.name}<span>Open</span></button>
        </li>)}</ul>}
      </section>

      {definition && <section className={`${styles.panel} ${styles.reviewPanel}`} aria-labelledby="ppt-review-heading">
        <header className={styles.panelHeader}>
          <div><h2 id="ppt-review-heading" className={styles.panelTitle}>Review source slides</h2><p className={styles.panelDescription}>Assign a role to each slide. Saving updates the library; the manifest download creates a local JSON copy.</p></div>
          <p className={styles.roleSummary}>Absent roles: {absentRoles(definition).join(", ") || "none"}.</p>
        </header>
        <div className={styles.slideGrid}>{definition.slides.map(slide => <article className={styles.slideCard} key={slide.id}>
          <div className={styles.slideHeading}><h3>Source slide {slide.ordinal}</h3><small>{slide.id}</small></div>
          <pre className={styles.slideText}>{slide.text || "No extracted text. Visual content has not been classified."}</pre>
          <label className={styles.field}>Role for source slide {slide.ordinal}<select className={styles.input} aria-describedby={busy ? "ppt-template-status" : !slide.text.trim() ? `ppt-role-reason-${slide.ordinal}` : undefined} disabled={busy || !slide.text.trim()} value={slide.role} onChange={event => {
            setDefinition(previous => previous && ({ ...previous, slides: previous.slides.map(item => item.id === slide.id ? { ...item, role: event.target.value as typeof item.role } : item) }));
          }}>{SLIDE_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
          {!slide.text.trim() && <p id={`ppt-role-reason-${slide.ordinal}`} className={styles.helperText}>This slide has no extracted text, so its role cannot be classified here.</p>}
        </article>)}</div>
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
          <button className={styles.primaryButton} type="button" disabled={busy || !onUseInSlideDeckCreation} aria-describedby={busy ? "ppt-template-status" : !onUseInSlideDeckCreation ? "ppt-reuse-reason" : undefined} onClick={() => void reuse()}>Use in Slide Deck Creation</button>
          <button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "ppt-template-status" : undefined} onClick={() => void download("original")}>Download original .pptx</button>
          <button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "ppt-template-status" : undefined} onClick={() => void download("manifest")}>Download saved manifest</button>
        </div>
        {!onUseInSlideDeckCreation && <p id="ppt-reuse-reason" className={styles.helperText}>Slide Deck Creation is unavailable from this view.</p>}
      </section>}
    </div>
    <p id="ppt-template-status" className={styles.status} role="status" aria-live="polite">{busy ? "Working..." : status}</p>
    {error && <p className={styles.error} role="alert">{error.error} ({error.code})</p>}
  </div>;
}
