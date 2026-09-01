// Pure decision leaf for LegibilityProbeModal.tsx - the R1/R1a/R1b
// instrument (docs/grading-via-recording-acceptance-criteria.md section 1).
// vitest is node-env and collects only src/**/*.test.ts (vitest.config.ts) -
// no component in this repo is ever rendered by a test - so every decision
// this modal needs to make (the prompt text, whether a transcription counts
// as empty/near-empty, and how the capture parameters are summarized) lives
// here as a plain function, not inline in the component or the server
// action, or none of it could be tested at all.
//
// WHAT THIS FILE IS NOT: it does not grade, does not extract structure, and
// does not touch the DOM, React, or `document`/`navigator` - same discipline
// as discussion-capture.ts's own header, and for the same reason: this
// module is imported by BOTH a "use client" component (LegibilityProbeModal.tsx)
// AND the "use server" action (src/app/actions/legibility-probe.ts), so it
// must be safe to pull into either bundle.
//
// R1/R1a: the whole point of this instrument is an HONEST answer to "can the
// model read this screen at all" - never inferred, never hidden. The prompt
// below (buildLegibilityProbePrompt) asks for a verbatim transcription plus
// an explicit call-out of anything too small/blurred to read, and nothing
// else. The empty/near-empty detection below (mirroring rubric-input.ts's
// isExtractionSuspiciouslyShort) exists because R1a names the exact failure
// mode this repo already shipped once: "an empty extraction is currently
// treated as SUCCESS... shows 'Reading...', never errors, and yields zero
// rows... with every gate green." A transcription probe must not repeat
// that - an empty or near-empty result is surfaced as the HEADLINE finding,
// styled as loudly as a hard error, never folded into a quiet default state.

/**
 * Caps how many frames one probe call sends to the model. Deliberately its
 * OWN constant, not a re-use of discussion-reply-prompt.ts's
 * EXTRACT_BATCH_SIZE - R4b of the grading-via-recording AC is explicit that
 * pieces built for the discussion-specific extraction loop must not be
 * reused here, and a numeric cap tied to that loop's own reasoning (how many
 * frames fit alongside ITS prompt and expected output shape) is exactly that
 * kind of coupling. This probe is a single one-shot read, not a scrolling
 * capture loop, so a small, independently-chosen cap is the right shape:
 * enough frames to cover a short scroll through one submission page,
 * cheap enough that a probe run stays fast to iterate on.
 */
export const PROBE_MAX_FRAMES = 6;

/** The "Run legibility probe" button's gate: at least one frame waiting to
 * be sent, and no probe already in flight. Pulled out as a pure function for
 * the same reason canSubmitRubric (rubric-input.ts) is - so the LOGIC is
 * unit-testable at all, since vitest here never renders a component. */
export function canRunProbe(pendingFrames: number, busy: boolean): boolean {
  return !busy && pendingFrames > 0;
}

/**
 * The probe's entire prompt. Three rules, stated as plainly as the AC's own
 * language: transcribe verbatim, call out illegibility by name, and do
 * nothing else - no grading, no structure extraction, no inference. This is
 * the ONLY prompt this instrument ever sends; there is no variant.
 */
export function buildLegibilityProbePrompt(frameCount: number): string {
  return [
    `You are looking at ${frameCount} screen-capture frame${frameCount === 1 ? "" : "s"} from an instructor's screen recording of a student submission (a discussion post, a document, code, or a PDF shown on screen).`,
    "",
    "This is a LEGIBILITY TEST, not a grading task. Your only job is to report what text you can actually read.",
    "",
    "Rules:",
    "1. Transcribe the text you can read VERBATIM, exactly as it appears. Do not paraphrase, summarize, correct spelling or grammar, or reformat it.",
    "2. Do NOT grade, score, extract structure (no headings, no field extraction, no rubric matching), and do not infer anything the frames do not literally show.",
    "3. Whenever text is too small, blurry, or low-contrast to read with confidence, say so PLAINLY and specifically - name the region (for example, \"the paragraph below the heading\" or \"the code block on the right\") rather than skipping it silently.",
    "4. If a frame shows no readable text at all, say that plainly rather than omitting it.",
    "5. Do not invent a student name, a score, or any content you cannot actually read.",
    "",
    "Report your transcription now.",
  ].join("\n");
}

/**
 * R1a's failure mode, one level up from the LLM call itself:
 * `describeEmptyLlmText` (src/lib/llm.ts, used by the server action) already
 * refuses a FULLY blank model response before this function ever runs. This
 * catches the NEAR-empty case a fully-blank check cannot: the model returns
 * a real, non-blank string that is still nowhere near a transcription (a
 * stray token, "N/A", a lone punctuation mark). Deliberately generous - a
 * genuine "I could not read anything on this screen" explanation from the
 * model legitimately runs to 60-90+ characters and must NOT trip this
 * threshold, because that sentence is already the loud, honest answer R1a
 * asks for, not a silent failure to catch. This only catches the response
 * that is too short to be either a real transcription OR a real explanation.
 */
export const PROBE_NEAR_EMPTY_MAX_CHARS = 40;

export function isProbeTranscriptEmpty(text: string): boolean {
  return text.trim().length === 0;
}

export function isProbeTranscriptNearEmpty(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= PROBE_NEAR_EMPTY_MAX_CHARS;
}

/** R1a: shown when the model's response, after trimming, is fully blank -
 * the exact defect this instrument exists to catch, made loud rather than
 * looking like a run that simply had nothing to transcribe. */
export const PROBE_EMPTY_MESSAGE =
  "The model transcribed nothing at all from these frames. This is the finding R1 exists to surface, not a run that simply had nothing to read - do not treat this as success.";

export function describeProbeNearEmptyMessage(charCount: number): string {
  return `Only ${charCount} character${charCount === 1 ? "" : "s"} came back. That is too little to be either a real transcription or a real explanation of what could not be read - treat this as an illegible run, not a successful one.`;
}

/** One notice, one severity, for whatever a probe run just produced - the
 * single decision LegibilityProbeModal.tsx renders from, mirroring
 * rubric-input.ts's deriveUploadOutcomeNotice for the same reason: the
 * component should never have to re-derive "is this good, suspicious, or a
 * failure" from raw strings itself. An empty transcript is deliberately
 * `kind: "error"` (not "warning") - R1a's "must not look like success" is
 * strongest for exactly that case. */
export type ProbeResultNotice =
  | { kind: "error"; text: string }
  | { kind: "warning"; text: string }
  | { kind: "success"; text: string };

export function deriveProbeResultNotice(result: { transcript: string } | { error: string }): ProbeResultNotice {
  if ("error" in result) {
    return { kind: "error", text: result.error };
  }
  if (isProbeTranscriptEmpty(result.transcript)) {
    return { kind: "error", text: PROBE_EMPTY_MESSAGE };
  }
  if (isProbeTranscriptNearEmpty(result.transcript)) {
    return { kind: "warning", text: describeProbeNearEmptyMessage(result.transcript.trim().length) };
  }
  return {
    kind: "success",
    text: "The model returned a transcription below. Compare it against the frame thumbnails to judge whether it actually read the page.",
  };
}

// ---------------------------------------------------------------------------
// R1b/requirement 3: the capture parameters, reported alongside the result so
// the measurement is repeatable. Without these numbers the answer to "can
// this be read" tells the instructor nothing about which setting to change
// next (source resolution too low? target width scaled down too far? JPEG
// quality too aggressive? the frame simply too heavy to send?).
//
// LP3 FIX (the instrument-lies-about-its-own-settings defect): this used to
// be a single set of numbers - one sourceWidth/Height read from the live
// <video> at PROBE time, one jpegQuality restated from the FRAME_JPEG_QUALITY
// constant unconditionally. Both were wrong for exactly the frames this
// instrument exists to diagnose: a dense page that triggered the capture
// loop's silent half-quality re-encode (useDiscussionCapture.ts's AC10b/S5
// path) was reported as sent at the nominal quality, and a live <video> reread
// at probe time can differ from what a frame was actually drawn from if the
// window resized or the shared source changed between capture and probe.
//
// Now every frame carries its OWN real encode facts (CapturedFrame,
// discussion-capture.ts), captured at the moment it was drawn - and this
// module reports them HONESTLY: a batch where every frame shares the same
// dimensions/quality collapses to one number exactly as before, but a batch
// where frames differ (some re-encoded, some not) says so explicitly rather
// than picking one frame's value and presenting it as if it described them
// all.
// ---------------------------------------------------------------------------

/** The real per-frame encode facts this module needs - a structural subset
 * of discussion-capture.ts's CapturedFrame. Declared locally (rather than
 * imported) so this file stays free of any import beyond what its own logic
 * needs; any object shaped like this satisfies it, including a CapturedFrame
 * handed straight through by the component. */
export interface FrameEncodeFacts {
  sourceWidth: number;
  sourceHeight: number;
  encodedWidth: number;
  encodedHeight: number;
  encodedQuality: number;
}

export interface ProbeCaptureParameters {
  /** One entry per frame actually sent in this probe call, in order - never
   * a single value assumed to describe the whole batch. */
  frames: readonly FrameEncodeFacts[];
  /** Total WIRE bytes (base64 length, the same unit checkWireBudget enforces
   * server-side) of the frames actually sent in this probe call. */
  wireBytes: number;
}

function groupCounts<T>(values: readonly T[]): Array<{ value: T; count: number }> {
  const order: T[] = [];
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = JSON.stringify(v);
    if (!counts.has(key)) order.push(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return order.map((value) => ({ value, count: counts.get(JSON.stringify(value)) ?? 0 }));
}

export interface FrameEncodeSummary {
  totalFrames: number;
  /** "WIDTHxHEIGHTpx" groups for the raw source dimensions, in first-seen
   * order. Length 1 means every frame shared the same source size. */
  sourceDimGroups: Array<{ label: string; count: number }>;
  /** Same grouping, for the encoded (sent) dimensions. */
  encodedDimGroups: Array<{ label: string; count: number }>;
  /** Quality groups, in first-seen order. Length 1 means every frame in this
   * batch was encoded at the same quality - the common case. */
  qualityGroups: Array<{ quality: number; count: number }>;
  /** The quality groups BELOW the highest quality present in this batch -
   * i.e. frames the capture loop actually re-encoded at a lower quality to
   * fit EXTRACT_BATCH_WIRE_BUDGET (AC10b/S5). Empty when every frame shares
   * the batch's highest quality (including when there is only one frame, or
   * when no frame needed re-encoding). */
  reencodedGroups: Array<{ quality: number; count: number }>;
}

/**
 * Pure summary of a probe batch's real per-frame encode facts. Pulled out
 * from describeCaptureParameters below so the GROUPING logic (does this
 * batch actually agree on each parameter, or not) is independently testable
 * without also pinning the exact sentence wording.
 */
export function summarizeFrameEncodeParameters(frames: readonly FrameEncodeFacts[]): FrameEncodeSummary {
  const totalFrames = frames.length;
  const sourceDimGroups = groupCounts(frames.map((f) => `${f.sourceWidth}x${f.sourceHeight}px`)).map((g) => ({
    label: g.value,
    count: g.count,
  }));
  const encodedDimGroups = groupCounts(frames.map((f) => `${f.encodedWidth}x${f.encodedHeight}px`)).map((g) => ({
    label: g.value,
    count: g.count,
  }));
  const qualityGroups = groupCounts(frames.map((f) => f.encodedQuality)).map((g) => ({ quality: g.value, count: g.count }));
  const maxQuality = qualityGroups.reduce((m, g) => Math.max(m, g.quality), 0);
  const reencodedGroups = qualityGroups.filter((g) => g.quality < maxQuality);
  return { totalFrames, sourceDimGroups, encodedDimGroups, qualityGroups, reencodedGroups };
}

function formatDimLabel(groups: Array<{ label: string; count: number }>, total: number): string {
  if (groups.length <= 1) return groups[0]?.label ?? "0x0px";
  return groups.map((g) => `${g.label} (${g.count} of ${total})`).join(", ");
}

function formatQualityLabel(groups: Array<{ quality: number; count: number }>, total: number): string {
  if (groups.length <= 1) return `${groups[0]?.quality ?? 0}`;
  return groups.map((g) => `${g.quality} (${g.count} of ${total})`).join(", ");
}

/**
 * One human-readable line summarizing everything above, honestly - never
 * implying a batch-wide value where the batch's own frames disagree.
 * `formatWireBytes` is injected rather than imported directly so this module
 * stays free of any import that is not already required for the probe's own
 * logic - the caller (LegibilityProbeModal.tsx) already has `formatMB` from
 * `@/lib/upload-budget` for the frame-size notices it needs anyway.
 */
export function describeCaptureParameters(
  params: ProbeCaptureParameters,
  formatWireBytes: (bytes: number) => string
): string {
  const summary = summarizeFrameEncodeParameters(params.frames);
  const total = summary.totalFrames;
  const frameWord = total === 1 ? "frame" : "frames";
  const sourceLabel = formatDimLabel(summary.sourceDimGroups, total);
  const encodedLabel = formatDimLabel(summary.encodedDimGroups, total);
  const qualityLabel = formatQualityLabel(summary.qualityGroups, total);

  const reencodedCount = summary.reencodedGroups.reduce((sum, g) => sum + g.count, 0);
  const reencodeNote =
    reencodedCount > 0
      ? " " +
        summary.reencodedGroups
          .map(
            (g) =>
              `${g.count} of ${total} frame${g.count === 1 ? "" : "s"} ${g.count === 1 ? "was" : "were"} re-encoded at ${g.quality} to fit the size budget.`
          )
          .join(" ")
      : "";

  return (
    `Source ${sourceLabel} -> sent at ${encodedLabel}, JPEG quality ${qualityLabel}, ${total} ${frameWord}, ` +
    `${formatWireBytes(params.wireBytes)} on the wire.${reencodeNote}`
  );
}
