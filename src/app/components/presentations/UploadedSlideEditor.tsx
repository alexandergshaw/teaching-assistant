"use client";

import { useMemo, useRef, useState } from "react";
import { Alert, Button, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import TabHeader from "../TabHeader";
import { checkFileWireBudget } from "@/lib/upload-budget";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import type { UploadedSlide, UploadedSlideParagraph } from "@/lib/presentations/uploaded-slide-editor";
import type { SlideGeometry, SlideObjectOperation, UploadedSlideObject } from "@/lib/presentations/uploaded-slide-objects";
import styles from "./uploaded-slide-editor.module.css";

type Operation = "upload" | "edit" | "regenerate" | "accept" | "discard" | "export";
type Candidate = { slideNumber: number; paragraphs: UploadedSlideParagraph[]; operations: SlideObjectOperation[]; sourceDigest: string };

function record(operation: Operation, outcome: "success" | "failure" | "discarded", error?: string) {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "presentations",
    operation: `uploaded_slide_${operation}`,
    label: `Uploaded slide ${operation}`,
    outcome,
    ...(error ? { error } : {}),
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("file_read"));
    reader.readAsDataURL(file);
  });
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function postEditor(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/presentations/uploaded-slide-editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !result || typeof result !== "object") {
    const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
      ? result.error
      : "The request failed. The working PowerPoint is unchanged.";
    throw new Error(message);
  }
  return result as Record<string, unknown>;
}

export default function UploadedSlideEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [workingBase64, setWorkingBase64] = useState("");
  const [slides, setSlides] = useState<UploadedSlide[]>([]);
  const [selectedNumber, setSelectedNumber] = useState(1);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [instruction, setInstruction] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState("");
  const [objectEdit, setObjectEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Operation | null>(null);
  const [error, setError] = useState("");
  const selected = slides[selectedNumber - 1];
  const dirty = useMemo(() => Boolean(selected?.paragraphs.some((paragraph) => paragraph.editable !== false && edits[paragraph.id] !== paragraph.text)), [selected, edits]);
  const hasUnsavedEdits = useMemo(() => slides.some((slide) => slide.paragraphs.some((paragraph) => paragraph.editable !== false && edits[paragraph.id] !== paragraph.text)), [slides, edits]);

  async function upload(file?: File) {
    if (!file) return;
    setError("");
    if (!/\.pptx$/i.test(file.name)) {
      setError("Choose a PowerPoint file ending in .pptx.");
      record("upload", "failure", "file_type");
      return;
    }
    const budget = checkFileWireBudget(file.size, "This PowerPoint");
    if (!budget.ok) {
      setError(budget.error ?? "This PowerPoint is too large to upload.");
      record("upload", "failure", "file_size");
      return;
    }
    setBusy("upload");
    try {
      const base64 = await readFileAsBase64(file);
      const result = await postEditor({ op: "inspect", base64 });
      if (!Array.isArray(result.slides) || result.slides.length === 0) throw new Error("This PowerPoint has no slides the editor can open.");
      const nextSlides = result.slides as UploadedSlide[];
      const initialEdits = Object.fromEntries(nextSlides.flatMap((slide) => slide.paragraphs.map((paragraph) => [paragraph.id, paragraph.text])));
      setWorkingBase64(base64);
      setSlides(nextSlides);
      setEdits(initialEdits);
      setFileName(file.name);
      setSelectedNumber(1);
      setCandidate(null);
      record("upload", "success");
    } catch (cause) {
      const message = cause instanceof Error && cause.message !== "file_read" ? cause.message : "Could not read that PowerPoint. Select it again.";
      setError(message);
      record("upload", "failure", message.includes("large") ? "file_size" : "file_invalid");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function apply(slideNumber: number, paragraphs: UploadedSlideParagraph[], operation: "edit" | "accept", operations: SlideObjectOperation[] = [], expectedDigest?: string) {
    if (!workingBase64) return;
    setBusy(operation);
    setError("");
    try {
      const result = await postEditor({ op: "apply", base64: workingBase64, slideNumber, replacements: paragraphs, operations, ...(expectedDigest ? { expectedDigest } : {}) });
      if (typeof result.base64 !== "string" || !Array.isArray(result.slides)) throw new Error("The updated PowerPoint could not be returned.");
      const nextSlides = result.slides as UploadedSlide[];
      setWorkingBase64(result.base64);
      setSlides(nextSlides);
      setEdits(Object.fromEntries(nextSlides.flatMap((slide) => slide.paragraphs.map((paragraph) => [paragraph.id, paragraph.text]))));
      setCandidate(null);
      setSelectedObjectId("");
      setObjectEdit({});
      record(operation, "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The slide could not be saved.";
      setError(message);
      record(operation, "failure", operation === "accept" ? "candidate_apply" : "edit_apply");
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    const hasEditableContent = Boolean(selected?.paragraphs.some((paragraph) => paragraph.editable !== false) || selected?.objects?.some((object) => object.editable));
    if (!selected || !hasEditableContent || !instruction.trim() || hasUnsavedEdits) return;
    setBusy("regenerate");
    setError("");
    try {
      const result = await postEditor({ op: "regenerate", base64: workingBase64, slideNumber: selectedNumber, instruction });
      if (!Array.isArray(result.paragraphs) || !Array.isArray(result.operations) || typeof result.sourceDigest !== "string") throw new Error("The AI returned an unusable slide.");
      setCandidate({ slideNumber: selectedNumber, paragraphs: result.paragraphs as UploadedSlideParagraph[], operations: result.operations as SlideObjectOperation[], sourceDigest: result.sourceDigest });
      record("regenerate", "success");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The AI could not regenerate this slide.";
      setError(message);
      record("regenerate", "failure", "model_failure");
    } finally {
      setBusy(null);
    }
  }

  function discardCandidate() {
    setCandidate(null);
    record("discard", "discarded");
  }

  function exportDeck() {
    if (!workingBase64 || dirty || candidate) return;
    try {
      const url = URL.createObjectURL(new Blob([decodeBase64(workingBase64)], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName.replace(/\.pptx$/i, "") + "-edited.pptx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      record("export", "success");
    } catch {
      setError("The edited PowerPoint could not be downloaded. Your working copy remains available.");
      record("export", "failure", "download_failed");
    }
  }

  const selectedObject = selected?.objects?.find((object) => object.id === selectedObjectId);
  function saveObjectEdit(object: UploadedSlideObject) {
    if (!object.geometry || !workingBase64 || hasUnsavedEdits) return;
    const geometry: SlideGeometry = {
      x: Number(objectEdit.x ?? object.geometry.x), y: Number(objectEdit.y ?? object.geometry.y),
      width: Number(objectEdit.width ?? object.geometry.width), height: Number(objectEdit.height ?? object.geometry.height),
      rotation: Number(objectEdit.rotation ?? object.geometry.rotation),
    };
    const operations: SlideObjectOperation[] = [{ objectId: object.id, kind: object.kind as "shape" | "picture", action: "setGeometry", geometry }];
    if (object.kind === "shape" && objectEdit.fillColor) operations.push({ objectId: object.id, kind: "shape", action: "setFill", fill: { color: objectEdit.fillColor.startsWith("#") ? objectEdit.fillColor : `#${objectEdit.fillColor}`, transparency: Number(objectEdit.fillTransparency ?? 0) } });
    if (object.kind === "picture" && objectEdit.altText !== undefined) operations.push({ objectId: object.id, kind: "picture", action: "setAltText", altText: objectEdit.altText });
    void apply(selectedNumber, [], "edit", operations);
  }

  return (
    <div className={styles.panel}>
      <TabHeader eyebrow="Presentations" title="PowerPoint Editor" subtitle="Upload a deck, edit supported slide objects, or ask AI to propose changes. Review and accept before downloading." />
      <Paper className={styles.uploadCard} variant="outlined">
        <div>
          <Typography variant="h6">Your working presentation</Typography>
              <Typography color="text.secondary">Upload a .pptx within the app file limit. Your working copy stays in this browser session.</Typography>
        </div>
        <input ref={inputRef} hidden type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => void upload(event.target.files?.[0])} />
        <Button variant="contained" onClick={() => inputRef.current?.click()} disabled={busy !== null}>{workingBase64 ? "Replace deck" : "Upload PowerPoint"}</Button>
      </Paper>

      {error && <Alert severity="error" role="alert" className={styles.message}>{error}</Alert>}
      {busy && <div className={styles.busy} role="status"><CircularProgress size={18} /> {busy === "regenerate" ? "Regenerating selected slide…" : busy === "upload" ? "Opening presentation…" : "Updating presentation…"}</div>}

      {slides.length > 0 && (
        <div className={styles.workspace}>
          <Paper variant="outlined" className={styles.slideList} aria-label="Slides">
            <Typography variant="subtitle1">{fileName}</Typography>
            <div className={styles.slideButtons} role="group" aria-label="Choose a slide">
              {slides.map((slide) => (
                <Button key={slide.number} variant={slide.number === selectedNumber ? "contained" : "text"} onClick={() => { setSelectedNumber(slide.number); setError(""); }} disabled={busy !== null || candidate !== null} aria-pressed={slide.number === selectedNumber}>
                  <span className={styles.slideButtonText}><strong>Slide {slide.number}</strong><span>{slide.title}</span></span>
                </Button>
              ))}
            </div>
          </Paper>

          <Paper variant="outlined" className={styles.editor}>
                <div className={styles.editorHeader}><div><Typography variant="h5">Slide {selectedNumber}</Typography><Typography color="text.secondary">Edit supported native objects. The exported deck retains its PowerPoint structure.</Typography></div><Button onClick={exportDeck} variant="outlined" disabled={!workingBase64 || hasUnsavedEdits || candidate !== null || busy !== null}>Download edited deck</Button></div>
            <Paper variant="outlined" className={styles.objectInventory} aria-label="Slide object inventory">
              <Typography variant="h6">Slide objects</Typography>
              <Typography color="text.secondary">Layout: {selected?.layout?.name ?? "Not identified"}. Layout editing is not available yet. Notes: {selected?.notes ? "present (read-only)" : "none found"}.</Typography>
              {selected?.notes && <Typography color="text.secondary">Notes: {selected.notes.text || "No readable notes text."}</Typography>}
              <div className={styles.objectButtons} role="list" aria-label="Objects on this slide">
                {(selected?.objects ?? []).map((object) => <Button key={object.id} role="listitem" variant={selectedObjectId === object.id ? "contained" : "outlined"} onClick={() => { setSelectedObjectId(object.id); setObjectEdit({}); }} disabled={busy !== null || candidate !== null}>
                  {object.kind}: {object.name}{object.editable ? " (editable)" : " (read-only)"}
                </Button>)}
              </div>
              {selectedObject && !selectedObject.editable && <Alert severity="info">{selectedObject.reason}</Alert>}
              {selectedObject?.editable && selectedObject.geometry && <div className={styles.objectEditor}>
                <Typography variant="subtitle1">Edit {selectedObject.name}</Typography>
                {(["x", "y", "width", "height", "rotation"] as const).map((key) => <TextField key={key} type="number" label={key} value={objectEdit[key] ?? selectedObject.geometry?.[key] ?? ""} onChange={(event) => setObjectEdit((current) => ({ ...current, [key]: event.target.value }))} disabled={busy !== null || candidate !== null} />)}
                {selectedObject.kind === "shape" && <><TextField label="Solid fill color (hex)" value={objectEdit.fillColor ?? selectedObject.fill?.color ?? ""} onChange={(event) => setObjectEdit((current) => ({ ...current, fillColor: event.target.value }))} disabled={busy !== null || candidate !== null} /><TextField type="number" label="Fill transparency (%)" value={objectEdit.fillTransparency ?? selectedObject.fill?.transparency ?? 0} onChange={(event) => setObjectEdit((current) => ({ ...current, fillTransparency: event.target.value }))} disabled={busy !== null || candidate !== null} /></>}
                {selectedObject.kind === "picture" && <TextField fullWidth label="Alternative text" value={objectEdit.altText ?? selectedObject.altText ?? ""} onChange={(event) => setObjectEdit((current) => ({ ...current, altText: event.target.value }))} disabled={busy !== null || candidate !== null} />}
                <Button variant="contained" onClick={() => saveObjectEdit(selectedObject)} disabled={busy !== null || candidate !== null || hasUnsavedEdits}>Save object changes</Button>
              </div>}
            </Paper>
            {!selected?.paragraphs.some((paragraph) => paragraph.editable !== false) && !selected?.objects?.some((object) => object.editable) ? <Alert severity="info">This slide has no supported editable objects. You can inspect retained objects above and export the deck unchanged.</Alert> : (
              <>
                <Alert severity="info">Unsupported objects remain in the deck and are read-only. Charts, SmartArt, groups, and notes are identified where possible but cannot yet be edited here. Saving text in a paragraph with mixed inline formatting may flatten that paragraph&apos;s formatting.</Alert>
                {selected.paragraphs.some((paragraph) => paragraph.editable !== false) && <>
                  <div className={styles.paragraphs}>
                    {selected.paragraphs.map((paragraph, index) => paragraph.editable === false ? <Alert key={paragraph.id} severity="info"><strong>Paragraph {index + 1} is read-only.</strong> Its PowerPoint structure is outside the safe text-editing subset: {paragraph.text}</Alert> : <TextField key={paragraph.id} fullWidth multiline minRows={index === 0 ? 2 : 3} label={`Text paragraph ${index + 1}`} value={edits[paragraph.id] ?? paragraph.text} onChange={(event) => setEdits((current) => ({ ...current, [paragraph.id]: event.target.value }))} disabled={busy !== null || candidate !== null} />)}
                  </div>
                  <div className={styles.actions}><Button variant="contained" onClick={() => void apply(selectedNumber, selected.paragraphs.filter((paragraph) => paragraph.editable !== false).map((paragraph) => ({ id: paragraph.id, text: edits[paragraph.id] ?? paragraph.text })), "edit")} disabled={!dirty || busy !== null || candidate !== null}>Save slide text</Button></div>
                </>}
                <Paper variant="outlined" className={styles.regeneration}>
                  <Typography variant="h6">Regenerate with AI</Typography>
                  <TextField fullWidth multiline minRows={2} maxRows={5} label="How should this slide change?" placeholder="For example: make the example more concrete for first-year students" value={instruction} onChange={(event) => setInstruction(event.target.value)} disabled={busy !== null || candidate !== null} />
                  <Button variant="outlined" onClick={() => void regenerate()} disabled={!instruction.trim() || busy !== null || candidate !== null || hasUnsavedEdits}>Generate candidate</Button>
                </Paper>
              </>
            )}

            {candidate && (
              <Paper variant="outlined" className={styles.candidate} aria-live="polite">
                <Typography variant="h6">AI candidate for slide {candidate.slideNumber}</Typography>
                <Typography color="text.secondary">Review each text and object change. The working deck changes only when you accept the candidate.</Typography>
                {candidate.paragraphs.map((paragraph, index) => <div key={paragraph.id} className={styles.candidateParagraph}><strong>Paragraph {index + 1}</strong><p>Before: {selected?.paragraphs.find((item) => item.id === paragraph.id)?.text ?? ""}</p><p>Proposed: {paragraph.text}</p></div>)}
                {candidate.operations.map((candidateOperation, index) => {
                  const object = selected?.objects?.find((item) => item.id === candidateOperation.objectId);
                  const before = object ? candidateOperation.action === "setGeometry" ? object.geometry : candidateOperation.action === "setFill" ? object.fill : object.altText : undefined;
                  const after = candidateOperation.action === "setGeometry" ? candidateOperation.geometry : candidateOperation.action === "setFill" ? candidateOperation.fill : candidateOperation.altText;
                  return <div key={`${candidateOperation.objectId}-${index}`} className={styles.candidateParagraph}><strong>{object?.name ?? candidateOperation.kind}</strong><p>Before: {JSON.stringify(before)}</p><p>Proposed: {JSON.stringify(after)}</p></div>;
                })}
                <div className={styles.actions}><Button variant="contained" onClick={() => void apply(candidate.slideNumber, candidate.paragraphs, "accept", candidate.operations, candidate.sourceDigest)} disabled={busy !== null}>Accept candidate</Button><Button onClick={discardCandidate} disabled={busy !== null}>Discard</Button></div>
              </Paper>
            )}
          </Paper>
        </div>
      )}
    </div>
  );
}
