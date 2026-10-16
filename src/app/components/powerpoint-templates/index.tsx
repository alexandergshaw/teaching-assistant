"use client";

import { useEffect, useRef, useState } from "react";
import { uploadPowerPointTemplateAction, analyzePowerPointTemplateAction, listPowerPointTemplateLibrariesAction,
  getPowerPointTemplateLibraryAction, savePowerPointTemplateLibraryAction, reusePowerPointTemplateLibraryAction,
  downloadPowerPointTemplateLibraryAction } from "@/app/actions/powerpoint-template-library";
import { SLIDE_ROLES, absentRoles, failure, type LibraryDefinition, type LibraryMeta, type TemplateFailure } from "@/lib/powerpoint-template-library/types";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { recordPowerPointDiagnostic as diagnostic, templateOperationStartedAt, handoffTemplate, readTemplateFile, downloadTemplate } from "./panel-logic";

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
  return <section aria-labelledby="ppt-template-heading" style={{ display: "grid", gap: "var(--space-3)" }}>
    <h2 id="ppt-template-heading">PowerPoint Templates</h2>
    <p>Save source slide examples and correct their roles. Examples show extracted text, without image previews.
      Reuse selects the original file for positional fill in Slide Deck Creation; slide count and fit limits still apply.</p>
    <label>Template name <input value={name} maxLength={160} disabled={busy} onChange={event => setName(event.target.value)} /></label>
    <label>PowerPoint source (.pptx) <input type="file" accept=".pptx" disabled={busy} onChange={event => {
      generation.current++; setFile(event.target.files?.[0] ?? null); setConfirmed(false); setSourceId(""); setSavedId(null);
      setDefinition(null); setError(null); setStatus("");
      if (event.target.files?.[0]) setName(event.target.files[0].name.replace(/\.pptx$/i, "").slice(0, 160));
    }} /></label>
    <label><input type="checkbox" checked={confirmed} disabled={busy || !file} onChange={event => setConfirmed(event.target.checked)} /> Use this upload as a template</label>
    <button type="button" disabled={busy || (!sourceId && (!file || !confirmed)) || !name.trim()} onClick={() => void analyze()}>
      {sourceId ? "Retry analysis" : "Upload and analyze"}
    </button>
    <h3>Saved libraries</h3>
    <button type="button" disabled={busy} onClick={() => void handleOperation("load", async current => {
      const started = templateOperationStartedAt();
      const result = requireSuccess(await listPowerPointTemplateLibrariesAction());
      diagnostic("load", started);
      if (current()) { setLibraries(result.libraries); setStatus("Library list reloaded."); }
    })}>Reload saved libraries</button>
    {!libraries.length && <p>No saved libraries loaded.</p>}
    <ul>{libraries.map(library => <li key={library.id}><button type="button" disabled={busy} onClick={() => void open(library.id)}>{library.name}</button></li>)}</ul>
    {definition && <>
      <h3>Review source slides</h3>
      <p>Absent roles: {absentRoles(definition).join(", ") || "none"}.</p>
      {definition.slides.map(slide => <article key={slide.id}>
        <h4>Source slide {slide.ordinal}</h4><small>{slide.id}</small>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{slide.text || "No extracted text. Visual content has not been classified."}</pre>
        <label>Role for source slide {slide.ordinal} <select disabled={busy || !slide.text.trim()} value={slide.role} onChange={event => {
          setDefinition(previous => previous && ({ ...previous, slides: previous.slides.map(item => item.id === slide.id ? { ...item, role: event.target.value as typeof item.role } : item) }));
        }}>{SLIDE_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
      </article>)}
      <button type="button" disabled={busy || !name.trim()} onClick={() => void save()}>Save classifications</button>
      <button type="button" disabled={busy} onClick={() => {
        const started = templateOperationStartedAt();
        try { downloadTemplate(btoa(unescape(encodeURIComponent(JSON.stringify(definition, null, 2)))), "application/json", "reviewed-classifications.json"); diagnostic("download", started); }
        catch { const result = failure(null, "PPT_DOWNLOAD"); setError(result); diagnostic("download", started, result); }
      }}>Download reviewed manifest</button>
    </>}
    {savedId && <>
      <button type="button" disabled={busy || !onUseInSlideDeckCreation} onClick={() => void reuse()}>Use in Slide Deck Creation</button>
      <button type="button" disabled={busy} onClick={() => void download("original")}>Download original .pptx</button>
      <button type="button" disabled={busy} onClick={() => void download("manifest")}>Download saved manifest</button>
    </>}
    <p role="status" aria-live="polite">{busy ? "Working..." : status}</p>
    {error && <p role="alert">{error.error} ({error.code})</p>}
  </section>;
}
