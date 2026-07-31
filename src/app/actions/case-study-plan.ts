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
// ONCE, for an applied course, before its mapWithConcurrency loop starts; the
// per-week result is threaded into buildScheduleWeekPlan
// (course-planning-grounding.ts), which hands the SAME assignment to both
// the opener and the deck.

import type { ScheduleWeekPlan } from "../actions-types";
import { callLlm, type LlmProvider } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { matchCaseStudyLibraryEntry } from "@/lib/case-study-library";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";
import { jsonObjectSlice } from "./shared";

/**
 * Assign one anchor case study per week, for the whole schedule.
 *
 * Pass 1 (deterministic, no LLM call): match each week's topic/summary
 * against the curated APPLIED_CASE_STUDIES library (src/lib/
 * case-study-library.ts) - code owns these facts, so a matched week's date
 * can never be wrong (V2). A curated entry is claimed by at most one week.
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
 */
export async function planCourseCaseStudies(
  weeks: ScheduleWeekPlan[],
  courseDescription: string,
  provider: LlmProvider
): Promise<Map<number, CaseStudyAssignment>> {
  const assignments = new Map<number, CaseStudyAssignment>();
  const usedLibraryIds = new Set<string>();
  const unmatched: ScheduleWeekPlan[] = [];

  for (const week of weeks) {
    if (!week.topic?.trim()) continue;
    const entry = matchCaseStudyLibraryEntry(week.topic, week.summary ?? "", usedLibraryIds);
    if (entry) {
      usedLibraryIds.add(entry.id);
      assignments.set(week.week, {
        organization: entry.organization,
        period: entry.period,
        hook: `${entry.summary.join(" ")} ${entry.lesson}`.trim(),
      });
    } else {
      unmatched.push(week);
    }
  }

  if (unmatched.length === 0 || provider === "embedded") return assignments;

  try {
    await requireOwner();

    const alreadyAssigned = [...assignments.values()].map((a) => a.organization);
    const weekLines = unmatched
      .map((w) => `Week ${w.week}: ${w.topic.trim()}${w.summary?.trim() ? ` - ${w.summary.trim()}` : ""}`)
      .join("\n");

    const prompt = `You are planning the real-world case studies for an entire applied (no-code) course${courseDescription.trim() ? `: ${courseDescription.trim()}` : ""}.

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
