import JSZip from "jszip";
import { OfficeParser, type SupportedFileType } from "officeparser";
import {
  assertContainerWithinCaps,
  createZipBudget,
  readOfficeMember,
  type ZipBudget,
  type ZipLimits,
} from "./zip-caps";

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

/** Optional ZIP-BOMB-CAPS wiring: the shared archive budget and/or limit overrides. */
export interface ExtractOptions {
  budget?: ZipBudget;
  limits?: Partial<ZipLimits>;
}

/** Every Office extractor reads through this: bounded, charged, fail-closed. */
async function readText(
  entry: JSZip.JSZipObject,
  containerName: string,
  budget: ZipBudget
): Promise<string> {
  const bytes = await readOfficeMember(entry, `${containerName}/${entry.name}`, budget);
  return bytes.toString("utf-8");
}

async function extractDocxText(
  zip: JSZip,
  containerName: string,
  budget: ZipBudget
): Promise<string | null> {
  const documentXml = zip.file("word/document.xml");

  if (!documentXml) {
    return null;
  }

  let xml = await readText(documentXml, containerName, budget);
  xml = xml
    .replace(/<w:tab\s*\/?>/g, "\t")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:p[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "");

  return normalizeWhitespace(decodeXmlEntities(xml));
}

async function extractPptxText(
  zip: JSZip,
  containerName: string,
  budget: ZipBudget
): Promise<string | null> {
  const slideFiles = Object.values(zip.files)
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (slideFiles.length === 0) {
    return null;
  }

  const slides: string[] = [];

  for (const slide of slideFiles) {
    const xml = await readText(slide, containerName, budget);
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

async function extractXlsxText(
  zip: JSZip,
  containerName: string,
  budget: ZipBudget
): Promise<string | null> {
  const sharedStringsFile = zip.file("xl/sharedStrings.xml");

  if (!sharedStringsFile) {
    return null;
  }

  const xml = await readText(sharedStringsFile, containerName, budget);
  const matches = Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g));
  const values = matches
    .map((match) => decodeXmlEntities(match[1] ?? "").trim())
    .filter(Boolean);

  if (values.length === 0) {
    return null;
  }

  return normalizeWhitespace(values.join("\n"));
}

const OOXML_EXTENSIONS = new Set(["docx", "pptx", "xlsx"]);
const ODF_EXTENSIONS = new Set(["odt", "odp", "ods"]);

/**
 * Load an Office container once and run the declared-size pre-flight over every
 * member. A cap error always propagates. Any other load failure propagates for
 * OOXML (as before) and is tolerated for ODF, which had no JSZip load before.
 */
async function openContainer(
  name: string,
  extension: string,
  buffer: Buffer,
  budget: ZipBudget
): Promise<JSZip | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    if (ODF_EXTENSIONS.has(extension)) return null;
    throw error;
  }
  assertContainerWithinCaps(zip, name, [], budget.limits);
  return zip;
}

/**
 * Extract plain text from a file's bytes, dispatching on its extension. Text
 * files are decoded directly; Office/OpenDocument/PDF formats use the dedicated
 * OOXML extractors (resilient for common LMS files) with an OfficeParser
 * fallback. Returns null for unknown/unsupported extensions.
 */
export async function extractTextFromBuffer(
  name: string,
  buffer: Buffer,
  options?: ExtractOptions
): Promise<string | null> {
  const extension = getFileExtension(name);

  if (TEXT_EXTENSIONS.has(extension)) {
    return buffer.toString("utf-8");
  }

  if (DOCUMENT_EXTENSIONS.has(extension)) {
    const budget = options?.budget ?? createZipBudget(options?.limits);
    const zip =
      OOXML_EXTENSIONS.has(extension) || ODF_EXTENSIONS.has(extension)
        ? await openContainer(name, extension, buffer, budget)
        : null;

    // OOXML fallbacks are resilient for common LMS submissions.
    if (zip && extension === "docx") {
      const docxText = await extractDocxText(zip, name, budget);
      if (docxText) {
        return docxText;
      }
    }

    if (zip && extension === "pptx") {
      const pptxText = await extractPptxText(zip, name, budget);
      if (pptxText) {
        return pptxText;
      }
    }

    if (zip && extension === "xlsx") {
      const xlsxText = await extractXlsxText(zip, name, budget);
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
