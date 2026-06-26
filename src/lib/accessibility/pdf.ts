// Server-only PDF accessibility checks. Reads the document catalog/metadata with
// pdf-lib for the core UDOIT-style PDF checks: tagged, language, and title. PDF
// remediation isn't possible in-app (needs Acrobat), so these are flag-only.

import { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } from "pdf-lib";
import type { Issue } from "./types";

function flag(
  ruleId: string,
  severity: Issue["severity"],
  message: string,
  wcag: string,
  help: string,
  fixKind: Issue["fixKind"] = "flag"
): Issue {
  return { ruleId, severity, message, wcag, help, locator: { selector: "", snippet: "" }, fixKind };
}

// Walk a PDF structure tree looking for a heading element (/S = H or H1–H6).
// Catches tagged PDFs that still lack headings, not just fully-untagged ones.
function hasHeadingStructure(structRoot: PDFDict): boolean {
  let found = false;
  let visited = 0;
  const walk = (node: unknown, depth: number): void => {
    if (found || depth > 60 || visited > 8000 || node == null) return;
    visited += 1;
    if (node instanceof PDFArray) {
      for (let i = 0; i < node.size() && !found; i += 1) walk(node.lookup(i), depth + 1);
      return;
    }
    if (node instanceof PDFDict) {
      const s = node.lookup(PDFName.of("S"));
      if (s instanceof PDFName && /^H[1-6]?$/.test(String(s).replace(/^\//, ""))) {
        found = true;
        return;
      }
      walk(node.lookup(PDFName.of("K")), depth + 1);
    }
  };
  walk(structRoot.lookup(PDFName.of("K")), 0);
  return found;
}

/** Check a PDF for tagging, language, and title (flag-only). */
export async function scanPdf(buffer: Buffer): Promise<Issue[]> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  } catch {
    return []; // unreadable/encrypted PDF — skip rather than fail the file scan
  }

  const issues: Issue[] = [];
  const catalog = doc.catalog;

  // Tagged? Catalog /MarkInfo << /Marked true >>
  let tagged = false;
  const markInfo = catalog.lookupMaybe(PDFName.of("MarkInfo"), PDFDict);
  if (markInfo) tagged = String(markInfo.lookup(PDFName.of("Marked"))) === "true";
  if (!tagged) {
    issues.push(flag(
      "pdf-untagged",
      "error",
      "PDF is not tagged for accessibility.",
      "1.3.1",
      "Tagging can't be done here (it needs a real structure tree). In Acrobat: Accessibility > Autotag Document, or fix the source Word file's headings and re-export as a tagged PDF."
    ));
  }

  // Headings for structure: flag when there's no tagged structure at all, or it
  // has no heading elements (a tagged-but-headingless PDF, e.g. a Word export).
  const structRoot = catalog.lookupMaybe(PDFName.of("StructTreeRoot"), PDFDict);
  if (!structRoot || !hasHeadingStructure(structRoot)) {
    issues.push(flag(
      "pdf-no-structure",
      "error",
      "PDF does not include headings for structure.",
      "1.3.1",
      "Marking headings needs a tagged structure tree, which can't be authored here. Use Acrobat's reading-order tools, or add headings in the source Word file and re-export."
    ));
  }

  // Document language /Lang — fixable in-app.
  const lang = catalog.lookup(PDFName.of("Lang"));
  const langStr = lang instanceof PDFString || lang instanceof PDFHexString ? lang.decodeText() : "";
  if (!langStr.trim()) {
    issues.push(flag("pdf-no-lang", "warning", "PDF has no document language set.", "3.1.1", "Set the document language so screen readers use the right pronunciation.", "edit"));
  }

  // Document title (and ideally displayed instead of the file name) — fixable in-app.
  if (!(doc.getTitle() ?? "").trim()) {
    issues.push(flag("pdf-no-title", "warning", "PDF is missing a document title.", "2.4.2", "Add a title and set it to display instead of the file name.", "edit"));
  }

  return issues;
}

/** Read a PDF's current language + title (to prefill the PDF fix editor). */
export async function readPdfMeta(buffer: Buffer): Promise<{ lang: string; title: string }> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  } catch {
    return { lang: "", title: "" };
  }
  const lang = doc.catalog.lookup(PDFName.of("Lang"));
  const langStr = lang instanceof PDFString || lang instanceof PDFHexString ? lang.decodeText() : "";
  return { lang: langStr.trim(), title: (doc.getTitle() ?? "").trim() };
}

/**
 * Set a PDF's document language (/Lang) and/or title, the two accessibility
 * properties that can be authored without a structure tree. Returns new bytes.
 * (Tagging and heading structure are intentionally not touched — claiming them
 * without real tags would mislead assistive tech.)
 */
export async function setPdfAccessibility(buffer: Buffer, fixes: { lang?: string; title?: string }): Promise<Buffer> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  if (fixes.lang?.trim()) doc.catalog.set(PDFName.of("Lang"), PDFString.of(fixes.lang.trim()));
  if (fixes.title?.trim()) doc.setTitle(fixes.title.trim(), { showInWindowTitleBar: true });
  return Buffer.from(await doc.save());
}
