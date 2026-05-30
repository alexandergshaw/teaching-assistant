import { NextRequest, NextResponse } from "next/server";
import { parseCalendarPdf } from "@/lib/calendar-parser";

// Allow up to ~10 MB syllabi.
const MAX_BYTES = 10 * 1024 * 1024;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with a 'file' field." },
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
