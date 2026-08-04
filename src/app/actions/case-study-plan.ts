"use server";

// V1/V2/V4 (professional-lift audit): choose the whole term's anchor case
// studies UP FRONT, in ONE pass, before any week's opener or deck is
// generated. Replaces the old per-week, race-prone mechanism where the
// opener and the deck each picked their own case independently (most weeks
// taught two different disasters), the cross-week exclusion list was
// populated only as weeks completed under mapWithConcurrency's 4-at-a-time
// pool (so the first four weeks always saw an empty list), and the model
// asserted specific years it could not support.
//
// generateLectureMaterialsFromScheduleAction (course-planning.ts) calls this
// ONCE, before its mapWithConcurrency loop starts; the per-week result is
// threaded into buildScheduleWeekPlan (course-planning-grounding.ts), which
// hands the SAME assignment to both the opener and the deck.
//
// Z1 (Group Z): COURSE-KIND AWARE - an "applied" course matches against
// APPLIED_CASE_STUDIES (src/lib/case-study-library.ts, a project-management/
// business-failure bank); a "coding" course matches against CASE_STUDIES
// (src/lib/research/case-studies.ts, a software bank), via the SAME scoring
// mechanism (matchBestByTopics, src/lib/case-study-match.ts) either way - one
// anchor case per week, chosen ONCE up front, each week told which cases the
// other weeks hold so nothing repeats. Before this, a coding course had NO
// up-front plan at all (this function was applied-only) - exactly the state
// the applied path was in before this same fix (entry 160).

import type { ScheduleWeekPlan } from "../actions-types";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { matchCaseStudyLibraryEntry } from "@/lib/case-study-library";
import { matchCodingCaseStudyEntry } from "@/lib/research/case-studies";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";
import type { CourseKind } from "@/lib/course-kind";
import { jsonObjectSlice } from "./shared";

/**
 * Group F (backlog: "validated case studies, one per week per course"),
 * decision 4 - a mutated-in-place, OPTIONAL diagnostics sink for a single
 * planCourseCaseStudies call. Mirrors the "shared, mutated object threaded
 * through a run" idiom this codebase already uses for usedCaseStudies
 * (course-planning-grounding.ts) - one new field for one new concern
 * (reporting), not a second no-repeat tracker: no-repeat itself is still
 * owned entirely by planCourseCaseStudies' own usedLibraryIds Set below,
 * unchanged.
 *
 * A week's number lands in exhaustedWeeks when BOTH of these hold:
 *   1. Pass 1 could not assign it a curated entry (it fell through to pass 2
 *      / the LLM, or - for the embedded provider - to nothing at all).
 *   2. Re-checking that SAME week's topic/summary with every in-run
 *      exclusion lifted DOES find a qualifying curated entry.
 * The only thing that can explain (2) succeeding where the original,
 * exclusion-respecting match failed is that an entry usedLibraryIds had
 * already removed from candidacy - i.e. an entry an EARLIER week in this
 * same call already claimed - was the difference. That is "the library ran
 * out of qualifying distinct entries" for this week specifically, as
 * opposed to a week whose topic never had a qualifying candidate at all
 * (a content gap - see entry 190's Limits - which is NOT exhaustion and is
 * therefore not reported here). Optional and purely additive: every
 * pre-existing caller that does not pass this parameter pays no cost and
 * sees no behavior change (see the `diagnostics &&` short-circuit below,
 * which skips the extra, unconstrained match entirely when unused).
 */
export interface CaseStudyPlanDiagnostics {
  /** Week numbers (ScheduleWeekPlan.week), in the order pass 1 encountered
   * them, that fell back to the LLM pass specifically because every curated
   * entry matching their topic was already claimed by an earlier week in
   * this run. */
  exhaustedWeeks: number[];
}

/**
 * Assign one anchor case study per week, for the whole schedule.
 *
 * Pass 1 (deterministic, no LLM call): match each week's topic/summary
 * against the curated library for this course kind (APPLIED_CASE_STUDIES for
 * "applied", CASE_STUDIES for "coding") - code owns these facts, so a
 * matched week's date can never be wrong (V2). A curated entry is claimed by
 * at most one week.
 *
 * Pass 2 (one LLM call for every week pass 1 could not match): asks the
 * model to choose a real, well-known event per remaining week, explicitly
 * forbidding a precise year unless it is confident, and telling it which
 * organizations are already claimed (by pass 1 and by other weeks in this
 * same call) so it does not duplicate one.
 *
 * Never throws: a week this cannot confidently assign is simply absent from
 * the returned map; its caller falls back to today's per-artifact choice for
 * that one week (degraded, not fatal) - see buildScheduleWeekPlan's own
 * fallback prompt text when no assignment is present.
 *
 * `courseKind` defaults to "applied" so every pre-existing caller/test
 * (written before this parameter existed) behaves exactly as before.
 *
 * `diagnostics`, when passed, is grown with every week pass 1 sends to the
 * LLM pass specifically because the library exhausted its qualifying
 * entries for that topic mid-course - see CaseStudyPlanDiagnostics above.
 */
export async function planCourseCaseStudies(
  weeks: ScheduleWeekPlan[],
  courseDescription: string,
  provider: LlmProvider,
  courseKind: CourseKind = "applied",
  diagnostics?: CaseStudyPlanDiagnostics
): Promise<Map<number, CaseStudyAssignment>> {
  const assignments = new Map<number, CaseStudyAssignment>();
  const usedLibraryIds = new Set<string>();
  const unmatched: ScheduleWeekPlan[] = [];

  for (const week of weeks) {
    if (!week.topic?.trim()) continue;
    const topic = week.topic;
    const summary = week.summary ?? "";
    if (courseKind === "coding") {
      const entry = matchCodingCaseStudyEntry(topic, summary, usedLibraryIds);
      if (entry) {
        usedLibraryIds.add(entry.id);
        assignments.set(week.week, {
          organization: entry.organization,
          // CASE_STUDIES entries are established facts (see that module's
          // own header comment) with a real, verified single year, unlike
          // APPLIED_CASE_STUDIES' deliberately hedged "period" strings - so
          // stating it directly here is not the same risk V2 guards against.
          period: String(entry.year),
          hook: `${entry.summary.join(" ")} ${entry.lesson}`.trim(),
        });
        continue;
      }
      // Decision 4: see CaseStudyPlanDiagnostics above for exactly what this
      // proves and why an unconstrained re-match is a sound way to prove it.
      if (diagnostics && matchCodingCaseStudyEntry(topic, summary, new Set()) !== null) {
        diagnostics.exhaustedWeeks.push(week.week);
      }
    } else {
      const entry = matchCaseStudyLibraryEntry(topic, summary, usedLibraryIds);
      if (entry) {
        usedLibraryIds.add(entry.id);
        assignments.set(week.week, {
          organization: entry.organization,
          period: entry.period,
          hook: `${entry.summary.join(" ")} ${entry.lesson}`.trim(),
        });
        continue;
      }
      if (diagnostics && matchCaseStudyLibraryEntry(topic, summary, new Set()) !== null) {
        diagnostics.exhaustedWeeks.push(week.week);
      }
    }
    unmatched.push(week);
  }

  if (unmatched.length === 0 || provider === "embedded") return assignments;

  try {
    await requireOwner();

    const alreadyAssigned = [...assignments.values()].map((a) => a.organization);
    const weekLines = unmatched
      .map((w) => `Week ${w.week}: ${w.topic.trim()}${w.summary?.trim() ? ` - ${w.summary.trim()}` : ""}`)
      .join("\n");

    const courseKindDescriptor = courseKind === "coding" ? "programming" : "applied (no-code)";
    const prompt = `You are planning the real-world case studies for an entire ${courseKindDescriptor} course${courseDescription.trim() ? `: ${courseDescription.trim()}` : ""}.

For EACH week below, choose ONE specific, well-known, widely-documented real event (an organization or program, and what happened) that fits that week's topic. This is the SAME case a class opener discussion and a full lecture deck will both build the whole session around, so choose carefully, and never assign the same case to two different weeks.
${alreadyAssigned.length > 0 ? `\nCases already assigned to OTHER weeks in this course - do not reuse any of these: ${alreadyAssigned.join("; ")}\n` : "\n"}
WEEKS TO ASSIGN:
${weekLines}

For every week, also state the general time period ONLY if you are confident of it - a decade or a short range (e.g. "the mid-1990s", "2010-2011") - and leave "period" as an empty string if you are not certain. NEVER state a single precise year unless you are certain it is correct; a wrong date is worse than no date. Never invent an organization or event.

Return ONLY valid JSON:
{ "assignments": [ { "week": 1, "organization": "...", "period": "...", "hook": "one sentence on what happened and why it fits this week's topic" }, ... ] }

Return exactly one entry per week listed above, using each week's own number.`;

    const result = await callLlm(
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 2048 },
      },
      provider
    );

    if (!result.ok) return assignments;

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) return assignments;

    const parsed = JSON.parse(jsonText) as {
      assignments?: Array<{ week?: unknown; organization?: unknown; period?: unknown; hook?: unknown }>;
    };
    if (!Array.isArray(parsed.assignments)) return assignments;

    const claimedOrganizations = new Set(alreadyAssigned.map((o) => o.toLowerCase()));
    for (const item of parsed.assignments) {
      const weekNumber = Number(item.week);
      const organization = typeof item.organization === "string" ? item.organization.trim() : "";
      if (!Number.isFinite(weekNumber) || !organization) continue;
      // The model reused an already-claimed organization anyway - skip this
      // entry rather than ship a cross-week collision the whole point of
      // this pass was to prevent.
      if (claimedOrganizations.has(organization.toLowerCase())) continue;

      const period = typeof item.period === "string" ? item.period.trim() : "";
      const hook = typeof item.hook === "string" ? item.hook.trim() : "";
      assignments.set(weekNumber, {
        organization,
        period: period || undefined,
        hook,
      });
      claimedOrganizations.add(organization.toLowerCase());
    }

    return assignments;
  } catch {
    return assignments;
  }
}
