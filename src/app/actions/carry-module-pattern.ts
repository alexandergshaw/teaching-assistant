"use server";

// Chunk D of the Modules-view backlog (docs/carry-module-pattern-forward-
// acceptance-criteria.md - section 5 is the corrected contract, section 6
// wins over section 5 where they disagree). Agent 2C's slice: AC6, AC7, D7,
// D8, D9, D10, D13. This file is the second half of the pipeline - a plan
// (ModulePatternPlan, built by module-pattern-plan.ts, wave 1, elsewhere) has
// already decided, per target module per item, one of create/skip/overwrite/
// blocked-unnumbered, with a resolved title and a resolved due date. This
// file GENERATES the body for every "create" row with an LLM, then WRITES the
// result to Canvas. It reads module-template.ts's and module-pattern-plan.ts's
// exported TYPES to join their two halves; it does not import or reimplement
// any of the inference/transposition logic those files own.
//
// D5 / AC4 (THE DEFINING CONSTRAINT THIS FILE MUST NOT VIOLATE): this file
// must be STRUCTURALLY INCAPABLE of computing a deadline. Every `dueAtIso` it
// touches is a caller-supplied ISO string (or null) already produced by
// module-pattern-transpose.ts (a browser-side pure module, per that file's own
// header) and threaded through module-pattern-plan.ts's plan - this file
// forwards it verbatim to createCourseAssignmentAction / addContentToModule-
// Detailed and never decomposes, recomposes, or reformats it. Concretely:
//   - This file has no import of `@/lib/assignment-due-rule` or of
//     `@/lib/module-pattern-transpose`, direct or otherwise.
//   - `.toISOString(` appears nowhere below.
// The guard test (carry-module-pattern.test.ts) scans this file's own source
// text for exactly that, mirroring current-events-assignments.test.ts's D4
// guard byte-for-byte in technique. Why this matters and is not theatre:
// `dueDateForWeek` builds a local wall-clock Date, `.toISOString()` encodes
// the CALLING PROCESS's offset, Vercel runs UTC, and `createGradable` /
// `createAssignment` append `due_at` with no server-side re-normalisation - a
// server-computed instant reaches Canvas hours off for every instructor in
// the Americas, and nothing in tsc/eslint/vitest/next build can see that
// class of bug (docs/REGRESSION.md entry 328, and its decomposition mirror,
// D5 above). This file never has the chance to make that mistake because it
// never touches a Date at all.
//
// AC7 (generation shape) / AC8 (titles are code-derived): ONE LLM call PER
// TARGET ITEM, fanned out with Promise.allSettled - never one call returning
// N bodies (a single call fails as a unit and truncates on a long course).
// `requireOwner()` and the course-row resolve each run EXACTLY ONCE for the
// whole apply, regardless of how many items fan out - copied from
// current-events-assignments.ts's own D3, which solves the identical problem
// one scope down. The generator below returns `{ body: string }` ONLY - no
// title field exists on its result type anywhere in this file. The title is
// ALWAYS `item.resolvedTitle`, already computed by module-pattern-plan.ts from
// the inferred/authored pattern (AC8's idempotency key) - a model-authored
// title would differ between runs and the plan's by-title skip check would
// never match, duplicating every re-run.
//
// TWO PHASES, NEVER INTERLEAVED (AC7): phase 1 generates every eligible
// item's body concurrently; phase 2 writes to Canvas STRICTLY SEQUENTIALLY
// (Canvas throttles bursts), one item at a time, in plan order. This keeps a
// generation failure and a Canvas failure two separate, distinguishable
// outcome classes all the way to the returned list (AC6) - a generation
// failure never even reaches the write phase for that item, and a write
// failure can never be misreported as "the model returned nothing".
//
// D7 (THE WRITE PATH DIFFERS BY KIND, DELIBERATELY): `addContentToModule-
// Detailed` (moduleContentActions.ts) reaches `createGradable`, which writes
// NONE of the six write-only fields (unlock_at, lock_at, allowed_attempts,
// assignment_group_id, allowed_extensions, peer_reviews) for any kind, and
// cannot write `submission_types` at all for Quiz/Discussion. The richer path,
// `createCourseAssignmentAction` (-> `createAssignment`), can carry points,
// submission types, due date, and published state together, and links the
// module item in the same call - so THIS FILE uses it for Assignments only,
// and additionally associates a carried rubric afterward (bulkAssociateRubric-
// Action), the one thing that path does not do for you but AC3 promises.
// Quizzes and Discussions go through addContentToModuleDetailed and accept
// the reduced set D7 documents (module-template.ts's `notCarried` already
// states this per kind for the UI; this file does not re-decide it, only
// carries the consequence in which function it calls).
//
// D8: this file never re-derives points/due-date/published from `getGradable`
// alone - it reads them off the TemplateItem the reader already merged
// (module-template.ts's own D8 fix), via `sourceItem` below.
//
// D9 (OUR OWN FEATURE IS THE TRAP): a Discussion this reader could not rule
// out as checkpointed (`checkpointsUnknown: true`, set for every Discussion-
// kind TemplateItem since no read for the checkpoint structure exists
// anywhere in this codebase) is REFUSED here, never carried silently. Chosen
// explicitly over "carry the flat discussion and just disclose the loss in
// the outcome": a checkpointed intro discussion (chunk A, entry 328) is
// exactly the kind of item most likely to sit in week one's template module,
// and a Thursday/Sunday split silently dropped in N target modules is worse
// than N modules NOT getting that one discussion, which the instructor can
// still add by hand. The outcome status `refused-checkpoint-unknown` keeps
// this reason distinguishable from every other failure class (AC6).
//
// D10 (as fixed, step-10 fixer round C3): `position` and `indent` (both
// already on `AddContentOpts` as of this wave) are threaded straight from
// `sourceItem.position` / `sourceItem.indent` into every
// addContentToModuleDetailed call below, so a target module reproduces the
// template's item order and nesting - AND, as of this fix,
// `createCourseAssignmentAction` (canvas-modules.ts) also accepts a 5th,
// optional `moduleItemPlacement` argument threaded into its own module-item
// link call the same way. `applyAssignment` below passes
// `{ position: sourceItem.position, indent: sourceItem.indent }` as that
// argument, so Assignments carried through the richer path land at the
// template's own position/indent too, exactly like every other kind this
// file writes. (Before this fix, that path had no such argument at all and
// every carried Assignment landed at Canvas's own default position - the
// original version of this comment described that gap; it is closed now.)
//
// D13: an item with no `dueAt` is not blocked - the plan (module-pattern-
// plan.ts) already applied the course's own assignmentDueRule fallback via
// transposeModuleItemDueDate before this file ever sees `dueAtIso`. This file
// treats `dueAtIso: null` as simply "no due date to send" - it never
// distinguishes "the source had none" from "the course has no due rule
// either" (module-pattern-plan.ts already collapsed that per D13), and never
// falls back to a rule of its own.
//
// AC6 (per-object failure is per-object): every row in the plan produces
// exactly one outcome, and the outcome vocabulary keeps every failure class
// distinct - a skipped/blocked plan decision, a refused checkpoint, an
// unsupported item kind, a generation failure, a Canvas write failure, an
// orphaned write (content created, module link failed), and success. Reuses
// `ModuleContentResult` from moduleContentActions.ts directly (that file has
// no "use client" directive - a plain shared module, safe to import from a
// "use server" action file) rather than re-spelling its three-way shape.
// `describeOrphans`/`OrphanNote` (useBulkModuleActions.ts) were read as
// directed by this brief, but that file is a "use client" React hook module
// under content-tab/ - no action file anywhere in this codebase imports FROM
// content-tab/ (every dependency in this app runs the other way, components
// importing actions), and reaching into a "use client" module from a
// "use server" file to call a plain function is untested here and would
// invert that layering for no benefit. A local restatement was considered
// too, but a "use server" file may export ONLY async functions
// (use-server-exports.test.ts enforces this) and an orphan-note formatter
// has no reason to be async - so it cannot live here as an export either.
// The `status: "orphaned"` variant on `CarryModulePatternApplyOutcome` below
// carries everything a caller needs (kind/title/contentId) to build its own
// one-line note exactly the way describeOrphans does; that formatter belongs
// beside the client hook that consumes this action's result, not in this
// file. See this file's dispatch report for this correction to the brief's
// reuse note.
//
// CORRECTED (step-10 fixer round, C5): the claim above was FALSE for the
// Assignment path until this round's fix. `createCourseAssignmentAction`
// creates the assignment first and links it second; a link failure used to
// throw up through this function's own outer catch as a bare `{ error }`,
// discarding the created assignment's id entirely - `applyAssignment` below
// then reported `write-failed` ("Canvas rejected this item"), which was
// factually wrong (Canvas HAD accepted it), and the "orphaned" branch for
// Assignments was unreachable code. `createCourseAssignmentAction` now
// separates create from link (see its own header in canvas-modules.ts) and
// reports a link failure as `linkError` alongside the real id, which
// `applyAssignment` below turns into a genuine "orphaned" outcome. The claim
// is now true for every kind this file writes.

import { requireOwner } from "@/lib/supabase/auth";
import { resolveGenerationCourseRow } from "./lms-generation-course-row";
import { resolveCourseKind, courseKindContract, courseKindNoun, type CourseKind } from "@/lib/course-kind";
import { PLAIN_LANGUAGE_CONTRACT } from "@/lib/artifact-voice";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { stripModelUrls } from "@/lib/urls";
import { createCourseAssignmentAction } from "./canvas-modules";
import { bulkAssociateRubricAction } from "./canvas-files-bulk";
import { addContentToModuleDetailed, type ModuleContentResult } from "../components/content-tab/modules/moduleContentActions";
import type { ModuleTemplate, TemplateItem } from "./module-template";
import { DISCUSSION_CHECKPOINTS_UNREADABLE_REASON } from "@/lib/module-template-shape";
import { isCarryWriteSupportedKind } from "@/lib/module-pattern-plan";
import type { ModulePatternPlan, ModulePatternPlanItem, ModulePatternPlanTargetResult } from "@/lib/module-pattern-plan";

// Item kinds this file can regenerate a body for (all four carry a
// `description`/body field on TemplateItem - module-template.ts's own D8
// merge). Every other kind either needs no body (SubHeader) or can only
// reasonably carry forward by REFERENCE, not regeneration (File - see
// `applyPassthroughItem` below).
const GENERATABLE_KINDS: readonly string[] = ["Page", "Assignment", "Quiz", "Discussion"];

function isGeneratableKind(type: string): boolean {
  return GENERATABLE_KINDS.includes(type);
}

// ---- Generation (phase 1) ----

/** Context for one target item's body generation - deliberately carries no
 * date, week number, or anything derived from either (D5's guard). The
 * resolved title is included for prompt grounding ONLY (so the model writes
 * content that matches the title it will be posted under) - it is never
 * returned by the generator (AC8). */
export interface CarryModulePatternBodyContext {
  courseName: string;
  courseCode: string | null;
  institution: string | null;
  courseDescription: string | null;
  topicOutline: string | null;
  targetModuleName: string;
  /** Page | Assignment | Quiz | Discussion - see GENERATABLE_KINDS. */
  itemType: string;
  resolvedTitle: string;
  sourceTitle: string;
  /** The template item's own body/description, used as a TOPIC SEED for what
   * this item is about - never carried forward verbatim (the AC's "content
   * regenerated per target module, not a verbatim copy"). May be null. */
  sourceDescription: string | null;
}

function buildCarryContextBlock(ctx: CarryModulePatternBodyContext): string {
  const lines: string[] = [];
  lines.push(`COURSE: ${ctx.courseName}${ctx.courseCode ? ` (${ctx.courseCode})` : ""}`);
  if (ctx.institution) lines.push(`INSTITUTION: ${ctx.institution}`);
  if (ctx.courseDescription) lines.push(`COURSE DESCRIPTION: ${ctx.courseDescription}`);
  if (ctx.topicOutline) lines.push(`COURSE TOPICS: ${ctx.topicOutline}`);
  lines.push(`THIS ITEM BELONGS TO MODULE: ${ctx.targetModuleName}`);
  lines.push(`ITEM TYPE: ${ctx.itemType}`);
  lines.push(`ITEM TITLE (already decided - do not restate a different title): ${ctx.resolvedTitle}`);
  lines.push(`THE TEMPLATE ITEM THIS ONE IS PATTERNED AFTER WAS TITLED: ${ctx.sourceTitle}`);
  lines.push(
    ctx.sourceDescription
      ? `THE TEMPLATE ITEM'S OWN BODY (for topic/shape reference only - do not copy it verbatim, write NEW content for this module's own topic):\n${ctx.sourceDescription}`
      : "THE TEMPLATE ITEM HAD NO BODY TEXT TO REFERENCE - write new content appropriate for this item's title and type."
  );
  return lines.join("\n");
}

/** Deterministic Embedded Engine scaffold - every non-model provider still
 * returns real, grounded content, never a stub (same precedent as every
 * other generator in this app). States no date or point value, matching the
 * model path's own restriction below. */
function scaffoldCarryModulePatternBody(ctx: CarryModulePatternBodyContext): string {
  const lines = [
    `This ${ctx.itemType.toLowerCase()} is part of ${ctx.targetModuleName} in ${ctx.courseName}.`,
    `It follows the same shape as "${ctx.sourceTitle}" from the module this course's pattern was carried forward from, adapted to this module's own topic.`,
  ];
  if (ctx.sourceDescription) {
    lines.push("Work through the material for this module and complete the corresponding task for this item, following the same expectations as the item it was patterned after.");
  }
  return lines.join("\n\n");
}

/**
 * Generate ONE target item's body. A plain async export with no "use server"
 * directive of its own (this file's exported actions call it, once per item,
 * inside a Promise.allSettled fan-out - AC7) - shaped after
 * current-events-assignment-generator.ts's generateCurrentEventsAssignment-
 * ForModule, the sibling generator this brief's header points at.
 */
export async function generateCarryModulePatternBody(
  ctx: CarryModulePatternBodyContext,
  provider: LlmProvider = "gemini",
  courseKind: CourseKind = "coding"
): Promise<{ body: string } | { error: string }> {
  if (provider === "embedded") {
    const scaffolded = stripModelUrls(scaffoldCarryModulePatternBody(ctx)).trim();
    if (!scaffolded) {
      return { error: `Carry-forward generation for "${ctx.resolvedTitle}" contained no content once invented links were removed.` };
    }
    return { body: scaffolded };
  }

  const prompt = `You are an expert educator writing the body/description for a ${ctx.itemType} in a ${courseKindNoun(courseKind)}.

${courseKindContract(courseKind)}

${buildCarryContextBlock(ctx)}

Write the body text for this item, grounded in the actual context above (never generic filler), covering the same kind of task as the template item but about THIS module's own topic - do not just swap a number into the template item's own wording.

CONTEXT ONLY, DO NOT WRITE THIS INTO YOUR PROSE: do not state a specific due date, deadline, or point value anywhere in your own text. Canvas already carries the real due date and point value as structured fields; restating one in your prose risks it drifting out of sync with the real value. Write only the item's own body content, then stop.

Do not use angle brackets ("<" or ">") anywhere in your response.

${PLAIN_LANGUAGE_CONTRACT}

Return ONLY the item body as plain text paragraphs - no JSON, no markdown headers, no title, no preamble, no commentary about being an AI.`;

  const result = await callLlm(
    { contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 1024 } },
    provider
  );

  if (!result.ok) {
    return { error: `LLM API error generating "${ctx.resolvedTitle}": HTTP ${result.status} - ${result.body.slice(0, 200)}` };
  }
  if (!result.text.trim()) {
    return { error: `Carry-forward generation returned empty response for "${ctx.resolvedTitle}".` };
  }

  // Backstop: a response that ignored the "do not restate" instruction and
  // states a specific deadline/points value in its own prose is NOT
  // line-stripped here (unlike the current-events generator, this file does
  // not attempt that pattern-based restatement strip - see this file's
  // dispatch report for why that was left as a follow-up). Only the
  // invented-link and angle-bracket backstops are applied unconditionally.
  const withoutAngleBrackets = result.text.trim().replace(/[<>]/g, "");
  const strippedBody = stripModelUrls(withoutAngleBrackets).trim();

  if (!strippedBody) {
    return { error: `Carry-forward generation for "${ctx.resolvedTitle}" contained no content once invented links were removed.` };
  }

  return { body: strippedBody };
}

// ---- Apply (phase 2): join the plan with the source template, then write ----

/** One outcome per (target module, item) row the plan produced - AC6's
 * per-object discipline. Every status is mutually exclusive and every
 * variant that can fail carries its own `reason`, never a shared one. */
export type CarryModulePatternApplyOutcome =
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "skipped" }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "blocked"; reason: string }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "overwrite-not-implemented"; reason: string }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "refused-checkpoint-unknown"; reason: string }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "refused-external-tool"; reason: string }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "unsupported-kind"; reason: string }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "generation-failed"; reason: string }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "write-failed"; reason: string }
  | {
      targetModuleId: number;
      targetModuleName: string;
      itemId: number;
      itemType: string;
      status: "orphaned";
      kind: string;
      title: string;
      contentId?: number | string;
    }
  | { targetModuleId: number; targetModuleName: string; itemId: number; itemType: string; status: "success"; resolvedTitle: string };

type ApplyRow = {
  target: ModulePatternPlanTargetResult;
  item: ModulePatternPlanItem;
  sourceItem: TemplateItem | undefined;
};

function outcomeBase(row: ApplyRow) {
  return {
    targetModuleId: row.target.targetModuleId,
    targetModuleName: row.target.targetModuleName,
    itemId: row.item.itemId,
    itemType: row.item.itemType,
  };
}

/** Write one non-generatable item (SubHeader: no body at all; File: carried
 * by REFERENCE to the same underlying Canvas file, exactly as AC3 carries a
 * rubric by association rather than cloning it) through addContentToModule-
 * Detailed, positioned per D10. Returns null when this kind cannot be
 * written by any path this file has - the caller turns that into
 * "unsupported-kind". */
async function applyPassthroughItem(
  courseUrl: string,
  acronym: string | undefined,
  row: ApplyRow,
  sourceItem: TemplateItem
): Promise<ModuleContentResult | null> {
  if (sourceItem.type === "SubHeader") {
    return addContentToModuleDetailed(courseUrl, acronym, "SubHeader", row.target.targetModuleId, row.item.resolvedTitle ?? sourceItem.title, {
      position: sourceItem.position,
      indent: sourceItem.indent,
    });
  }
  if (sourceItem.type === "File") {
    if (sourceItem.contentId == null) return null;
    return addContentToModuleDetailed(courseUrl, acronym, "File", row.target.targetModuleId, row.item.resolvedTitle ?? sourceItem.title, {
      fileId: sourceItem.contentId,
      position: sourceItem.position,
      indent: sourceItem.indent,
    });
  }
  return null;
}

/** Write one Quiz or Discussion (D7's reduced-set path) through
 * addContentToModuleDetailed, with the generated body and D10's
 * position/indent. */
async function applyGradableViaDetailed(
  courseUrl: string,
  acronym: string | undefined,
  row: ApplyRow,
  sourceItem: TemplateItem,
  body: string
): Promise<ModuleContentResult> {
  return addContentToModuleDetailed(courseUrl, acronym, sourceItem.type, row.target.targetModuleId, row.item.resolvedTitle as string, {
    description: body,
    points: sourceItem.pointsPossible ?? undefined,
    dueAt: row.item.dueAtIso,
    position: sourceItem.position,
    indent: sourceItem.indent,
  });
}

/** Write one Page through addContentToModuleDetailed, with the generated
 * body and D10's position/indent. */
async function applyPage(
  courseUrl: string,
  acronym: string | undefined,
  row: ApplyRow,
  sourceItem: TemplateItem,
  body: string
): Promise<ModuleContentResult> {
  return addContentToModuleDetailed(courseUrl, acronym, "Page", row.target.targetModuleId, row.item.resolvedTitle as string, {
    description: body,
    position: sourceItem.position,
    indent: sourceItem.indent,
  });
}

/** Write one Assignment through the richer path (D7) - points, submission
 * type, due date and published state together, plus a carried rubric
 * ASSOCIATION afterward (AC3) - never carried by cloning. D10 (fixed this
 * round, C3): `sourceItem.position`/`sourceItem.indent` are threaded through
 * `createCourseAssignmentAction`'s `moduleItemPlacement` argument, so an
 * Assignment reproduces the template's order/nesting exactly like every
 * other kind this file writes.
 *
 * C5 (fixed this round): `createCourseAssignmentAction` creates the
 * assignment and links it in two separate steps internally. A link failure
 * no longer discards the created assignment's id as a bare `{ error }` - it
 * comes back as `linkError` alongside the real `id`/`name`, which this
 * function turns into a genuine "orphaned" outcome (kind/title/contentId),
 * exactly the shape moduleContentActions.ts's own create-then-link paths
 * already use. Never auto-deleted - entry 258 check 11's reasoning applies
 * unchanged (see canvas-modules.ts's own header on this function). */
async function applyAssignment(
  courseUrl: string,
  acronym: string | undefined,
  row: ApplyRow,
  sourceItem: TemplateItem,
  body: string
): Promise<ModuleContentResult> {
  const created = await createCourseAssignmentAction(
    courseUrl,
    {
      name: row.item.resolvedTitle as string,
      description: body,
      pointsPossible: sourceItem.pointsPossible,
      dueAt: row.item.dueAtIso ?? "",
      submissionType: sourceItem.submissionTypes[0] ?? "online_text_entry",
      published: sourceItem.published,
    },
    row.target.targetModuleId,
    acronym,
    { position: sourceItem.position, indent: sourceItem.indent }
  );
  if ("error" in created) return { status: "failed" };
  if (created.linkError !== undefined) {
    // The assignment WAS created in Canvas; only the module link failed.
    // Surfacing it as "orphaned" (never auto-deleted, entry 258 check 11)
    // is the only honest outcome - reporting "write-failed" here would be
    // factually wrong (Canvas accepted it) and would lose the id a human
    // needs to find it.
    return { status: "orphaned", kind: "Assignment", title: created.name, contentId: created.id, detail: created.linkError };
  }
  if (sourceItem.rubricId != null) {
    await bulkAssociateRubricAction(courseUrl, sourceItem.rubricId, [String(created.id)], acronym);
  }
  return { status: "success" };
}

/**
 * Apply a whole ModulePatternPlan: generate every "create" row's body (phase
 * 1, fanned out with Promise.allSettled - AC7), then write every row to
 * Canvas STRICTLY SEQUENTIALLY in plan order (phase 2, D7's per-kind write
 * path). `requireOwner()` and the course-row resolve each run exactly once
 * (AC7) regardless of how many rows the plan carries. Non-write outcomes
 * (skip, blocked, overwrite, refused-checkpoint, unsupported-kind) are
 * decided up front with no model spend and no Canvas call, and every row -
 * written or not - produces exactly one outcome (AC6).
 */
export async function applyModulePatternCarryAction(
  courseUrl: string,
  source: ModuleTemplate,
  plan: ModulePatternPlan,
  provider: LlmProvider = "gemini",
  exportCourseId?: string,
  acronym?: string
): Promise<{ outcomes: CarryModulePatternApplyOutcome[] } | { error: string }> {
  try {
    await requireOwner();

    const resolved = await resolveGenerationCourseRow(courseUrl, exportCourseId, acronym);
    if ("error" in resolved) return { error: resolved.error };
    const course = resolved.course;
    const courseKind = resolveCourseKind(course.courseKind);

    const sourceById = new Map<number, TemplateItem>(source.items.map((it) => [it.id, it]));

    const rows: ApplyRow[] = [];
    for (const target of plan.targets) {
      for (const item of target.items) {
        rows.push({ target, item, sourceItem: sourceById.get(item.itemId) });
      }
    }

    // Every row that is not an eligible "create" is decided immediately -
    // AC7's "idempotency pre-check runs before any model spend", generalized
    // to every non-write class this file recognizes.
    const outcomes: (CarryModulePatternApplyOutcome | null)[] = new Array(rows.length).fill(null);
    const generationQueue: number[] = []; // indices into `rows` needing a body
    const passthroughQueue: number[] = []; // indices into `rows` needing no body

    rows.forEach((row, index) => {
      const base = outcomeBase(row);
      if (row.item.decision === "skip") {
        outcomes[index] = { ...base, status: "skipped" };
        return;
      }
      if (row.item.decision === "blocked-unnumbered") {
        outcomes[index] = { ...base, status: "blocked", reason: row.item.blockedMessage ?? "This item could not be resolved to a title for this target." };
        return;
      }
      if (row.item.decision === "overwrite") {
        outcomes[index] = {
          ...base,
          status: "overwrite-not-implemented",
          reason:
            "Overwrite is decided by the plan but this write path only creates new content - updating the matched existing item in place needs an update-in-place Canvas call this file does not have yet. Reported rather than silently creating a duplicate.",
        };
        return;
      }

      // decision === "create" from here on.
      if (!row.sourceItem) {
        outcomes[index] = { ...base, status: "write-failed", reason: "The source item's detail is unavailable (a template read failure or a stale plan)." };
        return;
      }
      if (row.sourceItem.type === "Discussion" && row.sourceItem.checkpointsUnknown) {
        outcomes[index] = {
          ...base,
          status: "refused-checkpoint-unknown",
          // C7 (step-10 review): quotes module-template-shape.ts's shared
          // wording rather than re-describing the limitation locally, so
          // this outcome and CarryModulePatternReviewModal.tsx's copy cannot
          // drift apart. The OLD wording here ("this discussion MAY carry a
          // ... split") was dishonest - to an instructor whose discussion
          // has no checkpoint at all, a conditional reads as this app's own
          // bug. The true reason is unconditional: THIS APP cannot read ANY
          // discussion's checkpoint structure back from Canvas, so every
          // discussion is refused rather than risk flattening a checkpointed
          // one silently.
          reason: DISCUSSION_CHECKPOINTS_UNREADABLE_REASON,
        };
        return;
      }
      // S1 (step-10 fixer round, VERIFY-THEN-DECIDE): `applyAssignment` below
      // carries only `submissionTypes[0]` - the app-wide convention every
      // other Assignment-writing caller in this codebase already follows
      // (`NewAssignment.submissionType` is a single string, not a list, and
      // `createAssignment` (src/lib/canvas-modules/assignments.ts:18) sends
      // exactly one `assignment[submission_types][]`). Widening that to carry
      // every type on `submissionTypes` would mean changing `NewAssignment`
      // and `createAssignment` themselves - both outside this file's and this
      // round's three-file ownership, and both used by every other Assignment
      // creation path in the app, not just this one. So a source assignment
      // with `["online_upload","online_text_entry"]` still carries only the
      // first, same as before, and that narrowing is disclosed by AC3's own
      // "not carried" framing rather than fixed here.
      //
      // `external_tool` is different in kind, not degree, and IS fixed here:
      // read `createAssignment` and it never sends
      // `external_tool_tag_attributes` for any submission type, so an
      // assignment whose FIRST submission type is `external_tool` (an LTI
      // launch) would be posted to Canvas with no launch URL at all. Canvas
      // very likely 400s that, which `applyAssignment`'s caller reports as a
      // bare "Canvas rejected this item" (write-failed) - true but useless,
      // since it looks identical to every other unrelated rejection. And
      // this app has no read path for the LTI launch URL to recreate it
      // faithfully, and silently carrying it as `online_text_entry` would
      // change what students are asked to do without saying so. Refusing up
      // front, before any model spend, with a reason that names exactly why,
      // is more honest than either guess - the same judgement D9 already
      // applied to a checkpointed discussion this app cannot read back.
      if (row.sourceItem.type === "Assignment" && row.sourceItem.submissionTypes[0] === "external_tool") {
        outcomes[index] = {
          ...base,
          status: "refused-external-tool",
          reason:
            "This assignment's submission type is an external tool (LTI), which needs a launch URL this app cannot read back from Canvas and therefore cannot recreate; carrying it as a plain text-entry assignment would silently change what students are asked to do, so it is refused rather than guessed at.",
        };
        return;
      }
      // Checked as this fix was written and confirmed present:
      // `isCarryWriteSupportedKind` (module-pattern-plan.ts, exported by the
      // sibling fixer who owns that file, per this round's brief) states,
      // per item, whether ANY write path this app has wired can create it -
      // false for exactly ExternalUrl, ExternalTool (the module-item kind,
      // unrelated to the Assignment submission-type check above), and a File
      // with no `contentId`. Imported directly rather than re-spelling that
      // set here, so the plan's own review (which already carries the same
      // answer per row as `ModulePatternPlanItem.writeSupported`) and this
      // apply step cannot silently drift apart about which kinds can be
      // written - the exact hazard this round's brief called out.
      if (!isCarryWriteSupportedKind(row.sourceItem.type, row.sourceItem.contentId)) {
        outcomes[index] = {
          ...base,
          status: "unsupported-kind",
          reason: `No write path is wired for "${row.sourceItem.type}" items in the carry-forward feature yet.`,
        };
        return;
      }
      if (isGeneratableKind(row.sourceItem.type)) {
        generationQueue.push(index);
        return;
      }
      // The predicate above already excluded every kind this file cannot
      // write, so anything reaching here is SubHeader or a File that has a
      // `contentId` - the two supported kinds with no body to generate.
      passthroughQueue.push(index);
    });

    // Phase 1: generate every queued body concurrently - AC7.
    const generated = await Promise.allSettled(
      generationQueue.map((index) => {
        const row = rows[index];
        const sourceItem = row.sourceItem as TemplateItem;
        const ctx: CarryModulePatternBodyContext = {
          courseName: course.name,
          courseCode: course.courseCode,
          institution: course.institution,
          courseDescription: course.description,
          topicOutline: course.topicOutline,
          targetModuleName: row.target.targetModuleName,
          itemType: sourceItem.type,
          resolvedTitle: row.item.resolvedTitle as string,
          sourceTitle: sourceItem.title,
          sourceDescription: sourceItem.description,
        };
        return generateCarryModulePatternBody(ctx, provider, courseKind);
      })
    );

    const bodyByIndex = new Map<number, string>();
    generated.forEach((outcome, i) => {
      const index = generationQueue[i];
      const row = rows[index];
      const base = outcomeBase(row);
      if (outcome.status === "rejected") {
        const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        outcomes[index] = { ...base, status: "generation-failed", reason };
        return;
      }
      if ("error" in outcome.value) {
        outcomes[index] = { ...base, status: "generation-failed", reason: outcome.value.error };
        return;
      }
      bodyByIndex.set(index, outcome.value.body);
    });

    // Phase 2: write to Canvas STRICTLY SEQUENTIALLY, in plan order - Canvas
    // throttles bursts, and this keeps generation failures and write
    // failures as two separate lists all the way to the caller (AC6).
    const writeIndices = [...generationQueue.filter((index) => bodyByIndex.has(index)), ...passthroughQueue].sort((a, b) => a - b);

    for (const index of writeIndices) {
      const row = rows[index];
      const sourceItem = row.sourceItem as TemplateItem;
      const base = outcomeBase(row);
      const body = bodyByIndex.get(index) ?? "";

      let result: ModuleContentResult | null;
      try {
        if (sourceItem.type === "Assignment") {
          result = await applyAssignment(courseUrl, acronym, row, sourceItem, body);
        } else if (sourceItem.type === "Quiz" || sourceItem.type === "Discussion") {
          result = await applyGradableViaDetailed(courseUrl, acronym, row, sourceItem, body);
        } else if (sourceItem.type === "Page") {
          result = await applyPage(courseUrl, acronym, row, sourceItem, body);
        } else {
          result = await applyPassthroughItem(courseUrl, acronym, row, sourceItem);
        }
      } catch (err) {
        outcomes[index] = { ...base, status: "write-failed", reason: err instanceof Error ? err.message : "Could not write this item to Canvas." };
        continue;
      }

      if (result === null) {
        outcomes[index] = { ...base, status: "unsupported-kind", reason: `No write path is wired for "${sourceItem.type}" items in the carry-forward feature yet.` };
        continue;
      }
      if (result.status === "success") {
        outcomes[index] = { ...base, status: "success", resolvedTitle: row.item.resolvedTitle as string };
      } else if (result.status === "orphaned") {
        outcomes[index] = { ...base, status: "orphaned", kind: result.kind, title: result.title, contentId: result.contentId };
      } else {
        outcomes[index] = { ...base, status: "write-failed", reason: "Canvas rejected this item." };
      }
    }

    return { outcomes: outcomes.map((o, i) => o ?? { ...outcomeBase(rows[i]), status: "write-failed" as const, reason: "This row was never resolved to an outcome - an internal bug." }) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not apply the module pattern carry-forward plan." };
  }
}
