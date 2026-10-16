"use client";

import { useEffect, useRef, useState } from "react";
import { abstractDocumentTemplateAction, downloadDocumentTemplateAction, getDocumentTemplateAction, listDocumentTemplatesAction, saveDocumentTemplateAction } from "@/app/actions/document-template-files";
import { PDF_DISCLOSURE, type DocumentDefinition, type DocumentTemplateMeta, type DocumentTemplateReview, type DocumentReviewParagraph, type DocumentUpload } from "@/lib/document-templates/types";
import { createDocumentRequestGate, documentOperation, downloadDocument, previewReviewedDocument, readDocumentFile, reviewDocumentProposal } from "./panel-logic";
import TabHeader from "../TabHeader";
import styles from "../template-tools.module.css";

type Props = { onUseInSlideDeckCreation?: () => void };
type OpenTemplate = DocumentTemplateReview;
export default function DocumentTemplates(props: Props) {
  void props;
  const [templates, setTemplates] = useState<DocumentTemplateMeta[]>([]);
  const [upload, setUpload] = useState<DocumentUpload | null>(null);
  const [opened, setOpened] = useState<OpenTemplate | null>(null);
  const [name, setName] = useState("");
  const [proposal, setProposal] = useState("");
  const [definition, setDefinition] = useState<DocumentDefinition | null>(null);
  const [review, setReview] = useState<DocumentReviewParagraph[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const gate = useRef(createDocumentRequestGate());
  const busyRef = useRef(false);
  useEffect(() => {
    const requests = gate.current;
    const token = requests.next();
    void documentOperation("load", listDocumentTemplatesAction).then((result) => { if (!requests.current(token)) return; if ("error" in result) setError(result.error); else setTemplates(result.templates); });
    return () => requests.invalidate();
  }, []);
  async function run(task: (token: number) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    const token = gate.current.next();
    try { await task(token); } catch { if (gate.current.current(token)) setError("The request failed. Try again."); }
    finally { if (gate.current.current(token)) setBusy(false); busyRef.current = false; }
  }
  async function choose(file: File) {
    await run(async (token) => {
      const result = await documentOperation<{ base64: string }>("upload", async () => {
        try { return { base64: await readDocumentFile(file) }; } catch (e) { return { error: e instanceof Error ? e.message : "Could not read that file.", code: "upload_failed" }; }
      });
      if (!gate.current.current(token)) return;
      if ("error" in result) { setError(result.error); return; }
      setUpload({ fileName: file.name, base64: result.base64 }); setOpened(null); setName(file.name.replace(/\.(docx|pdf)$/i, "")); setProposal(""); setDefinition(null); setReview([]); setValues({}); setStatus("File ready. Select Abstract to propose reusable fields.");
    });
  }
  function parseProposal(): unknown { try { return JSON.parse(proposal); } catch { throw new Error("Enter valid proposal JSON."); } }
  async function open(id: string) {
    await run(async (token) => {
      const result = await documentOperation("reuse", () => getDocumentTemplateAction(id));
      if (!gate.current.current(token)) return;
      if ("error" in result) { setError(result.error); return; }
      setReview(result.template.review); setOpened(result.template); setUpload(null); setName(result.template.name); setDefinition(result.template.definition); setProposal(JSON.stringify(result.template.definition, null, 2)); setValues({}); setStatus("Saved template reopened. Enter values or edit its proposal.");
    });
  }
  async function save() {
    await run(async (token) => {
      let edited: unknown;
      try { edited = parseProposal(); } catch { setError("Enter valid proposal JSON before saving."); return; }
      const result = await documentOperation("save", () => saveDocumentTemplateAction(name, upload ?? { fileName: "", base64: "" }, edited, opened?.id));
      if (!gate.current.current(token)) return;
      if ("error" in result) { setError(result.error); return; }
      setStatus("Template saved. Reopen it from your library to fill it.");
      setTemplates((previous) => [result.template, ...previous.filter((t) => t.id !== result.template.id)]);
      // Reopen through persistence rather than promoting component state to saved authority.
      const recovered = await documentOperation("reuse", () => getDocumentTemplateAction(result.template.id));
      if (!gate.current.current(token)) return;
      if ("error" in recovered) { setError(recovered.error); return; }
      setReview(recovered.template.review); setOpened(recovered.template); setUpload(null); setDefinition(recovered.template.definition); setProposal(JSON.stringify(recovered.template.definition, null, 2)); setValues({});
    });
  }
  async function download(kind: "original" | "template" | "filled") {
    await run(async (token) => {
      const result = await documentOperation("download", () => downloadDocumentTemplateAction(opened!.id, kind, values));
      if (!gate.current.current(token)) return;
      if ("error" in result) setError(result.error); else { downloadDocument(result.base64, result.fileName); setStatus("Document downloaded."); }
    });
  }
  async function downloadReviewed() {
    await run(async (token) => {
      const result = await documentOperation("download", () => previewReviewedDocument(upload, opened?.id, proposal));
      if (!gate.current.current(token)) return;
      if ("error" in result) setError(result.error); else { downloadDocument(result.base64, result.fileName); setStatus("Reviewed proposal downloaded. Saved template unchanged."); }
    });
  }
  const mergedReview = reviewDocumentProposal(review, proposal);
  return <div className={styles.page}>
    <TabHeader eyebrow="Presentations" title="Document Templates" subtitle="Upload a document, abstract its variable details into fields, review and save it, then fill it again without another model call." />
    <div className={styles.documentWorkspace}>
      <div className={styles.workflowColumn}>
        <section className={styles.panel} aria-labelledby="document-source-heading">
          <header className={styles.panelHeader}><div><h2 id="document-source-heading" className={styles.panelTitle}>Create from a document</h2><p className={styles.panelDescription}>Upload a source, then abstract reusable fields from its content.</p></div></header>
          <p className={styles.notice}>{PDF_DISCLOSURE}</p>
          <div className={styles.formStack}>
            <label className={styles.field}>Source document (DOCX or text-based PDF)<input className={styles.input} type="file" accept=".docx,.pdf" disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onChange={(event) => { const file = event.target.files?.[0]; if (file) void choose(file); event.target.value = ""; }} /></label>
            {upload && <div className={styles.selectedFile}><p>Selected: {upload.fileName}</p><button className={proposal ? styles.secondaryButton : styles.primaryButton} type="button" disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onClick={() => void run(async (token) => {
              const result = await documentOperation("analyze", () => abstractDocumentTemplateAction(upload));
              if (!gate.current.current(token)) return;
              if ("error" in result) setError(result.error); else { setReview(result.proposal.review); setDefinition(result.proposal.definition); setProposal(JSON.stringify(result.proposal.definition, null, 2)); setStatus("Review the proposed fields and complete paragraph replacements before saving."); }
            })}>Abstract document</button></div>}
          </div>
        </section>

        {proposal && <section className={styles.panel} aria-labelledby="document-review-heading">
          <header className={styles.panelHeader}><div><h2 id="document-review-heading" className={styles.panelTitle}>Review reusable template</h2><p className={styles.panelDescription}>Adjust the proposed fields and paragraph replacements before saving.</p></div></header>
          <div className={styles.formStack}>
            <label className={styles.field}>Template name<input className={styles.input} maxLength={180} value={name} disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onChange={(e) => setName(e.target.value)} /></label>
            <p className={styles.helperText}>Edit field labels, keys and complete replacement paragraphs below. Keep paragraph IDs unchanged. Omitted paragraphs remain untouched. Use {'{{field_key}}'} for declared fields. Save validates your edits.</p>
            <section className={styles.paragraphReview} aria-labelledby="document-paragraphs-heading">
              <header className={styles.panelHeader}><div><h3 id="document-paragraphs-heading" className={styles.subheading}>Document text and placeholders</h3><p className={styles.helperText}>Preview of current edits in source order. Save and proposal downloads validate edits.</p></div></header>
              <ol className={styles.paragraphList}>{mergedReview.map((paragraph) => <li key={paragraph.id} className={styles.paragraphCard}>
                <p className={styles.paragraphLabel}>{paragraph.id}: {paragraph.replaced ? "Proposed replacement" : "Retained text"}</p>
                <p className={styles.paragraphText}>{paragraph.templateText}</p>
                {paragraph.replaced && <details className={styles.originalText}><summary>Original paragraph</summary><p>{paragraph.sourceText}</p></details>}
              </li>)}</ol>
            </section>
            <label className={styles.field}>Template proposal (JSON)<textarea className={`${styles.input} ${styles.proposalInput}`} value={proposal} disabled={busy} onChange={(e) => setProposal(e.target.value)} /></label>
            <div className={styles.actionRow}><button className={styles.primaryButton} type="button" disabled={busy || !name.trim()} aria-describedby={busy ? "document-template-status" : !name.trim() ? "document-save-reason" : undefined} onClick={() => void save()}>Save template</button><button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "document-template-status" : "document-download-note"} onClick={() => void downloadReviewed()}>Download reviewed proposal DOCX</button></div>
            <p id="document-download-note" className={styles.helperText}>Save stores this template in your library. Download reviewed proposal creates a DOCX preview without saving it.</p>
            {!name.trim() && <p id="document-save-reason" className={styles.helperText}>Enter a template name before saving.</p>}
          </div>
        </section>}

        {opened && definition && <section className={styles.panel} aria-labelledby="document-fill-heading">
          <header className={styles.panelHeader}><div><h2 id="document-fill-heading" className={styles.panelTitle}>Fill saved template: {opened.name}</h2><p className={styles.panelDescription}>Downloads use the saved definition. Save any proposal edits first.</p></div></header>
          <div className={styles.formStack}>{definition.fields.map((field) => <label className={styles.field} key={field.key}>{field.label}<input className={styles.input} maxLength={4000} value={values[field.key] ?? ""} disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onChange={(e) => setValues((prior) => ({ ...prior, [field.key]: e.target.value }))} /></label>)}
            <div className={styles.actionRow}><button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onClick={() => void download("original")}>Download original</button><button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onClick={() => void download("template")}>Download unfilled DOCX</button><button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onClick={() => void download("filled")}>Download filled DOCX</button></div>
          </div>
        </section>}
      </div>

      <aside className={styles.libraryColumn}>
        <section className={`${styles.panel} ${styles.libraryPanel}`} aria-labelledby="document-library-heading">
          <header className={styles.panelHeader}><div><h2 id="document-library-heading" className={styles.panelTitle}>Saved document templates</h2><p className={styles.panelDescription}>Open a saved template to fill it again.</p></div><button className={styles.secondaryButton} type="button" disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onClick={() => void run(async (token) => { const result = await documentOperation("load", listDocumentTemplatesAction); if (!gate.current.current(token)) return; if ("error" in result) setError(result.error); else setTemplates(result.templates); })}>Refresh library</button></header>
          {templates.length === 0 && <p className={styles.emptyState}>No document templates loaded. Upload and abstract a document to create one.</p>}
          {!!templates.length && <ul className={styles.libraryList}>{templates.map((t) => <li key={t.id}><button className={styles.libraryButton} type="button" disabled={busy} aria-describedby={busy ? "document-template-status" : undefined} onClick={() => void open(t.id)}>{t.name}<span>{t.sourceKind.toUpperCase()}</span></button></li>)}</ul>}
        </section>
      </aside>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <p id="document-template-status" className={styles.status} role="status" aria-live="polite">{busy ? "Working..." : status}</p>
  </div>;
}

