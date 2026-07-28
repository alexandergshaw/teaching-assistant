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

/**
 * Mirror of isAtBottom for a panel whose newest entry renders at the TOP of
 * the list - the answers panel (AnswersPanel.tsx), which prepends each new
 * answer (see useLiveAnswers.ts's `setAnswers((prev) => [entry, ...prev])`),
 * unlike the transcript panel's newest-LAST ordering that isAtBottom already
 * covers. Same threshold/slack, just the opposite edge - this is that
 * panel's own ordering, not a second scroll notion.
 */
export function isAtTop(metrics: ScrollMetrics): boolean {
  return metrics.scrollTop <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX;
}

// ---------------------------------------------------------------------------
// Unread-answer tracking (D5/D8 - alerting when a new answer arrives). A
// SINGLE source of truth for "how many answers have arrived since the
// instructor last actually saw the answers list" - every surface (the
// answers panel's own "new" markers, the FAB's badge shown while the window
// is closed, and the document-title "(N)" prefix shown while the tab is
// hidden) reads this SAME state, cleared in exactly one place
// (markAnswersSeen) rather than three independent counters that could
// disagree with each other.
// ---------------------------------------------------------------------------

export interface UnreadAnswersState {
  /** ids of answers that arrived since the last "seen" event, oldest first. */
  unreadIds: string[];
}

export const INITIAL_UNREAD_ANSWERS_STATE: UnreadAnswersState = { unreadIds: [] };

export interface AnswerArrivalVisibility {
  /** The live-class window is currently open (mounted - not merely the FAB's
   * persistent indicator). */
  windowOpen: boolean;
  /** The answers panel's scroll position currently shows the newest answer -
   * computed by the caller from isAtTop (or isAtBottom, for a panel ordered
   * the other way), never re-derived here. */
  newestVisible: boolean;
}

/**
 * Record that answer `id` just arrived. It is considered SEEN immediately
 * (never added to the unread set) only when the window is open AND the
 * answers list is currently showing the newest entry - every other
 * combination (window closed, or scrolled away from the newest entry) counts
 * as unread. A duplicate id already tracked as unread is a no-op.
 */
export function recordAnswerArrived(
  state: UnreadAnswersState,
  id: string,
  visibility: AnswerArrivalVisibility
): UnreadAnswersState {
  if (visibility.windowOpen && visibility.newestVisible) return state;
  if (state.unreadIds.includes(id)) return state;
  return { unreadIds: [...state.unreadIds, id] };
}

/**
 * Clear every unread answer - the one place all three alert surfaces (panel
 * marker, FAB badge, title prefix) are cleared from, called when the
 * instructor actually sees the newest answer (opens the window while already
 * scrolled to it, or scrolls the panel to it). A no-op that returns the same
 * reference when already empty, so callers may call this freely without
 * triggering an extra render.
 */
export function markAnswersSeen(state: UnreadAnswersState): UnreadAnswersState {
  if (state.unreadIds.length === 0) return state;
  return { unreadIds: [] };
}

export function unreadAnswerCount(state: UnreadAnswersState): number {
  return state.unreadIds.length;
}

export function isAnswerUnread(state: UnreadAnswersState, id: string): boolean {
  return state.unreadIds.includes(id);
}

// ---------------------------------------------------------------------------
// Document-title unread prefix (D6) - the one alert surface that reaches an
// instructor whose slides are covering the browser entirely. Pure string
// math only; the DOM (document.title, visibilitychange) is driven from
// useLiveClassSession.ts, the single place allowed to touch it.
// ---------------------------------------------------------------------------

const UNREAD_TITLE_PREFIX_RE = /^\(\d+\)\s+/;

/** Strips a previously-applied "(N) " prefix, if present. The base case both
 * computeTitleWithUnreadPrefix (idempotent re-prefixing) and "restore the
 * original title" build on. */
export function stripUnreadTitlePrefix(title: string): string {
  return title.replace(UNREAD_TITLE_PREFIX_RE, "");
}

/**
 * Given the ORIGINAL (unprefixed) document title and the current unread
 * count, returns the title that should actually be shown: unchanged when the
 * count is 0 (this is also how the original title is "restored"), otherwise
 * "(N) <original title>". Idempotent - passing this function's own output
 * back in never stacks a second prefix, since the original is always
 * stripped first.
 */
export function computeTitleWithUnreadPrefix(title: string, unreadCount: number): string {
  const base = stripUnreadTitlePrefix(title);
  if (unreadCount <= 0) return base;
  return `(${unreadCount}) ${base}`;
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
