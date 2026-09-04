// In-memory + window-event bridge for launching a specific Recording-tab
// inner view (record / announcement / discussions / speed / captions /
// slides / avatar / grading) from OUTSIDE RecordingTab - the Knowledge
// base's bulk bar ("Start recording" and "Grade via recording" on a page
// selection) and the always-mounted AiChatFab (the Recording tab's inner
// tools, reachable from the fab).
//
// Modeled on workflow-schedule-handoff.ts's module-singleton + window-event
// shape, deliberately NOT on course-handoff.ts's mount-only-effect shape.
// RecordingTab is kept mounted for the whole app session (see page.tsx:
// "Kept mounted at all times so an in-progress recording survives switching
// subtabs or top-level tabs") - a `useEffect(..., [])` that reads a one-shot
// payload on MOUNT would only ever observe the FIRST launch of a session;
// every later "Start recording"/fab click would silently no-op (the exact
// failure mode this module exists to avoid). Registering a live
// `window.addEventListener` once (mount-only is fine for *registering* the
// listener - it is the listener CALLBACK, not the effect body, that must
// re-run per launch) means every launch - first, second, or twentieth -
// delivers, because each openRecordingTool() call fires a fresh event the
// listener reacts to in the moment, never a value it reads once and forgets.
//
// The `view` a listener needs rides directly on the CustomEvent's `detail`
// (mirrors src/lib/chat/open-chat.ts - the codebase's only other mechanism
// that crosses the layout.tsx/page.tsx boundary, and the only one whose
// payload already rides with the signal) since every listener that cares
// about it (today: just RecordingTab) wants the SAME value from the SAME
// dispatch. `knowledgeContext` is different: it has exactly one intended
// consumer (the Discussion-replies drafting pipeline) and must not be handed
// out twice, so it is parked in a one-shot module slot instead -
// takeRecordingKnowledgeContext() - independent of how many times the event
// itself is observed.
//
// Module state (and the event) are both scoped to one SPA session - nothing
// here is expected to, or needs to, survive a hard reload, since Knowledge,
// Recording, and the fab all live on the same page.

/** The Recording tab's inner views - see RecordingTab.tsx's own `recView`
 * union, which this list is kept in sync with (not imported from there:
 * RecordingTab.tsx does not export it, and this module is a leaf that must
 * not pull in a client component).
 *
 * "moduledeck" (docs/module-walkthrough-deck-acceptance-criteria.md AC1/
 * AM-L): the module-walkthrough-capture panel's own inner view, reachable
 * from (a) the Recording tab directly and (b) a Modules bulk-bar action that
 * pre-fills which module to capture via `capturePrefill` below - see that
 * field's own doc comment for why the prefill rides the event `detail`
 * rather than a one-shot slot, and why it is advisory only. */
export type RecordingLaunchView =
  | "record"
  | "announcement"
  | "discussions"
  | "speed"
  | "captions"
  | "slides"
  | "avatar"
  | "grading"
  | "moduledeck"
  | "messages";

const RECORDING_LAUNCH_VIEWS: readonly RecordingLaunchView[] = [
  "record",
  "announcement",
  "discussions",
  "speed",
  "captions",
  "slides",
  "avatar",
  "grading",
  "moduledeck",
  "messages",
];

/** Already-framed, already-capped prompt text - built via
 * buildKnowledgeContextBlock (src/lib/chat/knowledge-context.ts), the same
 * renderer the "Ask AI" bulk action reuses, so this feature never invents a
 * second context format or a second anti-prompt-injection framing header.
 * Never empty when present - a caller with nothing usable to carry must omit
 * this field entirely rather than pass `text: ""` (mirrors
 * OpenChatSelectionContext's own contract in open-chat.ts).
 *
 * `pages`: which Knowledge Base pages `text` was built from - lets a
 * consumer SHOW the carried pages (a list, a picker, a back-to-Knowledge
 * link) rather than only the generic `label` summary sentence. Optional and
 * purely ADVISORY, same relationship `label` already has to `text`: nothing
 * here validates it against `text`, and a consumer that cannot render it (or
 * gets none) must fall back to `label`, never treat a missing/empty `pages`
 * as an error.
 *
 * `body` (docs/knowledge-recording-handoff-acceptance-criteria.md section
 * 4a): each page's full body, not just its identity - added so a removal
 * control (CarriedKnowledgePages.tsx) can recompute `text` client-side over
 * whatever pages remain after an instructor removes one, via the same
 * buildKnowledgeContextBlock renderer the launch site used, with no fetch
 * and no server action. Costs nothing extra to populate: KnowledgeTab.tsx
 * already holds every selected page's full body before it ever builds
 * `text` in the first place (see that file's own comment on why). Still
 * advisory like `id`/`title` - a consumer with no use for bodies (today:
 * only the removal control reads it) simply never looks at the field. */
export interface RecordingKnowledgeContext {
  text: string;
  label?: string;
  pages?: { id: string; title: string; body: string }[];
}

export interface RecordingLaunch {
  view: RecordingLaunchView;
  knowledgeContext?: RecordingKnowledgeContext;
  /** Grading-via-recording (docs/grading-via-recording-acceptance-criteria.md
   * item 2): true when this exact launch should also open the rubric modal
   * the moment it lands on the "grading" view - the Knowledge base's "Grade
   * via recording" button sets this alongside `view: "grading"`.
   * navigateToRecordingTool (the FAB's plain navigate idiom, item 3) never
   * sets it: landing on the view from the fab is not "I just selected
   * knowledge pages to grade with", so the fab entry should not surprise the
   * instructor with a modal they did not ask for.
   *
   * Deliberately NOT a one-shot module slot the way `knowledgeContext` is
   * (see this module's own header for why that one needs one): every
   * listener that cares about this wants the SAME thing from the SAME
   * dispatch (GradingRecordingPanel.tsx reacting to its own view's launch
   * event, exactly like RecordingTab's `recView` switch already does) - there
   * is no "handed to exactly one consumer, then forgotten" concern here, so
   * it rides the event `detail` like `view` does, not a slot a caller must
   * remember to drain. */
  openRubric?: boolean;

  /** Module-walkthrough-capture prefill (docs/module-walkthrough-deck-
   * acceptance-criteria.md AC1/AM-L): which course/module the Modules
   * bulk-bar's capture action was launched against, when it was launched
   * from there. Rides the event `detail` (like `view`, unlike
   * `knowledgeContext`'s one-shot module slot): every listener that would
   * ever read this (today: only the module-deck-capture panel reacting to
   * its own view's launch event, exactly as GradingRecordingPanel.tsx
   * already reacts to `openRubric` above) wants the SAME value from the SAME
   * dispatch - there is no "hand to exactly one consumer, then forget"
   * concern here, so a one-shot slot would be the wrong shape (see this
   * module's own header comment for the general rule this follows).
   *
   * ADVISORY ONLY (AM-L: "the destination owns its context obligation,
   * never the launcher"): the capture panel's own course/module controls are
   * ALWAYS present and authoritative, whichever route reached the panel.
   * This field only seeds their initial value - same relationship
   * `knowledgeContext` has to the Discussion-replies drafting pipeline's own
   * always-present context box, and the same relationship AC1 already states
   * for this feature specifically. Every field is optional because a launch
   * from the Recording tab directly (not the bulk bar) carries none of
   * them - the panel's controls then simply start blank, exactly like any
   * other visit. */
  capturePrefill?: {
    courseId?: string;
    courseUrl?: string;
    acronym?: string;
    moduleLabel?: string;
  };
}

/** The event name, so nobody re-types the string literal. Deliberately NOT
 * prefixed "ta-rec-" even though it names a recording concern: that prefix
 * is reserved (see recording-split.structure.test.ts's exact-set canary) for
 * PERSISTED localStorage control state under src/app/components/recording/ -
 * this event carries nothing persisted and nothing that directory's canary
 * needs to track. */
export const RECORDING_LAUNCH_EVENT = "ta-recording-launch";

// One-shot slot for the knowledge-context half only - see this module's own
// top comment for why the `view` half does not live here.
let pendingKnowledgeContext: RecordingKnowledgeContext | null = null;

function isValidView(v: unknown): v is RecordingLaunchView {
  return typeof v === "string" && (RECORDING_LAUNCH_VIEWS as readonly string[]).includes(v);
}

/** Defensive parse of a candidate `pages` entry: `id` and `title` must both
 * be non-blank strings, or the WHOLE entry is dropped (unlike
 * sanitizeCapturePrefill's independent per-field degradation - a page with a
 * title but no id, or vice versa, is not a usable page reference at all, so
 * there is no "degrade the optional part" available for those two; the
 * entry itself is the atomic unit for them).
 *
 * `body` is different: it degrades on its own, same rule `label` gets on
 * the parent object - a non-string/missing `body` falls back to `""` rather
 * than dropping the whole entry, since `id`/`title` alone are still a usable
 * page REFERENCE (a display list, a "back to Knowledge" target) even when
 * there is nothing to recompute a context from. A malformed `body` on an
 * otherwise-valid entry therefore only costs that page its removal-recompute
 * capability, never its place in the list. */
function sanitizePage(raw: unknown): { id: string; title: string; body: string } | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.trim().length === 0) return undefined;
  if (typeof r.title !== "string" || r.title.trim().length === 0) return undefined;
  const body = typeof r.body === "string" ? r.body : "";
  return { id: r.id, title: r.title, body };
}

/** Defensive parse of a candidate `pages` array: not an array at all, or an
 * array that yields zero usable entries once each is sanitized, both drop
 * the WHOLE field (mirrors `label`'s own "absent, not empty" contract -
 * there is no meaningful difference between "no pages were carried" and "a
 * pages array was sent but nothing in it was usable", so both collapse to
 * `undefined` rather than an empty array a caller would need to special-case
 * anyway). A malformed individual entry drops only that entry, never the
 * whole field. */
function sanitizePages(raw: unknown): RecordingKnowledgeContext["pages"] {
  if (!Array.isArray(raw)) return undefined;
  const pages = raw
    .map(sanitizePage)
    .filter((p): p is { id: string; title: string; body: string } => p !== undefined);
  return pages.length > 0 ? pages : undefined;
}

function sanitizeKnowledgeContext(raw: unknown): RecordingKnowledgeContext | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.text !== "string" || r.text.trim().length === 0) return undefined;
  const pages = sanitizePages(r.pages);
  return {
    text: r.text,
    ...(typeof r.label === "string" ? { label: r.label } : {}),
    ...(pages ? { pages } : {}),
  };
}

/** Defensive parse of a candidate `capturePrefill`, mirroring
 * sanitizeKnowledgeContext's own "degrade the optional part, not the whole
 * thing" rule: every field is independently optional and independently
 * checked, so one malformed field (e.g. a non-string `moduleLabel`) drops
 * only that field rather than the whole prefill or the whole launch. Unlike
 * `knowledgeContext`, an object with every field absent/invalid is still
 * VALID (empty object) rather than `undefined` - AM-L's "advisory only" rule
 * means an empty prefill and a missing one both simply leave the panel's own
 * controls blank, so there is no need to distinguish them here. */
function sanitizeCapturePrefill(raw: unknown): RecordingLaunch["capturePrefill"] | undefined {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const prefill: NonNullable<RecordingLaunch["capturePrefill"]> = {};
  if (typeof r.courseId === "string" && r.courseId.trim()) prefill.courseId = r.courseId;
  if (typeof r.courseUrl === "string" && r.courseUrl.trim()) prefill.courseUrl = r.courseUrl;
  if (typeof r.acronym === "string" && r.acronym.trim()) prefill.acronym = r.acronym;
  if (typeof r.moduleLabel === "string" && r.moduleLabel.trim()) prefill.moduleLabel = r.moduleLabel;
  return prefill;
}

/**
 * Defensive parse of a candidate launch (a dispatched event's `detail`, or
 * any other untrusted input) into a RecordingLaunch, or null when there is
 * nothing usable. NEVER throws.
 *
 * A missing/unrecognized `view` invalidates the WHOLE launch - there is
 * nowhere to navigate, so nothing else about the payload matters. A missing
 * or blank `knowledgeContext.text` drops only that optional field, same
 * "degrade the optional part, not the whole thing" rule
 * parseOpenChatDetail (open-chat.ts) uses for its own optional
 * selectionContext.
 */
export function parseRecordingLaunch(detail: unknown): RecordingLaunch | null {
  if (typeof detail !== "object" || detail === null || Array.isArray(detail)) return null;
  const raw = detail as Record<string, unknown>;
  if (!isValidView(raw.view)) return null;
  const knowledgeContext = sanitizeKnowledgeContext(raw.knowledgeContext);
  const capturePrefill = sanitizeCapturePrefill(raw.capturePrefill);
  return {
    view: raw.view,
    ...(knowledgeContext ? { knowledgeContext } : {}),
    ...(raw.openRubric === true ? { openRubric: true } : {}),
    ...(capturePrefill ? { capturePrefill } : {}),
  };
}

/**
 * Fire a launch: validates it (never throws on a bad shape - see
 * parseRecordingLaunch), stashes its `knowledgeContext` (if any) for one-shot
 * pickup by takeRecordingKnowledgeContext, and dispatches
 * RECORDING_LAUNCH_EVENT with the validated launch as `detail` for any live
 * listener (RecordingTab's view switch, page.tsx's tab switch) to react to.
 *
 * An invalid launch (unrecognized/missing `view`) is a no-op: it does not
 * dispatch, and - deliberately - does not clear an existing valid pending
 * knowledgeContext either, so a malformed call can never clobber a real
 * launch that has not been picked up yet.
 *
 * No-ops (after validating and stashing knowledgeContext) outside a browser,
 * matching openChat()'s own SSR guard in open-chat.ts.
 */
export function openRecordingTool(launch: RecordingLaunch): void {
  const parsed = parseRecordingLaunch(launch);
  if (!parsed) return;
  pendingKnowledgeContext = parsed.knowledgeContext ?? null;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RECORDING_LAUNCH_EVENT, { detail: parsed }));
}

/**
 * Fire a navigation-only launch: dispatches RECORDING_LAUNCH_EVENT with
 * `{ view }` exactly like openRecordingTool, but never touches the one-shot
 * knowledgeContext slot - it does not set pendingKnowledgeContext, and,
 * unlike a bare-view openRecordingTool() call, it does NOT clear an existing
 * one either.
 *
 * For controls - today, only AiChatFab's two Recording entries - that only
 * ever navigate and never carry a knowledgeContext of their own: the
 * Knowledge tab's "Start recording" (openRecordingTool with a real
 * knowledgeContext) and the fab both land on the same Recording-tab pane, so
 * an instructor who selects Knowledge pages and THEN reaches that pane via
 * the fab instead of the Knowledge button must not have their pending
 * selection silently wiped by a control that was never involved in choosing
 * it. openRecordingTool's own "bare view clears pending" rule stays correct
 * for its one real caller (KnowledgeTab.tsx): there, a bare-view call means
 * the SAME control's own selection produced no usable text, which is exactly
 * when clearing a stale pending context is right. Still one-shot either way
 * - takeRecordingKnowledgeContext (below) is untouched by this function, so
 * a context set earlier is still consumed (and cleared) exactly once by
 * whichever drafting run picks it up next, and can never leak into an
 * unrelated later run.
 *
 * Invalid views are dropped (no dispatch), and this no-ops outside a
 * browser, both mirroring openRecordingTool's own guards.
 */
export function navigateToRecordingTool(view: RecordingLaunchView): void {
  if (!isValidView(view)) return;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RECORDING_LAUNCH_EVENT, { detail: { view } }));
}

/**
 * Read and clear the knowledge context stashed by the most recent
 * openRecordingTool() call, or null when there is none. One-shot: a second
 * call in a row (or a call when nothing was ever set) always returns null -
 * never the same context twice - so a later, unrelated drafting run can
 * never silently inherit an earlier selection it was never handed.
 */
export function takeRecordingKnowledgeContext(): RecordingKnowledgeContext | null {
  const ctx = pendingKnowledgeContext;
  pendingKnowledgeContext = null;
  return ctx;
}
