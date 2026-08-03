"use server";

import type { AssignmentPlan, ScheduleWeekPlan } from "../actions-types";
import type { CourseKind } from "@/lib/course-kind";
import { callLlm, describeEmptyLlmText, describeLlmFailure, type LlmProvider, type Source } from "@/lib/llm";
import { courseEngineLecture, courseEngineMaterials, type CourseEngineFile, type CourseEngineUploadFile, type CourseEngineHomework } from "@/lib/course-engine";
import { requireOwner } from "@/lib/supabase/auth";
import { extractJsonObject, mapWithConcurrency } from "./shared";
import { parseTocChapters, shouldDeriveToc } from "@/lib/workflows/source-alignment";
import { deriveTocFromSource, buildScheduleWeekPlan } from "./course-planning-grounding";
import { emptyCourseProject, type CourseProject } from "@/lib/course-project";
import { planCourseCaseStudies } from "./case-study-plan";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";

// ── Course Engine binary endpoints ──────────────────────────────────────────
// These wrap the Course Engine API's file-returning endpoints. They are invoked
// only when the provider toggle is set to "other"; the result is a base64 file
// the client downloads directly (no in-app editable preview).

export async function generateLectureDeckAction(
  objectives: string,
  title?: string,
  file?: CourseEngineUploadFile,
  homework?: CourseEngineHomework
): Promise<CourseEngineFile | { error: string }> {
  try {
    return await courseEngineLecture(objectives, title, file, homework);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Lecture generation failed." };
  }
}

export async function generateCourseMaterialsAction(
  zipBase64: string
): Promise<(CourseEngineFile & { rubricCsv: string | null }) | { error: string }> {
  try {
    const materials = await courseEngineMaterials(zipBase64);

    // The materials package already contains the deterministic rubric.csv, so
    // pull it out here and hand it back with the file — that lets the UI show
    // the rubric from this single call instead of re-hitting /materials.
    let rubricCsv: string | null = null;
    try {
      const JSZip = (await import("jszip")).default;
      const out = await JSZip.loadAsync(Buffer.from(materials.base64, "base64"));
      const rubricFile =
        out.file("rubric.csv") ??
        out.file(Object.keys(out.files).find((p) => /(^|\/)rubric\.csv$/i.test(p)) ?? "");
      if (rubricFile) {
        const csv = (await rubricFile.async("string")).trim();
        rubricCsv = csv || null;
      }
    } catch {
      // Rubric extraction is best-effort; the package download still succeeds.
    }

    return { ...materials, rubricCsv };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Materials generation failed." };
  }
}

/** Read a repo's latest GitHub Actions run (CI signal for the grading view). */

// ── Course schedule generation ──────────────────────────────────────────────────

/** Represents a single week in a course schedule with topic, assignments, and tests. */

// Shared between the pasted-TOC and derived-TOC aligned branches so the
// balancing policy text is identical either way (see generateSchedulePlanAction).
const CHAPTER_ALIGNMENT_POLICY = `Align the weekly plan to this source's chapters/modules in order (week N covers chapter(s) X), and name the covered chapter(s) in each week's summary (e.g., "Chapter 3: Functions" or "Chapters 2-4: Foundations"). Apply this balancing policy:
- Fewer chapters than weeks: allocate the extra weeks to the densest chapters (judged from the subsection counts shown in the source material above), splitting a dense chapter into "Chapter N - Part I" and "Chapter N - Part II", and insert standard non-content weeks (a mid-term review and exam near the midpoint; a project and/or final-review and final week near the end) as needed to fill out the term.
- More chapters than weeks: group adjacent related chapters into shared weeks (e.g., "Chapters 4-5: ...") - never drop a chapter.
- Never invent source content: every week's summary names exactly what it covers (e.g., "Chapter 7: ...", "Review - Chapters 1-6", "Final project week").
- The instructor context below overrides these rules where it speaks (e.g. "no exam weeks" removes the exam week even where this policy would otherwise add one).`;

/**
 * Generate a course schedule from a high-level description, distributing assignments and tests evenly.
 * Returns a courseTitle and the structured week plan used by workflows (assignment slugs + test
 * flags), unlike generateCourseScheduleAction, which produces display rows for the syllabus.
 */
export async function generateSchedulePlanAction(
  courseDescription: string,
  weeks: number,
  tests: number,
  provider: LlmProvider = "gemini",
  context?: string,
  sourceMaterial?: string
): Promise<
  | { courseTitle: string; schedule: ScheduleWeekPlan[]; derivedToc?: string; derivedSources?: Source[] }
  | { error: string }
> {
  try {
    await requireOwner();

    // Validate inputs
    if (!courseDescription.trim()) return { error: "Enter a course description." };
    const weekCount = Number(weeks);
    if (!Number.isInteger(weekCount) || weekCount < 1 || weekCount > 52) {
      return { error: "Enter a number of weeks between 1 and 52." };
    }
    const testCount = Number(tests);
    if (!Number.isInteger(testCount) || testCount < 0 || testCount > weekCount) {
      return { error: "The number of tests must be between 0 and the number of weeks." };
    }

    // Call LLM to generate schedule
    let prompt = `You are an expert curriculum designer. Given a course description, produce a JSON object ONLY (no markdown fences) with:
- "courseTitle": a clear, concise title for the course
- "weeks": an array with exactly ${weekCount} week objects, each with:
  - "week": 1-based week number
  - "topic": short topic name
  - "summary": 1-2 sentence description
  - "assignmentTitle": string or null (null only for test weeks)
  - "assignmentSlug": kebab-case slug like "week-01-variables" or null
  - "testName": string like "Test 1" or null

Distribute exactly ${testCount} tests evenly across the term (final test in week ${weekCount} if tests > 0).
Every non-test week must have an assignment reinforcing the week's topic.
Topics should progress from foundational to advanced.

Course description:
${courseDescription}`;

    let derivedToc: string | undefined;
    let derivedSources: Source[] | undefined;

    if (sourceMaterial?.trim()) {
      // "Aligned" means the source material parses as a real chapter/module
      // list (see parseTocChapters); the same test drives the post-generation
      // balance check in the generate-schedule step. When it does not parse
      // (e.g. a bare textbook citation used as a fallback source), the schedule
      // still names the source, but weaker: no attempt at chapter alignment -
      // UNLESS the text looks like a course identifier (shouldDeriveToc: a
      // URL or a short citation), in which case one web-search-grounded call
      // (deriveTocFromSource) tries to find the source's real published table
      // of contents first; a miss falls back to the same name-only branch.
      const pastedChapters = parseTocChapters(sourceMaterial);
      if (pastedChapters.length > 0) {
        prompt += `

Source material alignment:
${sourceMaterial.trim()}

${CHAPTER_ALIGNMENT_POLICY}`;
      } else {
        const derivation = shouldDeriveToc(sourceMaterial)
          ? await deriveTocFromSource(sourceMaterial, provider)
          : null;

        if (derivation) {
          derivedToc = derivation.toc;
          derivedSources = derivation.sources;
          prompt += `

Primary source: ${sourceMaterial.trim()}

Source material alignment (the official table of contents, found via web search):
${derivation.toc}

${CHAPTER_ALIGNMENT_POLICY}`;
        } else {
          prompt += `

Primary source: ${sourceMaterial.trim()}

No table of contents was provided for this source, so mention it by name in weeks where it fits naturally - do not attempt chapter-by-chapter alignment or invent a chapter structure.`;
        }
      }
    }

    if (context?.trim()) {
      prompt += `

Additional instructor context (follow where applicable):
${context.trim()}`;
    }

    const r = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
      },
      provider
    );

    if (!r.ok) return { error: describeLlmFailure(r, "Schedule generation failed") };
    if (!r.text.trim()) return { error: describeEmptyLlmText(r, "Schedule generation failed") };

    const parseFailureEvidence = `The model returned: "${r.text.slice(0, 160).replace(/\s+/g, " ").trim()}"`;

    const parsed = extractJsonObject(r.text);
    if (!parsed || typeof parsed !== "object") {
      return { error: `Could not parse the generated schedule. Try again. ${parseFailureEvidence}` };
    }

    // Extract and validate weeks array
    const weeksArray = parsed.weeks;
    if (!Array.isArray(weeksArray)) {
      return { error: `Could not parse the generated schedule. Try again. ${parseFailureEvidence}` };
    }

    if (weeksArray.length < weekCount) {
      return { error: "The model returned the wrong number of weeks. Try again." };
    }

    // Trim to exact count if extras exist
    const schedule: ScheduleWeekPlan[] = weeksArray.slice(0, weekCount).map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) {
        return {
          week: 0,
          topic: "",
          summary: "",
          assignmentTitle: null,
          assignmentSlug: null,
          testName: null,
        };
      }
      const e = entry as Record<string, unknown>;
      return {
        week: Number(e.week) || 0,
        topic: typeof e.topic === "string" ? e.topic.trim() : "",
        summary: typeof e.summary === "string" ? e.summary.trim() : "",
        assignmentTitle: typeof e.assignmentTitle === "string" ? e.assignmentTitle.trim() : null,
        assignmentSlug: typeof e.assignmentSlug === "string" ? e.assignmentSlug.trim() : null,
        testName: typeof e.testName === "string" ? e.testName.trim() : null,
      };
    });

    // Derive courseTitle with fallback
    let courseTitle = "";
    if (typeof parsed.courseTitle === "string") {
      courseTitle = parsed.courseTitle.trim();
    }
    if (!courseTitle) {
      // Fallback: first sentence of description, trimmed to 80 chars
      const firstSentence = courseDescription.trim().split(/[.!?]/)[0] || courseDescription.trim();
      courseTitle = firstSentence.slice(0, 80).trim();
    }

    return { courseTitle, schedule, derivedToc, derivedSources };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the schedule." };
  }
}

/**
 * Generate lecture materials (slides, module intro, assignment instructions) from a course schedule.
 * Takes a parsed schedule (ScheduleWeekPlan[] JSON) and generates one AssignmentPlan per week with a topic.
 * Returns AssignmentPlan[] shaped entries | error.
 */
export async function generateLectureMaterialsFromScheduleAction(
  scheduleJson: string,
  courseDescription: string,
  minutes: number,
  provider: LlmProvider = "gemini",
  context?: string,
  sourceMaterial?: string,
  // Non-repo material-source-policy text (source-policy.ts resolver output),
  // folded into the prompt through the existing `context` channel via a
  // delimited section; absent/blank changes nothing (the sourceMaterial/TOC
  // path is unaffected).
  supplementalMaterials?: string,
  // Whether this is a programming course. Defaults to "coding" so every
  // existing caller is unchanged; the no-code kickoff passes "applied".
  courseKind: CourseKind = "coding",
  // AC1/AC6 (docs/REGRESSION.md 146): the course's persisted course-long
  // project, threaded straight through to buildScheduleWeekPlan per week -
  // this action itself never inspects it. emptyCourseProject() (the default)
  // leaves every pre-existing caller unaffected.
  courseProject: CourseProject = emptyCourseProject(),
  // T2 (no-code pipeline reorder): threaded straight through to
  // buildScheduleWeekPlan per week, unchanged by this action - see that
  // function's own parameter comment for the phase restructuring this gates.
  // false (the default) leaves every pre-existing caller (including this
  // action's own repoless lecture-zip fallback) byte-for-byte unaffected;
  // only steps.content-lectures.ts's lecture-materials-from-schedule step
  // turns it on, and only for an applied (no-code) course.
  sequenceOpenerBeforeDeck = false
): Promise<AssignmentPlan[] | { error: string }> {
  try {
    await requireOwner();

    // Parse the schedule JSON
    let schedule: ScheduleWeekPlan[];
    try {
      const parsed = JSON.parse(scheduleJson);
      if (!Array.isArray(parsed)) {
        return { error: "Schedule must be a JSON array." };
      }
      schedule = parsed;
    } catch (err) {
      return {
        error: err instanceof Error
          ? `Could not parse schedule JSON: ${err.message}`
          : "Could not parse schedule JSON.",
      };
    }

    if (schedule.length === 0) {
      return { error: "Schedule is empty." };
    }

    const lectureDurationMinutes = Math.max(5, Math.min(Number(minutes) || 50, 240));

    // Filter to weeks with a non-empty topic
    const weeksWithTopics = schedule.filter((w) => w.topic && w.topic.trim());

    if (weeksWithTopics.length === 0) {
      return { error: "No weeks with topics found in the schedule." };
    }

    const effectiveContext = supplementalMaterials?.trim()
      ? `${(context ?? "").trim()}\n\n--- Additional course materials (configured sources) ---\n${supplementalMaterials.trim()}`.trim()
      : context;

    // P2-AC8: one array, shared by every week's call in THIS run, grown as
    // each week's deck comes back with its own Case Study subject - see the
    // parameter comment on buildScheduleWeekPlan/generateSlidesFromTopic
    // (course-planning-grounding.ts) for the full explanation, including why
    // this is monotone-but-not-exhaustive under mapWithConcurrency's
    // up-to-4-at-once worker pool. Kept as a defense-in-depth fallback
    // alongside the up-front plan below - see V4's own comment.
    const usedCaseStudies: string[] = [];

    // V1/V2/V4 (professional-lift audit): choose the whole term's anchor
    // case studies UP FRONT, in ONE pass, before any week generates - this is
    // exactly where the old per-week mechanism raced under
    // mapWithConcurrency (the first 4 weeks always saw usedCaseStudies
    // empty), where the opener and the deck picked different cases, and
    // where a wrong specific year got asserted. Never throws - see
    // planCourseCaseStudies's own doc comment.
    //
    // Z1 (Group Z): BOTH course kinds now get this plan - planCourseCaseStudies
    // is course-kind aware (matches CASE_STUDIES for "coding", APPLIED_
    // CASE_STUDIES for "applied"). Before this, a coding course received NO
    // up-front plan at all, so its deck picked its own case per week with no
    // cross-week consistency guarantee - exactly the state the applied path
    // was in before this same fix. The per-week exclusion-list mechanism
    // above (usedCaseStudies) still runs unconditionally alongside this, for
    // both kinds, as defense in depth.
    const courseCaseStudyPlan: Map<number, CaseStudyAssignment> = await planCourseCaseStudies(
      weeksWithTopics,
      courseDescription,
      provider,
      courseKind
    );

    // Generate one plan per week, with concurrency limit to respect LLM rate limits
    const SCHEDULE_PLAN_CONCURRENCY = 4;
    const plans = await mapWithConcurrency(
      weeksWithTopics,
      SCHEDULE_PLAN_CONCURRENCY,
      (week, index) => {
        const assignedCaseStudy = courseCaseStudyPlan.get(week.week);
        const otherWeeksCaseStudyNames = [...courseCaseStudyPlan.entries()]
          .filter(([weekNumber]) => weekNumber !== week.week)
          .map(([, assignment]) => assignment.organization);

        return buildScheduleWeekPlan(
          week,
          index,
          courseDescription,
          lectureDurationMinutes,
          provider,
          effectiveContext,
          sourceMaterial,
          // Full schedule (not just weeksWithTopics) so a review/exam/project
          // week's materials can be grounded in every earlier week's chapters.
          schedule,
          courseKind,
          courseProject,
          usedCaseStudies,
          sequenceOpenerBeforeDeck,
          assignedCaseStudy,
          otherWeeksCaseStudyNames
        );
      }
    );

    if (plans.length === 0) {
      return { error: "No materials could be generated from the schedule." };
    }

    return plans;
  } catch (err) {
    return {
      error: err instanceof Error
        ? err.message
        : "Could not generate lecture materials from schedule.",
    };
  }
}

