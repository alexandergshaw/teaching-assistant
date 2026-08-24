// The proposal model for the bulk-bar command box
// (docs/llm-command-interface-acceptance-criteria.md - section 10 is the
// FINAL CONTRACT; this file's brief is the row shape, G10's allowlist
// classifier, G11's kind guard, G8's module-create dedupe, and G14's
// stale-selection reconciliation).
//
// PURE: no React, no I/O, no Date, no randomness. This file never calls an
// LLM and never calls Canvas - it turns the model's ALREADY-PARSED structured
// reply (see llm-json.ts for getting there) into a reviewable proposal, and
// separately turns an applied/stale proposal plus a live selection into
// "still applicable" vs "dropped".
//
// -------------------------------------------------------------------------
// G10 - THE MOST IMPORTANT THING IN THIS FILE.
// -------------------------------------------------------------------------
// AC9 ("the box is never parsed") and AC3b ("out-of-scope fields are named,
// not silently dropped") cannot both be true if the classifier reads the
// instructor's free text, because then the model alone would decide what it
// may change AND self-report its own violations. The resolution, per G10:
// the classifier is a PURE ALLOWLIST OVER THE MODEL'S STRUCTURED OUTPUT, not
// over the instructor's text. `classifyCommandProposalRows` below is that
// allowlist. Every raw "modify" row names a field; `canonicalizeField` maps
// only the three names AC3 actually grants write access to -
// {title, description|body, moduleName} - to a canonical value, and returns
// null for anything else (points, dueDate, submissionType, rubric, published,
// or any other string a model might invent). A null canonical field makes
// the row UNSUPPORTED, by code, before it becomes a proposal row a UI could
// render as if it were actionable - and the row keeps the EXACT raw field
// string the model sent, unmodified, specifically so the rejection can name
// it (`row.reason` includes it verbatim). AC9 stays intact: nothing here
// looks at the instructor's textbox, only at what the model returned.
//
// G11 - ITEM KIND GUARD.
// -------------------------------------------------------------------------
// A module holds eight item kinds; AC3 names four (Assignment/Quiz/
// Discussion/Page). `isCarryWriteSupportedKind` (module-pattern-plan.ts:346)
// already states, per kind, whether any write path this app has wired can
// touch it - re-exported there for exactly this "what can this app write"
// question, not re-spelled here. A "modify" row whose target item's kind
// fails that predicate is rejected UNSUPPORTED, naming the kind, the same way
// a rejected field is. (New Quiz detection - `isNewQuiz` lives on `BulkItem`,
// which the Modules-view selection this feature reads from does not carry -
// is explicitly OUT of this file's scope per G11's own text: it is a
// selection-resolution question for the caller that builds
// `CommandProposalContext.items`, not a classification question this pure
// function can answer from an item's kind string alone.)
//
// G8 - MODULE CREATION IS A DEDUPE RULE, NOT `planBulkModuleCreation`.
// -------------------------------------------------------------------------
// `planBulkModuleCreation` (bulk-module-plan.ts:151) expands a `{x}` template
// over a contiguous numeric range - it cannot express "create a module called
// Ethics in AI and one called Final Project Workshop", which is what a
// free-text command yields. What IS reused is the RULE: a `Map` keyed on
// `name.trim().toLowerCase()` over the existing modules, exactly as
// steps.lms-modules.ts:92 and bulk-module-plan.ts:176-194 both already do
// (`already-present` / `create` are those two files' own vocabulary,
// deliberately restated identically here rather than invented fresh).
// `composeModuleTitle` (module-title.ts:140) is NOT called: it REQUIRES a
// week number, and a module a command invents has none. Per G8's own
// resolution of that gap ("either the command yields a week per created
// module... or titles pass through un-composed and this document says so"):
// titles pass through UN-COMPOSED. A caller wanting week-numbered titles
// must have the model emit the final name directly.
//
// G9 - WHY THIS FILE HAS ITS OWN VOCABULARY.
// -------------------------------------------------------------------------
// `ModuleContentResult` / `describeOrphans` describe what happened AFTER
// Canvas was called; a proposal is a recommendation BEFORE Canvas has been
// touched (module-pattern-plan.ts:52-70 already settled this exact question
// for the sibling carry-forward feature, and G9 restates it for this one:
// `describeOrphans` additionally cannot be imported here at all, because it
// lives in a "use client" hook). `CommandProposalDecision` below
// ("modify" | "create" | "already-present" | "unsupported") is this file's
// own set, mirroring `ModulePatternPlan`'s per-row decision/reason SHAPE
// (module-pattern-plan.ts:191, 207-247) without reusing its type, exactly as
// section 9's reuse survey asks.
//
// G14 - STALE SELECTION.
// -------------------------------------------------------------------------
// A proposal contains MODEL OUTPUT keyed to specific object ids; unlike
// `useCarryModulePattern`'s plan (re-derived via `useMemo` on every selection
// change), it cannot be recomputed without a new model call. This file pins a
// proposal to a `selectionSignature` at generation time
// (`buildCommandProposal`) and, on apply, intersects the proposal's rows
// against the CURRENT selection (`reconcileCommandProposalWithSelection`),
// reporting which rows are still applicable and which were dropped, rather
// than either silently applying a proposal built for a different selection or
// refusing outright. `selectionSignature` / the arming-signature idea are
// REUSED from
// src/app/components/content-tab/modules/confirmArming.ts, not restated:
// that file is plain functions with no React import and no "use client"
// directive, and a lib file already imports a sibling pure helper from
// `@/app/components/content-tab` (repo-module-mapping.ts:119 imports
// `matchTokens` from `content-tab/utils`) - so importing it from here is
// confirmed importable, not a new pattern. `CommandProposalTarget.selectionKey`
// is the per-row key this reconciliation checks membership against; a
// "create module" row carries no target and therefore cannot go stale by
// selection drift (see `reconcileCommandProposalWithSelection`'s own
// comment) - it is not keyed to anything in the selection to begin with.

import { isCarryWriteSupportedKind } from "./module-pattern-plan";
import { selectionSignature } from "@/app/components/content-tab/modules/confirmArming";

/** The three outcomes a row can land on, plus "already-present" for G8's
 * module-creation dedupe - deliberately distinct from `ModulePatternPlan`'s
 * four-value set (see this file's header, G9). */
export type CommandProposalDecision = "modify" | "create" | "already-present" | "unsupported";

export type CommandProposalTargetKind = "module" | "item";

/** The only three field names AC3 grants write access to, canonicalized -
 * "body" collapses onto "description" (AC3's own "description|body"), never
 * the other way. Nothing else is ever assigned this type; see
 * `canonicalizeField`. */
export type CommandProposalField = "title" | "description" | "moduleName";

/** An existing Canvas object a row is about. Absent (`null`, on the row
 * itself) only for a "create module" row, which names no existing object.
 * `selectionKey` is caller-supplied and carries the exact key the object was
 * selected under (matches `useModuleSelection`'s `live:`/`export:`/`repo:`
 * discriminated key shape) - G14's reconciliation compares against it, this
 * file never constructs one itself. */
export interface CommandProposalTarget {
  kind: CommandProposalTargetKind;
  id: number;
  displayName: string;
  selectionKey: string;
}

/** One row of the proposal. `field` is the RAW field name for an
 * "unsupported" row rejected for its field (so the rejection names it
 * verbatim, per G10) and the CANONICAL field name for every other row.
 * `currentValue` / `proposedValue` are both null only when nothing
 * meaningful can be shown (an unsupported row whose target could not even be
 * resolved). */
export interface CommandProposalRow {
  target: CommandProposalTarget | null;
  field: string | null;
  currentValue: string | null;
  proposedValue: string | null;
  decision: CommandProposalDecision;
  /** Non-null iff `decision` is "unsupported" or "already-present" - prose
   * naming WHY, for display only. Never branch on this string; branch on
   * `decision` (and, for "unsupported", on which of `target`/`field` is the
   * one that failed to resolve, both of which this file always sets
   * consistently with the reason). */
  reason: string | null;
}

/** One existing module the classifier can match a "modify" or "create
 * module" row against. */
export interface CommandProposalModuleInfo {
  id: number;
  name: string;
  selectionKey: string;
}

/** One existing item the classifier can match a "modify" row against.
 * `description` is the CURRENTLY KNOWN value, if the caller already read it
 * (AC3's `getGradable`/`getPage`) - null when not read, which this file
 * treats as "unknown", never as "empty"; it is passed straight through to
 * `currentValue` either way. `contentId` matches
 * `isCarryWriteSupportedKind`'s second parameter exactly (null for a File
 * with no linked content). */
export interface CommandProposalItemInfo {
  id: number;
  itemType: string;
  contentId: number | null;
  title: string;
  description: string | null;
  selectionKey: string;
}

export interface CommandProposalContext {
  modules: CommandProposalModuleInfo[];
  items: CommandProposalItemInfo[];
}

/** One "modify" instruction in the model's structured reply: change one
 * field of one already-selected object. Untrusted - `targetId` may not
 * resolve, `field` may not be one this app can write, `proposedValue` may be
 * of the wrong shape entirely (JSON.parse only proves it parsed, not that it
 * matches this shape) - `classifyCommandProposalRows` is the validation
 * boundary for all of it. */
export interface RawCommandProposalModifyRow {
  kind: "modify";
  targetKind: CommandProposalTargetKind;
  targetId: number;
  field: string;
  proposedValue: string;
}

/** One "create a module" instruction in the model's structured reply -
 * AC3c/AC3d: creates the module only, never populates it. */
export interface RawCommandProposalCreateModuleRow {
  kind: "create-module";
  moduleName: string;
}

export type RawCommandProposalRow = RawCommandProposalModifyRow | RawCommandProposalCreateModuleRow;

/** A generated proposal, pinned to the selection it was generated against
 * (G14). `rows` is exactly what `classifyCommandProposalRows` returned. */
export interface CommandProposal {
  rows: CommandProposalRow[];
  selectionSignature: string;
}

/** G10: map the model's raw field string onto the one AC3 allowlist this app
 * has write access for, or null for anything else. Case- and
 * whitespace-insensitive so a model that answers "Title" or " body " is not
 * rejected on formatting alone - the ALLOWED SET is still exactly the three
 * names AC3 grants, nothing wider. */
function canonicalizeField(rawField: string): CommandProposalField | null {
  const normalized = rawField.trim().toLowerCase();
  if (normalized === "title") return "title";
  if (normalized === "description" || normalized === "body") return "description";
  if (normalized === "modulename") return "moduleName";
  return null;
}

/** A module's own field is named by the shipped write path
 * (`updateModuleAction` - a module has a name, not a title/description); an
 * item's fields are named by AC3's other two. A field valid for the WRONG
 * target kind (e.g. "moduleName" naming an item, or "title" naming a module)
 * is exactly as unwritable as a field outside the allowlist entirely, and is
 * rejected the same way. */
function isFieldValidForTargetKind(targetKind: CommandProposalTargetKind, field: CommandProposalField): boolean {
  if (targetKind === "module") return field === "moduleName";
  return field === "title" || field === "description";
}

function unsupportedRow(target: CommandProposalTarget | null, field: string | null, reason: string): CommandProposalRow {
  return { target, field, currentValue: null, proposedValue: null, decision: "unsupported", reason };
}

function classifyModifyRow(row: RawCommandProposalModifyRow, context: CommandProposalContext): CommandProposalRow {
  const canonical = canonicalizeField(row.field);
  if (canonical === null) {
    // G10's central case: a field outside {title, description|body,
    // moduleName}. The raw string is kept verbatim in `field` so the reason
    // names exactly what the model asked for, not a normalized guess at it.
    return unsupportedRow(
      null,
      row.field,
      `The field "${row.field}" is not one this app can write (allowed: title, description, moduleName).`
    );
  }

  if (row.targetKind === "module") {
    const targetModule = context.modules.find((m) => m.id === row.targetId);
    if (!targetModule) {
      return unsupportedRow(null, canonical, `No selected module with id ${row.targetId} was found.`);
    }
    const target: CommandProposalTarget = { kind: "module", id: targetModule.id, displayName: targetModule.name, selectionKey: targetModule.selectionKey };
    if (!isFieldValidForTargetKind("module", canonical)) {
      return unsupportedRow(target, canonical, `The field "${canonical}" cannot be applied to a module.`);
    }
    return {
      target,
      field: canonical,
      currentValue: targetModule.name,
      proposedValue: row.proposedValue,
      decision: "modify",
      reason: null,
    };
  }

  // targetKind === "item"
  const item = context.items.find((i) => i.id === row.targetId);
  if (!item) {
    return unsupportedRow(null, canonical, `No selected item with id ${row.targetId} was found.`);
  }
  const target: CommandProposalTarget = { kind: "item", id: item.id, displayName: item.title, selectionKey: item.selectionKey };
  if (!isFieldValidForTargetKind("item", canonical)) {
    return unsupportedRow(target, canonical, `The field "${canonical}" cannot be applied to an item.`);
  }
  // G11: the kind guard, reusing isCarryWriteSupportedKind rather than
  // re-spelling it.
  if (!isCarryWriteSupportedKind(item.itemType, item.contentId)) {
    return unsupportedRow(target, canonical, `Items of kind "${item.itemType}" cannot be written by this app.`);
  }

  const currentValue = canonical === "title" ? item.title : item.description;
  return {
    target,
    field: canonical,
    currentValue,
    proposedValue: row.proposedValue,
    decision: "modify",
    reason: null,
  };
}

function classifyCreateModuleRow(row: RawCommandProposalCreateModuleRow, byNormalizedName: Map<string, CommandProposalModuleInfo>): CommandProposalRow {
  const trimmedName = row.moduleName.trim();
  if (!trimmedName) {
    return unsupportedRow(null, "moduleName", "A created module needs a non-empty name.");
  }

  // G8: the steps.lms-modules.ts:92 / bulk-module-plan.ts dedupe rule,
  // restated identically - Canvas offers no idempotency key for module
  // creation, so a case/trim-insensitive name match against the existing
  // modules is the only defense against a re-applied proposal duplicating
  // every module it already created.
  const existing = byNormalizedName.get(trimmedName.toLowerCase());
  if (existing) {
    const target: CommandProposalTarget = { kind: "module", id: existing.id, displayName: existing.name, selectionKey: existing.selectionKey };
    return {
      target,
      field: "moduleName",
      currentValue: existing.name,
      proposedValue: trimmedName,
      decision: "already-present",
      reason: `A module named "${existing.name}" already exists; this row will not create a duplicate.`,
    };
  }

  // No existing target yet - `composeModuleTitle` is deliberately NOT called
  // here (see this file's header, G8): the name passes through un-composed.
  return {
    target: null,
    field: "moduleName",
    currentValue: null,
    proposedValue: trimmedName,
    decision: "create",
    reason: null,
  };
}

/**
 * G10's allowlist classifier: turn the model's raw structured rows into
 * reviewable proposal rows. Every row is independently classified - one
 * malformed or forbidden row never drops another row from the proposal, the
 * same per-object-failure-is-per-object discipline `ModulePatternPlan` and
 * `ModuleContentResult` both already use.
 */
export function classifyCommandProposalRows(rawRows: RawCommandProposalRow[], context: CommandProposalContext): CommandProposalRow[] {
  const byNormalizedName = new Map<string, CommandProposalModuleInfo>();
  for (const candidateModule of context.modules) {
    byNormalizedName.set(candidateModule.name.trim().toLowerCase(), candidateModule);
  }

  return rawRows.map((row) => (row.kind === "modify" ? classifyModifyRow(row, context) : classifyCreateModuleRow(row, byNormalizedName)));
}

/**
 * Classify `rawRows` and pin the result to `currentSelectionKeys`'s
 * signature (G14) - the pairing a caller applies against later via
 * `reconcileCommandProposalWithSelection`.
 */
export function buildCommandProposal(
  rawRows: RawCommandProposalRow[],
  context: CommandProposalContext,
  currentSelectionKeys: Iterable<string | number>
): CommandProposal {
  return {
    rows: classifyCommandProposalRows(rawRows, context),
    selectionSignature: selectionSignature(currentSelectionKeys),
  };
}

export interface CommandProposalReconciliation {
  applicableRows: CommandProposalRow[];
  droppedRows: CommandProposalRow[];
  /** True iff `currentSelectionKeys`'s signature no longer matches the one
   * the proposal was generated against - informational: even when true,
   * `droppedRows` may still be empty (every row's target happened to remain
   * selected, or every row is target-less). */
  selectionChanged: boolean;
}

/**
 * G14: intersect a (possibly stale) proposal against the CURRENT selection.
 * A row whose `target` is still present in `currentSelectionKeys` (by
 * `selectionKey`) is applicable; a row whose target dropped out of the
 * selection is reported dropped, never silently applied. A row with no
 * target (a "create module" row, `already-present` or `create`) references
 * nothing in the selection and is always applicable - selection drift cannot
 * make a module-creation instruction stale, because it was never keyed to a
 * selected object in the first place.
 */
export function reconcileCommandProposalWithSelection(
  proposal: CommandProposal,
  currentSelectionKeys: Iterable<string | number>
): CommandProposalReconciliation {
  const currentSignature = selectionSignature(currentSelectionKeys);
  if (currentSignature === proposal.selectionSignature) {
    return { applicableRows: proposal.rows, droppedRows: [], selectionChanged: false };
  }

  const currentKeys = new Set(Array.from(currentSelectionKeys, String));
  const applicableRows: CommandProposalRow[] = [];
  const droppedRows: CommandProposalRow[] = [];

  for (const row of proposal.rows) {
    if (row.target === null || currentKeys.has(row.target.selectionKey)) {
      applicableRows.push(row);
    } else {
      droppedRows.push(row);
    }
  }

  return { applicableRows, droppedRows, selectionChanged: true };
}
