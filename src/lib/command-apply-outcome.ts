// The per-row apply outcome for the bulk-bar command box
// (docs/llm-command-interface-acceptance-criteria.md - section 10 is the
// FINAL CONTRACT; this file's brief is G1, G4, G5, G9, G10 (re-checked, not
// re-spelled), G11, G12's "one invocation per row").
//
// PURE: no React, no I/O, no Date, no randomness, no Canvas call. This file
// never talks to Canvas or an LLM - it is the outcome vocabulary
// (modelled on CarryModulePatternApplyOutcome, carry-module-pattern.ts:301)
// plus the pieces of routing/refusal/comparison logic that CAN be decided
// without live Canvas data, so it is the only part of the apply path a
// node-env vitest run can exercise (section 7).
//
// G12: applyCommandProposalRowAction (command-interface.ts) applies EXACTLY
// ONE row per invocation - the browser fans out one call per row - so this
// file's outcome type describes ONE row's result, never a list.
//
// G10 (RE-CHECKED HERE, NOT RE-SPELLED): "Never trust the row's decision
// alone - re-check the field against the same allowlist source of truth in
// command-proposal.ts rather than re-spelling it" (dispatch brief).
// `reauthorizeCommandProposalRow` below re-derives the SAME decision
// command-proposal.ts's own `classifyCommandProposalRows` already made, by
// calling that exported function again with a synthetic single-row context,
// rather than re-implementing canonicalizeField / isFieldValidForTargetKind
// locally as a second, driftable copy. It deliberately does NOT re-check the
// item-KIND guard (isCarryWriteSupportedKind) - that needs the LIVE item
// kind, which a CommandProposalRow does not carry (see command-interface.ts's
// header for why: CommandProposalTarget only carries {kind, id, displayName,
// selectionKey}, not the item's Canvas type or content id) - the caller
// re-resolves the live item from Canvas and re-checks the write route itself,
// via `commandWriteRouteForItem` (command-write-support.ts) - see G11 below.
//
// G1: for the three Canvas kinds with no reachable undo (Assignment, Quiz,
// Discussion - see this chunk's AC doc G1 table), an "item-updated" outcome
// carries `preImage`: the value read immediately before the write, which is
// the only undo those types will ever have. A Page's outcome carries
// `preImage: null` deliberately - Canvas's own page revision history is
// that type's undo path (G1), so this app does not duplicate it.
//
// G4 (DEFECT 5 FIX): `normalizeWrittenTextForComparison` below is the
// idempotency comparison AC6/G4 require - "must not re-issue a write whose
// target already matches the proposed value", and for a Page every redundant
// write creates ANOTHER REVISION, polluting the undo path G1 identified. A
// raw string comparison is wrong (three transforms sit between what is sent
// and what is read back - this app's own descriptionToHtml, Canvas's
// sanitize_field, and api_user_content on read); see that function's own doc
// comment for exactly what the chosen normalization does and does not catch.
// `command-interface.ts` calls it before every gradable/page/module write and
// returns `alreadyMatchesOutcome` instead of writing when it matches.
//
// G5: `plainTextToPageHtml` DELEGATES to gradables.ts's own (now exported -
// DEFECT 9 fix) `descriptionToHtml`, rather than restating an independent
// copy. `updatePage` (pages.ts) sends `wiki_page[body]` VERBATIM, unlike
// `updateGradable`, which HTML-escapes a plain-text description itself, so a
// model-authored plain-text proposal for a page's body needs the same
// treatment every other kind's description already gets. Before the DEFECT 9
// fix, this function was a byte-identical but independently maintained copy
// of gradables.ts's private `descriptionToHtml` - nothing enforced that
// staying true, so a drift would have made G13's "the preview shows the exact
// bytes that will be sent" a lie for one of the two write paths while every
// existing test (each of which only exercised its own copy) stayed green.
// There is now exactly one implementation.
//
// G11 (DEFECT 7 FIX): item-kind/New-Quiz routing goes through
// `commandWriteRouteForItem` (command-write-support.ts) - the single answer
// both this apply path and the classifier (command-proposal.ts) share, after
// a real incident where their two independently-spelled routing predicates
// disagreed (see that file's own header). `routeItemKind` below is kept only
// as a thin delegate for backward compatibility with this file's own
// existing tests and any other caller; it is not a second source of truth.

import { classifyCommandProposalRows, type CommandProposalContext, type CommandProposalField, type CommandProposalRow } from "./command-proposal";
import { descriptionToHtml } from "./canvas-modules/gradables";
import { commandWriteRouteForItem, type CommandWriteRoute } from "./command-write-support";

// ---------------------------------------------------------------------------
// Outcome vocabulary.
// ---------------------------------------------------------------------------

/** Fields every outcome carries, echoing the row it was produced for so a
 * caller can match an outcome back to the row it applied without threading a
 * separate index. `targetKind`/`targetId` are null only for a "create
 * module" row, which names no existing object (mirrors
 * `CommandProposalRow.target`'s own null case). */
export interface CommandApplyOutcomeBase {
  targetKind: "module" | "item" | null;
  targetId: number | null;
  field: string | null;
}

export type CommandApplyOutcome =
  /** The row was never eligible to be written - a decision other than
   * "modify"/"create", a field the allowlist rejects, a target/field this
   * row's own shape does not support, or (from the caller) an item kind
   * `commandWriteRouteForItem` rejects on re-check (including a New Quiz -
   * G11/DEFECT 7). Named, never a silent no-op (G10). */
  | (CommandApplyOutcomeBase & { status: "refused"; reason: string })
  /** The row's target could not be re-located against the live course - it
   * was removed, or (for an item) carries no linked content id / page slug
   * this app can address a write by. Distinguished from "refused" because
   * the row itself was valid; the world moved under it (G14's spirit,
   * generalized to apply-time rather than reconcile-time). */
  | (CommandApplyOutcomeBase & { status: "not-found"; reason: string })
  /** Canvas rejected the write, or a read this apply needed (the pre-image,
   * the page lookup, the module-item title sync) failed. */
  | (CommandApplyOutcomeBase & { status: "write-failed"; reason: string })
  | (CommandApplyOutcomeBase & { status: "module-updated" })
  | (CommandApplyOutcomeBase & { status: "module-created"; newModuleId: number; newModuleName: string })
  | (CommandApplyOutcomeBase & {
      status: "item-updated";
      /** The live Canvas item kind this outcome actually wrote, resolved by
       * the caller - not necessarily anything the row itself carried. */
      itemType: string;
      /** G1 - null only for a Page (Canvas's own revision history is that
       * type's undo path) or when the pre-image genuinely could not be read. */
      preImage: string | null;
    })
  /** DEFECT 5 / G4: the live value already matched the proposed value
   * (`normalizeWrittenTextForComparison` below), so this row wrote nothing.
   * Deliberately distinct from "module-updated"/"item-updated" - a caller
   * that folded this into "success" would tell the instructor a write
   * happened when it did not, and a caller that folded it into "write-failed"
   * would tell the instructor Canvas rejected something it was never asked
   * to do. `itemType` is `"Module"` for a module-target row (module rows have
   * no other kind to report). */
  | (CommandApplyOutcomeBase & { status: "already-matches"; itemType: string; reason: string });

function baseFrom(row: CommandProposalRow): CommandApplyOutcomeBase {
  return { targetKind: row.target?.kind ?? null, targetId: row.target?.id ?? null, field: row.field };
}

export function refusedOutcome(row: CommandProposalRow, reason: string): CommandApplyOutcome {
  return { ...baseFrom(row), status: "refused", reason };
}

export function notFoundOutcome(row: CommandProposalRow, reason: string): CommandApplyOutcome {
  return { ...baseFrom(row), status: "not-found", reason };
}

export function writeFailedOutcome(row: CommandProposalRow, reason: string): CommandApplyOutcome {
  return { ...baseFrom(row), status: "write-failed", reason };
}

export function moduleUpdatedOutcome(row: CommandProposalRow): CommandApplyOutcome {
  return { ...baseFrom(row), status: "module-updated" };
}

export function moduleCreatedOutcome(row: CommandProposalRow, newModuleId: number, newModuleName: string): CommandApplyOutcome {
  return { ...baseFrom(row), status: "module-created", newModuleId, newModuleName };
}

export function itemUpdatedOutcome(row: CommandProposalRow, itemType: string, preImage: string | null): CommandApplyOutcome {
  return { ...baseFrom(row), status: "item-updated", itemType, preImage };
}

/** DEFECT 5 / G4: constructs the "nothing was written, the target already
 * matched" outcome. `reason` defaults to a fixed, generic sentence (this
 * project's standing rule is against tests pinning exact reason prose, so
 * callers needing a more specific sentence may still pass one). */
export function alreadyMatchesOutcome(
  row: CommandProposalRow,
  itemType: string,
  reason: string = "The current value already matches the proposed value; nothing was written."
): CommandApplyOutcome {
  return { ...baseFrom(row), status: "already-matches", itemType, reason };
}

// ---------------------------------------------------------------------------
// G10 re-check: the same allowlist source of truth, re-derived not re-spelled.
// ---------------------------------------------------------------------------

/** Any writable item kind passes `isCarryWriteSupportedKind` unconditionally
 * (module-pattern-plan.ts:346 - false only for ExternalUrl/ExternalTool/a
 * contentId-less File). Used only to isolate THIS function's field<->target
 * -kind re-check from the item-kind guard, which needs live Canvas data this
 * pure function does not have - see this file's header. */
const PLACEHOLDER_WRITABLE_ITEM_TYPE = "Assignment";

/**
 * Re-derive command-proposal.ts's own allowlist decision for one row, rather
 * than trusting `row.decision`/`row.field` as sent (they arrive from the
 * browser, which round-tripped a proposal built earlier - see
 * command-interface.ts's header for why that round trip cannot be trusted at
 * face value). Reuses the exported `classifyCommandProposalRows` with a
 * synthetic single-target context so the SAME canonicalizeField /
 * isFieldValidForTargetKind logic decides again, instead of a second,
 * driftable copy living here.
 *
 * Deliberately does NOT re-check the live item-kind/New-Quiz write route -
 * this function has no live item data to check it against. The caller
 * re-checks that guard itself once it has resolved the item from a fresh
 * Canvas read, via `commandWriteRouteForItem` (command-write-support.ts,
 * G11 / DEFECT 7).
 */
export function reauthorizeCommandProposalRow(
  row: CommandProposalRow
): { ok: true; field: CommandProposalField } | { ok: false; reason: string } {
  if (row.decision !== "modify" && row.decision !== "create") {
    return {
      ok: false,
      reason: `This row's decision ("${row.decision}") is never written to Canvas; only "modify" and "create" rows are applied.`,
    };
  }
  if (row.field === null) {
    return { ok: false, reason: "This row names no field to write." };
  }

  if (row.decision === "create") {
    // G8: a create-module row always has no existing target and names
    // moduleName - re-validated directly (classifyCreateModuleRow's own
    // dedupe needs a live module list this pure function does not have; the
    // caller re-checks existence itself against a fresh Canvas read before
    // creating).
    if (row.target !== null || row.field !== "moduleName") {
      return { ok: false, reason: "A create-module row must have no existing target and must name the moduleName field." };
    }
    return { ok: true, field: "moduleName" };
  }

  // decision === "modify" from here on.
  if (row.target === null) {
    return { ok: false, reason: "This row has no target to modify." };
  }

  const context: CommandProposalContext =
    row.target.kind === "module"
      ? { modules: [{ id: row.target.id, name: row.target.displayName, selectionKey: row.target.selectionKey }], items: [] }
      : {
          modules: [],
          items: [
            {
              id: row.target.id,
              itemType: PLACEHOLDER_WRITABLE_ITEM_TYPE,
              contentId: row.target.id,
              title: row.target.displayName,
              description: null,
              selectionKey: row.target.selectionKey,
              // This pure re-check has no live New Quiz data to resolve -
              // `null` is "unresolved", which command-write-support.ts's
              // commandCanWriteItemKind (the classifier's own guard, reused
              // by classifyCommandProposalRows) treats as "route normally"
              // per its own documented semantics, matching this field's
              // placeholder kind above (also a stand-in, not a live read).
              isNewQuiz: null,
            },
          ],
        };
  const [reclassified] = classifyCommandProposalRows(
    [{ kind: "modify", targetKind: row.target.kind, targetId: row.target.id, field: row.field, proposedValue: row.proposedValue ?? "" }],
    context
  );
  if (reclassified.decision !== "modify" || reclassified.field === null) {
    return { ok: false, reason: `The field "${row.field}" is not writable for this row (re-checked against the app's own allowlist).` };
  }
  return { ok: true, field: reclassified.field as CommandProposalField };
}

// ---------------------------------------------------------------------------
// Live item-kind routing (pure once the caller supplies the live Canvas type).
// ---------------------------------------------------------------------------

/** Mirrors `CommandWriteRoute` (command-write-support.ts) - kept as a
 * separate type alias only so this file's existing exports do not change
 * shape; the two are structurally identical. */
export type CommandApplyItemRoute = CommandWriteRoute;

/**
 * @deprecated DEFECT 1 / DEFECT 7 fix: this used to be its own routing
 * predicate, independently spelled from the classifier's
 * `isCarryWriteSupportedKind` check - the two disagreed (a SubHeader was
 * proposed as writable, then refused at apply time; see
 * command-write-support.ts's own header for the full incident) and neither
 * one knew about New Quizzes at all. Both callers now share
 * `commandWriteRouteForItem` (command-write-support.ts). This function is
 * kept only as a thin delegate so it is not a second spelling that can drift
 * again - new code should call `commandWriteRouteForItem` directly.
 */
export function routeItemKind(itemType: string): CommandApplyItemRoute {
  return commandWriteRouteForItem(itemType);
}

// ---------------------------------------------------------------------------
// G5 / DEFECT 9: page body needs the same plain-text -> HTML treatment
// gradables get - now ONE implementation, not two.
// ---------------------------------------------------------------------------

/** Delegates to gradables.ts's own (exported) `descriptionToHtml` - see that
 * function's doc comment for the transform itself. `updatePage` (pages.ts)
 * sends `wiki_page[body]` verbatim with no HTML conversion of its own,
 * unlike `updateGradable`'s assignment/quiz/discussion branches, so a
 * model-authored plain-text "description" proposal for a Page needs this
 * same conversion before command-interface.ts calls `updatePage`. Kept as a
 * separate exported name (rather than every caller importing
 * `descriptionToHtml` directly) because this file's own callers already
 * import it under this name and G13's "exact bytes" preview reads it from
 * here. */
export function plainTextToPageHtml(text: string): string {
  return descriptionToHtml(text);
}

// ---------------------------------------------------------------------------
// DEFECT 5 / G4: the idempotency comparison.
// ---------------------------------------------------------------------------

/**
 * Normalize a value for a "does this already match" comparison before
 * re-issuing a write. A RAW string comparison is wrong (docs section 10's
 * G4): the value Canvas returns on a read is not the value this app sent,
 * because three transforms sit between them - this app's own
 * `descriptionToHtml`/`plainTextToPageHtml` (plain text escaped, newlines
 * become `<br>`), Canvas's `sanitize_field ..., CanvasSanitize::SANITIZE` on
 * pages/assignments/discussions (re-serializes through a parser, so
 * attribute order, quoting and entity encoding can change even when nothing
 * meaningful did), and `Api#api_user_content` on read (rewrites file/media
 * links and verifiers). A raw comparison would never match and would
 * re-issue every write on every apply - for a Page, each redundant write
 * creates ANOTHER REVISION, polluting the one native undo path G1 identified.
 *
 * WHAT THIS NORMALIZATION DOES: converts `<br>` tags to newlines (so line
 * structure survives tag-stripping) - consuming one immediately-following
 * literal newline along with the tag, because this app's own
 * `descriptionToHtml` emits exactly that pair (`<br>\n`) for every source
 * newline, and leaving the literal newline in place would double it into a
 * blank line that was never in either the sent or the read-back value -
 * strips every remaining HTML tag, decodes
 * the small set of entities this app's own escaping introduces (`&amp;`
 * `&lt;` `&gt;`) plus `&nbsp;`/`&quot;`/`&#39;` (entities Canvas's
 * re-serialization is documented to introduce), collapses runs of horizontal
 * whitespace within a line, trims each line and the whole string, and
 * normalizes CRLF to LF. Comparing the result on both sides - the value read
 * back from Canvas, and the exact bytes this apply is about to send -
 * approximates "same visible text", independent of markup-only differences.
 *
 * WHAT THIS CANNOT CATCH, DELIBERATELY DOCUMENTED RATHER THAN ASSUMED AWAY:
 *  - A CanvasSanitize transform that changes MEANING (stripping a disallowed
 *    tag or attribute) rather than just re-serializing - out of scope here,
 *    because this app's own `proposedValue` is always plain text turned into
 *    escaped HTML by this same file, never model-authored markup (the
 *    generation prompt in command-interface.ts states this explicitly).
 *  - Two different underlying HTML structures that happen to strip to the
 *    same visible text (for example, wrapping unchanged text in `<em>`):
 *    this function discards markup entirely, so it cannot distinguish "no
 *    change" from "same words, different emphasis". A false-positive match
 *    here would skip a real, intended markup-only edit as a no-op - this app
 *    never sends such an edit today (every proposedValue is plain text), so
 *    the case is stated rather than currently reachable.
 *  - `api_user_content`'s link/verifier rewriting could, in principle, alter
 *    visible link text or attributes CanvasSanitize's re-serialization would
 *    not - stripped-text comparison is blind to attributes by construction,
 *    so this is inert either way for the plain-text proposals this app
 *    writes, but would matter for a hypothetical richer proposal.
 * Both gaps above bias toward RE-ISSUING a write that was already
 * unnecessary, never toward silently skipping one that was needed - the
 * safer of the two mistakes for a live Canvas write.
 */
export function normalizeWrittenTextForComparison(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>\n?/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}
