/**
 * Pure prompt-text builders for the per-week case-study anchor (V1/V2/V4 in
 * the professional-lift audit) - extracted out of
 * src/app/actions/course-planning-grounding.ts (already at the file's line
 * cap) so that file only has to call these, not build the prose inline.
 *
 * No I/O, no LLM calls: this module only assembles prompt strings from data
 * a caller already resolved (an up-front, whole-course case-study plan - see
 * src/app/actions/case-study-plan.ts - and/or the opener text
 * buildScheduleWeekPlan already generated).
 */

export interface CaseStudyAssignment {
  /** The organization/event name - never includes a year (V2: a year is a
   * factual claim, kept separate so it can be omitted independently). */
  organization: string;
  /** A conservative, verified-or-confident period description (a decade or
   * a short range) - undefined when no period could be established with
   * confidence, which is a normal, expected state, not a defect. */
  period?: string;
  /** One or two factual sentences: what happened and why it fits this week. */
  hook: string;
}

/**
 * The "CASE STUDIES ALREADY USED IN THIS COURSE" exclusion block. Merges two
 * sources: `usedCaseStudies` (the pre-existing, progressively-grown,
 * racy-under-concurrency list - still populated for a coding course or any
 * week the up-front plan could not assign) and `otherWeeksCaseStudyNames`
 * (V4: the deterministic, complete-before-any-week-starts list from an
 * up-front, whole-term case-study plan). Deduplicated case-insensitively,
 * first-seen order kept. "" when both are empty, so a caller can always
 * append the result directly with no extra blank-check.
 */
export function buildCaseStudyExclusionBlock(
  usedCaseStudies: string[],
  otherWeeksCaseStudyNames: string[] = []
): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const name of [...usedCaseStudies, ...otherWeeksCaseStudyNames]) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(trimmed);
  }
  if (merged.length === 0) return "";
  return `\n\nCASE STUDIES ALREADY USED IN THIS COURSE: ${merged.join("; ")}. Never reuse or lightly reword any of these, on the opening Case Study slide or any In Practice slide - choose a different, well-known, well-documented case each time.`;
}

/**
 * THIS WEEK'S CASE STUDY anchor block: present only when an up-front,
 * whole-term case-study plan actually assigned this week one (see
 * planCourseCaseStudies, src/app/actions/case-study-plan.ts). Pins the exact
 * organization/event and - only when confidently known - its period, so the
 * deck's own Case Study slide can neither substitute a different case nor
 * invent a wrong date (V2).
 */
export function buildCaseStudyAnchorBlock(assignedCaseStudy?: CaseStudyAssignment): string {
  if (!assignedCaseStudy) return "";
  const periodLine = assignedCaseStudy.period
    ? `Period: ${assignedCaseStudy.period}.`
    : "Period: not established with confidence - do not state a specific year for this case anywhere in the deck.";
  return `\n\nTHIS WEEK'S CASE STUDY (chosen once for the whole course - this is the SAME case this week's class opener already discussed before this lecture, when one ran):
Organization/event: ${assignedCaseStudy.organization}.
${periodLine}
${assignedCaseStudy.hook}

Your Case Study slide (the deck's second slide) MUST be built on this exact case - name this organization/event, do not invent or substitute a different one, and do not state the period above as a precise year if it was not given as one. If the opener already discussed this case, build on that discussion instead of re-narrating it from scratch. Every "In Practice" slide elsewhere in this deck must use a DIFFERENT organization than this one - never this same case again, and never a title implying repetition (e.g. "(Again)" or "Revisited").`;
}

/**
 * THIS WEEK'S CLASS OPENER continuity block. V1-AC1 (professional-lift
 * audit): the prior instruction here told the deck "do not re-teach the
 * opener's case study or re-run its warm-up" - the model obeyed literally
 * and changed the SUBJECT instead of building on it, which is exactly
 * backwards. The corrected instruction is the opposite: the opener already
 * introduced this case, build on it, do not re-narrate it, and do not
 * substitute a different one. "" when no opener text is available (every
 * caller that never sequences an opener before the deck, and any week whose
 * opener generation failed).
 */
export function buildOpenerContinuityBlock(openerContext: string): string {
  const trimmed = openerContext.trim();
  if (!trimmed) return "";
  return `\n\nTHIS WEEK'S CLASS OPENER (already delivered to students, immediately BEFORE this lecture, in the same class session):
${trimmed}

The opener above already introduced this week's case study and ran its own warm-up exercise. Your Case Study slide must be the SAME case the opener just discussed - build on it and extend it, do not re-narrate the opener's discussion from scratch, and do not substitute a different case study. Do not re-run the opener's warm-up exercise here either; reference what it already established and move the class forward from there.`;
}
