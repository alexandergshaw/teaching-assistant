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
import { matchCodingCaseStudyEntry, type CaseStudyEntry } from "@/lib/research/case-studies";
import { searchKnowledgeRows, rowToCaseStudy } from "@/lib/research/db";
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
 * therefore not reported here).
 *
 * Group C: a week recorded here by (1)/(2) above but then RESCUED by the
 * researched (knowledge_entries) pass that now sits between pass 1 and pass
 * 2 (see planCourseCaseStudies' own doc comment, and that pass's comment in
 * its body) is removed again before this function returns. It never
 * actually fell through to pass 2 or to nothing at all, so leaving it
 * recorded here would tell a caller "this week is an unverified LLM guess"
 * about a week that in fact got a corroborated, deck-grade assignment -
 * exactly what (1) above promises this list will NOT include.
 *
 * Optional and purely additive: every
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
 * CaseStudyEntry (src/lib/research/case-studies.ts - the CASE_STUDIES shape,
 * and the exact shape rowToCaseStudy, src/lib/research/db.ts, maps a
 * knowledge_entries row back into) -> CaseStudyAssignment. One helper for
 * both places this file builds an assignment from that shape: the coding
 * branch's curated match below, and the Group C researched pass below that
 * reads the same shape back out of the database. Both sources carry the
 * same guarantee CASE_STUDIES entries already had - a real, single verified
 * year, unlike APPLIED_CASE_STUDIES' deliberately hedged "period" strings
 * (see CaseStudyAssignment's own `period` comment) - so stating it directly
 * here is not the same risk V2 guards against, for either source.
 */
function caseStudyEntryToAssignment(entry: CaseStudyEntry): CaseStudyAssignment {
  return {
    organization: entry.organization,
    period: String(entry.year),
    hook: `${entry.summary.join(" ")} ${entry.lesson}`.trim(),
  };
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
 * Group C (researched pass, deterministic, no LLM call): for every week
 * pass 1 could not match, read knowledge_entries (searchKnowledgeRows, kind:
 * "case_study") and map any row back through rowToCaseStudy - a stored
 * entry the research step has already corroborated against outside sources,
 * more trustworthy than an LLM guess but never hand-picked into this file's
 * in-repo arrays the way a pass-1 entry was. Sits between pass 1 and pass 2
 * in trust order, and runs even for the embedded provider (see the early
 * return in the body, just below this pass): embedded explicitly promises
 * callers it draws on the stored knowledge base, even though it never
 * reaches pass 2. Shares usedLibraryIds with pass 1, so a researched entry
 * can no more land on two weeks than a curated one can.
 *
 * Pass 2 (one LLM call for every week still unmatched after pass 1 and the
 * researched pass above): asks the model to choose a real, well-known event
 * per remaining week, explicitly forbidding a precise year unless it is
 * confident, and telling it which organizations are already claimed (by the
 * earlier passes and by other weeks in this same call) so it does not
 * duplicate one.
 *
 * Never throws: a week this cannot confidently assign is simply absent from
 * the returned map; its caller falls back to today's per-artifact choice for
 * that one week (degraded, not fatal) - see buildScheduleWeekPlan's own
 * fallback prompt text when no assignment is present. The researched pass
 * follows the same contract: a database failure degrades to "no researched
 * candidate for this week," never a thrown error.
 *
 * `courseKind` defaults to "applied" so every pre-existing caller/test
 * (written before this parameter existed) behaves exactly as before.
 *
 * `diagnostics`, when passed, is grown during pass 1 with every week sent
 * onward specifically because the curated library exhausted its qualifying
 * entries for that topic mid-course, then shrunk again for any such week the
 * researched pass above goes on to rescue - see CaseStudyPlanDiagnostics
 * above for exactly why.
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
  let unmatched: ScheduleWeekPlan[] = [];

  for (const week of weeks) {
    if (!week.topic?.trim()) continue;
    const topic = week.topic;
    const summary = week.summary ?? "";
    if (courseKind === "coding") {
      const entry = matchCodingCaseStudyEntry(topic, summary, usedLibraryIds);
      if (entry) {
        usedLibraryIds.add(entry.id);
        assignments.set(week.week, caseStudyEntryToAssignment(entry));
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

  // Group C (researched pass, deterministic, no LLM call): for every week
  // pass 1 could not match, read the knowledge base for a corroborated
  // entry before falling back to the LLM. See planCourseCaseStudies' own
  // doc comment above for how this fits into the overall trust order, and
  // CaseStudyPlanDiagnostics above for how it interacts with exhaustedWeeks.
  // Runs ABOVE the provider === "embedded" early return just below on
  // purpose: embedded explicitly draws on this same stored knowledge base,
  // so an embedded run must get this pass too, even though (like every
  // other provider) it can never reach pass 2, the LLM call further down.
  if (unmatched.length > 0) {
    const stillUnmatched: ScheduleWeekPlan[] = [];
    const rescuedByDbPass = new Set<number>();

    for (const week of unmatched) {
      const topic = week.topic;
      let claimed: CaseStudyEntry | null = null;
      try {
        const rows = await searchKnowledgeRows(topic, { kind: "case_study" });
        // null means the database is unavailable (see searchKnowledgeRows'
        // own doc comment in db.ts) - treated exactly like zero rows, never
        // as an error.
        if (rows) {
          for (const row of rows) {
            const candidate = rowToCaseStudy(row);
            // rowToCaseStudy already enforces organization + year + lesson +
            // a non-empty summary - the same "deck-grade" bar CASE_STUDIES'
            // own curated entries clear - so any non-null candidate here is
            // trustworthy on its own terms. usedLibraryIds is shared with
            // pass 1 (and with earlier weeks already claimed in this same
            // pass), so a row already spoken for - by a curated match or by
            // an earlier week's researched match - is skipped in favor of
            // the next candidate.
            if (candidate && !usedLibraryIds.has(candidate.id)) {
              claimed = candidate;
              break;
            }
          }
        }
      } catch {
        // NEVER THROW: a failure here degrades to exactly the same outcome
        // as finding no candidate - the week stays unmatched and falls
        // through to pass 2 below.
        claimed = null;
      }

      if (claimed) {
        usedLibraryIds.add(claimed.id);
        assignments.set(week.week, caseStudyEntryToAssignment(claimed));
        rescuedByDbPass.add(week.week);
      } else {
        stillUnmatched.push(week);
      }
    }

    unmatched = stillUnmatched;

    // Decision 4 (CaseStudyPlanDiagnostics above) defines exhaustedWeeks as
    // weeks that fell through to pass 2 (or, for embedded, to nothing at
    // all) BECAUSE pass 1's curated library ran out of qualifying entries.
    // A week just rescued here never reaches pass 2 and never falls through
    // to nothing - it got a real, corroborated assignment instead - so it no
    // longer fits that definition, even though pass 1's own check (which ran
    // before this pass had any chance to rescue anything) already recorded
    // it. Strip those weeks back out, in place, so the documented meaning
    // holds exactly as written rather than silently drifting now that a
    // second, non-LLM rescue sits between pass 1 and pass 2.
    if (diagnostics && rescuedByDbPass.size > 0) {
      const stillExhausted = diagnostics.exhaustedWeeks.filter((w) => !rescuedByDbPass.has(w));
      diagnostics.exhaustedWeeks.length = 0;
      diagnostics.exhaustedWeeks.push(...stillExhausted);
    }
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
