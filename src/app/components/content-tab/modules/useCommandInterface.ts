"use client";

// The bulk-bar command box - docs/llm-command-interface-acceptance-criteria.md
// section 10, THE FINAL CONTRACT (G1, G7, G10, G12, G13, G14 are this hook's
// own brief; sections 1-9 record an earlier design pass section 10 corrects
// where they disagree). Structural sibling of useCarryModulePattern.ts (read
// in full before this was written) - same shape: orchestrate a fetch (here,
// a model call, not a Canvas read), derive a reviewable plan, and apply it -
// but the plan here is MODEL OUTPUT keyed to specific object ids rather than
// something re-derivable by a pure function on every selection change (G14),
// so this hook's own "arm" is a one-shot generate, never a useMemo.
//
// G12 - THE FAN-OUT RUNS HERE, IN THE BROWSER, ONE
// applyCommandProposalRowAction INVOCATION PER ROW. Never one server call
// looping every row: src/app/page.tsx sets no maxDuration, so a looping
// action dies mid-run on the platform default, and "rewrote 6 of 10 then
// crashed" must be a RENDERED state, not a lost one - `onApplyCommand` below
// marks each row's outcome into `outcomes` state AS IT LANDS (inside the
// mapWithConcurrency callback, not after the whole batch resolves), bounded
// by `COMMAND_APPLY_CONCURRENCY` well under Canvas's ~12-concurrent throttle.
// `mapWithConcurrency` is the CLIENT-SIDE helper bulkRubricGenerateSummary.ts
// already exports and useBulkItemActions.ts already imports for the same
// reason (the one in src/app/actions/shared.ts is server-only) - reused, not
// re-implemented.
//
// VERIFICATION-PASS FIX (the apply storm): applyCommandProposalRowAction used
// to recover an item's live type/contentId/pageUrl by calling `listModules`
// AGAIN, once per row - and `listModules` itself is one Canvas request per
// module, fired concurrently. On a 10-row apply against a 15-module course
// that peaked near 64 concurrent, unthrottled Canvas reads. The browser
// already holds the module tree (it is `modules`, this hook's own parameter)
// so that re-read was always avoidable: `itemRefById` below is built ONCE,
// from the same read that builds the generation context, and every row's
// `applyCommandProposalRowAction` call now carries it as `itemRef`, so the
// action can address the write directly instead of re-reading the course.
// See `COMMAND_APPLY_CONCURRENCY`'s own comment below for the corrected
// per-row cost this leaves.
//
// G14 - STALENESS: "apply the intersection, name what was dropped" is the
// decision this hook implements, not "refuse outright". command-proposal.ts's
// own header comment states the choice is between those two and explicitly
// exports `reconcileCommandProposalWithSelection` to compute the
// applicable/dropped split rather than an all-or-nothing boolean - which only
// makes sense as the return value of a design that surfaces the intersection.
// `reconciliation` below is recomputed on every render (`useMemo` over the
// live selection), so a selection change while the review modal is open is
// reflected immediately, before Apply is ever clicked - never only checked
// once at apply time.
//
// AC6's weak idempotency ("re-applying an unchanged proposal must not create
// duplicate modules and must not re-issue a write already at the proposed
// value") is implemented ENTIRELY client-side, because
// applyCommandProposalRowAction (command-interface.ts) itself performs no
// retry-dedupe of its own - `applyCreateModuleRow` always calls createModule
// unconditionally. `selectRowsToApply` below excludes any row whose outcome
// already landed as a success within THIS proposal session, so clicking
// Apply again only re-drives the rows that have not yet succeeded - "a
// re-apply means the four that did not land", per G12's own text. A brand
// new proposal (a fresh "Review proposal" click) re-reads the live module
// list before classifying, so a module a previous apply already created is
// correctly reclassified "already-present" (G8) rather than duplicated.
//
// G1 - REVERTIBILITY: `describeRowRevertibility` below is the one place this
// app states, per row, whether Canvas can undo the write on its own (a Page,
// via its own revision history) or cannot (Assignment/Quiz/Discussion body,
// or any module rename/create) - re-verified against Canvas source, section
// 10's G1 table. It needs the live item KIND, which `CommandProposalRow`
// itself does not carry (`CommandProposalTarget` is only
// {kind,id,displayName,selectionKey} - command-apply-outcome.ts's own header
// explains why), so this hook keeps its own `itemRefById` map, captured from
// the same selection read that built the generation context, alongside the
// proposal - `describeRowRevertibility` still only reads its `itemType`
// field, via a small derived view built inside `buildCommandReviewRows`.
// `itemRefById` carries more than the kind (contentId, pageUrl, isNewQuiz)
// because it doubles as the source for the `itemRef` this hook now passes to
// `applyCommandProposalRowAction` (see the header note above this file's G12
// paragraph) - one map, two uses, so the two can never disagree with each
// other about what an item's live kind is.
//
// G1 - PRE-IMAGE RECOVERY: a captured-and-discarded pre-image is weaker than
// what G1 specifies ("the only undo those types will ever have"). `outcomes`
// still lives in useState and is still wiped by the next "Review proposal" or
// a reload - this hook does not persist it - but `onDownloadAppliedLog` below
// lets the instructor get every landed row's pre-image out of the browser as
// a CSV or JSON file before that happens, the same "the write has no undo and
// no audit table" problem repoGradesLog.ts / RepoGradesLogPanel.tsx already
// solve for Repo Grades, reusing their two load-bearing helpers
// (`triggerFileDownload`, `escapeCsvValue`) rather than a new download or
// escaper.
//
// G13 - REVIEWABILITY: (a) the per-row opt-out lives here as `optedOut: Set
// <number>`, keyed by the row's own index into `proposal.rows` (stable for
// the life of one proposal); (b) `exactBytesForRow` below is what the modal
// renders as "what will actually be sent" - it runs `plainTextToPageHtml`
// (command-apply-outcome.ts) over a "description" row's `proposedValue`
// exactly the way both `updateGradable` (gradables.ts's private, unexported
// descriptionToHtml - byte-identical, see that file's own header) and
// `updatePage`'s page-body branch do, rather than the
// `dangerouslySetInnerHTML` idiom AssignmentPreviewModal.tsx uses elsewhere
// in this tab - that idiom shows what the HTML LOOKS like, which is exactly
// backwards here: it would hide the markup differences CanvasSanitize acts
// on. A "title" row needs no transform (Canvas receives it verbatim). A
// "moduleName" row DOES need one, and VERIFICATION-PASS FIX (G13b, defect
// 10): `updateModule` (modules.ts:88) sends `fields.name.trim()`, not the raw
// value - a proposed module name with surrounding whitespace used to preview
// differently from what Canvas actually received, because this function
// returned it unchanged. `exactBytesForRow` now trims a "moduleName" row the
// same way, so it remains the single function that feeds both the "will be
// written to Canvas as" preview (CommandProposalModal.tsx) and anything else
// that displays what will be sent.
import { useMemo, useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule, CanvasModuleItem, GradableKind } from "@/lib/canvas-modules";
import { getGradableAction, getPageAction, listBulkItemsAction } from "@/app/actions/canvas-files-bulk";
import { generateCommandProposalAction, applyCommandProposalRowAction } from "@/app/actions/command-interface";
import {
  buildCommandProposal,
  reconcileCommandProposalWithSelection,
  type CommandProposal,
  type CommandProposalContext,
  type CommandProposalItemInfo,
  type CommandProposalModuleInfo,
  type CommandProposalReconciliation,
  type CommandProposalRow,
} from "@/lib/command-proposal";
import { plainTextToPageHtml, type CommandApplyOutcome } from "@/lib/command-apply-outcome";
import { mapWithConcurrency } from "./bulkRubricGenerateSummary";
import { itemKey, liveModuleKey, type ItemSource } from "../utils";
import { triggerFileDownload } from "@/app/components/course-planning/utils";
import { escapeCsvValue } from "@/lib/course-tasks-view-csv";

/** Bounded concurrency for the read-back that builds the generation context
 * (one getGradableAction/getPageAction call per selected live item) - a pure
 * read, so this can run a little more aggressively than the apply fan-out
 * below, but still bounded rather than a bare Promise.all (this hook's own
 * version of the C7 fix bulkRubricGenerateSummary.ts's own header documents
 * for the identical shape of read). */
const COMMAND_CONTEXT_READ_CONCURRENCY = 6;

/** Bounded concurrency for the apply fan-out (G12).
 *
 * VERIFICATION-PASS FIX (defect 1): the comment this replaced claimed each
 * row cost Canvas "at least one read plus one write" because
 * command-interface.ts's applyItemRow used to call `listModules` - itself one
 * Canvas request PER MODULE, fired concurrently - on every single row, purely
 * to recover an item's type/contentId/pageUrl. That was the false premise
 * behind the storm: a 10-row apply against a 15-module course could peak near
 * 64 concurrent, unthrottled Canvas reads, none of which went through the
 * retry-throttle wrapper. This hook now resolves that data itself, once, from
 * the module tree the browser already holds (`itemRefById` below), and passes
 * it as `itemRef` on every apply call - so the action no longer re-reads the
 * course per row.
 *
 * The real per-row cost, post-fix: a "create module" row is one Canvas call
 * (the create). A "modify module" row is one call (the rename). A "modify
 * item" row is one write, PLUS - only for Assignment/Quiz/Discussion, whose
 * pre-image this app must capture per G1 - one read immediately before it (a
 * Page's write still needs one `getPage` call for its numeric page id, per
 * G5, so it is likewise two calls, never more). So every row costs at most
 * TWO Canvas calls, never a course-wide fan-out. At this concurrency that is
 * at most 8 calls in flight, comfortably under the ~12-concurrent point
 * Canvas's leaky bucket starts returning 403 "Rate Limit Exceeded" at - so 4
 * remains the right number post-fix, for a materially different reason than
 * the comment it replaces gave. */
const COMMAND_APPLY_CONCURRENCY = 4;

function isGradableKind(t: string): t is GradableKind {
  return t === "Assignment" || t === "Quiz" || t === "Discussion";
}

/** Everything `applyCommandProposalRowAction` needs to address an item's
 * write WITHOUT re-reading the course - resolved once per proposal, from the
 * module tree this hook's `modules` parameter already holds, and carried
 * alongside the proposal as `itemRefById` (defect 1's fix; see this file's
 * header and `COMMAND_APPLY_CONCURRENCY`'s own comment above). Passed
 * verbatim as the `itemRef` argument on every apply call for an item row. */
export interface CommandItemApplyRef {
  itemType: string;
  contentId: number | null;
  pageUrl: string | null;
  /** G11's New Quiz flag, resolved ONCE PER PROPOSAL by
   * `resolveNewQuizFlagsClient` below (the client-side counterpart of
   * rubric-bulk.ts's `resolveNewQuizFlags`) - never per row. `null` means
   * unresolved (the item is not an Assignment, or the one course-level fetch
   * failed) and is handled by the callee as "unknown, treat as ordinary" per
   * command-write-support.ts's own documented contract. */
  isNewQuiz: boolean | null;
}

// ---------------------------------------------------------------------------
// Pure helpers - exported for direct, renderer-free unit testing (this
// repo's vitest is node-env and never renders a component).

/**
 * C8-style predicate (see useCarryModulePattern.ts's isCarryReviewVisible for
 * the precedent this copies): the ONE fact that licenses showing the review
 * modal at all, and, via ModulesView.tsx's own `commandProposalOpen` bulk-bar
 * fact, the ONE fact that raises the "commandInterface" group's tier to
 * fan-out-write (G7). `reviewOpen` alone is not this fact: a selection change
 * mid-generate cannot null `proposal` the way a re-seeded template can null
 * `plan` in the carry-pattern hook (nothing here re-derives the proposal from
 * the live selection), but `proposal` still starts `null` before the first
 * generate resolves, and this predicate is what keeps the modal (and the
 * bar's fan-out-write tier) from claiming the write is reachable before that
 * first generate lands.
 */
export function isCommandReviewVisible(reviewOpen: boolean, proposal: unknown): boolean {
  return reviewOpen && proposal != null;
}

/** G1: whether Canvas can undo this row's write on its own, re-verified
 * against Canvas source (section 10's G1 table) rather than the earlier,
 * wrong "no undo in Canvas" claim. `"not-applicable"` covers every row this
 * hook never sends to Canvas at all (unsupported / already-present). A
 * created module and a renamed module are both `"no-reachable-undo"`:
 * `undelete` restores a DELETED module, which is not a rollback of a rename,
 * and a brand-new module has nothing to roll back to. */
export type CommandRowRevertibility = "page-history" | "no-reachable-undo" | "not-applicable";

export function describeRowRevertibility(row: CommandProposalRow, itemTypeById: Record<number, string>): CommandRowRevertibility {
  if (row.decision !== "modify" && row.decision !== "create") return "not-applicable";
  if (row.target === null || row.target.kind === "module") return "no-reachable-undo";
  const itemType = itemTypeById[row.target.id];
  return itemType === "Page" ? "page-history" : "no-reachable-undo";
}

/** G13b: the exact bytes `applyCommandProposalRowAction` will actually send -
 * `plainTextToPageHtml` for a "description" row (mirrors both
 * `updateGradable`'s and `updatePage`'s own plain-text-to-HTML transform
 * byte-for-byte, per this file's own header); a trimmed value for a
 * "moduleName" row, because `updateModule` (modules.ts:88) sends
 * `fields.name.trim()`, not the raw string - VERIFICATION-PASS FIX (defect
 * 10): this function used to return `proposedValue` unchanged for
 * "moduleName" too, so a proposed module name with surrounding whitespace
 * previewed differently from what Canvas actually received; the raw value
 * unchanged only for "title" (Canvas receives that one verbatim). `null` only
 * when the row proposes nothing (an unsupported/already-present row with no
 * proposedValue). This remains the single function that feeds both the
 * preview and anything else that displays what will be sent - nothing else
 * in this file or CommandProposalModal.tsx re-derives these bytes. */
export function exactBytesForRow(row: CommandProposalRow): string | null {
  if (row.proposedValue === null) return null;
  if (row.field === "description") return plainTextToPageHtml(row.proposedValue);
  if (row.field === "moduleName") return row.proposedValue.trim();
  return row.proposedValue;
}

function isSuccessfulOutcome(outcome: CommandApplyOutcome | null): boolean {
  if (!outcome) return false;
  return outcome.status === "module-updated" || outcome.status === "module-created" || outcome.status === "item-updated";
}

/** One row of the review modal - `proposal.rows[index]` plus everything the
 * modal needs to render it that this hook has already computed, so the modal
 * itself recomputes nothing (per this chunk's brief: "the modal is a THIN
 * RENDERER"). `index` is stable for the life of one proposal and is the key
 * both `optedOut` and `outcomes` are keyed by. */
export interface CommandReviewRow {
  index: number;
  row: CommandProposalRow;
  /** G14: true when this row's target dropped out of the CURRENT selection
   * since the proposal was generated - never applied, regardless of
   * `optedOut`. */
  dropped: boolean;
  optedOut: boolean;
  revertibility: CommandRowRevertibility;
  exactBytes: string | null;
  outcome: CommandApplyOutcome | null;
}

/**
 * Collapse a proposal, its live reconciliation, and this hook's own
 * opt-out/outcome state into one row per `proposal.rows` entry - the single
 * function both the review modal's list AND `selectRowsToApply` (below) read,
 * so "what the modal shows" and "what Apply actually sends" can never drift
 * apart from each other. `itemRefById` is the fuller map defect 1 introduced
 * (also feeding `itemRef` on every apply call); a plain `{id: itemType}` view
 * is derived from it here so `describeRowRevertibility` keeps its own,
 * narrower signature.
 */
export function buildCommandReviewRows(
  proposal: CommandProposal,
  reconciliation: CommandProposalReconciliation,
  optedOut: Set<number>,
  itemRefById: Record<number, CommandItemApplyRef>,
  outcomes: Record<number, CommandApplyOutcome>
): CommandReviewRow[] {
  const droppedRows = new Set(reconciliation.droppedRows);
  const itemTypeById: Record<number, string> = {};
  for (const id of Object.keys(itemRefById)) itemTypeById[Number(id)] = itemRefById[Number(id)].itemType;
  return proposal.rows.map((row, index) => ({
    index,
    row,
    dropped: droppedRows.has(row),
    optedOut: optedOut.has(index),
    revertibility: describeRowRevertibility(row, itemTypeById),
    exactBytes: exactBytesForRow(row),
    outcome: outcomes[index] ?? null,
  }));
}

/**
 * AC6 + G14 combined: the rows a click of Apply actually fans out over - a
 * "modify"/"create" decision (the only two decisions this app ever writes;
 * "unsupported"/"already-present" rows are display-only), not dropped by the
 * live reconciliation, not opted out, and not already landed as a success
 * within this proposal session (the client-side half of AC6's weak
 * idempotency - see this file's own header for why that half cannot live in
 * command-interface.ts).
 */
export function selectRowsToApply(reviewRows: CommandReviewRow[]): CommandReviewRow[] {
  return reviewRows.filter(
    (r) => (r.row.decision === "modify" || r.row.decision === "create") && !r.dropped && !r.optedOut && !isSuccessfulOutcome(r.outcome)
  );
}

/** Summarize one Apply run's outcomes into a note, mirroring
 * describeCarryApplyOutcome's shape (useCarryModulePattern.ts) for this
 * feature's own, smaller outcome vocabulary (G9: a proposal's apply outcomes
 * are this file's own vocabulary, not ModuleContentResult's). */
export function describeCommandApplyOutcome(outcomes: CommandApplyOutcome[], droppedCount: number): { kind: "success" | "error"; text: string } {
  const succeeded = outcomes.filter(isSuccessfulOutcome).length;
  const failed = outcomes.length - succeeded;
  const parts = [`${succeeded} row${succeeded === 1 ? "" : "s"} applied`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (droppedCount > 0) parts.push(`${droppedCount} dropped because the selection changed`);
  return { kind: failed > 0 ? "error" : "success", text: parts.join(", ") + "." };
}

// ---------------------------------------------------------------------------
// VERIFICATION-PASS ADDITION (defect 8): recovering the pre-image G1
// requires this app to keep. `outcomes` (useState below) is still wiped by
// the next "Review proposal" click and does not survive a reload - this
// section does not change that - but it gives the instructor a way to get
// every landed row's result, and every no-reachable-undo row's pre-image,
// out of the browser before that happens: a CSV or JSON download, built the
// same way Repo Grades' activity log solves the identical "the write has no
// undo and no audit table" problem (repoGradesLog.ts / RepoGradesLogPanel.tsx
// - read in full before this was written). `escapeCsvValue` and
// `triggerFileDownload` are reused directly, not re-implemented.
// ---------------------------------------------------------------------------

/** One landed row, flattened for export. Only rows that actually reached
 * Canvas (an outcome of "module-updated"/"module-created"/"item-updated") are
 * included - a refused, not-found, write-failed, or never-applied row has no
 * pre-image to recover, so it would only pad the file. */
export interface CommandAppliedLogEntry {
  targetKind: "module" | "item";
  targetName: string;
  field: string;
  /** For an item-updated row of a no-reachable-undo kind (Assignment, Quiz,
   * Discussion), this is `outcome.preImage` - the value read immediately
   * before the write, per G1 the only undo those types will ever have. For
   * every other landed row (a Page, a module rename/create), this falls back
   * to the proposal's own `currentValue` (the value read while building the
   * proposal) - still informative, even though a Page's real undo is
   * Canvas's own revision history and a created module has no prior value at
   * all (rendered "" for a create). */
  previousValue: string;
  /** The exact bytes this app sent (`exactBytesForRow`, defect 10's fix) -
   * for a "module-created" row, the created module's own name, since a
   * create row's `proposedValue` may have been superseded by
   * `already-present` dedupe logic upstream by the time it reached here. */
  appliedValue: string;
  outcomeStatus: CommandApplyOutcome["status"];
}

const LANDED_STATUSES: ReadonlySet<CommandApplyOutcome["status"]> = new Set(["module-updated", "module-created", "item-updated"]);

/** Pure: builds the export rows from what the modal already renders
 * (`CommandReviewRow`), so "what downloads" can never show a pre-image the
 * instructor never saw on screen. */
export function buildCommandAppliedLog(reviewRows: CommandReviewRow[]): CommandAppliedLogEntry[] {
  const entries: CommandAppliedLogEntry[] = [];
  for (const r of reviewRows) {
    const outcome = r.outcome;
    if (!outcome || !LANDED_STATUSES.has(outcome.status)) continue;
    const targetKind: "module" | "item" = r.row.target?.kind ?? "module";
    const targetName =
      r.row.target?.displayName ?? (outcome.status === "module-created" ? outcome.newModuleName : r.row.proposedValue ?? "");
    const previousValue = outcome.status === "item-updated" ? (outcome.preImage ?? r.row.currentValue ?? "") : (r.row.currentValue ?? "");
    entries.push({
      targetKind,
      targetName,
      field: r.row.field ?? "",
      previousValue,
      appliedValue: r.exactBytes ?? "",
      outcomeStatus: outcome.status,
    });
  }
  return entries;
}

const COMMAND_APPLIED_LOG_CSV_HEADER = ["Target kind", "Target", "Field", "Previous value", "Applied value", "Outcome"];

/** One header row then one row per entry, matching formatRepoGradeLogCsv's
 * own shape and separator (`\r\n`), through the same `escapeCsvValue`. */
export function formatCommandAppliedLogCsv(entries: CommandAppliedLogEntry[]): string {
  const rows = [COMMAND_APPLIED_LOG_CSV_HEADER.map(escapeCsvValue).join(",")];
  for (const e of entries) {
    rows.push([e.targetKind, e.targetName, e.field, e.previousValue, e.appliedValue, e.outcomeStatus].map(escapeCsvValue).join(","));
  }
  return rows.join("\r\n");
}

/** An OBJECT, never a bare array, matching formatRepoGradeLogJson's own
 * rationale: a later field (a schema version) can be added without breaking
 * anything already parsing an exported file. */
export function formatCommandAppliedLogJson(entries: CommandAppliedLogEntry[], meta: { exportedAt: string; courseUrl: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, courseUrl: meta.courseUrl, entryCount: entries.length, entries }, null, 2);
}

/** "2026-08-24T15:04:05.123Z" -> "20260824-150405", matching
 * repoGradesLog.ts's own fileStamp (colons/dots are not safe in a Windows
 * filename). Restated rather than imported: repoGradesLog.ts is a
 * repo-grades-specific module this file has no reason to depend on for one
 * private helper. */
function commandAppliedLogFileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** `command-proposal-log-<YYYYMMDD-HHMMSS>.<ext>`. */
export function commandAppliedLogFileName(atIso: string, extension: string): string {
  return `command-proposal-log-${commandAppliedLogFileStamp(atIso)}.${extension}`;
}

/** VERIFICATION-PASS ADDITION (defect 1, the isNewQuiz half): resolve G11's
 * New Quiz flag in ONE course-level fetch, not per row - the client-side
 * counterpart of `resolveNewQuizFlags` (rubric-bulk.ts:357), reusing the
 * already-exposed `listBulkItemsAction` (canvas-files-bulk.ts) rather than a
 * new server action, since it already returns `BulkItem.isNewQuiz` for every
 * course Assignment and is already reachable from this client hook (this
 * file already imports two sibling actions from the same module). Skipped
 * entirely when nothing selected is an Assignment - a New Quiz only ever
 * masquerades as one (G11), so nothing else could possibly need this fetch.
 * On failure, returns an empty map: every Assignment then resolves to
 * `isNewQuiz: null` - "unknown, treat as ordinary"
 * (command-write-support.ts's own documented default) - rather than blocking
 * the whole proposal on one Canvas hiccup. */
async function resolveNewQuizFlagsClient(
  courseUrl: string,
  acronym: string | undefined,
  liveItems: Array<{ item: CanvasModuleItem; moduleId: number }>
): Promise<Map<number, boolean>> {
  const needsCheck = liveItems.some(({ item }) => item.type === "Assignment" && item.contentId != null);
  if (!needsCheck) return new Map();

  const result = await listBulkItemsAction(courseUrl, "Assignment", acronym);
  if ("error" in result) return new Map();

  const map = new Map<number, boolean>();
  for (const bulkItem of result.items) {
    const contentId = Number(bulkItem.id);
    if (Number.isFinite(contentId)) map.set(contentId, bulkItem.isNewQuiz === true);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Context building - the one piece of I/O this hook performs before calling
// the model (AC3's "a proposal must show the current value to be reviewable"
// - description/body is read back here, not left null, whenever this app has
// a read path for the item's kind).

async function buildProposalContext(
  courseUrl: string,
  acronym: string | undefined,
  modules: CanvasModule[],
  liveModuleIds: Set<number>,
  liveItems: Array<{ item: CanvasModuleItem; moduleId: number }>,
  newQuizByContentId: Map<number, boolean>
): Promise<{ context: CommandProposalContext; itemRefById: Record<number, CommandItemApplyRef> }> {
  const moduleInfos: CommandProposalModuleInfo[] = [];
  for (const mod of modules) {
    if (!liveModuleIds.has(mod.id)) continue;
    moduleInfos.push({ id: mod.id, name: mod.name, selectionKey: liveModuleKey(mod.id) });
  }

  const itemRefById: Record<number, CommandItemApplyRef> = {};
  const itemInfos = await mapWithConcurrency(liveItems, COMMAND_CONTEXT_READ_CONCURRENCY, async ({ item, moduleId }) => {
    const isNewQuiz = item.type === "Assignment" && item.contentId != null ? newQuizByContentId.get(item.contentId) ?? null : null;
    itemRefById[item.id] = { itemType: item.type, contentId: item.contentId, pageUrl: item.pageUrl, isNewQuiz };
    let description: string | null = null;
    if (isGradableKind(item.type) && item.contentId != null) {
      const r = await getGradableAction(courseUrl, item.type, item.contentId, acronym);
      if (!("error" in r)) description = r.detail.description;
    } else if (item.type === "Page" && item.pageUrl) {
      const r = await getPageAction(courseUrl, item.pageUrl, acronym);
      if (!("error" in r)) description = r.page.body;
    }
    const info: CommandProposalItemInfo = {
      id: item.id,
      itemType: item.type,
      contentId: item.contentId,
      title: item.title,
      description,
      selectionKey: itemKey(moduleId, item.id),
      // Threaded per the dispatch brief ("thread it into the context you
      // build"). NOTE: CommandProposalItemInfo (command-proposal.ts, a
      // sibling agent's file, out of this file's scope) is gaining this field
      // in the same wave - if that edit has not landed yet, this line is a
      // known, expected mid-wave type error (excess property), not a defect
      // in this file.
      isNewQuiz,
    };
    return info;
  });

  return { context: { modules: moduleInfos, items: itemInfos }, itemRefById };
}

// ---------------------------------------------------------------------------
// The hook

export interface UseCommandInterfaceReturn {
  // The bar's own controls (commandBox, commandReview).
  commandText: string;
  setCommandText: (v: string) => void;
  generateBusy: boolean;
  onReviewCommand: () => void;

  // The review modal (rendered at ModulesView root, same as carryModulePattern).
  reviewOpen: boolean;
  /** See `isCommandReviewVisible`'s own doc comment above - the single fact
   * ModulesView.tsx's `commandProposalOpen` bulk-bar fact AND
   * ModulesViewSecondaryModals.tsx's modal mount gate must both read. */
  reviewVisible: boolean;
  closeReview: () => void;
  proposal: CommandProposal | null;
  reconciliation: CommandProposalReconciliation | null;
  reviewRows: CommandReviewRow[];
  onToggleOptOut: (index: number) => void;
  applyBusy: boolean;
  onApplyCommand: () => void;
  /** Defect 8: how many landed rows `onDownloadAppliedLog` would export right
   * now - the modal reads this to disable the download controls rather than
   * recomputing `buildCommandAppliedLog(reviewRows)` itself (the modal stays
   * a thin renderer). */
  appliedLogCount: number;
  onDownloadAppliedLog: (format: "csv" | "json") => void;
}

export function useCommandInterface(
  courseUrl: string,
  acronym: string | undefined,
  provider: LlmProvider,
  modules: CanvasModule[],
  /** `selection.selectedItems` (ModulesView.tsx) - a bulk hook receives the
   * raw selector and calls it itself, the same shape useBulkItemActions'
   * own signature already takes (reuse survey, section 9). */
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }>,
  /** `selection.selected` / `selection.selectedModules` - the raw key Sets,
   * live/export/repo alike, used ONLY to compute the selection signature a
   * generated proposal is pinned to and later reconciled against (G14). AC3
   * only grants write access to LIVE objects, so which objects actually
   * become context rows is filtered separately, from `selectedItems()`'s own
   * `source` field and `liveModuleIds` below - never from these two Sets
   * directly. */
  selected: Set<string>,
  selectedModules: Set<string>,
  liveModuleIds: Set<number>,
  setBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseCommandInterfaceReturn {
  const [commandText, setCommandText] = useState("");
  const [generateBusy, setGenerateBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [proposal, setProposal] = useState<CommandProposal | null>(null);
  // Defect 1 fix: was `itemTypeById: Record<number, string>`. Now carries
  // enough per-item data (contentId, pageUrl, isNewQuiz) to build the
  // `itemRef` this hook passes to applyCommandProposalRowAction, so the
  // action no longer needs to re-read the whole module tree per row - see
  // this file's header and COMMAND_APPLY_CONCURRENCY's own comment.
  const [itemRefById, setItemRefById] = useState<Record<number, CommandItemApplyRef>>({});
  const [optedOut, setOptedOut] = useState<Set<number>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<number, CommandApplyOutcome>>({});
  const [applyBusy, setApplyBusy] = useState(false);

  // G14: recomputed on every render from the LIVE selection, never cached -
  // a selection change while the review modal is open is reflected here
  // immediately, before Apply is ever clicked.
  const currentSelectionKeys = useMemo(() => [...selected, ...selectedModules], [selected, selectedModules]);
  const reconciliation = useMemo(
    () => (proposal ? reconcileCommandProposalWithSelection(proposal, currentSelectionKeys) : null),
    [proposal, currentSelectionKeys]
  );
  const reviewRows = useMemo(
    () => (proposal && reconciliation ? buildCommandReviewRows(proposal, reconciliation, optedOut, itemRefById, outcomes) : []),
    [proposal, reconciliation, optedOut, itemRefById, outcomes]
  );
  // Defect 8: recomputed from `reviewRows` alone, so the modal never has to
  // recompute it - see `onDownloadAppliedLog` below, the only other reader.
  const appliedLogEntries = useMemo(() => buildCommandAppliedLog(reviewRows), [reviewRows]);

  const reviewVisible = isCommandReviewVisible(reviewOpen, proposal);

  const onReviewCommand = () => {
    const liveItems = selectedItems()
      .filter((si) => si.source === "live")
      .map(({ item, moduleId }) => ({ item, moduleId }));
    if (liveItems.length === 0 && liveModuleIds.size === 0) {
      setNote({
        kind: "error",
        text: "Select at least one module or item this app can write to (a live Canvas selection) before submitting a command.",
      });
      return;
    }
    if (!commandText.trim()) {
      setNote({ kind: "error", text: "Type a command before generating a proposal." });
      return;
    }

    const generationSelectionKeys = [...selected, ...selectedModules];
    const command = commandText;

    void (async () => {
      setGenerateBusy(true);
      setNote(null);
      // Defect 1 (isNewQuiz half): one course-level fetch, not per row/per
      // item - see resolveNewQuizFlagsClient's own header.
      const newQuizByContentId = await resolveNewQuizFlagsClient(courseUrl, acronym, liveItems);
      const { context, itemRefById: nextItemRefById } = await buildProposalContext(
        courseUrl,
        acronym,
        modules,
        liveModuleIds,
        liveItems,
        newQuizByContentId
      );
      const result = await generateCommandProposalAction({ courseUrl, code: acronym, command, provider, context });
      setGenerateBusy(false);

      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }

      setProposal(buildCommandProposal(result.rawRows, context, generationSelectionKeys));
      setItemRefById(nextItemRefById);
      setOptedOut(new Set());
      setOutcomes({});
      setReviewOpen(true);
    })();
  };

  const closeReview = () => setReviewOpen(false);

  const onToggleOptOut = (index: number) => {
    setOptedOut((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const onApplyCommand = () => {
    if (!proposal || !reconciliation) return;
    const toApply = selectRowsToApply(reviewRows);
    if (toApply.length === 0) {
      setNote({
        kind: "success",
        text: "Nothing to apply - every row already landed, was opted out, or is no longer in the current selection.",
      });
      return;
    }

    void (async () => {
      setApplyBusy(true);
      setBusy(true);
      setNote(null);
      // G12: bounded fan-out, one applyCommandProposalRowAction invocation
      // per row, each marking its own outcome the instant it lands - never a
      // single call looping every row.
      //
      // Defect 1 fix: `itemRef` is resolved from `itemRefById` - the module
      // tree this hook already read while building the proposal's context -
      // and passed on every item row, so the action can address the write
      // directly instead of re-reading the whole course to recover it. Only
      // an item-targeted row has one; a module row's target IS the module
      // (no separate item lookup is needed), and a create-module row has no
      // target at all.
      const results = await mapWithConcurrency(toApply, COMMAND_APPLY_CONCURRENCY, async (reviewRow) => {
        const target = reviewRow.row.target;
        const itemRef = target && target.kind === "item" ? itemRefById[target.id] : undefined;
        const outcome = await applyCommandProposalRowAction({ courseUrl, code: acronym, row: reviewRow.row, itemRef });
        setOutcomes((prev) => ({ ...prev, [reviewRow.index]: outcome }));
        return outcome;
      });
      setApplyBusy(false);
      setBusy(false);
      setNote(describeCommandApplyOutcome(results, reconciliation.droppedRows.length));
      // Deliberately does NOT close the review modal (unlike
      // useCarryModulePattern's onApply) - G12's "rewrote 6 of 10 then
      // crashed" must be a state the instructor can SEE, and a re-apply means
      // "the four that did not land" (selectRowsToApply above), which only
      // makes sense while the modal with those rows' checkboxes is still
      // open.
      reload();
    })();
  };

  // Defect 8: the download the instructor uses to get a landed row's
  // pre-image out of the browser before the next "Review proposal" or a
  // reload wipes `outcomes`. Mirrors RepoGradesLogPanel's handleDownload:
  // the one clock read lives here, everything downstream (the filename
  // stamp, the JSON's exportedAt) takes it as a parameter and stays pure.
  const onDownloadAppliedLog = (format: "csv" | "json") => {
    if (appliedLogEntries.length === 0) {
      setNote({ kind: "error", text: "Nothing has been applied yet - there is no pre-image to download." });
      return;
    }
    const now = new Date().toISOString();
    const text =
      format === "csv" ? formatCommandAppliedLogCsv(appliedLogEntries) : formatCommandAppliedLogJson(appliedLogEntries, { exportedAt: now, courseUrl });
    const filename = commandAppliedLogFileName(now, format);
    const mimeType = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    triggerFileDownload(new Blob([text], { type: mimeType }), filename);
    setNote({
      kind: "success",
      text: `Downloaded ${appliedLogEntries.length} applied row${appliedLogEntries.length === 1 ? "" : "s"} as ${filename}.`,
    });
  };

  return {
    commandText,
    setCommandText,
    generateBusy,
    onReviewCommand,
    reviewOpen,
    reviewVisible,
    closeReview,
    proposal,
    reconciliation,
    reviewRows,
    onToggleOptOut,
    applyBusy,
    onApplyCommand,
    appliedLogCount: appliedLogEntries.length,
    onDownloadAppliedLog,
  };
}
