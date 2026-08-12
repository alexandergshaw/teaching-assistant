"use server";

// Server actions for the two one-click LMS-tab buttons
// (docs/lms-tab-syllabus-buttons-acceptance-criteria.md): a Syllabus
// Acknowledgement quiz, and generating + inserting the course syllabus. Both
// resolve their course row from the tab's Canvas URL the same way (AC S1/S2)
// via the shared resolveLmsCourseRowAction below, so that lookup and its "not
// linked" message live once instead of being copy-pasted into each action.
//
// Every Canvas/library write below reuses an already-existing, already-proven
// action (see the reuse survey in the AC doc) - this file only sequences
// them; no new Canvas client code is added anywhere in this feature.
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { courseToInputPayload } from "@/lib/workflows/registry-helpers";
import { buildSyllabusFactsFromCourse, resolveSyllabusTemplateId } from "@/lib/syllabus-facts";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { findCourseForCanvasUrl } from "@/lib/course-canvas-url-match";
import { computeSyllabusAckDueAt, findExistingAckQuiz, syllabusAckTaskPatch, SYLLABUS_ACK_QUIZ_TITLE } from "@/lib/syllabus-ack-quiz";
import { listCourseTasksAction, setCourseTaskCellsAction } from "./course-tasks";
import { resolveModuleForSyllabusPlacement } from "@/lib/lms-start-here-module";
import { syllabusQuizLinkDecision, type SyllabusQuizLinkDecision } from "@/lib/syllabus-ack-quiz-target";
import { planModuleTarget, type ModuleTarget } from "@/lib/lms-generation/commit-plan";
import type { LlmProvider } from "@/lib/llm";
import type { Course } from "@/lib/supabase/courses";
import type { CanvasModule } from "@/lib/canvas-modules";
import { listCourseHubAction, updateCourseHubAction } from "./course-hub-core";
import { createGradableAction, createQuizQuestionAction, bulkUpdateAction, listBulkItemsAction } from "./canvas-files-bulk";
import { listCourseContentAction, createModuleAction, createModuleItemAction, placeSyllabusInModuleAction } from "./canvas-modules";
import { generateCourseSyllabusAction, createFinalizedSyllabusAction, createSyllabusTemplateAction } from "./syllabus-templates";

/** AC S2: both buttons report a specific, actionable message naming the URL
 * when no course row is linked to it - never a generic failure. Shared so
 * the wording can never drift between the two buttons. Not exported (a "use
 * server" module may export only async functions - src/lib/use-server-exports.test.ts). */
function courseNotLinkedError(canvasUrl: string): { error: string } {
  return {
    error: `No saved course is linked to ${canvasUrl}. Set this course's Canvas URL on its course row, then try again.`,
  };
}

/** The course's base "…/courses/<id>" URL, for building direct Canvas links -
 * same regex ModulesView.tsx already uses for its own "Open on Canvas"
 * links. Not exported. */
function courseBaseUrl(canvasUrl: string): string {
  return canvasUrl.replace(/(\/courses\/\d+).*$/, "$1");
}

/**
 * AC S1: resolve the LMS tab's currently loaded Canvas course to a saved
 * course row, matching on parseCanvasCourseId(url) AND host (never raw
 * string equality - see course-canvas-url-match.ts) so a trailing slash or a
 * query string does not defeat it. Returns the row or an explicit,
 * URL-naming not-found (AC S2) - never throws. Exported as its own action per
 * AC S1, and also called directly (as a plain function - both live in this
 * same "use server" module, so this is an ordinary in-process call, not a
 * second network round trip) by both button actions below, so the lookup and
 * its "not linked" wording exist in exactly one place.
 */
export async function resolveLmsCourseRowAction(canvasUrl: string): Promise<{ course: Course } | { error: string }> {
  try {
    await requireOwner();
    const hub = await listCourseHubAction();
    if ("error" in hub) return { error: hub.error };
    const course = findCourseForCanvasUrl(hub.courses, canvasUrl);
    if (!course) return courseNotLinkedError(canvasUrl);
    return { course };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve the course." };
  }
}

/**
 * Mark the built-in "Syllabus Acknowledgement Quiz Added?" term task done for
 * this course, and describe the outcome as a fragment to append to the
 * button's own message.
 *
 * NEVER throws and never turns a failure here into a failed button. The quiz
 * genuinely exists in Canvas by the time this runs, so reporting the whole
 * press as failed because a checklist write did not land would be a worse lie
 * than the checklist being briefly stale. The fragment says so plainly rather
 * than staying silent.
 *
 * Not exported: a "use server" module may export only async functions that are
 * genuine server actions, and this is an internal helper.
 */
async function markSyllabusAckTaskDone(courseId: string): Promise<string> {
  try {
    const listed = await listCourseTasksAction();
    if ("error" in listed) return ` (could not update the Tasks checklist: ${listed.error})`;

    const record = listed.records.find((r) => r.courseId === courseId);
    const patch = syllabusAckTaskPatch(record?.statuses, Date.now());
    // Already done - no write, and nothing worth saying in the message.
    if (!patch) return "";

    const saved = await setCourseTaskCellsAction(courseId, patch);
    if ("error" in saved) return ` (could not update the Tasks checklist: ${saved.error})`;
    return `, Tasks checklist updated`;
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    return ` (could not update the Tasks checklist: ${detail})`;
  }
}

/**
 * The module an already-existing acknowledgement quiz currently sits in, by
 * scanning every module's items for a Quiz item whose contentId is this
 * quiz's id - CanvasModule.items is the only place Canvas records that
 * relationship (there is no "which module is this quiz in" lookup by quiz id
 * alone). Null when the quiz is not linked into any module yet. Not
 * exported: an internal helper, same as markSyllabusAckTaskDone above.
 */
function findAckQuizModule(modules: CanvasModule[], quizId: number): { id: number; name: string } | null {
  for (const m of modules) {
    if (m.items.some((item) => item.type === "Quiz" && item.contentId === quizId)) {
      return { id: m.id, name: m.name };
    }
  }
  return null;
}

/**
 * Perform a "link" or "create-module-then-link" decision from
 * syllabusQuizLinkDecision (AC4/AC5): resolve it through planModuleTarget -
 * reused verbatim, including its case/trim-insensitive reuse-by-name
 * collision check, which is the only thing standing between a second press
 * and a course full of duplicate modules (createModuleAction has no
 * Canvas-side idempotency of its own) - then create the module if
 * planModuleTarget says to, and link the quiz into whatever module id that
 * resolves to. `modules` is the course's already-loaded module list when the
 * caller has one (the already-exists path always does, by the time it calls
 * this); omitted, this fetches it itself (the freshly-created-quiz path has
 * had no reason to read course content before this point).
 *
 * Never throws - a Canvas failure at any step is reported in the returned
 * `reason`, matching this file's pre-existing linkNote handling (AC7 check
 * 6: a downstream failure here must never fail the whole button, since the
 * quiz itself already exists in Canvas by the time this runs).
 *
 * Both the success case AND the "link failed" case report `moduleCreated`:
 * whether `plan.action` was "create" - i.e. whether this call actually made
 * a NEW module, as opposed to linking into one that already existed. Every
 * caller that turns a failure here into a "nothing created" claim needs
 * this (REGRESSION #276 check 6): when the instructor's "New module" target
 * does not collide with an existing name, this path DOES create a module
 * before it ever attempts the link, so a module can exist even though
 * `linked` came back false - the failure is "the link call failed", never
 * proof that Canvas is untouched. `moduleName` rides along whenever
 * `moduleCreated` is true so a caller can name the module it must not
 * recreate on retry (planModuleTarget's reuse-by-name match is what makes
 * that retry safe, and it can only match a name the instructor is told).
 */
async function applyAckQuizLinkDecision(
  canvasUrl: string,
  acronym: string | undefined,
  quizId: number,
  decision: Extract<SyllabusQuizLinkDecision, { action: "link" | "create-module-then-link" }>,
  modules?: CanvasModule[]
): Promise<
  | { linked: true; moduleName: string; moduleCreated: boolean }
  | { linked: false; moduleCreated: false; reason: string }
  | { linked: false; moduleCreated: true; moduleName: string; reason: string }
> {
  let moduleList = modules;
  if (!moduleList) {
    const content = await listCourseContentAction(canvasUrl, acronym);
    if ("error" in content) {
      return { linked: false, moduleCreated: false, reason: `could not load the course's modules (${content.error})` };
    }
    moduleList = content.modules;
  }

  const planTarget: ModuleTarget =
    decision.action === "link" ? { kind: "existing", moduleId: decision.moduleId } : { kind: "new", name: decision.name };
  const plan = planModuleTarget(
    planTarget,
    moduleList.map((m) => ({ id: m.id, name: m.name }))
  );
  if ("error" in plan) return { linked: false, moduleCreated: false, reason: plan.error };

  let moduleId: number;
  let moduleName: string;
  const moduleCreated = plan.action === "create";
  if (plan.action === "create") {
    const created = await createModuleAction(canvasUrl, plan.name, undefined, acronym);
    if ("error" in created) {
      // The create call itself is what failed - unlike the link failure
      // below, there is genuinely no new module in Canvas to name.
      return { linked: false, moduleCreated: false, reason: `could not create "${plan.name}" (${created.error})` };
    }
    moduleId = created.module.id;
    moduleName = created.module.name;
  } else {
    moduleId = plan.moduleId;
    moduleName = moduleList.find((m) => m.id === moduleId)?.name ?? "the chosen module";
  }

  const item = await createModuleItemAction(
    canvasUrl,
    moduleId,
    { type: "Quiz", contentId: quizId, title: SYLLABUS_ACK_QUIZ_TITLE },
    acronym
  );
  if ("error" in item) {
    const reason = `could not link it into "${moduleName}" (${item.error})`;
    // Same `moduleCreated` split as the success return below: when the plan
    // was "create", the module above already exists in Canvas by the time
    // THIS call fails, so the caller must not describe this as though
    // nothing happened - it must name the module that is now sitting there
    // unlinked.
    return moduleCreated
      ? { linked: false, moduleCreated: true, moduleName, reason }
      : { linked: false, moduleCreated: false, reason };
  }
  return { linked: true, moduleName, moduleCreated };
}

/**
 * AC1-AC4: the module-placement note for a FRESHLY CREATED quiz - `existing`
 * is always null here (nothing to report or re-home yet). AC2's floor: no
 * target chosen creates the quiz unlinked, exactly as this button always
 * has; AC6's fix lands here too - a content-fetch failure is reported as
 * what it is, never as a guess about why "Start Here" was not used.
 */
async function linkFreshAckQuiz(
  canvasUrl: string,
  acronym: string | undefined,
  quizId: number,
  target: ModuleTarget | null
): Promise<string> {
  const decision = syllabusQuizLinkDecision({ existing: null, target });
  if (decision.action === "none") {
    return `not linked into any module - ${decision.reason}`;
  }
  if (decision.action === "report-existing") {
    // Unreachable in practice: syllabusQuizLinkDecision only returns
    // "report-existing" when `existing.inModule` is set, and this call
    // always passes `existing: null` (a quiz that was JUST created cannot
    // already be sitting in a module). Handled anyway so this function's
    // return type stays a plain string rather than relying on a cast.
    return `not linked into any module - could not resolve a target`;
  }
  const outcome = await applyAckQuizLinkDecision(canvasUrl, acronym, quizId, decision);
  return outcome.linked ? `linked into "${outcome.moduleName}"` : `not linked into any module - ${outcome.reason}`;
}

/**
 * AC5/AC6: the full "already exists" outcome message for a second (or
 * later) press. Marks the term task done here too (unchanged from before
 * this feature - the task asks whether the quiz was ADDED, and the answer is
 * yes whether this press or an earlier one added it), then reports exactly
 * one of: today's original message (no target chosen, still unlinked -
 * "that stays" per AC5), where the quiz already lives (never re-homed, AC5),
 * the module it was just linked into (AC5's one addition), or - AC6's bug
 * fix - an honest account of a content-fetch failure instead of a wrong
 * guess about why it is unlinked.
 *
 * REGRESSION #276 check 6: "nothing created" is only ever a claim about the
 * QUIZ - this whole function exists because the quiz is never re-created on
 * this path. It is NOT a claim that no Canvas object of any kind was
 * created. When the chosen target is a "New module..." name that does not
 * collide with an existing one, applyAckQuizLinkDecision's `moduleCreated`
 * comes back true, and the module-just-created branch below says so by
 * name instead of repeating "nothing created" over a module it just made.
 * The same split applies when the link call itself then fails: `moduleCreated`
 * still comes back true, and the message below must still name the module
 * instead of claiming nothing exists - the earlier fix only covered the
 * success half of this same fork.
 */
async function alreadyExistsMessage(
  canvasUrl: string,
  acronym: string | undefined,
  courseId: string,
  already: { id: string },
  target: ModuleTarget | null,
  base: string
): Promise<string> {
  const task = await markSyllabusAckTaskDone(courseId);
  const url = `${base}/quizzes/${already.id}`;
  const quizId = Number(already.id);

  const content = await listCourseContentAction(canvasUrl, acronym);
  if ("error" in content) {
    // A failed check is a DIFFERENT fact from a known-absent module - say
    // "could not be checked", never anything that reads like "unlinked",
    // since the quiz may well already be linked and this call simply could
    // not see it.
    return `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - no quiz created, but whether it is linked into a module could not be checked (${content.error})${task}: ${url}`;
  }

  const decision = syllabusQuizLinkDecision({ existing: { inModule: findAckQuizModule(content.modules, quizId) }, target });

  if (decision.action === "report-existing") {
    return `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present in "${decision.moduleName}" - nothing created${task}: ${url}`;
  }
  if (decision.action === "none") {
    return `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - nothing created${task}: ${url}`;
  }

  const outcome = await applyAckQuizLinkDecision(canvasUrl, acronym, quizId, decision, content.modules);
  if (!outcome.linked) {
    // The other half of REGRESSION #276 check 6 (see this function's own
    // comment above): a link failure is only a "nothing created" failure
    // when `moduleCreated` is false. When it is true, applyAckQuizLinkDecision
    // already made a module in Canvas before the link call failed, and the
    // instructor needs that module's name, not just to know it exists - a
    // retry only reuses it instead of making a second one because
    // planModuleTarget's reuse-by-name match can see the name it was given.
    return outcome.moduleCreated
      ? `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - no quiz created, but module "${outcome.moduleName}" was created and the quiz could not be linked into it (${outcome.reason})${task}: ${url}`
      : `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - nothing created, and could not be linked (${outcome.reason})${task}: ${url}`;
  }
  return outcome.moduleCreated
    ? `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - no quiz created, but module "${outcome.moduleName}" was created and the quiz was linked into it${task}: ${url}`
    : `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - nothing created, now linked into "${outcome.moduleName}"${task}: ${url}`;
}

/**
 * Button 1 - Syllabus Acknowledgement quiz (AC B1-1..B1-8, and
 * docs/syllabus-ack-quiz-module-target-acceptance-criteria.md AC1-AC9). One
 * click on the happy path: resolve the course row, skip if the quiz already
 * exists (idempotent by title, AC B1-5 - unlike the starter-materials
 * workflow step this sequence is copied from, docs/REGRESSION.md #248 check
 * 3), otherwise create a 1-point true/false quiz due 3 days after the
 * course's start date, publish it, and link it into whichever module the
 * instructor chose (`target`, resolved client-side by
 * useLmsSyllabusButtons.ts's "Into module" picker) - never only "Start
 * Here" as this button used to.
 */
export async function createSyllabusAckQuizAction(
  canvasUrl: string,
  acronym?: string,
  target?: ModuleTarget | null
): Promise<{ message: string } | { error: string }> {
  try {
    await requireOwner();

    const resolved = await resolveLmsCourseRowAction(canvasUrl);
    if ("error" in resolved) return resolved;
    const { course } = resolved;

    // Idempotency check FIRST (AC B1-5): if the quiz already exists, nothing
    // is created and the due-date-derivation error path below never applies,
    // even if the course's start date has since been cleared - there is
    // nothing left to create, so a missing start date is irrelevant here.
    const existing = await listBulkItemsAction(canvasUrl, "Quiz", acronym);
    if ("error" in existing) return { error: existing.error };

    const base = courseBaseUrl(canvasUrl);
    const already = findExistingAckQuiz(existing.items);
    if (already) {
      // AC5/AC6: ticks the term task, and reports where the quiz already
      // lives (or links it - the one addition - when it currently sits in no
      // module and a target is now chosen). See alreadyExistsMessage's own
      // comment for the full branching.
      const message = await alreadyExistsMessage(canvasUrl, acronym, course.id, already, target ?? null, base);
      return { message };
    }

    // AC B1-2/B1-3: due date derivation; refuses to create a due-date-less
    // quiz when the course row has no start date.
    const due = computeSyllabusAckDueAt(course.startDate);
    if ("error" in due) return { error: due.error };

    const quiz = await createGradableAction(
      canvasUrl,
      "Quiz",
      {
        title: SYLLABUS_ACK_QUIZ_TITLE,
        description: "Confirm you have read and understood the course syllabus.",
        // AC B1-4: createGradable's Quiz branch DISCARDS pointsPossible
        // entirely (gradables.ts:79-83) - the 1 point comes ONLY from the
        // true_false_question created below, never from a field here.
        dueAt: due.dueAt,
      },
      acronym
    );
    if ("error" in quiz) return { error: quiz.error };

    const question = await createQuizQuestionAction(
      canvasUrl,
      quiz.id,
      {
        name: "Syllabus acknowledgement",
        text: "I read and understand the syllabus.",
        type: "true_false_question",
        points: 1,
        answers: [
          { text: "True", correct: true },
          { text: "False", correct: false },
        ],
      },
      acronym
    );
    if ("error" in question) return { error: question.error };

    // AC B1-6: publish, since an unpublished acknowledgement quiz is
    // invisible to students and would make the one-click promise false.
    const publish = await bulkUpdateAction(canvasUrl, "Quiz", [String(quiz.id)], { published: true }, acronym);
    if ("error" in publish) return { error: publish.error };

    // AC1-AC9 (docs/syllabus-ack-quiz-module-target-acceptance-criteria.md):
    // link into the instructor's chosen module target, replacing this
    // button's old "Start Here"-only behaviour. `target` is null/undefined
    // when no choice was made - AC2's floor: create the quiz and report it
    // unlinked, exactly as before this feature; a module is created as a
    // side effect ONLY when the instructor explicitly chose "New module..."
    // (AC4's amendment to the old "never create a module" rule).
    const linkNote = await linkFreshAckQuiz(canvasUrl, acronym, quiz.id, target ?? null);

    const task = await markSyllabusAckTaskDone(course.id);

    // AC B1-8 / AC6: report the title, where it landed, and a link to it.
    const dueLabel = new Date(due.dueAt).toLocaleDateString();
    return {
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), ${linkNote}${task}: ${base}/quizzes/${quiz.id}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the Syllabus Acknowledgement quiz." };
  }
}

/**
 * Button 2 - generate the syllabus and insert it into Canvas (AC B2-1..B2-8).
 * Attaches the generated .docx as a module-item FILE, never the Canvas
 * Syllabus page (AC decision 1 - no docx-to-HTML converter exists in this
 * repo and building one would be lossy for a template's tables/styling).
 *
 * Two-call shape because AC B2-3 requires collecting a brand-new template
 * from the user exactly when none is resolvable: called with `newTemplate`
 * omitted, this returns `{needsTemplate: true}` (not an error) when neither
 * the course nor its institution has a template, so the caller can prompt
 * for a .docx and re-call this SAME action with `newTemplate` set - which
 * uploads it, assigns it to the course row, and completes the rest of the
 * flow (generate, save, persist, attach) in that one follow-up call. That is
 * the one extra interaction AC B2-1 allows, and no more.
 */
export async function generateAndInsertSyllabusAction(
  canvasUrl: string,
  acronym?: string,
  newTemplate?: { name: string; fileName: string; base64: string },
  provider: LlmProvider = "gemini"
): Promise<{ needsTemplate: true } | { message: string } | { error: string }> {
  try {
    const user = await requireOwner();

    const resolved = await resolveLmsCourseRowAction(canvasUrl);
    if ("error" in resolved) return resolved;
    const { course } = resolved;

    const instFields = course.institution
      ? await loadInstitutionFields(createServiceClient(), user.id, course.institution).catch(() => [])
      : [];

    // AC B2-2: per-course column first, institution default as fallback.
    let templateId = resolveSyllabusTemplateId(course.syllabusTemplateId, instFields).templateId;
    // Set only when THIS run just assigned a brand-new template, so the
    // persist calls below override syllabusTemplateId; an already-resolved
    // template (course or institution) is left completely untouched.
    let newTemplateId: string | undefined;

    if (!templateId) {
      // AC B2-2: only source === "none" triggers the upload prompt.
      if (!newTemplate) {
        return { needsTemplate: true };
      }

      const created = await createSyllabusTemplateAction(newTemplate.name, newTemplate.fileName, newTemplate.base64);
      if ("error" in created) return { error: created.error };
      templateId = created.template.id;
      newTemplateId = created.template.id;

      // AC B2-3: assign it to the course row now, independent of whether
      // generation below succeeds, so an unrelated generation failure later
      // in this same call never costs a future press this same upload step
      // again - the next press is still one click.
      const assigned = await updateCourseHubAction(course.id, {
        ...courseToInputPayload(course),
        syllabusTemplateId: newTemplateId,
      });
      if ("error" in assigned) return { error: assigned.error };
    }

    // AC B2-4: the single 12-key mapping - no second fact mapping is written.
    const instEmail = instFields.find((f) => f.id === "email")?.value ?? "";
    const instLmsUrl = instFields.find((f) => f.id === "lmsUrl")?.value ?? "";
    const facts = buildSyllabusFactsFromCourse(course, { email: instEmail, lmsUrl: instLmsUrl });

    const generated = await generateCourseSyllabusAction(templateId, facts, provider);
    if ("error" in generated) return { error: generated.error };

    const fileName = buildWorkflowFileName({ course, artifact: "Syllabus", ext: "docx" });
    const saved = await createFinalizedSyllabusAction(
      generated.name,
      fileName,
      generated.base64,
      course.courseCode ?? undefined
    );
    if ("error" in saved) return { error: saved.error };

    // AC B2-5/B2-6: createFinalizedSyllabusAction does NOT write
    // course_hub.syllabus_id itself (docs/REGRESSION.md #60 check 5) - the
    // caller must, through courseToInputPayload (never a hand-written field
    // list - toRow's clean(undefined) === null would wipe every omitted
    // column, the live bug at syllabus-upload.ts:118-145 this must not
    // repeat). Persisted before the Canvas-attach step below so the saved
    // syllabus is linked to the course row even if attaching fails.
    const persisted = await updateCourseHubAction(course.id, {
      ...courseToInputPayload(course),
      ...(newTemplateId ? { syllabusTemplateId: newTemplateId } : {}),
      syllabusId: saved.syllabus.id,
    });
    if ("error" in persisted) return { error: persisted.error };

    const content = await listCourseContentAction(canvasUrl, acronym);
    if ("error" in content) {
      return {
        message: `Generated and saved "${saved.syllabus.name}", but could not load the course's modules to attach it: ${content.error}`,
      };
    }

    // AC B2-7: "Start Here" when it exists, else the first module, else not
    // attached at all (the syllabus is still generated and saved either way).
    const target = resolveModuleForSyllabusPlacement(content.modules);
    if (!target) {
      return {
        message: `Generated and saved "${saved.syllabus.name}" - the course has no modules, so it could not be attached to Canvas.`,
      };
    }

    const placed = await placeSyllabusInModuleAction(generated.base64, canvasUrl, target.id, fileName, undefined, acronym);
    if ("error" in placed) {
      return {
        message: `Generated and saved "${saved.syllabus.name}", but could not attach it to Canvas: ${placed.error}`,
      };
    }

    // AC B2-8: name the file and link to the Canvas module item.
    const itemUrl = placed.item?.htmlUrl ?? courseBaseUrl(canvasUrl);
    return { message: `Generated "${fileName}" and added it to "${target.name}": ${itemUrl}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the syllabus." };
  }
}
