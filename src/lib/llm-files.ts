import type { LlmPart } from "./llm";
import { extractTextFromBuffer } from "./office-extract";

/**
 * Build Gemini request parts from user-uploaded files.
 *
 * Gemini's generateContent only accepts PDF, images, and plain text as inline
 * data — it rejects Office MIME types (.pptx/.docx/.xlsx). So PDFs and images
 * are passed through inline (Gemini reads them natively), and everything else is
 * extracted to text server-side and sent as a labeled text part. Unreadable
 * files are skipped rather than failing the whole request.
 *
 * Server-only: pulls in `office-extract`, which depends on node libraries.
 */

export interface UploadedFile {
  name: string;
  base64: string;
  mimeType: string;
}

/** Formats Gemini reads directly as inline data. Everything else is extracted. */
export function isGeminiInlineSupported(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.startsWith("image/");
}

export async function filesToLlmParts(
  files: UploadedFile[],
  label = "CONTEXT FILE"
): Promise<LlmPart[]> {
  const parts: LlmPart[] = [];

  for (const file of files) {
    if (isGeminiInlineSupported(file.mimeType)) {
      parts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } });
      continue;
    }

    try {
      const text = await extractTextFromBuffer(
        file.name,
        Buffer.from(file.base64, "base64")
      );
      if (text && text.trim()) {
        parts.push({ text: `\n\n${label} (${file.name}):\n${text.trim()}` });
      }
    } catch {
      // Ignore unreadable files instead of failing the full request.
    }
  }

  return parts;
}
