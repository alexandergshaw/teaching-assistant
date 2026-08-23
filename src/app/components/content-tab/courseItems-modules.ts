// Pure mapping from a BulkItem row (Assignments/Quizzes tabs, CourseItemsView.tsx)
// to the module(s) it belongs to - "which module is each assignment/quiz in"
// (docs/assignments-quizzes-tabs-acceptance-criteria.md's own tab, this
// feature adds a column to it). Extracted into its own leaf for the same
// reason courseItems-routing.ts and course-copy-purge.ts were: this repo's
// vitest is node-env and never renders a component (AGENTS.md's
// ac-sonnet-opus-loop memory), so any of this logic left inside
// CourseItemsView.tsx could not be unit-tested at all - only regex-matched as
// source text, the way courseItemsView.wiring.test.ts must for everything
// that stays in the .tsx.
//
// THE DATA PROBLEM: a BulkItem carries no module information at all - it
// comes from listBulkItems' flat /assignments or /quizzes fetch
// (src/lib/canvas-modules/bulk.ts), which knows nothing about modules. The
// association lives entirely in the MODULE TREE returned by
// listCourseContentAction: each CanvasModuleItem carries a `type` and a
// `contentId` pointing at the underlying object
// (src/lib/canvas-modules/mappers.ts:6-23's mapModuleItem reads `raw.type`
// and `raw.content_id` straight off the raw Canvas payload, uninterpreted -
// so whatever Canvas reports for a module item's type and content id is
// exactly what ends up on CanvasModuleItem).
//
// THE SUBTLETY (verified against src/lib/canvas-modules/bulk.ts's own
// comments, lines 79-123, and new-quiz.ts's header): a BulkItem's own `kind`
// (the TAB it is shown in) is NOT the module-item `type` Canvas used to file
// it into a module.
//   - An ordinary assignment: module item type "Assignment", contentId = the
//     assignment id (bulk.ts:83-91).
//   - A CLASSIC quiz: module item type "Quiz", contentId = the QUIZ id - a
//     genuinely separate Canvas object with its own id, fetched from
//     /quizzes (bulk.ts:103-112).
//   - A NEW QUIZ: module item type "Assignment", contentId = the ASSIGNMENT
//     id, because a New Quiz has no Quiz object at all - it IS an assignment
//     under the hood (bulk.ts:94-102's own comment: "a New Quiz must be
//     addressed as an assignment, never as a quiz"; new-quiz.ts's header).
//     Canvas therefore files it into a module the same way it files any
//     other assignment: under type "Assignment", keyed by the assignment id.
//     A naive implementation that keys a New Quiz row by the tab's own `kind`
//     ("Quiz", since that is the tab it is displayed in) or by the module
//     item type "Quiz" would never find it - it is filed under "Assignment".
//
// courseItems-routing.ts's `effectiveKindOf` already resolves EXACTLY this
// distinction for the write paths (a New Quiz writes as "Assignment", never
// "Quiz"), and that resolved kind happens to be precisely the module-item
// `type` string Canvas uses for the same three cases. So `effectiveKindOf` is
// REUSED here unchanged as the module-item type to look up, rather than a
// second, hand-rolled copy of the same rule that could silently drift from
// the write-path one.

import type { CanvasModule } from "@/lib/canvas-modules";
import { effectiveKindOf, type EffectiveKind, type RealKindFlagged } from "./courseItems-routing";

/** The module-tree lookup key: TYPE-DISCRIMINATED, so an assignment id that
 *  happens to collide numerically with some quiz's id can never cross-match
 *  - "Assignment:5" and "Quiz:5" are different keys, one for each Canvas
 *  object, even though both carry the bare number 5. */
function moduleIndexKey(type: string, contentId: number): string {
  return `${type}:${contentId}`;
}

/**
 * Build a (module-item type, content id) -> module names lookup from the
 * module tree, ONCE per load (A4) - never per row, and never walked again per
 * item afterward; `modulesForItem` below does a plain map lookup.
 *
 * An item that appears in SEVERAL modules (Canvas permits this, A3)
 * accumulates every module name, in the tree's own module order - never just
 * the first match, which would silently hide the rest. A module item with a
 * null `contentId` (a Page, SubHeader, ExternalUrl, or ExternalTool item -
 * see CanvasModuleItem's own doc comment) can never match a BulkItem's
 * numeric id and is simply skipped.
 *
 * NIT12: Canvas also permits the SAME item to be listed twice inside one
 * module (a duplicate module item, not two different modules). Without a
 * guard that pushes `mod.name` unconditionally, rendering "Week 1, Week 1"
 * for a single module. Since a module's own items are processed
 * consecutively (the inner loop finishes one `mod` before the outer loop
 * moves to the next), a duplicate-within-the-same-module always produces two
 * consecutive pushes of the same name - so comparing against only the most
 * recently pushed name is enough to dedupe it, without discarding a
 * genuinely different module of the same name encountered earlier.
 */
export function buildModuleIndex(modules: readonly CanvasModule[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const mod of modules) {
    for (const item of mod.items) {
      if (item.contentId === null) continue;
      const key = moduleIndexKey(item.type, item.contentId);
      const existing = index.get(key);
      if (existing) {
        if (existing[existing.length - 1] !== mod.name) existing.push(mod.name);
      } else index.set(key, [mod.name]);
    }
  }
  return index;
}

/**
 * The module column's cell for one row.
 *
 * `known: false` means the module tree could not be loaded at all (A4) - the
 * caller must render this as "unknown"/degraded, and must NEVER confuse it
 * with `known: true, names: []`, which is the genuinely different fact that
 * the tree loaded fine and this item simply belongs to no module (A2 - worth
 * surfacing explicitly, since an unassociated assignment is usually a
 * mistake).
 */
export type ItemModuleInfo = { known: true; names: string[] } | { known: false };

/**
 * Look up the module(s) one BulkItem row belongs to. `index === null` is the
 * caller's signal that the module tree fetch failed or has not completed yet
 * (A4); every other case is a real lookup against an already-built index.
 *
 * `kind` is the TAB's own kind ("Assignment" | "Quiz"), never the resolved
 * one - `effectiveKindOf` (imported from courseItems-routing.ts, the same
 * rule the write paths use) does the resolution from `kind` plus the item's
 * own `isNewQuiz` flag, exactly as it does for every write in
 * CourseItemsView.tsx.
 *
 * SHADOW-QUIZ CARVE-OUT (bulk.ts's Assignment-branch bug fix): a classic
 * quiz's shadow assignment row now appears in the Assignments tab, keyed by
 * its own (shadow assignment) id - but Canvas never files a module item
 * under that id. It files the module item as type "Quiz", keyed by the
 * underlying QUIZ's own id (`item.shadowQuizId`, populated by bulk.ts from
 * the same `quiz_id` it reads to set `isClassicQuizShadow`). Falling through
 * to the ordinary `effectiveKindOf`-based lookup for such a row would look
 * up "Assignment:<shadowId>" and never find it, silently reporting "No
 * module" for a row that may well be in one - so this is checked FIRST,
 * before the ordinary path runs.
 *
 * DISCUSSION-SHADOW CARVE-OUT (finding 3 fix, verified against
 * https://canvas.instructure.com/doc/api/assignments.html): a graded
 * discussion's shadow assignment row (`isGradedDiscussionShadow`) needs the
 * same treatment as the classic-quiz carve-out above, and Canvas's own
 * Assignment object model documents `discussion_topic` as a base field of
 * the assignment itself ("(Optional) the DiscussionTopic associated with the
 * assignment, if applicable") - not one of the supplemental fields gated
 * behind the assignments-index endpoint's include[] allowlist, the same way
 * `quiz_id` already is not (see raw-types.ts's own citation for that
 * endpoint's include[] list). bulk.ts carries the topic's own id through as
 * `shadowDiscussionTopicId` whenever Canvas's response actually populates the
 * field. Canvas's own wording ("if applicable") leaves open that a given row
 * might not carry it, so this is checked defensively: when the id IS present,
 * this resolves exactly like the classic-quiz carve-out, keyed by module-item
 * type "Discussion". When it is genuinely ABSENT, this returns `known: false`
 * (UNKNOWN) rather than falling through to the ordinary lookup below - that
 * fallback keys on "Assignment:<shadowId>", which Canvas never files a module
 * item under for a graded discussion, so it would silently and WRONGLY report
 * "No module" for a row whose true module status was never actually
 * observed. Reporting UNKNOWN is the honest answer; asserting "No module"
 * would not be (see courseItems-filters.ts's F2 reasoning, which already
 * treats `known: false` as excluded from both the "in a module" and "not in
 * any module" facets for exactly this reason).
 */
export function modulesForItem(
  item: RealKindFlagged & { id: string },
  kind: EffectiveKind,
  index: ReadonlyMap<string, string[]> | null
): ItemModuleInfo {
  if (index === null) return { known: false };
  if (item.isClassicQuizShadow && typeof item.shadowQuizId === "number") {
    const key = moduleIndexKey("Quiz", item.shadowQuizId);
    return { known: true, names: index.get(key) ?? [] };
  }
  if (item.isGradedDiscussionShadow) {
    if (typeof item.shadowDiscussionTopicId === "number") {
      const key = moduleIndexKey("Discussion", item.shadowDiscussionTopicId);
      return { known: true, names: index.get(key) ?? [] };
    }
    return { known: false };
  }
  const effKind = effectiveKindOf(item, kind);
  const key = moduleIndexKey(effKind, Number(item.id));
  return { known: true, names: index.get(key) ?? [] };
}
