import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getGeminiApiKey, getGeminiModel } from "@/lib/gemini";
import {
  PROFESSIONAL_SPEECH_RULE,
  DOCUMENT_HEADER_RULES,
  DOCUMENT_LABEL_BOLD_RULE,
  DOCUMENT_HEADING_CENTER_RULE,
  HTML_OUTPUT_RULE,
} from "@/lib/formatting-rules";

// ── DOCX text extraction ──────────────────────────────────────────────────────

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // last, to avoid double-unescaping
}

async function extractDocxText(buffer: Buffer): Promise<string | null> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = zip.file("word/document.xml");
  if (!documentXml) return null;
  let xml = await documentXml.async("string");
  xml = xml
    .replace(/<w:tab\s*\/?>/g, "\t")
    .replace(/<w:br\s*\/?>/g, "\n")
    .replace(/<w:p(?:\s[\s\S]*?)?\/?>/g, "\n")
    .replace(/<[\s\S]*?>/g, "");
  const text = decodeXmlEntities(xml)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text || null;
}

// ── HTML-to-DOCX builder ──────────────────────────────────────────────────────

async function buildDocxFromHtml(html: string): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import("docx");

  const FONT = "Times New Roman";
  const COLOR = "000000";

  function decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  type Token =
    | { kind: "open"; tag: string }
    | { kind: "close"; tag: string }
    | { kind: "text"; text: string };

  const tokens: Token[] = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\/?>/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(html)) !== null) {
    if (match.index > last) {
      const text = decodeHtmlEntities(html.slice(last, match.index));
      if (text) tokens.push({ kind: "text", text });
    }
    const isClose = match[1] === "/";
    const tag = match[2].toLowerCase();
    const rawTag = match[0];
    const isSelfClose =
      rawTag.endsWith("/>") ||
      ["br", "hr", "img", "input", "meta", "link"].includes(tag);

    if (!isSelfClose) {
      tokens.push(isClose ? { kind: "close", tag } : { kind: "open", tag });
    }
    last = tagRe.lastIndex;
  }

  if (last < html.length) {
    const tail = decodeHtmlEntities(html.slice(last));
    if (tail.trim()) tokens.push({ kind: "text", text: tail });
  }

  const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
  const BLOCK_TAGS = new Set([
    ...HEADING_TAGS,
    "p", "li", "ul", "ol", "div", "blockquote",
    "article", "section", "body", "html", "head",
  ]);

  function toHeadingLevel(tag: string) {
    return tag === "h1" ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
  }

  const docChildren: InstanceType<typeof Paragraph>[] = [];
  const tagStack: string[] = [];
  let inlineRuns: InstanceType<typeof TextRun>[] = [];
  let bold = false;
  let italic = false;

  function currentBlockTag(): string {
    for (let i = tagStack.length - 1; i >= 0; i--) {
      if (BLOCK_TAGS.has(tagStack[i])) return tagStack[i];
    }
    return "";
  }

  function flushBlock(blockTag: string) {
    if (inlineRuns.length === 0) return;
    if (HEADING_TAGS.has(blockTag)) {
      docChildren.push(
        new Paragraph({
          children: inlineRuns,
          heading: toHeadingLevel(blockTag),
          alignment: AlignmentType.CENTER,
        })
      );
    } else if (blockTag === "li") {
      docChildren.push(
        new Paragraph({ children: inlineRuns, bullet: { level: 0 } })
      );
    } else {
      docChildren.push(new Paragraph({ children: inlineRuns }));
    }
    inlineRuns = [];
  }

  for (const token of tokens) {
    if (token.kind === "open") {
      tagStack.push(token.tag);
      if (token.tag === "strong" || token.tag === "b") bold = true;
      if (token.tag === "em" || token.tag === "i") italic = true;
    } else if (token.kind === "close") {
      const { tag } = token;
      const idx = tagStack.lastIndexOf(tag);
      if (HEADING_TAGS.has(tag) || tag === "p" || tag === "li") {
        flushBlock(tag);
      }
      if (idx !== -1) tagStack.splice(idx, 1);
      if (tag === "strong" || tag === "b") bold = false;
      if (tag === "em" || tag === "i") italic = false;
    } else {
      const block = currentBlockTag();
      if (HEADING_TAGS.has(block) || block === "p" || block === "li") {
        const text = token.text.replace(/\n/g, " ").replace(/\s+/g, " ");
        if (text) {
          inlineRuns.push(
            new TextRun({ text, font: FONT, color: COLOR, bold, italics: italic })
          );
        }
      }
    }
  }

  const doc = new Document({ sections: [{ children: docChildren }] });
  return Buffer.from(await Packer.toArrayBuffer(doc));
}

// ── Gemini HTML reformatter ───────────────────────────────────────────────────
