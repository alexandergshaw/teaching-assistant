import { NextRequest, NextResponse } from "next/server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { downloadFile, removeFiles } from "@/lib/supabase/storage";
import { normalizeProvider } from "@/lib/llm";
import { raceWithTimeout } from "@/lib/bounded-race";
import { ingestZipEntries } from "@/lib/grade/extraction";
import { SYLLABUS_UPLOAD_BUCKET, isKnownUploadPath, withUploadedSyllabusFile } from "@/lib/syllabus-upload-source";
import { GRADING_ZIP_MAX_BYTES } from "@/lib/grade/grading-zip-transport";
import { buildIngestLines, encodeIngestLine } from "@/lib/grade/ndjson-ingest-parser";

// BULK-ZIP BW2 (docs/bulk-zip-grading-scope.md section 3): the server half of
// the Storage transport. The browser uploaded a class submissions zip to
// `${userId}/grading-uploads/<uuid>.zip` (BW1); this handler reads it, extracts
// the per-student entries, and streams them back as NDJSON so the chat driver
// can dispatch each student to /api/grade-run-item. Modelled on
// grade-run-item/route.ts for the guard-first / soft-budget-under-hard-cap
// shape.
//
// The Storage object is deleted by withUploadedSyllabusFile on EVERY path, and
// its bytes are fully in memory before any line is streamed, so the delete
// happens before the stream starts (safe: nothing re-reads the object).
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// A SOFT budget for download + extraction, strictly under maxDuration so this
// handler stops itself with a worded line instead of the platform killing it
// silently, and leaves the remainder for writing the stream.
const TOTAL_BUDGET_MS = 35_000;

const GRADING_SEGMENT = "grading-uploads";

const OVER_CEILING_MESSAGE =
  "This zip is over the size limit for bulk grading. Split the archive into parts, then try again.";
const TIMED_OUT_MESSAGE =
  "This zip was too large to prepare in time. Split the archive into smaller parts, then try again.";
const NOT_FOUND_MESSAGE = "That upload could not be found. Please upload the zip again.";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

/** The stored object's size from Storage metadata, or null when it cannot be
 * determined (the post-download byte-length check still applies then). */
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

function ndjsonResponse(lines: readonly string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
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

  // SEGMENT BIND, before any Storage call: isKnownUploadPath (inside the
  // lifecycle) only checks membership in the SHARED segment union, so a
  // syllabus or rubric object inside the caller's own prefix would otherwise
  // be read and deleted here.
  if (!isKnownUploadPath(userId, storagePath) || storagePath.split("/")[1] !== GRADING_SEGMENT) {
    return NextResponse.json({ error: NOT_FOUND_MESSAGE }, { status: 400 });
  }

  // S4: a server-side size gate on the stored object BEFORE download - the
  // client pre-flight is not trusted.
  const storedSize = await statObjectSize(storagePath);
  if (storedSize !== null && storedSize > GRADING_ZIP_MAX_BYTES) {
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
        if (blob.size > GRADING_ZIP_MAX_BYTES) throw new Error(OVER_CEILING_MESSAGE);
        return ingestZipEntries(await blob.arrayBuffer(), { inferFileNamesWith: provider });
      }
    ),
    budgetMs
  );

  if (outcome.kind === "timedout") {
    return ndjsonResponse([encodeIngestLine({ type: "done", error: TIMED_OUT_MESSAGE })]);
  }
  if (outcome.kind === "failed") {
    return ndjsonResponse([encodeIngestLine({ type: "done", error: describeError(outcome.error) })]);
  }
  if (!outcome.value.ok) {
    return ndjsonResponse([encodeIngestLine({ type: "done", error: outcome.value.error })]);
  }

  const { entries, failedSupportedFiles } = outcome.value.value;
  return ndjsonResponse(buildIngestLines(entries, failedSupportedFiles).map(encodeIngestLine));
}
