"use server";

// Avatar Studio server actions: Tavus-backed likeness training and
// prompt-driven video generation. Every action is owner-gated with the
// existing requireOwner() (AC5.3). Shared constants and pure helpers live in
// src/lib/tavus.ts and src/lib/avatar-likeness.ts, never here - a "use
// server" module may export nothing but async functions (enforced by
// src/lib/use-server-exports.test.ts), so there is nowhere else to put them.

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { createSignedUrl } from "@/lib/supabase/storage";
import type { Database } from "@/lib/supabase/types";
import { getRecordingFileById, saveRecordingFile } from "@/lib/recording-files";
import { getCourse, listCourses } from "@/lib/supabase/courses";
import { renderCourseFacts } from "@/lib/course-facts";
import { composeAvatarScriptBrief, type AvatarVideoPurpose } from "@/lib/avatar-video-purpose";
import {
  TAVUS_TRAIN_URL_TTL_SECONDS,
  TAVUS_SCRIPT_MAX_CHARS,
  TAVUS_TRAINING_ERROR_CODES,
  isTavusTerminalSuccess,
  isTavusTerminalFailure,
  isTavusTerminal,
  describeTavusTrainingError,
  createTavusFace,
  getTavusFace,
  createTavusVideo,
  getTavusVideo,
  deleteTavusFace,
} from "@/lib/tavus";
import {
  type AvatarLikeness,
  type AvatarLikenessStatus,
  listAvatarLikenesses,
  getAvatarLikenessById,
  findNonTerminalAvatarLikeness,
  findDefaultReadyAvatarLikeness,
  listSupersedableAvatarLikenesses,
  isSampleFileInUseByLikeness,
  findNextReadyAvatarLikeness,
  createAvatarLikeness,
  updateAvatarLikeness,
  markAvatarLikenessSuperseded,
  setDefaultAvatarLikeness,
  deleteAvatarLikenessRow,
  createAvatarVideo,
  getAvatarVideoById,
  updateAvatarVideo,
} from "@/lib/avatar-likeness";
import { callLlm, type LlmPart } from "@/lib/llm";
import { getWritingStyleBlock } from "./shared";

/** TAVUS_API_KEY is read server-side only, here and nowhere else in this
 * module - it is never sent to the browser and never appears in a client
 * bundle (AC5.1). */
function tavusApiKey(): string | null {
  const key = process.env.TAVUS_API_KEY?.trim();
  return key ? key : null;
}

const NOT_CONFIGURED_MESSAGE =
  "Avatar Studio is not configured. Set TAVUS_API_KEY (server-side) to enable it. Note that custom face training requires a paid Tavus plan - the free tier cannot train a likeness at all.";

/** Gates the UI: with no key set, the view should explain what to set and
 * disable train/generate rather than erroring on click (AC5.2). */
export async function avatarStudioConfiguredAction(): Promise<{ configured: boolean }> {
  try {
    await requireOwner();
    return { configured: !!tavusApiKey() };
  } catch {
    return { configured: false };
  }
}

export async function listAvatarLikenessesAction(): Promise<{ likenesses: AvatarLikeness[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const likenesses = await listAvatarLikenesses(supabase, user.id);
    return { likenesses };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load avatar likenesses." };
  }
}

/**
 * Retire every OTHER non-superseded likeness for `userId` the moment
 * `keepId` has just become "ready" - never at training start (AC7.1). Both
 * places that can observe a likeness turning ready funnel through here:
 * refreshAvatarLikenessAction's normal poll, and startAvatarTrainingAction
 * itself for the rare case where createTavusFace returns an
 * already-terminal success. One shared place, so the "retire on ready, not
 * on start" rule cannot drift between the two.
 *
 * findNonTerminalAvatarLikeness already blocks a second concurrent training
 * (AC7.3), so by the time ANY likeness reaches ready, every other likeness
 * for this user is already terminal - retiring them here costs at most one
 * extra paid slot, for the duration of the training that just finished, and
 * never touches a likeness that is still training.
 *
 * keepId is excluded at the query itself (listSupersedableAvatarLikenesses's
 * excludeId) AND checked again per-row below - an off-by-one here would
 * delete the avatar the user just waited hours for, so this is deliberately
 * not trusted to one layer alone.
 *
 * Also promotes keepId to the owner's default likeness whenever it is owed
 * one: either a retired likeness held the default, or the owner has no
 * default at all (a brand-new account's first-ever likeness included) - see
 * the comment further down, by the promotion check itself, for why both
 * cases are decided from data already in hand. Without this, a likeness
 * could finish training "ready" and generation would stay disabled because
 * nothing was ever marked default (AC7.1's gap).
 */
async function retireSupersededAvatarLikenesses(
  supabase: SupabaseClient<Database>,
  apiKey: string,
  userId: string,
  keepId: string
): Promise<void> {
  const others = await listSupersedableAvatarLikenesses(supabase, userId, keepId);
  let keepShouldBecomeDefault = false;

  for (const prior of others) {
    if (prior.id === keepId) continue; // belt-and-suspenders, see doc comment above

    if (prior.isDefault) keepShouldBecomeDefault = true;

    if (prior.externalId) {
      // deleteTavusFace CAN throw: it makes a real network fetch() call
      // (src/lib/tavus.ts's tavusRequest) that rejects outright on a network
      // error - the `res.json().catch(() => null)` in there only guards
      // JSON-parsing of a successful response, never the fetch itself. (The
      // sibling call site in deleteAvatarLikenessAction below already treats
      // it this way, with its own `.catch(() => {})` - the two call sites
      // used to disagree, and this comment used to claim the opposite of
      // what the code in tavus.ts actually does.) Provider-side deletion is
      // best-effort by design - a leaked provider face costs nothing further
      // once the local row is superseded - so a network blip here must never
      // abort the local bookkeeping that follows (superseding the row,
      // promoting the default below): that bookkeeping is what actually
      // keeps generation working, and losing it to an unrelated network
      // error is worse than losing the provider-side cleanup.
      await deleteTavusFace(apiKey, prior.externalId).catch(() => {});
    }
    await markAvatarLikenessSuperseded(supabase, prior.id);
  }

  // Promote keepId to default not only when a just-retired likeness held the
  // default (the loop above), but also when the user has NO default at all
  // right now - a brand-new account's very first likeness, or an account
  // that otherwise ended up with a ready likeness and no default. `others`
  // already reflects every non-superseded likeness for this user besides
  // keepId, fetched once above; keepId itself cannot already be default here
  // (it is only ever passed in the moment IT first turns ready, and
  // setDefaultAvatarLikenessAction refuses to default anything that is not
  // already "ready" - so this is necessarily keepId's first ready
  // transition). So if nothing in `others` is the default, nobody anywhere
  // is - decided from data already fetched above rather than a second read
  // that could race the write below.
  if (!others.some((prior) => prior.isDefault)) keepShouldBecomeDefault = true;

  if (keepShouldBecomeDefault) {
    // markAvatarLikenessSuperseded already cleared is_default on every
    // retired row above, so at most keepId can be default now. Promote it
    // through the existing atomic mechanism (the avatar_likenesses_one_default
    // partial unique index backs setDefaultAvatarLikeness) rather than
    // hand-writing is_default, so a user is never left with a ready likeness
    // and no default.
    await setDefaultAvatarLikeness(supabase, userId, keepId);
  }
}

/**
 * Start training a new likeness from a saved sample recording.
 *
 * Enforces AC7.3 (one non-terminal training per user), mints a signed URL
 * for the private sample object at TAVUS_TRAIN_URL_TTL_SECONDS via the
 * existing createSignedUrl (never makes the bucket public, never proxies the
 * bytes through this action), and stores the consent acknowledgement + its
 * timestamp on the new row (AC1.2b).
 *
 * Deliberately does NOT retire any prior likeness here. Training runs 3-4
 * hours; retiring the user's working "ready" likeness at start would leave
 * them with no usable likeness for the whole run, and permanently if the new
 * attempt then fails. findNonTerminalAvatarLikeness above already guarantees
 * every prior likeness is terminal by this point (AC7.3 - only one training
 * can be in flight), so leaving them in place costs at most one extra paid
 * slot for the duration of this training. Prior likenesses are retired only
 * once THIS one actually reaches "ready" - see retireSupersededAvatarLikenesses
 * (AC7.1), called from here (only if createTavusFace itself returns an
 * already-terminal success) and from refreshAvatarLikenessAction (the normal
 * poll-to-ready path) - one shared place so the rule cannot drift between
 * the two.
 */
export async function startAvatarTrainingAction(
  sampleFileId: string,
  name: string,
  acknowledgement: string
): Promise<{ likeness: AvatarLikeness } | { error: string }> {
  try {
    const user = await requireOwner();
    const apiKey = tavusApiKey();
    if (!apiKey) return { error: NOT_CONFIGURED_MESSAGE };

    const trimmedName = name.trim();
    if (!trimmedName) return { error: "Name the likeness before training." };
    const trimmedAck = acknowledgement.trim();
    if (!trimmedAck) return { error: "Confirm the consent acknowledgement before training." };

    const supabase = createServiceClient();

    const inFlight = await findNonTerminalAvatarLikeness(supabase, user.id);
    if (inFlight) {
      return {
        error:
          "A likeness is already training. Wait for it to finish (or fail) before starting another - each attempt uses one of a limited number of paid slots.",
      };
    }

    const sample = await getRecordingFileById(supabase, user.id, sampleFileId);
    if (!sample) return { error: "That sample recording could not be found." };
    if (sample.kind !== "sample") return { error: "Select a saved Avatar sample recording to train from." };

    const { data: signed, error: signError } = await createSignedUrl(
      "recordings",
      sample.storagePath,
      TAVUS_TRAIN_URL_TTL_SECONDS
    );
    if (signError || !signed) {
      return { error: signError?.message ?? "Could not create a signed URL for the sample recording." };
    }

    let likeness = await createAvatarLikeness(supabase, user.id, {
      name: trimmedName,
      sampleFileId,
      acknowledgement: trimmedAck,
      acknowledgedAt: new Date().toISOString(),
    });

    const created = await createTavusFace(apiKey, { trainVideoUrl: signed.signedUrl, faceName: trimmedName });
    if ("error" in created) {
      likeness = await updateAvatarLikeness(supabase, likeness.id, { status: "failed", errorMessage: created.error });
      return { error: created.error };
    }

    const status: AvatarLikenessStatus = isTavusTerminalFailure(created.status)
      ? "failed"
      : isTavusTerminalSuccess(created.status)
        ? "ready"
        : "training";
    likeness = await updateAvatarLikeness(supabase, likeness.id, { externalId: created.faceId, status });
    if (status === "ready") {
      // Undocumented, but createTavusFace's own return type allows POST
      // /v2/faces to come back already terminal - if that happens, this is
      // the only place the ready transition is ever observed, since
      // refreshAvatarLikenessAction will see status "ready" already persisted
      // and return early without polling. Route through the same shared
      // helper the normal poll path uses.
      await retireSupersededAvatarLikenesses(supabase, apiKey, user.id, likeness.id);
    }
    return { likeness };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start avatar training." };
  }
}

/**
 * Poll training status for one likeness. Reads the current row from the DB
 * first (AC3.4: a user who closes the tab for hours must see the true state
 * on return) and only calls the provider when the local row is still
 * non-terminal. Accepts BOTH "completed" and "ready" as success.
 *
 * The moment this likeness is first observed transitioning INTO "ready", it
 * retires every other non-superseded likeness for this user via
 * retireSupersededAvatarLikenesses (AC7.1) - this is the normal path for
 * that retirement; startAvatarTrainingAction only duplicates the call for
 * the rare already-terminal-on-create case. See that helper for why
 * retirement happens on ready rather than at training start.
 */
export async function refreshAvatarLikenessAction(
  id: string
): Promise<{ likeness: AvatarLikeness } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const likeness = await getAvatarLikenessById(supabase, user.id, id);
    if (!likeness) return { error: "That likeness could not be found." };

    if (!likeness.externalId || likeness.status === "ready" || likeness.status === "failed" || likeness.status === "superseded") {
      return { likeness };
    }

    const apiKey = tavusApiKey();
    if (!apiKey) return { error: NOT_CONFIGURED_MESSAGE };

    const face = await getTavusFace(apiKey, likeness.externalId);
    if ("error" in face) return { error: face.error };

    if (!isTavusTerminal(face.status)) {
      // training_progress IS persisted here, for DISPLAY ONLY - it is never
      // used to infer a stall or drive a timeout. The Tavus FAQ says it
      // legitimately sits at one value while a step processes, so this poll
      // loop keeps deciding success/failure off face.status alone, exactly
      // as before; see AvatarLikeness.trainingProgress's own comment.
      const refreshed = await updateAvatarLikeness(supabase, likeness.id, {
        status: "training",
        trainingProgress: face.trainingProgress,
      });
      return { likeness: refreshed };
    }

    if (isTavusTerminalSuccess(face.status)) {
      const refreshed = await updateAvatarLikeness(supabase, likeness.id, {
        status: "ready",
        errorMessage: null,
        trainingProgress: face.trainingProgress,
      });
      await retireSupersededAvatarLikenesses(supabase, apiKey, user.id, refreshed.id);
      return { likeness: refreshed };
    }

    // Terminal failure. Whether error_message carries one of the documented
    // snake_case codes or a free-form sentence is undocumented, so both are
    // tried defensively: an exact match against the known code list gets the
    // plain-language treatment, anything else is passed through as the raw
    // message.
    const raw = face.errorMessage;
    const code = raw && (TAVUS_TRAINING_ERROR_CODES as readonly string[]).includes(raw) ? raw : null;
    const description = describeTavusTrainingError(code, raw);
    const refreshed = await updateAvatarLikeness(supabase, likeness.id, {
      status: "failed",
      errorMessage: description,
      trainingProgress: face.trainingProgress,
    });
    return { likeness: refreshed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not refresh the likeness." };
  }
}

/** Marks one likeness the owner's default, atomically clearing any previous
 * default (AC3.5 - the actual atomicity guarantee is the DB-level partial
 * unique index in the migration; this just avoids tripping it mid-swap). */
export async function setDefaultAvatarLikenessAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const likeness = await getAvatarLikenessById(supabase, user.id, id);
    if (!likeness) return { error: "That likeness could not be found." };
    if (likeness.status !== "ready") return { error: "Only a fully trained (ready) likeness can be set as the default." };
    await setDefaultAvatarLikeness(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not set the default likeness." };
  }
}

/** Deletes the local row and attempts the provider-side delete, tolerating a
 * provider 404 (already gone). Promotes the next-newest ready likeness to
 * default if the deleted one was the default (AC7.4). */
export async function deleteAvatarLikenessAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const likeness = await getAvatarLikenessById(supabase, user.id, id);
    if (!likeness) return { ok: true };

    const apiKey = tavusApiKey();
    if (apiKey && likeness.externalId) {
      await deleteTavusFace(apiKey, likeness.externalId).catch(() => {});
    }

    await deleteAvatarLikenessRow(supabase, id);

    if (likeness.isDefault) {
      const next = await findNextReadyAvatarLikeness(supabase, user.id, id);
      if (next) {
        await setDefaultAvatarLikeness(supabase, user.id, next.id);
      }
    }

    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the likeness." };
  }
}

/** Whether a sample recording is referenced by a likeness still training
 * from it - the Files tab uses this to refuse deleting a sample mid-training
 * (AC7.2), since deleteRecordingFile knows nothing about likenesses.
 *
 * Fails CLOSED. This check is the only thing standing between the user and
 * deleting webcam footage a Tavus training job may still be reading from a
 * signed URL. On ANY failure here - an auth blip, a transient DB error, a
 * network hiccup - there is no way to prove the sample is unused, and the
 * cost of wrongly answering "not in use" is a silently killed 3-4 hour
 * training job and a burned paid Tavus slot, neither of which is
 * recoverable. A wrong "in use" only costs the caller a delayed retry, so
 * the catch below always answers true, never false.
 *
 * Note for whoever next touches the caller (FilesTab.tsx, out of scope for
 * this fix): its blocked-delete copy currently reads "a likeness is still
 * training from it," which assumes the block always means a live training.
 * That is not true of this fail-closed path - it can fire with no likeness
 * involved at all (e.g. a DB blip) - so that copy can be misleading in this
 * specific case. The exported signature here is intentionally left as
 * `Promise<{ inUse: boolean }>` (another caller already depends on it), so
 * distinguishing "confirmed in use" from "could not verify" for the UI
 * requires a change on the caller side, not here.
 */
export async function sampleInUseAction(sampleFileId: string): Promise<{ inUse: boolean }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const inUse = await isSampleFileInUseByLikeness(supabase, user.id, sampleFileId);
    return { inUse };
  } catch {
    return { inUse: true };
  }
}

/**
 * Turns a free-text prompt into a spoken-word script via callLlm, applying
 * the instructor's writing style through getWritingStyleBlock - same shape
 * as generateLectureScriptAction (src/app/actions/media.ts:222).
 *
 * `courseId` and `purpose` are both optional - the picker they back (F4)
 * augments the instructor's own prompt, never replaces it. When a courseId
 * is given it is loaded through getCourse(user.id, courseId), which is
 * scoped to the CALLER's own user_id at the query itself; a courseId that
 * exists but belongs to someone else therefore comes back null exactly like
 * a courseId that does not exist at all, and is treated the same way as no
 * course selected - never as an error, and never a path that could leak
 * another user's course facts. The actual rendering of a loaded course into
 * plain-text facts is NOT re-implemented here: it goes through the existing
 * renderCourseFacts (src/lib/course-facts.ts), the same renderer
 * askAboutCourseAction already uses (src/app/actions/llm-content.ts). The
 * course facts, the purpose's guidance, and the prompt are combined by the
 * pure composeAvatarScriptBrief (src/lib/avatar-video-purpose.ts) so that
 * seam stays unit-testable without a database or an LLM.
 */
export async function generateAvatarScriptAction(input: {
  prompt: string;
  courseId?: string | null;
  purpose?: AvatarVideoPurpose | null;
}): Promise<{ script: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const trimmed = input.prompt.trim();
    if (!trimmed) return { error: "Describe the video you want before generating a script." };

    let courseFacts: string | null = null;
    if (input.courseId) {
      const course = await getCourse(user.id, input.courseId);
      if (course) courseFacts = renderCourseFacts(course);
    }

    const brief = composeAvatarScriptBrief({
      prompt: trimmed,
      courseFacts,
      purpose: input.purpose ?? null,
    });

    const styleBlock = await getWritingStyleBlock(user.id);
    const parts: LlmPart[] = [
      {
        text: [
          brief,
          `Target length: comfortably under ${TAVUS_SCRIPT_MAX_CHARS} characters - this app's own limit for a single avatar video, not a limit the video provider itself imposes.`,
          "Rules: conversational but precise; short sentences; first person, as if speaking directly to camera. Return ONLY the script as plain text - no headings, no markdown, no stage directions." +
            styleBlock,
        ].join("\n\n"),
      },
    ];
    const r = await callLlm({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.6, maxOutputTokens: 2048 } });
    if (!r.ok || !r.text.trim()) return { error: "The model returned no script. Try again." };
    return { script: r.text.trim().slice(0, TAVUS_SCRIPT_MAX_CHARS) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the script." };
  }
}

/** Lists the owner's courses for the Avatar Studio course picker, newest
 * (most recently updated - listCourses's own ordering) first. `label` pairs
 * the course code with its name when a code is set, since a bare course name
 * alone is not always enough for an instructor to recognise which section
 * they are looking at. */
export async function listAvatarCourseOptionsAction(): Promise<
  { courses: Array<{ id: string; label: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const courses = await listCourses(user.id);
    return {
      courses: courses.map((c) => ({
        id: c.id,
        label: c.courseCode ? `${c.courseCode} - ${c.name}` : c.name,
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load courses." };
  }
}

/** Starts rendering against the owner's default (ready) likeness. Returns
 * this app's own avatar_videos row id as the job id to poll with
 * refreshAvatarVideoAction - never the provider's video id - so polling stays
 * owner-scoped through our own row rather than trusting a client-supplied
 * provider id. */
export async function startAvatarVideoAction(script: string, name: string): Promise<{ jobId: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const apiKey = tavusApiKey();
    if (!apiKey) return { error: NOT_CONFIGURED_MESSAGE };

    const trimmedScript = script.trim();
    if (!trimmedScript) return { error: "Write or generate a script before rendering." };
    if (trimmedScript.length > TAVUS_SCRIPT_MAX_CHARS) {
      return { error: `This app limits scripts to ${TAVUS_SCRIPT_MAX_CHARS} characters. Trim the script and try again.` };
    }
    const trimmedName = name.trim() || "Avatar video";

    const supabase = createServiceClient();
    const likeness = await findDefaultReadyAvatarLikeness(supabase, user.id);
    if (!likeness || !likeness.externalId) {
      return { error: "No avatar likeness is ready yet. Train a likeness and set it as the default before generating a video." };
    }

    const created = await createTavusVideo(apiKey, { faceId: likeness.externalId, script: trimmedScript, videoName: trimmedName });
    if ("error" in created) return { error: created.error };

    const video = await createAvatarVideo(supabase, user.id, {
      likenessId: likeness.id,
      externalId: created.videoId,
      status: created.status,
      script: trimmedScript,
    });
    return { jobId: video.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the avatar video." };
  }
}

/**
 * Poll a video render job. On success, downloads the finished bytes
 * SERVER-SIDE from Tavus's download_url and uploads straight to the
 * `recordings` bucket with the service-role client, then inserts the
 * recording_files row (kind "avatar", source "avatar-generate", mime
 * video/mp4) - it never returns bytes through this action's body.
 *
 * This is the one place in the app that deliberately inverts the usual
 * "browser uploads directly to Storage" rule (see the header comment on
 * src/lib/recording-files.ts): the bytes originate at Tavus, not in the
 * browser, fetching download_url from the browser would hit CORS on a
 * domain this app has not verified, and a multi-hundred-megabyte video is
 * not something a server action response is meant to carry either way. Do
 * not "fix" this back to a client-side fetch (AC7.6).
 */
export async function refreshAvatarVideoAction(
  jobId: string
): Promise<{ status: string; fileId: string | null; error?: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const video = await getAvatarVideoById(supabase, user.id, jobId);
    if (!video) return { error: "That video job could not be found." };

    if (video.recordingFileId) {
      return { status: "ready", fileId: video.recordingFileId };
    }

    const apiKey = tavusApiKey();
    if (!apiKey) return { error: NOT_CONFIGURED_MESSAGE };
    if (!video.externalId) return { status: video.status, fileId: null, error: video.errorMessage ?? undefined };

    const polled = await getTavusVideo(apiKey, video.externalId);
    if ("error" in polled) return { error: polled.error };

    if (!isTavusTerminal(polled.status)) {
      const updated = await updateAvatarVideo(supabase, video.id, { status: polled.status });
      return { status: updated.status, fileId: null };
    }

    if (isTavusTerminalFailure(polled.status)) {
      const message = "The avatar video failed to generate.";
      const updated = await updateAvatarVideo(supabase, video.id, { status: polled.status, errorMessage: message });
      return { status: updated.status, fileId: null, error: message };
    }

    if (!isTavusTerminalSuccess(polled.status)) {
      // Terminal, but neither our success nor our failure - the documented
      // "deleted" video status. Stop polling and say so plainly.
      const message = "The video was removed from the provider before it could be downloaded.";
      const updated = await updateAvatarVideo(supabase, video.id, { status: polled.status, errorMessage: message });
      return { status: updated.status, fileId: null, error: message };
    }

    if (!polled.downloadUrl) {
      return { status: video.status, fileId: null, error: "The video finished rendering but no download URL was returned." };
    }

    const downloadRes = await fetch(polled.downloadUrl);
    if (!downloadRes.ok) {
      const message = `Could not download the finished video (HTTP ${downloadRes.status}).`;
      await updateAvatarVideo(supabase, video.id, { errorMessage: message });
      return { status: video.status, fileId: null, error: message };
    }
    const bytes = await downloadRes.arrayBuffer();
    const blob = new Blob([bytes], { type: "video/mp4" });

    const saved = await saveRecordingFile(supabase, user.id, blob, {
      name: `Avatar - ${video.script.slice(0, 60).trim() || "video"}`,
      kind: "avatar",
      mimeType: "video/mp4",
      durationSec: null,
      source: "avatar-generate",
    });

    const updated = await updateAvatarVideo(supabase, video.id, {
      status: polled.status,
      errorMessage: null,
      recordingFileId: saved.id,
    });
    return { status: updated.status, fileId: updated.recordingFileId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not refresh the avatar video." };
  }
}
