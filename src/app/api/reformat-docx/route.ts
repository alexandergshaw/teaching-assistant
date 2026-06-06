import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getGeminiApiKey, getGeminiModel } from "@/lib/gemini";
import {
  PROFESSIONAL_SPEECH_RULE,
  DOCUMENT_HEADER_RULES,
  NO_MARKDOWN_SYNTAX_RULE,
  DOCUMENT_LABEL_BOLD_RULE,
  DOCUMENT_SECTION_NEWLINE_RULE,
  normalizeHeadingSpacing,
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

// ── DOCX builder ──────────────────────────────────────────────────────────────

async function buildDocxFromPlainText(text: string): Promise<Buffer> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");

  const FONT = "Times New Roman";
  const COLOR = "000000";

  const children: InstanceType<typeof Paragraph>[] = [];
  const lines = text.split("\n");
  let firstHeadingFound = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const prevBlank = i === 0 || !lines[i - 1].trim();
    const nextBlank = i >= lines.length - 1 || !lines[i + 1].trim();
    const isListItem = /^(\d+\.|[-•*])\s/.test(trimmed);
    const isHeading = trimmed.length < 80 && !isListItem && prevBlank && nextBlank;

    if (isHeading) {
      const level = !firstHeadingFound ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2;
      firstHeadingFound = true;
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed, font: FONT, color: COLOR, bold: true })],
          heading: level,
        })
      );
    } else if (/^\d+\.\s+/.test(trimmed)) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^\d+\.\s+/, ""), font: FONT, color: COLOR })],
          bullet: { level: 0 },
        })
      );
    } else if (/^[-•*]\s+/.test(trimmed)) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: trimmed.slice(trimmed.indexOf(" ") + 1), font: FONT, color: COLOR }),
          ],
          bullet: { level: 0 },
        })
      );
    } else {
      const labelMatch = trimmed.match(/^([A-Za-z][^:\n]{1,59}):\s+([\s\S]+)/);
      if (labelMatch) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: labelMatch[1] + ":", font: FONT, color: COLOR, bold: true }),
              new TextRun({ text: " " + labelMatch[2], font: FONT, color: COLOR }),
            ],
          })
        );
      } else {
        children.push(
          new Paragraph({ children: [new TextRun({ text: trimmed, font: FONT, color: COLOR })] })
        );
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toArrayBuffer(doc));
}

// ── Gemini reformatter ────────────────────────────────────────────────────────

async function reformatTextWithGemini(text: string, templateText?: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

  const systemPromptLines = [
    "You are a document formatter. Your only job is to take the provided document text and reformat it according to the rules below, then return the fully reformatted document text — nothing else.",
    "",
    "FORMATTING RULES:",
    `1. ${PROFESSIONAL_SPEECH_RULE}`,
    `2. ${DOCUMENT_HEADER_RULES}`,
    `3. ${NO_MARKDOWN_SYNTAX_RULE}`,
    `4. ${DOCUMENT_LABEL_BOLD_RULE}`,
    `5. ${DOCUMENT_SECTION_NEWLINE_RULE}`,
  ];

  if (templateText) {
    systemPromptLines.push(
      "",
      "A TEMPLATE document is provided below. Use it as the reference for the desired structure, layout, section ordering, headings, tone, and overall formatting style. Match the template's structure and style as closely as possible while preserving the original document's actual content. Do not copy the template's content into the output — only mirror its formatting and organisation.",
      "",
      "TEMPLATE DOCUMENT:",
      templateText
    );
  }

  systemPromptLines.push(
    "",
    "Return only the reformatted document text. Do not add commentary, explanations, or any text that was not in the original."
  );

  const systemPrompt = systemPromptLines.join("\n");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: `DOCUMENT TO REFORMAT:\n\n${text}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error: HTTP ${response.status} — ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return (
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? text
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided." }, { status: 400 });
    }

    // Optional template file used to guide the reformatting style/structure.
    const templateFile = formData.get("template");
    let templateText: string | undefined;
    if (templateFile && typeof templateFile !== "string") {
      try {
        const templateBuffer = Buffer.from(await templateFile.arrayBuffer());
        const extracted = await extractDocxText(templateBuffer);
        if (extracted) templateText = extracted;
      } catch {
        // Ignore template extraction failures; reformatting proceeds without it.
      }
    }

    const results: Array<{ filename: string; base64: string; error?: string }> = [];

    for (const file of files) {
      const filename = file.name;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const extractedText = await extractDocxText(buffer);
        if (!extractedText) {
          results.push({ filename, base64: "", error: "Could not extract text from file." });
          continue;
        }

        const reformatted = await reformatTextWithGemini(extractedText, templateText);
        const normalized = normalizeHeadingSpacing(reformatted);
        const docxBuffer = await buildDocxFromPlainText(normalized);
        results.push({ filename, base64: docxBuffer.toString("base64") });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        results.push({ filename, base64: "", error: message });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[reformat-docx] Unexpected error:", err);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
