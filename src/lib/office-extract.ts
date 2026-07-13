import JSZip from "jszip";
import { OfficeParser, type SupportedFileType } from "officeparser";

/**
 * Server-side text extraction for uploaded files. This is the single source of
 * truth for turning a file's bytes into plain text: the grading pipeline
 * (`grade.ts`) and the LLM upload path (`llm-files.ts`) both route through it.
 *
 * Imports `jszip` and `officeparser`, so this module must only ever be imported
 * by server code (server actions, `grade.ts`) — never by a client component.
 */

export const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "py",
  "js",
  "ts",
  "tsx",
  "jsx",
  "java",
  "c",
  "cpp",
  "cs",
  "html",
  "htm",
  "css",
  "json",
  "xml",
  "rb",
  "go",
  "rs",
  "csv",
  "tsv",
  "dat",
  "in",
  "ipynb",
  "yml",
  "yaml",
  "sql",
  "sh",
  "bash",
  "zsh",
  "php",
  "swift",
  "kt",
  "kts",
  "scala",
  "r",
  "m",
  "tex",
]);

export const DOCUMENT_EXTENSIONS = new Set([
  "docx",
  "doc",
  "pptx",
  "ppt",
  "xlsx",
  "xls",
  "odt",
  "odp",
  "ods",
  "pdf",
  "rtf",
]);

const OFFICE_FILE_TYPE_HINTS: Record<string, SupportedFileType> = {
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  odt: "odt",
  odp: "odp",
  ods: "ods",
  pdf: "pdf",
  rtf: "rtf",
};

export function getFileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1 || lastDot === name.length - 1) {
    return "";
  }

  return name.slice(lastDot + 1).toLowerCase();
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file("word/document.xml");

  if (!documentXml) {
    return null;
  }

  let xml = await documentXml.async("string");
  xml = xml
    .replace(/<w:tab\s*\/?>/g, "\t")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "");

  return normalizeWhitespace(decodeXmlEntities(xml));
}

async function extractPptxText(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.values(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (slideFiles.length === 0) {
    return null;
  }

  const slides: string[] = [];

  for (const slide of slideFiles) {
    const xml = await slide.async("string");
    const textMatches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g));
    const text = textMatches
      .map((match) => decodeXmlEntities(match[1] ?? "").trim())
      .filter(Boolean)
      .join("\n");

    if (text) {
      slides.push(text);
    }
  }

  return normalizeWhitespace(slides.join("\n\n"));
}

async function extractXlsxText(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");

  if (!sharedStringsFile) {
    return null;
  }

  const xml = await sharedStringsFile.async("string");
  const matches = Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g));
  const values = matches
    .map((match) => decodeXmlEntities(match[1] ?? "").trim())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  return normalizeWhitespace(values.join("\n"));
}

/**
 * Extract plain text from a file's bytes, dispatching on its extension. Text
 * files are decoded directly; Office/OpenDocument/PDF formats use the dedicated
 * OOXML extractors (resilient for common LMS files) with an OfficeParser
 * fallback. Returns null for unknown/unsupported extensions.
 */
export async function extractTextFromBuffer(
  name: string,
  buffer: Buffer
): Promise<string | null> {
  const extension = getFileExtension(name);

  if (TEXT_EXTENSIONS.has(extension)) {
    return buffer.toString("utf-8");
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    // OOXML fallbacks are resilient for common LMS submissions.
    if (extension === "docx") {
      const docxText = await extractDocxText(buffer);
      if (docxText) {
        return docxText;
      }
    }

    if (extension === "pptx") {
      const pptxText = await extractPptxText(buffer);
      if (pptxText) {
        return pptxText;
      }
    }

    if (extension === "xlsx") {
      const xlsxText = await extractXlsxText(buffer);
      if (xlsxText) {
        return xlsxText;
      }
    }

    const fileType = OFFICE_FILE_TYPE_HINTS[extension];
    const ast = fileType
      ? await OfficeParser.parseOffice(buffer, { fileType })
      : await OfficeParser.parseOffice(buffer);

    const conversion = await ast.to("text");
    return typeof conversion.value === "string"
      ? normalizeWhitespace(conversion.value)
      : null;
  }

  return null;
}
