import { NextRequest, NextResponse } from "next/server";
import { parseCalendarFromText, parseCalendarPdf } from "@/lib/calendar-parser";

// Allow up to ~10 MB syllabi.
const MAX_BYTES = 10 * 1024 * 1024;
// Hard cap on pasted text length to keep LLM cost predictable.
const MAX_TEXT_CHARS = 40_000;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    // --- JSON text path ---
    if (contentType.toLowerCase().includes("application/json")) {
      const body = (await req.json()) as { text?: unknown; schoolHint?: unknown };

      const text =
        typeof body.text === "string" ? body.text.trim() : "";
      if (!text) {
        return NextResponse.json(
          { error: "Expected a non-empty 'text' field in the JSON body." },
          { status: 400 }
        );
      }

      if (text.length > MAX_TEXT_CHARS) {
        return NextResponse.json(
          { error: `Text too long. Maximum is ${MAX_TEXT_CHARS.toLocaleString()} characters.` },
          { status: 413 }
        );
      }

      const schoolHint =
        typeof body.schoolHint === "string" && body.schoolHint.trim()
          ? body.schoolHint.trim()
          : undefined;

      const result = await parseCalendarFromText(text, { schoolHint });
      return NextResponse.json(result);
    }

    // --- Multipart PDF path ---
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with a 'file' field, or application/json with a 'text' field." },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const schoolHintEntry = formData.get("schoolHint");
    const schoolHint =
      typeof schoolHintEntry === "string" && schoolHintEntry.trim()
        ? schoolHintEntry.trim()
        : undefined;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field in form data." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Uploaded file is empty." }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_BYTES / (1024 * 1024)} MB.` },
        { status: 413 }
      );
    }

    const fileName = file.name || "calendar.pdf";
    const lowerName = fileName.toLowerCase();
    const mimeType = file.type || "";
    const isPdf =
      mimeType === "application/pdf" || lowerName.endsWith(".pdf");

    if (!isPdf) {
      return NextResponse.json(
        { error: "Only PDF files are supported at this time." },
        { status: 415 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const result = await parseCalendarPdf(buffer, {
      fileName,
      schoolHint,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("[parse-calendar] Error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to parse calendar PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
