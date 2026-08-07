// Hand-rolled fetch client for the Tavus avatar-training/generation API
// (house style - no SDK dependency). This is a PLAIN module, not "use
// server", so it may export constants and pure helpers alongside the
// network functions; the action layer (src/app/actions/media-likeness.ts)
// is not allowed to export anything but async functions, so every shared
// constant lives here instead.
//
// THE TAVUS CONTRACT (researched 2026-08-06 against live docs - treated as
// fact, not re-derived here):
//   Base https://tavusapi.com, auth header `x-api-key` (NOT Bearer/X-Api-Key).
//   Train:  POST /v2/faces  { train_video_url, face_name, model_name }
//           -> { face_id, status } where status is started|completed|error.
//   Poll:   GET /v2/faces/{face_id}?verbose=true
//           -> { face_id, status, training_progress: "n/100", error_message }.
//   Generate: POST /v2/videos { replica_id, script, video_name }
//           -> { video_id, status, hosted_url }.
//   Poll video: GET /v2/videos/{video_id}?verbose=true
//           -> status queued|generating|ready|deleted|error, + download_url.
//   Delete: DELETE /v2/faces/{face_id}.
//
//   THE #1 TRAP: /v2/videos takes the face id under the key `replica_id`,
//   never `face_id`. Sending `face_id` there is the most likely 400 in the
//   whole integration.
//
//   Terminal status is two different strings: the GET returns "completed",
//   the webhook shape returns "ready". Both count as success - never switch
//   on only one.
//
//   consent_video_url is documented Legacy ("new integrations should not
//   send this field") and is never sent. callback_url is never sent either -
//   see AC5.5: Tavus publishes no signature/verification scheme for it, so a
//   callback route would be an unauthenticated public endpoint.
//
// Undocumented and therefore NOT assumed anywhere below: whether /v2/videos
// also accepts face_id, whether Tavus re-fetches the training URL during
// training, whether download_url expires, any script length cap, any rate
// limit. Where behavior is unknown, the code below stays defensive (e.g.
// tolerating a missing field rather than throwing) instead of guessing.

export const TAVUS_BASE = "https://tavusapi.com";

// Tavus documents 24h as the FLOOR for how long the training URL must stay
// valid. Training itself runs 3-4 hours and the docs never say whether they
// fetch the URL once up front or re-read it partway through training - so
// the signed URL must outlive the entire training window with margin, not
// just the documented minimum. 48h was chosen as double the floor.
export const TAVUS_TRAIN_URL_TTL_SECONDS = 48 * 60 * 60;

// Tavus documents no script length limit for /v2/videos. This is a LOCALLY
// CHOSEN soft cap (not a provider limit) so a single generated video stays a
// reasonable length; roughly 5 minutes of spoken script at ~140 words/minute
// and ~5.5 characters/word. Deliberately NOT the HeyGen path's 9000-char cap
// (src/app/actions/media-avatar.ts) - that number belongs to a different
// provider and would be a fabricated constraint here.
export const TAVUS_SCRIPT_MAX_CHARS = 4000;

// Tavus pins the model explicitly rather than drifting with whatever Tavus
// treats as its current default.
const TAVUS_MODEL_NAME = "phoenix-4";

/** Every training-failure reason Tavus documents. Exported so the plain-
 * language mapping below cannot silently drift from what it claims to cover
 * (see the "knows every failure code" test in tavus.test.ts). */
export const TAVUS_TRAINING_ERROR_CODES = [
  "video_format",
  "video_codec",
  "file_size",
  "video_duration",
  "video_fps",
  "poor_lighting",
  "teeth_not_visible",
  "improper_camera_angle",
  "face_turned_away",
  "excessive_movement_detected",
  "hands_obstructing_face",
  "second_person_detected",
  "video_editing_detected",
  "background_noise_detected",
  "community_guidelines_violation",
] as const;

export type TavusTrainingErrorCode = (typeof TAVUS_TRAINING_ERROR_CODES)[number];

const TAVUS_TRAINING_ERROR_MESSAGES: Record<TavusTrainingErrorCode, string> = {
  video_format: "The training video's file format was not accepted. Re-record and save as an MP4 (H.264 video, AAC audio), then upload again.",
  video_codec: "The video's codec was not accepted - Tavus expects H.264 video with AAC audio. Try a different browser (the recorder shows a warning when it cannot produce that combination) and re-record.",
  file_size: "The training video was larger than the provider's size limit. Trim the recording or lower its bitrate, then try again.",
  video_duration: "The training video was not the length Tavus expects for reliable training. Re-record the two staged segments at their full target durations without stopping early.",
  video_fps: "The training video's frame rate was below the minimum Tavus requires. Re-record at 30 frames per second or higher.",
  poor_lighting: "The lighting in the training video was too dim or uneven for Tavus to read facial detail clearly. Re-record facing a bright, even light source - ideally a window or a lamp aimed at your face - and avoid strong light behind you.",
  teeth_not_visible: "Tavus needs to see your teeth in some frames to model speech accurately. Re-record while speaking naturally and smiling occasionally so your mouth stays clearly visible.",
  improper_camera_angle: "The camera angle was not straight-on. Re-record with the camera at eye level, framed on your face and shoulders, without tilting up or down.",
  face_turned_away: "Your face turned away from the camera for too much of the training video. Re-record keeping your eyes on the lens and your face forward for the entire take, especially during the stillness segment.",
  excessive_movement_detected: "There was too much movement in the training video for Tavus to lock onto a stable likeness. Re-record with steadier framing and less motion, especially during the stillness segment.",
  hands_obstructing_face: "Your hands covered part of your face during the training video. Re-record keeping your hands away from your face and out of frame the whole time.",
  second_person_detected: "Tavus detected a second person in the training video, which it will not train on. Re-record alone, in a frame with no one else visible, even briefly in the background.",
  video_editing_detected: "The training video looked like it had been cut or edited, which Tavus rejects outright. Re-record as one continuous take with no pauses, cuts, or stitched segments.",
  background_noise_detected: "Background noise in the training video interfered with cloning your voice. Re-record somewhere quiet, away from fans, traffic, or other people talking.",
  community_guidelines_violation: "Tavus flagged the training video as violating its content guidelines and will not train on it. Review Tavus's content policy before re-recording if you believe this was a mistake.",
};

/** Normalize a Tavus status string for comparison: trim, lowercase. */
function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

/** Both documented success strings - the GET endpoint returns "completed",
 * the webhook payload shape returns "ready". Treat either as success;
 * switching on only one is a real, documented way to poll forever. */
export function isTavusTerminalSuccess(status: string): boolean {
  const s = normalizeStatus(status);
  return s === "completed" || s === "ready";
}

export function isTavusTerminalFailure(status: string): boolean {
  return normalizeStatus(status) === "error";
}

/** True for every status a poll loop must stop on: both success strings,
 * the failure string, and "deleted" - a documented terminal VIDEO status
 * that is neither success nor a failure of ours, but must still stop
 * polling (a poll loop that only knows success/error would poll a deleted
 * video forever). */
export function isTavusTerminal(status: string): boolean {
  return isTavusTerminalSuccess(status) || isTavusTerminalFailure(status) || normalizeStatus(status) === "deleted";
}

/**
 * Turn a Tavus training failure into plain language. `code` is checked
 * against the documented failure-reason list first; an unrecognized (or
 * missing) code falls back to the provider's raw `message`, and both
 * missing falls back to a generic notice. A 3-4 hour round trip makes a
 * vague error expensive, so every documented code gets its own actionable
 * sentence rather than one canned message.
 */
export function describeTavusTrainingError(code: string | null, message: string | null): string {
  const normalizedCode = code?.trim();
  if (normalizedCode && (TAVUS_TRAINING_ERROR_CODES as readonly string[]).includes(normalizedCode)) {
    return TAVUS_TRAINING_ERROR_MESSAGES[normalizedCode as TavusTrainingErrorCode];
  }
  const trimmedMessage = message?.trim();
  if (trimmedMessage) {
    return `Training failed: ${trimmedMessage}`;
  }
  return "Training failed for an unspecified reason. Try re-recording the sample and starting training again.";
}

/** Best-effort extraction of a human-readable message from a Tavus error
 * body. The documented error shape is `{ error: string }`; a generic 5xx
 * sometimes comes back as `{ message: string }` instead, so both are
 * checked before falling back to a bare status line. */
function tavusErrorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  }
  return `Tavus API error (HTTP ${status}).`;
}

async function tavusRequest(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${TAVUS_BASE}${path}`, {
    ...init,
    headers: {
      "x-api-key": apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

export async function createTavusFace(
  apiKey: string,
  input: { trainVideoUrl: string; faceName: string }
): Promise<{ faceId: string; status: string } | { error: string }> {
  const { ok, status, data } = await tavusRequest(apiKey, "/v2/faces", {
    method: "POST",
    body: JSON.stringify({
      train_video_url: input.trainVideoUrl,
      face_name: input.faceName,
      model_name: TAVUS_MODEL_NAME,
    }),
  });
  if (!ok) return { error: tavusErrorMessage(data, status) };
  const d = (data ?? {}) as { face_id?: string; status?: string };
  if (!d.face_id) return { error: "Tavus did not return a face id." };
  return { faceId: d.face_id, status: d.status ?? "started" };
}

export async function getTavusFace(
  apiKey: string,
  faceId: string
): Promise<
  | { faceId: string; faceName: string | null; status: string; trainingProgress: string | null; errorMessage: string | null }
  | { error: string }
> {
  const { ok, status, data } = await tavusRequest(apiKey, `/v2/faces/${encodeURIComponent(faceId)}?verbose=true`);
  if (!ok) return { error: tavusErrorMessage(data, status) };
  const d = (data ?? {}) as {
    face_id?: string;
    face_name?: string | null;
    status?: string;
    training_progress?: string | null;
    error_message?: string | null;
  };
  if (!d.face_id) return { error: "Tavus did not return a face id." };
  return {
    faceId: d.face_id,
    faceName: d.face_name ?? null,
    status: d.status ?? "unknown",
    trainingProgress: d.training_progress ?? null,
    errorMessage: d.error_message ?? null,
  };
}

export async function createTavusVideo(
  apiKey: string,
  input: { faceId: string; script: string; videoName: string }
): Promise<{ videoId: string; status: string; hostedUrl: string | null } | { error: string }> {
  const script = input.script.trim();
  if (!script) return { error: "Cannot generate a video from an empty script." };
  const { ok, status, data } = await tavusRequest(apiKey, "/v2/videos", {
    method: "POST",
    body: JSON.stringify({
      // THE TRAP: this key is replica_id, NOT face_id, even though the value
      // came back from /v2/faces as face_id. The OpenAPI spec names only
      // replica_id here.
      replica_id: input.faceId,
      script,
      video_name: input.videoName,
    }),
  });
  if (!ok) return { error: tavusErrorMessage(data, status) };
  const d = (data ?? {}) as { video_id?: string; status?: string; hosted_url?: string | null };
  if (!d.video_id) return { error: "Tavus did not return a video id." };
  return { videoId: d.video_id, status: d.status ?? "queued", hostedUrl: d.hosted_url ?? null };
}

export async function getTavusVideo(
  apiKey: string,
  videoId: string
): Promise<
  | { videoId: string; status: string; downloadUrl: string | null; hostedUrl: string | null; generationProgress: string | null }
  | { error: string }
> {
  const { ok, status, data } = await tavusRequest(apiKey, `/v2/videos/${encodeURIComponent(videoId)}?verbose=true`);
  if (!ok) return { error: tavusErrorMessage(data, status) };
  const d = (data ?? {}) as {
    video_id?: string;
    status?: string;
    download_url?: string | null;
    hosted_url?: string | null;
    generation_progress?: string | null;
  };
  if (!d.video_id) return { error: "Tavus did not return a video id." };
  return {
    videoId: d.video_id,
    status: d.status ?? "unknown",
    downloadUrl: d.download_url ?? null,
    hostedUrl: d.hosted_url ?? null,
    generationProgress: d.generation_progress ?? null,
  };
}

/** Delete a face on the provider. A 404 (already gone) counts as success -
 * deleting a likeness must not fail just because Tavus already dropped the
 * face, since the local row still needs to go either way. */
export async function deleteTavusFace(apiKey: string, faceId: string): Promise<{ ok: true } | { error: string }> {
  const { ok, status, data } = await tavusRequest(apiKey, `/v2/faces/${encodeURIComponent(faceId)}`, {
    method: "DELETE",
  });
  if (ok || status === 404) return { ok: true };
  return { error: tavusErrorMessage(data, status) };
}
