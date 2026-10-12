import { NextRequest, NextResponse } from "next/server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { raceWithTimeout } from "@/lib/bounded-race";
import { RECORDING_SPLIT_ENABLED } from "@/lib/grade/constants";
import { classifyRecording, type ClassifyRecordingResult } from "@/lib/grade/recording-split-seam";
import { isVideoUploadPath } from "@/lib/grade/video-transport";
import { createGeminiFilesClient } from "@/lib/gemini-files";
import { getGeminiApiKey } from "@/lib/gemini";
import { downloadFile, removeFiles } from "@/lib/supabase/storage";
import { SYLLABUS_UPLOAD_BUCKET } from "@/lib/syllabus-upload-source";

// RECORDING ONE-VS-MANY W1 (docs/recording-one-vs-many-scope.md section 3.1): the
// DARK server half of the one-vs-many signal. Given a stored video (the caller's
// own grading-uploads object) and the assignment context, it asks the model once
// whether the recording is one submission or several and returns the seam's
// { split, failed? } verbatim. Inert behind RECORDING_SPLIT_ENABLED (default
// false) until the confirm surface lands.
//
// This route records NO diagnostics: the diagnostic store is browser-only, and
// the client records from the response it gets back.
//
// FIXED ORDER: requireAppOwner() before the body is read; the JSON content-type
// CSRF floor; parse; the dark-flag gate; ownership of the path; then the seam.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Soft work budget strictly under maxDuration, so this handler stops itself with
// a worded response instead of being killed silently (same shape as grade-run-item).
const TOTAL_BUDGET_MS = 50_000;
const MODEL_WAIT_RESERVE_MS = 2_000;
const VIDEO_PREPARE_BUDGET_MS = 25_000;

const MAX_PATH_CHARS = 2048;
const MAX_INSTRUCTIONS_CHARS = 20_000;
const MAX_RUBRIC_CHARS = 20_000;

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

export async function POST(req: NextRequest) {
  const startedAtMs = Date.now();

  let userId: string;
  try {
    const user = await requireAppOwner();
    userId = user.id;
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 401 });
  }

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

  // DARK FLAG: while off, no Storage, Files or model call is ever made.
  if (!RECORDING_SPLIT_ENABLED) {
    return NextResponse.json({ error: "Recording classification is not enabled." }, { status: 403 });
  }

  const { storagePath, sizeBytes, assignmentInstructions, rubric } = body;
  if (
    typeof storagePath !== "string" ||
    storagePath.length === 0 ||
    storagePath.length > MAX_PATH_CHARS ||
    typeof sizeBytes !== "number" ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0 ||
    typeof assignmentInstructions !== "string" ||
    assignmentInstructions.length > MAX_INSTRUCTIONS_CHARS ||
    typeof rubric !== "string" ||
    rubric.length > MAX_RUBRIC_CHARS
  ) {
    return NextResponse.json({ error: "This recording could not be read." }, { status: 400 });
  }
  // The path must name an object in THIS caller's own grading-uploads namespace.
  if (!isVideoUploadPath(userId, storagePath)) {
    return NextResponse.json({ error: "This recording could not be read." }, { status: 400 });
  }

  // Aborted at the route's own deadline so the seam's Files cleanup fires.
  const abort = new AbortController();
  const remainingMs = startedAtMs + TOTAL_BUDGET_MS - Date.now();
  const waitMs = Math.max(1_000, remainingMs - MODEL_WAIT_RESERVE_MS);

  const outcome = await raceWithTimeout(
    classifyRecording(
      {
        download: async (path) => {
          const { data, error } = await downloadFile(SYLLABUS_UPLOAD_BUCKET, path);
          return error || !data ? null : data;
        },
        removeObjects: async (paths) => {
          await removeFiles(SYLLABUS_UPLOAD_BUCKET, paths);
        },
        filesClient: createGeminiFilesClient({ apiKey: getGeminiApiKey() }),
        callLlm: (req) => callLlm(req),
      },
      { userId, uploadDeadlineMs: startedAtMs + VIDEO_PREPARE_BUDGET_MS, signal: abort.signal },
      { videoRef: { storagePath, sizeBytes }, assignmentInstructions, rubric }
    ),
    waitMs
  );

  // A timeout or an unexpected rejection is a classifier failure, not an error
  // response: the caller falls back to grading as one and records WHY.
  let result: ClassifyRecordingResult;
  if (outcome.kind === "settled") {
    result = outcome.value;
  } else {
    if (outcome.kind === "timedout") abort.abort();
    result = { split: { kind: "single" }, failed: true };
  }
  return NextResponse.json(result, { status: 200 });
}
