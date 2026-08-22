"use client";

// Local UI state + handlers for the LMS Modules bulk bar's "Visualizer
// coverage" row (docs/visualizer-coverage-from-selection-acceptance-
// criteria.md, Contract 4) - ONE scan of the current selection finds
// visualization-worthy concepts and checks each against the visualizer app's
// own index; the covered half can be inserted into a Canvas module as
// external-URL links, the gap half can be authored as new pages in the
// visualizer's own (separate) GitHub repo. Two different actions, two
// different confirmations, two different destinations - see that doc's own
// "Why these are one feature, not two" section for the full rationale this
// hook implements.
//
// STRUCTURAL SIBLING of useSelectionChatContext.ts and useLmsGeneration.ts
// (both read in full before this was written): same argument-style threading
// of the export-aware identifiers (courseUrl/courseId/acronym), the same
// live/export expansion split for gathering materials (A2, copied from
// useLmsGeneration's own `generate()` - see `scan` below), and the same
// defaultPostModuleChoiceFrom seeding useLmsGeneration's own post-target
// picker already uses (C2) - none of the three are reinvented here.
//
// TWO KINDS OF "ARMED" IN THIS FILE, KEPT DELIBERATELY SEPARATE:
//   (1) AVAILABILITY - whether `link`/`create` can do anything useful right
//       now at all (a scan happened, it found the right kind of concepts, a
//       target module resolves for `link`, Canvas is writable for `link`).
//       This is `linkUnavailableReason`/`createUnavailableReason` below -
//       computed fresh every render, surfaced as the row's aria-disabled
//       reason text exactly the way DownloadSelectionSection's own
//       imsccUnavailableReason/zipUnavailableReason are (read that file's
//       header in full - the aria-disabled/native-disabled split and the
//       "activation always calls the handler" rule are both binding here).
//   (2) CONFIRMATION - once available, a first click ARMS rather than
//       writes; a second click (for the SAME selection, and not superseded
//       by a re-scan) actually writes. This is confirmArming.ts's own
//       `isConfirmArmed`/`selectionSignature` idiom, exactly as
//       useBulkModuleActions.bulkDeleteModules already uses it (B1/C1: "armed
//       per scan result... disarms on a selection change or a re-scan").
//
// VERIFIED-FINDINGS FIX (blocker 1): Contract 4 is a FLOOR, not a ceiling -
// `linkArmed`/`createArmed` booleans are now exposed on the return object so
// VisualizerCoverageSection.tsx CAN swap its button labels the way
// BulkModulesSection.tsx:145 swaps "Delete" -> "Confirm delete", instead of
// relying solely on `setNote` (whose rendered location, in ContentTab.tsx,
// sits outside this row's own sticky header and outside any aria-live
// region - the row now also renders its own local, aria-live confirmation
// text keyed off these two booleans, so the confirmation is guaranteed
// visible/announced next to the control a user actually clicked). Three
// more things this fixes, all found together during the same audit:
//   (c) CROSS-ACTION LEAK: arming OR committing EITHER action now clears the
//       OTHER's armed state (`setCreateArmedFor(null)`/`createGate.disarm()`
//       inside `link()`'s arm AND commit branches, and the mirror inside
//       `create()`) - previously only `scan()` disarmed both, so arming
//       Link then arming Create (without ever committing Link) left Link's
//       arm standing; a single subsequent Link click would silently commit
//       an already-armed Canvas write the instructor never saw confirmed.
//   (d) SAME-TICK DOUBLE-CLICK: `linkGate`/`createGate` (an `ArmGate`, see
//       its own doc comment below) require an arm to survive past the
//       synchronous call stack it was armed in before it is committable - a
//       double-click or two rapid Enter presses landing in the same tick as
//       the arming click can never commit, only a genuinely separate,
//       later click can.
// The underlying signature-based mechanism (selectionSignature +
// isConfirmArmed, invalidated by a changed selection "by construction") is
// unchanged and still what `linkArmedFor`/`createArmedFor` themselves track;
// `linkArmed`/`createArmed` below are simply `isConfirmArmed(...)` read out
// for the row to key its label on, and the two `ArmGate`s are an
// ADDITIONAL, independent temporal guard layered on top, not a replacement.
//
// `coverage` ITSELF IS ALSO SIGNATURE-DERIVED, not plain state (see the AC
// doc's own comment on the `coverage` field: "the last scan's result, or
// null before any scan / after a disarm"). A stale scan result describing a
// DIFFERENT selection than what's on screen right now would otherwise sit
// there offering to link/create concepts that no longer correspond to
// anything selected - the same invalidation-by-construction confirmArming.ts
// itself argues for (a useEffect to null it out on selection change is easy
// to forget, and this repo's eslint rejects setState reached synchronously
// from an effect anyway), applied to a third piece of state beyond the two
// confirmArming.ts originally names. `moduleChoice` is NOT derived this way -
// see its own comment below for why plain, freely-editable state (mirroring
// useLmsGeneration's own `postModuleChoice`) is the right call there instead.
//
// SCAN IS A READ (A5): it never calls the outer tab-wide `setBusy`/`reload` -
// mirrors useSelectionChatContext's/useLmsGeneration's own generate()/refine()
// posture for the identical reason (see either file's header comment). LINK
// IS A REAL CANVAS WRITE (C7): it DOES hold the outer `setBusy` for its
// duration and calls `reload()` once something was actually inserted (C8) -
// mirrors useLmsGeneration's own `post()` exactly, the one other write in
// this tab's bulk bar. CREATE WRITES ONLY TO THE VISUALIZER'S OWN REPO, NEVER
// TO CANVAS (B5): it holds neither the outer `setBusy` nor calls `reload()` -
// nothing about the Canvas module tree on screen changes from creating a
// visualizer page.
//
// SCAN SUPPORTS THE FULL LIVE+EXPORT SELECTION (A2's own wording: "the SAME
// expansion split every sibling uses"), even though D5/"Out of scope" name
// "export-sourced selections" as out of scope. Reconciled by reading D5 as
// being about the LINK ACTION'S DESTINATION only: a Canvas module to insert
// into must be a real, live module (`moduleOptions` below is
// `postModuleOptionsFrom(modules)` - the live tree only, never an export
// tree), and `link` already refuses an export-sourced view via
// `gateOperation(sourceContext, "courseWrite")` (C7) for exactly the same
// reason `post()` already does. Scanning materials to find concepts worth
// visualizing has no such destination constraint, so it copies the full
// split rather than an artificially live-only half of it.
import { useMemo, useRef, useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { CartridgeModule } from "@/lib/cartridge-import";
import { expandModuleSelection, type SelectedMaterialItem } from "@/lib/lms-generation/materials";
import type {
  CoveredConcept,
  GapConcept,
  SelectionCoverage,
  VisualizerCreateInput,
  VisualizerCreateSuccess,
} from "@/lib/visualizer/selection-coverage";
import { coverageSummaryNote } from "@/lib/visualizer/selection-coverage";
import {
  scanSelectionForVisualizerCoverageAction,
  linkVisualizerPagesIntoModuleAction,
  type VisualizerLinkSuccess,
} from "@/app/actions/visualizer-selection";
import { isConfirmArmed, selectionSignature } from "./confirmArming";
import { defaultPostModuleChoiceFrom, postModuleOptionsFrom, type PostModuleOption } from "./lmsGenerationModuleTarget";
import { buildSelectedMaterialItems } from "./lmsGenerationSelection";
import { liveModuleIdsFromKeys } from "../utils";
import { gateOperation, LIVE_CONTENT_SOURCE, type ContentSourceContext } from "../contentSourceGating";

export type VisualizerCoverageBusy = "" | "scan" | "link" | "create";

export interface UseVisualizerCoverageReturn {
  busy: VisualizerCoverageBusy;
  /** The last scan's result, or null before any scan / after a disarm - see
   * this file's header comment on why this is signature-derived rather than
   * plain state. */
  coverage: SelectionCoverage | null;
  scan: () => void;
  /** Armed only while `coverage` has covered concepts and the target module
   * is resolved; see C1/C2. A first call while available ARMS the second-
   * click confirmation (reported via `setNote` AND via `linkArmed` below,
   * so the row can both announce it near the control and swap its label);
   * a second call while armed - and only once the arm has survived past the
   * synchronous tick it was armed in, see `ArmGate` below - performs the
   * write. */
  link: () => void;
  create: () => void;
  moduleChoice: string;
  setModuleChoice: (v: string) => void;
  moduleOptions: Array<{ id: number; name: string }>;
  /** Why link/create cannot run right now, or null - the reason strings the
   * row renders next to the controls. */
  linkUnavailableReason: string | null;
  createUnavailableReason: string | null;
  /** True from the arming click until `link` either commits or is
   * superseded (a re-scan, a selection change, or `create` being armed) -
   * see this file's header comment, blocker 1(a)/(c). Lets
   * VisualizerCoverageSection.tsx swap the button's own label the way
   * BulkModulesSection.tsx:145 swaps "Delete" -> "Confirm delete", instead
   * of leaving the DOM identical across the arming and confirming clicks. */
  linkArmed: boolean;
  /** Same as `linkArmed`, for `create`. */
  createArmed: boolean;
}

/** A6: the empty-selection case, surfaced explicitly rather than a silent
 * no-op - the row only ever renders while something is selected, but `scan`
 * still guards this defensively (mirroring generate()'s/askAi's own upfront
 * "nothing selected" guard) and, unlike those two, reports it by name: A6
 * requires every degradation, including this one, to produce its own
 * distinguishable message rather than doing nothing visible at all. */
export const EMPTY_SELECTION_SCAN_ERROR =
  "Select at least one module or item first - there is nothing to scan for visualizer coverage.";

/** A5/A6: the scan's own report. `coverageSummaryNote` (Contract 1, a pure
 * leaf owned by set A) supplies the "N found, M covered, K missing" text;
 * this wraps it with the ONE decision that belongs to the caller, not the
 * leaf - "found nothing" is never rendered as a success (A6), regardless of
 * WHICH degradation produced zero concepts (blank materials, an extraction
 * that found nothing worth visualizing - see `notes`, which is Contract 3's
 * own "gather/extract notes, surfaced verbatim, never dropped" field and is
 * what actually names the specific reason in each of those cases). */
export function scanResultNote(coverage: SelectionCoverage, notes: readonly string[]): { kind: "success" | "error"; text: string } {
  const summary = coverageSummaryNote(coverage);
  const text = notes.length > 0 ? `${summary} ${notes.join(" ")}` : summary;
  const total = coverage.covered.length + coverage.gaps.length;
  return { kind: total === 0 ? "error" : "success", text };
}

/** Blocker 1(d): a double click, or two rapid Enter presses, must not be
 * able to commit an arm the instructor never had a chance to read. An arm
 * becomes committable only once it has stood for `ARM_COMMIT_MIN_MS` - see
 * `createArmGate` below for why elapsed time, and not a microtask, is what
 * measures that. Deliberately independent of `isConfirmArmed`/
 * `selectionSignature` (confirmArming.ts): that mechanism answers "is this
 * armed for the CURRENT selection", this one answers "has this arm stood
 * long enough to have been read" - a different axis, checked in addition to,
 * never instead of, the signature check. */
export interface ArmGate {
  arm(): void;
  disarm(): void;
  canCommit(): boolean;
}

/**
 * How long an arm must have stood before a click may commit it. A double
 * click is two clicks roughly 100-250ms apart (the OS/browser threshold most
 * platforms use to synthesize `dblclick` is 500ms), and a person cannot read
 * a swapped button label and decide within that window. 400ms sits above the
 * fast end of a double click while staying far below any deliberate
 * read-then-click, so an intentional confirmation never has to wait and an
 * accidental one cannot land.
 */
export const ARM_COMMIT_MIN_MS = 400;

/**
 * A wall-clock gate, injectable for tests.
 *
 * WHY NOT A MICROTASK. An earlier version of this scheduled a
 * `Promise.resolve().then()` on `arm()` and treated the arm as committable
 * once that microtask ran. That closes only the case of two SYNCHRONOUS
 * calls inside one JS tick - which is not what blocker 1(d) was about. A real
 * double click (and two Enter presses) delivers two SEPARATE browser events
 * in two separate tasks, and microtasks flush at the end of the first task,
 * so the second click always found the gate already open. The mechanism was
 * deterministic and testable but guarded the wrong thing; its own doc comment
 * said as much ("a genuine second click ... always finds the microtask
 * already resolved") without that being recognised as the defect.
 *
 * Elapsed time is the only thing that actually separates "the user read the
 * confirmation and clicked again" from "the user double clicked", so that is
 * what is measured. `now` is a parameter rather than a direct `Date.now()`
 * call so the race can be tested exactly, with no timers harness and no
 * real waiting - the reason the microtask version was originally preferred.
 *
 * Deliberately independent of `isConfirmArmed`/`selectionSignature`
 * (confirmArming.ts): that answers "is this armed for the CURRENT selection",
 * this answers "has this arm stood long enough to have been read". Both are
 * checked, never one instead of the other.
 */
export function createArmGate(now: () => number = () => Date.now()): ArmGate {
  let armedAt: number | null = null;
  return {
    arm() {
      armedAt = now();
    },
    disarm() {
      armedAt = null;
    },
    canCommit() {
      return armedAt !== null && now() - armedAt >= ARM_COMMIT_MIN_MS;
    },
  };
}

/** D2's own "swap defect" pin: the ONE place that decides which half of a
 * scan result feeds which action. `link()` below calls `conceptsForLink`,
 * `create()` calls `conceptsForCreate` - a hook that classified covered vs.
 * gap correctly but wired the two halves backwards (fed gaps to the link
 * action, or covered concepts to create) is exactly the defect this split,
 * independently-testable pair exists to catch; see
 * useVisualizerCoverage.test.ts. */
export function conceptsForLink(coverage: SelectionCoverage): CoveredConcept[] {
  return coverage.covered;
}

/** A4/B1: only "no-match" gaps are ever offered for creation - a
 * "topic-not-creatable" gap is excluded here, mirroring
 * computeCreateUnavailableReason's own filter below (the wiring test pins
 * both filters using the identical condition, so they cannot drift apart). */
export function conceptsForCreate(coverage: SelectionCoverage): GapConcept[] {
  return coverage.gaps.filter((g) => g.reason === "no-match");
}

/** C1/C2/C7: why `link` cannot run right now, or null when it can. Computed
 * from the ALREADY-derived `coverage` (null once stale - see header
 * comment), so this never needs its own staleness check. Layered in the same
 * "most fundamental blocker wins" order gateOperation itself already
 * documents for its own two independent failure shapes. */
export function computeLinkUnavailableReason(
  coverage: SelectionCoverage | null,
  moduleChoice: string,
  sourceContext: ContentSourceContext
): string | null {
  if (!coverage) return "Scan the selection first to find concepts that already have a visualizer page to link.";
  if (coverage.covered.length === 0) return "The last scan found no concepts that already have a visualizer page - nothing to link.";
  const gate = gateOperation(sourceContext, "courseWrite");
  if (!gate.allowed) return gate.reason ?? "This selection cannot write to Canvas right now.";
  if (!moduleChoice) {
    return "Choose which module to insert the links into - the selection didn't name exactly one module, so no default could be applied.";
  }
  return null;
}

/** B1/B2/A4: why `create` cannot run right now, or null when it can. A gap
 * reasoned "topic-not-creatable" is never counted toward "creatable" here -
 * the row must be able to say WHY those are excluded (this string is what it
 * shows), never silently offer to create them anyway. */
export function computeCreateUnavailableReason(coverage: SelectionCoverage | null): string | null {
  if (!coverage) return "Scan the selection first to find concepts that could become new visualizer pages.";
  if (coverage.gaps.length === 0) return "The last scan found no missing concepts - nothing to create.";
  const creatable = coverage.gaps.filter((g) => g.reason === "no-match");
  if (creatable.length === 0) {
    return "Every missing concept matched a visualizer topic that cannot receive a new page, so none of them can be created here.";
  }
  return null;
}

/** C3/C6: the outcome note for a completed link run - names what was linked,
 * what was already present and skipped (C5), and what failed, so a partial
 * run (B3/C6's "never fatal" posture) is never reported as a flat success or
 * a flat failure. */
export function linkResultNote(moduleName: string, result: VisualizerLinkSuccess): { kind: "success" | "error"; text: string } {
  const parts = [
    result.linked.length > 0 ? `Linked ${result.linked.length}: ${result.linked.join(", ")}.` : "",
    result.skipped.length > 0 ? `${result.skipped.length} already linked, skipped: ${result.skipped.join(", ")}.` : "",
    result.failed.length > 0 ? `${result.failed.length} failed: ${result.failed.map((f) => `${f.concept} (${f.error})`).join("; ")}.` : "",
  ].filter(Boolean);
  const body = parts.length > 0 ? parts.join(" ") : "Nothing to link.";
  return { kind: result.failed.length > 0 ? "error" : "success", text: `${body} Inserted into "${moduleName}". Nothing was written to the visualizer repo.` };
}

/**
 * Calls the visualizer-create Route Handler
 * (src/app/api/visualizer/create/route.ts) rather than a Server Action -
 * that route's own header comment explains why createVisualizerPagesForGapsAction
 * moved off src/app/actions/visualizer-selection.ts, for the identical
 * reason src/app/api/lms-generation/deck/route.ts already moved deck
 * generation off generateFromSelectionAction: each gap costs roughly two LLM
 * calls plus five GitHub operations, and a Server Action reachable from
 * src/app/page.tsx (a client component with no `maxDuration` of its own) has
 * no way to declare an explicit ceiling for that cost. Mirrors
 * generateDeckApi's own guard (lmsGenerationDeckHelpers.ts) and
 * useSelectionDownload.ts's own readErrorMessage exactly: a non-JSON
 * response (an auth redirect to the login page, a platform timeout page) is
 * treated as a clean error instead of letting `res.json()` throw "Unexpected
 * token '<'" - the specific failure mode this hook must not let escape as an
 * uncaught exception (A3).
 */
export async function createVisualizerPagesApi(
  payload: VisualizerCreateInput
): Promise<VisualizerCreateSuccess | { error: string }> {
  try {
    const res = await fetch("/api/visualizer/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.headers.get("content-type")?.includes("application/json")) {
      return {
        error:
          res.status === 401 || res.status === 403
            ? "Your session expired - sign in again."
            : `Creating visualizer pages failed or timed out (HTTP ${res.status}). Try again with fewer concepts.`,
      };
    }
    return (await res.json()) as VisualizerCreateSuccess | { error: string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Network error" };
  }
}

/** B2/B3/B4: the outcome note for a completed create run - created (with
 * URLs), skipped (B4's "gained a page since the scan" re-check), and failed
 * (B3's per-concept isolation), never a flat pass/fail.
 *
 * `notAttempted` IS RENDERED, and that is the whole point of it existing.
 * The create action is capped at VISUALIZER_CREATE_MAX_PAGES per run because
 * each page costs roughly two LLM calls and five GitHub operations - see
 * that constant's own comment (src/lib/visualizer/selection-coverage.ts) for
 * the arithmetic, including why moving the work to a Route Handler with an
 * explicit `maxDuration` (createVisualizerPagesApi above) is what makes
 * raising the cap defensible at all. A regression pass found this field was
 * returned by the server and read by nobody - which turns the cap into a
 * SILENT truncation: the instructor sees "Created 2" on a scan that found
 * six gaps, has no way to tell the run was capped rather than finished, and
 * never learns to run it again. A cap the user cannot see is indistinguishable
 * from a bug, so it is named here alongside the instruction to re-run. */
export function createResultNote(result: VisualizerCreateSuccess): { kind: "success" | "error"; text: string } {
  const notAttempted = result.notAttempted ?? [];
  const parts = [
    result.created.length > 0 ? `Created ${result.created.length}: ${result.created.map((c) => `${c.concept} (${c.url})`).join(", ")}.` : "",
    result.skipped.length > 0 ? `${result.skipped.length} already had a page by the time this ran, skipped: ${result.skipped.join(", ")}.` : "",
    result.failed.length > 0 ? `${result.failed.length} failed: ${result.failed.map((f) => `${f.concept} (${f.error})`).join("; ")}.` : "",
    notAttempted.length > 0
      ? `${notAttempted.length} not attempted this run (one run creates a limited number of pages): ${notAttempted.join(", ")}. Scan again and create to continue.`
      : "",
  ].filter(Boolean);
  const body = parts.length > 0 ? parts.join(" ") : "Nothing to create.";
  return { kind: result.failed.length > 0 ? "error" : "success", text: `${body} Nothing was written to Canvas or the course tile.` };
}

/** The selection's own signature (confirmArming.ts's `selectionSignature`,
 * unioned over both the individually-selected items' own keys AND the
 * selected-module keys) - what a scan result, and each second-click
 * confirmation, are armed FOR. Deliberately the same union
 * defaultPostModuleChoiceFrom's own caller already builds from these two
 * arrays (materialItems, moduleKeys), not a third hand-rolled shape. */
function currentSelectionSignature(materialItems: readonly SelectedMaterialItem[], moduleKeys: readonly string[]): string {
  return selectionSignature([...materialItems.map((it) => it.key), ...moduleKeys]);
}

export function useVisualizerCoverage(
  courseUrl: string,
  /** An export selection's course_hub row id - threaded through exactly like
   * useSelectionChatContext's own `courseId` (see that file's header
   * comment). Undefined for a live selection. */
  courseId: string | undefined,
  acronym: string | undefined,
  provider: LlmProvider,
  selectedMaterialItems: () => SelectedMaterialItem[],
  selectedModules: Set<string>,
  modules: CanvasModule[],
  exportModules: CartridgeModule[] | null | undefined,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  /** The tab-wide Canvas-writing busy flag (ModulesView.tsx's own `busy`
   * state) - held only while `link` is in flight (C7), mirroring
   * useLmsGeneration's own `post()`. `scan`/`create` never touch it - see
   * this file's header comment for why. */
  setBusy: (b: boolean) => void,
  /** Re-fetch the Canvas module tree - called once `link` inserts at least
   * one item (C8), never after `scan`/`create` (neither changes Canvas). */
  reload: () => void,
  /** Which Course Content source is active, and whether a live Canvas course
   * is linked to write to - see contentSourceGating.ts. Defaults to
   * LIVE_CONTENT_SOURCE so behaviour is unchanged for a live selection, the
   * only reachable one until export courses are selectable elsewhere in this
   * tab. Read only by `link` (C7) - `create` never touches Canvas, so this
   * fact is irrelevant to it (B5). */
  sourceContext: ContentSourceContext = LIVE_CONTENT_SOURCE
): UseVisualizerCoverageReturn {
  const [localBusy, setLocalBusy] = useState<VisualizerCoverageBusy>("");
  const [rawCoverage, setRawCoverage] = useState<SelectionCoverage | null>(null);
  // The signature the CURRENTLY-HELD `rawCoverage` was produced for - `null`
  // before any scan. Comparing this to the LIVE selection's own signature
  // (below) is what makes `coverage` null out the moment the selection
  // changes, with no effect and nothing to remember to reset - see this
  // file's header comment.
  const [coverageArmedFor, setCoverageArmedFor] = useState<string | null>(null);
  const [linkArmedFor, setLinkArmedFor] = useState<string | null>(null);
  const [createArmedFor, setCreateArmedFor] = useState<string | null>(null);
  // Blocker 1(d)'s temporal guard (see ArmGate's own doc comment) - held in
  // refs, not state: they are read/written only inside `link`/`create`
  // themselves (never rendered), so mutating them needs no re-render of
  // their own. Each instance is independent per action, matching
  // `linkArmedFor`/`createArmedFor` being two separate pieces of state.
  const linkGate = useRef(createArmGate());
  const createGate = useRef(createArmGate());
  // NO `ta-` LOCALSTORAGE KEY HERE (this repo's own "every new textbox/
  // select/checkbox persists across reloads" rule, deliberately NOT applied
  // to this control) - this select's only correct value is a function of the
  // CURRENT scan (seeded by defaultPostModuleChoiceFrom, same as
  // useLmsGeneration's own postModuleChoice - see lmsGenerationModuleTarget.ts's
  // own "NO NEW ta- LOCALSTORAGE KEY" comment for the identical reasoning
  // applied to that sibling control). A value restored from localStorage
  // after a reload would name a module from a PAST selection/scan that may no
  // longer exist, or no longer match what's currently selected, while looking
  // exactly as authoritative as a real seed - precisely the stale-but-
  // answered-looking default this repo's own AC6 (referenced there) exists to
  // reject. Unlike `coverage` above, this is plain state rather than
  // signature-derived: it is reseeded on every successful scan (mirroring
  // finishGenerateSuccess's own unconditional reseed) and otherwise left
  // exactly as the instructor set it, including across an unrelated
  // selection change that hasn't been re-scanned yet - the same posture
  // useLmsGeneration's own `postModuleChoice` already takes.
  const [moduleChoice, setModuleChoiceState] = useState("");

  // SHOULD-FIX 10: `selectedMaterialItems()` is O(modules x items) over BOTH
  // trees (useModuleSelection.ts:430-447) - useLmsGeneration's own generate()
  // only ever calls it inside an event handler, never unconditionally in a
  // render body. `coverage` below still needs a fresh comparison EVERY
  // render for it to null itself out "by construction" the moment the
  // selection changes (see this file's own header comment on why `coverage`
  // is signature-derived), so the call itself cannot be deferred to a
  // handler here the way generate() defers it. What CAN be memoized is the
  // work DERIVED from its result, keyed on the real reactive inputs
  // (`selectedMaterialItems`, `selectedModules`) rather than recomputed
  // unconditionally on every render this component happens to make for an
  // unrelated reason (a keystroke in the module-search box, this hook's own
  // busy/note state changing). CAVEAT, stated plainly: `selectedMaterialItems`
  // is a fresh closure on every call to useModuleSelection (no useCallback
  // there - useModuleSelection.ts:430), so this memo cannot skip the
  // underlying O(modules x items) scan until that upstream file memoizes its
  // own returned function; that file is outside this change's file set.
  // Wiring the useMemo correctly here (the real deps, not a stale or wrong
  // list) is still the right fix on this side of the boundary, and it stops
  // recomputing everything DOWNSTREAM (the signature string, `coverage`,
  // `linkUnavailableReason`/`createUnavailableReason`) the moment that
  // upstream memoization lands, with no further change needed here.
  const materialItems = useMemo(
    () => buildSelectedMaterialItems(selectedMaterialItems()),
    [selectedMaterialItems]
  );
  const moduleKeys = useMemo(() => Array.from(selectedModules), [selectedModules]);
  const currentSig = useMemo(
    () => currentSelectionSignature(materialItems, moduleKeys),
    [materialItems, moduleKeys]
  );

  const coverage = isConfirmArmed(coverageArmedFor, currentSig) ? rawCoverage : null;

  const linkUnavailableReason = computeLinkUnavailableReason(coverage, moduleChoice, sourceContext);
  const createUnavailableReason = computeCreateUnavailableReason(coverage);
  // Blocker 1(a): exposed so the row can swap its button label the instant
  // an arm happens, mirroring bulkDeleteModules's own confirmDeleteModules.
  const linkArmed = isConfirmArmed(linkArmedFor, currentSig);
  const createArmed = isConfirmArmed(createArmedFor, currentSig);

  const setModuleChoice = (v: string) => {
    setModuleChoiceState(v);
    // Changing the target invalidates any pending link confirmation - the
    // arm note (see `link` below) names a specific module by name, and a
    // second click must not silently redirect that promise to a module the
    // instructor picked AFTER arming.
    setLinkArmedFor(null);
    linkGate.current.disarm();
  };

  const scan = () => {
    if (localBusy !== "") return;
    if (materialItems.length === 0 && moduleKeys.length === 0) {
      setNote({ kind: "error", text: EMPTY_SELECTION_SCAN_ERROR });
      return;
    }
    const sig = currentSig;

    // B1/C1: a fresh scan disarms both second-click confirmations
    // unconditionally - "re-scanning disarms it" is its own independent
    // trigger, not merely a side effect of the selection having changed
    // (which `coverage`'s own signature comparison already handles on its
    // own).
    setLinkArmedFor(null);
    setCreateArmedFor(null);
    linkGate.current.disarm();
    createGate.current.disarm();

    // A2: the SAME live/export expansion split useLmsGeneration's own
    // `generate()` uses (see that file for the full rationale) - an EMPTY
    // live tree passed here so only the export half expands client-side;
    // the live half is sent as `moduleIds` for the server to expand itself
    // against a FRESH read. No repo-sourced key can reach this call at all:
    // `selectedModules`/`selectedMaterialItems` never carry one (repo
    // selection lives in RepoFoldersSection's own, separate Set).
    const itemsForServer = expandModuleSelection(materialItems, moduleKeys, [], exportModules ?? undefined);
    const moduleIds = Array.from(liveModuleIdsFromKeys(moduleKeys));
    // C2: computed once per scan, from the raw selection (never the possibly
    // stale expansion) - see defaultPostModuleChoiceFrom's own doc comment
    // for why materialItems/moduleKeys is the correct input here.
    const defaultModuleChoice = defaultPostModuleChoiceFrom(materialItems, moduleKeys);

    void (async () => {
      setLocalBusy("scan");
      setNote(null);
      try {
        const result = await scanSelectionForVisualizerCoverageAction({
          courseUrl,
          courseId,
          acronym,
          items: itemsForServer,
          moduleIds,
          provider,
        });
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        const nextCoverage: SelectionCoverage = { covered: result.covered, gaps: result.gaps };
        setRawCoverage(nextCoverage);
        setCoverageArmedFor(sig);
        setModuleChoiceState(defaultModuleChoice);
        setNote(scanResultNote(nextCoverage, result.notes));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setNote({ kind: "error", text: `Could not scan the selection for visualizer coverage: ${message}` });
      } finally {
        setLocalBusy("");
      }
    })();
  };

  const link = () => {
    if (localBusy !== "") return;
    // A7-style rule: activation always calls this handler; a permanent
    // unavailable reason is reported here through `setNote`, never silently
    // swallowed - see DownloadSelectionSection.tsx's own header comment for
    // why aria-disabled controls must still do SOMETHING on activation.
    const reason = linkUnavailableReason;
    if (reason) {
      setNote({ kind: "error", text: reason });
      return;
    }
    // Re-derived defensively rather than trusted from `reason === null` alone
    // - mirrors useLmsGeneration.post()'s own re-validation of
    // resolvePostModuleTarget right before it commits to a network call.
    if (!coverage || coverage.covered.length === 0) return;
    const moduleId = Number(moduleChoice);
    if (!moduleChoice || !Number.isFinite(moduleId)) return;
    const moduleName = modules.find((m) => m.id === moduleId)?.name ?? moduleChoice;
    // D2: the ONE call that decides what `link` acts on - see
    // conceptsForLink's own doc comment on why this is a named, separately
    // tested function rather than an inline `coverage.covered` reference.
    const concepts = conceptsForLink(coverage);
    // SHOULD-FIX 11: worded as an upper bound, not a promise - the server
    // drops already-linked concepts via unlinkedConcepts (Contract 1), so a
    // re-arm after a completed run must never claim it will insert N links
    // when the true count could be zero.
    const armNote = {
      kind: "success" as const,
      text: `Click "Link" again to confirm: insert up to ${concepts.length} link${concepts.length === 1 ? "" : "s"} into "${moduleName}" (concepts already linked into that module are skipped automatically). Nothing has been written yet.`,
    };

    if (!isConfirmArmed(linkArmedFor, currentSig)) {
      setLinkArmedFor(currentSig);
      // Blocker 1(c): arming Link disarms any pending Create confirmation -
      // an instructor must never be able to leave an armed external-repo
      // write standing behind a single click on the sibling control.
      setCreateArmedFor(null);
      createGate.current.disarm();
      linkGate.current.arm();
      // Also reported via `setNote` (kept for the shared note channel and
      // for the wiring test's defense-in-depth check), but the ROW itself
      // now renders this same confirmation locally, next to the button, in
      // an aria-live region - see VisualizerCoverageSection.tsx and
      // `linkArmed` above (blocker 1(b)).
      setNote(armNote);
      return;
    }
    if (!linkGate.current.canCommit()) {
      // Blocker 1(d): armed for the right selection, but this call landed in
      // the SAME synchronous tick as the arming call (a double-click, or two
      // Enter keydown/keyup pairs with no yield to the event loop between
      // them) - report the identical confirmation again instead of
      // committing. A genuine second click, arriving as its own later event,
      // will find `canCommit()` true.
      setNote(armNote);
      return;
    }
    setLinkArmedFor(null);
    setCreateArmedFor(null);
    linkGate.current.disarm();
    createGate.current.disarm();

    void (async () => {
      setLocalBusy("link");
      setBusy(true);
      setNote(null);
      try {
        const result = await linkVisualizerPagesIntoModuleAction({ courseUrl, acronym, moduleId, concepts });
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        setNote(linkResultNote(moduleName, result));
        // C8: reload only when something was actually inserted - an
        // all-skipped/all-failed run changed nothing about the module tree,
        // so there is nothing for a reload to reveal.
        if (result.linked.length > 0) reload();
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setNote({ kind: "error", text: `Could not link the covered concepts into the module: ${message}` });
      } finally {
        setLocalBusy("");
        setBusy(false);
      }
    })();
  };

  const create = () => {
    if (localBusy !== "") return;
    const reason = createUnavailableReason;
    if (reason) {
      setNote({ kind: "error", text: reason });
      return;
    }
    if (!coverage) return;
    // A4/B1/D2: only "no-match" gaps are ever offered for creation - a
    // "topic-not-creatable" gap is excluded here via `conceptsForCreate`,
    // which mirrors computeCreateUnavailableReason's own filter (see its own
    // doc comment), even though a reachable `create()` call already implies
    // at least one exists (the reason above would otherwise have refused).
    const creatable = conceptsForCreate(coverage);
    if (creatable.length === 0) return;
    const armNote = {
      kind: "success" as const,
      text: `Click "Create" again to confirm: commit ${creatable.length} new page${creatable.length === 1 ? "" : "s"} to the visualizer app's own GitHub repository (not this project's repo, and not Canvas). This writes outside this project and cannot be undone from here.`,
    };

    if (!isConfirmArmed(createArmedFor, currentSig)) {
      setCreateArmedFor(currentSig);
      // Blocker 1(c): arming Create disarms any pending Link confirmation -
      // the mirror of the cross-clear in `link()` above.
      setLinkArmedFor(null);
      linkGate.current.disarm();
      createGate.current.arm();
      // The external-repo disclosure (D of this feature's own AC doc): stated
      // here in the confirmation prompt itself, not only in the row's static
      // label text, so the two together (label always visible + this note on
      // the arming click) make the destination impossible to miss before the
      // second click actually commits anything. The row also renders this
      // same confirmation locally now (blocker 1(b) - see
      // VisualizerCoverageSection.tsx and `createArmed` above).
      setNote(armNote);
      return;
    }
    if (!createGate.current.canCommit()) {
      // Blocker 1(d): see the identical guard in `link()` above.
      setNote(armNote);
      return;
    }
    setCreateArmedFor(null);
    setLinkArmedFor(null);
    createGate.current.disarm();
    linkGate.current.disarm();

    void (async () => {
      setLocalBusy("create");
      setNote(null);
      try {
        const result = await createVisualizerPagesApi({ concepts: creatable, provider });
        if ("error" in result) {
          setNote({ kind: "error", text: result.error });
          return;
        }
        // B5: no `setBusy`/`reload()` here - this action never writes to
        // Canvas or the course tile, so there is nothing in the module tree
        // for a reload to reflect.
        setNote(createResultNote(result));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setNote({ kind: "error", text: `Could not create the missing visualizer pages: ${message}` });
      } finally {
        setLocalBusy("");
      }
    })();
  };

  return {
    busy: localBusy,
    coverage,
    scan,
    link,
    create,
    moduleChoice,
    setModuleChoice,
    moduleOptions: postModuleOptionsFrom(modules) as PostModuleOption[],
    linkUnavailableReason,
    createUnavailableReason,
    linkArmed,
    createArmed,
  };
}
