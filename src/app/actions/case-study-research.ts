"use server";

// Group A (data layer) of the case-study-research feature. Sibling of
// current-events.ts, but where that pipeline returns a report, this one
// writes directly into the knowledge base (knowledge_entries, source:
// 'researched') so a real-world case study, once researched, is immediately
// available to every other feature that reads from src/lib/research/db.ts -
// no separate "apply this report" step.
//
// GROUNDING (mirrors current-events.ts's own doc comment - read that file's
// header first if this one is unclear): a grounded call (webSearch: true)
// that also demands "return ONLY valid JSON" reliably makes Gemini answer
// from parametric memory instead of actually searching - pairing "search the
// web" with a strict JSON contract in the SAME call is what suppresses the
// search. So this pipeline splits into a grounded PROSE call
// (researchCaseStudiesProse, no JSON instruction) and a second, UNGROUNDED
// call that structures that prose into JSON
// (structureProseIntoCaseStudies). Never combine the two into one call.
//
// ONE PASS FOR THE WHOLE COURSE: unlike current-events.ts's per-topic fan-out
// (a separate grounded+structuring pair per topic), this pipeline makes
// exactly ONE grounded call and ONE structuring call covering every week in
// the course at once - this is a one-shot pass that writes rows, not a
// per-week docx generator, so it does not go through runWeeklyGenerator.
// Wall-clock budget: one grounded call (~10-25s for a whole course's worth of
// search) plus one ungrounded structuring call (~3-6s) plus one upsert -
// comfortably inside a 60s serverless budget on its own. Whatever caller
// wires this into a workflow step owns that step's own headless-safety
// bookkeeping (HEADLESS_SAFE_STEP_TYPES) - out of scope here.
import { callLlm, type LlmProvider, type Source } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { verifyItemUrls, type ParsedTopicItem } from "@/lib/workflows/current-events-report";
import { upsertKnowledge, type KnowledgeInsert } from "@/lib/research/db";
import { jsonObjectSlice } from "./shared";

// Call 1 (grounded prose search covering the whole course).
const RESEARCH_MAX_TOKENS = 8192;
// Call 2 (ungrounded structuring of that prose into JSON). STRUCTURE_INPUT_CHAR_CAP
// bounds how much of Call 1's prose this call is asked to read, and it must stay
// sized against RESEARCH_MAX_TOKENS or the two silently drift apart: at a
// conservative ~4 characters/token, 8192 tokens is up to ~32,768 characters, so
// this cap carries real headroom above that ceiling and a full-length Call 1
// response can never be truncated by it. It still exists as a backstop against a
// pathological/oversized response, not as a routine trim - if Call 1's prose ever
// does exceed it, researchCourseCaseStudiesAction measures the drop and reports
// it in `notes` rather than cutting it silently (see the truncation check there).
// Bump this together with RESEARCH_MAX_TOKENS if either changes.
const STRUCTURE_MAX_TOKENS = 4096;
const STRUCTURE_INPUT_CHAR_CAP = 40000;

// Deterministic id prefix for researched case studies (see IDEMPOTENT in the
// researchCourseCaseStudiesAction doc comment below). Distinct from curated
// ids (e.g. "therac-25", CASE_STUDIES in case-studies.ts) so a researched
// entry can never collide with, or silently overwrite, a curated one.
const RESEARCHED_ID_PREFIX = "researched-case-study";

/** Slugify an organization name into an id fragment; "org" when nothing
 *  alphanumeric survives (mirrors assignmentSlug's fallback idiom in
 *  shared.ts, applied to an organization name instead of an assignment title). */
function slugifyOrganization(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "org"
  );
}

function weekLines(weeks: Array<{ week: number; topic: string; summary?: string }>): string {
  return weeks
    .map((w) => `Week ${w.week}: ${w.topic.trim()}${w.summary?.trim() ? ` - ${w.summary.trim()}` : ""}`)
    .join("\n");
}

/**
 * Call 1 of the two-call research shape: a grounded (webSearch: true) call
 * covering every week in the course at once, asking for a browsable prose
 * answer, never JSON (see the module doc comment on why). Weeks with no
 * strong real-world match are explicitly allowed to come back empty rather
 * than the model forcing a weak fit.
 */
async function researchCaseStudiesProse(
  weeks: Array<{ week: number; topic: string; summary?: string }>,
  courseDescription: string,
  provider: LlmProvider
): Promise<{ text: string; sources: Source[] } | null> {
  const prompt = `You are an expert educator researching real-world case studies for an entire course${courseDescription.trim() ? `: ${courseDescription.trim()}` : ""}.

COURSE WEEKS AND TOPICS:
${weekLines(weeks)}

Search the web first, then identify one real, specific, well-documented case study, incident, or event for as many of the weeks above as you can find a strong match for - a real organization or program, and what actually happened, that clearly illustrates that week's topic. Prefer widely reported, well-documented events. Do not invent one, and do not force a weak fit - it is fine to skip a week entirely if nothing strong turns up for it.

For each case study you identify, write a short paragraph in plain prose giving: which week it is for, the organization or program name, the year it happened (state plainly if you are not confident of the exact year - never guess), what happened, why it matters as a lesson for students learning that week's topic, and the exact URL of the page you visited to find it.

If a web search turns up nothing suitable for a given week, say so plainly instead of inventing a case study for it.`;

  const grounded = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: RESEARCH_MAX_TOKENS },
      webSearch: true,
    },
    provider
  );

  if (!grounded.ok || !grounded.text.trim()) return null;
  return { text: grounded.text, sources: grounded.sources ?? [] };
}

interface CaseStudyCandidate {
  organization: string;
  title: string;
  /** Empty string when the research notes gave no confident year. */
  year: string;
  topics: string[];
  summary: string[];
  lesson: string;
  url: string;
}

/**
 * Call 2 of the two-call research shape: convert Call 1's prose into
 * structured JSON, with NO web search - demanding strict JSON is exactly what
 * would suppress grounding if asked alongside webSearch: true (see the module
 * doc comment), so that instruction only ever appears in this ungrounded
 * call.
 */
async function structureProseIntoCaseStudies(
  prose: string,
  provider: LlmProvider
): Promise<CaseStudyCandidate[]> {
  if (!prose.trim()) return [];

  const prompt = `Convert the following research notes into structured JSON. Use only information present in the notes below - do not add, invent, look up, or infer anything that isn't already stated there.

RESEARCH NOTES:
${prose.slice(0, STRUCTURE_INPUT_CHAR_CAP)}

Return ONLY valid JSON in this exact shape:
{"caseStudies":[{"organization":"...","title":"...","year":"...","topics":["..."],"summary":["...","..."],"lesson":"...","url":"..."}]}

"year" is a string, and empty ("") when the notes did not state a confident year. "summary" is 1-3 short factual bullet points (what happened). "topics" is 1-4 short retrieval tags for this case study's subject matter. No markdown fences, no commentary. If the notes contain no case studies, return {"caseStudies":[]}.`;

  const result = await callLlm(
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: STRUCTURE_MAX_TOKENS },
    },
    provider
  );

  if (!result.ok) return [];

  const jsonText = jsonObjectSlice(result.text);
  if (!jsonText) return [];

  try {
    const parsed = JSON.parse(jsonText) as { caseStudies?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.caseStudies)) return [];
    return parsed.caseStudies
      .map((raw) => ({
        organization: String(raw.organization ?? "").trim(),
        title: String(raw.title ?? "").trim(),
        year: String(raw.year ?? "").trim(),
        topics: Array.isArray(raw.topics) ? raw.topics.map((t) => String(t).trim()).filter(Boolean) : [],
        summary: Array.isArray(raw.summary) ? raw.summary.map((s) => String(s).trim()).filter(Boolean) : [],
        lesson: String(raw.lesson ?? "").trim(),
        url: String(raw.url ?? "").trim(),
      }))
      .filter((c) => c.organization.length > 0);
  } catch {
    return [];
  }
}

export interface CaseStudyResearchSummary {
  /** Rows successfully upserted. */
  stored: number;
  /** Of `stored`, how many are in the exact strict shape rowToCaseStudy
   *  (db.ts) accepts - organization + a corroborated year + a lesson + a
   *  non-empty summary - i.e. actually reachable by the deck planner, not
   *  merely "has a year". A row can be stored and still miss this bar (see
   *  `uncorroborated`). */
  corroborated: number;
  /** Of `stored`, how many are missing at least one of the fields above (no
   *  year stated, a year that could not be corroborated, and/or no lesson) -
   *  `notes` names exactly what each one is missing; see /knowledge to
   *  complete them. */
  uncorroborated: number;
  /** Candidates dropped before storage - see `notes` for why. */
  skipped: number;
  /** Organizations actually stored, for the step summary. */
  organizations: string[];
  /** Human-readable lines for the step summary. */
  notes: string[];
}

function zeroedSummary(...notes: string[]): CaseStudyResearchSummary {
  return { stored: 0, corroborated: 0, uncorroborated: 0, skipped: 0, organizations: [], notes };
}

/**
 * Research and store one real-world case study per course week (where a
 * strong match exists), in ONE grounded pass for the whole course - see the
 * module doc comment for the two-call grounding shape and why this never
 * fans out per week.
 *
 * Storage contract:
 *  - source: 'researched', kind: 'case_study', verified: false, always -
 *    a complete row is immediately usable (rowToCaseStudy does not check
 *    verified) AND still queued at /knowledge for a human to review, exactly
 *    like every other unverified learned entry (see db.ts's own doc comment).
 *    This action never flips verified itself.
 *  - IDEMPOTENT: id is deterministic (RESEARCHED_ID_PREFIX + a slug of the
 *    organization name), so re-running this for the same course updates the
 *    same rows instead of accumulating duplicates - upsertKnowledge dedupes
 *    only on id (onConflict: "id"). Two candidates that land on the same
 *    organization within one run are also deduped before the write (Postgres
 *    rejects an upsert that targets the same conflict id twice in one
 *    statement); the second is counted in `skipped`.
 *  - VERIFICATION GATES THE YEAR, NOT WHETHER THE ROW IS STORED: a
 *    candidate's url is corroborated against Call 1's own grounding sources
 *    via verifyItemUrls (the same corroboration current-events.ts uses -
 *    reused here, not reimplemented). A candidate with both a stated year AND
 *    a corroborated url is stored WITH that year. Every other otherwise-valid
 *    candidate (no year stated, or the year's source could not be
 *    corroborated) is still stored, WITHOUT a year - loose slide material,
 *    visible at /knowledge for a human to complete. Nothing is silently
 *    dropped from storage; only a candidate missing an organization name, a
 *    summary, or that duplicates another candidate's organization is skipped
 *    (see `skipped` / `notes`).
 *  - REPORTED corroborated VS uncorroborated IS STRICTER THAN "HAS A YEAR":
 *    the `corroborated` count in the returned summary only counts rows that
 *    land in the exact shape rowToCaseStudy (db.ts) requires to reach the
 *    deck planner - organization + a corroborated year + a lesson + a
 *    non-empty summary. A row can have a corroborated year and still be
 *    missing its lesson; it is still stored (see the bullet above - storage
 *    is never gated on this), but it is reported as `uncorroborated`, with a
 *    note naming exactly what it is missing (no year stated / year not
 *    corroborated / no lesson), because rowToCaseStudy would reject it and
 *    the planner would never see it otherwise. Reporting it as corroborated
 *    would overstate what is actually usable.
 *  - RESEARCH-NOTES TRUNCATION IS REPORTED, NOT SILENT: Call 1's prose is
 *    capped at STRUCTURE_INPUT_CHAR_CAP characters before Call 2 structures
 *    it (see that constant's own comment for why the cap is sized against
 *    RESEARCH_MAX_TOKENS and should rarely if ever trigger). On the rare
 *    response that still exceeds it, the caller measures the drop against the
 *    full, untruncated prose and adds a note to `notes` naming that the notes
 *    were too long, that later weeks' case studies may be missing as a
 *    result, and roughly how many characters were cut - the same "nothing is
 *    silently dropped" principle this action promises elsewhere.
 *
 * Never throws: the embedded provider, an empty/failed research or
 * structuring call, and a failed database write all degrade to a summary
 * with an explanatory note, matching how db.ts itself degrades on a failed
 * write. `{ error }` is reserved for requireOwner() rejecting the caller and
 * for missing required input, mirroring researchCurrentEventsAction.
 */
export async function researchCourseCaseStudiesAction(
  weeks: Array<{ week: number; topic: string; summary?: string }>,
  courseDescription: string,
  provider: LlmProvider
): Promise<CaseStudyResearchSummary | { error: string }> {
  // callLlm ignores its provider argument and always calls Gemini - a real,
  // billed call - regardless of what is passed (llm.ts: `void provider;
  // return callGemini(req)`). Every offline-capable action in this codebase
  // guards "embedded" at its own call site rather than relying on callLlm to
  // do it; this guard runs before anything else, including requireOwner(), so
  // an embedded run makes no network call of any kind.
  if (provider === "embedded") {
    return zeroedSummary(
      "Embedded provider: case study research was not run (no network call is made in embedded mode)."
    );
  }

  try {
    await requireOwner();

    const validWeeks = weeks.filter((w) => w.topic?.trim());
    if (validWeeks.length === 0) {
      return { error: "Provide at least one week with a topic to research case studies for." };
    }

    const researched = await researchCaseStudiesProse(validWeeks, courseDescription, provider);
    if (!researched) {
      return zeroedSummary("The grounded research call failed or returned no usable text.");
    }

    // Truncation check for DEFECT 1 (silent drop of the prose tail): measured
    // here, on the caller's side, against the FULL untruncated prose - not
    // threaded back out of structureProseIntoCaseStudies as an extra return
    // field, because the caller already holds the one value (researched.text)
    // that matters and comparing it to the cap here is the smallest change
    // that can never fall out of sync with what that function actually slices.
    // See STRUCTURE_INPUT_CHAR_CAP's own comment for why this should be rare.
    const proseCharsDropped = Math.max(0, researched.text.length - STRUCTURE_INPUT_CHAR_CAP);
    const truncationNote =
      proseCharsDropped > 0
        ? `The research notes were too long (${researched.text.length.toLocaleString()} characters, cap is ${STRUCTURE_INPUT_CHAR_CAP.toLocaleString()}) - roughly ${proseCharsDropped.toLocaleString()} characters were cut before structuring, so case studies for later weeks may be missing from this run.`
        : null;

    const candidates = await structureProseIntoCaseStudies(researched.text, provider);
    if (candidates.length === 0) {
      return zeroedSummary(
        "The research call found no case studies to structure.",
        ...(truncationNote ? [truncationNote] : [])
      );
    }

    // verifyItemUrls corroborates a url's host against the grounding sources
    // actually returned for this call. It is reused as-is by mapping each
    // candidate onto the shape it expects; only `.url` (in) and
    // `.url`/`.unverified` (out) are read back below, so the other
    // ParsedTopicItem fields are filled with whatever's on hand rather than
    // reinterpreted.
    const asTopicItems: ParsedTopicItem[] = candidates.map((c) => ({
      headline: c.organization,
      date: c.year,
      angle: "case_study",
      whyItMatters: c.lesson,
      url: c.url,
      background: false,
    }));
    const verified = verifyItemUrls(asTopicItems, researched.sources);

    const notes: string[] = [];
    if (truncationNote) notes.push(truncationNote);
    let skipped = 0;
    // Keyed by id so a duplicate organization (two weeks landing on the same
    // real event) claims only one row - see the doc comment above on why a
    // duplicate id within one upsert call must never reach upsertKnowledge.
    const claimed = new Map<string, { row: KnowledgeInsert; corroborated: boolean }>();

    candidates.forEach((candidate, i) => {
      const organization = candidate.organization.trim();
      if (!organization) {
        notes.push("Skipped a candidate with no organization name.");
        skipped++;
        return;
      }

      const summaryBullets = candidate.summary.filter(Boolean);
      if (summaryBullets.length === 0) {
        notes.push(`Skipped "${organization}" - the research notes gave no summary content.`);
        skipped++;
        return;
      }

      const id = `${RESEARCHED_ID_PREFIX}-${slugifyOrganization(organization)}`;
      if (claimed.has(id)) {
        notes.push(`Skipped a duplicate case study for "${organization}" - already covered by another week in this run.`);
        skipped++;
        return;
      }

      const urlVerified = verified[i];
      const yearNum = parseInt(candidate.year, 10);
      const yearStated = Number.isFinite(yearNum) && yearNum > 1000 && yearNum < 3000;
      // yearVerified gates the YEAR ONLY (whether the row carries a year at
      // all) - unchanged from before. It does NOT by itself decide the
      // reported corroborated/uncorroborated bucket below; see plannerUsable.
      const yearVerified = yearStated && !urlVerified.unverified;
      const lessonStated = candidate.lesson.trim().length > 0;

      // DEFECT 2 fix: the reported `corroborated` bucket must mean exactly
      // "stored in the strict shape rowToCaseStudy (db.ts) accepts", i.e. the
      // deck planner can actually use this row - organization (guaranteed
      // above) + a verified year + a lesson + a non-empty summary (also
      // guaranteed above). A candidate with a verified year but no lesson
      // would previously have been counted as corroborated and reported as
      // such, even though rowToCaseStudy rejects it and the planner never
      // sees it - that overstated what was actually usable. Such a candidate
      // is still stored (storage is never gated on this - see the storage
      // contract doc comment above), just reported as uncorroborated with a
      // note naming exactly what it is missing.
      const plannerUsable = yearVerified && lessonStated;

      if (!plannerUsable) {
        const missing: string[] = [];
        if (!yearStated) missing.push("no year stated");
        else if (!yearVerified) missing.push("year not corroborated");
        if (!lessonStated) missing.push("no lesson");
        notes.push(`"${organization}" stored but not fully corroborated (${missing.join(", ")}) - see /knowledge to complete it.`);
      }

      const row: KnowledgeInsert = {
        id,
        kind: "case_study",
        source: "researched",
        title: candidate.title || organization,
        topics: candidate.topics,
        summary: summaryBullets.join("\n"),
        lesson: candidate.lesson || null,
        organization,
        year: yearVerified ? yearNum : null,
        verified: false,
      };

      claimed.set(id, { row, corroborated: plannerUsable });
    });

    if (claimed.size === 0) {
      notes.push("No candidate survived validation - nothing was stored.");
      return { stored: 0, corroborated: 0, uncorroborated: 0, skipped, organizations: [], notes };
    }

    const rows = [...claimed.values()].map((c) => c.row);
    const storedCount = await upsertKnowledge(rows);

    if (storedCount === 0) {
      notes.push(
        `Database write failed - ${rows.length} case stud${rows.length === 1 ? "y was" : "ies were"} not stored.`
      );
      return { stored: 0, corroborated: 0, uncorroborated: 0, skipped, organizations: [], notes };
    }

    const stored = [...claimed.values()];
    const corroboratedCount = stored.filter((c) => c.corroborated).length;
    const uncorroboratedCount = stored.length - corroboratedCount;
    const organizations = stored.map((c) => c.row.organization).filter((o): o is string => Boolean(o));

    notes.push(
      `Stored ${stored.length} case stud${stored.length === 1 ? "y" : "ies"} (${corroboratedCount} fully corroborated and ready for the deck planner, ${uncorroboratedCount} still needing a year, lesson, or both - see /knowledge to complete those).`
    );
    if (skipped > 0) {
      notes.push(`Skipped ${skipped} candidate(s) before storage - see the notes above for reasons.`);
    }

    return {
      stored: stored.length,
      corroborated: corroboratedCount,
      uncorroborated: uncorroboratedCount,
      skipped,
      organizations,
      notes,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not research course case studies." };
  }
}
