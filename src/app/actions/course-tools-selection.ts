"use server";

// Extracted out of src/app/actions/course-planning-grounding.ts (at the
// file's line cap) - selectRequiredTools/selectCourseTools are both
// self-contained "ask the model for a tool list" helpers with no dependency
// on buildScheduleWeekPlan/generateSlidesFromTopic beyond sharing jsonObjectSlice,
// so moving them out is a mechanical extraction, not a behavior change.
// NOT re-exported from course-planning-grounding.ts: that is a "use server"
// module, and `export { x } from "./y"` is illegal there by form (such a
// module may export nothing but async functions, and a re-export gives the
// bundler no way to see through it to prove the binding is async) - see that
// file's own comment at the spot these two used to live. Importers take
// these two functions directly from this module, or via the "@/app/actions"
// barrel, which re-exports this module with `export *` (a plain module, so
// the same form is legal there).

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
 * DOMAIN-FIRST (RCA: the "ethical hacking got Notion and Airtable" defect):
 * every paragraph above and below this one predates a real failure - a
 * generated BIT 320 (Ethical Hacking, 16 weeks) course committed to Notion
 * and Airtable as its CORE, with a week 3 "Network Reconnaissance"
 * assignment literally asking students to submit "a link to your updated
 * Airtable base." Nothing in the old prompt text ever asked the model what a
 * practitioner in the COURSE'S OWN FIELD actually uses - it went straight to
 * "choose 2-3 tools that hold persistent project data," illustrated with a
 * project-management example ("a board/planning tool plus a spreadsheet"),
 * so a security course got the closest thing to that example instead of a
 * security tool. By contrast a generated MGT 422 (project management) course
 * correctly landed on Asana/Google Sheets/Miro from the exact same prompt
 * shape - so the machinery works; the prompt's built-in assumption that
 * "applied (no-code)" means "project-administration shaped" was the bug.
 * "Applied" only means the course does not write code - it says nothing
 * about what KIND of hands-on work the field does, and a hands-on technical,
 * scientific, or creative field has its own real practitioner tools (a lab
 * environment, a scanner, a design tool, a statistics package) that are not
 * project-planning software at all. The prompt now makes the model reason
 * DOMAIN FIRST - what does a working practitioner in THIS course's own
 * subject actually use - and only THEN narrow that domain-grounded set down
 * to the small, stable CORE that must persist across the term; the
 * project-management framing survives only as one labeled EXAMPLE among
 * others, not the default shape every course is forced into. This is
 * deliberately NOT a lookup table of "if security then Kali/Nmap/Wireshark"
 * - a hardcoded per-domain tool list could never generalize past the fields
 * someone thought to enumerate (a statistics course, a graphic-design
 * course, a network-administration course would all need their own entry),
 * so the fix is a REASONING instruction over the course's own description
 * and weekly topics (both already passed in below), the same information
 * a human designing the course's toolset would read first.
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

FIRST, read the course description and every weekly topic above and work out what a working PRACTITIONER in THIS course's own subject actually uses to do the field's real work. Do not assume this is a project-management or business-administration course just because it is applied/no-code: "applied" only means the students are not writing programs, never that the course itself is about planning or administering a project. A hands-on technical, scientific, or creative field has its OWN practitioner tools - a lab environment, a scanner, a diagnostic or analysis tool, a design tool, a statistics package - and THOSE are what this course's students should be told to use, never a generic project-planning tool standing in for work the field does not actually do that way. Only a course whose own weekly topics are actually about planning, scheduling, budgeting, or administering a project should land on planning/board software as its core.

ONLY AFTER you have identified those real domain tools, narrow to a SMALL, STABLE CORE set of 2 to 3 of them that hold the student's PERSISTENT PROJECT DATA for the whole term - the running task list, the register, the charter, the core calculations, or whatever this field's own equivalent genuinely is (a dataset, a lab notebook, a working file, a case log) that the student keeps building on week after week rather than starting over. A student uses THESE SAME tools every week for the ENTIRE term - never a different tool week to week, and never asked to re-create their project's data in a new tool partway through. Each CORE tool must play a DIFFERENT, COMPLEMENTARY role (never two tools that do the same job) - for a project-management course this typically looks like a board/planning tool plus a spreadsheet for calculations, but that is only ONE field's example: adapt entirely to what THIS field's own practitioners use, which for a different field will look nothing like that example.

Do NOT try to make this small CORE set cover every kind of work the term will need - that is exactly what collapses a real course onto one generic tool used almost every week. A specific week is free to introduce its OWN specialist tool later - for example a real scheduling/Gantt tool for a scheduling week, a diagramming tool for a network-diagram or process-flow week, a survey tool for a stakeholder-input week, or a dashboard/reporting tool for a performance-measurement week - for work this CORE genuinely cannot do well, as long as the result is produced in that tool and exported as a file, screenshot, or link rather than becoming a new home for data the student has to keep maintaining. That per-week decision happens later, downstream of this call - this CORE set only needs to hold what must persist across the whole term.

For each CORE tool, give the FREE way a student can reach it: a free tier, a free trial, a community edition, or - only when the tool truly has no free option - a spreadsheet equivalent. Many hands-on technical and scientific fields already have genuinely free or open-source professional-grade tools; a real domain tool reached for free beats substituting a generic productivity app every time.

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
