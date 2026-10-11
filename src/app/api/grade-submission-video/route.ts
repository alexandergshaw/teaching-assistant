import { NextRequest, NextResponse } from "next/server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { createClient as createServerSupabaseClient } from "@/lib/supabase/server";
import { createSignedUrl, removeFiles } from "@/lib/supabase/storage";
import { SYLLABUS_UPLOAD_BUCKET } from "@/lib/syllabus-upload-source";
import { VIDEO_GRADING_ENABLED } from "@/lib/grade/constants";
import { VIDEO_NOT_ENABLED_MESSAGE } from "@/lib/grade/video-transport";
import { prepareLooseVideo, readObjectHead, type PrepareVideoDeps } from "@/lib/grade/video-prepare";

// VIDEO-GRADING W2 (docs/video-grading-chat-intake-ops.md section 3.1): the
// server half of the LOOSE video transport. The browser uploaded one video
// straight to `${userId}/grading-uploads/<uuid>.<ext>` (uploadGradingVideo);
// this handler validates the path, checks the stored size, sniffs only the
// first bytes, and returns ONE entry carrying a `videoRef` - never the bytes.
// Modelled on /api/grade-submission-zip. Unlike that route it does NOT delete
// the object on success: the grade request that consumes the entry owns it
// (the orphan sweep reaps anything abandoned).
//
// FIXED ORDER (pinned by route.test.ts): requireAppOwner() before the body is
// read; the JSON content-type CSRF floor; parse; the dark-flag gate; then
// prepareLooseVideo (path contract, size stat, head sniff). There is no
// client-supplied URL anywhere: the only URL fetched is a signed URL this
// route mints itself from the validated path.
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : "an unexpected error";
}

/** The stored object's size from Storage metadata, or null when unknown. */
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

const deps: PrepareVideoDeps = {
  statObjectSize,
  readHead: async (storagePath) => {
    const signed = await createSignedUrl(SYLLABUS_UPLOAD_BUCKET, storagePath, 60);
    if (signed.error || !signed.data?.signedUrl) return null;
    return readObjectHead(signed.data.signedUrl, (url, init) => fetch(url, init));
  },
  remove: async (paths) => {
    try {
      await removeFiles(SYLLABUS_UPLOAD_BUCKET, paths);
    } catch {
      // best effort; the orphan sweep is the backstop
    }
  },
};

export async function POST(req: NextRequest) {
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

  // DARK FLAG: while video grading is off, no Storage call is ever made.
  if (!VIDEO_GRADING_ENABLED) {
    return NextResponse.json(
      { error: VIDEO_NOT_ENABLED_MESSAGE, videoFailure: "not supported here" },
      { status: 403 }
    );
  }

  const result = await prepareLooseVideo({
    userId,
    storagePath: body.storagePath,
    name: body.name,
    label: body.label,
    deps,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, ...(result.failure ? { videoFailure: result.failure } : {}) },
      { status: result.status }
    );
  }
  return NextResponse.json({ entry: result.entry }, { status: 200 });
}
