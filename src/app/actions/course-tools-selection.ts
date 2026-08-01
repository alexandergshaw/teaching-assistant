"use server";

// Extracted out of src/app/actions/course-planning-grounding.ts (at the
// file's line cap) - selectRequiredTools/selectCourseTools are both
// self-contained "ask the model for a tool list" helpers with no dependency
// on buildScheduleWeekPlan/generateSlidesFromTopic beyond sharing jsonObjectSlice,
// so moving them out is a mechanical extraction, not a behavior change -
// re-exported from course-planning-grounding.ts so every existing importer
// (including "@/app/actions", which re-exports that module with `export *`)
// keeps working unchanged.

import type { LlmProvider } from "@/lib/llm";
import { callLlm } from "@/lib/llm";
import { jsonObjectSlice } from "./shared";

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
