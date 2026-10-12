import { NextRequest, NextResponse } from "next/server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { downloadFile, removeFiles } from "@/lib/supabase/storage";
import { normalizeProvider } from "@/lib/llm";
import { raceWithTimeout } from "@/lib/bounded-race";
import { SYLLABUS_UPLOAD_BUCKET, isKnownUploadPath, withUploadedSyllabusFile } from "@/lib/syllabus-upload-source";
import {
  SINGLE_FILE_MAX_BYTES,
  SINGLE_FILE_STORAGE_EXTENSIONS,
  singleFileExtension,
} from "@/lib/grade/grading-zip-transport";
import { buildSingleFileEntry } from "@/lib/grade/single-file-entry";
import { ITEM_REQUEST_BYTE_BUDGET, estimateNeededWireBytes } from "@/app/components/grading/incrementalRunPlan";

// LARGE-SINGLE-FILE W1 (docs/large-single-file-upload-scope.md section 4.4): the
// server half of a Storage transport for ONE large office/text file. The
// browser (W2) uploads it to `${userId}/grading-uploads/<uuid>.<ext>`; this
// handler downloads it, extracts the text, and returns ONE TEXT-ONLY entry (no
// rawBase64), which clears the per-item wire budget gates. Modelled on
// /api/grade-submission-zip (path bind, stat gate, download-and-delete bracket,
// soft budget under maxDuration) and /api/grade-submission-video.
//
// COST (RES-LSF-1): embedded images of a large office file are not graded.
// Nothing calls this route yet (W2 wires it); it is owner-gated regardless.
//
// FIXED ORDER (pinned by route.test.ts): requireAppOwner() before the body is
// read; the JSON content-type CSRF floor; parse; path bind; stat gate; then the
// bracketed download + extract. There is no client-supplied URL anywhere.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// A SOFT budget for download + extraction, strictly under maxDuration.
const TOTAL_BUDGET_MS = 35_000;

const GRADING_SEGMENT = "grading-uploads";

const OVER_CEILING_MESSAGE =
  "This file is over the size limit for grading. Reduce the file size, then try again.";
const TIMED_OUT_MESSAGE =
  "This file was too large to read in time. Reduce the file size, then try again.";
const NOT_FOUND_MESSAGE = "That upload could not be found. Please upload the file again.";
const UNREADABLE_MESSAGE = "This file could not be read. Check that it is not corrupt, then try again.";
const TEXT_TOO_LARGE_MESSAGE =
  "The text in this file is too long to grade in one request. Split the file into parts, then try again.";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

/** The stored object's size from Storage metadata, or null when unknown (the
 * post-download byte-length check still applies then). */
async function statObjectSize(storagePath: string): Promise<number | null> {
  try {
    const at = storagePath.lastIndexOf("/");
    const dir = storagePath.slice(0, at);
    const name = storagePath.slice(at + 1);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.storage.from(SYLLABUS_UPLOAD_BUCKET).list(dir, { limit: 1, search: name });
    if (error || !data) return null;
    const match = data.find((o) => o.name === name);
    const size = (match?.metadata as { size?: unknown } | null | undefined)?.size;
    return typeof size === "number" ? size : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  // AUTH ORDER: requireAppOwner() before anything else, before the body is read.
  let userId: string;
  try {
    const user = await requireAppOwner();
    userId = user.id;
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 401 });
  }

  // CSRF FLOOR, before the body is parsed.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Expected a JSON request body." }, { status: 400 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read the request." }, { status: 400 });
  }
  const body = (typeof rawBody === "object" && rawBody !== null ? rawBody : {}) as Record<string, unknown>;
  const storagePath = typeof body.storagePath === "string" ? body.storagePath : "";
  const provider = normalizeProvider(typeof body.provider === "string" ? body.provider : null);
  const label = typeof body.label === "string" ? body.label.trim() : "";

  // PATH BIND, before any Storage call: known-upload membership, the
  // grading-uploads segment, and an office/text extension (so a zip or video
  // object, which belong to their siblings, is never read or deleted here).
  const storedExtension = singleFileExtension(storagePath);
  if (
    !isKnownUploadPath(userId, storagePath) ||
    storagePath.split("/")[1] !== GRADING_SEGMENT ||
    !SINGLE_FILE_STORAGE_EXTENSIONS.has(storedExtension)
  ) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 400 });
  }

  // The display name must carry the stored extension (it picks the extractor);
  // otherwise fall back to a neutral name with the stored extension.
  const requestedName = typeof body.name === "string" ? body.name.trim() : "";
  const name =
    requestedName.length > 0 && singleFileExtension(requestedName) === storedExtension
      ? requestedName
      : `Uploaded submission.${storedExtension}`;

  // A server-side size gate on the stored object BEFORE download - the client
  // pre-flight is not trusted.
  const storedSize = await statObjectSize(storagePath);
  if (storedSize !== null && storedSize > SINGLE_FILE_MAX_BYTES) {
    return NextResponse.json({ error: OVER_CEILING_MESSAGE }, { status: 413 });
  }

  const budgetMs = Math.max(1_000, startedAtMs + TOTAL_BUDGET_MS - Date.now());
  const outcome = await raceWithTimeout(
    withUploadedSyllabusFile(
      {
        download: (path) => downloadFile(SYLLABUS_UPLOAD_BUCKET, path),
        remove: (paths) => removeFiles(SYLLABUS_UPLOAD_BUCKET, paths),
      },
      userId,
      storagePath,
      async (blob: Blob) => {
        if (blob.size > SINGLE_FILE_MAX_BYTES) throw new Error(OVER_CEILING_MESSAGE);
        const buffer = Buffer.from(await blob.arrayBuffer());
        return buildSingleFileEntry(name, buffer, provider, label.length > 0, { textOnly: true });
      }
    ),
    budgetMs
  );

  if (outcome.kind === "timedout") {
    return NextResponse.json({ error: TIMED_OUT_MESSAGE }, { status: 504 });
  }
  if (outcome.kind === "failed") {
    return NextResponse.json({ error: describeError(outcome.error) }, { status: 500 });
  }
  if (!outcome.value.ok) {
    const overCeiling = outcome.value.error === OVER_CEILING_MESSAGE;
    return NextResponse.json({ error: outcome.value.error }, { status: overCeiling ? 413 : 500 });
  }

  const built = outcome.value.value;
  if (!built) {
    return NextResponse.json({ error: UNREADABLE_MESSAGE }, { status: 422 });
  }
  const entry = label.length > 0 ? { ...built, student: label, studentNameSource: "filename" as const } : built;
  if (estimateNeededWireBytes(entry) > ITEM_REQUEST_BYTE_BUDGET) {
    return NextResponse.json({ error: TEXT_TOO_LARGE_MESSAGE }, { status: 413 });
  }
  return NextResponse.json({ entry }, { status: 200 });
}
