// RECORDING ONE-VS-MANY W1 (docs/recording-one-vs-many-scope.md sections 2.1, 3.1):
// the pure leaf. The decision TYPE, the prompt the classifier is given, and the
// FAIL-SAFE parser that maps the model's raw answer onto that type.
//
// RecordingSplit is deliberately TWO-ARMED. A classifier failure is NOT a member
// of it: the seam reports failure as a separate transport flag (`failed`), so the
// type the grader consumes can never widen and a model hiccup can never read as
// "several students". Anything the parser cannot read with confidence collapses
// to { kind: "single" } - grade the recording as one submission, exactly as today.
//
// Pure of Next, Supabase and the model client: unit-testable in node.

export interface RecordingSegment {
  startSec: number;
  endSec: number;
  label: string;
}

export type RecordingSplit =
  | { kind: "single" }
  | { kind: "multiple"; segments: RecordingSegment[] };

/** The parser's result: the (always valid) split, plus whether the answer was readable. */
export interface ParsedRecordingSplit {
  split: RecordingSplit;
  /** False when the answer was malformed/unusable and `split` is the fail-safe single. */
  confident: boolean;
}

/** A segment label is a short tentative name; longer model text is clipped. */
export const MAX_SEGMENT_LABEL_CHARS = 80;
/** Matches the grading session's entry ceiling (useContinuousGradingRun DEFAULT_MAX_ENTRIES). */
export const MAX_RECORDING_SEGMENTS = 40;

const SINGLE: RecordingSplit = { kind: "single" };

function unconfident(): ParsedRecordingSplit {
  return { split: { kind: "single" }, confident: false };
}

/**
 * Fixed-wording classification prompt. The assignment text biases the decision
 * (an assignment describing one student's own presentation leans single; "each
 * student presents" leans multiple); the fail-safe default is single.
 */
export function buildRecordingSplitPrompt(assignmentInstructions: string, rubric: string): string {
  const instructions = assignmentInstructions.trim() || "(no assignment instructions were provided)";
  const rubricText = rubric.trim() || "(no rubric was provided)";
  return [
    "You are looking at ONE video recording submitted for grading.",
    "Decide whether it contains ONE student's submission or SEVERAL distinct students' submissions back to back (for example several presentations in sequence).",
    "Weigh the assignment below together with what the recording actually shows. If the assignment expects a single student's work, or you are unsure, answer single.",
    "",
    "Assignment instructions:",
    instructions,
    "",
    "Rubric:",
    rubricText,
    "",
    "Answer with a single JSON object and nothing else.",
    'If the recording is one submission: {"kind":"single"}',
    'If it is several: {"kind":"multiple","segments":[{"startSec":0,"endSec":95,"label":"short tentative name"}, ...]}',
    "Segments are in chronological order, must not overlap, use seconds from the start of the recording, and there must be at least two.",
    "The label is a short tentative name or description of the segment; never invent a person's name that is not shown or spoken.",
  ].join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Pulls the first JSON object out of the answer, tolerating a code fence or prose. */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    // fall through to the brace slice
  }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function toSegment(raw: unknown, index: number): RecordingSegment | null {
  if (!isRecord(raw)) return null;
  const { startSec, endSec, label } = raw;
  if (typeof startSec !== "number" || typeof endSec !== "number") return null;
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) return null;
  if (startSec < 0 || endSec <= startSec) return null;
  const text = typeof label === "string" ? label.trim().slice(0, MAX_SEGMENT_LABEL_CHARS) : "";
  return { startSec, endSec, label: text || `Segment ${index + 1}` };
}

/**
 * Maps the model's raw text to a RecordingSplit. FAIL-SAFE: malformed JSON, an
 * unknown kind, a `multiple` with fewer than two valid segments, overlapping
 * ranges or more than MAX_RECORDING_SEGMENTS all collapse to { kind: "single" }
 * with confident=false. Only an explicit, well-formed answer is confident.
 */
export function parseRecordingSplit(modelText: string): ParsedRecordingSplit {
  const parsed = extractJsonObject(modelText);
  if (!isRecord(parsed)) return unconfident();
  if (parsed.kind === "single") return { split: { ...SINGLE }, confident: true };
  if (parsed.kind !== "multiple" || !Array.isArray(parsed.segments)) return unconfident();

  const segments: RecordingSegment[] = [];
  for (let i = 0; i < parsed.segments.length; i += 1) {
    const segment = toSegment(parsed.segments[i], i);
    // One bad segment makes the whole answer unreliable: do not split on a guess.
    if (!segment) return unconfident();
    segments.push(segment);
  }
  if (segments.length < 2 || segments.length > MAX_RECORDING_SEGMENTS) return unconfident();

  segments.sort((a, b) => a.startSec - b.startSec);
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].startSec < segments[i - 1].endSec) return unconfident();
  }
  return { split: { kind: "multiple", segments }, confident: true };
}

/** A time window inside one recording, in whole-or-fractional seconds. */
export interface RecordingWindow {
  startSec: number;
  endSec: number;
}

function clock(totalSec: number): string {
  const whole = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Renders a window as "M:SS" / "H:MM:SS" start and end (display + prompt). */
export function formatRecordingWindow(window: RecordingWindow): string {
  return `${clock(window.startSec)} to ${clock(window.endSec)}`;
}

/** Fixed-wording prompt note confining ONE grade call to ONE segment of a
 * multi-submission recording. Appended to the scoreAxis prompt like imageNote. */
export function buildVideoWindowNote(window: RecordingWindow): string {
  return (
    "\n\nThe attached video contains several students' submissions back to back. " +
    `Grade ONLY the portion from ${clock(window.startSec)} to ${clock(window.endSec)} of the video, ` +
    "which is this student's submission; ignore everything outside that window."
  );
}

/** Validates an untrusted window (finite, non-negative, end after start). */
export function isRecordingWindow(value: unknown): value is RecordingWindow {
  if (!isRecord(value)) return false;
  const { startSec, endSec } = value;
  return (
    typeof startSec === "number" &&
    typeof endSec === "number" &&
    Number.isFinite(startSec) &&
    Number.isFinite(endSec) &&
    startSec >= 0 &&
    endSec > startSec &&
    endSec <= 24 * 3600
  );
}

/**
 * Reads the /api/classify-recording response body on the client. FAIL-SAFE:
 * anything malformed is { single, failed: true } so the run grades as one.
 * `failed` stays a transport flag; the split is re-validated through the same
 * parser the server used, so a forged shape cannot widen the type.
 */
export function readRecordingSplitResponse(body: unknown): { split: RecordingSplit; failed: boolean } {
  if (!isRecord(body) || !isRecord(body.split)) return { split: { kind: "single" }, failed: true };
  if (body.failed === true) return { split: { kind: "single" }, failed: true };
  const parsed = parseRecordingSplit(JSON.stringify(body.split));
  if (!parsed.confident) return { split: { kind: "single" }, failed: true };
  return { split: parsed.split, failed: false };
}
