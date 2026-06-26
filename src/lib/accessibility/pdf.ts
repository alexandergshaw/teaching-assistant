// Server-only PDF accessibility checks. Reads the document catalog/metadata with
// pdf-lib for the core UDOIT-style PDF checks: tagged, language, and title. PDF
// remediation isn't possible in-app (needs Acrobat), so these are flag-only.

import { PDFDocument, PDFName, PDFDict, PDFString, PDFHexString } from "pdf-lib";
import type { Issue } from "./types";

function flag(ruleId: string, severity: Issue["severity"], message: string, wcag: string, help: string): Issue {
  return { ruleId, severity, message, wcag, help, locator: { selector: "", snippet: "" }, fixKind: "flag" };
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
      "Tag the PDF (in Acrobat: Accessibility > Autotag Document, then check the reading order)."
    ));
  }

  // Document language /Lang
  const lang = catalog.lookup(PDFName.of("Lang"));
  const langStr = lang instanceof PDFString || lang instanceof PDFHexString ? lang.decodeText() : "";
  if (!langStr.trim()) {
    issues.push(flag("pdf-no-lang", "warning", "PDF has no document language set.", "3.1.1", "Set the document language in the PDF's properties."));
  }

  // Document title (and ideally displayed instead of the file name)
  if (!(doc.getTitle() ?? "").trim()) {
    issues.push(flag("pdf-no-title", "warning", "PDF has no document title.", "2.4.2", "Add a title in the PDF's properties and set it to display."));
  }

  return issues;
}
