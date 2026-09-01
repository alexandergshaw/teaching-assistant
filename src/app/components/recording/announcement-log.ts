// Take -> announcement (Manual > Recording > "Draft announcement") - the
// downloadable run log. Pays the docs/DEV_LOOP.md debt this surface owed:
// "captures, transcribes, drafts, generates an image, posts to Canvas" -
// four steps, four different ways for this to fail silently, and nothing
// anywhere else in the app remembers which one actually happened once the
// panel closes.
//
// STRUCTURE REUSED FROM discussion-replies-log.ts (this directory's own
// shipped precedent, read in full before writing this file - itself reused
// from src/lib/repo-grading-log.ts): pure functions, no I/O, no clock reads
// (every timestamp is supplied by the caller as data, never Date.now()/
// toISOString() called in here) so a test pins an exact rendered CSV/JSON
// rather than asserting around "now"; escapeCsvValue
// (src/lib/course-tasks-view-csv.ts) reused rather than a local escaper.
//
// THIS FILE IS NOT THAT ONE - a different, unrelated log for a different
// surface. Unlike a discussion-replies capture run (a live scrolling capture
// against a growing reply table) or a grading-via-recording run (a capture
// loop producing many rows), useTakeAnnouncement.ts's pipeline drafts and
// posts exactly ONE announcement for ONE take per hook mount - so there is
// no per-row table to snapshot here, only four append-only event streams
// (this surface's own equivalent of "the take, the transcription path taken
// and any chunk retries, the draft, the image outcome, and the post
// result", per this task's brief) plus the take's own identity.
//
// SIZE CONSTRAINT: useTakeAnnouncement.ts was already 905 of its 1000-line
// ceiling before this change - see src/file-size-ceiling.structure.test.ts.
// Every formatting/aggregation decision therefore lives HERE, not inline in
// the hook; the hook only appends plain-object literals to refs at the
// handful of points it already branches on success/failure (runDraft,
// generateImage, discardImage, retryFromFailedChunk/startOver, commitPost).
//
// COLLECTION vs ASSEMBLY: useTakeAnnouncement.ts (a hook; vitest here is
// node-env and never renders one) is where the four event streams are
// COLLECTED - that part has no test surface and is verified by reading only.
// ASSEMBLY - turning the collected AnnouncementLogCollected plus the take's
// own name/duration into a complete AnnouncementRunLog, and formatting that
// into CSV/JSON - is entirely in this file, which has no React import, so
// every formatting/aggregation decision here is exercised by a
// frozen-literal-oracle test.
//
// PERSONAL DATA: this log carries the drafted announcement's subject/body
// (course content, not student-identifying) and the course name it was
// posted to (or attempted against). It carries NO student names or student
// work - useTakeAnnouncement.ts's pipeline never reads anything
// student-authored; its only input is the instructor's own recorded take.

import { escapeCsvValue } from "@/lib/course-tasks-view-csv";

// ---------------------------------------------------------------------------
// Event-stream records. Each carries the ISO 8601 timestamp of the event -
// supplied by the collector (useTakeAnnouncement.ts), never computed here.
// ---------------------------------------------------------------------------

/** Which path start() took to obtain a transcript: "cached" (an
 * already-transcribed take/AC24 cache hit, no transcription pipeline ran at
 * all this session), "segments" (take.audioSegments existed - the normal
 * chunked path), or "real-time" (no captured audio track, so the take had to
 * be played back - the slow fallback needsRealTimeConfirm gates). `""` before
 * start() has ever run (never posted, panel opened on an already-posted
 * take). Exactly one value per hook mount - a retry (retryAudio) re-runs
 * start() but does not change which branch it takes for the same take, so
 * this is a single field, not an event stream. */
export type AnnouncementTranscriptionPath = "" | "cached" | "segments" | "real-time";

/** One "Retry from chunk N" or "Start over" click during the chunked
 * transcription path. `restart: true` for "Start over" (chunk 1, every
 * chunk transcript reset); `false` for "Retry from chunk N" (resumes at the
 * failed chunk only). */
export interface AnnouncementLogChunkRetry {
  at: string;
  chunkNumber: number;
  restart: boolean;
}

/** One drafting attempt (runDraft) - the auto-start on open, a Regenerate
 * click, or a post-failure retry all funnel through the same function, so
 * this is the one event type for all of them. `error` is the verbatim
 * message on a failed draft, `""` on success. */
export interface AnnouncementLogDraftAttempt {
  at: string;
  ok: boolean;
  error: string;
}

export type AnnouncementImageOutcome = "generated" | "failed" | "discarded";

/** One image-companion attempt or explicit removal. `"generated"` covers
 * both the automatic first attempt and an explicit Regenerate click (both
 * call the same generateImage()); `"discarded"` is the explicit "Remove
 * image" control, logged as its own outcome (not folded into "failed") since
 * it is a deliberate instructor choice, not an error. `error` is the
 * verbatim failure message for `"failed"`, `""` otherwise. */
export interface AnnouncementLogImageAttempt {
  at: string;
  outcome: AnnouncementImageOutcome;
  error: string;
}

/** One "Post to Canvas" commit attempt (commitPost). `error` is the verbatim
 * message when Canvas refused the whole post, `""` on success.
 * `imageUploadFailed` is true when the post itself succeeded (the
 * announcement text is live) but a "ready" image failed to upload -
 * createAnnouncementAction's own `imageError` on an otherwise-successful
 * result (see useTakeAnnouncement.ts's own header on this exact distinction)
 * - always `false` when `error` is non-empty, since a post that failed
 * outright never reached the point of attempting the image upload. */
export interface AnnouncementLogPostAttempt {
  at: string;
  ok: boolean;
  error: string;
  imageUploadFailed: boolean;
  course: string;
}

/** What useTakeAnnouncement.ts collects across this hook's whole mounted
 * lifetime (one take). */
export interface AnnouncementLogCollected {
  transcriptionPath: AnnouncementTranscriptionPath;
  chunkRetries: AnnouncementLogChunkRetry[];
  draftAttempts: AnnouncementLogDraftAttempt[];
  imageAttempts: AnnouncementLogImageAttempt[];
  postAttempts: AnnouncementLogPostAttempt[];
}

export function emptyAnnouncementLogCollected(): AnnouncementLogCollected {
  return { transcriptionPath: "", chunkRetries: [], draftAttempts: [], imageAttempts: [], postAttempts: [] };
}

export interface AnnouncementRunLog extends AnnouncementLogCollected {
  takeName: string;
  takeDurationSec: number;
}

/** Assembles the full run record from the take's own identity plus whatever
 * has been collected so far - callable at any point in the pipeline (not
 * just after a post), since docs/DEV_LOOP.md's placement rule requires this
 * to be reachable even when the run never reached a post at all. */
export function buildAnnouncementRunLog(args: {
  takeName: string;
  takeDurationSec: number;
  collected: AnnouncementLogCollected;
}): AnnouncementRunLog {
  return { takeName: args.takeName, takeDurationSec: args.takeDurationSec, ...args.collected };
}

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------

export interface AnnouncementLogSummary {
  transcriptionPath: AnnouncementTranscriptionPath;
  chunkRetryCount: number;
  draftAttempts: number;
  draftFailures: number;
  imagesGenerated: number;
  imagesFailed: number;
  imagesDiscarded: number;
  postAttempts: number;
  postFailures: number;
  postsWithImageUploadFailure: number;
}

export function summarizeAnnouncementRunLog(log: AnnouncementRunLog): AnnouncementLogSummary {
  let draftFailures = 0;
  for (const d of log.draftAttempts) {
    if (!d.ok) draftFailures += 1;
  }

  let imagesGenerated = 0;
  let imagesFailed = 0;
  let imagesDiscarded = 0;
  for (const img of log.imageAttempts) {
    switch (img.outcome) {
      case "generated":
        imagesGenerated += 1;
        break;
      case "failed":
        imagesFailed += 1;
        break;
      case "discarded":
        imagesDiscarded += 1;
        break;
      default: {
        const exhaustive: never = img.outcome;
        throw new Error(`Unhandled announcement image outcome: ${String(exhaustive)}`);
      }
    }
  }

  let postFailures = 0;
  let postsWithImageUploadFailure = 0;
  for (const p of log.postAttempts) {
    if (!p.ok) postFailures += 1;
    if (p.imageUploadFailed) postsWithImageUploadFailure += 1;
  }

  return {
    transcriptionPath: log.transcriptionPath,
    chunkRetryCount: log.chunkRetries.length,
    draftAttempts: log.draftAttempts.length,
    draftFailures,
    imagesGenerated,
    imagesFailed,
    imagesDiscarded,
    postAttempts: log.postAttempts.length,
    postFailures,
    postsWithImageUploadFailure,
  };
}

/** The one-line summary shown above the download buttons. Never gated on
 * `postAttempts > 0` - a run that never reached a post (still transcribing,
 * a draft failure never retried) still gets a true, useful sentence, which
 * is exactly the FAILED-run case docs/DEV_LOOP.md's placement rule exists
 * for. */
export function announcementLogSummaryLine(summary: AnnouncementLogSummary): string {
  const pathLabel = summary.transcriptionPath === "" ? "not started" : summary.transcriptionPath;
  const parts = [
    `Transcription: ${pathLabel}${summary.chunkRetryCount > 0 ? ` (${summary.chunkRetryCount} chunk ${summary.chunkRetryCount === 1 ? "retry" : "retries"})` : ""}.`,
    `${summary.draftAttempts} draft attempt${summary.draftAttempts === 1 ? "" : "s"}, ${summary.draftFailures} failed.`,
    `Image: ${summary.imagesGenerated} generated, ${summary.imagesFailed} failed, ${summary.imagesDiscarded} discarded.`,
    `${summary.postAttempts} post attempt${summary.postAttempts === 1 ? "" : "s"}, ${summary.postFailures} failed${summary.postsWithImageUploadFailure > 0 ? `, ${summary.postsWithImageUploadFailure} with a failed image upload` : ""}.`,
  ];
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// CSV. Every field goes through escapeCsvValue - see this file's header.
// Rows joined with \r\n. Five sections in one file, matching
// formatDiscussionRepliesLogCsv/formatGradingRecordingLogCsv's own
// multi-section shape: run-level facts plus four separate event histories
// are each separately load-bearing here.
// ---------------------------------------------------------------------------

const RUN_CSV_HEADER = ["Field", "Value"];
const CHUNK_RETRY_CSV_HEADER = ["At", "Chunk number", "Restart"];
const DRAFT_CSV_HEADER = ["At", "OK", "Error"];
const IMAGE_CSV_HEADER = ["At", "Outcome", "Error"];
const POST_CSV_HEADER = ["At", "OK", "Error", "Image upload failed", "Course"];

function csvRow(values: readonly string[]): string {
  return values.map(escapeCsvValue).join(",");
}

const yesNo = (b: boolean): string => (b ? "Yes" : "No");

export function formatAnnouncementLogCsv(log: AnnouncementRunLog): string {
  const lines: string[] = [];

  lines.push(csvRow(["=== Run ==="]));
  lines.push(csvRow(RUN_CSV_HEADER));
  lines.push(csvRow(["Take", log.takeName]));
  lines.push(csvRow(["Take duration (seconds)", String(log.takeDurationSec)]));
  lines.push(csvRow(["Transcription path", log.transcriptionPath]));

  lines.push("");
  lines.push(csvRow(["=== Chunk retries ==="]));
  lines.push(csvRow(CHUNK_RETRY_CSV_HEADER));
  for (const c of log.chunkRetries) {
    lines.push(csvRow([c.at, String(c.chunkNumber), yesNo(c.restart)]));
  }

  lines.push("");
  lines.push(csvRow(["=== Draft attempts ==="]));
  lines.push(csvRow(DRAFT_CSV_HEADER));
  for (const d of log.draftAttempts) {
    lines.push(csvRow([d.at, yesNo(d.ok), d.error]));
  }

  lines.push("");
  lines.push(csvRow(["=== Image attempts ==="]));
  lines.push(csvRow(IMAGE_CSV_HEADER));
  for (const img of log.imageAttempts) {
    lines.push(csvRow([img.at, img.outcome, img.error]));
  }

  lines.push("");
  lines.push(csvRow(["=== Post attempts ==="]));
  lines.push(csvRow(POST_CSV_HEADER));
  for (const p of log.postAttempts) {
    lines.push(csvRow([p.at, yesNo(p.ok), p.error, yesNo(p.imageUploadFailed), p.course]));
  }

  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT (never a bare array), same
 * reasoning as formatDiscussionRepliesLogJson/formatGradingRecordingLogJson. */
export function formatAnnouncementLogJson(log: AnnouncementRunLog, meta: { exportedAt: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, ...log }, null, 2);
}

// ---------------------------------------------------------------------------
// Filename. Reimplements the slugify/fileStamp shape locally - see
// discussion-replies-log.ts's own header for why that is reuse-of-idiom, not
// reinvention.
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** `announcement-log-<take-name-slug>-<YYYYMMDD-HHMMSS>.<ext>`. A take name
 * that slugs to nothing drops that segment entirely rather than emitting a
 * dangling double dash - same rule as discussionRepliesLogFileName/
 * repoGradingLogFileName/gradingRecordingLogFileName. */
export function announcementLogFileName(takeName: string, extension: string, atIso: string): string {
  const slug = slugify(takeName);
  const parts = ["announcement-log", slug, fileStamp(atIso)].filter((part) => part !== "");
  return `${parts.join("-")}.${extension}`;
}
