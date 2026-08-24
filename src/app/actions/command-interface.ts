"use server";

// The bulk-bar command box's two server actions
// (docs/llm-command-interface-acceptance-criteria.md - section 10 is the
// FINAL CONTRACT; this file's brief covers TASK 1 (generate) and TASK 2
// (apply exactly one row), G1, G4, G5, G6, G10, G11, G12).
//
// TASK 1 - generateCommandProposalAction: ask the model for a STRUCTURED
// reply, parse it with parseLlmJson (llm-json.ts), and return the RAW rows
// UNCLASSIFIED. This deliberately does NOT call classifyCommandProposalRows -
// classification (the allowlist) and the selection signature happen in the
// browser against the LIVE selection (G14: a proposal is pinned to a
// selectionSignature at generation time, which only the browser can compute
// against its own current selection). Returning raw rows keeps this action a
// pure "ask the model" step; anything malformed in the model's reply is an
// `error` here, never a partial list - a proposal built from half a reply is
// worse than no proposal (AC1's whole point).
//
// The prompt states the allowlist (title, description/body, moduleName) as a
// HINT, but the guarantee is NOT the prompt - it is
// `classifyCommandProposalRows` (G10), which the browser runs against these
// raw rows before anything is shown to the instructor. A model that ignores
// the hint and asks to change "dueDate" is not a bug here; that row comes
// back "unsupported" downstream, named, exactly as G10 designed it to.
//
// TASK 2 - applyCommandProposalRowAction: apply EXACTLY ONE row. G12: the
// fan-out is driven from the BROWSER, one invocation per row, because
// src/app/page.tsx sets no maxDuration and a server action looping N objects
// dies mid-loop on the platform default - and because "rewrote 6 of 10 then
// crashed" must be a RENDERED state, not a lost one. This function must NEVER
// loop over rows - if it is ever changed to accept an array, that is a
// violation of this contract, not an enhancement.
//
// ---------------------------------------------------------------------------
// DEFECT 1 FIX - THE REQUEST STORM (verification-pass fix, this section
// replaces the original "addressing gap" text below it).
// ---------------------------------------------------------------------------
// Before this fix, EVERY row called `listModules` to recover an item's live
// type/contentId/pageUrl - and `listModules` is not one request: modules.ts
// does one fetchAll for the module list, then a fetchAll PER MODULE,
// concurrently. At the browser's 4-row fan-out (useCommandInterface.ts's
// COMMAND_APPLY_CONCURRENCY), peak concurrent GETs was roughly
// 4 x (1 + moduleCount) - about 64 on a 15-module course, before a single
// write - and none of those reads go through fetchWithThrottleRetry (only
// writeJson does), so Canvas's 403 "Rate Limit Exceeded" hit rows that never
// got to attempt a write.
//
// The fix: `applyCommandProposalRowAction` now accepts an optional `itemRef`
// - the browser already holds the whole module tree it built the proposal
// from, so this read was always avoidable. When `itemRef` is supplied,
// `resolveItemTarget` below makes NO Canvas call at all to locate the item.
// The `listModules` fallback in `resolveItemTarget` exists ONLY for a caller
// that has not (yet) been updated to pass `itemRef` - it must never run once
// every caller does, and it is not exercised by the normal path this file's
// own tests or the hook's current wiring take once `itemRef` is threaded
// through. Routing also goes through the shared `commandWriteRouteForItem`
// (command-write-support.ts) instead of a locally re-spelled predicate - see
// DEFECT 7 below and that file's own header for why two spellings drifted
// apart before.
//
// THE ADDRESSING GAP THIS FUNCTION STILL WORKS AROUND, EVEN WITH itemRef
// (read before touching the item branch): `CommandProposalRow.target`
// (command-proposal.ts) carries only `{kind, id, displayName, selectionKey}`.
// For an item, `id` is `CommandProposalItemInfo.id` - THE MODULE ITEM'S OWN
// ID, proven distinct from `contentId` by command-proposal.test.ts's own
// fixtures (id 101 vs contentId 501) - never the Canvas content id
// `updateGradable`/`getGradable` need, and never a Page's numeric id or slug.
// `itemRef` (when supplied) closes the type/contentId/pageUrl/isNewQuiz part
// of that gap directly from the browser's already-loaded tree; a Page's
// numeric id still comes from a `getPage` read this function needs anyway
// (G5), and a module item's own `moduleId` (needed only for DEFECT 6's title
// sync) is recovered from `target.selectionKey` (`live:<moduleId>:<itemId>`,
// the exact format `itemKey` in content-tab/utils.ts produces and
// `parseItemKey` there parses back) rather than added to the frozen
// `itemRef` contract.
//
// G1: for Assignment/Quiz/Discussion (no reachable Canvas undo), the pre-image
// is read via `getGradable` immediately before `updateGradable` writes, and
// carried on the "item-updated" outcome (command-apply-outcome.ts) - it costs
// nothing beyond a read this function needed anyway, and it is the only undo
// those three types will ever have. A Page's outcome carries `preImage: null`
// deliberately: Canvas's own page revision history is that type's undo path.
//
// G5: a Page write ALWAYS passes `{pageId: page.pageId}` to `updatePage`,
// never relies on `pageUrl` for the write itself - `pageUrl` is used only to
// LOCATE the page via `getPage` first. Never "simplified" back to slug-only
// addressing; see pages.ts's own header for why a slug-addressed retry can
// silently create a duplicate page.
//
// G6: quiz notifications are handled inside `updateGradable` itself
// (gradables.ts sends `quiz[notify_of_update]=false` unconditionally on that
// branch) - nothing to do here.
//
// ---------------------------------------------------------------------------
// DEFECT 5 / G4 FIX - IDEMPOTENCY.
// ---------------------------------------------------------------------------
// Before this fix, the apply path read the pre-image and then called
// updateGradable/updatePage UNCONDITIONALLY, with no comparison against the
// proposed value. `normalizeWrittenTextForComparison`
// (command-apply-outcome.ts) is now run against the freshly-read current
// value and the exact bytes about to be sent before every gradable/page/
// module write; a match returns `alreadyMatchesOutcome` and skips the write
// entirely - see that function's own doc comment for exactly what the
// normalization does and does not catch. This matters most for pages: every
// redundant write creates ANOTHER REVISION, polluting the one native undo
// path G1 identified.
//
// ---------------------------------------------------------------------------
// DEFECT 6 / G17.1 FIX - THE MODULE ITEM'S OWN TITLE.
// ---------------------------------------------------------------------------
// A title write used to go only to `updateGradable`/`updatePage`
// (assignment[name]/quiz[title]/title/wiki_page[title]). The Modules view
// renders the CONTENT TAG's title (mappers.ts:10), which has its own write
// path - `updateModuleItem` / `module_item[title]` (module-items.ts:38-47) -
// and G17 experiment 1 (docs section 10) states the safe default until that
// experiment is run live is to WRITE BOTH. `syncModuleItemTitle` below does
// that for every title-field row (gradable or page), after the primary
// write, and independently of whether the primary write was skipped by the
// G4 check above - so a retry that only needs to re-sync the module item's
// own title (the primary content write already landed, or already matched)
// still gets that write attempted. This is a bridging default; whoever runs
// G17 experiment 1 can remove one of the two writes with confidence rather
// than guessing.
//
// G11 / DEFECT 7 FIX: `commandWriteRouteForItem` (command-write-support.ts)
// is the single write-route answer shared with the classifier
// (command-proposal.ts), re-checked against the LIVE item kind (and, when
// known, the live isNewQuiz flag) this function resolves - not the
// classifier's own decision, and not a locally re-spelled predicate (that
// drifted before; see command-write-support.ts's own header for the
// incident). A New Quiz (`isNewQuiz === true`) now comes back "unsupported"
// and is refused BY NAME here, instead of silently writing
// `assignment[description]` to a field the New Quizzes UI never shows,
// reported to the instructor as success. `isNewQuiz` is resolved by the
// caller when it supplies `itemRef`; when it is not supplied (the listModules
// fallback), it is unresolved (`null`), which `commandWriteRouteForItem`
// treats as "route normally" per its own documented semantics - the
// fallback's own listModules read (modules.ts) carries no New Quiz flag, the
// same limitation the original code had.

import { requireOwner } from "@/lib/supabase/auth";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { parseLlmJson } from "@/lib/llm-json";
import type { CommandProposalContext, CommandProposalRow, RawCommandProposalRow } from "@/lib/command-proposal";
import {
  reauthorizeCommandProposalRow,
  plainTextToPageHtml,
  normalizeWrittenTextForComparison,
  refusedOutcome,
  notFoundOutcome,
  writeFailedOutcome,
  moduleUpdatedOutcome,
  moduleCreatedOutcome,
  itemUpdatedOutcome,
  alreadyMatchesOutcome,
  type CommandApplyOutcome,
} from "@/lib/command-apply-outcome";
import { commandWriteRouteForItem, commandWriteUnsupportedReason } from "@/lib/command-write-support";
import { listModules, updateModule, createModule } from "@/lib/canvas-modules/modules";
import { getGradable, updateGradable } from "@/lib/canvas-modules/gradables";
import type { GradableKind } from "@/lib/canvas-modules/types";
import { getPage, updatePage } from "@/lib/canvas-modules/pages";
import { updateModuleItem } from "@/lib/canvas-modules/module-items";
import { parseItemKey } from "@/app/components/content-tab/utils";

// ---------------------------------------------------------------------------
// TASK 1 - generate.
// ---------------------------------------------------------------------------

function describeSelectionForPrompt(context: CommandProposalContext): string {
  const moduleLines =
    context.modules.length > 0
      ? context.modules.map((m) => `  - targetKind "module", targetId ${m.id}: currently named "${m.name}"`).join("\n")
      : "  (no modules are selected)";
  const itemLines =
    context.items.length > 0
      ? context.items
          .map((it) => {
            const descPreview = it.description ? it.description.slice(0, 400).replace(/\s+/g, " ").trim() : "(no current description)";
            return `  - targetKind "item", targetId ${it.id} (${it.itemType}): currently titled "${it.title}"; current description/body: ${descPreview}`;
          })
          .join("\n")
      : "  (no items are selected)";
  return `SELECTED MODULES:\n${moduleLines}\n\nSELECTED ITEMS:\n${itemLines}`;
}

function buildCommandProposalPrompt(command: string, context: CommandProposalContext): string {
  return `You are helping an instructor apply a free-text command to a set of already-selected objects in a Canvas LMS course.

${describeSelectionForPrompt(context)}

INSTRUCTOR'S COMMAND (free text - may ask for anything, including things you cannot do):
${command}

You may only PROPOSE changes to these three fields:
  - an item's title
  - an item's description (also called "body")
  - a module's name (field name "moduleName")
Nothing else is writable by this app - not points, due dates, submission type, rubric association, or publish state. If the command asks for one of those, still emit a row naming the field it actually asked for (do not silently drop the request and do not reinterpret it as one of the three allowed fields) - the app will report it to the instructor as unsupported by name.

Respond with ONLY a JSON array (no markdown fence, no commentary, no explanation before or after it). Each element is one of:

To change an existing selected object:
{"kind":"modify","targetKind":"item"|"module","targetId":<the numeric id shown above>,"field":"title"|"description"|"moduleName"|"<the field the command actually asked for, if not one of these>","proposedValue":"<the full new value as plain text>"}

To create a brand-new module (only when the command explicitly asks for a new module - never to restate an existing one):
{"kind":"create-module","moduleName":"<the new module's name>"}

Only emit "modify" rows for objects shown above; never invent a targetId. Only emit "create-module" rows for modules the command asks to create, never for modules already listed above. If the command does not call for any change, return an empty array []. Every "proposedValue" and "moduleName" must be plain text, never markdown or HTML.`;
}

/** Loose but load-bearing: every element must at least be shaped like a
 * `RawCommandProposalRow`, or the whole reply is rejected (AC1 - a proposal
 * built from a half-parsed reply is worse than no proposal). Field/kind/id
 * VALUES are not validated here - that is `classifyCommandProposalRows`'s job
 * (G10), run later by the browser against the live selection. */
function isPlausibleRawRow(value: unknown): value is RawCommandProposalRow {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  if (row.kind === "modify") {
    return (
      (row.targetKind === "item" || row.targetKind === "module") &&
      typeof row.targetId === "number" &&
      Number.isFinite(row.targetId) &&
      typeof row.field === "string" &&
      row.field.trim() !== "" &&
      typeof row.proposedValue === "string"
    );
  }
  if (row.kind === "create-module") {
    return typeof row.moduleName === "string" && row.moduleName.trim() !== "";
  }
  return false;
}

/**
 * Ask the model for a structured proposal over the given (already-selected)
 * context, and return the RAW rows unclassified - see this file's header for
 * why classification happens elsewhere. `requireOwner()` runs once; there is
 * no Canvas call here at all, only the model call.
 */
export async function generateCommandProposalAction(input: {
  courseUrl: string;
  code?: string;
  command: string;
  provider: LlmProvider;
  context: CommandProposalContext;
}): Promise<{ rawRows: RawCommandProposalRow[] } | { error: string }> {
  try {
    await requireOwner();

    if (!input.command.trim()) {
      return { error: "Type a command before generating a proposal." };
    }
    if (input.context.modules.length === 0 && input.context.items.length === 0) {
      return { error: "Nothing is selected to apply a command to." };
    }

    const prompt = buildCommandProposalPrompt(input.command, input.context);
    const result = await callLlm(
      { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" } },
      input.provider
    );

    if (!result.ok) {
      return { error: `LLM API error generating the command proposal: HTTP ${result.status} - ${result.body.slice(0, 200)}` };
    }
    if (!result.text.trim()) {
      return { error: "The model returned an empty response for this command." };
    }

    const parsed = parseLlmJson<unknown>(result.text);
    if (!parsed.ok) {
      return { error: `Could not parse the model's response as JSON: ${parsed.reason}` };
    }
    if (!Array.isArray(parsed.value)) {
      return { error: "The model's response was not a JSON array of proposal rows." };
    }
    if (!parsed.value.every(isPlausibleRawRow)) {
      return { error: "The model's response contained a malformed proposal row; no proposal was generated." };
    }

    return { rawRows: parsed.value };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a command proposal." };
  }
}

// ---------------------------------------------------------------------------
// TASK 2 - apply exactly one row.
// ---------------------------------------------------------------------------

/** The live Canvas facts about an item's write target the browser already
 * knows from its own loaded module tree (DEFECT 1's contract). */
export interface CommandProposalItemRef {
  itemType: string;
  contentId: number | null;
  pageUrl: string | null;
  isNewQuiz: boolean | null;
}

/** A module row's rename is compared (DEFECT 5 / G4) against the value the
 * proposal was built from (`row.target.displayName`), not a fresh read -
 * there is no other live read on this path to compare against, and AC6 only
 * requires WEAK idempotency. Modules carry none of a Page's revision-
 * pollution harm (G1: modules have no revision history at all), but
 * re-issuing an identical rename is still pointless. */
async function applyModuleRow(courseUrl: string, code: string | undefined, row: CommandProposalRow): Promise<CommandApplyOutcome> {
  // row.target is non-null here - callers only reach this branch after
  // confirming row.target.kind === "module", which itself implies
  // row.decision === "modify" (a "create" row's target is always null).
  const target = row.target!;
  const proposedValue = row.proposedValue ?? "";

  if (normalizeWrittenTextForComparison(target.displayName) === normalizeWrittenTextForComparison(proposedValue)) {
    return alreadyMatchesOutcome(row, "Module");
  }

  try {
    await updateModule(courseUrl, target.id, { name: proposedValue }, code);
    return moduleUpdatedOutcome(row);
  } catch (err) {
    return writeFailedOutcome(row, err instanceof Error ? err.message : "Canvas rejected the module rename.");
  }
}

async function applyCreateModuleRow(courseUrl: string, code: string | undefined, row: CommandProposalRow): Promise<CommandApplyOutcome> {
  const name = (row.proposedValue ?? "").trim();
  if (!name) {
    return refusedOutcome(row, "A created module needs a non-empty name.");
  }
  try {
    const created = await createModule(courseUrl, name, undefined, code);
    return moduleCreatedOutcome(row, created.id, created.name);
  } catch (err) {
    return writeFailedOutcome(row, err instanceof Error ? err.message : "Canvas rejected creating this module.");
  }
}

/** DEFECT 6 / G17.1: recover the module item's own `moduleId` from
 * `selectionKey` (`live:<moduleId>:<itemId>`, `itemKey`'s own format in
 * content-tab/utils.ts) rather than adding a field to the frozen `itemRef`
 * contract. Every live item row's selectionKey is produced by `itemKey`
 * (useCommandInterface.ts's buildProposalContext), so this is not expected to
 * fail in practice; returns null defensively rather than throwing if it ever
 * does (a malformed key here means DEFECT 6's secondary write is skipped, not
 * that the row's primary write should be blocked by it). */
function moduleIdFromItemSelectionKey(selectionKey: string): number | null {
  const parsed = parseItemKey(selectionKey);
  if (!parsed || parsed.source !== "live") return null;
  const moduleId = Number(parsed.moduleRef);
  return Number.isFinite(moduleId) ? moduleId : null;
}

/** DEFECT 6 / G17.1 safe default: also write the module item's own
 * `module_item[title]` whenever an item's title changes, alongside
 * updateGradable's/updatePage's own title write, until G17 experiment 1
 * (docs section 10) determines whether Canvas keeps the two in sync on its
 * own. Runs unconditionally on a title-field row regardless of whether the
 * primary write was skipped by the DEFECT 5 / G4 check, so a re-apply that
 * only needs this secondary write still attempts it. `moduleId === null`
 * (see `moduleIdFromItemSelectionKey`'s own comment) skips silently rather
 * than failing the row - the primary content write already succeeded or
 * already matched, and there is no Canvas address to recover from this
 * function alone. */
async function syncModuleItemTitle(courseUrl: string, code: string | undefined, moduleId: number | null, moduleItemId: number, title: string): Promise<void> {
  if (moduleId === null) return;
  await updateModuleItem(courseUrl, moduleId, moduleItemId, { title }, code);
}

/** DEFECT 1 fix: resolve the live type/contentId/pageUrl/isNewQuiz for one
 * item row WITHOUT re-reading the whole module tree, when the caller already
 * supplies `itemRef` (the browser's own loaded selection). The `listModules`
 * fallback below is the ONLY place in this file that still performs the
 * request-storm read this defect was about, and it exists solely for a
 * caller that has not passed `itemRef` - see this file's header. */
async function resolveItemTarget(
  courseUrl: string,
  code: string | undefined,
  row: CommandProposalRow,
  itemRef: CommandProposalItemRef | undefined
): Promise<{ ok: true; itemType: string; contentId: number | null; pageUrl: string | null; isNewQuiz: boolean | null; moduleId: number | null } | { ok: false; outcome: CommandApplyOutcome }> {
  const target = row.target!;
  const moduleId = moduleIdFromItemSelectionKey(target.selectionKey);

  if (itemRef) {
    return { ok: true, itemType: itemRef.itemType, contentId: itemRef.contentId, pageUrl: itemRef.pageUrl, isNewQuiz: itemRef.isNewQuiz, moduleId };
  }

  // Fallback path (see this function's own doc comment and this file's
  // header - DEFECT 1): re-reads the WHOLE live module tree and searches it
  // for the module item whose id matches `target.id`. Kept only for a caller
  // that has not been updated to pass `itemRef`; not the normal path.
  let modules;
  try {
    modules = await listModules(courseUrl, code);
  } catch (err) {
    return { ok: false, outcome: writeFailedOutcome(row, err instanceof Error ? err.message : "Could not read the course's modules to locate this item.") };
  }
  const liveItem = modules.flatMap((m) => m.items).find((it) => it.id === target.id);
  if (!liveItem) {
    return { ok: false, outcome: notFoundOutcome(row, "This item is no longer present in the course; it may have been removed since the proposal was generated.") };
  }
  // The fallback's own read carries no New Quiz flag (G11 - CanvasModuleItem
  // has no such field; see command-write-support.ts's own doc comment on the
  // `null` case), so `isNewQuiz` is unresolved here, same as before this fix.
  return { ok: true, itemType: liveItem.type, contentId: liveItem.contentId, pageUrl: liveItem.pageUrl, isNewQuiz: null, moduleId: liveItem.moduleId ?? moduleId };
}

/** The exact bytes this apply will send for `field`: the raw proposed value
 * for a title (Canvas receives it verbatim), or the plain-text-to-HTML
 * conversion (G5) for a description/body. Shared by the gradable and page
 * branches so the DEFECT 5 / G4 comparison and the actual write always agree
 * on what "the value to send" means. */
function valueToSendFor(field: "title" | "description", proposedValue: string): string {
  return field === "title" ? proposedValue : plainTextToPageHtml(proposedValue);
}

async function applyItemRow(
  courseUrl: string,
  code: string | undefined,
  row: CommandProposalRow,
  field: "title" | "description",
  itemRef: CommandProposalItemRef | undefined
): Promise<CommandApplyOutcome> {
  const target = row.target!;
  const proposedValue = row.proposedValue ?? "";

  const resolved = await resolveItemTarget(courseUrl, code, row, itemRef);
  if (!resolved.ok) return resolved.outcome;
  const { itemType, contentId, pageUrl, isNewQuiz, moduleId } = resolved;

  // DEFECT 7 / G11: the single write-route answer shared with the
  // classifier - refuses a New Quiz (and every kind AC3 never granted a
  // write path to) BY NAME, rather than routing it down the gradable path
  // where Canvas would return 200 for a write the New Quizzes UI never shows.
  const route = commandWriteRouteForItem(itemType, isNewQuiz);
  if (route === "unsupported") {
    return refusedOutcome(row, commandWriteUnsupportedReason(itemType, isNewQuiz));
  }

  if (route === "gradable") {
    if (contentId === null) {
      return notFoundOutcome(row, "This item has no linked content id in Canvas; it cannot be addressed for a write.");
    }
    const kind = itemType as GradableKind;
    let preImage: string | null;
    try {
      const detail = await getGradable(courseUrl, kind, contentId, code);
      preImage = field === "title" ? detail.title : detail.description;
    } catch (err) {
      return writeFailedOutcome(row, err instanceof Error ? err.message : "Could not read the current value before writing.");
    }

    // DEFECT 5 / G4: skip a write whose target already matches the proposed
    // value (normalized).
    const bytesToSend = valueToSendFor(field, proposedValue);
    const alreadyMatches = normalizeWrittenTextForComparison(preImage ?? "") === normalizeWrittenTextForComparison(bytesToSend);

    if (!alreadyMatches) {
      try {
        await updateGradable(courseUrl, kind, contentId, field === "title" ? { title: proposedValue } : { description: proposedValue }, code);
      } catch (err) {
        return writeFailedOutcome(row, err instanceof Error ? err.message : "Canvas rejected this write.");
      }
    }

    // DEFECT 6 / G17.1: also sync the module item's own title, independent
    // of whether the primary write above ran or was skipped as a match.
    if (field === "title") {
      try {
        await syncModuleItemTitle(courseUrl, code, moduleId, target.id, proposedValue);
      } catch (err) {
        return writeFailedOutcome(row, err instanceof Error ? err.message : "The item's title was updated, but Canvas rejected updating the module item's own title.");
      }
    }

    if (alreadyMatches) {
      return alreadyMatchesOutcome(row, itemType);
    }
    return itemUpdatedOutcome(row, itemType, preImage);
  }

  // route === "page"
  if (!pageUrl) {
    return notFoundOutcome(row, "This page item has no slug to locate it by.");
  }
  let pageId: number;
  let currentValue: string;
  try {
    const page = await getPage(courseUrl, pageUrl, code);
    pageId = page.pageId;
    currentValue = field === "title" ? page.title : page.body;
  } catch (err) {
    return writeFailedOutcome(row, err instanceof Error ? err.message : "Could not read the page before writing.");
  }

  const bytesToSend = valueToSendFor(field, proposedValue);
  const alreadyMatches = normalizeWrittenTextForComparison(currentValue) === normalizeWrittenTextForComparison(bytesToSend);

  if (!alreadyMatches) {
    try {
      // G5: addressed by pageId, never by the (possibly stale) slug.
      await updatePage(courseUrl, pageUrl, field === "title" ? { title: proposedValue } : { body: bytesToSend }, code, { pageId });
    } catch (err) {
      return writeFailedOutcome(row, err instanceof Error ? err.message : "Canvas rejected this write.");
    }
  }

  // DEFECT 6 / G17.1: same secondary write as the gradable branch above.
  if (field === "title") {
    try {
      await syncModuleItemTitle(courseUrl, code, moduleId, target.id, proposedValue);
    } catch (err) {
      return writeFailedOutcome(row, err instanceof Error ? err.message : "The page's title was updated, but Canvas rejected updating the module item's own title.");
    }
  }

  if (alreadyMatches) {
    return alreadyMatchesOutcome(row, "Page");
  }
  // G1: a Page's undo is Canvas's own revision history, not a stored
  // pre-image.
  return itemUpdatedOutcome(row, "Page", null);
}

/**
 * Apply EXACTLY ONE proposal row - never a list (G12: the browser fans this
 * out, one invocation per row). `requireOwner()` runs once per call, matching
 * every other single-object write action in this directory.
 *
 * `itemRef` (DEFECT 1): the live type/contentId/pageUrl/isNewQuiz for an item
 * row, already known to the browser from the module tree it built the
 * proposal from. Supplying it skips the `listModules` re-read entirely; see
 * this file's header for the request-storm this replaces.
 */
export async function applyCommandProposalRowAction(input: {
  courseUrl: string;
  code?: string;
  row: CommandProposalRow;
  itemRef?: CommandProposalItemRef;
}): Promise<CommandApplyOutcome> {
  try {
    await requireOwner();

    const authorized = reauthorizeCommandProposalRow(input.row);
    if (!authorized.ok) {
      return refusedOutcome(input.row, authorized.reason);
    }

    if (input.row.decision === "create") {
      return applyCreateModuleRow(input.courseUrl, input.code, input.row);
    }

    // decision === "modify" (reauthorizeCommandProposalRow already refused
    // every other decision, and refused a "modify" row with a null target).
    const target = input.row.target!;
    if (target.kind === "module") {
      return applyModuleRow(input.courseUrl, input.code, input.row);
    }
    return applyItemRow(input.courseUrl, input.code, input.row, authorized.field as "title" | "description", input.itemRef);
  } catch (err) {
    return writeFailedOutcome(input.row, err instanceof Error ? err.message : "Could not apply this row.");
  }
}
