"use server";

import type { OfficeImage } from "@/lib/office-edit";
import type { OfficeKind, OfficeParagraph, RunSpan } from "@/lib/office-edit";
import { suggestHeadingLevels, titleFromFileName } from "@/lib/doc-headings";
import { buildOfficeIssues } from "@/lib/accessibility/office-issues";
import { type AccessibleItemType, type Issue } from "@/lib/accessibility/types";
import { getOfficeEditable, listScannableFiles, getOfficeFileImagesWithData, getOfficeFileImageData, saveOfficeFileImageAlt, getOfficeFileStructure, saveOfficeFileStructure, saveOfficeFileFixes, getPdfMeta, savePdfFixes, appendOfficeParagraph, saveOfficeEdits, getAccessibilityItem, saveAccessibilityItemHtml } from "@/lib/canvas-modules";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";

// ── Accessibility remediation (scans run in /api/accessibility) ─────────────

/** List an Office file's images + current alt text (for the alt remediation editor). */
export async function getOfficeFileImagesAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ images: Array<OfficeImage & { mimeType?: string; base64?: string }> } | { error: string }> {
  try {
    await requireOwner();
    return { images: await getOfficeFileImagesWithData(courseUrl, fileId, acronym) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

// Ask a vision model for alt text for one image's bytes; "" on failure/empty.
async function generateImageAlt(mimeType: string, base64: string, provider: LlmProvider): Promise<string> {
  const result = await callLlm(
    {
      contents: [
        {
          role: "user",
          parts: [
            { text: "Write concise, descriptive alt text (under 125 characters) for this image, for screen-reader users. Describe its content or purpose. Do not start with \"image of\" or \"picture of\". Return ONLY the alt text, no quotes." },
            { inlineData: { mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 120 },
    },
    provider
  );
  if (!result.ok) return "";
  return result.text.trim().replace(/^["']|["']$/g, "").slice(0, 200);
}

/** Suggest alt text for one Office-file image by sending it to a vision model. */
export async function suggestOfficeImageAltAction(
  courseUrl: string,
  fileId: number,
  imageId: string,
  acronym?: string,
  provider: LlmProvider = "gemini"
): Promise<{ text: string } | { error: string }> {
  try {
    await requireOwner();
    // Embedded Deterministic Engine: alt text needs to see the image; there is no
    // file name here, only pixels, so ask the instructor to switch providers.
    if (provider === "embedded") {
      return { error: "The embedded engine can't analyze image contents. Switch to an LLM provider to suggest alt text." };
    }
    const image = await getOfficeFileImageData(courseUrl, fileId, imageId, acronym);
    if (!image) return { error: "This image can't be previewed for a suggestion (e.g. a vector image)." };
    const text = await generateImageAlt(image.mimeType, image.base64, provider);
    return text ? { text } : { error: "The model returned empty text." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "An unexpected error occurred." };
  }
}

/** Write alt text onto an Office file's images and overwrite it in Canvas. */
export async function saveOfficeImageAltAction(
  courseUrl: string,
  fileId: number,
  edits: Record<string, string>,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveOfficeFileImageAlt(courseUrl, fileId, edits, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}

/**
 * Headless "fix everything" for one Office file: AI alt text for images that
 * lack it, plus (docx) a title from the file name and heuristic heading styles.
 * Applies all of it in one Canvas save and returns the issues that remain, so
 * the review pane can update without opening an editor.
 */
export async function autoFixOfficeFileAction(
  courseUrl: string,
  fileId: number,
  acronym?: string,
  provider: LlmProvider = "gemini"
): Promise<{ issues: Issue[] } | { error: string }> {
  try {
    await requireOwner();

    // AI alt for every image missing it that we can actually render. The embedded
    // engine can't see image contents, so it skips alt text and still applies the
    // deterministic title/heading fixes below.
    const altEdits: Record<string, string> = {};
    if (provider !== "embedded") {
      const images = await getOfficeFileImagesWithData(courseUrl, fileId, acronym);
      for (const im of images) {
        if (im.alt.trim() || !im.base64 || !im.mimeType) continue;
        const alt = await generateImageAlt(im.mimeType, im.base64, provider);
        if (alt) altEdits[im.id] = alt;
      }
    }

    // Title + headings (docx only; getOfficeFileStructure returns null otherwise).
    let title: string | null = null;
    let sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }> = [];
    const structure = await getOfficeFileStructure(courseUrl, fileId, acronym);
    if (structure) {
      if (!structure.title.trim()) title = titleFromFileName(structure.name);
      const hasHeadings = structure.paragraphs.some((p) => /^Heading[1-9]$/.test(p.style));
      if (!hasHeadings) {
        const levels = suggestHeadingLevels(structure.paragraphs);
        if (Object.keys(levels).length > 0) {
          sections = structure.paragraphs.map((p) => ({
            sourceId: p.id,
            spans: p.runs.length > 0 ? p.runs : [{ text: p.text }],
            style: levels[p.id] ?? p.style,
          }));
        }
      }
    }

    const after = await saveOfficeFileFixes(courseUrl, fileId, { title, sections, altEdits }, acronym);
    return { issues: buildOfficeIssues(after) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not fix the file." };
  }
}

/** Read a PDF's current language + title for the PDF fix editor. */
export async function getPdfMetaAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ lang: string; title: string } | { error: string }> {
  try {
    await requireOwner();
    return await getPdfMeta(courseUrl, fileId, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

/** Set a PDF's language/title, save it to Canvas, and return the issues that remain. */
export async function savePdfAccessibilityAction(
  courseUrl: string,
  fileId: number,
  lang: string,
  title: string,
  acronym?: string
): Promise<{ issues: Issue[] } | { error: string }> {
  try {
    await requireOwner();
    const issues = await savePdfFixes(courseUrl, fileId, { lang, title }, acronym);
    return { issues };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}

/** Load a docx's title + paragraphs for the document-structure fix editor. */
export async function getOfficeFileStructureAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ name: string; title: string; paragraphs: OfficeParagraph[] } | { error: string }> {
  try {
    await requireOwner();
    const structure = await getOfficeFileStructure(courseUrl, fileId, acronym);
    if (!structure) return { error: "Only Word (.docx) files have a document title and headings." };
    return structure;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the file." };
  }
}

/** Set a docx's title and/or heading styles and overwrite it in Canvas. */
export async function saveOfficeFileStructureAction(
  courseUrl: string,
  fileId: number,
  title: string | null,
  sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }>,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveOfficeFileStructure(courseUrl, fileId, title, sections, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}

/** Fetch one scannable item's current HTML + title (for the remediation editor). */
export async function getAccessibilityItemHtmlAction(
  courseUrl: string,
  type: AccessibleItemType,
  id: string,
  acronym?: string
): Promise<{ html: string; title: string } | { error: string }> {
  try {
    await requireOwner();
    const item = await getAccessibilityItem(courseUrl, type, id, acronym);
    if (!item) return { error: "Could not load that item." };
    return { html: item.html, title: item.title };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load that item." };
  }
}

/** Save edited HTML back to a scannable item (page/gradable/announcement/syllabus). */
export async function saveAccessibilityItemHtmlAction(
  courseUrl: string,
  type: AccessibleItemType,
  id: string,
  html: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveAccessibilityItemHtml(courseUrl, type, id, html, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the item to Canvas." };
  }
}

/** Load a docx/pptx file's editable paragraphs from a module File item. */
export async function getOfficeEditableAction(
  courseUrl: string,
  fileId: number,
  acronym?: string
): Promise<{ name: string; kind: OfficeKind; paragraphs: OfficeParagraph[] } | { error: string }> {
  try {
    await requireOwner();
    return await getOfficeEditable(courseUrl, fileId, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not open the file for editing." };
  }
}

/** List the course's .docx files a section can be moved into (excludes none). */
export async function listMovableFilesAction(
  courseUrl: string,
  acronym?: string
): Promise<{ files: Array<{ id: number; title: string }> } | { error: string }> {
  try {
    await requireOwner();
    const files = (await listScannableFiles(courseUrl, acronym))
      .filter((f) => f.kind === "docx")
      .map((f) => ({ id: f.id, title: f.title }));
    return { files };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list files." };
  }
}

/** Append a section (spans + style) to the end of another .docx file in Canvas. */
export async function appendOfficeParagraphAction(
  courseUrl: string,
  fileId: number,
  spans: RunSpan[],
  style: string,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await appendOfficeParagraph(courseUrl, fileId, spans, style, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not move the section." };
  }
}

/** Apply paragraph edits to a docx/pptx file and overwrite it in Canvas. */
export async function saveOfficeEditsAction(
  courseUrl: string,
  fileId: number,
  sections: Array<{ sourceId: string; spans: RunSpan[]; style?: string }>,
  acronym?: string
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    await saveOfficeEdits(courseUrl, fileId, sections, acronym);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the file to Canvas." };
  }
}
