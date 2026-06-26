import type { Issue } from "./types";
import type { OfficeImage, OfficeKind } from "../office-edit";

/**
 * Build the accessibility issues for an Office file from its analysis (images +
 * docx headings/title). Shared by the scan route and the headless auto-fix so a
 * file's issues read identically however they were produced.
 */
export function buildOfficeIssues(scan: {
  kind: OfficeKind;
  images: OfficeImage[];
  hasHeadings: boolean;
  title: string;
}): Issue[] {
  const issues: Issue[] = [];
  for (const im of scan.images) {
    if (im.alt.trim()) continue;
    issues.push({
      ruleId: "office-image-alt",
      severity: "warning",
      message: `Image "${im.name}" has no alt text.`,
      wcag: "1.1.1",
      help: "Add alt text describing the image's content or purpose.",
      locator: { selector: im.id, snippet: im.name },
      fixKind: "edit",
    });
  }
  if (scan.kind === "docx") {
    if (!scan.hasHeadings) {
      issues.push({
        ruleId: "doc-no-structure",
        severity: "error",
        message: "File does not include headings for structure.",
        wcag: "1.3.1",
        help: "Use Word's Heading styles so the document has a navigable structure.",
        locator: { selector: "", snippet: "" },
        fixKind: "edit",
      });
    }
    if (!scan.title.trim()) {
      issues.push({
        ruleId: "doc-no-title",
        severity: "warning",
        message: "File is missing a title element.",
        wcag: "2.4.2",
        help: "Set a document title in File > Info > Properties.",
        locator: { selector: "", snippet: "" },
        fixKind: "edit",
      });
    }
  }
  return issues;
}
