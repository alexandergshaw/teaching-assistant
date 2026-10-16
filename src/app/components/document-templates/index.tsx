"use client";

import { useEffect, useRef, useState } from "react";
import { abstractDocumentTemplateAction, downloadDocumentTemplateAction, getDocumentTemplateAction, listDocumentTemplatesAction, saveDocumentTemplateAction } from "@/app/actions/document-template-files";
import { PDF_DISCLOSURE, type DocumentDefinition, type DocumentTemplateMeta, type DocumentTemplateReview, type DocumentReviewParagraph, type DocumentUpload } from "@/lib/document-templates/types";
import { createDocumentRequestGate, documentOperation, downloadDocument, previewReviewedDocument, readDocumentFile, reviewDocumentProposal } from "./panel-logic";

type Props = { onUseInSlideDeckCreation?: () => void };
type OpenTemplate = DocumentTemplateReview;
const button = "rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50";
const input = "w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:bg-slate-900 dark:text-slate-100";
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
  return <section className="space-y-6 p-4" aria-labelledby="document-templates-heading">
    <header><h2 id="document-templates-heading" className="text-xl font-semibold">Document Templates</h2><p className="mt-2 text-sm">Upload a document, abstract its variable details into fields, review and save it, then fill it again without another model call.</p></header>
    <p className="text-sm text-slate-600 dark:text-slate-300">{PDF_DISCLOSURE}</p>
    <label className="block">Source document (DOCX or text-based PDF)<input className="mt-2 block" type="file" accept=".docx,.pdf" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void choose(file); event.target.value = ""; }} /></label>
    {upload && <div className="space-y-2"><p>Selected: {upload.fileName}</p><button className={button} disabled={busy} onClick={() => void run(async (token) => {
      const result = await documentOperation("analyze", () => abstractDocumentTemplateAction(upload));
      if (!gate.current.current(token)) return;
      if ("error" in result) setError(result.error); else { setReview(result.proposal.review); setDefinition(result.proposal.definition); setProposal(JSON.stringify(result.proposal.definition, null, 2)); setStatus("Review the proposed fields and complete paragraph replacements before saving."); }
    })}>Abstract document</button></div>}
    {proposal && <div className="space-y-3"><h3 className="font-semibold">Review reusable template</h3><label className="block">Template name<input className={input} maxLength={180} value={name} disabled={busy} onChange={(e) => setName(e.target.value)} /></label><p className="text-sm">Edit field labels, keys and complete replacement paragraphs below. Keep paragraph IDs unchanged. Omitted paragraphs remain untouched. Use {'{{field_key}}'} for declared fields. Save validates your edits.</p><div><h4 className="font-semibold">Document text and placeholders</h4><p className="text-sm">Preview of current edits in source order. Save and proposal downloads validate edits.</p><ol className="space-y-3">{mergedReview.map((paragraph) => <li key={paragraph.id} className="rounded border border-slate-200 p-3"><p className="text-xs">{paragraph.id}: {paragraph.replaced ? "Proposed replacement" : "Retained text"}</p><p className="whitespace-pre-wrap">{paragraph.templateText}</p>{paragraph.replaced && <details><summary>Original paragraph</summary><p className="whitespace-pre-wrap">{paragraph.sourceText}</p></details>}</li>)}</ol></div><label className="block">Template proposal (JSON)<textarea className={`${input} min-h-64 font-mono text-sm`} value={proposal} disabled={busy} onChange={(e) => setProposal(e.target.value)} /></label><div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !name.trim()} onClick={() => void save()}>Save template</button><button className={button} disabled={busy} onClick={() => void downloadReviewed()}>Download reviewed proposal DOCX</button></div></div>}
    {opened && definition && <div className="space-y-3"><h3 className="font-semibold">Fill saved template: {opened.name}</h3><p className="text-sm">Downloads use the saved definition. Save any proposal edits first.</p>{definition.fields.map((field) => <label className="block" key={field.key}>{field.label}<input className={input} maxLength={4000} value={values[field.key] ?? ""} disabled={busy} onChange={(e) => setValues((prior) => ({ ...prior, [field.key]: e.target.value }))} /></label>)}<div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => void download("original")}>Download original</button><button className={button} disabled={busy} onClick={() => void download("template")}>Download unfilled DOCX</button><button className={button} disabled={busy} onClick={() => void download("filled")}>Download filled DOCX</button></div></div>}
    <div className="space-y-2"><h3 className="font-semibold">Saved document templates</h3><button className={button} disabled={busy} onClick={() => void run(async (token) => { const result = await documentOperation("load", listDocumentTemplatesAction); if (!gate.current.current(token)) return; if ("error" in result) setError(result.error); else setTemplates(result.templates); })}>Refresh library</button>{templates.length === 0 && <p className="text-sm">No document templates loaded. Upload and abstract a document to create one.</p>}<ul className="space-y-2">{templates.map((t) => <li key={t.id}><button className={button} disabled={busy} onClick={() => void open(t.id)}>{t.name} ({t.sourceKind.toUpperCase()})</button></li>)}</ul></div>
    {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}<p role="status" aria-live="polite">{busy ? "Working..." : status}</p>
  </section>;
}

