"use server";

// Sibling of course-planning.ts (split out to keep that file under 1000
// lines): the web-search-grounded TOC-derivation helper used when a schedule
// or lecture-materials request's sourceMaterial names a source (a platform
// URL or a short citation) but pastes no table of contents - see
// shouldDeriveToc in src/lib/workflows/source-alignment.ts for the trigger.
// Also hosts buildScheduleWeekPlan/generateSlidesFromTopic, moved here for
// the same line-count reason - both are internal to
// generateLectureMaterialsFromScheduleAction, exported only for that.

import type { SlideData, AssignmentPlan, ScheduleWeekPlan } from "../actions-types";
import { slideDeckJsonShape, slideStructureRequirements, enforceNoCodeForApplied } from "@/lib/slide-prompt";
import { enforceGraphicsForApplied } from "@/lib/slide-graphics";
import { courseKindContract, COMMITTED_TOOLSET_RULE, type CourseKind } from "@/lib/course-kind";
import { emptyCourseProject, milestoneBriefFor, type CourseProject } from "@/lib/course-project";
import { scaffoldLessonPlan } from "@/lib/embedded/deck";
import { scaffoldModuleIntroDoc, scaffoldAssignmentDoc, scaffoldModuleObjectivesDoc } from "@/lib/embedded/docs";
import { callLlm, type LlmProvider, type Source } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { planWeekConcepts, buildConceptCycleInstruction } from "@/lib/lecture-concepts";
import { findCaseStudySlide, caseStudyDescriptor } from "@/lib/case-study-reuse";
import {
  buildCaseStudyExclusionBlock,
  buildCaseStudyAnchorBlock,
  buildOpenerContinuityBlock,
  type CaseStudyAssignment,
} from "@/lib/case-study-prompt";
import { fillMissingGraphics } from "./slide-graphics-repair";
import { SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS } from "@/lib/slide-token-budget";
import {
  jsonObjectSlice,
  toSlideData,
  propagateExampleCodeToFollowups,
  generateModuleIntroForAssignment,
  generateAssignmentInstructionsForAssignment,
  generateModuleObjectivesForAssignment,
} from "./shared";
import { generateWeekOpener, type OpenerExerciseKind } from "./research";
import {
  parseTocChapters,
  isNonContentWeekText,
  describeCoveredChapters,
  buildTocDerivationPrompt,
  type ParsedChapter,
} from "@/lib/workflows/source-alignment";

// SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS's derivation (coding vs. applied
// worst-case slide/token arithmetic) is documented at its definition,
// extracted to src/lib/slide-token-budget.ts to keep this file under the
// line cap - see that module for the full comment.

// T2 (no-code pipeline reorder): the in-plan opener phase's target length -
// the same default COURSE_REFRESH's own generate-class-openers step binds
// (course-setup.ts: `minutes: { source: "literal", value: "30" }`, and that
// step's own fallback when unset, `Math.max(5, Math.min(Number(values.minutes
// ?? 30), 120))`), so an instructor sees the identical opener length whether
// it comes from the standalone step or this in-plan phase.
const DEFAULT_OPENER_MINUTES = 30;

/**
 * A table of contents derived by web search for a source that has no pasted
 * TOC but looks identifiable (a URL or a short course citation) - see
 * shouldDeriveToc. Feeds the same aligned prompt branch a pasted TOC would.
 */
export interface DerivedToc {
  toc: string;
  chapters: ParsedChapter[];
  sources: Source[];
}

/**
 * Derive a table of contents for a course/source that was pasted as a bare
 * URL or short citation (e.g. a uCertify course link) rather than a table of
 * contents: one web-search-grounded LLM call asks for the source's official
 * published outline (course-outline pages, certification module lists, and
 * textbook TOCs are public web content even when the platform itself is
 * login-walled), then parses the response the same way a pasted TOC parses.
 *
 * Never throws and never returns a partial result: any failure (a transport
 * error, an empty response, or a response with no parseable chapters) simply
 * returns null so the caller falls back to today's name-only branch - a
 * search miss must never block schedule generation.
 */
export async function deriveTocFromSource(
  sourceMaterial: string,
  provider: LlmProvider = "gemini"
): Promise<DerivedToc | null> {
  try {
    await requireOwner();

    const trimmed = sourceMaterial.trim();
    if (!trimmed) return null;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: buildTocDerivationPrompt(trimmed) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        webSearch: true,
      },
      provider
    );

    if (!result.ok) return null;

    const chapters = parseTocChapters(result.text);
    if (chapters.length === 0) return null;

    const seenUris = new Set<string>();
    const sources: Source[] = [];
    for (const source of result.sources ?? []) {
      if (!seenUris.has(source.uri)) {
        seenUris.add(source.uri);
        sources.push(source);
      }
    }

    return { toc: result.text.trim(), chapters, sources };
  } catch {
    return null;
  }
}

/**
 * Decide the real professional tool(s) an applied (no-code) week's hands-on
 * work should use, for a SINGLE topic/summary with no course to persist a
 * commitment onto.
 *
 * FALLBACK ONLY (docs/REGRESSION.md, "tool churn" fix): this used to be the
 * ONLY tool decision buildScheduleWeekPlan made, called fresh every week with
 * just that week's topic - which is exactly what produced tool churn in a
 * real generated course (Trello in week 1, Miro in week 5, Asana plus a
 * spreadsheet in week 8, each an independent decision with no memory of the
 * others). buildScheduleWeekPlan no longer calls this: it reads the course's
 * already-committed toolset off `courseProject.tools` instead (see
 * ensureCourseTools, steps.course-project.ts, which decides that toolset ONCE
 * from the WHOLE course's weekly topics via selectCourseTools below, not one
 * week at a time). This function now exists only for a caller with NO course
 * tile to persist a commitment onto - steps.assignments-template.ts's
 * generate-assignment-from-template step falls back to it when no hubCourse
 * is bound, since there is nothing to remember a choice on in that case
 * anyway. Kept as its own function (not deleted) rather than inlined, since a
 * per-topic-with-no-course fallback is a real, distinct use case.
 *
 * Never throws: an LLM/parse failure returns [] - the same "no tool
 * requirement" state a coding course is always in (moduleTools is an
 * applied-only concept). Calls no LLM for the embedded provider, matching
 * every other generator in this file.
 */
export async function selectRequiredTools(
  topic: string,
  summary: string,
  provider: LlmProvider
): Promise<string[]> {
  if (provider === "embedded") return [];
  try {
    const prompt = `You are planning a single week of an applied (no-code) course - no programming, ever.

TOPIC: ${topic}

WEEK SUMMARY: ${summary}

Name the REAL, widely used professional tool(s) a practitioner in this field actually uses for this week's hands-on work - 1 to 3 tools, never invented. For each, give the FREE way a student can reach it: a free tier, a free trial, a community edition, or - only when the tool truly has no free option - a spreadsheet equivalent. This is the SAME tool every artifact for this week (the assignment, the lecture deck, the class opener) will be told to use, so choose whichever tool best fits the week's actual deliverable.

Return ONLY valid JSON: { "tools": ["Tool Name (free tier/trial/community edition/spreadsheet equivalent)", "..."] }`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      },
      provider
    );
    if (!result.ok) return [];

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) return [];

    const parsed = JSON.parse(jsonText) as { tools?: unknown };
    if (!Array.isArray(parsed.tools)) return [];
    return parsed.tools.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  } catch {
    return [];
  }
}

/**
 * Decide the applied (no-code) course's COMMITTED CORE toolset - the small,
 * stable set of real practitioner tools the WHOLE course defaults to for
 * every week's hands-on work, decided ONCE from the entire term's weekly
 * topics rather than one week at a time (contrast selectRequiredTools above,
 * which sees only a single week and is now the tile-less fallback).
 *
 * Called by ensureCourseTools (steps.course-project.ts), which persists the
 * result onto the course tile's `courseProject.tools` and never calls this
 * again once a toolset is already committed - this function itself has no
 * memory and does no persistence; it is a pure "ask the model" step, the same
 * division of responsibility generateCourseProjectAction (course-project.ts)
 * has from ensureCourseProject.
 *
 * COHERENCE (AC3): asking for the toolset in ONE call that sees every week's
 * topic, rather than 15 independent per-week popularity contests, is what
 * makes the set coherent by construction - the model is explicitly told each
 * tool must play a different, complementary role (a board tool plus a
 * spreadsheet, never two overlapping board tools) and to size the set to
 * cover the WHOLE term, not just the first topic it sees.
 *
 * Y8-AC1/AC2/AC3 (tiered toolset - "far more varied free professional tool
 * usage"): this used to ask the model to pick 1-3 tools that TOGETHER "cover
 * every kind of hands-on work this course's weeks will need" - which is
 * exactly what collapsed a real 16-week course onto a spreadsheet used in 14
 * of 16 weeks, because forcing 1-3 tools to cover EVERYTHING (calculation,
 * scheduling, diagramming, surveys, dashboards, execution tracking) leaves no
 * option but the most generic, do-everything tools available. This function
 * now asks for a CORE only - the 2-3 tools that hold what must genuinely
 * PERSIST all term (the task list, the register, the charter) - and tells the
 * model explicitly that it does NOT need to cover every kind of work: a
 * SPECIALIST tool is a separate, per-week, downstream decision (governed by
 * COMMITTED_TOOLSET_RULE, composed into the assignment and deck prompts that
 * actually make it - see the REQUIRED TOOL(S) block below), never something
 * this up-front call has to pre-select or persist. Splitting the concern this
 * way is what leaves room for a scheduling week to touch a real Gantt tool
 * without turning this CORE selection into a second, impossible "cover
 * everything" request.
 *
 * Never throws: an LLM/parse failure returns [] (ensureCourseTools then
 * leaves the tile's toolset unset - the same "not committed yet" state a
 * coding course is always in). Calls no LLM for the embedded provider.
 */
export async function selectCourseTools(
  courseFacts: string,
  weeklyTopics: string,
  provider: LlmProvider
): Promise<string[]> {
  if (provider === "embedded") return [];
  try {
    const prompt = `You are choosing the CORE toolset an ENTIRE applied (no-code) course commits to for its whole term - no programming, ever.

COURSE: ${courseFacts || "(no further details recorded)"}

WEEKLY TOPICS (the whole term, so you can judge what the CORE toolset must hold from the first week to the last):
${weeklyTopics}

Choose a SMALL, STABLE CORE set of 2 to 3 REAL, widely used professional tools that hold the student's PERSISTENT project data for the whole term - the running task list, the register, the charter, the core calculations. A student uses THESE SAME tools every week for the ENTIRE term - never a different tool week to week, and never asked to re-create their project's data in a new tool partway through. Each CORE tool must play a DIFFERENT, COMPLEMENTARY role (for example a board/planning tool plus a spreadsheet for calculations - never two tools that do the same job).

Do NOT try to make this small CORE set cover every kind of work the term will need - that is exactly what collapses a real course onto one generic tool used almost every week. A specific week is free to introduce its OWN specialist tool later - for example a real scheduling/Gantt tool for a scheduling week, a diagramming tool for a network-diagram or process-flow week, a survey tool for a stakeholder-input week, or a dashboard/reporting tool for a performance-measurement week - for work this CORE genuinely cannot do well, as long as the result is produced in that tool and exported as a file, screenshot, or link rather than becoming a new home for data the student has to keep maintaining. That per-week decision happens later, downstream of this call - this CORE set only needs to hold what must persist across the whole term.

For each CORE tool, give the FREE way a student can reach it: a free tier, a free trial, a community edition, or - only when the tool truly has no free option - a spreadsheet equivalent.

Return ONLY valid JSON: { "tools": ["Tool Name (free tier/trial/community edition/spreadsheet equivalent)", "..."] }`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
      },
      provider
    );
    if (!result.ok) return [];

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) return [];

    const parsed = JSON.parse(jsonText) as { tools?: unknown };
    if (!Array.isArray(parsed.tools)) return [];
    return parsed.tools.filter((t): t is string => typeof t === "string" && t.trim() !== "");
  } catch {
    return [];
  }
}

/**
 * Generate a single week's materials (assignment + intro + slides) from the
 * topic and course context. Mirrors buildAssignmentPlan but operates on
 * schedule week data instead of repo content.
 *
 * ORDER: the assignment is generated FIRST, from the schedule alone - it is
 * the spine of the module, and every other artifact below exists to prepare
 * students for it. The module intro and the deck are generated SECOND, both
 * grounded in the schedule AND the assignment text just produced (see
 * assignmentContextForDownstream below); they run in parallel since neither
 * depends on the other, only on the assignment. This mirrors (and replaces)
 * the order this function used before: slides, then intro, then instructions
 * - which meant a lecture could be written before the work it was supposed
 * to prepare students for even existed.
 *
 * T2 (no-code pipeline reorder): when the caller turns on
 * sequenceOpenerBeforeDeck (last parameter, below), the class opener joins
 * the intro/objectives group - grounded in the assignment, same as them -
 * and the DECK becomes its own, LATER phase, grounded in the assignment AND
 * the just-generated opener. Off (the default), this function's behavior is
 * the single Promise.all group described above, byte-for-byte unchanged.
 */
export async function buildScheduleWeekPlan(
  week: ScheduleWeekPlan,
  index: number,
  courseDescription: string,
  lectureDurationMinutes: number,
  provider: LlmProvider,
  context?: string,
  sourceMaterial?: string,
  allWeeks: ScheduleWeekPlan[] = [],
  courseKind: CourseKind = "coding",
  // AC1/AC6 (docs/REGRESSION.md 146): the course's persisted course-long
  // project, when it has one. emptyCourseProject() (the default) makes
  // milestoneBriefFor below return null unconditionally via hasProject() -
  // the same "no project" behavior this function had before this parameter
  // existed - so every pre-existing call site is unaffected. Course-kind
  // neutral: nothing below branches on courseKind, so a coding course reaching
  // this function (e.g. the repoless "lecture-zip" fallback, or Course
  // Refresh) gets identical chaining/choice/rigor treatment to an applied one.
  courseProject: CourseProject = emptyCourseProject(),
  // P2-AC8: a single array SHARED across every week's call in this run
  // (created once by generateLectureMaterialsFromScheduleAction, threaded
  // through unchanged) - grown, never replaced, as each week's deck names
  // its own Case Study organization, so a LATER week's prompt is told not to
  // reuse an EARLIER week's case. Defaults to a fresh, empty array so every
  // pre-existing call site (a direct unit test, the repoless "lecture-zip"
  // fallback with a single week) behaves exactly as before - "no other week
  // has generated yet" is the correct starting state either way.
  usedCaseStudies: string[] = [],
  // T2 (no-code pipeline reorder): produce this week's class opener IN this
  // function - sequenced before the deck (an extra, deliberate, sequential
  // LLM round trip per week - see generateSlidesFromTopic's own opener
  // parameter comment for the cost this adds) - instead of leaving it to a
  // separate generate-class-openers step. false (the default) is today's
  // EXACT behavior: no opener is attempted here, the single Promise.all group
  // above runs unchanged, and the returned plan's openerText/openerFailed
  // both stay undefined. Only steps.content-lectures.ts's
  // lecture-materials-from-schedule step turns this on, and only for an
  // applied (no-code) course - every other caller (the repoless "lecture-zip"
  // fallback, every existing unit test) is unaffected.
  sequenceOpenerBeforeDeck = false,
  // V1/V2/V4: this week's anchor case, chosen ONCE for the whole course
  // before any week generates (planCourseCaseStudies, ./case-study-plan.ts) -
  // undefined for a pre-existing caller/coding course/unmatched week. Handed
  // to BOTH the opener and the deck so they teach the SAME case.
  assignedCaseStudy?: CaseStudyAssignment,
  // Every OTHER week's assigned case, from the same up-front plan -
  // deterministic and complete before any week starts (unlike
  // usedCaseStudies, which only reflects what finished first). [] by default.
  otherWeeksCaseStudyNames: string[] = []
): Promise<AssignmentPlan> {
  const weekNumber = week.week || index + 1;
  const label = `Week ${weekNumber}`;
  const topic = week.topic.trim();
  const summary = week.summary?.trim() || "";
  const assignmentTitle = week.assignmentTitle?.trim() || `Week ${weekNumber} Deliverable`;
  const assignmentName = `week-${String(weekNumber).padStart(2, "0")}`;

  // The TOPIC is the display title, not the week label: passing "Week 1"
  // produced "This module introduces week 1 and why it matters", which says
  // nothing about the actual subject.
  const introTitle = topic || label;
  const introSource = [topic, summary].filter(Boolean).join("\n");

  // Tool-churn fix (docs/REGRESSION.md): read the COURSE's already-committed
  // toolset off courseProject.tools rather than deciding one fresh for this
  // week (the old selectRequiredTools(topic, summary, provider) call, which
  // is what produced a different SaaS tool almost every week of the same
  // course - Trello in week 1, Miro in week 5, Asana plus a spreadsheet in
  // week 8). The commitment itself is made ONCE, up front, by ensureCourseTools
  // (steps.course-project.ts) before this function's per-week loop even
  // starts - this is a pure read, not a decision, so every week of the same
  // course structurally sees the identical toolset. Always [] for a coding
  // course (moduleTools is an applied-only concept) and for any course whose
  // toolset has not been committed yet (courseProject defaults to
  // emptyCourseProject(), whose tools is []).
  const requiredTools = courseKind === "applied" ? courseProject.tools : [];
  const requiredToolsText = requiredTools.length > 0 ? requiredTools.join("; ") : "";

  // AC1/AC4: this week's course-project milestone, or null for a course with
  // no project, a project switched off (hasProject), or a week the project
  // has no milestone for - milestoneBriefFor already covers all three via
  // hasProject()/milestoneForWeek(), so "no milestone" and "no project" are
  // the exact same branch below, with no separate check needed here.
  const milestone = milestoneBriefFor(courseProject, weekNumber);

  // The assignment is a REAL generated document whenever a model is
  // configured. It used to be scaffolded unconditionally - which shipped
  // placeholder prose, including a literal instructor TODO ("Add two or three
  // concrete examples..."), into student-facing lecture notes even when the
  // user had selected an LLM. The scaffold is now the embedded-provider path
  // and the degraded fallback, nothing more.
  let assignmentInstructions: string;
  let instructionsFailed = false;
  if (provider === "embedded") {
    assignmentInstructions = scaffoldAssignmentDoc(assignmentTitle, introSource);
  } else {
    const result = await generateAssignmentInstructionsForAssignment(
      assignmentName,
      assignmentTitle,
      introSource,
      "",
      provider,
      courseKind,
      requiredToolsText,
      milestone
    );
    if ("error" in result) {
      console.error(`Assignment instructions failed for "${label}": ${result.error}`);
      instructionsFailed = true;
      assignmentInstructions = scaffoldAssignmentDoc(assignmentTitle, introSource);
    } else {
      assignmentInstructions = result.text;
    }
  }

  // AC6: a module whose assignment failed to generate falls back to the
  // deterministic scaffold above - but that placeholder must never be fed to
  // the intro/deck as real grounding (a fake "the assignment says..." is
  // worse than no grounding at all). The intro and deck below only receive
  // assignment text when generation actually succeeded; instructionsFailed is
  // what assembleLectureFiles (registry-helpers.ts) reads to surface a
  // "generated without assignment grounding" note instead of looking clean.
  const assignmentContextForDownstream = instructionsFailed ? "" : assignmentInstructions;

  // The intro, the deck, and the objectives document all depend on the
  // assignment text above but not on each other, so they run in parallel
  // (one LLM call each, same as before this function reordered). AC1/AC5:
  // objectives are added here (not as a later, separate pass) because this
  // is where the schedule, the just-generated assignment, and the week's
  // required-tool commitment are already in scope - the same reason this
  // week's intro and deck are grounded here rather than elsewhere.
  //
  // T2 (no-code pipeline reorder): sequenceOpenerBeforeDeck (off by default -
  // see this function's own parameter comment) splits the above into two
  // phases instead of one: phase 2 (parallel) is the intro, the objectives,
  // AND the opener - all grounded in the assignment, none in each other -
  // and phase 3 (sequential, the one extra LLM round trip this adds per
  // week) is the deck alone, now grounded in the assignment AND the opener
  // phase 2 just produced. Off, this is the exact single Promise.all group
  // this function has always run, untouched.
  let introResult: { text: string } | { error: string };
  let slidesResult: Awaited<ReturnType<typeof generateSlidesFromTopic>>;
  let objectivesResult: { text: string } | { error: string };
  let openerText = "";
  let openerFailed = false;

  if (sequenceOpenerBeforeDeck) {
    const exerciseKind: OpenerExerciseKind = courseKind === "applied" ? "applied" : "coding";

    const [introRes, objectivesRes, openerRes] = await Promise.all([
      provider === "embedded"
        ? Promise.resolve<{ text: string } | { error: string }>({
            text: scaffoldModuleIntroDoc(introTitle, summary),
          })
        : generateModuleIntroForAssignment(
            assignmentName,
            introTitle,
            introSource,
            "",
            provider,
            courseKind,
            assignmentContextForDownstream
          ),
      generateModuleObjectivesForAssignment(
        assignmentName,
        introTitle,
        assignmentContextForDownstream,
        introSource,
        provider,
        courseKind,
        requiredToolsText,
        weekNumber,
        allWeeks.length
      ),
      // introTitle (topic || label), not the raw topic: the standalone
      // generate-class-openers step only ever reaches a week whose topic it
      // already checked is non-blank (it skips the week entirely otherwise),
      // but this in-plan phase has no such guarantee, so it falls back the
      // SAME way the intro document above already does.
      generateWeekOpener(
        introTitle,
        summary,
        DEFAULT_OPENER_MINUTES,
        provider,
        exerciseKind,
        assignmentContextForDownstream,
        requiredTools,
        assignedCaseStudy
      ),
    ]);

    introResult = introRes;
    objectivesResult = objectivesRes;
    if ("error" in openerRes) {
      console.error(`Class opener generation failed for "${label}": ${openerRes.error}`);
      openerFailed = true;
    } else {
      openerText = openerRes.text;
    }

    // Phase 3: the deck, now grounded in the assignment AND the opener text
    // phase 2 just produced (generateSlidesFromTopic's own openerContext
    // parameter - "" when the opener failed, which simply omits that prompt
    // block, same as an empty assignmentContext already does).
    slidesResult = await generateSlidesFromTopic(
      topic,
      summary,
      courseDescription,
      lectureDurationMinutes,
      provider,
      context,
      sourceMaterial,
      weekNumber,
      allWeeks,
      courseKind,
      assignmentContextForDownstream,
      requiredTools,
      usedCaseStudies,
      openerText,
      assignedCaseStudy,
      otherWeeksCaseStudyNames
    );
  } else {
    // TODAY'S BEHAVIOR, BYTE-FOR-BYTE UNCHANGED: intro, deck, and objectives
    // all run in ONE parallel group; no opener is attempted here at all.
    [introResult, slidesResult, objectivesResult] = await Promise.all([
      provider === "embedded"
        ? Promise.resolve<{ text: string } | { error: string }>({
            text: scaffoldModuleIntroDoc(introTitle, summary),
          })
        : generateModuleIntroForAssignment(
            assignmentName,
            introTitle,
            introSource,
            "",
            provider,
            courseKind,
            assignmentContextForDownstream
          ),
      generateSlidesFromTopic(
        topic,
        summary,
        courseDescription,
        lectureDurationMinutes,
        provider,
        context,
        sourceMaterial,
        weekNumber,
        allWeeks,
        courseKind,
        assignmentContextForDownstream,
        requiredTools,
        usedCaseStudies
      ),
      generateModuleObjectivesForAssignment(
        assignmentName,
        introTitle,
        assignmentContextForDownstream,
        introSource,
        provider,
        courseKind,
        requiredToolsText,
        // Bloom AC5 (progression): this path always has the full schedule
        // (allWeeks, passed by course-planning.ts's generateLectureMaterialsFromScheduleAction),
        // so it can name a real term position rather than omitting it -
        // 0 when allWeeks is genuinely empty (a caller with no schedule
        // context, e.g. a direct unit-test call) so the prompt omits the line
        // rather than asserting "week N of 0".
        weekNumber,
        allWeeks.length
      ),
    ]);
  }

  let moduleIntroduction: string;
  let introFailed = false;
  if ("error" in introResult) {
    console.error(`Module intro generation failed for "${label}": ${introResult.error}`);
    introFailed = true;
    moduleIntroduction = scaffoldModuleIntroDoc(introTitle, summary);
  } else {
    moduleIntroduction = introResult.text;
  }

  let moduleObjectives: string;
  let objectivesFailed = false;
  if ("error" in objectivesResult) {
    console.error(`Module objectives generation failed for "${label}": ${objectivesResult.error}`);
    objectivesFailed = true;
    moduleObjectives = scaffoldModuleObjectivesDoc(introTitle, assignmentContextForDownstream || introSource);
  } else {
    moduleObjectives = objectivesResult.text;
  }

  // Degrade gracefully if slide generation fails. Rebound to a fresh `const`
  // (slidesResult itself is a `let`, reassigned by one of the two branches
  // above) so TypeScript's aliased-condition narrowing below ("error" in
  // resolvedSlides, saved as slidesFailed) applies reliably.
  const resolvedSlides = slidesResult;
  const slidesFailed = "error" in resolvedSlides;
  if (slidesFailed) {
    console.error(`Slide generation failed for "Week ${weekNumber}": ${resolvedSlides.error}`);
  }
  const slides = slidesFailed ? [] : resolvedSlides.slides;
  // AC2: how many slides had "code"/"codeLanguage" stripped by the applied
  // no-code guard - 0/undefined for a coding course or a clean applied run.
  const codeViolations = slidesFailed ? 0 : resolvedSlides.codeViolations ?? 0;

  return {
    assignmentName,
    introFailed: introFailed ? true : undefined,
    instructionsFailed: instructionsFailed ? true : undefined,
    slides,
    slidesFailed: slidesFailed ? true : undefined,
    // AC2: surfaced the same way slidesFailed/introFailed/instructionsFailed
    // are - a degraded run must be visible, not silently "clean".
    codeStrippedFromApplied: codeViolations > 0 ? codeViolations : undefined,
    // AC3/AC6: an applied course that came back with no required tool means
    // selection itself failed or found nothing usable - the assignment and
    // the deck each generated without a shared tool constraint. A coding
    // course's requiredTools is always [] by design and must never be
    // flagged as a failure.
    moduleToolsSelectionFailed: courseKind === "applied" && requiredTools.length === 0 ? true : undefined,
    presentationTitle: topic || label,
    label,
    moduleIntroduction,
    assignmentInstructions,
    moduleObjectives,
    objectivesFailed: objectivesFailed ? true : undefined,
    // T2: undefined (both) unless sequenceOpenerBeforeDeck was on - the
    // exact "no opener attempted here" state this plan already had before
    // this feature existed.
    openerText: sequenceOpenerBeforeDeck ? openerText : undefined,
    openerFailed: sequenceOpenerBeforeDeck && openerFailed ? true : undefined,
    weekNumber,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
  } satisfies AssignmentPlan;
}

/**
 * Generate slides from a schedule week's topic and context.
 */
async function generateSlidesFromTopic(
  topic: string,
  summary: string,
  courseDescription: string,
  lectureDurationMinutes: number,
  provider: LlmProvider,
  context?: string,
  sourceMaterial?: string,
  weekNumber = 0,
  allWeeks: ScheduleWeekPlan[] = [],
  courseKind: CourseKind = "coding",
  // AC1/AC2: this week's already-generated assignment text (buildScheduleWeekPlan
  // only - "" leaves the prompt exactly as it was before this parameter
  // existed), so the deck is built to directly prepare students for it
  // instead of only the one-line topic/summary.
  assignmentContext = "",
  // AC3: the tool decided ONCE, before the deck exists (selectRequiredTools),
  // that the deck's own per-concept "moduleTools" choices must stay
  // consistent with - always [] for a coding course.
  requiredTools: string[] = [],
  // P2-AC8: the shared, run-scoped list of case-study descriptors already
  // used by an earlier week's deck in this run - see buildScheduleWeekPlan's
  // own parameter comment. Read BEFORE this week's prompt is built (to name
  // what to avoid) and appended to AFTER this week's slides come back (so a
  // later week sees this one too) - never re-derived from anywhere else.
  usedCaseStudies: string[] = [],
  // T2 (no-code pipeline reorder): this week's already-generated class
  // opener text (buildScheduleWeekPlan's sequenceOpenerBeforeDeck phase
  // only - "" leaves the prompt exactly as it was before this parameter
  // existed, so every pre-existing call site, including this same function's
  // OWN call from the non-sequenced branch, is unaffected), so the deck
  // builds on what the opener already covered instead of repeating it.
  openerContext = "",
  // V1/V2/V4: this week's anchor case (see buildScheduleWeekPlan's own
  // parameter comment) - undefined for every pre-existing call site.
  assignedCaseStudy?: CaseStudyAssignment,
  // Every OTHER week's assigned case, from the same up-front plan - complete
  // before this call, unlike usedCaseStudies. [] by default.
  otherWeeksCaseStudyNames: string[] = []
): Promise<
  | {
      presentationTitle: string;
      slides: SlideData[];
      // AC4: the real professional tool(s) an applied deck committed to, one
      // entry per concept (see "moduleTools" in APPLIED_DECK_JSON_SHAPE).
      // Always [] for a coding deck - the coding JSON shape has no such field.
      moduleTools?: string[];
      // AC2: how many slides the no-code guard had to strip code from.
      codeViolations?: number;
      // P3-AC3: how many slides still lacked a required graphic (Artifact:/
      // Judgment Call:/Agenda:) AFTER the targeted repair pass - see
      // enforceGraphicsForApplied/fillMissingGraphics below. Always 0 for a
      // coding deck or a clean applied run.
      graphicViolations?: number;
    }
  | { error: string }
> {
  // Embedded Deterministic Engine
  if (provider === "embedded") {
    return scaffoldLessonPlan(topic, summary);
  }

  // Planning phase (Q1/Q2): derive this week's ordered concept list BEFORE
  // any slide is generated, sized to the lecture length, so breadth is a
  // deliberate decision rather than an emergent side effect of a vague
  // "cover this at maximum breadth" instruction. See
  // src/lib/lecture-concepts.ts for why a bare one-line topic ("Project
  // Integration and Initiation") degrades to more than one concept even
  // when the enumeration call itself fails.
  const conceptPlan = await planWeekConcepts(topic, summary, lectureDurationMinutes, provider);

  let prompt = `You are an expert educator creating a lecture slide deck for a course.

${courseKindContract(courseKind)}

The slides must be fully self-contained — students reading them after class must be able to understand every concept without relying on any verbal explanation from the instructor.

TOPIC: ${topic}

WEEK SUMMARY: ${summary}

COURSE DESCRIPTION: ${courseDescription}

LECTURE DURATION: ${lectureDurationMinutes} minutes

Based on the topic and summary above, create a complete lecture slide deck that teaches students the key concepts and skills for this week. Scale the deck to fit a ${lectureDurationMinutes}-minute lecture - the Requirements below (per course kind) are the single source of truth for how deck length follows lecture length, not a fixed minutes-per-slide ratio.`;

  // P2-AC7: cross-week continuity, built DETERMINISTICALLY from the
  // schedule already in hand (allWeeks) - never from run-time completion
  // order, unlike the case-study accumulator below. Mirrors
  // renderMilestoneContract's own week-1 branch (src/lib/course-project.ts):
  // the FIRST week is the only place that says no prior week exists -
  // inventing one for a course that has not taught anything yet would be
  // worse than simply omitting the block. weekNumber defaults to 0 for a
  // caller with no real week context, which naturally yields no prior weeks
  // below (every real week number is >= 1), so this needs no separate
  // special case for that caller.
  const priorWeeks = allWeeks.filter((w) => w.week < weekNumber && w.topic.trim());
  if (priorWeeks.length > 0) {
    const immediatelyPrior = priorWeeks[priorWeeks.length - 1];
    const immediatelyPriorSummary = immediatelyPrior.summary?.trim();
    const priorTopicList = priorWeeks.map((w) => `Week ${w.week}: ${w.topic.trim()}`).join("; ");
    prompt += `

PRIOR WEEKS (this is NOT the first week of the course - do not introduce it as if it were):
Immediately prior week - ${immediatelyPrior.topic.trim()}${immediatelyPriorSummary ? ` (${immediatelyPriorSummary})` : ""}.
Every week taught so far, in order: ${priorTopicList}.
The overview slide's "notes" MUST open by explicitly connecting this week's material to the immediately prior week, naming it by name, before introducing today's topic.`;
  }

  // RCA12 (RCA round 3): the NEXT WEEK / Where This Goes Next slide
  // (APPLIED_STRUCTURE_REQUIREMENTS's CLOSING SECTIONS point E,
  // slide-prompt.ts) names next week's topic, or states plainly that none
  // exists - but until this fix, nothing in the prompt named any future week
  // or said which week of how many this is, so the model was required to
  // FABRICATE next week's topic inside a contract whose no-fabrication rules
  // are stated a dozen times, and the final-week branch could never fire
  // correctly (nothing ever told it a week was final). Built deterministically
  // from the schedule already in hand, exactly like PRIOR WEEKS above - same
  // weekNumber > 0 guard, for the same reason: weekNumber defaults to 0 for a
  // caller with no real schedule, and "week 0 of 0" would be a nonsense
  // statement to hand the model.
  if (weekNumber > 0) {
    const totalWeeks = allWeeks.length;
    const nextWeeks = allWeeks.filter((w) => w.week > weekNumber && w.topic.trim());
    prompt += `

THIS IS WEEK ${weekNumber} OF ${totalWeeks}.`;
    if (nextWeeks.length > 0) {
      const immediatelyNext = nextWeeks[0];
      const immediatelyNextSummary = immediatelyNext.summary?.trim();
      const nextTopic = immediatelyNext.topic.trim();
      prompt += `
NEXT WEEK: ${nextTopic}${immediatelyNextSummary ? ` - ${immediatelyNextSummary}` : ""}. The deck's closing "Next Week" slide MUST be titled "Next Week: ${nextTopic}" - use this exact topic, verbatim, never a different or invented one.`;
    } else {
      prompt += `
This is the FINAL week of the course - there is no next week. The deck's closing slide for this section MUST be titled "Where This Goes Next" instead of "Next Week: ...", connecting this term's material to professional application beyond the course rather than naming a week that does not exist.`;
    }
  }

  // P2-AC8/V4: never reuse a Case Study/In Practice subject another week in
  // THIS RUN already used. usedCaseStudies alone only reflects what finished
  // strictly before this week under mapWithConcurrency (the first four weeks
  // always saw it empty); otherWeeksCaseStudyNames closes that gap with the
  // deterministic, up-front, whole-term plan (buildScheduleWeekPlan's own
  // parameter comment). detectReusedCaseStudies (case-study-reuse.ts) still
  // catches whatever slips through anyway.
  prompt += buildCaseStudyExclusionBlock(usedCaseStudies, otherWeeksCaseStudyNames);

  prompt += buildConceptCycleInstruction(conceptPlan.concepts, courseKind);

  // AC1/AC2: the assignment is this module's spine - the deck exists to
  // prepare students for it, so its text (when generation succeeded; see
  // assignmentContextForDownstream in buildScheduleWeekPlan) is handed to the
  // model as a concrete target, not just a restated topic/summary.
  if (assignmentContext.trim()) {
    prompt += `

THIS WEEK'S ASSIGNMENT (already written - build this lecture so it directly prepares students to complete it):
${assignmentContext.trim()}`;
  }

  // T2: the opener already ran BEFORE this lecture, same class session - ""
  // when none was generated, which omits this block unchanged. V1-AC1: this
  // used to tell the deck "do not re-teach the opener's case study"; the
  // model obeyed literally and taught a DIFFERENT case. The corrected,
  // opposite instruction lives in buildOpenerContinuityBlock: build on the
  // opener's case, don't re-narrate it, don't substitute a different one.
  prompt += buildOpenerContinuityBlock(openerContext);

  // V1/V2/V4: this week's pre-chosen anchor case, when the up-front plan
  // assigned one - pins the organization/event and, only when confidently
  // known, its period, so the Case Study slide cannot substitute or invent.
  prompt += buildCaseStudyAnchorBlock(assignedCaseStudy);

  // AC3 (docs/REGRESSION.md 146) / tool-churn fix: the COURSE's committed
  // toolset (courseProject.tools, read once per week in buildScheduleWeekPlan
  // above), not a fresh per-week choice - the deck's own per-concept
  // "moduleTools" entries (APPLIED_STRUCTURE_REQUIREMENTS) must stay
  // consistent with it rather than inventing an unrelated tool.
  if (requiredTools.length > 0) {
    prompt += `

REQUIRED TOOL(S): this course has committed to the following free tool(s) for the whole term: ${requiredTools.join("; ")}. Your "moduleTools" entries must use these same tool(s) for every concept whose hands-on work maps to the assignment's deliverable. ${COMMITTED_TOOLSET_RULE}`;
  }

  if (sourceMaterial?.trim()) {
    // Same aligned/name-only test as the schedule prompt (parseTocChapters):
    // a real chapter list earns chapter/section references; a bare name (no
    // parseable TOC) is mentioned by name only.
    const aligned = parseTocChapters(sourceMaterial).length > 0;
    if (aligned) {
      prompt += `

Source material for this week:
${sourceMaterial.trim()}

Build this week's materials around the source sections named in the topic/summary above: reference chapter/section numbers where the source material above provides them, and assign readings from the source.`;
    } else {
      prompt += `

Primary source: ${sourceMaterial.trim()}

No table of contents was provided for this source, so mention it by name where it fits naturally - do not invent chapter or section numbers.`;
    }

    if (isNonContentWeekText(topic, summary)) {
      const covered = describeCoveredChapters(allWeeks, weekNumber || 0);
      prompt += `

This week's topic/summary marks it as a review, exam, or project week - it introduces no new chapter. Produce the matching artifact (a review guide, a practice set, or a project brief, whichever the topic/summary calls for), grounded in the chapters already covered so far${covered ? ` (${covered})` : ""}, not a fabricated new chapter's lecture.`;
    }
  }

  if (context?.trim()) {
    prompt += `

Additional instructor context (follow where applicable):
${context.trim()}`;
  }

  prompt += `

Return ONLY valid JSON:
${slideDeckJsonShape(courseKind)}

Requirements:
${slideStructureRequirements(courseKind)}`;

  let parsed: {
    presentationTitle?: string;
    slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string; notes?: string }>;
    moduleTools?: unknown;
  } | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: SCHEDULE_SLIDES_MAX_OUTPUT_TOKENS },
      },
      provider
    );

    if (!result.ok) {
      // V3-AC3 (professional-lift audit): a single deck-generation call
      // failure in a multi-week run is almost certainly transient - retry
      // once (same as the JSON-parse failures below) before falling back to
      // the placeholder deck, rather than giving up on attempt 1 alone.
      if (attempt === 1) {
        console.error(
          `Slide generation LLM call failed for "${topic}" (attempt 1): HTTP ${result.status} — ${result.body.slice(0, 200)}`
        );
        continue;
      }
      return { error: `LLM API error for "${topic}": HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      if (attempt === 1) {
        console.error(`Slide JSON parse failed for "${topic}" (attempt 1): no JSON object in the response`);
        continue;
      }
      return { error: `Could not parse slide data for "${topic}".` };
    }

    try {
      parsed = JSON.parse(jsonText) as {
        presentationTitle?: string;
        slides?: Array<{ title?: string; bullets?: string[]; code?: string; codeLanguage?: string }>;
        moduleTools?: unknown;
      };
      break;
    } catch (err) {
      if (attempt === 1) {
        console.error(
          `Slide JSON parse failed for "${topic}" (attempt 1): ${err instanceof Error ? err.message : String(err)}`
        );
        continue;
      }
      return { error: `Could not parse slide data for "${topic}".` };
    }
  }

  if (!parsed) {
    return { error: `Could not parse slide data for "${topic}".` };
  }

  if (!parsed.slides || !Array.isArray(parsed.slides)) {
    return { error: `Model did not return a valid slides array for "${topic}".` };
  }

  let slides: SlideData[] = parsed.slides
    .filter((s) => typeof s.title === "string" && Array.isArray(s.bullets))
    .map((s) => toSlideData(s, 4));

  slides = propagateExampleCodeToFollowups(slides);

  // AC2: the applied no-code guard - defense in depth against exactly the
  // prompt regression that shipped Python to a no-code course twice.
  const guard = enforceNoCodeForApplied(slides, courseKind);
  if (guard.violations > 0) {
    console.error(
      `Applied no-code guard: stripped code from ${guard.violations} slide(s) for "${topic}" - the model returned code despite the applied contract forbidding it.`
    );
  }

  // AC4: the real tool(s) this deck committed to, one per concept.
  const moduleTools = Array.isArray(parsed.moduleTools)
    ? parsed.moduleTools.filter((t): t is string => typeof t === "string" && t.trim() !== "")
    : [];

  // P3-AC1/AC2/AC3: the graphics data-layer guard - mirrors the no-code
  // guard's role above, for graphics instead of code. A prompt saying EVERY
  // Artifact/Judgment Call/Agenda slide must carry a graphic is not enough
  // on its own (a real generated course shipped 38/80 Artifact slides and
  // 0/80 Judgment Call slides with no graphic despite the prompt saying so):
  // find the gaps, make ONE targeted repair call naming just the offending
  // slides, then check again. Anything that still comes back missing is
  // logged and reported, never silently shipped.
  const graphicCheck = enforceGraphicsForApplied(guard.slides, courseKind);
  let finalSlides = graphicCheck.slides;
  let graphicViolations = 0;
  if (graphicCheck.missing.length > 0) {
    finalSlides = await fillMissingGraphics(finalSlides, graphicCheck.missing, provider);
    const recheck = enforceGraphicsForApplied(finalSlides, courseKind);
    graphicViolations = recheck.missing.length;
    if (graphicViolations > 0) {
      console.error(
        `Applied graphics guard: ${graphicViolations} slide(s) still missing a required graphic for "${topic}" after the repair pass - ${recheck.missing
          .map((g) => g.title)
          .join("; ")}.`
      );
    }
  }

  // P2-AC8: grow the shared, run-scoped "already used" list with THIS
  // week's Case Study subject, so a later week's prompt (built above, before
  // this point) is told not to reuse it. A mutation, not a replacement - the
  // same array reference every other week in this run shares.
  const caseStudySlide = findCaseStudySlide(finalSlides);
  if (caseStudySlide) {
    usedCaseStudies.push(caseStudyDescriptor(caseStudySlide));
  }

  return {
    presentationTitle: parsed.presentationTitle ?? topic,
    slides: finalSlides,
    moduleTools,
    codeViolations: guard.violations,
    graphicViolations,
  };
}
