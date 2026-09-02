// Module walkthrough deck capture - the downloadable run log (AC9). Pays the
// same debt docs/DEV_LOOP.md's downloadable-logs rule names for this
// surface: the panel samples frames off a screen share, extracts what is
// visible as text, throws most of it away on purpose (chrome, duplicates,
// overflow past the character cap), and generates a deck from what survives.
// Every one of those is a silent-failure candidate with no trace anywhere
// else once the run ends, and this file exists to answer, in the
// instructor's own words: "why did my deck only cover half the module" and
// "why is slide 4 nonsense".
//
// STRUCTURE REUSED FROM src/app/components/grading-recording/
// grading-recording-log.ts (read in full before writing this file): the
// five-function pure shape (build*RunLog / summarize* / *SummaryLine /
// format*Csv / format*Json / *FileName), pure with no I/O and NO CLOCK READS
// INSIDE - every `at` is supplied by the caller as data, so a test can pin
// exact output. escapeCsvValue (src/lib/course-tasks-view-csv.ts) is reused
// rather than a new escaper; slugify/fileStamp are reimplemented locally,
// exactly as every other log in this repo does, for the reason
// grading-recording-log.ts's own header gives: a report filename needs the
// "always a valid filename" treatment, and the logs are otherwise unrelated
// shapes with unrelated lifetimes. summarizeFrameEncodeParameters
// (src/app/components/grading-recording/legibility-probe.ts:219) is reused
// for capture-resolution grouping (AM-L) rather than reimplemented, since a
// per-frame resolution fact is exactly what that function already groups
// honestly instead of presenting one frame's value as the session's.
//
// THIS FILE IS NOT THAT ONE - a walkthrough capture run has a different
// diagnostic shape than a grading-via-recording run. Three loss channels
// exist here and MUST stay distinguishable in the output, never conflated
// into one number:
//
//   1. BACKPRESSURE DROPS (AC6). useDiscussionCapture caps pending frames at
//      MAX_PENDING_FRAMES=16 and discards newest frames beyond it. Counted
//      per session as `droppedFrames`, a monotone accumulator the PANEL owns
//      (this file only takes the total as data - see the field's own doc
//      comment for the pre-existing under-reporting bug in the shipped
//      grading panel that this accumulator design is meant to avoid).
//
//   2. NEVER-PHOTOGRAPHED CONTENT (DE7). Content that scrolled past BETWEEN
//      two kept frames is never captured by anything - it does not arrive
//      late, is not dropped, and leaves NO trace in `droppedFrames`. Measured
//      maximum safe scroll speed is ~683 px/s at 1080p (content viewport
//      height / 1.5s); a normal skim runs 500-800 px/s, so an ordinary skim
//      can silently lose up to 15% of the module with every other number in
//      this log reporting a clean run. This channel has no counter anywhere
//      in the capture pipeline - `estimatedScrollRatePxPerSec` is logged
//      when the panel can supply an estimate, and the header states plainly
//      when it cannot, per AM-L/DE7.
//
//   3. REDUCTION LOSSES (DE12/DE16). Chrome suppressed, duplicate/near-
//      duplicate blocks joined, non-content control text stripped, and (only
//      if content still exceeds the deck-materials cap) proportional
//      downsampling across the whole run. Each stage reports characters
//      removed separately (`blocks.reductionStages`), in the fixed pipeline
//      order DE16 specifies - never collapsed into one "reduced by N chars"
//      figure, because an instructor asking "why is slide 4 nonsense" needs
//      to know WHICH stage did the damage.
//
// TWO NUMBERS REPORTED HONESTLY RATHER THAN DERIVED (AM-F, AM-G):
//   - "Frames sampled" is not obtainable at all - useDiscussionCapture
//     exposes no tick count - so this file never invents one. The header
//     always states the fixed sentence in MODULE_DECK_CAPTURE_FRAMES_SAMPLED_NOTE.
//     Reporting a derived guess as a measurement is exactly what AC8/AC9
//     exist to prevent.
//   - `droppedFrames` resets on every `start()` inside useDiscussionCapture.
//     The SHIPPED grading panel reads the live value at download time
//     (GradingRecordingPanel.tsx:464), so a session with two Start/Stop
//     cycles loses every frame the first cycle dropped - a real,
//     pre-existing, out-of-scope defect. This panel is expected to own its
//     own monotone session accumulator (a sibling's responsibility, not
//     this file's) and pass the running total in as `droppedFrames`.
//
// COST (DE4/DE5/AM-K). Input tokens for a vision-extraction call ARE
// derivable from a documented, dated rule: a Gemini 3.x image costs a flat
// 1,120 tokens regardless of resolution (checked 2026-08-31), and the
// extraction prompt is ~1,225 tokens, re-sent every call. Per-call cost is
// therefore `1,225 + 1,120 x images`, computed here as
// `derivedInputTokensTotal` and labelled DERIVED everywhere it appears - a
// batch refused for wire budget never crossed the wire, so it contributes
// nothing to this figure. Output tokens are UNMEASURED unless a sibling's
// change to llm.ts lands `outputTokens` on the batch/attempt data this file
// is handed; when it is absent on any entry, the summary reports the total
// as `null` and every renderer prints the literal string "UNMEASURED".
// NEVER a currency amount anywhere in this file.
//
// CAPTURE RESOLUTION IS A PER-FRAME FACT (AM-L), reported GROUPED via
// summarizeFrameEncodeParameters over every frame actually sent this
// session - a window resize mid-capture changes it, so one frame's value is
// never presented as if it described the whole run.
//
// PASTEABILITY. A continuously-scrolling 20-minute walkthrough can produce
// on the order of 300 vision calls (DE3). That is not, by itself, too large
// to paste - but this file still guards against a run large enough to be
// unpasteable: `condenseModuleDeckCaptureBatches` collapses the repetitive
// middle of a batch list ONLY once it exceeds
// MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD, and even then every batch
// that is NOT a routine "extracted"/"empty" outcome (i.e. every distinct
// failure - a wire-budget rejection or a hard error) is always kept
// verbatim, never folded into a collapsed row. Below the threshold, every
// batch renders individually. This applies to BOTH the CSV and JSON
// renderers, since a JSON export of a session that large would be no more
// pasteable than the CSV.
//
// PII. `materialsText` - the exact string handed to the deck generator - is
// deliberately carried in full, because AC9 explicitly asks for "the exact
// material handed to the generator" and a log that summarised it could not
// answer "why is slide 4 nonsense". It is JSON-ONLY: formatModuleDeckCaptureLogCsv
// never emits its content, only its character count, since a single long
// string does not belong in a CSV cell. Because this content was read off
// whatever the instructor's screen showed while sharing, it can incidentally
// carry anything visible on an LMS page in transit (a gradebook column, a
// discussion thread) - the extraction prompt is responsible for refusing to
// return student work/names/grades (DE20/DE21), but this log file does not
// re-implement or verify that; it records what it is handed. Forwarding this
// JSON export forwards whatever text made it through extraction.

import { escapeCsvValue } from "@/lib/course-tasks-view-csv";
import {
  summarizeFrameEncodeParameters,
  type FrameEncodeFacts,
  type FrameEncodeSummary,
} from "../grading-recording/legibility-probe";

export const MODULE_DECK_CAPTURE_FEATURE_NAME = "Module walkthrough deck capture";

/** AM-F: the exact, fixed sentence for the one number this feature cannot
 * measure at all. Never replaced with a derived count. */
export const MODULE_DECK_CAPTURE_FRAMES_SAMPLED_NOTE =
  "not recorded (the capture hook does not expose the tick count)";

/** DE7: shown whenever the panel could not supply a scroll-rate estimate.
 * Explicitly disclaims this being the same thing as `droppedFrames` - the
 * confusion this note exists to prevent. */
export const MODULE_DECK_CAPTURE_SCROLL_RATE_NOT_MEASURED_NOTE =
  "not measured (content that scrolls past between two kept frames is never captured by anything and leaves no trace in Dropped frames - this is a separate, uncounted loss channel, distinct from backpressure)";

/** DE7's own measured advisory, appended whenever an estimate IS supplied, so
 * a number alone ("650 px/s") does not read as reassuring on its own. */
const SCROLL_RATE_ADVISORY =
  "the measured safe ceiling is ~683 px/s at 1080p (content viewport height / 1.5s); a normal skim runs 500-800 px/s and can silently lose up to 15% of the module between kept frames";

// ---------------------------------------------------------------------------
// Derived (never measured) per-call input-token cost. DE4/DE5: a Gemini 3.x
// image is a flat, documented 1,120 tokens regardless of resolution (checked
// 2026-08-31); the extraction prompt is ~1,225 tokens and is re-sent whole on
// every call.
// ---------------------------------------------------------------------------

export const MODULE_DECK_CAPTURE_DERIVED_PROMPT_TOKENS = 1_225;
export const MODULE_DECK_CAPTURE_DERIVED_TOKENS_PER_IMAGE = 1_120;

function derivedInputTokensForCall(framesSent: number): number {
  return MODULE_DECK_CAPTURE_DERIVED_PROMPT_TOKENS + MODULE_DECK_CAPTURE_DERIVED_TOKENS_PER_IMAGE * framesSent;
}

// ---------------------------------------------------------------------------
// Settings in force for the run (header block). Read fresh at download time,
// never accumulated - the same posture every other shipped log in this repo
// takes for its own session settings.
// ---------------------------------------------------------------------------

export interface ModuleDeckCaptureSettings {
  courseName: string;
  moduleLabel: string;
  templateId: string;
  /** Computed client-side with expandTemplate BEFORE capture starts (AM-C) -
   * never derived from anything captured, since the template alone fixes
   * the deck's slide count regardless of how much material comes in. */
  resolvedSlideCount: number;
  provider: string;
  /** The context box's exact text (AC2), or "" when left empty. Never
   * truncated here even though the box itself enforces a 2000-char cap
   * (AM-L) - that cap is enforced where the box lives, not in this file. */
  contextText: string;
}

// ---------------------------------------------------------------------------
// Batches - one entry per vision-extraction call (AM-I: extraction runs
// DURING capture, one short Server Action per batch, never buffered to the
// end of the run).
// ---------------------------------------------------------------------------

/** Exhaustive over every distinct way one extraction call can end. Kept as a
 * closed union (never a bare boolean/string) so summarizeModuleDeckCaptureRunLog
 * can count each bucket with a `never` check rather than a catch-all `else`
 * (REGRESSION 370/S2). `wire-budget-rejected` is a batch that was refused
 * BEFORE anything crossed the wire - it never became a real vision call, so
 * it contributes nothing to the derived input-token figure. */
export type ModuleDeckCaptureBatchOutcome = "extracted" | "empty" | "wire-budget-rejected" | "error";

/** One batch's real facts. `error` is the verbatim message the call/refusal
 * produced (AC8) - never "an error occurred" - and `""` for every outcome
 * that is not itself an error. `outputTokens` is present only when a
 * sibling's llm.ts change has landed `usageMetadata` into the data this
 * batch was built from (DE6); its absence is what drives the summary's
 * UNMEASURED reporting, so it is left `undefined` rather than defaulted to
 * `0` - `0` would be a real, wrong measurement, not an honest "don't know". */
export interface ModuleDeckCaptureLogBatch {
  at: string;
  index: number;
  framesSent: number;
  wireBytes: number;
  outcome: ModuleDeckCaptureBatchOutcome;
  error: string;
  outputTokens?: number;
}

/** Builds one batch entry, defaulting every field but `at`/`index`/
 * `framesSent` to its "nothing went wrong" value - mirrors
 * makeGradingRecordingLogBatch's own default-filling shape so a call site
 * only names what is actually non-default for its branch. */
export function makeModuleDeckCaptureLogBatch(args: {
  at: string;
  index: number;
  framesSent: number;
  wireBytes?: number;
  outcome?: ModuleDeckCaptureBatchOutcome;
  error?: string;
  outputTokens?: number;
}): ModuleDeckCaptureLogBatch {
  return {
    at: args.at,
    index: args.index,
    framesSent: args.framesSent,
    wireBytes: args.wireBytes ?? 0,
    outcome: args.outcome ?? "extracted",
    error: args.error ?? "",
    outputTokens: args.outputTokens,
  };
}

/** One "a captured frame was too large to send even after re-encoding at a
 * lower quality, and was dropped" event - collected every time it fires, not
 * just the most recent (mirrors GradingRecordingLogEncodeNotice's own
 * reasoning: the live UI may show only the latest, but a session that hit it
 * three times shows all three here). */
export interface ModuleDeckCaptureEncodeNotice {
  at: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Blocks and reduction (DE12/DE16). `reductionStages` is a fixed, ordered
// pipeline - chrome suppression first (free, biggest win), then duplicate
// join, then non-content control text, and ONLY THEN proportional
// downsampling if the cap is still exceeded. Rendering always follows this
// order regardless of the order entries were pushed in, since the order
// itself is diagnostic: an instructor whose deck is missing content wants to
// know how far down the pipeline the loss actually happened.
// ---------------------------------------------------------------------------

export type ModuleDeckCaptureReductionStageName =
  | "chrome-suppression"
  | "duplicate-join"
  | "control-text-removal"
  | "proportional-downsampling";

export const MODULE_DECK_CAPTURE_REDUCTION_STAGE_ORDER: readonly ModuleDeckCaptureReductionStageName[] = [
  "chrome-suppression",
  "duplicate-join",
  "control-text-removal",
  "proportional-downsampling",
];

/** One reduction stage's real cost. `blocksAffected` is optional - a stage
 * that does not operate block-by-block (e.g. a global downsample pass) may
 * omit it rather than report a meaningless number. */
export interface ModuleDeckCaptureReductionStage {
  stage: ModuleDeckCaptureReductionStageName;
  charactersRemoved: number;
  blocksAffected?: number;
}

/** Blocks are a SESSION-level aggregate (never per-batch): the text blocks
 * extracted across the whole run, how many were too illegible to attribute
 * any text to at all, and what each reduction stage did to the survivors
 * before the result became `materialsText`. */
export interface ModuleDeckCaptureBlocks {
  blocksExtracted: number;
  blocksIllegible: number;
  reductionStages: readonly ModuleDeckCaptureReductionStage[];
}

function orderedReductionStages(
  stages: readonly ModuleDeckCaptureReductionStage[]
): ModuleDeckCaptureReductionStage[] {
  const byName = new Map(stages.map((s) => [s.stage, s] as const));
  const ordered: ModuleDeckCaptureReductionStage[] = [];
  for (const name of MODULE_DECK_CAPTURE_REDUCTION_STAGE_ORDER) {
    const found = byName.get(name);
    if (found) ordered.push(found);
  }
  // Any stage name this file's own order constant does not know about is
  // still rendered - appended after the known pipeline - rather than
  // silently dropped, on the same "never silently discard" principle as
  // everything else in this file.
  for (const s of stages) {
    if (!MODULE_DECK_CAPTURE_REDUCTION_STAGE_ORDER.includes(s.stage)) ordered.push(s);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Generation attempts - one entry per call to generateDeckFromTemplateAction
// (AC7). A run normally has exactly one, but a failed attempt followed by a
// retry produces two, and both must stay visible (AC8: distinct failures
// never collapse into one indistinguishable state).
// ---------------------------------------------------------------------------

export interface ModuleDeckCaptureGenerationAttempt {
  at: string;
  outcome: "success" | "error";
  /** Verbatim failure text (AC8) - a wire-budget refusal, a non-JSON
   * response treated as a clean error (AM-J), or the action's own message.
   * `""` when `outcome` is "success". */
  error: string;
  /** The character count of the materials text THIS attempt sent - not
   * necessarily the same as `materialsText.length` on the run log if a
   * failed attempt sent a different (e.g. differently-capped) payload than
   * the attempt that ultimately succeeded. */
  materialsCharacterCount: number;
  resolvedSlideCount: number;
  /** See ModuleDeckCaptureLogBatch's own doc comment - same UNMEASURED
   * posture, same reason. */
  outputTokens?: number;
}

// ---------------------------------------------------------------------------
// The full input a caller (the panel) assembles, and the full run log this
// file builds from it.
// ---------------------------------------------------------------------------

export interface ModuleDeckCaptureLogInput {
  startedAt: string;
  /** `null` means the run has not ended yet - a mid-capture download reads
   * "still running" rather than a blank/undefined field (mirrors
   * SessionLogMeta's own convention in src/lib/live-class/session-log.ts). */
  endedAt: string | null;
  settings: ModuleDeckCaptureSettings;
  /** Channel 1 (AC6) - the panel's own monotone session accumulator, taken
   * as data. See this file's header comment for the shipped grading panel's
   * pre-existing under-reporting bug this design is meant to avoid. */
  droppedFrames: number;
  /** Channel 2 (DE7) - `null` when the panel cannot supply an estimate for
   * this run; MODULE_DECK_CAPTURE_SCROLL_RATE_NOT_MEASURED_NOTE is what the
   * header then states. Never derived from anything else in this file. */
  estimatedScrollRatePxPerSec: number | null;
  /** Every frame actually sent this session, in order - summarised via
   * summarizeFrameEncodeParameters (AM-L), never presented as one frame's
   * value describing the run. */
  frameEncodeFacts: readonly FrameEncodeFacts[];
  batches: readonly ModuleDeckCaptureLogBatch[];
  encodeNotices: readonly ModuleDeckCaptureEncodeNotice[];
  blocks: ModuleDeckCaptureBlocks;
  generationAttempts: readonly ModuleDeckCaptureGenerationAttempt[];
  /** The exact material handed to generateDeckFromTemplateAction for the
   * run's most recent attempt - JSON-only, see this file's header PII note. */
  materialsText: string;
}

export interface ModuleDeckCaptureRunLog extends ModuleDeckCaptureLogInput {
  feature: string;
  /** Grouped via summarizeFrameEncodeParameters over `frameEncodeFacts`. */
  captureResolution: FrameEncodeSummary;
}

export function buildModuleDeckCaptureRunLog(input: ModuleDeckCaptureLogInput): ModuleDeckCaptureRunLog {
  return {
    ...input,
    feature: MODULE_DECK_CAPTURE_FEATURE_NAME,
    captureResolution: summarizeFrameEncodeParameters(input.frameEncodeFacts),
  };
}

// ---------------------------------------------------------------------------
// Summary - exhaustive over ModuleDeckCaptureBatchOutcome (a `never` check,
// never a catch-all `else` - REGRESSION 370/S2).
// ---------------------------------------------------------------------------

export interface ModuleDeckCaptureLogSummary {
  batchesSent: number;
  batchesExtracted: number;
  batchesEmpty: number;
  batchesWireBudgetRejected: number;
  batchesErrored: number;
  /** Sums only batches that actually crossed the wire - a wire-budget
   * rejection contributes 0 frames here even though its own `framesSent`
   * records how many it TRIED to send. */
  framesSentTotal: number;
  droppedFrames: number;
  encodeNoticeCount: number;
  reductionCharactersRemovedTotal: number;
  generationAttemptsTotal: number;
  generationAttemptsErrored: number;
  /** DE5 - derived, not measured. Sum over every batch that actually
   * dispatched of `1,225 + 1,120 x framesSent`. Always label this DERIVED
   * wherever it is shown to a reader. */
  derivedInputTokensTotal: number;
  /** `null` exactly when at least one batch or generation attempt did not
   * carry an `outputTokens` figure - the honest "UNMEASURED" case (DE4/AM-K).
   * A real number here means EVERY entry in this run reported one. */
  outputTokensTotal: number | null;
}

export function summarizeModuleDeckCaptureRunLog(log: ModuleDeckCaptureRunLog): ModuleDeckCaptureLogSummary {
  let batchesExtracted = 0;
  let batchesEmpty = 0;
  let batchesWireBudgetRejected = 0;
  let batchesErrored = 0;
  let framesSentTotal = 0;
  let derivedInputTokensTotal = 0;
  let outputTokensTotal = 0;
  let outputTokensMeasured = true;

  for (const batch of log.batches) {
    switch (batch.outcome) {
      case "extracted":
        batchesExtracted += 1;
        break;
      case "empty":
        batchesEmpty += 1;
        break;
      case "wire-budget-rejected":
        batchesWireBudgetRejected += 1;
        break;
      case "error":
        batchesErrored += 1;
        break;
      default: {
        const exhaustive: never = batch.outcome;
        throw new Error(`Unhandled module deck capture batch outcome: ${String(exhaustive)}`);
      }
    }

    if (batch.outcome !== "wire-budget-rejected") {
      framesSentTotal += batch.framesSent;
      derivedInputTokensTotal += derivedInputTokensForCall(batch.framesSent);
    }

    if (batch.outputTokens === undefined) outputTokensMeasured = false;
    else outputTokensTotal += batch.outputTokens;
  }

  let generationAttemptsErrored = 0;
  for (const attempt of log.generationAttempts) {
    if (attempt.outcome === "error") generationAttemptsErrored += 1;
    if (attempt.outputTokens === undefined) outputTokensMeasured = false;
    else outputTokensTotal += attempt.outputTokens;
  }

  let reductionCharactersRemovedTotal = 0;
  for (const stage of log.blocks.reductionStages) {
    reductionCharactersRemovedTotal += stage.charactersRemoved;
  }

  return {
    batchesSent: log.batches.length,
    batchesExtracted,
    batchesEmpty,
    batchesWireBudgetRejected,
    batchesErrored,
    framesSentTotal,
    droppedFrames: log.droppedFrames,
    encodeNoticeCount: log.encodeNotices.length,
    reductionCharactersRemovedTotal,
    generationAttemptsTotal: log.generationAttempts.length,
    generationAttemptsErrored,
    derivedInputTokensTotal,
    outputTokensTotal: outputTokensMeasured ? outputTokensTotal : null,
  };
}

/** The one-line summary shown above the download buttons. Never gated on any
 * count being non-zero - a run that captured nothing still gets a true,
 * useful sentence (mirrors gradingRecordingLogSummaryLine's own reasoning).
 * The three loss channels are named with distinct words on purpose
 * ("dropped to backpressure" vs "removed by reduction") so pattern-matching
 * across two runs never conflates them. */
export function moduleDeckCaptureLogSummaryLine(summary: ModuleDeckCaptureLogSummary): string {
  const batchWord = summary.batchesSent === 1 ? "call" : "calls";
  const parts = [
    `${summary.framesSentTotal} frames sent across ${summary.batchesSent} vision ${batchWord} ` +
      `(${summary.batchesExtracted} extracted, ${summary.batchesEmpty} empty, ` +
      `${summary.batchesWireBudgetRejected} rejected for wire budget, ${summary.batchesErrored} failed).`,
  ];
  if (summary.droppedFrames > 0) {
    parts.push(`${summary.droppedFrames} frame${summary.droppedFrames === 1 ? "" : "s"} dropped to backpressure.`);
  }
  if (summary.reductionCharactersRemovedTotal > 0) {
    parts.push(`${summary.reductionCharactersRemovedTotal} characters removed by reduction before generation.`);
  }
  if (summary.generationAttemptsErrored > 0) {
    const attemptWord = summary.generationAttemptsTotal === 1 ? "attempt" : "attempts";
    parts.push(
      `${summary.generationAttemptsErrored} of ${summary.generationAttemptsTotal} deck generation ${attemptWord} failed.`
    );
  }
  parts.push(
    `Derived input token cost (not measured): ~${summary.derivedInputTokensTotal}. ` +
      `Output token cost: ${summary.outputTokensTotal !== null ? String(summary.outputTokensTotal) : "UNMEASURED"}.`
  );
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Pasteability: condensing a long batch list. See this file's header comment
// for why this only applies above a size threshold, and why every non-routine
// (failure) batch always survives condensing untouched.
// ---------------------------------------------------------------------------

export const MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD = 80;
export const MODULE_DECK_CAPTURE_BATCH_CONDENSE_KEEP_EDGE = 15;

function isRoutineBatch(batch: ModuleDeckCaptureLogBatch): boolean {
  return batch.outcome === "extracted" || batch.outcome === "empty";
}

export type ModuleDeckCaptureCondensedBatchRow =
  | { kind: "batch"; batch: ModuleDeckCaptureLogBatch }
  | { kind: "collapsed"; collapsedCount: number; collapsedFramesSent: number; collapsedWireBytes: number };

/**
 * Below MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD, every batch is
 * returned individually and in order - the common case (DE3's own worst
 * measured run was ~301 calls, and most runs are far smaller). At or above
 * the threshold: every batch whose outcome is NOT "extracted"/"empty" (a
 * wire-budget rejection or a hard error - a distinct failure, AC8) is always
 * kept verbatim; the first and last `keepEdge` routine batches are also kept
 * verbatim so the run's start and end remain inspectable; every other
 * contiguous run of dropped routine batches collapses into one synthetic row
 * carrying its count and summed frames/bytes, in the position it occupied.
 */
export function condenseModuleDeckCaptureBatches(
  batches: readonly ModuleDeckCaptureLogBatch[],
  keepEdge: number = MODULE_DECK_CAPTURE_BATCH_CONDENSE_KEEP_EDGE
): ModuleDeckCaptureCondensedBatchRow[] {
  const n = batches.length;
  if (n < MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD) {
    return batches.map((batch) => ({ kind: "batch", batch }) as const);
  }

  const keep = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!isRoutineBatch(batches[i])) keep[i] = true;
  }
  let seenFromStart = 0;
  for (let i = 0; i < n && seenFromStart < keepEdge; i++) {
    if (isRoutineBatch(batches[i])) {
      keep[i] = true;
      seenFromStart += 1;
    }
  }
  let seenFromEnd = 0;
  for (let i = n - 1; i >= 0 && seenFromEnd < keepEdge; i--) {
    if (isRoutineBatch(batches[i])) {
      keep[i] = true;
      seenFromEnd += 1;
    }
  }

  const rows: ModuleDeckCaptureCondensedBatchRow[] = [];
  let i = 0;
  while (i < n) {
    if (keep[i]) {
      rows.push({ kind: "batch", batch: batches[i] });
      i += 1;
      continue;
    }
    let collapsedCount = 0;
    let collapsedFramesSent = 0;
    let collapsedWireBytes = 0;
    while (i < n && !keep[i]) {
      collapsedCount += 1;
      collapsedFramesSent += batches[i].framesSent;
      collapsedWireBytes += batches[i].wireBytes;
      i += 1;
    }
    rows.push({ kind: "collapsed", collapsedCount, collapsedFramesSent, collapsedWireBytes });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// CSV. Every field goes through escapeCsvValue (reused - see this file's
// header). Rows joined with \r\n. `materialsText` is never rendered here -
// only its character count - since a single long string does not belong in
// a CSV cell (see this file's header PII/JSON-only note).
// ---------------------------------------------------------------------------

const RUN_CSV_HEADER = ["Field", "Value"];
const BATCH_CSV_HEADER = ["Index", "At", "Frames sent", "Wire bytes", "Outcome", "Error", "Derived input tokens", "Output tokens"];
const ENCODE_NOTICE_CSV_HEADER = ["At", "Text"];
const BLOCKS_FIELD_HEADER = ["Field", "Value"];
const REDUCTION_STAGE_CSV_HEADER = ["Stage", "Characters removed", "Blocks affected"];
const GENERATION_ATTEMPT_CSV_HEADER = ["At", "Outcome", "Error", "Materials characters", "Resolved slide count", "Output tokens"];

function csvRow(values: readonly string[]): string {
  return values.map(escapeCsvValue).join(",");
}

function outputTokensCell(value: number | undefined): string {
  return value === undefined ? "UNMEASURED" : String(value);
}

function formatFrameGroupsForDisplay(groups: ReadonlyArray<{ label: string; count: number }>, total: number): string {
  if (groups.length === 0) return "no frames sent";
  if (groups.length === 1) return groups[0].label;
  return groups.map((g) => `${g.label} (${g.count} of ${total})`).join("; ");
}

function formatQualityGroupsForDisplay(groups: ReadonlyArray<{ quality: number; count: number }>, total: number): string {
  if (groups.length === 0) return "no frames sent";
  if (groups.length === 1) return String(groups[0].quality);
  return groups.map((g) => `${g.quality} (${g.count} of ${total})`).join("; ");
}

export function formatModuleDeckCaptureLogCsv(log: ModuleDeckCaptureRunLog): string {
  const lines: string[] = [];
  const summary = summarizeModuleDeckCaptureRunLog(log);
  const res = log.captureResolution;

  lines.push(csvRow(["=== Run ==="]));
  lines.push(csvRow(RUN_CSV_HEADER));
  lines.push(csvRow(["Feature", log.feature]));
  lines.push(csvRow(["Started", log.startedAt]));
  lines.push(csvRow(["Ended", log.endedAt ?? "still running"]));
  lines.push(csvRow(["Course", log.settings.courseName]));
  lines.push(csvRow(["Module", log.settings.moduleLabel]));
  lines.push(csvRow(["Template", log.settings.templateId]));
  lines.push(csvRow(["Resolved slide count", String(log.settings.resolvedSlideCount)]));
  lines.push(csvRow(["Provider", log.settings.provider]));
  lines.push(csvRow(["Context", log.settings.contextText]));
  lines.push(csvRow(["Frames sampled", MODULE_DECK_CAPTURE_FRAMES_SAMPLED_NOTE]));
  lines.push(csvRow(["Dropped frames (backpressure)", String(log.droppedFrames)]));
  lines.push(
    csvRow([
      "Estimated scroll rate",
      log.estimatedScrollRatePxPerSec === null
        ? MODULE_DECK_CAPTURE_SCROLL_RATE_NOT_MEASURED_NOTE
        : `${log.estimatedScrollRatePxPerSec} px/s (${SCROLL_RATE_ADVISORY})`,
    ])
  );
  lines.push(csvRow(["Capture resolution (source)", formatFrameGroupsForDisplay(res.sourceDimGroups, res.totalFrames)]));
  lines.push(csvRow(["Capture resolution (encoded)", formatFrameGroupsForDisplay(res.encodedDimGroups, res.totalFrames)]));
  lines.push(csvRow(["Capture resolution (JPEG quality)", formatQualityGroupsForDisplay(res.qualityGroups, res.totalFrames)]));
  lines.push(csvRow(["Materials handed to generator (character count)", String(log.materialsText.length)]));
  lines.push(csvRow(["Materials handed to generator (full text)", "see JSON export"]));
  lines.push(csvRow(["Derived input tokens for this run (not measured)", String(summary.derivedInputTokensTotal)]));
  lines.push(
    csvRow([
      "Output tokens for this run",
      summary.outputTokensTotal === null ? "UNMEASURED" : String(summary.outputTokensTotal),
    ])
  );

  lines.push("");
  lines.push(csvRow(["=== Batches ==="]));
  lines.push(csvRow(BATCH_CSV_HEADER));
  if (log.batches.length >= MODULE_DECK_CAPTURE_BATCH_CONDENSE_THRESHOLD) {
    lines.push(
      csvRow([
        `Note: ${log.batches.length} batches were sent - the repetitive middle below is summarised. Every rejected/errored batch is kept verbatim.`,
      ])
    );
  }
  for (const row of condenseModuleDeckCaptureBatches(log.batches)) {
    if (row.kind === "batch") {
      const b = row.batch;
      lines.push(
        csvRow([
          String(b.index),
          b.at,
          String(b.framesSent),
          String(b.wireBytes),
          b.outcome,
          b.error,
          b.outcome === "wire-budget-rejected" ? "0" : String(derivedInputTokensForCall(b.framesSent)),
          outputTokensCell(b.outputTokens),
        ])
      );
    } else {
      lines.push(
        csvRow([
          "",
          "",
          String(row.collapsedFramesSent),
          String(row.collapsedWireBytes),
          `collapsed (${row.collapsedCount} routine batches)`,
          "",
          String(derivedInputTokensForCall(row.collapsedFramesSent)),
          "",
        ])
      );
    }
  }

  lines.push("");
  lines.push(csvRow(["=== Encode notices ==="]));
  lines.push(csvRow(ENCODE_NOTICE_CSV_HEADER));
  for (const n of log.encodeNotices) {
    lines.push(csvRow([n.at, n.text]));
  }

  lines.push("");
  lines.push(csvRow(["=== Blocks ==="]));
  lines.push(csvRow(BLOCKS_FIELD_HEADER));
  lines.push(csvRow(["Blocks extracted", String(log.blocks.blocksExtracted)]));
  lines.push(csvRow(["Blocks illegible", String(log.blocks.blocksIllegible)]));
  lines.push(csvRow(REDUCTION_STAGE_CSV_HEADER));
  for (const stage of orderedReductionStages(log.blocks.reductionStages)) {
    lines.push(
      csvRow([stage.stage, String(stage.charactersRemoved), stage.blocksAffected === undefined ? "" : String(stage.blocksAffected)])
    );
  }

  lines.push("");
  lines.push(csvRow(["=== Generation attempts ==="]));
  lines.push(csvRow(GENERATION_ATTEMPT_CSV_HEADER));
  for (const a of log.generationAttempts) {
    lines.push(
      csvRow([
        a.at,
        a.outcome,
        a.error,
        String(a.materialsCharacterCount),
        String(a.resolvedSlideCount),
        outputTokensCell(a.outputTokens),
      ])
    );
  }

  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT (never a bare array), same
 * reasoning as formatGradingRecordingLogJson. Carries `materialsText` in
 * full (see this file's header PII note) and every batch individually with
 * no condensing above the pasteability threshold - see this file's header
 * for why JSON stays full-fidelity while CSV summarises. */
export function formatModuleDeckCaptureLogJson(log: ModuleDeckCaptureRunLog, meta: { exportedAt: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, ...log }, null, 2);
}

// ---------------------------------------------------------------------------
// Filename. Reimplements the slugify/fileStamp shape locally - see this
// file's header for why that is reuse-of-idiom, not reinvention.
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

/** `module-deck-capture-log-<module-slug>-<YYYYMMDD-HHMMSS>.<ext>`. A module
 * label that slugs to nothing (blank, no module selected) drops that
 * segment entirely rather than emitting a dangling double dash - same rule
 * as gradingRecordingLogFileName/discussionRepliesLogFileName. */
export function moduleDeckCaptureLogFileName(moduleLabel: string, extension: string, atIso: string): string {
  const slug = slugify(moduleLabel);
  const parts = ["module-deck-capture-log", slug, fileStamp(atIso)].filter((part) => part !== "");
  return `${parts.join("-")}.${extension}`;
}
