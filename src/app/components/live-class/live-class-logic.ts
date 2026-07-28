// Pure, deterministic decision logic for live-class mode's trickiest UI
// behaviors: which transcription path to run, when the Web Speech restart
// guard should retry vs back off vs give up, how the answer queue orders and
// single-flights concurrent question-answering, and when the transcript pane
// should keep auto-scrolling. No React, no DOM globals, no Date.now()/
// Math.random() at call time - every timestamp is a parameter - so every
// function here is deterministic and unit-testable without a browser.

// ---------------------------------------------------------------------------
// Transcription path selection (C3/C6 - Web Speech where available, the
// segmented-audio fallback otherwise, with a manual override in settings).
// ---------------------------------------------------------------------------

export type TranscriptionOverride = "auto" | "web-speech" | "segmented";
export type TranscriptionPath = "web-speech" | "segmented" | "none";

export interface TranscriptionCapabilities {
  /** window.SpeechRecognition || window.webkitSpeechRecognition is present. */
  hasWebSpeech: boolean;
  /** MediaRecorder + AudioContext (decodeAudioData) are both present. */
  hasSegmentedSupport: boolean;
}

/**
 * Choose which transcription path to run. "auto" prefers Web Speech (lower
 * latency, no per-segment upload) and falls back to the segmented-audio path;
 * an explicit override is honored whenever the browser actually supports it,
 * and otherwise degrades to "none" rather than silently running the other
 * path the user did not ask for.
 */
export function selectTranscriptionPath(
  capabilities: TranscriptionCapabilities,
  override: TranscriptionOverride
): TranscriptionPath {
  if (override === "web-speech") {
    return capabilities.hasWebSpeech ? "web-speech" : "none";
  }
  if (override === "segmented") {
    return capabilities.hasSegmentedSupport ? "segmented" : "none";
  }
  if (capabilities.hasWebSpeech) return "web-speech";
  if (capabilities.hasSegmentedSupport) return "segmented";
  return "none";
}

// ---------------------------------------------------------------------------
// Web Speech restart-storm guard (C3). Chrome ends a continuous recognition
// session after roughly 60s of silence and fires `onend` with no warning, so
// the caller must restart it - but a recognizer that fails to actually start
// (a permissions problem, a browser bug) fires `onend` again almost
// immediately, and blindly restarting forever spins the CPU and the mic
// indicator. This state machine tracks how long each session actually ran and
// backs off - then gives up - when sessions keep ending too fast in a row.
// ---------------------------------------------------------------------------

export interface RestartGuardState {
  /** How many `onend`s in a row fired suspiciously soon after their `onstart`. */
  consecutiveFastEnds: number;
  /** When the most recent recognition session actually (re)started, or null before the first start. */
  lastStartMs: number | null;
}

export const INITIAL_RESTART_GUARD_STATE: RestartGuardState = {
  consecutiveFastEnds: 0,
  lastStartMs: null,
};

// A session that ends within this many ms of its own start almost certainly
// did not end from a natural silence timeout (Chrome's is ~60s) - it crashed
// or never really started, so it counts toward the give-up threshold.
const FAST_END_THRESHOLD_MS = 3000;
// After this many fast ends in a row, stop retrying and surface a visible
// error instead of looping forever.
const MAX_CONSECUTIVE_FAST_ENDS = 5;
const BASE_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

export type RestartDecision =
  | { action: "restart"; delayMs: number; nextState: RestartGuardState }
  | { action: "give-up"; nextState: RestartGuardState };

/** Record that a recognition session just (re)started, at `nowMs`. */
export function recordRecognitionStart(state: RestartGuardState, nowMs: number): RestartGuardState {
  return { ...state, lastStartMs: nowMs };
}

/**
 * Decide what to do when the recognizer's `onend` fires at `nowMs`: restart
 * immediately (a clean, long-running session that simply reached Chrome's
 * silence timeout), restart after a backoff delay (a run of suspiciously fast
 * ends, each doubling the delay up to MAX_BACKOFF_MS), or give up entirely
 * once MAX_CONSECUTIVE_FAST_ENDS is reached.
 */
export function decideRestartOnEnd(state: RestartGuardState, nowMs: number): RestartDecision {
  const ranMs = state.lastStartMs === null ? Number.POSITIVE_INFINITY : nowMs - state.lastStartMs;
  const wasFast = ranMs < FAST_END_THRESHOLD_MS;
  const consecutiveFastEnds = wasFast ? state.consecutiveFastEnds + 1 : 0;
  const nextState: RestartGuardState = { ...state, consecutiveFastEnds };

  if (consecutiveFastEnds >= MAX_CONSECUTIVE_FAST_ENDS) {
    return { action: "give-up", nextState };
  }

  const delayMs =
    consecutiveFastEnds === 0 ? 0 : Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (consecutiveFastEnds - 1));
  return { action: "restart", delayMs, nextState };
}

// ---------------------------------------------------------------------------
// Answer queue: ordering + single-flight (U5). A class can produce several
// questions within seconds; only one answerLiveQuestionAction call may be in
// flight at a time, and the rest wait their turn in the order they were
// asked.
// ---------------------------------------------------------------------------

export interface AnswerQueueItem {
  id: string;
  question: string;
  atMs: number;
}

export interface AnswerQueueState {
  queue: AnswerQueueItem[];
  inFlightId: string | null;
}

export const INITIAL_ANSWER_QUEUE_STATE: AnswerQueueState = { queue: [], inFlightId: null };

/**
 * Add a question to the back of the queue. A no-op (returns `state`
 * unchanged) when `item.id` is already queued or already in flight, so a
 * question can never be answered twice just because it was submitted twice.
 */
export function enqueueQuestion(state: AnswerQueueState, item: AnswerQueueItem): AnswerQueueState {
  if (state.inFlightId === item.id) return state;
  if (state.queue.some((q) => q.id === item.id)) return state;
  return { ...state, queue: [...state.queue, item] };
}

export interface StartNextResult {
  state: AnswerQueueState;
  toStart: AnswerQueueItem | null;
}

/**
 * Pull the next item off the front of the queue to start answering it - but
 * only when nothing is already in flight. Returns `toStart: null` (and
 * `state` unchanged) when something is already running or the queue is
 * empty - this is what makes the queue single-flight rather than firing every
 * queued question in parallel.
 */
export function startNextIfIdle(state: AnswerQueueState): StartNextResult {
  if (state.inFlightId !== null) return { state, toStart: null };
  if (state.queue.length === 0) return { state, toStart: null };
  const [next, ...rest] = state.queue;
  return { state: { queue: rest, inFlightId: next.id }, toStart: next };
}

/**
 * Mark the in-flight answer as finished, freeing the queue to start its next
 * item. A stale completion (an id that is not the one currently in flight -
 * e.g. a dismissed-then-retried question) is ignored rather than clearing a
 * different, still-running request.
 */
export function completeInFlight(state: AnswerQueueState, id: string): AnswerQueueState {
  if (state.inFlightId !== id) return state;
  return { ...state, inFlightId: null };
}

// ---------------------------------------------------------------------------
// Auto-scroll suppression (U4). The transcript pane auto-scrolls to newest,
// but must stop the moment the instructor scrolls up to read back, and only
// resume once the pane is back at the bottom - whether that "back at the
// bottom" scroll was the user's own action or this component's programmatic
// scroll-to-bottom call (both fire the same scroll event, and both are
// handled identically here).
// ---------------------------------------------------------------------------

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

// Distance from the bottom, in px, within which the pane still counts as
// "at the bottom" - a little slack so sub-pixel/rounding differences across
// browsers never falsely suppress auto-scroll.
const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 24;

export function isAtBottom(metrics: ScrollMetrics): boolean {
  const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
}

/**
 * Given the pane's current scroll metrics (read on every scroll event),
 * decide whether auto-scroll should be active. True whenever the pane is at
 * (or very near) the bottom; false the moment it is scrolled away from the
 * bottom.
 */
export function nextAutoScrollState(metrics: ScrollMetrics): boolean {
  return isAtBottom(metrics);
}

// ---------------------------------------------------------------------------
// Settle-before-save (U7/U8 data-loss fix). ending a class stops NEW work,
// but a segment transcription or an answer request already in flight when
// Stop is pressed is still resolving - if the final autosave/docx build runs
// before it lands, the tail of the class (often the closing summary, or a
// final question) is silently dropped from the artifacts the instructor
// keeps. This is the decision the settle-wait loop makes on every poll: keep
// waiting, proceed (nothing outstanding), or proceed anyway but flag that the
// wait was cut short - a hung request must never block the instructor from
// ending class indefinitely, and never fail silently either.
// ---------------------------------------------------------------------------

export type SettleDecision = "wait" | "proceed" | "proceed-with-warning";

/**
 * `pendingCount` outstanding requests, `elapsedMs` since the wait started,
 * bounded by `timeoutMs`. "proceed" once nothing is pending; "wait" while
 * something is still pending and the bound has not been reached yet;
 * "proceed-with-warning" once the bound IS reached with work still
 * outstanding - the caller must surface that to the user, never drop it
 * quietly.
 */
export function decideSettle(pendingCount: number, elapsedMs: number, timeoutMs: number): SettleDecision {
  if (pendingCount <= 0) return "proceed";
  if (elapsedMs < timeoutMs) return "wait";
  return "proceed-with-warning";
}

// ---------------------------------------------------------------------------
// Stop idempotence. Pressing "End class" twice, or an unmount racing an
// in-progress stop, must not run the (expensive, visible) final save twice -
// once stop has actually run for a session, every later call is a no-op
// until the next start() resets the guard.
// ---------------------------------------------------------------------------

export interface StopGuardState {
  stopped: boolean;
}

export const INITIAL_STOP_GUARD_STATE: StopGuardState = { stopped: false };

export interface StopDecision {
  shouldRun: boolean;
  nextState: StopGuardState;
}

/** True (shouldRun) exactly once per session - false for every call after. */
export function decideStop(state: StopGuardState): StopDecision {
  if (state.stopped) return { shouldRun: false, nextState: state };
  return { shouldRun: true, nextState: { stopped: true } };
}
